alter table public.caregivers
    add column if not exists contact_phone text;

alter table public.caregivers
    drop constraint if exists caregivers_contact_phone_format_check;

alter table public.caregivers
    add constraint caregivers_contact_phone_format_check
    check (
        contact_phone is null
        or btrim(contact_phone) ~ '^[0-9+() -]{7,24}$'
    );

create or replace function public.update_caregiver_personal_info_checked(
    p_caregiver_id bigint,
    p_name text,
    p_role text,
    p_contact_phone text default null,
    p_current_password text default null,
    p_new_password text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_current public.caregivers%rowtype;
    v_name text := trim(coalesce(p_name, ''));
    v_role text := upper(trim(coalesce(p_role, '')));
    v_contact_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
    v_current_password text := coalesce(p_current_password, '');
    v_new_password text := coalesce(p_new_password, '');
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select * into v_current
    from public.caregivers
    where id = p_caregiver_id
      and auth_user_id = auth.uid()
    limit 1;

    if not found then
        raise exception 'Only your own profile can be updated';
    end if;

    if v_name = '' then
        raise exception 'Caregiver name is required';
    end if;

    if v_role not in ('MOM', 'DAD', 'GUARDIAN') then
        raise exception 'Invalid caregiver role';
    end if;

    if v_contact_phone is not null and v_contact_phone !~ '^[0-9+() -]{7,24}$' then
        raise exception 'Invalid contact phone';
    end if;

    if (v_current_password = '') <> (v_new_password = '') then
        raise exception 'Current password and new password are both required';
    end if;

    if v_new_password <> '' then
        if length(v_new_password) < 8 or v_new_password !~ '[A-Za-z]' or v_new_password !~ '[0-9]' then
            raise exception 'Password must be at least 8 characters and include letters and numbers';
        end if;

        if coalesce(v_current.password_hash, '') = '' then
            raise exception 'Caregiver password is not set';
        end if;

        if v_current.password_hash <> extensions.crypt(v_current_password, v_current.password_hash) then
            raise exception 'Current caregiver password is invalid';
        end if;
    end if;

    update public.caregivers
    set name = v_name,
        role = v_role,
        contact_phone = v_contact_phone,
        password_hash = case
            when v_new_password = '' then password_hash
            else extensions.crypt(v_new_password, extensions.gen_salt('bf'))
        end,
        updated_at = now()
    where id = v_current.id;

    return v_current.id;
end;
$$;

revoke all on function public.update_caregiver_personal_info_checked(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.update_caregiver_personal_info_checked(bigint, text, text, text, text, text) to authenticated;

-- Password and legacy PIN hashes are authentication data, not family profile data.
revoke select on table public.caregivers from authenticated;
grant select (
    id,
    family_id,
    auth_user_id,
    name,
    role,
    availability_score,
    fatigue_score,
    created_at,
    updated_at,
    image_url,
    email,
    contact_phone
) on table public.caregivers to authenticated;

create or replace function public.current_caregiver()
returns public.caregivers
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_caregiver public.caregivers%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Supabase auth session is required';
    end if;

    select * into v_caregiver
    from public.caregivers
    where auth_user_id = auth.uid()
    order by updated_at desc
    limit 1;

    if not found then
        raise exception 'Current caregiver was not found';
    end if;

    -- This row is shared by many server-side helpers. Never return credential hashes to the caller.
    v_caregiver.pin_hash := '';
    v_caregiver.password_hash := '';

    return v_caregiver;
end;
$$;

revoke all on function public.current_caregiver() from public, anon, authenticated;
grant execute on function public.current_caregiver() to authenticated;

create or replace function public.select_task_assignee(p_family_id bigint)
returns public.caregivers
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
    v_current public.caregivers%rowtype;
    v_caregiver public.caregivers%rowtype;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then
        raise exception 'Family access denied';
    end if;

    select c.* into v_caregiver
    from public.caregivers c
    left join lateral (
        select count(*)::numeric as recent_completed_tasks
        from public.tasks t
        where t.assignee_id = c.id
          and t.family_id = p_family_id
          and t.status = 'DONE'
          and t.completed_at >= now() - interval '7 days'
    ) rc on true
    left join lateral (
        select count(*)::numeric as pending_tasks_today
        from public.tasks t
        where t.assignee_id = c.id
          and t.family_id = p_family_id
          and t.status <> 'DONE'
          and t.due_at between date_trunc('day', now()) and date_trunc('day', now()) + interval '1 day' - interval '1 millisecond'
    ) pt on true
    where c.family_id = p_family_id
    order by
        round(
            (
                coalesce(rc.recent_completed_tasks, 0) * 0.45
                + coalesce(pt.pending_tasks_today, 0) * 0.80
                + ((10 - c.availability_score) * 0.35)
                + (c.fatigue_score * 0.45)
            )::numeric,
            2
        ) asc,
        coalesce(pt.pending_tasks_today, 0) asc,
        c.id asc
    limit 1;

    if not found then
        raise exception 'Assignable caregiver was not found';
    end if;

    v_caregiver.pin_hash := '';
    v_caregiver.password_hash := '';
    return v_caregiver;
end;
$$;

create or replace function public.create_task_with_chat(
    p_family_id bigint,
    p_child_id bigint,
    p_assignee_id bigint,
    p_title text,
    p_description text,
    p_due_at timestamptz,
    p_priority text default 'MEDIUM',
    p_reminder_minutes_before integer default null,
    p_reminder_after_minutes integer default null,
    p_reminder_recipient_ids bigint[] default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_assignee public.caregivers%rowtype;
    v_task public.tasks%rowtype;
    v_title text := trim(coalesce(p_title, ''));
    v_priority text := coalesce(p_priority, 'MEDIUM');
    v_reminder_at timestamptz;
    v_recipient_id bigint;
    v_recipient_ids bigint[];
    v_reminder_message text := '';
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if v_title = '' then raise exception 'Task title is required'; end if;
    if p_due_at is null then raise exception 'Task due time is required'; end if;
    if v_priority not in ('HIGH', 'MEDIUM', 'LOW') then raise exception 'Invalid task priority'; end if;
    if p_reminder_minutes_before is not null and (p_reminder_minutes_before < 5 or p_reminder_minutes_before > 1440) then raise exception 'Reminder minutes must be between 5 and 1440'; end if;
    if p_reminder_after_minutes is not null and (p_reminder_after_minutes < 1 or p_reminder_after_minutes > 1440) then raise exception 'Reminder minutes must be between 1 and 1440'; end if;

    if p_reminder_after_minutes is not null then
        v_reminder_at := now() + make_interval(mins => p_reminder_after_minutes);
    end if;

    v_child := public.resolve_family_child(p_family_id, p_child_id);

    if p_assignee_id is not null then
        select * into v_assignee from public.caregivers where id = p_assignee_id and family_id = p_family_id limit 1;
        if not found then raise exception 'Assignee caregiver was not found'; end if;
    else
        v_assignee := public.select_task_assignee(p_family_id);
    end if;

    insert into public.tasks(
        family_id,
        child_id,
        assignee_id,
        created_by_id,
        title,
        description,
        due_at,
        priority,
        status,
        auto_assigned,
        reminder_minutes_before,
        reminder_after_minutes,
        reminder_at
    )
    values (
        p_family_id,
        v_child.id,
        v_assignee.id,
        v_current.id,
        v_title,
        nullif(trim(coalesce(p_description, '')), ''),
        p_due_at,
        v_priority,
        'PENDING',
        p_assignee_id is null,
        p_reminder_minutes_before,
        p_reminder_after_minutes,
        v_reminder_at
    )
    returning * into v_task;

    if v_task.reminder_after_minutes is not null then
        select array_agg(distinct recipient_id)
        into v_recipient_ids
        from unnest(
            coalesce(p_reminder_recipient_ids, array[]::bigint[])
            || array[v_assignee.id, v_current.id]
        ) as recipient_id
        where recipient_id is not null;

        foreach v_recipient_id in array v_recipient_ids loop
            perform 1
            from public.caregivers
            where id = v_recipient_id
              and family_id = p_family_id;

            if not found then
                raise exception 'Reminder recipient caregiver was not found';
            end if;

            insert into public.task_reminder_recipients(task_id, caregiver_id)
            values (v_task.id, v_recipient_id)
            on conflict do nothing;
        end loop;

        v_reminder_message := format(' %s분 뒤 담당자와 작성자에게 알림을 보낼게요.', v_task.reminder_after_minutes);
    elsif v_task.reminder_minutes_before is not null then
        v_reminder_message := format(' 리마인더는 %s분 전에 알려드릴게요.', v_task.reminder_minutes_before);
    end if;

    insert into public.chat_messages(family_id, sender_id, body, message_type, linked_task_id)
    values (p_family_id, v_current.id, format('%s님 담당으로 %s 일을 등록했어요.%s', v_assignee.name, v_task.title, v_reminder_message), 'TASK_LINK', v_task.id);

    return v_task;
end;
$$;

revoke all on function public.select_task_assignee(bigint) from public, anon, authenticated;
revoke all on function public.create_task_with_chat(bigint, bigint, bigint, text, text, timestamptz, text, integer, integer, bigint[]) from public, anon;
grant execute on function public.select_task_assignee(bigint) to authenticated;
grant execute on function public.create_task_with_chat(bigint, bigint, bigint, text, text, timestamptz, text, integer, integer, bigint[]) to authenticated;
