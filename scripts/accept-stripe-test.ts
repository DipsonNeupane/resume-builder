import assert from 'node:assert/strict'
import { execFile as rawExecFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import Stripe from 'stripe'
import { chromium } from '@playwright/test'
import { offerCheckout, customerPortal, cancelOffer, applyOfferInvoice, applyOfferSubscriptionStatus } from '../server/billing/offer-handlers.ts'
import { exportDocument } from '../server/export/document-handler.ts'
import { renderPdf } from '../server/export/render.ts'
import { renderDocx } from '../server/export/docx.ts'
import { example, templates, premiumTemplateIds } from '../src/model.ts'

if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Acceptance is Stripe TEST mode only')
if (!process.env.PGBIN) throw new Error('Set PGBIN to a working isolated PostgreSQL binary directory')
if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID || !process.env.STRIPE_TEMPLATE_PRICE_MAP) throw new Error('Set the verified test catalog mapping')

const execFile=promisify(rawExecFile)
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{maxNetworkRetries:2,timeout:20_000})
const runTag=`acceptance_${Date.now()}`
// Keep the Unix socket path below PostgreSQL's platform limit on macOS.
const root=await mkdtemp(path.join(os.tmpdir(),'rs-sa-'))
const data=path.join(root,'data'),socket=path.join(root,'socket'),port=55481
await mkdir(socket,{mode:0o700})
let started=false
const client=new pg.Client({host:socket,port,user:'resume_test',database:'postgres'})
const createdSubscriptions:string[]=[]
const createdClocks:string[]=[]

const env={
  ...process.env,
  STRIPE_MODE:'test',STRIPE_ACCOUNT_ID:'acct_1QqPbAGGSDSNHj5K',STRIPE_WEBHOOK_SECRET:'whsec_acceptance_fixture',
  STRIPE_PASS_PRICE_ID:'price_acceptance_legacy',BILLING_ENABLED:'true',SUBSCRIPTION_OFFERS_ENABLED:'true',
  APP_ORIGIN:'https://resumestride.test',SUPABASE_URL:'https://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_acceptance',
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_acceptance',EXPORTS_ENABLED:'true',NODE_ENV:'test',
} as NodeJS.ProcessEnv

const arrayFunctions=new Set(['billing_effective_access','billing_owner_template_access','billing_owner_subscription_summary','document_begin','billing_apply_subscription_invoice_reversal_event'])
const objectFunctions=new Set(['billing_get_customer','billing_begin_offer_checkout','billing_lookup_offer_checkout'])
const db={
  rpc:async(name:string,args:Record<string,unknown>)=>{
    try{
      const keys=Object.keys(args)
      const values=keys.map(key=>{
        const value=args[key]
        return value && typeof value==='object' && !(value instanceof Date) ? JSON.stringify(value) : value
      })
      const params=keys.map((key,index)=>`${key}=>$${index+1}`).join(',')
      const result=await client.query(`select * from public.${name}(${params})`,values)
      if(arrayFunctions.has(name))return{error:null,data:result.rows}
      if(objectFunctions.has(name))return{error:null,data:result.rows[0]??null}
      const first=result.rows[0]
      return{error:null,data:first ? Object.values(first)[0] : null}
    }catch(error){return{error:{message:error instanceof Error?error.message:String(error)},data:null}}
  },
}

const owners={template:'11111111-1111-1111-1111-111111111111',pro:'22222222-2222-2222-2222-222222222222',overlap:'33333333-3333-3333-3333-333333333333',failure:'44444444-4442-4444-4444-444444444444',other:'55555555-5555-5555-5555-555555555555'}
const depsFor=(owner:string)=>({authenticate:async()=>owner,serviceDatabase:()=>db as never,stripeClient:()=>stripe,validateOffer:async(s:Stripe,c:never,o:never)=>{const {validateOffer}=await import('../server/billing/catalog.ts');return validateOffer(s,c,o)}})
const request=(pathName:string,body:Record<string,unknown>)=>new Request(`${env.APP_ORIGIN}${pathName}`,{method:'POST',headers:{origin:env.APP_ORIGIN!,'content-type':'application/json','x-resumestride-country':'US'},body:JSON.stringify(body)})
const rpc=async(name:string,args:Record<string,unknown>)=>{const result=await db.rpc(name,args);if(result.error)throw new Error(`${name}: ${result.error.message}`);return result.data}

