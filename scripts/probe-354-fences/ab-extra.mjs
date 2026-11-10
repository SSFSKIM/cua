// Builder-requested diagnostic cells, kept separate from the original rate denominators.
import {SEED} from './page.mjs';
export function extraPlan({browser,editor,reps}){
 const out=[],add=c=>out.push({...c,id:[c.part,c.editor,c.variant??'spike',c.rep].join('/'),key:'cmd+a',length:c.text?.length??null});
 for(let rep=1;rep<=reps;rep++){
  if(editor!=='compose')add({part:'ending-return',editor,rep,text:'First line\n',expectedAnswer:editor==='input'?'keysUnconfirmed':'confirmed',expectedText:editor==='input'?'First line':'First line\n'});
  add({part:'ending-tab',editor,rep,text:'Tab prefix\t',expectedAnswer:'keysUnconfirmed',expectedText:'Tab prefix'});
  if(['textarea','contenteditable'].includes(editor))add({part:'multiline',editor,rep,text:'First line\nSecond line',expectedAnswer:'confirmed'});
  if(browser==='cft'&&editor==='textarea')add({part:'truncation',editor,rep,variant:'unicode-cap',text:'New typed sentence goes here.',seed:'한'.repeat(10001),expectedAnswer:'typeUnconfirmed',expectedReason:'possiblyTruncated'});
  if(editor==='input'){
   for(const variant of ['consumed','prevented'])add({part:'unchanged',editor,rep,variant,text:SEED,preventInput:variant==='prevented',expectedAnswer:variant==='consumed'?'confirmed':'typeUnconfirmed',...(variant==='prevented'?{expectedReason:'unchanged'}:{})});
   for(const variant of ['equality','mismatch','one-return','three-returns'])add({part:'secret',editor,rep,variant,text:'{{secret:PROBE354}}',secret:true,returnUnits:variant==='one-return'?1:variant==='three-returns'?3:0,expectedAnswer:variant==='mismatch'?'typeUnconfirmed':'confirmed',...(variant==='mismatch'?{expectedReason:'concealedMismatch'}:{})});
  }
 }
 return out.map(c=>({...c,key:c.secret||c.variant==='unicode-cap'?null:c.key,renderedText:c.editor==='contenteditable'&&['ending-return','multiline'].includes(c.part),variant:c.variant??'spike'}));
}
export function readbackStatus(raw){
 const r=(raw?.result?.meta??raw?.error?.meta)?.typeReadback;
 return {confirmed:r?.confirmed===true,keysUnconfirmed:r?.keysUnconfirmed??0,checkpoints:r?.checkpoints??0,reason:r?.reason??null};
}
const success=raw=>raw?.result!=null&&!raw.error;
const positiveCount=n=>Number.isSafeInteger(n)&&n>0;
function confirmedBeforeKey(cell,raw){
 const end=cell.part==='ending-tab'?'\t':cell.part==='ending-return'?'\n':null,s=readbackStatus(raw);
 return cell.expectedAnswer==='keysUnconfirmed'&&end!==null&&typeof cell.text==='string'&&cell.text.endsWith(end)&&cell.text.length>1&&success(raw)&&s.confirmed&&positiveCount(s.keysUnconfirmed)&&positiveCount(s.checkpoints);
}
export function qualifiedKeyAnswer(cell,raw){
 if(!confirmedBeforeKey(cell,raw))return false;
 const key=cell.part==='ending-tab'?'Tab':'Enter',expected=cell.expectedFinal??cell.expectedText;
 return typeof expected==='string'&&expected.length>0&&(cell.trace??[]).some(t=>t.event==='keydown'&&t.key===key&&t.targetEditor===true&&!t.meta&&!t.ctrl&&!t.alt&&!t.shift&&t.text===expected);
}
function hasFieldValuesOrLengths(raw,cell){
 const known=[cell.text,cell.seed,cell.expectedFinal].filter(s=>typeof s==='string'&&s.length>=8);
 function walk(v){
  if(v==null||typeof v!=='object')return typeof v==='string'&&known.some(s=>v.includes(s));
  return Object.entries(v).some(([k,x])=>x!=null&&(/^(before|actual|expected|value|text|.*excerpt|.*(?:value|text|caret|range)|(?:before|actual|expected|value|text)Length)$/i.test(k)||walk(x)));
 }
 return walk(raw);
}
export function diagnosticContractFailure(cell,raw){
 if(!cell.expectedAnswer)return false;
 const status=readbackStatus(raw);
 if(cell.expectedAnswer==='keysUnconfirmed')return !confirmedBeforeKey(cell,raw)||(cell.correct!==true&&!qualifiedKeyAnswer(cell,raw));
 if(cell.expectedAnswer==='confirmed'){
  if(!success(raw)||!status.confirmed||cell.correct!==true)return true;
 }else if(cell.expectedAnswer==='typeUnconfirmed'){
  if(raw?.result!=null||raw?.error?.errorName!=='typeUnconfirmed'||status.confirmed||status.reason!==cell.expectedReason)return true;
  if(cell.part==='truncation'&&hasFieldValuesOrLengths(raw,cell))return true;
 }else return true;
 if(cell.part==='unchanged'){
  const wanted=cell.variant==='prevented'?[0,cell.text.length]:[cell.text.length,0];
  if(cell.correct!==true||!Array.isArray(cell.finalSelection)||cell.finalSelection.length!==2||cell.finalSelection.some((n,i)=>n!==wanted[i]))return true;
  if(cell.variant==='prevented'&&!(cell.trace??[]).some(t=>t.event==='beforeinput'&&t.targetEditor===true&&t.defaultPrevented===true))return true;
 }
 return cell.secret===true&&cell.returnUnits===3&&cell.secretReadbackEqual!==true;
}
