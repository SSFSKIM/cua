// Reads runner-owned JSON artifacts and writes README-ready tables. No GUI or network access.
import fs from 'node:fs';
import {join} from 'node:path';
import {win,current,compareReturn,windowSpaceIds,windowGeometry,spaceWindow} from './evidence.mjs';
const [input,output,run]=process.argv.slice(2);
if(!input||!output||!run)throw Error('usage: summarize.mjs <download-root> <evidence-dir> <run-url>');
fs.mkdirSync(output,{recursive:true});
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;
const all=['main','fix'].flatMap(head=>{
 const rows=read(join(input,head,'results.json'))??[],config=read(join(input,head,'config.json'));
 const blocked=read(join(input,head,'capability-blocked.json'))??read(join(input,head,'fatal.json'));
 return ['textedit','electron'].map(scene=>({head,scene,sha:config?.sha,headBlocker:blocked,...rows.find(r=>r.scene===scene)}));
});
const safe=v=>v==null?'unavailable':String(v).replaceAll('|','/').replaceAll('\n',' ');
const frame=i=>{const g=windowGeometry(i),f=g?.bounds;return f?`(${f.x}, ${f.y}, ${f.width}, ${f.height}) [${g.source}]`:'unread';};
const front=i=>i?.frontmost?.bundleId??'unread';
const ids=i=>{const value=windowSpaceIds(i);return value.length?value:null;};
const observation=o=>!o?'not measured':o.ok===true?`ok; ${o.raw?.nodes?.length??'?'} nodes; omitted=${o.meta?.['cua/screenshotOmitted']??'none'}`:`ERROR ${o.error?.errorName??o.error?.message??o.error??o.reason}`;
const placement=o=>typeof o?.value==='string'?o.value.match(/\[window (?:off screen|on another Space):[^\n]*\]/)?.[0]??'none':'not measured';
const appPlacement=o=>o?.ok===true?placement({value:(o.emitted??[]).filter(v=>typeof v==='string').join('\n')}):'not measured';
const spaceEvidence=i=>{const w=spaceWindow(i);return {active:current(i),windowSpaces:ids(i),allCGOnscreen:w?.allCGOnscreen??win(i)?.cgOnscreen??null,includingCGOnscreen:w?.includingCGOnscreen??null,inOnscreenList:w?.inOnscreenList??null,axAvailable:Boolean(win(i)),geometry:windowGeometry(i)};};
const screenshot=o=>!o?'not measured':o.ok===true&&o.value?.jpeg===true&&o.value?.sha256?`${o.raw?.screenshot?.width??'?'}×${o.raw?.screenshot?.height??'?'}; ${o.value.bytes} B; ${o.value.sha256.slice(0,12)}`:`ERROR ${o.error?.message??'no populated JPEG'}`;
const median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
const change=(a,b)=>a!=null&&b!=null?a!==b:null;
function raise(r,kind){
 const before=r[kind+'RaiseBefore'],after=r[kind+'RaiseAfter'],action=r[kind+'Raise'];
 if(action?.ok!==true||action.available!==true||action.attempted!==true||!before||!after)return {measured:false,reason:action?.error??action?.reason??'no valid action/before/after pair'};
 const b=current(before),a=current(after),from=ids(before),to=ids(after);
 return {measured:true,beforeSpace:b,afterSpace:a,beforeWindowSpaces:from,afterWindowSpaces:to,activeChanged:change(b,a),
  windowMembershipChanged:Array.isArray(from)&&Array.isArray(to)?JSON.stringify(from)!==JSON.stringify(to):null,
  joinedOriginalCurrentSpace:Array.isArray(from)&&Array.isArray(to)&&b!=null?to.includes(b):null,onDisplayAfter:win(after)?.overlapsDisplay??null,
  beforeFrame:frame(before),afterFrame:frame(after),beforeFront:front(before),afterFront:front(after),frontChanged:change(before.frontmost?.pid,after.frontmost?.pid)};
}
const summary=all.map(r=>({head:r.head,sha:r.sha,scene:r.scene,headBlocker:r.headBlocker??null,
 baseline:observation(r.baseline),baselineMatch:r.baselineMatch??null,baselineScreenshot:screenshot(r.baselineScreenshot),
 offscreenEstablished:r.offscreenOracle?.ok??false,offscreenGetApp:observation(r.offscreenGetApp),offscreen:observation(r.offscreen),offscreenMatch:r.offscreenMatch??null,
 offscreenLine:placement(r.offscreen),offscreenDiffLine:placement(r.offscreenDiff),offscreenScreenshot:screenshot(r.offscreenScreenshot),offscreenRaise:raise(r,'offscreen'),
 partial:observation(r.partial),partialScreenshot:screenshot(r.partialScreenshot),partialLine:placement(r.partial),partialFrame:frame(r.partialOracle),
 anotherSpaceEstablished:r.anotherSpaceOracle?.ok??false,spaceRoute:r.spaceRoute??null,anotherSpaceBlocker:r.anotherSpaceBlocker??null,
 anotherSpaceGetApp:observation(r.anotherGetApp),anotherSpace:observation(r.another),anotherSpaceMatch:r.anotherMatch??null,
 anotherSpaceLine:placement(r.another),anotherSpaceGetAppLine:appPlacement(r.anotherGetApp),
 anotherSpaceOmitted:{getApp:r.anotherGetApp?.meta?.['cua/screenshotOmitted']??null,getAXState:r.another?.meta?.['cua/screenshotOmitted']??null,getScreenshot:r.anotherScreenshot?.meta?.['cua/screenshotOmitted']??null},
 anotherSpaceEvidence:{before:spaceEvidence(r.anotherSpaceOracle?.value),afterGetApp:spaceEvidence(r.anotherGetAppAfter),afterGetAXState:spaceEvidence(r.anotherAfter),afterGetScreenshot:spaceEvidence(r.anotherScreenshotAfter)},
 anotherSpaceScreenshot:screenshot(r.anotherScreenshot),anotherSpaceRaise:raise(r,'another'),
 hidden:observation(r.hidden),hiddenScreenshot:screenshot(r.hiddenScreenshot),hiddenLine:placement(r.hidden),
 returnComparison:r.returnComparison??null,returned:observation(r.returned),returnScreenshot:screenshot(r.returnScreenshot),
 cost:{successful:r.cost?.filter(c=>c.ok).length??0,total:r.cost?.length??0,walkP50Ms:median((r.cost??[]).map(c=>c.timings?.walkMs)),
  totalP50Ms:median((r.cost??[]).map(c=>c.timings?.totalMs)),cgReadSamples:r.cgCost?.samples?.filter(s=>s.found).length??0,
  cgReadP50Ms:median((r.cgCost?.samples??[]).filter(s=>s.found).map(s=>s.elapsedMs))}}));
