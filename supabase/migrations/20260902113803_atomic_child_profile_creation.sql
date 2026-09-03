do $$
begin
    if exists (
        select 1
        from public.children child
        group by child.family_id
        having count(*) > 1
    ) then
        raise exception 'Duplicate child profiles must be resolved before enforcing one child per family';
    end if;
end;
$$;

create unique index if not exists idx_children_one_profile_per_family
    on public.children(family_id);

create or replace function public.create_child_profile_checked(
    p_family_id bigint,
    p_name text,
    p_birth_date date,
    p_stage text,
    p_gender text,
    p_weight_kg numeric,
    p_image_url text
)
returns public.children
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_current public.caregivers%rowtype;
    v_child public.children%rowtype;
    v_initial_weight numeric;
    v_initial_weight_count bigint;
    v_requested_weight numeric(6,2);
    v_name text := btrim(coalesce(p_name, ''));
begin
    if p_family_id is null or p_family_id <= 0 then
        raise exception 'Family id is required';
    end if;

    v_current := public.current_caregiver();

    if v_current.family_id is distinct from p_family_id then
        raise exception 'Family access denied';
    end if;

    if v_name = '' then
        raise exception 'Child name is required';
    end if;

    if p_birth_date is null then
        raise exception 'Child birth date is required';
    end if;

    if p_stage is null or p_stage not in (
        'NEWBORN',
        'INFANT',
        'TODDLER',
        'PRESCHOOL',
        'EARLY_SCHOOL'
    ) then
        raise exception 'Invalid child stage';
    end if;

    if p_gender is null or p_gender not in ('MALE', 'FEMALE') then
        raise exception 'Invalid child gender';
    end if;

    if p_weight_kg is not null
       and (p_weight_kg <= 0 or p_weight_kg > 9999.99) then
        raise exception 'Invalid child weight';
    end if;

    v_requested_weight := p_weight_kg;

    if v_requested_weight is not null and v_requested_weight <= 0 then
        raise exception 'Invalid child weight';
    end if;

    -- A family has one active child profile in the current product model.
    -- Serialize creation so a double tap or a retry after a lost response
    -- returns the committed profile instead of inserting a duplicate.
    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'ilog:create-child-profile:' || p_family_id::text,
            0
        )
    );

    select child.*
    into v_child
    from public.children child
    where child.family_id = p_family_id
    order by child.id asc
    limit 1;

    if found then
        select count(*), max(growth.weight_kg)
        into v_initial_weight_count, v_initial_weight
        from public.growth_measurements growth
        where growth.family_id = p_family_id
          and growth.child_id = v_child.id
          and growth.note = '아이 정보에서 등록';

        if v_child.name = v_name
           and v_child.birth_date = p_birth_date
           and v_child.stage = p_stage
           and v_child.gender is not distinct from p_gender
           and v_child.image_url is not distinct from nullif(btrim(coalesce(p_image_url, '')), '')
           and (
               (v_requested_weight is null and v_initial_weight_count = 0)
               or (
                   v_requested_weight is not null
                   and v_initial_weight_count = 1
                   and v_initial_weight is not distinct from v_requested_weight
               )
           ) then
            return v_child;
        end if;

        raise exception 'A child profile already exists for this family';
    end if;

    insert into public.children(
        family_id,
        name,
        birth_date,
        stage,
        gender,
        image_url
    ) values (
        p_family_id,
        v_name,
        p_birth_date,
        p_stage,
        p_gender,
        nullif(btrim(coalesce(p_image_url, '')), '')
    )
    returning * into v_child;

    if v_requested_weight is not null then
        insert into public.growth_measurements(
            family_id,
            child_id,
            caregiver_id,
            measured_at,
            weight_kg,
            note
        ) values (
            p_family_id,
            v_child.id,
            v_current.id,
            now(),
            v_requested_weight,
            '아이 정보에서 등록'
        );
    end if;

    return v_child;
end;
$$;

revoke all on function public.create_child_profile_checked(
    bigint,
    text,
    date,
    text,
    text,
    numeric,
    text
) from public, anon, authenticated;

grant execute on function public.create_child_profile_checked(
    bigint,
    text,
    date,
    text,
    text,
    numeric,
    text
) to authenticated;
