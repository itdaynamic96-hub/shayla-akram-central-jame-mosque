-- SAKM-61 public homepage: avoid calling authenticated-only has_access()
-- from the anonymous visitor policy. Admins keep full access via the
-- separate authenticated "website admins manage site content" policy.
drop policy if exists "public can read published site content" on public.site_content;
create policy "public can read published site content"
on public.site_content
for select
to anon, authenticated
using (status = 'published');
