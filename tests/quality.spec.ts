import { test, expect } from '@playwright/test';
import { example } from '../src/model';
for(const template of ['modern','classic','minimal','compact','bold','executive','ledger'] as const) test(`resume preview preserves ordered content and fits paper for ${template}`,async({page})=>{
 const draft=example();draft.template=template;draft.name='ORDERSTART';draft.summary='PROFILEMARKER';draft.sections[0].entries[0].title='ROLEMARKER';draft.skills='SKILLSENDMARKER';
 await page.addInitScript(d=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(d)),draft);await page.goto('/');
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 const paper=page.locator('.paper-container .resume-paper');
 expect(await paper.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 const text=await paper.evaluate(el=>el.textContent??'');
 const markers=['ORDERSTART','PROFILEMARKER','ROLEMARKER','SKILLSENDMARKER'];let previous=-1;for(const marker of markers){const at=text.indexOf(marker);expect(at,marker).toBeGreaterThan(previous);previous=at;}
 expect(text).not.toContain('Resume quality review');
});
