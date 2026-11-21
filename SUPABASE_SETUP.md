# Supabase backend setup (Railway is not used)
1. Create a free Supabase project at https://supabase.com/dashboard.
2. In SQL Editor, run the complete file `supabase/schema.sql`.
3. In Project Settings → API, copy the Project URL and anon/public key into `supabase-config.js`. Never use the service_role key in this repository.
4. In Authentication settings, disable public sign-ups. Create/invite the first authorized user in Authentication → Users.
5. Copy that user's UUID and run this SQL in SQL Editor:
   `update public.profiles set role='super_admin', institution='both' where id='PASTE-USER-UUID';`
6. Invite other staff users from Authentication → Users. Assign each profile a role and institution in Table Editor → profiles. Use only least-privilege roles.
7. Open `/admin.html` and `/accounts.html` on the published GitHub Pages site and sign in.
8. For an institution-specific accountant use institution='mosque' or 'foundation'. Do not grant 'both' unless formally authorized.

## Direct links after GitHub Pages deployment
- Admin: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/admin.html
- Accounts: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html

## Security notes
- The browser anon key is designed to be public; database access is protected by RLS policies in schema.sql.
- Never commit the Supabase service_role key or passwords.
- Financial entries begin as pending. Only an accounts_manager or super_admin can approve/reject.
- Mosque and foundation records are isolated by institution and enforced by database policies.
- This static GitHub Pages deployment does not host secrets or server-side code. Admin identity/role assignment must be done through Supabase's trusted dashboard.