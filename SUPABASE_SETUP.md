# Supabase backend setup — Free tier

## 1. Create the backend
1. Sign in at https://supabase.com/dashboard and create a Free project.
2. Choose a strong database password and keep it private.
3. Wait until the project status is healthy.

## 2. Create all database tables and security policies
1. Open the project → SQL Editor → New query.
2. Open this repository file: `supabase/schema.sql`.
3. Copy the complete file and run it once.
4. Confirm that the tables `profiles`, `ledger_entries`, `announcements`, `audit_logs`, `site_content`, and `budgets` exist, and that the `private-receipts` and `site-media` Storage buckets are present.
5. The SQL also creates a private Storage bucket named `private-receipts`. Keep it private.

## 3. Connect the website
1. Open Project Settings → API.
2. Copy the Project URL and the publishable/anon public key (not the secret/service_role key).
3. Replace the two placeholder values in `supabase-config.js`:
   - `url`: Project URL
   - `anonKey`: publishable/anon public key
4. Commit the config change to the repository. The anon/publishable key is designed for browser use; Row Level Security is what protects data.

## 4. Create the first administrator
1. In Authentication → Sign In / Providers, turn off public sign-ups.
2. In Authentication → Users, add the first administrator with an email and a temporary password.
3. Copy that user's UUID.
4. In SQL Editor run this statement after replacing the UUID:
   `update public.profiles set role='super_admin', institution='both' where id='USER-UUID-HERE';`
5. Ask the administrator to sign in and change to a strong unique password.

## 5. Add the staff accounts
Create/invite staff only from Authentication → Users. After each user is created, set the user's role and institution in Table Editor → profiles.

Roles:
- `super_admin`: full access across both institutions.
- `mosque_admin`: mosque operations and mosque financial approvals.
- `foundation_admin`: foundation operations and foundation financial approvals.
- `manager`: assigned mosque/foundation operational modules.
- `editor` / `website_admin`: website content and notices.
- `admin`: legacy full administrative role.
- `accounts_manager`: approve/reject financial entries and manage budgets.
- `accountant`: enter income/expenses and upload receipts.
- `auditor`: read-only review.\n- `viewer`: read-only access within the assigned institution.
- Institution must be `mosque` or `foundation`. Use `both` only for formally authorized staff.

## 6. Apply the Admin Panel module migration\n1. Open Supabase → SQL Editor → New query.\n2. Open `supabase/admin-modules.sql` in GitHub and copy the complete SQL.\n3. Run the latest SQL file. It expands the role list, creates the secure record store used by the 60 Admin Panel modules, and adds source/credit fields for Islamic articles and media. If you have run an earlier version, run the updated file again.\n4. Keep Row Level Security enabled; do not run broad public policies.\n\n## 7. Repair/enable Accounts database permissions
1. Open Supabase → SQL Editor → New query.
2. Open `supabase/accounts-permissions-fix.sql` in GitHub and copy the entire file.
3. Paste it into SQL Editor and press Run. It is safe to run again if needed.
4. This grants the signed-in `authenticated` role SELECT/INSERT/UPDATE on ledger entries (the missing SQL privilege that causes `permission denied for table ledger_entries`), while RLS still limits access by role and institution. It keeps receipt files private and does not grant ledger DELETE.
5. Sign out of Accounts, sign in again, and test with a small pending entry before entering real financial data.

## 8. Configure Auth URLs
In Authentication → URL Configuration, set the Site URL to:
`https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque`
Add the same site URL and the two page URLs ending in `/admin.html` and `/accounts.html` to the allowed redirect URLs if your project settings require them.

## 9. Test before using real financial data
1. Sign in at /admin.html with the Super Admin.
2. Add one test article, one test photo URL, and one YouTube video URL; publish and verify each on the homepage.
3. Create separate mosque and foundation accountant users and confirm each can only see their own institution.
4. Add a small test income and expense; confirm they remain pending until a manager approves them.
5. Upload a test PDF receipt and confirm only authorized accounts users can open it.
6. Add a test monthly budget and export CSV/XLSX or print to PDF.
7. Delete the test records only if they are still drafts; approved/rejected ledger rows are intentionally immutable and must be corrected with a reversing entry.

## Important
- Do not put passwords or a service_role/secret key in GitHub or browser files.
- The public homepage reads only published content. Drafts remain private to authorized website administrators.
- Financial data and receipt files are private and institution-scoped by database policies.
- GitHub Pages serves the static website; Supabase provides authentication, database and private storage.
- No live Admin/Accounts login can work until a real Supabase project is connected and the SQL is run.

\n## 10. Enable Super Admin-created staff accounts and per-module permissions
1. Run the complete `supabase/module-permissions.sql` file in Supabase SQL Editor after the existing schema and Admin module SQL migrations.
2. In Supabase Dashboard → Edge Functions, deploy the function in `supabase/functions/admin-create-user/index.ts` with the name `admin-create-user`.
3. Ensure the Edge Function has the server secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Supabase normally supplies these; if adding a secret manually, add it only in Edge Function Secrets, never in GitHub Pages or browser code.
4. Sign in as the existing Super Admin and open `/admin.html`. Use “সুপার অ্যাডমিন — কর্মী অ্যাকাউন্ট ও মডিউল অনুমতি” to create a worker with name, email, password, institution, and selected modules.
5. The selected module grants read access by default. Optional checkboxes grant editing and approval. Permissions are also enforced by database RLS; hiding a menu alone is not the security boundary.
6. Existing non-Super-Admin accounts keep their current role-based permissions. New staff accounts use the restricted `custom_admin` role and can access only selected modules.

## 11. Publish module-specific Admin Panel records to the matching website section
1. First complete steps 6 and 10 above. The `module_records` table and module-permission policies must already exist.
2. Open Supabase → SQL Editor → New query.
3. Open `supabase/public-module-records.sql` in GitHub, copy the entire file, paste it into SQL Editor, and press Run.
4. This grants public read access only to records that are explicitly marked for public display, have status `published`, and belong to the approved public module allowlist. Drafts, pending approvals, and private staff/beneficiary/financial records remain unavailable to visitors.
5. In Admin Panel, enter the module-specific fields, save as draft/pending, then have an authorized approver approve and publish. Published records appear in the matching website module page. Prayer-time records also update the homepage prayer-time panel; published notice records can update the homepage notice panel. Photo/video modules continue to use their dedicated media manager and homepage slots.
6. After running the SQL, reload the website with Ctrl+F5. Test with one non-sensitive sample record before publishing real information.
