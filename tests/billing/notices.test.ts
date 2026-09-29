import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchNotices, emailCopy } from '../../server/billing/notices.ts'

const kinds = ['purchase','renewal_reminder','renewal_receipt','cancellation','payment_failed','expiration'] as const

test('all required transactional messages are factual and contain no marketing copy', () => {
  for (const kind of kinds) {
    const [subject, body] = emailCopy(kind, { offerKey:'template:boardroom', periodEnd:'2026-11-01T00:00:00Z', accessEndsAt:'2026-11-01T00:00:00Z' })
    assert.ok(subject.length > 3)
    assert.ok(body.length > 10)
    assert.doesNotMatch(`${subject} ${body}`, /upgrade|sale|discount|offer expires|recommended|popular/i)
  }
})

test('safe acceptance sink dispatches six durable notice kinds without external email', async () => {
  const rows = kinds.map((kind,index) => ({
    id:`00000000-0000-0000-0000-00000000000${index}`,
    owner_id:'abababab-abab-abab-abab-abababababab', subscription_id:'sub_fixture', kind,
    dedupe_key:`acceptance:${kind}`, payload:{offerKey:'pro:monthly',periodEnd:'2026-11-01T00:00:00Z',accessEndsAt:'2026-11-01T00:00:00Z'},
  }))
  const finished:Array<Record<string,unknown>>=[]
  const sent:Array<{url:string;init:RequestInit;body:Record<string,unknown>}>=[]
  const db={
    rpc:async(name:string,args:Record<string,unknown>)=>{
      if(name==='billing_schedule_renewal_notices')return{error:null,data:1}
      if(name==='billing_claim_due_notices')return{error:null,data:rows}
      if(name==='billing_finish_notice'){finished.push(args);return{error:null,data:null}}
      throw new Error(`Unexpected RPC ${name}`)
    },
    auth:{admin:{getUserById:async()=>({data:{user:{email:'billing-acceptance@resumestride.test'}}})}},
  }
  const response=await dispatchNotices(new Request('https://resumestride.test/api/dispatch',{method:'POST',headers:{authorization:`Bearer ${'x'.repeat(24)}`}}),{
    NOTICE_DISPATCH_SECRET:'x'.repeat(24),RESEND_API_KEY:'re_test_fixture',BILLING_EMAIL_FROM:'ResumeStride <billing@resumestride.test>',APP_ORIGIN:'https://resumestride.test',
  } as NodeJS.ProcessEnv,{
    serviceDatabase:()=>db as never,
    fetch:async(url,init)=>{const body=JSON.parse(String(init?.body));sent.push({url:String(url),init:init!,body});return Response.json({id:`email_${sent.length}`})},
  })
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{scheduled:1,claimed:6,sent:6})
  assert.equal(sent.length,6)
  assert.equal(finished.length,6)
  assert.ok(finished.every(call=>call.p_success===true&&typeof call.p_provider_id==='string'))
  assert.deepEqual(sent.map(item=>item.init.headers&&new Headers(item.init.headers).get('Idempotency-Key')),kinds.map(kind=>`acceptance:${kind}`))
  assert.ok(sent.every(item=>item.body.to instanceof Array&&item.body.to[0]==='billing-acceptance@resumestride.test'))
  assert.ok(sent.every(item=>!/upgrade|sale|discount|recommended|popular/i.test(`${item.body.subject} ${item.body.text}`)))
})
