begin;
select plan(12);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_super_admin)
values ('efefefef-efef-4fef-8fef-efefefefefef','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pilot@example.com','x',now(),now()-interval '1 day',now(),'{}','{}',false);

set local role service_role;
select lives_ok($$select public.billing_begin_offer_checkout('11111111-aaaa-4111-8111-111111111111','efefefef-efef-4fef-8fef-efefefefefef','pro:monthly','price_pro',false,'promo_three')$$,'reserves checkout with the approved promotion id');
select is((select pilot_promotion_code_id from public.billing_offer_checkout_intents where id='11111111-aaaa-4111-8111-111111111111'),'promo_three','checkout intent retains the approved code identity');
select lives_ok($$select public.billing_begin_offer_checkout('11111111-aaaa-4111-8111-111111111111','efefefef-efef-4fef-8fef-efefefefefef','pro:monthly','price_pro',false,'promo_three')$$,'same promotion checkout retry is idempotent');
select throws_ok($$select public.billing_begin_offer_checkout('11111111-aaaa-4111-8111-111111111111','efefefef-efef-4fef-8fef-efefefefefef','pro:monthly','price_pro',false,'promo_other')$$,'P0001','Offer checkout mismatch','retry cannot replace the promotion id');
select is((select id from public.billing_begin_offer_checkout('22222222-aaaa-4111-8111-111111111111','efefefef-efef-4fef-8fef-efefefefefef','pro:monthly','price_pro',false,'promo_three')),'11111111-aaaa-4111-8111-111111111111'::uuid,'a fresh request resumes the existing pending intent');
select throws_ok($$select public.billing_begin_offer_checkout('33333333-aaaa-4111-8111-111111111111','efefefef-efef-4fef-8fef-efefefefefef','pro:monthly','price_pro',false,'promo_other')$$,'P0001','Offer checkout promotion mismatch','a pending intent cannot switch discount codes');
select lives_ok($$select public.billing_record_offer_subscription('efefefef-efef-4fef-8fef-efefefefefef','sub_pilot','price_pro',false,'active',false,now(),now()+interval '1 month','pro:monthly','pro',null,'promo_three')$$,'records the trusted pilot promotion on Pro');
select lives_ok($$select public.billing_apply_offer_invoice('sub_pilot','in_pilot_free','efefefef-efef-4fef-8fef-efefefefefef',null,'price_pro',false,0,'usd','promo_three',now(),now()+interval '1 month',now())$$,'zero-dollar invoice grants the period with the matching pilot promotion');
select is((select row(amount_paid,payment_intent_id,pilot_promotion_code_id) from public.billing_subscription_invoices where invoice_id='in_pilot_free'),row(0::bigint,null::text,'promo_three'::text),'free period is auditable without inventing a payment intent');
select is((select is_pro from public.billing_effective_access('efefefef-efef-4fef-8fef-efefefefefef','__pro__')),true,'pilot invoice grants Pro only through its recorded period');
select throws_ok($$select public.billing_apply_offer_invoice('sub_pilot','in_pilot_unmarked','efefefef-efef-4fef-8fef-efefefefefef',null,'price_pro',false,0,'usd',null,now(),now()+interval '1 month',now())$$,'P0001','Invalid offer invoice','zero-dollar invoice without a promotion is rejected');
select throws_ok($$select public.billing_apply_offer_invoice('sub_pilot','in_pilot_wrong_code','efefefef-efef-4fef-8fef-efefefefefef',null,'price_pro',false,0,'usd','promo_other',now(),now()+interval '1 month',now())$$,'P0001','Offer invoice identity mismatch','zero-dollar invoice with a different promotion is rejected');

select * from finish();
rollback;
