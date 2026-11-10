// Live #298 A/B cells adapted from origin/probe/298-measure, on the shared hosted kit.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {placePid} from '../probe-316/browser.mjs';
import {stopOwnedChild} from './browser-lifecycle.mjs';

export const SEED='Old draft sentence goes here.', TYPED='New typed sentence goes here.';
const WEB=[
  ['tick','keep','<button id="target" class="fixed">Elapsed 0.0 s</button>',null],
  ['nextto','keep','<span id="counter" style="display:inline-block;width:100px">0.0</span><button id="target" class="fixed">Next to</button>',null],
  ['like','keep','<button id="target" class="fixed">Like (12)</button>',"e.textContent='Like (13)'"],
  ['items','keep','<button id="target" class="fixed">1 item</button>',"e.textContent='2 items'"],
  ['notif','keep','<button id="target" class="fixed" aria-label="Notifications">*</button>',"e.setAttribute('aria-label','Notifications, 3 new')"],
  ['follow','relabelled','<button id="target" class="fixed">Follow</button>',"e.textContent='Following'"],
  ['play','relabelled','<button id="target" class="fixed">Play</button>',"e.textContent='Pause'"],
  ['save','relabelled','<button id="target" class="fixed">Save</button>',"e.textContent='Delete'"],
  ['savearia','relabelled','<button id="target" class="fixed" aria-label="Save" title="Save">&#x2B07;</button>',"e.setAttribute('aria-label','Delete');e.title='Delete'"],
  ['deleteall','relabelled','<button id="target" class="fixed">Delete</button>',"e.textContent='Delete all'"],
  ['region','keep','<section id="target" class="box" role="region" aria-label="Inbox"><p>Messages</p></section>',"e.setAttribute('aria-label','Inbox (3)')"],
  ['labelledby','keep','<div id="target" class="box" role="group" aria-labelledby="h-lb"><b id="h-lb">Inbox</b><p>Messages</p></div>',"document.getElementById('h-lb').textContent='Inbox (3)'"],
  ['dialog','relabelled','<div id="target" class="box" role="dialog" aria-label="Save changes?"><p>Body</p></div>',"e.setAttribute('aria-label','Delete file?')"],
  ['linknv','keep','<a id="target" href="#">Inbox</a>',"e.firstChild.nodeValue='Inbox (3)'"],
  ['linksavenv','relabelled','<a id="target" href="#">Save</a>',"e.firstChild.nodeValue='Delete'"],
  ['linkmono','relabelled','<a id="target" href="#" style="font-family:monospace">Save</a>',"e.textContent='Send'"],
  ['divbtn','relabelled','<div id="target" onclick="void 0" style="cursor:pointer;display:inline-block">Save</div>',"e.firstChild.nodeValue='Delete'"],
  ['divtick','keep','<div id="target" onclick="void 0" style="cursor:pointer;display:inline-block">Elapsed 0.0 s</div>',null],
  ['btnnv','relabelled','<button id="target" class="fixed">Save</button>',"e.firstChild.nodeValue='Delete'"],
  ['linklike','keep','<a id="target" href="#">Like (12)</a>',"e.textContent='Like (13)'"],
];
export const WEB_PLAN=[
  ...[1,5,20].map(seconds=>({caseName:`tick-${seconds}s`,key:'tick',expectation:'keep',delay:seconds*1000})),
  ...WEB.filter(x=>x[0]!=='tick').map(([key,expectation])=>({caseName:key,key,expectation,delay:500})),
  ...['webarea','window','tab'].map(key=>({caseName:key,key,expectation:'keep',delay:500})),
  ...['typed-gmail','typed-contenteditable','typed-textarea'].map(key=>({caseName:key,key,expectation:'keep',typed:true})),
  {caseName:'typed-link',key:'typed-link',expectation:'relabelled',typed:true},
];
export const NATIVE_PLAN=[
  ...[1,5,20].map(seconds=>({caseName:`tick-${seconds}s`,key:'tick',expectation:'keep',delay:seconds*1000})),
  ...['like','items','window'].map(key=>({caseName:key,key,expectation:'keep',delay:500})),
  ...['relabel','alabel','noid','follow','play','deleteall'].map(key=>({caseName:key,key,expectation:'relabelled',delay:500})),
];

