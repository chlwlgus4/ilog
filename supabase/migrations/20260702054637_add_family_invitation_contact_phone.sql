alter table public.family_invitations
    add column if not exists contact_phone text;

drop function if exists public.create_family_invitation_checked(bigint, text, text, text);

create or replace function public.create_family_invitation_checked(
    p_family_id bigint,
    p_email text,
    p_contact_phone text,
    p_relationship text,
    p_note text
)
returns public.family_invitations
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_invitation public.family_invitations%rowtype;
begin
    v_current := public.current_caregiver();
    if v_current.family_id <> p_family_id then raise exception 'Family access denied'; end if;
    if trim(coalesce(p_email, '')) = '' then raise exception 'Invitation email is required'; end if;
    if trim(coalesce(p_contact_phone, '')) = '' then raise exception 'Invitation contact phone is required'; end if;
    if trim(coalesce(p_relationship, '')) = '' then raise exception 'Invitation relationship is required'; end if;

    insert into public.family_invitations(family_id, email, contact_phone, relationship, note, invited_by_id)
    values (
        p_family_id,
        lower(trim(p_email)),
        trim(p_contact_phone),
        trim(p_relationship),
        nullif(trim(coalesce(p_note, '')), ''),
        v_current.id
    )
    returning * into v_invitation;

    return v_invitation;
end;
$$;

revoke all on function public.create_family_invitation_checked(bigint, text, text, text, text) from public, anon;
grant execute on function public.create_family_invitation_checked(bigint, text, text, text, text) to authenticated;
