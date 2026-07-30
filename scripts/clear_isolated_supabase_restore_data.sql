-- Clear data that is restored from an encrypted production backup.
-- This runs only after restore_supabase_backup_to_isolated_local.sh has required
-- explicit isolated-target confirmation. Keep this list aligned with the
-- schemas included by the database backup command.

set session_replication_role = replica;

truncate table
  auth.audit_log_entries,
  auth.custom_oauth_providers,
  auth.flow_state,
  auth.identities,
  auth.instances,
  auth.mfa_amr_claims,
  auth.mfa_challenges,
  auth.mfa_factors,
  auth.oauth_authorizations,
  auth.oauth_client_states,
  auth.oauth_clients,
  auth.oauth_consents,
  auth.one_time_tokens,
  auth.refresh_tokens,
  auth.saml_providers,
  auth.saml_relay_states,
  auth.sessions,
  auth.sso_domains,
  auth.sso_providers,
  auth.users,
  auth.webauthn_challenges,
  auth.webauthn_credentials,
  private.family_chat_presence_sessions,
  storage.objects,
  storage.buckets
restart identity cascade;
