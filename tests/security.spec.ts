import { test, expect } from '@playwright/test';
import { blank } from '../src/model';

test('hostile locally stored draft text is rendered as text, never executable HTML or links', async ({ page }) => {
 const payload='<img src="https://attacker.invalid/leak" onerror="window.__resumeAttack=1"><script>window.__resumeAttack=1</script>';
 const resume={...blank(),name:payload,summary:payload,website:'javascript:window.__resumeAttack=1'};
 const outbound:string[]=[];page.on('request',request=>{if(request.url().includes('attacker.invalid'))outbound.push(request.url());});
 await page.addInitScript(value=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(value)),resume);
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue(payload);
 await expect(page.locator('.resume-paper').first()).toContainText(payload);
 expect(await page.locator('.resume-paper img,.resume-paper script,.resume-paper a[href^="javascript:"]').count()).toBe(0);
 expect(await page.evaluate(()=>(window as unknown as Record<string,unknown>).__resumeAttack)).toBeUndefined();
 expect(outbound).toEqual([]);
});

test('malformed style tokens in browser storage are quarantined for internal recovery',async({page})=>{
 await page.addInitScript(value=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(value)),{...blank(),name:'Unsafe draft',accent:'red;background:url(https://attacker.invalid)'});
 await page.goto('/');
 await expect(page.getByRole('status').filter({hasText:'could not be read'})).toBeVisible();
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('');
});

test('stored selector punctuation cannot crash validation focus',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const draft=blank();draft.name='Test';draft.headline='Worker';draft.email='test@example.com';
 draft.sections[0].entries[0].id='broken"][';draft.sections[0].entries[0].description='Needs a role title';
 await page.addInitScript(value=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(value)),draft);
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Design & format',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Role, qualification, or project',exact:true})).toBeFocused();
 expect(errors).toEqual([]);
});

test('a malformed PDF is rejected without changing the draft',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Preserved PDF Test');
 await page.locator('input[type=file]').setInputFiles({name:'resume.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%fake pdf content for testing\n')});
 await expect(page.getByText('could not be read',{exact:false})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Preserved PDF Test');
});

test('a corrupted or fake .docx is rejected without crashing',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('Preserved Docx Test');
 await page.locator('input[type=file]').setInputFiles({name:'broken.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:Buffer.from([0x50,0x4b,0x03,0x04,0,0,0,0,0,0])});
 await expect(page.getByRole('status').first()).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Full name',exact:true})).toHaveValue('Preserved Docx Test');
 expect(errors).toEqual([]);
});

test('contact checks reject arbitrary phone text and executable website schemes',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 await page.getByRole('textbox',{name:'Full name',exact:true}).fill('李');
 await page.getByRole('textbox',{name:'Professional title',exact:true}).fill('Teacher');
 await page.getByRole('textbox',{name:'Phone',exact:true}).fill('anything');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Phone',exact:true})).toBeFocused();
 await page.getByRole('textbox',{name:'Phone',exact:true}).fill('');
 await page.getByRole('textbox',{name:'Website or professional profile',exact:true}).fill('javascript:alert(1)');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Website or professional profile',exact:true})).toBeFocused();
 await page.getByRole('textbox',{name:'Website or professional profile',exact:true}).fill('example.com/profile');
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tell your story.'})).toBeVisible();
});

test('rejected extension payloads stay in bounded local diagnostics without content or telemetry',async({page})=>{
 const privateText='private-resume-job-password-token@example.test';
 const logged:string[]=[];
 page.on('console',message=>logged.push(message.text()));
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Build my resume',exact:true}).first()).toBeVisible();
 await page.evaluate(value=>window.postMessage({type:'resumestride:job-import',payload:{description:value}},window.location.origin),privateText);
 const diagnostics=()=>page.evaluate(async()=>{
  const path='/src/services/diagnostics.ts';
  return (await import(/* @vite-ignore */ path)).readBrowserDiagnostics();
 });
 await expect.poll(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({feature:'extension',category:'bridge_rejected'})]));
 expect(JSON.stringify(await diagnostics())).not.toContain(privateText);
 expect(logged.join('\n')).not.toContain(privateText);
});
