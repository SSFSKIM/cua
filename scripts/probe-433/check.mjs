// Scoring, summaries and gates for the #431 lanes (on #340's kit). Pure: unit-tested by kit.test.mjs. Link truth is the owned
// page's pointer-event log; every projected diagnostic is a member of a closed vocabulary, an engine name or a number.
import {CELLS,UNITS,OVERLAY,recordedRole,unitKey,isReportOnly} from './cells.mjs';

const reads=(n,s)=>[n.title,n.description,n.value].some(v=>typeof v==='string'&&v.trim()===s);
const centre=f=>({x:f.x+f.width/2,y:f.y+f.height/2});
const holds=(f,p)=>!!f&&!!p&&p.x>=f.x&&p.x<=f.x+f.width&&p.y>=f.y&&p.y<=f.y+f.height;
const framed=n=>n&&n.frame&&n.frame.width>0&&n.frame.height>0;
// The link's AXStaticText and the AXLink around it in an observation, both reading `text` (the link found by its own
// label, else as the one AXLink whose frame holds the text's centre). Null unless each is exactly one node. With `first`
// (the twin cells' same-label controls), the topmost text of those reading `text`, and the one AXLink holding it. With
// `role` another control's (a button, which may expose no text child): the control reading `text` (the topmost with
// `first`), and the one AXStaticText reading it inside it, else none (`text: null`).
export function findLink(nodes,text,{first=false,role='AXLink'}={}){
  const list=Array.isArray(nodes)?nodes.filter(framed):[];
  const one=xs=>{
    if(first&&xs.length>1){xs=[...xs].sort((a,b)=>a.frame.y-b.frame.y);if(xs[0].frame.y===xs[1].frame.y)return null;xs=[xs[0]];}
    return xs.length===1?xs[0]:null;
  };
  if(role!=='AXLink'){
    const c=one(list.filter(n=>n.role===role&&reads(n,text)));if(!c)return null;
    const t=list.filter(n=>n.role==='AXStaticText'&&reads(n,text)&&holds(c.frame,centre(n.frame)));
    return {text:t.length===1?t[0]:null,link:c};
  }
  const t=one(list.filter(n=>n.role==='AXStaticText'&&reads(n,text)));
  if(!t)return null;
  let links=first?[]:list.filter(n=>n.role==='AXLink'&&reads(n,text));
  if(!links.length)links=list.filter(n=>n.role==='AXLink'&&holds(n.frame,centre(t.frame)));
  return links.length===1?{text:t,link:links[0]}:null;
}

