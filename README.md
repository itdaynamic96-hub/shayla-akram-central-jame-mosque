# শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ ও শায়লা আকরাম কেন্দ্রীয় ফাউন্ডেশন

বাংলা ও মোবাইল-রেসপনসিভ পাবলিক ওয়েবসাইট। Hosting: GitHub Pages via GitHub Actions.

## পৃথক ব্যবস্থাপনা লিংক
- Admin Panel: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/admin.html
- Accounts: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html

## কনটেন্ট ব্যবস্থাপনা
- ইসলামিক জ্ঞানভান্ডার, ইসলামিক আলোকচিত্র, ভিডিও শিক্ষা, নোটিশ, নামাজের সময়সূচি, মেনু ও নিজস্ব পেজ Admin Panel থেকে যোগ, সম্পাদনা, অনুমোদন ও প্রকাশ করা যায়।
- পেজ ব্যবস্থাপনায় ইংরেজি ছোট হাতের অক্ষর/সংখ্যা/হাইফেনের slug ব্যবহার করুন; প্রকাশিত পেজের লিংক `#page-your-slug` আকারে মেনুতে দিন।
- কুরআন/হাদিসের রেফারেন্স এবং ছবি/ভিডিওর উৎস ও কৃতিত্ব উল্লেখ করুন। Super Admin/Website Admin সর্বোচ্চ ১০ MB-এর ছবি সরাসরি আপলোড করতে পারবেন; ভিডিও YouTube বা নির্ভরযোগ্য উৎসের লিংক দিয়ে যোগ হবে।

## Backend
Accounts ও Admin-এর authentication এবং persistent data storage-এর জন্য Supabase project `lmwczibsipczfymhyqba` সংযুক্ত আছে; browser configuration `supabase-config.js`-এ publishable key ব্যবহার করা হয়েছে। লাইভ লগইনের জন্য Supabase Auth-এ সক্রিয় user, `profiles` role/institution এবং প্রয়োজনীয় database migrations থাকতে হবে। নতুন project স্থাপন ও বিদ্যমান live project রক্ষণাবেক্ষণের নির্দেশিকা: `SUPABASE_SETUP.md`.

**গুরুত্বপূর্ণ:** service_role key কখনো browser code বা GitHub-এ রাখবেন না। Public sign-up বন্ধ রাখুন। প্রথম Super Admin তৈরি ও role assignment Supabase Dashboard থেকে করতে হবে। RLS policy মসজিদ ও ফাউন্ডেশনের হিসাব আলাদা রাখে।

## Admin Panel enhancement migration

Validation workflow: repair branch runs checks only; production deployment remains limited to `main`.

Run `supabase/admin-panel-enhancements.sql` in Supabase SQL Editor after the existing `schema.sql`, `admin-modules.sql`, `module-permissions.sql`, and `public-module-records.sql` scripts. This migration adds private Muslim registration (m61), expands module permissions, enables role-scoped media uploads, and permits published dynamic navigation/SEO records. It updates the public `site-media` bucket to accept images, PDFs and MP4/WebM/OGG videos up to 100 MB per object; project storage quotas and upload limits still apply. Muslim registration records are private and require the registrant's consent.

## Accounts permission repair

For existing projects where the Accounts page reports `permission denied for table ledger_entries`, run `supabase/accounts-permissions-fix.sql` in Supabase SQL Editor after the schema and Admin module SQL.

## যাচাইকৃত তথ্যনীতি
নামাজের সময়, কমিটির সদস্য, ফোন নম্বর, আর্থিক পরিমাণ ও প্রকল্পের অগ্রগতি দায়িত্বশীল কর্তৃপক্ষ যাচাই না করা পর্যন্ত চূড়ান্ত তথ্য হিসেবে প্রকাশ করা যাবে না।


## Basic Package-এর ঐচ্ছিক সীমা

`content-limits.js` এবং `supabase/basic-package-500-word-limit.sql` কেবল ১৫-মডিউলের Basic সংস্করণের জন্য। এই ৬১-মডিউলের Enterprise সাইটে এগুলো লোড/প্রয়োগ করা হয় না; তাই দীর্ঘ লেখা ও সব অনুমোদিত মডিউল ব্যবহার করা যাবে।

