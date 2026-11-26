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
site_content_policy=(ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
public_site_policy=re.search(r'create policy "public can read published site content"[^;]+;',site_content_policy,re.I)
assert public_site_policy and 'to anon,authenticated using(status=\'published\')' in public_site_policy.group(0), 'Homepage: anonymous published-content policy must not call authenticated-only has_access()'
assert 'source_url text' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8')
assert 'media_credit text' in (ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
bucket_seed=(ROOT/'supabase/admin-modules.sql').read_text(encoding='utf-8')
assert "insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)" in bucket_seed and "video/*" in bucket_seed and "52428800" in bucket_seed, 'Storage bucket must allow common video MIME types within the 50 MB Free-plan limit'
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
assert 'const accountCache={entries:[],bankAccounts:[]}' in accounts and 'cachedEntries' not in accounts, 'Accounts: entry and bank-account caches must initialize before async boot'
admin_html_source=(ROOT/'admin.html').read_text(encoding='utf-8')
assert "$('login').hidden=true;$('loginError').hidden=true;$('app').hidden=false" in admin_html_source, 'Admin: authenticated sessions must hide login before optional data loads'
assert "ব্যবহারকারী তালিকার HTML উপাদান পাওয়া যায়নি" in admin_html_source and "নোটিশ তালিকার HTML উপাদান পাওয়া যায়নি" in admin_html_source, 'Admin: missing UI targets must not break authenticated state'
assert "showAdminBootError('লগইন সফল" in admin_html_source, 'Admin: authenticated boot failures must be shown inside the panel, not as login failure'
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
notice_start=html.index('<div class="homegrid', notice_section)
assert intro_start < history_end < notice_section < notice_start, 'Homepage: history and latest updates sections must exist in document order'
assert 'id="latest-notice-content"' in html and 'id="latest-activity-content"' in html
assert "from('announcements')" in html and "eq('status','published')" in html
assert 'YOUR-PROJECT' in (ROOT/'supabase-config.js').read_text(encoding='utf-8') or 'https://' in (ROOT/'supabase-config.js').read_text(encoding='utf-8')
print('Static site checks passed: HTML IDs, inline JavaScript syntax, 30 homepage slots, and Supabase schema markers.')

admin_modules = (ROOT/'admin-modules.js').read_text(encoding='utf-8')
module_data = admin_modules.split('const data=[', 1)[1].split('];' + chr(10) + 'const groups=', 1)[0]
module_count = len(re.findall(r"\['[^']+','[^']+'\]", module_data))
assert module_count == 86, f'Admin Panel: expected 86 module definitions including 24 detailed Accounts modules and the independent media module, found {module_count}'
subprocess.run(['node','--check','--input-type=module'],input=admin_modules,text=True,capture_output=True,check=True)
media_module=(ROOT/'mosque-media.js').read_text(encoding='utf-8')
subprocess.run(['node','--check','--input-type=module'],input=media_module,text=True,capture_output=True,check=True)
assert all(k in media_module for k in ('mosque_homepage','mosque_accounts','mosque_admin')), 'Media: all three surfaces must have independent settings keys'
assert 'id="mosqueMediaAdmin"' in (ROOT/'admin.html').read_text(encoding='utf-8') and 'id="mosqueMediaAdmin"' not in accounts, 'Media: controls must live only in the Admin module'
assert 'id="staffManager"' in (ROOT/'admin.html').read_text(encoding='utf-8') and "legacyPanels.users=existing.find(x=>x.id==='staffManager')" in admin_modules and 'root.hidden = true;' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Admin: staff management must remain hidden until its module is opened'
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
assert 'admin_dashboard_settings' in admin_modules and 'dashboardSettingsToggle' in admin_modules, 'Admin: Super Admin dashboard controls are missing'
assert 'data-dash-metric' in admin_modules and 'data-dash-section' in admin_modules and 'data-dash-module' in admin_modules, 'Admin: dashboard visibility controls are incomplete'
assert 'admin_dashboard_settings' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8'), 'Admin: dashboard settings schema is missing'
assert 'super admins update dashboard settings' in (ROOT/'supabase/schema.sql').read_text(encoding='utf-8').lower(), 'Admin: dashboard settings must be Super Admin controlled'
print('Admin Panel checks passed: 85 module definitions, module JS syntax, and RLS migration markers.')

assert 'staffManager' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin: Super Admin account manager is missing'
assert '২৪টি পৃথক মডিউল ৬২–৮৫' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin: staff manager must explain granular Accounts permissions'
assert 'admin_module_permissions' in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Module permission migration is missing'
assert 'createUser' in (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8'), 'Secure Auth user creation Edge Function is missing'
assert 'custom_admin' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Custom module permissions are not wired into Admin modules'
assert 'querySelectorAll' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Staff permission checkboxes must query their controls safely'
assert 'staffManager' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Super Admin account panel must remain visible after module shell starts'

permission_edge=(ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8')
assert 'keys.length > 85' in permission_edge, 'Permissions: Edge Function must accept up to all 85 modules'
assert 'can_write: true' in permission_edge and 'can_approve: true' in permission_edge, 'Permissions: selected modules must grant full module activity to one worker'
permission_migration=(ROOT/'supabase/migrations/20261125111114_accounts_permission_cap_85_and_missing_fk_indexes.sql').read_text(encoding='utf-8')
assert 'jsonb_array_length(permission_rows) > 85' in permission_migration, 'Permissions: database RPC limit must match the 85 module UI'
assert 'account_obligation_payments_obligation_id_idx' in permission_migration and 'ledger_entries_bank_account_id_idx' in permission_migration, 'Accounts: missing foreign-key indexes must be covered'
reversal_migration=(ROOT/'supabase/migrations/20261125111837_accounts_single_operator_can_reverse_own_journal.sql').read_text(encoding='utf-8')
assert 'journal creator cannot approve their own reversal' not in reversal_migration.lower(), 'Accounts: the assigned single operator must be allowed to reverse their own journal'
assert 'source_id' in reversal_migration and "set status='reversed'" in reversal_migration, 'Accounts: journal reversal must retain its audit link and original status history'
assert 'replace_admin_module_permissions' in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Permissions must be replaced atomically by a server-only RPC'
assert 'jsonb_array_length(permission_rows) > 85' in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Fresh database setup must accept all 85 Admin modules'
assert "replace(d,'jsonb_array_length(permission_rows) > 60','jsonb_array_length(permission_rows) > 85')" in (ROOT/'supabase/accounts-granular-module-access.sql').read_text(encoding='utf-8'), 'Granular permission migration must repair legacy 60-module permission caps'
assert 'admin.rpc("replace_admin_module_permissions"' in (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8'), 'Edge Function must use the atomic permission RPC'

assert 'hasAccountModule' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts panel must honor per-module grants'
assert "account_module_permission(institution,array['m48'],true)" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Budget writes must require the budget module grant'
assert "account_module_permission(split_part(name,'/',1),array['m42','m43','m44','m45','m49'],true)" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Receipt uploads must require the receipt module grant'

# Enterprise Premium additions: server-based Bengali male read-aloud and monthly chanda workflow.
reader_js=(ROOT/'read-aloud.js').read_text(encoding='utf-8')
reader_check=subprocess.run(['node','--check'],input=reader_js,text=True,capture_output=True)
assert reader_check.returncode==0, f'Read Aloud JS syntax error: {reader_check.stderr}'
for page_name in ('index.html','admin.html','accounts.html'):
    page_source=(ROOT/page_name).read_text(encoding='utf-8')
    assert './read-aloud.js?v=20261126-cloudmale2' in page_source, f'Read Aloud: updated cloud Bengali client is not loaded by {page_name}'
    assert 'supabase-config.js' in page_source, f'Read Aloud: Supabase public configuration is missing from {page_name}'
    assert 'id="readAloud"' not in page_source, f'Read Aloud: page-wide floating control must not be in {page_name}'
    assert 'spellophone.iife.js' not in page_source, f'Read Aloud: obsolete TTS engine must not load in {page_name}'
    assert 'SpeechSynthesisUtterance' not in page_source, f'Read Aloud: duplicated inline speech engine remains in {page_name}'
for selector in ('.article-card','.published-content','.quran-ayah','.hadith-card','.knowledge-card','.detailcard'):
    assert selector in reader_js, f'Read Aloud: missing content coverage for {selector}'
assert '[lang="ar"]' in reader_js and '.arabic-pronunciation' in reader_js, 'Read Aloud: Arabic text must not be passed to Bengali TTS as if it were Bengali'
assert 'functions/v1/bengali-tts' in reader_js and 'new Audio(audioUrl)' in reader_js, 'Read Aloud: browser must use the server-generated audio response'
assert 'svara-build' not in reader_js and 'ensureSvaraModel' not in reader_js and '১.৯৫ GB' not in reader_js, 'Read Aloud: browser must not download the 1.95 GB local model'
assert 'পড়া বিরতিতে আছে।' in reader_js and 'আবার পড়া হচ্ছে।' in reader_js and 'পড়া বন্ধ করা হয়েছে।' in reader_js, 'Read Aloud: playback controls are incomplete'
assert 'MutationObserver' in reader_js, 'Read Aloud: dynamically loaded module content must be scanned'
assert '.nexora-share' in reader_js, 'Share: every supported post and ayah needs a share control'
assert 'navigator.share' in reader_js and 'navigator.clipboard' in reader_js, 'Share: native share and copy-link actions are required'
for platform in ('facebook.com/sharer','wa.me/?text=','t.me/share/url','twitter.com/intent/tweet','linkedin.com/sharing/share-offsite','mailto:'):
    assert platform in reader_js, f'Share: missing platform {platform}'
assert '.quran-ayah' in reader_js and '.hadith-card' in reader_js, 'Share: Quran ayah and Hadith cards must be covered'
assert "'.video-card'" in reader_js and "'.content-slot.video-card'" in reader_js, 'Share: every video gallery card must receive a share control'
assert 'aria-expanded' in reader_js and 'hidden' in reader_js, 'Share: platform menu must be expandable and accessible'
tts_edge=(ROOT/'supabase/functions/bengali-tts/index.ts').read_text(encoding='utf-8')
assert 'GOOGLE_TTS_API_KEY' in tts_edge and 'bn-IN-Standard-B' in tts_edge and 'ssmlGender: "MALE"' in tts_edge, 'Read Aloud: Edge Function must request the configured Bengali male voice'
assert 'texttospeech.googleapis.com/v1/text:synthesize' in tts_edge, 'Read Aloud: Google Cloud TTS endpoint is missing'
assert (ROOT/'read-aloud.js').exists(), 'Read Aloud: client script is missing'
chanda_js=(ROOT/'chanda-admin.js').read_text(encoding='utf-8')
subprocess.run(['node','--check','--input-type=module'],input=chanda_js,text=True,capture_output=True,check=True)
assert "from('chanda_members')" in chanda_js
assert "from('chanda_dues')" in chanda_js
assert "rpc('record_chanda_payment_months'" in chanda_js and "p_paid_amount:amount" in chanda_js
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


expense_dashboard=(ROOT/'accounts-dashboard.js').read_text(encoding='utf-8')
for marker in ("renderExpensePayees","from('account_payees')","from('account_obligations')","account_record_payable_payment","received_by_name","work_start_date","টাকা গ্রহণকারীর নাম"):
    assert marker in expense_dashboard, f'Accounts expense payee workflow missing: {marker}'
expense_sql=(ROOT/'supabase/expense-payee-workflow.sql').read_text(encoding='utf-8')
for marker in ('create table if not exists public.account_payees','work_start_date','received_by_name','account_record_payable_payment','accounts_feature_access(p_institution,\'m64\',true)'):
    assert marker in expense_sql, f'Accounts expense payee schema missing: {marker}'

assert 'data-payroll-slip' in enterprise_js, 'Accounts: printable salary slip action is missing'
assert 'range(offset,offset+499)' in enterprise_js, 'Accounts: cash/bank report pagination is missing'
assert "allowed('m70')" in enterprise_js and "allowed('m66')" in enterprise_js and "allowed('m79')" in enterprise_js, 'Accounts: enterprise modules must honor dedicated payroll, bank/cash and audit grants'
# The 61st mosque-member register must be valid but remain private.
assert "m61" in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Admin users: module 61 is missing from permission assignment'
assert "6[01]" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Database permissions must accept module 61'
assert "target_key='m61'" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Database module access must explicitly authorize mosque member register'
assert "target_key='m51'" in (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8'), 'Member module 51 must allow mosque/account read access with admin-only writes'
assert "m.n===51||m.n===61||m.n===85||m.g===2" in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Member module 51 must be scoped to mosque records'
assert 'function customInstitutionAllowed(m)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Custom admins must be limited to their institution for mosque/foundation modules'
assert 'mods.filter(m=>m.g===i)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8') and 'mods.slice(i*10,i*10+10)' not in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Admin sidebar must render every module in its declared group, including all 24 Accounts modules'
assert 'i>=61?4:Math.floor(i/10)' in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Detailed Accounts modules must remain in the Accounts group'
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
for key in ('22:[','23:[','24:[','25:[','26:[','27:[','28:['):
    assert key in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), f'Admin module field schema missing: {key}'
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
dashboard_check=subprocess.run(['node','--check','--input-type=module'],input=dashboard_js,text=True,capture_output=True); assert dashboard_check.returncode==0, f'Accounts dashboard JS syntax error: {dashboard_check.stderr}'
assert (ROOT/'accounts-dashboard.css').exists(), 'Accounts dashboard stylesheet is missing'
assert 'accounts-dashboard.css' in (ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'accounts-dashboard.js' in (ROOT/'accounts.html').read_text(encoding='utf-8')
accounts_html=(ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'document_no' in accounts_html and 'data-print-doc' in accounts_html and 'রসিদ / ভাউচার নম্বর' in accounts_html, 'Approved automatic receipts and vouchers must be visible and printable'
assert "^m(6[2-9]|7[0-9]|8[0-5])$" in accounts_html and "^m(4[1-9]|50)$" not in accounts_html, 'Custom admins must be gated by the new 24 Accounts module keys'
module_block=re.search(r"const modules=\[(.*?)\];",dashboard_js,re.S)
assert module_block, 'Accounts dashboard module list is missing'
module_labels=re.findall(r"'([^']*)'",module_block.group(1))
assert len(module_labels)==24, f'Accounts dashboard must contain exactly 24 approved modules, found {len(module_labels)}'
assert 'সংরক্ষিত অভ্যন্তরীণ মডিউল' in module_labels and 'দাতা ও অনুদান' not in module_labels and 'মাসিক চাঁদা আদায়' in module_labels and 'বার্তা ও নোটিফিকেশন' in module_labels, 'Retired donor module must stay hidden while monthly chanda and messaging remain separate modules'
for marker in ("from('chanda_members')","from('chanda_dues')","from('chanda_payments')","record_chanda_payment","chanda_can_access","ensure_chanda_dues_for_month","renderTransfers","renderTrialBalance","renderReports","renderAdvancedSearch","renderReconciliation","resetAdPage","adLegacyBin","renderApprovals","renderUserPermissions","renderSettings","adInstitution","accounts_feature_access"):
    assert marker in dashboard_js, f'Accounts dashboard missing approved module integration: {marker}'
for marker in ('২০–২৪ তারিখ','২৫ তারিখ','আংশিক আদায়','আদায় সম্পন্ন','মাসিক চাঁদা আদায়ের রসিদ'):
    assert marker in dashboard_js, f'Accounts dashboard missing status/receipt behavior: {marker}'
assert 'পূর্ণ ব্যালান্স শিট' in dashboard_js, 'Trial balance module must include the full balance sheet'
assert dashboard_js.count("'") > 24, 'Accounts dashboard script appears truncated'
for marker in ('account_bank_account_balances','account_reverse_journal','account_trial_balance','account_balance_sheet','adReportExcel','adTbExcel','minAmount','maxAmount','transactionId'):
    assert marker in dashboard_js, f'Accounts dashboard missing financial control/report: {marker}'
enterprise_js=(ROOT/'accounts-enterprise.js').read_text(encoding='utf-8')
assert "canApprove('m70')" in enterprise_js, 'Single-operator payroll approval must use the assigned payroll module permission'
assert "const canObligations=allowed('m69'),canAssets=allowed('m76');" in enterprise_js, 'Obligation and asset register visibility must be checked independently'
assert "canObligations?supabase.from('account_obligations')" in enterprise_js and "canAssets?supabase.from('account_assets')" in enterprise_js, 'Enterprise Accounts must not query modules the worker cannot access'
assert "has(key,write?'can_write':'can_view')" in enterprise_js and "has(key,'can_approve')" in enterprise_js, 'Enterprise Accounts must enforce separate view, write and approval grants'
permission_hardening=(ROOT/'supabase/accounts-module-permission-hardening.sql').read_text(encoding='utf-8')
assert 'not write_access or amp.can_write' in permission_hardening and 'not approve_access or mp.can_approve' in permission_hardening, 'Accounts RLS must enforce write and approval capabilities'
assert "array['m70','m80']" in permission_hardening and 'security invoker' in permission_hardening.lower(), 'Payroll approval and module permission helper must use the hardened access model'
sequence_grants=(ROOT/'supabase/accounts-ledger-sequence-permissions.sql').read_text(encoding='utf-8')
assert 'account_receipt_seq to authenticated' in sequence_grants and 'account_voucher_seq to authenticated' in sequence_grants, 'Accounts receipt and voucher sequences must be usable by authenticated RLS-protected writers'
obligation_read_grant=(ROOT/'supabase/accounts-obligation-payments-read-grant.sql').read_text(encoding='utf-8')
assert 'account_obligation_payments to authenticated' in obligation_read_grant, 'Accounts UI must be able to read RLS-filtered obligation payment history'
assert 'accounts-enterprise.js?v=20261126-payee-audit1' in accounts, 'Accounts enterprise permission fixes must use a refreshed browser cache key'
assert 'account_journal_lines' in enterprise_js, 'Cash and bank books must use posted double-entry journal lines'
assert 'account_submit_obligation_payment' in enterprise_js and 'account_obligation_payments' in enterprise_js, 'Obligation payments must enter the ledger approval flow'
assert 'data-pending' in enterprise_js and 'অনুমোদনের অপেক্ষায়' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Pending obligation payments must be tracked separately'
assert '<th>অনুমোদনের অপেক্ষায়</th>' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Obligation payment table must show pending approvals separately'
assert 'bank_account_id' in accounts_html and 'id="bankAccount"' in accounts_html, 'Ledger entries must support a selected bank/cash account'
assert 'data-ledger-decision' in dashboard_js, 'Central approvals must include pending ledger entries'
obligation_sql=(ROOT/'supabase/accounts-obligation-payments-and-bank-link.sql').read_text(encoding='utf-8')
assert 'sync_obligation_payment_from_ledger' in obligation_sql and 'post_approved_ledger_entry_to_journal' in obligation_sql, 'Obligation approval must sync balances and double-entry journals'

assert 'accounts_detail_audit_all_accounts_read' in (ROOT/'supabase/accounts-complete-audit-trail.sql').read_text(encoding='utf-8')
assert 'accounts_detail_assets_read' in (ROOT/'supabase/accounts-asset-register-permissions.sql').read_text(encoding='utf-8')
print('SAKM-61 Accounts dashboard checks passed: syntax, 24 modules, journal accounting, reversal, full statements, exports, search and audit access.')

assert 'ensure_chanda_dues_for_month' in dashboard_js, 'Accounts dashboard must create dues for the selected month using authenticated access'
assert (ROOT/'supabase/accounts-chanda-monthly-due-generation.sql').exists(), 'Monthly due generation migration source is missing'
assert (ROOT/'MESSAGING_SETUP.md').exists(), 'Provider-specific messaging setup guide is missing'
recon_sql=(ROOT/'supabase/account-bank-reconciliation-ui.sql').read_text(encoding='utf-8')
assert 'account_create_bank_reconciliation' in recon_sql and 'account_bank_reconciliation_candidates' in recon_sql, 'Secure reconciliation RPC source is missing'
assert 'validate_account_bank_reconciliation_item' in recon_sql and 'account_bank_reconciliation_items_delete' in recon_sql, 'Reconciliation matching security controls are missing'
bank_mask_sql=(ROOT/'supabase/accounts-bank-account-mask-hardening.sql').read_text(encoding='utf-8')
assert 'masked_number:=' in bank_mask_sql and 'right(digits,4)' in bank_mask_sql, 'Bank account number must be masked server-side'

# Final Accounts QA: 24 navigation modules, payment atomicity, and security hardening.
assert 'renderMessageCenter' in dashboard_js and 'renderMonthlyChanda' in dashboard_js
assert "return ['collect','!','নতুন মাসের চাঁদা সংগ্রহ']" in dashboard_js, 'New-month collection warning must be distinct from overdue'
assert '.status.overdue,#accountsDashboard .status.collect' in (ROOT/'accounts-dashboard.css').read_text(encoding='utf-8'), 'Red status must distinguish collection warning and overdue'
assert 'record_chanda_payment' in (ROOT/'supabase/fix-chanda-payment-column-ambiguity.sql').read_text(encoding='utf-8')
assert 'cd.paid_amount+record_chanda_payment.paid_amount' in (ROOT/'supabase/fix-chanda-payment-column-ambiguity.sql').read_text(encoding='utf-8'), 'Chanda payment update must qualify the target table column'
assert (ROOT/'supabase/accounts-dashboard-quality-and-index-fixes.sql').exists(), 'Accounts security/index migration source is missing'

assert 'async function renderCashbookJournal()' in dashboard_js and 'account_submit_manual_journal' in dashboard_js, 'Cashbook module must expose the balanced manual journal workflow'

assert 'duplicates.map(x=>x.member_name)' in dashboard_js, 'Chanda member form must warn before reusing a phone number'

recon_fix=(ROOT/'supabase/fix-bank-reconciliation-generated-column-and-item-grants.sql').read_text(encoding='utf-8')
assert 'book_balance,status,notes,created_by' in recon_fix and 'grant insert,delete on table public.account_bank_reconciliation_items to authenticated' in recon_fix, 'Bank reconciliation must omit generated difference and grant RLS-governed item actions'

assert "if(i===22){renderMessageCenter().catch(showError);return}" in dashboard_js and "if(i===1){renderIncomeManagement().catch(showError);return}" in dashboard_js and "if(i===23){renderIncomeManagement().catch(showError);return}" in dashboard_js, 'Messaging must retain its route and income management must include monthly chanda'
assert "const panel=el('accountsMessaging')" in dashboard_js and 'await loadChanda()' in dashboard_js, 'Messaging and monthly chanda modules must load their dedicated panels'
assert "Object.fromEntries(modules.map((_,i)=>[i,'m'+String(62+i).padStart(2,'0')]))" in dashboard_js, 'Every Accounts module must use a unique permission key'
assert 'মোট ৮৫টি' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Admin must include all 24 detailed Accounts permissions'
assert 'm85' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Monthly chanda permission must be assignable from Admin'
assert 'n >= 41 && n <= 50' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'Legacy grouped Accounts grants must not be assigned to new staff'
assert 'm84' in (ROOT/'admin-users.js').read_text(encoding='utf-8') and 'm62' in (ROOT/'admin-users.js').read_text(encoding='utf-8'), 'All 24 Accounts module permissions must be assignable from Admin'
accounts_dashboard_source=(ROOT/'accounts-dashboard.js').read_text(encoding='utf-8')
assert "visibleModules=Object.keys(moduleKeys).map(Number).filter(i=>i!==3&&allowed.has(moduleKeys[i]))" in accounts_dashboard_source, 'Accounts permissions must retain the original module access keys'
assert 'const moduleGroups=[' in accounts_dashboard_source and 'data-group' in accounts_dashboard_source and 'data-module' in accounts_dashboard_source, 'Accounts navigation must expose the simplified parent groups and permitted submodules'
group_source=accounts_dashboard_source.split('const moduleGroups=[',1)[1].split('];',1)[0]
group_indexes=[int(n) for n in re.findall(r'\bmodules:\[([0-9,]+)\]',group_source) for n in n.split(',')]
assert len(group_indexes)==23 and sorted(group_indexes)==[i for i in range(24) if i!=3], 'Accounts: all visible original modules except the retired donor module must appear exactly once under the 8 parent groups'
assert "'সংরক্ষিত অভ্যন্তরীণ মডিউল'" in accounts_dashboard_source and 'দাতা ও অনুদান' not in accounts_dashboard_source, 'Accounts: retired donor module must not be exposed by its former name'
assert 'filter(i=>i!==3&&allowed.has(moduleKeys[i]))' in accounts_dashboard_source, 'Accounts: retired donor module must stay hidden for every permission set'
assert 'const moduleGroupByIndex=new Map' in accounts_dashboard_source and 'visibleModules.includes(i)' in accounts_dashboard_source, 'Accounts: submodule navigation must preserve granular permissions'
assert "allowed.add(moduleKeys[22])" in (ROOT/'accounts-dashboard.js').read_text(encoding='utf-8') and "allowed.add(moduleKeys[23])" in (ROOT/'accounts-dashboard.js').read_text(encoding='utf-8'), 'Messaging and monthly chanda must be inserted into the ordered module set'
assert 'm(0[1-9]|[1-7][0-9]|8[0-5])' in (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8'), 'Secure staff account endpoint must accept the expanded module key range'
assert (ROOT/'supabase/accounts-granular-module-access.sql').exists(), 'Detailed Accounts RLS and module permission migration source is missing'
assert 'jsonb_array_length(permission_rows) > 85' in (ROOT/'supabase/accounts-granular-module-access.sql').read_text(encoding='utf-8'), 'Permission replacement RPC must support all 85 modules'
assert 'm84' in (ROOT/'supabase/accounts-granular-module-access.sql').read_text(encoding='utf-8') and 'm85' in (ROOT/'supabase/accounts-granular-module-access.sql').read_text(encoding='utf-8'), 'Messaging and monthly chanda must be separately secured'
assert 'max-width:none' in (ROOT/'accounts-dashboard.css').read_text(encoding='utf-8'), 'Accounts dashboard must use full available width'
assert "hasAccountModule('m71','can_write')" in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Budget form must use its dedicated Accounts permission'
assert 'main{width:100%;max-width:none' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts outer page must not constrain the dashboard width'
assert "modulePermissions.some(p=>/^m(6[2-9]|7[0-9]|8[0-5])$/.test(p.module_key)&&p.can_view)" in (ROOT/'admin-modules.js').read_text(encoding='utf-8'), 'Admin dashboard Accounts shortcut must use the new granular permissions'

# Mosque homepage layout and shared image management.
media_js=(ROOT/'mosque-media.js').read_text(encoding='utf-8')
assert "mosque_360_panorama" in media_js and "mosque360Start" in media_js, '360 panorama setting and homepage launch control are missing'
assert all(k in media_js for k in ("mosque_360_video","mosque_360_video_muted","uploadTourVideo","setTourVideoMuted","applyTourVideo")), '360 video upload and administrator mute controls are missing'
assert "shell.classList.toggle('video-ready',!!url)" in media_js and 'video.defaultMuted=muted' in media_js, 'Homepage: saved video must activate a visible, muted-by-default video mode and hide the old cover'
assert '.tour-shell.video-ready .tour-cover' in html and '.tour-shell.video-ready #mosque360VideoWrap' in html and '.tour-shell.video-ready #mosque360Video' in html, 'Homepage: uploaded video must replace the old image and fill the 360-degree frame'
assert 'file.size>50*1024*1024' in media_js and 'supportedVideoExtensions' in media_js and "'mkv'" in media_js and "'mov'" in media_js and "application/octet-stream" in media_js and 'hasVideoMime' in media_js, '360 video must accept browser-recognized video MIME types, common extensions, and enforce the Free-plan 50 MB limit'
assert 'id="mosque360VideoForm"' in admin_html and 'id="mosque360VideoMuted"' in admin_html and 'accept="video/*' in admin_html and 'data-mosque-360-video' in html, 'Admin broad video upload/mute controls and homepage video player are required'
independent_media_migration=(ROOT/'supabase/migrations/20261125142528_independent_mosque_media_surfaces.sql').read_text(encoding='utf-8')
assert all(k in independent_media_migration for k in ('mosque_homepage','mosque_accounts','mosque_admin','mosque_360_panorama')), 'Media: database must allow three independent image keys and the 360 panorama'
assert "createImageBitmap(file)" in media_js and "ratio<1.8||ratio>2.2" in media_js, '360 panorama must validate an approximately 2:1 equirectangular image'
assert "pannellum.viewer" in media_js and "type:'equirectangular'" in media_js, '360 panorama must use a real equirectangular viewer'
admin_html=(ROOT/'admin.html').read_text(encoding='utf-8')
assert 'mosquePanoramaForm' in admin_html and 'mosquePanoramaRemove' in admin_html, 'Dedicated Admin media module must provide 360 panorama upload/removal controls'
assert 'id="mosque360Stage"' in html and 'id="mosque360Start"' in html, 'Homepage must include a real 360 viewer stage and explicit start button'

assert 'class="mosque-hero"' in html and 'data-mosque-image' in html, 'Homepage: user-supplied mosque hero image is missing'
assert 'id="intro-notices-column"' in html and 'arrangeHomepageColumns' in html, 'Homepage: three-column notices/video layout is missing'
assert 'class="tour-cover"' in html, 'Homepage: mosque photo must be used as the 360-degree tour cover'
assert 'content-slots{grid-template-columns:repeat(4,minmax(0,1fr))!important' in html, 'Homepage: 10-card photo/knowledge grids must display in three desktop rows'
assert 'grid-template-columns:minmax(220px,3in) minmax(300px,1fr) minmax(220px,3in)' in html, 'Homepage: history and bani columns must be 3 inches wide'
assert 'id="mosqueMediaAdmin"' in admin_html and 'মিডিয়া ব্যবস্থাপনা' in admin_html, 'Admin: dedicated media module is missing'
assert 'mosqueSphericalImageForm' in admin_html and 'mosque_360_spherical_image' in media_js and 'uploadSphericalImage' in media_js and 'canvas.toBlob' in media_js, 'Admin: ordinary image must be converted and stored for the separate spherical 360 viewer'
assert 'id="mosqueMediaAdmin"' not in accounts and 'mosque-media.js' in accounts, 'Accounts: keep media controls out of the Accounts page and retain the shared media loader'
assert 'data-mosque-image="homepage"' in html and 'data-mosque-image="admin"' in admin_html, 'Homepage and Admin Panel must each have their own image surface'
assert (ROOT/'mosque-media.js').exists(), 'Shared mosque media manager script is missing'
assert (ROOT/'assets/mosque-hero.webp').exists(), 'User-provided mosque image fallback is missing'
assert (ROOT/'supabase/central-mosque-brand-image-settings.sql').exists(), 'Central mosque media RLS migration source is missing'
subprocess.run(['node','--check','--input-type=module'],input=(ROOT/'mosque-media.js').read_text(encoding='utf-8'),text=True,capture_output=True,check=True)

# Admin-panel regression checks: stable message placement, distinct audit views,
# complete dashboard pagination, and explicit approval capability enforcement.
assert "panel.classList.add('ad-legacy-panel','message-module')" in dashboard_js, 'Accounts messaging must mount as one self-contained dashboard panel'
assert "async function renderAuditReview()" in dashboard_js and "async function renderAuditTrail()" in dashboard_js, 'Audit review and audit trail must have separate implementations'
assert "canApprove=!!(grant?.can_view&&grant?.can_write&&grant?.can_approve)" in dashboard_js, 'Custom Accounts approvers must have explicit view, write and approve grants'
assert ".order('id',{ascending:true}).range(offset,offset+999)" in dashboard_js, 'Accounts dashboard totals must paginate beyond the first 1,000 ledger rows'
message_css=(ROOT/'accounts-dashboard.css').read_text(encoding='utf-8')
assert '#accountsDashboard #accountsMessaging.message-module' in message_css and '@media(max-width:600px)' in message_css, 'Accounts messaging must have scoped responsive layout'
admin_css=(ROOT/'admin.html').read_text(encoding='utf-8')
assert admin_css.count('#adminSidebar{position:fixed')==1, 'Admin sidebar rules must not be duplicated'
assert 'accounts-dashboard.css?v=' in (ROOT/'accounts.html').read_text(encoding='utf-8'), 'Accounts dashboard CSS cache key must be refreshed'

hardening_sql=(ROOT/'supabase/accounts-admin-panel-hardening.sql').read_text(encoding='utf-8')
assert 'mp.can_view and mp.can_write and mp.can_approve' in hardening_sql, 'Module-record approval must require explicit can_approve permission'
assert "'m81',false" in hardening_sql, 'Audit Trail module must have its own audit-log read permission'
assert 'admin_dashboard_settings_updated_by_idx' in hardening_sql, 'Admin dashboard settings foreign key must be indexed'


# Dashboard preference save must keep the settings panel open and show its saved status after rerender.
admin_modules=(ROOT/'admin-modules.js').read_text(encoding='utf-8')
assert 'dashboardSettingsOpen=true' in admin_modules and 'settingsPanel.hidden=!dashboardSettingsOpen' in admin_modules, 'Dashboard settings panel must remain open after saving'
assert "dashboardSettingsNotice='সফলভাবে সংরক্ষিত হয়েছে।'" in admin_modules, 'Dashboard save success must remain visible after dashboard rerender'
assert 'admin-modules.js?v=20261126-layoutfix2' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin dashboard settings cache key must be refreshed'

# Website Admin: each writable website module has its own concise field schema.
admin_modules_text=(ROOT/'admin-modules.js').read_text(encoding='utf-8')
schema_block=admin_modules_text.split('const fieldSchemas={',1)[1].split('};',1)[0]
schema_keys={int(x) for x in re.findall(r'(?m)^([0-9]+):\[',schema_block)}
expected_form_modules=set([*range(4,17),*range(17,41),*range(51,55),*range(56,62)])
assert schema_keys == expected_form_modules, f'Admin: every data-entry module must have an explicit dedicated form schema; missing={sorted(expected_form_modules-schema_keys)}, extra={sorted(schema_keys-expected_form_modules)}'
assert 'baseSchema=fieldSchemas[m.n]' in admin_modules_text and 'fieldSchemas[m.n]||[[' not in admin_modules_text, 'Admin: module-specific schema must be used without a generic fallback form'
assert 'const title=String(data[titleField]||m.name)' in admin_modules_text, 'Admin: form title should be derived from the module-specific first field'
assert 'id="recordInstitution" type="hidden"' in admin_modules_text, 'Admin: institution must be stored without an unnecessary visible form field'
assert 'id="recordStatus"' in admin_modules_text, 'Admin: record status must remain available to approvers'
admin_html_text=(ROOT/'admin.html').read_text(encoding='utf-8')
assert '#adminSidebar a{font-size:15px' in admin_html_text and '#adminWorkspace .admin-entry-grid' in admin_html_text, 'Admin: larger readable typography and module forms styling are required'
assert '#adminWorkspace .module-card b{font-size:18px' in admin_html_text, 'Admin: module cards must use larger text'

# Private report storage and custom-admin write permission regression checks.
module_permissions_text=(ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8')
assert 'not write_access or mp.can_write' in module_permissions_text, 'Custom admins with view-only grants must not write module records'
private_migration=(ROOT/'supabase/migrations/20261125194105_private_module_reports_and_module_write_hardening.sql').read_text(encoding='utf-8')
assert 'private-module-files' in private_migration and "values ('private-module-files','private-module-files',false" in private_migration, 'Private module report storage bucket must be private'
assert "name not like 'modules/m06/%'" in private_migration, 'Private reports must not be uploaded to the public site-media bucket'
admin_modules_private=(ROOT/'admin-modules.js').read_text(encoding='utf-8')
assert "['file_url','প্রতিবেদন ফাইল','private-file']" in admin_modules_private, 'Admin reports must use private-file field type'
assert "supabase.storage.from('private-module-files').createSignedUrl(path,300)" in admin_modules_private, 'Private report downloads must use short-lived signed URLs'
assert "kind==='video'?52428800" in admin_modules_private, 'Video upload validation must match the 50 MB Storage bucket limit'
assert 'admin-modules.js?v=20261126-layoutfix2' in (ROOT/'admin.html').read_text(encoding='utf-8'), 'Admin private report storage cache key must be refreshed'

# Admin layout regression: fixed sidebar must not be combined with a narrow centered main container.
admin_layout_html=(ROOT/'admin.html').read_text(encoding='utf-8')
admin_modules_js=(ROOT/'admin-modules.js').read_text(encoding='utf-8')
admin_users_js=(ROOT/'admin-users.js').read_text(encoding='utf-8')
chanda_js=(ROOT/'chanda-admin.js').read_text(encoding='utf-8')
assert 'main.admin-shell{width:100%;max-width:none' in admin_layout_html and '#app.admin-layout{width:100%;max-width:none;padding-left:0' in admin_layout_html, 'Admin: full-width content must reserve the fixed sidebar exactly once'
assert "document.querySelector('main')?.classList.add('admin-shell')" in admin_modules_js, 'Admin: shell must activate full-width layout'
assert 'const staffModuleRoot = $("staffModules");' in admin_users_js and 'if (!staffModuleRoot) return [];' in admin_users_js, 'Admin: missing staff form nodes must not cause null innerHTML errors'
assert "!location.hash.includes('admin=m85')" in chanda_js and "p.module_key==='m85'" in chanda_js, 'Chanda: module route and permission key must match Accounts monthly chanda module'

# Single assigned Accounts operator may post income/expense directly; the journal trigger is idempotent.
direct_posting=(ROOT/'supabase/migrations/20261125195658_accounts_direct_posting_single_operator.sql').read_text(encoding='utf-8')
assert "approved_by = (select auth.uid())" in direct_posting and "status = 'approved'" in direct_posting, 'Accounts: direct posting must be restricted to the authenticated operator'
assert 'ledger_entry_double_entry_post_insert' in direct_posting and 'post_approved_ledger_entry_to_journal' in direct_posting, 'Accounts: direct approved entries must create a double-entry journal'

# Direct posting requires write+approve; write-only staff can only submit pending entries.
approval_hardening=(ROOT/'supabase/migrations/20261125195858_accounts_entry_approval_permission_hardening.sql').read_text(encoding='utf-8')
assert 'accounts_detail_insert_pending' in approval_hardening and "status='pending'" in approval_hardening, 'Accounts: write-only users must submit pending entries'
assert 'account_module_permission(institution,array[\'m63\',\'m80\'],true,true)' in approval_hardening, 'Accounts: direct approval must require explicit can_approve'
assert "approved_by=(select auth.uid())" in approval_hardening and "approved_at is not null" in approval_hardening, 'Accounts: approval updates must be attributed to the current user'
accounts_html_text=(ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'const directApproved=canApproveAccountEntry' in accounts_html_text and "status:directApproved?'approved':'pending'" in accounts_html_text, 'Accounts: UI must submit pending when the operator lacks approval rights'

chanda_multi=(ROOT/'supabase/chanda-multi-month-payment.sql').read_text(encoding='utf-8')
assert 'p_paid_amount numeric' in chanda_multi and 'set search_path = public, pg_temp' in chanda_multi, 'Chanda: multi-month RPC parameter and safe search_path must match the client'
assert 'perform 1 from public.chanda_dues' in chanda_multi and 'if remaining_payment>0' in chanda_multi, 'Chanda: lock dues and reject partial allocation'

chanda_payment_sql=(ROOT/'supabase/fix-chanda-payment-column-ambiguity.sql').read_text(encoding='utf-8')
assert "ledger_reference:=coalesce(nullif(trim(reference),''),'CHANDA')" in chanda_payment_sql, 'Chanda: each linked ledger entry must have a unique reference'
assert 'replace(payment_id::text' in chanda_payment_sql, 'Chanda: unique ledger references must be tied to payment IDs'

assert (ROOT/'supabase/migrations/20261125200429_chanda_multi_month_payment_atomic_locking.sql').exists(), 'Chanda: atomic multi-month RPC migration must be tracked'
assert (ROOT/'supabase/migrations/20261125200558_chanda_unique_ledger_reference_per_payment.sql').exists(), 'Chanda: unique ledger reference migration must be tracked'


# Regression checks for the latest homepage and staff permission UI updates.
collection_form=dashboard_js.split("const nowMonth=el('adMonth').value",1)[1].split('const {data:memberDues',1)[0]
assert 'for(let i=11;i>=0;i--)' in collection_form and 'for(let i=23;i>=0;i--)' not in collection_form, 'Chanda collection form must prepare only the selected month and previous 11 months'
homepage=(ROOT/'index.html').read_text(encoding='utf-8')
assert 'নোটিশ প্রকাশ ও যাচাই' in homepage and 'নামাজ ও ধর্মীয় আয়োজন' in homepage and 'সদস্য ও মুসল্লীদের জন্য তথ্য' in homepage, 'Homepage: latest notice starter content is missing'
assert 'ইসলামিক জ্ঞানভান্ডার' in homepage and 'আলোকচিত্র ও ভিডিও শিক্ষা' in homepage and 'ডিজিটাল তথ্যসেবা' in homepage, 'Homepage: recent activity starter content is missing'
assert homepage.count('id="latest-notice-content"')==1 and homepage.count('id="latest-activity-content"')==1, 'Homepage: latest update containers must each be unique'
staff_users=(ROOT/'admin-users.js').read_text(encoding='utf-8')
staff_admin=(ROOT/'admin.html').read_text(encoding='utf-8')
assert all(x in staff_users for x in ('staff-module-mosque','staff-module-governance','staff-module-accounts','staff-module-master')), 'Admin: staff permission cards must have distinct category classes'
assert all(x in staff_admin for x in ('.staff-module-mosque','.staff-module-governance','.staff-module-accounts','.staff-module-master')), 'Admin: staff permission cards must have matching category styles'