const crossHead=['textedit','electron'].map(scene=>{
 const a=all.find(r=>r.head==='main'&&r.scene===scene),b=all.find(r=>r.head==='fix'&&r.scene===scene);
 return {scene,...compareReturn(a?.baseline,b?.baseline,a?.baselineScreenshot,b?.baselineScreenshot)};
});
fs.writeFileSync(join(output,'summary.json'),JSON.stringify({run,rows:summary,crossHead},null,2)+'\n');
const table=(headers,rows)=>[headers.map(safe).join(' | '),headers.map(()=>'---').join(' | '),...rows.map(row=>row.map(safe).join(' | '))].map(s=>'| '+s+' |').join('\n');
let text=`# #367 hosted live check\n\nRun: ${run}\n\n`;
text+=table(['Head','SHA','Scene','Setup blocker'],summary.map(r=>[r.head,r.sha,r.scene,r.headBlocker?JSON.stringify(r.headBlocker):'none']))+'\n\n';
text+=table(['Step','Head / scene','Result','Screenshot / comparison'],summary.flatMap(r=>[
 ['1 owned on-screen',`${r.head} / ${r.scene}`,`${r.baseline}; independent window match=${r.baselineMatch}`,r.baselineScreenshot],
 ['2 off every display',`${r.head} / ${r.scene}`,`independent geometry=${r.offscreenEstablished}; getApp ${r.offscreenGetApp}; getAXState ${r.offscreen}`,r.offscreenScreenshot],
 ['3 partly off',`${r.head} / ${r.scene}`,`${r.partial}; placement line=${r.partialLine}; frame=${r.partialFrame}`,r.partialScreenshot],
 ['4 another Space',`${r.head} / ${r.scene}`,`independent membership=${r.anotherSpaceEstablished}; route=${r.spaceRoute}; getApp ${r.anotherSpaceGetApp}; getAXState ${r.anotherSpace}`,r.anotherSpaceBlocker?JSON.stringify(r.anotherSpaceBlocker.reason):r.anotherSpaceScreenshot],
 ['5 hidden app',`${r.head} / ${r.scene}`,`${r.hidden}; placement line=${r.hiddenLine}`,r.hiddenScreenshot],
 ['6 back on screen',`${r.head} / ${r.scene}`,r.returned,JSON.stringify(r.returnComparison)],
 ['7 cost',`${r.head} / ${r.scene}`,`${r.cost.successful}/${r.cost.total} observations; walk p50 ${r.cost.walkP50Ms} ms; total p50 ${r.cost.totalP50Ms} ms`,`${r.cost.cgReadSamples} exact per-window CG reads; p50 ${r.cost.cgReadP50Ms} ms`],
]))+'\n\n';
text+=table(['Placement','Head / scene','Action valid','Active Space before → after','Window Spaces before → after','Frame before → after','Front app before → after','On a display after'],summary.flatMap(r=>['offscreen','anotherSpace'].map(k=>{
 const x=r[k+'Raise'];return [k,`${r.head} / ${r.scene}`,x.measured,x.measured?`${x.beforeSpace} → ${x.afterSpace}`:JSON.stringify(x.reason),x.measured?`${JSON.stringify(x.beforeWindowSpaces)} → ${JSON.stringify(x.afterWindowSpaces)}`:'unavailable',x.measured?`${x.beforeFrame} → ${x.afterFrame}`:'unavailable',x.measured?`${x.beforeFront} → ${x.afterFront}`:'unavailable',x.onDisplayAfter??'unavailable'];
})))+'\n\n';
text+=table(['Scene','Cross-head on-screen text equal','JPEG bytes equal','JPEG lengths equal','Image dimensions equal'],crossHead.map(r=>[r.scene,r.textEqual,r.jpegBytesEqual,r.byteLengthsEqual,r.dimensionsEqual]))+'\n\n';
text+=table(['Head / scene','Off-display line','Off-display diff line','Another-Space line'],summary.map(r=>[`${r.head} / ${r.scene}`,r.offscreenLine,r.offscreenDiffLine,r.anotherSpaceLine]))+'\n\n';
text+='## Another-Space product contract\n\n';
text+=table(['Head / scene','Independent before (active; window Spaces; on-screen-only)','CG flags All / IncludingWindow','getApp line','getAXState outcome / line','screenshotOmitted metadata','getScreenshot','Independent after getScreenshot'],summary.map(r=>{
 const b=r.anotherSpaceEvidence.before,a=r.anotherSpaceEvidence.afterGetScreenshot;
 return [`${r.head} / ${r.scene}`,`${b.active}; ${JSON.stringify(b.windowSpaces)}; ${b.inOnscreenList}`,`${b.allCGOnscreen} / ${b.includingCGOnscreen}`,`${r.anotherSpaceGetApp} / ${r.anotherSpaceGetAppLine}`,`${r.anotherSpace} / ${r.anotherSpaceLine}`,JSON.stringify(r.anotherSpaceOmitted),r.anotherSpaceScreenshot,`${a.active}; ${JSON.stringify(a.windowSpaces)}; ${a.inOnscreenList}`];
}))+'\n\n';
text+='Scope: the public facade and trusted service are imported from the same pinned source head as each unmodified engine. The transport adapter is the existing hosted/test nativePipe bridge; this is not an MCP-host/sandbox qualification. All GUI applications and documents belong to the disposable runner. No owner profile, secrets, or local/Mac-mini GUI was used.\n\n';
text+='Cost: p50 is the ordinary median of successful native timing values (20 observations requested per app/head). Placement has no separately timed native field; walk/total timings do not isolate its added CGWindow read. The independent oracle separately samples the exact per-window CGWindow read. Both arms include #366 after the coordinator-required base merge.\n';
fs.writeFileSync(join(output,'tables.txt'),text);
console.log(JSON.stringify({run,rows:summary.map(r=>({head:r.head,scene:r.scene,offscreenRaise:r.offscreenRaise,anotherSpaceRaise:r.anotherSpaceRaise,cost:r.cost})),crossHead},null,2));
