import re, subprocess, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
class Checker(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]; self.scripts=[]; self.current=None
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag=='script': self.current=[]
    def handle_data(self, data):
        if self.current is not None: self.current.append(data)
    def handle_endtag(self, tag):
        if tag=='script' and self.current is not None:
            self.scripts.append(''.join(self.current)); self.current=None

def check_html(path):
    parser=Checker(); parser.feed(path.read_text(encoding='utf-8'))
    duplicates=sorted({x for x in parser.ids if parser.ids.count(x)>1})
    assert not duplicates, f'{path.name}: duplicate IDs: {duplicates}'
    for n, script in enumerate(parser.scripts):
        if not script.strip(): continue
        result=subprocess.run(['node','--check','--input-type=module'],input=script,text=True,capture_output=True)
        assert result.returncode==0, f'{path.name} inline script {n+1}: {result.stderr}'
    return parser

index=check_html(ROOT/'index.html')
admin=check_html(ROOT/'admin.html')
accounts=check_html(ROOT/'accounts.html')
html=(ROOT/'index.html').read_text(encoding='utf-8')
for category in ('article','gallery','video'):
    count=len(re.findall(r'id="'+category+r'-slots"',html))
    assert count==1, f'missing/duplicate {category} slot container'
    match=re.search(r'<div class="grid content-slots" id="'+category+r'-slots">(.*?)</div></section>',html,re.S)
    assert match, f'{category}: slot container missing'
    count=len(re.findall(r'data-slot="(?:[1-9]|10)"',match.group(1)))
    minimum={'article':10,'gallery':3,'video':5}[category]
    assert count>=minimum, f'{category}: expected at least {minimum} curated starter cards, found {count}'
