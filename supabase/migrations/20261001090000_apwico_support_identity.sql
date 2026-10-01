-- Forward-only brand correction for an already-deployed function definition.
--
-- The original migration remains immutable history. Rebuilding the function from
-- PostgreSQL's canonical definition changes only the support address embedded in
-- three user-facing limit errors; tables, data, signature, owner and ACLs remain
-- unchanged. This migration is prepared for the release runbook and is not applied
-- to any hosted project by repository verification.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.resumes_enforce_owner_limits()'::regprocedure)
    into definition;

  if position('support@resumestride.com' in definition) = 0 then
    if position('support@apwico.com' in definition) > 0 then
      return;
    end if;
    raise exception 'resumes_enforce_owner_limits does not contain the expected support identity';
  end if;

  execute replace(definition, 'support@resumestride.com', 'support@apwico.com');
end;
$migration$;

