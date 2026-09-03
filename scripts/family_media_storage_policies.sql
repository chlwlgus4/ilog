-- Restore companion for family-media Storage RLS policies.
-- Keep this aligned with:
--   supabase/migrations/20260714120947_add_family_media_and_chat.sql
--   supabase/migrations/20260715221114_add_family_photo_delete.sql
-- A public-schema-only database backup does not include these Storage policies.

drop policy if exists family_media_select_member on storage.objects;
create policy family_media_select_member on storage.objects
    for select to authenticated
    using (
        bucket_id = 'family-media'
        and (storage.foldername(name))[1] in ('photos', 'chat')
        and (storage.foldername(name))[2] = ((public.current_caregiver()).family_id)::text
    );

drop policy if exists family_media_insert_member on storage.objects;
create policy family_media_insert_member on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'family-media'
        and (storage.foldername(name))[1] in ('photos', 'chat')
        and (storage.foldername(name))[2] = ((public.current_caregiver()).family_id)::text
        and name ~ (
            '^(photos|chat)/'
            || ((public.current_caregiver()).family_id)::text
            || '/[A-Za-z0-9._-]+$'
        )
        and public.family_media_upload_allowed((public.current_caregiver()).family_id)
    );

drop policy if exists family_media_delete_album_owner on storage.objects;
create policy family_media_delete_album_owner on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'family-media'
        and (storage.foldername(name))[1] = 'photos'
        and (storage.foldername(name))[2] = ((public.current_caregiver()).family_id)::text
        and owner = auth.uid()
    );
