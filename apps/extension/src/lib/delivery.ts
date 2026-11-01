// Self-contained: Chrome serializes this function into the official APWICO tab's
// isolated world. The page performs the authenticated save; no token enters the extension.
export async function requestJobSave(payload: unknown, requestId: string, expectedOrigin: string): Promise<{ status: string; message?: string } | null> {
  if (window.location.origin !== expectedOrigin) return null;
  return new Promise(resolve => {
    let timer: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (result: { status: string; message?: string } | null) => {
      clearInterval(timer); clearTimeout(timeout); window.removeEventListener('message', receive); resolve(result);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== expectedOrigin || event.data?.type !== 'resumestride:job-save-result' || event.data.requestId !== requestId) return;
      const status = event.data.status;
      if (!['saved', 'already_saved', 'signed_out', 'error'].includes(status)) return;
      finish({ status, ...(typeof event.data.message === 'string' ? { message: event.data.message.slice(0, 300) } : {}) });
    };
    const send = () => window.postMessage({ type: 'resumestride:job-save-request', payload, requestId }, expectedOrigin);
    window.addEventListener('message', receive);
    timer = setInterval(send, 250);
    timeout = setTimeout(() => finish(null), 12000);
    send();
  });
}
