import { test, expect } from '@playwright/test';
test('edit, autosave, reload, custom sections and print layout',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('नमस्ते विश्व');await page.getByRole('textbox',{name:'Phone',exact:true}).fill('+977 9800000000');
 await expect(page.getByRole('status')).toContainText('Saved on this device');await page.reload();await page.getByRole('button',{name:'Continue my resume'}).click();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('नमस्ते विश्व');
 await page.getByRole('button',{name:'Add a section',exact:true}).click();await page.getByRole('textbox',{name:'Section title'}).fill('Volunteering');await page.getByRole('textbox',{name:'Role, qualification, or project'}).fill('Community organizer');
 await expect(page.locator('.preview-panel')).toContainText('Community organizer');await page.getByRole('button',{name:'Design & format'}).click();await page.getByLabel('Paper size').selectOption('Letter');await page.getByLabel('Writing direction').selectOption('rtl');await expect(page.locator('.preview-panel article')).toHaveAttribute('dir','rtl');
 await page.emulateMedia({media:'print'});await expect(page.locator('.print-only')).toBeVisible();await expect(page.locator('.site-header')).toBeHidden();await expect(page.locator('.print-only')).toContainText('नमस्ते विश्व');await page.pdf({path:'test-results/resume-letter.pdf',preferCSSPageSize:true});
});
test('invalid backup leaves current resume intact',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep My Work');await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});await expect(page.getByRole('status').first()).toBeVisible();await expect(page.getByText('This is not a valid ResumeBuild’r JSON backup.',{exact:false})).toBeVisible();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep My Work');});
test('mobile editor and preview work without horizontal overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Build my resume',exact:true}).last().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Alex');await page.getByRole('button',{name:'Preview resume',exact:true}).click();await expect(page.locator('.preview-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/mobile-preview.png',fullPage:true});});
test('home screenshot',async({page})=>{await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.screenshot({path:'test-results/home.png',fullPage:true});});

test('typing then reloading immediately does not lose the edit, even before the autosave debounce fires',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Immediate Reload Person');
 await page.reload();
 await page.getByRole('button',{name:'Continue my resume'}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Immediate Reload Person');
});

test('an unreadable saved draft is preserved for recovery, not silently overwritten',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('resumebuildr.resume.v1',JSON.stringify({version:1,name:'Old Unreadable Draft'}));});
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'could not be read'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Fresh Draft After Recovery');
 await expect(page.getByRole('status').filter({hasText:'Saved on this device'})).toBeVisible();
 const rescue=await page.evaluate(()=>localStorage.getItem('resumebuildr.resume.v1.rescue'));
 expect(rescue).toContain('Old Unreadable Draft');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download it'}).click()]);
 expect(download.suggestedFilename()).toBe('unreadable-draft-recovery.json');
 await page.getByRole('button',{name:'Discard the unreadable draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('resumebuildr.resume.v1.rescue'))).toBeNull();
});

test('a completely denied storage does not crash the app or destroy in-progress edits',async({page})=>{
 await page.addInitScript(()=>{
  const deny=()=>{throw new DOMException('denied','SecurityError');};
  Object.defineProperty(window,'localStorage',{value:{getItem:deny,setItem:deny,removeItem:deny,clear:deny,key:deny,length:0}});
 });
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'Browser storage is unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('No Storage Available');
 await expect(page.getByRole('status').filter({hasText:'Not saved'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('No Storage Available');
});

test('backup export/import round trip preserves headings and language',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Round Trip Person');
 await page.getByRole('button',{name:'Profile & skills'}).click();
 await page.getByRole('textbox',{name:'Professional profile',exact:true}).fill('Expérience professionnelle en test.');
 await page.getByRole('textbox',{name:'Profile section heading'}).fill('Résumé personnel');
 await page.getByRole('textbox',{name:'Skills section heading'}).fill('Compétences');
 await page.getByRole('button',{name:'Design & format'}).click();
 await page.getByRole('textbox',{name:'Resume language code'}).fill('fr');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Backup',exact:true}).click()]);
 const backupPath=await download.path();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Start a blank resume'}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('');
 page.once('dialog',dialog=>dialog.accept());
 await page.setInputFiles('input[type=file]',backupPath!);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Round Trip Person');
 await page.getByRole('button',{name:'Profile & skills'}).click();
 await expect(page.getByRole('textbox',{name:'Profile section heading'})).toHaveValue('Résumé personnel');
 await expect(page.getByRole('textbox',{name:'Skills section heading'})).toHaveValue('Compétences');
 await expect(page.locator('.preview-panel')).toContainText('Résumé personnel');
});

test('print output holds up for a long, multi-language, multi-entry resume across templates and paper sizes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('अनेक भाषामा लामो रिज्यूमे');
 await page.getByRole('textbox',{name:'Website or professional profile',exact:true}).fill('https://example.com/very/long/path/segment/that/could/overflow/a/narrow/resume/column/without/wrapping/portfolio');
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByPlaceholder('Role, qualification, or project').all();
 for(const [i,box] of titles.entries())await box.fill(`Role number ${i+1}`);
 const descriptions=await page.getByPlaceholder(/Details/).all();
 for(const box of descriptions)await box.fill('First responsibility with real detail.\nSecond responsibility with more detail.\nThird responsibility that is a bit longer to test wrapping.');
 for(const template of ['modern','classic','minimal'] as const){
  await page.getByRole('button',{name:'Design & format'}).click();
  await page.getByLabel('Template').selectOption(template);
  for(const paper of ['A4','Letter']){
   await page.getByLabel('Paper size').selectOption(paper);
   await page.emulateMedia({media:'print'});
   const printPaper=page.locator('.print-only .resume-paper');
   await expect(printPaper).toContainText('अनेक भाषामा लामो रिज्यूमे');
   await expect(printPaper).toContainText('very/long/path');
   const overflow=await printPaper.evaluate(el=>el.scrollWidth-el.clientWidth);
   expect(overflow,`${template}/${paper} should not clip content horizontally`).toBeLessThanOrEqual(1);
   await page.emulateMedia({media:'screen'});
  }
 }
});

test('320px width stays usable and key icon-only controls are labeled for screen readers',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 await page.goto('/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Toggle navigation'}).click();
 await expect(page.getByRole('link',{name:'How it works'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).last().click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Small Screen');
 await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.activeElement?.tagName)).toBeTruthy();
 await expect(page.getByRole('button',{name:'Preview resume',exact:true})).toBeVisible();
});
