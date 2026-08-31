create table public.encrypted_private_key_bundles (
  auth_user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  principal_id text not null unique check (principal_id ~ '^cp_[A-Za-z0-9_-]{20,64}$'),
  bundle jsonb not null,
  state text not null default 'pending_drive' check (state in ('pending_drive', 'active')),
  recovery_epoch integer not null check (recovery_epoch > 0),
  unwrap_fingerprint text not null,
  signing_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint encrypted_private_key_bundle_identity_matches check (
    bundle ->> 'format' = 'famnesia-encrypted-private-key'
    and (bundle ->> 'version')::integer = 1
    and bundle ->> 'principalId' = principal_id
    and (bundle ->> 'recoveryEpoch')::integer = recovery_epoch
    and bundle ->> 'unwrapFingerprint' = unwrap_fingerprint
    and bundle ->> 'signingFingerprint' = signing_fingerprint
  )
);

alter table public.encrypted_private_key_bundles enable row level security;
alter table public.encrypted_private_key_bundles force row level security;

create policy encrypted_private_key_bundles_select_own
on public.encrypted_private_key_bundles for select to authenticated
using (auth.uid() = auth_user_id);

create policy encrypted_private_key_bundles_insert_own
on public.encrypted_private_key_bundles for insert to authenticated
with check (auth.uid() = auth_user_id and state = 'pending_drive');

create policy encrypted_private_key_bundles_delete_pending_own
on public.encrypted_private_key_bundles for delete to authenticated
using (auth.uid() = auth_user_id and state = 'pending_drive');

create function public.guard_private_key_bundle_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.auth_user_id <> old.auth_user_id
     or new.principal_id <> old.principal_id
     or new.bundle <> old.bundle
     or new.recovery_epoch <> old.recovery_epoch
     or new.unwrap_fingerprint <> old.unwrap_fingerprint
     or new.signing_fingerprint <> old.signing_fingerprint
     or old.state <> 'pending_drive'
     or new.state <> 'active' then
    raise exception 'PRIVATE_KEY_BUNDLE_IMMUTABLE';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger encrypted_private_key_bundle_guard
before update on public.encrypted_private_key_bundles
for each row execute function public.guard_private_key_bundle_update();

create policy encrypted_private_key_bundles_activate_own
on public.encrypted_private_key_bundles for update to authenticated
using (auth.uid() = auth_user_id and state = 'pending_drive')
with check (auth.uid() = auth_user_id and state = 'active');

create function public.activate_private_key_bundle(expected_principal_id text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.encrypted_private_key_bundles
  set state = 'active'
  where auth_user_id = auth.uid()
    and principal_id = expected_principal_id
    and state = 'pending_drive';

  if not found then
    raise exception 'PRIVATE_KEY_BUNDLE_NOT_PENDING';
  end if;
end;
$$;

revoke all on public.encrypted_private_key_bundles from public, anon;
grant select, insert, update, delete on public.encrypted_private_key_bundles to authenticated;
revoke all on function public.activate_private_key_bundle(text) from public, anon;
grant execute on function public.activate_private_key_bundle(text) to authenticated;
revoke all on function public.guard_private_key_bundle_update() from public, anon, authenticated;

comment on table public.encrypted_private_key_bundles is
  'Encrypted browser-generated private-key material only. Recovery secret is never stored here.';
comment on column public.encrypted_private_key_bundles.bundle is
  'Ciphertext envelope and public metadata; never plaintext private keys or Drive recovery secret.';
