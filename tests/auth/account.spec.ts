import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('create account and sign in use genuinely distinct in-app Supabase auth calls',async({page})=>{
 const signups:Record<string,unknown>[]=[];
 const passwordLogins:Record<string,unknown>[]=[];
 await page.route('https://auth-test.supabase.co/auth/v1/signup**',async route=>{
  signups.push(route.request().postDataJSON());
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'u1',email:'test@example.com'})});
 });
 await page.route('https://auth-test.supabase.co/auth/v1/token?grant_type=password',async route=>{
  passwordLogins.push(route.request().postDataJSON());
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'t',token_type:'bearer',expires_in:3600,refresh_token:'r',user:{id:'u1',email:'test@example.com'}})});
 });
 await page.goto('/?account=1');
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('correct-horse-1');
 await page.getByLabel('Confirm password').fill('correct-horse-1');
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByText('Check your inbox if this is a new email address.',{exact:false})).toBeVisible();
 await expect(page.getByText('If you have used ResumeStride before, no new account email will be sent.',{exact:false})).toBeVisible();
 expect(signups[0].email).toBe('test@example.com');
 expect(signups[0].password).toBe('correct-horse-1');

 await page.getByLabel('Account options').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('correct-horse-1');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('region',{name:'Account details'})).toContainText('test@example.com');
 await expect(page.getByText('Purchases are not available yet.',{exact:false})).toHaveCount(0);
 await expect(page.getByText('Cloud saving is not enabled.',{exact:false})).toHaveCount(0);
 expect(passwordLogins[0].email).toBe('test@example.com');
 expect(passwordLogins[0].password).toBe('correct-horse-1');
 expect(signups.length,'sign in must never hit the account-creation endpoint').toBe(1);
});

test('a too-short signup password is rejected client-side without contacting the server',async({page})=>{
 let calls=0;
 await page.route('https://auth-test.supabase.co/auth/v1/signup**',route=>{calls++;return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
 await page.goto('/?account=1');
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('short1');
 await page.getByLabel('Confirm password').fill('short1');
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 expect(await page.getByLabel('Password',{exact:true}).evaluate((input:HTMLInputElement)=>input.validity.tooShort)).toBe(true);
 expect(calls).toBe(0);
});

test('mismatched confirm-password blocks signup without contacting the server',async({page})=>{
 let calls=0;
 await page.route('https://auth-test.supabase.co/auth/v1/signup**',route=>{calls++;return route.fulfill({status:200,contentType:'application/json',body:'{}'});});
 await page.goto('/?account=1');
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('correct-horse-1');
 await page.getByLabel('Confirm password').fill('different-password');
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('do not match');
 await expect(page.getByLabel('Confirm password')).toBeFocused();
 await expect(page.getByLabel('Confirm password')).toHaveAttribute('aria-invalid','true');
 await expect(page.getByLabel('Confirm password')).toHaveAttribute('aria-describedby','auth-error');
 expect(calls).toBe(0);
});

test('an incorrect password sign-in shows a generic error and allows retry',async({page})=>{
 await page.route('https://auth-test.supabase.co/auth/v1/token?grant_type=password',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'invalid_grant',error_description:'Invalid login credentials'})}));
 await page.goto('/?account=1');
 await page.getByLabel('Account options').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('wrong-password');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
 await expect(page.locator('form').getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});

test('rate-limited sign-in does not claim success and allows retry',async({page})=>{
 await page.route('https://auth-test.supabase.co/auth/v1/token?grant_type=password',route=>route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({message:'rate limited'})}));
 await page.goto('/?account=1');
 await page.getByLabel('Account options').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByLabel('Email address').fill('test@example.com');
 await page.getByLabel('Password',{exact:true}).fill('correct-horse-1');
 await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Too many requests');
 await expect(page.getByText('Signed in as',{exact:false})).toHaveCount(0);
 await expect(page.locator('form').getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
});

