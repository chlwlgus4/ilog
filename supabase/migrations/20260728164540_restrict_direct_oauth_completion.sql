-- The public completion helper is only invoked by the consent wrapper.
-- Keep it inaccessible to clients so they cannot bypass current legal-consent checks.
revoke all on function public.complete_oauth_caregiver(text) from public, anon, authenticated;
