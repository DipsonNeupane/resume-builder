import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { example } from '../src/model';
import { renderDocx } from '../server/export/docx';

async function expectStoredName(page: Page, name: string) {
 await expect.poll(() => page.evaluate(() => {
  const raw = sessionStorage.getItem('resumestride.resume.v1');
  if (!raw) return '';
  try { return JSON.parse(raw).name ?? ''; } catch { return ''; }
 })).toBe(name);
}

function textPdf(lines: string[]): Buffer {
 const escaped = (value: string) => value.replace(/([\\()])/g, '\\$1');
 const content = lines.map((line, index) => `BT /F1 ${index === 0 ? 20 : 12} Tf 72 ${750 - index * 28} Td (${escaped(line)}) Tj ET`).join('\n');
 const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 let pdf = '%PDF-1.4\n';
 const offsets = [0];
 for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
 const xref = Buffer.byteLength(pdf);
 pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(pdf);
}

test('edit, autosave, reload and custom sections',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('नमस्ते विश्व');await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Engineer');await page.getByRole('textbox',{name:'Phone',exact:true}).fill('+977 9800000000');
 await expectStoredName(page,'नमस्ते विश्व');await page.reload();await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('नमस्ते विश्व');
 await page.getByRole('button',{name:'Experience',exact:true}).click();await page.getByRole('checkbox',{name:'I don’t have work experience yet'}).check();
 await page.getByRole('button',{name:'Add a section',exact:true}).click();await page.getByRole('textbox',{name:'Section title'}).fill('Volunteering');await page.getByRole('textbox',{name:'Role, qualification, or project'}).fill('Community organizer');
 await expect(page.locator('.preview-panel')).toContainText('Community organizer');await page.getByRole('button',{name:'Design & format'}).click();await page.getByLabel('Paper size').selectOption('Letter');await page.getByLabel('Writing direction').selectOption('rtl');await expect(page.locator('.preview-panel article')).toHaveAttribute('dir','rtl');
 await expect(page.locator('.preview-panel .resume-paper')).toContainText('नमस्ते विश्व');
});
test('upload accepts DOCX and PDF but not JSON, and an unsupported file leaves the draft intact',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep My Work');await expect(page.getByRole('button',{name:/Backup|Export as Word/})).toHaveCount(0);const picker=page.locator('input[type=file]');await expect(picker).toHaveAttribute('accept',/\.docx/);await expect(picker).toHaveAttribute('accept',/\.pdf/);await expect(picker).not.toHaveAttribute('accept',/json/);await picker.setInputFiles({name:'old-backup.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});await expect(page.getByRole('status').filter({hasText:'Choose a Word (.docx) or PDF file.'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep My Work');});
test('editor and preview are separate workspaces without horizontal overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Build my resume',exact:true}).last().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Alex');await expect(page.locator('.editor-panel')).toBeVisible();await expect(page.locator('.preview-panel')).toBeHidden();await page.getByRole('button',{name:'Preview resume',exact:true}).click();await expect(page.locator('.editor-panel')).toBeHidden();await expect(page.locator('.builder-sidebar')).toBeHidden();await expect(page.locator('.preview-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Back to editing',exact:true}).click();await expect(page.locator('.editor-panel')).toBeVisible();await page.screenshot({path:'test-results/mobile-editor.png',fullPage:true});});

test('desktop builder pairs the editing desk with a live document and offers a focused preview',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),example());
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.locator('.editor-panel')).toBeVisible();await expect(page.locator('.preview-panel')).toBeVisible();
 const editor=await page.locator('.editor-panel').boundingBox();expect(editor).not.toBeNull();expect(editor!.width).toBeGreaterThan(370);
 const livePaper=await page.locator('.paper-container').boundingBox();expect(livePaper!.width).toBeGreaterThan(460);
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await expect(page.locator('.editor-panel')).toBeHidden();await expect(page.locator('.builder-sidebar')).toBeHidden();await expect(page.locator('.preview-panel')).toBeVisible();
 const paper=await page.locator('.paper-container').boundingBox();expect(paper).not.toBeNull();expect(paper!.width).toBeGreaterThan(700);expect(paper!.width).toBeLessThanOrEqual(722);
 const fontSize=parseFloat(await page.locator('.resume-paper').first().evaluate(element=>getComputedStyle(element).fontSize));
 expect(fontSize,'document type should scale from the paper, not the monitor width').toBeGreaterThan(12);expect(fontSize).toBeLessThan(16);
 const firstPage=page.locator('.resume-page').first();const pageBox=await firstPage.boundingBox();const firstSection=await firstPage.locator('h2').first().boundingBox();
 expect(pageBox).not.toBeNull();expect(firstSection).not.toBeNull();expect(firstSection!.y).toBeLessThan(pageBox!.y+pageBox!.height);
 const pageCount=await page.locator('.resume-page').count();
 await page.setViewportSize({width:2200,height:1200});
 await expect.poll(()=>page.locator('.paper-container').evaluate(element=>element.clientWidth)).toBe(720);
 expect(parseFloat(await page.locator('.resume-paper').first().evaluate(element=>getComputedStyle(element).fontSize))).toBeCloseTo(fontSize,1);
 await expect(page.locator('.resume-page')).toHaveCount(pageCount);
 await expect(page.getByRole('button',{name:'Back to editing',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('home screenshot',async({page})=>{await page.setViewportSize({width:1440,height:1000});await page.goto('/');await page.screenshot({path:'test-results/home.png',fullPage:true});});

test('all header navigation actions use the same hover color',async({page})=>{
 await page.goto('/');
 const navLink=page.getByRole('link',{name:'How it works'});
 // The local-only test server intentionally disables auth, so mount the same
 // button class the authenticated header conditionally renders.
 await page.locator('.nav').evaluate(nav=>nav.insertAdjacentHTML('beforeend','<button class="nav-account">Sign in / Sign up</button>'));
 const account=page.getByRole('button',{name:'Sign in / Sign up'});
 await navLink.hover();
 const expectedColor=await navLink.evaluate(element=>getComputedStyle(element).color);
 await account.hover();
 await expect(account).toHaveCSS('color',expectedColor);
});

test('typing then reloading immediately does not lose the edit, even before the autosave debounce fires',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Immediate Reload Person');
 await page.reload();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Immediate Reload Person');
});

test('an unreadable saved draft is preserved for recovery, not silently overwritten',async({page})=>{
 await page.addInitScript(()=>{sessionStorage.setItem('resumestride.resume.v1',JSON.stringify({version:1,name:'Old Unreadable Draft'}));});
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'could not be read'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Fresh Draft After Recovery');
 await expectStoredName(page,'Fresh Draft After Recovery');
 const rescue=await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1.rescue'));
 expect(rescue).toContain('Old Unreadable Draft');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download it'}).click()]);
 expect(download.suggestedFilename()).toBe('unreadable-draft-recovery.json');
 await page.getByRole('button',{name:'Discard the unreadable draft'}).click();
 await expect(page.getByRole('status').filter({hasText:'could not be loaded'})).toHaveCount(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1.rescue'))).toBeNull();
});

test('a completely denied storage does not crash the app or destroy in-progress edits',async({page})=>{
 await page.addInitScript(()=>{
  const deny=()=>{throw new DOMException('denied','SecurityError');};
  const denied={getItem:deny,setItem:deny,removeItem:deny,clear:deny,key:deny,length:0};
  Object.defineProperty(window,'localStorage',{value:denied});
  Object.defineProperty(window,'sessionStorage',{value:denied});
 });
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'Browser storage is unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('No Storage Available');
 await expect(page.getByRole('status').filter({hasText:'Not saved'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('No Storage Available');
});

test('Word (.docx) import remains available through the Upload control',async({page})=>{
 const source={...example(),name:'Docx Import Person',headline:'Operations Lead'};
 const docx=await renderDocx(source);
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Upload a resume',exact:true}).first()).toBeVisible();
 await page.setInputFiles('input[type=file]',{name:'resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from(docx)});
 await expect(page.getByText('Word document uploaded',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Docx Import Person');
 await expect(page.getByRole('textbox',{name:'Professional title',exact:true})).toHaveValue('Operations Lead');
 await page.getByRole('button',{name:'Experience',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Role, qualification, or project'}).first()).toHaveValue(source.sections[0].entries[0].title);
});

test('a text-based PDF uploads locally and asks the user to review the best-effort result',async({page})=>{
 await page.goto('/');
 await page.setInputFiles('input[type=file]',{name:'resume.pdf',mimeType:'application/pdf',buffer:textPdf(['Jordan Rivera','Operations Coordinator','jordan@example.com','SUMMARY','Coordinates accessible community programs.','SKILLS','Scheduling, facilitation'])});
 await expect(page.getByText('PDF uploaded using best-effort matching',{exact:false})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Jordan Rivera');
 await expect(page.getByRole('textbox',{name:'Professional title',exact:true})).toHaveValue('Operations Coordinator');
 await expect(page.getByRole('textbox',{name:'Email',exact:true})).toHaveValue('jordan@example.com');
});

test('scanned/no-text and malformed PDFs are rejected without replacing the draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep Existing Draft');
 await page.setInputFiles('input[type=file]',{name:'scan.pdf',mimeType:'application/pdf',buffer:textPdf([])});
 await expect(page.getByText('scanned or image-only',{exact:false})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep Existing Draft');
 await page.setInputFiles('input[type=file]',{name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 definitely not a valid document')});
 await expect(page.getByText('could not be read',{exact:false})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep Existing Draft');
});

test('canceling PDF replacement preserves the current draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep Existing Draft');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.setInputFiles('input[type=file]',{name:'replacement.pdf',mimeType:'application/pdf',buffer:textPdf(['Replacement Person','Engineer','replacement@example.com'])});
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep Existing Draft');
});

test('the live preview holds up for a long, multi-language, multi-entry resume across templates and paper sizes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('अनेक भाषामा लामो रिज्यूमे');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Multilingual Specialist');
 await page.getByRole('textbox',{name:'Website or professional profile',exact:true}).fill('https://example.com/very/long/path/segment/that/could/overflow/a/narrow/resume/column/without/wrapping/portfolio');
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,box] of titles.entries())await box.fill(`Role number ${i+1}`);
 const descriptions=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
 for(const box of descriptions)await box.fill('First responsibility with real detail.\nSecond responsibility with more detail.\nThird responsibility that is a bit longer to test wrapping.');
 for(const template of ['modern','classic','minimal','compact','bold'] as const){
  await page.getByRole('button',{name:'Design & format'}).click();
  await page.getByLabel('Template').selectOption(template);
  for(const paper of ['A4','Letter']){
   await page.getByLabel('Paper size').selectOption(paper);
   await page.getByRole('button',{name:'Preview resume',exact:true}).click();
   const previewPaper=page.locator('.paper-container .resume-paper');
   await expect(previewPaper.first()).toContainText('अनेक भाषामा लामो रिज्यूमे');
   await expect(previewPaper.first()).toContainText('very/long/path');
   await expect(previewPaper.first()).toHaveCSS('overflow-wrap','anywhere');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${template}/${paper} should not create horizontal page overflow`).toBe(true);
   await page.getByRole('button',{name:'Back to editing',exact:true}).click();
  }
 }
});

test('all seven templates are available and selectable for a signed-out/free visitor',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Free Visitor');await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Analyst');await page.getByRole('textbox',{name:'Email',exact:true}).fill('free@example.com');
 await page.getByRole('button',{name:'Experience',exact:true}).click();await page.getByRole('checkbox',{name:'I don’t have work experience yet'}).check();
 await page.getByRole('button',{name:'Design & format'}).click();
 const select=page.getByLabel('Template');
 for(const label of ['Modern','Classic','Minimal','Compact','Bold','Executive','Ledger']){
  await expect(select.locator('option',{hasText:label})).toHaveJSProperty('disabled',false);
  await select.selectOption({label});
  await expect(select).toHaveValue(label.toLowerCase());
 }
});
test('template gallery previews current data, persists selection, and stays keyboard-accessible on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const draft=example();draft.name='CURRENT DATA ONLY';draft.summary='UNCHANGED SUMMARY MARKER';draft.template='modern';
 await page.addInitScript(value=>{
  if(!sessionStorage.getItem('resumestride.resume.v1'))sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(value));
 },draft);
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 const opener=page.getByRole('button',{name:'Templates Modern',exact:true});
 await opener.focus();await page.keyboard.press('Enter');
 let dialog=page.getByRole('dialog',{name:'Choose your layout'});
 await expect(dialog.getByRole('button',{name:'Close templates',exact:true})).toBeFocused();
 const options=dialog.locator('.template-picker-option');
 await expect(options).toHaveCount(7);
 const ids=['modern','classic','minimal','compact','bold','executive','ledger'];
 for(const [index,id] of ids.entries()){
  const preview=options.nth(index).locator('.template-option-preview .resume-paper');
  await expect(preview).toHaveClass(new RegExp(`\\b${id}\\b`));
  await expect(preview).toContainText('CURRENT DATA ONLY');
  await expect(preview).toContainText('UNCHANGED SUMMARY MARKER');
  await expect(preview).not.toContainText('Alex Morgan');
 }
 await expect(dialog.getByRole('button',{name:/^Modern/})).toHaveAttribute('aria-pressed','true');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
 await opener.click();dialog=page.getByRole('dialog',{name:'Choose your layout'});
 await dialog.getByRole('button',{name:/^Ledger/}).click();
 await expect(page.locator('.paper-container .resume-paper').first()).toHaveClass(/\bledger\b/);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!))).toMatchObject({template:'ledger'});
 const after=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!));
 expect(after).toEqual({...draft,template:'ledger'});
 await page.reload();await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await expect(page.getByRole('button',{name:'Templates Ledger',exact:true})).toBeVisible();
 await expect(page.locator('.paper-container .resume-paper').first()).toContainText('CURRENT DATA ONLY');
});
test('the templates showcase on the landing page has no Pro badges and every card leads straight into the builder',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:/Let the work.*do the talking/})).toBeVisible();
 await expect(page.locator('.template-pro-badge')).toHaveCount(0);
 await page.getByRole('button',{name:'Ledger',exact:false}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toBeVisible();
});

test('generated PDF and Word controls are offered together and require sign-in',async({page})=>{
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),example());
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Design & format',exact:true}).click();
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.locator('.paid-tools')).toContainText('Sign in to download your resume as PDF or Word');
 await expect(page.locator('.paid-tools').getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
});

test('builder uses Next through every step, Confirm unlocks downloads, and the header action says Download',async({page})=>{
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),example());
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.locator('.site-header').getByRole('button',{name:'Download',exact:true})).toBeVisible();
 await expect(page.locator('.site-header').getByRole('button',{name:'Upload',exact:true})).toHaveCount(0);
 for(const expected of ['Tell your story.','Experience','Education','Make it your own.']){
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.editor-panel').getByRole('heading',{name:expected,exact:true})).toBeVisible();
 }
 await expect(page.locator('.paid-tools')).toHaveCount(0);
 await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await expect(page.locator('.paid-tools')).toContainText('Sign in to download your resume as PDF or Word');
});

test('temporary import errors disappear automatically and clear immediately when returning home',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 const picker=page.locator('input[type=file]');
 await picker.setInputFiles({name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('not a resume')});
 const notice=page.getByRole('status').filter({hasText:'Choose a Word (.docx) or PDF file.'});
 await expect(notice).toBeVisible();
 await expect(notice).toBeHidden({timeout:7000});
 await picker.setInputFiles({name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('not a resume')});
 await expect(notice).toBeVisible();
 await page.getByRole('button',{name:'Back to home',exact:true}).click();
 await expect(notice).toHaveCount(0);
});

test('Pricing always shows a distinct Free card and a discoverable Pro card, even with the purchase flag off, and there is no first-party Print/PDF action',async({page})=>{
 await page.goto('/');
 const cards=page.locator('.plan-comparison article');
 await expect(cards).toHaveCount(2);
 const free=cards.first();
 await expect(free).toContainText('Free');
 await expect(free).toContainText('The complete builder and all 7 templates');
 await expect(free).toContainText('3 PDF or Word downloads per 30-day period');
 await expect(free).toContainText('Save up to 3 jobs');
 await expect(free).not.toContainText('3 generated PDF downloads');
 await expect(free).not.toContainText('Print');
 await expect(free.locator('li')).toHaveCount(4);
 await expect(free.getByRole('button',{name:'Build my resume',exact:true})).toBeVisible();
 const pro=cards.last();
 await expect(pro).toContainText('Pro · 30-day pass');
 await expect(pro).toContainText('US$19.99');
 await expect(pro).toContainText('/ 30 days');
 await expect(pro).toContainText('Optional automatic renewal is never preselected.');
 await expect(pro.locator('li')).toHaveCount(4);
 await expect(pro).not.toContainText('Free accounts get 3');
 await expect(pro.getByRole('button',{name:'View Pro options',exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Print / PDF',exact:true})).toHaveCount(0);
});

test('Pricing cards stay balanced on desktop and readable without price wrapping on tablet and mobile',async({page})=>{
 await page.setViewportSize({width:1200,height:900});
 await page.goto('/#pricing');
 const cards=page.locator('.plan-comparison article');
 const desktopFree=await cards.first().boundingBox();
 const desktopPro=await cards.last().boundingBox();
 expect(desktopFree).not.toBeNull();expect(desktopPro).not.toBeNull();
 expect(Math.abs(desktopFree!.y-desktopPro!.y)).toBeLessThan(2);
 expect(Math.abs(desktopFree!.height-desktopPro!.height)).toBeLessThan(2);
 expect(desktopPro!.x).toBeGreaterThanOrEqual(desktopFree!.x+desktopFree!.width-1);
 const price=cards.last().locator('.plan-price');
 await expect(price).toHaveCSS('white-space','nowrap');
 const amountBox=await price.locator('strong').boundingBox();
 const suffixBox=await price.locator('span').boundingBox();
 expect(amountBox).not.toBeNull();expect(suffixBox).not.toBeNull();
 expect(Math.abs(amountBox!.y+amountBox!.height-suffixBox!.y-suffixBox!.height)).toBeLessThan(5);

 for(const viewport of [{width:768,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  const freeBox=await cards.first().boundingBox();
  const proBox=await cards.last().boundingBox();
  expect(freeBox).not.toBeNull();expect(proBox).not.toBeNull();
  expect(Math.abs(freeBox!.x-proBox!.x)).toBeLessThan(2);
  expect(proBox!.y).toBeGreaterThanOrEqual(freeBox!.y+freeBox!.height-1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  await expect(cards.first().getByRole('button',{name:'Build my resume',exact:true})).toBeVisible();
  await expect(cards.last().getByRole('button',{name:'View Pro options',exact:false})).toBeVisible();
 }
});

test('the live preview keeps true A4/Letter proportions and separates long content into pages',async({page})=>{
 await page.setViewportSize({width:1000,height:800});
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Short Resume Person');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Analyst');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('short@example.com');
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 const box=page.locator('.paper-container');
 const short=await box.boundingBox();
 expect(short).not.toBeNull();
 const shortRatio=short!.height/short!.width;
 expect(shortRatio,'a short resume should still show a full A4-proportioned page').toBeGreaterThan(1.35);
 expect(shortRatio).toBeLessThan(1.5);
 await expect(page.locator('.resume-page')).toHaveCount(1);
 await page.getByRole('button',{name:'Back to editing',exact:true}).click();
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<10;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,titleField] of titles.entries())await titleField.fill(`Role ${i+1}`);
 const descriptions=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
 for(const field of descriptions)await field.fill('First responsibility with real detail.\nSecond responsibility with more detail.\nThird responsibility that is longer to force wrapping.');
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await expect.poll(()=>page.locator('.resume-page').count(),{message:'long content should paginate after the preview becomes visible'}).toBeGreaterThan(1);
 const long=await box.boundingBox();
 expect(long).not.toBeNull();
 expect(long!.height/short!.height,'a long resume should visibly grow past a single page').toBeGreaterThan(1.3);
 expect(await page.locator('.resume-page').count(),'long content should be displayed as distinct pages').toBeGreaterThan(1);
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

test('the sidebar sample opens without replacing the current draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('My Current Draft');
 await page.getByRole('button',{name:'View sample resume',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Sample resume'});
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('Alex Morgan');
 await expect(dialog).toContainText('Your resume stays unchanged');
 await dialog.getByRole('button',{name:'Close sample resume'}).click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('My Current Draft');
 await expect(page.getByRole('button',{name:'Load an example'})).toHaveCount(0);
});

test('the live preview holds a long resume across multiple pages worth of content without dropping any of it',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Priya Sharma');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Program Manager');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('priya@example.com');
 await page.getByRole('button',{name:'Experience'}).click();
 for(let i=0;i<11;i++)await page.getByRole('button',{name:'Add an entry'}).click();
 const titles=await page.getByRole('textbox',{name:'Role, qualification, or project'}).all();
 for(const [i,f] of titles.entries())await f.fill(`FIRSTMARKER Role ${i+1}` + (i===titles.length-1?' LASTMARKER':''));
 const descs=await page.getByRole('textbox',{name:'Details (one point per line)'}).all();
 for(const f of descs)await f.fill('Delivered measurable outcomes across cross-functional teams.\nImproved a core workflow used company-wide.\nCoached and grew junior teammates.');
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 const previewPaper=page.locator('.resume-page').first().locator('.resume-paper');
 await expect(previewPaper).toContainText('Priya Sharma');
 await expect(previewPaper).toContainText('FIRSTMARKER Role 1');
 await expect(previewPaper,'the last entry must survive rendering, not just the first page').toContainText('LASTMARKER');
 const box=await page.locator('.paper-container').boundingBox();
 expect(box,'the preview box should be measurable').not.toBeNull();
 expect(box!.height/box!.width,'a resume with 12 detailed entries should visibly span more than one page worth of height').toBeGreaterThan(2.4);
});

test('Arabic right-to-left content renders correctly in the live preview and is not silently dropped',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 const arabicName='محمد الأمين';
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill(arabicName);
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('مهندس برمجيات');
 await page.getByRole('textbox',{name:'Location',exact:true}).fill('القاهرة، مصر');
 await page.getByRole('textbox',{name:'Phone',exact:true}).fill('+٢٠ ١٠٠ ١٢٣ ٤٥٦٧');
 await page.getByRole('button',{name:'Experience',exact:true}).click();await page.getByRole('checkbox',{name:'I don’t have work experience yet'}).check();

 await page.getByRole('button',{name:'Design & format'}).click();
 await page.getByLabel('Writing direction').selectOption('rtl');
 const previewPaper=page.locator('.paper-container .resume-paper');
 await expect(previewPaper,'the app must render exactly the Arabic text the user typed, correctly, on screen').toContainText(arabicName);
 await expect(previewPaper).toHaveAttribute('dir','rtl');
});

test('automated accessibility scan (axe-core) finds no violations on the home, builder, account, and Pro pages',async({page})=>{
 await page.goto('/');
 const homeResults=await new AxeBuilder({page}).analyze();
 expect(homeResults.violations,JSON.stringify(homeResults.violations,null,2)).toEqual([]);
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Accessibility Check');
 const builderResults=await new AxeBuilder({page}).analyze();
 expect(builderResults.violations,JSON.stringify(builderResults.violations,null,2)).toEqual([]);
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 const previewResults=await new AxeBuilder({page}).analyze();
 expect(previewResults.violations,JSON.stringify(previewResults.violations,null,2)).toEqual([]);
 await page.goto('/?account=1');
 const accountResults=await new AxeBuilder({page}).analyze();
 expect(accountResults.violations,JSON.stringify(accountResults.violations,null,2)).toEqual([]);
 await page.goto('/?pro=1');
 const proResults=await new AxeBuilder({page}).analyze();
 expect(proResults.violations,JSON.stringify(proResults.violations,null,2)).toEqual([]);
});

test('typing an invalid language code never persists an unreadable resume',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Language Edge Case');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Tester');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('edge.case@example.com');
 await page.getByRole('button',{name:'Experience',exact:true}).click();await page.getByRole('checkbox',{name:'I don’t have work experience yet'}).check();

 await page.getByRole('button',{name:'Design & format'}).click();
 const langField=page.getByRole('textbox',{name:'Resume language code'});
 await langField.fill('e');
 await expect(page.getByText('Not saved yet',{exact:false})).toBeVisible();
 await expectStoredName(page,'Language Edge Case');
 const invalidStillStored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).language);
 expect(invalidStillStored,'an invalid in-progress edit must never overwrite the last valid persisted language').toBe('en');
 await page.reload();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'could not be'})).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Language Edge Case');
 await page.getByRole('button',{name:'Design & format'}).click();
 await page.getByRole('textbox',{name:'Resume language code'}).fill('fr');
 await expect(page.getByText('Not saved yet',{exact:false})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).language)).toBe('fr');
 const validStored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).language);
 expect(validStored).toBe('fr');
});

test('the editor blocks growth past the aggregate content limit instead of producing an oversized document request',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 const big='a'.repeat(50000);
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Limit Tester');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Analyst');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('limit@example.com');
 await page.getByRole('button',{name:'Profile & skills'}).click();
 await page.getByRole('textbox',{name:'Professional profile',exact:true}).fill(big);
 await page.getByRole('textbox',{name:'Skills & languages',exact:true}).fill(big);
 await page.getByRole('button',{name:'Experience'}).click();
 await page.getByRole('textbox',{name:'Details (one point per line)'}).fill(big);
 await page.getByRole('textbox',{name:'Organization or institution'}).fill(big);
 await expect(page.getByRole('status').filter({hasText:'maximum size'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Organization or institution'}),'a rejected edit must not silently apply/truncate — the field keeps its prior value').toHaveValue('');
 await page.getByRole('button',{name:'Profile & skills'}).click();
 await page.getByRole('textbox',{name:'Skills & languages',exact:true}).fill('short skills');
 await page.getByRole('button',{name:'Experience'}).click();
 await page.getByRole('textbox',{name:'Organization or institution'}).fill('Now fits');
 await expect(page.getByRole('textbox',{name:'Organization or institution'}),'freeing up space allows the same edit to succeed').toHaveValue('Now fits');
});

test('mobile builder keeps Upload available without backup or direct-export actions',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).last().click();
 await expect(page.getByRole('button',{name:'Upload',exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:/Backup|Export as Word/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'More document actions'})).toHaveCount(0);
});

test('an already-occupied rescue slot is preserved, not overwritten, when a second unreadable draft appears',async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('resumestride.resume.v1.rescue',JSON.stringify({version:1,name:'First Rescued Draft'}));
  sessionStorage.setItem('resumestride.resume.v1',JSON.stringify({version:1,name:'Second Unreadable Draft'}));
 });
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'two recovery drafts'})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'A second unreadable draft'})).toBeVisible();
 const rescueContent=await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1.rescue'));
 expect(rescueContent,'the pre-existing rescue slot must not be overwritten by the newly found draft').toContain('First Rescued Draft');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download it'}).nth(1).click()]);
 expect(download.suggestedFilename()).toBe('second-unreadable-draft-recovery.json');
});

test('occupied rescue keeps both raw drafts after editing and reloading',async({page})=>{
 await page.goto('/');
 const first=JSON.stringify({version:99,name:'First recovery'});
 const second=JSON.stringify({version:99,name:'Second recovery'});
 await page.evaluate(({first,second})=>{sessionStorage.setItem('resumestride.resume.v1.rescue',first);sessionStorage.setItem('resumestride.resume.v1',second);},{first,second});
 await page.reload();await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('New unsaved edits');
 await expect(page.getByRole('status').filter({hasText:'Autosave paused — resolve recovery draft'})).toBeVisible();
 await page.reload();
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1'))).toBe(second);
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1.rescue'))).toBe(first);
 await expect(page.getByRole('status').filter({hasText:'A second unreadable draft'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Explicitly saved replacement');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Discard this additional unreadable draft'}).click();
 await expectStoredName(page,'Explicitly saved replacement');
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('resumestride.resume.v1')!).name)).toBe('Explicitly saved replacement');
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1.rescue'))).toBe(first);
});

test('unconfigured account screen preserves access to the local draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Keep my local draft');
 await expectStoredName(page,'Keep my local draft');
 await page.goto('/?account=1');
 await expect(page.getByRole('heading',{name:'Make room for your next move.'})).toBeVisible();
 await expect(page.getByText('Account access is not available',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Back to home',exact:true}).click();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Keep my local draft');
});

test('Personal details requires a name, title, and one contact method before continuing, with inline errors and focus',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Only Name');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Let’s start with you.'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'Add a professional title'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Professional title',exact:true})).toBeFocused();
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Analyst');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Add at least one way to reach you'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Email',exact:true})).toBeFocused();
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('only@name.example');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tell your story.'})).toBeVisible();
});

test('a mononym name and international phone satisfy Personal details; location alone is insufficient',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Madonna');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Performer');
 await page.getByRole('textbox',{name:'Location',exact:true}).fill('Lagos, Nigeria');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Let’s start with you.'})).toBeVisible();
 await page.getByRole('textbox',{name:'Phone',exact:true}).fill('+234 803 123 4567');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tell your story.'})).toBeVisible();
});

test('forward sidebar navigation and creating a new section cannot bypass Personal details completion, but backward navigation and local saving always work',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Design & format'}).click();
 await expect(page.getByRole('heading',{name:'Let’s start with you.'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'Add your name.'})).toBeVisible();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Blocked Add Section');
 await page.getByRole('button',{name:'Add a section',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Let’s start with you.'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'Add a professional title'})).toBeVisible();
 await expectStoredName(page,'Blocked Add Section');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Engineer');
 await page.getByRole('textbox',{name:'Email',exact:true}).fill('nav@example.com');
 await page.getByRole('button',{name:'Profile & skills'}).click();
 await expect(page.getByRole('heading',{name:'Tell your story.'})).toBeVisible();
 await page.getByRole('button',{name:'Personal details'}).click();
 await expect(page.getByRole('heading',{name:'Let’s start with you.'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Blocked Add Section');
 await page.reload();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Blocked Add Section');
});
