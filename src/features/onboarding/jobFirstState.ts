import { isJobCapturePayload, type JobCapturePayload } from '../../services/extensionImport';

const key='resumestride.pendingJobFirst.v1';
const lifetime=30*60*1000;
type PendingJob={version:1;ownerId:string|null;capture:JobCapturePayload;createdAt:number};

export function savePendingJob(storage:Pick<Storage,'setItem'>,capture:JobCapturePayload,ownerId:string|null,now=Date.now()):PendingJob{
 if(!isJobCapturePayload(capture))throw new Error('The pasted job could not be preserved safely.');
 const value:PendingJob={version:1,ownerId,capture,createdAt:now};
 storage.setItem(key,JSON.stringify(value));return value;
}
export function loadPendingJob(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,ownerId:string|null|undefined,now=Date.now()):PendingJob|null{
 const raw=storage.getItem(key);if(!raw)return null;
 try{
  const value=JSON.parse(raw) as PendingJob;
  if(value.version!==1||typeof value.createdAt!=='number'||value.createdAt>now||now-value.createdAt>lifetime||!isJobCapturePayload(value.capture)){storage.removeItem(key);return null;}
  if(ownerId===undefined)return value.ownerId===null?value:null;
  if(value.ownerId&&value.ownerId!==ownerId){storage.removeItem(key);return null;}
  if(ownerId&&value.ownerId===null){const claimed={...value,ownerId};storage.setItem(key,JSON.stringify(claimed));return claimed;}
  return value;
 }catch{storage.removeItem(key);return null;}
}
export function clearPendingJob(storage:Pick<Storage,'removeItem'>){storage.removeItem(key);}
export const pendingJobStorageKey=key;