// How many controls reading the label a twin cell prepares in what the observation can read: the target and its twin
// (`move`), the three rows (`list`), the target alone where the twin lies outside the walk (`cap`, `deep`).
export const LABELLED={move:2,list:3,cap:1,deep:1,swap:1,cover:2,row:2,wide:1,hidden:1};
// Whether an observation of a twin cell is the one the cell needs (every other cell: true):
// - the target is the control found: exactly LABELLED of the label's carriers were emitted (AXStaticText for links,
//   AXButton for buttons), so an observation that missed the target never aims at the next row;
// - for ruling 881's twins, the walk cut where the cell says (the node cap itself, `timings.nodeCapHit`, for `cap`, not
//   a deadline; the depth for `deep`), no node reading the label lies outside the target control's frame, and no
//   control of the cell's role but the target and Archive was emitted, framed or not, so the twin (labelled or not) is
//   not in the tree (the guard's record-only reads take only children the window shows, which a twin below the fold is
//   not, and none below the depth cap).
// The controls counted are those not above the target's row: the browser's own controls over the page (Chrome for
// Testing's infobar link, smoke run 44518499843) are never the twin, which lies in or below the target's row.
// `uncoveredBy` names the first condition that failed (a closed code), null when the observation is the one needed.
// A big cell's observation must show the cut it names: the width rule's subset (a node `shown` fewer of its children
// than it has) for `wide`, the node cap itself for `cap`.
// #435's frameless twins (`hidden`), judged at the unit's recorded role (`at`): the control found is the target, where
// the page put it, 128 pt above Archive's (64 for `cv`) (`target`); no other node of that role with any frame (a zero-size
// one included, which #431's search reads) at or below the target's row whose label agrees with the target's under the
// engine's rule (`framed`); and one listed with no frame that carries a label agreeing with it (`frameless`; an unlabelled
// one, which the engine would also take, is not counted, as nothing ties it to the fixture's twin).
export function uncoveredBy(sky,spec,found,{role='AXLink',at=null}={}){
  const nodes=Array.isArray(sky?.nodes)?sky.nodes:[];
  if(spec.twin==='hidden'){
    const archive=nodes.filter(n=>framed(n)&&n.role===role&&reads(n,'Archive'));
    if(archive.length!==1||Math.abs(archive[0].frame.y-(spec.hide==='cv'?64:128)-found.link.frame.y)>8)return 'target';
    const want=at==='text'?'AXStaticText':role,mine=at==='text'?found.text:found.link;
    if(!mine)return 'target';
    const above=n=>framed(n)&&n.frame.y+n.frame.height<=found.link.frame.y+2;
    if(nodes.some(n=>n&&n!==mine&&n.role===want&&n.frame!=null&&!above(n)&&labelsAgree(mine,n)))return 'framed';
    return nodes.some(n=>n&&n.frame==null&&n.role===want&&!unlabelled(n)&&labelsAgree(mine,n))?null:'frameless';
  }
  if(spec.big==='wide')return nodes.some(n=>Number.isInteger(n?.shown?.count)&&n.shown.count<n.shown.of)?null:'cut';
  if(spec.big==='cap')return sky?.timings?.nodeCapHit===true?null:'cut';
  if(!spec.twin)return null;
  const carrier=role==='AXLink'?'AXStaticText':role;
  if(nodes.filter(n=>framed(n)&&n.role===carrier&&reads(n,spec.before)).length!==LABELLED[spec.twin])return 'count';
  if(spec.twin==='wide'){
    if(!nodes.some(n=>Number.isInteger(n?.shown?.count)&&n.shown.count<n.shown.of))return 'cut';
    // The twin and every row after it lie outside the read: no control of the role at or below the target's bottom.
    const bottom=found.link.frame.y+found.link.frame.height;
    return nodes.some(n=>n?.role===role&&framed(n)&&n!==found.link&&n.frame.y>=bottom)?'control':null;
  }
  if(spec.twin!=='cap'&&spec.twin!=='deep')return null;
  const t=sky.truncated;
  if(spec.twin==='cap'?!(t?.count>0&&sky.timings?.nodeCapHit===true):!(t?.depth>0))return 'cut';
  const inside=n=>framed(n)&&holds(found.link.frame,centre(n.frame));
  if(!nodes.filter(n=>reads(n,spec.before)).every(inside))return 'label';
  const above=n=>framed(n)&&n.frame.y+n.frame.height<=found.link.frame.y+2;
  return nodes.filter(n=>n?.role===role&&!above(n)).every(n=>n===found.link||reads(n,'Archive'))?null:'control';
}
export const covers=(...a)=>uncoveredBy(...a)===null;
const unlabelled=n=>[n.title,n.description,n.value].every(v=>typeof v!=='string'||!v);
// The engine's label rule between two recorded nodes (StalePoint.swift `recreatedLabelsAgree`): the title, then the
// description, then the value by its words; at the first both carry, the same; at the first only one carries, agreed.
const words=v=>v.toLowerCase().match(/[\p{L}0-9]+/gu)??[];
export function labelsAgree(a,b){
  for(const part of ['title','description','value']){
    const x=typeof a[part]==='string'&&a[part]?a[part]:null,y=typeof b[part]==='string'&&b[part]?b[part]:null;
    if(x&&y)return part==='value'?words(x).join(' ')===words(y).join(' '):x===y;
    if(x||y)return true;
  }
  return true;
}

