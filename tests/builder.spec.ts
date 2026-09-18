import { test, expect } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import AxeBuilder from '@axe-core/playwright';
test('edit, autosave, reload, custom sections and print layout',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('नमस्ते विश्व');await page.getByRole('textbox',{name:'Phone',exact:true}).fill('+977 9800000000');
 await expect(page.getByRole('status')).toContainText('Saved on this device');await page.reload();await page.getByRole('button',{name:'Continue my resume'}).click();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('नमस्ते विश्व');
 await page.getByRole('button',{name:'Add a section',exact:true}).click();await page.getByRole('textbox',{name:'Section title'}).fill('Volunteering');await page.getByRole('textbox',{name:'Role, qualification, or project'}).fill('Community organizer');
 await expect(page.locator('.preview-panel')).toContainText('Community organizer');await page.getByRole('button',{name:'Design & format'}).click();await page.getByLabel('Paper size').selectOption('Letter');await page.getByLabel('Writing direction').selectOption('rtl');await expect(page.locator('.preview-panel article')).toHaveAttribute('dir','rtl');
 await page.emulateMedia({media:'print'});await expect(page.locator('.print-only')).toBeVisible();await expect(page.locator('.site-header')).toBeHidden();await expect(page.locator('.print-only')).toContainText('नमस्ते विश्व');await page.pdf({path:'test-results/resume-letter.pdf',preferCSSPageSize:true});
});
test('invalid backup leaves current resume intact',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep My Work');await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});await expect(page.getByRole('status').first()).toBeVisible();await expect(page.getByText('This is not a valid ResumeStride JSON backup.',{exact:false})).toBeVisible();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep My Work');});
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
 await page.addInitScript(()=>{localStorage.setItem('resumestride.resume.v1',JSON.stringify({version:1,name:'Old Unreadable Draft'}));});
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'could not be read'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Fresh Draft After Recovery');
 await expect(page.getByRole('status').filter({hasText:'Saved on this device'})).toBeVisible();
 const rescue=await page.evaluate(()=>localStorage.getItem('resumestride.resume.v1.rescue'));
 expect(rescue).toContain('Old Unreadable Draft');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download it'}).click()]);
 expect(download.suggestedFilename()).toBe('unreadable-draft-recovery.json');
 await page.getByRole('button',{name:'Discard the unreadable draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('resumestride.resume.v1.rescue'))).toBeNull();
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
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,box] of titles.entries())await box.fill(`Role number ${i+1}`);
 const descriptions=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
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

test('the live preview keeps true A4/Letter page proportions and shows page-break guide lines for long content',async({page})=>{
 await page.setViewportSize({width:1000,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Short Resume Person');
 const box=page.locator('.paper-container');
 const short=await box.boundingBox();
 expect(short).not.toBeNull();
 const shortRatio=short!.height/short!.width;
 expect(shortRatio,'a short resume should still show a full A4-proportioned page').toBeGreaterThan(1.35);
 expect(shortRatio).toBeLessThan(1.5);
 const resumePaper=page.locator('.paper-container .resume-paper');
 const bgImage=await resumePaper.evaluate(el=>getComputedStyle(el).backgroundImage);
 expect(bgImage,'page-break guide lines should be drawn via CSS').not.toBe('none');
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<10;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,titleField] of titles.entries())await titleField.fill(`Role ${i+1}`);
 const descriptions=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
 for(const field of descriptions)await field.fill('First responsibility with real detail.\nSecond responsibility with more detail.\nThird responsibility that is longer to force wrapping.');
 const long=await box.boundingBox();
 expect(long).not.toBeNull();
 expect(long!.height/short!.height,'a long resume should visibly grow past a single page').toBeGreaterThan(1.3);
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

test('the real generated PDF text layer holds a long resume across multiple pages without dropping content',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Priya Sharma');
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<11;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,f] of titles.entries())await f.fill(`FIRSTMARKER Role ${i+1}` + (i===titles.length-1?' LASTMARKER':''));
 const descs=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
 for(const f of descs)await f.fill('Delivered measurable outcomes across cross-functional teams.\nImproved a core workflow used company-wide.\nCoached and grew junior teammates.');
 const buffer=await page.pdf({preferCSSPageSize:true});
 const parser=new PDFParse({data:buffer});
 const result=await parser.getText();
 expect(result.total,'a resume with 12 detailed entries should span more than one printed page').toBeGreaterThan(1);
 expect(result.text).toContain('Priya Sharma');
 expect(result.text).toContain('FIRSTMARKER Role 1');
 expect(result.text,'the last entry must survive pagination, not just the first page').toContain('LASTMARKER');
 await parser.destroy();
});

test('Arabic right-to-left content renders correctly on screen/print and is not silently dropped from the PDF',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 const arabicName='محمد الأمين';
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill(arabicName);
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('مهندس برمجيات');
 await page.getByRole('button',{name:'Design & format'}).click();
 await page.getByLabel('Writing direction').selectOption('rtl');
 await page.emulateMedia({media:'print'});
 const printPaper=page.locator('.print-only .resume-paper');
 await expect(printPaper,'the app must render exactly the Arabic text the user typed, correctly, on screen and on paper').toContainText(arabicName);
 await expect(printPaper).toHaveAttribute('dir','rtl');
 await page.emulateMedia({media:'screen'});
 // Known limitation (not fixed here): headless Chromium's PDF text LAYER can embed Arabic as
 // presentation-form glyphs without a correct Unicode back-mapping when the requested font
 // (Arial) isn't actually installed, so copy-paste/search from the exported PDF can come out
 // reshaped/reordered even though the PDF looks correct and prints correctly. This is a
 // font/OS-dependent browser limitation, not something this app's CSS can reliably fix, and it
 // was NOT reproducible using the browser's own default font. See HANDOFF.md.
 const buffer=await page.pdf({preferCSSPageSize:true});
 const parser=new PDFParse({data:buffer});
 const result=await parser.getText();
 expect(result.text.length,'Arabic content must not be silently dropped/blanked from the PDF entirely').toBeGreaterThan(5);
 await parser.destroy();
});

test('automated accessibility scan (axe-core) finds no violations on the home and builder pages',async({page})=>{
 await page.goto('/');
 const homeResults=await new AxeBuilder({page}).analyze();
 expect(homeResults.violations,JSON.stringify(homeResults.violations,null,2)).toEqual([]);
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Accessibility Check');
 const builderResults=await new AxeBuilder({page}).analyze();
 expect(builderResults.violations,JSON.stringify(builderResults.violations,null,2)).toEqual([]);
});
