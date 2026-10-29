begin;
select plan(10);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values
 ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','renews@example.com','x',now(),now()-interval '60 days',now(),'{}','{}',false),
 ('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cancelled@example.com','x',now(),now()-interval '60 days',now(),'{}','{}',false);

-- Runs as the database owner: grants are covered by subscription_offers.test.sql.
select lives_ok($$select public.billing_record_offer_subscription('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1','sub_renews','price_pro',false,'active',false,now()-interval '20 days',now()+interval '10 days','pro:monthly','pro',null)$$,'records a renewing Pro subscription');
select lives_ok($$select public.billing_record_offer_subscription('c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2','sub_cancelled','price_pro',false,'active',true,now()-interval '20 days',now()+interval '10 days','pro:monthly','pro',null)$$,'records a Pro subscription set to cancel');

select is(public.billing_schedule_renewal_notices(now()),1,'one reminder is scheduled, only for the renewing subscription');
select is((select due_at from public.billing_transactional_notices where subscription_id='sub_renews' and kind='renewal_reminder'),
  (select current_period_end - interval '3 days' from public.billing_subscriptions where subscription_id='sub_renews'),'the reminder falls due three days before the period ends');
select is((select payload->>'renewsAt' from public.billing_transactional_notices where subscription_id='sub_renews')::timestamptz,
  (select current_period_end from public.billing_subscriptions where subscription_id='sub_renews'),'the reminder carries the renewal date it announces');
select is(public.billing_schedule_renewal_notices(now()),0,'scheduling again adds nothing');
select is((select count(*)::int from public.billing_transactional_notices where subscription_id='sub_cancelled'),0,'a subscription set to cancel gets no reminder');
select is((select count(*)::int from public.billing_claim_due_notices(25)),0,'a reminder is not claimed before it falls due');

update public.billing_transactional_notices set due_at = now() - interval '1 minute' where subscription_id='sub_renews';
select is((select count(*)::int from public.billing_claim_due_notices(25)),1,'a due reminder is claimed once');
select is((select state from public.billing_transactional_notices where subscription_id='sub_renews'),'sending','the claimed reminder is marked as sending');

select * from finish();
rollback;
