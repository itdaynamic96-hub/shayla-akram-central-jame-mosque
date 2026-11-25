/* Bengali Read Aloud for published article cards. Uses the visitor's browser speech engine. */
(() => {
  'use strict';
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
  const style = document.createElement('style');
  style.textContent = `
    .nexora-read-aloud{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin:12px 0;padding:9px 10px;border:1px solid #d8c58e;border-radius:10px;background:#fbf8ee}
    .nexora-read-aloud button{border:1px solid #bba66c;border-radius:7px;background:#17452f;color:#fff;padding:7px 11px;font:inherit;font-size:13px;cursor:pointer}
    .nexora-read-aloud button:disabled{opacity:.45;cursor:not-allowed}
    .nexora-read-aloud .nexora-tts-status{font-size:12px;color:#455b4b}
    .nexora-read-aloud select{max-width:115px;padding:5px;border:1px solid #cdbb8a;border-radius:6px;background:white;color:#173d2b}
    @media(prefers-reduced-motion:reduce){.nexora-read-aloud *{scroll-behavior:auto}}
  `;
  document.head.appendChild(style);
  let active = null;
  const stopActive = () => { window.speechSynthesis.cancel(); if (active) active.status.textContent = 'পড়া বন্ধ করা হয়েছে'; active = null; };
  const getText = card => {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.nexora-read-aloud,button,a,script,style,iframe,video').forEach(x => x.remove());
    return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
  };
  function addControls(card) {
    if (card.dataset.nexoraTtsReady === '1' || card.closest('#adminWorkspace')) return;
    const text = getText(card);
    if (text.length < 35) return;
    card.dataset.nexoraTtsReady = '1';
    const box = document.createElement('div');
    box.className = 'nexora-read-aloud';
    box.setAttribute('aria-label','লেখা পড়ে শোনানোর নিয়ন্ত্রণ');
    const play = document.createElement('button'); play.type='button'; play.textContent='🔊 পড়ে শুনুন';
    const pause = document.createElement('button'); pause.type='button'; pause.textContent='বিরতি'; pause.disabled=true;
    const resume = document.createElement('button'); resume.type='button'; resume.textContent='আবার চালু'; resume.disabled=true;
    const stop = document.createElement('button'); stop.type='button'; stop.textContent='বন্ধ'; stop.disabled=true;
    const speed = document.createElement('select'); speed.setAttribute('aria-label','পড়ার গতি');
    [['0.8','ধীরে'],['1','স্বাভাবিক'],['1.2','দ্রুত']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;speed.appendChild(o)});
    const status=document.createElement('span');status.className='nexora-tts-status';status.setAttribute('aria-live','polite');status.textContent='বাংলা কণ্ঠ ডিভাইস/ব্রাউজারভেদে ভিন্ন হতে পারে';
    const controls=[play,pause,resume,stop,speed,status];controls.forEach(x=>box.appendChild(x));card.appendChild(box);
    play.addEventListener('click',()=>{
      stopActive();
      const utterance=new SpeechSynthesisUtterance(text);
      utterance.lang='bn-BD';utterance.rate=Number(speed.value);
      const voices=window.speechSynthesis.getVoices();
      const bn=voices.find(v=>/^bn(-|_)/i.test(v.lang))||voices.find(v=>/bengali|bangla/i.test(v.name));
      if(bn)utterance.voice=bn;
      active={card,status,utterance};
      status.textContent=bn?'বাংলা কণ্ঠে পড়া হচ্ছে':'ডিভাইসের ডিফল্ট কণ্ঠে পড়া হচ্ছে';
      play.disabled=true;pause.disabled=false;resume.disabled=true;stop.disabled=false;
      utterance.onend=()=>{if(active?.utterance===utterance){status.textContent='পড়া শেষ';active=null;play.disabled=false;pause.disabled=true;resume.disabled=true;stop.disabled=true}};
      utterance.onerror=()=>{if(active?.utterance===utterance){status.textContent='কণ্ঠসেবা পাওয়া যায়নি';active=null;play.disabled=false;pause.disabled=true;resume.disabled=true;stop.disabled=true}};
      window.speechSynthesis.speak(utterance);
    });
    pause.addEventListener('click',()=>{if(active?.card===card){window.speechSynthesis.pause();status.textContent='বিরতি দেওয়া হয়েছে';pause.disabled=true;resume.disabled=false}});
    resume.addEventListener('click',()=>{if(active?.card===card){window.speechSynthesis.resume();status.textContent='আবার পড়া হচ্ছে';pause.disabled=false;resume.disabled=true}});
    stop.addEventListener('click',()=>{if(active?.card===card){stopActive();play.disabled=false;pause.disabled=true;resume.disabled=true;stop.disabled=true}});
  }
  function scan(root=document) {
    root.querySelectorAll('.article-card, #article-slots article, .content-slot.article-card, article[data-category="article"]').forEach(addControls);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan());else scan();
  const observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.matches?.('.article-card, #article-slots article, .content-slot.article-card, article[data-category="article"]'))addControls(n);scan(n)}})));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.speechSynthesis.onvoiceschanged=()=>scan();
})();