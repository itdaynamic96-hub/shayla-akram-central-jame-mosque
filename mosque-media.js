import{configured,supabase,currentProfile,showError}from'./supabase-client.js';
const fallback='./assets/mosque-hero.webp';
const allowedRoles=['super_admin','admin','website_admin'];
const nodes=()=>[...document.querySelectorAll('[data-mosque-image]')];
const byId=id=>document.getElementById(id);
const imageExt={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
let currentSettings={main:null,panorama:null};
function applyImage(url){nodes().forEach(img=>{img.src=url||fallback})}
function applyPanoramaPreview(setting){
 const preview=byId('mosquePanoramaPreview'),empty=byId('mosquePanoramaEmpty'),remove=byId('mosquePanoramaRemove');
 if(preview){preview.hidden=!setting?.public_url;if(setting?.public_url)preview.src=setting.public_url}
 if(empty)empty.hidden=!!setting?.public_url;
 if(remove)remove.hidden=!setting?.storage_path;
 const start=byId('mosque360Start');
 if(start){start.disabled=!setting?.public_url;start.textContent=setting?.public_url?'৩৬০° ভ্রমণ শুরু করুন':'৩৬০° ছবি যুক্ত হলে চালু হবে'}
}
async function getSettings(){
 if(!configured||!supabase){applyImage(fallback);return}
 const{data,error}=await supabase.from('site_media_settings').select('setting_key,public_url,storage_path').in('setting_key',['mosque_main','mosque_360_panorama']);
 if(error){console.warn('মসজিদের ছবি সেটিং লোড হয়নি:',error);applyImage(fallback);return}
 currentSettings.main=(data||[]).find(x=>x.setting_key==='mosque_main')||null;
 currentSettings.panorama=(data||[]).find(x=>x.setting_key==='mosque_360_panorama')||null;
 applyImage(currentSettings.main?.public_url||fallback);
 applyPanoramaPreview(currentSettings.panorama);
}
function loadPannellum(){
 if(window.pannellum)return Promise.resolve(window.pannellum);
 return new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-pannellum-css]')){const link=document.createElement('link');link.rel='stylesheet';link.href='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css';link.dataset.pannellumCss='1';document.head.append(link)}
  let script=document.querySelector('script[data-pannellum-js]');
  if(!script){script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js';script.dataset.pannellumJs='1';document.head.append(script)}
  script.addEventListener('load',()=>window.pannellum?resolve(window.pannellum):reject(new Error('৩৬০° ভিউয়ার লোড হয়নি।')), {once:true});
  script.addEventListener('error',()=>reject(new Error('৩৬০° ভিউয়ার ডাউনলোড করা যায়নি।')), {once:true});
  if(window.pannellum)resolve(window.pannellum);
 });
}
async function startTour(){
 const setting=currentSettings.panorama;if(!setting?.public_url)return;
 const start=byId('mosque360Start'),stage=byId('mosque360Stage'),placeholder=byId('mosque360Placeholder'),status=byId('mosque360Status'),shell=byId('mosque360Viewer');
 if(start){start.disabled=true;start.textContent='ভিউয়ার প্রস্তুত হচ্ছে…'}
 try{
  const pannellum=await loadPannellum();stage.hidden=false;placeholder.hidden=true;status.hidden=true;
  pannellum.viewer('mosque360Stage',{type:'equirectangular',panorama:setting.public_url,autoLoad:true,showControls:true,showZoomCtrl:true,compass:false,hfov:100,minHfov:50,maxHfov:120,mouseZoom:true,keyboardZoom:true,draggable:true,orientationOnByDefault:false});
  shell.classList.add('tour-ready');
 }catch(error){stage.hidden=true;placeholder.hidden=false;status.hidden=false;status.textContent=error.message||'৩৬০° ভ্রমণ চালু করা যায়নি।';if(start){start.disabled=false;start.textContent='আবার চেষ্টা করুন'}}
}
async function uploadImageSetting({file,user,key,maxBytes,ratioRequired,errorBox,statusBox,input}){
 let path=null;
 try{
  if(!file)throw new Error('প্রথমে একটি ছবি নির্বাচন করুন।');
  const ext=imageExt[file.type];if(!ext)throw new Error('শুধু JPG, PNG বা WebP ছবি গ্রহণযোগ্য।');
  if(file.size>maxBytes)throw new Error('নির্ধারিত সর্বোচ্চ ফাইল সাইজ অতিক্রম করেছে।');
  if(ratioRequired){const bitmap=await createImageBitmap(file);const ratio=bitmap.width/bitmap.height;bitmap.close?.();if(ratio<1.8||ratio>2.2)throw new Error('৩৬০° প্যানোরামার ছবির অনুপাত প্রায় ২:১ হতে হবে।')}
  path='mosque-brand/'+user.id+'/'+key+'-'+crypto.randomUUID()+'.'+ext;
  const{error:uploadError}=await supabase.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(uploadError)throw uploadError;
  const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
  const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:key,public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
  if(saveError)throw saveError;
  const old=key==='mosque_main'?currentSettings.main:currentSettings.panorama;
  if(old?.storage_path&&old.storage_path!==path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('পুরোনো ছবি মুছতে পারেনি:',removeError)}
  const saved={setting_key:key,public_url:publicUrl,storage_path:path};
  if(key==='mosque_main'){currentSettings.main=saved;applyImage(publicUrl)}
  else{currentSettings.panorama=saved;applyPanoramaPreview(saved)}
  if(input)input.value='';
  statusBox.textContent=key==='mosque_main'?'প্রধান ছবি সফলভাবে পরিবর্তন হয়েছে। হোমপেজ, Accounts ও Admin Panel-এ একই ছবি দেখা যাবে।':'৩৬০° প্যানোরামা সফলভাবে সংরক্ষিত হয়েছে। এখন হোমপেজে ভ্রমণ চালু করা যাবে।';
 }catch(error){if(path)await supabase.storage.from('site-media').remove([path]).catch(()=>{});showError(errorBox,error);statusBox.textContent='ছবি সংরক্ষণ করা যায়নি।'}
}
async function initManager(){
 const panel=byId('mosqueMediaAdmin');if(!panel||!configured)return;
 try{
  const{user,profile}=await currentProfile();if(!user||!allowedRoles.includes(profile?.role))return;panel.hidden=false;
  const mainForm=byId('mosqueMediaForm'),mainInput=byId('mosqueMediaFile'),mainError=byId('mosqueMediaError'),mainStatus=byId('mosqueMediaStatus');
  mainForm?.addEventListener('submit',async event=>{event.preventDefault();mainError.hidden=true;mainStatus.textContent='প্রধান ছবি আপলোড হচ্ছে…';await uploadImageSetting({file:mainInput.files?.[0],user,key:'mosque_main',maxBytes:10*1024*1024,ratioRequired:false,errorBox:mainError,statusBox:mainStatus,input:mainInput})});
  const panoramaForm=byId('mosquePanoramaForm'),panoramaInput=byId('mosquePanoramaFile'),panoramaError=byId('mosquePanoramaError'),panoramaStatus=byId('mosquePanoramaStatus');
  panoramaForm?.addEventListener('submit',async event=>{event.preventDefault();panoramaError.hidden=true;panoramaStatus.textContent='৩৬০° প্যানোরামা আপলোড হচ্ছে…';await uploadImageSetting({file:panoramaInput.files?.[0],user,key:'mosque_360_panorama',maxBytes:50*1024*1024,ratioRequired:true,errorBox:panoramaError,statusBox:panoramaStatus,input:panoramaInput})});
  byId('mosquePanoramaRemove')?.addEventListener('click',async()=>{
   if(!currentSettings.panorama)return;if(!confirm('৩৬০° প্যানোরামা ছবি অপসারণ করবেন? এতে ওয়েবসাইটের ৩৬০° ভ্রমণ বন্ধ হবে।'))return;
   panoramaError.hidden=true;panoramaStatus.textContent='প্যানোরামা অপসারণ হচ্ছে…';const old=currentSettings.panorama;
   const{error}=await supabase.from('site_media_settings').delete().eq('setting_key','mosque_360_panorama');
   if(error){showError(panoramaError,error);panoramaStatus.textContent='অপসারণ করা যায়নি।';return}
   if(old.storage_path){const{error:removeError}=await supabase.storage.from('site-media').remove([old.storage_path]);if(removeError)console.warn('প্যানোরামা ফাইল অপসারণ হয়নি:',removeError)}
   currentSettings.panorama=null;applyPanoramaPreview(null);panoramaStatus.textContent='৩৬০° ছবি অপসারণ করা হয়েছে; ভ্রমণ এখন বন্ধ।';
  });
 }catch(error){console.warn('ছবি ব্যবস্থাপনা চালু হয়নি:',error)}
}
byId('mosque360Start')?.addEventListener('click',startTour);
await getSettings();
await initManager();
