import{configured,supabase,currentProfile,escapeHtml,money,showError}from'./supabase-client.js';
const $=id=>document.getElementById(id);
let started=false,profile=null;
const institution=()=> $('institution').value;
const canRead=()=>['super_admin','admin','accounts_manager','accountant','auditor','mosque_admin','foundation_admin'].includes(profile?.role);
function err(e){showError($('journalError'),e)}
async function load(){
 const inst=institution();
 const [tb,jr]=await Promise.all([
  supabase.from('account_trial_balance').select('*').eq('institution',inst).order('account_code'),
  supabase.from('account_journal_report').select('*').eq('institution',inst).order('journal_date',{ascending:false}).order('journal_no',{ascending:false}).limit(250)
 ]);
 if(tb.error)throw tb.error;if(jr.error)throw jr.error;
 const rows=tb.data||[],journals=jr.data||[];
 const debit=rows.reduce((n,x)=>n+Number(x.total_debit),0),credit=rows.reduce((n,x)=>n+Number(x.total_credit),0);
 $('journalDebit').textContent=money(debit);$('journalCredit').textContent=money(credit);$('journalDifference').textContent=money(debit-credit);
 $('trialBalanceRows').innerHTML=rows.map(x=>'<tr><td>'+escapeHtml(x.account_code)+'</td><td>'+escapeHtml(x.account_name)+'</td><td>'+escapeHtml(x.account_type)+'</td><td>'+money(x.total_debit)+'</td><td>'+money(x.total_credit)+'</td><td>'+money(x.net_balance)+'</td></tr>').join('')||'<tr><td colspan="6">কোনো হিসাব নেই।</td></tr>';
 $('journalRows').innerHTML=journals.map(x=>'<tr><td>'+escapeHtml(String(x.journal_no))+'</td><td>'+escapeHtml(x.journal_date)+'</td><td>'+escapeHtml(x.description)+'</td><td>'+escapeHtml(x.source_type)+'</td><td>'+money(x.total_debit)+'</td><td>'+money(x.total_credit)+'</td></tr>').join('')||'<tr><td colspan="6">কোনো জার্নাল পোস্ট হয়নি।</td></tr>';
 $('journalCsv').onclick=()=>{const cols=['account_code','account_name','account_type','total_debit','total_credit','net_balance'];const safe=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const csv='\uFEFF'+[cols.join(','),...rows.map(x=>cols.map(k=>safe(x[k])).join(','))].join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='trial-balance-'+inst+'.csv';a.click();URL.revokeObjectURL(u)};
}
async function init(){
 if(started||!configured||$('app').hidden)return;started=true;
 try{const c=await currentProfile();profile=c.profile;if(!c.user||!profile){started=false;return}
 if(!canRead()){$('doubleEntryPanel').hidden=true;return}
 if(profile.role==='custom_admin'){$('doubleEntryPanel').hidden=true;return}
 $('doubleEntryPanel').hidden=false;
 $('journalRefresh').onclick=()=>load().catch(err);
 $('institution').addEventListener('change',()=>load().catch(err));
 $('journalPrint').onclick=()=>window.print();
 await load();
 }catch(e){started=false;err(e)}
}
const observer=new MutationObserver(()=>{if(!$('app').hidden)init()});
observer.observe($('app'),{attributes:true,attributeFilter:['hidden']});
if(!$('app').hidden)init();
