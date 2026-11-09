// Shared #330 / #298 live gate. Engine heads are selected by the workflow, not by these cells.
// Local pages isolate automatic mutations whose intended target remains clickable; real-site cells use #305's picks.
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {placePid} from '../probe-316/browser.mjs';

const LINK_CASES = {
  'link-same': ['Like (12)', 'Like (13)', 'width:180px'],
  'link-grow': ['Inbox', 'Inbox (3)', ''],
};
export function gatePage(kind, script) {
  let body = '', change = '';
  if (LINK_CASES[kind]) {
    const [before, after, style] = LINK_CASES[kind];
    body = `<a id="target" href="#kept" style="display:inline-block;padding:14px 32px;${style}">${before}</a>`;
    change = `document.querySelector('#target').textContent=${JSON.stringify(after)}; report('textContent');`;
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>shared gate ${kind}</title><style>body{font:16px -apple-system,Helvetica,sans-serif;margin:16px}button,a{font:16px -apple-system,Helvetica,sans-serif}</style></head><body><h3>Shared gate ${kind}</h3>${body}<script>(()=>{const report=(mutation,extra={})=>navigator.sendBeacon('/ev',JSON.stringify({type:'mutation',mutation,kind,...extra}));window.__change=()=>{${change}};document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);})();</script>${script}</body></html>`;
}

export async function runGate(kind, a) {
  const {config, version, stillHarness, URL_, REPS, overBudget, save, connect, observe, sweepPicks, stillCell, refind,
    centre, edgePoint, EDGES, sleep, sendCmd, findNode, toPixels, brief} = a;
  config[`${kind}Version`] = version(kind);
  config.sharedGateVersion = 1;
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
        const picks=sweepPicks(sky,8);
        config[`shared-picks-${kind}-${scene}`]=picks;
        for (const [i,p] of picks.entries()) for (const at of ['centre',EDGES[i%4]]) {
          if(overBudget()){config.budgetStop=true;save();return;}
          const reset=await h.reset(url);
          await stillCell({app:kind,scene:`shared:${scene}`,cell:`${p.bucket}:${p.role}:${(p.title??p.description??'').slice(0,30)}`,at,rep,reset},h.pid(),'shared',s=>{
            const n=refind(s,p); return n?{node:n,point:at==='centre'?centre(n):edgePoint(n.frame,at)}:null;
          },async()=>{await sleep(1400);});
        }
      }
      for(const scene of ['clock','lazy','spa','banner','link-same','link-grow','recreate','budget']) {
        const ats=scene.startsWith('link-')?['text','padding']:scene==='budget'?['tail']:['centre','left'];
        for (const at of ats) {
          if(overBudget()){config.budgetStop=true;save();return;}
          const reset=await h.reset(`${URL_}g?kind=${scene}`);
          await stillCell({app:kind,scene:`shared:${scene}`,cell:scene,at,rep,reset,expect:['target']},h.pid(),'shared',sky=>{
            if(scene==='budget') {
              const n=findNode(sky,['AXGroup'],'Budget parent');
              return n?{node:n,point:{x:n.frame.x+370,y:n.frame.y+55}}:null;
            }
            const want=scene.startsWith('link-')?(scene==='link-same'?'Like (12)':'Inbox'):scene==='clock'?/^Updated/:scene==='lazy'?'Open feed item':scene==='spa'?'Open message':scene==='banner'?'Continue reading':'Again';
            const n=findNode(sky,['AXLink','AXButton'],want);
            if(!n)return null;
            return {node:n,point:at==='padding'?{x:n.frame.x+4,y:n.frame.y+n.frame.height/2}:at==='left'?edgePoint(n.frame,'left'):centre(n)};
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
        }
      }
    }
  } finally {await h.close();}
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
  } finally {app.kill('SIGTERM');await sleep(500);}
}
