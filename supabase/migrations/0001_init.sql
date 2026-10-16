-- Flying Cars Life — initial schema (CLAUDE.md §6).
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Every table has Row Level Security enabled. The service role (edge functions) bypasses RLS.

set search_path = public, extensions;

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- admins  (add rows by hand in the SQL editor; never writable from the client)
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admins enable row level security;

-- SECURITY DEFINER so policies can call it without recursing through admins' own RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

drop policy if exists "admins: user can see own admin row" on public.admins;
create policy "admins: user can see own admin row"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Usernames are public (shown on leaderboards).
drop policy if exists "profiles: public read" on public.profiles;
create policy "profiles: public read"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Auto-create a profile on sign-up with a unique placeholder username the player can change.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'player_' || substr(replace(new.id::text, '-', ''), 1, 12))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- saves  (one cloud save per player)
-- ---------------------------------------------------------------------------

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now(),
  constraint saves_data_size check (pg_column_size(data) < 1048576) -- 1 MB cap
);

alter table public.saves enable row level security;

drop trigger if exists saves_set_updated_at on public.saves;
create trigger saves_set_updated_at
  before update on public.saves
  for each row execute function public.set_updated_at();

drop policy if exists "saves: read own" on public.saves;
create policy "saves: read own"
  on public.saves for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "saves: insert own" on public.saves;
create policy "saves: insert own"
  on public.saves for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "saves: update own" on public.saves;
create policy "saves: update own"
  on public.saves for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "saves: delete own" on public.saves;
create policy "saves: delete own"
  on public.saves for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- leaderboard
-- NOTE: players write their own scores, so values are client-trusted.
-- If cheating becomes a problem, drop the insert/update policies and write via an edge function.
-- ---------------------------------------------------------------------------

create table if not exists public.leaderboard (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('richest', 'deliveries', 'license_time')),
  value numeric not null check (value >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create index if not exists leaderboard_category_value_idx
  on public.leaderboard (category, value desc);

alter table public.leaderboard enable row level security;

drop trigger if exists leaderboard_set_updated_at on public.leaderboard;
create trigger leaderboard_set_updated_at
  before update on public.leaderboard
  for each row execute function public.set_updated_at();

drop policy if exists "leaderboard: public read" on public.leaderboard;
create policy "leaderboard: public read"
  on public.leaderboard for select
  to anon, authenticated
  using (true);

drop policy if exists "leaderboard: insert own" on public.leaderboard;
create policy "leaderboard: insert own"
  on public.leaderboard for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "leaderboard: update own" on public.leaderboard;
create policy "leaderboard: update own"
  on public.leaderboard for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ad_slots
-- ---------------------------------------------------------------------------

create table if not exists public.ad_slots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  kind text not null check (kind in ('billboard', 'bus_stop', 'sky_lane')),
  price_per_day numeric(10, 2) not null check (price_per_day >= 0),
  active boolean not null default true
);

alter table public.ad_slots enable row level security;

drop policy if exists "ad_slots: public read" on public.ad_slots;
create policy "ad_slots: public read"
  on public.ad_slots for select
  to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "ad_slots: admin insert" on public.ad_slots;
create policy "ad_slots: admin insert"
  on public.ad_slots for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "ad_slots: admin update" on public.ad_slots;
create policy "ad_slots: admin update"
  on public.ad_slots for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "ad_slots: admin delete" on public.ad_slots;
create policy "ad_slots: admin delete"
  on public.ad_slots for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- ad_bookings
-- Created by the booking edge function (service role), never directly by the client.
-- Status moves: pending_payment -> pending_review (payment webhook) -> approved | rejected (admin)
--               -> expired (after end_date, or unpaid for 30 min).
-- ---------------------------------------------------------------------------

