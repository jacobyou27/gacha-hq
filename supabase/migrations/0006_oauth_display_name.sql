-- Google (and other OAuth) sign-ups carry the name as full_name / name, not display_name.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    ),
    exists (select 1 from public.admin_emails a where a.email = lower(new.email))
  )
  on conflict (id) do nothing;
  return new;
end $$;
