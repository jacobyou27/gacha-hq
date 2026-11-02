-- 0009: income bookkeeping + primogem forecast.
-- income_items: shared catalog of every primogem / fate source per version (events, quests, exploration, web / mail,
-- and the per-version averages of repeating income). Admins edit it; seed: supabase/seed_genshin_income.sql.
-- account_income_items: per account, which catalog items are done / skipped / still to do.
-- Per-account forecast settings live in game_accounts.settings -> 'income' (jsonb), like the planner settings.

create table if not exists public.income_items (
  id          uuid primary key default gen_random_uuid(),
  game_id     text not null references public.games (id) on delete cascade,
  version     text not null,
  seq         int  not null,                 -- order inside the version (sheet row order)
  section     text not null check (section in ('event', 'new', 'web', 'recurring')),
  kind        text not null check (kind in ('event', 'archon', 'story', 'world', 'exploration', 'endgame', 'other', 'web', 'recurring')),
  name        text not null,
  primos      numeric not null default 0,
  intertwined numeric not null default 0,    -- limited-banner fates (count as pulls)
  acquaint    numeric not null default 0,    -- standard-banner fates
  resin       numeric not null default 0,
  mora        numeric not null default 0,
  extra       jsonb   not null default '{}', -- other resources (exp books, talent books, …)
  minutes     int,                           -- rough time to complete (estimate)
  requires    text[]  not null default '{}', -- other items of the same game as 'version:name'
  is_estimate boolean not null default false,
  note        text,
  unique (game_id, version, seq)
);
create index if not exists income_items_game_idx on public.income_items (game_id, version);

create table if not exists public.account_income_items (
  account_id uuid not null references public.game_accounts (id) on delete cascade,
  item_id    uuid not null references public.income_items (id) on delete cascade,
  status     text not null check (status in ('done', 'skip', 'todo')),
  updated_at timestamptz not null default now(),
  primary key (account_id, item_id)
);

alter table public.income_items enable row level security;
alter table public.account_income_items enable row level security;
create policy "income items: read"  on public.income_items for select to authenticated using (true);
create policy "income items: admin" on public.income_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "account income: view" on public.account_income_items for select to authenticated using (public.can_view_account(account_id));
create policy "account income: edit" on public.account_income_items for all to authenticated
  using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));
