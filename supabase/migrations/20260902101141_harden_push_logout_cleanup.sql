-- A prior draft exposed a two-argument overload whose NULL device ID matched
-- every NULL-ID registration for the caregiver/platform. Remove that overload
-- explicitly so an upgraded environment cannot retain the broad delete path.
drop function if exists public.remove_current_push_device_token_checked(text, text);

-- Reassert the only supported, installation-exact overload after upgrade.
revoke all on function public.remove_current_push_device_token_checked(text, text, text)
    from public, anon;
grant execute on function public.remove_current_push_device_token_checked(text, text, text)
    to authenticated;
