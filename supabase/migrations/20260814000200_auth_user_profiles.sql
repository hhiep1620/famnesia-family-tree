create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and length(trim(new.email)) > 0 then
    insert into public.user_profiles (id, email, display_name, avatar_url)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
      coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
    )
    on conflict (id) do update set
      email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url;
  end if;
  return new;
end;
$$;

create trigger auth_users_provision_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

comment on function public.handle_new_auth_user() is
  'Provision identity metadata only; workspace creation and authorization remain explicit.';
