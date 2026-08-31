create type public.member_person_binding_state as enum ('pending', 'confirmed', 'rejected', 'revoked', 'superseded');
create type public.member_person_binding_action as enum ('propose', 'confirm', 'reject', 'revoke', 'supersede');

create table public.member_person_bindings (
  binding_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  person_id text not null check (person_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  state public.member_person_binding_state not null default 'pending',
  binding_version bigint,
  pinned_unwrap_fingerprint text,
  pinned_signing_fingerprint text,
  proposed_by_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  confirmed_by_principal_id text references public.crypto_principals(principal_id) on delete restrict,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  revoked_at timestamptz,
  constraint member_binding_principal_directory_fk foreign key (workspace_id, principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete cascade,
  constraint member_binding_proposer_directory_fk foreign key (workspace_id, proposed_by_principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete restrict,
  constraint member_binding_confirmer_directory_fk foreign key (workspace_id, confirmed_by_principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete restrict,
  constraint member_binding_lifecycle check (
    (state = 'pending' and binding_version is null and pinned_unwrap_fingerprint is null
      and pinned_signing_fingerprint is null and confirmed_by_principal_id is null and decided_at is null and revoked_at is null)
    or (state = 'rejected' and binding_version is null and pinned_unwrap_fingerprint is null
      and pinned_signing_fingerprint is null and confirmed_by_principal_id is not null and decided_at is not null and revoked_at is null)
    or (state in ('confirmed','superseded') and binding_version > 0 and pinned_unwrap_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'
      and pinned_signing_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$' and confirmed_by_principal_id is not null
      and decided_at is not null and revoked_at is null)
    or (state = 'revoked' and binding_version > 0 and pinned_unwrap_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$'
      and pinned_signing_fingerprint ~ '^sha256:[A-Za-z0-9_-]{43}$' and confirmed_by_principal_id is not null
      and decided_at is not null and revoked_at is not null)
  )
);

create unique index member_binding_pending_principal_profile_unique
  on public.member_person_bindings(workspace_id, profile_id, principal_id) where state = 'pending';
create unique index member_binding_confirmed_principal_profile_unique
  on public.member_person_bindings(workspace_id, profile_id, principal_id) where state = 'confirmed';
create unique index member_binding_active_person_profile_unique
  on public.member_person_bindings(workspace_id, profile_id, person_id) where state in ('pending','confirmed');
create index member_binding_workspace_state_idx on public.member_person_bindings(workspace_id, state, profile_id);

create table public.member_binding_events (
  event_id bigint generated always as identity primary key,
  transition_id text not null unique check (transition_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  request_hash text not null check (request_hash ~ '^sha256:[A-Za-z0-9_-]{43}$'),
  workspace_id uuid not null references public.workspace_crypto_states(workspace_id) on delete cascade,
  binding_id uuid not null references public.member_person_bindings(binding_id) on delete restrict,
  actor_principal_id text not null references public.crypto_principals(principal_id) on delete restrict,
  action public.member_person_binding_action not null,
  from_state public.member_person_binding_state,
  to_state public.member_person_binding_state not null,
  binding_revision bigint not null check (binding_revision > 0),
  reason_code text not null check (reason_code in ('self_claim','owner_confirmed','owner_rejected','owner_revoked','owner_rebind')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint member_binding_event_actor_directory_fk foreign key (workspace_id, actor_principal_id)
    references public.workspace_principal_directory(workspace_id, principal_id) on delete restrict
);

create function public.binding_request_hash(candidate jsonb)
returns text language sql immutable set search_path = '' as $$
  select 'sha256:' || translate(rtrim(encode(extensions.digest(convert_to(candidate::text, 'UTF8'), 'sha256'), 'base64'), '='), '+/', '-_');
$$;

create function public.propose_member_person_binding(
  p_workspace_id uuid, p_transition_id text, p_profile_id text, p_person_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_principal text;
  request_value jsonb;
  request_digest text;
  prior public.member_binding_events%rowtype;
  created public.member_person_bindings%rowtype;
  current_revision bigint;
  result_value jsonb;
begin
  actor_principal := public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode = '42501'; end if;
  request_value := jsonb_build_object('action','propose','workspaceId',p_workspace_id,'profileId',p_profile_id,
    'personId',p_person_id,'principalId',actor_principal);
  request_digest := public.binding_request_hash(request_value);
  select * into prior from public.member_binding_events where transition_id = p_transition_id;
  if found then
    if prior.request_hash <> request_digest then raise exception 'BINDING_TRANSITION_REUSE'; end if;
    return prior.result;
  end if;
  if not exists (select 1 from public.encrypted_entities where workspace_id=p_workspace_id and entity_id=p_profile_id and field_class='family_profile')
    or not exists (select 1 from public.encrypted_entities where workspace_id=p_workspace_id and entity_id=p_person_id and field_class='person_core') then
    raise exception 'BINDING_TARGET_NOT_FOUND';
  end if;
  select binding_revision into current_revision from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if current_revision is null then raise exception 'CRYPTO_STATE_NOT_FOUND'; end if;
  insert into public.member_person_bindings(workspace_id,profile_id,person_id,principal_id,proposed_by_principal_id)
    values(p_workspace_id,p_profile_id,p_person_id,actor_principal,actor_principal) returning * into created;
  result_value := jsonb_build_object('bindingId',created.binding_id,'state',created.state,'bindingRevision',current_revision,
    'profileId',created.profile_id,'personId',created.person_id,'principalId',created.principal_id);
  insert into public.member_binding_events(transition_id,request_hash,workspace_id,binding_id,actor_principal_id,action,
    from_state,to_state,binding_revision,reason_code,result)
    values(p_transition_id,request_digest,p_workspace_id,created.binding_id,actor_principal,'propose',null,'pending',current_revision,'self_claim',result_value);
  return result_value;
exception when unique_violation then
  raise exception 'BINDING_CONFLICT' using errcode = '23505';
end;
$$;

create function public.decide_member_person_binding(
  p_workspace_id uuid, p_transition_id text, p_binding_id uuid, p_decision text,
  p_expected_binding_revision bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_principal text;
  target public.member_person_bindings%rowtype;
  principal public.crypto_principals%rowtype;
  prior public.member_binding_events%rowtype;
  request_value jsonb;
  request_digest text;
  current_revision bigint;
  next_revision bigint;
  next_state public.member_person_binding_state;
  previous_binding_id uuid;
  result_value jsonb;
begin
  if p_decision not in ('confirm','reject','revoke') then raise exception 'INVALID_BINDING_DECISION'; end if;
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'OWNER_REQUIRED' using errcode = '42501'; end if;
  actor_principal := public.current_crypto_principal(p_workspace_id);
  if actor_principal is null then raise exception 'ACTIVE_PRINCIPAL_REQUIRED' using errcode = '42501'; end if;
  request_value := jsonb_build_object('action',p_decision,'workspaceId',p_workspace_id,'bindingId',p_binding_id,
    'expectedBindingRevision',p_expected_binding_revision,'actorPrincipalId',actor_principal);
  request_digest := public.binding_request_hash(request_value);
  select * into prior from public.member_binding_events where transition_id=p_transition_id;
  if found then
    if prior.request_hash <> request_digest then raise exception 'BINDING_TRANSITION_REUSE'; end if;
    return prior.result;
  end if;
  select * into target from public.member_person_bindings where workspace_id=p_workspace_id and binding_id=p_binding_id for update;
  if not found then raise exception 'BINDING_NOT_FOUND'; end if;
  select binding_revision into current_revision from public.workspace_crypto_states where workspace_id=p_workspace_id for update;
  if current_revision <> p_expected_binding_revision then raise exception 'STALE_BINDING_REVISION'; end if;
  if p_decision in ('confirm','reject') and target.state <> 'pending' then raise exception 'BINDING_NOT_PENDING'; end if;
  if p_decision='revoke' and target.state <> 'confirmed' then raise exception 'BINDING_NOT_CONFIRMED'; end if;
  if p_decision='reject' then
    update public.member_person_bindings set state='rejected',confirmed_by_principal_id=actor_principal,decided_at=now()
      where binding_id=p_binding_id returning * into target;
    next_revision := current_revision;
    next_state := 'rejected';
  elsif p_decision='revoke' then
    next_revision := current_revision+1;
    update public.member_person_bindings set state='revoked',revoked_at=now() where binding_id=p_binding_id returning * into target;
    update public.workspace_crypto_states set binding_revision=next_revision,updated_at=now() where workspace_id=p_workspace_id;
    next_state := 'revoked';
  else
    select * into principal from public.crypto_principals where principal_id=target.principal_id;
    if principal.principal_id is null then raise exception 'BINDING_PRINCIPAL_NOT_FOUND'; end if;
    next_revision := current_revision+1;
    select binding_id into previous_binding_id from public.member_person_bindings
      where workspace_id=p_workspace_id and profile_id=target.profile_id and principal_id=target.principal_id
        and state='confirmed' and binding_id<>target.binding_id for update;
    update public.member_person_bindings set state='superseded'
      where workspace_id=p_workspace_id and profile_id=target.profile_id and principal_id=target.principal_id
        and state='confirmed' and binding_id<>target.binding_id;
    update public.member_person_bindings set state='confirmed',binding_version=next_revision,
      pinned_unwrap_fingerprint=principal.unwrap_fingerprint,pinned_signing_fingerprint=principal.signing_fingerprint,
      confirmed_by_principal_id=actor_principal,decided_at=now()
      where binding_id=p_binding_id returning * into target;
    update public.workspace_crypto_states set binding_revision=next_revision,updated_at=now() where workspace_id=p_workspace_id;
    next_state := 'confirmed';
  end if;
  result_value := jsonb_build_object('bindingId',target.binding_id,'state',next_state,'bindingRevision',next_revision,
    'profileId',target.profile_id,'personId',target.person_id,'principalId',target.principal_id,
    'unwrapFingerprint',target.pinned_unwrap_fingerprint,'signingFingerprint',target.pinned_signing_fingerprint,
    'previousBindingId',previous_binding_id);
  insert into public.member_binding_events(transition_id,request_hash,workspace_id,binding_id,actor_principal_id,action,
    from_state,to_state,binding_revision,reason_code,result)
  values(p_transition_id,request_digest,p_workspace_id,p_binding_id,actor_principal,p_decision::public.member_person_binding_action,
    case when p_decision='revoke' then 'confirmed'::public.member_person_binding_state else 'pending'::public.member_person_binding_state end,
    next_state,next_revision,case p_decision when 'confirm' then case when previous_binding_id is null then 'owner_confirmed' else 'owner_rebind' end
      when 'reject' then 'owner_rejected' else 'owner_revoked' end,result_value);
  return result_value;
exception when unique_violation then
  raise exception 'BINDING_CONFLICT' using errcode = '23505';
end;
$$;

alter table public.member_person_bindings enable row level security;
alter table public.member_person_bindings force row level security;
alter table public.member_binding_events enable row level security;
alter table public.member_binding_events force row level security;

create policy member_person_bindings_select_member on public.member_person_bindings for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy member_binding_events_select_owner_or_subject on public.member_binding_events for select to authenticated
  using (public.is_workspace_owner(workspace_id) or actor_principal_id=public.current_crypto_principal(workspace_id)
    or exists(select 1 from public.member_person_bindings b where b.binding_id=member_binding_events.binding_id
      and b.principal_id=public.current_crypto_principal(workspace_id)));

grant select on public.member_person_bindings, public.member_binding_events to authenticated, service_role;
grant all on public.member_person_bindings, public.member_binding_events to service_role;
revoke insert, update, delete, truncate, references, trigger on public.member_person_bindings, public.member_binding_events from authenticated;
revoke all on function public.binding_request_hash(jsonb) from public, anon, authenticated;
revoke all on function public.propose_member_person_binding(uuid,text,text,text) from public, anon;
revoke all on function public.decide_member_person_binding(uuid,text,uuid,text,bigint) from public, anon;
grant execute on function public.binding_request_hash(jsonb) to service_role;
grant execute on function public.propose_member_person_binding(uuid,text,text,text) to authenticated;
grant execute on function public.decide_member_person_binding(uuid,text,uuid,text,bigint) to authenticated;

comment on table public.member_person_bindings is 'CR-06 opaque member-to-person lifecycle. Confirmed rows pin active recipient key fingerprints.';
comment on table public.member_binding_events is 'CR-06 metadata-only idempotency and audit ledger; protected names/contact are forbidden.';