// #435's discovery: how the observation lists every node reading `text`, by role and frame (`framed`, `zero` for a frame
// with no area, `frameless` for none: no AXPosition or AXSize), and every frameless node by role. Closed codes and counts.
export function labelledOf(nodes,text){
  const list=Array.isArray(nodes)?nodes.filter(Boolean):[];
  const cls=n=>n.frame==null?'frameless':framed(n)?'framed':'zero';
  return {label:tally(list.filter(n=>reads(n,text)).map(n=>`${role(n.role)}:${cls(n)}`)),
    frameless:tally(list.filter(n=>n.frame==null).map(n=>role(n.role)??'none'))};
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

const LINKS=new Set(['target','archive','drafts','twin','other','none']);
// The page's pointer-event log: whether a click reached the target link, any event reached it, and any reached
// another link (a wrong target).
export function landingOf(clicks){
  const list=(Array.isArray(clicks)?clicks:[]).map(c=>({type:c?.type,link:LINKS.has(c?.link)?c.link:'other'}));
  return {landed:list.some(c=>c.type==='click'&&c.link==='target'),reached:list.some(c=>c.link==='target'),
    wrong:[...new Set(list.filter(c=>c.link!=='target'&&c.link!=='none').map(c=>c.link))],
    nowhere:list.some(c=>c.link==='none'),events:list.length};
}

// A row's staged page log (`clickEvents`, `type:link[:untrusted]`) as events.
export const eventsOf=r=>(Array.isArray(r?.clickEvents)?r.clickEvents:[]).map(s=>{const [type,link]=String(s).split(':');
  return {type,link:LINKS.has(link)?link:'other'};});

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
export function score({attested,observeFailed=false,cell='plain',at,click,stale,clicks}){
  if(!attested)return {verdict:'invalid'};
  if(observeFailed)return {verdict:'observe-failed'};
  const l=landingOf(clicks);
  let verdict;
  if(l.wrong.length)verdict='wrong-target';
  else if(!stale)verdict='no-guard';
  else if(stale.recordedRole!==recordedRole(cell,at))verdict='misplaced';
  else if(stale.verdict==='refused')verdict=l.reached?'refused-delivered':click==='screenChangedSinceScreenshot'?'refused':'refused-unreported';
  else if(stale.verdict==='kept')verdict=l.landed?click==='success'?'kept-landed':'kept-landed-error':'kept-missed';
  else verdict='other';
  return {verdict,landed:l.landed,reached:l.reached,wrongLinks:l.wrong,nowhere:l.nowhere};
}

const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
const signature=o=>Object.entries(o??{}).sort(([a],[b])=>a<b?-1:1).map(([k,n])=>`${k}x${n}`).join(' ')||'none';
const median=xs=>{const a=xs.filter(Number.isFinite).sort((p,q)=>p-q);return a.length?a[Math.floor((a.length-1)/2)]:null;};
// Quantiles of a list (nearest rank, rounded up): p50, p95 and the max; null when empty.
export const quantiles=xs=>{const a=xs.filter(Number.isFinite).sort((p,q)=>p-q);if(!a.length)return null;
  const q=f=>a[Math.ceil((a.length-1)*f)];return {n:a.length,p50:q(.5),p95:q(.95),max:a[a.length-1]};};
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
      identity:tally(v.map(r=>r.guard?.identity??'none')),hitRole:tally(v.map(r=>r.guard?.hitRole??'none')),
      // #433: what the record held at the point, and the controls the click reached (`none` for the page itself).
      recorded:tally(v.map(r=>r.guard?.recordedRole??'none')),
      reached:tally(v.map(r=>[...new Set(eventsOf(r).map(e=>e.link))].sort().join('+')||'nothing')),route:tally(v.map(r=>r.route??'none')),
      landed:v.filter(r=>r.landed).length,wrong:v.filter(r=>r.verdict==='wrong-target').length,
      presentationLost:v.filter(r=>r.presentationHeld===false).length,guardMs:quantiles(v.map(r=>r.guard?.ms)),
      // The recorded node's frame at the observation against the same role's frame after the change (the engine's own
      // re-observation), and the page's own CSS geometry before and after the change.
      axRecorded:geo(v,r=>r.ax?.recorded),axText:geo(v,r=>r.ax?.text),axLink:geo(v,r=>r.ax?.link),
      domText:geo(v,r=>r.dom?.text),domLink:geo(v,r=>r.dom?.link),
      // Where the twin ended against the target's place (CSS px), and what the observation's walk read and cut.
      domTwin:geo(v,r=>r.dom?.twin),walkNodes:quantiles(v.map(r=>r.walk?.nodes)),walkCut:quantiles(v.map(r=>r.walk?.cut)),
      walkDepthCut:v.filter(r=>r.walk?.depth!=null).length,observeMs:quantiles(v.map(r=>r.observeMs)),
      // #435: how the label's carriers were listed (one signature per row), and why a row's observation fell short of
      // the cell's (`gap`, recorded in mode discover instead of invalidating the row).
      walkLabel:tally(list.filter(r=>r.walk?.labelled).map(r=>signature(r.walk.labelled.label))),
      walkFrameless:tally(list.filter(r=>r.walk?.labelled).map(r=>signature(r.walk.labelled.frameless))),
      gap:tally(list.filter(r=>r.gap!==undefined).map(r=>r.gap??'none'))}];
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
    // A report-only unit is listed, never held to the bar.
    const reportOnly=isReportOnly(u);
    per[`${h}/${unitKey(u)}`]={planned:want,ran:list.length,valid,...(reportOnly?{reportOnly}:{})};
    if(!reportOnly&&(want===0||list.length<want||valid<VALID_BAR*want))covered=false;
  }
  return {complete:Object.values(per).every(p=>p.reportOnly||p.ran>=p.planned),covered,per};
}