export function relabelledPage(key,script) {
  const spec=WEB.find(x=>x[0]===key);
  let body=spec?.[2]??'<p id="target">Page title control</p>',change=spec?.[3]??'';
  if(key.startsWith('typed-')) {
    const textStyle='font:16px/24px monospace;box-sizing:border-box;width:500px;height:140px;padding:8px;border:1px solid;white-space:pre-wrap';
    body=key==='typed-textarea'?`<textarea id="editor" aria-label="Draft control" style="${textStyle}">${SEED}</textarea>`
      :`<div id="editor" contenteditable="true" ${key==='typed-gmail'?'role="textbox" aria-label="Message Body" aria-multiline="true"':''} style="${textStyle};position:relative">${key==='typed-gmail'?`<div>${SEED}</div>`:`<span id="seed">${SEED}</span>`}${key==='typed-link'?'<a id="target" aria-label="Save" href="#" style="position:absolute;left:280px;top:80px;display:inline-block;width:130px;height:32px;line-height:32px">Save</a>':''}</div>`;
    change=key==='typed-link'?"e.textContent='Delete';e.setAttribute('aria-label','Delete')":'';
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe298 page</title><style>body{margin:16px;font:13px sans-serif}button{font:13px sans-serif;padding:4px 8px}.fixed{width:170px;height:30px;padding:0}.box{border:1px solid;width:320px;height:70px;overflow:hidden}.box p{margin:0}</style></head><body><h3>probe298 ${key}</h3>${body}<script>(()=>{
const kind=${JSON.stringify(key)},$=s=>document.querySelector(s),editor=$('#editor'),target=$('#target')||editor;
const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
const content=()=>editor?(editor.value??editor.textContent):target.textContent;
const geometry=()=>{
 const e=target,host=editor||e;let textRects=[];
 if(editor&&editor.tagName==='TEXTAREA') {const f=host.getBoundingClientRect(),s=getComputedStyle(host),c=document.createElement('canvas').getContext('2d');c.font=s.font;textRects=[{x:f.x+parseFloat(s.paddingLeft)+1,y:f.y+parseFloat(s.paddingTop)+1,width:c.measureText(content().split('\\n')[0]).width,height:parseFloat(s.lineHeight)}];}
 else {const r=document.createRange();r.selectNodeContents(editor&&kind!=='typed-link'?editor:e);textRects=Array.from(r.getClientRects(),rect).filter(r=>r.width>0&&r.height>0).sort((a,b)=>a.width*a.height-b.width*b.height);}
 let editorRects=[];if(editor&&editor.tagName!=='TEXTAREA'){const r=document.createRange();r.selectNodeContents(editor.querySelector('#seed')||editor);editorRects=Array.from(r.getClientRects(),rect).filter(r=>r.width>0&&r.height>0).sort((a,b)=>a.width*a.height-b.width*b.height);}
 const labelled=e.getAttribute('aria-labelledby');return {kind,case:location.search,text:content(),label:e.getAttribute('aria-label')||(labelled?document.getElementById(labelled).textContent:e.textContent),anchor:rect(host.getBoundingClientRect()),target:rect(e.getBoundingClientRect()),textRects,editorRects,inEditable:!!e.closest('[contenteditable="true"]')};
};
const send=o=>navigator.sendBeacon('/ev',JSON.stringify({kind,case:location.search,...o}));
addEventListener('load',()=>send({type:'fixture',...geometry()}));
window.__change=()=>{const before=geometry(),e=target,start=performance.now();
 if(['tick','divtick','nextto'].includes(kind)) {setInterval(()=>{const s=((performance.now()-start)/1000).toFixed(1);if(kind==='nextto')$('#counter').textContent=s;else if(kind==='divtick')e.firstChild.nodeValue='Elapsed '+s+' s';else e.textContent='Elapsed '+s+' s';send({type:'mutation',mutation:'relabel',before,after:geometry()});},100);return;}
 ${change};if(['webarea','window','tab'].includes(kind))document.title='(3) probe298 page';
 send({type:'mutation',mutation:'relabel',before,after:geometry(),title:document.title});
};
document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);
})();</script>${script}</body></html>`;
}

const label=n=>[n.title,n.description,n.value].find(s=>typeof s==='string'&&s.trim())?.trim()??'';
const same=(n,s)=>[n.title,n.description,n.value].some(v=>typeof v==='string'&&v.trim()===s);
const centre=n=>({x:n.frame.x+n.frame.width/2,y:n.frame.y+n.frame.height/2});
const holds=(f,p)=>f&&p&&p.x>f.x&&p.x<f.x+f.width&&p.y>f.y&&p.y<f.y+f.height;
export function relabelTarget(sky,plan,fixture) {
  if(!fixture)return null;
  if(plan.key==='window') {const n=sky.nodes.find(n=>n.role==='AXWindow')??{role:'AXWindow',title:sky.window.title,frame:sky.window.frame};return {node:n,point:{x:n.frame.x+n.frame.width/2,y:n.frame.y+12},fixture:{before:fixture}};}
  if(plan.key==='webarea') {const n=sky.nodes.find(n=>n.role==='AXWebArea'&&n.frame);return n?{node:n,point:{x:n.frame.x+n.frame.width-20,y:n.frame.y+n.frame.height-20},fixture:{before:fixture}}:null;}
  if(plan.key==='tab') {const n=sky.nodes.find(n=>n.frame&&n.subrole==='AXTabButton')??sky.nodes.find(n=>n.frame&&['AXTab','AXRadioButton'].includes(n.role)&&label(n).includes('probe298'));return n?{node:n,point:centre(n),fixture:{before:fixture}}:null;}
  if(plan.typed&&plan.key!=='typed-link') {
    const line=fixture.textRects[0],leaf=sky.nodes.find(n=>n.role==='AXStaticText'&&n.frame&&same(n,SEED));
    const n=leaf??sky.nodes.find(n=>n.role==='AXTextArea'&&n.frame)??sky.nodes.find(n=>n.frame&&Math.abs(n.frame.width-fixture.anchor.width)<3&&Math.abs(n.frame.height-fixture.anchor.height)<3);
    if(!n||!line)return null;
    const anchor=leaf?line:fixture.anchor,p={x:line.x+Math.min(32,line.width/3),y:line.y+line.height/2};
    return {node:n,point:{x:n.frame.x+p.x-anchor.x,y:n.frame.y+p.y-anchor.y},fixture:{before:fixture,domPoint:p}};
  }
  const text=['linknv','linksavenv','linkmono','divbtn','divtick','linklike'].includes(plan.key);
  const n=(text?sky.nodes.find(n=>n.role==='AXStaticText'&&n.frame&&same(n,fixture.label)):null)
    ??sky.nodes.find(n=>n.frame&&['AXButton','AXLink','AXGroup','AXDialog'].includes(n.role)&&same(n,fixture.label))
    ??sky.nodes.find(n=>n.frame&&same(n,fixture.label));
  if(!n)return null;
  const point=['region','labelledby','dialog'].includes(plan.key)?{x:n.frame.x+n.frame.width/2,y:n.frame.y+n.frame.height-4}
    :plan.key==='typed-link'?{x:n.frame.x+n.frame.width-4,y:n.frame.y+n.frame.height/2}
    :text?centre(n):{x:n.frame.x+4,y:n.frame.y+n.frame.height/2};
  return {node:n,point,fixture:{before:fixture}};
}
export function typedCoverage(row,plan) {
  const m=row.mutations?.find(m=>m.mutation==='relabel'),before=row.fixture?.before,after=m?.after,issues=[];
  if(!row.click||row.problem||row.exception)issues.push('click did not complete');
  if(!m)issues.push('fixture mutation evidence missing');
  if(plan.typed) {
    if(!row.steps?.length||row.steps.some(s=>s.answer?.error))issues.push('typing sequence failed');
    const expected=plan.key==='typed-link'?'Typed sentence.':TYPED;
    if(!after?.text?.includes(expected))issues.push('typed sentence absent from editor');
    if(plan.key!=='typed-link'&&!after?.textRects?.some(r=>holds(r,row.fixture?.domPoint)))issues.push('old screenshot point is outside typed text');
    if(plan.key==='typed-link') {
      if(before?.label!=='Save'||after?.label!=='Delete'||!before?.inEditable||!after?.inEditable)issues.push('edited-region link did not change Save to Delete inside the editor');
      const n=row.observation?.chosen;
      if(n?.role!=='AXLink'||!n.actions?.includes('AXPress'))issues.push('edited-region target is not an AXPress link');
    }
  }
  return {valid:!issues.length,issues,oldLabel:before?.label,newLabel:after?.label,oldText:before?.text,newText:after?.text};
}

export async function runRelabel(kind,a) {
  const {config,stillHarness,stillCell,URL_,events,sendCmd,sleep,save,REPS,overBudget,toPixels,brief,version}=a;
  config[`${kind}Version`]=version(kind);
  const plan=WEB_PLAN.filter(p=>p.key!=='tab'||kind==='cft');
  config.relabelCases=plan.map(p=>({caseName:p.caseName,expectation:p.expectation}));
  const h=await stillHarness(kind);
  try {for(let rep=1;rep<=REPS;rep++)for(const p of plan) {
    if(overBudget()){config.budgetStop=true;return;}
    const url=new URL(`r?kind=${p.key}&case=${rep}-${p.caseName}`,URL_),mark=events.length;
    const reset=await h.reset(url.href);
    let fixture;for(let i=0;i<30;i++){fixture=events.slice(mark).find(e=>e.type==='fixture'&&e.kind===p.key&&e.case===url.search);if(fixture)break;await sleep(100);}
    const row=await stillCell({app:kind,scene:'relabelled',cell:p.caseName,caseName:p.caseName,expectation:p.expectation,at:'old-screenshot',rep,reset},h.pid(),'shared',sky=>relabelTarget(sky,p,fixture),async({w,sky,row})=>{
      if(p.typed) {
        const point=p.key==='typed-link'?relabelTarget(sky,{...p,key:'typed-contenteditable'}, {...fixture,text:SEED,textRects:fixture.editorRects}):{point:row.point.screen};
        if(!point?.point)throw new Error('no editable text point');
        row.steps=[];
        const run=async(method,args)=>{const answer=brief(await w.execute(method,{pid:h.pid(),...args}));row.steps.push({method,answer});if(answer.error)throw new Error(`typing ${method}: ${answer.message}`);};
        await run('click',toPixels(sky,point.point).px);
        if(p.key!=='typed-link')await run('press_key',{key:'cmd+a'});
        await run('type_text',{text:p.key==='typed-link'?'Typed sentence. ':TYPED});
      }
      sendCmd('change');await sleep(p.delay??500);
    });
    row.coverage=typedCoverage(row,p);save();
  }} finally {await h.close();save();}
}

export async function runRelabelNative(a) {
  const {OUT,WIN,config,stillCell,sleep,save,REPS,overBudget,setFront}=a;
  const cmd=join(OUT,'relabel-native-cmd.txt'),log=join(OUT,'relabel-native-log.jsonl');writeFileSync(cmd,'');writeFileSync(log,'');
  const records=()=>existsSync(log)?readFileSync(log,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s)):[];
  const child=spawn(process.env.P330_RELABEL_APP,[cmd,log],{stdio:['ignore','ignore','inherit']});let nonce=0;
  const command=async op=>{const n=String(++nonce);writeFileSync(cmd,`${n} ${op}\n`);for(let i=0;i<100;i++){if(records().some(e=>e.ev==='cmd'&&e.nonce===n))return;await sleep(50);}throw new Error(`native ${op} not acknowledged`);};
  config.relabelCases=NATIVE_PLAN.map(p=>({caseName:p.caseName,expectation:p.expectation}));
  try {
    for(let i=0;i<100&&!records().some(e=>e.ev==='ready');i++)await sleep(100);
    if(!records().some(e=>e.ev==='ready'))throw new Error('native fixture did not become ready');
    placePid(child.pid,WIN);setFront(child.pid);await sleep(500);
    for(let rep=1;rep<=REPS;rep++)for(const p of NATIVE_PLAN) {
      if(overBudget()){config.budgetStop=true;return;}
      await command('reset');await sleep(200);
      const row=await stillCell({app:'native298',scene:'relabelled',cell:p.caseName,caseName:p.caseName,expectation:p.expectation,at:'old-screenshot',rep},child.pid,'shared',sky=>{
        let n=p.key==='window'?(sky.nodes.find(n=>n.role==='AXWindow')??{role:'AXWindow',title:sky.window.title,frame:sky.window.frame})
          :p.key==='noid'?sky.nodes.find(n=>n.role==='AXButton'&&!n.identifier&&same(n,'Save'))
          :sky.nodes.find(n=>n.role==='AXButton'&&n.identifier===p.key);
        if(!n)return null;
        return {node:n,point:p.key==='window'?{x:n.frame.x+n.frame.width/2,y:n.frame.y+12}:centre(n)};
      },async({row})=>{row.nativeBefore=records().length;if(p.key!=='tick')await command('mutate');await sleep(p.delay);row.nativeChanged=p.key==='tick'||records().slice(row.nativeBefore).some(e=>e.ev==='cmd'&&e.op==='mutate');});
      const oldLabel=label(row.observation?.chosen??{}),newLabel=row.signals?.hit?.chain?.find(c=>c[0]==='AXButton')?.slice(4,7).find(s=>typeof s==='string'&&s.trim());
      const tickChanged=p.key!=='tick'||(typeof newLabel==='string'&&newLabel!==oldLabel);
      row.coverage={valid:!!row.click&&!row.problem&&!row.exception&&row.nativeChanged===true&&tickChanged,issues:[...(!row.nativeChanged?['native change not confirmed']:[]),...(!tickChanged?['native ticking label did not change']:[])],oldLabel,newLabel};
      row.nativeEvents=records().slice(row.nativeBefore??0);save();
    }
  } finally {config.nativeFixtureEvents=records();await stopOwnedChild(child);save();}
}
