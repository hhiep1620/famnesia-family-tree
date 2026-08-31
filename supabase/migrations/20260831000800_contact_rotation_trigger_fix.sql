create or replace function public.guard_encrypted_routing_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.workspace_id<>old.workspace_id then raise exception 'WORKSPACE_ID_IMMUTABLE'; end if;
  if tg_table_name='encrypted_entities' then
    if new.entity_id<>old.entity_id or new.field_class<>old.field_class then raise exception 'ENTITY_SCOPE_IMMUTABLE'; end if;
  elsif tg_table_name='encrypted_private_fields' then
    if new.person_id<>old.person_id or new.field_class<>old.field_class then raise exception 'PRIVATE_FIELD_SCOPE_IMMUTABLE'; end if;
  else
    raise exception 'UNSUPPORTED_ENCRYPTED_ROUTING_TABLE';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_encrypted_routing_identity() from public,anon,authenticated;
comment on function public.guard_encrypted_routing_identity() is
  'CR-07 uses table-specific branches so PostgreSQL never resolves entity-only fields on private-field trigger records.';
