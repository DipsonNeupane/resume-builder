-- Launch allowance status: the next reset is when the oldest counted download leaves the
-- rolling seven-day window. The previous status returned now()+7 days whenever the
-- allowance was not exhausted, which is not when anything becomes available again.
-- Counting matches document_begin exactly (created_at window; complete or live lease).
create or replace function public.pdf_status(p_owner uuid)
returns table(is_pro boolean,remaining integer,resets_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare v_count integer;v_pro boolean;v_oldest timestamptz;
begin
 select coalesce(paid_through>now(),false) into v_pro from public.billing_entitlements where owner_id=p_owner;
 select count(*)::integer,min(created_at) into v_count,v_oldest from public.pdf_requests
 where owner_id=p_owner and counts_free and created_at>now()-interval '7 days'
  and (state='complete' or(state='reserved' and lease_until>now()));
 return query select coalesce(v_pro,false),greatest(0,7-v_count),
  case when v_count>0 then v_oldest+interval '7 days' else null end;
end $$;
revoke all on function public.pdf_status(uuid) from public,anon,authenticated;
grant execute on function public.pdf_status(uuid) to service_role;
