// Pure manifest and conservative readers. No browser is launched by this module.
import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const BROWSERS=['safari','cft','firefox'],EDITORS=['textarea','input','contenteditable','compose'];
export const MODES=['reread50','reread100','stable50','stable100'];
export function cells({reps=20,browsers=BROWSERS,editors=EDITORS,suites=['rate','control','trace','isolate','candidate']}={}){
 if(!Number.isInteger(reps)||reps<1||reps>20)throw Error('reps must be 1..20');
 const out=[];
 for(const browser of browsers)for(const editor of editors)for(let rep=1;rep<=reps;rep++)for(const selection of ['script','cmd+a']){
  for(const suite of suites){
   const modes=suite==='candidate'?MODES:suite==='isolate'?(browser==='cft'?['range-only','focus-only']:browser==='safari'?['range-only']:['press-only']):['natural'];
   if(suite==='isolate'&&rep>Math.min(10,reps))continue;
   for(const mode of modes){const cell={suite,browser,editor,selection,mode,rep};cell.id=[suite,browser,editor,selection,mode,rep].join('/');out.push(cell)}
  }
 }
 return out;
}
export function diagnosticCells({kind='pilot',reps=5,browsers=BROWSERS,scene='foreground-equal'}={}){
 if(!['pilot','confirm','candidates'].includes(kind))throw Error('unknown diagnostic kind');
 const scenes=kind==='pilot'?['foreground-equal','foreground-end','background-equal','background-end']:[kind==='confirm'?'foreground-equal':scene];
 if(scenes.some(s=>!['foreground-equal','foreground-end','background-equal','background-end'].includes(s)))throw Error('unknown diagnostic scene');
 if(kind==='confirm')browsers=browsers.filter(b=>b==='cft');
 const plan=cells({reps,browsers,editors:['textarea'],...(kind==='candidates'?{}:{suites:['rate','trace']})}).filter(c=>kind==='candidates'||c.selection==='script');
 // Interleave scenes within each repetition/suite; never pool an equal-range setup with a changed-range setup.
 return plan.flatMap(c=>scenes.map(scene=>({...c,diagnostic:kind,scene,foreground:scene.startsWith('foreground'),initialCaret:scene.endsWith('equal')?'target':'end',id:['diagnostic',kind,scene,c.id].join('/')})));
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const groupKey=r=>[...(r.diagnostic?[r.diagnostic,r.scene]:[]),r.suite,r.browser,r.editor,r.selection,r.mode].join('/');
function percentiles(v){v=v.filter(Number.isFinite).sort((a,b)=>a-b);const q=p=>v.length?v[Math.ceil(p*v.length)-1]:null;return {n:v.length,p50:q(.5),p95:q(.95),max:v.at(-1)??null}}
export function facts(r){
 const events=[...(r.events??[])].sort((a,b)=>a.at-b.at),scriptAt=r.next?.scriptCompletedAt;
 const firstInput=events.find(e=>e.event==='input')?.at??Infinity;
 const requested=(r.click?.probe?.events??[]).findLast(e=>e.kind==='write-end'&&e.name==='AXSelectedTextRange')?.range;
 const changes=events.filter(e=>e.event==='selectionchange'&&e.selection?.[1]===0&&(!requested||same(e.selection,requested))&&e.at>scriptAt&&e.at<firstInput);
 const uncertainty=r.clockUncertaintyMs??2;
 const late=changes.filter(e=>e.at-scriptAt>uncertainty&&e.at-(r.click?.endedAt??Infinity)>uncertainty);
 const placed=r.click?.meta?.elementClick?.caret==='placed';
 const correct=r.samples?.at(-1)?.text===r.requested;
 const barrier=r.click?.probe?.barrier;
 return {correct,lateCaretAfterScript:late.length>0,placedThenLate:placed&&late.length>0,ambiguousTiming:changes.length>0&&late.length===0,placed,
  barrier,firstInputAt:Number.isFinite(firstInput)?firstInput:null,
  lastCaretAfterReturnMs:late.length?Math.max(...late.map(e=>e.at-r.click.endedAt)):null};
}
export function summary(rows,expected=cells(),{smoke=false,diagnostic=false}={}){
 if(rows.some(r=>r.diagnostic)&&!diagnostic)throw Error('diagnostic evidence cannot enter the primary summary');
 if(diagnostic&&rows.some(r=>!r.diagnostic))throw Error('mixed diagnostic and primary evidence');
 if(rows.some(r=>r.smoke===true)&&!smoke)throw Error('smoke evidence cannot enter primary summary; use explicit smoke mode');
 if(smoke&&rows.some(r=>r.smoke!==true))throw Error('mixed smoke and primary evidence');
 const seen=new Set(),groups=new Map(),missing=[];
 const make=r=>{const key=groupKey(r);if(!groups.has(key))groups.set(key,{cell:key,requested:0,attempted:0,valid:0,invalid:0,refused:0,wrongFinal:0,typeAnswers:{},typeFalseSuccess:0,typeHonestUnconfirmed:0,typeUnconfirmedCorrect:0,foregroundViolations:0,windowRaisesObserved:0,lateCaretAfterScript:0,placedClaims:0,placedThenLate:0,ambiguousTiming:0,candidateConfirmed:0,candidateRefused:0,candidateAcceptedWrongFinal:0,candidateAcceptedThenLate:0,barrierTimes:[],clickTimes:[],gaps:[],lastCaretTimes:[]});return groups.get(key)};
 for(const e of expected)make(e).requested++;
 for(const r of rows){if(seen.has(r.id))throw Error('duplicate evidence id: '+r.id);seen.add(r.id);const g=make(r);g.attempted++;
  if(r.click?.error||r.next?.error||r.type?.error)g.refused++;
  if(r.foregroundViolation)g.foregroundViolations++;if(r.windowRaiseObserved)g.windowRaisesObserved++;
  if(!r.valid){g.invalid++;continue}g.valid++;const f=facts(r);
  if(r.type){
   const answer=r.type.error?.errorName??(r.type.error?'otherError':'success');
   g.typeAnswers[answer]=(g.typeAnswers[answer]??0)+1;
   if(!f.correct){g.wrongFinal++;if(answer==='success')g.typeFalseSuccess++;if(answer==='typeUnconfirmed')g.typeHonestUnconfirmed++}
   else if(answer==='typeUnconfirmed')g.typeUnconfirmedCorrect++;
  }
  for(const key of ['lateCaretAfterScript','placedThenLate','ambiguousTiming'])if(f[key])g[key]++;
  if(f.placed)g.placedClaims++;
  if(f.barrier){if(f.barrier.confirmed){g.candidateConfirmed++;if(r.type&&!f.correct)g.candidateAcceptedWrongFinal++;if(f.lateCaretAfterScript)g.candidateAcceptedThenLate++}else g.candidateRefused++;g.barrierTimes.push(f.barrier.ms)}
  g.clickTimes.push(r.click?.endedAt-r.click?.startedAt);g.gaps.push(r.next?.startedAt-r.click?.endedAt);g.lastCaretTimes.push(f.lastCaretAfterReturnMs);
 }
 for(const e of expected)if(!seen.has(e.id))missing.push(e.id);
 return {smoke,diagnostic,requested:expected.length,attempted:rows.length,missing,unexpected:rows.filter(r=>!expected.some(e=>e.id===r.id)).map(r=>r.id),groups:[...groups.values()].map(g=>{const {barrierTimes,clickTimes,gaps,lastCaretTimes,...counts}=g;return {...counts,barrierMs:percentiles(barrierTimes),clickMs:percentiles(clickTimes),nextGapMs:percentiles(gaps),lastCaretAfterReturnMs:percentiles(lastCaretTimes)}}),interpretation:'wrongFinal is end-to-end, not a causal click rate; Cmd+A has its own known delivery race. Only script pre-input reversion is late-caret evidence. Association with a traced write is not sole-cause proof; compare no-click and isolated-step controls.'};
}
export function timeline(r){
 const out=[],add=(source,kind,at,data={})=>{if(Number.isFinite(at))out.push({id:r.id,source,kind,at,clickReturnMs:at-(r.click?.endedAt??NaN),nextStartMs:at-(r.next?.startedAt??NaN),...data})};
 for(const name of ['click','next','type']){add('controller',name+'-start',r[name]?.startedAt);add('controller',name+'-return',r[name]?.endedAt)}
 for(const e of r.click?.probe?.events??[])add('engine',e.kind,e.at,e);
 for(const e of r.events??[])add('dom',e.event,e.at,e);
 for(const e of r.ax?.events??[])add('ax-observer',e.kind,e.at,e);
 for(const e of r.samples??[])add('dom-sample','sample',e.at,{text:e.text,selection:e.selection});
 return out.sort((a,b)=>a.at-b.at);
}
function load(dir,name='rows.jsonl'){let rows=[];for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())rows.push(...load(p,name));else if(e.name===name)rows.push(...(name==='config.json'?[JSON.parse(readFileSync(p,'utf8'))]:readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map((l,i)=>({...JSON.parse(l),source:p,line:i+1}))))}return rows}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,input,output]=process.argv.slice(2);
 if(command==='plan'){const p=cells();console.log(JSON.stringify({attempts:p.length,cells:p},null,2))}
 else if(command==='summarize'||command==='timeline'){
  if(!input||!output)throw Error('usage: readers.mjs summarize|timeline INPUT_DIRECTORY OUTPUT_DIRECTORY');mkdirSync(output,{recursive:true});const rows=load(input);
  if(command==='summarize'){const smoke=process.argv.includes('--smoke'),diagnostic=process.argv.includes('--diagnostic'),expected=diagnostic?load(input,'config.json').flatMap(c=>c.planned):cells({reps:smoke?1:20});if(diagnostic&&!expected.length)throw Error('diagnostic manifests missing');writeFileSync(join(output,'summary.json'),JSON.stringify(summary(rows,expected,{smoke,diagnostic}),null,2))}
  else writeFileSync(join(output,'timeline.jsonl'),rows.flatMap(timeline).map(r=>JSON.stringify(r)).join('\n')+'\n');
 }else throw Error('usage: readers.mjs plan | summarize|timeline INPUT_DIRECTORY OUTPUT_DIRECTORY');
}
