import { requestJobSave } from '../lib/delivery.js';
import { isAllowedAppUrl } from '../lib/config.js';
import { isJobCapture } from '../lib/capture.js';
import { recordBridgeDelivery } from '../lib/diagnostics.js';

let sending = false;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
 if (!message || message.type !== 'resumestride:save-job') return false;
 if (sending) { respond({status:'error',message:'A save is already in progress.'}); return false; }
 const { capture, appUrl: rawUrl } = message;
 let url: URL;
 try { url = new URL(rawUrl); } catch { respond({status:'error',message:'ResumeStride could not be opened.'}); return false; }
 if (!isAllowedAppUrl(url) || !isJobCapture(capture)) { respond({status:'error',message:'This job link could not be saved.'}); return false; }
 sending = true;
 void (async()=>{
  const started = performance.now();
  let received = false;
  try {
   const tab = await chrome.tabs.create({url:url.toString(),active:false});
   if (typeof tab.id !== 'number') throw new Error('No destination');
   const id=crypto.randomUUID();
   let result:{status:string;message?:string}|null=null;
   for(let attempt=0;attempt<3 && !result;attempt++){
    try { const results=await chrome.scripting.executeScript<{status:string;message?:string}|null>({target:{tabId:tab.id},func:requestJobSave,args:[capture,id,url.origin]}); result=results.find(item=>item.frameId===0)?.result??null; } catch { /* bounded navigation retry */ }
    if(!result) await new Promise(resolve=>setTimeout(resolve,300));
   }
   received=result!==null;
   respond({status:result?.status??'error',message:result?.message,tabId:tab.id});
  } catch { respond({status:'error',message:'Could not reach ResumeStride. Try again.'}); }
  finally { recordBridgeDelivery(received, performance.now() - started); sending=false; }
 })();
 return true;
});
