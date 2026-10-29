-- Per-application requirement review: the owner can remove an extracted requirement,
-- correct its required/preferred classification, or add one the extractor missed.
-- Edits are stored separately from the immutable posting snapshot, so the original
-- source wording always remains available and user edits stay distinguishable.

alter table public.job_application_workflows
  add column requirement_edits jsonb not null default '{}'::jsonb,
  add constraint job_application_workflows_requirement_edits check (
    jsonb_typeof(requirement_edits) = 'object' and octet_length(requirement_edits::text) <= 20000);

create function public.applications_set_requirement_edits(p_owner uuid, p_saved_job uuid, p_edits jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_saved_job is null or p_edits is null or jsonb_typeof(p_edits) <> 'object'
    or octet_length(p_edits::text) > 20000 then raise exception 'Invalid requirement edits'; end if;
  if not exists(select 1 from public.saved_jobs where id = p_saved_job and owner_id = p_owner) then raise exception 'Saved job not found'; end if;
  if not exists(select 1 from public.job_application_workflows where saved_job_id = p_saved_job and owner_id = p_owner) then
    perform public.applications_apply(p_owner, p_saved_job, 0, '{}'::jsonb, 'user');
  end if;
  update public.job_application_workflows set requirement_edits = p_edits, updated_at = now()
  where saved_job_id = p_saved_job and owner_id = p_owner;
  return true;
end $$;

-- Saved-match inputs now carry the owner's requirement edits and whether the one Free
-- tailoring trial covers this application (which unlocks the full evidence view for it).
create or replace function public.jobs_saved_match_inputs(p_owner uuid,p_saved_job uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb; v_criteria jsonb; v_is_pro boolean;
begin
  if p_owner is null or p_saved_job is null then raise exception 'Invalid saved match request'; end if;
  select snapshot into v_snapshot from public.saved_jobs where id=p_saved_job and owner_id=p_owner;
  if v_snapshot is null then raise exception 'Saved job not found'; end if;
  select criteria into v_criteria from public.job_preferences where owner_id=p_owner;
  select is_pro into v_is_pro from public.billing_get_entitlement(p_owner);
  if v_is_pro is null then raise exception 'Entitlement unavailable'; end if;
  return jsonb_build_object(
    'snapshot',v_snapshot,'criteria',v_criteria,'isPro',v_is_pro,
    'trial',not v_is_pro and exists(select 1 from public.product_tailoring_trials where owner_id=p_owner and saved_job_id=p_saved_job),
    'requirementEdits',coalesce((select requirement_edits from public.job_application_workflows where owner_id=p_owner and saved_job_id=p_saved_job),'{}'::jsonb),
    'clarifications',coalesce((select jsonb_object_agg(requirement_id,value)
      from public.job_match_clarifications where owner_id=p_owner),'{}'::jsonb)
  );
end $$;

-- Application rows include the stored edits so the review screen can show them.
create or replace function public.applications_row(p_owner uuid, p_saved_job uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'savedJobId', j.id,
    'stage', coalesce(w.stage, 'saved'), 'closedReason', w.closed_reason, 'priorStage', w.prior_stage,
    'appliedOn', w.applied_on, 'nextAction', coalesce(w.next_action, ''), 'nextActionDue', w.next_action_due,
    'notes', coalesce(w.notes, ''), 'contactName', coalesce(w.contact_name, ''), 'contactDetails', coalesce(w.contact_details, ''),
    'requirementEdits', coalesce(w.requirement_edits, '{}'::jsonb),
    'origin', coalesce(w.origin, case when j.provider = 'extension' then 'capture' else 'user' end),
    'revision', coalesce(w.revision, 0), 'createdAt', coalesce(w.created_at, j.saved_at), 'updatedAt', coalesce(w.updated_at, j.saved_at),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'fromStage', e.from_stage, 'toStage', e.to_stage,
        'closedReason', e.closed_reason, 'origin', e.origin, 'occurredAt', e.occurred_at) order by e.occurred_at desc, e.id desc)
      from (select * from public.job_application_events where owner_id = p_owner and saved_job_id = j.id
            order by occurred_at desc, id desc limit 50) e), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'format', d.format, 'template', d.template,
        'sourceKind', d.source_kind, 'jobResumeVersionId', d.job_resume_version_id, 'exportedAt', d.exported_at,
        'submittedAt', d.submitted_at) order by d.exported_at desc)
      from (select * from public.job_application_documents where owner_id = p_owner and saved_job_id = j.id
            order by exported_at desc limit 20) d), '[]'::jsonb))
  from public.saved_jobs j
  left join public.job_application_workflows w on w.saved_job_id = j.id and w.owner_id = p_owner
  where j.id = p_saved_job and j.owner_id = p_owner
$$;
revoke all on function public.applications_row(uuid,uuid) from public, anon, authenticated;

revoke all on function public.applications_set_requirement_edits(uuid,uuid,jsonb), public.jobs_saved_match_inputs(uuid,uuid) from public, anon, authenticated;
grant execute on function public.applications_set_requirement_edits(uuid,uuid,jsonb), public.jobs_saved_match_inputs(uuid,uuid) to service_role;
