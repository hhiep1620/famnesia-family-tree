alter type public.encrypted_entity_class add value if not exists 'workspace_settings';

alter table public.encrypted_entities
  drop constraint encrypted_entities_envelope_matches,
  add column writer_id text generated always as (envelope -> 'aad' ->> 'writerId') stored,
  add constraint encrypted_entities_writer_id_shape check (writer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  add constraint encrypted_entities_envelope_matches check (
    public.encrypted_envelope_matches(envelope, workspace_id, entity_id, field_class::text,
      row_version, key_id, key_epoch, writer_id, 'family-content')
  );

alter table public.encrypted_private_fields
  drop constraint encrypted_private_fields_envelope_matches,
  add column writer_id text generated always as (envelope -> 'aad' ->> 'writerId') stored,
  add constraint encrypted_private_fields_writer_id_shape check (writer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  add constraint encrypted_private_fields_envelope_matches check (
    public.encrypted_envelope_matches(envelope, workspace_id, person_id, field_class::text,
      row_version, key_id, key_epoch, writer_id, 'contact')
  );

comment on type public.encrypted_entity_class is
  'CR-05 adds workspace_settings because timezone, locale and duplicate suppressions are family-shared ciphertext under CR-01.';
comment on column public.encrypted_entities.writer_id is
  'Device/tab writer subkey identity from authenticated AAD; distinct from the portable writer principal used for authorization.';
