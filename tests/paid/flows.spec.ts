import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {example} from '../../src/model';
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
async function seed(page:Page){
 const session={access_token:'fake-test-token',refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
 await page.addInitScript(([s,r])=>{localStorage.setItem('sb-auth-test-auth-token',JSON.stringify(s));sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(r));},[session,example()]);
 await page.route('**/api/export-status*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isPro:false,hasPaidAccess:false,remaining:3,resetsAt:'2026-10-19T12:00:00Z'})}));
 await page.route('**/api/subscription-status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isPro:false,activeTemplates:[],subscriptions:[],salesAvailable:true})}));
 await page.route('https://auth-test.supabase.co/rest/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.route('https://auth-test.supabase.co/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(session.user)}));
}
// Desktop uses the signed-in header CTA; narrow viewports use the visible Patina hero CTA.
// Keep this aligned with both entry points so responsive tests exercise the same builder flow.
async function builder(page:Page){await page.goto('/');await page.getByRole('button',{name:/^(Continue my resume|Build my resume|Build my master resume)$/,exact:true}).first().click();await page.getByRole('button',{name:'Design & format',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();}
test('monthly Pro requires explicit consent and retries with the same server-owned offer and request ID',async({page})=>{
 await seed(page);const bodies:Record<string,unknown>[]=[];
 await page.route('**/api/subscription-checkout',async route=>{bodies.push(route.request().postDataJSON());await route.fulfill({status:503,json:{error:'Checkout could not open.'}});});
 await page.goto('/');await page.getByRole('button',{name:'View Pro options',exact:true}).click();
 const checkbox=page.getByRole('checkbox',{name:/recurring US\$19\.99 monthly subscription/});const button=page.getByRole('button',{name:'Start Pro — US$19.99/month'});
 await expect(checkbox).not.toBeChecked();await expect(button).toBeDisabled();await checkbox.check();await button.click();await button.click();await expect.poll(()=>bodies.length).toBe(2);
 expect(bodies[0]).toEqual({requestId:bodies[0].requestId,offerKey:'pro:monthly',renewalConsent:true,overlapConsent:false});expect(bodies[1].requestId).toBe(bodies[0].requestId);
});
test('Pro discloses and confirms the individual-template overlap transition before checkout',async({page})=>{
 await seed(page);await page.route('**/api/subscription-status',route=>route.fulfill({json:{isPro:false,activeTemplates:['boardroom'],subscriptions:[],salesAvailable:true}}));let body:Record<string,unknown>|undefined;
 await page.route('**/api/subscription-checkout',async route=>{body=route.request().postDataJSON();await route.fulfill({status:503,json:{error:'Retry later.'}});});
 await page.goto('/?account=1');await expect(page.getByText('After Pro’s first payment succeeds',{exact:false})).toBeVisible();await page.getByRole('checkbox',{name:/recurring US\$19\.99 monthly subscription/}).check();await page.getByRole('button',{name:'Start Pro — US$19.99/month'}).click();expect(body?.overlapConsent).toBe(true);
});
test('an active Pro subscription shows monthly renewal state and opens customer billing management',async({page})=>{
 await seed(page);await page.route('**/api/subscription-status',route=>route.fulfill({json:{isPro:true,activeTemplates:[],salesAvailable:false,subscriptions:[{subscriptionId:'sub_pro',offerKey:'pro:monthly',kind:'pro',templateId:null,status:'active',cancelAtPeriodEnd:false,currentPeriodEnd:'2026-11-01T00:00:00Z'}]}}));
 await page.route('**/api/customer-portal',route=>route.fulfill({status:429,json:{error:'Too many requests. Try again later.'}}));await page.goto('/?account=1');await expect(page.getByText('Renews monthly at US$19.99',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Manage billing and cancellation'}).click();await expect(page.getByText('Too many requests. Try again later.')).toBeVisible();
});
test('an individual Premium template requires explicit monthly consent and sends the allowlisted offer key',async({page})=>{
 await seed(page);let body:Record<string,unknown>|undefined;await page.route('**/api/subscription-checkout',async route=>{body=route.request().postDataJSON();await route.fulfill({status:503,json:{error:'Retry later.'}});});
 await page.goto('/');await page.getByRole('button',{name:'Continue my resume',exact:true}).first().click();await page.getByRole('button',{name:'Preview resume'}).click();await page.getByRole('button',{name:'Templates Modern'}).click();await page.getByRole('dialog',{name:'Choose your layout'}).getByRole('button',{name:/^Boardroom/}).click();
 await expect(page.getByText('US$1.99/month',{exact:false})).toBeVisible();const consent=page.getByRole('checkbox',{name:/recurring US\$1\.99 monthly subscription/});const checkout=page.getByRole('button',{name:'Continue to secure checkout'});await expect(checkout).toBeDisabled();await consent.check();await checkout.click();expect(body).toEqual({requestId:body?.requestId,offerKey:'template:boardroom',renewalConsent:true});
});
test('PDF requires consent and a failed request reuses the same UUID',async({page})=>{
 await seed(page);const ids:string[]=[];
 await page.route('**/api/export-pdf',async route=>{ids.push(route.request().postDataJSON().requestId);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Try later.'})});});
 await builder(page);const button=page.getByRole('button',{name:'Download PDF',exact:true});await expect(button).toBeDisabled();
 await page.getByRole('checkbox',{name:'I consent to uploading my resume content',exact:false}).check();
 await button.click();await expect(page.getByText('Try later.',{exact:true})).toBeVisible();await button.click();await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);
});
test('master resumes cannot call tailoring without an owner-bound saved-job version',async({page})=>{
 await seed(page);let calls=0;
 await page.route('**/api/tailor',route=>{calls++;return route.abort();});
 await builder(page);
 await expect(page.getByText('AI suggestions are available only from a saved job-specific resume.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Get tailoring suggestions',exact:true})).toHaveCount(0);
 expect(calls).toBe(0);
});

test('a browser-captured local draft cannot bypass the saved-job tailoring boundary after sign-in',async({page})=>{
 // Starts as a guest with a named local draft (job-specific drafts can only be started while
 // signed out) — no auth token seeded, unlike seed(), since signing in happens mid-test below.
 await page.addInitScript(draft=>sessionStorage.setItem('resumestride.resume.v1',JSON.stringify(draft)),example());
 await builder(page);
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Prefill Role',company:'Prefill Co',description:'Prefill duties from the captured job.',sourceUrl:'',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft'}).click();
 await expect(page.getByText(/Job-specific draft — Tailored for Prefill Role · Prefill Co/)).toBeVisible();
 await page.evaluate(([id,email])=>{
  const channel=new BroadcastChannel('sb-auth-test-auth-token');
  const session={access_token:`fake-access-token-${id}`,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:`fake-refresh-token-${id}`,user:{id,aud:'authenticated',role:'authenticated',email,app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
  channel.postMessage({event:'SIGNED_IN',session});
 },[owner,'fixture@example.com']);
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await expect(page.getByText('AI suggestions are available only from a saved job-specific resume.',{exact:false})).toBeVisible();
 await expect(page.getByLabel('Job description',{exact:true})).toHaveCount(0);
});
test('PDF and Word use shared server availability, format-specific endpoints, and safe request IDs',async({page})=>{
 await seed(page);let remaining=2,statusRequests=0;
 await page.route('**/api/export-status*',route=>{statusRequests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isPro:false,hasPaidAccess:false,remaining,resetsAt:'2026-10-19T12:00:00Z'})});});
 const requests:{format:'pdf'|'docx';requestId:string}[]=[];
 for(const format of ['pdf','docx'] as const)await page.route(`**/api/export-${format}`,async route=>{const body=route.request().postDataJSON();requests.push({format,requestId:body.requestId});remaining=1;await route.fulfill({status:503,contentType:'application/json',body:'{}'});});
 await builder(page);await expect(page.getByText('2 of 3 Free downloads left for this 30-day period.',{exact:true})).toBeVisible();
 await page.getByRole('checkbox',{name:'I consent to uploading my resume content',exact:false}).check();
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 await expect.poll(()=>statusRequests).toBeGreaterThan(1);
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 await page.getByRole('button',{name:'Download Word (.docx)',exact:true}).click();
 await expect.poll(()=>requests.length).toBe(3);
 expect(requests[0].format).toBe('pdf');expect(requests[1].format).toBe('pdf');expect(requests[2].format).toBe('docx');
 expect(requests[0].requestId).toBe(requests[1].requestId);
 expect(requests[2].requestId).not.toBe(requests[0].requestId);
});
test('the selected preview template is sent unchanged to both PDF and Word exports',async({page})=>{
 await seed(page);
 const exported:Record<string,unknown>[]=[];
 for(const format of ['pdf','docx'] as const)await page.route(`**/api/export-${format}`,async route=>{exported.push(route.request().postDataJSON());await route.fulfill({status:503,contentType:'application/json',body:'{}'});});
 await page.goto('/');await page.getByRole('button',{name:'Continue my resume',exact:true}).first().click();
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await page.getByRole('button',{name:'Templates Modern',exact:true}).click();
 await page.getByRole('dialog',{name:'Choose your layout'}).getByRole('button',{name:/^Executive/}).click();
 await page.getByRole('button',{name:'Back to editing',exact:true}).click();
 await page.getByRole('button',{name:'Design & format',exact:true}).click();await page.getByRole('button',{name:'Confirm',exact:true}).click();
 await page.getByRole('checkbox',{name:'I consent to uploading my resume content',exact:false}).check();
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 await page.getByRole('button',{name:'Download Word (.docx)',exact:true}).click();
 await expect.poll(()=>exported.length).toBe(2);
 for(const body of exported){
  expect(body.resume).toMatchObject({template:'executive',name:'Alex Morgan',summary:example().summary});
 }
});
test('an exhausted free allowance shows a clear upgrade path to Pro',async({page})=>{
 await seed(page);
 await page.route('**/api/export-status*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isPro:false,hasPaidAccess:false,remaining:0,resetsAt:'2026-10-19T12:00:00Z'})}));
 await builder(page);
 await expect(page.getByText(/^Your Free document download allowance is used for this period\. It resets .+\.$/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Download PDF',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Download Word (.docx)',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'View Pro options',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A promising role. A considered application.'})).toBeVisible();
});
test('a download-time allowance rejection opens the Pro upgrade prompt',async({page})=>{
 await seed(page);
 await page.route('**/api/export-status*',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await page.route('**/api/export-pdf',route=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Your Free document download allowance is used for this period.'})}));
 await builder(page);
 await page.getByRole('checkbox',{name:'I consent to uploading my resume content',exact:false}).check();
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Keep downloading with Pro'});
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('US$19.99');
 await dialog.getByRole('button',{name:'View Pro options',exact:true}).click();
 await expect(page.getByRole('heading',{name:'A promising role. A considered application.'})).toBeVisible();
});
test('invalid allowance never invents remaining downloads',async({page})=>{
 await seed(page);await page.route('**/api/export-status*',route=>route.fulfill({status:200,contentType:'application/json',body:'{"isPro":false,"hasPaidAccess":false,"remaining":99,"resetsAt":"bad"}'}));
 await builder(page);const fallback=page.getByText('Free downloads exhausted?',{exact:false});await expect(fallback).toBeVisible();
 await expect(page.getByText('99 of 3',{exact:false})).toHaveCount(0);
 await fallback.getByRole('button',{name:'View Pro options',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Keep downloading with Pro'})).toContainText('If you’ve used your Free downloads');
});
test('signed-in builder header links to a profile with plan management and omits the local-save label',async({page})=>{
 await seed(page);
 await page.route('**/api/billing-status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({isPro:false,paidThrough:null,manualPassAvailable:true,recurringAvailable:true,subscription:null})}));
 await page.goto('/');
 const header=page.locator('.site-header');
 let profile=header.getByRole('button',{name:'Open profile for fixture',exact:true});
 await expect(profile).toBeVisible();
 expect(await profile.evaluate(element=>element.parentElement?.classList.contains('site-header-actions'))).toBe(true);
 await header.getByRole('button',{name:'Continue my resume',exact:true}).click();
 await expect(header.getByText('Saved on this device',{exact:true})).toHaveCount(0);
 profile=header.getByRole('button',{name:'Open profile for fixture',exact:true});
 await profile.click();
 await expect(page.getByRole('heading',{name:'Your profile'})).toBeVisible();
 await expect(page.getByText('You’re on the Free plan.',{exact:true})).toBeVisible();
});
test('already signed-in user starts separate captured job draft without replacing base',async({page})=>{
 await seed(page);await builder(page);
 let tailorCalled=false;
 await page.route('**/api/tailor',route=>{tailorCalled=true;return route.fulfill({status:500,contentType:'application/json',body:'{}'});});
 const before=await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1'));
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Support role',company:'Example',description:'Help customers with order questions.',sourceUrl:'https://job-boards.greenhouse.io/example/jobs/123',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft',exact:true}).click();
 await expect(page.getByRole('button',{name:'Discard draft & return to master resume'})).toBeVisible();
 await page.getByRole('button',{name:'Preview resume',exact:true}).click();
 await expect(page.getByText('AI suggestions are available only from a saved job-specific resume.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1'))).toBe(before);
 expect(tailorCalled).toBe(false);
});

for (const nextId of ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',null]) test(`account draft ends without relabeling on ${nextId?'account switch':'signout'}`,async({page})=>{
 await seed(page);await builder(page);
 const base=await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1'));
 await page.evaluate(()=>window.postMessage({type:'resumestride:job-import',payload:{title:'Private role',company:'Example',description:'Private job details',sourceUrl:'',capturedAt:new Date().toISOString()}},location.origin));
 await page.getByRole('button',{name:'Start job-specific draft',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('resumestride.jobDraft')||'{}').ownerId)).toBe(owner);
 await page.evaluate(id=>{
  const channel=new BroadcastChannel('sb-auth-test-auth-token');
  channel.postMessage({event:id?'SIGNED_IN':'SIGNED_OUT',session:id?{access_token:'other-token',refresh_token:'other-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id,aud:'authenticated',role:'authenticated',email:'other@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}}:null});
 },nextId);
 await expect(page.getByRole('button',{name:'Discard draft & return to master resume'})).toHaveCount(0);
 await page.waitForTimeout(500);
 expect(await page.evaluate(()=>localStorage.getItem('resumestride.jobDraft'))).toBeNull();
 expect(await page.evaluate(()=>sessionStorage.getItem('resumestride.resume.v1'))).toBe(base);
 await expect(page.getByText('Your signed-in account changed while editing',{exact:false})).toBeVisible();
});

for (const width of [320, 390, 768, 1920]) test(`upgrade dialog keyboard containment and dismissal at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:700});
 await seed(page);
 await page.route('**/api/export-status*',route=>route.fulfill({status:503,json:{}}));
 await builder(page);
 const opener=page.getByText('Free downloads exhausted?',{exact:false}).getByRole('button',{name:'View Pro options',exact:true});
 await opener.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Keep downloading with Pro'});
 const proceed=dialog.getByRole('button',{name:'View Pro options',exact:true});
 const cancel=dialog.getByRole('button',{name:'Not now',exact:true});
 await expect(proceed).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(cancel).toBeFocused();
 await page.keyboard.press('Tab');await expect(proceed).toBeFocused();
 await page.keyboard.press('Tab');await expect(cancel).toBeFocused();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
 await page.keyboard.press('Enter');await dialog.getByRole('button',{name:'Not now',exact:true}).click();await expect(opener).toBeFocused();
});

test('async allowance dialog returns focus to downloads when its original action is disabled',async({page})=>{
 await seed(page);
 await page.route('**/api/export-pdf',route=>route.fulfill({status:403,json:{error:'Your Free document download allowance is used for this period.'}}));
 await builder(page);
 await page.getByRole('checkbox',{name:'I consent to uploading my resume content',exact:false}).check();
 // The refreshed allowance agrees with the download-time rejection.
 await page.route('**/api/export-status*',route=>route.fulfill({json:{isPro:false,hasPaidAccess:false,remaining:0,resetsAt:'2026-10-19T12:00:00Z'}}));
 const download=page.getByRole('button',{name:'Download PDF',exact:true});
 await download.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'Keep downloading with Pro'});
 await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(download).toBeDisabled();
 await expect(page.getByRole('group',{name:'Document downloads',exact:true})).toBeFocused();
});
