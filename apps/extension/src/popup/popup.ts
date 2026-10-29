import type { ExtractResult, JobCapture } from '../lib/types.js';
import { isAllowedAppUrl, defaultAppUrl, maxDescriptionChars, maxShortFieldChars } from '../lib/config.js';
import { readPending, keepPending, clearPending } from '../lib/pending.js';
import { captureSourceUrl, isJobCapture } from '../lib/capture.js';
import { sanitizeText } from '../lib/sanitize.js';

function field(labelText:string,value:string,maxLength:number,multiline=false){
 const wrapper=document.createElement('label');wrapper.className='field';
 const label=document.createElement('span');label.textContent=labelText;
 const control=document.createElement(multiline?'textarea':'input') as HTMLInputElement|HTMLTextAreaElement;
 control.maxLength=maxLength;control.value=value;if(multiline)(control as HTMLTextAreaElement).rows=8;
 wrapper.append(label,control);return{wrapper,control};
}
function select(labelText:string,values:string[],current:string){
 const wrapper=document.createElement('label');wrapper.className='field';const label=document.createElement('span');label.textContent=labelText;
 const control=document.createElement('select');values.forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value.replaceAll('_',' ');control.append(option);});control.value=current;wrapper.append(label,control);return{wrapper,control};
}
async function extractFromActiveTab():Promise<{result:ExtractResult;tabUrl:string}>{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id)return{result:{supported:false,reason:'No active tab was found.'},tabUrl:''};
 try{const [{result}]=await chrome.scripting.executeScript<ExtractResult>({target:{tabId:tab.id},files:['dist/inject/extract-job.js']});return{result,tabUrl:tab.url??''};}
 catch{return{result:{supported:false,reason:'APWICO cannot read this browser page. Open a public job page, or paste the description below.'},tabUrl:tab.url??''};}
}
function render(root:HTMLElement,result:ExtractResult,tabUrl:string):void{
 root.textContent='';
 const brand=document.createElement('div');brand.className='brand';brand.innerHTML='<span aria-hidden="true">//</span><strong>APWICO</strong>';
 const heading=document.createElement('h1');heading.textContent='Capture job';root.append(brand,heading);
 const steps=document.createElement('ol');steps.className='capture-steps';['Capture','Review','Send'].forEach((text,index)=>{const item=document.createElement('li');item.textContent=text;if(index===1)item.setAttribute('aria-current','step');steps.append(item);});root.append(steps);
 const notice=document.createElement('div');notice.className=`notice ${result.supported?'success':'fallback'}`;notice.setAttribute('role','status');
 notice.textContent=result.supported?(result.capture.site==='selection'?'Selected text captured for review.':'Job details captured for review. Nothing is sent until you choose Send to APWICO.'):result.reason;root.append(notice);
 if(result.supported)for(const text of result.warnings||[]){const warning=document.createElement('p');warning.className='warning';warning.textContent=text;root.append(warning);}
 const safeTabSource=captureSourceUrl(tabUrl)||'';
 const initial:JobCapture=result.supported?result.capture:(result.draft||{title:'',company:'',description:'',sourceUrl:safeTabSource,capturedAt:new Date().toISOString(),site:'manual'});
 const form=document.createElement('form');
 const title=field('Job title',initial.title,maxShortFieldChars);const company=field('Company',initial.company,maxShortFieldChars);const description=field('Job description',initial.description,maxDescriptionChars,true);
 const location=field('Location',initial.location||'',300);const source=field('Source URL',initial.sourceUrl,2000);
 const workplace=select('Workplace',['unknown','remote','hybrid','onsite','field'],initial.workplace||'unknown');
 const employment=select('Employment type',['unknown','full_time','part_time','contract','temporary','internship'],initial.employmentType||'unknown');
 const salaryMin=field('Salary minimum',initial.salary?.min.toString()||'',20);const salaryMax=field('Salary maximum',initial.salary?.max.toString()||'',20);const currency=field('Currency (ISO)',initial.salary?.currency||'',3);const period=select('Salary period',['year','hour'],initial.salary?.period||'year');
 const optional=document.createElement('details');optional.className='capture-options';const optionalLabel=document.createElement('summary');optionalLabel.textContent='Optional details';optional.append(optionalLabel,location.wrapper,workplace.wrapper,employment.wrapper,salaryMin.wrapper,salaryMax.wrapper,currency.wrapper,period.wrapper,source.wrapper);
 form.append(title.wrapper,company.wrapper,description.wrapper,optional);
 let acknowledge:HTMLInputElement|null=null;
 if(result.supported&&!result.descriptionComplete){const label=document.createElement('label');label.className='acknowledge';acknowledge=document.createElement('input');acknowledge.type='checkbox';label.append(acknowledge,document.createTextNode(' I reviewed this incomplete description and want to send it.'));form.append(label);}
 const development=chrome.runtime.getManifest().name.includes('Development');
 const appUrl=field('Developer destination',defaultAppUrl,200);if(development){const connection=document.createElement('details');connection.className='capture-options';const summary=document.createElement('summary');summary.textContent='Developer options';connection.append(summary,appUrl.wrapper);form.append(connection);}
 const {sourceUrl:_source,capturedAt:_time,site:_site,original:priorOriginal,originalSourceUrl:_original,...originalFields}=initial;
 function reviewed():JobCapture{return{title:sanitizeText(title.control.value,maxShortFieldChars),company:sanitizeText(company.control.value,maxShortFieldChars),description:sanitizeText(description.control.value,maxDescriptionChars),location:sanitizeText(location.control.value,300),workplace:workplace.control.value as JobCapture['workplace'],employmentType:employment.control.value as JobCapture['employmentType'],salary:salaryMin.control.value||salaryMax.control.value||currency.control.value?{min:salaryMin.control.value.trim()?Number(salaryMin.control.value):NaN,max:salaryMax.control.value.trim()?Number(salaryMax.control.value):NaN,currency:currency.control.value.toUpperCase(),period:period.control.value as 'hour'|'year'}:null,sourceUrl:captureSourceUrl(source.control.value)??source.control.value,capturedAt:initial.capturedAt,originalSourceUrl:initial.originalSourceUrl??initial.sourceUrl,site:initial.site||'manual',original:priorOriginal||originalFields};}
 const status=document.createElement('p');status.className='status';status.setAttribute('role','status');
 const provenance=document.createElement('p');provenance.className='provenance';provenance.textContent=result.supported&&result.capture.site!=='manual'?'Auto-filled from the current job page.':'Entered by you.';form.prepend(provenance);
 const baseline=priorOriginal||originalFields;
 const differs=(capture:JobCapture)=>capture.title!==baseline.title||capture.company!==baseline.company||capture.description!==baseline.description||capture.location!==(baseline.location||'');
 let pendingWrite=Promise.resolve();form.addEventListener('input',()=>{const capture=reviewed();if(result.supported)provenance.textContent=differs(capture)?'Edited by you after capture.':'Auto-filled from the current job page.';if(isJobCapture(capture))pendingWrite=pendingWrite.then(()=>keepPending(capture,result.supported&&result.descriptionComplete,result.supported?result.warnings||[]:[])).catch(()=>{status.textContent='This review could not be preserved. Keep the popup open and retry.';});});
 const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Capture current job again';retry.addEventListener('click',async()=>{await pendingWrite;await clearPending();const next=await extractFromActiveTab();if(next.result.supported)await keepPending(next.result.capture,next.result.descriptionComplete,next.result.warnings||[]);render(root,next.result,next.tabUrl);});
 const submit=document.createElement('button');submit.type='submit';submit.textContent='Send to APWICO';form.append(retry,submit,status);
 form.addEventListener('submit',async event=>{event.preventDefault();const capture=reviewed();if(!isJobCapture(capture)||!capture.title.trim()||!capture.company.trim()||!capture.description.trim()){status.textContent='Add the job title, company, and description, then review the source URL and any salary details.';return;}const canonicalSource=capture.sourceUrl&&captureSourceUrl(capture.sourceUrl);if(!canonicalSource||canonicalSource!==capture.sourceUrl||!canonicalSource.startsWith('https:')){status.textContent='Add the public HTTPS job source URL before sending.';optional.open=true;source.control.focus();return;}if(acknowledge&&!acknowledge.checked){status.textContent='Confirm that you reviewed the incomplete description first.';acknowledge.focus();return;}
  let destination:URL;try{destination=new URL(appUrl.control.value);}catch{status.textContent='The APWICO destination is invalid.';return;}if(!isAllowedAppUrl(destination)){status.textContent='Use the official APWICO destination.';return;}if(submit.disabled)return;submit.disabled=true;status.textContent='Opening APWICO…';
  try{await pendingWrite;await keepPending(capture,true,result.supported?result.warnings||[]:[]);const response=await chrome.runtime.sendMessage({type:'resumestride:send-reviewed-job',capture,appUrl:destination.toString()});status.textContent=response?.received?'Sent. APWICO is open with this job ready for review.':'Delivery was not confirmed. Your review is kept for 30 minutes so you can retry.';}catch{status.textContent='APWICO could not be reached. Check your connection and retry.';}finally{submit.disabled=false;}
 });root.append(form);
}
async function main(){const root=document.getElementById('app');if(!root)return;root.textContent='Reading the current job…';const [{result,tabUrl},pending]=await Promise.all([extractFromActiveTab(),readPending()]);
 const currentSource=captureSourceUrl(tabUrl);if(result.supported){await keepPending(result.capture,result.descriptionComplete,result.warnings||[]);render(root,result,tabUrl);return;}
 const directPopupHarness=tabUrl.split('?')[0]===chrome.runtime.getURL('popup.html');
 if(pending&&((currentSource&&pending.capture.sourceUrl===currentSource)||directPopupHarness)){render(root,{supported:true,capture:pending.capture,descriptionComplete:pending.descriptionComplete,warnings:['Restored your unsent review for this same job.',...pending.warnings]},tabUrl);return;}
 render(root,result,tabUrl);
}
void main().catch(()=>{const root=document.getElementById('app');if(root)root.textContent='Capture could not start. Close and reopen APWICO to retry.';});
