create or replace function public.current_caregiver_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
    select c.id
    from public.caregivers as c
    where c.auth_user_id = auth.uid()
    order by c.updated_at desc
    limit 1
$$;

drop policy if exists logs_insert_member on public.logs;
create policy logs_insert_member on public.logs for insert to authenticated with check (
    public.is_family_member(family_id)
    and (caregiver_id is null or caregiver_id = public.current_caregiver_id())
);

drop policy if exists logs_update_own on public.logs;
create policy logs_update_own on public.logs for update to authenticated using (
    caregiver_id = public.current_caregiver_id()
) with check (
    public.is_family_member(family_id)
    and (caregiver_id is null or caregiver_id = public.current_caregiver_id())
);

drop policy if exists memory_entries_insert_member on public.memory_entries;
create policy memory_entries_insert_member on public.memory_entries for insert to authenticated with check (
    public.is_family_member(family_id)
    and (created_by_id is null or created_by_id = public.current_caregiver_id())
);

drop policy if exists memory_entries_update_own on public.memory_entries;
create policy memory_entries_update_own on public.memory_entries for update to authenticated using (
    created_by_id = public.current_caregiver_id()
) with check (
    public.is_family_member(family_id)
    and (created_by_id is null or created_by_id = public.current_caregiver_id())
);

drop policy if exists chat_messages_insert_member on public.chat_messages;
create policy chat_messages_insert_member on public.chat_messages for insert to authenticated with check (
    public.is_family_member(family_id)
    and sender_id = public.current_caregiver_id()
);

drop policy if exists chat_messages_update_own on public.chat_messages;
create policy chat_messages_update_own on public.chat_messages for update to authenticated using (
    sender_id = public.current_caregiver_id()
) with check (
    public.is_family_member(family_id)
    and sender_id = public.current_caregiver_id()
);

revoke all on function public.current_caregiver_id() from public, anon;
grant execute on function public.current_caregiver_id() to authenticated;
