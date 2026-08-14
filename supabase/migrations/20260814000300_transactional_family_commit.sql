alter table public.commits
  add column auto_merged boolean not null default false,
  add column request_checksum text not null default 'direct',
  add constraint commits_request_checksum_not_blank check (length(trim(request_checksum)) > 0);

create function public._family_snapshot_json(target_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', workspace.schema_version,
    'updatedAt', to_jsonb(workspace.updated_at),
    'profiles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', profile.legacy_id,
          'name', profile.name,
          'lineageSurname', profile.lineage_surname,
          'description', profile.description,
          'photoFileId', profile.legacy_photo_file_id,
          'subjectPersonId', subject.legacy_id,
          'requiresSecret', profile.requires_secret,
          'isActive', profile.is_active
        ) order by profile.legacy_id
      )
      from public.family_profiles profile
      left join public.persons subject on subject.id = profile.subject_person_id
      where profile.workspace_id = workspace.id
    ), '[]'::jsonb),
    'persons', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', person.legacy_id,
          'profileId', profile.legacy_id,
          'name', person.name,
          'nickname', person.nickname,
          'gender', person.gender,
          'birthDate', person.birth_date,
          'isDeceased', person.is_deceased,
          'deathDate', person.death_date,
          'deathLunar', case
            when person.death_lunar_day is null then 'null'::jsonb
            else jsonb_build_object(
              'day', person.death_lunar_day,
              'month', person.death_lunar_month,
              'leapMonth', person.death_lunar_leap_month
            )
          end,
          'phone1', person.phone1,
          'phone2', person.phone2,
          'address', person.address,
          'note', person.note,
          'ancestralRole', person.ancestral_role,
          'createdAt', to_jsonb(person.created_at),
          'updatedAt', to_jsonb(person.updated_at)
        )
        || case when person.sort_order is null then '{}'::jsonb else jsonb_build_object('sortOrder', person.sort_order) end
        || case
          when person.birth_date_confidence is null and person.death_date_confidence is null then '{}'::jsonb
          else jsonb_build_object(
            'confidence', jsonb_strip_nulls(jsonb_build_object(
              'birthDate', person.birth_date_confidence,
              'deathDate', person.death_date_confidence
            ))
          )
        end
        order by person.sort_order nulls last, person.legacy_id
      )
      from public.persons person
      join public.family_profiles profile on profile.id = person.family_profile_id
      where person.workspace_id = workspace.id
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', relationship.legacy_id,
          'profileId', profile.legacy_id,
          'person1Id', person1.legacy_id,
          'person2Id', person2.legacy_id,
          'type', relationship.type,
          'startDate', relationship.start_date,
          'endDate', relationship.end_date,
          'createdAt', to_jsonb(relationship.created_at),
          'updatedAt', to_jsonb(relationship.updated_at)
        )
        || case when relationship.status is null then '{}'::jsonb else jsonb_build_object('status', relationship.status) end
        || case when relationship.sort_order is null then '{}'::jsonb else jsonb_build_object('sortOrder', relationship.sort_order) end
        || case when relationship.confidence is null then '{}'::jsonb else jsonb_build_object('confidence', relationship.confidence) end
        order by relationship.sort_order nulls last, relationship.legacy_id
      )
      from public.relationships relationship
      join public.family_profiles profile on profile.id = relationship.family_profile_id
      join public.persons person1 on person1.id = relationship.person1_id
      join public.persons person2 on person2.id = relationship.person2_id
      where relationship.workspace_id = workspace.id
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', item.legacy_id,
          'profileId', profile.legacy_id,
          'personId', person.legacy_id,
          'fileId', item.legacy_id,
          'type', 'photo',
          'isPrimary', item.is_primary,
          'caption', item.caption,
          'takenDate', item.taken_date,
          'createdAt', to_jsonb(item.created_at)
        )
        || case when item.legacy_drive_file_id is null then '{}'::jsonb else jsonb_build_object('driveFileId', item.legacy_drive_file_id) end
        || case when item.storage_path is null then '{}'::jsonb else jsonb_build_object('storagePath', item.storage_path) end
        || case when item.sort_order is null then '{}'::jsonb else jsonb_build_object('sortOrder', item.sort_order) end
        order by item.sort_order nulls last, item.legacy_id
      )
      from public.media item
      join public.family_profiles profile on profile.id = item.family_profile_id
      join public.persons person on person.id = item.person_id
      where item.workspace_id = workspace.id
    ), '[]'::jsonb),
    'settings', jsonb_build_object(
      'timezone', workspace.timezone,
      'locale', workspace.locale,
      'duplicateSuppressions', workspace.duplicate_suppressions
    )
  )
  from public.workspaces workspace
  where workspace.id = target_workspace_id;
