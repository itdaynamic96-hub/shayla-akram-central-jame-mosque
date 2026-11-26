(function(){
'use strict';
const ALLOWED=new Set(['B','STRONG','U','EM','I','P','BR','DIV','UL','OL','LI','SPAN','H1','H2','H3','H4','H5','H6','BLOCKQUOTE']);
function clean(value){
 const source=String(value??'');
 const doc=new DOMParser().parseFromString('<body>'+source+'</body>','text/html');
 function copy(node,parent){
  if(node.nodeType===Node.TEXT_NODE){parent.appendChild(document.createTextNode(node.nodeValue||''));return}
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const tag=node.tagName;
  if(!ALLOWED.has(tag)){if(!['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH'].includes(tag))Array.from(node.childNodes).forEach(child=>copy(child,parent));return}
  const el=document.createElement(tag.toLowerCase());
  if(['SPAN','P','DIV','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE'].includes(tag)){
   const style=node.getAttribute('style')||'';
   const size=style.match(/font-size\s*:\s*(\d{1,2})px/i);
   const color=style.match(/color\s*:\s*(#[0-9a-f]{6}|rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\))/i);
   const rules=[];
   if(size&&Number(size[1])>=10&&Number(size[1])<=72)rules.push('font-size:'+Number(size[1])+'px');
   if(color){let hex=color[1];if(!hex.startsWith('#')){const channels=color.slice(2,5).map(Number);if(channels.every(n=>n>=0&&n<=255))hex='#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('')}if(/^#[0-9a-f]{6}$/i.test(hex))rules.push('color:'+hex.toLowerCase())}
   const align=style.match(/text-align\s*:\s*(left|center|right|justify|start|end)\b/i);if(align)rules.push('text-align:'+align[1].toLowerCase());if(rules.length)el.setAttribute('style',rules.join(';'));
  }
  Array.from(node.childNodes).forEach(child=>copy(child,el));parent.appendChild(el);
 }
 const out=document.createElement('div');Array.from(doc.body.childNodes).forEach(n=>copy(n,out));
 return out.innerHTML;
}
function html(value){
 const s=String(value??'');
 if(!/[<][a-z][^>]*>/i.test(s))return s.split(/\r?\n/).map(x=>escapeText(x)).join('<br>');
 return clean(s);
}
function escapeText(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function init(root=document){
 const candidates=root.querySelectorAll('[data-rich-editor="true"],textarea:not([data-no-rich]),input[type="text"]:not([data-no-rich])');
 candidates.forEach(field=>{
  if(!field.matches('[data-rich-editor="true"]')&&!document.body.hasAttribute('data-rich-text-admin'))return;
  const hint=[field.id,field.name,field.placeholder,field.getAttribute('aria-label'),field.parentNode?.textContent].join(' ').toLowerCase();
  if(/phone|mobile|email|url|link|slug|code|number|date|time|amount|account|reference|receipt|password|search|filter|token|\bid\b|bank|routing|postal|zip|nid|passport|username/.test(hint))return;
  if(!field.parentNode)return;
  field.dataset.richReady='1';field.dataset.richRequired=field.required?'true':'false';field.required=false;
  const wrap=document.createElement('div');wrap.className='rich-editor-wrap';
  const toolbar=document.createElement('div');toolbar.className='rich-editor-toolbar';
  const editor=document.createElement('div');editor.className='rich-editor-surface';editor.contentEditable='true';editor.setAttribute('role','textbox');editor.setAttribute('aria-multiline',field.tagName==='TEXTAREA'?'true':'false');if(field.dataset.richRequired==='true')editor.setAttribute('aria-required','true');
  editor.id=field.id?field.id+'_rich_editor':'';editor.innerHTML=html(field.value||'');const linkedLabel=field.id?[...document.querySelectorAll('label[for]')].find(label=>label.htmlFor===field.id):null;if(linkedLabel)linkedLabel.htmlFor=editor.id;
  if(field.tagName==='TEXTAREA')editor.style.minHeight=(Number(field.rows)||3)*1.65+'em';
  const bold=makeButton('B','বোল্ড',()=>document.execCommand('bold'));
  bold.classList.add('rich-tool-bold');
  const underline=makeButton('U','আন্ডারলাইন',()=>document.execCommand('underline'));underline.classList.add('rich-tool-underline');
  const size=document.createElement('select');size.className='rich-tool-size';size.setAttribute('aria-label','লেখার আকার');size.title='লেখার আকার';
  [['','আকার'],['12','12 px'],['14','14 px'],['16','16 px'],['18','18 px'],['20','20 px'],['24','24 px'],['28','28 px'],['32','32 px'],['36','36 px'],['42','42 px'],['48','48 px'],['56','56 px'],['64','64 px'],['72','72 px']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;size.appendChild(o)});
  size.addEventListener('mousedown',rememberSelection);size.addEventListener('change',()=>{restoreSelection();if(size.value)wrapSelection(editor,'font-size',size.value+'px');size.value=''});
  const colorLabel=document.createElement('label');colorLabel.className='rich-tool-color';colorLabel.title='লেখার রং';colorLabel.textContent='রং';
  const color=document.createElement('input');color.type='color';color.value='#174b35';color.setAttribute('aria-label','লেখার রং');color.addEventListener('mousedown',rememberSelection);color.addEventListener('input',()=>{restoreSelection();wrapSelection(editor,'color',color.value)});colorLabel.appendChild(color);
  const clear=makeButton('↺','ফরম্যাট সরান',()=>{document.execCommand('removeFormat');});
  const alignGroup=document.createElement('span');alignGroup.className='rich-tool-align-group';alignGroup.setAttribute('role','group');alignGroup.setAttribute('aria-label','লেখার এলাইনমেন্ট');
  [['justifyLeft','বাম','বাম দিকে সাজান'],['justifyCenter','মাঝ','মাঝখানে সাজান'],['justifyRight','ডান','ডান দিকে সাজান'],['justifyFull','Justify','দুই পাশ সমান (Justify)']].forEach(([command,label,title])=>{const b=makeButton(label,title,()=>document.execCommand(command));b.classList.add('rich-tool-align');if(command==='justifyFull')b.classList.add('rich-tool-justify');alignGroup.appendChild(b)});
  toolbar.append(bold,underline,size,colorLabel,alignGroup,clear);
  field.parentNode.insertBefore(wrap,field);wrap.append(toolbar,editor);wrap.appendChild(field);field.classList.add('rich-editor-source');
  let savedRange=null;
  const rememberSelection=()=>{const selection=window.getSelection();if(selection?.rangeCount&&editor.contains(selection.anchorNode))savedRange=selection.getRangeAt(0).cloneRange()};
  const restoreSelection=()=>{editor.focus();if(!savedRange||!editor.contains(savedRange.commonAncestorContainer))return;const selection=window.getSelection();selection.removeAllRanges();selection.addRange(savedRange.cloneRange())};
  const sync=()=>{field.value=(editor.textContent||'').trim()?clean(editor.innerHTML):'';field.dispatchEvent(new Event('input',{bubbles:true}))};
  editor.addEventListener('keydown',event=>{if(field.tagName==='INPUT'&&event.key==='Enter')event.preventDefault()});editor.addEventListener('keyup',rememberSelection);editor.addEventListener('mouseup',rememberSelection);editor.addEventListener('input',()=>{sync();rememberSelection()});editor.addEventListener('blur',()=>{editor.innerHTML=clean(editor.innerHTML);sync()});
  field.addEventListener('change',()=>{if(document.activeElement!==editor)editor.innerHTML=html(field.value)});
 });
}
function makeButton(label,title,action){const b=document.createElement('button');b.type='button';b.className='rich-tool-button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{action();const editor=b.closest('.rich-editor-wrap')?.querySelector('.rich-editor-surface');if(editor){editor.focus();editor.dispatchEvent(new Event('input',{bubbles:true}))}});return b}
function wrapSelection(editor,property,value){
 editor.focus();const selection=window.getSelection();if(!selection||!selection.rangeCount)return;
 const range=selection.getRangeAt(0);if(!editor.contains(range.commonAncestorContainer)||range.collapsed)return;
 const span=document.createElement('span');span.style.setProperty(property,value);
 try{range.surroundContents(span)}catch(_){const fragment=range.extractContents();span.appendChild(fragment);range.insertNode(span)}
 selection.removeAllRanges();const next=document.createRange();next.selectNodeContents(span);selection.addRange(next);editor.dispatchEvent(new Event('input',{bubbles:true}));
}
function refresh(root=document){root.querySelectorAll('[data-rich-editor][data-rich-ready]').forEach(field=>{const editor=field.parentNode?.querySelector('.rich-editor-surface');if(editor)editor.innerHTML=html(field.value||'')})}
window.MosqueRichText={clean,html,init,refresh};
document.addEventListener('reset',event=>queueMicrotask(()=>refresh(event.target)),true);
document.addEventListener('submit',event=>{const invalid=[...event.target.querySelectorAll('[data-rich-ready][data-rich-required="true"]')].find(field=>!String(field.value||'').trim());if(invalid){event.preventDefault();invalid.parentNode?.querySelector('.rich-editor-surface')?.focus();alert('অনুগ্রহ করে প্রয়োজনীয় লেখার ঘরটি পূরণ করুন।')}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init());else init();
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches?.('[data-rich-editor="true"]'))init(node.parentNode||document);init(node)}});
observer.observe(document.documentElement,{childList:true,subtree:true});
})();