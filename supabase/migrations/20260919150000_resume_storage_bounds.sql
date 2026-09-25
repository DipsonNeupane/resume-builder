-- ResumeStride: server-enforced cloud storage bounds + full JSON shape
-- validation for public.resumes / public.resume_revisions.
--
-- ADDITIVE ONLY. This migration does not alter, drop, or replace anything
-- created by supabase/migrations/20260918120000_resume_storage.sql — it only
-- adds new tables, new functions, new triggers, and one new NOT VALID CHECK
-- constraint on the existing `resumes` table. The prior migration's own
-- tables/policies/triggers/grants are untouched.
--
-- Motivation (docs/SECURITY_REVIEW.md, "High: cloud storage consumption is
-- not bounded per account"): each accepted save writes a full checkpoint via
-- the existing resumes_write_checkpoint trigger, with no server-side cap on
-- write rate, revision count, or aggregate history size. A signed-in client
-- (or anyone with a valid bearer token, bypassing this app's own UI/debounce
-- entirely) could otherwise create unlimited history and unbounded storage
-- cost. This migration closes that gap while explicitly NOT deleting any
-- existing checkpoint — see docs/CLOUD_LIMITS_REVIEW.md for the exact caps
-- chosen, the reasoning behind each number, every test, and what is still
-- honestly unresolved (in particular: there is still no self-service way for
-- an account to reduce its own history once near a cap, by design, since
-- deleting revisions was explicitly out of scope for this change).
--
-- NOT applied to any hosted project by this migration. Applying it later
-- requires first inspecting hosted data per docs/CLOUD_LIMITS_REVIEW.md; the
-- new JSON-shape CHECK constraint is added NOT VALID specifically so that
-- step can happen safely and separately (see the comment above that
-- constraint below).

-- ---------------------------------------------------------------------------
-- 1. Configurable caps.
--
-- A single-row config table rather than hard-coded literals inside the
-- trigger functions below, so an operator can retune a cap with a plain
-- UPDATE (no redeploy) and so tests can cheaply exercise the reject-at-cap
-- path without looping thousands of times. `authenticated`/`anon` get no
-- grant on this table at all (see the revoke below) — these are
-- server-operator knobs, not client-visible or client-writable state. The
-- `id boolean primary key default true` + `check (id)` pair is a standard
-- singleton-row trick: only `id = true` is ever a legal value, and the
-- primary key forbids a second row, so exactly one config row can exist.
-- ---------------------------------------------------------------------------
create table if not exists public.resume_limit_config (
  id boolean primary key default true,
  -- Lifetime cap on checkpoints (resume_revisions rows) per account, across
  -- every resume that account has ever owned (see section 3 for why this is
  -- owner-scoped, not resume-scoped). 5000 is deliberately generous for real
  -- usage — see docs/CLOUD_LIMITS_REVIEW.md for the derivation — while still
  -- bounding worst-case row count/table growth from a single abusive account.
  max_revisions_per_owner bigint not null default 5000,
  -- Lifetime cap on the sum of octet_length(data::text) across every
  -- checkpoint an account has ever written. This is the primary defense
  -- against large-payload abuse: at the existing 8,000,000-byte per-row
  -- ceiling (resumes_data_size_bounded, unchanged from the prior migration),
  -- an abuser hits this cap in a handful of writes, well before the revision
  -- COUNT cap or the rate limit below would stop them.
  max_revision_bytes_per_owner bigint not null default 50000000,
  -- Sliding write-rate window: at most max_writes_per_window accepted writes
  -- (inserts or updates to `resumes`) per account per rate_window_seconds.
  rate_window_seconds integer not null default 60,
  max_writes_per_window integer not null default 240,
  constraint resume_limit_config_singleton check (id),
  constraint resume_limit_config_positive check (
    max_revisions_per_owner > 0 and max_revision_bytes_per_owner > 0 and
    rate_window_seconds > 0 and max_writes_per_window > 0
  )
);
insert into public.resume_limit_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Per-owner abuse-prevention counters.
--
-- Deliberately keyed by owner_id, NOT resume_id, and deliberately NOT a
-- child of `resumes` (no foreign key to resumes.id, no ON DELETE CASCADE
-- from resumes). If it were resume-scoped, or cascaded away when a resume
-- row is deleted, a client could bypass every cap in this file with a
-- delete-then-recreate loop: delete their resume (explicitly still allowed —
-- account/resume deletion is not restricted by this migration), insert a
-- fresh one, and have history-count/aggregate-bytes/rate-window state reset
-- to zero each time. Because this table only references auth.users(id) (ON
-- DELETE CASCADE there — so a genuine account deletion still correctly wipes
-- it, per "account deletion still possible"), the counters below survive any
-- number of resume delete/recreate cycles for the same signed-in account.
-- See docs/CLOUD_LIMITS_REVIEW.md and the "delete/recreate" pgTAP test in
-- supabase/tests/resume_storage_bounds.test.sql for the concrete proof.
-- ---------------------------------------------------------------------------
create table if not exists public.resume_owner_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  lifetime_revision_count bigint not null default 0,
  lifetime_revision_bytes bigint not null default 0,
  rate_window_started_at timestamptz not null default now(),
  rate_window_count integer not null default 0
);

