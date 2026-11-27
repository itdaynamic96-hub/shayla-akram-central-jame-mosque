/* Lightweight browser Bengali Read Aloud using Spellophone/eSpeak NG. */
(() => {
  'use strict';
  const selectors = ['.article-card','.published-content','.content-slot.article-card','.video-card','.content-slot.video-card','.quran-ayah','.hadith-card','.knowledge-card','.tafsir-card','.asbab-card','.detailcard','.noticebox'].join(',');
  const excluded = ['button','input','textarea','select','script','style','iframe','video','audio','.read-aloud','.nexora-read-aloud','.nexora-share','.temporary','[aria-hidden="true"]'].join(',');
  let active=null,currentButtons=null,observer=null,enginePromise=null;
  const statusText=(message,target)=>{const el=target||document.getElementById('readAloudStatus');if(el)el.textContent=message;};
  const readableText=root=>{
    if(!root)return '';
    const copy=root.cloneNode(true);
    copy.querySelectorAll(excluded).forEach(el=>el.remove());
    const raw=copy.innerText||copy.textContent||'';
    return raw.replace(/\r/g,'').split(/\n+/).map(line=>line.trim()).filter(Boolean).join('। ')
      .replace(/https?:\/\/[^\s]+/gi,' ')
      .replace(/[0-9]/g,d=>'০১২৩৪৫৬৭৮৯'[Number(d)])
      .replace(/\s*([।!?])\s*/g,'$1 ').replace(/([।!?])(?:\s*[।!?])+/g,'$1').replace(/\s+/g,' ').trim();
  };
  // Keep spaces and punctuation with the surrounding language. Only
  // actual Arabic/Bengali letters should trigger a language switch.
  const splitText=value=>{
    const source=String(value||'').trim(),runs=[];
    let current='',language='';
    for(const char of source){
      const isArabic=/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(char);
      const isBengali=/[\u0980-\u09FF]/.test(char);
      const next=isArabic?'ar':isBengali?'bn':(language||'bn');
      if(language&&next!==language){
        if(current.trim())runs.push({text:current.trim(),language});
        current='';
      }
      language=next;
      current+=char;
    }
    if(current.trim())runs.push({text:current.trim(),language});
    const result=[];
    for(const run of runs){
      const sentences=run.text.match(/[^।.!?؟]+[।.!?؟]?/g)||[run.text];
      for(const sentence of sentences){
        let rest=sentence.trim();
        while(rest.length>220){
          let cut=rest.lastIndexOf(' ',220);
          if(cut<100)cut=220;
          result.push({text:rest.slice(0,cut).trim(),language:run.language});
          rest=rest.slice(cut).trim();
        }
        if(rest)result.push({text:rest,language:run.language});
      }
    }
    return result;
  };
  const setControls=state=>{
    if(!currentButtons)return;
    const {play,pause,resume,stop}=currentButtons;
    if(play)play.disabled=state==='playing'||state==='paused'||state==='loading';
    if(pause)pause.disabled=state!=='playing';
    if(resume)resume.disabled=state!=='paused';
    if(stop)stop.disabled=state!=='playing'&&state!=='paused'&&state!=='loading';
  };
  const releaseAudio=session=>{
    if(!session)return;
    if(session.audio){session.audio.onended=null;session.audio.onerror=null;session.audio.pause();session.audio.removeAttribute('src');session.audio.load();session.audio=null;}
    if(session.audioUrl){URL.revokeObjectURL(session.audioUrl);session.audioUrl=null;}
  };
  const finish=message=>{const target=active?.statusTarget;if(active?.nativeSpeaking&&'speechSynthesis' in window)window.speechSynthesis.cancel();releaseAudio(active);active=null;setControls('idle');statusText(message,target);};
  // Matches the lightweight Bengali voice used by the supplied module 14.
  const getEspeak=()=>{
    if(!enginePromise)enginePromise=(async()=>{
      const {createEspeak,toFloat32}=await import('https://cdn.jsdelivr.net/npm/@spelling-creator/spellophone@0.2.1/dist/browser.js');
      const engine=await createEspeak({cdn:'jsdelivr',languages:['bn','ar'],fallback:()=>import('https://cdn.jsdelivr.net/npm/@spelling-creator/spellophone@0.2.1/dist/wasm2js.js')});
      await engine.loadVoice('bn');engine.setVoice('bn');return {engine,toFloat32};
    })();
    return enginePromise;
  };
  const encodeWav=(samples,sampleRate)=>{
    const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
    const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');write(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
    view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,v<0?v*32768:v*32767,true);}
    return new Blob([buffer],{type:'audio/wav'});
  };
  const findNativeVoice=async language=>{
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return null;
    const synth=window.speechSynthesis;
    let voices=synth.getVoices();
    if(!voices.length){
      await new Promise(resolve=>{
        let done=false;
        const finish=()=>{if(done)return;done=true;synth.removeEventListener('voiceschanged',finish);resolve();};
        synth.addEventListener('voiceschanged',finish,{once:true});
        setTimeout(finish,1200);
      });
      voices=synth.getVoices();
    }
    const prefix=language==='ar'?'ar':'bn';
    return voices.filter(v=>(v.lang||'').toLowerCase().startsWith(prefix))
      .sort((a,b)=>Number(b.localService)-Number(a.localService))[0]||null;
  };
  const speakNative=(session,chunk,voice)=>{
    const utterance=new SpeechSynthesisUtterance(chunk.text);
    utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=0.92;utterance.pitch=1;
    session.nativePending=null;session.nativeSpeaking=true;session.nativeUtterance=utterance;
    utterance.onend=()=>{if(active!==session||session.state!=='playing')return;session.nativeSpeaking=false;session.nativeUtterance=null;session.index++;playNext(session);};
    utterance.onerror=event=>{if(active===session&&event.error!=='canceled'&&event.error!=='interrupted')finish('ডিভাইসের কণ্ঠে পড়া যায়নি। আবার চেষ্টা করুন।');};
    statusText((chunk.language==='ar'?'আরবি':'বাংলা')+'—ডিভাইসের কণ্ঠে পড়া হচ্ছে ('+voice.name+')…',session.statusTarget);
    window.speechSynthesis.speak(utterance);
  };
  const playNext=async session=>{
    if(active!==session||session.state!=='playing'||session.generating)return;
    if(session.index>=session.chunks.length){finish('পড়া শেষ হয়েছে।');return;}
    session.generating=true;statusText(session.chunks[session.index].language==='ar'?'আরবি কণ্ঠ প্রস্তুত হচ্ছে…':'বাংলা কণ্ঠ প্রস্তুত হচ্ছে…',session.statusTarget);
    try{
      const chunk=session.chunks[session.index];
      const nativeVoice=await findNativeVoice(chunk.language);if(active!==session)return;
      if(nativeVoice){
        session.generating=false;session.nativePending={chunk,voice:nativeVoice};
        if(session.state==='playing')speakNative(session,chunk,nativeVoice);
        else statusText('ডিভাইসের কণ্ঠ প্রস্তুত। আবার চালু চাপলে শোনা যাবে।',session.statusTarget);
        return;
      }
      const {engine,toFloat32}=await getEspeak();if(active!==session)return;
      await engine.loadVoice(chunk.language);engine.setVoice(chunk.language);
      if(active!==session)return;
      const result=engine.synthesize(chunk.text),samples=toFloat32(result?.samples||result),sampleRate=Number(result?.sampleRate||engine.sampleRate||22050);
      if(!samples||!samples.length)throw new Error('এই লেখার অডিও তৈরি হয়নি।');
      session.audioUrl=URL.createObjectURL(encodeWav(samples,sampleRate));
      const audio=new Audio(session.audioUrl);session.audio=audio;audio.preload='auto';
      audio.onended=()=>{if(active!==session||session.state!=='playing')return;releaseAudio(session);session.index++;playNext(session);};
      audio.onerror=()=>{if(active===session)finish('তৈরি হওয়া অডিও চালানো যায়নি। আবার চেষ্টা করুন।');};
      session.generating=false;
      if(session.state==='playing'){statusText((chunk.language==='ar'?'আরবি':'বাংলা')+'—বিকল্প কণ্ঠে পড়া হচ্ছে…',session.statusTarget);await audio.play();}
      else statusText('অডিও প্রস্তুত। আবার চালু চাপলে শোনা যাবে।',session.statusTarget);
    }catch(error){if(active===session)finish(error?.message||'বাংলা ভয়েস তৈরি করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।');console.error('Spellophone Bengali TTS failed',error);}
  };
  const start=(text,buttons,statusTarget)=>{
    currentButtons=buttons||null;const clean=String(text||'').trim();
    if(!clean){setControls('idle');statusText('পড়ে শোনানোর মতো বাংলা লেখা পাওয়া যায়নি।',statusTarget);return;}
    if(active)finish('আগের পড়া বন্ধ করা হয়েছে।');
    const session={statusTarget,buttons,chunks:splitText(clean),index:0,audio:null,audioUrl:null,state:'playing',generating:false,nativeSpeaking:false};
    active=session;setControls('playing');statusText('বাংলা কণ্ঠ প্রস্তুত করা হচ্ছে…',statusTarget);playNext(session);
  };
  const pause=buttons=>{if(!active||active.buttons!==buttons||active.state!=='playing')return;if(active.nativeSpeaking)window.speechSynthesis.pause();else active.audio?.pause();active.state='paused';setControls('paused');statusText('পড়া বিরতিতে আছে।',active.statusTarget);};
  const resume=buttons=>{
    if(!active||active.buttons!==buttons||active.state!=='paused')return;
    const session=active;session.state='playing';setControls('playing');statusText('আবার পড়া হচ্ছে।',session.statusTarget);
    if(session.nativePending)speakNative(session,session.nativePending.chunk,session.nativePending.voice);else if(session.nativeSpeaking)window.speechSynthesis.resume();else if(session.audio)session.audio.play().catch(()=>finish('অডিও আবার চালু করা যায়নি।'));else if(!session.generating)playNext(session);
  };
  const stop=(message='পড়া বন্ধ করা হয়েছে।')=>finish(message);
  let shareSequence = 0;

  const shareTextFor = card => {
    const heading = card.querySelector('h1,h2,h3,h4,[data-title]');
    const title = (heading?.innerText || card.getAttribute('aria-label') || document.title || 'শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ').trim();
    const body = readableText(card).replace(/\\s+/g,' ').trim();
    return {title, text: body.length > 420 ? body.slice(0,417) + '…' : body};
  };

  const shareUrlFor = card => {
    if (!card.id) {
      const {title,text} = shareTextFor(card);
      const base = (title + '-' + text.slice(0,45)).toLowerCase()
        .replace(/[^\\p{L}\\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,55) || 'post';
      card.id = 'share-' + base + '-' + (++shareSequence);
    }
    const url = new URL(window.location.href);
    url.hash = card.id;
    return url.href;
  };

  const addShareControl = card => {
    if (!(card instanceof Element) || card.dataset.nexoraShareReady === '1' || card.closest('#adminWorkspace')) return;
    card.dataset.nexoraShareReady = '1';
    const {title,text} = shareTextFor(card);
    const url = shareUrlFor(card);
    const message = [title, text, url].filter(Boolean).join('\\n\\n');
    const root = document.createElement('div');
    root.className = 'nexora-share';
    root.style.cssText = 'position:relative;display:inline-flex;flex-direction:column;align-items:flex-start;gap:6px;margin:6px 4px 4px 0;z-index:3;';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nexora-share-toggle';
    toggle.textContent = '↗ শেয়ার';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label',title + ' শেয়ার করুন');
    toggle.style.cssText = 'font:inherit;font-size:12px;line-height:1.3;padding:5px 9px;border:1px solid #9aa7b5;border-radius:7px;background:transparent;color:inherit;cursor:pointer;';
    const menu = document.createElement('div');
    menu.className = 'nexora-share-menu';
    menu.hidden = true;
    menu.setAttribute('role','group');
    menu.setAttribute('aria-label','শেয়ার করার মাধ্যম');
    menu.style.cssText = 'display:none;flex-wrap:wrap;gap:6px;max-width:min(320px,85vw);padding:8px;border:1px solid #aab4c0;border-radius:9px;background:Canvas;color:CanvasText;box-shadow:0 3px 12px #0002;';
    const addLink = (label,href) => {
      const link = document.createElement('a');
      link.textContent = label;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'font:inherit;font-size:12px;padding:5px 8px;border:1px solid #aab4c0;border-radius:6px;color:inherit;text-decoration:none;';
      menu.appendChild(link);
    };
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent([title,text].filter(Boolean).join('\\n'));
    addLink('Facebook','https://www.facebook.com/sharer/sharer.php?u='+encodedUrl);
    addLink('WhatsApp','https://wa.me/?text='+encodeURIComponent(message));
    addLink('Telegram','https://t.me/share/url?url='+encodedUrl+'&text='+encodedText);
    addLink('X','https://twitter.com/intent/tweet?text='+encodedText+'&url='+encodedUrl);
    addLink('LinkedIn','https://www.linkedin.com/sharing/share-offsite/?url='+encodedUrl);
    addLink('Pinterest','https://www.pinterest.com/pin/create/button/?url='+encodedUrl+'&description='+encodedText);
    addLink('ইমেইল','mailto:?subject='+encodeURIComponent(title)+'&body='+encodeURIComponent(message));
    const native = document.createElement('button');
    native.type = 'button';
    native.textContent = 'অন্যান্য অ্যাপ…';
    native.style.cssText = 'font:inherit;font-size:12px;padding:5px 8px;border:1px solid #aab4c0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;';
    native.addEventListener('click', async () => {
      if (navigator.share) {
        try { await navigator.share({title,text:message,url}); }
        catch (error) { if (error?.name !== 'AbortError') shareStatus.textContent = 'শেয়ার করা যায়নি।'; }
      } else {
        shareStatus.textContent = 'এই ব্রাউজারে অ্যাপ শেয়ার সুবিধা নেই; লিংক কপি ব্যবহার করুন।';
      }
    });
    menu.appendChild(native);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'লিংক কপি';
    copy.style.cssText = native.style.cssText;
    const shareStatus = document.createElement('span');
    shareStatus.setAttribute('aria-live','polite');
    shareStatus.style.cssText = 'font-size:11px;align-self:center;';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        shareStatus.textContent = 'লিংক কপি হয়েছে।';
      } catch (_) {
        const field = document.createElement('textarea');
        field.value = url;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        shareStatus.textContent = copied ? 'লিংক কপি হয়েছে।' : 'লিংক কপি করা যায়নি।';
      }
    });
    menu.append(copy,shareStatus);
    toggle.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      menu.style.display = menu.hidden ? 'none' : 'flex';
      toggle.setAttribute('aria-expanded',menu.hidden ? 'false' : 'true');
    });
    root.append(toggle,menu);
    card.appendChild(root);
  };

  const addCardReader = card => {
    if (!(card instanceof Element) || card.dataset.nexoraTtsReady==='1' || card.closest('#adminWorkspace')) return;
    const text=readableText(card);
    if (text.length<25) return;
    card.dataset.nexoraTtsReady='1';
    addShareControl(card);
    const box=document.createElement('div');
    box.className='nexora-read-aloud';
    box.setAttribute('aria-label','এই লেখাটি পড়ে শোনানোর নিয়ন্ত্রণ');
    const play=document.createElement('button');
    play.type='button'; play.textContent='🔊 আরবি ও বাংলায় শুনুন';
    const pauseButton=document.createElement('button');
    pauseButton.type='button'; pauseButton.textContent='বিরতি'; pauseButton.disabled=true;
    const resumeButton=document.createElement('button');
    resumeButton.type='button'; resumeButton.textContent='আবার চালু'; resumeButton.disabled=true;
    const stopButton=document.createElement('button');
    stopButton.type='button'; stopButton.textContent='বন্ধ'; stopButton.disabled=true;
    const status=document.createElement('span');
    status.className='nexora-tts-status';
    status.setAttribute('aria-live','polite');
    status.textContent='আরবি ও বাংলা—ভাষা অনুযায়ী কণ্ঠে শুনুন';
    box.append(play,pauseButton,resumeButton,stopButton,status);
    card.appendChild(box);
    const buttons={play,pause:pauseButton,resume:resumeButton,stop:stopButton};
    play.addEventListener('click',()=>start(readableText(card),buttons,status));
    pauseButton.addEventListener('click',()=>pause(buttons));
    resumeButton.addEventListener('click',()=>resume(buttons));
    stopButton.addEventListener('click',()=>{if(active?.buttons===buttons)stop();});
  };

  const scanCards = (root=document) => {
    if (root instanceof Element && root.matches(selectors)) { addCardReader(root); addShareControl(root); }
    root.querySelectorAll?.(selectors).forEach(card => { addCardReader(card); addShareControl(card); });
  };

  const init = () => {
    scanCards();
    observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType===1) scanCards(node);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>stop('নতুন পৃষ্ঠা খোলা হয়েছে।'));
    window.addEventListener('pagehide',()=>stop('পৃষ্ঠা বন্ধ করা হয়েছে।'));
  };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
  window.addEventListener('pagehide',()=>{ stop('পৃষ্ঠা বন্ধ করা হয়েছে।'); });
})();