import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { deliverReviewedJob } from '../../apps/extension/src/lib/delivery';
import { isAllowedAppUrl, productionAppOrigin } from '../../apps/extension/src/lib/config';

test('destination agrees with manifest hosts and rejects credentials and unrelated pages',async()=>{
 const manifest=JSON.parse(await readFile('apps/extension/manifest.json','utf8'));
 for(const host of manifest.host_permissions) expect(isAllowedAppUrl(new URL(host.replace('*','')))).toBe(true);
 for(const url of ['https://localhost:5173/','http://localhost:9999/','http://localhost:5173/other','http://localhost:5173/?token=secret','http://user:pass@localhost:5173/','http://localhost.evil.test:5173/','http://127.0.0.1:5185/#payload']) expect(isAllowedAppUrl(new URL(url)),url).toBe(false);
});

test('exact production origin is allowed only at its root and rejects look-alike hosts',async()=>{
 expect(productionAppOrigin).toBe('https://resumestride.com');
 expect(isAllowedAppUrl(new URL('https://resumestride.com/'))).toBe(true);
 for(const url of ['http://resumestride.com/','https://resumestride.com/other','https://resumestride.com/?token=secret','https://resumestride.com/#payload','https://user:pass@resumestride.com/','https://resumestride.com.evil.test/','https://evil-resumestride.com/','https://resumestride.com:8443/']) expect(isAllowedAppUrl(new URL(url)),url).toBe(false);
});
test('delivery retries until receiver is ready, acknowledges once and ignores wrong origin',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const source=deliverReviewedJob.toString();
 const result=await page.evaluate(async source=>{
  const deliver=new Function('return ('+source+')')();
  const received:string[]=[];
  const ready=setTimeout(()=>window.addEventListener('message',event=>{
   if(event.data?.type==='resumestride:job-import' && event.data.deliveryId==='delayed-id') {
    received.push(event.data.deliveryId);
    window.postMessage({type:'resumestride:job-import-ack',deliveryId:event.data.deliveryId},location.origin);
   }
  }),400);
  const success=await deliver({title:'Example'},'delayed-id',location.origin);
  clearTimeout(ready);
  const wrong=await deliver({},'wrong-id','https://unrelated.example');
  return {success,wrong,count:received.length};
 },source);
 expect(result).toEqual({success:true,wrong:false,count:1});
});

test('delivery times out on unrelated acknowledgments and stops transmitting afterward',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async source=>{
  const deliver=new Function('return ('+source+')')();
  let count=0;
  const receive=(event:MessageEvent)=>{
   if(event.data?.type!=='resumestride:job-import' || event.data.deliveryId!=='timeout-review')return;
   count++;
   window.postMessage({type:'resumestride:job-import-ack',deliveryId:'different-delivery'},location.origin);
   // Matching data with a foreign window source must not complete delivery.
   window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:null,data:{type:'resumestride:job-import-ack',deliveryId:'timeout-review'}}));
   window.dispatchEvent(new MessageEvent('message',{origin:'https://unrelated.example',source:window,data:{type:'resumestride:job-import-ack',deliveryId:'timeout-review'}}));
  };
  window.addEventListener('message',receive);
  const success=await deliver({},'timeout-review',location.origin);
  // A postMessage queued just before timeout may arrive after resolution.
  await new Promise(resolve=>setTimeout(resolve,100));
  const atTimeout=count;
  await new Promise(resolve=>setTimeout(resolve,600));
  window.removeEventListener('message',receive);
  return {success,atTimeout,after:count};
 },deliverReviewedJob.toString());
 expect(result.success).toBe(false);
 expect(result.atTimeout).toBeGreaterThan(1);
 expect(result.after).toBe(result.atTimeout);
});
