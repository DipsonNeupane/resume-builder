import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';

for (const width of [320, 390, 768, 1440, 1920]) test(`premium public and document workspaces remain accessible at ${width}px`, async ({page}) => {
 await page.setViewportSize({width,height:900});
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),example());
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Find the roles worth your effort.'})).toBeVisible();
 const templateHeadingRatio=await page.locator('.template-specimen .resume-paper').evaluate(paper=>parseFloat(getComputedStyle(paper.querySelector('h2')!).fontSize)/parseFloat(getComputedStyle(paper).fontSize));
 expect(templateHeadingRatio).toBeCloseTo(.9,1);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/rs-premium-home-${width}.png`});
 if(width<560){
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Templates',exact:true}).click();
  await expect(page).toHaveURL(/\/templates\/$/);
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Find the roles worth your effort.'})).toBeVisible();
 }
 await page.goto('/workspace/resume');
 const activeDocument=page.getByRole('region',{name:'Active document'});
 await expect(activeDocument).toContainText('Master resume');
 if(width<560){
  const identity=await activeDocument.locator(':scope > div').boundingBox();
  const explanation=await activeDocument.locator(':scope > p').boundingBox();
  expect(identity).not.toBeNull();expect(explanation).not.toBeNull();
  expect(identity!.y+identity!.height).toBeLessThanOrEqual(explanation!.y);
 }
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.screenshot({path:`/tmp/rs-premium-builder-${width}.png`});
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'APWICO home'}).click();
 await page.getByRole('button',{name:'View Pro options',exact:true}).click();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/rs-premium-pro-${width}.png`});
 await page.goto('/?account=1');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.screenshot({path:`/tmp/rs-premium-account-${width}.png`});
});