$$;

create function public._family_find_entity(data jsonb, array_name text, legacy_id text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select item
  from jsonb_array_elements(coalesce(data -> array_name, '[]'::jsonb)) item
  where item ->> 'id' = legacy_id
  limit 1;
$$;

create function public._family_remove_entity(data jsonb, array_name text, legacy_id text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_set(
    data,
    array[array_name],
    coalesce((
      select jsonb_agg(item order by ordinal)
      from jsonb_array_elements(coalesce(data -> array_name, '[]'::jsonb)) with ordinality entries(item, ordinal)
      where item ->> 'id' <> legacy_id
    ), '[]'::jsonb),
    true
  );
$$;

create function public._family_filter_person_references(data jsonb, person_legacy_id text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_set(
    jsonb_set(
      jsonb_set(
        data,
        '{relationships}',
        coalesce((
          select jsonb_agg(item order by ordinal)
          from jsonb_array_elements(coalesce(data -> 'relationships', '[]'::jsonb)) with ordinality entries(item, ordinal)
          where item ->> 'person1Id' <> person_legacy_id and item ->> 'person2Id' <> person_legacy_id
        ), '[]'::jsonb),
        true
      ),
      '{media}',
      coalesce((
        select jsonb_agg(item order by ordinal)
        from jsonb_array_elements(coalesce(data -> 'media', '[]'::jsonb)) with ordinality entries(item, ordinal)
        where item ->> 'personId' <> person_legacy_id
      ), '[]'::jsonb),
      true
    ),
    '{profiles}',
    coalesce((
      select jsonb_agg(
        case when item ->> 'subjectPersonId' = person_legacy_id then jsonb_set(item, '{subjectPersonId}', 'null'::jsonb, true) else item end
        order by ordinal
      )
      from jsonb_array_elements(coalesce(data -> 'profiles', '[]'::jsonb)) with ordinality entries(item, ordinal)
    ), '[]'::jsonb),
    true
  );
$$;

create function public._family_apply_operations(data jsonb, operations jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result_data jsonb := data;
  conflicts jsonb := '[]'::jsonb;
  operation jsonb;
  operation_type text;
  operation_id text;
  entity_id text;
  profile_id text;
  array_name text;
  current_entity jsonb;
  next_entity jsonb;
  operation_value jsonb;
  changes jsonb;
  baseline_entity jsonb;
  field_name text;
  local_value jsonb;
  remote_value jsonb;
  base_value jsonb;
  has_conflict boolean;
  person_id text;
  primary_media_id text;
  removed_media jsonb;
  replacement_media_id text;
  marker text;
begin
  if jsonb_typeof(operations) <> 'array' then
    raise exception using errcode = '22023', message = 'FAMILY_OPERATIONS_INVALID';
  end if;

  for operation in select value from jsonb_array_elements(operations)
  loop
    operation_type := operation ->> 'type';
    operation_id := operation ->> 'id';
    entity_id := operation ->> 'entityId';
    profile_id := operation ->> 'profileId';
    operation_value := operation -> 'value';
    changes := coalesce(operation -> 'changes', '{}'::jsonb);

    array_name := case
      when operation_type in ('profile.create', 'profile.update', 'subject.set') then 'profiles'
      when operation_type in ('person.create', 'person.update', 'person.delete') then 'persons'
      when operation_type in ('relationship.create', 'relationship.update', 'relationship.delete') then 'relationships'
      when operation_type in ('media.attach', 'media.primary.set', 'media.caption.update', 'media.delete') then 'media'
      else null
    end;

    if operation_id is null or operation_type is null then
      raise exception using errcode = '22023', message = 'FAMILY_OPERATION_INVALID';
    end if;

    if operation_type in ('profile.create', 'person.create', 'relationship.create', 'media.attach') then
      if entity_id is null or jsonb_typeof(operation_value) <> 'object' then
        raise exception using errcode = '22023', message = 'FAMILY_OPERATION_CREATE_INVALID';
      end if;
      current_entity := public._family_find_entity(result_data, array_name, entity_id);
      if current_entity is not null then
        if current_entity <> operation_value then
          conflicts := conflicts || jsonb_build_array(jsonb_build_object(
            'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
            'profileId', profile_id, 'field', '$entity', 'reason', 'id_exists',
            'baseValue', null, 'remoteValue', current_entity, 'localValue', operation_value
          ));
        end if;
        continue;
      end if;
      if operation_type = 'relationship.create' and (
        public._family_find_entity(result_data, 'persons', operation_value ->> 'person1Id') is null
        or public._family_find_entity(result_data, 'persons', operation_value ->> 'person2Id') is null
      ) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
          'profileId', profile_id, 'field', '$reference', 'reason', 'missing_reference',
          'baseValue', null, 'remoteValue', coalesce(operation_value -> 'person1Id', operation_value -> 'person2Id'),
          'localValue', operation_value
        ));
        continue;
      end if;
      if operation_type = 'media.attach' and public._family_find_entity(result_data, 'persons', operation_value ->> 'personId') is null then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
          'profileId', profile_id, 'field', '$reference', 'reason', 'missing_reference',
          'baseValue', null, 'remoteValue', operation_value -> 'personId', 'localValue', operation_value
        ));
        continue;
      end if;
      result_data := jsonb_set(
        result_data,
        array[array_name],
        coalesce(result_data -> array_name, '[]'::jsonb) || jsonb_build_array(operation_value),
        true
      );
      continue;
    end if;

    if operation_type in ('person.delete', 'relationship.delete', 'media.delete') then
      if entity_id is null then
        raise exception using errcode = '22023', message = 'FAMILY_OPERATION_DELETE_INVALID';
      end if;
      current_entity := public._family_find_entity(result_data, array_name, entity_id);
      if current_entity is null then
        continue;
      end if;
      if coalesce(operation -> 'baseValues', '{}'::jsonb) ? '$entity' then
        baseline_entity := operation #> '{baseValues,$entity}';
        if current_entity <> baseline_entity then
          conflicts := conflicts || jsonb_build_array(jsonb_build_object(
            'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
            'profileId', profile_id, 'field', '$entity', 'reason', 'delete_changed',
            'baseValue', baseline_entity, 'remoteValue', current_entity, 'localValue', null
          ));
          continue;
        end if;
      end if;
      if operation_type = 'person.delete' then
        result_data := public._family_remove_entity(result_data, 'persons', entity_id);
        result_data := public._family_filter_person_references(result_data, entity_id);
      elsif operation_type = 'relationship.delete' then
        result_data := public._family_remove_entity(result_data, 'relationships', entity_id);
      else
        removed_media := current_entity;
        result_data := public._family_remove_entity(result_data, 'media', entity_id);
        if coalesce((removed_media ->> 'isPrimary')::boolean, false) then
          select item ->> 'id' into replacement_media_id
          from jsonb_array_elements(coalesce(result_data -> 'media', '[]'::jsonb)) item
          where item ->> 'personId' = removed_media ->> 'personId'
          limit 1;
          if replacement_media_id is not null then
            result_data := jsonb_set(
              result_data,
              '{media}',
              coalesce((
                select jsonb_agg(
                  case when item ->> 'id' = replacement_media_id then jsonb_set(item, '{isPrimary}', 'true'::jsonb, true) else item end
                  order by ordinal
                )
                from jsonb_array_elements(coalesce(result_data -> 'media', '[]'::jsonb)) with ordinality entries(item, ordinal)
              ), '[]'::jsonb),
              true
            );
          end if;
        end if;
      end if;
      continue;
    end if;

    if operation_type = 'settings.duplicate_suppression.add' then
      marker := coalesce(operation ->> 'value', entity_id);
      if marker is not null and not coalesce(result_data #> '{settings,duplicateSuppressions}', '[]'::jsonb) ? marker then
        result_data := jsonb_set(
          result_data,
          '{settings,duplicateSuppressions}',
          coalesce(result_data #> '{settings,duplicateSuppressions}', '[]'::jsonb) || to_jsonb(marker),
          true
        );
      end if;
      continue;
    end if;

    if operation_type not in ('profile.update', 'subject.set', 'person.update', 'relationship.update', 'media.caption.update', 'media.primary.set') then
      raise exception using errcode = '22023', message = 'FAMILY_OPERATION_TYPE_INVALID';
    end if;
    if entity_id is null or jsonb_typeof(changes) <> 'object' then
      raise exception using errcode = '22023', message = 'FAMILY_OPERATION_UPDATE_INVALID';
    end if;
    current_entity := public._family_find_entity(result_data, array_name, entity_id);
    if current_entity is null then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
        'profileId', profile_id, 'field', '$entity', 'reason', 'entity_deleted',
        'baseValue', operation -> 'baseValues', 'remoteValue', null, 'localValue', changes
      ));
      continue;
    end if;

    has_conflict := false;
    for field_name, local_value in select key, value from jsonb_each(changes)
    loop
      if operation_type = 'media.primary.set' and field_name = 'personId' then
        continue;
      end if;
      if operation_type = 'media.primary.set' and field_name = 'primaryMediaId' then
        select to_jsonb(item ->> 'id') into remote_value
        from jsonb_array_elements(coalesce(result_data -> 'media', '[]'::jsonb)) item
        where item ->> 'personId' = changes ->> 'personId' and coalesce((item ->> 'isPrimary')::boolean, false)
        limit 1;
      else
        remote_value := current_entity -> field_name;
      end if;
      base_value := operation -> 'baseValues' -> field_name;
      if coalesce(remote_value, 'null'::jsonb) <> coalesce(base_value, 'null'::jsonb)
        and coalesce(remote_value, 'null'::jsonb) <> coalesce(local_value, 'null'::jsonb) then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
          'profileId', profile_id, 'field', field_name, 'reason', 'field_changed',
          'baseValue', coalesce(base_value, 'null'::jsonb),
          'remoteValue', coalesce(remote_value, 'null'::jsonb),
          'localValue', coalesce(local_value, 'null'::jsonb)
        ));
        has_conflict := true;
      end if;
    end loop;
    if has_conflict then
      continue;
    end if;

    if operation_type = 'media.primary.set' then
      person_id := changes ->> 'personId';
      primary_media_id := coalesce(changes ->> 'primaryMediaId', entity_id);
      if public._family_find_entity(result_data, 'media', primary_media_id) is null then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'operationId', operation_id, 'operationType', operation_type, 'entityId', entity_id,
          'profileId', profile_id, 'field', '$reference', 'reason', 'missing_reference',
          'baseValue', null, 'remoteValue', null, 'localValue', primary_media_id
        ));
        continue;
      end if;
      result_data := jsonb_set(
        result_data,
        '{media}',
        coalesce((
          select jsonb_agg(
            case
              when item ->> 'personId' = person_id then jsonb_set(item, '{isPrimary}', to_jsonb(item ->> 'id' = primary_media_id), true)
              else item
            end
            order by ordinal
          )
          from jsonb_array_elements(coalesce(result_data -> 'media', '[]'::jsonb)) with ordinality entries(item, ordinal)
        ), '[]'::jsonb),
        true
      );
      continue;
    end if;

    next_entity := current_entity || (changes - 'id' - 'createdAt');
    if operation_type in ('person.update', 'relationship.update') then
      next_entity := jsonb_set(next_entity, '{updatedAt}', to_jsonb(operation ->> 'createdAt'), true);
    end if;
    result_data := jsonb_set(
      result_data,
      array[array_name],
      coalesce((
        select jsonb_agg(case when item ->> 'id' = entity_id then next_entity else item end order by ordinal)
        from jsonb_array_elements(coalesce(result_data -> array_name, '[]'::jsonb)) with ordinality entries(item, ordinal)
      ), '[]'::jsonb),
      true
    );
  end loop;

  return jsonb_build_object('data', result_data, 'conflicts', conflicts);
