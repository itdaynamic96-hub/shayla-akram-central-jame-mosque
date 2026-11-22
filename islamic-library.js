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
let asbabEntries=null;
const asbabApi='https://cdn.jsdelivr.net/gh/mostafaahmed97/asbab-al-nuzul-dataset@main/data/structured/json/all.json';
const tafsirApi='https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@v1.2.3/tafsir';
const tafsirEditions=[{id:'bn-tafisr-fathul-majid',name:'তাফসির ফাতহুল মাজীদ',author:'আবদুর রহমান বিন হাসান আল-আলশাইখ'}];
const bn=n=>String(n).replace(/[0-9]/g,d=>'০১২৩৪৫৬৭৮৯'[Number(d)]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function arabicToBangla(text){
 const map={'ا':'আ','أ':'আ','إ':'ই','آ':'আ','ء':'','ؤ':'উ','ئ':'ই','ٱ':'আ','ب':'ব','ت':'ত','ث':'ছ','ج':'জ','ح':'হ','خ':'খ','د':'দ','ذ':'য','ر':'র','ز':'য','س':'স','ش':'শ','ص':'স','ض':'দ','ط':'ত','ظ':'য','ع':'আ','غ':'গ','ف':'ফ','ق':'ক্ব','ك':'ক','ل':'ল','م':'ম','ن':'ন','ه':'হ','و':'ও','ي':'ই','ى':'আ','ة':'হ','پ':'প','چ':'চ','گ':'গ','ک':'ক','ی':'ই','ٰ':'া'};
 const marks={'َ':'া','ِ':'ি','ُ':'ু','ً':'ান','ٍ':'ইন','ٌ':'উন','ْ':'','ّ':'','ٓ':'','ٔ':'','ٕ':''};
 const chars=Array.from(String(text||'').normalize('NFC'));let out='';
 for(let i=0;i<chars.length;i++){const ch=chars[i];if(ch==='ـ')continue;if(marks[ch]!==undefined){if(ch==='ّ'){const last=Array.from(out).pop()||'';out+=last}else out+=marks[ch];continue}if(ch==='\u200f'||ch==='\u200e')continue;if(map[ch]!==undefined){out+=map[ch];continue}out+=ch}
 return out.replace(/\s+/g,' ').trim();
}
function appendPronunciation(parent,arabicText){
 if(!arabicText)return;
 const wrap=document.createElement('div');wrap.className='arabic-pronunciation';wrap.style.cssText='margin:5px 0 12px;padding:9px 12px;border-left:3px solid #c5a45b;background:#f8f5ec;border-radius:6px;line-height:1.85';
 const label=document.createElement('strong');label.textContent='বাংলা উচ্চারণ (আনুমানিক): ';label.style.cssText='font-size:12px;color:#80652f';
 const value=document.createElement('span');value.textContent=arabicToBangla(arabicText);value.style.cssText='font-size:14px;color:#35483b';
 wrap.append(label,value);parent.appendChild(wrap);
}
async function translateArabicToBangla(text){
 const source=String(text||'').trim();if(!source)return '';
 const chunks=[];let rest=source;
 while(rest.length>0){if(rest.length<=850){chunks.push(rest);break}let cut=rest.lastIndexOf(' ',850);if(cut<450)cut=850;chunks.push(rest.slice(0,cut));rest=rest.slice(cut).trimStart()}
 const translated=[];
 for(const chunk of chunks){const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=bn&dt=t&q='+encodeURIComponent(chunk);const data=await json(url);const part=Array.isArray(data?.[0])?data[0].map(x=>x?.[0]||'').join(''):'';if(!part)throw new Error('বাংলা অনুবাদ পাওয়া যায়নি');translated.push(part)}
 return translated.join(' ');
}
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
 $('islamicLead').textContent=view==='quran'?'৩০ পারা ও ১১৪টি সূরা থেকে আরবি মূল পাঠ এবং বাংলা অনুবাদ পড়ুন।':view==='hadith'?'ছয়টি প্রসিদ্ধ হাদীসগ্রন্থ থেকে অধ্যায়ভিত্তিক আরবি ও বাংলা পাঠ।':view==='asbab'?'সূরা নির্বাচন করে নির্দিষ্ট আয়াতের শানে নুযুল, আরবি আয়াত, বাংলা অর্থ ও মূল বর্ণনা পড়ুন।':view==='tafsir'?'প্রতিটি সূরার তাফসির নির্ভরযোগ্য উৎসে সূরা ও আয়াত ধরে পড়ুন।':'কুরআনের আয়াতের রেফারেন্সসহ নির্বাচিত ইসলামী বিষয়াবলি।';
 if(view==='quran')renderQuran();
 else if(view==='asbab')renderAsbab();
 else if(view==='tafsir')renderTafsir();
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
   card.append(ref,arabic);appendPronunciation(card,a.text);
   const translation=document.createElement('div');translation.className='translation';translation.textContent=bnByNo.get(String(a.surah?.number||'')+':'+a.numberInSurah)||'এই আয়াতের বাংলা অনুবাদ পাওয়া যায়নি।';
   card.appendChild(translation);fragment.appendChild(card);
  });
  $('islamicContent').replaceChildren(fragment);
  if(!ar.ayahs?.length)status('এই নির্বাচনে কোনো আয়াত পাওয়া যায়নি।');
 }catch(e){status('কোরআনের পাঠ আনা যায়নি: '+e.message)}
}
async function renderAsbab(){
 status('শানে নুযুলের তথ্য ও সূরার তালিকা লোড হচ্ছে…');
 try{
  const [list,entries]=await Promise.all([
   getSurahs(),
   asbabEntries?Promise.resolve(asbabEntries):json(asbabApi)
  ]);
  asbabEntries=entries;
  $('islamicToolbar').replaceChildren();
  const options=[{value:'0',label:'সূরা নির্বাচন করুন'},...list.map(x=>({value:String(x.number),label:'সূরা '+bn(x.number)+' — '+x.name}))];
  const picker=select('সূরা','asbabSurah',options);
  const load=async()=>loadAsbabSurah(Number(picker.value),list);
  picker.addEventListener('change',load);
  const intro=document.createElement('div');intro.className='islamic-note';
  intro.textContent='যে আয়াতগুলোর জন্য নির্ভরযোগ্য সূত্রে শানে নুযুলের বর্ণনা সংকলিত আছে, সেগুলোই এখানে দেখানো হবে। সব ১১৪টি সূরার সব আয়াতের শানে নুযুল নেই। মূল আরবি পাঠ, আনুমানিক বাংলা উচ্চারণ, আয়াতের বাংলা অর্থ এবং পূর্ণ বর্ণনার স্বয়ংক্রিয় বাংলা অনুবাদ পাওয়া গেলে দেখুন; অনুবাদ যাচাইসাপেক্ষ।';
  $('islamicContent').replaceChildren(intro);
 }catch(e){status('শানে নুযুলের তথ্য লোড করা যায়নি: '+e.message)}
}
async function loadAsbabSurah(surahNo,list){
 if(!surahNo){status('শানে নুযুল দেখতে একটি সূরা নির্বাচন করুন।');return}
 status('সূরা '+bn(surahNo)+'-এর আয়াত ও পূর্ণ শানে নুযুল আনা হচ্ছে…');
 try{
  const [arData,bnData]=await Promise.all([json(quranApi+'/surah/'+surahNo+'/quran-uthmani'),json(quranApi+'/surah/'+surahNo+'/bn.bengali')]);
  const arAyahs=new Map((arData.data?.ayahs||[]).map(a=>[Number(a.numberInSurah),a.text]));
  const bnAyahs=new Map((bnData.data?.ayahs||[]).map(a=>[Number(a.numberInSurah),a.text]));
  const sourceRows=Array.isArray(asbabEntries)?asbabEntries:(Array.isArray(asbabEntries?.data)?asbabEntries.data:[]);
  const matches=sourceRows.filter(x=>Number(x.surah)===surahNo);
  const root=document.createElement('div'),surah=list.find(x=>x.number===surahNo);
  const heading=document.createElement('div');heading.className='islamic-note';heading.textContent='সূরা '+bn(surahNo)+' — '+(surah?.name||'')+' · '+bn(matches.length)+'টি আয়াত-সম্পর্কিত শানে নুযুলের নথি।';root.appendChild(heading);
  if(matches.length){
   const caution=document.createElement('div');caution.className='islamic-note';
   caution.textContent='নিচে সংকলনে থাকা বর্ণনাগুলোর মূল আরবি, আনুমানিক বাংলা উচ্চারণ এবং পূর্ণ স্বয়ংক্রিয় বাংলা অনুবাদ দেখানো হবে। অনুবাদটি মেশিন-সহায়িত; ধর্মীয় উদ্ধৃতি হিসেবে ব্যবহারের আগে মূল গ্রন্থ ও যোগ্য আলেমের মাধ্যমে যাচাই করুন।';
   root.appendChild(caution);
  }
  if(!matches.length){
   const empty=document.createElement('section');empty.className='islamic-note';
   if(surahNo===89){
    const title=document.createElement('h3');title.textContent='সূরা আল-ফজর: শানে নুযুলের যাচাইকৃত তথ্য';empty.appendChild(title);
    const summary=document.createElement('p');summary.textContent='সূরা আল-ফজর মক্কী—এটাই অধিকাংশ মুফাসসিরের গ্রহণযোগ্য মত। সালমান আল-আওদার “ইশরাকাত কুরআনিয়্যাহ” গ্রন্থে সূরাটির পরিচিতি অংশে স্পষ্ট বলা হয়েছে: “ولا يعرف لها سبب نزول” — অর্থাৎ, সূরাটির নির্দিষ্ট কোনো শানে নুযুল জানা যায় না। তাই কোনো নির্দিষ্ট ঐতিহাসিক ঘটনাকে ৩০টি আয়াতের অবতরণের নিশ্চিত কারণ হিসেবে এখানে দেখানো হচ্ছে না।';empty.appendChild(summary);
    const context=document.createElement('p');context.textContent='একই গবেষক সম্ভাব্য সামগ্রিক প্রেক্ষাপট হিসেবে উল্লেখ করেন—নবী ﷺ-এর কঠিন সময়ের মধ্যে সূরাটি তাঁকে দুটি বিষয়ে স্মরণ করিয়ে সান্ত্বনা ও দৃঢ়তা দেওয়ার জন্য নাযিল হয়ে থাকতে পারে: আল্লাহর পক্ষ থেকে নবী ﷺ-এর জন্য অনুগ্রহ, নবুওয়ত ও বিজয়ের প্রতিশ্রুতি; এবং সত্য অস্বীকারকারী ও জালিমদের পরিণতি। এটি গবেষকের তাফসিরি ব্যাখ্যা, কোনো নির্দিষ্ট ঘটনার সহিহ হাদিসভিত্তিক শানে নুযুল নয়।';empty.appendChild(context);
    const themes=document.createElement('p');themes.textContent='সূরার বিষয়বস্তুর মধ্যে রয়েছে আদ ও সামূদের মতো অবাধ্য জাতির পরিণতি, সম্পদ ও সংকীর্ণ জীবিকা দিয়ে মানুষের পরীক্ষা, এতিম ও দরিদ্রের অধিকার, দুনিয়ার প্রতি অতিরিক্ত আসক্তির সমালোচনা এবং কিয়ামতের জবাবদিহি। এগুলো সূরার শিক্ষা—শানে নুযুলের ঘটনা নয়।';empty.appendChild(themes);
    const refs=document.createElement('p');refs.textContent='গবেষণার মূল আরবি বক্তব্য: “ولا يعرف لها سبب نزول” (এর নির্দিষ্ট শানে নুযুল জানা যায় না)। সূরাটি মক্কী—এ বিষয়ে অধিকাংশ মুফাসসির একমত; কিছু ভিন্নমতও গ্রন্থে উল্লেখ করা হয়েছে।';empty.appendChild(refs);
    const a=document.createElement('a');a.href='https://saaid.org/book/22/17123.pdf';a.target='_blank';a.rel='noopener noreferrer';a.textContent='মূল তাফসিরি গবেষণা: إشراقات قرآنية — سلمان العودة (PDF)';empty.appendChild(a);
    const b=document.createElement('a');b.href='https://quran.com/ar/al-fajr/info';b.target='_blank';b.rel='noopener noreferrer';b.textContent='Quran.com — সূরার পরিচিতি ও ইবন আশুরের ভূমিকা';b.style.marginInlineStart='12px';empty.appendChild(b);
    const c=document.createElement('a');c.href='https://quran.ksu.edu.sa/tafseer/qortobi/sura89-aya1.html';c.target='_blank';c.rel='noopener noreferrer';c.textContent='তাফসির আল-কুরতুবি — সূরা আল-ফজর';c.style.marginInlineStart='12px';empty.appendChild(c);
   }else{
    empty.textContent='এই সূরার জন্য সংযুক্ত নির্দিষ্ট আয়াতের শানে নুযুল এই সংকলনে পাওয়া যায়নি। তাই অনুমানভিত্তিক কোনো ঘটনা দেখানো হচ্ছে না।';
   }
   root.appendChild(empty);$('islamicContent').replaceChildren(root);return
  }
  for(const entry of matches){
   const card=document.createElement('article');card.className='knowledge-card asbab-card';
   const ayahs=Array.isArray(entry.ayahs)?entry.ayahs:[entry.ayah||entry.ayah_number].filter(Boolean);
   const occasions=Array.isArray(entry.occasions)?entry.occasions:(entry.occasions?[entry.occasions]:(entry.occasion?[entry.occasion]:[]));
   const refs=document.createElement('h3');refs.textContent='আয়াত '+ayahs.map(bn).join('–');card.appendChild(refs);
   ayahs.forEach(ayahNo=>{const number=Number(ayahNo),verse=document.createElement('section');verse.className='quran-ayah';const ref=document.createElement('div');ref.className='ayah-ref';ref.textContent='সূরা '+bn(surahNo)+' · আয়াত '+bn(number);const arabicText=arAyahs.get(number)||'';const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.dir='rtl';ar.textContent=arabicText;verse.append(ref,ar);appendPronunciation(verse,arabicText);const translation=document.createElement('div');translation.className='translation';translation.textContent=bnAyahs.get(number)||'এই আয়াতের বাংলা অনুবাদ পাওয়া যায়নি।';verse.appendChild(translation);card.appendChild(verse)});
   if(!occasions.length){const missing=document.createElement('p');missing.className='islamic-status';missing.textContent='এই নথিতে শানে নুযুলের বর্ণনামূলক পাঠ সংযুক্ত নেই।';card.appendChild(missing)}
   for(let index=0;index<occasions.length;index++){
    const occasion=String(occasions[index]||'').trim();if(!occasion)continue;
    const label=document.createElement('h4');label.textContent=(occasions.length>1?'শানে নুযুলের পূর্ণ বর্ণনা '+bn(index+1):'শানে নুযুলের পূর্ণ বর্ণনা');card.appendChild(label);
    const textEl=document.createElement('p');textEl.className='asbab-arabic';textEl.lang='ar';textEl.dir='rtl';textEl.textContent=occasion;textEl.style.cssText='white-space:pre-wrap;direction:rtl;text-align:right;font-family:"Noto Naskh Arabic","Amiri",serif;font-size:20px;line-height:2.1;margin:8px 0';card.appendChild(textEl);appendPronunciation(card,occasion);
    const translatedLabel=document.createElement('strong');translatedLabel.textContent='পূর্ণ বাংলা অনুবাদ (স্বয়ংক্রিয়; যাচাইসাপেক্ষ)';card.appendChild(translatedLabel);
    const translated=document.createElement('p');translated.className='asbab-translation';translated.style.cssText='white-space:pre-wrap;line-height:1.95;margin:7px 0 16px';translated.textContent='বাংলা অনুবাদ তৈরি হচ্ছে…';card.appendChild(translated);
    try{translated.textContent=await translateArabicToBangla(occasion)||'এই বর্ণনার বাংলা অনুবাদ পাওয়া যায়নি।'}catch(_){translated.textContent='এই মুহূর্তে স্বয়ংক্রিয় বাংলা অনুবাদ পাওয়া যায়নি। মূল আরবি ও আনুমানিক বাংলা উচ্চারণ উপরে দেওয়া আছে।'}
   }
   const source=document.createElement('small');source.textContent='তথ্যসূত্র: صحيح أسباب النزول دراسة حديثية — ইবরাহিম মুহাম্মদ আল-আলি। সংকলিত আরবি পাঠ; বাংলা অনুবাদ স্বয়ংক্রিয় এবং মূল গ্রন্থের বিকল্প নয়।';card.appendChild(source);root.appendChild(card);
  }
  $('islamicContent').replaceChildren(root);
 }catch(e){status('আয়াতভিত্তিক শানে নুযুল আনা যায়নি: '+e.message)}
}
async function renderTafsir(){
 status('তাফসিরের সূরা ও আয়াতের তালিকা লোড হচ্ছে…');
 try{
  const list=await getSurahs();
  $('islamicToolbar').replaceChildren();
  const picker=select('সূরা নির্বাচন করুন','tafsirSurah',[{value:'0',label:'সূরা নির্বাচন করুন'},...list.map(x=>({value:String(x.number),label:'সূরা '+bn(x.number)+' — '+x.name}))]);
  const edition=select('তাফসিরের গ্রন্থ','tafsirEdition',tafsirEditions.map(x=>({value:x.id,label:x.name})));
  const ayah=select('আয়াত নির্বাচন করুন','tafsirAyah',[{value:'0',label:'আগে সূরা নির্বাচন করুন'}]);
  const load=()=>loadTafsirSurah(Number(picker.value),edition.value,ayah,list);
  picker.addEventListener('change',load);
  edition.addEventListener('change',load);
  ayah.addEventListener('change',()=>showTafsirAyah(Number(picker.value),edition.value,Number(ayah.value),list));
  const note=document.createElement('div');note.className='islamic-note';
  note.textContent='সূরা ও আয়াত নির্বাচন করে বাংলা তাফসির পড়ুন। তাফসিরের পাঠ নির্দিষ্ট গ্রন্থ থেকে নেওয়া; কোনো আয়াতের ব্যাখ্যা ওই উৎসে না থাকলে তা স্পষ্টভাবে জানানো হবে।';
  $('islamicContent').replaceChildren(note);
 }catch(e){status('তাফসিরের তালিকা লোড করা যায়নি: '+e.message)}
}
let activeTafsirRows=[];
let activeTafsirSurah=0;
let activeTafsirList=[];
async function loadTafsirSurah(surahNo,editionId,ayahSelect,list){
 if(!surahNo){status('তাফসির দেখতে একটি সূরা নির্বাচন করুন।');return}
 status('সূরা '+bn(surahNo)+'-এর আয়াতভিত্তিক তাফসির আনা হচ্ছে…');
 try{
  const edition=tafsirEditions.find(x=>x.id===editionId);
  const [tafsirData,arData,bnData]=await Promise.all([
   json(tafsirApi+'/'+editionId+'/'+surahNo+'.json'),
   json(quranApi+'/surah/'+surahNo+'/quran-uthmani'),
   json(quranApi+'/surah/'+surahNo+'/bn.bengali')
  ]);
  activeTafsirRows=(tafsirData.ayahs||[]).filter(x=>Number(x.surah)===surahNo&&x.text);
  activeTafsirSurah=surahNo;activeTafsirList=list;
  window.__tafsirVerses={ar:new Map((arData.data?.ayahs||[]).map(x=>[x.numberInSurah,x.text])),bn:new Map((bnData.data?.ayahs||[]).map(x=>[x.numberInSurah,x.text]))};
  ayahSelect.replaceChildren();
  activeTafsirRows.forEach(row=>{const opt=document.createElement('option');opt.value=String(row.ayah);opt.textContent='আয়াত '+bn(row.ayah);ayahSelect.appendChild(opt)});
  if(!activeTafsirRows.length){
   const empty=document.createElement('p');empty.className='islamic-status';empty.textContent='এই সূরার জন্য নির্বাচিত তাফসির গ্রন্থে কোনো আয়াতের ব্যাখ্যা পাওয়া যায়নি।';
   $('islamicContent').replaceChildren(empty);return;
  }
  ayahSelect.value=String(activeTafsirRows[0].ayah);
  showTafsirAyah(surahNo,editionId,Number(ayahSelect.value),list);
 }catch(e){status('আয়াতভিত্তিক তাফসির আনা যায়নি: '+e.message+'. পরে আবার চেষ্টা করুন।')}
}
function showTafsirAyah(surahNo,editionId,ayahNo,list){
 const row=activeTafsirRows.find(x=>Number(x.ayah)===ayahNo);
 if(!row){status('এই আয়াতের তাফসির নির্বাচিত উৎসে পাওয়া যায়নি।');return}
 const surah=list.find(x=>x.number===surahNo),edition=tafsirEditions.find(x=>x.id===editionId);
 const verses=window.__tafsirVerses||{ar:new Map(),bn:new Map()};
 const root=document.createElement('article');root.className='knowledge-card tafsir-card';
 const heading=document.createElement('h3');heading.textContent='সূরা '+bn(surahNo)+' — '+(surah?.name||'')+' · আয়াত '+bn(ayahNo);root.appendChild(heading);
 const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.dir='rtl';ar.textContent=verses.ar.get(ayahNo)||'';
 root.appendChild(ar);appendPronunciation(root,ar.textContent);
 const translation=document.createElement('p');translation.className='translation';translation.textContent=verses.bn.get(ayahNo)||'বাংলা আয়াতের অনুবাদ পাওয়া যায়নি।';
 root.appendChild(translation);
 const title=document.createElement('h4');title.textContent=edition?.name+' — আয়াতভিত্তিক তাফসির';root.appendChild(title);
 const tafsir=document.createElement('div');tafsir.className='tafsir-text';tafsir.style.whiteSpace='pre-wrap';tafsir.style.lineHeight='1.95';tafsir.textContent=row.text;root.appendChild(tafsir);
 const source=document.createElement('small');source.textContent='গ্রন্থ: '+edition?.name+' · লেখক: '+edition?.author+' · ডেটা: Tafsir API / Quran.com collection';root.appendChild(source);
 $('islamicContent').replaceChildren(root);
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
  const metaResponse=await json(hadithCdn+'/'+book.path+'/Meta/'+encodeURIComponent(book.meta)+'.json');
  const meta=metaResponse.data||metaResponse.meta||metaResponse;
  const entries=Object.entries(meta||{}).filter(([,v])=>v&&typeof v==='object').sort((a,b)=>Number(a[0])-Number(b[0]));
  if(!entries.length)throw new Error('গ্রন্থের অধ্যায়-তথ্য ফাঁকা এসেছে');
  const root=document.createElement('div');const note=document.createElement('div');note.className='islamic-note';note.textContent=book.name+' · অধ্যায় নির্বাচন করুন। হাদীসের আরবি ও বাংলা পাঠ, বর্ণনাকারী ও নম্বর উৎস ডেটাসেট অনুযায়ী দেখানো হবে। ডেটা উৎস: Kafela Network Hadith API; আরবি ও বাংলা পাঠ।';root.appendChild(note);
  const grid=document.createElement('div');grid.className='islamic-list';
  entries.forEach(([num,item])=>{
   const b=document.createElement('button');b.type='button';b.textContent=bn(num)+'. '+(item.title||'অধ্যায়')+(item.hadis_range?' · হাদীস '+item.hadis_range:'');
   b.addEventListener('click',()=>loadHadithChapter(book,num,item.title||''));grid.appendChild(b);
  });
  root.appendChild(grid);$('islamicContent').replaceChildren(root);
 }catch(e){status('অধ্যায়ের তালিকা লোড করা যায়নি: '+e.message+'. সংযোগ পরীক্ষা করে আবার চেষ্টা করুন। তথ্যসূত্র: Kafela Network Hadith API.')}
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
   const meta=document.createElement('div');meta.className='meta';meta.textContent='হাদীস নং '+bn(record.hadithNo||record.hadith_number||record.hadith_id||record.number||'—')+((record.rabiNameBn||record.narrator)?' · বর্ণনাকারী: '+(record.rabiNameBn||record.narrator):'')+(record.topicName?' · '+record.topicName:'');
   card.appendChild(meta);
   const arText=record.hadithArabic||record.ar||record.arabic||'';
   if(arText){const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.textContent=arText;card.appendChild(ar);appendPronunciation(card,arText)}
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
 topics.forEach((t,i)=>{const card=document.createElement('article');card.className='knowledge-card';const h=document.createElement('h3');h.textContent=t[0];const p=document.createElement('p');p.textContent=t[1];card.append(h,p);if(rows[i].ar){const ar=document.createElement('div');ar.className='arabic';ar.lang='ar';ar.textContent=rows[i].ar;card.appendChild(ar);appendPronunciation(card,rows[i].ar)}if(rows[i].bn){const tr=document.createElement('p');tr.className='translation';tr.textContent=rows[i].bn;card.appendChild(tr)}const small=document.createElement('small');small.textContent='কুরআনের সূত্র: '+t[2]+' · ';const a=document.createElement('a');a.href='https://quran.com/bn/'+t[3];a.target='_blank';a.rel='noopener noreferrer';a.textContent='বাংলা ব্যাখ্যাসহ আয়াত পড়ুন ↗';small.appendChild(a);card.appendChild(small);grid.appendChild(card)});
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
