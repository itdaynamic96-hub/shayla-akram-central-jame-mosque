/* Shared Bengali read-aloud engine for the public site, Islamic library, Admin and Accounts. */
(() => {
  'use strict';
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const Utterance = window.SpeechSynthesisUtterance;
  const readerStyle = document.createElement('style');
  readerStyle.textContent = `
    .nexora-read-aloud{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:10px 0 0;padding:8px;border:1px solid #d8c58e;border-radius:9px;background:#fbf8ee}
    .nexora-read-aloud button{border:1px solid #bba66c;border-radius:7px;background:#17452f;color:#fff;padding:6px 9px;font:inherit;font-size:12px;cursor:pointer}
    .nexora-read-aloud button:disabled{opacity:.45;cursor:not-allowed}
    .nexora-read-aloud .nexora-tts-status{font-size:11px;color:#455b4b}
    #readAloud .read-aloud-actions select{max-width:100px;padding:5px;border:1px solid #cdbb8a;border-radius:6px;background:white;color:#173d2b}
  `;
  document.head.appendChild(readerStyle);
  const pageRoot = () => document.querySelector('main:not(.hidden)') || document.querySelector('#home:not(.hidden),#detail:not(.hidden),#islamicLibrary:not(.hidden),#app:not([hidden])') || document.body;
  const selectors = [
    '.article-card', '.published-content', '.content-slot.article-card',
    '.quran-ayah', '.hadith-card', '.knowledge-card', '.tafsir-card', '.detailcard', '.noticebox'
  ].join(',');
  let active = null;
  let currentButtons = null;
  let chunks = [];
  let chunkIndex = 0;
  let speed = 0.92;
  let voice = null;
  let voiceReady = false;

  const statusText = (message, target) => {
    const el = target || document.getElementById('readAloudStatus');
    if (el) el.textContent = message;
  };
  const getVoices = () => {
    if (!synth) return [];
    const voices = synth.getVoices();
    return voices.filter(v => /^bn(?:-|_)/i.test(v.lang || '') || /bengali|bangla/i.test(v.name || ''));
  };
  const chooseVoice = () => {
    const voices = getVoices();
    voice = voices.find(v => /^bn-BD$/i.test(v.lang || '')) ||
      voices.find(v => /^bn(?:-|_)/i.test(v.lang || '')) || voices[0] || null;
    voiceReady = !!voice;
    return voice;
  };
  const splitText = text => {
    const sentences = String(text || '').match(/[^।!?]+[।!?]?/g) || [String(text || '')];
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
  const readableText = root => {
    if (!root) return '';
    const copy = root.cloneNode(true);
    copy.querySelectorAll([
      'button','input','textarea','select','script','style','iframe','video','audio',
      '.read-aloud','.nexora-read-aloud','.temporary','[aria-hidden="true"]',
      '[lang="ar"]','.arabic','.arabic-pronunciation'
    ].join(',')).forEach(el => el.remove());
    return (copy.innerText || copy.textContent || '').replace(/\s+/g, ' ').trim();
  };
  const setControls = state => {
    if (!currentButtons) return;
    const {play,pause,resume,stop} = currentButtons;
    play.disabled = state === 'playing' || state === 'paused' || !synth || !Utterance;
    pause.disabled = state !== 'playing';
    resume.disabled = state !== 'paused';
    stop.disabled = state !== 'playing' && state !== 'paused';
  };
  const finish = message => {
    const target = active?.statusTarget;
    active = null;
    chunks = [];
    chunkIndex = 0;
    setControls('idle');
    statusText(message, target);
  };
  const stop = (message = 'পড়া বন্ধ করা হয়েছে।') => {
    if (synth) synth.cancel();
    finish(message);
  };
  const speakNext = () => {
    if (!active) return;
    if (chunkIndex >= chunks.length) {
      finish('পড়া শেষ হয়েছে।');
      return;
    }
    const session = active;
    const utterance = new Utterance(chunks[chunkIndex++]);
    utterance.lang = voice.lang || 'bn-BD';
    utterance.voice = voice;
    utterance.rate = speed;
    utterance.onend = () => { if (active === session) speakNext(); };
    utterance.onerror = event => {
      if (active !== session) return;
      const reason = event && event.error === 'canceled' ? 'পড়া বন্ধ করা হয়েছে।' : 'বাংলা কণ্ঠে পড়া যায়নি। ব্রাউজারের বাংলা ভয়েস সেটিং পরীক্ষা করুন।';
      finish(reason);
    };
    synth.speak(utterance);
  };
  const start = (text, buttons, statusTarget) => {
    currentButtons = buttons || null;
    if (!synth || !Utterance) {
      setControls('idle');
      statusText('এই ব্রাউজারে কণ্ঠে পড়ে শোনানোর সুবিধা নেই।', statusTarget);
      return;
    }
    if (!chooseVoice()) {
      setControls('idle');
      statusText('এই ডিভাইস/ব্রাউজারে বাংলা কণ্ঠ পাওয়া যায়নি। বাংলা voice pack চালু করে পৃষ্ঠা রিফ্রেশ করুন। অন্য ভাষার কণ্ঠ ব্যবহার করা হবে না।', statusTarget);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      setControls('idle');
      statusText('পড়ে শোনানোর মতো বাংলা লেখা পাওয়া যায়নি।', statusTarget);
      return;
    }
    synth.cancel();
    active = {statusTarget,buttons};
    chunks = splitText(clean);
    chunkIndex = 0;
    setControls('playing');
    statusText('বাংলা কণ্ঠে পড়া হচ্ছে…', statusTarget);
    window.setTimeout(speakNext, 0);
  };
  const pageButtons = () => {
    const root = document.getElementById('readAloud');
    if (!root) return null;
    const actions = root.querySelector('.read-aloud-actions');
    if (!actions) return null;
    const buttons = {
      play: actions.querySelector('#readStart'),
      pause: actions.querySelector('#readPause'),
      resume: actions.querySelector('#readResume'),
      stop: actions.querySelector('#readStop')
    };
    if (Object.values(buttons).some(x => !x)) return null;
    return buttons;
  };
  function bindPageReader() {
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
      [['0.8','ধীরে'],['0.92','স্বাভাবিক'],['1.1','দ্রুত']].forEach(([value,label]) => {
        const option = document.createElement('option');
        option.value = value; option.textContent = label;
        if (value === '0.92') option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener('change', () => { speed = Number(select.value); });
      actions.appendChild(select);
    }
    toggle?.addEventListener('click', () => {
      root.classList.toggle('open');
      toggle.setAttribute('aria-expanded', root.classList.contains('open') ? 'true' : 'false');
    });
    buttons?.play.addEventListener('click', () => start(readableText(pageRoot()), buttons));
    buttons?.pause.addEventListener('click', () => {
      if (active?.buttons === buttons && synth) { synth.pause(); setControls('paused'); statusText('পড়া বিরতিতে আছে।'); }
    });
    buttons?.resume.addEventListener('click', () => {
      if (active?.buttons === buttons && synth) { synth.resume(); setControls('playing'); statusText('আবার পড়া হচ্ছে।'); }
    });
    buttons?.stop.addEventListener('click', () => { if (active?.buttons === buttons) stop(); });
    currentButtons = buttons;
    setControls('idle');
    if (!synth || !Utterance) statusText('এই ব্রাউজারে কণ্ঠে পড়ে শোনানোর সুবিধা নেই।');
    else if (!chooseVoice()) statusText('বাংলা কণ্ঠ খুঁজে দেখা হচ্ছে…');
    else statusText('বর্তমান পৃষ্ঠার বাংলা লেখা শুনতে শুরু করুন।');
  }
  function addCardReader(card) {
    if (!(card instanceof Element) || card.dataset.nexoraTtsReady === '1' || card.closest('#adminWorkspace')) return;
    const text = readableText(card);
    if (text.length < 25) return;
    card.dataset.nexoraTtsReady = '1';
    const box = document.createElement('div');
    box.className = 'nexora-read-aloud';
    box.setAttribute('aria-label','এই লেখাটি পড়ে শোনানোর নিয়ন্ত্রণ');
    const play = document.createElement('button');
    play.type = 'button'; play.textContent = '🔊 পড়ে শুনুন';
    const pause = document.createElement('button');
    pause.type = 'button'; pause.textContent = 'বিরতি'; pause.disabled = true;
    const resume = document.createElement('button');
    resume.type = 'button'; resume.textContent = 'আবার চালু'; resume.disabled = true;
    const halt = document.createElement('button');
    halt.type = 'button'; halt.textContent = 'বন্ধ'; halt.disabled = true;
    const status = document.createElement('span');
    status.className = 'nexora-tts-status';
    status.setAttribute('aria-live','polite');
    status.textContent = 'বাংলা কণ্ঠ প্রস্তুত হলে শুনুন';
    box.append(play,pause,resume,halt,status);
    card.appendChild(box);
    const buttons = {play,pause,resume,stop:halt};
    play.addEventListener('click', () => start(readableText(card), buttons, status));
    pause.addEventListener('click', () => {
      if (active?.buttons === buttons && synth) { synth.pause(); setControls('paused'); statusText('বিরতি দেওয়া হয়েছে।',status); }
    });
    resume.addEventListener('click', () => {
      if (active?.buttons === buttons && synth) { synth.resume(); setControls('playing'); statusText('আবার পড়া হচ্ছে।',status); }
    });
    halt.addEventListener('click', () => { if (active?.buttons === buttons) stop('পড়া বন্ধ করা হয়েছে।'); });
  }
  function scanCards(root = document) {
    if (root instanceof Element && root.matches(selectors)) addCardReader(root);
    root.querySelectorAll?.(selectors).forEach(addCardReader);
  }
  function init() {
    bindPageReader();
    scanCards();
    if (synth) {
      chooseVoice();
      synth.addEventListener?.('voiceschanged', chooseVoice);
    }
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1) scanCards(node);
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('hashchange', () => stop('নতুন পৃষ্ঠা খোলা হয়েছে।'));
    window.addEventListener('pagehide', () => { if (synth) synth.cancel(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();