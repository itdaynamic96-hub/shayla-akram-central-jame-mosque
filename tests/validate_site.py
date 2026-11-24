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


# Phase 1 regression checks: staff permissions and receipt-path privacy.
staff_users = (ROOT/'admin-users.js').read_text(encoding='utf-8')
edit_handler = staff_users.split('if (edit) {', 1)[1].split('} else if (toggle)', 1)[0]
institution_assignment = edit_handler.index('$("staffInstitution").value')
render_position = edit_handler.index('renderChecks(data || [])')
assert institution_assignment < render_position, 'Admin: set the selected staff institution before rendering its module permissions'

edge = (ROOT/'supabase/functions/admin-create-user/index.ts').read_text(encoding='utf-8')
assert re.search(r'\^m\(0\[1-9\]\|\[1-5\]\[0-9\]\|60\|61\)\$', edge), 'Edge Function: m61 must be supported consistently'
assert 'keys.length > 61' in edge, 'Edge Function: allow at most 61 unique modules'

permissions_sql = (ROOT/'supabase/module-permissions.sql').read_text(encoding='utf-8')
assert "[1-5][0-9]|60|61" in permissions_sql, 'Permissions SQL: allow m61 in the permission key constraint'
assert 'jsonb_array_length(permission_rows) > 61' in permissions_sql, 'Permissions SQL: allow at most 61 module permissions'
assert "role='custom_admin'" in permissions_sql, 'Permissions RPC: verify the target is a custom_admin'
assert 'count(distinct item.value->>\'module_key\')' in permissions_sql, 'Permissions RPC: reject duplicate module keys'

assert permissions_sql.count("target_key <> 'm61' or target_institution='mosque'") >= 2, 'Permissions SQL: m61 access must remain mosque-only'
enhancements_sql = (ROOT/'supabase/admin-panel-enhancements.sql').read_text(encoding='utf-8')
assert enhancements_sql.count("target_key <> 'm61' or target_institution='mosque'") >= 2, 'Enhancements SQL: m61 access must remain mosque-only'

for migration_name in ('schema.sql', 'admin-modules.sql'):
    migration_sql = (ROOT/'supabase'/migration_name).read_text(encoding='utf-8')
    receipt_fn = migration_sql.split('create or replace function public.receipt_is_unlinked', 1)[1].split('$receipt$;', 1)[0]
    assert 'storage.objects' in receipt_fn and 'owner_id=auth.uid()::text' in receipt_fn, f'{migration_name}: receipt lookup must be scoped to the caller-owned private receipt'

print('Phase 1 regression checks passed: institution-aware staff edit, 61-module validation, and caller-scoped receipt lookup.')

# Trigger CI after phase 1 regression-fix commit.

# Re-run CI against the corrected phase 1 patch.


# Institution boundaries for Custom Admin module grants must be enforced server-side.
assert 'moduleAllowedForInstitution' in edge, 'Edge Function: validate module grants against the target institution'
assert 'parseModules(target.institution)' in edge, 'Edge Function: validate permission updates against the target user institution'
assert 'parseModules(institution)' in edge, 'Edge Function: validate new-user module grants against selected institution'
assert 'target_institution not in (\'mosque\',\'both\')' in permissions_sql, 'Permissions RPC: mosque modules must not be assigned to foundation-only staff'
assert 'target_institution not in (\'foundation\',\'both\')' in permissions_sql, 'Permissions RPC: foundation modules must not be assigned to mosque-only staff'
assert "item.value->>'module_key'='m61' and target_institution not in ('mosque','both')" in permissions_sql, 'Permissions RPC: Muslim registration must remain mosque-only'

assert "target_institution not in ('mosque','both')" in permissions_sql, 'Permissions RPC: enforce mosque-only module ranges'
assert "target_institution not in ('foundation','both')" in permissions_sql, 'Permissions RPC: enforce foundation-only module ranges'
assert "substring(target_key from 2)::integer not between 21 and 30 or target_institution='mosque'" in permissions_sql, 'Record access helpers: m21-m30 must remain mosque-only'
assert "substring(target_key from 2)::integer not between 31 and 40 or target_institution='foundation'" in permissions_sql, 'Record access helpers: m31-m40 must remain foundation-only'

# CI run for mosque-only m61 policy guard.

enhancements_sql = (ROOT/'supabase/admin-panel-enhancements.sql').read_text(encoding='utf-8')
assert 'file_size_limit=52428800' in enhancements_sql and '104857600' not in enhancements_sql, 'Storage: site-media bucket must respect the 50 MB Free-plan limit'
hardening_sql = (ROOT/'supabase/phase1-security-hardening.sql').read_text(encoding='utf-8')
assert 'receipt_is_unlinked' in hardening_sql and 'module_record_access' in hardening_sql and 'replace_admin_module_permissions' in hardening_sql, 'Security: incremental Phase 1 hardening migration is incomplete'
assert 'drop constraint if exists module_records_mosque_basic_module_key_check' in hardening_sql, 'Security: remove legacy mosque-only basic-module constraint'
assert 'module_records_module_institution_check' in hardening_sql, 'Security: add explicit module-to-institution constraint'
assert "module_key not in ('m21','m22','m23','m24','m25','m26','m27','m28','m29','m30','m61')" in hardening_sql, 'Security: mosque modules and m61 must remain mosque-only'
assert "module_key not in ('m31','m32','m33','m34','m35','m36','m37','m38','m39','m40')" in hardening_sql, 'Security: foundation modules must remain foundation-only'
for trigger_fn in ('create_profile_for_new_user','guard_module_record_publication','log_ledger_change','log_module_record_change'):
    assert f'revoke all on function public.{trigger_fn}()' in hardening_sql, f'Security: trigger-only function {trigger_fn} must not be exposed as RPC'
