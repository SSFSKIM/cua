// Builder-requested diagnostic cells, kept separate from the original rate denominators.
import {SEED} from './page.mjs';
export function extraPlan({browser,editor,reps}){
 const out=[],add=c=>out.push({...c,id:[c.part,c.editor,c.variant??'spike',c.rep].join('/'),key:'cmd+a',length:c.text?.length??null});
 for(let rep=1;rep<=reps;rep++){
  if(editor!=='compose')add({part:'ending-return',editor,rep,text:'First line\n',expectedAnswer:editor==='input'?'keysUnconfirmed':'confirmed',expectedText:editor==='input'?'First line':'First line\n'});
  if(['textarea','contenteditable'].includes(editor))add({part:'multiline',editor,rep,text:'First line\nSecond line',expectedAnswer:'confirmed'});
  if(browser==='cft'&&editor==='textarea')add({part:'truncation',editor,rep,variant:'unicode-cap',text:'New typed sentence goes here.',seed:'한'.repeat(10001),expectedAnswer:'typeUnconfirmed',expectedReason:'possiblyTruncated'});
  if(editor==='input'){
   for(const variant of ['consumed','prevented'])add({part:'unchanged',editor,rep,variant,text:SEED,preventInput:variant==='prevented',expectedAnswer:variant==='consumed'?'confirmed':'typeUnconfirmed',...(variant==='prevented'?{expectedReason:'unchanged'}:{})});
   for(const variant of ['equality','mismatch','one-return','three-returns'])add({part:'secret',editor,rep,variant,text:'{{secret:PROBE354}}',secret:true,returnUnits:variant==='one-return'?1:variant==='three-returns'?3:0,expectedAnswer:variant==='mismatch'?'typeUnconfirmed':'confirmed',...(variant==='mismatch'?{expectedReason:'concealedMismatch'}:{})});
   for(const variant of ['equal','different'])add({part:'secret-selection',editor,rep,variant,text:'{{secret:PROBE354}}',secret:true});
  }
 }
 // A leaving key can disturb native focus despite DOM focus; one terminal semantic diagnostic, never a rate cell.
 add({part:'ending-tab',editor,rep:1,text:'Tab prefix\t',expectedAnswer:'keysUnconfirmed',expectedText:'Tab prefix'});
 return out.map(c=>({...c,length:c.part==='secret-selection'?null:c.length,key:c.secret||c.variant==='unicode-cap'?null:c.key,renderedText:c.editor==='contenteditable'&&['ending-return','multiline'].includes(c.part),variant:c.variant??'spike'}));
}
export function readbackStatus(raw){
 const r=(raw?.result?.meta??raw?.error?.meta)?.typeReadback;
 return {confirmed:r?.confirmed===true,keysUnconfirmed:r?.keysUnconfirmed??0,checkpoints:r?.checkpoints??0,reason:r?.reason??null};
}
export const needsForegroundReference=cell=>cell.renderedText===true&&!cell.secret&&!cell.privateField&&['textarea','input','contenteditable','compose'].includes(cell.editor);
export const referenceKey=cell=>JSON.stringify([cell.part,cell.editor,cell.variant??'spike',cell.text]);
export const publicDOM=s=>s?Object.fromEntries(['text','innerText','domText','html'].map(k=>[k,s[k]])):null;
export function renderedVerdict(cell,reference,measured){
 const unscorable=reason=>({scorable:false,reason});
 const readable=ax=>ax?.readable===true&&ax.secure===false&&ax.valueRead===true&&typeof ax.value==='string';
 const domReadable=dom=>dom&&['text','innerText','domText','html'].every(k=>typeof dom[k]==='string');
 if(!needsForegroundReference(cell))return unscorable('notPublicRenderedText');
 if(!reference)return unscorable('foregroundReferenceUnavailable');
 if(['browser','editor','arm','engine'].some(k=>reference[k]!==cell[k])||reference.text!==cell.text)return unscorable('foregroundReferenceIdentityMismatch');
 if(reference.foregroundVerified!==true||typeof reference.route!=='string'||!domReadable(reference.dom)||!readable(reference.ax))return unscorable('foregroundReferenceUnreadable');
 const expected=cell.expectedText??cell.text;
 if(reference.dom.text!==expected)return unscorable('foregroundReferenceMismatch');
 if(!measured||!domReadable(measured.dom)||!readable(measured.ax))return unscorable('measuredDOMOrAXUnreadable');
 if(measured.route!==reference.route)return unscorable('foregroundReferenceRouteMismatch');
 const domMatches=['text','innerText','domText','html'].every(k=>measured.dom[k]===reference.dom[k]),axMatches=measured.ax.value===reference.ax.value;
 if(axMatches&&!domMatches)return {...unscorable('measuredDOMStructureMismatch'),routeEquivalent:true,domMatches,axMatches};
 return {scorable:true,correct:domMatches&&axMatches,routeEquivalent:true,domMatches,axMatches};
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
 if(cell.part==='secret-selection')return cell.variant==='different'&&cell.secretSelectionEqual!==true;
 if(!cell.expectedAnswer)return false;
 const status=readbackStatus(raw);
 if(cell.expectedAnswer==='keysUnconfirmed')return !confirmedBeforeKey(cell,raw)||(cell.correct!==true&&!qualifiedKeyAnswer(cell,raw));
 if(cell.expectedAnswer==='confirmed'){
  if(!success(raw)||!status.confirmed||cell.correct!==true)return true;
 }else if(cell.expectedAnswer==='typeUnconfirmed'){
  if(raw?.result!=null||raw?.error?.errorName!=='typeUnconfirmed'||status.confirmed||(cell.expectedReason!==undefined&&status.reason!==cell.expectedReason))return true;
  if(cell.part==='truncation'&&hasFieldValuesOrLengths(raw,cell))return true;
 }else return true;
 if(cell.part==='unchanged'){
  const wanted=cell.variant==='prevented'?[0,cell.text.length]:[cell.text.length,0];
  if(cell.correct!==true||!Array.isArray(cell.finalSelection)||cell.finalSelection.length!==2||cell.finalSelection.some((n,i)=>n!==wanted[i]))return true;
  if(cell.variant==='prevented'&&!(cell.trace??[]).some(t=>t.event==='beforeinput'&&t.targetEditor===true&&t.defaultPrevented===true))return true;
 }
 return cell.secret===true&&cell.returnUnits===3&&cell.secretReadbackEqual!==true;
}
