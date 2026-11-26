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
5. The SQL also creates a private Storage bucket named `private-receipts`. Keep it private. The separate `private-module-files` bucket is created by the later private-report migration.

## 3. Connect the website
1. Open Project Settings → API.
2. Copy the Project URL and the publishable/anon public key (not the secret/service_role key).
3. For a new Supabase project only, replace the two values in `supabase-config.js`. The live SAKM-61 site is already connected to project `lmwczibsipczfymhyqba`; do not replace its working configuration unless you are deliberately moving the site to another project.
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

## 6. Apply the Admin Panel module migration\n1. Open Supabase → SQL Editor → New query.\n2. Open `supabase/admin-modules.sql` in GitHub and copy the complete SQL.\n3. Run the latest SQL file. It expands the role list, creates the secure record store used by the 61 Admin Panel modules, and adds source/credit fields for Islamic articles and media. If you have run an earlier version, run the updated file again.\n4. Keep Row Level Security enabled; do not run broad public policies.\n\n## 7. Repair/enable Accounts database permissions
1. Open Supabase → SQL Editor → New query.
2. Open `supabase/accounts-permissions-fix.sql` in GitHub and copy the entire file.
3. Paste it into SQL Editor and press Run. It is safe to run again if needed.
4. This grants the signed-in `authenticated` role SELECT/INSERT/UPDATE on ledger entries (the missing SQL privilege that causes `permission denied for table ledger_entries`), while RLS still limits access by role and institution. It keeps receipt files private and does not grant ledger DELETE.
5. Run `supabase/accounts-direct-posting.sql` after the Accounts tables/functions are present. It allows direct Approved posting only for users with both write and approval permission; write-only staff can submit Pending entries.
6. Sign out of Accounts, sign in again, and test one write-only Pending entry and one fully authorized direct Approved entry before entering real financial data.

## 8. Configure Auth URLs
In Authentication → URL Configuration, set the Site URL to:
`https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque`
Add the same site URL and the two page URLs ending in `/admin.html` and `/accounts.html` to the allowed redirect URLs if your project settings require them.

## 9. Test before using real financial data
1. Sign in at /admin.html with the Super Admin.
2. Add one test article, one test photo URL, and one YouTube video URL; publish and verify each on the homepage.
3. Create separate mosque and foundation accountant users and confirm each can only see their own institution.
4. Test both permission paths: a write-only user must create a Pending entry; a user with both `can_write` and `can_approve` may post directly as Approved. Confirm the double-entry journal has equal debit and credit.
5. Upload a test PDF receipt and confirm only authorized accounts users can open it.
6. Add a test monthly budget and export CSV/XLSX or print to PDF.
7. Delete the test records only if they are still drafts; approved/rejected ledger rows are intentionally immutable and must be corrected with a reversing entry.

## Important
- Do not put passwords or a service_role/secret key in GitHub or browser files.
- The public homepage reads only published content. Drafts remain private to authorized website administrators.
- Financial data and receipt files are private and institution-scoped by database policies.
- GitHub Pages serves the static website; Supabase provides authentication, database and private storage.
- The live SAKM-61 site is connected to Supabase project `lmwczibsipczfymhyqba`. Admin/Accounts login additionally requires a valid Auth user, a matching `profiles` row with the correct role/institution, deployed Edge Functions where used, and the current migrations.

