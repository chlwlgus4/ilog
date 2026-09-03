-- Family content safety. Additive API contracts; no membership changes, shared
-- record deletion, copied message/photo snapshots, or automatic image analysis.
-- Deploy this migration before the updated push worker and mobile client.

create table private.safety_reports (
    id bigint generated always as identity primary key,
    family_id bigint not null references public.families(id) on delete cascade,
    reporter_caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    target_type text not null,
    target_id bigint not null check (target_id > 0),
    reported_caregiver_id bigint references public.caregivers(id) on delete cascade,
    reason text not null check (reason in ('CHILD_SAFETY','HARASSMENT','SEXUAL_CONTENT','VIOLENCE','SPAM','PRIVACY','OTHER')),
    details text check (char_length(details) <= 1000),
    status text not null default 'OPEN' check (status in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
    last_action text check (last_action in ('IN_REVIEW','DISMISS','HIDE_CONTENT','RESTORE_CONTENT','RESTRICT_USER','UNRESTRICT_USER')),
    operator_note text check (char_length(operator_note) <= 1000),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    resolved_at timestamptz,
    unique (reporter_caregiver_id, target_type, target_id)
);
create index safety_reports_queue_idx on private.safety_reports(status, created_at);
create index safety_reports_reporter_rate_idx on private.safety_reports(reporter_caregiver_id, created_at);
create index safety_reports_family_idx on private.safety_reports(family_id);
create index safety_reports_subject_idx on private.safety_reports(reported_caregiver_id);
create index safety_reports_retention_idx on private.safety_reports(resolved_at) where resolved_at is not null;

create table private.caregiver_blocks (
    family_id bigint not null references public.families(id) on delete cascade,
    blocker_caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    blocked_caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_caregiver_id, blocked_caregiver_id),
    check (blocker_caregiver_id <> blocked_caregiver_id)
);
create index caregiver_blocks_reverse_idx on private.caregiver_blocks(blocked_caregiver_id, blocker_caregiver_id);
create index caregiver_blocks_family_idx on private.caregiver_blocks(family_id);

-- Personal hides outlive the report's 90-day resolution retention window.
create table private.reported_content_hides (
    family_id bigint not null references public.families(id) on delete cascade,
    caregiver_id bigint not null references public.caregivers(id) on delete cascade,
    target_type text not null,
    target_id bigint not null,
    created_at timestamptz not null default now(),
    primary key (caregiver_id, target_type, target_id)
);
create index reported_content_hides_family_idx on private.reported_content_hides(family_id);

create table private.moderation_content_hides (
    family_id bigint not null references public.families(id) on delete cascade,
    target_type text not null,
    target_id bigint not null,
    created_at timestamptz not null default now(),
    primary key (family_id, target_type, target_id)
);
create table private.moderation_restrictions (
    caregiver_id bigint primary key references public.caregivers(id) on delete cascade,
    family_id bigint not null references public.families(id) on delete cascade,
    created_at timestamptz not null default now()
);
create index moderation_restrictions_family_idx on private.moderation_restrictions(family_id);

alter table private.safety_reports enable row level security;
alter table private.caregiver_blocks enable row level security;
alter table private.reported_content_hides enable row level security;
alter table private.moderation_content_hides enable row level security;
alter table private.moderation_restrictions enable row level security;
revoke all on private.safety_reports, private.caregiver_blocks,
    private.reported_content_hides, private.moderation_content_hides,
    private.moderation_restrictions from public, anon, authenticated, service_role;
revoke all on sequence private.safety_reports_id_seq from public, anon, authenticated, service_role;

create function private.require_safety_caregiver()
returns public.caregivers language plpgsql security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype;
begin
    if auth.uid() is null or not exists (
        select 1 from auth.users u where u.id = auth.uid()
          and not coalesce(u.is_anonymous, false) and u.deleted_at is null
    ) then
        raise exception 'CONTENT_SAFETY_AUTH_REQUIRED' using errcode = '42501';
    end if;
    v_current := public.current_caregiver();
    return v_current;
end;
$$;

