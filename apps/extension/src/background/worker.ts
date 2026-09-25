import { deliverReviewedJob } from '../lib/delivery.js';
import { isAllowedAppUrl } from '../lib/config.js';
import { isJobCapture } from '../lib/capture.js';
import { keepPending, clearPending, readPending } from '../lib/pending.js';
import { recordBridgeDelivery } from '../lib/diagnostics.js';
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'expire-capture') void readPending(); });

// Delivery belongs to the worker, so closing the popup does not cancel an accepted send.
// One session-only capture survives worker shutdown for explicit retry; never an automatic queue.
let sending = false;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
 if (!message || message.type !== 'resumestride:send-reviewed-job') return false;
 if (sending) { respond({received:false}); return false; }
 const { capture, appUrl: rawUrl } = message;
 let url: URL;
 try { url = new URL(rawUrl); } catch { respond({received:false}); return false; }
 if (!isAllowedAppUrl(url) || !isJobCapture(capture)) { respond({received:false}); return false; }
 const payload = capture;
 sending = true;
 void (async()=>{
  const started = performance.now();
  let received = false;
  try {
   await keepPending(payload);
   const tab = await chrome.tabs.create({url:url.toString(),active:false});
   if (typeof tab.id !== 'number') throw new Error('No destination');
   const id = crypto.randomUUID();
   for(let attempt=0;attempt<3 && !received;attempt++){
    try { const results=await chrome.scripting.executeScript<boolean>({target:{tabId:tab.id},func:deliverReviewedJob,args:[payload,id,url.origin]}); received=results.some(result=>result.frameId===0 && result.result===true); } catch { /* bounded navigation retry */ }
    if(!received) await new Promise(resolve=>setTimeout(resolve,250));
   }
   if (received) await clearPending(payload);
  } catch { /* Keep the bounded session capture for explicit retry. */ }
  finally { recordBridgeDelivery(received, performance.now() - started); sending=false; respond({received}); }
 })();
 return true;
});
