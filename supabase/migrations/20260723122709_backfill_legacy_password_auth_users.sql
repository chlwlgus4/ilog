-- Promote legacy caregiver password hashes into standard Supabase email/password
-- identities without changing caregiver IDs, families, or the existing passwords.
-- The preflight guard makes the migration fail before writes if the legacy data is
-- not in the expected one-to-one state.

do $$
declare
  v_total integer;
  v_valid_email integer;
  v_missing_auth_user integer;
  v_existing_email_identity integer;
  v_email_conflict integer;
  v_duplicate_email integer;
  v_updated_users integer;
  v_inserted_identities integer;
begin
  select
    count(*)::integer,
    count(*) filter (
      where lower(trim(c.email)) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    )::integer,
    count(*) filter (where u.id is null)::integer,
    count(*) filter (
      where exists (
        select 1
        from auth.identities i
        where i.user_id = u.id
          and i.provider = 'email'
      )
    )::integer,
    count(*) filter (
      where existing_email_user.id is not null
    )::integer,
    count(*) filter (
      where duplicate_email.email is not null
    )::integer
  into
    v_total,
    v_valid_email,
    v_missing_auth_user,
    v_existing_email_identity,
    v_email_conflict,
    v_duplicate_email
  from public.caregivers c
  left join auth.users u
    on u.id = c.auth_user_id
  left join auth.users existing_email_user
    on lower(existing_email_user.email) = lower(trim(c.email))
   and existing_email_user.id <> c.auth_user_id
  left join (
    select lower(trim(email)) as email
    from public.caregivers
    where coalesce(password_hash, '') <> ''
    group by lower(trim(email))
    having count(*) > 1
  ) duplicate_email
    on duplicate_email.email = lower(trim(c.email))
  where coalesce(c.password_hash, '') <> '';

  if v_total = 0 then
    raise exception 'No legacy password accounts were found';
  end if;

  if v_valid_email <> v_total
     or v_missing_auth_user <> 0
     or v_existing_email_identity <> 0
     or v_email_conflict <> 0
     or v_duplicate_email <> 0 then
    raise exception
      'Legacy password auth preflight failed (total %, valid_email %, missing_auth_user %, existing_email_identity %, email_conflict %, duplicate_email %)',
      v_total,
      v_valid_email,
      v_missing_auth_user,
      v_existing_email_identity,
      v_email_conflict,
      v_duplicate_email;
  end if;

  with legacy_accounts as (
    select
      c.auth_user_id as user_id,
      lower(trim(c.email)) as email,
      c.password_hash
    from public.caregivers c
    join auth.users u
      on u.id = c.auth_user_id
    where coalesce(c.password_hash, '') <> ''
  )
  update auth.users u
  set
    email = legacy.email,
    encrypted_password = legacy.password_hash,
    email_confirmed_at = coalesce(u.email_confirmed_at, now()),
    raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'provider',
        coalesce(nullif(u.raw_app_meta_data ->> 'provider', ''), 'email'),
        'providers',
        (
          select jsonb_agg(provider order by provider)
          from (
            select value as provider
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)) = 'array'
                  then u.raw_app_meta_data -> 'providers'
                else '[]'::jsonb
              end
            )
            union
            select 'email'
          ) providers
        )
      ),
    is_anonymous = false,
    updated_at = now()
  from legacy_accounts legacy
  where u.id = legacy.user_id;

  get diagnostics v_updated_users = row_count;

  if v_updated_users <> v_total then
    raise exception
      'Expected to update % auth users, updated % instead',
      v_total,
      v_updated_users;
  end if;

  with legacy_accounts as (
    select
      c.auth_user_id as user_id,
      lower(trim(c.email)) as email,
      c.name as caregiver_name,
      c.role as caregiver_role,
      upper(f.invite_code) as invite_code
    from public.caregivers c
    join public.families f
      on f.id = c.family_id
    where coalesce(c.password_hash, '') <> ''
  )
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at
  )
  select
    legacy.user_id::text,
    legacy.user_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'sub', legacy.user_id::text,
        'email', legacy.email,
        'email_verified', true,
        'phone_verified', false,
        'caregiver_name', nullif(trim(legacy.caregiver_name), ''),
        'caregiver_role', legacy.caregiver_role,
        'invite_code', nullif(legacy.invite_code, '')
      )
    ),
    'email',
    now(),
    now()
  from legacy_accounts legacy;

  get diagnostics v_inserted_identities = row_count;

  if v_inserted_identities <> v_total then
    raise exception
      'Expected to insert % email identities, inserted % instead',
      v_total,
      v_inserted_identities;
  end if;
end;
$$;
