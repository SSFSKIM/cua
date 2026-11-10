// Pure parts of the hosted A/B extension to the existing #354 kit. No shadow reader.
import {sentence,quantiles} from './classify.mjs';
import {extraPlan,readbackStatus,qualifiedKeyAnswer} from './ab-extra.mjs';
export const BROWSERS=['safari','cft','firefox'],EDITORS=['textarea','input','contenteditable','compose'];
export const KEYS=['cmd+a','cmd+z','cmd+v'];
export const LONG_SEED='q'.repeat(10040)+' end marker';
export function assertPins(main,branch){
 if(![main,branch].every(s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s)))throw Error('both A/B heads must be full immutable SHAs; branch head has not been supplied');
 if(main===branch)throw Error('A/B heads must differ');return true;
}
export function armOrder(browser,editor){
 if(!BROWSERS.includes(browser)||!EDITORS.includes(editor))throw Error('invalid shard');
 return (BROWSERS.indexOf(browser)+EDITORS.indexOf(editor))%2?['branch','main']:['main','branch'];
}
export function abPlan({browser,editor,reps}){
 if(!BROWSERS.includes(browser)||!EDITORS.includes(editor)||!Number.isInteger(reps)||reps<1)throw Error('invalid A/B plan');
 const out=[],add=c=>out.push({...c,id:[c.part,c.editor,c.key??'no-key',c.variant??'spike',c.length,c.rep].join('/')});
 for(let rep=1;rep<=reps;rep++){
  for(const key of KEYS)add({part:'race',editor,key,length:30,rep});
  for(const length of [30,120,500])add({part:'clean',editor,key:'cmd+a',length,rep});
  if(browser==='cft'&&editor==='contenteditable')for(const variant of ['spike','double-space'])add({part:'substitution',editor,key:'cmd+a',length:500,variant,rep});
  if(browser==='cft'&&editor==='textarea')add({part:'truncation',editor,key:null,length:30,seed:LONG_SEED,rep});
 }
 out.push(...extraPlan({browser,editor,reps}));
 // Canvas, then concealed ordinary input, then passwords: secure event input can resist a foreground cover.
 if(editor==='textarea'){
  for(const [field,concealed] of [['canvas',false],['input',true],['password',false],['password',true]])for(let rep=1;rep<=reps;rep++)add({part:'unsupported',editor:field,key:null,length:30,rep,concealed,privateField:true,variant:concealed?'concealed':'spike'});
 }
 return out.map(c=>({...c,variant:c.variant??'spike',text:c.text??(c.variant==='double-space'?sentence(c.length).replace('word is','word  is').slice(0,c.length):sentence(c.length))}));
}
export function answer(raw){
 const err=raw?.error,hasResult=raw!=null&&Object.hasOwn(raw,'result')&&raw.result!=null;
 if((!!err)===hasResult)throw Error('malformed engine response');
 return {success:hasResult,unconfirmed:err?.errorName==='typeUnconfirmed',errorName:err?.errorName??null};
}
export function privacyFindings(raw,{privateField=false,knownValues=[],audit}={}){
 if(!privateField)return [];
 const found=[];
 for(const [key,label] of [['textReadAttempts','text-read'],['rangeReadAttempts','selection-range-read']]){
  const n=audit?.[key];
  if(!Number.isSafeInteger(n)||n<0)found.push('missing or invalid audit count: '+key);
  else if(n!==0)found.push('audited '+label+' attempts: '+n);
 }
 function walk(v,path=[]){if(v==null||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){
  const p=[...path,k];
  // Lengths, reasons and route metadata are harmless; excerpts, values and ranges are not.
  if(x!=null&&/^(before|actual|expected|value|text|.*excerpt|.*(?:value|text|caret|range))$/i.test(k)&&!/(?:length|count|ms)$/i.test(k))found.push(p.join('.'));
  else if(typeof x==='string'&&knownValues.some(s=>typeof s==='string'&&s.length>=8&&x.includes(s)))found.push(p.join('.'));
  else walk(x,p);
 }}
 walk(raw);return found;
}
const dimensions=r=>({arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,key:r.key??null,length:r.length,variant:r.variant??'spike'});
export function summarize(rows){
 const groups=new Map(),costs=new Map(),wrongSuccesses=[];
 const addCost=(r,path)=>{const d={arm:r.arm,browser:r.browser,length:r.length,path},key=JSON.stringify(d);if(!costs.has(key))costs.set(key,{...d,values:[]});costs.get(key).values.push(r.typeRPC?.durationMs)};
 for(const r of rows){
  if(r.recordKind!=='cell')continue;
  const d=dimensions(r),key=JSON.stringify(d);
  if(!groups.has(key))groups.set(key,{...d,attempted:0,valid:0,invalid:0,success:0,unconfirmed:0,keysUnconfirmed:0,otherErrors:0,wrong:0,wrongSuccess:0,falseUnconfirmed:0,privacyViolations:0});
  const g=groups.get(key);g.attempted++;if(r.privacyViolation)g.privacyViolations++;
  if(!r.valid){g.invalid++;continue}g.valid++;
  const a=answer(r.typeRPC.raw);g.keysUnconfirmed+=+(readbackStatus(r.typeRPC.raw).keysUnconfirmed>0);g.success+=+a.success;g.unconfirmed+=+a.unconfirmed;g.otherErrors+=+(!a.success&&!a.unconfirmed);g.wrong+=+(r.correct===false);
  const bad=a.success&&r.correct===false&&!qualifiedKeyAnswer(r,r.typeRPC.raw);g.wrongSuccess+=+bad;
  if(bad)wrongSuccesses.push({id:r.id,arm:r.arm,browser:r.browser,editor:r.editor,part:r.part,key:r.key,length:r.length,variant:r.variant??'spike',expected:r.expectedFinal,actual:r.final,typeRPC:r.typeRPC,engine:r.engine,kit:r.kit});
  if(r.part==='clean'){
   g.falseUnconfirmed+=+(a.unconfirmed&&r.correct===true);addCost(r,'clean-all');if(a.success)addCost(r,'clean-success');
  }else if(['race','substitution'].includes(r.part)&&a.unconfirmed&&r.correct===false)addCost(r,'unconfirmed-race-or-substitution');
  else if(['unsupported','truncation'].includes(r.part))addCost(r,r.part);
 }
 return {groups:[...groups.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),wrongSuccesses:wrongSuccesses.sort((a,b)=>(a.arm==='branch'?-1:1)-(b.arm==='branch'?-1:1)),cost:[...costs.values()].map(({values,...d})=>({...d,...quantiles(values)}))};
}
