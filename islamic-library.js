/* Islamic learning library: Quran, hadith and source-linked knowledge */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const quranApi='https://api.alquran.cloud/v1';
const hadithCdn='https://cdn.jsdelivr.net/gh/kafelanetwork/hadith-api@main';
const books=[
 {key:'Bukhari',meta:'bukhari',name:'সহীহ বুখারী',path:'Bukhari'},
 {key:'Muslim',meta:'muslim',name:'সহীহ মুসলিম',path:'Muslim'},
 {key:'AbuDaud',meta:'abudaud',name:'সুনানে আবু দাউদ',path:'AbuDaud'},
 {key:'Tirmidhi',meta:'at-tirmizi',name:'জামে তিরমিজি',path:'At-tirmizi'},
 {key:'Nasai',meta:"nasa'i",name:'সুনানে নাসাঈ',path:'Al-Nasai'},
 {key:'IbnMajah',meta:'ibnemajah',name:'সুনানে ইবনে মাজাহ',path:'Ibne-Mazah'}
];
let surahs=null;
const bn=n=>String(n).replace(/[0-9]/g,d=>'০১২৩৪৫৬৭৮৯'[Number(d)]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function json(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
function status(msg){$('islamicContent').innerHTML='<p class="islamic-status">'+esc(msg)+'</p>'}
function addMenu(title,items,direct){
 const nav=$('nav');if(!nav)return;
 const wrap=document.createElement('div');wrap.className='navitem islamic-navitem';
 const button=document.createElement('button');button.type='button';button.className='navbtn';button.textContent=title;
 const dropdown=document.createElement('div');dropdown.className='dropdown';
 items.forEach(item=>{
  const b=document.createElement('button');b.type='button';b.className='dropitem';b.textContent=item.label;
  b.addEventListener('click',()=>{openLibrary(item.view,item.book||null);closeMenus()});dropdown.appendChild(b);
 });
 button.addEventListener('click',()=>{
  document.querySelectorAll('.navitem').forEach(x=>x.classList.remove('open'));
  if(direct){openLibrary(direct);return}
  wrap.classList.toggle('open');
 });
 wrap.append(button,dropdown);nav.appendChild(wrap);
}
function closeMenus(){document.querySelectorAll('.navitem').forEach(x=>x.classList.remove('open'))}
window.closeIslamicLibrary=function(){
 $('islamicLibrary').classList.add('hidden');$('detail').classList.add('hidden');$('home').classList.remove('hidden');
 history.replaceState(null,'',location.pathname);window.scrollTo({top:0,behavior:'smooth'});
};
window.openLibrary=function(view,book){
 $('home').classList.add('hidden');$('detail').classList.add('hidden');$('islamicLibrary').classList.remove('hidden');
 $('islamicToolbar').replaceChildren();$('islamicContent').replaceChildren();
 const titles={quran:'বাংলা ও আরবীতে পবিত্র কোরআন',asbab:'সূরা-ভিত্তিক শানে নুযুল',tafsir:'সূরা-ভিত্তিক তাফসির',hadith:'পবিত্র হাদীস শরীফ',knowledge:'ইসলামিক জ্ঞানভান্ডার'};
 $('islamicTitle').textContent=titles[view]||'ইসলামিক জ্ঞানভান্ডার';
 $('islamicCrumb').textContent=titles[view]||'ইসলামিক জ্ঞানভান্ডার';
 $('islamicLead').textContent=view==='quran'?'৩০ পারা ও ১১৪টি সূরা থেকে আরবি মূল পাঠ এবং বাংলা অনুবাদ পড়ুন।':view==='hadith'?'ছয়টি প্রসিদ্ধ হাদীসগ্রন্থ থেকে অধ্যায়ভিত্তিক আরবি ও বাংলা পাঠ।':view==='asbab'?'প্রতিটি সূরার নাযিলের প্রেক্ষাপট নির্ভরযোগ্য তাফসির ও বর্ণনা মিলিয়ে যাচাই করুন।':view==='tafsir'?'প্রতিটি সূরার তাফসির নির্ভরযোগ্য উৎসে সূরা ও আয়াত ধরে পড়ুন।':'কুরআনের আয়াতের রেফারেন্সসহ নির্বাচিত ইসলামী বিষয়াবলি।';
 if(view==='quran')renderQuran();
 else if(view==='asbab'||view==='tafsir')renderSurahReferences(view);
 else if(view==='hadith')renderHadithBooks(book);
 else renderKnowledge();
 history.replaceState(null,'','#islamic-'+view);window.scrollTo({top:0,behavior:'smooth'});
};
function select(label,id,options){
 const wrap=document.createElement('label');wrap.textContent=label+' ';
 const el=document.createElement('select');el.id=id;
 options.forEach(o=>{const op=document.createElement('option');op.value=o.value;op.textContent=o.label;el.appendChild(op)});
 wrap.appendChild(el);$('islamicToolbar').appendChild(wrap);return el;
}
async function getSurahs(){
 if(surahs)return surahs;
 const data=await json(quranApi+'/surah');surahs=data.data||[];return surahs;
}
async function renderQuran(){
 status('সূরা ও পারার তালিকা লোড হচ্ছে…');
 try{
  const list=await getSurahs();
  $('islamicToolbar').replaceChildren();
  const mode=select('পাঠের ধরন','quranMode',[{value:'juz',label:'পারা অনুযায়ী'},{value:'surah',label:'সূরা অনুযায়ী'}]);
  const juz=select('পারা','quranJuz',Array.from({length:30},(_,i)=>({value:String(i+1),label:'পারা '+bn(i+1)})));
  const surah=select('সূরা','quranSurah',list.map(s=>({value:String(s.number),label:'সূরা '+bn(s.number)+' — '+s.name})));
  const go=document.createElement('button');go.className='islamic-control';go.textContent='পড়া শুরু করুন';$('islamicToolbar').appendChild(go);
  const sync=()=>{juz.parentElement.style.display=mode.value==='juz'?'':'none';surah.parentElement.style.display=mode.value==='surah'?'':'none'};
  mode.addEventListener('change',sync);sync();
  go.addEventListener('click',()=>loadQuran(mode.value==='juz'?'juz':'surah',mode.value==='juz'?juz.value:surah.value));
  await loadQuran('juz','1');
 }catch(e){status('কোরআনের পাঠ লোড করা যায়নি। ইন্টারনেট সংযোগ বা কোরআন API পরে আবার চেষ্টা করুন. ('+e.message+')')}
}
async function loadQuran(kind,id){
 status('আরবি মূল পাঠ ও বাংলা অনুবাদ আনা হচ্ছে…');
 try{
  const [arData,bnData]=await Promise.all([
   json(quranApi+'/'+kind+'/'+encodeURIComponent(id)+'/quran-uthmani'),
   json(quranApi+'/'+kind+'/'+encodeURIComponent(id)+'/bn.bengali')
  ]);
  const ar=arData.data,bnEd=bnData.data;
  if(!ar||!bnEd)throw new Error('আরবি/বাংলা সংস্করণ পাওয়া যায়নি');
  const bnByNo=new Map((bnEd.ayahs||[]).map(a=>[String(a.surah?.number||'')+':'+a.numberInSurah,a.text]));
  const fragment=document.createDocumentFragment();
  const header=document.createElement('div');header.className='islamic-note';header.textContent=(kind==='juz'?'পারা '+bn(id):ar.ayahs?.[0]?.surah?.name||'সূরা')+' · আরবি: Uthmani · বাংলা অনুবাদ: '+(bnEd.edition?.name||'বাংলা অনুবাদ')+' · তথ্যসূত্র: AlQuran Cloud API';fragment.appendChild(header);
  (ar.ayahs||[]).forEach(a=>{
   const card=document.createElement('article');card.className='quran-ayah';
   const ref=document.createElement('div');ref.className='ayah-ref';ref.textContent=(a.surah?.name||'')+' · সূরা '+bn(a.surah?.number||'')+' · আয়াত '+bn(a.numberInSurah);
   const arabic=document.createElement('div');arabic.className='arabic';arabic.lang='ar';arabic.textContent=a.text;
   const translation=document.createElement('div');translation.className='translation';translation.textContent=bnByNo.get(String(a.surah?.number||'')+':'+a.numberInSurah)||'এই আয়াতের বাংলা অনুবাদ পাওয়া যায়নি।';
   card.append(ref,arabic,translation);fragment.appendChild(card);
  });
  $('islamicContent').replaceChildren(fragment);
  if(!ar.ayahs?.length)status('এই নির্বাচনে কোনো আয়াত পাওয়া যায়নি।');
 }catch(e){status('কোরআনের পাঠ আনা যায়নি: '+e.message)}
}
async function renderSurahReferences(kind){
 status('১১৪টি সূরার তালিকা লোড হচ্ছে…');
 try{
  const list=await getSurahs();const root=document.createElement('div');
  const note=document.createElement('div');note.className='islamic-note';
  note.textContent=kind==='asbab'
   ?'গুরুত্বপূর্ণ: প্রতিটি সূরার জন্য স্বতন্ত্র শানে নুযুলের সহিহ বর্ণনা আছে—এমন নয়। যেখানে নির্ভরযোগ্য বর্ণনা নেই বা মতভেদ আছে, সেখানে অনুমান করে ঘটনা লেখা হবে না। নিচের লিংকে সূরা-ভিত্তিক তাফসির ও নাযিলের প্রেক্ষাপটের উৎস যাচাই করুন।'
   :'তাফসিরে আয়াতের ব্যাখ্যা, প্রেক্ষাপট ও আলেমদের মতামত থাকতে পারে। মূল উৎসে তাফসির নির্বাচন করে পড়ুন; অনুবাদকে তাফসিরের বিকল্প মনে করবেন না।';
  root.appendChild(note);const grid=document.createElement('div');grid.className='islamic-list';
  list.forEach(s=>{
   const a=document.createElement('a');a.href='https://quran.com/bn/'+s.number;a.target='_blank';a.rel='noopener noreferrer';
   a.textContent='সূরা '+bn(s.number)+' — '+s.name+' · '+bn(s.numberOfAyahs)+' আয়াত · '+(s.revelationType==='Meccan'?'মাক্কী':'মাদানী')+' · বাংলা পাঠ ও ব্যাখ্যা খুলুন ↗';
   grid.appendChild(a);
  });
  root.appendChild(grid);$('islamicContent').replaceChildren(root);
 }catch(e){status('সূরার তালিকা পাওয়া যায়নি: '+e.message)}
}
async function renderHadithBooks(selected){
 $('islamicToolbar').replaceChildren();
 const chosen=books.find(b=>b.key===selected);
 const bookSelect=select('হাদীসগ্রন্থ','hadithBook',books.map(b=>({value:b.key,label:b.name})));
 if(chosen)bookSelect.value=chosen.key;
 const go=document.createElement('button');go.className='islamic-control';go.textContent='গ্রন্থ খুলুন';$('islamicToolbar').appendChild(go);
 const open=()=>loadHadithBook(bookSelect.value);go.addEventListener('click',open);
 status('ছয়টি হাদীসগ্রন্থ থেকে একটি নির্বাচন করুন।');if(chosen)await open();
}
async function loadHadithBook(key){
 const book=books.find(b=>b.key===key);if(!book)return;
 status(book.name+'-এর অধ্যায়ের তালিকা লোড হচ্ছে…');
 try{
  const meta=await json(hadithCdn+'/'+book.path+'/Meta/'+encodeURIComponent(book.meta)+'.json');
  const entries=Object.entries(meta||{}).sort((a,b)=>Number(a[0])-Number(b[0]));
  const root=document.createElement('div');const note=document.createElement('div');note.className='islamic-note';note.textContent=book.name+' · অধ্যায় নির্বাচন করুন। হাদীসের আরবি ও বাংলা পাঠ, বর্ণনাকারী ও নম্বর উৎস ডেটাসেট অনুযায়ী দেখানো হবে। ডেটা উৎস: Kafela Network Hadith API; আরবি ও বাংলা পাঠ।';root.appendChild(note);
  const grid=document.createElement('div');grid.className='islamic-list';
  entries.forEach(([num,item])=>{
   const b=document.createElement('button');b.type='button';b.textContent=bn(num)+'. '+(item.title||'অধ্যায়')+(item.hadis_range?' · হাদীস '+item.hadis_range:'');
   b.addEventListener('click',()=>loadHadithChapter(book,num,item.title||''));grid.appendChild(b);
  });
  root.appendChild(grid);$('islamicContent').replaceChildren(root);
 }catch(e){status('অধ্যায়ের তালিকা লোড করা যায়নি: '+e.message+'. কিছুক্ষণ পর আবার চেষ্টা করুন। তথ্যসূত্র: Kafela Network Hadith API.')}
}
async function loadHadithChapter(book,chapter,title){
 status(title+' অধ্যায়ের হাদীস লোড হচ্ছে…');
 try{
  const data=await json(hadithCdn+'/'+book.path+'/Chapter/'+chapter+'.json');
  const rows=Array.isArray(data)?data:(Array.isArray(data.data)?data.data:(Array.isArray(data.hadiths)?data.hadiths:(data.hadith?[data.hadith]:(data.data?.hadith?[data.data.hadith]:[]))));
  if(!rows.length)throw new Error('এই অধ্যায়ে পাঠ পাওয়া যায়নি');
  const root=document.createElement('div');const h=document.createElement('div');h.className='islamic-note';h.textContent=book.name+' · '+title;root.appendChild(h);
  rows.forEach(item=>{
   const record=item.hadith||item;
   const card=document.createElement('article');card.className='hadith-card';
   const meta=document.createElement('div');meta.className='meta';meta.textContent='হাদীস নং '+bn(record.hadithNo||record.hadith_number||record.number||'—')+(record.rabiNameBn?' · বর্ণনাকারী: '+record.rabiNameBn:'')+(record.topicName?' · '+record.topicName:'');
   card.appendChild(meta);
   const arText=record.hadithArabic||record.ar||record.arabic||'';
   if(arText){const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.textContent=arText;card.appendChild(ar)}
   const bnText=record.hadithBengali||record.bengali||record.text_bn||record.bn||record.text;
   if(bnText){const bnEl=document.createElement('div');bnEl.className='bn';bnEl.textContent=bnText;card.appendChild(bnEl)}
   if(record.grade){const grade=document.createElement('div');grade.className='meta';grade.textContent='হাদীসের মান: '+record.grade;card.appendChild(grade)}
   root.appendChild(card);
  });
  $('islamicContent').replaceChildren(root);
 }catch(e){status('হাদীসের অধ্যায় লোড করা যায়নি: '+e.message+'. নেটওয়ার্ক বা উৎসের ডেটা যাচাই করে আবার চেষ্টা করুন।')}
}
async function renderKnowledge(){
 const topics=[
  ['তাওহিদ ও ঈমান','আল্লাহ এক ও অদ্বিতীয়। ইবাদত, দোয়া ও চূড়ান্ত ভরসা একমাত্র আল্লাহর জন্য।','সূরা আল-ইখলাস ১১২:১','112:1'],
  ['সালাত','সালাত নিয়মিত আদায়, আল্লাহর স্মরণ এবং অশ্লীলতা ও মন্দ কাজ থেকে বিরত থাকার শিক্ষা দেয়।','সূরা আল-আনকাবুত ২৯:৪৫','29:45'],
  ['সিয়াম ও রমজান','রমজানের রোজা তাকওয়া অর্জনের উদ্দেশ্যে ফরজ করা হয়েছে।','সূরা আল-বাকারা ২:১৮৩','2:183'],
  ['যাকাত ও দান','যাকাত আদায় এবং আল্লাহর পথে ব্যয় করা ইসলামের গুরুত্বপূর্ণ আর্থিক ইবাদত।','সূরা আল-বাকারা ২:৪৩','2:43'],
  ['হজ','সামর্থ্যবান মানুষের ওপর আল্লাহর ঘরের হজ পালন ফরজ।','সূরা আলে ইমরান ৩:৯৭','3:97'],
  ['পিতা-মাতার অধিকার','আল্লাহর ইবাদতের পাশাপাশি পিতা-মাতার সঙ্গে সদ্ব্যবহারের নির্দেশ দেওয়া হয়েছে।','সূরা আল-ইসরা ১৭:২৩','17:23'],
  ['ন্যায়বিচার ও আমানত','আমানত যথাযথভাবে ফিরিয়ে দেওয়া এবং মানুষের মধ্যে ন্যায়বিচার করার নির্দেশ রয়েছে।','সূরা আন-নিসা ৪:৫৮','4:58'],
  ['উত্তম চরিত্র','ন্যায়, ইহসান ও আত্মীয়স্বজনকে দানের নির্দেশ এবং অশ্লীলতা ও অন্যায় থেকে নিষেধ করা হয়েছে।','সূরা আন-নাহল ১৬:৯০','16:90'],
  ['জ্ঞান অন্বেষণ','উপকারী জ্ঞান বৃদ্ধির জন্য দোয়া করার শিক্ষা রয়েছে।','সূরা ত্ব-হা ২০:১১৪','20:114']
 ];
 status('বিষয়ভিত্তিক বাংলা ব্যাখ্যা ও আরবি আয়াত লোড হচ্ছে…');
 const root=document.createElement('div');const grid=document.createElement('div');grid.className='islamic-list';
 const rows=await Promise.all(topics.map(async t=>{try{const [arData,bnData]=await Promise.all([json(quranApi+'/ayah/'+t[3]+'/quran-uthmani'),json(quranApi+'/ayah/'+t[3]+'/bn.bengali')]);return {ar:arData.data?.text||'',bn:bnData.data?.text||''}}catch(_){return {ar:'',bn:''}}}));
 topics.forEach((t,i)=>{const card=document.createElement('article');card.className='knowledge-card';const h=document.createElement('h3');h.textContent=t[0];const p=document.createElement('p');p.textContent=t[1];card.append(h,p);if(rows[i].ar){const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.textContent=rows[i].ar;card.appendChild(ar)}if(rows[i].bn){const tr=document.createElement('p');tr.className='translation';tr.textContent=rows[i].bn;card.appendChild(tr)}const small=document.createElement('small');small.textContent='কুরআনের সূত্র: '+t[2]+' · ';const a=document.createElement('a');a.href='https://quran.com/bn/'+t[3];a.target='_blank';a.rel='noopener noreferrer';a.textContent='বাংলা ব্যাখ্যাসহ আয়াত পড়ুন ↗';small.appendChild(a);card.appendChild(small);grid.appendChild(card)});
 root.appendChild(grid);$('islamicContent').replaceChildren(root);
}
addMenu('পবিত্র কোরআন শিক্ষা',[
 {label:'বাংলা ও আরবীতে পড়া — ৩০ পারা',view:'quran'},
 {label:'শানে নুযুল — ১১৪টি সূরা',view:'asbab'},
 {label:'তাফসির — ১১৪টি সূরা',view:'tafsir'}
]);
addMenu('পবিত্র হাদীস শরীফ',books.map(b=>({label:b.name,view:'hadith',book:b.key})));
addMenu('ইসলামিক জ্ঞানভান্ডার',[{label:'বিষয়ভিত্তিক ইসলামী শিক্ষা',view:'knowledge'}],'knowledge');
})();