## Enterprise Accounts additions

Encrypted Supabase backups are scheduled daily at 02:45 Bangladesh time and can also be run manually. The live GitHub Actions backup Run #15 (25 November 2026) completed successfully and uploaded the `SAKM-61-encrypted-backup` artifact. The workflow verifies that the encrypted archive decrypts successfully and contains the database dump files before upload. The GitHub Actions secret `SUPABASE_DB_URL` must remain the exact Session pooler URI copied from Supabase Connect, with username `postgres.lmwczibsipczfymhyqba`; never commit or share its password. The live Supabase project includes account_staff, payroll_records, account_obligations, and account_assets, with row-level security and audit triggers. The private mosque-member register (module 61) is enabled for mosque roles and is excluded from public publishing. The Accounts page loads accounts-enterprise.js for payroll with printable salary slips, cashbook/bankbook with daily/monthly/yearly filters, receivables/payables, asset register, and audit history. The cash/bank books are read-only projections of approved ledger entries to avoid double counting. Payroll payment creates a pending expense ledger entry that still requires normal ledger approval.

For a fresh database after the base schema and Accounts permission repair, run supabase/accounts-enterprise-extensions.sql in the Supabase SQL Editor. Never add sample financial or staff data to production without authorization.

For a complete Accounts deployment, apply `supabase/accounts-double-entry.sql`, `supabase/accounts-asset-register-permissions.sql`, `supabase/accounts-complete-audit-trail.sql`, and `supabase/accounts-obligation-payments-and-bank-link.sql` in that order after the base Accounts schema. Then apply `supabase/accounts-module-permission-hardening.sql`, `supabase/accounts-ledger-sequence-permissions.sql`, and `supabase/accounts-obligation-payments-read-grant.sql`. These final repairs enforce separate view/write/approve capabilities for the assigned operator, allow authenticated ledger writers to allocate receipt/voucher numbers without reading sequences, and grant RLS-filtered read access to obligation-payment history. The browser never receives a service-role key.

## Project identity and live verification
This repository is the **SAKM-61** (61-module) mosque and foundation website. It is not the separate `shayla-akram-mosque-basic` project. See [PROJECT_IDENTITY.md](PROJECT_IDENTITY.md) for the canonical repository, deployment, Supabase project reference, and operational boundaries. A successful encrypted backup is not the same as a verified restore; password hashes, sessions, provider secrets, dashboard-only settings, and a fresh-project restore are explicitly outside the current backup guarantee.


## কেন্দ্রীয় মসজিদের ছবি ব্যবস্থাপনা

`supabase/central-mosque-brand-image-settings.sql` migration creates a public-read, admin-write `site_media_settings` record for the shared mosque photo and adds an authenticated admin-only upload policy under the `site-media` bucket. The same setting is read by the homepage, Admin Panel, Accounts page and 360° tour cover. The default fallback is `assets/mosque-hero.webp`. Image replacement is available to Super Admin, Admin and Website Admin accounts; upload limit is 10 MB.


### Admin dashboard preferences
The Admin Panel dashboard layout is controlled by the Super Admin from the **ড্যাশবোর্ড সাজান** button. Visibility for metric cards, dashboard sections, and quick-access modules is stored in `public.admin_dashboard_settings`. All authenticated staff can read the shared layout; only a `super_admin` can change it. The table is created by migration `20261125162200_admin_dashboard_preferences`.



Bengali male Read Aloud runs locally in the browser with the lightweight Spellophone/eSpeak Bengali voice (no multi-GB model download), with Arabic and Bengali language switching. It does not require Google Cloud Text-to-Speech, a Supabase Edge Function, or the `GOOGLE_TTS_API_KEY` secret. The first use loads the small eSpeak WASM runtime and Bengali voice files from jsDelivr; no multi-gigabyte model or WebGPU is required. Internet access is needed on first load.