create table if not exists public.ad_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.ad_slots (id) on delete restrict,
  advertiser_email text not null check (advertiser_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  image_url text not null,
  link_url text check (link_url is null or link_url ~* '^https://'),
  start_date date not null,
  end_date date not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'pending_review', 'approved', 'rejected', 'expired')),
  payment_ref text unique,
  created_at timestamptz not null default now(),
  constraint ad_bookings_dates check (end_date >= start_date),
  -- A slot can't be double-booked for overlapping dates while a booking is live.
  constraint ad_bookings_no_overlap exclude using gist (
    slot_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending_payment', 'pending_review', 'approved'))
);

create index if not exists ad_bookings_status_idx on public.ad_bookings (status);

alter table public.ad_bookings enable row level security;

-- Only admins read the raw table (it holds advertiser emails). The game reads `active_ads` below.
drop policy if exists "ad_bookings: admin read" on public.ad_bookings;
create policy "ad_bookings: admin read"
  on public.ad_bookings for select
  to authenticated
  using (public.is_admin());

drop policy if exists "ad_bookings: admin update" on public.ad_bookings;
create policy "ad_bookings: admin update"
  on public.ad_bookings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Public, email-free view of approved ads that are live today.
-- Runs with the owner's rights on purpose, so anon can read it without seeing the table.
create or replace view public.active_ads
with (security_invoker = false)
as
  select b.id as booking_id, b.slot_id, s.name as slot_name, s.district, s.kind,
         b.image_url, b.link_url, b.start_date, b.end_date
  from public.ad_bookings b
  join public.ad_slots s on s.id = b.slot_id
  where b.status = 'approved'
    and s.active
    and current_date between b.start_date and b.end_date;

revoke all on public.active_ads from public, anon, authenticated;
grant select on public.active_ads to anon, authenticated;

-- Housekeeping: expire finished and abandoned bookings. Called by edge functions (or pg_cron).
create or replace function public.expire_ad_bookings()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.ad_bookings
     set status = 'expired'
   where (status = 'approved' and end_date < current_date)
      or (status = 'pending_payment' and created_at < now() - interval '30 minutes');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_ad_bookings() from public, anon, authenticated;
grant execute on function public.expire_ad_bookings() to service_role;

-- ---------------------------------------------------------------------------
-- ad_stats_daily
-- Written only by the impressions edge function (batched, max once per minute per client).
-- ---------------------------------------------------------------------------

create table if not exists public.ad_stats_daily (
  booking_id uuid not null references public.ad_bookings (id) on delete cascade,
  day date not null,
  impressions int not null default 0 check (impressions >= 0),
  clicks int not null default 0 check (clicks >= 0),
  primary key (booking_id, day)
);

alter table public.ad_stats_daily enable row level security;

drop policy if exists "ad_stats_daily: admin read" on public.ad_stats_daily;
create policy "ad_stats_daily: admin read"
  on public.ad_stats_daily for select
  to authenticated
  using (public.is_admin());

-- Atomic increment used by the edge function. Ignores bookings that aren't currently approved.
create or replace function public.record_ad_stats(
  p_booking_id uuid,
  p_impressions int,
  p_clicks int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_impressions < 0 or p_clicks < 0 then
    raise exception 'counts must be non-negative';
  end if;

  if not exists (
    select 1 from public.ad_bookings
    where id = p_booking_id and status = 'approved'
  ) then
    return;
  end if;

  insert into public.ad_stats_daily (booking_id, day, impressions, clicks)
  values (p_booking_id, current_date, p_impressions, p_clicks)
  on conflict (booking_id, day) do update
    set impressions = public.ad_stats_daily.impressions + excluded.impressions,
        clicks      = public.ad_stats_daily.clicks + excluded.clicks;
end;
$$;

revoke all on function public.record_ad_stats(uuid, int, int) from public, anon, authenticated;
grant execute on function public.record_ad_stats(uuid, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for approved ad creatives.
-- Uploads go through signed upload URLs issued by the booking edge function,
-- so no client insert policy is needed.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-images', 'ad-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Optional: run expiry hourly with pg_cron (enable it under Database → Extensions first).
-- select cron.schedule('expire-ad-bookings', '0 * * * *', $$select public.expire_ad_bookings()$$);
-- ---------------------------------------------------------------------------
