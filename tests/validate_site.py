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

for migration_name in ('schema.sql', 'admin-modules.sql'):
    migration_sql = (ROOT/'supabase'/migration_name).read_text(encoding='utf-8')
    receipt_fn = migration_sql.split('create or replace function public.receipt_is_unlinked', 1)[1].split('$receipt$;', 1)[0]
    assert 'storage.objects' in receipt_fn and 'owner_id=auth.uid()::text' in receipt_fn, f'{migration_name}: receipt lookup must be scoped to the caller-owned private receipt'

print('Phase 1 regression checks passed: institution-aware staff edit, 61-module validation, and caller-scoped receipt lookup.')