alter table public.resume_limit_config enable row level security;
alter table public.resume_owner_limits enable row level security;

-- No policies are created for either table: combined with the revokes below,
-- `authenticated` has literally no grant on them (not even SELECT), so RLS
-- policies would never be reached anyway. This is a deliberate, minimal
-- choice — nothing today needs a client to read "how close am I to a cap,"
-- and keeping the surface at zero avoids having to reason about a read path
-- into abuse-prevention bookkeeping. A future "storage usage" UI feature
-- would need to add an owner-scoped SELECT policy here explicitly; it is not
-- present now. Both tables are written ONLY by the SECURITY DEFINER trigger
-- functions in section 4, exactly like resume_revisions' checkpoint writes
-- in the prior migration — there is no client-writable path to either table,
-- so a client cannot spoof its own or another account's counters directly.
revoke all on table public.resume_limit_config, public.resume_owner_limits from anon, public, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Full JSON shape/type/enum/count/byte validation for resumes.data.
--
-- The prior migration only checked jsonb_typeof(data) = 'object' and overall
-- byte size. This mirrors src/model.ts's isResume() field-by-field, so a
-- direct API write (bypassing the app's own client-side validator entirely)
-- is held to the same shape the client enforces. `resume_data_is_valid` and
-- its helpers are plain `language sql immutable` functions (not SECURITY
-- DEFINER): Postgres grants EXECUTE on newly created functions to PUBLIC by
-- default, so `authenticated` can already evaluate them as part of the CHECK
-- constraint below with no extra grant needed — confirmed by the explicit
-- grant statement further down, which documents this instead of relying on
-- the default silently.
--
-- Two fields are deliberately tolerant of being ABSENT (not just present
-- with a lenient type check), matching src/model.ts's migrate(), which fills
-- defaults for old data rather than rejecting it as unreadable:
--   - `noExperience` (added after this table's original P0-05 launch — see
--     HANDOFF.md's "Required-step validation" session). Absent is valid;
--     when present it must be a real JSON boolean.
--   - `section.kind` (added in the same later session as noExperience).
--     Absent is valid; when present it must be 'experience' or 'optional'.
-- Every other field mirrors isResume()'s strict requirements exactly,
-- because every other field has existed since before cloud storage did, so
-- every value this constraint will ever see (going forward, once validated —
-- see the NOT VALID note below) was written by a client new enough to always
-- include them.
-- ---------------------------------------------------------------------------
create or replace function public.resume_strings_ok(data jsonb, keys text[], max_len integer)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(
    coalesce(jsonb_typeof(data -> key) = 'string' and length(data ->> key) <= max_len, false)
  ), false)
  from unnest(keys) as key
$$;

create or replace function public.resume_entry_ok(entry jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(entry) = 'object'
    and public.resume_strings_ok(entry, array['id','title','organization','location','dates','description'], 50000)
$$;

-- `jsonb_array_length`/`jsonb_array_elements` (unlike `->`/`->>`, which are
-- null-safe for any input type) RAISE an error if their argument is not
-- actually a JSON array. Plain SQL boolean AND/OR in Postgres is NOT
-- guaranteed to short-circuit left-to-right (see "Expression Evaluation
-- Rules" in the Postgres docs, which explicitly recommends CASE for that
-- guarantee) — so `jsonb_typeof(x)='array' and jsonb_array_length(x)<=n`
-- can still evaluate the right-hand side even when the left is false,
-- turning a malformed `entries`/`sections` field (e.g. a client sending a
-- string or object there) into an uncaught internal error instead of the
-- clean, catchable 23514 check-violation this constraint exists to produce.
-- Every array-length/array-elements use below is therefore inside a CASE
-- WHEN branch (which IS guaranteed to short-circuit), never bare AND.
create or replace function public.resume_section_ok(section jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(section) = 'object'
    and public.resume_strings_ok(section, array['id','title'], 50000)
    and coalesce((section -> 'kind' is null or (section ->> 'kind') in ('experience','optional')), false)
    and case when jsonb_typeof(section -> 'entries') = 'array' then
      jsonb_array_length(section -> 'entries') <= 100
      and coalesce(
        (select bool_and(coalesce(public.resume_entry_ok(entry), false)) from jsonb_array_elements(section -> 'entries') as entry),
        true -- an empty entries array is valid (matches Array.prototype.every on [])
      )
    else false end
$$;

-- Only ever called from resume_data_is_valid's own CASE-guarded branch
-- below, which has already confirmed its argument is a JSON array.
create or replace function public.resume_sections_ok(sections jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    (select bool_and(coalesce(public.resume_section_ok(section), false)) from jsonb_array_elements(sections) as section),
    true -- an empty sections array is valid, same reasoning as above
  )
  -- The editor addresses sections and entries in one shared ID namespace.
  -- Match isResume(): duplicates anywhere in the document are invalid.
  and (select count(*) = count(distinct id) from (
    select section ->> 'id' as id from jsonb_array_elements(sections) as section
    union all
    select entry ->> 'id' as id
    from jsonb_array_elements(sections) as section
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(section -> 'entries') = 'array'
        then section -> 'entries' else '[]'::jsonb end
    ) as entry
  ) as document_ids)
$$;

create or replace function public.resume_data_is_valid(data jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(data) = 'object'
    -- Text comparison only, deliberately no ::numeric cast: `->>` always
    -- returns text (or NULL) for any JSON value with no risk of erroring,
    -- and the jsonb_typeof check alone already distinguishes a real JSON
    -- number 1 from a same-looking JSON string "1".
    and jsonb_typeof(data -> 'version') = 'number' and (data ->> 'version') = '1'
    and public.resume_strings_ok(data, array['name','headline','email','phone','location','website','summary','skills'], 50000)
    and public.resume_strings_ok(data, array['profileHeading','skillsHeading'], 200)
    and (data ->> 'template') in ('modern','classic','minimal')
    and (data ->> 'paper') in ('A4','Letter')
    and (data ->> 'direction') in ('ltr','rtl')
    and (data ->> 'accent') ~ '^#[0-9a-fA-F]{6}$'
    and (data ->> 'language') ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$'
    and (data -> 'noExperience' is null or jsonb_typeof(data -> 'noExperience') = 'boolean')
    and case when jsonb_typeof(data -> 'sections') = 'array' then
      jsonb_array_length(data -> 'sections') <= 30
      and public.resume_sections_ok(data -> 'sections')
    else false end
$$;

grant execute on function
  public.resume_strings_ok(jsonb, text[], integer),
  public.resume_entry_ok(jsonb),
  public.resume_section_ok(jsonb),
  public.resume_sections_ok(jsonb),
  public.resume_data_is_valid(jsonb)
  to authenticated;

-- NOT VALID: enforced on every new INSERT/UPDATE from the moment this
-- migration is applied, but existing rows are NOT scanned/validated now.
-- Per this task's instruction not to perform destructive cleanup or apply
-- unverified constraints to hosted data sight-unseen: an operator must run
--   select id, owner_id from public.resumes where not public.resume_data_is_valid(data);
-- against the real hosted table first, resolve or consciously accept any
-- rows it finds, and only then run
--   alter table public.resumes validate constraint resumes_data_shape_valid;
-- as a separate, deliberate step. That step has NOT been performed by this
-- change (this migration itself has also not been applied to any hosted
-- project — see docs/CLOUD_LIMITS_REVIEW.md). Until VALIDATE CONSTRAINT
-- runs, this is still a real, active constraint for all new writes; it only
-- skips the historical backfill scan.
alter table public.resumes
  add constraint resumes_data_shape_valid
  check (public.resume_data_is_valid(data) is true)
  not valid;

-- resume_revisions.data is never checked separately: it is only ever
-- populated by resumes_write_checkpoint's trigger copy of new.data (a
-- SECURITY DEFINER AFTER trigger from the prior migration, unchanged here),
-- which only runs once the same-statement CHECK constraints on `resumes`
-- (including the one just added) have already passed for that exact value.
-- A second copy of the same CHECK here would be redundant.

-- ---------------------------------------------------------------------------
-- 4. Enforcement: reject once a cap is reached, never delete history.
--
-- Both functions use `coalesce(auth.uid(), new.owner_id)` — never bare
-- new.owner_id — as the account identity charged for this write. This is
-- deliberate and closes a real spoofing gap, not defensive-programming
-- decoration: Postgres fires multiple BEFORE ROW triggers for the same event
-- in alphabetical order by trigger name, and resumes_enforce_owner_limits
-- would otherwise run BEFORE the prior migration's resumes_set_revision
-- trigger (which is what actually forces new.owner_id back to old.owner_id
-- on UPDATE). Row Level Security's own WITH CHECK only inspects the FINAL
-- row after every BEFORE trigger has run, so it can't see or block an
-- in-between value. Without this coalesce, a direct API request could PATCH
-- its own resume row (satisfying `USING (owner_id = auth.uid())`) while
-- setting `owner_id` to a *different* account's id in the request body; the
-- resumes_set_revision trigger would still silently correct the row's real,
-- persisted owner_id back to the caller's own before the row is written —
-- so the save itself would succeed correctly-owned either way — but this
-- function, read naively, would have already charged the spoofed id's
-- rate-limit/history bucket instead of the real caller's, letting an
-- attacker write for free while corrupting another account's counters.
-- auth.uid() is read from the verified JWT, not any client-supplied column,
-- and cannot be spoofed independent of holding a different session. See the
-- "spoof counters" pgTAP test in supabase/tests/resume_storage_bounds.test.sql
-- for the concrete before/after proof. (The `new.owner_id` fallback only
-- matters when auth.uid() is null, i.e. a privileged/service-role/superuser
-- write with no JWT claim set — a context that already bypasses RLS, so it
-- is strictly more trusted than `authenticated` and is not a client-reachable
-- path.)
--
-- A rejected write raises and rolls back the whole statement, including any
-- tentative change this same trigger invocation made — Postgres statement
-- atomicity guarantees a rejected write consumes no rate-limit budget and
-- writes no checkpoint, not just "mostly" or "usually". All three checks
-- below run as pure reads against already-fetched values before anything is
-- written, and the rate-limit window's own row is only persisted after every
-- check has passed, so there is nothing to unwind even in principle.
-- ---------------------------------------------------------------------------
create or replace function public.resumes_enforce_owner_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid := coalesce(auth.uid(), new.owner_id);
  cfg public.resume_limit_config%rowtype;
  st public.resume_owner_limits%rowtype;
  effective_window_started timestamptz;
  effective_window_count integer;
  new_bytes bigint := octet_length(new.data::text);
begin
  select * into cfg from public.resume_limit_config where id = true;
  if not found then
    raise exception 'resume_limit_config is missing its singleton row (server misconfiguration)';
  end if;

  insert into public.resume_owner_limits (owner_id) values (owner)
  on conflict (owner_id) do nothing;

  -- FOR UPDATE locks this owner's counter row for the rest of the
  -- transaction. Concurrent saves for the SAME account additionally already
  -- serialize at the `resumes` row-lock level (both a same-account UPDATE
  -- and the unique owner_id constraint on INSERT force a second concurrent
  -- writer to wait for the first to commit or roll back before its own
  -- BEFORE triggers even run), so this lock is belt-and-suspenders rather
  -- than the only thing preventing a lost update here.
  select * into st from public.resume_owner_limits where owner_id = owner for update;

  if now() - st.rate_window_started_at > make_interval(secs => cfg.rate_window_seconds) then
    effective_window_started := now();
    effective_window_count := 0;
  else
    effective_window_started := st.rate_window_started_at;
    effective_window_count := st.rate_window_count;
  end if;

  if effective_window_count >= cfg.max_writes_per_window then
    raise exception
      'Save rate limit reached: at most % saves per % seconds are accepted per account. Wait a moment and try again; if this persists outside normal editing, contact support@resumestride.com.',
      cfg.max_writes_per_window, cfg.rate_window_seconds
      using errcode = 'P0001';
  end if;

  if st.lifetime_revision_count + 1 > cfg.max_revisions_per_owner then
    raise exception
      'Account save-history limit reached (% saved checkpoints). Existing history is kept, not deleted. Export a backup and contact support@resumestride.com to keep saving.',
      cfg.max_revisions_per_owner
      using errcode = 'P0001';
  end if;

  if st.lifetime_revision_bytes + new_bytes > cfg.max_revision_bytes_per_owner then
    raise exception
      'Account save-history storage limit reached (% bytes across all saved checkpoints). Existing history is kept, not deleted. Export a backup and contact support@resumestride.com to keep saving.',
      cfg.max_revision_bytes_per_owner
      using errcode = 'P0001';
  end if;

  update public.resume_owner_limits
  set rate_window_started_at = effective_window_started,
      rate_window_count = effective_window_count + 1
  where owner_id = owner;

  return new;
end;
$$;

revoke execute on function public.resumes_enforce_owner_limits() from public, anon, authenticated;

drop trigger if exists resumes_enforce_owner_limits_trigger on public.resumes;
create trigger resumes_enforce_owner_limits_trigger
  before insert or update on public.resumes
  for each row execute function public.resumes_enforce_owner_limits();

-- Records the checkpoint this write is about to produce (or, for a row that
-- ultimately fails a later constraint such as resumes_data_shape_valid,
-- would have produced — but per the atomicity note above, that failure rolls
-- this back too, so it is never actually counted). Separate from the prior
-- migration's resumes_write_checkpoint trigger/table by design: this only
-- maintains the small owner-level counters used for enforcement above, and
-- deliberately does not touch resume_revisions itself.
create or replace function public.resumes_track_owner_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid := coalesce(auth.uid(), new.owner_id);
begin
  insert into public.resume_owner_limits (owner_id, lifetime_revision_count, lifetime_revision_bytes)
  values (owner, 1, octet_length(new.data::text))
  on conflict (owner_id) do update
    set lifetime_revision_count = resume_owner_limits.lifetime_revision_count + 1,
        lifetime_revision_bytes = resume_owner_limits.lifetime_revision_bytes + excluded.lifetime_revision_bytes;
  return new;
end;
$$;

revoke execute on function public.resumes_track_owner_limits() from public, anon, authenticated;

drop trigger if exists resumes_track_owner_limits_trigger on public.resumes;
create trigger resumes_track_owner_limits_trigger
  after insert or update on public.resumes
  for each row execute function public.resumes_track_owner_limits();
