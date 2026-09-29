import {execFile as rawExecFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
const execFile=promisify(rawExecFile);
// PGBIN is explicit and always wins. Otherwise, probe common local
// PostgreSQL install locations (Homebrew on Apple Silicon vs Intel, several
// versions) rather than assuming a single hardcoded path — this script must
// keep working across machines/CI images without requiring every runner to
// set PGBIN by hand.
function findPgBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  const candidates = ['17','16','15','14'].flatMap(v => [
    `/opt/homebrew/opt/postgresql@${v}/bin`, `/usr/local/opt/postgresql@${v}/bin`,
  ]);
  candidates.push('/Applications/Postgres.app/Contents/Versions/latest/bin', '/opt/homebrew/bin', '/usr/local/bin');
  for (const dir of candidates) if (existsSync(path.join(dir,'initdb'))) return dir;
  return '/usr/local/opt/postgresql@17/bin';
}
const bin=findPgBin();
const root=await mkdtemp(path.join(os.tmpdir(),'resumestride-pg-race-'));
const data=path.join(root,'data'),socket=path.join(root,'socket');
// A caller may point PGBIN at a relocatable PostgreSQL bundle (for example an
// extracted Homebrew bottle in CI). In that case initdb cannot rely on the
// compile-time share path, so pass the adjacent catalog directory explicitly.
const adjacentShare=path.resolve(bin,'../share/postgresql');
const initdbArgs=['-D',data,'-U','resume_test','-A','trust','--no-locale','--encoding=UTF8'];
if(existsSync(path.join(adjacentShare,'postgres.bki')))initdbArgs.push('-L',adjacentShare);
let started=false;
await mkdir(socket,{mode:0o700});
const sql=async(text)=>{
 const client=new pg.Client({host:socket,port:55479,user:'resume_test',database:'postgres'});
 await client.connect();
 try{const result=await client.query(text);const last=Array.isArray(result)?result.at(-1):result;return last.rows.map(row=>Object.values(row).map(value=>typeof value==='boolean'?(value?'t':'f'):value).join('|')).join('\n');}
 finally{await client.end();}
};
const owner='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
const mixedOwner='33333333-3333-3333-3333-333333333333',raceOwnerA='44444444-4444-4444-4444-444444444444',raceOwnerB='55555555-5555-5555-5555-555555555555';
const payment=(n)=>`select * from public.billing_apply_verified_payment('${owner}','cs_${n}','evt_${n}','pi_${n}','price_fixture',false,1999,'usd','2026-01-01T00:00:00Z')`;
try{
 await execFile(path.join(bin,'initdb'),initdbArgs);
 await execFile(path.join(bin,'pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-k ${socket} -c listen_addresses='' -p 55479`,'-w','start']);started=true;
 await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await sql(await readFile(path.join('supabase/migrations',file),'utf8'));
 await sql(`insert into auth.users(id) values('${owner}'),('${other}'),('${mixedOwner}'),('${raceOwnerA}'),('${raceOwnerB}');
 select public.billing_record_checkout('${owner}','price_fixture',false,'cs_1',1999,'usd');
 select public.billing_record_checkout('${owner}','price_fixture',false,'cs_2',1999,'usd');`);
 // Start overlapping transactions; first holds its entitlement row lock across sleep.
 await Promise.all([sql(`begin;${payment(1)};select pg_sleep(0.5);commit;`),sql(`begin;${payment(2)};commit;`)]);
 assert.equal(await sql(`select extract(epoch from (paid_through-'2026-01-01T00:00:00Z'::timestamptz))::bigint from public.billing_entitlements where owner_id='${owner}'`),'5184000');
 console.log('PASS concurrent distinct payments stack exactly 60 days');
 await Promise.all([sql(payment(1)),sql(payment(1)),sql(payment(2))]);
 assert.equal(await sql('select count(*) from public.billing_payments'),'2');
 console.log('PASS simultaneous duplicate deliveries add no payment/grant');
 // Three free reservations raced by four independent connections.
 const results=await Promise.allSettled([1,2,3,4].map(n=>sql(`begin;select * from public.pdf_begin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa${n}','${other}',repeat('a',64));select pg_sleep(0.1);commit;`)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
 assert.equal(await sql(`select count(*) from public.pdf_requests where owner_id='${other}' and state='reserved'`),'3');
 console.log('PASS four concurrent Free PDF requests reserve exactly three slots');
 // Competing accounts race for the final dollar of the global AI budget.
 await sql(`insert into public.ai_budget_months(month_start,spent_micro_usd) values(date_trunc('month',timezone('UTC',now()))::date,24000000);`);
 const budget=await Promise.allSettled([owner,other].map((id,n)=>sql(`select public.reserve_ai_budget('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb${n}','${id}',1000000)`)));
 assert.equal(budget.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(await sql('select spent_micro_usd+reserved_micro_usd from public.ai_budget_months'),'25000000');
 console.log('PASS concurrent AI reservations cannot exceed $25 cap');
 const attempts=await Promise.allSettled(Array.from({length:25},()=>sql(`set role service_role;select public.billing_throttle_checkout_attempt('${owner}');`)));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,20);
 assert.equal(attempts.filter(r=>r.status==='rejected'&&r.reason.code==='54000').length,5);
 assert.equal(await sql(`select attempt_count from public.billing_checkout_attempts where owner_id='${owner}'`),'20');
 console.log('PASS 25 simultaneous checkout attempts admit exactly 20');

 // Four direct/stale Free refresh requests racing for the same account must produce
 // exactly one atomic reservation. They return ordinary JSON decisions rather than
 // raising, so inspect the authoritative allowed flag from each connection.
 const refreshRace=await Promise.all(Array.from({length:4},()=>sql(`set role service_role;select public.jobs_reserve_recommendation_refresh('${raceOwnerB}')::text;`)));
 const refreshDecisions=refreshRace.map(value=>JSON.parse(value));
 assert.equal(refreshDecisions.filter(value=>value.allowed===true).length,1);
 assert.equal(refreshDecisions.filter(value=>value.allowed===false).length,3);
 const refreshWinner=refreshDecisions.find(value=>value.allowed===true);
 assert.ok(refreshWinner?.reservedAt);
 console.log('PASS concurrent Free recommendation refreshes admit exactly one reservation');

 // A provider failure can release only that exact winning reservation, after which a
 // retry is immediately eligible instead of losing the daily allowance.
 assert.equal(await sql(`set role service_role;select public.jobs_release_recommendation_refresh('${raceOwnerB}','${refreshWinner.reservedAt}',null);`),'t');
 const refreshRetry=JSON.parse(await sql(`set role service_role;select public.jobs_reserve_recommendation_refresh('${raceOwnerB}')::text;`));
 assert.equal(refreshRetry.allowed,true);
 console.log('PASS exact failed refresh release restores Free eligibility');

 // Mixed-mode race: a manual pass checkout and a subscription checkout, both
 // launched concurrently for the SAME owner (two browser tabs) — the exact
 // race that separate preflight checks alone could not serialize, because
 // billing_begin_intent and billing_begin_subscription_intent use different,
 // independent advisory-lock namespaces. The shared reservation must admit
 // exactly one of the two.
 const manualReqId='66666666-6666-6666-6666-666666666601',subReqId='66666666-6666-6666-6666-666666666602';
 const reserve=(owner,kind,reqId,price)=>`set role service_role;select public.billing_reserve_owner_checkout('${kind}','${reqId}','${owner}','${price}',false)`;
 await Promise.all([
  sql(reserve(mixedOwner,'manual',manualReqId,'price_fixture')),
  sql(reserve(mixedOwner,'subscription',subReqId,'price_recurring')),
 ]);
 assert.equal(await sql(`select count(*) from public.billing_owner_checkout_locks where owner_id='${mixedOwner}'`),'1');
 const mixedWinner=await sql(`select kind,request_id from public.billing_owner_checkout_locks where owner_id='${mixedOwner}'`);
 assert.ok(mixedWinner===`manual|${manualReqId}` || mixedWinner===`subscription|${subReqId}`,mixedWinner);
 console.log(`PASS concurrent manual+subscription checkout admits exactly one owner reservation (winner: ${mixedWinner})`);

 // Two concurrent SUBSCRIPTION checkout attempts (two tabs, two different
 // request ids) for the SAME owner — the exact "two active subscription
 // checkout sessions" bug this reservation closes.
 const subA='77777777-7777-7777-7777-777777777701',subB='77777777-7777-7777-7777-777777777702';
 await Promise.all([
  sql(reserve(raceOwnerA,'subscription',subA,'price_recurring')),
  sql(reserve(raceOwnerA,'subscription',subB,'price_recurring')),
 ]);
 assert.equal(await sql(`select count(*) from public.billing_owner_checkout_locks where owner_id='${raceOwnerA}'`),'1');
 const subWinner=await sql(`select request_id from public.billing_owner_checkout_locks where owner_id='${raceOwnerA}'`);
 assert.ok(subWinner===subA || subWinner===subB,subWinner);
 console.log(`PASS two concurrent subscription checkout attempts admit exactly one in-flight session (winner: ${subWinner})`);

 // Owner isolation under concurrency: a simultaneous reservation for a
 // DIFFERENT owner must never be blocked by, merged with, or otherwise
 // affected by another owner's concurrent reservation.
 const isolatedReqA='88888888-8888-8888-8888-888888888801',isolatedReqB='88888888-8888-8888-8888-888888888802';
 await Promise.all([
  sql(reserve(raceOwnerA,'manual',isolatedReqA,'price_fixture')),
  sql(reserve(raceOwnerB,'manual',isolatedReqB,'price_fixture')),
 ]);
 // raceOwnerA already holds subA or subB above; a manual reservation attempt
 // must see that EXISTING one, not create a second row for the same owner.
 assert.equal(await sql(`select count(*) from public.billing_owner_checkout_locks where owner_id='${raceOwnerA}'`),'1');
 assert.equal(await sql(`select request_id from public.billing_owner_checkout_locks where owner_id='${raceOwnerA}'`),subWinner);
 assert.equal(await sql(`select count(*) from public.billing_owner_checkout_locks where owner_id='${raceOwnerB}'`),'1');
 assert.equal(await sql(`select request_id from public.billing_owner_checkout_locks where owner_id='${raceOwnerB}'`),isolatedReqB);
 console.log('PASS a concurrent reservation attempt for a different owner never interferes with an existing one');

}finally{
 if(started)await execFile(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
