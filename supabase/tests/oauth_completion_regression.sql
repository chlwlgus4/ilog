-- Runs only against a disposable local or isolated non-production Supabase DB.
-- The fixture is rolled back and verifies the authenticated consent wrapper.

begin;

do $$
declare
    v_user_id uuid := '00000000-0000-0000-0000-00000000a011';
    v_family_id bigint;
begin
    insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    ) values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        'oauth-invite-regression@example.test',
        '',
        now(),
        '{"provider":"google","providers":["google"]}',
        '{"full_name":"OAuth 초대 검증"}',
        now(),
        now()
    );

    insert into public.families(name, invite_code)
    values ('OAuth invite regression', 'OAUTH-REGRESSION')
    returning id into v_family_id;

    insert into public.children(family_id, name, birth_date, stage)
    values (v_family_id, 'OAuth child', current_date - 30, 'INFANT');

    insert into public.family_invitations(
        family_id,
        email,
        relationship,
        role,
        status
    ) values (
        v_family_id,
        'oauth-invite-regression@example.test',
        '보호자',
        'GUARDIAN',
        'PENDING'
    );

    perform set_config('ilog.test.oauth_user_id', v_user_id::text, true);
    perform set_config('ilog.test.oauth_family_id', v_family_id::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('ilog.test.oauth_user_id'), true);

do $$
declare
    v_result record;
    v_family_id bigint := current_setting('ilog.test.oauth_family_id')::bigint;
begin
    if has_function_privilege(
        current_user,
        'public.complete_oauth_caregiver(text)',
        'EXECUTE'
    ) then
        raise exception 'Authenticated can execute the internal OAuth helper directly';
    end if;

    select *
    into v_result
    from public.complete_oauth_caregiver_with_consent(
        'OAUTH-REGRESSION',
        null,
        null
    );

    if v_result.family_id is distinct from v_family_id then
        raise exception 'OAuth invite joined the wrong family: expected %, got %',
            v_family_id,
            v_result.family_id;
    end if;

    if not exists (
        select 1
        from public.family_invitations invitation
        where invitation.family_id = v_family_id
          and invitation.email = 'oauth-invite-regression@example.test'
          and invitation.status = 'ACCEPTED'
          and invitation.accepted_at is not null
    ) then
        raise exception 'OAuth invitation was not accepted';
    end if;

    if not exists (
        select 1
        from public.caregivers caregiver
        where caregiver.id = v_result.caregiver_id
          and caregiver.family_id = v_family_id
          and caregiver.auth_user_id = current_setting('ilog.test.oauth_user_id')::uuid
    ) then
        raise exception 'OAuth caregiver was not attached to the invited family';
    end if;
end;
$$;

reset role;
rollback;

select 'OAuth invitation completion regression checks passed' as result;