-- Identifiers are selected exclusively from this server-owned allowlist.
create function private.resolve_safety_target(p_type text, p_id bigint)
returns table(family_id bigint, author_id bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_table text; v_author text;
begin
    select m.table_name, m.author_column into v_table, v_author from (values
        ('FAMILY_CHAT_MESSAGE','family_chat_messages','sender_caregiver_id'),
        ('CHAT_MESSAGE','chat_messages','sender_id'),
        ('TIMELINE_COMMENT','timeline_comments','author_caregiver_id'),
        ('FAMILY_PHOTO','family_photos','created_by_id'),
        ('RECORD_ATTACHMENT','record_attachments','created_by_id'),
        ('LOG','logs','caregiver_id'),
        ('GROWTH_MEASUREMENT','growth_measurements','caregiver_id'),
        ('VACCINATION_RECORD','vaccination_records','created_by_id'),
        ('HOSPITAL_VISIT','hospital_visits','created_by_id'),
        ('MEMORY_ENTRY','memory_entries','created_by_id'),
        ('TASK','tasks','created_by_id'),
        ('SCHEDULE','schedules','created_by_id'),
        ('CAREGIVER','caregivers','id')
    ) m(kind, table_name, author_column) where m.kind = p_type;
    if v_table is null or p_id is null or p_id <= 0 then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode = '22023';
    end if;
    return query execute pg_catalog.format(
        'select t.family_id, t.%I from public.%I t where t.id = $1', v_author, v_table
    ) using p_id;
end;
$$;

create function private.caregiver_contact_blocked(p_family bigint, p_first bigint, p_second bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select p_first is not null and p_second is not null and exists (
        select 1 from private.caregiver_blocks b where b.family_id = p_family
          and ((b.blocker_caregiver_id = p_first and b.blocked_caregiver_id = p_second)
            or (b.blocker_caregiver_id = p_second and b.blocked_caregiver_id = p_first))
    );
$$;

create function private.safety_visible_to(
    p_viewer bigint, p_family bigint, p_type text, p_id bigint, p_author bigint, p_contact boolean
)
returns boolean language sql stable security definer set search_path = '' as $$
    select p_viewer is not null
      and exists (select 1 from public.caregivers c where c.id = p_viewer and c.family_id = p_family)
      and not exists (select 1 from private.reported_content_hides h
          where h.family_id = p_family and h.caregiver_id = p_viewer
            and ((h.target_type = p_type and h.target_id = p_id)
              or (p_contact and h.target_type = 'CAREGIVER' and h.target_id = p_author)))
      and (coalesce(p_author = p_viewer,false) or not exists (select 1 from private.moderation_content_hides h
          where h.family_id = p_family and h.target_type = p_type and h.target_id = p_id))
      and (not p_contact or not private.caregiver_contact_blocked(p_family, p_viewer, p_author));
$$;

-- This tiny policy helper is callable, but cannot select another viewer or
-- cross a family boundary. Internal helpers/tables remain inaccessible.
create function public.content_safety_visible(
    p_type text, p_id bigint, p_family bigint, p_author bigint, p_contact boolean default false
)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.safety_visible_to(c.id, p_family, p_type, p_id, p_author, p_contact)
    from public.caregivers c where c.auth_user_id = (select auth.uid()) and c.family_id = p_family;
$$;

create function public.report_safety_content_checked(
    p_target_type text, p_target_id bigint, p_reason text, p_details text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_current public.caregivers%rowtype; v_target record; v_report private.safety_reports%rowtype;
    v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
    v_current := private.require_safety_caregiver();
    if p_reason is null or p_reason not in ('CHILD_SAFETY','HARASSMENT','SEXUAL_CONTENT','VIOLENCE','SPAM','PRIVACY','OTHER')
       or char_length(coalesce(v_details, '')) > 1000
       or (p_reason = 'OTHER' and char_length(coalesce(v_details, '')) < 10) then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode = '22023';
    end if;
    select * into v_target from private.resolve_safety_target(p_target_type, p_target_id);
    if not found or v_target.family_id is distinct from v_current.family_id then
        raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND' using errcode = '42501';
    end if;
    if v_target.author_id = v_current.id then
        raise exception 'CONTENT_SAFETY_SELF_REPORT' using errcode = '22023';
    end if;
    -- Serialize per reporter so concurrent requests cannot evade the quota.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('safety-report:' || v_current.id::text, 0));
    select * into v_report from private.safety_reports r
      where r.reporter_caregiver_id = v_current.id and r.target_type = p_target_type and r.target_id = p_target_id;
    if found then
        return jsonb_build_object('report_id',v_report.id,'status',v_report.status,'already_reported',true);
    end if;
    if (select count(*) from private.safety_reports r where r.reporter_caregiver_id = v_current.id
          and r.created_at > now() - interval '1 hour') >= 5
       or (select count(*) from private.safety_reports r where r.reporter_caregiver_id = v_current.id
          and r.created_at > now() - interval '24 hours') >= 20 then
        raise exception 'CONTENT_SAFETY_RATE_LIMITED' using errcode = '54000';
    end if;
    insert into private.safety_reports(family_id,reporter_caregiver_id,target_type,target_id,reported_caregiver_id,reason,details)
    values(v_current.family_id,v_current.id,p_target_type,p_target_id,v_target.author_id,p_reason,v_details)
    returning * into v_report;
    insert into private.reported_content_hides(family_id,caregiver_id,target_type,target_id)
    values(v_current.family_id,v_current.id,p_target_type,p_target_id) on conflict do nothing;
    return jsonb_build_object('report_id',v_report.id,'status',v_report.status,'already_reported',false);
end;
$$;

create function public.block_caregiver_checked(p_target_caregiver_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype;
begin
    v_current := private.require_safety_caregiver();
    if p_target_caregiver_id = v_current.id then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode = '22023';
    end if;
    if not exists(select 1 from public.caregivers c where c.id = p_target_caregiver_id and c.family_id = v_current.family_id) then
        raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND' using errcode = '42501';
    end if;
    insert into private.caregiver_blocks(family_id,blocker_caregiver_id,blocked_caregiver_id)
    values(v_current.family_id,v_current.id,p_target_caregiver_id) on conflict do nothing;
    -- Do not remove tokens, membership, records, or the other user's block.
    update public.push_notification_events e set status='SKIPPED', processing_started_at=null,
      error_message='Content safety contact restriction', updated_at=now()
    where e.family_id=v_current.family_id and e.status in ('PENDING','PROCESSING')
      and ((e.actor_caregiver_id=v_current.id and e.recipient_caregiver_id=p_target_caregiver_id)
        or (e.actor_caregiver_id=p_target_caregiver_id and e.recipient_caregiver_id=v_current.id));
end;
$$;

create function public.unblock_caregiver_checked(p_target_caregiver_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype;
begin
    v_current := private.require_safety_caregiver();
    delete from private.caregiver_blocks b where b.family_id=v_current.family_id
      and b.blocker_caregiver_id=v_current.id and b.blocked_caregiver_id=p_target_caregiver_id;
end;
$$;

create function public.list_blocked_caregivers_checked()
returns table(caregiver_id bigint, name text, blocked_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype;
begin
    v_current := private.require_safety_caregiver();
    return query select c.id,c.name,b.created_at from private.caregiver_blocks b
      join public.caregivers c on c.id=b.blocked_caregiver_id and c.family_id=b.family_id
      where b.blocker_caregiver_id=v_current.id and b.family_id=v_current.family_id order by b.created_at desc,c.id;
end;
$$;

create function public.get_my_content_safety_state_checked()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype;
begin
    v_current := private.require_safety_caregiver();
    return jsonb_build_object(
      'blocked_caregiver_ids',coalesce((select jsonb_agg(b.id order by b.id) from (
          select b.blocked_caregiver_id as id from private.caregiver_blocks b where b.blocker_caregiver_id=v_current.id
          union select b.blocker_caregiver_id from private.caregiver_blocks b where b.blocked_caregiver_id=v_current.id
        ) b),'[]'::jsonb),
      'hidden_targets',coalesce((select jsonb_agg(jsonb_build_object('target_type',h.target_type,'target_id',h.target_id)) from (
          select h.target_type,h.target_id from private.reported_content_hides h where h.caregiver_id=v_current.id
          union select h.target_type,h.target_id from private.moderation_content_hides h
            cross join lateral private.resolve_safety_target(h.target_type,h.target_id) t
            where h.family_id=v_current.family_id and t.author_id is distinct from v_current.id
        ) h),'[]'::jsonb));
end;
$$;

-- Restrictive policies combine with, never replace, existing family/owner RLS.
do $$
declare v record;
begin
    for v in select * from (values
      ('family_chat_messages','FAMILY_CHAT_MESSAGE','sender_caregiver_id',true),
      ('chat_messages','CHAT_MESSAGE','sender_id',true),
      ('timeline_comments','TIMELINE_COMMENT','author_caregiver_id',true),
      ('family_photos','FAMILY_PHOTO','created_by_id',false),
      ('record_attachments','RECORD_ATTACHMENT','created_by_id',false),
      ('logs','LOG','caregiver_id',false),
      ('growth_measurements','GROWTH_MEASUREMENT','caregiver_id',false),
      ('vaccination_records','VACCINATION_RECORD','created_by_id',false),
      ('hospital_visits','HOSPITAL_VISIT','created_by_id',false),
      ('memory_entries','MEMORY_ENTRY','created_by_id',false),
      ('tasks','TASK','created_by_id',false),
      ('schedules','SCHEDULE','created_by_id',false)
    ) m(table_name,kind,author_column,is_contact) loop
        execute pg_catalog.format(
          'create policy content_safety_select on public.%I as restrictive for select to authenticated using (public.content_safety_visible(%L,id,family_id,%I,%L))',
          v.table_name,v.kind,v.author_column,v.is_contact);
    end loop;
end;
$$;

-- Do not leak comments/attachments through a parent which is hidden.
create function public.content_safety_comment_parent_visible(p_message_id bigint, p_parent_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.chat_messages m
        where m.id=p_message_id and public.content_safety_visible('CHAT_MESSAGE',m.id,m.family_id,m.sender_id,true))
      and (p_parent_id is null or exists(select 1 from public.timeline_comments c
        where c.id=p_parent_id and c.chat_message_id=p_message_id
          and public.content_safety_visible('TIMELINE_COMMENT',c.id,c.family_id,c.author_caregiver_id,true)));
$$;
create policy content_safety_parent_select on public.timeline_comments as restrictive for select to authenticated
    using (public.content_safety_comment_parent_visible(chat_message_id,parent_comment_id));
create policy content_safety_attachment_select on public.record_attachments as restrictive for select to authenticated
    using ((log_id is null or exists(select 1 from public.logs l where l.id=log_id))
       and (memory_entry_id is null or exists(select 1 from public.memory_entries m where m.id=memory_entry_id)));

-- A small deterministic, server-side text safety filter, not an AI/image
-- classifier. Narrow phrases avoid blocking routine pediatric/medical notes.
create function private.assert_content_safety_text(p_text text)
returns void language plpgsql immutable set search_path = '' as $$
declare v_normalized text;
begin
    if char_length(coalesce(p_text,'')) > 20000 then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode='22023';
    end if;
    v_normalized := lower(regexp_replace(normalize(coalesce(p_text,''),NFKC), '[[:space:][:punct:]​‌‍﻿]+', '', 'g'));
    if v_normalized ~ '(씨발|씨팔|개새끼|병신|죽여버리|죽여버릴|너를죽일|널죽일|아동성착취물|아동포르노|미성년자성착취물|childporn|childsexualabusematerial|iwillkillyou)' then
        raise exception 'CONTENT_SAFETY_FILTERED' using errcode='22023';
    end if;
end;
$$;

create function private.enforce_content_safety_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_new jsonb:=to_jsonb(new); v_old jsonb; v_text text:=''; v_old_text text:=''; v_column text;
    v_actor bigint; v_family bigint; v_author bigint; v_parent record; v_recipient record;
begin
    if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
    foreach v_column in array string_to_array(tg_argv[1],',') loop
        v_text:=v_text || coalesce(v_new->>v_column,'') || E'\n';
        v_old_text:=v_old_text || coalesce(v_old->>v_column,'') || E'\n';
    end loop;
    -- FK SET NULL/redaction during trusted account deletion must remain valid.
    -- The existing immutable-author trigger independently denies direct edits.
    if tg_op='UPDATE' and v_new->>tg_argv[0] is null and v_old->>tg_argv[0] is not null then return new; end if;
    if tg_op='UPDATE' and v_text=v_old_text
       and (v_new->'image_url') is not distinct from (v_old->'image_url')
       and (v_new->'storage_path') is not distinct from (v_old->'storage_path')
       and (v_new->'image_storage_path') is not distinct from (v_old->'image_storage_path')
       and (v_new->'chat_message_id') is not distinct from (v_old->'chat_message_id')
       and (v_new->'parent_comment_id') is not distinct from (v_old->'parent_comment_id') then return new; end if;
    perform private.assert_content_safety_text(v_text);
    v_family:=(v_new->>'family_id')::bigint;
    v_author:=(v_new->>tg_argv[0])::bigint;
    select c.id into v_actor from public.caregivers c where c.auth_user_id=auth.uid();
    if v_actor is not null and exists(select 1 from private.moderation_restrictions r where r.caregiver_id=v_actor) then
        raise exception 'CONTENT_SAFETY_USER_RESTRICTED' using errcode='42501';
    end if;
    if tg_table_name in ('family_chat_messages','chat_messages','timeline_comments') and v_actor is not null then
        for v_recipient in select c.id,c.name from public.caregivers c where c.family_id=v_family and c.id<>v_actor loop
            if private.caregiver_contact_blocked(v_family,v_actor,v_recipient.id)
               and position(lower('@'||v_recipient.name) in lower(v_text))>0 then
                raise exception 'CAREGIVER_CONTACT_BLOCKED' using errcode='42501';
            end if;
        end loop;
    end if;
    if tg_table_name='timeline_comments' then
        select m.family_id,m.sender_id as author_id into v_parent from public.chat_messages m where m.id=new.chat_message_id;
        if not found or v_parent.family_id<>v_family then
            raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND' using errcode='42501';
        end if;
        if private.caregiver_contact_blocked(v_family,v_author,v_parent.author_id) then
            raise exception 'CAREGIVER_CONTACT_BLOCKED' using errcode='42501';
        end if;
        if v_actor is not null and not public.content_safety_comment_parent_visible(new.chat_message_id,new.parent_comment_id) then
            raise exception 'CAREGIVER_CONTACT_BLOCKED' using errcode='42501';
        end if;
        if new.parent_comment_id is not null then
            select c.family_id,c.author_caregiver_id as author_id,c.chat_message_id,c.parent_comment_id into v_parent
              from public.timeline_comments c where c.id=new.parent_comment_id;
            if not found or v_parent.family_id<>v_family or v_parent.chat_message_id<>new.chat_message_id
               or v_parent.parent_comment_id is not null then
                raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND' using errcode='42501';
            end if;
            if private.caregiver_contact_blocked(v_family,v_author,v_parent.author_id) then
                raise exception 'CAREGIVER_CONTACT_BLOCKED' using errcode='42501';
            end if;
        end if;
    end if;
    return new;
end;
$$;

do $$
declare v record;
begin
    for v in select * from (values
      ('family_chat_messages','sender_caregiver_id','body'),
      ('chat_messages','sender_id','body'),
      ('timeline_comments','author_caregiver_id','body'),
      ('family_photos','created_by_id','caption'),
      ('logs','caregiver_id','entry_value,note,details'),
      ('growth_measurements','caregiver_id','note'),
      ('vaccination_records','created_by_id','name,dose_label,note'),
      ('hospital_visits','created_by_id','hospital_name,reason,diagnosis,note'),
      ('memory_entries','created_by_id','title,note,tag'),
      ('tasks','created_by_id','title,description'),
      ('schedules','created_by_id','title,note'),
      ('record_attachments','created_by_id','caption'),
      ('caregivers','id','name'),
      ('children','id','name'),
      ('families','owner_caregiver_id','name'),
      ('family_invitations','invited_by_id','relationship,note')
    ) m(table_name,author_column,text_columns) loop
        execute pg_catalog.format('create trigger content_safety_write before insert or update on public.%I for each row execute function private.enforce_content_safety_write(%L,%L)',v.table_name,v.author_column,v.text_columns);
    end loop;
end;
$$;

-- Private media must obey the same visibility rules as its referencing row.
-- Existing signed URLs are bearer credentials and can remain valid until their
-- existing ten-minute expiry; this policy prevents issuing new ones.
create function public.content_safety_media_visible(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_current public.caregivers%rowtype; v_row record;
begin
    v_current:=public.current_caregiver();
    if split_part(p_path,'/',2) is distinct from v_current.family_id::text then return false; end if;
    for v_row in select p.id,p.family_id,p.created_by_id from public.family_photos p where p.storage_path=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'FAMILY_PHOTO',v_row.id,v_row.created_by_id,false) then return false; end if;
    end loop;
    for v_row in select m.id,m.family_id,m.sender_caregiver_id from public.family_chat_messages m where m.image_storage_path=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'FAMILY_CHAT_MESSAGE',v_row.id,v_row.sender_caregiver_id,true) then return false; end if;
    end loop;
    for v_row in select m.id,m.family_id,m.created_by_id from public.memory_entries m where m.image_url=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'MEMORY_ENTRY',v_row.id,v_row.created_by_id,false) then return false; end if;
    end loop;
    for v_row in select a.id,a.family_id,a.created_by_id from public.record_attachments a where a.image_url=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'RECORD_ATTACHMENT',v_row.id,v_row.created_by_id,false) then return false; end if;
    end loop;
    for v_row in select l.id,l.family_id,l.caregiver_id from public.record_attachments a
      join public.logs l on l.id=a.log_id where a.image_url=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'LOG',v_row.id,v_row.caregiver_id,false) then return false; end if;
    end loop;
    for v_row in select m.id,m.family_id,m.created_by_id from public.record_attachments a
      join public.memory_entries m on m.id=a.memory_entry_id where a.image_url=p_path loop
        if not private.safety_visible_to(v_current.id,v_row.family_id,'MEMORY_ENTRY',v_row.id,v_row.created_by_id,false) then return false; end if;
    end loop;
    return true;
end;
$$;
create function public.content_safety_upload_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.caregivers c where c.auth_user_id=auth.uid()
      and not exists(select 1 from private.moderation_restrictions r where r.caregiver_id=c.id));
