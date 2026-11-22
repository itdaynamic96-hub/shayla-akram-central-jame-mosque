/* Shared Bengali content-length rule: maximum 500 whitespace-separated words per long-text field. */
(() => {
  'use strict';
  const LIMIT = 500;
  const whitespace = new RegExp(String.fromCharCode(92) + 's+');
  const countWords = value => {
    const text = String(value || '').trim();
    return text ? text.split(whitespace).length : 0;
  };
  const enhance = textarea => {
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.wordLimitReady === '1') return;
    textarea.dataset.wordLimitReady = '1';
    textarea.dataset.wordLimit = String(LIMIT);
    const counter = document.createElement('small');
    counter.className = 'word-limit-counter';
    counter.setAttribute('aria-live', 'polite');
    counter.style.cssText = 'display:block;margin-top:5px;font-size:12px;color:#65766b;';
    const update = () => {
      let words = countWords(textarea.value);
      if (words > LIMIT) {
        const parts = textarea.value.trim().split(whitespace);
        const clipped = parts.slice(0, LIMIT).join(' ');
        const pos = Math.min(textarea.selectionStart || clipped.length, clipped.length);
        textarea.value = clipped;
        try { textarea.setSelectionRange(pos, pos); } catch (_) {}
        words = LIMIT;
      }
      counter.textContent = 'শব্দ: ' + words + '/' + LIMIT + ' (সর্বোচ্চ ৫০০)';
      counter.style.color = words >= LIMIT ? '#a56a18' : '#65766b';
    };
    textarea.addEventListener('input', update);
    textarea.addEventListener('paste', () => setTimeout(update, 0));
    textarea.parentNode.insertBefore(counter, textarea.nextSibling);
    update();
  };
  const scan = root => {
    if (!root) return;
    if (root.matches?.('textarea')) enhance(root);
    root.querySelectorAll?.('textarea').forEach(enhance);
  };
  scan(document);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) scan(node);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const invalid = [...form.querySelectorAll('textarea')].find(el => countWords(el.value) > LIMIT);
    if (invalid) {
      event.preventDefault();
      event.stopImmediatePropagation();
      invalid.focus();
      alert('প্রতিটি বিস্তারিত লেখায় সর্বোচ্চ ৫০০ শব্দ লেখা যাবে। অনুগ্রহ করে লেখা সংক্ষিপ্ত করুন।');
    }
  }, true);
})();
