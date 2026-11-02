-- 0008: admins can claim any account (any game, with or without a UID, verified or not)
-- without the in-game signature check. The previous owner stays on the account as an
-- editor and gets a notice. Admins can also list every account to find ones without a UID.

create or replace function public.admin_claim_account(acct uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  prev uuid;
  acct_name text;
  me uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Only admins can claim accounts without verification';
  end if;
  select user_id, name into prev, acct_name from public.game_accounts where id = acct;
  if prev is null then
    raise exception 'Account not found';
  end if;
  if prev = me then
    return 'already yours';
  end if;
  update public.account_members set role = 'editor' where account_id = acct and role = 'owner';
  insert into public.account_members (account_id, user_id, role) values (acct, prev, 'editor')
  on conflict (account_id, user_id) do nothing;
  insert into public.account_members (account_id, user_id, role) values (acct, me, 'owner')
  on conflict (account_id, user_id) do update set role = 'owner';
  update public.game_accounts set user_id = me where id = acct;
  insert into public.notices (user_id, message)
  values (prev, 'An admin took ownership of your account “' || acct_name || '”. You are still an editor on it.');
  return 'claimed';
end $$;

-- Every account with its owner, for the admin section of the Claim page.
create or replace function public.admin_list_accounts()
returns table (id uuid, game_id text, name text, uid text, owner_name text, mine boolean, verified boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.game_id, a.name, a.uid, p.display_name, (a.user_id = auth.uid()), (a.verified_at is not null)
  from public.game_accounts a join public.profiles p on p.id = a.user_id
  where public.is_admin()
  order by a.game_id, p.display_name, a.name;
$$;

revoke execute on function public.admin_claim_account(uuid) from anon, public;
revoke execute on function public.admin_list_accounts() from anon, public;
grant execute on function public.admin_claim_account(uuid), public.admin_list_accounts() to authenticated;
