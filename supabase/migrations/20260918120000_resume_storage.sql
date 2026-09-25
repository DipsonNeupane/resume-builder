-- ResumeStride P0-05: owned resume storage.
--
-- Scope: one cloud resume per account (mirrors the app's current single-document
-- editor; a multi-document dashboard is separate, later work). RLS is the actual
-- security boundary here — there is no server API in front of this table, the
-- browser talks to PostgREST directly using the user's own session, so every
-- policy below must hold on its own without trusting anything the client sends.
--
-- Nothing here is provisioned against a live project by this change; it is a
-- migration file only. Apply with `supabase db push` (or run it directly against
-- a project's SQL editor) against the owner's own Supabase project.

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  data jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resumes_owner_unique unique (owner_id),
  constraint resumes_schema_version_supported check (schema_version >= 1),
  constraint resumes_data_is_object check (jsonb_typeof(data) = 'object'),
  -- Mirrors the client's own maxBackupBytes ceiling (src/model.ts) so a
  -- misbehaving or compromised client can't push an unbounded document.
  constraint resumes_data_size_bounded check (octet_length(data::text) <= 8000000)
);

-- Immutable checkpoint on every accepted write, for conflict recovery/audit.
-- Not exposed in the UI this session; it exists so a future "restore a previous
-- save" feature has real history to work with instead of only the latest state.
create table if not exists public.resume_revisions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  data jsonb not null,
  reason text not null default 'save',
  created_at timestamptz not null default now(),
  constraint resume_revisions_unique unique (resume_id, revision)
);

create index if not exists resume_revisions_resume_id_idx
  on public.resume_revisions (resume_id, revision desc);

alter table public.resumes enable row level security;
alter table public.resume_revisions enable row level security;

-- RLS restricts *rows*, not the operation itself — PostgREST still needs the
-- underlying table grant or every request fails with "permission denied"
-- regardless of policy. Nothing is granted to `anon`: signed-out requests must
-- have no access at all, not just be filtered to zero rows. Explicit revokes
-- are defense-in-depth against a project-level default privilege this
-- migration doesn't control granting either role something unexpected.
-- resume_revisions has NO insert grant for `authenticated` at all: the only
-- writer is the SECURITY DEFINER trigger function below, which runs as the
-- function's owner regardless of the invoking role's own grants. A client
-- that could INSERT directly could set `revision` to any value it likes
-- (there is no CHECK tying it to the parent's actual counter) and forge a
-- future checkpoint, or pre-occupy a (resume_id, revision) pair so the real
-- trigger-written checkpoint silently loses the `on conflict do nothing` race
-- and the genuine data for that revision is never recorded. Select-only.
revoke all on table public.resumes, public.resume_revisions from anon, public, authenticated;
grant select, insert, update, delete on table public.resumes to authenticated;
grant select on table public.resume_revisions to authenticated;

-- Owner-only access. auth.uid() comes from the verified JWT, never from a
-- client-supplied column, so these hold even against a hand-crafted request.
create policy resumes_select_own on public.resumes
  for select using (owner_id = auth.uid());
create policy resumes_insert_own on public.resumes
  for insert with check (owner_id = auth.uid());
create policy resumes_update_own on public.resumes
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy resumes_delete_own on public.resumes
  for delete using (owner_id = auth.uid());

create policy resume_revisions_select_own on public.resume_revisions
  for select using (owner_id = auth.uid());
-- No insert/update/delete policy at all for `authenticated`: combined with
-- the revoked table grant above, PostgREST cannot write to this table under
-- any circumstances for any role. The only writer is the SECURITY DEFINER
-- trigger function below, which (as the function owner, not the invoking
-- role) is unaffected by both the missing grant and the missing policy. This
-- is intentionally belt-and-suspenders: even if a future change re-grants
-- INSERT to `authenticated` by mistake, there is still no policy that would
-- let it succeed.

-- Server-controlled revision counter. A BEFORE trigger overwrites whatever
-- revision/owner_id/created_at value a client update payload contains, so
-- those fields can never be spoofed through the REST API. Optimistic
-- concurrency itself is enforced by the caller, not by this trigger: the
-- client's `.eq('revision', expectedRevision)` predicate is evaluated against
-- the row's stored value BEFORE this trigger runs, so a stale expected
-- revision matches zero rows instead of silently overwriting a newer save.
create or replace function public.resumes_set_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  elsif tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.resumes_set_revision() from public, anon, authenticated;

drop trigger if exists resumes_set_revision_trigger on public.resumes;
create trigger resumes_set_revision_trigger
  before insert or update on public.resumes
  for each row execute function public.resumes_set_revision();

-- Fixed reason 'save' for every checkpoint in this increment; differentiating
-- reasons (import/manual_checkpoint/accepted_ai per docs/CLAUDE_IMPLEMENTATION_TODO.md)
-- is deferred — not needed until something reads resume_revisions.
--
-- SECURITY DEFINER so this insert succeeds under the function owner's own
-- privileges (the migration-running role, which owns the table) rather than
-- the invoking `authenticated` role's — which, per the revokes above, has no
-- grant on resume_revisions at all. This is what makes "trigger-only writes"
-- actually true rather than aspirational: there is no privilege an
-- `authenticated` request could be given (short of re-running this migration
-- differently) that lets it write this table directly. `search_path` is
-- pinned so a same-named object in another schema earlier on some other
-- search_path can't get resolved instead of the intended one — required
-- hardening for any SECURITY DEFINER function, since it otherwise runs with
-- the caller's search_path while holding the owner's privileges.
--
-- No `on conflict do nothing`: since this is the only writer, and `revision`
-- comes from the resumes row's own server-maintained counter (previous
-- update's `old.revision + 1`, itself serialized by Postgres's normal
-- per-row update locking), a (resume_id, revision) collision here can only
-- mean a real bug — it should raise and roll back the save, not silently
-- discard the checkpoint while reporting success to the client.
create or replace function public.resumes_write_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.resume_revisions (resume_id, owner_id, revision, data, reason)
  values (new.id, new.owner_id, new.revision, new.data, 'save');
  return new;
end;
$$;

revoke execute on function public.resumes_write_checkpoint() from public, anon, authenticated;

drop trigger if exists resumes_write_checkpoint_trigger on public.resumes;
create trigger resumes_write_checkpoint_trigger
  after insert or update on public.resumes
  for each row execute function public.resumes_write_checkpoint();
