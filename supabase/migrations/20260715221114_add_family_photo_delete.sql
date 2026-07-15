-- Family album uploads can only be removed by their uploader.
-- Record attachments intentionally remain read-only in the album because their
-- lifecycle belongs to the original record or memory entry.

drop policy if exists family_photos_delete_owner on public.family_photos;
create policy family_photos_delete_owner on public.family_photos
    for delete to authenticated
    using (
        public.is_family_member(family_id)
        and created_by_id = public.current_caregiver_id()
    );

-- Storage object ownership is assigned by Supabase when a signed-in caregiver
-- uploads a file. Keep deletion scoped to that same authenticated user.
drop policy if exists family_media_delete_album_owner on storage.objects;
create policy family_media_delete_album_owner on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'family-media'
        and (storage.foldername(name))[1] = 'photos'
        and (storage.foldername(name))[2] = ((public.current_caregiver()).family_id)::text
        and owner = auth.uid()
    );

create or replace function public.delete_family_photo_checked(
    p_family_id bigint,
    p_photo_id bigint
)
returns public.family_photos
language plpgsql
set search_path = public
as $$
declare
    v_current public.caregivers%rowtype;
    v_photo public.family_photos%rowtype;
begin
    v_current := public.current_caregiver();

    if v_current.family_id <> p_family_id then
        raise exception 'Family access denied';
    end if;

    delete from public.family_photos
    where id = p_photo_id
      and family_id = p_family_id
      and created_by_id = v_current.id
    returning * into v_photo;

    if not found then
        raise exception 'Family photo was not found or cannot be deleted';
    end if;

    return v_photo;
end;
$$;

grant delete on public.family_photos to authenticated;

revoke all on function public.delete_family_photo_checked(bigint, bigint) from public, anon;
grant execute on function public.delete_family_photo_checked(bigint, bigint) to authenticated;
