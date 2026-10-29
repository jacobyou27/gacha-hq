-- 0003: account sharing (owner / editor / viewer), public accounts, one record per
-- in-game UID, in-game signature verification (Enka.Network) with takeover, notices.
--
-- Access model after this migration:
--   owner   full control: edit account, characters, members, visibility, delete.
--   editor  edit characters (account_characters) only.
--   viewer  read-only.
--   public  visibility = 'public' → anyone (even signed out) can READ the account and
--           its character rows at /p/<id>. Editing still needs membership.
-- game_accounts.user_id stays "the current owner" and is kept in sync with the
-- owner row in account_members.

-- ---------------------------------------------------------------------------
-- enums + columns
-- ---------------------------------------------------------------------------
create type public.account_role as enum ('owner', 'editor', 'viewer');
create type public.account_visibility as enum ('private', 'public');

alter table public.game_accounts
  add column visibility   public.account_visibility not null default 'private',
  add column verified_at  timestamptz,
  add column verified_by  uuid references public.profiles (id) on delete set null;

-- Treat empty UID as null, then enforce one account record per (game, uid).
update public.game_accounts set uid = null where uid = '';
alter table public.game_accounts
  add constraint game_accounts_uid_not_blank check (uid is null or length(trim(uid)) > 0);
create unique index game_accounts_game_uid_key
  on public.game_accounts (game_id, uid) where uid is not null;

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table public.account_members (
  account_id uuid not null references public.game_accounts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.account_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id);

-- Backfill: every existing account's user_id is its owner.
insert into public.account_members (account_id, user_id, role)
select id, user_id, 'owner' from public.game_accounts
on conflict do nothing;