\n## 10. Enable Super Admin-created staff accounts and per-module permissions
1. Run `supabase/module-permissions.sql` after the base schema and Admin module SQL. This file now accepts the complete 85-module permission payload and requires `can_write` for Custom Admin record changes.
2. Apply `supabase/migrations/20261125194105_private_module_reports_and_module_write_hardening.sql` to create the private `private-module-files` bucket, keep m06 reports out of public `site-media`, and enforce module write permissions.
3. Run `supabase/accounts-granular-module-access.sql` to extend the permission-key range and apply the separate Accounts module policies. For the latest 85-module permission validation and index fixes, also apply `supabase/migrations/20261125111114_accounts_permission_cap_85_and_missing_fk_indexes.sql`.
4. In Supabase Dashboard → Edge Functions, deploy the function in `supabase/functions/admin-create-user/index.ts` with the name `admin-create-user`.
5. Ensure the Edge Function has the server secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Supabase normally supplies these; if adding a secret manually, add it only in Edge Function Secrets, never in GitHub Pages or browser code.
6. Sign in as the existing Super Admin and open `/admin.html`. Use “সুপার অ্যাডমিন — কর্মী অ্যাকাউন্ট ও মডিউল অনুমতি” to create a worker with name, email, password, institution, and selected modules.
7. Each selected module grants the assigned worker full view, write and approval control. Permissions are also enforced by database RLS; hiding a menu alone is not the security boundary.
8. Existing non-Super-Admin accounts keep their current role-based permissions. New staff accounts use the restricted `custom_admin` role and can access only selected modules.

## 11. Publish module-specific Admin Panel records to the matching website section
1. First complete steps 6 and 10 above. The `module_records` table and module-permission policies must already exist.
2. Open Supabase → SQL Editor → New query.
3. Open `supabase/public-module-records.sql` in GitHub, copy the entire file, paste it into SQL Editor, and press Run.
4. This grants public read access only to records that are explicitly marked for public display, have status `published`, and belong to the approved public module allowlist. Drafts, pending approvals, and private staff/beneficiary/financial records remain unavailable to visitors.
5. In Admin Panel, enter the module-specific fields, save as draft/pending, then have an authorized approver approve and publish. Published records appear in the matching website module page. Prayer-time records also update the homepage prayer-time panel; published notice records can update the homepage notice panel. Photo/video modules continue to use their dedicated media manager and homepage slots.
6. After running the SQL, reload the website with Ctrl+F5. Test with one non-sensitive sample record before publishing real information.

## 12. Repair anonymous homepage published-content access on existing databases
For an existing database created before this fix, run `supabase/fix-public-site-content-anon-read.sql` once in SQL Editor. It separates public published-content reads from authenticated website-admin access, preventing anonymous homepage requests from failing with `permission denied for function has_access`. The live SAKM-61 database has already received and passed this policy repair.


### Admin dashboard preferences
The Admin Panel dashboard layout is controlled by the Super Admin from the **ড্যাশবোর্ড সাজান** button. Visibility for metric cards, dashboard sections, and quick-access modules is stored in `public.admin_dashboard_settings`. All authenticated staff can read the shared layout; only a `super_admin` can change it. The table is created by migration `20261125162200_admin_dashboard_preferences`.


## বাংলা পুরুষ কণ্ঠের Read Aloud

ওয়েবসাইটের “বাংলায় শুনুন” ফিচারটি ব্রাউজারের ভেতরে Svara-TTS v1 (ONNX) মডেল দিয়ে বাংলা পুরুষ কণ্ঠ তৈরি করে। Google Cloud TTS API key বা Supabase Secret `GOOGLE_TTS_API_KEY` প্রয়োজন নেই। প্রথমবার ব্যবহারে প্রায় ১.৯৫ GB মডেল ডাউনলোড হয়; পরবর্তী ব্যবহারে ব্রাউজারের ক্যাশে থাকলে পুনরায় ডাউনলোডের প্রয়োজন হয় না।

- হালনাগাদ Chrome বা Edge এবং WebGPU + `shader-f16` সমর্থিত GPU প্রয়োজন।
- প্রথমবার মডেল প্রস্তুত হতে সময় লাগতে পারে; পর্যাপ্ত ডিস্ক/মেমোরি ও স্থিতিশীল ইন্টারনেট রাখুন।
- অডিও তৈরি ব্রাউজারেই হয়; লেখা কোনো TTS API-তে পাঠানো হয় না।
- মডেল/কোডেকের বিবরণ: https://huggingface.co/shreyask/svara-tts-v1-ONNX
