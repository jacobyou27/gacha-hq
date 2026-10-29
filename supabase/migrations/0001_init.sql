-- Gacha HQ — core schema (v1)
-- Run this whole file once in Supabase → SQL Editor (or `supabase db push`).
--
-- Shape:
--   profiles           one row per signed-in user (auto-created)
--   games              reference: Genshin / HSR / ZZZ / WuWa (shared, read-only)
--   characters         reference: master character list per game (shared; admins edit)
--   game_accounts      a user's in-game accounts (main, pastel, joint, ...)
--   account_characters what each account has / wants for each character
--
-- Everything a user owns is protected by row-level security (RLS) keyed on
-- auth.uid(), so the browser can talk to Supabase directly and only ever see
-- its own rows. Reference tables are readable by every signed-in user.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  is_admin     boolean not null default false,   -- may edit games/characters
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Used inside RLS policies. SECURITY DEFINER so it can read profiles without recursion.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- games (reference)
-- ---------------------------------------------------------------------------
create table public.games (
  id               text primary key,          -- 'genshin' | 'hsr' | 'zzz' | 'wuwa'
  name             text not null,             -- 'Genshin' (never 'GI' / 'Genshin Impact')
  sort_order       int  not null default 0,
  -- stamina model, so every planner can share one table
  stamina_name     text not null,             -- Resin / Trailblaze Power / Battery / Waveplate
  stamina_per_day  int  not null,             -- 180 / 240 / 240 / 240
  stamina_cap      int  not null,             -- 200 / 300 / 240 / 240
  -- vocabulary differences between games
  dupe_label       text not null,             -- Constellation / Eidolon / Mindscape / Sequence
  weapon_label     text not null,             -- Weapon / Light Cone / W-Engine / Weapon
  class_label      text not null,             -- Weapon type / Path / Specialty / Weapon type
  element_label    text not null,             -- Element / Type (combat) / Attribute / Attribute
  max_dupes        int  not null default 6,
  max_level        int  not null,             -- 90 / 80 / 60 / 90
  -- version calendar: first known version start + cadence in days (null = irregular)
  version_anchor      text,                    -- e.g. '7.1'
  version_anchor_date date,
  version_length_days int,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- characters (reference / master list)
-- ---------------------------------------------------------------------------
create table public.characters (
  id            uuid primary key default gen_random_uuid(),
  game_id       text not null references public.games (id) on delete cascade,
  name          text not null,
  rarity        int  not null check (rarity between 1 and 5),   -- 5★/4★ (ZZZ S=5, A=4)
  element       text,                                             -- Pyro / Ice / Attribute...
  weapon_type   text,                                             -- Sword / Path / Specialty
  version       text,                                             -- '1.0', '7.1' (release)
  is_limited    boolean not null default true,  -- true = counts toward pulls (not standard banner / free)
  is_free       boolean not null default false, -- Traveler, Trailblazer, Rover, event giveaways
  is_released   boolean not null default true,  -- false = leaked / upcoming
  image_url     text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (game_id, name)
);

create index characters_game_idx on public.characters (game_id, name);
create trigger characters_updated_at before update on public.characters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- game_accounts (user-owned)
-- ---------------------------------------------------------------------------
create type public.account_status as enum ('active', 'paused', 'dropped');

create table public.game_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     text not null references public.games (id) on delete cascade,
  name        text not null,                  -- 'main', 'pastel', 'joint', ...
  server      text,                           -- 'Asia', 'America', 'Europe', 'TW/HK/MO'
  uid         text,                           -- in-game UID (optional)
  status      public.account_status not null default 'active',
  world_level int,                            -- WL / Equilibrium / Inter-Knot / Union level
  color       text,                           -- hex, for UI tags
  sort_order  int not null default 0,
  notes       text,
  -- Per-game planner settings that are not worth a column yet
  -- (bank cap, days off, weekly-boss day, budget caps, ...). Validate in app code.
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, game_id, name)
);

create index game_accounts_user_idx on public.game_accounts (user_id, game_id, sort_order);
create trigger game_accounts_updated_at before update on public.game_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- account_characters (user-owned via the account)
--   One row per (account, character) the user cares about. Mirrors the roster
--   sheet's Have / Goal / Want / Free columns plus a build level for planners.
-- ---------------------------------------------------------------------------
create table public.account_characters (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.game_accounts (id) on delete cascade,
  character_id  uuid not null references public.characters (id) on delete cascade,
  owned         boolean not null default false,
  dupes         int not null default 0 check (dupes >= 0),       -- C0..C6 (0 = base copy)
  goal_dupes    int check (goal_dupes is null or goal_dupes >= 0),
  wanted        boolean not null default false,                   -- planning to pull on this account
  free_copies   int not null default 0 check (free_copies >= 0), -- copies that cost no pulls
  level         int,                                              -- current level
  goal_level    int,
  priority      int not null default 0,                           -- planner order (lower = first)
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id, character_id)
);

create index account_characters_account_idx on public.account_characters (account_id);
create trigger account_characters_updated_at before update on public.account_characters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.games              enable row level security;
alter table public.characters         enable row level security;
alter table public.game_accounts      enable row level security;
alter table public.account_characters enable row level security;

-- profiles: you can see and edit your own; admins can see everyone.
create policy "profiles: read own"   on public.profiles for select using (id = auth.uid() or public.is_admin());
-- (is_admin can only be changed in the Supabase dashboard / SQL editor, never from the app)
create policy "profiles: update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and is_admin = public.is_admin());

-- reference tables: every signed-in user reads; admins write.
create policy "games: read"  on public.games for select to authenticated using (true);
create policy "games: admin" on public.games for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "characters: read"  on public.characters for select to authenticated using (true);
create policy "characters: admin" on public.characters for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- game_accounts: owner only.
create policy "accounts: owner" on public.game_accounts
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- account_characters: owner of the parent account.
create policy "account_characters: owner" on public.account_characters
  for all to authenticated
  using (exists (select 1 from public.game_accounts a where a.id = account_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.game_accounts a where a.id = account_id and a.user_id = auth.uid()));
