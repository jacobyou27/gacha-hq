-- Full stamina planner (port of the Resin / TP / Battery planner sheets).
-- Replaces the goal-list MVP (farm_goals / farm_log) with builds, inventory and a daily log.

-- per-character farming attributes (Genshin: talent book series, boss drop, weekly mat, specialty, common drop;
-- HSR: trace-mat family, boss mat, weekly mat, cost profile; ZZZ: chip family, expert / notorious mats …)
alter table public.characters add column if not exists farm jsonb not null default '{}'::jsonb;

drop trigger if exists farm_log_sync on public.farm_log;
drop function if exists public.sync_goal_done();
drop table if exists public.farm_log;
drop table if exists public.farm_goals;

-- one row per character build on an account (the same character may appear twice: a later row for later goals)
create table public.farm_builds (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.game_accounts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  priority     int not null default 999,
  inputs       jsonb not null default '{}'::jsonb,   -- game-specific: levels, talents, weapon … (see src/lib/farm)
  deadline     date,
  banner       text,                                 -- "7.2 Phase 1" — resolved against game_versions
  done         boolean not null default false,
  notes        text,
  counted_at   timestamptz not null default now(),   -- logged runs before this stamp no longer count (levels changed)
  created_at   timestamptz not null default now()
);
create index farm_builds_account_idx on public.farm_builds (account_id, done, priority);
alter table public.farm_builds enable row level security;
create policy "farm_builds: view" on public.farm_builds for select to authenticated using (public.can_view_account(account_id));
create policy "farm_builds: edit" on public.farm_builds for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

-- what the account owns: kind = mora | wit | adv | wand | solvent | bookT | bookG | bookP | wpn2..wpn5 | boss | wk (Genshin) …
create table public.farm_inventory (
  account_id uuid not null references public.game_accounts (id) on delete cascade,
  kind       text not null,
  key        text not null default '',
  qty        numeric not null default 0,
  primary key (account_id, kind, key)
);
alter table public.farm_inventory enable row level security;
create policy "farm_inventory: view" on public.farm_inventory for select to authenticated using (public.can_view_account(account_id));
create policy "farm_inventory: edit" on public.farm_inventory for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

-- daily check-in: one row per build per day (or one "(skipped)" / "(nothing farmed)" row)
create table public.farm_days (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.game_accounts (id) on delete cascade,
  day          date not null,
  build_id     uuid references public.farm_builds (id) on delete set null,
  character    text not null default '',             -- name at log time ("(skipped)", "(nothing farmed)")
  status       text not null default 'done' check (status in ('done', 'skipped')),
  runs         jsonb not null default '{}'::jsonb,   -- {weekly, weekly_boss, weekly_cost, book, wpn, boss, wit, mora} (Genshin) …
  drops        jsonb not null default '{}'::jsonb,   -- what you actually got (optional; blank = average)
  stamina_left int not null default 0,
  text         text not null default '',
  logged_at    timestamptz not null default now()
);
create index farm_days_account_idx on public.farm_days (account_id, day desc);
alter table public.farm_days enable row level security;
create policy "farm_days: view" on public.farm_days for select to authenticated using (public.can_view_account(account_id));
create policy "farm_days: edit" on public.farm_days for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

-- game calendar anchors used for banner deadlines and the Stygian week
insert into public.game_versions (game_id, version, starts_on)
values ('genshin', '7.1', '2026-09-22'), ('hsr', '4.6', '2026-09-28'), ('zzz', '3.3', '2026-10-21'), ('wuwa', '3.7', '2026-09-30')
on conflict do nothing;

-- game-wide farming events: overflow weeks (double drops; 3 doubled runs = 60 resin a day), set by admins
create table public.farm_events (
  id        uuid primary key default gen_random_uuid(),
  game_id   text not null references public.games (id) on delete cascade,
  kind      text not null check (kind in ('overflow_artifacts', 'overflow_ley', 'overflow_domain')),
  starts_on date not null,
  ends_on   date not null,
  note      text
);
alter table public.farm_events enable row level security;
create policy "farm_events: read"  on public.farm_events for select to anon, authenticated using (true);
create policy "farm_events: admin" on public.farm_events for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.farm_events (game_id, kind, starts_on, ends_on, note) values ('genshin', 'overflow_artifacts', '2026-10-26', '2026-11-01', 'from the Resin Planner sheet');
