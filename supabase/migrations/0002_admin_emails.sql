-- Admin allow-list. The emails themselves live only in the database (this repo is public).
-- To add an admin, run in the Supabase SQL Editor:
--   insert into public.admin_emails (email) values ('someone@example.com');
--   update public.profiles p set is_admin = true from auth.users u
--     where u.id = p.id and lower(u.email) = 'someone@example.com';  -- if they already signed up

create table if not exists public.admin_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_emails enable row level security;
-- No policies on purpose: only the SQL editor / security-definer functions can read it.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    exists (select 1 from public.admin_emails a where a.email = lower(new.email))
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Promote anyone already registered who is on the list.
update public.profiles p set is_admin = true
from auth.users u
where u.id = p.id and lower(u.email) in (select email from public.admin_emails);
