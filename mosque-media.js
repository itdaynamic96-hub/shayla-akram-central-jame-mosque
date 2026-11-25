import{configured,supabase,currentProfile,showError}from'./supabase-client.js';
const fallback='./assets/mosque-hero.webp';
const allowedRoles=['super_admin','admin'];
const byId=id=>document.getElementById(id);
const imageExt={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const surfaces=[
 {key:'mosque_homepage',label:'হোমপেজ',attr:'homepage',form:'mosqueHomepageMediaForm',input:'mosqueHomepageMediaFile',error:'mosqueHomepageMediaError',status:'mosqueHomepageMediaStatus',remove:'mosqueHomepageMediaRemove'},
 {key:'mosque_accounts',label:'Accounts',attr:'accounts',form:'mosqueAccountsMediaForm',input:'mosqueAccountsMediaFile',error:'mosqueAccountsMediaError',status:'mosqueAccountsMediaStatus',remove:'mosqueAccountsMediaRemove'},
 {key:'mosque_admin',label:'Admin Panel',attr:'admin',form:'mosqueAdminMediaForm',input:'mosqueAdminMediaFile',error:'mosqueAdminMediaError',status:'mosqueAdminMediaStatus',remove:'mosqueAdminMediaRemove'}
];
let settings={mosque_homepage:null,mosque_accounts:null,mosque_admin:null,mosque_360_panorama:null};
const applySurface=(surface,url)=>{
 const next=url||fallback;
 document.querySelectorAll('[data-mosque-image="'+surface+'"]').forEach(img=>{
  if(img.dataset.mosqueAppliedSrc===next)return;
  img.dataset.mosqueAppliedSrc=next;
  img.onerror=()=>{if(img.dataset.mosqueAppliedSrc!==fallback){img.dataset.mosqueAppliedSrc=fallback;img.src=fallback}};
  img.src=next;
 });
};
const ensureDashboardImages=()=>{
 const adminHead=document.querySelector('#adminWorkspace .dash-head');
 const adminIntro=adminHead?.firstElementChild;
 if(adminHead&&adminIntro&&!adminHead.querySelector('[data-mosque-image="admin"]')){
  const wrap=document.createElement('div');wrap.className='dash-brandline';
  wrap.style.cssText='display:flex;align-items:center;gap:15px;min-width:0';
  const img=document.createElement('img');img.dataset.mosqueImage='admin';img.src=fallback;img.alt='মসজিদের ছবি';
  img.style.cssText='display:block;width:118px;height:84px;flex:0 0 auto;object-fit:cover;border:1px solid #b8944e;border-radius:12px';
  wrap.append(img,adminIntro);adminHead.prepend(wrap);
 }
 const accountsHead=document.querySelector('#accountsDashboard .main>.top');
 const accountsIntro=accountsHead?.firstElementChild;
 if(accountsHead&&accountsIntro&&!accountsHead.querySelector('[data-mosque-image="accounts"]')){
  const img=document.createElement('img');img.dataset.mosqueImage='accounts';img.src=fallback;img.alt='মসজিদের ছবি';
  img.style.cssText='display:block;width:104px;height:76px;flex:0 0 auto;object-fit:cover;border:1px solid #d8c795;border-radius:11px;margin-inline-end:12px';
  accountsIntro.style.cssText+=';display:flex;align-items:center;gap:10px;min-width:0';
  accountsIntro.prepend(img);
 }
};
const applyNewImages=node=>{
 if(!(node instanceof Element))return;
 ensureDashboardImages();
 for(const surface of surfaces){
  const selector='[data-mosque-image="'+surface.attr+'"]';
  if(node.matches(selector)||node.querySelector(selector)||node===document.documentElement)applySurface(surface.attr,settings[surface.key]?.public_url||fallback);
 }
};
const imageObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(applyNewImages)));
imageObserver.observe(document.documentElement,{childList:true,subtree:true});
const readability=document.createElement('style');readability.id='admin-readable-type';
readability.textContent=`#adminWorkspace{font-size:16px;color:#20372b;line-height:1.75}
#adminWorkspace p,#adminWorkspace li,#adminWorkspace label,#adminWorkspace .notice,#adminWorkspace .muted{color:#344b3c!important;font-size:15px!important;line-height:1.75}
#adminWorkspace h2{font-size:28px!important;color:#164a34!important}
#adminWorkspace h3{font-size:22px!important;color:#174b34!important}
#adminWorkspace h4{font-size:18px!important;color:#24563d!important}
#adminWorkspace th,#adminWorkspace td{font-size:15px!important;color:#263b30!important;padding:11px 10px!important}
#adminWorkspace input,#adminWorkspace select,#adminWorkspace textarea{font-size:16px!important;color:#172f23!important;background:#fff!important;border:1px solid #9aab9d!important}
#adminWorkspace input::placeholder,#adminWorkspace textarea::placeholder{color:#65776a!important;opacity:1}
#adminWorkspace button{font-size:15px!important;color:#fff!important;background:#176344!important;border-color:#176344!important}
#adminWorkspace .dash-eyebrow{font-size:12px!important;color:#785a1d!important}
#adminWorkspace .dash-date{font-size:14px!important;color:#53665a!important}
#adminWorkspace .dash-label,#adminWorkspace .dash-metric small,#adminWorkspace .dash-shortcuts>a small{font-size:13px!important;color:#53665a!important}
#adminWorkspace .dash-shortcuts>a span{font-size:15px!important}
#adminWorkspace .dash-empty,#adminWorkspace .dash-list-item small{font-size:14px!important;color:#53665a!important}
#adminSidebar a{font-size:14px;color:#e0ebe3}
#adminSidebar summary{font-size:15px;color:#fff0c6}
@media(max-width:520px){#adminWorkspace .dash-brandline img{width:84px!important;height:68px!important}#adminWorkspace .dash-head h2{font-size:23px!important}}`;
document.head.append(readability);
ensureDashboardImages();
function applyPanoramaPreview(setting){const preview=byId('mosquePanoramaPreview'),empty=byId('mosquePanoramaEmpty'),remove=byId('mosquePanoramaRemove'),start=byId('mosque360Start');if(preview){preview.hidden=!setting?.public_url;if(setting?.public_url)preview.src=setting.public_url}if(empty)empty.hidden=!!setting?.public_url;if(remove)remove.hidden=!setting?.storage_path;if(start){start.disabled=!setting?.public_url;start.textContent=setting?.public_url?'৩৬০° ভ্রমণ শুরু করুন':'৩৬০° ছবি যুক্ত হলে চালু হবে'}}
async function getSettings(){if(!configured||!supabase){surfaces.forEach(s=>applySurface(s.attr,fallback));return}const{data,error}=await supabase.from('site_media_settings').select('setting_key,public_url,storage_path').in('setting_key',[...surfaces.map(s=>s.key),'mosque_360_panorama']);if(error){console.warn('মিডিয়া সেটিং লোড হয়নি:',error);return}for(const s of surfaces){settings[s.key]=(data||[]).find(x=>x.setting_key===s.key)||null;applySurface(s.attr,settings[s.key]?.public_url||fallback)}settings.mosque_360_panorama=(data||[]).find(x=>x.setting_key==='mosque_360_panorama')||null;applyPanoramaPreview(settings.mosque_360_panorama)}
async function uploadSetting({file,user,key,label,errorBox,statusBox,input,ratioRequired=false,maxBytes=10*1024*1024}){let path=null;try{if(!file)throw new Error('প্রথমে একটি ছবি নির্বাচন করুন।');const ext=imageExt[file.type];if(!ext)throw new Error('শুধু JPG, PNG বা WebP ছবি গ্রহণযোগ্য।');if(file.size>maxBytes)throw new Error('নির্ধারিত সর্বোচ্চ ফাইল সাইজ অতিক্রম করেছে।');if(ratioRequired){const bitmap=await createImageBitmap(file),ratio=bitmap.width/bitmap.height;bitmap.close?.();if(ratio<1.8||ratio>2.2)throw new Error('৩৬০° প্যানোরামার ছবির অনুপাত প্রায় ২:১ হতে হবে।')}path='mosque-brand/'+user.id+'/'+key+'-'+crypto.randomUUID()+'.'+ext;const{error:uploadError}=await supabase.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:key,public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});if(saveError)throw saveError;const old=settings[key];settings[key]={setting_key:key,public_url:publicUrl,storage_path:path};if(old?.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('পুরোনো ছবি অপসারণ করা যায়নি:',removeError)}if(key==='mosque_360_panorama')applyPanoramaPreview(settings[key]);else{const surface=surfaces.find(s=>s.key===key);if(surface)applySurface(surface.attr,publicUrl)}if(input)input.value='';statusBox.textContent=label+'-এর ছবি সফলভাবে সংরক্ষণ হয়েছে। অন্য জায়গার ছবি অপরিবর্তিত আছে।'}catch(error){if(path)await supabase.storage.from('site-media').remove([path]).catch(()=>{});showError(errorBox,error);statusBox.textContent='ছবি সংরক্ষণ করা যায়নি।'}}
async function removeSetting({key,label,errorBox,statusBox}){const old=settings[key];if(!old)return; if(!confirm(label+'-এর ছবি অপসারণ করবেন?'))return;errorBox.hidden=true;statusBox.textContent='ছবি অপসারণ হচ্ছে…';const{error}=await supabase.from('site_media_settings').delete().eq('setting_key',key);if(error){showError(errorBox,error);statusBox.textContent='ছবি অপসারণ করা যায়নি।';return}if(old.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('Storage file অপসারণ হয়নি:',removeError)}settings[key]=null;const surface=surfaces.find(s=>s.key===key);if(surface)applySurface(surface.attr,fallback);if(key==='mosque_360_panorama')applyPanoramaPreview(null);statusBox.textContent=label+'-এর ছবি অপসারণ হয়েছে; ডিফল্ট ছবি দেখানো হচ্ছে।'}
async function initManager(){const panel=byId('mosqueMediaAdmin');if(!panel||!configured)return;try{const{user,profile}=await currentProfile();if(!user||!allowedRoles.includes(profile?.role))return;for(const s of surfaces){const form=byId(s.form),input=byId(s.input),error=byId(s.error),status=byId(s.status);form?.addEventListener('submit',async e=>{e.preventDefault();error.hidden=true;status.textContent=s.label+'-এর ছবি আপলোড হচ্ছে…';await uploadSetting({file:input.files?.[0],user,key:s.key,label:s.label,errorBox:error,statusBox:status,input})});byId(s.remove)?.addEventListener('click',()=>removeSetting({key:s.key,label:s.label,errorBox:error,statusBox:status}))}const form=byId('mosquePanoramaForm'),input=byId('mosquePanoramaFile'),error=byId('mosquePanoramaError'),status=byId('mosquePanoramaStatus');form?.addEventListener('submit',async e=>{e.preventDefault();error.hidden=true;status.textContent='৩৬০° প্যানোরামা আপলোড হচ্ছে…';await uploadSetting({file:input.files?.[0],user,key:'mosque_360_panorama',label:'৩৬০° প্যানোরামা',errorBox:error,statusBox:status,input,maxBytes:50*1024*1024,ratioRequired:true})});byId('mosquePanoramaRemove')?.addEventListener('click',()=>removeSetting({key:'mosque_360_panorama',label:'৩৬০° প্যানোরামা',errorBox:error,statusBox:status}))}catch(error){console.warn('মিডিয়া ব্যবস্থাপনা চালু হয়নি:',error)}}
async function startTour(){const setting=settings.mosque_360_panorama;if(!setting?.public_url)return;const start=byId('mosque360Start'),stage=byId('mosque360Stage'),placeholder=byId('mosque360Placeholder'),status=byId('mosque360Status'),shell=byId('mosque360Viewer');if(start){start.disabled=true;start.textContent='ভিউয়ার প্রস্তুত হচ্ছে…'}try{let pannellum=window.pannellum;if(!pannellum){await new Promise((resolve,reject)=>{if(!document.querySelector('link[data-pannellum-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';link.dataset.pannellumCss='1';document.head.append(link)}let script=document.querySelector('script[data-pannellum-js]');if(!script){script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';script.dataset.pannellumJs='1';document.head.append(script)}script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('৩৬০° ভিউয়ার ডাউনলোড করা যায়নি।')),{once:true})});pannellum=window.pannellum}if(!pannellum)throw new Error('৩৬০° ভিউয়ার লোড হয়নি।');stage.hidden=false;placeholder.hidden=true;status.hidden=true;pannellum.viewer('mosque360Stage',{type:'equirectangular',panorama:setting.public_url,autoLoad:true,showControls:true,showZoomCtrl:true,compass:false,hfov:100,minHfov:50,maxHfov:120,mouseZoom:true,keyboardZoom:true,draggable:true,orientationOnByDefault:false});shell.classList.add('tour-ready')}catch(error){stage.hidden=true;placeholder.hidden=false;status.hidden=false;status.textContent=error.message||'৩৬০° ভ্রমণ চালু করা যায়নি।';if(start){start.disabled=false;start.textContent='আবার চেষ্টা করুন'}}}
byId('mosque360Start')?.addEventListener('click',startTour);
await getSettings();
await initManager();
