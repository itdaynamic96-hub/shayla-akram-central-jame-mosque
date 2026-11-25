# শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ ও শায়লা আকরাম কেন্দ্রীয় ফাউন্ডেশন

বাংলা ও মোবাইল-রেসপনসিভ পাবলিক ওয়েবসাইট। Hosting: GitHub Pages via GitHub Actions.

## পৃথক ব্যবস্থাপনা লিংক
- Admin Panel: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/admin.html
- Accounts: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html

## কনটেন্ট ব্যবস্থাপনা
- ইসলামিক জ্ঞানভান্ডার, ইসলামিক আলোকচিত্র ও ভিডিও শিক্ষা Admin Panel থেকে যোগ, সম্পাদনা, প্রকাশ বা খসড়া/লুকানো রাখা যায়।
- কুরআন/হাদিসের রেফারেন্স এবং ছবি/ভিডিওর উৎস ও কৃতিত্ব উল্লেখ করুন। Super Admin/Website Admin সর্বোচ্চ ১০ MB-এর ছবি সরাসরি আপলোড করতে পারবেন; ভিডিও YouTube বা নির্ভরযোগ্য উৎসের লিংক দিয়ে যোগ হবে।

## Backend
Accounts ও Admin-এর authentication এবং persistent data storage-এর জন্য Supabase ব্যবহার করা হয়েছে। SQL schema: `supabase/schema.sql`; connection config: `supabase-config.js`. Supabase project URL ও anon/public key না বসানো পর্যন্ত login ও database operation চালু হবে না। সেটআপের পূর্ণ নির্দেশিকা: `SUPABASE_SETUP.md`.

**গুরুত্বপূর্ণ:** service_role key কখনো browser code বা GitHub-এ রাখবেন না। Public sign-up বন্ধ রাখুন। প্রথম Super Admin তৈরি ও role assignment Supabase Dashboard থেকে করতে হবে। RLS policy মসজিদ ও ফাউন্ডেশনের হিসাব আলাদা রাখে।

## Admin Panel enhancement migration

Validation workflow: repair branch runs checks only; production deployment remains limited to `main`.

Run `supabase/admin-panel-enhancements.sql` in Supabase SQL Editor after the existing `schema.sql`, `admin-modules.sql`, `module-permissions.sql`, and `public-module-records.sql` scripts. This migration adds private Muslim registration (m61), expands module permissions, enables role-scoped media uploads, and permits published dynamic navigation/SEO records. It updates the public `site-media` bucket to accept images, PDFs and MP4/WebM/OGG videos up to 100 MB per object; project storage quotas and upload limits still apply. Muslim registration records are private and require the registrant's consent.

## Accounts permission repair

For existing projects where the Accounts page reports `permission denied for table ledger_entries`, run `supabase/accounts-permissions-fix.sql` in Supabase SQL Editor after the schema and Admin module SQL.

## যাচাইকৃত তথ্যনীতি
নামাজের সময়, কমিটির সদস্য, ফোন নম্বর, আর্থিক পরিমাণ ও প্রকল্পের অগ্রগতি দায়িত্বশীল কর্তৃপক্ষ যাচাই না করা পর্যন্ত চূড়ান্ত তথ্য হিসেবে প্রকাশ করা যাবে না।


## Basic Package — বাংলা কনটেন্ট সীমা

- পাবলিক ওয়েবসাইটের প্রধান পরিচিতি ও নেভিগেশন বাংলা ভাষায় রাখা হয়েছে।
- পাবলিক পেজ ও অ্যাডমিন প্যানেলের দীর্ঘ লেখার প্রতিটি textarea-তে সর্বোচ্চ ৫০০ শব্দের লাইভ গণনা ও সীমা প্রয়োগ হয়।
- অ্যাডমিন মডিউল ফর্মে সংরক্ষণের আগেও ৫০০ শব্দ যাচাই হয়।
- ডেটাবেস পর্যায়ে সীমা কার্যকর করতে Supabase SQL Editor-এ `supabase/basic-package-500-word-limit.sql` একবার চালাতে হবে।

## Enterprise Accounts additions

The live Supabase project includes account_staff, payroll_records, account_obligations, and account_assets, with row-level security and audit triggers. The Accounts page loads accounts-enterprise.js for payroll, cashbook/bankbook, receivables/payables, asset register, and audit history. The cash/bank books are read-only projections of approved ledger entries to avoid double counting. Payroll payment creates a pending expense ledger entry that still requires normal ledger approval.

For a fresh database after the base schema and Accounts permission repair, run supabase/accounts-enterprise-extensions.sql in the Supabase SQL Editor. Never add sample financial or staff data to production without authorization.