end;
$$;

create function public._replace_family_data(target_workspace_id uuid, family_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile jsonb;
  person jsonb;
  relationship jsonb;
  item jsonb;
  profile_uuid uuid;
  person1_uuid uuid;
  person2_uuid uuid;
  person_uuid uuid;
  subject_uuid uuid;
begin
  if jsonb_typeof(family_data) <> 'object'
    or jsonb_typeof(family_data -> 'profiles') <> 'array'
    or jsonb_typeof(family_data -> 'persons') <> 'array'
    or jsonb_typeof(family_data -> 'relationships') <> 'array'
    or jsonb_typeof(family_data -> 'media') <> 'array'
    or jsonb_typeof(family_data -> 'settings') <> 'object' then
    raise exception using errcode = '22023', message = 'FAMILY_DATA_INVALID';
  end if;

  update public.family_profiles set subject_person_id = null where workspace_id = target_workspace_id;
  delete from public.relationships where workspace_id = target_workspace_id;
  delete from public.media where workspace_id = target_workspace_id;
  delete from public.persons existing
    where existing.workspace_id = target_workspace_id
      and not exists (select 1 from jsonb_array_elements(family_data -> 'persons') candidate where candidate ->> 'id' = existing.legacy_id);
  delete from public.family_profiles existing
    where existing.workspace_id = target_workspace_id
      and not exists (select 1 from jsonb_array_elements(family_data -> 'profiles') candidate where candidate ->> 'id' = existing.legacy_id);

  for profile in select value from jsonb_array_elements(family_data -> 'profiles')
  loop
    insert into public.family_profiles (
      workspace_id, legacy_id, name, lineage_surname, description, legacy_photo_file_id,
      subject_person_id, requires_secret, is_active
    ) values (
      target_workspace_id, profile ->> 'id', profile ->> 'name', coalesce(profile ->> 'lineageSurname', ''),
      coalesce(profile ->> 'description', ''), profile ->> 'photoFileId', null,
      coalesce((profile ->> 'requiresSecret')::boolean, false), coalesce((profile ->> 'isActive')::boolean, true)
    )
    on conflict (workspace_id, legacy_id) do update set
      name = excluded.name,
      lineage_surname = excluded.lineage_surname,
      description = excluded.description,
      legacy_photo_file_id = excluded.legacy_photo_file_id,
      requires_secret = excluded.requires_secret,
      is_active = excluded.is_active;
  end loop;

  for person in select value from jsonb_array_elements(family_data -> 'persons')
  loop
    select id into profile_uuid from public.family_profiles
      where workspace_id = target_workspace_id and legacy_id = person ->> 'profileId';
    if profile_uuid is null then
      raise exception using errcode = '23503', message = 'FAMILY_PERSON_PROFILE_MISSING';
    end if;
    insert into public.persons (
      workspace_id, family_profile_id, legacy_id, name, nickname, gender, birth_date,
      is_deceased, death_date, death_lunar_day, death_lunar_month, death_lunar_leap_month,
      phone1, phone2, address, note, ancestral_role, sort_order,
      birth_date_confidence, death_date_confidence, created_at, updated_at
    ) values (
      target_workspace_id, profile_uuid, person ->> 'id', person ->> 'name', person ->> 'nickname',
      coalesce(person ->> 'gender', 'unknown')::public.gender_type, nullif(person ->> 'birthDate', '')::date,
      coalesce((person ->> 'isDeceased')::boolean, false), nullif(person ->> 'deathDate', '')::date,
      nullif(person #>> '{deathLunar,day}', '')::smallint, nullif(person #>> '{deathLunar,month}', '')::smallint,
      nullif(person #>> '{deathLunar,leapMonth}', '')::boolean,
      coalesce(person ->> 'phone1', ''), coalesce(person ->> 'phone2', ''), coalesce(person ->> 'address', ''), coalesce(person ->> 'note', ''),
      coalesce(person ->> 'ancestralRole', 'none')::public.ancestral_role, nullif(person ->> 'sortOrder', '')::double precision,
      nullif(person #>> '{confidence,birthDate}', '')::public.fact_confidence,
      nullif(person #>> '{confidence,deathDate}', '')::public.fact_confidence,
      coalesce(nullif(person ->> 'createdAt', '')::timestamptz, now()),
      coalesce(nullif(person ->> 'updatedAt', '')::timestamptz, now())
    )
    on conflict (workspace_id, legacy_id) do update set
      family_profile_id = excluded.family_profile_id,
      name = excluded.name,
      nickname = excluded.nickname,
      gender = excluded.gender,
      birth_date = excluded.birth_date,
      is_deceased = excluded.is_deceased,
      death_date = excluded.death_date,
      death_lunar_day = excluded.death_lunar_day,
      death_lunar_month = excluded.death_lunar_month,
      death_lunar_leap_month = excluded.death_lunar_leap_month,
      phone1 = excluded.phone1,
      phone2 = excluded.phone2,
      address = excluded.address,
      note = excluded.note,
      ancestral_role = excluded.ancestral_role,
      sort_order = excluded.sort_order,
      birth_date_confidence = excluded.birth_date_confidence,
      death_date_confidence = excluded.death_date_confidence,
      updated_at = excluded.updated_at;
  end loop;

  for profile in select value from jsonb_array_elements(family_data -> 'profiles')
  loop
    if nullif(profile ->> 'subjectPersonId', '') is null then
      continue;
    end if;
    select person_row.id into subject_uuid
      from public.persons person_row
      join public.family_profiles profile_row on profile_row.id = person_row.family_profile_id
      where person_row.workspace_id = target_workspace_id
        and person_row.legacy_id = profile ->> 'subjectPersonId'
        and profile_row.legacy_id = profile ->> 'id';
    if subject_uuid is null then
      raise exception using errcode = '23503', message = 'FAMILY_SUBJECT_PROFILE_MISMATCH';
    end if;
    update public.family_profiles set subject_person_id = subject_uuid
      where workspace_id = target_workspace_id and legacy_id = profile ->> 'id';
  end loop;

  for relationship in select value from jsonb_array_elements(family_data -> 'relationships')
  loop
    select id into profile_uuid from public.family_profiles
      where workspace_id = target_workspace_id and legacy_id = relationship ->> 'profileId';
    select id into person1_uuid from public.persons
      where workspace_id = target_workspace_id and legacy_id = relationship ->> 'person1Id';
    select id into person2_uuid from public.persons
      where workspace_id = target_workspace_id and legacy_id = relationship ->> 'person2Id';
    if profile_uuid is null or person1_uuid is null or person2_uuid is null then
      raise exception using errcode = '23503', message = 'FAMILY_RELATIONSHIP_REFERENCE_MISSING';
    end if;
    insert into public.relationships (
      workspace_id, family_profile_id, legacy_id, person1_id, person2_id, type,
      status, start_date, end_date, sort_order, confidence, created_at, updated_at
    ) values (
      target_workspace_id, profile_uuid, relationship ->> 'id', person1_uuid, person2_uuid,
      (relationship ->> 'type')::public.relationship_type,
      nullif(relationship ->> 'status', '')::public.spouse_status,
      nullif(relationship ->> 'startDate', '')::date, nullif(relationship ->> 'endDate', '')::date,
      nullif(relationship ->> 'sortOrder', '')::double precision,
      nullif(relationship ->> 'confidence', '')::public.fact_confidence,
      coalesce(nullif(relationship ->> 'createdAt', '')::timestamptz, now()),
      coalesce(nullif(relationship ->> 'updatedAt', '')::timestamptz, now())
    );
  end loop;

  if exists (
    with recursive ancestry(ancestor_id, descendant_id) as (
      select person1_id, person2_id from public.relationships
        where workspace_id = target_workspace_id and type = 'parent'
      union
      select ancestry.ancestor_id, relationship.person2_id
      from ancestry
      join public.relationships relationship on relationship.person1_id = ancestry.descendant_id
      where relationship.workspace_id = target_workspace_id and relationship.type = 'parent'
    )
    select 1 from ancestry where ancestor_id = descendant_id
  ) then
    raise exception using errcode = '23514', message = 'FAMILY_ANCESTRY_CYCLE';
  end if;

  for item in select value from jsonb_array_elements(family_data -> 'media')
  loop
    select id into profile_uuid from public.family_profiles
      where workspace_id = target_workspace_id and legacy_id = item ->> 'profileId';
    select id into person_uuid from public.persons
      where workspace_id = target_workspace_id and legacy_id = item ->> 'personId';
    if profile_uuid is null or person_uuid is null then
      raise exception using errcode = '23503', message = 'FAMILY_MEDIA_REFERENCE_MISSING';
    end if;
    insert into public.media (
      workspace_id, family_profile_id, person_id, legacy_id, legacy_drive_file_id,
      storage_bucket, storage_path, type, is_primary, caption, taken_date, sort_order, created_at
    ) values (
      target_workspace_id, profile_uuid, person_uuid, item ->> 'id', item ->> 'driveFileId',
      case when nullif(item ->> 'storagePath', '') is null then null else 'family-media' end,
      nullif(item ->> 'storagePath', ''), 'photo', coalesce((item ->> 'isPrimary')::boolean, false),
      coalesce(item ->> 'caption', ''), nullif(item ->> 'takenDate', '')::date,
      nullif(item ->> 'sortOrder', '')::double precision,
      coalesce(nullif(item ->> 'createdAt', '')::timestamptz, now())
    );
  end loop;

  update public.workspaces set
    schema_version = (family_data ->> 'schemaVersion')::integer,
    timezone = family_data #>> '{settings,timezone}',
    locale = family_data #>> '{settings,locale}',
    duplicate_suppressions = coalesce(family_data #> '{settings,duplicateSuppressions}', '[]'::jsonb)
  where id = target_workspace_id;
end;
$$;

create function public.commit_family_operations(
  p_workspace_id uuid,
  p_commit_id text,
  p_base_data_version bigint,
  p_operations jsonb,
  p_client_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.workspace_role;
  actor_email text;
  actor_name text;
  current_version bigint;
  current_snapshot jsonb;
  applied jsonb;
  candidate jsonb;
  conflicts jsonb;
  operation_count integer;
  operation_counts jsonb;
  request_checksum text;
  existing_commit public.commits%rowtype;
  next_version bigint;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;
  if p_commit_id is null or p_commit_id !~ '^[A-Za-z0-9_-]{8,128}$' then
    raise exception using errcode = '22023', message = 'FAMILY_COMMIT_ID_INVALID';
  end if;
  if p_base_data_version is null or p_base_data_version < 0 then
    raise exception using errcode = '22023', message = 'FAMILY_BASE_VERSION_INVALID';
  end if;
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception using errcode = '22023', message = 'FAMILY_OPERATIONS_INVALID';
  end if;
  operation_count := jsonb_array_length(p_operations);
  if operation_count < 1 or operation_count > 1000 then
    raise exception using errcode = '22023', message = 'FAMILY_OPERATIONS_INVALID';
  end if;
  request_checksum := md5(p_base_data_version::text || ':' || p_operations::text);

  select member.role into actor_role
    from public.workspace_members member
    where member.workspace_id = p_workspace_id and member.user_id = actor_id;
  if actor_role is null then
    raise exception using errcode = '42501', message = 'WORKSPACE_NOT_FOUND';
  end if;
  if actor_role not in ('owner', 'editor') then
    raise exception using errcode = '42501', message = 'FAMILY_COMMIT_FORBIDDEN';
  end if;

  select workspace.data_version into current_version
    from public.workspaces workspace
    where workspace.id = p_workspace_id
    for update;
  if current_version is null then
    raise exception using errcode = 'P0002', message = 'WORKSPACE_NOT_FOUND';
  end if;

  select * into existing_commit
    from public.commits commit_row
    where commit_row.workspace_id = p_workspace_id and commit_row.commit_id = p_commit_id;
  if found then
    if existing_commit.request_checksum <> request_checksum then
      raise exception using errcode = '22023', message = 'FAMILY_COMMIT_ID_REUSED';
    end if;
    if existing_commit.status <> 'applied' then
      raise exception using errcode = '55000', message = 'FAMILY_COMMIT_NOT_APPLIED';
    end if;
    current_snapshot := public._family_snapshot_json(p_workspace_id);
    return jsonb_build_object(
      'status', 'applied',
      'idempotent', true,
      'autoMerged', existing_commit.auto_merged,
      'dataVersion', current_version,
      'resultDataVersion', existing_commit.result_data_version,
      'appliedCount', existing_commit.operation_count,
      'counts', existing_commit.operation_counts,
      'snapshot', current_snapshot
    );
  end if;

  current_snapshot := public._family_snapshot_json(p_workspace_id);
  applied := public._family_apply_operations(current_snapshot, p_operations);
  conflicts := applied -> 'conflicts';
  if jsonb_array_length(conflicts) > 0 then
    return jsonb_build_object(
      'status', 'conflict',
      'conflicts', conflicts,
      'dataVersion', current_version,
      'snapshot', current_snapshot
    );
  end if;
  candidate := applied -> 'data';

  perform public._replace_family_data(p_workspace_id, candidate);
  next_version := current_version + 1;
  update public.workspaces set data_version = next_version where id = p_workspace_id;

  select coalesce(jsonb_object_agg(operation_type, count), '{}'::jsonb)
    into operation_counts
  from (
    select operation ->> 'type' as operation_type, count(*)::integer as count
    from jsonb_array_elements(p_operations) operation
    group by operation ->> 'type'
  ) counts;

  insert into public.commits (
    workspace_id, commit_id, actor_user_id, base_data_version, result_data_version,
    operation_count, operation_counts, status, auto_merged, request_checksum, client_created_at, applied_at
  ) values (
    p_workspace_id, p_commit_id, actor_id, p_base_data_version, next_version,
    operation_count, operation_counts, 'applied', p_base_data_version <> current_version,
    request_checksum, p_client_created_at, now()
  );

  select coalesce(profile.email::text, auth_user.email, 'unknown@example.invalid'),
         nullif(profile.display_name, '')
    into actor_email, actor_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  insert into public.activity_events (
    workspace_id, actor_user_id, actor_email, actor_name, action, entity_type,
    summary, metadata, occurred_at
  ) values (
    p_workspace_id, actor_id, actor_email, actor_name, 'family.commit', 'dataset',
    format('%s saved %s family changes', coalesce(actor_name, actor_email), operation_count),
    jsonb_build_object('commitId', p_commit_id, 'operationCount', operation_count, 'counts', operation_counts),
    now()
  );

  current_snapshot := public._family_snapshot_json(p_workspace_id);
  return jsonb_build_object(
    'status', 'applied',
    'idempotent', false,
    'autoMerged', p_base_data_version <> current_version,
    'dataVersion', next_version,
    'resultDataVersion', next_version,
    'appliedCount', operation_count,
    'counts', operation_counts,
    'snapshot', current_snapshot
  );
end;
$$;

create function public.get_family_commit_status(p_workspace_id uuid, p_commit_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  commit_row public.commits%rowtype;
  current_version bigint;
begin
  if actor_id is null or not exists (
    select 1 from public.workspace_members member
    where member.workspace_id = p_workspace_id and member.user_id = actor_id
  ) then
    raise exception using errcode = '42501', message = 'WORKSPACE_NOT_FOUND';
  end if;
  select * into commit_row from public.commits
    where workspace_id = p_workspace_id and commit_id = p_commit_id;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  select data_version into current_version from public.workspaces where id = p_workspace_id;
  return jsonb_build_object(
    'status', commit_row.status,
    'idempotent', true,
    'autoMerged', commit_row.auto_merged,
    'dataVersion', current_version,
    'resultDataVersion', commit_row.result_data_version,
    'appliedCount', commit_row.operation_count,
    'counts', commit_row.operation_counts,
    'snapshot', case when commit_row.status = 'applied' then public._family_snapshot_json(p_workspace_id) else null end
  );
end;
$$;

revoke all on function public._family_snapshot_json(uuid) from public, anon, authenticated;
revoke all on function public._family_find_entity(jsonb, text, text) from public, anon, authenticated;
revoke all on function public._family_remove_entity(jsonb, text, text) from public, anon, authenticated;
revoke all on function public._family_filter_person_references(jsonb, text) from public, anon, authenticated;
revoke all on function public._family_apply_operations(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._replace_family_data(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.commit_family_operations(uuid, text, bigint, jsonb, timestamptz) from public, anon;
revoke all on function public.get_family_commit_status(uuid, text) from public, anon;

grant execute on function public.commit_family_operations(uuid, text, bigint, jsonb, timestamptz) to authenticated;
grant execute on function public.get_family_commit_status(uuid, text) to authenticated;

comment on function public.commit_family_operations(uuid, text, bigint, jsonb, timestamptz)
  is 'Atomically applies a Famnesia operation batch with optimistic field conflicts and idempotent commit IDs';