function subscriptionPeriod(subscription:Stripe.Subscription){
  const item=subscription.items.data[0]
  return{start:new Date(item.current_period_start*1000).toISOString(),end:new Date(item.current_period_end*1000).toISOString()}
}

async function paidSubscription(owner:string,offerKey:string,price:string,clock?:string){
  let customerId:string
  if(clock){
    const customer=await stripe.customers.create({test_clock:clock,metadata:{resumestride_owner:owner,acceptance_run:runTag}})
    customerId=customer.id
    await rpc('billing_bind_customer',{p_owner:owner,p_customer:customerId,p_live:false})
  }else{
    const stored=await rpc('billing_get_customer',{p_owner:owner}) as Record<string,unknown>
    customerId=String(stored.stripe_customer_id)
  }
  const paymentMethod=await stripe.paymentMethods.create({type:'card',card:{token:'tok_visa'}} as Stripe.PaymentMethodCreateParams)
  await stripe.paymentMethods.attach(paymentMethod.id,{customer:customerId})
  const subscription=await stripe.subscriptions.create({
    customer:customerId,items:[{price}],default_payment_method:paymentMethod.id,payment_behavior:'error_if_incomplete',
    metadata:{offer_key:offerKey,acceptance_run:runTag},expand:['latest_invoice'],
  })
  createdSubscriptions.push(subscription.id)
  const period=subscriptionPeriod(subscription)
  const templateId=offerKey.startsWith('template:')?offerKey.slice(9):null
  await rpc('billing_record_offer_subscription',{p_owner:owner,p_subscription:subscription.id,p_price:price,p_live:false,p_status:subscription.status,p_cancel_at_period_end:subscription.cancel_at_period_end,p_period_start:period.start,p_period_end:period.end,p_offer_key:offerKey,p_offer_kind:templateId?'template':'pro',p_template_id:templateId})
  const invoice=typeof subscription.latest_invoice==='string'
    ? await stripe.invoices.retrieve(subscription.latest_invoice,{expand:['payments']})
    : await stripe.invoices.retrieve(subscription.latest_invoice!.id,{expand:['payments']})
  const trusted={owner_id:owner,subscription_id:subscription.id,offer_key:offerKey,cancel_at_period_end:false,current_period_end:period.end}
  assert.equal((await applyOfferInvoice(invoice,Math.floor(Date.now()/1000),'invoice.paid',stripe,db as never,trusted,env)).status,200)
  return{subscription,invoice,trusted,customerId,period}
}

async function access(owner:string,templateId:string){return (await rpc('billing_effective_access',{p_owner:owner,p_template:templateId}) as Array<{is_pro:boolean;has_template:boolean}>)[0]}

async function checkout(owner:string,offerKey:string,overlapConsent?:boolean){
  const requestId=crypto.randomUUID()
  const body={requestId,offerKey,renewalConsent:true,...(overlapConsent===undefined?{}:{overlapConsent})}
  const response=await offerCheckout(request('/api/subscription-checkout',body),env,depsFor(owner) as never)
  return{response,requestId,body}
}

async function waitForClock(id:string){
  for(let attempt=0;attempt<45;attempt++){
    const current=await stripe.testHelpers.testClocks.retrieve(id)
    if(current.status==='ready')return current
    await new Promise(resolve=>setTimeout(resolve,1000))
  }
  throw new Error(`Stripe test clock ${id} did not become ready`)
}

