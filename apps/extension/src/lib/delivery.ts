// Self-contained: Chrome serializes this function into the chosen tab's isolated world.
// Page acknowledgments confirm receipt only, never identity or paid entitlement.
export async function deliverReviewedJob(payload: unknown, deliveryId: string, expectedOrigin: string): Promise<boolean> {
 if (window.location.origin !== expectedOrigin) return false;
 return new Promise(resolve => {
  let timer: ReturnType<typeof setInterval>;
  let timeout: ReturnType<typeof setTimeout>;
  const finish = (ok: boolean) => { clearInterval(timer); clearTimeout(timeout); window.removeEventListener('message', receive); resolve(ok); };
  const receive = (event: MessageEvent) => {
   if(event.source===window && event.origin===expectedOrigin && event.data?.type==='resumestride:job-import-ack' && event.data.deliveryId===deliveryId) finish(true);
  };
  const send=()=>window.postMessage({type:'resumestride:job-import',payload,deliveryId},expectedOrigin);
  window.addEventListener('message',receive);
  timer=setInterval(send,250);timeout=setTimeout(()=>finish(false),8000);send();
 });
}
