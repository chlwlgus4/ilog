drop policy if exists family_chat_presence_sessions_deny_direct_access
    on private.family_chat_presence_sessions;

create policy family_chat_presence_sessions_deny_direct_access
    on private.family_chat_presence_sessions
    for all
    to public
    using (false)
    with check (false);