test('forgot password sends a recovery link without creating another account',async({page})=>{
 const requests:Record<string,unknown>[]=[];
 let redirect='';
 await page.route('https://auth-test.supabase.co/auth/v1/recover**',async route=>{
  requests.push(route.request().postDataJSON());
  redirect=new URL(route.request().url()).searchParams.get('redirect_to')??'';
  await route.fulfill({status:200,contentType:'application/json',body:'{}'});
 });
 await page.goto('/?account=1');
 await page.getByLabel('Account options').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Forgot password?'}).click();
 await page.getByLabel('Email address').fill('legacy@example.com');
 await page.getByRole('button',{name:'Send password-reset link'}).click();
 await expect(page.getByText('If an account exists for this address',{exact:false})).toBeVisible();
 expect(requests[0].email).toBe('legacy@example.com');
 expect(redirect).toBe('http://127.0.0.1:5174/?account=1&reset=1');
});

test('a recovery link lets the authenticated user choose and confirm a new password',async({page})=>{
 const now=Math.floor(Date.now()/1000);
 await page.addInitScript(session=>localStorage.setItem('sb-auth-test-auth-token',JSON.stringify(session)),{
  access_token:'recovery-token',refresh_token:'recovery-refresh',token_type:'bearer',expires_in:3600,expires_at:now+3600,
  user:{id:'u1',aud:'authenticated',role:'authenticated',email:'test@example.com',created_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{}},
 });
 const updates:Record<string,unknown>[]=[];
 await page.route('https://auth-test.supabase.co/auth/v1/user**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'u1',email:'test@example.com'})});
  updates.push(route.request().postDataJSON());
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'u1',email:'test@example.com'})});
 });
 await page.goto('/?account=1&reset=1');
 await page.getByLabel('New password',{exact:true}).fill('new-correct-horse-1');
 await page.getByLabel('Confirm new password').fill('new-correct-horse-1');
 await page.getByRole('button',{name:'Update password'}).click();
 await expect(page.getByText('Your password has been updated.',{exact:false})).toBeVisible();
 expect(updates[0].password).toBe('new-correct-horse-1');
 await expect(page).toHaveURL(/account=1(?!.*reset=1)/);
});

test('customer-facing copy never names Supabase or an email delivery provider',async({page})=>{
 await page.goto('/?account=1');
 const bodyText=await page.locator('.account-card').innerText();
 expect(bodyText).not.toMatch(/supabase/i);
 expect(bodyText).not.toMatch(/email delivery provider/i);
});

test('signup provider details never reach customer errors or local diagnostics',async({page})=>{
 const privateText='password secret-content sk_private customer@example.test';
 await page.route('https://auth-test.supabase.co/auth/v1/signup**',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({msg:privateText})}));
 await page.goto('/?account=1');
 await page.getByLabel('Email address').fill('customer@example.test');
 await page.getByLabel('Password',{exact:true}).fill('secret-password-1');
 await page.getByLabel('Confirm password').fill('secret-password-1');
 await page.locator('form').getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Choose a stronger password');
 await expect(page.getByRole('alert')).not.toContainText(privateText);
 const diagnostics=await page.evaluate(async()=>{
  const path='/src/services/diagnostics.ts';
  const module=await import(/* @vite-ignore */ path);
  return module.readBrowserDiagnostics();
 });
 expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({feature:'auth',category:'invalid_request'})]));
 expect(JSON.stringify(diagnostics)).not.toContain('secret');
 expect(JSON.stringify(diagnostics)).not.toContain('customer@example.test');
});

for (const width of [320, 390, 768, 1920]) test(`authentication forms remain accessible at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/?account=1');
 await expect(page.getByLabel('Email address')).toBeVisible();
 await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete','email');
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('autocomplete','new-password');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Account options').getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('autocomplete','current-password');
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
 await expect(page.getByRole('button',{name:'Send password-reset link',exact:true})).toBeVisible();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
