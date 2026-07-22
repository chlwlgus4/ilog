alter table public.children
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'children_gender_check'
      and conrelid = 'public.children'::regclass
  ) then
    alter table public.children
      add constraint children_gender_check
      check (gender in ('MALE', 'FEMALE'));
  end if;
end
$$;

grant update (gender) on table public.children to authenticated;

create or replace function public.record_child_profile_weight_checked(
  p_family_id bigint,
  p_child_id bigint,
  p_weight_kg numeric
)
returns public.growth_measurements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.caregivers%rowtype;
  v_child public.children%rowtype;
  v_growth public.growth_measurements%rowtype;
begin
  v_current := public.current_caregiver();

  if v_current.family_id <> p_family_id then
    raise exception 'Family access denied';
  end if;

  if p_weight_kg is null or p_weight_kg <= 0 then
    raise exception 'Weight must be greater than zero';
  end if;

  v_child := public.resolve_family_child(p_family_id, p_child_id);

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
    p_weight_kg,
    '아이 정보에서 등록'
  )
  returning * into v_growth;

  return v_growth;
end;
$$;

revoke all on function public.record_child_profile_weight_checked(bigint, bigint, numeric) from public, anon;
grant execute on function public.record_child_profile_weight_checked(bigint, bigint, numeric) to authenticated;
