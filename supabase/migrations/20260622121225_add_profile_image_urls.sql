alter table public.caregivers
  add column if not exists image_url text;

alter table public.children
  add column if not exists image_url text;
