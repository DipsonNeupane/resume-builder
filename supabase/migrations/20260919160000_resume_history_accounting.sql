-- Account for retained history created before owner counters existed.
-- Run as one transaction: prevent checkpoint writes/deletes between aggregate and backfill.
-- Does not delete history or reduce lifetime counters after resume deletion.
begin;
lock table public.resumes in share row exclusive mode;
lock table public.resume_revisions in share mode;
lock table public.resume_owner_limits in share row exclusive mode;
insert into public.resume_owner_limits (owner_id, lifetime_revision_count, lifetime_revision_bytes)
select owner_id, count(*), sum(octet_length(data::text))
from public.resume_revisions group by owner_id
on conflict (owner_id) do update set
 lifetime_revision_count = greatest(resume_owner_limits.lifetime_revision_count, excluded.lifetime_revision_count),
 lifetime_revision_bytes = greatest(resume_owner_limits.lifetime_revision_bytes, excluded.lifetime_revision_bytes);
commit;
