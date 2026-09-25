import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useSession } from '../../hooks/useSession';
import { BillingPanel } from '../billing/BillingPanel';

const genericAuthFailure = 'Unable to connect. Check your connection and try again.';
const rateLimited = 'Too many requests. Please wait a minute before trying again.';

export function AuthPanel({ onBack }: { onBack: () => void }) {
 const [mode,setMode]=useState<'signup'|'signin'>('signup');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const [forgotPassword,setForgotPassword]=useState(false);
 const [recovery,setRecovery]=useState(()=>new URLSearchParams(window.location.search).get('reset')==='1');
 const {user,loading,error:sessionError}=useSession();
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<''|'confirm-email'|'reset-sent'|'password-updated'>('');
 const [error,setError]=useState('');
 const [invalidPassword,setInvalidPassword]=useState<'password'|'confirm'|null>(null);
 const passwordInput=useRef<HTMLInputElement>(null);
 const confirmInput=useRef<HTMLInputElement>(null);
 function passwordError(field:'password'|'confirm',message:string){
  setInvalidPassword(field);setError(message);
  (field==='password'?passwordInput:confirmInput).current?.focus();
 }
 function editPassword(value:string,confirm=false){
  if(confirm)setConfirmPassword(value);else setPassword(value);
  if(invalidPassword){setInvalidPassword(null);setError('');}
 }

 useEffect(()=>{
  if(!supabase)return;
  const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setRecovery(true);});
  return()=>subscription.unsubscribe();
 },[]);

 function resetFeedback(){setError('');setStatus('');setInvalidPassword(null);}
 function switchMode(next:'signup'|'signin'){setMode(next);setForgotPassword(false);setPassword('');setConfirmPassword('');resetFeedback();}

 async function submitPassword(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  if(mode==='signup'){
   if(password.length<8){passwordError('password','Use a password with at least 8 characters.');return;}
   if(password!==confirmPassword){passwordError('confirm','Passwords do not match.');return;}
  }
  setBusy(true);resetFeedback();
  try{
   if(mode==='signup'){
    const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/?account=1`}});
    if(error){setError(error.status===429?rateLimited:/password/i.test(error.message)?'Choose a stronger password and try again.':'Unable to create your account. Check your details and try again.');return;}
    if(!data.session)setStatus('confirm-email');
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error){
     if(error.status===429){setError(rateLimited);return;}
     setError(/email/i.test(error.message)&&/confirm/i.test(error.message)?'Please confirm your email first — check your inbox for the confirmation link.':'Incorrect email or password.');
     return;
    }
   }
  }catch{setError(genericAuthFailure);}finally{setBusy(false);}
 }

 async function submitResetRequest(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  setBusy(true);resetFeedback();
  try{
   const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/?account=1&reset=1`});
   if(error){setError(error.status===429?rateLimited:'Unable to send a password-reset link. Check the address and try again.');return;}
   setStatus('reset-sent');
  }catch{setError(genericAuthFailure);}finally{setBusy(false);}
 }

 async function submitNewPassword(event:FormEvent){
  event.preventDefault();if(!supabase||busy)return;
  if(password.length<8){passwordError('password','Use a password with at least 8 characters.');return;}
  if(password!==confirmPassword){passwordError('confirm','Passwords do not match.');return;}
  setBusy(true);resetFeedback();
  try{
   const {error}=await supabase.auth.updateUser({password});
   if(error){setError('This password-reset link is invalid or has expired. Request a new one from the sign-in page.');return;}
   const url=new URL(window.location.href);url.searchParams.delete('reset');url.searchParams.delete('code');window.history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
   setPassword('');setConfirmPassword('');setRecovery(false);setStatus('password-updated');
  }catch{setError(genericAuthFailure);}finally{setBusy(false);}
 }

 async function signOut(){
  if(!supabase)return;setBusy(true);setError('');
  try{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;setMode('signin');setForgotPassword(false);setPassword('');setConfirmPassword('');setStatus('');}
  catch{setError('Sign out did not complete. Please try again.');}finally{setBusy(false);}
 }

 return <main className="account-page" id="main-content"><aside className="account-context"><span className="section-label">Your next move, in one place</span><h2>Your experience.<br/>Room to go further.</h2><p>A resume to build on. Opportunities to consider. A version for the role that matters.</p><ol><li>Build your master resume</li><li>Understand the opportunity</li><li>Prepare your application</li></ol></aside><section className="account-card" aria-label="ResumeStride account">
  <button className="back-link" onClick={onBack}><ArrowLeft size={15}/>Back to home</button>
  <h1>{recovery?'Choose a new password.':user?'Your profile':mode==='signup'?'Make room for your next move.':forgotPassword?'Reset your password.':'Welcome back.'}</h1>
  <p className="account-description">{recovery?'Enter a new password for your ResumeStride account.':user?'You’re signed in to ResumeStride.':forgotPassword?'We’ll email a secure link to the address on your account.':'Your free account connects your downloads, saved jobs and next steps.'}</p>
  {!supabase?<div role="status" className="helper-box">Account access is not available in this local preview yet. You can still work on your resume in the builder.</div>:loading?<p role="status">Checking your session…</p>:recovery?<form onSubmit={submitNewPassword}>
   <label className="field">New password<div className="password-field"><input type={showPassword?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={128} ref={passwordInput} name="password" aria-invalid={invalidPassword==='password'} aria-describedby={invalidPassword==='password'?'auth-error':undefined} value={password} onChange={event=>editPassword(event.target.value)} disabled={busy}/><button type="button" className="password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(current=>!current)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
   <label className="field">Confirm new password<input type={showPassword?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={128} ref={confirmInput} name="confirm-password" aria-invalid={invalidPassword==='confirm'} aria-describedby={invalidPassword==='confirm'?'auth-error':undefined} value={confirmPassword} onChange={event=>editPassword(event.target.value,true)} disabled={busy}/></label>
   <p className="field-hint">Use at least 8 characters.</p><button className="button" disabled={busy}>{busy?'Updating password…':'Update password'}</button>
  </form>:user?<>{status==='password-updated'&&<p role="status" className="helper-box">Your password has been updated. You are now signed in.</p>}<section className="account-details" aria-label="Account details"><h2>Account details</h2><dl><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Account</dt><dd>Active</dd></div></dl></section><BillingPanel key={user.id} ownerId={user.id}/><button className="button outline" disabled={busy} onClick={signOut}>{busy?'Signing out…':'Sign out on this device'}</button></>:<>
   <div className="account-tabs" role="group" aria-label="Account options"><button className={mode==='signup'?'selected':''} aria-pressed={mode==='signup'} disabled={busy} onClick={()=>switchMode('signup')}>Create account</button><button className={mode==='signin'?'selected':''} aria-pressed={mode==='signin'} disabled={busy} onClick={()=>switchMode('signin')}>Sign in</button></div>
   {mode==='signin'&&forgotPassword?<form onSubmit={submitResetRequest}>
    <label className="field">Email address<input name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label>
    <button className="button" disabled={busy}>{busy?'Sending…':status==='reset-sent'?'Send another reset link':'Send password-reset link'}</button>
    <button type="button" className="text-button" disabled={busy} onClick={()=>{setForgotPassword(false);resetFeedback();}}>Back to sign in</button>
    {status==='reset-sent'&&<p role="status" className="helper-box">If an account exists for this address, a password-reset link will arrive shortly. Open it to choose a new password.</p>}
   </form>:<form onSubmit={submitPassword}>
    <label className="field">Email address<input name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label>
    <label className="field">Password<div className="password-field"><input type={showPassword?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:undefined} maxLength={128} ref={passwordInput} name="password" aria-invalid={invalidPassword==='password'} aria-describedby={invalidPassword==='password'?'auth-error':undefined} value={password} onChange={event=>editPassword(event.target.value)} disabled={busy}/><button type="button" className="password-toggle" aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} onClick={()=>setShowPassword(current=>!current)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
    {mode==='signup'&&<label className="field">Confirm password<input type={showPassword?'text':'password'} autoComplete="new-password" required minLength={8} maxLength={128} ref={confirmInput} name="confirm-password" aria-invalid={invalidPassword==='confirm'} aria-describedby={invalidPassword==='confirm'?'auth-error':undefined} value={confirmPassword} onChange={event=>editPassword(event.target.value,true)} disabled={busy}/></label>}
    {mode==='signup'&&<p className="field-hint">Use at least 8 characters. We only use your email to manage your account and send account-related notices — no marketing email.</p>}
    <button className="button" disabled={busy}>{busy?(mode==='signup'?'Creating account…':'Signing in…'):mode==='signup'?'Create account':'Sign in'}</button>
    {mode==='signin'&&<button type="button" className="text-button" disabled={busy} onClick={()=>{setForgotPassword(true);setPassword('');resetFeedback();}}>Forgot password?</button>}
    {status==='confirm-email'&&<div role="status" className="helper-box"><div><strong>Check your inbox if this is a new email address.</strong><p>If you have used ResumeStride before, no new account email will be sent. Go to Sign in and choose “Forgot password?” instead.</p><button type="button" className="text-button" onClick={()=>switchMode('signin')}>Go to sign in</button></div></div>}
   </form>}
  </>}
  {(error||sessionError)&&<p id="auth-error" role="alert" className="field-error">{error||sessionError}</p>}
  <p className="field-hint">Need help? <a href="mailto:support@resumestride.com">support@resumestride.com</a></p>
 </section></main>;
}
