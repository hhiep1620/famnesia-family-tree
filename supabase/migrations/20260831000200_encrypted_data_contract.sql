create extension if not exists pgcrypto with schema extensions;

create type public.crypto_migration_state as enum ('parallel', 'preview_ready', 'canonical', 'blocked');
create type public.encrypted_entity_class as enum ('family_profile', 'person_core', 'relationship', 'media_manifest');
create type public.private_field_class as enum ('phone', 'email', 'address', 'private_note');
create type public.encrypted_key_purpose as enum ('workspace', 'contact', 'media');
create type public.policy_authorization_purpose as enum ('contact_view', 'contact_edit', 'portability_export');
create type public.crypto_invitation_state as enum ('pending', 'consumed', 'revoked', 'expired');
create type public.backup_capability_state as enum ('active', 'consumed', 'revoked', 'expired');

create unique index encrypted_private_key_bundles_identity_pair_unique
  on public.encrypted_private_key_bundles(auth_user_id, principal_id);

create table public.crypto_principals (
  principal_id text primary key check (principal_id ~ '^cp_[A-Za-z0-9_-]{20,64}$'),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  unwrap_public_key jsonb not null,
  unwrap_fingerprint text not null unique check (unwrap_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  signing_public_key jsonb not null,
  signing_fingerprint text not null unique check (signing_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  recovery_epoch integer not null check (recovery_epoch > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id, principal_id),
  constraint crypto_principals_key_purposes_separate check (unwrap_fingerprint <> signing_fingerprint),
  constraint crypto_principals_active_bundle_fk foreign key (auth_user_id, principal_id)
    references public.encrypted_private_key_bundles(auth_user_id, principal_id) on delete cascade
);

create table public.workspace_crypto_states (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  crypto_version integer not null default 1 check (crypto_version = 1),
  encrypted_schema_version integer not null default 1 check (encrypted_schema_version = 1),
  key_epoch integer not null default 1 check (key_epoch > 0),
  data_version bigint not null default 1 check (data_version > 0),
  directory_revision bigint not null default 1 check (directory_revision > 0),
  policy_revision bigint not null default 1 check (policy_revision > 0),
  graph_revision bigint not null default 1 check (graph_revision > 0),
  binding_revision bigint not null default 1 check (binding_revision > 0),
  migration_state public.crypto_migration_state not null default 'parallel',
  updated_at timestamptz not null default now()
);

create table public.workspace_principal_directory (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  directory_revision bigint not null check (directory_revision > 0),
  enrolled_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (workspace_id, principal_id),
  unique (workspace_id, auth_user_id),
  constraint workspace_directory_member_fk foreign key (workspace_id, auth_user_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade,
  constraint workspace_directory_principal_identity_fk foreign key (auth_user_id, principal_id)
    references public.crypto_principals(auth_user_id, principal_id) on delete restrict,
  constraint workspace_directory_revocation_order check (revoked_at is null or revoked_at >= enrolled_at)
);

create function public.encrypted_envelope_matches(
  candidate jsonb,
  expected_workspace_id uuid,
  expected_entity_id text,
  expected_field_class text,
  expected_data_version bigint,
  expected_key_id text,
  expected_key_epoch integer,
  expected_writer_id text,
  expected_purpose text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(candidate) = 'object'
    and candidate ?& array['version','suite','nonce','ciphertext','aad']
    and candidate - array['version','suite','nonce','ciphertext','aad']::text[] = '{}'::jsonb
    and candidate ->> 'version' = '1'
    and candidate ->> 'suite' = 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1'
    and candidate ->> 'nonce' ~ '^[A-Za-z0-9_-]{16}$'
    and candidate ->> 'ciphertext' ~ '^[A-Za-z0-9_-]{22,}$'
    and jsonb_typeof(candidate -> 'aad') = 'object'
    and (candidate -> 'aad') ?& array['workspaceId','entityId','fieldClass','schemaVersion','dataVersion','keyId','keyEpoch','writerId','purpose']
    and (candidate -> 'aad') - array['workspaceId','entityId','fieldClass','schemaVersion','dataVersion','keyId','keyEpoch','writerId','purpose']::text[] = '{}'::jsonb
    and candidate -> 'aad' ->> 'workspaceId' = expected_workspace_id::text
    and candidate -> 'aad' ->> 'entityId' = expected_entity_id
    and candidate -> 'aad' ->> 'fieldClass' = expected_field_class
    and candidate -> 'aad' ->> 'schemaVersion' = '1'
    and (candidate -> 'aad' ->> 'dataVersion')::bigint = expected_data_version
    and candidate -> 'aad' ->> 'keyId' = expected_key_id
    and (candidate -> 'aad' ->> 'keyEpoch')::integer = expected_key_epoch
    and candidate -> 'aad' ->> 'writerId' = expected_writer_id
    and candidate -> 'aad' ->> 'purpose' = expected_purpose,
    false
  );
$$;

create table public.encrypted_entities (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  entity_id text not null check (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  field_class public.encrypted_entity_class not null,
  row_version bigint not null check (row_version > 0),
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_epoch integer not null check (key_epoch > 0),
  writer_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, entity_id, field_class),
  constraint encrypted_entities_envelope_matches check (
    public.encrypted_envelope_matches(envelope, workspace_id, entity_id, field_class::text,
      row_version, key_id, key_epoch, writer_principal_id, 'family-content')
  )
);

create table public.encrypted_private_fields (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  person_id text not null check (person_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  field_class public.private_field_class not null,
  row_version bigint not null check (row_version > 0),
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_epoch integer not null check (key_epoch > 0),
  writer_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, person_id, field_class),
  constraint encrypted_private_fields_envelope_matches check (
    public.encrypted_envelope_matches(envelope, workspace_id, person_id, field_class::text,
      row_version, key_id, key_epoch, writer_principal_id, 'contact')
  )
);

create table public.encrypted_key_envelopes (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  envelope_id text not null check (envelope_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  entity_id text not null check (entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  key_purpose public.encrypted_key_purpose not null,
  key_epoch integer not null check (key_epoch > 0),
  directory_revision bigint not null check (directory_revision > 0),
  recipient_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  recipient_unwrap_fingerprint text not null,
  issuer_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  issuer_signing_fingerprint text not null,
  wrapped_envelope jsonb not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, envelope_id),
  unique (workspace_id, key_id, key_purpose, key_epoch, recipient_principal_id),
  constraint encrypted_key_envelope_recipient_directory_fk foreign key (workspace_id, recipient_principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete cascade,
  constraint encrypted_key_envelope_issuer_directory_fk foreign key (workspace_id, issuer_principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete restrict,
  constraint encrypted_key_envelope_shape check (
    coalesce(jsonb_typeof(wrapped_envelope) = 'object'
      and wrapped_envelope ->> 'version' = '1'
      and wrapped_envelope ->> 'suite' = 'FAMNESIA-P256-AESGCM-HKDF-SHA256-V1'
      and wrapped_envelope ?& array['version','suite','context','ephemeralPublicKey','salt','nonce','wrappedKey','issuerSignature']
      and wrapped_envelope - array['version','suite','context','ephemeralPublicKey','salt','nonce','wrappedKey','issuerSignature']::text[] = '{}'::jsonb
      and jsonb_typeof(wrapped_envelope -> 'context') = 'object'
      and (wrapped_envelope -> 'context') ?& array['envelopeId','workspaceId','entityId','recipientPrincipalId','recipientKeyFingerprint','keyId','keyPurpose','keyEpoch','directoryRevision','issuerPrincipalId','issuerSigningFingerprint','expiresAt']
      and (wrapped_envelope -> 'context') - array['envelopeId','workspaceId','entityId','recipientPrincipalId','recipientKeyFingerprint','keyId','keyPurpose','keyEpoch','directoryRevision','issuerPrincipalId','issuerSigningFingerprint','expiresAt']::text[] = '{}'::jsonb
      and wrapped_envelope -> 'context' ->> 'envelopeId' = envelope_id
      and wrapped_envelope -> 'context' ->> 'workspaceId' = workspace_id::text
      and wrapped_envelope -> 'context' ->> 'entityId' = entity_id
      and wrapped_envelope -> 'context' ->> 'keyId' = key_id
      and wrapped_envelope -> 'context' ->> 'keyPurpose' = key_purpose::text
      and (wrapped_envelope -> 'context' ->> 'keyEpoch')::integer = key_epoch
      and (wrapped_envelope -> 'context' ->> 'directoryRevision')::bigint = directory_revision
      and wrapped_envelope -> 'context' ->> 'recipientPrincipalId' = recipient_principal_id
      and wrapped_envelope -> 'context' ->> 'recipientKeyFingerprint' = recipient_unwrap_fingerprint
      and wrapped_envelope -> 'context' ->> 'issuerPrincipalId' = issuer_principal_id
      and wrapped_envelope -> 'context' ->> 'issuerSigningFingerprint' = issuer_signing_fingerprint, false)
  )
);

create table public.signed_policy_authorizations (
  authorization_id text primary key check (authorization_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  actor_principal_id text not null references public.crypto_principals(principal_id) on delete cascade,
  person_id text,
  field_class public.private_field_class,
  purpose public.policy_authorization_purpose not null,
  policy_revision bigint not null check (policy_revision > 0),
  graph_revision bigint not null check (graph_revision > 0),
  binding_revision bigint not null check (binding_revision > 0),
  key_epoch integer not null check (key_epoch > 0),
  nonce_hash text not null unique check (nonce_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  artifact jsonb not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint signed_policy_contact_scope check (
    (purpose in ('contact_view', 'contact_edit') and person_id is not null and field_class is not null)
    or (purpose = 'portability_export' and person_id is null and field_class is null)
  ),
  constraint signed_policy_expiry check (expires_at > verified_at)
);

create table public.authorization_nonce_ledger (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  nonce_hash text not null check (nonce_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  authorization_id text not null references public.signed_policy_authorizations(authorization_id) on delete restrict,
  consumed_by_commit_id text not null,
  consumed_by_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  consumed_at timestamptz not null default now(),
  primary key (workspace_id, nonce_hash)
);

create table public.crypto_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  invited_email_hash text not null check (invited_email_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  token_hash text not null unique check (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  artifact_hash text not null check (artifact_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  state public.crypto_invitation_state not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint crypto_invitation_lifecycle check (
    (state = 'consumed' and consumed_at is not null) or (state <> 'consumed' and consumed_at is null)
  )
);

create table public.opaque_backup_capabilities (
  capability_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  state public.backup_capability_state not null default 'active',
  reauthenticated_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint opaque_backup_capability_ttl check (
    expires_at > reauthenticated_at and expires_at <= reauthenticated_at + interval '10 minutes'
  ),
  constraint opaque_backup_capability_lifecycle check (
    (state = 'consumed' and consumed_at is not null) or (state <> 'consumed' and consumed_at is null)
  )
);

create table public.opaque_backup_audit (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  capability_id uuid references public.opaque_backup_capabilities(capability_id) on delete set null,
  status text not null check (status in ('issued', 'completed', 'rejected')),
  entity_count integer not null default 0 check (entity_count >= 0),
  private_field_count integer not null default 0 check (private_field_count >= 0),
  envelope_count integer not null default 0 check (envelope_count >= 0),
  created_at timestamptz not null default now()
);

create table public.encrypted_commits (
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  commit_id text not null check (commit_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  actor_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  request_checksum text not null check (request_checksum ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  request_payload jsonb not null,
  base_data_version bigint not null,
  result_data_version bigint not null,
  operation_count integer not null check (operation_count between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (workspace_id, commit_id)
);

create index encrypted_entities_workspace_version_idx on public.encrypted_entities(workspace_id, row_version);
create index encrypted_private_fields_workspace_person_idx on public.encrypted_private_fields(workspace_id, person_id);
create index encrypted_key_envelopes_recipient_idx on public.encrypted_key_envelopes(recipient_principal_id, workspace_id) where revoked_at is null;
create index signed_policy_authorizations_actor_idx on public.signed_policy_authorizations(actor_principal_id, workspace_id, expires_at) where revoked_at is null;

create function public.current_crypto_principal(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select directory.principal_id
  from public.workspace_principal_directory directory
  where directory.workspace_id = target_workspace_id
    and directory.auth_user_id = (select auth.uid())
    and directory.revoked_at is null
  limit 1;
$$;

create function public.register_crypto_principal(
  p_principal_id text,
  p_unwrap_public_key jsonb,
  p_unwrap_fingerprint text,
  p_signing_public_key jsonb,
  p_signing_fingerprint text,
  p_recovery_epoch integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.encrypted_private_key_bundles bundle
    where bundle.auth_user_id = actor_id and bundle.principal_id = p_principal_id
      and bundle.state = 'active' and bundle.recovery_epoch = p_recovery_epoch
      and bundle.unwrap_fingerprint = p_unwrap_fingerprint
      and bundle.signing_fingerprint = p_signing_fingerprint
      and bundle.bundle -> 'unwrapPublicKey' = p_unwrap_public_key
      and bundle.bundle -> 'signingPublicKey' = p_signing_public_key
  ) then
    raise exception 'ACTIVE_PRIVATE_KEY_BUNDLE_REQUIRED' using errcode = '42501';
  end if;

  insert into public.crypto_principals (
    principal_id, auth_user_id, unwrap_public_key, unwrap_fingerprint,
    signing_public_key, signing_fingerprint, recovery_epoch
  ) values (
    p_principal_id, actor_id, p_unwrap_public_key, p_unwrap_fingerprint,
    p_signing_public_key, p_signing_fingerprint, p_recovery_epoch
  ) on conflict (auth_user_id) do update set
    unwrap_public_key = excluded.unwrap_public_key,
    unwrap_fingerprint = excluded.unwrap_fingerprint,
    signing_public_key = excluded.signing_public_key,
    signing_fingerprint = excluded.signing_fingerprint,
    recovery_epoch = excluded.recovery_epoch,
    updated_at = now()
  where public.crypto_principals.principal_id = excluded.principal_id
    and excluded.recovery_epoch > public.crypto_principals.recovery_epoch;
  if not exists (
    select 1 from public.crypto_principals principal
    where principal.auth_user_id = actor_id and principal.principal_id = p_principal_id
      and principal.recovery_epoch = p_recovery_epoch
      and principal.unwrap_fingerprint = p_unwrap_fingerprint
      and principal.signing_fingerprint = p_signing_fingerprint
  ) then raise exception 'PRINCIPAL_REGISTRATION_CONFLICT'; end if;
end;
$$;

create function public.initialize_workspace_crypto(p_workspace_id uuid, p_principal_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := auth.uid();
begin
  if actor_id is null or not public.is_workspace_owner(p_workspace_id) then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crypto_principals where principal_id = p_principal_id and auth_user_id = actor_id) then
    raise exception 'PRINCIPAL_IDENTITY_MISMATCH' using errcode = '42501';
  end if;
  insert into public.workspace_crypto_states(workspace_id) values (p_workspace_id)
    on conflict (workspace_id) do nothing;
  insert into public.workspace_principal_directory(workspace_id, principal_id, auth_user_id, directory_revision)
    values (p_workspace_id, p_principal_id, actor_id, 1)
    on conflict (workspace_id, principal_id) do nothing;
end;
$$;

create function public.commit_encrypted_workspace(
  p_workspace_id uuid,
  p_commit_id text,
  p_request_checksum text,
  p_expected_data_version bigint,
  p_expected_key_epoch integer,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_principal text;
  state_row public.workspace_crypto_states%rowtype;
  existing_commit public.encrypted_commits%rowtype;
  operation jsonb;
  operation_type text;
  current_row_version bigint;
  authorization_record public.signed_policy_authorizations%rowtype;
  result_version bigint;
  canonical_request jsonb;
begin
  if actor_id is null or public.workspace_role(p_workspace_id) not in ('owner', 'editor') then
    raise exception 'COMMIT_ROLE_DENIED' using errcode = '42501';
  end if;
  actor_principal := public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode = '42501'; end if;
  if p_request_checksum !~ '^sha256:[A-Za-z0-9_-]{43}$' then raise exception 'INVALID_REQUEST_CHECKSUM'; end if;
  if jsonb_typeof(p_operations) <> 'array' or jsonb_array_length(p_operations) not between 1 and 500 then
    raise exception 'INVALID_OPERATION_BATCH';
  end if;
  canonical_request := jsonb_build_object(
    'workspaceId', p_workspace_id, 'baseDataVersion', p_expected_data_version,
    'keyEpoch', p_expected_key_epoch, 'operations', p_operations
  );

  select * into state_row from public.workspace_crypto_states where workspace_id = p_workspace_id for update;
  if not found then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  select * into existing_commit from public.encrypted_commits
    where workspace_id = p_workspace_id and commit_id = p_commit_id;
  if found then
    if existing_commit.request_checksum <> p_request_checksum or existing_commit.request_payload <> canonical_request
    then raise exception 'COMMIT_ID_REUSED'; end if;
    return jsonb_build_object('commitId', p_commit_id, 'dataVersion', existing_commit.result_data_version, 'idempotent', true);
  end if;
  if state_row.crypto_version <> 1 or state_row.encrypted_schema_version <> 1 then raise exception 'UNSUPPORTED_CRYPTO_STATE'; end if;
  if state_row.data_version <> p_expected_data_version then raise exception 'STALE_DATA_VERSION'; end if;
  if state_row.key_epoch <> p_expected_key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
  result_version := state_row.data_version + 1;

  for operation in select value from jsonb_array_elements(p_operations) loop
    operation_type := operation ->> 'type';
    if operation_type = 'entity_upsert' then
      if operation - array['type','entityId','fieldClass','expectedRowVersion','keyId','keyEpoch','envelope']::text[] <> '{}'::jsonb then
        raise exception 'INVALID_ENTITY_OPERATION_SHAPE';
      end if;
      if (operation ->> 'keyEpoch')::integer <> state_row.key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
      select row_version into current_row_version from public.encrypted_entities
        where workspace_id = p_workspace_id and entity_id = operation ->> 'entityId'
          and field_class = (operation ->> 'fieldClass')::public.encrypted_entity_class;
      if coalesce(current_row_version, 0) <> (operation ->> 'expectedRowVersion')::bigint then raise exception 'ROW_VERSION_CONFLICT'; end if;
      insert into public.encrypted_entities(workspace_id, entity_id, field_class, row_version, key_id, key_epoch, writer_principal_id, envelope)
      values (p_workspace_id, operation ->> 'entityId', (operation ->> 'fieldClass')::public.encrypted_entity_class,
        result_version, operation ->> 'keyId', state_row.key_epoch, actor_principal, operation -> 'envelope')
      on conflict (workspace_id, entity_id, field_class) do update set row_version = excluded.row_version,
        key_id = excluded.key_id, key_epoch = excluded.key_epoch, writer_principal_id = excluded.writer_principal_id,
        envelope = excluded.envelope, updated_at = now();
    elsif operation_type = 'entity_delete' then
      if operation - array['type','entityId','fieldClass','expectedRowVersion']::text[] <> '{}'::jsonb then raise exception 'INVALID_ENTITY_DELETE_SHAPE'; end if;
      delete from public.encrypted_entities where workspace_id = p_workspace_id
        and entity_id = operation ->> 'entityId' and field_class = (operation ->> 'fieldClass')::public.encrypted_entity_class
        and row_version = (operation ->> 'expectedRowVersion')::bigint;
      if not found then raise exception 'ROW_VERSION_CONFLICT'; end if;
    elsif operation_type in ('private_upsert', 'private_delete') then
      if operation_type = 'private_upsert'
        and operation - array['type','personId','fieldClass','expectedRowVersion','keyId','keyEpoch','authorizationId','envelope']::text[] <> '{}'::jsonb
      then raise exception 'INVALID_PRIVATE_OPERATION_SHAPE'; end if;
      if operation_type = 'private_delete'
        and operation - array['type','personId','fieldClass','expectedRowVersion','authorizationId']::text[] <> '{}'::jsonb
      then raise exception 'INVALID_PRIVATE_DELETE_SHAPE'; end if;
      select * into authorization_record from public.signed_policy_authorizations
      where authorization_id = operation ->> 'authorizationId' and workspace_id = p_workspace_id
        and actor_principal_id = actor_principal and purpose = 'contact_edit'
        and person_id = operation ->> 'personId' and field_class = (operation ->> 'fieldClass')::public.private_field_class
        and policy_revision = state_row.policy_revision and graph_revision = state_row.graph_revision
        and binding_revision = state_row.binding_revision and key_epoch = state_row.key_epoch
        and verified_at <= now() and expires_at > now() and revoked_at is null;
      if not found then raise exception 'CONTACT_AUTHORIZATION_DENIED' using errcode = '42501'; end if;
      insert into public.authorization_nonce_ledger(workspace_id, nonce_hash, authorization_id, consumed_by_commit_id, consumed_by_principal_id)
        values (p_workspace_id, authorization_record.nonce_hash, authorization_record.authorization_id, p_commit_id, actor_principal);
      select row_version into current_row_version from public.encrypted_private_fields
        where workspace_id = p_workspace_id and person_id = operation ->> 'personId'
          and field_class = (operation ->> 'fieldClass')::public.private_field_class;
      if coalesce(current_row_version, 0) <> (operation ->> 'expectedRowVersion')::bigint then raise exception 'ROW_VERSION_CONFLICT'; end if;
      if operation_type = 'private_delete' then
        delete from public.encrypted_private_fields where workspace_id = p_workspace_id
          and person_id = operation ->> 'personId' and field_class = (operation ->> 'fieldClass')::public.private_field_class;
      else
        if (operation ->> 'keyEpoch')::integer <> state_row.key_epoch then raise exception 'STALE_KEY_EPOCH'; end if;
        insert into public.encrypted_private_fields(workspace_id, person_id, field_class, row_version, key_id, key_epoch, writer_principal_id, envelope)
        values (p_workspace_id, operation ->> 'personId', (operation ->> 'fieldClass')::public.private_field_class,
          result_version, operation ->> 'keyId', state_row.key_epoch, actor_principal, operation -> 'envelope')
        on conflict (workspace_id, person_id, field_class) do update set row_version = excluded.row_version,
          key_id = excluded.key_id, key_epoch = excluded.key_epoch, writer_principal_id = excluded.writer_principal_id,
          envelope = excluded.envelope, updated_at = now();
      end if;
    elsif operation_type = 'key_envelope_insert' then
      if operation - array['type','wrappedEnvelope']::text[] <> '{}'::jsonb then raise exception 'INVALID_KEY_ENVELOPE_OPERATION_SHAPE'; end if;
      if (operation -> 'wrappedEnvelope' -> 'context' ->> 'issuerPrincipalId') <> actor_principal then raise exception 'KEY_ISSUER_MISMATCH'; end if;
      if (operation -> 'wrappedEnvelope' -> 'context' ->> 'keyEpoch')::integer <> state_row.key_epoch
        or (operation -> 'wrappedEnvelope' -> 'context' ->> 'directoryRevision')::bigint <> state_row.directory_revision
      then raise exception 'STALE_KEY_DIRECTORY'; end if;
      if not exists (select 1 from public.workspace_principal_directory where workspace_id = p_workspace_id
        and principal_id = operation -> 'wrappedEnvelope' -> 'context' ->> 'recipientPrincipalId' and revoked_at is null)
      then raise exception 'RECIPIENT_NOT_ACTIVE'; end if;
      if not exists (
        select 1 from public.crypto_principals recipient
        where recipient.principal_id = operation -> 'wrappedEnvelope' -> 'context' ->> 'recipientPrincipalId'
          and recipient.unwrap_fingerprint = operation -> 'wrappedEnvelope' -> 'context' ->> 'recipientKeyFingerprint'
      ) then raise exception 'RECIPIENT_KEY_SUBSTITUTION'; end if;
      if not exists (
        select 1 from public.crypto_principals issuer
        where issuer.principal_id = actor_principal
          and issuer.signing_fingerprint = operation -> 'wrappedEnvelope' -> 'context' ->> 'issuerSigningFingerprint'
      ) then raise exception 'ISSUER_KEY_SUBSTITUTION'; end if;
      insert into public.encrypted_key_envelopes(
        workspace_id, envelope_id, entity_id, key_id, key_purpose, key_epoch, directory_revision,
        recipient_principal_id, recipient_unwrap_fingerprint, issuer_principal_id, issuer_signing_fingerprint,
        wrapped_envelope, expires_at
      ) values (
        p_workspace_id,
        operation -> 'wrappedEnvelope' -> 'context' ->> 'envelopeId',
        operation -> 'wrappedEnvelope' -> 'context' ->> 'entityId',
        operation -> 'wrappedEnvelope' -> 'context' ->> 'keyId',
        (operation -> 'wrappedEnvelope' -> 'context' ->> 'keyPurpose')::public.encrypted_key_purpose,
        state_row.key_epoch, state_row.directory_revision,
        operation -> 'wrappedEnvelope' -> 'context' ->> 'recipientPrincipalId',
        operation -> 'wrappedEnvelope' -> 'context' ->> 'recipientKeyFingerprint',
        actor_principal,
        operation -> 'wrappedEnvelope' -> 'context' ->> 'issuerSigningFingerprint',
        operation -> 'wrappedEnvelope',
        to_timestamp((operation -> 'wrappedEnvelope' -> 'context' ->> 'expiresAt')::bigint)
      );
    else
      raise exception 'UNSUPPORTED_ENCRYPTED_OPERATION';
    end if;
  end loop;

  update public.workspace_crypto_states set data_version = result_version, updated_at = now() where workspace_id = p_workspace_id;
  insert into public.encrypted_commits(workspace_id, commit_id, actor_principal_id, request_checksum, request_payload,
    base_data_version, result_data_version, operation_count)
  values (p_workspace_id, p_commit_id, actor_principal, p_request_checksum, canonical_request,
    p_expected_data_version, result_version, jsonb_array_length(p_operations));
  return jsonb_build_object('commitId', p_commit_id, 'dataVersion', result_version, 'idempotent', false);
exception
  when unique_violation then
    if sqlerrm like '%authorization_nonce_ledger%' then raise exception 'AUTHORIZATION_REPLAY'; end if;
    raise;
end;
$$;

create function public.mint_opaque_backup_capability(
  p_workspace_id uuid, p_owner_user_id uuid, p_token_hash text,
  p_reauthenticated_at timestamptz, p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'TRUSTED_SERVER_REQUIRED' using errcode = '42501'; end if;
  if p_token_hash !~ '^sha256:[A-Za-z0-9_-]{43}$' or p_reauthenticated_at < now() - interval '5 minutes'
    or p_reauthenticated_at > now() + interval '30 seconds' or p_expires_at <= now()
  then raise exception 'INVALID_REAUTH_CAPABILITY'; end if;
  if not exists (select 1 from public.workspaces where id = p_workspace_id and owner_user_id = p_owner_user_id) then
    raise exception 'OWNER_IDENTITY_MISMATCH' using errcode = '42501';
  end if;
  insert into public.opaque_backup_capabilities(workspace_id, owner_user_id, token_hash, reauthenticated_at, expires_at)
  values (p_workspace_id, p_owner_user_id, p_token_hash, p_reauthenticated_at, p_expires_at)
  returning capability_id into result_id;
  insert into public.opaque_backup_audit(workspace_id, actor_user_id, capability_id, status)
    values (p_workspace_id, p_owner_user_id, result_id, 'issued');
  return result_id;
end;
$$;

create function public.export_opaque_workspace_backup(p_workspace_id uuid, p_capability_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  capability public.opaque_backup_capabilities%rowtype;
  calculated_hash text;
  entity_total integer;
  private_total integer;
  envelope_total integer;
  result jsonb;
begin
  if actor_id is null or not public.is_workspace_owner(p_workspace_id) then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if (select count(*) from public.opaque_backup_audit where workspace_id = p_workspace_id
      and actor_user_id = actor_id and status = 'rejected' and created_at > now() - interval '1 minute') >= 5
  then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  calculated_hash := 'sha256:' || translate(rtrim(encode(extensions.digest(convert_to(p_capability_token, 'UTF8'), 'sha256'), 'base64'), '='), '+/', '-_');
  select * into capability from public.opaque_backup_capabilities
    where workspace_id = p_workspace_id and owner_user_id = actor_id and token_hash = calculated_hash for update;
  if not found or capability.state <> 'active' or capability.expires_at <= now() then
    insert into public.opaque_backup_audit(workspace_id, actor_user_id, status) values (p_workspace_id, actor_id, 'rejected');
    return jsonb_build_object('ok', false, 'error', 'INVALID_OR_EXPIRED_CAPABILITY');
  end if;
  update public.opaque_backup_capabilities set state = 'consumed', consumed_at = now() where capability_id = capability.capability_id;
  select count(*) into entity_total from public.encrypted_entities where workspace_id = p_workspace_id;
  select count(*) into private_total from public.encrypted_private_fields where workspace_id = p_workspace_id;
  select count(*) into envelope_total from public.encrypted_key_envelopes where workspace_id = p_workspace_id;
  result := jsonb_build_object(
    'format', 'famnesia-opaque-backup', 'version', 1, 'workspaceId', p_workspace_id,
    'cryptoState', (select to_jsonb(s) from public.workspace_crypto_states s where s.workspace_id = p_workspace_id),
    'directory', (select coalesce(jsonb_agg(to_jsonb(d) order by d.principal_id), '[]'::jsonb) from public.workspace_principal_directory d where d.workspace_id = p_workspace_id),
    'principals', (select coalesce(jsonb_agg(to_jsonb(p) order by p.principal_id), '[]'::jsonb)
      from public.crypto_principals p join public.workspace_principal_directory d on d.principal_id = p.principal_id
      where d.workspace_id = p_workspace_id),
    'entities', (select coalesce(jsonb_agg(to_jsonb(e) order by e.entity_id, e.field_class), '[]'::jsonb) from public.encrypted_entities e where e.workspace_id = p_workspace_id),
    'privateFields', (select coalesce(jsonb_agg(to_jsonb(f) order by f.person_id, f.field_class), '[]'::jsonb) from public.encrypted_private_fields f where f.workspace_id = p_workspace_id),
    'keyEnvelopes', (select coalesce(jsonb_agg(to_jsonb(k) order by k.envelope_id), '[]'::jsonb) from public.encrypted_key_envelopes k where k.workspace_id = p_workspace_id),
    'policyAuthorizations', (select coalesce(jsonb_agg(to_jsonb(a) order by a.authorization_id), '[]'::jsonb) from public.signed_policy_authorizations a where a.workspace_id = p_workspace_id)
  );
  insert into public.opaque_backup_audit(workspace_id, actor_user_id, capability_id, status, entity_count, private_field_count, envelope_count)
    values (p_workspace_id, actor_id, capability.capability_id, 'completed', entity_total, private_total, envelope_total);
  return jsonb_build_object('ok', true, 'backup', result);
end;
$$;

create function public.guard_encrypted_routing_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id then raise exception 'WORKSPACE_ID_IMMUTABLE'; end if;
  if tg_table_name = 'encrypted_entities'
    and (new.entity_id <> old.entity_id or new.field_class <> old.field_class)
  then raise exception 'ENTITY_SCOPE_IMMUTABLE'; end if;
  if tg_table_name = 'encrypted_private_fields'
    and (new.person_id <> old.person_id or new.field_class <> old.field_class)
  then raise exception 'PRIVATE_FIELD_SCOPE_IMMUTABLE'; end if;
  return new;
end;
$$;

create trigger encrypted_entities_routing_guard before update on public.encrypted_entities
for each row execute function public.guard_encrypted_routing_identity();
create trigger encrypted_private_fields_routing_guard before update on public.encrypted_private_fields
for each row execute function public.guard_encrypted_routing_identity();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'crypto_principals', 'workspace_crypto_states', 'workspace_principal_directory',
    'encrypted_entities', 'encrypted_private_fields', 'encrypted_key_envelopes',
    'signed_policy_authorizations', 'authorization_nonce_ledger', 'crypto_invitations',
    'opaque_backup_capabilities', 'opaque_backup_audit', 'encrypted_commits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

grant select on public.crypto_principals, public.workspace_crypto_states,
  public.workspace_principal_directory, public.encrypted_entities,
  public.encrypted_private_fields, public.encrypted_key_envelopes,
  public.signed_policy_authorizations, public.crypto_invitations,
  public.opaque_backup_audit, public.encrypted_commits to authenticated;

create policy crypto_principals_select_own on public.crypto_principals for select to authenticated
  using (auth_user_id = (select auth.uid()));
create policy crypto_principals_select_shared_directory on public.crypto_principals for select to authenticated
  using (exists (
    select 1 from public.workspace_principal_directory directory
    where directory.principal_id = crypto_principals.principal_id
      and public.can_read_workspace(directory.workspace_id)
  ));
create policy workspace_crypto_states_select_member on public.workspace_crypto_states for select to authenticated
  using (public.can_read_workspace(workspace_id));
create policy workspace_principal_directory_select_member on public.workspace_principal_directory for select to authenticated
  using (public.can_read_workspace(workspace_id));
create policy encrypted_entities_select_member on public.encrypted_entities for select to authenticated
  using (public.can_read_workspace(workspace_id));
create policy encrypted_private_fields_select_member on public.encrypted_private_fields for select to authenticated
  using (public.can_read_workspace(workspace_id));
create policy encrypted_key_envelopes_select_recipient on public.encrypted_key_envelopes for select to authenticated
  using (recipient_principal_id = public.current_crypto_principal(workspace_id));
create policy signed_policy_authorizations_select_actor on public.signed_policy_authorizations for select to authenticated
  using (actor_principal_id = public.current_crypto_principal(workspace_id) or public.is_workspace_owner(workspace_id));
create policy crypto_invitations_select_owner on public.crypto_invitations for select to authenticated
  using (public.is_workspace_owner(workspace_id));
create policy opaque_backup_audit_select_owner on public.opaque_backup_audit for select to authenticated
  using (public.is_workspace_owner(workspace_id));
create policy encrypted_commits_select_member on public.encrypted_commits for select to authenticated
  using (public.can_read_workspace(workspace_id));

revoke all on function public.encrypted_envelope_matches(jsonb, uuid, text, text, bigint, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.current_crypto_principal(uuid) from public, anon;
revoke all on function public.register_crypto_principal(text, jsonb, text, jsonb, text, integer) from public, anon;
revoke all on function public.initialize_workspace_crypto(uuid, text) from public, anon;
revoke all on function public.commit_encrypted_workspace(uuid, text, text, bigint, integer, jsonb) from public, anon;
revoke all on function public.mint_opaque_backup_capability(uuid, uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.export_opaque_workspace_backup(uuid, text) from public, anon;
revoke all on function public.guard_encrypted_routing_identity() from public, anon, authenticated;

grant execute on function public.current_crypto_principal(uuid) to authenticated, service_role;
grant execute on function public.encrypted_envelope_matches(jsonb, uuid, text, text, bigint, text, integer, text, text) to service_role;
grant execute on function public.register_crypto_principal(text, jsonb, text, jsonb, text, integer) to authenticated;
grant execute on function public.initialize_workspace_crypto(uuid, text) to authenticated;
grant execute on function public.commit_encrypted_workspace(uuid, text, text, bigint, integer, jsonb) to authenticated;
grant execute on function public.mint_opaque_backup_capability(uuid, uuid, text, timestamptz, timestamptz) to service_role;
grant execute on function public.export_opaque_workspace_backup(uuid, text) to authenticated;

comment on table public.encrypted_entities is 'CR-04 family-shared ciphertext only; protected plaintext is forbidden.';
comment on table public.encrypted_private_fields is 'CR-04 separately authorized contact/private ciphertext; one enforceable field class per row.';
comment on table public.encrypted_key_envelopes is 'Recipient-bound wrapped content keys. Normal reads are recipient-only; opaque backup preserves all rows.';
comment on function public.commit_encrypted_workspace(uuid, text, text, bigint, integer, jsonb) is
  'Atomic CR-04 encrypted commit with role, principal, version, AAD, authorization and replay checks.';
comment on function public.export_opaque_workspace_backup(uuid, text) is
  'Owner-only, single-use capability export of original ciphertext and wrapped envelopes; performs no unwrap or re-wrap.';
