-- Add missing context only; never rewrite existing posting text or exported documents.
create function public.applications_fill_missing_posting(p_owner uuid,p_saved_job uuid,p_description text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_snapshot jsonb;
  -- ECMAScript String.trim whitespace, shared with the client and API.
  v_whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if p_owner is null or p_saved_job is null or p_description is null or length(btrim(p_description,v_whitespace))=0 or length(p_description)>12000 then raise exception 'Invalid posting'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_saved_job::text,193));
  select snapshot into v_snapshot from public.saved_jobs where owner_id=p_owner and id=p_saved_job for update;
  if not found then raise exception 'Saved job not found'; end if;
  if coalesce(btrim(v_snapshot->>'descriptionText',v_whitespace),'')<>'' then raise exception 'Posting already has description'; end if;
  update public.saved_jobs set snapshot=jsonb_set(v_snapshot,'{descriptionText}',to_jsonb(btrim(p_description,v_whitespace))),
    match_analysis=null,match_analysis_version=null,match_invalidated_at=now(),match_invalidation_reason='job',updated_at=now()
    where owner_id=p_owner and id=p_saved_job;
  update public.job_resume_versions set job_snapshot=jsonb_set(job_snapshot,'{descriptionText}',to_jsonb(btrim(p_description,v_whitespace))),revision=revision+1,updated_at=now()
    where owner_id=p_owner and saved_job_id=p_saved_job and coalesce(btrim(job_snapshot->>'descriptionText',v_whitespace),'')='';
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.applications_fill_missing_posting(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.applications_fill_missing_posting(uuid,uuid,text) to service_role;