export const MIN_PAIRS=10;
// The ruling-881 twins (absent from the record), gated apart from the twins the record holds so each answer reads alone.
export const UNRECORDED=new Set(['twincap','twindeep','twinwide']);
// #435's frameless twins, gated apart (`twinFrameless`).
export const FRAMELESS=new Set(Object.keys(CELLS).filter(c=>CELLS[c].twin==='hidden'));
// The qualification gates (two heads). A row pairs with the other head's row of the same unit and repetition.
export function gates(rows,{coverage:cov,units:all=UNITS,minPairs=MIN_PAIRS}){
  // A unit a cell names report-only (`reportOnlyAt`) is run and reported (`reportOnly`), never gated: twincover at the
  // link point, where the record holds the live overlay itself, not a re-created match (#433, outside #431).

  const units=all.filter(u=>!isReportOnly(u)),reportUnits=all.filter(isReportOnly);
  const inRun=new Set(units.map(unitKey));
  const fix=rows.filter(r=>r.head==='fix'&&r.valid&&inRun.has(unitKey(r))),main=rows.filter(r=>r.head==='main'&&r.valid&&inRun.has(unitKey(r)));
  const kindOf=r=>CELLS[r.cell].kind;
  const brief=list=>list.slice(0,20).map(r=>({unit:unitKey(r),rep:r.rep,click:r.click,guard:r.guard?`${r.guard.verdict}/${r.guard.reason}`:null,verdict:r.verdict}));
  const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r]));
  const mate=r=>pair.get(`${unitKey(r)}/${r.rep}`);
  const of=(list,u)=>list.filter(r=>r.cell===u.cell&&r.at===u.at);
  const unitsWhere=pred=>units.filter(u=>pred(u.cell));
  const everyUnit=pred=>unitsWhere(pred).every(u=>of(fix,u).length>0);
  const verdictTally=list=>tally(list.map(r=>`${r.verdict}/${r.guard?.reason??'-'}`));
  const perUnit=(pred,miss)=>Object.fromEntries(unitsWhere(pred).map(u=>[unitKey(u),
    {fixRows:of(fix,u).length,missed:miss.filter(r=>unitKey(r)===unitKey(u)).length,fix:verdictTally(of(fix,u)),main:verdictTally(of(main,u))}]));
  // A twin cell: refused as nodeGone, nothing reaching the target or any other control (`refused`, which a click on the
  // twin can never be: any event on another control is `wrong-target`).
  // interactiveHit (the hit an interactive element the record does not hold at the point) is a refusal ruling 889 accepts.
  // #435's frameless twins must refuse nodeGone itself.
  // #433's twincover counts any refusal (its gate is the click never reaching the twin).
  const twinOk=r=>r.verdict==='refused'&&(OVERLAY.has(r.cell)||[...(CELLS[r.cell].reasons??['nodeGone']),...(FRAMELESS.has(r.cell)?[]:['interactiveHit'])].includes(r.guard?.reason));
  const twinGate=pred=>{
    const list=fix.filter(r=>pred(r.cell)),miss=list.filter(r=>!twinOk(r));
    return {pass:!unitsWhere(pred).length||list.length>0&&everyUnit(pred)&&miss.length===0,rows:list.length,failed:miss.length,
      fixWrong:list.filter(r=>r.verdict==='wrong-target').length,mainWrong:main.filter(r=>pred(r.cell)&&r.verdict==='wrong-target').length,
      perUnit:perUnit(pred,miss),examples:brief(miss)};
  };
  const isTwin=c=>CELLS[c].kind==='twin';
  // The controls a row's click reached (the page's log, `none` aside).
  const reached=r=>eventsOf(r).map(e=>e.link).filter(l=>l!=='none');
  // A paired gate: every fix row of the cells the verdict and the guard's reason of its paired main row, with at least
  // MIN_PAIRS usable pairs (both rows valid, neither observation failed) in every unit.
  // With `mustKeep` (the genuine re-creations), every valid fix row must also be kept and land: two heads refusing alike
  // are equal and still wrong (an observation that failed is the usable-pairs bar's). Main's own rows that were not kept
  // and landed are counted apart (`mainNotKept`), an unusable baseline rather than the fix's regression.
  const asMainGate=(pred,{mustKeep=false}={})=>{
    const list=fix.filter(r=>pred(r.cell)),paired=list.filter(mate);
    const usable=Object.fromEntries(unitsWhere(pred).map(u=>[unitKey(u),
      paired.filter(r=>unitKey(r)===unitKey(u)&&r.verdict!=='observe-failed'&&mate(r).verdict!=='observe-failed').length]));
    const thin=Object.entries(usable).filter(([,n])=>n<minPairs).map(([k])=>k);
    const differ=paired.filter(r=>mate(r).verdict!==r.verdict);
    const reasonDiffer=paired.filter(r=>mate(r).verdict===r.verdict&&mate(r).guard?.reason!==r.guard?.reason);
    const notKept=mustKeep?list.filter(r=>r.verdict!=='kept-landed'&&r.verdict!=='observe-failed'):[];
    // #433: no fix row's click reaches a control (the target included) that no valid main row of its unit reached.
    const beyond=unitsWhere(pred).map(u=>{const seen=new Set(of(main,u).flatMap(reached));
      return [unitKey(u),[...new Set(of(list,u).flatMap(reached))].filter(l=>!seen.has(l))];}).filter(([,l])=>l.length);
    return {pass:!unitsWhere(pred).length||paired.length>0&&everyUnit(pred)&&thin.length===0&&differ.length===0&&reasonDiffer.length===0&&
      notKept.length===0&&beyond.length===0,reachBeyondMain:Object.fromEntries(beyond),
      rows:list.length,paired:paired.length,
      usablePairs:usable,minPairs,thin,differ:differ.length,reasonDiffer:reasonDiffer.length,
      ...(mustKeep?{fixNotKept:notKept.length,mainNotKept:main.filter(r=>pred(r.cell)&&r.verdict!=='kept-landed').length,
        notKeptExamples:brief(notKept)}:{}),
      // A fix row refused where its main row kept and landed: the regression the re-creation cells exist to catch.
      refusedWhereMainKept:paired.filter(r=>r.verdict.startsWith('refused')&&mate(r).verdict==='kept-landed').length,
      fixKeptLanded:list.filter(r=>r.verdict==='kept-landed').length,mainKeptLanded:main.filter(r=>pred(r.cell)&&r.verdict==='kept-landed').length,
      examples:brief(differ),reasonExamples:brief(reasonDiffer)};
  };
  // The failure the fix answers, reproduced (#433): per twincover unit, how many of main's valid rows kept the click and
  // the page logged a click on the twin itself. Reported, never gated: on Chrome for Testing the shared-mode element route
  // presses the overlay and posts nothing (#431's run 44642664004), so main reaches nothing there.
  const twinClicked=r=>r.guard?.verdict==='kept'&&eventsOf(r).some(e=>e.type==='click'&&e.link==='twin');
  const coverUnits=units.filter(u=>CELLS[u.cell].twin==='cover'),twinRun=coverUnits.length>0;
  const reproPer=Object.fromEntries(coverUnits.map(u=>[unitKey(u),{mainRows:of(main,u).length,mainTwinClicked:of(main,u).filter(twinClicked).length}]));
  const reproduced=Object.values(reproPer).every(x=>x.mainRows>0&&2*x.mainTwinClicked>=x.mainRows);
  const mainTwin=main.filter(r=>CELLS[r.cell].twin==='cover'),mainTwinWrong=mainTwin.filter(twinClicked).length;
  const wrong=fix.filter(r=>r.verdict==='wrong-target');
  // A fix row that a later step invalidated still carries its page log: any event on another control there fails too.
  const invalidWrong=rows.filter(r=>r.head==='fix'&&!r.valid&&inRun.has(unitKey(r))&&eventsOf(r).some(e=>!['target','none'].includes(e.link)));
  // The claimed presentation: per unit, no more fix rows than main's on which something other than the cover activated.
  const presentation=Object.fromEntries(units.map(u=>[unitKey(u),{fix:of(fix,u).filter(r=>r.presentationHeld===false).length,
    main:of(main,u).filter(r=>r.presentationHeld===false).length}]));
  const presentationWorse=Object.entries(presentation).filter(([,x])=>x.fix>x.main).map(([k])=>k);
  // The guard's own time per head (reported, never gated): over every valid row, and over the twin cells' rows.
  const ms=list=>quantiles(list.map(r=>r.guard?.ms));
  return {
    coverage:{pass:cov.complete&&cov.covered},
    reproduced:{informational:true,pass:reproduced,result:!twinRun?'not in this run':reproduced?'reproduced':'not reproduced (inconclusive)',mainRows:mainTwin.length,mainWrong:mainTwinWrong,perUnit:reproPer},
    twinRefused:twinGate(c=>isTwin(c)&&!UNRECORDED.has(c)&&!FRAMELESS.has(c)&&!OVERLAY.has(c)),
    // #433: no valid fix row of twincover reaches the twin or any other control, the target included (it is gone); how
    // many refused, and why, is reported beside (`refused`, `perUnit`).
    overlayTwin:(()=>{const g=twinGate(c=>isTwin(c)&&OVERLAY.has(c)),list=fix.filter(r=>isTwin(r.cell)&&OVERLAY.has(r.cell));
      const reachedAny=list.filter(r=>reached(r).length);
      return {...g,pass:!unitsWhere(c=>isTwin(c)&&OVERLAY.has(c)).length||list.length>0&&everyUnit(c=>isTwin(c)&&OVERLAY.has(c))&&reachedAny.length===0,
        reachedTwin:list.filter(r=>reached(r).includes('twin')).length,reachedAny:reachedAny.length,refused:list.filter(r=>r.verdict==='refused').length};})(),
    twinUnrecorded:twinGate(c=>UNRECORDED.has(c)),
    twinFrameless:twinGate(c=>FRAMELESS.has(c)),
    keptAsMain:asMainGate(c=>CELLS[c].kind==='keep'&&!OVERLAY.has(c),{mustKeep:true}),
    othersAsMain:asMainGate(c=>CELLS[c].kind==='asMain'&&!OVERLAY.has(c)),
    // #433's controls: the veil over a live link kept and landed (`overcontrol`); the scrim and the veil over nothing as main.
    overlayKept:asMainGate(c=>CELLS[c].kind==='keep'&&OVERLAY.has(c),{mustKeep:true}),
    overlayAsMain:asMainGate(c=>CELLS[c].kind==='asMain'&&OVERLAY.has(c)),
    // Genuine re-creations where the record could not hold the container whole (the builder's question): reported with
    // the keep cells' measure (kept and landed, as main), never part of the pass.
    bigPage:{informational:true,...asMainGate(c=>CELLS[c].kind==='big',{mustKeep:true})},
    // The strict form's cost (ruling 889): per unit, of the pairs main kept and landed, how many the fix refused.
    cost:{informational:true,pass:true,perUnit:Object.fromEntries(units.map(u=>{
      // A fix row whose observation failed ran no guard: unmeasured, never in the denominator.
      const pairs=of(fix,u).filter(r=>mate(r)?.verdict==='kept-landed'),kept=pairs.filter(r=>r.verdict!=='observe-failed');
      return [unitKey(u),{mainKept:kept.length,fixRefused:kept.filter(r=>r.verdict.startsWith('refused')).length,unmeasured:pairs.length-kept.length}];
    }).filter(([,x])=>x.mainKept+x.unmeasured>0))},
    noWrongTarget:{pass:wrong.length===0&&invalidWrong.length===0,fixRows:fix.length,wrong:wrong.length,
      invalidRowsWithWrongEvents:invalidWrong.length,invalidExamples:invalidWrong.slice(0,20).map(r=>({unit:unitKey(r),rep:r.rep,invalid:r.invalid})),mainWrong:main.filter(r=>r.verdict==='wrong-target').length,
      perUnit:Object.fromEntries(units.map(u=>[unitKey(u),{fix:of(wrong,u).length,main:of(main,u).filter(r=>r.verdict==='wrong-target').length}])
        .filter(([,x])=>x.fix||x.main)),examples:brief(wrong)},
    presentation:{pass:presentationWorse.length===0,worse:presentationWorse,
      fixLost:fix.filter(r=>r.presentationHeld===false).length,mainLost:main.filter(r=>r.presentationHeld===false).length},
    reportOnly:{informational:true,pass:true,perUnit:Object.fromEntries(reportUnits.map(u=>{
      const at=h=>rows.filter(r=>r.head===h&&r.valid&&r.cell===u.cell&&r.at===u.at);
      return [unitKey(u),{fix:verdictTally(at('fix')),main:verdictTally(at('main')),fixWrong:at('fix').filter(r=>r.verdict==='wrong-target').length,
        mainWrong:at('main').filter(r=>r.verdict==='wrong-target').length}];
    }))},
    guardMs:{informational:true,pass:true,fix:ms(fix),main:ms(main),fixTwin:ms(fix.filter(r=>isTwin(r.cell))),mainTwin:ms(main.filter(r=>isTwin(r.cell)))},
  };
}

