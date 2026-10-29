-- 0004: INSERT ... RETURNING on game_accounts was rejected (42501) because the SELECT
-- policy called can_view_account(id), a STABLE function: it runs with the statement's
-- starting snapshot and cannot see the row being inserted. Policies on game_accounts
-- now test the row's own columns first and only consult account_members for sharing.

create or replace function public.is_member(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.account_members m where m.account_id = acct and m.user_id = auth.uid());
$$;

drop policy "accounts: read members+public" on public.game_accounts;
create policy "accounts: read members+public" on public.game_accounts
  for select to anon, authenticated
  using (visibility = 'public' or user_id = auth.uid() or public.is_member(id));

drop policy "accounts: owner update" on public.game_accounts;
create policy "accounts: owner update" on public.game_accounts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy "accounts: owner delete" on public.game_accounts;
create policy "accounts: owner delete" on public.game_accounts
  for delete to authenticated using (user_id = auth.uid());

-- Keep the helpers consistent with "user_id is the owner" (used by other tables' policies).
create or replace function public.can_view_account(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_accounts a
                 where a.id = acct and (a.visibility = 'public' or a.user_id = auth.uid()))
      or public.is_member(acct);
$$;

create or replace function public.is_account_owner(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_accounts a where a.id = acct and a.user_id = auth.uid());
$$;

create or replace function public.can_edit_account(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_account_owner(acct)
      or exists (select 1 from public.account_members m
                 where m.account_id = acct and m.user_id = auth.uid() and m.role = 'editor');
$$;

-- start_verification used gen_random_bytes(), which lives in the `extensions` schema on
-- Supabase and is not on the pinned search_path. gen_random_uuid() is built in.
create or replace function public.start_verification(acct uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  new_code := 'GHQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.verification_challenges (account_id, user_id, code)
  values (acct, auth.uid(), new_code)
  on conflict (account_id, user_id) do update
    set code = excluded.code, expires_at = now() + interval '24 hours', created_at = now();
  return new_code;
end $$;
