import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';

const job='The program coordinator must organize weekly community workshops and maintain attendance reports. Candidates need two years of program operations experience. Experience with volunteer scheduling is preferred.';

test('template gallery is static, filterable and keeps preview separate from purchase',async({page})=>{
 await page.goto('/templates/');
 await expect(page.getByRole('heading',{level:1,name:'Choose the structure after your story.'})).toBeVisible();
 await expect(page.locator('[data-template-card]')).toHaveCount(33); // six curated cues plus the complete 27-item library
 await page.locator('select[name="tier"]').selectOption('free');
 await expect(page.locator('[data-template-grid] [data-template-card]:visible')).toHaveCount(7);
 await expect(page.getByRole('status')).toHaveText('Showing 7 of 27 templates.');
 await page.getByRole('link',{name:/Modern/}).first().click();
 await expect(page).toHaveURL('/templates/modern/');
 await expect(page.getByText('Verified library metadata')).toBeVisible();
 const preview=page.getByRole('link',{name:'Preview with my resume'});
 await expect(preview).toHaveAttribute('href','/start/build?template=modern');
 await expect(page.getByRole('button',{name:/buy|purchase|checkout/i})).toHaveCount(0);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('job-first onboarding extracts requirements and preserves private state through build',async({page})=>{
 await page.setViewportSize({width:320,height:820});
 await page.goto('/start/job');
 await page.getByLabel('Role title').fill('Program coordinator');
 await page.getByLabel('Company').fill('Fictional Cooperative');
 await page.getByLabel('Job description').fill(job);
 await page.getByRole('button',{name:'Extract and review requirements'}).click();
 await expect(page.locator('.job-first-results')).toBeFocused();
 await expect(page.getByText('Source:',{exact:false}).first()).toBeVisible();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'Build my master resume first'}).click();
 await expect(page).toHaveURL('/start/build');
 expect(page.url()).not.toContain('Program');expect(page.url()).not.toContain('Fictional');
 await page.reload();
 await page.getByRole('button',{name:'Start building'}).click();
 await expect(page.getByText('The pasted job is preserved separately')).toBeVisible();
 await page.getByRole('button',{name:'Review the job with this resume'}).click();
 await expect(page).toHaveURL('/workspace/jobs');
 await expect(page.getByText('Program coordinator',{exact:false}).first()).toBeVisible();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test('template preview applies to an existing resume and checkout cancellation is acknowledged',async({page})=>{
 const draft=example();draft.template='classic';
 await page.addInitScript(value=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(value)),draft);
 await page.goto('/start/build?template=boardroom');await page.getByRole('button',{name:'Start building'}).click();
 await page.getByRole('button',{name:'Design & format'}).click();
 await expect(page.locator('select[name="template"]')).toHaveValue('boardroom');await expect(page).toHaveURL('/workspace/resume');
 await page.goto('/workspace/pro?checkout=cancelled');await expect(page.getByText('Checkout cancelled. Nothing was charged.')).toBeVisible();await expect(page).toHaveURL('/workspace/pro');
});

test('mobile back restores job-first input route without placing content in history',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await page.goto('/start/job');await page.getByLabel('Job description').fill(job);await page.getByRole('button',{name:'Extract and review requirements'}).click();
 await page.getByRole('button',{name:'Import my resume first'}).click();await expect(page).toHaveURL('/start/import');
 await page.goBack();await expect(page).toHaveURL('/start/job');
 await expect(page.getByLabel('Job description')).toHaveValue(job);
 expect(page.url()).not.toContain('coordinator');
});
