-- 0005: schema for the pull planner, money calculator, leak-friendly characters,
-- per-user character wants, friends, and stamina-planner MVP.
-- (The one-off data import from the Gacha Roster sheet is NOT in the repo: it
-- contains account/roster data and was run directly in the SQL editor.)

-- ---------------------------------------------------------------------------
-- games: per-game vocabulary + economics (admin-editable)
-- ---------------------------------------------------------------------------
alter table public.games
  add column if not exists dupe_prefix        text not null default 'C',   -- C / E / M / S  (C2R1 notation)
  add column if not exists sig_prefix         text not null default 'R',   -- R / S / W / R
  add column if not exists old_before_version text,                        -- versions before this are one "Old" cost group
  add column if not exists avg_pulls_per_copy numeric not null default 94, -- expected pulls per limited 5★ copy (50/50 included)
  add column if not exists usd_per_pull       numeric not null default 1.98,
  add column if not exists monthly_pass_usd   numeric not null default 4.99,
  add column if not exists monthly_pass_pulls numeric not null default 18.75, -- (90×30 + 300) / 160
  add column if not exists battle_pass_usd    numeric not null default 9.99,
  add column if not exists battle_pass_pulls  numeric not null default 5,
  add column if not exists bundle_100_pulls   numeric not null default 50.5, -- 8080 gems / 160
  add column if not exists bundle_100_first_pulls numeric not null default 81, -- first-time double bonus
  add column if not exists free_pulls_per_version numeric not null default 60; -- rough f2p income per 42-day version

-- ---------------------------------------------------------------------------
-- characters: leak-friendly fields
-- ---------------------------------------------------------------------------
alter table public.characters
  add column if not exists region       text,
  add column if not exists release_date date,
  add column if not exists source       text;   -- 'official' | 'leak' | free text (where the info came from)

-- ---------------------------------------------------------------------------
-- account_characters: signature weapon counts + want level
-- ---------------------------------------------------------------------------
alter table public.account_characters
  add column if not exists signature      int not null default 0 check (signature >= 0),  -- R1 / S1 / W1 owned
  add column if not exists goal_signature int check (goal_signature is null or goal_signature >= 0),
  add column if not exists want_level     text;  -- 'High' / 'Medium' / 'Low' (free text from the sheet)

-- ---------------------------------------------------------------------------
-- character_wants: per-user "Game want" (Want / Kinda Want / Okay With / Never)
-- ---------------------------------------------------------------------------
create table if not exists public.character_wants (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  want         text not null check (want in ('Want', 'Kinda Want', 'Okay With', 'Never')),
  note         text,          -- e.g. which accounts you'd want them on
  updated_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);
alter table public.character_wants enable row level security;
create policy "wants: own" on public.character_wants for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- spending: one plan row per account per year + a purchase log
-- ---------------------------------------------------------------------------
create table if not exists public.spend_plans (
  account_id            uuid not null references public.game_accounts (id) on delete cascade,
  year                  int  not null,
  monthly_pass          boolean not null default false,  -- Welkin / Express Pass / Inter-Knot Membership / Lunite
  monthly_pass_months   int not null default 12,
  battle_pass           boolean not null default false,
  battle_pass_count     int not null default 6,          -- per year (one per version ≈ 8–9; user adjusts)
  bundles_planned       int not null default 0,          -- extra $100 top-up bundles intended
  pull_blocks_planned   int not null default 0,          -- "allotted X extra pulls, costing a fixed amount win or lose"
  pull_block_usd        numeric not null default 300,
  pull_block_pulls      int not null default 150,
  budget_usd            numeric,                         -- optional hard cap for the year
  notes                 text,
  updated_at            timestamptz not null default now(),
  primary key (account_id, year)
);
alter table public.spend_plans enable row level security;
create policy "spend_plans: view"  on public.spend_plans for select to authenticated using (public.can_view_account(account_id));
create policy "spend_plans: edit"  on public.spend_plans for all    to authenticated using (public.is_account_owner(account_id)) with check (public.is_account_owner(account_id));

create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.game_accounts (id) on delete cascade,
  bought_on   date not null default current_date,
  kind        text not null check (kind in ('monthly_pass', 'battle_pass', 'bundle', 'pull_block', 'other')),
  amount_usd  numeric not null default 0,
  pulls       numeric not null default 0,   -- pulls (or pull-equivalents) this bought
  note        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists purchases_account_idx on public.purchases (account_id, bought_on);
alter table public.purchases enable row level security;
create policy "purchases: view" on public.purchases for select to authenticated using (public.can_view_account(account_id));
create policy "purchases: edit" on public.purchases for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

