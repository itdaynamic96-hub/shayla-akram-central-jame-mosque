# SAKM-61 Project Identity

## Canonical identity
- Project name: **সাকছিপাড়া শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ ও শায়লা আকরাম কেন্দ্রীয় ফাউন্ডেশন**
- Project code: **SAKM-61**
- Product scope: one Bengali, mobile-responsive public website with a separate Admin Panel and Accounts Panel; 61 numbered administration modules.
- GitHub repository: https://github.com/itdaynamic96-hub/shayla-akram-central-jame-mosque
- Production branch: `main`
- Supabase project reference: `lmwczibsipczfymhyqba`
- Public website: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/
- Admin Panel: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/admin.html
- Accounts Panel: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html

## Do not confuse projects
This repository and Supabase project are the **SAKM-61** 61-module Enterprise website. Never replace, merge, rename, or apply its migrations to the separate `shayla-akram-mosque-basic` project or any 15-/20-module variant.

## Production boundaries
- Browser code may contain only the Supabase project URL and publishable/anon key. Never commit service-role keys, database passwords, provider tokens, webhook secrets, or backup encryption keys.
- Mosque and foundation financial data must remain institution-scoped and protected by RLS.
- Private receipts and Muslim registration data must not be made public.
- Module 61 (Muslim registration) is mosque-only and private; never expose it through public module publishing.
- Never insert sample staff, donor, member, or financial records into production without explicit authorization.
- Prayer times, committee members, phone numbers, financial amounts, and project progress must not be presented as verified facts until an authorized person confirms them.
- Messaging provider selection is Meta WhatsApp Cloud API first and eSMS Bangladesh second. The dispatch function uses the eSMS form-encoded API; the webhook supports Meta's GET verification challenge and HMAC-SHA256 POST signature. No external messages are sent until credentials are supplied. Live delivery and eSMS delivery-status polling remain unverified; see MESSAGING_SETUP.md. An approved WhatsApp Utility template with one body parameter is required for out-of-session reminders.
- Encrypted backups are best-effort recovery bundles, not guaranteed one-click project clones. They exclude password hashes, active sessions, provider credentials, Supabase project secrets, dashboard-only settings, and a verified fresh-project restore.

## Accounts Panel scope
- The approved Accounts Panel has **22 core modules** and separate Mosque/Foundation institution views, scoped by the signed-in profile and module permissions.
- Monthly chanda collection is integrated inside **Donors & Donations**; it is not a separate top-level module. Messaging and notification management is available inside **Settings**.
- The 22 modules include dashboard, income, expenses, donors/donations, bank/cash, transfers, cashbook/ledger, receivables/bills, payroll, budgets, funds, receipts/vouchers, financial reports, PDF/Excel, trial balance/balance sheet, search, bank reconciliation, audit/verification, approvals, audit trail, users/permissions, and settings.
- Bank reconciliation creation calculates book balance server-side. Statement lines must match posted journal lines for the same bank account, amount, direction, institution, and statement date; draft records can be removed by their creator.
- Bank account numbers are masked server-side; only the last four digits are retained in the masked field.

## Operational references
- Supabase project: https://supabase.com/dashboard/project/lmwczibsipczfymhyqba
- GitHub Actions secrets: https://github.com/itdaynamic96-hub/shayla-akram-central-jame-mosque/settings/secrets/actions
- Encrypted backup workflow: https://github.com/itdaynamic96-hub/shayla-akram-central-jame-mosque/actions/workflows/sakm61-database-backup.yml

## Verification status recorded 25 November 2026
- Supabase project status observed as `ACTIVE_HEALTHY`.
- All inspected public-schema tables had RLS enabled.
- Storage buckets observed: `private-receipts` (private), `mosque-media` (public), and `site-media` (public).
- Edge Functions observed as active: `message-dispatch` (v5), `message-status-webhook` (v8), and `admin-create-user`. `receipt_is_unlinked` now requires authenticated institution/module access before checking receipt references.
- Backup workflow Run #15 succeeded and uploaded one encrypted artifact. Restore into a fresh Supabase project has not been tested.
- Supabase Security Advisor still reported SECURITY DEFINER function warnings and disabled leaked-password protection at the time of inspection.
- Full end-to-end testing of all 61 modules, authenticated role permutations, real WhatsApp/SMS delivery, and restore has not yet been completed.
