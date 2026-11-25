-- Public display is opt-in per record and limited to explicitly mapped, non-sensitive website modules.
grant select on public.module_records to anon;
drop policy if exists "public can read published public module records" on public.module_records;
create policy "public can read published public module records"
on public.module_records
for select
to anon, authenticated
using (
  status = 'published'
  and data->>'public_display' = 'true'
  and data ? 'public_module'
  and module_key in (
    'm04','m07','m08','m10','m11','m12','m13','m14','m15','m16','m17','m18','m19','m20',
    'm21','m22','m23','m24','m25','m26','m27','m28',
    'm31','m32','m33','m34','m35','m36','m37','m38','m40'
  )
);