// A run's gates and pass: the qualification gates in mode `qualify` only; smoke and measure pass on coverage alone.
export function judge(rows,{mode,abort,coverage:cov,units=UNITS,reps=null}){
  // A short qualification (fewer repetitions) asks no more usable pairs per unit than the valid bar of what it planned.
  const gate=mode==='qualify'?gates(rows,{coverage:cov,units,minPairs:Math.min(MIN_PAIRS,Math.ceil(VALID_BAR*(reps??MIN_PAIRS/VALID_BAR)))}):null;
  // A discovery passes only where the observations themselves ran: in every unit, at least the valid bar of its planned
  // rows carry the walk's evidence (an observation that failed, re-attested by the page, is a valid row without it).
  const observed=mode!=='discover'||units.filter(u=>!isReportOnly(u)).every(u=>Object.entries(cov.per).filter(([k])=>k.endsWith('/'+unitKey(u))).every(([k,p])=>
    rows.filter(r=>`${r.head}/${unitKey(r)}`===k&&r.walk?.labelled).length>=VALID_BAR*p.planned));
  const measured=abort===null&&cov.complete&&cov.covered&&observed;
  // An informational entry (the guard's time) is reported, never part of the pass.
  return {gates:gate,pass:measured&&(!gate||Object.values(gate).every(g=>g.informational||g.pass))};
}
