/* Free, device-independent Bengali male TTS powered by local eSpeak NG/WASM (Spellophone). */
(() => {
  'use strict';

  const ENGINE_URL = 'https://cdn.jsdelivr.net/npm/@spelling-creator/spellophone@0.2.1/dist/legacy/spellophone.iife.js';
  const selectors = [
    '.article-card', '.published-content', '.content-slot.article-card',
    '.video-card', '.content-slot.video-card',
    '.quran-ayah', '.hadith-card', '.knowledge-card', '.tafsir-card',
    '.detailcard', '.noticebox'
  ].join(',');
  const excluded = [
    'button','input','textarea','select','script','style','iframe','video','audio',
    '.read-aloud','.nexora-read-aloud','.nexora-share','.temporary','[aria-hidden="true"]',
    '[lang="ar"]','.arabic','.arabic-pronunciation'
  ].join(',');

  let enginePromise = null;
  let engine = null;
  let maleVoice = null;
  let audioContext = null;
  let active = null;
  let currentButtons = null;
  let speed = 1;
  let observer = null;

  const statusText = (message, target) => {
    const el = target || document.getElementById('readAloudStatus');
    if (el) el.textContent = message;
  };

  const readableText = root => {
    if (!root) return '';
    const copy = root.cloneNode(true);
    copy.querySelectorAll(excluded).forEach(el => el.remove());
    return (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const splitText = value => {
    const sentences = String(value || '').match(/[^।!?]+[।!?]?/g) || [String(value || '')];
    const result = [];
    for (const sentence of sentences) {
      let rest = sentence.trim();
      while (rest.length > 220) {
        let cut = rest.lastIndexOf(' ', 220);
        if (cut < 100) cut = 220;
        result.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) result.push(rest);
    }
    return result;
  };

  const setControls = state => {
    if (!currentButtons) return;
    const {play,pause,resume,stop} = currentButtons;
    if (play) play.disabled = state === 'playing' || state === 'paused' || state === 'loading';
    if (pause) pause.disabled = state !== 'playing';
    if (resume) resume.disabled = state !== 'paused';
    if (stop) stop.disabled = state !== 'playing' && state !== 'paused' && state !== 'loading';
  };

  const finish = message => {
    const target = active?.statusTarget;
    if (active?.source) {
      active.source.onended = null;
      try { active.source.stop(); } catch (_) {}
    }
    active = null;
    setControls('idle');
    statusText(message, target);
  };

  const loadEngineScript = () => new Promise((resolve, reject) => {
    if (window.Spellophone?.createEspeak) return resolve();
    const existing = document.querySelector('script[data-bengali-tts-engine]');
    if (existing) {
      existing.addEventListener('load', () => window.Spellophone?.createEspeak ? resolve() : reject(new Error('বাংলা কণ্ঠের ইঞ্জিন লোড হয়নি।')), {once:true});
      existing.addEventListener('error', () => reject(new Error('বিনামূল্যের বাংলা কণ্ঠের ইঞ্জিন ডাউনলোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।')), {once:true});
      return;
    }
    const script = document.createElement('script');
    script.src = ENGINE_URL;
    script.async = true;
    script.dataset.bengaliTtsEngine = '1';
    script.onload = () => window.Spellophone?.createEspeak ? resolve() : reject(new Error('বাংলা কণ্ঠের ইঞ্জিন পাওয়া যায়নি।'));
    script.onerror = () => reject(new Error('বিনামূল্যের বাংলা কণ্ঠের ইঞ্জিন ডাউনলোড করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করুন।'));
    document.head.appendChild(script);
  });

  const ensureEngine = async () => {
    if (engine) return engine;
    if (!enginePromise) enginePromise = (async () => {
      await loadEngineScript();
      const instance = await window.Spellophone.createEspeak({cdn:'jsdelivr', languages:['bn']});
      const voice = instance.listVoices().find(item =>
        item.gender === 'male' &&
        item.languages?.some(language => /^bn(?:-|$)/i.test(language.name || ''))
      );
      if (!voice) {
        instance.dispose?.();
        throw new Error('ইঞ্জিনে যাচাইকৃত বাংলা পুরুষ কণ্ঠ পাওয়া যায়নি। নারী বা অন্য ভাষার কণ্ঠ চালু করা হবে না।');
      }
      await instance.loadVoice(voice.name);
      instance.setVoice(voice.name);
      engine = instance;
      maleVoice = voice;
      return engine;
    })().catch(error => {
      enginePromise = null;
      throw error;
    });
    return enginePromise;
  };

  const getAudioContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('এই ব্রাউজারে অডিও চালানোর সুবিধা নেই।');
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    return audioContext;
  };

  const playCurrentBuffer = session => {
    if (active !== session || session.state !== 'playing') return;
    if (session.offset >= session.buffer.duration) {
      session.index += 1;
      session.buffer = null;
      session.offset = 0;
      playNext(session);
      return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = session.buffer;
    source.connect(audioContext.destination);
    session.source = source;
    session.startedAt = audioContext.currentTime;
    source.onended = () => {
      if (active !== session || session.state !== 'playing' || session.source !== source) return;
      session.source = null;
      session.index += 1;
      session.buffer = null;
      session.offset = 0;
      playNext(session);
    };
    source.start(0, session.offset);
  };

  const playNext = session => {
    if (active !== session || session.state !== 'playing') return;
    if (session.index >= session.chunks.length) {
      finish('পড়া শেষ হয়েছে।');
      return;
    }
    try {
      const result = engine.synthesize(session.chunks[session.index], {rate: Math.round(150 * speed), pitch:35});
      if (!result.samples?.length) throw new Error('এই অংশের জন্য অডিও তৈরি করা যায়নি।');
      const buffer = audioContext.createBuffer(1, result.samples.length, result.sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i=0;i<result.samples.length;i++) channel[i] = result.samples[i] / 32768;
      session.buffer = buffer;
      session.offset = 0;
      playCurrentBuffer(session);
    } catch (error) {
      finish(error.message || 'বাংলা অডিও তৈরি করা যায়নি।');
    }
  };

  const start = async (text, buttons, statusTarget) => {
    currentButtons = buttons || null;
    const clean = String(text || '').trim();
    if (!clean) {
      setControls('idle');
      statusText('পড়ে শোনানোর মতো বাংলা লেখা পাওয়া যায়নি।', statusTarget);
      return;
    }
    if (active) finish('আগের পড়া বন্ধ করা হয়েছে।');
    let context;
    try {
      context = getAudioContext();
      context.resume?.();
    } catch (error) {
      statusText(error.message || 'অডিও চালু করা যায়নি।', statusTarget);
      return;
    }
    const session = {statusTarget,buttons,chunks:splitText(clean),index:0,buffer:null,offset:0,source:null,startedAt:0,state:'loading'};
    active = session;
    setControls('loading');
    statusText('বিনামূল্যের বাংলা পুরুষ কণ্ঠ প্রস্তুত করা হচ্ছে…', statusTarget);
    try {
      await ensureEngine();
      if (active !== session) return;
      await context.resume?.();
      session.state = 'playing';
      setControls('playing');
      statusText('বাংলা পুরুষ কণ্ঠে পড়া হচ্ছে…', statusTarget);
      playNext(session);
    } catch (error) {
      finish(error.message || 'বাংলা পুরুষ কণ্ঠ চালু করা যায়নি।');
    }
  };

  const pause = buttons => {
    if (!active || active.buttons !== buttons || active.state !== 'playing') return;
    const session = active;
    if (session.source && session.buffer) {
      session.offset = Math.min(session.buffer.duration, session.offset + audioContext.currentTime - session.startedAt);
      session.source.onended = null;
      try { session.source.stop(); } catch (_) {}
      session.source = null;
    }
    session.state = 'paused';
    setControls('paused');
    statusText('পড়া বিরতিতে আছে।', session.statusTarget);
  };

  const resume = buttons => {
    if (!active || active.buttons !== buttons || active.state !== 'paused') return;
    const session = active;
    session.state = 'playing';
    setControls('playing');
    statusText('আবার পড়া হচ্ছে।', session.statusTarget);
    audioContext.resume?.().then(() => {
      if (active === session && session.state === 'playing') {
        if (session.buffer) playCurrentBuffer(session);
        else playNext(session);
      }
    }).catch(() => finish('অডিও আবার চালু করা যায়নি।'));
  };

  const stop = (message = 'পড়া বন্ধ করা হয়েছে।') => finish(message);

  const pageRoot = () =>
    document.querySelector('main:not(.hidden)') ||
    document.querySelector('#home:not(.hidden),#detail:not(.hidden),#islamicLibrary:not(.hidden),#app:not([hidden])') ||
    document.body;

  const pageButtons = () => {
    const root = document.getElementById('readAloud');
    const actions = root?.querySelector('.read-aloud-actions');
    if (!actions) return null;
    const buttons = {
      play:actions.querySelector('#readStart'),
      pause:actions.querySelector('#readPause'),
      resume:actions.querySelector('#readResume'),
      stop:actions.querySelector('#readStop')
    };
    return Object.values(buttons).some(item => !item) ? null : buttons;
  };

  const bindPageReader = () => {
    const root = document.getElementById('readAloud');
    if (!root || root.dataset.readerReady === '1') return;
    root.dataset.readerReady = '1';
    const toggle = root.querySelector('#readToggle');
    const buttons = pageButtons();
    const actions = root.querySelector('.read-aloud-actions');
    if (actions && !actions.querySelector('#readSpeed')) {
      const select = document.createElement('select');
      select.id = 'readSpeed';
      select.setAttribute('aria-label','পড়ার গতি');
      [['0.85','ধীরে'],['1','স্বাভাবিক'],['1.15','দ্রুত']].forEach(([value,label]) => {
        const option = document.createElement('option');
        option.value=value; option.textContent=label;
        if (value==='1') option.selected=true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => { speed=Number(select.value); });
      actions.appendChild(select);
    }
    toggle?.addEventListener('click', () => {
      root.classList.toggle('open');
      toggle.setAttribute('aria-expanded',root.classList.contains('open')?'true':'false');
    });
    buttons?.play.addEventListener('click', () => start(readableText(pageRoot()),buttons));
    buttons?.pause.addEventListener('click', () => pause(buttons));
    buttons?.resume.addEventListener('click', () => resume(buttons));
    buttons?.stop.addEventListener('click', () => { if (active?.buttons===buttons) stop(); });
    currentButtons=buttons;
    setControls('idle');
    statusText('বিনামূল্যের বাংলা পুরুষ কণ্ঠে বর্তমান পৃষ্ঠার লেখা শুনুন।');
  };

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
    play.type='button'; play.textContent='🔊 পড়ে শুনুন';
    const pauseButton=document.createElement('button');
    pauseButton.type='button'; pauseButton.textContent='বিরতি'; pauseButton.disabled=true;
    const resumeButton=document.createElement('button');
    resumeButton.type='button'; resumeButton.textContent='আবার চালু'; resumeButton.disabled=true;
    const stopButton=document.createElement('button');
    stopButton.type='button'; stopButton.textContent='বন্ধ'; stopButton.disabled=true;
    const status=document.createElement('span');
    status.className='nexora-tts-status';
    status.setAttribute('aria-live','polite');
    status.textContent='ফ্রি বাংলা পুরুষ কণ্ঠে শুনুন';
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
    bindPageReader();
    scanCards();
    observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType===1) scanCards(node);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('hashchange',()=>stop('নতুন পৃষ্ঠা খোলা হয়েছে।'));
    window.addEventListener('pagehide',()=>{stop('পৃষ্ঠা বন্ধ করা হয়েছে।');audioContext?.close?.();});
  };

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();