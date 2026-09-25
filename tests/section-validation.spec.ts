import { test,expect } from '@playwright/test';
import { blank,validateAll,migrate,isResume } from '../src/model';
test('experience requirement survives renaming and stored-draft migration',()=>{
 const draft=blank();draft.name='Alex';draft.headline='Worker';draft.email='alex@example.com';
 draft.sections[0].title='अनुभव';
 expect(validateAll(draft).some(i=>i.field==='no-experience')).toBe(true);
 draft.noExperience=true;expect(validateAll(draft)).toEqual([]);
 expect(isResume(migrate(JSON.parse(JSON.stringify(draft))))).toBe(true);
 const legacy=JSON.parse(JSON.stringify(draft));delete legacy.sections[0].kind;legacy.sections[0].title='Work history';legacy.noExperience=false;
 expect(isResume(migrate(legacy))).toBe(true);expect(validateAll(legacy).some(i=>i.field==='no-experience')).toBe(true);
});
test('leaving an incomplete experience step forwards is blocked, backward navigation remains available',async({page})=>{
 const draft=blank();draft.name='Alex';draft.headline='Worker';draft.email='alex@example.com';draft.sections[0].entries[0].description='Actual duties';
 await page.addInitScript(d=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(d)),draft);
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Experience',exact:true}).click();await page.getByRole('button',{name:'Design & format',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Role, qualification, or project',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Personal details',exact:true}).click();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toBeVisible();
});

for(const target of ['Design & format','Add a section'])test(`jumping from personal to ${target} checks skipped experience`,async({page})=>{
 const draft=blank();draft.name='Alex';draft.headline='Worker';draft.email='alex@example.com';
 await page.addInitScript(d=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(d)),draft);
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:target,exact:true}).click();
 await expect(page.getByRole('checkbox',{name:'I don’t have work experience yet'})).toBeFocused();
 await expect(page.getByRole('button',{name:'Additional experience',exact:true})).toHaveCount(0);
 await page.getByRole('checkbox',{name:'I don’t have work experience yet'}).check();
 await page.getByRole('button',{name:target,exact:true}).click();
 if(target==='Design & format')await expect(page.getByRole('combobox',{name:'Template',exact:true})).toBeVisible();
 else await expect(page.getByRole('textbox',{name:'Section title',exact:true})).toHaveValue('Additional experience');
});
