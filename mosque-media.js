import{configured,supabase,currentProfile,showError}from'./supabase-client.js';
const fallback='./assets/mosque-hero.webp';
const allowedRoles=['super_admin','admin','website_admin'];
const nodes=()=>[...document.querySelectorAll('[data-mosque-image]')];
function applyImage(url){nodes().forEach(img=>{img.src=url||fallback})}
async function loadImageSetting(){
 if(!configured||!supabase){applyImage(fallback);return null}
 const{data,error}=await supabase.from('site_media_settings').select('public_url,storage_path').eq('setting_key','mosque_main').maybeSingle();
 if(error){console.warn('মসজিদের ছবি সেটিং লোড হয়নি:',error);applyImage(fallback);return null}
 applyImage(data?.public_url||fallback);return data;
}
async function initManager(){
 const panel=document.getElementById('mosqueMediaAdmin');if(!panel||!configured)return;
 try{
  const{user,profile}=await currentProfile();
  if(!user||!allowedRoles.includes(profile?.role))return;
  panel.hidden=false;
  const form=document.getElementById('mosqueMediaForm'),fileInput=document.getElementById('mosqueMediaFile');
  const errorBox=document.getElementById('mosqueMediaError'),status=document.getElementById('mosqueMediaStatus');
  form?.addEventListener('submit',async event=>{
   event.preventDefault();errorBox.hidden=true;status.textContent='ছবি আপলোড হচ্ছে…';
   let path=null;
   try{
    const file=fileInput.files?.[0];if(!file)throw new Error('প্রথমে একটি ছবি নির্বাচন করুন।');
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    if(!ext)throw new Error('শুধু JPG, PNG বা WebP ছবি গ্রহণযোগ্য।');
    if(file.size>10*1024*1024)throw new Error('ছবির আকার ১০ MB-এর বেশি হতে পারবে না।');
    path='mosque-brand/'+user.id+'/'+crypto.randomUUID()+'.'+ext;
    const{error:uploadError}=await supabase.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(uploadError)throw uploadError;
    const publicUrl=supabase.storage.from('site-media').getPublicUrl(path).data.publicUrl;
    const{error:saveError}=await supabase.from('site_media_settings').upsert({setting_key:'mosque_main',public_url:publicUrl,storage_path:path,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'setting_key'});
    if(saveError)throw saveError;
    applyImage(publicUrl);fileInput.value='';status.textContent='ছবি পরিবর্তন সফল হয়েছে। সব সংযুক্ত পেজে নতুন ছবি দেখাবে।';
   }catch(error){if(path)await supabase.storage.from('site-media').remove([path]);showError(errorBox,error);status.textContent='ছবি সংরক্ষণ করা যায়নি।'}
  });
 }catch(error){console.warn('ছবি ব্যবস্থাপনা চালু হয়নি:',error)}
}
await loadImageSetting();
await initManager();