try{
  await execFile(path.join(process.env.PGBIN,'initdb'),['-D',data,'-U','resume_test','-A','trust','--no-locale','--encoding=UTF8'])
  await execFile(path.join(process.env.PGBIN,'pg_ctl'),['-D',data,'-l',path.join(root,'postgres.log'),'-o',`-k ${socket} -c listen_addresses='' -p ${port}`,'-w','start']);started=true
  await client.connect()
  await client.query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
  for(const file of (await readdir('supabase/migrations')).filter(file=>file.endsWith('.sql')).sort())await client.query(await readFile(path.join('supabase/migrations',file),'utf8'))
  await client.query(`insert into auth.users(id,created_at) values ${Object.values(owners).map((_,index)=>`($${index+1},now()-interval '60 days')`).join(',')}`,Object.values(owners))

  // FREE -> PREMIUM TEMPLATE: actual allowlisted Checkout plus paid test subscription.
  const first=await checkout(owners.template,'template:boardroom')
  assert.equal(first.response.status,200)
  assert.match(String((await first.response.json()).url),/^https:\/\/checkout\.stripe\.com\//)
  const duplicate=await offerCheckout(request('/api/subscription-checkout',first.body),env,depsFor(owners.template) as never)
  assert.equal(duplicate.status,200)
  const competing=await checkout(owners.template,'template:mandate')
  assert.equal(competing.response.status,409)
  const templatePrices=JSON.parse(env.STRIPE_TEMPLATE_PRICE_MAP!) as Record<string,string>
  const templatePaid=await paidSubscription(owners.template,'template:boardroom',templatePrices.boardroom)
  assert.deepEqual(await access(owners.template,'boardroom'),{is_pro:false,has_template:true})
  assert.deepEqual(await access(owners.template,'kernel'),{is_pro:false,has_template:false})

  const resume={...example(),template:'boardroom' as const}
  const localPdf=(value:typeof resume)=>renderPdf(value,chromium.executablePath())
  for(const [format,renderDocument,contentType,filename] of [['pdf',localPdf,'application/pdf','resume.pdf'],['docx',renderDocx,'application/vnd.openxmlformats-officedocument.wordprocessingml.document','resume.docx']] as const){
    const exported=await exportDocument({format,contentType,filename},request(`/api/export/${format}`,{requestId:crypto.randomUUID(),resume}),env,{authenticate:async()=>owners.template,serviceDatabase:()=>db as never,renderDocument})
    assert.equal(exported.status,200,await exported.clone().text())
    const bytes=new Uint8Array(await exported.arrayBuffer())
    assert.ok(bytes.length>500)
    assert.equal(format==='pdf'?new TextDecoder().decode(bytes.slice(0,4)):'PK',format==='pdf'?'%PDF':'PK')
  }
  console.log('PASS $1.99 checkout, paid entitlement, selective access, PDF and DOCX')

  // Customer Portal and ordinary cancellation retain the paid period.
  let portal=await customerPortal(request('/api/customer-portal',{}),env,depsFor(owners.template) as never)
  if(portal.status!==200){
    await stripe.billingPortal.configurations.create({business_profile:{headline:'Manage ResumeStride billing'},features:{invoice_history:{enabled:true},customer_update:{enabled:false}}})
    portal=await customerPortal(request('/api/customer-portal',{}),env,depsFor(owners.template) as never)
  }
  assert.equal(portal.status,200)
  assert.match(String((await portal.json()).url),/^https:\/\/billing\.stripe\.com\//)
  const cancelled=await cancelOffer(request('/api/cancel-offer',{subscriptionId:templatePaid.subscription.id}),env,depsFor(owners.template) as never)
  assert.equal(cancelled.status,200)
  assert.equal((await stripe.subscriptions.retrieve(templatePaid.subscription.id)).cancel_at_period_end,true)
  assert.equal((await access(owners.template,'boardroom')).has_template,true)
  console.log('PASS portal, cancel-at-period-end and paid-period access')

  // FREE -> PRO: actual Checkout and payment, then every template plus Pro workflow.
  assert.equal((await checkout(owners.pro,'pro:monthly')).response.status,200)
  const proPaid=await paidSubscription(owners.pro,'pro:monthly',env.STRIPE_PRO_MONTHLY_PRICE_ID!)
  for(const template of premiumTemplateIds)assert.equal((await access(owners.pro,template)).is_pro,true)
  assert.equal(templates.length,27)
  const workflow=(await client.query(`select public.jobs_account_snapshot($1)::text as value`,[owners.pro])).rows[0].value
  assert.equal(JSON.parse(workflow).isPro,true)
  assert.equal(JSON.parse(workflow).saveLimit,10000)
  console.log('PASS Pro payment, all 27 templates and Pro workflow access')

  // TEMPLATE -> PRO: explicit disclosure gate, paid Pro, then stop template renewal.
  assert.equal((await checkout(owners.overlap,'template:kernel')).response.status,200)
  const overlapTemplate=await paidSubscription(owners.overlap,'template:kernel',templatePrices.kernel)
  assert.equal((await checkout(owners.overlap,'pro:monthly')).response.status,400)
  await client.query(`update public.billing_offer_checkout_intents set completed_at=now() where owner_id=$1`,[owners.overlap])
  assert.equal((await checkout(owners.overlap,'pro:monthly',true)).response.status,200)
  await client.query(`update public.billing_offer_checkout_intents set completed_at=now() where owner_id=$1`,[owners.overlap])
  await paidSubscription(owners.overlap,'pro:monthly',env.STRIPE_PRO_MONTHLY_PRICE_ID!)
  assert.equal((await stripe.subscriptions.retrieve(overlapTemplate.subscription.id)).cancel_at_period_end,true)
  assert.equal((await access(owners.overlap,'kernel')).has_template,true)
  assert.equal((await access(owners.overlap,'kernel')).is_pro,true)
  console.log('PASS overlap disclosure, verified Pro activation, renewal stop and paid-through preservation')

  // Replay and event ordering are idempotent; status-before-invoice does not lose the grant.
  await applyOfferInvoice(proPaid.invoice,Math.floor(Date.now()/1000),'invoice.paid',stripe,db as never,proPaid.trusted,env)
  assert.equal(Number((await client.query(`select count(*) from public.billing_subscription_invoices where invoice_id=$1`,[proPaid.invoice.id])).rows[0].count),1)
  assert.equal(Number((await client.query(`select count(*) from public.billing_transactional_notices where dedupe_key=$1`,[`purchase:${proPaid.invoice.id}`])).rows[0].count),1)
  await applyOfferSubscriptionStatus(proPaid.subscription,db as never,proPaid.trusted)
  assert.equal((await access(owners.pro,'boardroom')).is_pro,true)
  console.log('PASS webhook replay and out-of-order subscription/invoice handling')

  // Actual declined test payment: no grant, durable action-required notice.
  const failedCustomer=await stripe.customers.create({metadata:{resumestride_owner:owners.failure,acceptance_run:runTag}})
  await rpc('billing_bind_customer',{p_owner:owners.failure,p_customer:failedCustomer.id,p_live:false})
  const failedMethod=await stripe.paymentMethods.create({type:'card',card:{token:'tok_chargeCustomerFail'}} as Stripe.PaymentMethodCreateParams)
  await stripe.paymentMethods.attach(failedMethod.id,{customer:failedCustomer.id})
  const failedSub=await stripe.subscriptions.create({customer:failedCustomer.id,items:[{price:templatePrices.mandate}],default_payment_method:failedMethod.id,payment_behavior:'allow_incomplete',metadata:{offer_key:'template:mandate',acceptance_run:runTag},expand:['latest_invoice']})
  createdSubscriptions.push(failedSub.id)
  const failedPeriod=subscriptionPeriod(failedSub)
  await rpc('billing_record_offer_subscription',{p_owner:owners.failure,p_subscription:failedSub.id,p_price:templatePrices.mandate,p_live:false,p_status:failedSub.status,p_cancel_at_period_end:false,p_period_start:failedPeriod.start,p_period_end:failedPeriod.end,p_offer_key:'template:mandate',p_offer_kind:'template',p_template_id:'mandate'})
  const failedInvoice=typeof failedSub.latest_invoice==='string'?await stripe.invoices.retrieve(failedSub.latest_invoice):failedSub.latest_invoice!
  await applyOfferInvoice(failedInvoice,Math.floor(Date.now()/1000),'invoice.payment_failed',stripe,db as never,{owner_id:owners.failure,subscription_id:failedSub.id,offer_key:'template:mandate',cancel_at_period_end:false,current_period_end:failedPeriod.end},env)
  assert.equal((await access(owners.failure,'mandate')).has_template,false)
  assert.equal(Number((await client.query(`select count(*) from public.billing_transactional_notices where owner_id=$1 and kind='payment_failed'`,[owners.failure])).rows[0].count),1)
  console.log('PASS real test decline, no entitlement and durable failure notice')

  // Real Stripe refund plus the server reversal ledger revoke access idempotently.
  const payment=templatePaid.invoice.payments?.data[0]?.payment
  const paymentIntent=payment?.type==='payment_intent'?(typeof payment.payment_intent==='string'?payment.payment_intent:payment.payment_intent?.id):null
  assert.ok(paymentIntent)
  const refund=await stripe.refunds.create({payment_intent:paymentIntent,metadata:{acceptance_run:runTag}})
  assert.equal(refund.status,'succeeded')
  const reversed=await rpc('billing_apply_subscription_invoice_reversal_event',{p_event_id:`evt_${refund.id}`,p_payment_intent_id:paymentIntent,p_kind:'refund',p_dispute_id:null,p_occurred_at:new Date().toISOString(),p_amount_total:199}) as Array<Record<string,unknown>>
  assert.equal(reversed[0].status,'voided_refund')
  assert.equal((await access(owners.template,'boardroom')).has_template,false)
  console.log('PASS actual test refund and entitlement reversal')

  // Stripe test clock proves cancellation reaches a terminal state; local wall-clock
  // simulation then proves the same recorded paid period reverts to Free without deletion.
  const clock=await stripe.testHelpers.testClocks.create({frozen_time:Math.floor(Date.now()/1000),name:`ResumeStride ${runTag}`})
  createdClocks.push(clock.id)
  const expiryOwner=owners.other
  const expiring=await paidSubscription(expiryOwner,'template:plainsong',templatePrices.plainsong,clock.id)
  await rpc('billing_schedule_renewal_notices',{p_now:new Date().toISOString()})
  assert.equal(Number((await client.query(`select count(*) from public.billing_transactional_notices n join public.billing_subscriptions s using(subscription_id) where n.subscription_id=$1 and n.kind='renewal_reminder' and n.due_at=s.current_period_end-interval '3 days'`,[expiring.subscription.id])).rows[0].count),1)
  await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:expiring.subscription.items.data[0].current_period_end+60})
  await waitForClock(clock.id)
  const renewed=await stripe.subscriptions.retrieve(expiring.subscription.id)
  await applyOfferSubscriptionStatus(renewed,db as never,expiring.trusted)
  let invoices=await stripe.invoices.list({customer:expiring.customerId,subscription:renewed.id,status:'paid',limit:10})
  let renewalInvoice=invoices.data.find(invoice=>invoice.id!==expiring.invoice.id)
  if(!renewalInvoice){
    // Automatic-collection invoices finalize about an hour after creation.
    await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:expiring.subscription.items.data[0].current_period_end+7200})
    await waitForClock(clock.id)
    invoices=await stripe.invoices.list({customer:expiring.customerId,subscription:renewed.id,status:'paid',limit:10})
    renewalInvoice=invoices.data.find(invoice=>invoice.id!==expiring.invoice.id)
  }
  assert.ok(renewalInvoice)
  const expandedRenewal=await stripe.invoices.retrieve(renewalInvoice.id,{expand:['payments']})
  await applyOfferInvoice(expandedRenewal,Math.floor(Date.now()/1000),'invoice.paid',stripe,db as never,{...expiring.trusted,current_period_end:subscriptionPeriod(renewed).end},env)
  assert.equal(Number((await client.query(`select count(*) from public.billing_transactional_notices where dedupe_key=$1`,[`renewal_receipt:${renewalInvoice.id}`])).rows[0].count),1)
  await stripe.subscriptions.update(renewed.id,{cancel_at_period_end:true})
  await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:renewed.items.data[0].current_period_end+60})
  await waitForClock(clock.id)
  const ended=await stripe.subscriptions.retrieve(expiring.subscription.id)
  assert.equal(ended.status,'canceled')
  await applyOfferSubscriptionStatus(ended,db as never,expiring.trusted)
  await client.query(`update public.billing_subscription_grants set period_end=now()-interval '1 second' where subscription_id=$1`,[ended.id])
  assert.equal((await access(expiryOwner,'plainsong')).has_template,false)
  assert.equal(Number((await client.query(`select count(*) from auth.users where id=$1`,[expiryOwner])).rows[0].count),1)
  assert.equal(Number((await client.query(`select count(*) from public.billing_transactional_notices where owner_id=$1 and kind='expiration'`,[expiryOwner])).rows[0].count),1)
  console.log('PASS actual test-clock renewal, 3-day reminder, expiration, Free reversion and account/content retention')

  // Account switching never crosses owner boundaries.
  assert.deepEqual(await access(owners.other,'kernel'),{is_pro:false,has_template:false})
  console.log('PASS account isolation')

  const noticeCounts=(await client.query(`select kind,count(*)::int as count from public.billing_transactional_notices group by kind order by kind`)).rows
  console.log(`NOTICE_RECORDS ${JSON.stringify(noticeCounts)}`)
}finally{
  for(const id of createdSubscriptions){try{const current=await stripe.subscriptions.retrieve(id);if(current.status!=='canceled')await stripe.subscriptions.cancel(id)}catch{/* test cleanup best effort */}}
  for(const id of createdClocks){try{await stripe.testHelpers.testClocks.del(id)}catch{/* test cleanup best effort */}}
  try{await client.end()}catch{/* not connected */}
  if(started)await execFile(path.join(process.env.PGBIN!,'pg_ctl'),['-D',data,'-m','immediate','-w','stop'])
  await rm(root,{recursive:true,force:true})
}
