// The refusal sentence is the engine's authoritative old/new label evidence. Preserve its text beside the parse.
export function relabelledLabels(message) {
  const m=message?.match(/^The screen changed since the screenshot: the (AX\w+) "(.*)" it showed at this point now reads "(.*)"\. (?:Nothing was sent|The app was activated in the background, but nothing was pressed)\./su);
  return m?{role:m[1],oldLabel:m[2],newLabel:m[3]}:null;
}
export function walkStats(observations) {
  const xs=observations.map(o=>o.timings?.walkMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const q=p=>xs.length?xs[Math.round(p*(xs.length-1))]:null;
  return {n:xs.length,p50:q(.5),p95:q(.95),max:q(1)};
}