-- ---------------------------------------------------------------------------
-- version calendar + banners (shared reference, admin-edited)
-- ---------------------------------------------------------------------------
create table if not exists public.game_versions (
  game_id     text not null references public.games (id) on delete cascade,
  version     text not null,
  starts_on   date,
  ends_on     date,
  is_estimate boolean not null default true,
  primary key (game_id, version)
);
create table if not exists public.banners (
  id           uuid primary key default gen_random_uuid(),
  game_id      text not null references public.games (id) on delete cascade,
  version      text not null,
  phase        int  not null default 1,
  character_id uuid not null references public.characters (id) on delete cascade,
  is_rerun     boolean not null default false,
  is_estimate  boolean not null default true,
  unique (game_id, version, phase, character_id)
);
alter table public.game_versions enable row level security;
alter table public.banners enable row level security;
create policy "versions: read"  on public.game_versions for select to anon, authenticated using (true);
create policy "versions: admin" on public.game_versions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "banners: read"   on public.banners for select to anon, authenticated using (true);
create policy "banners: admin"  on public.banners for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- friends
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;
create policy "friends: involved read" on public.friendships for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "friends: request" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid());
create policy "friends: accept" on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "friends: remove" on public.friendships for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Send a request by email (the person must have signed up).
create or replace function public.friend_request(friend_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from auth.users where lower(email) = lower(trim(friend_email));
  if target is null then raise exception 'No user with that email has signed up yet'; end if;
  if target = auth.uid() then raise exception 'That is you'; end if;
  -- if they already asked us, accept instead
  if exists (select 1 from public.friendships where requester_id = target and addressee_id = auth.uid()) then
    update public.friendships set status = 'accepted' where requester_id = target and addressee_id = auth.uid();
    return 'accepted';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (auth.uid(), target)
  on conflict do nothing;
  insert into public.notices (user_id, message)
  values (target, (select display_name from public.profiles where id = auth.uid()) || ' sent you a friend request.');
  return 'requested';
end $$;
revoke execute on function public.friend_request(text) from anon, public;
grant execute on function public.friend_request(text) to authenticated;

-- Friends list with names + what they share with me (public accounts or ones I'm a member of).
create or replace function public.friend_list()
returns table (user_id uuid, display_name text, status text, direction text)
language sql stable security definer set search_path = public as $$
  select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as user_id,
         p.display_name, f.status,
         case when f.requester_id = auth.uid() then 'sent' else 'received' end as direction
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
  order by f.status, p.display_name;
$$;
revoke execute on function public.friend_list() from anon, public;
grant execute on function public.friend_list() to authenticated;

-- Accounts owned by a given user that I'm allowed to see (public, or shared with me).
create or replace function public.visible_accounts_of(owner uuid)
returns setof public.game_accounts
language sql stable security definer set search_path = public as $$
  select a.* from public.game_accounts a
  where a.user_id = owner and (a.visibility = 'public' or public.is_member(a.id))
  order by a.game_id, a.sort_order, a.name;
$$;
revoke execute on function public.visible_accounts_of(uuid) from anon, public;
grant execute on function public.visible_accounts_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- stamina planner MVP
-- ---------------------------------------------------------------------------
-- Per-account settings live in game_accounts.settings (jsonb): stamina_per_day override,
-- fuel (fragile resin / fuel count), bank_cap, days_off, start_date.
create table if not exists public.farm_goals (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.game_accounts (id) on delete cascade,
  character_id    uuid references public.characters (id) on delete cascade,
  label           text,                         -- free text when not tied to a character (e.g. "artifacts")
  stamina_needed  int not null default 0,       -- total stamina still needed for this goal
  stamina_done    int not null default 0,
  priority        int not null default 0,
  done            boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists farm_goals_account_idx on public.farm_goals (account_id, done, priority);
alter table public.farm_goals enable row level security;
create policy "farm_goals: view" on public.farm_goals for select to authenticated using (public.can_view_account(account_id));
create policy "farm_goals: edit" on public.farm_goals for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

create table if not exists public.farm_log (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.game_accounts (id) on delete cascade,
  day         date not null default current_date,
  goal_id     uuid references public.farm_goals (id) on delete set null,
  stamina     int not null default 0,          -- stamina spent that day on that goal
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists farm_log_account_idx on public.farm_log (account_id, day);
alter table public.farm_log enable row level security;
create policy "farm_log: view" on public.farm_log for select to authenticated using (public.can_view_account(account_id));
create policy "farm_log: edit" on public.farm_log for all    to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));

-- Keep farm_goals.stamina_done in sync with the log.
create or replace function public.sync_goal_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  g := coalesce(new.goal_id, old.goal_id);
  if g is not null then
    update public.farm_goals fg
       set stamina_done = coalesce((select sum(stamina) from public.farm_log where goal_id = g), 0),
           done = coalesce((select sum(stamina) from public.farm_log where goal_id = g), 0) >= fg.stamina_needed and fg.stamina_needed > 0
     where fg.id = g;
  end if;
  if tg_op = 'UPDATE' and old.goal_id is distinct from new.goal_id and old.goal_id is not null then
    update public.farm_goals fg
       set stamina_done = coalesce((select sum(stamina) from public.farm_log where goal_id = old.goal_id), 0)
     where fg.id = old.goal_id;
  end if;
  return null;
end $$;
drop trigger if exists farm_log_sync on public.farm_log;
create trigger farm_log_sync after insert or update or delete on public.farm_log
  for each row execute function public.sync_goal_done();

-- game economics defaults for the four games
update public.games set dupe_prefix='C', sig_prefix='R', old_before_version='6.0' where id='genshin';
update public.games set dupe_prefix='E', sig_prefix='S', old_before_version='3.0', monthly_pass_pulls=18.75, battle_pass_pulls=5 where id='hsr';
update public.games set dupe_prefix='M', sig_prefix='W', old_before_version='2.0', monthly_pass_pulls=18.75, battle_pass_pulls=5 where id='zzz';
update public.games set dupe_prefix='S', sig_prefix='R', old_before_version='2.0', monthly_pass_usd=4.99, monthly_pass_pulls=18.75 where id='wuwa';
