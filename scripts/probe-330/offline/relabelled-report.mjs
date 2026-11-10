// The refusal sentence is the engine's authoritative old/new label evidence. Preserve its text beside the parse.
export function relabelledLabels(message) {
  const m=message?.match(/^The screen changed since the screenshot: the (AX\w+) "(.*)" it showed at this point now reads "(.*)"\. (?:Nothing was sent|The app was activated in the background, but nothing was pressed)\./su);
  return m?{role:m[1],oldLabel:m[2],newLabel:m[3]}:null;
}
// Recreated text changed in meaning is rejected by #298's match as nodeGone, not by its own-handle reason.
// Count that only when the same case was kept by control. The edited-region link explicitly requires relabelled.
export function requiredRefusal(row,control) {
  if(row.click?.error!=='screenChangedSinceScreenshot')return false;
  const reason=row.click.stalePoint?.reason;
  if(reason==='relabelled')return true;
  return row.caseName!=='typed-link'&&reason==='nodeGone'&&!!control?.click&&!control.click.error;
}
export function walkStats(observations) {
  const xs=observations.map(o=>o.timings?.walkMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=p=>xs.length?xs[Math.round(p*(xs.length-1))]:null;
  return {n:xs.length,p50:q(.5),p95:q(.95),max:q(1)};
}
