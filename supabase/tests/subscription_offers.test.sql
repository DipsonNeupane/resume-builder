begin;
select plan(24);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values
 ('abababab-abab-abab-abab-abababababab','00000000-0000-0000-0000-000000000000','authenticated','authenticated','offers@example.com','x',now(),now()-interval '60 days',now(),'{}','{}',false),
 ('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','00000000-0000-0000-0000-000000000000','authenticated','authenticated','refund@example.com','x',now(),now()-interval '60 days',now(),'{}','{}',false);

set local role authenticated;
select throws_ok($$select * from public.billing_subscription_grants$$,'42501',null,'browser cannot read grants');
select throws_ok($$select * from public.billing_transactional_notices$$,'42501',null,'browser cannot read notices');
select throws_ok($$select * from public.billing_owner_subscription_summary('abababab-abab-abab-abab-abababababab')$$,'42501',null,'browser cannot call subscription summary');
reset role;
set local role service_role;

select lives_ok($$select public.billing_record_offer_subscription('abababab-abab-abab-abab-abababababab','sub_template','price_template',false,'active',false,now(),now()+interval '1 month','template:boardroom','template','boardroom')$$,'records trusted template subscription');
select lives_ok($$select public.billing_apply_offer_invoice('sub_template','in_template','abababab-abab-abab-abab-abababababab','pi_template','price_template',false,199,'usd',now(),now()+interval '1 month',now())$$,'applies verified template invoice');
select is((select has_template from public.billing_effective_access('abababab-abab-abab-abab-abababababab','boardroom')),true,'matching template has access');
select is((select has_template from public.billing_effective_access('abababab-abab-abab-abab-abababababab','kernel')),false,'different template stays locked');
select is((select is_pro from public.billing_effective_access('abababab-abab-abab-abab-abababababab','boardroom')),false,'template subscription does not grant Pro');
select throws_ok($$select * from public.document_begin('11111111-2222-3333-4444-555555555555','abababab-abab-abab-abab-abababababab',repeat('a',64),'kernel',true)$$,'P0001','Premium template access required','locked Premium export is rejected');
select lives_ok($$select * from public.document_begin('11111111-2222-3333-4444-555555555556','abababab-abab-abab-abab-abababababab',repeat('b',64),'boardroom',true)$$,'subscribed Premium export is allowed');
select lives_ok($$select public.billing_record_offer_subscription('abababab-abab-abab-abab-abababababab','sub_pro','price_pro',false,'active',false,now(),now()+interval '1 month','pro:monthly','pro',null)$$,'records trusted Pro subscription');
select lives_ok($$select public.billing_apply_offer_invoice('sub_pro','in_pro','abababab-abab-abab-abab-abababababab','pi_pro','price_pro',false,1999,'usd',now(),now()+interval '1 month',now())$$,'applies verified Pro invoice');
select is((select is_pro from public.billing_effective_access('abababab-abab-abab-abab-abababababab','kernel')),true,'Pro grants all-template access');
select lives_ok($$select public.billing_enqueue_notice('abababab-abab-abab-abab-abababababab','sub_pro','renewal_reminder',now(),'reminder:test','{}')$$,'durable reminder can be queued');
select is((select count(*)::int from public.billing_transactional_notices where dedupe_key='reminder:test'),1,'notice is recorded once');
select lives_ok($$select public.billing_enqueue_notice('abababab-abab-abab-abab-abababababab','sub_pro','renewal_reminder',now(),'reminder:test','{}')$$,'duplicate notice enqueue is idempotent');
select is((select count(*)::int from public.billing_transactional_notices where dedupe_key='reminder:test'),1,'duplicate notice is not added');
select lives_ok($$select public.billing_update_offer_subscription('sub_pro','abababab-abab-abab-abab-abababababab','active',true,now()+interval '1 month')$$,'cancellation scheduling succeeds');
select is((select cancel_at_period_end from public.billing_subscriptions where subscription_id='sub_pro'),true,'cancellation flag persisted without retracting access');
select is((select state from public.billing_transactional_notices where dedupe_key='reminder:test'),'cancelled','cancellation suppresses a queued renewal reminder');

select lives_ok($$select public.billing_record_offer_subscription('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','sub_template_refund','price_template',false,'active',false,now(),now()+interval '1 month','template:boardroom','template','boardroom')$$,'records a template-only subscription for reversal');
select lives_ok($$select public.billing_apply_offer_invoice('sub_template_refund','in_template_refund','cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','pi_template_refund','price_template',false,199,'usd',now(),now()+interval '1 month',now())$$,'template invoice creates a nullable reversal anchor without Pro');
select lives_ok($$select * from public.billing_apply_subscription_invoice_reversal_event('evt_template_refund','pi_template_refund','refund',null,now(),199)$$,'full template refund is reconciled');
select is((select row(is_pro,has_template) from public.billing_effective_access('cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd','boardroom')),row(false,false),'full refund revokes template access without granting Pro');

select * from finish();
rollback;
