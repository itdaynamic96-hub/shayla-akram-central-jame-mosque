import { configured, supabase, currentProfile, escapeHtml, showError } from './supabase-client.js';

const $ = id => document.getElementById(id);
let signedInUser = null, signedInProfile = null, permissions = [];
let lastViewKey = '';
const todayDhaka = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money = n => '৳ '+Number(n||0).toLocaleString('bn-BD',{maximumFractionDigits:2});
const canUse = () => {
 if (!signedInProfile) return false;
 if (['super_admin','admin','mosque_admin','accounts_manager','accountant'].includes(signedInProfile.role)) return signedInProfile.institution==='both'||signedInProfile.institution==='mosque';
 return signedInProfile.role==='custom_admin' && permissions.some(p=>p.module_key==='m85'&&p.can_view);
};
const canWrite = () => ['super_admin','admin','mosque_admin','accounts_manager','accountant'].includes(signedInProfile?.role)
 ? (signedInProfile.institution==='both'||signedInProfile.institution==='mosque')
 : signedInProfile?.role==='custom_admin' && permissions.some(p=>p.module_key==='m51'&&p.can_write);

function mount() {
 const workspace=$('adminWorkspace');
 if (!workspace || !location.hash.includes('admin=m85')) { lastViewKey=''; return; }
 if (!canUse()) return;
 if (lastViewKey==='m51') return;
 lastViewKey='m85';
 render(workspace);
}
async function render(workspace) {
 workspace.innerHTML = `
 <div class="dash-head"><div><p class="dash-eyebrow">MONTHLY CHANDA MANAGEMENT</p><h2>মাসিক চাঁদা ও বকেয়া ব্যবস্থাপনা</h2><p class="muted">সদস্য, মাসভিত্তিক পাওনা, পেমেন্ট ও অনুস্মারক ইতিহাস</p></div><div class="dash-head-actions"><button id="chandaRefresh" type="button">↻ রিফ্রেশ</button></div></div>
 <div class="dash-metrics">
  <article class="dash-metric"><span class="dash-label">সক্রিয় সদস্য</span><strong id="chandaMemberCount">—</strong></article>
  <article class="dash-metric"><span class="dash-label">মোট বকেয়া</span><strong id="chandaOutstanding">—</strong></article>
  <article class="dash-metric"><span class="dash-label">বকেয়া মাস</span><strong id="chandaOverdueCount">—</strong></article>
  <article class="dash-metric"><span class="dash-label">এই মাসে আদায়</span><strong id="chandaMonthPaid">—</strong></article>
 </div>
 <section class="dash-panel" style="margin:14px 0">
  <div class="dash-section-head"><div><h3>নতুন সদস্য নিবন্ধন</h3><p>মাসিক নির্ধারিত চাঁদা ও যোগাযোগের তথ্য</p></div></div>
  <form id="chandaMemberForm" class="formgrid">
   <div><label>সদস্যের নাম</label><input id="cmName" required maxlength="140"></div>
   <div><label>পিতার নাম</label><input id="cmFather" maxlength="140"></div>
   <div><label>মোবাইল নম্বর</label><input id="cmPhone" inputmode="tel" maxlength="30"></div>
   <div><label>মাসিক চাঁদা (টাকা)</label><input id="cmAmount" type="number" min="1" step="0.01" required></div>
   <div><label>প্রতি মাসে নির্ধারিত তারিখ</label><input id="cmDay" type="number" min="1" max="28" value="1" required></div>
   <div><label>ঠিকানা</label><input id="cmAddress" maxlength="500"></div>
   <div><label>অনুস্মারক পদ্ধতি</label><select id="cmChannel"><option value="in_app">অ্যাডমিন প্যানেলের নোটিফিকেশন</option><option value="sms">SMS (সার্ভিস সংযোগ প্রয়োজন)</option><option value="whatsapp">WhatsApp (API সংযোগ প্রয়োজন)</option><option value="email">ইমেইল (ঠিকানা ও সার্ভিস প্রয়োজন)</option></select></div>
   <div><label>যোগাযোগে সম্মতি</label><select id="cmConsent"><option value="false">এখনো সম্মতি নেওয়া হয়নি</option><option value="true">সম্মতি নেওয়া হয়েছে</option></select></div>
   <div style="grid-column:1/-1"><label>বিশেষ নোট</label><input id="cmNotes" maxlength="500"></div>
   <div style="grid-column:1/-1"><button type="submit" id="cmSubmit" ${canWrite()?'':'disabled'}>সদস্য সংরক্ষণ করুন</button></div>
  </form>
  <p id="chandaError" class="error" hidden></p>
 </section>
 <section class="dash-panel" style="margin:14px 0">
  <div class="dash-section-head"><div><h3>নতুন চাঁদা আদায়</h3><p>চাঁদাদাতা নির্বাচন করে এক বা একাধিক মাসের জমা রেকর্ড করুন</p></div></div>
  <form id="chandaCollectionForm" class="formgrid">
   <div><label>চাঁদাদাতা</label><select id="cpMember" required><option value="">চাঁদাদাতা নির্বাচন করুন</option></select></div>
   <div><label>জমার তারিখ</label><input id="cpDate" type="date" required></div>
   <div style="grid-column:1/-1"><label>কোন কোন মাসের চাঁদা জমা দিয়েছেন?</label><div id="cpMonthOptions" class="formgrid"><p class="muted">প্রথমে চাঁদাদাতা নির্বাচন করুন।</p></div><small id="cpMonthTotal" class="muted">নির্বাচিত মাসের মোট বকেয়া: ৳ ০</small></div>
   <div><label>জমার পরিমাণ (টাকা)</label><input id="cpAmount" type="number" min="0.01" step="0.01" required placeholder="যেমন: ৫০০০"></div>
   <div><label>পেমেন্ট পদ্ধতি</label><select id="cpMethod"><option value="cash">নগদ</option><option value="bank">ব্যাংক</option><option value="bkash">বিকাশ</option><option value="nagad">নগদ (Nagad)</option><option value="other">অন্যান্য</option></select></div>
   <div><label>রেফারেন্স/ট্রানজেকশন নম্বর</label><input id="cpReference" maxlength="120" placeholder="ঐচ্ছিক"></div>
   <div><label>জমার বিবরণ</label><input id="cpMemo" maxlength="300" placeholder="ঐচ্ছিক"></div>
   <div style="grid-column:1/-1"><button type="submit" id="cpSubmit">চাঁদা জমা সংরক্ষণ করুন</button></div>
  </form>
 </section>
 <section class="dash-panel" style="margin:14px 0">
  <div class="dash-section-head"><div><h3>মাসিক পাওনা ও বকেয়া তালিকা</h3><p>২০–২৪ তারিখে পরবর্তী মাস হলুদ, ২৫ তারিখ থেকে লাল; ১ তারিখে অপরিশোধিত চাঁদা বকেয়া হবে</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>সদস্য</th><th>মাস</th><th>নির্ধারিত</th><th>পরিশোধ</th><th>বকেয়া</th><th>অবস্থা</th><th>পেমেন্ট</th></tr></thead><tbody id="chandaDueRows"><tr><td colspan="7">লোড হচ্ছে…</td></tr></tbody></table></div>
 </section>
 <section class="dash-panel" style="margin:14px 0">
  <div class="dash-section-head"><div><h3>সদস্য তালিকা</h3><p>মাসিক চাঁদার পরিমাণ ও যোগাযোগের তথ্য</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>নাম</th><th>পিতার নাম</th><th>মোবাইল</th><th>মাসিক চাঁদা</th><th>অবস্থা</th></tr></thead><tbody id="chandaMembersRows"><tr><td colspan="5">লোড হচ্ছে…</td></tr></tbody></table></div>
 </section>
 <section class="dash-panel" style="margin:14px 0">
  <div class="dash-section-head"><div><h3>পেমেন্ট ও অনুস্মারক ইতিহাস</h3><p>কে, কখন, কোন মাসের জন্য কত টাকা দিয়েছেন এবং অনুস্মারকের অবস্থা</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>তারিখ</th><th>সদস্য</th><th>ধরন</th><th>বিবরণ</th><th>অবস্থা</th></tr></thead><tbody id="chandaLogsRows"><tr><td colspan="5">লোড হচ্ছে…</td></tr></tbody></table></div>
 </section>
 <p class="notice">স্বয়ংক্রিয় দৈনিক কাজ ঢাকা সময় অনুযায়ী মাসিক পাওনা তৈরি করে এবং ইন-অ্যাপ অনুস্মারক কিউতে রাখে। SMS/WhatsApp/ইমেইল পাঠাতে সংশ্লিষ্ট প্রদানকারীর API ও অনুমোদিত ক্রেডেনশিয়াল সংযুক্ত করতে হবে।</p>`;
 $('chandaRefresh').onclick=()=>loadAll();
 $('chandaMemberForm').onsubmit=async e=>{
  e.preventDefault();const err=$('chandaError');err.hidden=true;
  if(!canWrite()){showError(err,new Error('আপনার সদস্য ব্যবস্থাপনায় সম্পাদনার অনুমতি নেই।'));return}
  const payload={member_name:$('cmName').value.trim(),father_name:$('cmFather').value.trim(),phone:$('cmPhone').value.trim(),monthly_amount:Number($('cmAmount').value),due_day:Number($('cmDay').value),address:$('cmAddress').value.trim(),reminder_channel:$('cmChannel').value,contact_consent:$('cmConsent').value==='true',notes:$('cmNotes').value.trim(),created_by:signedInUser.id};
  if(!payload.member_name||!Number.isFinite(payload.monthly_amount)||payload.monthly_amount<=0||payload.due_day<1||payload.due_day>28){showError(err,new Error('নাম, সঠিক মাসিক চাঁদা এবং ১–২৮ দিনের মধ্যে নির্ধারিত তারিখ দিন।'));return}
  const btn=$('cmSubmit');btn.disabled=true;
  try{const{error}=await supabase.from('chanda_members').insert(payload);if(error)throw error;e.target.reset();$('cmDay').value='10';await loadAll()}
  catch(ex){showError(err,ex)}finally{btn.disabled=!canWrite()}
 };
 await loadAll();
}
async function loadAll(){
 const err=$('chandaError');if(err)err.hidden=true;
 const [membersRes,duesRes,logsRes,paymentsRes]=await Promise.all([
  supabase.from('chanda_members').select('*').order('member_name'),
  supabase.from('chanda_dues').select('*').order('due_date',{ascending:false}).limit(500),
  supabase.from('chanda_message_logs').select('*').order('created_at',{ascending:false}).limit(100),
  supabase.from('chanda_payments').select('*').order('created_at',{ascending:false}).limit(100)
 ]);
 const failure=[membersRes,duesRes,logsRes,paymentsRes].find(x=>x.error);
 if(failure){if(err)showError(err,failure.error);return}
 const members=membersRes.data||[], dues=duesRes.data||[], logs=logsRes.data||[], payments=paymentsRes.data||[];
 const byId=new Map(members.map(m=>[m.id,m]));
 const today=todayDhaka(), month=today.slice(0,7);
 const active=members.filter(m=>m.status==='active');
 const outstanding=dues.reduce((n,d)=>n+Math.max(0,Number(d.amount)-Number(d.paid_amount)),0);
 const overdue=dues.filter(d=>d.status!=='paid'&&d.due_date<today);
 const monthPaid=payments.filter(p=>p.payment_date?.slice(0,7)===month).reduce((n,p)=>n+Number(p.amount),0);
 $('chandaMemberCount').textContent=active.length.toLocaleString('bn-BD');
 $('chandaOutstanding').textContent=money(outstanding);
 $('chandaOverdueCount').textContent=overdue.length.toLocaleString('bn-BD');
 $('chandaMonthPaid').textContent=money(monthPaid);
 $('chandaMembersRows').innerHTML=members.map(m=>'<tr><td>'+escapeHtml(m.member_name)+'</td><td>'+escapeHtml(m.father_name||'—')+'</td><td>'+escapeHtml(m.phone||'—')+'</td><td>'+money(m.monthly_amount)+'</td><td>'+ (m.status==='active'?'সক্রিয়':'নিষ্ক্রিয়')+'</td></tr>').join('')||'<tr><td colspan="5">কোনো সদস্য যোগ করা হয়নি।</td></tr>';
 const sorted=[...dues].sort((a,b)=>a.due_date.localeCompare(b.due_date));
 $('chandaDueRows').innerHTML=sorted.map(d=>{
  const m=byId.get(d.member_id),remaining=Math.max(0,Number(d.amount)-Number(d.paid_amount)),days=Math.max(0,Math.floor((new Date(today+'T00:00:00')-new Date(d.due_date+'T00:00:00'))/86400000));
  const dueMonth=d.due_month.slice(0,7), currentMonth=today.slice(0,7), day=Number(today.slice(8,10));
  const overdue=remaining>0&&d.due_date<=today;
  const nextMonth=dueMonth>currentMonth;
  let statusClass='upcoming',status='আসন্ন';
  if(remaining===0){statusClass='paid';status='সম্পূর্ণ পরিশোধিত'}
  else if(overdue){statusClass='overdue';status=days>=60?'দীর্ঘমেয়াদি বকেয়া ('+days+' দিন)':days>0?'বকেয়া ('+days+' দিন)':'বকেয়া · ১ তারিখ থেকে'}
  else if(Number(d.paid_amount)>0){statusClass='partial';status='আংশিক পরিশোধ · '+money(remaining)+' বাকি'}
  else if(nextMonth&&day>=25){statusClass='collection';status='আদায়ের সময় · ২৫ তারিখ থেকে'}
  else if(nextMonth&&day>=20){statusClass='upcoming';status='পরবর্তী মাসের চাঁদা'}
  else if(!nextMonth){statusClass='upcoming';status='পরিশোধের অপেক্ষায়'}
  return '<tr><td>'+escapeHtml(m?.member_name||'অজানা')+'</td><td>'+escapeHtml(d.due_month.slice(0,7))+'</td><td>'+money(d.amount)+'</td><td>'+money(d.paid_amount)+'</td><td>'+money(remaining)+'</td><td><span class="chanda-status '+statusClass+'">'+status+'</span></td><td>'+(remaining>0&&canWrite()?'<button type="button" data-pay="'+d.id+'" data-member="'+d.member_id+'" data-month="'+dueMonth+'" data-remain="'+remaining+'">পেমেন্ট নিন</button>':'—')+'</td></tr>';
 }).join('')||'<tr><td colspan="7">এখনো মাসিক পাওনা তৈরি হয়নি। দৈনিক শিডিউল চললে তৈরি হবে।</td></tr>';
 const renderMonthOptions=(memberId,preselect='')=>{
  const available=dues.filter(d=>d.member_id===memberId&&Number(d.amount)>Number(d.paid_amount)).sort((a,b)=>a.due_month.localeCompare(b.due_month));
  $('cpMonthOptions').innerHTML=available.map(d=>'<label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--line,#ddd);border-radius:8px"><input type="checkbox" name="cpMonth" value="'+d.id+'" data-remaining="'+(Number(d.amount)-Number(d.paid_amount))+'" '+(d.due_month.slice(0,7)===preselect?'checked':'')+'><span>'+escapeHtml(d.due_month.slice(0,7))+' · বাকি '+money(Number(d.amount)-Number(d.paid_amount))+'</span></label>').join('')||'<p class="muted">এই সদস্যের কোনো বকেয়া মাস নেই।</p>';
  const updateTotal=()=>{const total=[...$('cpMonthOptions').querySelectorAll('input[name="cpMonth"]:checked')].reduce((n,x)=>n+Number(x.dataset.remaining),0);$('cpMonthTotal').textContent='নির্বাচিত মাসের মোট বকেয়া: '+money(total)};
  $('cpMonthOptions').querySelectorAll('input[name="cpMonth"]').forEach(x=>x.addEventListener('change',updateTotal));updateTotal();
 };
 $('cpDate').value=todayDhaka();$('cpSubmit').disabled=!canWrite();
 $('cpMember').innerHTML='<option value="">চাঁদাদাতা নির্বাচন করুন</option>'+active.map(m=>'<option value="'+m.id+'">'+escapeHtml(m.member_name)+'</option>').join('');
 $('cpMember').onchange=()=>renderMonthOptions($('cpMember').value);
 $('chandaCollectionForm').onsubmit=async e=>{
  e.preventDefault();if(!canWrite()){showError(err,new Error('চাঁদা গ্রহণের অনুমতি নেই।'));return}
  const selected=[...$('cpMonthOptions').querySelectorAll('input[name="cpMonth"]:checked')];
  const ids=selected.map(x=>x.value),total=selected.reduce((n,x)=>n+Number(x.dataset.remaining),0),amount=Number($('cpAmount').value);
  if(!ids.length){showError(err,new Error('কমপক্ষে একটি মাস নির্বাচন করুন।'));return}
  if(!Number.isFinite(amount)||amount<=0||amount>total){showError(err,new Error('জমার পরিমাণ নির্বাচিত মাসগুলোর মোট বকেয়া '+money(total)+' এর মধ্যে হতে হবে।'));return}
  const btn=$('cpSubmit');btn.disabled=true;
  try{
   const{error}=await supabase.rpc('record_chanda_payment_months',{target_dues:ids,p_paid_amount:amount,paid_on:$('cpDate').value,method:$('cpMethod').value,reference:$('cpReference').value.trim(),memo:$('cpMemo').value.trim()});
   if(error)throw error;
   e.target.reset();$('cpDate').value=todayDhaka();$('cpMember').value='';$('cpMonthOptions').innerHTML='<p class="muted">প্রথমে চাঁদাদাতা নির্বাচন করুন।</p>';$('cpMonthTotal').textContent='নির্বাচিত মাসের মোট বকেয়া: ৳ ০';await loadAll();
  }catch(ex){if(err)showError(err,ex)}finally{btn.disabled=!canWrite()}
 };
 $('chandaDueRows').onclick=e=>{
  const btn=e.target.closest('[data-pay]');if(!btn)return;
  $('cpMember').value=btn.dataset.member;renderMonthOptions(btn.dataset.member,btn.dataset.month);
  const chosen=$('cpMonthOptions').querySelector('input[name="cpMonth"]:checked');$('cpAmount').value=chosen?.dataset.remaining||btn.dataset.remain;
  $('chandaCollectionForm').scrollIntoView({behavior:'smooth',block:'center'});
 };
 const combined=[
  ...payments.map(p=>({date:p.created_at,type:'পেমেন্ট',member:byId.get(p.member_id)?.member_name||'অজানা',detail:money(p.amount)+' · '+p.payment_method+' · '+p.reference_no,status:'রেকর্ড হয়েছে'})),
  ...logs.map(l=>({date:l.created_at,type:'অনুস্মারক',member:byId.get(l.member_id)?.member_name||'অজানা',detail:l.message,status:l.status}))
 ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,100);
 $('chandaLogsRows').innerHTML=combined.map(x=>'<tr><td>'+escapeHtml(new Date(x.date).toLocaleString('bn-BD',{timeZone:'Asia/Dhaka'}))+'</td><td>'+escapeHtml(x.member)+'</td><td>'+escapeHtml(x.type)+'</td><td>'+escapeHtml(x.detail)+'</td><td>'+escapeHtml(x.status)+'</td></tr>').join('')||'<tr><td colspan="5">এখনো কোনো পেমেন্ট বা অনুস্মারক ইতিহাস নেই।</td></tr>';
}
async function boot(){
 try{
  if(!configured)return;
  const current=await currentProfile();signedInUser=current.user;signedInProfile=current.profile;
  if(!signedInUser||!signedInProfile)return;
  if(signedInProfile.role==='custom_admin'){
   const{data,error}=await supabase.from('admin_module_permissions').select('module_key,can_view,can_write').eq('user_id',signedInUser.id);
   if(error)throw error;permissions=data||[];
  }
  mount();
  new MutationObserver(()=>{if(!location.hash.includes('admin=m51'))lastViewKey='';mount()}).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{lastViewKey='';setTimeout(mount,50)});
 }catch(error){console.error('Chanda admin initialization:',error)}
}
boot();
