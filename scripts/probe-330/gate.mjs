// Shared #330 / #298 live gate. Engine heads are selected by the workflow, not by these cells.
// Local pages isolate automatic mutations whose intended target remains clickable; real-site cells use #305's picks.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {placePid} from '../probe-316/browser.mjs';
import {stopOwnedChild} from './browser-lifecycle.mjs';

const LINK_CASES = {
  'link-same': ['Like (12)', 'Like (13)', 'width:180px;font-variant-numeric:tabular-nums'],
  'link-grow': ['Inbox', 'Inbox (3)', ''],
};
export function gatePage(kind, script) {
  let body = '', change = '';
  if (LINK_CASES[kind]) {
    const [before, after, style] = LINK_CASES[kind];
    body = `<a id="target" href="#kept" style="display:inline-block;padding:14px 32px;${style}">${before}</a>`;
    change = `const before=geometry(); document.querySelector('#target').textContent=${JSON.stringify(after)}; report('textContent',{before,after:geometry()});`;
  } else if (kind === 'recreate') {
    body = '<div id="list"><button id="target" style="width:160px;height:44px">Again</button></div>';
    change = `let generation=0; setInterval(()=>{const b=document.querySelector('#target'); b.replaceWith(b.cloneNode(true)); report('recreated', {generation:++generation});},500);`;
  } else if (kind === 'clock' || kind === 'relative') {
    const textStyle='display:inline-block;font:20px/28px monospace;font-variant-numeric:tabular-nums;white-space:pre';
    body = kind==='clock'
      ? `<div style="height:40px"><span id="target" style="${textStyle};width:8ch">12:00:00</span></div>`
      : `<ul style="padding:0;list-style:none"><li><a id="row" aria-label="Inbox message" href="#kept" style="display:block;position:relative;box-sizing:border-box;width:500px;height:70px;padding:16px"><span>Message subject</span><span id="target" style="${textStyle};position:absolute;right:16px;top:20px;width:7ch">0 s ago</span></a></li></ul>`;
    change = `let tick=0; setInterval(()=>{const before=geometry(); ++tick; document.querySelector('#target').textContent=kind==='clock'?'12:00:'+String(tick).padStart(2,'0'):tick+' s ago'; report(kind,{tick,before,after:geometry()});},400);`;
  } else if (kind === 'lazy') {
    body = `<button id="target" style="width:180px;height:42px">Open feed item</button><div id="feed" tabindex="0" role="feed" aria-label="Lazy feed" style="height:260px;overflow:auto;margin-top:8px;border:1px solid">${Array.from({length:12},(_,i)=>`<div style="height:62px">Feed row ${i}</div>`).join('')}</div>`;
    change = `const feed=document.querySelector('#feed'); feed.addEventListener('scroll',()=>setTimeout(()=>{feed.insertAdjacentHTML('beforeend','<div>Arrived row <img alt="Arrived image" width="40" height="24" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2224%22%3E%3Cpath fill=%22blue%22 d=%22M0 0h40v24H0z%22/%3E%3C/svg%3E"></div>'); report('lazy-arrived',{scrollTop:feed.scrollTop,rows:feed.children.length});},300),{once:true}); report('lazy-armed');`;
  } else if (kind === 'spa') {
    body = '<div id="list" role="list"><div role="listitem"><button id="target" style="width:180px;height:42px">Open message</button></div><div role="listitem">Loading messages</div></div>';
    change = `setTimeout(()=>{document.querySelector('#list').innerHTML='<div role="listitem"><button id="target" style="width:180px;height:42px">Open message</button></div><div role="listitem">New message arrived</div>';report('spa-rendered');},350);`;
  } else if (kind === 'banner') {
    body = '<button id="target" style="width:180px;height:42px">Continue reading</button><div id="late"></div>';
    change = `setTimeout(()=>{document.querySelector('#late').innerHTML='<aside role="region" aria-label="Cookie choices" style="position:absolute;top:110px;left:16px;width:460px;padding:12px;background:#eee">Cookies help this page <button id="accept">Accept cookies</button></aside>';report('banner-inserted');},350);`;
  } else if (kind === 'budget') {
    // <100 siblings at each level avoids the width cut; <4,000 nodes avoids the node cap. Every ballast frame is
    // visible, so the 6 MiB byte budget is spent before the final text (which was present at screenshot time).
    const text = 'Budget ballast '.repeat(650);
    body = `<div id="budget-parent" role="group" aria-label="Budget parent" style="position:relative;width:500px;height:430px">${Array.from({length:90},(_,i)=>`<div role="group" aria-label="Ballast group ${i}" style="position:absolute;left:0;top:130px;width:180px;height:50px">${Array.from({length:10},(_,j)=>`<button aria-label="${i}-${j} ${text}" title="${text}" aria-description="${text}" style="position:absolute;left:0;top:0;width:180px;height:50px">Ballast ${i}-${j}</button>`).join('')}</div>`).join('')}<span id="target" style="position:absolute;left:300px;top:35px;width:160px;height:40px">Budget tail text</span></div>`;
    change = `report('budget-unchanged',{children:document.querySelector('#budget-parent').children.length});`;
  } else throw new Error(`unknown gate page ${kind}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>shared gate ${kind}</title><style>body{font:16px -apple-system,Helvetica,sans-serif;margin:16px}button,a{font:16px -apple-system,Helvetica,sans-serif}</style></head><body><h3>Shared gate ${kind}</h3>${body}<script>(()=>{const kind=${JSON.stringify(kind)};
const send=extra=>navigator.sendBeacon('/ev',JSON.stringify({kind,case:location.search,...extra}));
const report=(mutation,extra={})=>send({type:'mutation',mutation,...extra});
const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
const geometry=()=>{const target=document.querySelector('#target'),range=document.createRange();range.selectNodeContents(target);return {kind,case:location.search,text:target.textContent,anchor:rect(document.querySelector(kind==='budget'?'#budget-parent':kind==='relative'?'#row':'#target').getBoundingClientRect()),textRects:Array.from(range.getClientRects(),rect)};};
addEventListener('load',()=>send({type:'fixture',...geometry()}));
window.__change=()=>{${change}};document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);})();</script>${script}</body></html>`;
}

const holds = (f,p) => f && p && p.x>f.x && p.x<f.x+f.width && p.y>f.y && p.y<f.y+f.height;
const reads = (n,text) => [n.title,n.description,n.value].some(s=>typeof s==='string' && s.trim()===text);
const hitText = (hit,text) => hit?.chain?.[0]?.slice(4,7).some(s=>typeof s==='string' && s.trim()===text) ?? false;

// DOM Range bounds are CSS viewport points. Translate through a matching AX anchor, never through a padded
// link's centre or the budget span's (taller than its text) box. Fail closed if that anchor is not the DOM box.
export function gateTarget(sky, fixture, at) {
  if (!fixture) return null;
  const budget=fixture.kind==='budget';
  const line=fixture.textRects?.find(r=>r.width>0 && r.height>0);
  const text=at==='text' && sky.nodes.find(n=>n.role==='AXStaticText' && n.frame && reads(n,fixture.text));
  const node=text || sky.nodes.find(n=>n.role===(budget?'AXGroup':'AXLink') && n.frame && reads(n,budget?'Budget parent':fixture.text));
  const anchor=text?line:fixture.anchor;
  if (!node || !anchor || !line || Math.abs(node.frame.width-anchor.width)>2 || Math.abs(node.frame.height-anchor.height)>2) return null;
  const domPoint=at==='padding'?{x:anchor.x+4,y:anchor.y+anchor.height/2}:{x:line.x+line.width/2,y:line.y+line.height/2};
  return {node,point:{x:node.frame.x+domPoint.x-anchor.x,y:node.frame.y+domPoint.y-anchor.y},
    fixture:{before:fixture,domPoint,pointInText:fixture.textRects.some(r=>holds(r,domPoint)),
      tailOmitted:budget && !sky.nodes.some(n=>reads(n,'Budget tail text'))}};
}

export function tickingTarget(sky,fixture) {
  if(!fixture)return null;
  const line=fixture.textRects?.find(r=>r.width>0&&r.height>0);
  if(!line)return null;
  const sized=(a,b)=>a&&b&&Math.abs(a.width-b.width)<=2&&Math.abs(a.height-b.height)<=2;
  const text=sky.nodes.find(n=>n.role==='AXStaticText'&&reads(n,fixture.text)&&sized(n.frame,line));
  const node=text||sky.nodes.find(n=>['AXLink','AXGroup'].includes(n.role)&&sized(n.frame,fixture.anchor));
  const anchor=text?line:fixture.anchor;
  if(!node||!anchor)return null;
  const domPoint={x:line.x+line.width/2,y:line.y+line.height/2};
  return {node,point:{x:node.frame.x+domPoint.x-anchor.x,y:node.frame.y+domPoint.y-anchor.y},
    fixture:{before:fixture,domPoint,pointInText:holds(line,domPoint)}};
}

// A side read is diagnostic, not the engine's private record: require a matching hit at the point and
// an actual unrecorded-to-recorded ancestor boundary below its web area before calling a refusal evidenced.
export function hasRefusalHit(row,hit=row.refusalSignals?.hit??row.signals?.hit) {
  const chain=hit?.chain,i=hit?.newElementIndex,area=chain?.findIndex(n=>n[0]==='AXWebArea')??-1;
  const [x,y,width,height]=chain?.[0]?.[3]??[];
  return !!(chain?.[0]?.[0]===row.click?.stalePoint?.hitRole&&holds({x,y,width,height},row.point?.screen)
    &&Number.isInteger(i)&&i>=0&&i<area&&hit.chainRecorded?.[i]===false&&hit.chainRecorded?.[i+1]===true);
}

// The engine's recordedRole, not the chosen fixture node, identifies whose actions we report.
// AXPress is reported explicitly; ShowMenu/ScrollToVisible alone do not make the recorded text actionable.
export function tickEvidence(row,nodes) {
  const issues=[], before=row.fixture?.before,sp=row.click?.stalePoint;
  const ticks=(row.mutations??[]).filter(m=>m.mutation===before?.kind&&m.tick>=1&&m.before?.text!==m.after?.text);
  const initial=before?.textRects?.[0];
  const stable=r=>initial&&r&&['x','y','width','height'].every(k=>Math.abs(r[k]-initial[k])<=.75);
  if(!before?.text||!row.fixture?.pointInText)issues.push('text did not exist at the screenshot point');
  if(!ticks.length)issues.push('no changed tick after screenshot');
  if(ticks.some(t=>!stable(t.before?.textRects?.[0])||!stable(t.after?.textRects?.[0])))issues.push('ticking text changed its line frame');
  if(!row.click||row.problem||row.exception)issues.push('cell did not complete');
  if(sp?.hitRole!=='AXStaticText')issues.push('engine hit is not the ticking text');
  const candidates=nodes.filter(n=>holds(n.frame,row.point?.screen)&&n.role===sp?.recordedRole).sort((a,b)=>(b.depth??0)-(a.depth??0));
  const n=candidates[0], recorded=n?{role:n.role,token:n.token,title:n.title,description:n.description,value:n.value,actions:n.actions??[],actionable:(n.actions??[]).includes('AXPress'),frame:n.frame}:null;
  if(!recorded)issues.push('recorded node actions unavailable');
  const rowNode=nodes.find(n=>n.role==='AXLink'&&holds(n.frame,row.point?.screen)&&(n.actions??[]).includes('AXPress'));
  if(before?.kind==='relative'&&!rowNode)issues.push('timestamp is not inside an AXPress link row');
  const hit=row.refusalSignals?.hit??row.signals?.hit;
  const refusalEvidenceComplete=sp?.reason==='newElementOverPoint'?hasRefusalHit(row,hit):null;
  if(refusalEvidenceComplete===false)issues.push('new-element refusal evidence incomplete: matching hit chain and new element unavailable');
  return {valid:!issues.length,issues,ticks:ticks.length,recorded,rowActionable:!!rowNode,refusalEvidenceComplete,
    hitChain:hit?.chain??[],chainRecorded:hit?.chainRecorded??null,newElementIndex:hit?.newElementIndex??null};
}

export async function runTicking(scene,a) {
  const {config,stillHarness,stillCell,URL_,REPS,events,sendCmd,sleep,save,overBudget,version}=a;
  config.tickingRequired=6;
  const measured=[];
  for(const kind of ['safari','cft','firefox']) {
    config[`${kind}Version`]=version(kind);
    const h=await stillHarness(kind);
    try {
      for(let rep=1;rep<=Math.max(6,REPS);rep++) {
        if(overBudget()){config.budgetStop=true;return;}
        const url=new URL(`g?kind=${scene}&case=tick-${kind}-${rep}`,URL_),mark=events.length;
        const reset=await h.reset(url.href);
        let fixture;
        for(let i=0;i<30;i++) {
          fixture=events.slice(mark).find(e=>e.type==='fixture'&&e.kind===scene&&e.case===url.search);
          if(fixture)break;
          await sleep(100);
        }
        let nodes=[];
        const row=await stillCell({app:kind,scene:`shared:${scene}`,cell:'ticking-text',at:'text',rep,reset,tickCase:true,expect:['target','row']},h.pid(),'shared',sky=>{
          nodes=sky.nodes;return tickingTarget(sky,fixture);
        },async()=>{
          const start=events.length;sendCmd('change');
          for(let i=0;i<40;i++) {
            if(events.slice(start).some(e=>e.type==='mutation'&&e.kind===scene&&e.case===url.search&&e.tick>=1))return;
            await sleep(100);
          }
          throw new Error('fixture did not tick after the screenshot');
        });
        row.ticking=tickEvidence(row,nodes);measured.push(row);
        config.tickingCoverage=Object.fromEntries(['safari','cft','firefox'].map(app=>[app,{measured:measured.filter(r=>r.app===app).length,valid:measured.filter(r=>r.app===app&&r.ticking.valid).length}]));
        save();
      }
    } finally {await h.close();save();}
  }
}

// Only the shared gate uses these page-only, bucket-interleaved picks. The historical sweep-* stays unchanged.
export function pagePicks(sky,sweepPicks) {
  const areas=sky.nodes.filter(n=>n.role==='AXWebArea' && n.frame).map(n=>n.frame);
  const nodes=sky.nodes.filter(n=>n.frame && areas.some(f=>n.frame.x>=f.x && n.frame.y>=f.y && n.frame.x+n.frame.width<=f.x+f.width && n.frame.y+n.frame.height<=f.y+f.height));
  const buckets=new Map();
  for (const p of sweepPicks({...sky,nodes},30)) { if(!buckets.has(p.bucket))buckets.set(p.bucket,[]); buckets.get(p.bucket).push(p); }
  const picks=[];
  for(let i=0;picks.length<8;i++) {
    const round=[...buckets.values()].flatMap(ps=>ps[i]?[ps[i]]:[]);
    if(!round.length)break;
    picks.push(...round.slice(0,8-picks.length));
  }
  return picks;
}

// Coverage is separate from the engine's outcome: even an invalid/mis-aimed cell's refusal remains a measured refusal.
export function validateGateRow(row) {
  const scene=row.scene?.replace(/^shared:/,'');
  if (!LINK_CASES[scene] && scene!=='budget') return null;
  const issues=[], f=row.fixture?.before, sp=row.click?.stalePoint;
  const shotHitRole=row.atShot?.hit?.chain?.[0]?.[0] ?? null;
  const recordedRole=sp?.recordedRole ?? null;
  if(row.problem || row.exception || !row.click)issues.push('cell did not complete');
  if(!f || f.kind!==scene)issues.push('missing matching DOM Range fixture');
  if(scene==='budget') {
    if(f?.text!=='Budget tail text')issues.push('DOM fixture is not the tail text');
    if(recordedRole!=='AXGroup')issues.push('guard did not record the enclosing budget group instead of its omitted tail');
    if(!row.fixture?.pointInText)issues.push('point outside tail text line');
    if(shotHitRole!=='AXStaticText' || !hitText(row.atShot?.hit,'Budget tail text'))issues.push('screenshot AX hit is not the tail text');
    if(row.fixture?.tailOmitted!==true)issues.push('tail text was not omitted from observation');
    const t=row.observation?.timings ?? {}, cut=row.observation?.truncated;
    if(t.budgetHit!==true || t.nodeCapHit===true || t.deadlineHit===true || !(cut?.count>0) || cut?.depth!=null)issues.push('not exclusively byte-budget truncation');
    if(!row.mutations?.some(m=>m.mutation==='budget-unchanged'))issues.push('missing unchanged-fixture confirmation');
    return {valid:!issues.length,issues,recordedRole,shotHitRole,clickHitRole:sp?.hitRole ?? null};
  }
  const [before,after]=LINK_CASES[scene], expectedRole=row.at==='text'?'AXStaticText':'AXLink';
  if(!['text','padding'].includes(row.at) || recordedRole!==expectedRole)issues.push(`recordedRole is not ${expectedRole}`);
  if(shotHitRole!==expectedRole || !hitText(row.atShot?.hit,before))issues.push(`screenshot AX hit is not the expected ${expectedRole}`);
  if(row.fixture?.pointInText!==(row.at==='text'))issues.push('point is not in the requested text/padding region');
  const mutation=row.mutations?.find(m=>m.mutation==='textContent' && m.before?.text===before && m.after?.text===after && m.before?.case===f?.case && m.after?.case===f?.case);
  const width=g=>g?.textRects?.reduce((n,r)=>n+r.width,0) ?? 0;
  const widthBefore=width(mutation?.before),widthAfter=width(mutation?.after);
  if(!mutation || f?.text!==before)issues.push('missing matching textContent replacement evidence');
  if(!(widthBefore>0 && widthAfter>0) || (scene==='link-same'?Math.abs(widthAfter-widthBefore)>.5:widthAfter<=widthBefore+.5))issues.push('DOM text width did not demonstrate the requested same/growing case');
  return {valid:!issues.length,issues,expectedRole,recordedRole,shotHitRole,clickHitRole:sp?.hitRole ?? null,widthBefore,widthAfter};
}

export function summarizeGateCoverage(rows) {
  const required=['link-same:AXLink','link-same:AXStaticText','link-grow:AXLink','link-grow:AXStaticText','budget:AXStaticText'];
  const checked=rows.map(row=>({row,coverage:validateGateRow(row)})).filter(x=>x.coverage);
  const counts=Object.fromEntries(required.map(key=>[key,checked.filter(({row,coverage:c})=>c.valid && `${row.scene.replace(/^shared:/,'')}:${row.scene==='shared:budget'?c.shotHitRole:c.recordedRole}`===key).length]));
  const missing=required.filter(key=>!counts[key]);
  return {complete:!missing.length,counts,missing,invalid:checked.filter(x=>!x.coverage.valid).map(({row,coverage})=>({label:row.label,...coverage}))};
}

export async function runGate(kind, a) {
  const {config, version, stillHarness, URL_, REPS, overBudget, save, connect, observe, sweepPicks, stillCell, refind,
    centre, edgePoint, EDGES, sleep, sendCmd, findNode, toPixels, brief, events} = a;
  config[`${kind}Version`] = version(kind);
  config.sharedGateVersion = 2;
  const measured=[];
  const h = await stillHarness(kind);
  try {
    // These same groups will be selected for #298: changing labels in live pages and native lists are not a second kit.
    const real = [
      ['hn', 'https://news.ycombinator.com/'],
      ['github-pr', 'https://github.com/SSFSKIM/cua/pull/339'],
      ['wiki', 'https://en.wikipedia.org/wiki/Hacker_News'],
      ['mdn', 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/select'],
    ];
    for (let rep=1; rep<=REPS; rep++) {
      for (const [scene,url] of real) {
        await h.reset(url);
        const w=await connect('shared');
        const sky=await observe(w,h.pid(),`${kind}-${scene}-shared-picks-${rep}`); w.close();
        const picks=pagePicks(sky,sweepPicks);
        config[`shared-picks-${kind}-${scene}`]={picks,webAreas:sky.nodes.filter(n=>n.role==='AXWebArea').map(n=>n.frame),problem:picks.length?null:'no page-content picks'};
        for (const [i,p] of picks.entries()) for (const at of ['centre',EDGES[i%4]]) {
          if(overBudget()){config.budgetStop=true;save();return;}
          const reset=await h.reset(url);
          const row=await stillCell({app:kind,scene:`shared:${scene}`,cell:`${p.bucket}:${p.role}:${(p.title??p.description??'').slice(0,30)}`,at,rep,reset},h.pid(),'shared',s=>{
            const n=refind(s,p); return n?{node:n,point:at==='centre'?centre(n):edgePoint(n.frame,at)}:null;
          },async()=>{await sleep(1400);});
          const valid=!!row.click && !row.problem && !row.exception && row.atShot?.hit?.inWebArea===true;
          row.coverage={type:'page-content',valid,issues:valid?[]:['screenshot hit did not establish page-content coverage']};
          save();
        }
      }
      for(const scene of ['clock','lazy','spa','banner','link-same','link-grow','recreate','budget']) {
        const ats=scene.startsWith('link-')?['text','padding']:scene==='budget'?['tail']:['centre','left'];
        for (const at of ats) {
          if(overBudget()){config.budgetStop=true;save();return;}
          const url=new URL(`g?kind=${scene}&case=${rep}-${at}`,URL_),mark=events.length;
          const reset=await h.reset(url.href);
          let fixture;
          for(let i=0;i<20;i++) {
            fixture=events.slice(mark).find(e=>e.type==='fixture' && e.kind===scene && e.case===url.search);
            if(fixture)break;
            await sleep(100);
          }
          const row=await stillCell({app:kind,scene:`shared:${scene}`,cell:scene,at,rep,reset,expect:['target'],fixture:{before:fixture ?? null}},h.pid(),'shared',sky=>{
            if(scene==='clock')return tickingTarget(sky,fixture);
            if(scene==='budget' || scene.startsWith('link-'))return gateTarget(sky,fixture,at);
            const want=scene==='lazy'?'Open feed item':scene==='spa'?'Open message':scene==='banner'?'Continue reading':'Again';
            const n=findNode(sky,['AXLink','AXButton'],want);
            if(!n)return null;
            return {node:n,point:at==='left'?edgePoint(n.frame,'left'):centre(n)};
          },async({w,sky,row})=>{
            sendCmd('change'); await sleep(200);
            if(scene==='lazy') {
              // One real scroll, after the screenshot; the click target above the feed does not move.
              const feed=findNode(sky,['AXScrollArea','AXGroup','AXList'],'Lazy feed');
              const p=feed?centre(feed):{x:sky.window.frame.x+220,y:sky.window.frame.y+360};
              const {px}=toPixels(sky,p);
              row.scroll=brief(await w.execute('scroll',{pid:h.pid(),direction:'down',pages:0.3,x:px.x,y:px.y}));
            }
            await sleep(scene==='recreate'?1600:1400);
          });
          row.coverage=scene==='clock'?tickEvidence(row,[row.observation?.chosen,...(row.observation?.nearby??[])].filter(Boolean)):validateGateRow(row);
          measured.push(row);
          config.sharedGateCoverage=summarizeGateCoverage(measured);
          save();
        }
      }
    }
  } finally {
    try {config.sharedGateCoverage=summarizeGateCoverage(measured); save();}
    finally {await h.close();}
  }
}

export async function runMailLike(a) {
  const {OUT,WIN,stillNative,escapeTwice,setFront,sleep,config}=a;
  const log=join(OUT,'mail-like-events.jsonl');
  const app=spawn(process.env.P330_MAIL_APP,[],{env:{...process.env,P330_NATIVE_LOG:log},stdio:['ignore','ignore','inherit']});
  try {
    await sleep(1800);
    await stillNative('mail-like',()=>app.pid,async()=>{
      await escapeTwice(app.pid); placePid(app.pid,WIN); setFront(app.pid); await sleep(800); return [];
    });
    config.mailLikeEvents=readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
  } finally {await stopOwnedChild(app);}
}
