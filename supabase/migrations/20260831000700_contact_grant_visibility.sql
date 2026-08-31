drop policy encrypted_key_envelopes_select_recipient on public.encrypted_key_envelopes;
create policy encrypted_key_envelopes_select_recipient on public.encrypted_key_envelopes for select to authenticated
  using (revoked_at is null and recipient_principal_id=public.current_crypto_principal(workspace_id));

drop policy contact_grant_select_recipient on public.contact_recipient_grants;
create policy contact_grant_select_recipient on public.contact_recipient_grants for select to authenticated
  using (revoked_at is null and recipient_principal_id=public.current_crypto_principal(workspace_id));

comment on policy encrypted_key_envelopes_select_recipient on public.encrypted_key_envelopes is
  'CR-07 recipients can fetch only their currently active wrapped key envelopes; revoked epochs fail closed at RLS.';
