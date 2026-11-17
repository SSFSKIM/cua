// #374's fixture page, served by measure.mjs on 127.0.0.1. Three targets, each asked for its menu by the engine's
// perform_secondary_action "Show Menu":
//   native  a textarea with no handler: the browser's own context menu (an AXMenu child of the application).
//   aria    a button whose contextmenu handler cancels the browser's menu (preventDefault) and opens a role=menu of the
//           page's own, moving the focus onto its first item (the WAI-ARIA menu pattern): Chrome and Safari expose it as
//           AXMenu, so it counts as the menu through the focus.
//   own     a button whose handler cancels the browser's menu and draws a menu of plain elements with no role and no
//           focus, as Docs-style apps do: the negative control. The engine cannot see it, so the honest answer is
//           menuUnconfirmed, and the page's counter shows the request reached it.
// The page posts its state to /state on every change and every 100 ms, and takes {op: "reset"} from /cmd.
export const TARGETS = Object.freeze({native: 'Native menu target', aria: 'ARIA menu target', own: 'Own menu target'});
// Non-menu pop-ups, for the question whether a pop-up-level window can appear with no menu: a tooltip (title) and a
// datalist's suggestions.
export const POPUPS = Object.freeze({tooltip: 'Tooltip target', datalist: 'Datalist target'});

export function page() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>probe374</title><style>
body{margin:16px;font:15px sans-serif}textarea,.target{display:block;width:420px;margin:0 0 18px 0;padding:10px;border:1px solid #444}
textarea{height:70px}.target{background:#eef}.menu{position:absolute;background:#fff;border:1px solid #333;padding:4px;min-width:140px}
.menu>div{padding:4px 8px}.menu>div:focus{background:#cce}[hidden]{display:none}</style></head><body>
<textarea id="native" aria-label="${TARGETS.native}">Right-click here for the browser's own menu.</textarea>
<div id="aria" class="target" role="button" tabindex="0" aria-haspopup="menu" aria-label="${TARGETS.aria}">The page's ARIA menu</div>
<div id="own" class="target" role="button" tabindex="0" aria-label="${TARGETS.own}">The page's own menu, no menu role</div>
<div id="ariamenu" class="menu" role="menu" aria-label="Page menu" hidden><div role="menuitem" tabindex="-1">Copy link</div><div role="menuitem" tabindex="-1">Rename</div></div>
<span id="tip" title="Tooltip text for the probe" aria-label="${POPUPS.tooltip}" style="display:inline-block;padding:10px;border:1px dashed #888">Hover for a tooltip</span>
<input id="dl" list="dlopts" aria-label="${POPUPS.datalist}" style="display:block;margin-top:14px;width:300px"><datalist id="dlopts"><option value="apple"><option value="apricot"><option value="avocado"></datalist>
<div id="ownmenu" class="menu" hidden><div>Copy link</div><div>Rename</div></div>
<script>
const counts={native:0,aria:0,own:0},prevented={native:0,aria:0,own:0};let seq=0;
const $=id=>document.getElementById(id);
function state(){const a=document.activeElement;return {seq:++seq,at:Date.now(),counts,prevented,ariaOpen:!$('ariamenu').hidden,ownOpen:!$('ownmenu').hidden,
 active:a?{id:a.id||null,role:a.getAttribute&&a.getAttribute('role')}:null,hasFocus:document.hasFocus(),visibility:document.visibilityState}}
const post=()=>fetch('/state',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(state())}).catch(()=>{});
function place(menu,x,y){menu.style.left=x+'px';menu.style.top=y+'px';menu.hidden=false}
function closeMenus(){$('ariamenu').hidden=true;$('ownmenu').hidden=true}
for(const id of ['native','aria','own'])$(id).addEventListener('contextmenu',e=>{
 counts[id]++;
 if(id==='aria'){e.preventDefault();prevented[id]++;closeMenus();place($('ariamenu'),e.pageX||40,e.pageY||200);$('ariamenu').firstElementChild.focus()}
 if(id==='own'){e.preventDefault();prevented[id]++;closeMenus();place($('ownmenu'),e.pageX||40,e.pageY||260)}
 post();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenus();post()}});
document.addEventListener('mousedown',e=>{if(!e.target.closest('.menu')){closeMenus();post()}});
setInterval(post,100);
(async()=>{for(;;){try{const r=await fetch('/cmd',{cache:'no-store'});const c=await r.json();
 if(c.op==='reset'){closeMenus();document.activeElement&&document.activeElement.blur&&document.activeElement.blur();post()}
}catch{}await new Promise(r=>setTimeout(r,100))}})();
post();
</script></body></html>`;
}
