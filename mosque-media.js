import{configured,supabase,currentProfile,showError}from'./supabase-client.js';
const fallback='./assets/mosque-hero.webp';
const allowedRoles=['super_admin','admin','website_admin'];
const byId=id=>document.getElementById(id);
const imageExt={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const surfaces=[
 {key:'mosque_homepage',label:'হোমপেজ',attr:'homepage',form:'mosqueHomepageMediaForm',input:'mosqueHomepageMediaFile',error:'mosqueHomepageMediaError',status:'mosqueHomepageMediaStatus',remove:'mosqueHomepageMediaRemove'},
 {key:'mosque_accounts',label:'Accounts',attr:'accounts',form:'mosqueAccountsMediaForm',input:'mosqueAccountsMediaFile',error:'mosqueAccountsMediaError',status:'mosqueAccountsMediaStatus',remove:'mosqueAccountsMediaRemove'},
 {key:'mosque_admin',label:'Admin Panel',attr:'admin',form:'mosqueAdminMediaForm',input:'mosqueAdminMediaFile',error:'mosqueAdminMediaError',status:'mosqueAdminMediaStatus',remove:'mosqueAdminMediaRemove'}
];
let settings={mosque_homepage:null,mosque_accounts:null,mosque_admin:null,mosque_360_panorama:null,mosque_360_spherical_image:null,mosque_360_video:null,mosque_360_video_muted:null};
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
function applySphericalImagePreview(setting){const preview=byId('mosqueSphericalImagePreview'),empty=byId('mosqueSphericalImageEmpty'),remove=byId('mosqueSphericalImageRemove'),start=byId('mosque360Start');if(preview){preview.hidden=!setting?.public_url;if(setting?.public_url)preview.src=setting.public_url}if(empty)empty.hidden=!!setting?.public_url;if(remove)remove.hidden=!setting?.storage_path;if(start){const available=!!(setting?.public_url||settings.mosque_360_panorama?.public_url);start.disabled=!available;start.textContent=available?'৩৬০° ভ্রমণ শুরু করুন':'৩৬০° ছবি যুক্ত হলে চালু হবে'}}
function applyPanoramaPreview(setting){const preview=byId('mosquePanoramaPreview'),empty=byId('mosquePanoramaEmpty'),remove=byId('mosquePanoramaRemove'),start=byId('mosque360Start');if(preview){preview.hidden=!setting?.public_url;if(setting?.public_url)preview.src=setting.public_url}if(empty)empty.hidden=!!setting?.public_url;if(remove)remove.hidden=!setting?.storage_path;if(start){const available=!!(setting?.public_url||settings.mosque_360_spherical_image?.public_url);start.disabled=!available;start.textContent=available?'৩৬০° ভ্রমণ শুরু করুন':'৩৬০° ছবি যুক্ত হলে চালু হবে'}}
function applyTourVideo(setting){
 const url=setting?.public_url||'',muted=settings.mosque_360_video_muted?.public_url!=='false';
 const shell=byId('mosque360Viewer'),wrap=byId('mosque360VideoWrap');
 const placeholder=byId('mosque360Placeholder'),stage=byId('mosque360Stage');
 for(const video of document.querySelectorAll('[data-mosque-360-video],[data-mosque-360-video-preview]')){
  // Apply mute BEFORE changing/loading the source so the first decoded audio frame is silent.
  video.dataset.forceMute=muted?'true':'false';
  video.muted=muted;video.defaultMuted=muted;
  if(muted)video.volume=0;
  else if(video.volume===0)video.volume=1;
  if(!video.dataset.muteGuardBound){
   video.dataset.muteGuardBound='true';
   const enforceMute=()=>{if(video.dataset.forceMute==='true'){if(!video.muted)video.muted=true;if(video.volume!==0)video.volume=0}};
   video.addEventListener('play',enforceMute);
   video.addEventListener('volumechange',enforceMute);
   video.addEventListener('loadedmetadata',enforceMute);
  }
  if(video.dataset.appliedVideoUrl!==url){
   video.pause?.();video.dataset.appliedVideoUrl=url;
   if(url){video.src=url;video.load?.()}
   else{video.removeAttribute('src');video.load?.()}
  }
  video.controls=true;video.playsInline=true;
 }
 if(shell)shell.classList.toggle('video-ready',!!url);
 if(wrap)wrap.hidden=!url;
 const preview=byId('mosque360VideoPreview'),empty=byId('mosque360VideoEmpty'),remove=byId('mosque360VideoRemove'),toggle=byId('mosque360VideoMuted');
 if(preview)preview.hidden=!url;
 if(empty)empty.hidden=!!url;
 if(remove)remove.hidden=!setting?.storage_path;
 if(toggle){toggle.checked=muted;toggle.disabled=!url}
 if(url){if(placeholder)placeholder.hidden=true;if(stage)stage.hidden=true}
 else{
  const panoramaActive=!!(shell?.classList.contains('tour-ready')&&(settings.mosque_360_spherical_image?.public_url||settings.mosque_360_panorama?.public_url));
  if(stage)stage.hidden=!panoramaActive;
  if(placeholder)placeholder.hidden=panoramaActive;
 }
}
async function getSettings(){if(!configured||!supabase){surfaces.forEach(s=>applySurface(s.attr,fallback));return}const{data,error}=await supabase.from('site_media_settings').select('setting_key,public_url,storage_path').in('setting_key',[...surfaces.map(s=>s.key),'mosque_main','mosque_360_panorama','mosque_360_spherical_image','mosque_360_video','mosque_360_video_muted']);if(error){console.warn('মিডিয়া সেটিং লোড হয়নি:',error);surfaces.forEach(s=>applySurface(s.attr,fallback));return}const main=(data||[]).find(x=>x.setting_key==='mosque_main')||null;for(const s of surfaces){settings[s.key]=(data||[]).find(x=>x.setting_key===s.key)||main;applySurface(s.attr,settings[s.key]?.public_url||fallback)}settings.mosque_360_panorama=(data||[]).find(x=>x.setting_key==='mosque_360_panorama')||null;settings.mosque_360_spherical_image=(data||[]).find(x=>x.setting_key==='mosque_360_spherical_image')||null;applySphericalImagePreview(settings.mosque_360_spherical_image);settings.mosque_360_video=(data||[]).find(x=>x.setting_key==='mosque_360_video')||null;settings.mosque_360_video_muted=(data||[]).find(x=>x.setting_key==='mosque_360_video_muted')||null;applyPanoramaPreview(settings.mosque_360_panorama);applyTourVideo(settings.mosque_360_video)}
async function uploadSetting({file,user,key,label,errorBox,statusBox,input,ratioRequired=false,maxBytes=10*1024*1024}){let path=null;try{if(!file)throw new Error('প্রথমে একটি ছবি নির্বাচন করুন।');const ext=imageExt[file.type];if(!ext)throw new Error('শুধু JPG, PNG বা WebP ছবি গ্রহণযোগ্য।');if(file.size>maxBytes)throw new Error('নির্ধারিত সর্বোচ্চ ফাইল সাইজ অতিক্রম করেছে।');if(ratioRequired){const bitmap=await createImageBitmap(file),ratio=bitmap.width/bitmap.height;bitmap.close?.();if(ratio<1.8||ratio>2.2)throw new Error('৩৬০° প্যানোরামার ছবির অনুপাত প্রায় ২:১ হতে হবে।')}path='mosque-brand/'+user.id+'/'+key+'-'+crypto.randomUUID()+'.'+ext;const{error:uploadError}=await supabase.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(uploadError)throw uploadError;const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:key,public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});if(saveError)throw saveError;const old=settings[key];settings[key]={setting_key:key,public_url:publicUrl,storage_path:path};if(old?.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('পুরোনো ছবি অপসারণ করা যায়নি:',removeError)}if(key==='mosque_360_panorama'){const oldVideo=settings.mosque_360_video;if(oldVideo){const{error:clearVideoError}=await supabase.from('site_media_settings').delete().eq('setting_key','mosque_360_video');if(clearVideoError)throw clearVideoError;settings.mosque_360_video=null;applyTourVideo(null);if(oldVideo.storage_path){const{error:videoRemoveError}=await supabase.storage.from('site-media').remove([oldVideo.storage_path]);if(videoRemoveError)console.warn('পুরোনো ভিডিও অপসারণ করা যায়নি:',videoRemoveError)}}applyPanoramaPreview(settings[key])}else{const surface=surfaces.find(s=>s.key===key);if(surface)applySurface(surface.attr,publicUrl)}if(input)input.value='';statusBox.textContent=label+'-এর ছবি সফলভাবে সংরক্ষণ হয়েছে। অন্য জায়গার ছবি অপরিবর্তিত আছে।'}catch(error){if(path)await supabase.storage.from('site-media').remove([path]).catch(()=>{});showError(errorBox,error);statusBox.textContent='ছবি সংরক্ষণ করা যায়নি।'}}
async function uploadSphericalImage({file,user,errorBox,statusBox,input}){
 let path=null;
 try{
  if(!file)throw new Error('প্রথমে একটি ছবি নির্বাচন করুন।');
  if(!imageExt[file.type])throw new Error('শুধু JPG, PNG বা WebP ছবি গ্রহণযোগ্য।');
  if(file.size===0||file.size>10*1024*1024)throw new Error('ছবির সর্বোচ্চ সাইজ ১০ MB।');
  statusBox.textContent='ছবিকে ৩৬০° ভিউয়ের উপযোগী করা হচ্ছে…';
  const bitmap=await createImageBitmap(file);
  const width=Math.min(4096,Math.max(2048,bitmap.width));
  const height=Math.round(width/2);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('ছবি রূপান্তর করা যায়নি।');
  // A regular photo is mapped across the full 360° x 180° sphere; this can stretch its original proportions.
  ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('৩৬০° ছবি তৈরি করা যায়নি।')),'image/jpeg',0.9));
  if(blob.size>50*1024*1024)throw new Error('রূপান্তরিত ছবির সাইজ ৫০ MB ছাড়িয়েছে।');
  path='mosque-brand/'+user.id+'/mosque_360_spherical_image-'+crypto.randomUUID()+'.jpg';
  const{error:uploadError}=await supabase.storage.from('site-media').upload(path,blob,{cacheControl:'3600',upsert:false,contentType:'image/jpeg'});
  if(uploadError)throw uploadError;
  const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:'mosque_360_spherical_image',public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
  if(saveError)throw saveError;
  const old=settings.mosque_360_spherical_image,oldVideo=settings.mosque_360_video;
  settings.mosque_360_spherical_image={setting_key:'mosque_360_spherical_image',public_url:publicUrl,storage_path:path};
  if(oldVideo){
   const{error:clearVideoError}=await supabase.from('site_media_settings').delete().eq('setting_key','mosque_360_video');
   if(clearVideoError)throw clearVideoError;
   settings.mosque_360_video=null;applyTourVideo(null);
   if(oldVideo.storage_path)await supabase.storage.from('site-media').remove([oldVideo.storage_path]);
  }
  if(old?.storage_path)await supabase.storage.from('site-media').remove([old.storage_path]);
  applySphericalImagePreview(settings.mosque_360_spherical_image);
  if(input)input.value='';
  statusBox.textContent='ছবি সফলভাবে ৩৬০° গোলাকার ভিউয়ের জন্য সংরক্ষণ হয়েছে। হোমপেজে এটি প্রদর্শিত হবে।';
 }catch(error){if(path)await supabase.storage.from('site-media').remove([path]).catch(()=>{});showError(errorBox,error);statusBox.textContent='৩৬০° গোলাকার ছবি সংরক্ষণ করা যায়নি।'}
}
async function removeSetting({key,label,errorBox,statusBox}){const old=settings[key];if(!old)return; if(!confirm(label+'-এর ছবি অপসারণ করবেন?'))return;errorBox.hidden=true;statusBox.textContent='ছবি অপসারণ হচ্ছে…';const{error}=await supabase.from('site_media_settings').delete().eq('setting_key',key);if(error){showError(errorBox,error);statusBox.textContent='ছবি অপসারণ করা যায়নি।';return}if(old.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('Storage file অপসারণ হয়নি:',removeError)}settings[key]=null;const surface=surfaces.find(s=>s.key===key);if(surface)applySurface(surface.attr,fallback);if(key==='mosque_360_spherical_image'){applySphericalImagePreview(null);if(settings.mosque_360_panorama?.public_url)applyPanoramaPreview(settings.mosque_360_panorama)}if(key==='mosque_360_panorama'){applyPanoramaPreview(null);const stage=byId('mosque360Stage'),shell=byId('mosque360Viewer'),placeholder=byId('mosque360Placeholder');if(stage)stage.hidden=true;if(shell)shell.classList.remove('tour-ready');if(placeholder)placeholder.hidden=false}if(key==='mosque_360_video'){applyTourVideo(null);if(settings.mosque_360_spherical_image?.public_url||settings.mosque_360_panorama?.public_url)await startTour()}statusBox.textContent=label+' অপসারণ হয়েছে।'}
async function uploadTourVideo({file,user,errorBox,statusBox,input}){
 let path=null;
 try{
  if(!file)throw new Error('প্রথমে একটি ভিডিও নির্বাচন করুন।');
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const supportedVideoExtensions=new Set(['mp4','m4v','mov','webm','ogv','ogg','mkv','avi','wmv','flv','3gp','3g2','mpeg','mpg','mpe','m1v','m2v','ts','mts','m2ts','vob','asf','divx','f4v','rm','rmvb','mxf']);
  const hasVideoMime=typeof file.type==='string'&&file.type.toLowerCase().startsWith('video/');
  if(!hasVideoMime&&!supportedVideoExtensions.has(ext))throw new Error('এটি ভিডিও ফাইল হিসেবে শনাক্ত হয়নি। MP4, MOV, M4V, WebM, MKV, AVI, WMV, FLV, 3GP, MPEG, TS, VOBসহ প্রচলিত ভিডিও ফরম্যাট দিন।');
  if(file.size===0||file.size>50*1024*1024)throw new Error('Free প্ল্যানের সীমা অনুযায়ী ভিডিওর সাইজ ১ বাইট থেকে সর্বোচ্চ ৫০ MB হতে হবে।');
  const contentType=hasVideoMime?file.type:'application/octet-stream';
  const safeExt=/^[a-z0-9]{1,10}$/.test(ext)?ext:'video';
  path='mosque-brand/'+user.id+'/mosque_360_video-'+crypto.randomUUID()+'.'+safeExt;
  const{error:uploadError}=await supabase.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType});
  if(uploadError)throw uploadError;
  const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:'mosque_360_video',public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
  if(saveError)throw saveError;
  const old=settings.mosque_360_video;settings.mosque_360_video={setting_key:'mosque_360_video',public_url:publicUrl,storage_path:path};
  if(old?.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('পুরোনো ভিডিও অপসারণ করা যায়নি:',removeError)}
  applyTourVideo(settings.mosque_360_video);if(input)input.value='';
  statusBox.textContent='ভিডিও আপলোড ও সংরক্ষণ হয়েছে। হোমপেজে ভিডিও প্লেয়ার দেখা যাবে।';
 }catch(error){if(path)await supabase.storage.from('site-media').remove([path]).catch(()=>{});showError(errorBox,error);statusBox.textContent='ভিডিও সংরক্ষণ করা যায়নি।'}
}
async function setTourVideoMuted(muted,statusBox,errorBox){
 const toggle=byId('mosque360VideoMuted');
 try{
  const{user,profile}=await currentProfile();
  if(!user||!allowedRoles.includes(profile?.role))throw new Error('এই সেটিং পরিবর্তনের অনুমতি নেই।');
  const value=muted?'true':'false';
  const{error}=await supabase.from('site_media_settings').upsert({setting_key:'mosque_360_video_muted',public_url:value,storage_path:null,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
  if(error)throw error;
  settings.mosque_360_video_muted={setting_key:'mosque_360_video_muted',public_url:value};applyTourVideo(settings.mosque_360_video);
  statusBox.textContent=muted?'ভিডিওর শব্দ বন্ধ করা হয়েছে।':'ভিডিওর শব্দ চালু করা হয়েছে।';
 }catch(error){if(toggle)toggle.checked=!muted;showError(errorBox,error)}
}
async function initManager(){
 const panel=byId('mosqueMediaAdmin');if(!panel||!configured)return;
 try{
  const{user,profile}=await currentProfile();if(!user||!allowedRoles.includes(profile?.role))return;
  for(const s of surfaces){
   const form=byId(s.form),input=byId(s.input),error=byId(s.error),status=byId(s.status);
   form?.addEventListener('submit',async e=>{e.preventDefault();error.hidden=true;status.textContent=s.label+'-এর ছবি আপলোড হচ্ছে…';await uploadSetting({file:input.files?.[0],user,key:s.key,label:s.label,errorBox:error,statusBox:status,input})});
   byId(s.remove)?.addEventListener('click',()=>removeSetting({key:s.key,label:s.label,errorBox:error,statusBox:status}));
  }
  const form=byId('mosquePanoramaForm'),input=byId('mosquePanoramaFile'),error=byId('mosquePanoramaError'),status=byId('mosquePanoramaStatus');
  form?.addEventListener('submit',async e=>{e.preventDefault();error.hidden=true;status.textContent='৩৬০° প্যানোরামা আপলোড হচ্ছে…';await uploadSetting({file:input.files?.[0],user,key:'mosque_360_panorama',label:'৩৬০° প্যানোরামা',errorBox:error,statusBox:status,input,maxBytes:50*1024*1024,ratioRequired:true})});
  byId('mosquePanoramaRemove')?.addEventListener('click',()=>removeSetting({key:'mosque_360_panorama',label:'৩৬০° প্যানোরামা',errorBox:error,statusBox:status}));
  const sphericalForm=byId('mosqueSphericalImageForm'),sphericalInput=byId('mosqueSphericalImageFile'),sphericalError=byId('mosqueSphericalImageError'),sphericalStatus=byId('mosqueSphericalImageStatus');
  sphericalForm?.addEventListener('submit',async e=>{e.preventDefault();sphericalError.hidden=true;sphericalStatus.textContent='সাধারণ ছবিকে ৩৬০° ভিউয়ের উপযোগী করা হচ্ছে…';await uploadSphericalImage({file:sphericalInput.files?.[0],user,errorBox:sphericalError,statusBox:sphericalStatus,input:sphericalInput})});
  byId('mosqueSphericalImageRemove')?.addEventListener('click',()=>removeSetting({key:'mosque_360_spherical_image',label:'৩৬০° গোলাকার ছবি',errorBox:sphericalError,statusBox:sphericalStatus}));
  const videoForm=byId('mosque360VideoForm'),videoInput=byId('mosque360VideoFile'),videoError=byId('mosque360VideoError'),videoStatus=byId('mosque360VideoStatus');
  videoForm?.addEventListener('submit',async e=>{e.preventDefault();videoError.hidden=true;videoStatus.textContent='ভিডিও আপলোড হচ্ছে…';await uploadTourVideo({file:videoInput.files?.[0],user,errorBox:videoError,statusBox:videoStatus,input:videoInput})});
  byId('mosque360VideoRemove')?.addEventListener('click',()=>removeSetting({key:'mosque_360_video',label:'৩৬০° ভ্রমণ ভিডিও',errorBox:videoError,statusBox:videoStatus}));
  byId('mosque360VideoMuted')?.addEventListener('change',e=>setTourVideoMuted(e.target.checked,videoStatus,videoError));
  applyTourVideo(settings.mosque_360_video);
 }catch(error){console.warn('মিডিয়া ব্যবস্থাপনা চালু হয়নি:',error)}
}
async function startTour(){const setting=settings.mosque_360_spherical_image?.public_url?settings.mosque_360_spherical_image:settings.mosque_360_panorama;if(!setting?.public_url)return;const start=byId('mosque360Start'),stage=byId('mosque360Stage'),placeholder=byId('mosque360Placeholder'),status=byId('mosque360Status'),shell=byId('mosque360Viewer');if(start){start.disabled=true;start.textContent='ভিউয়ার প্রস্তুত হচ্ছে…'}try{let pannellum=window.pannellum;if(!pannellum){await new Promise((resolve,reject)=>{if(!document.querySelector('link[data-pannellum-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';link.dataset.pannellumCss='1';document.head.append(link)}let script=document.querySelector('script[data-pannellum-js]');if(!script){script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';script.dataset.pannellumJs='1';document.head.append(script)}script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error('৩৬০° ভিউয়ার ডাউনলোড করা যায়নি।')),{once:true})});pannellum=window.pannellum}if(!pannellum)throw new Error('৩৬০° ভিউয়ার লোড হয়নি।');stage.hidden=false;placeholder.hidden=true;status.hidden=true;pannellum.viewer('mosque360Stage',{type:'equirectangular',panorama:setting.public_url,autoLoad:true,showControls:true,showZoomCtrl:true,compass:false,hfov:100,minHfov:50,maxHfov:120,mouseZoom:true,keyboardZoom:true,draggable:true,orientationOnByDefault:false});shell.classList.add('tour-ready')}catch(error){stage.hidden=true;placeholder.hidden=false;status.hidden=false;status.textContent=error.message||'৩৬০° ভ্রমণ চালু করা যায়নি।';if(start){start.disabled=false;start.textContent='আবার চেষ্টা করুন'}}}
byId('mosque360Start')?.addEventListener('click',startTour);
await getSettings();
await initManager();
