import { configured, supabase, currentProfile, escapeHtml, money, showError } from './supabase-client.js';
const $=id=>document.getElementById(id);
let user=null, profile=null, permissions=[], started=false;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const month=()=>today().slice(0,7);
const institution=()=> $('institution').value;
const writeRoles=['super_admin','admin','accounts_manager','accountant','mosque_admin','foundation_admin'];
const readRoles=[...writeRoles,'auditor'];
const has=(key,cap='can_view')=>permissions.some(p=>p.module_key===key&&p[cap]);
const canApprove=key=>profile?.role==='custom_admin'?has(key,'can_approve'):['super_admin','accounts_manager','mosque_admin','foundation_admin'].includes(profile?.role)&&(profile?.institution==='both'||profile?.institution===institution());
const allowed=(key,write=false)=>{
 if(profile?.role==='custom_admin') return has(key,write?'can_write':'can_view');
 if(write) return writeRoles.includes(profile?.role)&&(profile?.institution==='both'||profile?.institution===institution())&&(profile?.role!=='mosque_admin'||institution()==='mosque')&&(profile?.role!=='foundation_admin'||institution()==='foundation');
 return readRoles.includes(profile?.role)&&(profile?.institution==='both'||profile?.institution===institution())&&(profile?.role!=='mosque_admin'||institution()==='mosque')&&(profile?.role!=='foundation_admin'||institution()==='foundation');
};
const fail=e=>showError($('enterpriseError'),e);
const val=id=>$(id).value.trim();
function setPanel(id,show){$(id).hidden=!show}
async function init(){
 if(started||!configured||$('app').hidden)return;
 started=true;
 try{
  const current=await currentProfile();user=current.user;profile=current.profile;
  if(!user||!profile){started=false;return}
  if(profile.role==='custom_admin'){
   const {data,error}=await supabase.from('admin_module_permissions').select('module_key,can_view,can_write,can_approve').eq('user_id',user.id);
   if(error)throw error;permissions=data||[];
  }
  const payroll=allowed('m70'),books=allowed('m68'),obligations=allowed('m69'),assets=allowed('m72'),audit=allowed('m79')||allowed('m81');
  setPanel('payrollPanel',payroll);setPanel('cashBankPanel',books);setPanel('obligationsPanel',obligations);setPanel('assetsPanel',assets);setPanel('accountAuditPanel',audit);
  if(!payroll&&!books&&!extra&&!audit){$('enterpriseAccounts').hidden=true;return}
  $('enterpriseAccounts').hidden=false;
  $('payrollMonth').value=month();
  $('institution').addEventListener('change',()=>loadAll().catch(fail));
  $('bookType').addEventListener('change',()=>loadBooks().catch(fail));
  $('bookPeriod').addEventListener('change',()=>loadBooks().catch(fail));
  $('staffForm').addEventListener('submit',saveStaff);
  $('payrollForm').addEventListener('submit',savePayroll);
  $('obligationForm').addEventListener('submit',saveObligation);
  $('assetForm').addEventListener('submit',saveAsset);
  $('payrollRows').addEventListener('click',payrollAction);
  $('obligationRows').addEventListener('click',settleObligation);
  await loadAll();
 }catch(e){started=false;fail(e)}
}
async function loadAll(){
 const inst=institution();
 if(allowed('m70')){
  const [staffRes,payRes]=await Promise.all([
   supabase.from('account_staff').select('*').eq('institution',inst).order('full_name'),
   supabase.from('payroll_records').select('*').eq('institution',inst).order('payroll_month',{ascending:false}).limit(250)
  ]);
  if(staffRes.error)throw staffRes.error;if(payRes.error)throw payRes.error;
  const staff=staffRes.data||[],payroll=payRes.data||[],byId=new Map(staff.map(s=>[s.id,s]));
  $('staffRows').innerHTML=staff.map(s=>'<tr><td>'+escapeHtml(s.employee_no)+'</td><td>'+escapeHtml(s.full_name)+'</td><td>'+escapeHtml(s.job_title||'—')+'</td><td>'+money(s.monthly_salary)+'</td><td>'+(s.is_active?'সক্রিয়':'নিষ্ক্রিয়')+'</td></tr>').join('')||'<tr><td colspan="5">কোনো কর্মচারী নেই।</td></tr>';
  $('payrollStaff').innerHTML=staff.filter(s=>s.is_active).map(s=>'<option value="'+s.id+'" data-salary="'+s.monthly_salary+'">'+escapeHtml(s.full_name)+' — '+money(s.monthly_salary)+'</option>').join('');
  const syncSalary=()=>{const o=$('payrollStaff').selectedOptions[0];if(o)$('payrollBase').value=o.dataset.salary};
  $('payrollStaff').onchange=syncSalary;if(staff.length)syncSalary();
  $('payrollRows').innerHTML=payroll.map(p=>{const s=byId.get(p.staff_id);let action='—';if(p.status==='pending'&&allowed('m70',true)&&canApprove('m70'))action='<button type="button" data-payroll-approve="'+p.id+'">অনুমোদন</button>';else if(p.status==='pending')action='অনুমোদনের অপেক্ষায়';else if(p.status==='approved'&&allowed('m70',true))action='<button type="button" data-payroll-pay="'+p.id+'">বেতন পরিশোধ</button>';if(p.status==='paid')action+=' <button type="button" data-payroll-slip="'+p.id+'">বেতন স্লিপ</button>';return '<tr><td>'+escapeHtml(p.payroll_month)+'</td><td>'+escapeHtml(s?.full_name||'অজানা')+'</td><td>'+money(p.net_amount)+'</td><td>'+escapeHtml(p.status)+'</td><td>'+action+'</td></tr>'}).join('')||'<tr><td colspan="5">বেতনের রেকর্ড নেই।</td></tr>';
 }
 if(allowed('m68'))await loadBooks();
 if(allowed('m69')||allowed('m72')){
  const [ob,assets]=await Promise.all([
   supabase.from('account_obligations').select('*').eq('institution',inst).order('due_date',{ascending:true}).limit(300),
   supabase.from('account_assets').select('*').eq('institution',inst).order('created_at',{ascending:false}).limit(300)
  ]);
  if(ob.error)throw ob.error;if(assets.error)throw assets.error;
  $('obligationRows').innerHTML=(ob.data||[]).map(x=>'<tr><td>'+(x.obligation_type==='receivable'?'পাওনা':'দেনা')+'</td><td>'+escapeHtml(x.party_name)+'</td><td>'+escapeHtml(x.description||'—')+'</td><td>'+money(x.amount)+'</td><td>'+money(x.settled_amount)+'</td><td>'+money(Number(x.amount)-Number(x.settled_amount))+'</td><td>'+escapeHtml(x.status)+'</td><td>'+(x.status!=='settled'&&x.status!=='cancelled'&&allowed('m69',true)?'<button type="button" data-settle="'+x.id+'" data-amount="'+x.amount+'" data-settled="'+x.settled_amount+'">আপডেট</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="8">পাওনা/দেনার রেকর্ড নেই।</td></tr>';
  $('assetRows').innerHTML=(assets.data||[]).map(x=>'<tr><td>'+escapeHtml(x.asset_name)+'</td><td>'+escapeHtml(x.asset_category)+'</td><td>'+escapeHtml(x.acquisition_date||'—')+'</td><td>'+money(x.acquisition_cost)+'</td><td>'+escapeHtml(x.location||'—')+'</td><td>'+escapeHtml(x.asset_status)+'</td></tr>').join('')||'<tr><td colspan="6">সম্পদের রেকর্ড নেই।</td></tr>';
 }
 if(allowed('m79')||allowed('m81'))await loadAudit();
}
async function loadBooks(){
 let data=[],offset=0;
 while(true){
  const {data:batch,error}=await supabase.from('account_cash_bank_book').select('*').eq('institution',institution()).eq('payment_method',$('bookType').value).order('entry_date',{ascending:false}).range(offset,offset+499);
  if(error)throw error;data=data.concat(batch||[]);if(!batch||batch.length<500)break;offset+=500;
 }
 const todayText=today(),period=$('bookPeriod').value;
 const rows=data.filter(x=>period==='all'||(period==='today'&&x.entry_date===todayText)||(period==='month'&&x.entry_date.slice(0,7)===month())||(period==='year'&&x.entry_date.slice(0,4)===todayText.slice(0,4))),inc=rows.filter(x=>x.entry_type==='income').reduce((n,x)=>n+Number(x.amount),0),exp=rows.filter(x=>x.entry_type==='expense').reduce((n,x)=>n+Number(x.amount),0);
 $('bookIncome').textContent=money(inc);$('bookExpense').textContent=money(exp);$('bookBalance').textContent=money(inc-exp);
 $('bookRows').innerHTML=rows.map(x=>'<tr><td>'+escapeHtml(x.entry_date)+'</td><td>'+escapeHtml(x.category)+'</td><td>'+escapeHtml(x.payer_or_payee||x.note||'—')+'</td><td>'+(x.entry_type==='income'?money(x.amount):'—')+'</td><td>'+(x.entry_type==='expense'?money(x.amount):'—')+'</td><td>'+escapeHtml(x.reference_no||'—')+'</td></tr>').join('')||'<tr><td colspan="6">এই মাধ্যমে অনুমোদিত লেনদেন নেই।</td></tr>';
}
async function loadAudit(){
 const {data,error}=await supabase.from('audit_logs').select('id,table_name,record_id,action,happened_at').in('table_name',['account_staff','payroll_records','account_obligations','account_assets']).order('happened_at',{ascending:false}).limit(100);
 if(error)throw error;
 $('accountAuditRows').innerHTML=(data||[]).map(x=>'<tr><td>'+escapeHtml(new Date(x.happened_at).toLocaleString('bn-BD',{timeZone:'Asia/Dhaka'}))+'</td><td>'+escapeHtml(x.table_name)+'</td><td>'+escapeHtml(x.action)+'</td><td>'+escapeHtml(x.record_id)+'</td></tr>').join('')||'<tr><td colspan="4">অডিট ইতিহাস নেই।</td></tr>';
}
async function saveStaff(e){
 e.preventDefault();if(!allowed('m70',true)){fail(new Error('কর্মচারী যোগ করার অনুমতি নেই।'));return}
 try{const payload={institution:institution(),employee_no:val('staffNo'),full_name:val('staffName'),job_title:val('staffTitle'),phone:val('staffPhone'),monthly_salary:Number(val('staffSalary')),join_date:val('staffJoinDate')||null,created_by:user.id};
 const {error}=await supabase.from('account_staff').insert(payload);if(error)throw error;e.target.reset();await loadAll()}catch(ex){fail(ex)}
}
async function savePayroll(e){
 e.preventDefault();if(!allowed('m69',true)){fail(new Error('বেতন রেকর্ড তৈরির অনুমতি নেই।'));return}
 try{const payload={institution:institution(),staff_id:val('payrollStaff'),payroll_month:val('payrollMonth'),base_salary:Number(val('payrollBase')),bonus:Number(val('payrollBonus')||0),deductions:Number(val('payrollDeduction')||0),created_by:user.id};
 const {error}=await supabase.from('payroll_records').insert(payload);if(error)throw error;e.target.reset();$('payrollMonth').value=month();await loadAll()}catch(ex){fail(ex)}
}
async function payrollAction(e){
 const approve=e.target.dataset.payrollApprove,pay=e.target.dataset.payrollPay,slip=e.target.dataset.payrollSlip;if(!approve&&!pay&&!slip)return;
 if(slip){
  const w=window.open('','_blank');if(!w){fail(new Error('বেতন স্লিপ খুলতে পপ-আপ অনুমতি দিন।'));return}
  try{const {data,error}=await supabase.from('payroll_records').select('*,account_staff(full_name,job_title,employee_no)').eq('id',slip).single();if(error)throw error;const p=data,s=p.account_staff||{};const esc=v=>escapeHtml(v??'—');w.document.write('<!doctype html><html lang="bn"><meta charset="utf-8"><title>বেতন স্লিপ</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#17251e}h2{text-align:center}table{width:100%;border-collapse:collapse;margin-top:24px}td{padding:10px;border:1px solid #bbb}.muted{color:#666}@media print{button{display:none}}</style><h2>শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ / ফাউন্ডেশন</h2><h3 style="text-align:center">বেতন স্লিপ</h3><p>কর্মচারী: '+esc(s.full_name)+' ('+esc(s.employee_no)+')</p><p>পদবি: '+esc(s.job_title)+' · মাস: '+esc(p.payroll_month)+'</p><table><tr><td>মূল বেতন</td><td>'+money(p.base_salary)+'</td></tr><tr><td>বোনাস</td><td>'+money(p.bonus)+'</td></tr><tr><td>কর্তন</td><td>'+money(p.deductions)+'</td></tr><tr><td><b>নিট বেতন</b></td><td><b>'+money(p.net_amount)+'</b></td></tr><tr><td>পরিশোধের তারিখ</td><td>'+esc(p.payment_date)+'</td></tr><tr><td>মাধ্যম</td><td>'+esc(p.payment_method)+'</td></tr><tr><td>রেফারেন্স</td><td>'+esc(p.reference_no)+'</td></tr></table><p class="muted">এটি সিস্টেম-উৎপাদিত বেতন স্লিপ।</p><p>প্রস্তুতকারীর স্বাক্ষর: ____________________</p><p>গ্রহণকারীর স্বাক্ষর: ____________________</p></html>');w.document.close();w.focus();setTimeout(()=>w.print(),300)}catch(ex){w.close();fail(ex)}return;
 }
 try{
  if(approve){const {error}=await supabase.from('payroll_records').update({status:'approved',approved_by:user.id,approved_at:new Date().toISOString()}).eq('id',approve).eq('status','pending');if(error)throw error}
  else{const method=prompt('পেমেন্ট মাধ্যম: cash / bank / mobile_banking / other','cash');if(method===null)return;const ref=prompt('ট্রানজেকশন/রেফারেন্স নম্বর (না থাকলে ফাঁকা রাখুন)','')||'';const {error}=await supabase.rpc('mark_payroll_paid',{target_payroll:pay,paid_on:today(),paid_via:method,payment_reference:ref});if(error)throw error}
  await loadAll()
 }catch(ex){fail(ex)}
}
async function saveObligation(e){
 e.preventDefault();if(!allowed('m72',true)){fail(new Error('পাওনা/দেনা যোগ করার অনুমতি নেই।'));return}
 try{const payload={institution:institution(),obligation_type:val('obType'),party_name:val('obParty'),description:val('obDescription'),amount:Number(val('obAmount')),due_date:val('obDue')||null,reference_no:val('obReference'),created_by:user.id};
 const {error}=await supabase.from('account_obligations').insert(payload);if(error)throw error;e.target.reset();await loadAll()}catch(ex){fail(ex)}
}
async function settleObligation(e){
 const id=e.target.dataset.settle;if(!id)return;
 try{const total=Number(e.target.dataset.amount),old=Number(e.target.dataset.settled),left=total-old;const answer=prompt('এ পর্যন্ত মোট কত টাকা আদায়/পরিশোধ হয়েছে? বাকি '+money(left),String(old));if(answer===null)return;const settled=Number(answer);if(!Number.isFinite(settled)||settled<0||settled>total)throw new Error('সঠিক পরিমাণ দিন।');const status=settled===total?'settled':settled>0?'partial':'open';const {error}=await supabase.from('account_obligations').update({settled_amount:settled,status,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;await loadAll()}catch(ex){fail(ex)}
}
async function saveAsset(e){
 e.preventDefault();if(!allowed('m72',true)){fail(new Error('সম্পদ যোগ করার অনুমতি নেই।'));return}
 try{const payload={institution:institution(),asset_name:val('assetName'),asset_category:val('assetCategory')||'অন্যান্য',acquisition_date:val('assetDate')||null,acquisition_cost:Number(val('assetCost')),location:val('assetLocation'),condition_note:val('assetCondition'),asset_status:val('assetStatus'),reference_no:val('assetReference'),created_by:user.id};
 const {error}=await supabase.from('account_assets').insert(payload);if(error)throw error;e.target.reset();await loadAll()}catch(ex){fail(ex)}
}
const observer=new MutationObserver(()=>{if(!$('app').hidden)init()});
observer.observe($('app'),{attributes:true,attributeFilter:['hidden']});
if(!$('app').hidden)init();
