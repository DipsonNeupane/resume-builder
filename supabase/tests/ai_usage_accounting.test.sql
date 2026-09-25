begin;
select plan(30);
insert into auth.users(id) values ('66666666-6666-6666-6666-666666666666');

select is(public.begin_ai_request(
  '10000000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('a',64)), 'reserved', 'new logical request reserves budget');
select is((select feature from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),'tailoring','feature recorded');
select is((select model from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),'gpt-4.1-mini-2025-04-14','requested model recorded');
select is((select request_fingerprint from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),repeat('a',64),'fingerprint recorded');
select is(public.begin_ai_request(
  '10000000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('a',64)), 'duplicate', 'same request id cannot authorize a second call');
select is(public.begin_ai_request(
  '10000000-0000-0000-0000-000000000002','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('a',64)), 'duplicate', 'cross-tab duplicate fingerprint cannot authorize a second call');
select lives_ok($$select public.start_ai_request('10000000-0000-0000-0000-000000000001')$$,'provider start recorded');
select is((select status from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),'in_progress','request becomes in progress');
select lives_ok($$select public.finish_ai_request(
  '10000000-0000-0000-0000-000000000001','succeeded',1000,100,560,
  'gpt-4.1-mini-2025-04-14','resp_1','req_1')$$,'successful usage recorded');
select is((select status from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),'succeeded','success outcome recorded');
select is((select input_tokens from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),1000::bigint,'input tokens recorded');
select is((select output_tokens from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),100::bigint,'output tokens recorded');
select is((select actual_cost_micro_usd from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),560::bigint,'actual calculated cost recorded');
select is((select charged_micro_usd from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),560::bigint,'actual cost charged to budget');
select is((select provider_response_id || ':' || provider_request_id from public.ai_budget_requests where request_id='10000000-0000-0000-0000-000000000001'),'resp_1:req_1','provider identifiers recorded');

select is(public.begin_ai_request(
  '20000000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('b',64)), 'reserved', 'second distinct request reserves');
select lives_ok($$select public.start_ai_request('20000000-0000-0000-0000-000000000001')$$,'invalid-output request starts');
select lives_ok($$select public.finish_ai_request(
  '20000000-0000-0000-0000-000000000001','invalid',900,80,488,
  'gpt-4.1-mini-2025-04-14','resp_2','req_2')$$,'invalid output with known usage completes');
select is((select charged_micro_usd from public.ai_budget_requests where request_id='20000000-0000-0000-0000-000000000001'),488::bigint,'invalid output still records provider spend');

select is(public.begin_ai_request(
  '30000000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('c',64)), 'reserved', 'timeout candidate reserves');
select lives_ok($$select public.start_ai_request('30000000-0000-0000-0000-000000000001')$$,'timeout candidate starts');
select lives_ok($$select public.finish_ai_request(
  '30000000-0000-0000-0000-000000000001','timed_out',null,null,null,null,null,null)$$,'timeout outcome recorded without guessed usage');
select is((select status from public.ai_budget_requests where request_id='30000000-0000-0000-0000-000000000001'),'timed_out','timeout distinguished');
select is((select reserved_micro_usd from public.ai_budget_months),5000::bigint,'uncertain timeout retains full reservation');
select lives_ok($$select public.reconcile_ai_request(
  '30000000-0000-0000-0000-000000000001','confirmed_not_charged','provider support case 123',null,null,null)$$,'evidence-backed no-charge reconciliation releases reservation');
select is((select reserved_micro_usd from public.ai_budget_months),0::bigint,'reconciled reservation released');

set local role authenticated;
select throws_ok($$select public.begin_ai_request(
  '40000000-0000-0000-0000-000000000001','66666666-6666-6666-6666-666666666666',5000,
  'tailoring','gpt-4.1-mini-2025-04-14',repeat('d',64))$$,'42501','permission denied for function begin_ai_request','browser cannot reserve AI spend');
select throws_ok($$select public.start_ai_request('30000000-0000-0000-0000-000000000001')$$,'42501','permission denied for function start_ai_request','browser cannot mark provider calls');
select throws_ok($$select public.finish_ai_request(
  '30000000-0000-0000-0000-000000000001','failed',null,null,null,null,null,null)$$,'42501','permission denied for function finish_ai_request','browser cannot write outcomes');
select throws_ok($$select public.reconcile_ai_request(
  '30000000-0000-0000-0000-000000000001','confirmed_not_charged','fake',null,null,null)$$,'42501','permission denied for function reconcile_ai_request','browser cannot reconcile reservations');
reset role;
select * from finish();
rollback;
