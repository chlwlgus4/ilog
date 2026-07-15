alter table public.tasks
    add column if not exists reminder_after_minutes integer,
    add column if not exists reminder_at timestamptz,
    add column if not exists reminder_sent_at timestamptz;

alter table public.tasks
    drop constraint if exists tasks_reminder_after_minutes_check;

alter table public.tasks
    add constraint tasks_reminder_after_minutes_check check (
        reminder_after_minutes is null
        or reminder_after_minutes between 1 and 1440
    );

alter table public.tasks
    drop constraint if exists tasks_reminder_schedule_check;

alter table public.tasks
    add constraint tasks_reminder_schedule_check check (
        (reminder_after_minutes is null and reminder_at is null)
        or (reminder_after_minutes is not null and reminder_at is not null)
    );

create table if not exists public.task_reminder_recipients (
    task_id bigint not null references public.tasks(id) on delete cascade,
    caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (task_id, caregiver_id)
);

create index if not exists idx_tasks_due_reminder
    on public.tasks(reminder_at)
    where reminder_at is not null
      and reminder_sent_at is null
      and status <> 'DONE';

create index if not exists idx_task_reminder_recipients_caregiver
    on public.task_reminder_recipients(caregiver_id, task_id);

alter table public.task_reminder_recipients enable row level security;

drop policy if exists task_reminder_recipients_insert_member on public.task_reminder_recipients;
create policy task_reminder_recipients_insert_member on public.task_reminder_recipients
    for insert to authenticated
    with check (
        exists (
            select 1
            from public.tasks task
            join public.caregivers caregiver on caregiver.id = task_reminder_recipients.caregiver_id
            where task.id = task_reminder_recipients.task_id
              and caregiver.family_id = task.family_id
              and public.is_family_member(task.family_id)
        )
    );

revoke all on public.task_reminder_recipients from anon;
grant insert on public.task_reminder_recipients to authenticated;

alter table public.push_notification_events
    drop constraint if exists push_notification_events_event_type_check;

alter table public.push_notification_events
    add constraint push_notification_events_event_type_check check (
        event_type in ('TIMELINE_COMMENT', 'TIMELINE_REPLY', 'FAMILY_CHAT', 'RECORD_ALARM', 'TASK_REMINDER')
    );

drop function if exists public.create_task_with_chat(bigint, bigint, bigint, text, text, timestamptz, text, integer);

create function public.create_task_with_chat(
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
set search_path = public
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

create or replace function public.enqueue_due_task_reminder_pushes(
    p_family_id bigint default null,
    p_limit integer default 50
)
returns integer
language plpgsql
set search_path = public
as $$
declare
    v_task public.tasks%rowtype;
    v_recipient_id bigint;
    v_enqueued integer := 0;
    v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
    update public.tasks task
    set reminder_sent_at = now()
    from public.families family
    where family.id = task.family_id
      and task.reminder_at is not null
      and task.reminder_sent_at is null
      and task.reminder_at <= now()
      and (p_family_id is null or task.family_id = p_family_id)
      and (task.status = 'DONE' or not family.push_notifications_enabled);

    for v_task in
        select task.*
        from public.tasks task
        join public.families family on family.id = task.family_id
        where task.reminder_at is not null
          and task.reminder_sent_at is null
          and task.reminder_at <= now()
          and task.status <> 'DONE'
          and family.push_notifications_enabled
          and (p_family_id is null or task.family_id = p_family_id)
        order by task.reminder_at asc
        limit v_limit
        for update of task skip locked
    loop
        for v_recipient_id in
            select caregiver_id
            from public.task_reminder_recipients
            where task_id = v_task.id
        loop
            insert into public.push_notification_events(
                family_id,
                recipient_caregiver_id,
                actor_caregiver_id,
                event_type,
                title,
                body,
                data
            ) values (
                v_task.family_id,
                v_recipient_id,
                v_task.created_by_id,
                'TASK_REMINDER',
                '할 일 알림',
                left(format('%s 알림 시간이에요.', v_task.title), 180),
                jsonb_build_object(
                    'taskId', v_task.id,
                    'route', '/home'
                )
            );
            v_enqueued := v_enqueued + 1;
        end loop;

        update public.tasks
        set reminder_sent_at = now()
        where id = v_task.id;
    end loop;

    return v_enqueued;
end;
$$;

revoke all on function public.enqueue_due_task_reminder_pushes(bigint, integer) from public, anon, authenticated;
grant execute on function public.create_task_with_chat(bigint, bigint, bigint, text, text, timestamptz, text, integer, integer, bigint[]) to authenticated;
grant execute on function public.enqueue_due_task_reminder_pushes(bigint, integer) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
    if not exists (
        select 1
        from vault.secrets
        where name = 'babyboss_push_worker_cron_secret'
    ) then
        raise exception 'The babyboss_push_worker_cron_secret Vault secret must be created before this migration runs.';
    end if;
end;
$$;

select cron.schedule(
    'babyboss-send-push-notifications',
    '* * * * *',
    $cron$
    select net.http_post(
        url := 'https://sflxzfxoyicpiykvgcte.supabase.co/functions/v1/send-push-notifications',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-worker-secret', (
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'babyboss_push_worker_cron_secret'
                limit 1
            )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
    );
    $cron$
);