$$;
create policy content_safety_media_select on storage.objects as restrictive for select to authenticated
    using (bucket_id<>'family-media' or public.content_safety_media_visible(name));
create policy content_safety_media_insert on storage.objects as restrictive for insert to authenticated
    with check (bucket_id<>'family-media' or public.content_safety_upload_allowed());
create policy content_safety_media_update on storage.objects as restrictive for update to authenticated
    using (bucket_id<>'family-media' or public.content_safety_upload_allowed())
    with check (bucket_id<>'family-media' or public.content_safety_upload_allowed());

create function private.safety_push_target_hidden(p_viewer bigint,p_family bigint,p_type text,p_value text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_id bigint;
begin
    if p_value is null then return false; end if;
    if p_value !~ '^[0-9]{1,18}$' then return true; end if;
    v_id:=p_value::bigint;
    return exists(select 1 from private.reported_content_hides h where h.caregiver_id=p_viewer and h.family_id=p_family
        and h.target_type=p_type and h.target_id=v_id)
      or exists(select 1 from private.moderation_content_hides h where h.family_id=p_family and h.target_type=p_type and h.target_id=v_id);
end;
$$;

create function private.push_content_safety_allowed(p_event public.push_notification_events)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_record_type text;
begin
    if private.caregiver_contact_blocked(p_event.family_id,p_event.actor_caregiver_id,p_event.recipient_caregiver_id)
       or exists(select 1 from private.moderation_restrictions r where r.caregiver_id=p_event.actor_caregiver_id)
       or exists(select 1 from private.reported_content_hides h where h.caregiver_id=p_event.recipient_caregiver_id
          and h.family_id=p_event.family_id and h.target_type='CAREGIVER' and h.target_id=p_event.actor_caregiver_id) then return false; end if;
    if private.safety_push_target_hidden(p_event.recipient_caregiver_id,p_event.family_id,'FAMILY_CHAT_MESSAGE',p_event.data->>'familyChatMessageId')
       or private.safety_push_target_hidden(p_event.recipient_caregiver_id,p_event.family_id,'CHAT_MESSAGE',p_event.data->>'chatMessageId')
       or private.safety_push_target_hidden(p_event.recipient_caregiver_id,p_event.family_id,'TIMELINE_COMMENT',p_event.data->>'commentId')
       or private.safety_push_target_hidden(p_event.recipient_caregiver_id,p_event.family_id,'TASK',p_event.data->>'taskId') then return false; end if;
    v_record_type:=case when p_event.data->>'recordSource'='GROWTH_MEASUREMENT' then 'GROWTH_MEASUREMENT'
      when p_event.data->>'recordType'='VACCINATION' then 'VACCINATION_RECORD'
      when p_event.data->>'recordType'='HOSPITAL' then 'HOSPITAL_VISIT' else 'LOG' end;
    return not private.safety_push_target_hidden(p_event.recipient_caregiver_id,p_event.family_id,v_record_type,p_event.data->>'recordId');
end;
$$;

create function private.enforce_push_content_safety()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op='INSERT' then perform private.assert_content_safety_text(new.title || E'\n' || new.body); end if;
    if new.status in ('PENDING','PROCESSING') and not private.push_content_safety_allowed(new) then
        new.status:='SKIPPED'; new.processing_started_at:=null;
        new.error_message:='Content safety contact restriction';
    end if;
    return new;
end;
$$;
create trigger content_safety_push_write before insert or update on public.push_notification_events
    for each row execute function private.enforce_push_content_safety();

-- The inbox cannot expose a blocked sender's old events either.
create function public.content_safety_push_visible(p_event_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select private.push_content_safety_allowed(e) from public.push_notification_events e
      join public.caregivers c on c.auth_user_id=auth.uid() and c.family_id=e.family_id
      where e.id=p_event_id and (e.recipient_caregiver_id=c.id or e.actor_caregiver_id=c.id);
$$;
create policy content_safety_push_select on public.push_notification_events as restrictive for select to authenticated
    using (public.content_safety_push_visible(id));

create or replace function public.claim_pending_push_notification_events(
    p_family_id bigint default null,p_event_types text[] default null,p_limit integer default 25
)
returns setof public.push_notification_events language plpgsql security definer set search_path = '' as $$
begin
    update public.push_notification_events e set status='SKIPPED',processing_started_at=null,
        error_message='Content safety contact restriction or active chat viewer',updated_at=now()
    where (e.status='PENDING' or (e.status='PROCESSING' and e.processing_started_at<now()-interval '5 minutes'))
      and (p_family_id is null or e.family_id=p_family_id)
      and (coalesce(array_length(p_event_types,1),0)=0 or e.event_type=any(p_event_types))
      and (not private.push_content_safety_allowed(e) or (e.event_type in ('FAMILY_CHAT','FAMILY_CHAT_MENTION')
        and exists(select 1 from private.family_chat_presence_sessions s where s.family_id=e.family_id
          and s.caregiver_id=e.recipient_caregiver_id and s.last_seen_at>=clock_timestamp()-interval '45 seconds')));
    return query with candidates as (
      select e.id from public.push_notification_events e
      where (e.status='PENDING' or (e.status='PROCESSING' and e.processing_started_at<now()-interval '5 minutes'))
        and (p_family_id is null or e.family_id=p_family_id)
        and (coalesce(array_length(p_event_types,1),0)=0 or e.event_type=any(p_event_types))
        and private.push_content_safety_allowed(e)
      order by e.created_at,e.id for update skip locked limit greatest(1,least(coalesce(p_limit,25),100))
    ), claimed as (
      update public.push_notification_events e set status='PROCESSING',processing_started_at=now(),updated_at=now()
      from candidates c where e.id=c.id returning e.*
    ) select * from claimed where status='PROCESSING';
end;
$$;

-- Recheck just before every external delivery, not only at queue claim time.
create function public.can_deliver_content_safety_push_checked(p_event_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select e.status='PROCESSING' and private.push_content_safety_allowed(e)
      from public.push_notification_events e where e.id=p_event_id),false);
$$;

create function public.list_safety_reports_checked(p_status text default null,p_limit integer default 50,p_before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if p_status is not null and p_status not in ('OPEN','IN_REVIEW','RESOLVED','DISMISSED') then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode='22023';
    end if;
    return coalesce((select jsonb_agg(to_jsonb(r)) from (
      select r.* from private.safety_reports r where (p_status is null or r.status=p_status)
        and (p_before_id is null or r.id<p_before_id) order by r.id desc limit greatest(1,least(coalesce(p_limit,50),100))
    ) r),'[]'::jsonb);
end;
$$;

create function public.moderate_safety_report_checked(p_report_id bigint,p_action text,p_operator_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_report private.safety_reports%rowtype; v_status text; v_note text:=nullif(btrim(coalesce(p_operator_note,'')),'');
begin
    if p_action is null or p_action not in ('IN_REVIEW','DISMISS','HIDE_CONTENT','RESTORE_CONTENT','RESTRICT_USER','UNRESTRICT_USER')
       or char_length(coalesce(v_note,''))>1000 then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode='22023';
    end if;
    select * into v_report from private.safety_reports r where r.id=p_report_id for update;
    if not found then raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND'; end if;
    if p_action in ('HIDE_CONTENT','RESTORE_CONTENT') and v_report.target_type='CAREGIVER' then
        raise exception 'CONTENT_SAFETY_INVALID_INPUT' using errcode='22023';
    end if;
    if p_action='HIDE_CONTENT' then
        insert into private.moderation_content_hides(family_id,target_type,target_id)
          values(v_report.family_id,v_report.target_type,v_report.target_id) on conflict do nothing;
    elsif p_action='RESTORE_CONTENT' then
        delete from private.moderation_content_hides h where h.family_id=v_report.family_id
          and h.target_type=v_report.target_type and h.target_id=v_report.target_id;
    elsif p_action='RESTRICT_USER' then
        if v_report.reported_caregiver_id is null then raise exception 'CONTENT_SAFETY_TARGET_NOT_FOUND'; end if;
        insert into private.moderation_restrictions(caregiver_id,family_id)
          values(v_report.reported_caregiver_id,v_report.family_id) on conflict do nothing;
    elsif p_action='UNRESTRICT_USER' then
        delete from private.moderation_restrictions r where r.caregiver_id=v_report.reported_caregiver_id;
    end if;
    v_status:=case when p_action='IN_REVIEW' then 'IN_REVIEW' when p_action='DISMISS' then 'DISMISSED' else 'RESOLVED' end;
    update private.safety_reports r set status=v_status,last_action=p_action,operator_note=v_note,updated_at=now(),
      resolved_at=case when v_status in ('RESOLVED','DISMISSED') then now() else null end where r.id=v_report.id;
    update public.push_notification_events e set status='SKIPPED',processing_started_at=null,
      error_message='Content safety moderation',updated_at=now()
      where e.family_id=v_report.family_id and e.status in ('PENDING','PROCESSING') and not private.push_content_safety_allowed(e);
    return jsonb_build_object('report_id',v_report.id,'status',v_status);
end;
$$;

create function public.purge_resolved_safety_reports_checked()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
    -- Hourly scheduling plus a one-hour margin keeps retention within 90 days.
    delete from private.safety_reports r where r.resolved_at is not null and r.resolved_at<=now()-interval '89 days 23 hours';
    get diagnostics v_count=row_count;
    return v_count;
end;
$$;

-- Explicit grants: Postgres defaults EXECUTE to PUBLIC even in private schemas.
do $$
declare v record;
begin
    for v in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname in (
        'require_safety_caregiver','resolve_safety_target','caregiver_contact_blocked','safety_visible_to',
        'assert_content_safety_text','enforce_content_safety_write','safety_push_target_hidden',
        'push_content_safety_allowed','enforce_push_content_safety'
      ) loop execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',v.signature); end loop;
    for v in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'content_safety_visible','content_safety_comment_parent_visible','content_safety_media_visible',
        'content_safety_upload_allowed','content_safety_push_visible','report_safety_content_checked',
        'block_caregiver_checked','unblock_caregiver_checked','list_blocked_caregivers_checked','get_my_content_safety_state_checked'
      ) loop
        execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',v.signature);
        execute pg_catalog.format('grant execute on function %s to authenticated',v.signature);
    end loop;
    for v in select p.oid::regprocedure as signature from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'claim_pending_push_notification_events','can_deliver_content_safety_push_checked',
        'list_safety_reports_checked','moderate_safety_report_checked','purge_resolved_safety_reports_checked'
      ) loop
        execute pg_catalog.format('revoke all on function %s from public,anon,authenticated,service_role',v.signature);
        execute pg_catalog.format('grant execute on function %s to service_role',v.signature);
    end loop;
end;
$$;
select cron.schedule('purge-resolved-content-safety-reports','17 * * * *','select public.purge_resolved_safety_reports_checked();');

-- Accept the new safety disclosure while keeping both installed-client pairs.
-- Preserve each reviewed function body/ACL and change only the version guard.
do $$
declare v_signature regprocedure; v_definition text; v_updated text;
begin
    foreach v_signature in array array[
      'public.record_current_caregiver_legal_consents(text,text)'::regprocedure,
      'public.has_current_caregiver_legal_consents(text,text)'::regprocedure
    ] loop
        v_definition:=pg_catalog.pg_get_functiondef(v_signature);
        v_updated:=replace(v_definition,
          '(''2026-09-02'', ''2026-09-02'')',
          '(''2026-09-02'', ''2026-09-02''), (''2026-09-03'', ''2026-09-03'')');
        if v_updated=v_definition then raise exception 'Expected legal consent version guard not found'; end if;
        execute v_updated;
    end loop;
    v_definition:=pg_catalog.pg_get_functiondef('public.request_caregiver_account_deletion_checked()'::regprocedure);
    v_updated:=replace(v_definition,
      'consent.document_version = ''2026-09-02''',
      'consent.document_version >= ''2026-09-02''');
    if v_updated=v_definition then raise exception 'Expected legacy deletion version guard not found'; end if;
    execute v_updated;
end;
$$;
