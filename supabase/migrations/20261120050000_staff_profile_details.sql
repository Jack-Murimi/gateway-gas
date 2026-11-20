-- Add branch assignment, national ID, and internal HR notes to staff profiles.
alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists national_id text,
  add column if not exists notes text;

create index if not exists profiles_branch_id_idx
  on public.profiles(branch_id)
  where branch_id is not null;
