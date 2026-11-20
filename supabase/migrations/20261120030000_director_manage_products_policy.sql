-- Allow approved directors (in addition to admins) to update product details.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and policyname = 'Director manage products'
  ) then
    create policy "Director manage products"
      on public.products for all to authenticated
      using (public.current_user_role() = 'director')
      with check (public.current_user_role() = 'director');
  end if;
end $$;