-- New accounts get an owner membership automatically.
create or replace function public.add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.account_members (account_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (account_id, user_id) do update set role = 'owner';
  return new;
end $$;

create trigger game_accounts_add_owner
  after insert on public.game_accounts
  for each row execute function public.add_owner_membership();

-- ---------------------------------------------------------------------------
-- verification challenges + notices
-- ---------------------------------------------------------------------------
create table public.verification_challenges (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.game_accounts (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade, -- who is proving
  code        text not null,                                                    -- what to put in the in-game signature
  expires_at  timestamptz not null default now() + interval '24 hours',
  created_at  timestamptz not null default now(),
  unique (account_id, user_id)
);

create table public.notices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  message    text not null,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notices_user_idx on public.notices (user_id, read_at);

-- ---------------------------------------------------------------------------
-- helper functions (security definer so RLS policies can use them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.account_role(acct uuid)
returns public.account_role language sql stable security definer set search_path = public as $$
  select role from public.account_members where account_id = acct and user_id = auth.uid();
$$;

create or replace function public.can_view_account(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_accounts a where a.id = acct and a.visibility = 'public')
      or exists (select 1 from public.account_members m where m.account_id = acct and m.user_id = auth.uid());
$$;

create or replace function public.can_edit_account(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_members m
                 where m.account_id = acct and m.user_id = auth.uid() and m.role in ('owner', 'editor'));
$$;

create or replace function public.is_account_owner(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_members m
                 where m.account_id = acct and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- Owner-only membership management. Invite by email (the person must already have signed up).
create or replace function public.invite_member(acct uuid, member_email text, member_role public.account_role)
returns text language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if not public.is_account_owner(acct) then
    raise exception 'Only the owner can invite members';
  end if;
  if member_role = 'owner' then
    raise exception 'Use "Transfer ownership" to make someone the owner';
  end if;
  select id into target from auth.users where lower(email) = lower(trim(member_email));
  if target is null then
    raise exception 'No user with that email has signed up yet';
  end if;
  if target = auth.uid() then
    raise exception 'You already own this account';
  end if;
  insert into public.account_members (account_id, user_id, role)
  values (acct, target, member_role)
  on conflict (account_id, user_id) do update set role = excluded.role;
  insert into public.notices (user_id, message)
  values (target, 'You were added as ' || member_role || ' on an account: ' ||
                  (select g.name || ' · ' || a.name from public.game_accounts a join public.games g on g.id = a.game_id where a.id = acct));
  return 'ok';
end $$;

create or replace function public.remove_member(acct uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_account_owner(acct) or member = auth.uid()) then
    raise exception 'Only the owner can remove members';
  end if;
  if exists (select 1 from public.account_members where account_id = acct and user_id = member and role = 'owner') then
    raise exception 'The owner cannot be removed; transfer ownership first';
  end if;
  delete from public.account_members where account_id = acct and user_id = member;
end $$;

create or replace function public.transfer_ownership(acct uuid, new_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_account_owner(acct) then
    raise exception 'Only the owner can transfer ownership';
  end if;
  update public.account_members set role = 'editor' where account_id = acct and role = 'owner';
  insert into public.account_members (account_id, user_id, role) values (acct, new_owner, 'owner')
  on conflict (account_id, user_id) do update set role = 'owner';
  update public.game_accounts set user_id = new_owner where id = acct;
end $$;

-- Members list with display names (profiles are otherwise private).
create or replace function public.account_member_list(acct uuid)
returns table (user_id uuid, display_name text, role public.account_role)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.display_name, m.role
  from public.account_members m join public.profiles p on p.id = m.user_id
  where m.account_id = acct and public.can_view_account(acct)
  order by m.role, p.display_name;
$$;

-- Verification: create or refresh a challenge code for (account, me). Allowed for any
-- signed-in user, so someone can prove ownership of a UID claimed by another person.
create or replace function public.start_verification(acct uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  new_code := 'GHQ-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  insert into public.verification_challenges (account_id, user_id, code)
  values (acct, auth.uid(), new_code)
  on conflict (account_id, user_id) do update
    set code = excluded.code, expires_at = now() + interval '24 hours', created_at = now();
  return new_code;
end $$;

-- Look up an account by game + uid even if you can't see it (returns only id, owner name, visibility).
create or replace function public.find_account_by_uid(p_game_id text, p_uid text)
returns table (id uuid, owner_name text, visibility public.account_visibility, mine boolean, verified boolean)
language sql stable security definer set search_path = public as $$
  select a.id, p.display_name, a.visibility, (a.user_id = auth.uid()), (a.verified_at is not null)
  from public.game_accounts a join public.profiles p on p.id = a.user_id
  where a.game_id = p_game_id and a.uid = trim(p_uid);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.account_members         enable row level security;
alter table public.verification_challenges enable row level security;
alter table public.notices                 enable row level security;

-- game_accounts: replace the owner-only policy.
drop policy "accounts: owner" on public.game_accounts;
create policy "accounts: read members+public" on public.game_accounts
  for select to anon, authenticated using (public.can_view_account(id));
create policy "accounts: insert own" on public.game_accounts
  for insert to authenticated with check (user_id = auth.uid());
create policy "accounts: owner update" on public.game_accounts
  for update to authenticated using (public.is_account_owner(id)) with check (public.is_account_owner(id));
create policy "accounts: owner delete" on public.game_accounts
  for delete to authenticated using (public.is_account_owner(id));

-- account_characters: viewers/public read, editors+owners write.
drop policy "account_characters: owner" on public.account_characters;
create policy "account_characters: read" on public.account_characters
  for select to anon, authenticated using (public.can_view_account(account_id));
create policy "account_characters: write" on public.account_characters
  for insert to authenticated with check (public.can_edit_account(account_id));
create policy "account_characters: update" on public.account_characters
  for update to authenticated using (public.can_edit_account(account_id)) with check (public.can_edit_account(account_id));
create policy "account_characters: delete" on public.account_characters
  for delete to authenticated using (public.can_edit_account(account_id));

-- public pages also need the game + character reference rows.
create policy "games: public read"      on public.games      for select to anon using (true);
create policy "characters: public read" on public.characters for select to anon using (true);

-- members: readable by members; all writes go through the functions above.
create policy "members: read" on public.account_members
  for select to authenticated using (public.can_view_account(account_id));

-- challenges: only your own.
create policy "challenges: own" on public.verification_challenges
  for select to authenticated using (user_id = auth.uid());

-- notices: own; can mark read.
create policy "notices: read own"   on public.notices for select to authenticated using (user_id = auth.uid());
create policy "notices: update own" on public.notices for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Functions are callable by signed-in users only (anon only needs the read policies).
revoke execute on function public.invite_member(uuid, text, public.account_role) from anon, public;
revoke execute on function public.remove_member(uuid, uuid) from anon, public;
revoke execute on function public.transfer_ownership(uuid, uuid) from anon, public;
revoke execute on function public.start_verification(uuid) from anon, public;
revoke execute on function public.find_account_by_uid(text, text) from anon, public;
grant execute on function public.invite_member(uuid, text, public.account_role),
                         public.remove_member(uuid, uuid),
                         public.transfer_ownership(uuid, uuid),
                         public.start_verification(uuid),
                         public.find_account_by_uid(text, text) to authenticated;
