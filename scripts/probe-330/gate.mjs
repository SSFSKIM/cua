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
  } else if (kind === 'clock') {
    body = '<p id="clock"></p><a id="target" href="#kept" style="display:inline-block;width:220px;padding:12px">Updated 0 seconds ago</a><button id="other">Refresh</button>';
    change = `let tick=0; setInterval(()=>{document.querySelector('#clock').textContent=new Date().toISOString(); document.querySelector('#target').textContent='Updated '+(++tick)+' seconds ago'; report('clock', {tick});},400);`;
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
const geometry=()=>{const target=document.querySelector('#target'),range=document.createRange();range.selectNodeContents(target);return {kind,case:location.search,text:target.textContent,anchor:rect(document.querySelector(kind==='budget'?'#budget-parent':'#target').getBoundingClientRect()),textRects:Array.from(range.getClientRects(),rect)};};
addEventListener('load',()=>send({type:'fixture',...geometry()}));
window.__change=()=>{${change}};document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);})();</script>${script}</body></html>`;
}

const holds = (f,p) => f && p.x>f.x && p.x<f.x+f.width && p.y>f.y && p.y<f.y+f.height;
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
            if(scene==='budget' || scene.startsWith('link-'))return gateTarget(sky,fixture,at);
            const want=scene==='clock'?/^Updated/:scene==='lazy'?'Open feed item':scene==='spa'?'Open message':scene==='banner'?'Continue reading':'Again';
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
          row.coverage=validateGateRow(row);
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
