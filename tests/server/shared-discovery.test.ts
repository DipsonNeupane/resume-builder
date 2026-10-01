import assert from 'node:assert/strict';
import test from 'node:test';
import { accountUrl, authReturnKey, authReturnRoute } from '../../src/routing/authReturn';
import { matchRoute, parseAppRoute, routeForJourney, routeForPage } from '../../src/routing/routes';
import { clearPendingJob, loadPendingJob, pendingJobStorageKey, savePendingJob } from '../../src/features/onboarding/jobFirstState';
import { readFileSync } from 'node:fs';

class MemoryStorage { values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);} }
const capture={title:'Evidence Analyst',company:'Fictional Cooperative',description:'The analyst must prepare weekly evidence reports and collaborate with program staff. Three years of relevant experience is required.',sourceUrl:'',capturedAt:'2026-09-29T12:00:00.000Z',site:'manual' as const};

test('pending pasted jobs are bounded, expiring and owner isolated',()=>{
 const storage=new MemoryStorage();savePendingJob(storage,capture,null,1000);
 assert.equal(loadPendingJob(storage,null,1100)?.capture.description,capture.description);
 assert.equal(loadPendingJob(storage,'owner-a',1200)?.ownerId,'owner-a');
 assert.equal(loadPendingJob(storage,'owner-b',1300),null);
 assert.equal(storage.getItem(pendingJobStorageKey),null);
 savePendingJob(storage,capture,'owner-a',1000);
 assert.equal(loadPendingJob(storage,'owner-a',1000+31*60*1000),null);
 clearPendingJob(storage);assert.equal(storage.getItem(pendingJobStorageKey),null);
 assert.throws(()=>savePendingJob(storage,{...capture,description:'x'.repeat(12_001)},null),/safely/);
});

test('checkout cancellation returns to the surface that started the offer',()=>{
 const source=readFileSync('server/billing/offer-handlers.ts','utf8');
 assert.match(source,/offer\.kind === 'template' \? '\/workspace\/resume' : '\/workspace\/pro'/);
 for(const file of ['server/billing/stripe.ts'])assert.doesNotMatch(readFileSync(file,'utf8'),/cancel_url: `\$\{config\.origin\}\/\?account=1/);
});

test('auth return URLs contain only bounded route keys and downgrade object routes',()=>{
 assert.equal(accountUrl(routeForJourney('job_first')),'/workspace/account?return_to=job');
 assert.equal(accountUrl(routeForPage('jobs'),true),'/workspace/account?return_to=jobs&reset=1');
 const objectRoute=matchRoute('11111111-1111-4111-8111-111111111111');
 assert.equal(authReturnKey(objectRoute),'jobs');
 assert.doesNotMatch(accountUrl(objectRoute),/11111111|match/);
 assert.equal(authReturnRoute('saved')?.path,'/workspace/jobs/saved');
 assert.equal(authReturnRoute('private user text'),null);
 assert.equal(parseAppRoute(new URL('https://apwico.test/workspace/account?return_to=jobs&code=opaque')).kind,'workspace_account');
});
