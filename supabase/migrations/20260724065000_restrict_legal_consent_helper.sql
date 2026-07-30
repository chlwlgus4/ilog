-- Consent rows are written only as part of the email and Google completion flows.
-- The helper remains callable by its owning SECURITY DEFINER wrappers, but not by clients directly.
revoke all on function public.record_current_caregiver_legal_consents(text, text) from public;
revoke all on function public.record_current_caregiver_legal_consents(text, text) from anon;
revoke all on function public.record_current_caregiver_legal_consents(text, text) from authenticated;
