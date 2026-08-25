-- ═══════════════════════════════════════════════════════════════════════════
-- 040 — Centralize agent identity on profiles (brokerage + photo).
--
-- WHY: agent identity is currently scattered and mostly unpersisted.
--   • profiles.dre    — EXISTS already, written once at signup
--                       (api/auth/beta-signup), then never viewable or
--                       editable anywhere. Surfaced in Settings by this change.
--   • brokerage       — had NO home at all. Sign Studio collects it into
--                       ephemeral React state and throws it away on unmount,
--                       and its profile prefill query already SELECTs a
--                       `brokerage` column that does not exist — so that query
--                       400s on every Sign Studio load today and silently
--                       kills the whole prefill block (name/phone/dre included).
--                       Adding the column here fixes that bug as a side effect.
--   • photo_url       — new; agent headshot for the seller-report trust stamp.
--
-- STRICTLY ADDITIVE: two nullable columns and one new storage bucket. No
-- existing column is altered, no data is rewritten, no policy is replaced.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Columns. Both nullable with no default: an agent who has not filled
-- these in reads back NULL, and every consumer degrades gracefully on NULL
-- rather than rendering an empty label.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists brokerage text,
  add column if not exists photo_url text;

comment on column public.profiles.brokerage is
  'Agent brokerage name (e.g. Compass, KW, eXp). Nullable — omit from UI when null.';

comment on column public.profiles.photo_url is
  'Public URL of the agent headshot in the agent-photos storage bucket. Nullable — omit from UI when null.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — agent-photos storage bucket.
--
-- A separate bucket rather than reusing property-photos: these are images of a
-- PERSON, not a listing, with a different lifecycle (one per agent, replaced in
-- place, never cascade-deleted with a property). Mixing them would make the
-- per-listing cleanup paths in the properties UI capable of deleting an agent's
-- headshot.
--
-- Config mirrors property-photos (005) exactly: public read, 10 MiB cap, same
-- image mime allowlist. Files live at {userId}/{filename} — the same
-- user-id-first path convention 005 uses, which is what the ownership policies
-- below key on.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'agent-photos',
    'agent-photos',
    true,
    10485760,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']
  )
  on conflict (id) do nothing;


-- Each policy is dropped first so this whole file is safely re-runnable:
-- PostgreSQL has no `create policy if not exists`, and a duplicate would raise
-- 42710 and halt the script mid-file, leaving later policies uncreated.

-- Public read — the headshot renders on the unauthenticated seller report.
drop policy if exists "agent_photos_storage_select" on storage.objects;
create policy "agent_photos_storage_select"
  on storage.objects for select
  using (bucket_id = 'agent-photos');

-- Upload restricted to the agent's OWN folder.
--
-- NOTE — deliberate divergence from 005: property-photos' insert policy is just
-- `auth.role() = 'authenticated'`, which lets any signed-in user write anywhere
-- in that bucket. That is too loose for a per-agent identity asset (one agent
-- could overwrite another's headshot), and the requirement here is explicitly
-- "only the owning agent can upload/replace their own". So this reuses the
-- path-ownership idiom 005 already established in its DELETE policy rather than
-- inventing a new one — same expression, applied to insert/update as well.
drop policy if exists "agent_photos_storage_insert" on storage.objects;
create policy "agent_photos_storage_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'agent-photos'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Replace-in-place (upsert) needs UPDATE, scoped identically.
drop policy if exists "agent_photos_storage_update" on storage.objects;
create policy "agent_photos_storage_update"
  on storage.objects for update
  using (
    bucket_id = 'agent-photos'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  )
  with check (
    bucket_id = 'agent-photos'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Same ownership rule for delete, matching 005's delete policy shape.
drop policy if exists "agent_photos_storage_delete" on storage.objects;
create policy "agent_photos_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'agent-photos'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );
