// Scoring, summaries and gates for the #340 link lanes. Pure: unit-tested by kit.test.mjs. Link truth is the owned
// page's pointer-event log; every projected diagnostic is a member of a closed vocabulary, an engine name or a number.
import {CELLS,UNITS,RECORDED_ROLE,unitKey} from './cells.mjs';

const reads=(n,s)=>[n.title,n.description,n.value].some(v=>typeof v==='string'&&v.trim()===s);
const centre=f=>({x:f.x+f.width/2,y:f.y+f.height/2});
const holds=(f,p)=>!!f&&!!p&&p.x>=f.x&&p.x<=f.x+f.width&&p.y>=f.y&&p.y<=f.y+f.height;
const framed=n=>n&&n.frame&&n.frame.width>0&&n.frame.height>0;
// The link's AXStaticText and the AXLink around it in an observation, both reading `text` (the link found by its own
// label, else as the one AXLink whose frame holds the text's centre). Null unless each is exactly one node.
export function findLink(nodes,text){
  const list=Array.isArray(nodes)?nodes.filter(framed):[];
  const texts=list.filter(n=>n.role==='AXStaticText'&&reads(n,text));
  if(texts.length!==1)return null;
  let links=list.filter(n=>n.role==='AXLink'&&reads(n,text));
  if(!links.length)links=list.filter(n=>n.role==='AXLink'&&holds(n.frame,centre(texts[0].frame)));
  return links.length===1?{text:texts[0],link:links[0]}:null;
}

const name=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,47}$/.test(x)?x:'other';
const role=x=>typeof x==='string'&&/^AX[A-Za-z]{1,40}$/.test(x)?x:x==null?null:'other';
// An engine reply as a closed outcome: success, the engine's error name, or why there was none.
export function outcomeOf(reply){
  if(!reply||typeof reply!=='object')return 'missing';
  if(reply.error)return name(reply.error.errorName??'unnamed');
  return reply.result!==undefined?'success':'missing';
}
const metaOf=reply=>!reply||typeof reply!=='object'?null:reply.error?reply.error.meta??null:reply.result?.meta??null;
// #296's record of the click (`meta.stalePoint`, StalePoint.swift's StalePointRecord.wire), in closed codes.
export function stalePointOf(reply){
  const sp=metaOf(reply)?.stalePoint;
  if(!sp||typeof sp!=='object')return null;
  return {verdict:sp.verdict==='kept'||sp.verdict==='refused'?sp.verdict:'other',reason:name(sp.reason),
    identity:sp.identity==='handle'||sp.identity==='recreated'?sp.identity:sp.identity==null?null:'other',
    recordedRole:role(sp.recordedRole),hitRole:role(sp.hitRole),ms:Number.isFinite(sp.ms)?sp.ms:null,rechecked:sp.rechecked===true};
}
export const routeOf=reply=>{const r=metaOf(reply)?.inputRoute;return r==null?null:name(r);};

// How far a frame moved and grew between two readings (points, or CSS pixels for the page's own geometry).
const r2=x=>Math.round(x*100)/100;
export function delta(a,b){
  if(!a||!b)return null;
  return {dx:r2(b.x-a.x),dy:r2(b.y-a.y),dw:r2(b.width-a.width),dh:r2(b.height-a.height)};
}

const LINKS=new Set(['target','archive','drafts','other','none']);
// The page's pointer-event log: whether a click reached the target link, any event reached it, and any reached
// another link (a wrong target).
export function landingOf(clicks){
  const list=(Array.isArray(clicks)?clicks:[]).map(c=>({type:c?.type,link:LINKS.has(c?.link)?c.link:'other'}));
  return {landed:list.some(c=>c.type==='click'&&c.link==='target'),reached:list.some(c=>c.link==='target'),
    wrong:[...new Set(list.filter(c=>c.link!=='target'&&c.link!=='none').map(c=>c.link))],
    nowhere:list.some(c=>c.link==='none'),events:list.length};
}

// The node an observation puts at a screen point: the deepest framed node whose frame holds it (by the nodes' `depth`
// when every hit carries one, the smaller frame breaking ties; else the smallest frame).
export function nodeAt(nodes,p){
  const hit=(Array.isArray(nodes)?nodes:[]).filter(n=>framed(n)&&holds(n.frame,p));
  const deep=hit.every(n=>Number.isInteger(n.depth)),area=n=>n.frame.width*n.frame.height;
  return hit.sort((a,b)=>(deep?b.depth-a.depth:0)||area(a)-area(b))[0]??null;
}

// One row's verdict, from the click's outcome, the guard's record (`stale`), the unit's point (`at`) and the page's log:
// `wrong-target` (any pointer event on another link, whatever the record says); `no-guard` (the click carried no guard
// record); `misplaced` (the record took another role than the unit aims at, though the observation put that role at the
// point); `refused` (the guard refused, the click answered screenChangedSinceScreenshot, nothing reached the target);
// `refused-delivered` (refused, yet an event reached it); `refused-unreported` (refused, nothing reached the target,
// but the click answered something else); `kept-landed` (kept, the click landed on the target and answered success);
// `kept-landed-error` (landed, but the click answered an error); `kept-missed` (kept, no click on the target);
// `observe-failed` (after a valid prepare, re-attested, the head's observation or the link in it missing).
export function score({attested,observeFailed=false,at,click,stale,clicks}){
  if(!attested)return {verdict:'invalid'};
  if(observeFailed)return {verdict:'observe-failed'};
  const l=landingOf(clicks);
  let verdict;
  if(l.wrong.length)verdict='wrong-target';
  else if(!stale)verdict='no-guard';
  else if(stale.recordedRole!==RECORDED_ROLE[at])verdict='misplaced';
  else if(stale.verdict==='refused')verdict=l.reached?'refused-delivered':click==='screenChangedSinceScreenshot'?'refused':'refused-unreported';
  else if(stale.verdict==='kept')verdict=l.landed?click==='success'?'kept-landed':'kept-landed-error':'kept-missed';
  else verdict='other';
  return {verdict,landed:l.landed,reached:l.reached,wrongLinks:l.wrong,nowhere:l.nowhere};
}

const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
const median=xs=>{const a=xs.filter(Number.isFinite).sort((p,q)=>p-q);return a.length?a[Math.floor((a.length-1)/2)]:null;};
const span=xs=>{const a=xs.filter(Number.isFinite);return a.length?[Math.min(...a),Math.max(...a)]:null;};
const geo=(rows,pick)=>{
  const ds=rows.map(pick).filter(Boolean);
  return ds.length?{n:ds.length,...Object.fromEntries(['dx','dy','dw'].map(k=>[k,{median:median(ds.map(d=>d[k])),span:span(ds.map(d=>d[k]))}]))}:null;
};
export function summarize(rows){
  const out={};
  for(const r of rows)(out[`${r.head}|${unitKey(r)}`]??=[]).push(r);
  return Object.fromEntries(Object.entries(out).map(([k,list])=>{
    const v=list.filter(r=>r.valid);
    return [k,{rows:list.length,valid:v.length,invalid:tally(list.filter(r=>!r.valid).map(r=>r.invalid)),
      verdicts:tally(v.map(r=>r.verdict)),click:tally(v.map(r=>r.click)),reason:tally(v.map(r=>`${r.guard?.verdict}/${r.guard?.reason}`)),
      identity:tally(v.map(r=>r.guard?.identity??'none')),hitRole:tally(v.map(r=>r.guard?.hitRole??'none')),route:tally(v.map(r=>r.route??'none')),
      landed:v.filter(r=>r.landed).length,wrong:v.filter(r=>r.verdict==='wrong-target').length,
      presentationLost:v.filter(r=>r.presentationHeld===false).length,guardMs:median(v.map(r=>r.guard?.ms)),
      // The recorded node's frame at the observation against the same role's frame after the change (the engine's own
      // re-observation), and the page's own CSS geometry before and after the change.
      axRecorded:geo(v,r=>r.ax?.recorded),axText:geo(v,r=>r.ax?.text),axLink:geo(v,r=>r.ax?.link),
      domText:geo(v,r=>r.dom?.text),domLink:geo(v,r=>r.dom?.link)}];
  }));
}

export const VALID_BAR=0.8;
// Every planned row ran, and every unit of every head kept at least VALID_BAR of its rows valid.
export function coverage(rows,{planned,heads,units=UNITS}){
  const per={};
  let covered=true;
  for(const h of heads)for(const u of units){
    const list=rows.filter(r=>r.head===h&&r.cell===u.cell&&r.at===u.at),want=planned[`${h}/${unitKey(u)}`]??0;
    const valid=list.filter(r=>r.valid).length;
    per[`${h}/${unitKey(u)}`]={planned:want,ran:list.length,valid};
    if(want===0||list.length<want||valid<VALID_BAR*want)covered=false;
  }
  return {complete:Object.values(per).every(p=>p.ran>=p.planned),covered,per};
}

