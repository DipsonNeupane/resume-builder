import { test, expect } from '@playwright/test';
import { example } from '../src/model';
for(const template of ['modern','classic','minimal','compact','bold','executive','ledger'] as const) test(`resume preview preserves ordered content and fits paper for ${template}`,async({page})=>{
 const draft=example();draft.template=template;draft.name='ORDERSTART';draft.summary='PROFILEMARKER';draft.sections[0].entries[0].title='ROLEMARKER';draft.skills='SKILLSENDMARKER';
 await page.addInitScript(d=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(d)),draft);await page.goto('/');
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await page.evaluate(()=>document.fonts.ready);
 const preview=page.locator('.paper-container .paginated-preview');
 const paper=page.locator('.paper-container .resume-paper');
 await expect.poll(async()=>preview.evaluate(el=>{
  const page=el.querySelector<HTMLElement>('.resume-page');
  const content=el.querySelector<HTMLElement>('.resume-page-content');
  const paper=el.querySelector<HTMLElement>('.resume-paper');
  if(!page||!content||!paper)return false;
  const pages=Number(el.dataset.pageCount);
  const stride=page.clientWidth;
  const requiredPages=Math.max(1,Math.ceil((paper.scrollWidth+1)/stride));
  return pages===el.querySelectorAll('.resume-page').length&&pages===requiredPages&&content.scrollWidth<=content.clientWidth+1;
 })).toBe(true);
 const text=await paper.evaluate(el=>el.textContent??'');
 const markers=['ORDERSTART','PROFILEMARKER','ROLEMARKER','SKILLSENDMARKER'];let previous=-1;for(const marker of markers){const at=text.indexOf(marker);expect(at,marker).toBeGreaterThan(previous);previous=at;}
 expect(text).not.toContain('Resume quality review');
});
