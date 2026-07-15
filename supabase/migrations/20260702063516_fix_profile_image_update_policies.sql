grant update (name, image_url) on table public.caregivers to authenticated;
grant update (name, birth_date, stage, image_url) on table public.children to authenticated;

drop policy if exists caregivers_update_self on public.caregivers;
create policy caregivers_update_self on public.caregivers
for update
to authenticated
using (id = public.current_caregiver_id())
with check (
  id = public.current_caregiver_id()
  and public.is_family_member(family_id)
);

drop policy if exists children_update_member on public.children;
create policy children_update_member on public.children
for update
to authenticated
using (public.is_family_member(family_id))
with check (public.is_family_member(family_id));