export const MIN_PAIRS=10;
// The qualification gates (two heads). A row pairs with the other head's row of the same unit and repetition.
export function gates(rows,{coverage:cov,units=UNITS}){
  const fix=rows.filter(r=>r.head==='fix'&&r.valid),main=rows.filter(r=>r.head==='main'&&r.valid);
  const kindOf=r=>CELLS[r.cell].kind;
  const brief=list=>list.slice(0,20).map(r=>({unit:unitKey(r),rep:r.rep,click:r.click,guard:r.guard?`${r.guard.verdict}/${r.guard.reason}`:null,verdict:r.verdict}));
  const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r]));
  // A count or a ticking time on the link's text, growing or shrinking: kept, and the click lands on the target.
  const kept=fix.filter(r=>['grow','shrink'].includes(kindOf(r))),notKept=kept.filter(r=>r.verdict!=='kept-landed');
  // The true refusals: refused by the guard, nothing reaching the target or any other link.
  const refusals=fix.filter(r=>kindOf(r)==='refuse'),notRefused=refusals.filter(r=>r.verdict!=='refused');
  // Every other cell answers as main's paired row: the same verdict (the guard's and the landing).
  const others=fix.filter(r=>kindOf(r)==='asMain'),othersPaired=others.filter(r=>pair.has(`${unitKey(r)}/${r.rep}`));
  // Per asMain unit, the pairs that can show a difference: both rows valid, neither observation failed.
  const usable=Object.fromEntries(units.filter(u=>CELLS[u.cell].kind==='asMain').map(u=>[unitKey(u),
    othersPaired.filter(r=>unitKey(r)===unitKey(u)&&r.verdict!=='observe-failed'&&pair.get(`${unitKey(r)}/${r.rep}`).verdict!=='observe-failed').length]));
  const thin=Object.entries(usable).filter(([,n])=>n<MIN_PAIRS).map(([k])=>k);
  const differ=othersPaired.filter(r=>pair.get(`${unitKey(r)}/${r.rep}`).verdict!==r.verdict);
  const reasonDiffer=othersPaired.filter(r=>{const m=pair.get(`${unitKey(r)}/${r.rep}`);return m.verdict===r.verdict&&m.guard?.reason!==r.guard?.reason;});
  const wrong=fix.filter(r=>r.verdict==='wrong-target');
  // The failure the fix answers, reproduced: main refused at least half its valid rows of the growing links' text.
  const mainGrow=main.filter(r=>kindOf(r)==='grow'&&r.at==='text'),mainRefused=mainGrow.filter(r=>r.verdict==='refused').length;
  const reproduced=mainGrow.length>0&&2*mainRefused>=mainGrow.length;
  // The claimed presentation: per unit, no more fix rows than main's on which something other than the cover activated.
  const of=(list,u)=>list.filter(r=>r.cell===u.cell&&r.at===u.at);
  const presentation=Object.fromEntries(units.map(u=>[unitKey(u),{fix:of(fix,u).filter(r=>r.presentationHeld===false).length,
    main:of(main,u).filter(r=>r.presentationHeld===false).length}]));
  const presentationWorse=Object.entries(presentation).filter(([,x])=>x.fix>x.main).map(([k])=>k);
  const everyUnit=kinds=>units.filter(u=>kinds.includes(CELLS[u.cell].kind)).every(u=>of(fix,u).length>0);
  return {
    coverage:{pass:cov.complete&&cov.covered},
    keptAndLanded:{pass:kept.length>0&&everyUnit(['grow','shrink'])&&notKept.length===0,rows:kept.length,failed:notKept.length,
      mainKeptLanded:main.filter(r=>['grow','shrink'].includes(kindOf(r))&&r.verdict==='kept-landed').length,examples:brief(notKept)},
    stillRefused:{pass:refusals.length>0&&everyUnit(['refuse'])&&notRefused.length===0,rows:refusals.length,failed:notRefused.length,examples:brief(notRefused)},
    reproduced:{pass:reproduced,result:reproduced?'reproduced':'not reproduced (inconclusive)',mainRows:mainGrow.length,mainRefused},
    othersAsMain:{pass:othersPaired.length>0&&everyUnit(['asMain'])&&thin.length===0&&differ.length===0,rows:others.length,
      paired:othersPaired.length,usablePairs:usable,minPairs:MIN_PAIRS,thin,differ:differ.length,
      reasonDiffer:reasonDiffer.length,examples:brief(differ),reasonExamples:brief(reasonDiffer)},
    noWrongTarget:{pass:wrong.length===0,fixRows:fix.length,wrong:wrong.length,mainWrong:main.filter(r=>r.verdict==='wrong-target').length,examples:brief(wrong)},
    presentation:{pass:presentationWorse.length===0,worse:presentationWorse,
      fixLost:fix.filter(r=>r.presentationHeld===false).length,mainLost:main.filter(r=>r.presentationHeld===false).length},
  };
}

// A run's gates and pass: the qualification gates in mode `qualify` only; smoke and measure pass on coverage alone.
export function judge(rows,{mode,abort,coverage:cov}){
  const gate=mode==='qualify'?gates(rows,{coverage:cov}):null;
  const measured=abort===null&&cov.complete&&cov.covered;
  return {gates:gate,pass:measured&&(!gate||Object.values(gate).every(g=>g.pass))};
}