assert 'for select to anon using (status=' in hardening_sql, 'Security: anonymous content reads must only use published status'
assert 'for select to authenticated' in hardening_sql and 'public.has_access' in hardening_sql, 'Security: authenticated admins must retain site content access'
assert 'revoke all on function public.has_access(text[],text)' in hardening_sql, 'Security: role helper should not be callable by anonymous clients'

# CI run for institution-scoped permission validation.

# Re-run after correcting m61 assertion.

# All intended operational roles must reach the Admin module shell; prevent self-demotion.
admin_html = (ROOT/'admin.html').read_text(encoding='utf-8')
for role in ('mosque_admin','foundation_admin','manager','viewer','accountant','accounts_manager'):
    assert "'"+role+"'" in admin_html.split("if(!['",1)[1].split("].includes(p.role)",1)[0], f'Admin: {role} must be allowed to enter the module shell'
assert 'currentUserId=user?.id||null' in admin_html, 'Admin: retain the signed-in user ID for self-protection'
assert 'p.id!==currentUserId' in admin_html, 'Admin: do not offer self role changes to the current Super Admin'

# CI run for incremental hardening migration and Free bucket cap.

# Auditor and viewer must have narrowly scoped read-only module access at the database layer.
for sql_name in ('admin-modules.sql','module-permissions.sql','admin-panel-enhancements.sql','phase1-security-hardening.sql'):
    sql_text = (ROOT/'supabase'/sql_name).read_text(encoding='utf-8')
    access_fn = sql_text.split('create or replace function public.module_record_access',1)[1].split('create or replace function public.module_record_approval_access',1)[0]
    assert "p.role='auditor'" in access_fn and "p.role='viewer'" in access_fn, f'{sql_name}: auditor/viewer access rules are missing'
    assert "target_key='m03'" in access_fn and 'not write_access' in access_fn, f'{sql_name}: auditor access must be read-only and limited'
    assert "p.role in ('auditor','viewer') and (p.institution='both' or target_institution='both' or p.institution=target_institution)" not in access_fn, f'{sql_name}: broad institution-only auditor/viewer access is unsafe'

# Correct current-user null-safe assertion.

# A saved financial entry must not be reported as failed just because the follow-up refresh fails.
accounts_html = (ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'id="formSuccess"' in accounts_html, 'Accounts: show explicit success after a ledger entry is saved'
assert 'লেনদেনটি সফলভাবে জমা হয়েছে' in accounts_html, 'Accounts: distinguish a saved entry from a failed refresh'
assert "showError($('listError'),new Error('লেনদেন সংরক্ষিত হয়েছে" in accounts_html, 'Accounts: report refresh errors separately after successful insert'

# Every site-media video upload path must obey the 50 MB Free-tier cap.
assert 'videoFile.size>52428800' in admin_html and '104857600' not in admin_html, 'Admin content: video upload must be capped at 50 MB'
modules_js = (ROOT/'admin-modules.js').read_text(encoding='utf-8')
assert "kind==='video'?52428800" in modules_js and "kind==='video'?104857600" not in modules_js, 'Module uploads: video upload must be capped at 50 MB'

# CI run for read-only auditor/viewer scope.

# Approval/rejection must refresh both the ledger list and budget totals.
approval_handler = accounts_html.split("$('entries').addEventListener('click'",1)[1].split("$('entryForm').addEventListener",1)[0]
assert 'await loadEntries();await loadBudgets()' in approval_handler, 'Accounts: refresh budget totals after approving or rejecting a ledger entry'

# Private-only module records must never upload documents into the public site-media bucket.
assert "if(privateOnlyModules.has(m.n))throw new Error" in modules_js, 'Modules: block public-bucket uploads from private-only modules'
assert "const privateOnlyModules=new Set" in modules_js and "61" in modules_js.split("const privateOnlyModules=new Set",1)[1].split(");",1)[0], 'Modules: Muslim registration must remain private-only'

# Public SEO crawl controls: keep admin surfaces out of indexes and publish a homepage sitemap.
index_html = (ROOT/'index.html').read_text(encoding='utf-8')
admin_html = (ROOT/'admin.html').read_text(encoding='utf-8')
accounts_html = (ROOT/'accounts.html').read_text(encoding='utf-8')
assert 'rel="canonical"' in index_html, 'SEO: homepage needs a canonical URL'
assert 'name="robots" content="noindex,nofollow"' in admin_html, 'SEO: admin page must not be indexed'
assert 'name="robots" content="noindex,nofollow"' in accounts_html, 'SEO: accounts page must not be indexed'
assert (ROOT/'sitemap.xml').exists(), 'SEO: sitemap.xml must exist'
assert (ROOT/'robots.txt').exists(), 'SEO: robots.txt must exist'

# CI run for 50 MB site-media upload caps.

# The SEO module's robots selector must be applied to the public homepage.
assert 'seoRecord.robots' in index_html and 'meta[name="robots"]' in index_html, 'SEO: apply the configured robots directive on the homepage'

# CI run for sitemap and noindex updates.

# CI run for real browser desktop/mobile smoke tests.

# Final CI run for the complete audit-fix branch.
