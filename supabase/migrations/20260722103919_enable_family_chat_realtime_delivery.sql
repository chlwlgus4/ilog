-- Family chat is delivered over Supabase Realtime WebSockets while the app is active.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'family_chat_messages'
    ) then
        alter publication supabase_realtime add table public.family_chat_messages;
    end if;
end;
$$;

-- Push delivery starts immediately after a chat insert. The existing cron job remains
-- as a recovery worker for transient failures and does not act as the primary path.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_family_chat_push()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
as $$
declare
    v_worker_secret text;
begin
    select decrypted_secret
    into v_worker_secret
    from vault.decrypted_secrets
    where name = 'babyboss_push_worker_cron_secret'
    limit 1;

    if nullif(v_worker_secret, '') is null then
        raise warning 'babyboss_push_worker_cron_secret is not configured';
        return new;
    end if;

    perform net.http_post(
        url := 'https://sflxzfxoyicpiykvgcte.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-worker-secret', v_worker_secret
        ),
        body := jsonb_build_object(
            'familyId', new.family_id,
            'eventTypes', jsonb_build_array('FAMILY_CHAT', 'FAMILY_CHAT_MENTION')
        ),
        timeout_milliseconds := 10000
    );

    return new;
exception
    when others then
        raise warning 'Could not dispatch family chat push worker: %', sqlerrm;
        return new;
end;
$$;

revoke all on function private.dispatch_family_chat_push() from public, anon, authenticated;

drop trigger if exists family_chat_messages_dispatch_push on public.family_chat_messages;
create trigger family_chat_messages_dispatch_push
after insert on public.family_chat_messages
for each row execute function private.dispatch_family_chat_push();
