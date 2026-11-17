// Side-effect accounting for the first-press probe. Pure/injectable so offline tests can exercise it.
// Each effect is true (harm observed), false (the needed observations exist and show none) or null (unknown).
// Observed harm always wins over unknown; missing observability is never a clean "no side effect".

// Persist the native observation before awaiting the renderer, so a renderer failure cannot erase it.
export async function recordSample(samples,requestedMs,{native,renderer,owns}) {
 const ax=await native();
 const sample={requestedMs,at:ax.endedAt,startedAt:ax.startedAt,ax:ax.ax,frontmostPid:ax.frontmostPid,order:ax.order,...(ax.geometry?{geometry:ax.geometry}:{})};
 samples.push(sample);
 const effect=await renderer();
 if(!owns(effect))throw Error('effect is from another fixture owner');
 sample.effect=effect;
 return sample;
}

const pidKnown=p=>Number.isInteger(p)&&p>0;
const frameKnown=f=>!!f&&['x','y','width','height'].every(k=>Number.isFinite(f[k]));
// Positive evidence wins; otherwise false only when `known` says every needed observation exists.
const verdict=(harm,known)=>harm?true:known?false:null;

export function deriveEffects(row,coverPid) {
 const samples=row.samples??[],trace=row.trace??[],e=row.sideEffects??{};
 const frames=samples.filter(s=>s.geometry).map(s=>s.geometry.windowFrame);
 const a=row.beforeGeometry?.windowFrame,b=row.afterGeometry?.windowFrame??frames.at(-1);
 const events=row.after?.events;
 return {
  dialogClosed:typeof row.after?.open==='boolean'?row.after.open===false:null,
  frontmostChanged:verdict(samples.some(s=>pidKnown(s.frontmostPid)&&s.frontmostPid!==coverPid)||trace.some(t=>pidKnown(t.frontmostPid)&&t.frontmostPid!==coverPid),
   samples.length>0&&samples.every(s=>pidKnown(s.frontmostPid))),
  raised:verdict(samples.some(s=>s.order?.targetAboveCover===true)||trace.some(t=>t.kind==='perform.begin'&&t.action==='AXRaise'),
   samples.length>0&&samples.every(s=>typeof s.order?.targetAboveCover==='boolean')),
  windowMoved:verdict(frameKnown(a)&&frameKnown(b)&&['x','y','width','height'].some(k=>Math.abs(a[k]-b[k])>1),frameKnown(a)&&frameKnown(b)),
  otherPointer:verdict(
   (events??[]).some(x=>x.wallAt>=row.call?.startedAt&&x.type==='pointerdown'&&x.target!=='action')||(typeof row.frontAfter?.title==='string'&&!row.frontAfter.title.includes('probe366:'+row.owner?.pageId)),
   Array.isArray(events)&&typeof row.frontAfter?.title==='string'),
  ownerLost:e.ownerLost===true,
 };
}