assert 'create table if not exists public.site_content' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
assert 'source_url text' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
assert 'media_credit text' in (ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
assert "insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)" in (ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
assert "site media approvers upload" in (ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
assert "contentUpload" in (ROOT/'admin.html').read_text(encoding='utf-8')
assert "site-media').upload" in (ROOT/'admin.html').read_text(encoding='utf-8')
assert 'ইসলামিক জ্ঞানভান্ডার' in html and 'ইসলামিক আলোকচিত্র' in html and 'ভিডিও শিক্ষা ও দাওয়াহ' in html
assert 'শায়লা আকরাম কেন্দ্রীয় ফাউন্ডেশন' in html
assert 'শায়লা আক্রাম' not in html, 'Homepage: misspelled institution name found'
assert 'source_url' in (ROOT/'admin.html').read_text(encoding='utf-8')
assert 'media_credit' in (ROOT/'admin.html').read_text(encoding='utf-8')
assert 'source_url,media_credit,updated_at' in html
assert 'create table if not exists public.budgets' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
accounts=(ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'range(offset,offset+499)' in accounts, 'Accounts: ledger pagination is missing'
assert 'const accountCache={entries:[]}' in accounts and 'cachedEntries' not in accounts, 'Accounts: cache must initialize before async boot'
admin_modules_source=(ROOT/'admin-modules.js').read_text(encoding='utf-8')
assert "a.href='./accounts.html'" in admin_modules_source and 'if(m.g===4)return false' in admin_modules_source, 'Admin: Accounts must be a separate panel'
assert 'option value="both"' not in admin_modules_source, 'Admin: website forms must not offer institution=both as a selectable option'
assert 'dhakaDate' in accounts and 'dhakaMonth' in accounts
assert 'tab.location.href=data.signedUrl' in accounts, 'Accounts: receipt popup must be opened before async URL request'
assert 'uploadedReceiptPath' in accounts, 'Accounts: uploaded receipts must be cleaned up if ledger insert fails'
assert 'range(offset,offset+299)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8')
assert 'আর্টিক্যাল undefined' not in html, 'Homepage: slot 10 contains undefined text'
intro_start=html.index('<div class="intro-history-column">')
history_end=html.index('</section>', intro_start)
notice_section=html.index('aria-label="সর্বশেষ নোটিশ ও সাম্প্রতিক কার্যক্রম"')
notice_start=html.index('<div class="homegrid">', notice_section)
assert intro_start < history_end < notice_section < notice_start, 'Homepage: history and latest updates sections must exist in document order'
assert 'id="latest-notice-content"' in html and 'id="latest-activity-content"' in html
assert "from('announcements')" in html and "eq('status','published')" in html
assert 'YOUR-PROJECT' in (ROOT/'supabase-config.js').read_text(encoding='utf-8') or 'https://' in (ROOT/'supabase-config.js').read_text(encoding='utf-8')
print('Static site checks passed: HTML IDs, inline JavaScript syntax, 30 homepage slots, and Supabase schema markers.')

admin_modules = (ROOT/'admin-modules.js').read_text(encoding='utf-8')
module_data = admin_modules.split('const data=[', 1)[1].split('];' + chr(10) + 'const groups=', 1)[0]
module_count = len(re.findall(r"\['[^']+','[^']+'\]", module_data))
assert module_count == 61, f'Admin Panel: expected 61 module definitions, found {module_count}'
subprocess.run(['node','--check','--input-type=module'],input=admin_modules,text=True,capture_output=True,check=True)
migration=(ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
assert 'create table if not exists public.module_records' in migration
assert 'alter table public.profiles add constraint profiles_role_check' in migration
assert 'public can read published announcements' in migration
assert "status in ('draft','pending')" in migration
assert 'guard_module_record_publication' in migration
assert 'guard_public_content_publish' in migration
assert 'before insert or update or delete on public.site_content' in migration
assert 'may unpublish content' in migration
assert 'accounts managers insert budgets' in migration
assert 'accounts read institution receipts' in migration
assert 'accounts delete unlinked own receipts' in migration
assert 'receipt_is_unlinked' in migration
assert "'mosque_admin','foundation_admin'" in migration
assert 'as '+chr(36)+'guard'+chr(36) in migration
schema=(ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
assert "public.has_access(array['super_admin','admin','website_admin','editor'],null)" in schema
for js in ('admin-modules.js','admin-users.js','supabase-client.js'):
    subprocess.run(['node','--check','--input-type=module'],input=(ROOT/js).read_text(encoding='utf-8'),text=True,capture_output=True,check=True)
enhancements=(ROOT/'supabase/admin-panel-enhancements.sql').read_text(encoding='utf-8')
assert 'm61' in enhancements and 'replace_admin_module_permissions' in enhancements
assert 'video/mp4' in enhancements and 'application/pdf' in enhancements
assert 'public.module_record_access' in enhancements
assert 'মুসল্লী নিবন্ধন' in admin_modules
assert all(x in admin_modules for x in ('dashIncome','dashExpense','dashPending','dashMembers','dashEvents','dashTasks','dashProjects','dashReports')), 'Admin: live dashboard metrics are incomplete'
assert 'ledger_entries' in admin_modules and 'dashboardRefresh' in admin_modules, 'Admin: dashboard must load live account data and support refresh'
assert 'dash-shortcuts' in admin_modules and 'dashUpcoming' in admin_modules and 'dashRecent' in admin_modules, 'Admin: dashboard quick links and activity panels are missing'
assert 'dash-metrics' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin: responsive dashboard styles are missing'
print('Admin Panel checks passed: 61 module definitions, module JS syntax, and RLS migration markers.')

assert 'staffManager' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin: Super Admin account manager is missing'
assert 'admin_module_permissions' in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Module permission migration is missing'
assert 'createUser' in (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8'), 'Secure Auth user creation Edge Function is missing'
assert 'custom_admin' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Custom module permissions are not wired into Admin modules'
assert 'document.querySelector' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Staff permission checkboxes must query their controls safely'
assert 'staffManager' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Super Admin account panel must remain visible after module shell starts'

assert 'replace_admin_module_permissions' in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Permissions must be replaced atomically by a server-only RPC'
assert 'admin.rpc("replace_admin_module_permissions"' in (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8'), 'Edge Function must use the atomic permission RPC'

assert 'hasAccountModule' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts panel must honor per-module grants'
assert "account_module_permission(institution,array['m48'],true)" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Budget writes must require the budget module grant'
assert "account_module_permission(split_part(name,'/',1),array['m42','m43','m44','m45','m49'],true)" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Receipt uploads must require the receipt module grant'

# Enterprise Premium additions: Bengali read-aloud and monthly chanda workflow.
assert (ROOT/'read-aloud.js').exists(), 'Read Aloud: client script is missing'
assert 'SpeechSynthesisUtterance' in (ROOT/'read-aloud.js').read_text(encoding='utf-8')
assert 'bn-BD' in (ROOT/'read-aloud.js').read_text(encoding='utf-8')
chanda_js=(ROOT/'chanda-admin.js').read_text(encoding='utf-8')
assert "from('chanda_members')" in chanda_js
assert "from('chanda_dues')" in chanda_js
assert "rpc('record_chanda_payment'" in chanda_js
assert "from('chanda_message_logs')" in chanda_js
chanda_sql=(ROOT/'supabase/chanda-enterprise.sql').read_text(encoding='utf-8')
for marker in ('create table if not exists public.chanda_members','create table if not exists public.chanda_dues','create table if not exists public.chanda_payments','create table if not exists public.chanda_message_logs','enable row level security','record_chanda_payment','chanda-daily-reminder-queue'):
    assert marker in chanda_sql, f'Chanda migration missing: {marker}'
admin_html=(ROOT/'admin.html').read_text(encoding='utf-8')
assert 'chanda-admin.js' in admin_html, 'Admin: monthly chanda module script is not loaded'
print('Enterprise additions checks passed: Read Aloud and chanda dues/payment/reminder modules.')

# Enterprise Accounts additions.
enterprise_js=(ROOT/'accounts-enterprise.js').read_text(encoding='utf-8')
subprocess.run(['node','--check','--input-type=module'],input=enterprise_js,text=True,capture_output=True,check=True)
assert 'accounts-enterprise.js' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts: enterprise feature script is not loaded'
for marker in ('account_staff','payroll_records','account_obligations','account_assets','account_cash_bank_book','mark_payroll_paid','guard_payroll_record_changes'):
    assert marker in (ROOT/'supabase/accounts-enterprise-extensions.sql').read_text(encoding='utf-8'), f'Accounts enterprise migration missing: {marker}'
for marker in ('payrollPanel','cashBankPanel','obligationsPanel','assetsPanel'):
    assert marker in (ROOT/'accounts.html').read_text(encoding='utf-8'), f'Accounts UI missing: {marker}'

assert 'data-payroll-slip' in enterprise_js, 'Accounts: printable salary slip action is missing'
assert 'range(offset,offset+499)' in enterprise_js, 'Accounts: cash/bank report pagination is missing'
assert "allowed('m43')" in enterprise_js and "allowed('m46')" in enterprise_js and "allowed('m50')" in enterprise_js, 'Accounts: enterprise modules must honor the existing expense, bank/cash and audit grants'
# The 61st mosque-member register must be valid but remain private.
assert "m61" in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Admin users: module 61 is missing from permission assignment'
assert "6[01]" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Database permissions must accept module 61'
assert "target_key='m61'" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Database module access must explicitly authorize mosque member register'
assert "target_key='m51'" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Member module 51 must allow mosque/account read access with admin-only writes'
assert "m.n===51||m.n===61||m.g===2" in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Member module 51 must be scoped to mosque records'
assert 'function customInstitutionAllowed(m)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Custom admins must be limited to their institution for mosque/foundation modules'
assert '[4,7,8,9,10].includes(m.n)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Website editors must access the home/menu/page/calendar content modules'
assert "target_key='m04'" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Calendar module 4 must be accessible to website editors'
assert 'privateOnlyModules=new Set' in (ROOT/'admin-modules.js').read_text(encoding='utf-8') and '61' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Module 61 must stay private'
# The 61-module enterprise site is not subject to the Basic package's 500-word/15-module restrictions.
assert 'content-limits.js' not in (ROOT/'admin.html').read_text(encoding='utf-8') and 'content-limits.js' not in (ROOT/'index.html').read_text(encoding='utf-8'), 'Enterprise pages must not load the Basic 500-word limiter'
assert 'countWords500' not in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Enterprise module records must not enforce the Basic 500-word cap'
assert 'function openPublishedPage' in (ROOT/'index.html').read_text(encoding='utf-8'), 'Published custom pages must open from dynamic navigation'
assert '০৪:৫৯' not in (ROOT/'index.html').read_text(encoding='utf-8') and 'সময় প্রকাশিত হয়নি' in (ROOT/'index.html').read_text(encoding='utf-8'), 'Do not show unverified fixed prayer times'
assert "m.n===9?data.visibility==='প্রকাশিত'" in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Page publishing must honor the explicit visibility setting'
assert 'm09' in (ROOT/'supabase/public-module-records.sql').read_text(encoding='utf-8'), 'Public page records must be allowed by the public allowlist'
assert "case_notes" not in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Public assistance modules must not include individual case notes'
assert 'add constraint module_records_mosque_basic_module_key_check' not in (ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8'), 'Enterprise modules must not be restricted to Basic module keys'
for key in ('22:fieldSchemas[6]','23:fieldSchemas[7]','24:fieldSchemas[5]','25:fieldSchemas[8]','26:fieldSchemas[11]','27:fieldSchemas[9]','28:fieldSchemas[4]'):
    assert key in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), f'Admin module schema mapping missing: {key}'
assert 'id="bookPeriod"' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts: daily/monthly/yearly book filters are missing'
assert "schedule:" in (ROOT/'.github/workflows/sakm61-database-backup.yml').read_text(encoding='utf-8'), 'Backup: daily schedule is missing'
assert 'postgres.lmwczibsipczfymhyqba' in (ROOT/'.github/workflows/sakm61-database-backup.yml').read_text(encoding='utf-8'), 'Backup: pooler username validation is missing'
print('Enterprise Accounts checks passed: external JS syntax, payroll, cash/bank books, obligations, assets and migration markers.')

# Accounts messaging center and upcoming monthly chanda dues.
messaging_js=(ROOT/'accounts-messaging.js').read_text(encoding='utf-8')
subprocess.run(['node','--check','--input-type=module'],input=messaging_js,text=True,capture_output=True,check=True)
assert 'accountsMessaging' in (ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'accounts-messaging.js' in (ROOT/'accounts.html').read_text(encoding='utf-8')
message_sql=(ROOT/'supabase/accounts-messaging-center.sql').read_text(encoding='utf-8')
for marker in ('accounts_message_queue','accounts_message_attempts','enable row level security','accounts_message_access'):
    assert marker in message_sql, f'Accounts messaging migration missing: {marker}'
dispatch=(ROOT/'supabase/functions/message-dispatch/index.ts').read_text(encoding='utf-8')
webhook=(ROOT/'supabase/functions/message-status-webhook/index.ts').read_text(encoding='utf-8')
assert 'WHATSAPP_ACCESS_TOKEN' in dispatch and 'SMS_API_TOKEN' in dispatch
assert 'awaiting_delivery' in dispatch and 'MESSAGE_WEBHOOK_SECRET' not in dispatch
assert 'MESSAGE_WEBHOOK_SECRET' in webhook and 'provider_message_id' in webhook
chanda_source=(ROOT/'chanda-admin.js').read_text(encoding='utf-8')
assert 'chanda-status' in chanda_source and 'd.due_date<=today' in chanda_source
assert 'next_month_start' in (ROOT/'supabase/chanda-upcoming-month-due.sql').read_text(encoding='utf-8')
print('Accounts messaging checks passed: queue UI, RLS, WhatsApp-first/SMS fallback, webhook and monthly chanda status window.')

assert 'accounts_message_queue_created_by_idx' in (ROOT/'supabase/accounts-messaging-center.sql').read_text(encoding='utf-8')


# SAKM-61 Accounts dashboard: ensure the new external module is syntax-checked and wired.
dashboard_js=(ROOT/'accounts-dashboard.js').read_text(encoding='utf-8')
subprocess.run(['node','--check','--input-type=module'],input=dashboard_js,text=True,capture_output=True,check=True)
assert (ROOT/'accounts-dashboard.css').exists(), 'Accounts dashboard stylesheet is missing'
assert 'accounts-dashboard.css' in (ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'accounts-dashboard.js' in (ROOT/'accounts.html').read_text(encoding='utf-8')
module_block=re.search(r"const modules=\[(.*?)\];",dashboard_js,re.S)
assert module_block, 'Accounts dashboard module list is missing'
module_labels=re.findall(r"'([^']*)'",module_block.group(1))
assert len(module_labels)==22, f'Accounts dashboard must contain exactly 22 approved modules, found {len(module_labels)}'
assert 'দাতা ও অনুদান' in module_labels and 'মাসিক চাঁদা আদায়' not in module_labels and 'বার্তা ও নোটিফিকেশন' not in module_labels, 'Monthly chanda belongs inside Donations and messaging belongs inside Settings'
for marker in ("from('chanda_members')","from('chanda_dues')","from('chanda_payments')","record_chanda_payment","chanda_can_access","ensure_chanda_dues_for_month","renderTransfers","renderTrialBalance","renderReports","renderAdvancedSearch","renderReconciliation","resetAdPage","adLegacyBin","renderApprovals","renderUserPermissions","renderSettings","adInstitution","accounts_feature_access"):
    assert marker in dashboard_js, f'Accounts dashboard missing approved module integration: {marker}'
for marker in ('২০–২৪ তারিখ','২৫ তারিখ','আংশিক আদায়','আদায় সম্পন্ন','মাসিক চাঁদা আদায়ের রসিদ'):
    assert marker in dashboard_js, f'Accounts dashboard missing status/receipt behavior: {marker}'
assert 'ব্যালান্স শিট সারসংক্ষেপ' in dashboard_js, 'Trial balance module must include a balance-sheet summary'
assert dashboard_js.count("'") > 24, 'Accounts dashboard script appears truncated'
print('SAKM-61 Accounts dashboard checks passed: syntax, 22 approved modules, separate institution views, chanda integration and financial tools.')

assert 'ensure_chanda_dues_for_month' in dashboard_js, 'Accounts dashboard must create dues for the selected month using authenticated access'
assert (ROOT/'supabase/accounts-chanda-monthly-due-generation.sql').exists(), 'Monthly due generation migration source is missing'
assert (ROOT/'MESSAGING_SETUP.md').exists(), 'Provider-specific messaging setup guide is missing'
recon_sql=(ROOT/'supabase/account-bank-reconciliation-ui.sql').read_text(encoding='utf-8')
assert 'account_create_bank_reconciliation' in recon_sql and 'account_bank_reconciliation_candidates' in recon_sql, 'Secure reconciliation RPC source is missing'
assert 'validate_account_bank_reconciliation_item' in recon_sql and 'account_bank_reconciliation_items_delete' in recon_sql, 'Reconciliation matching security controls are missing'
bank_mask_sql=(ROOT/'supabase/accounts-bank-account-mask-hardening.sql').read_text(encoding='utf-8')
assert 'masked_number:=' in bank_mask_sql and 'right(digits,4)' in bank_mask_sql, 'Bank account number must be masked server-side'
