import {supabase,escapeHtml,money,showError} from './supabase-client.js';

const $ = id => document.getElementById(id);
const monthNow = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit'}).format(new Date())+'-01';
const dateNow = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asMonth = value => String(value||'').slice(0,7)+'-01';
const plusMonth = value => { const d=new Date(value+'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth()+1); return d.toISOString().slice(0,10); };
const monthLabel = value => { const [y,m]=String(value).slice(0,7).split('-'); return m+'/'+y; };
const moneyNumber = n => '৳'+Number(n||0).toLocaleString('bn-BD',{maximumFractionDigits:2});
let ctx=null, members=[], rates=[], payments=[], allocations=[], selectedMember=null;
let approvedAllocations={}, pendingAllocations={}, paymentById=new Map();
let canWrite=false;

function showErrorText(id,error){const el=$(id);if(!el)return;el.textContent=error?.message||String(error);el.hidden=false}
function setSuccess(id,message){const el=$(id);el.textContent=message;el.hidden=false}
function currentRate(memberId,month){return rates.filter(r=>r.member_id===memberId&&r.effective_month<=month).sort((a,b)=>b.effective_month.localeCompare(a.effective_month))[0]?.monthly_amount||0}
function calcStatus(member){
 const now=monthNow();
 let cursor=member.start_month, previousDue=0,currentDue=0,totalDue=0,hasPending=false,steps=0;
 while(cursor<=now&&steps<360){
  const key=member.id+'|'+cursor;
  const due=Math.max(Number(currentRate(member.id,cursor))-Number(approvedAllocations[key]||0),0);
  totalDue+=due;
  if(cursor<now)previousDue+=due;else currentDue=due;
  if(Number(pendingAllocations[key]||0)>0)hasPending=true;
  cursor=plusMonth(cursor);steps++;
 }
 let status='green',label='পরিশোধ সম্পন্ন';
 if(previousDue>0.009){status='red';label='আগের মাসের বকেয়া'}
 else if(currentDue>0.009){status='yellow';label='চলতি মাস বাকি'}
 else if(hasPending){status='pending';label='অনুমোদনের অপেক্ষায়'}
 return {status,label,totalDue,previousDue,currentDue};
}
function renderMembers(){
 const list=$('contributionMemberRows');
 if(!list)return;
 const active=members.filter(m=>m.active);
 const stats=active.map(calcStatus);
 $('contributorCount').textContent=active.length.toLocaleString('bn-BD');
 $('contributorDue').textContent=moneyNumber(stats.reduce((n,s)=>n+s.totalDue,0));
 $('contributorArrears').textContent=moneyNumber(stats.reduce((n,s)=>n+s.previousDue,0));
 list.innerHTML=members.map(m=>{
  const s=calcStatus(m);
  const statusClass=s.status==='red'?'status-red':s.status==='yellow'?'status-yellow':s.status==='pending'?'status-pending':'status-green';
  return '<tr><td>'+escapeHtml(m.name)+'</td><td>'+escapeHtml(m.father_name||'—')+'</td><td>'+escapeHtml(m.house_name||'—')+'</td><td>'+escapeHtml(m.mobile||'—')+'</td><td>'+moneyNumber(currentRate(m.id,monthNow()))+'</td><td>'+moneyNumber(s.totalDue)+'</td><td><span class="contribution-status '+statusClass+'">'+s.label+'</span></td><td>'+(canWrite?'<button type="button" data-member-edit="'+m.id+'">সম্পাদনা</button> <button type="button" data-member-pay="'+m.id+'">চাঁদা জমা</button> ':'')+'<button type="button" data-member-history="'+m.id+'">ইতিহাস</button></td></tr>';
 }).join('');
}
async function fetchAll(table,configure){
 let rows=[],offset=0;
 while(true){
  let query=supabase.from(table).select('*');
  if(configure)query=configure(query);
  const{data,error}=await query.range(offset,offset+499);
  if(error)throw error;
  rows=rows.concat(data||[]);
  if(!data||data.length<500)break;
  offset+=500;
 }
 return rows;
}
async function loadData(){
 const [m,r,p,a]=await Promise.all([
  fetchAll('contribution_members',q=>q.eq('institution','mosque').order('name')),
  fetchAll('contribution_rates',q=>q.order('effective_month')),
  fetchAll('contribution_payments',q=>q.eq('institution','mosque').order('payment_date',{ascending:false})),
  fetchAll('contribution_payment_allocations')
 ]);
 members=m;rates=r;payments=p;allocations=a;
 paymentById=new Map(payments.map(p=>[p.id,p]));
 approvedAllocations={};pendingAllocations={};
 allocations.forEach(a=>{
  const p=paymentById.get(a.payment_id);
  if(!p)return;
  const key=a.member_id+'|'+a.covered_month;
  if(p.status==='approved')approvedAllocations[key]=(approvedAllocations[key]||0)+Number(a.amount);
  else if(p.status==='pending')pendingAllocations[key]=(pendingAllocations[key]||0)+Number(a.amount);
 });
 renderMembers();
}
function resetMemberForm(){
 $('contributionMemberForm').reset();$('contributionMemberId').value='';
 $('memberStartMonth').value=monthNow();$('memberRateMonth').value=monthNow();
 $('memberSmsConsent').checked=false;
 $('memberFormTitle').textContent='নতুন চাঁদা প্রদানকারী';
 $('memberSave').textContent='প্রোফাইল সংরক্ষণ';
 $('memberFormError').hidden=true;$('memberFormSuccess').hidden=true;
}
function editMember(member){
 selectedMember=member;
 $('contributionMemberId').value=member?.id||'';
 $('memberName').value=member?.name||'';
 $('memberFather').value=member?.father_name||'';
 $('memberHouse').value=member?.house_name||'';
 $('memberAddress').value=member?.address||'';
 $('memberMobile').value=member?.mobile||'';
 $('memberStartMonth').value=member?.start_month||monthNow();
 $('memberRateMonth').value=monthNow();
 $('memberMonthlyAmount').value=member?currentRate(member.id,monthNow()):'';
 $('memberSmsConsent').checked=Boolean(member?.sms_consent);
 $('memberFormTitle').textContent=member?'প্রদানকারীর তথ্য সম্পাদনা':'নতুন চাঁদা প্রদানকারী';
 $('memberSave').textContent=member?'পরিবর্তন সংরক্ষণ':'প্রোফাইল সংরক্ষণ';
 $('memberFormError').hidden=true;$('memberFormSuccess').hidden=true;
 $('contributionMemberForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function openPayment(member){
 selectedMember=member;
 $('paymentMemberId').value=member.id;
 $('paymentMemberName').textContent=member.name;
 $('paymentDate').value=dateNow();
 $('paymentTargetMonth').value=monthNow();
 $('paymentAmount').value='';
 $('paymentMethod').value='cash';
 $('paymentReceipt').value='';
 $('paymentNote').value='';
 $('paymentError').hidden=true;$('paymentSuccess').hidden=true;
 $('paymentPanel').hidden=false;
 $('paymentPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function showHistory(member){
 const memberRates=rates.filter(r=>r.member_id===member.id).sort((a,b)=>a.effective_month.localeCompare(b.effective_month));
 const memberPayments=payments.filter(p=>p.member_id===member.id);
 const rows=memberPayments.map(p=>{
  const months=allocations.filter(a=>a.payment_id===p.id).sort((a,b)=>a.covered_month.localeCompare(b.covered_month));
  const covered=months.map(a=>monthLabel(a.covered_month)+' ('+moneyNumber(a.amount)+')').join(', ')||'—';
  const status=p.status==='approved'?'অনুমোদিত':p.status==='rejected'?'বাতিল':'অপেক্ষমাণ';
  return '<tr><td>'+escapeHtml(p.payment_date)+'</td><td>'+moneyNumber(p.amount)+'</td><td>'+escapeHtml(covered)+'</td><td>'+escapeHtml(p.receipt_no||'—')+'</td><td>'+escapeHtml(p.payment_method)+'</td><td>'+status+'</td></tr>';
 }).join('');
 $('historyTitle').textContent=member.name+' — চাঁদার ইতিহাস';
 $('historyRates').innerHTML=memberRates.map(r=>'<tr><td>'+escapeHtml(monthLabel(r.effective_month))+'</td><td>'+moneyNumber(r.monthly_amount)+'</td></tr>').join('')||'<tr><td colspan="2">কোনো হার সংরক্ষিত নেই</td></tr>';
 $('historyPayments').innerHTML=rows||'<tr><td colspan="6">এখনও কোনো জমা নেই</td></tr>';
 $('historyPanel').hidden=false;$('historyPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function init(context){
 ctx=context;
 const role=ctx.profile?.role;
 const perms=ctx.modulePermissions||[];
 const read=role==='super_admin'||role==='accounts_manager'||role==='accountant'||role==='auditor'||role==='mosque_admin'||(role==='custom_admin'&&['m44','m47'].every(k=>perms.some(p=>p.module_key===k&&p.can_view)));
 canWrite=role==='super_admin'||role==='accounts_manager'||role==='accountant'||(role==='custom_admin'&&['m44','m47'].every(k=>perms.some(p=>p.module_key===k&&p.can_write)));
 if(ctx.profile?.institution==='foundation'){ $('contributionPanel').hidden=true;return; }
 if(!read){$('contributionPanel').hidden=true;return;}
 $('contributionPanel').hidden=false;
 $('contributionWriteArea').hidden=!canWrite;
 $('memberNew').hidden=!canWrite;
 $('contributionReadOnlyNote').hidden=canWrite;
 $('memberStartMonth').value=monthNow();$('memberRateMonth').value=monthNow();
 $('paymentDate').value=dateNow();$('paymentTargetMonth').value=monthNow();
 loadData().catch(e=>showErrorText('contributionLoadError',e));
}
document.addEventListener('DOMContentLoaded',()=>{
 const context=window.SAKM_ACCOUNT_CONTEXT;
 if(context)init(context);
});
window.addEventListener('sakm:accounts-ready',e=>init(e.detail));

$('memberNew')?.addEventListener('click',()=>editMember(null));
$('memberCancel')?.addEventListener('click',resetMemberForm);
$('contributionMemberRows')?.addEventListener('click',async e=>{
 const edit=e.target.closest('[data-member-edit]')?.dataset.memberEdit;
 const pay=e.target.closest('[data-member-pay]')?.dataset.memberPay;
 const history=e.target.closest('[data-member-history]')?.dataset.memberHistory;
 if(edit){const m=members.find(x=>x.id===edit);if(m)editMember(m);}
 if(pay){const m=members.find(x=>x.id===pay);if(m)openPayment(m);}
 if(history){const m=members.find(x=>x.id===history);if(m)showHistory(m);}
});
$('contributionMemberForm')?.addEventListener('submit',async e=>{
 e.preventDefault();$('memberFormError').hidden=true;$('memberFormSuccess').hidden=true;
 if(!canWrite){showErrorText('memberFormError',new Error('প্রোফাইল সম্পাদনার অনুমতি নেই।'));return;}
 try{
  const payload={
   target_member:$('contributionMemberId').value||null,
   member_name:$('memberName').value.trim(),
   member_father_name:$('memberFather').value.trim(),
   member_house_name:$('memberHouse').value.trim(),
   member_address:$('memberAddress').value.trim(),
   member_mobile:$('memberMobile').value.trim(),
   member_start_month:asMonth($('memberStartMonth').value),
   member_monthly_amount:Number($('memberMonthlyAmount').value),
   member_rate_effective_month:asMonth($('memberRateMonth').value),
   member_sms_consent:$('memberSmsConsent').checked
  };
  const{error}=await supabase.rpc('save_contribution_member',payload);if(error)throw error;
  await loadData();resetMemberForm();setSuccess('memberFormSuccess','প্রদানকারীর প্রোফাইল সংরক্ষিত হয়েছে।');
 }catch(err){showErrorText('memberFormError',err);}
});
$('paymentCancel')?.addEventListener('click',()=>{$('paymentPanel').hidden=true;});
$('paymentForm')?.addEventListener('submit',async e=>{
 e.preventDefault();$('paymentError').hidden=true;$('paymentSuccess').hidden=true;
 if(!canWrite){showErrorText('paymentError',new Error('চাঁদা জমা নেওয়ার অনুমতি নেই।'));return;}
 try{
  const payload={
   target_member:$('paymentMemberId').value,
   paid_on:$('paymentDate').value,
   paid_amount:Number($('paymentAmount').value),
   paid_method:$('paymentMethod').value,
   paid_receipt_no:$('paymentReceipt').value.trim(),
   paid_note:$('paymentNote').value.trim(),
   covered_through:asMonth($('paymentTargetMonth').value)
  };
  const{error}=await supabase.rpc('record_contribution_payment',payload);if(error)throw error;
  setSuccess('paymentSuccess','জমার তথ্য সংরক্ষিত হয়েছে। এটি Accounts অনুমোদনের অপেক্ষায় আছে; অনুমোদনের পর বকেয়া হিসাব থেকে সমন্বয় হবে।');
  await loadData();$('paymentForm').reset();$('paymentDate').value=dateNow();$('paymentTargetMonth').value=monthNow();
 }catch(err){showErrorText('paymentError',err);}
});
$('contributionRefresh')?.addEventListener('click',()=>loadData().catch(e=>showErrorText('contributionLoadError',e)));
$('historyClose')?.addEventListener('click',()=>{$('historyPanel').hidden=true;});
