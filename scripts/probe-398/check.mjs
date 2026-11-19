// Scoring, summaries and gates for the #398 fixture lanes. Pure: unit-tested by kit.test.mjs. Field truth is the owned
// fixture's booleans; every projected diagnostic is a member of a closed vocabulary or an engine error name.
import {PLACEHOLDER_CELLS,TWIN_CELLS,UNITS,TARGET_LABEL,TWIN,unitKey} from './cells.mjs';

// The observation's node for the trial's target and, for the twins, the second twin: by label (AXDescription or
// AXTitle), the twins, which share one, by the placeholder each showed. Null unless each is exactly one node.
export function findTargets(nodes,cell){
  const list=Array.isArray(nodes)?nodes:[];
  const labelled=label=>list.filter(n=>n.description===label||n.title===label);
  if(TWIN_CELLS.includes(cell)){
    const twins=labelled(TWIN.label),a=twins.filter(n=>n.placeholder===TWIN.a),b=twins.filter(n=>n.placeholder===TWIN.b);
    return a.length===1&&b.length===1?{target:a[0],twin:b[0]}:null;
  }
  const t=labelled(TARGET_LABEL[cell]);
  return t.length===1?{target:t[0]}:null;
}

// The refusals a placeholder change can cause on main: a re-fetch that finds no element by the stored identity
// (elementNoLongerValid), set_value's post-write re-check failing the same way (valueUnconfirmed, ruling 772), or the
// fallback walk's ambiguity.
export const IDENTITY_REFUSALS=new Set(['elementNoLongerValid','valueUnconfirmed','elementAmbiguousBeforeRefetch','elementAmbiguousAfterRefetch']);
export const VALID_BAR=0.8;
const name=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,47}$/.test(x)?x:'other';
// An engine reply as a closed outcome: success, the engine's error name, or why there was none.
export function outcomeOf(reply){
  if(reply==='skipped')return 'skipped';
  if(!reply||typeof reply!=='object')return 'missing';
  if(reply.error)return name(reply.error.errorName??'unnamed');
  return reply.result!==undefined?'success':'missing';
}
const FIELDS=new Set(['setup','static','focus','rotate','input','search','twinA','twinB','other','none']);
const field=x=>FIELDS.has(x)?x:'other';
// What the observation showed of the target's placeholder: an attribute with text, an empty one, or none.
export const placeholderShape=node=>!node?null:typeof node.placeholder!=='string'?'absent':node.placeholder.trim()===''?'empty':'set';
export const roleCode=x=>typeof x==='string'&&/^AX(TextField|TextArea|ComboBox|SearchField|SecureTextField)$/.test(x)?x:x==null?null:'other';

// One row's verdicts from the settled fixture state (`read`), the click's and the second action's outcomes.
export function score({cell,attested,click,act,read}){
  const twin=TWIN_CELLS.includes(cell),target=read?.target;
  const others=Array.isArray(read?.othersWritten)?read.othersWritten.map(field):[];
  const focusedOthers=Object.entries(read?.focusesSinceMark??{}).filter(([k,n])=>k!==target&&Number(n)>0).map(([k])=>field(k));
  // A field other than the target written, or focused by the actions: the wrong element was adopted.
  const wrongAdoption=attested&&(others.length>0||focusedOthers.length>0);
  const exact=read?.exact===true;
  const realized=twin?true:cell==='static'?null:Number(read?.placeholderChanges)>0;
  let verdict;
  if(!attested)verdict='invalid';
  else if(wrongAdoption)verdict='wrong-adoption';
  else if(act==='success'&&exact&&(twin||read?.sameNode===true))verdict='success-exact';
  else if(act==='success')verdict='wrong-success';
  else if(act==='skipped')verdict='click-refused';
  else if(exact)verdict='refused-delivered';
  else verdict='refused';
  const refused=['click-refused','refused-delivered','refused'].includes(verdict);
  // A refusal that only the placeholder explains: the field the observation named is still the same node, present, its
  // placeholder changed after the observation, and the refusal is an identity refusal.
  const placeholderRefusal=!twin&&refused&&realized===true&&read?.sameNode===true&&read?.present===true&&
    (IDENTITY_REFUSALS.has(click)||IDENTITY_REFUSALS.has(act));
  return {verdict,exact,realized,wrongAdoption,othersWritten:others,focusedOthers,refused,placeholderRefusal,
    sameNode:read?.sameNode===true,present:read?.present===true};
}

const tally=list=>list.reduce((o,k)=>(o[k]=(o[k]??0)+1,o),{});
export function summarize(rows){
  const out={};
  for(const r of rows){
    const k=`${r.head}|${unitKey(r)}`;
    (out[k]??=[]).push(r);
  }
  return Object.fromEntries(Object.entries(out).map(([k,list])=>{
    const v=list.filter(r=>r.valid);
    return [k,{rows:list.length,valid:v.length,invalid:tally(list.filter(r=>!r.valid).map(r=>r.invalid)),
      verdicts:tally(v.map(r=>r.verdict)),click:tally(v.map(r=>r.click)),act:tally(v.map(r=>r.act)),
      realized:v.filter(r=>r.realized===true).length,placeholderRefusals:v.filter(r=>r.placeholderRefusal).length,
      observedPlaceholder:tally(v.map(r=>r.observedPlaceholder??'none'))}];
  }));
}

// Every planned row ran, and every unit of every head kept at least VALID_BAR of its rows valid.
export function coverage(rows,{planned,heads,units=UNITS}){
  const per={};
  let covered=true;
  for(const h of heads)for(const u of units){
    const list=rows.filter(r=>r.head===h&&r.cell===u.cell&&r.seq===u.seq),want=planned[`${h}/${unitKey(u)}`]??0;
    const valid=list.filter(r=>r.valid).length;
    per[`${h}/${unitKey(u)}`]={planned:want,ran:list.length,valid};
    if(want===0||list.length<want||valid<VALID_BAR*want)covered=false;
  }
  return {complete:Object.values(per).every(p=>p.ran>=p.planned),covered,per};
}

// The qualification gates (two heads). A row pairs with the other head's row of the same unit and repetition.
export function gates(rows,{coverage:cov}){
  const fix=rows.filter(r=>r.head==='fix'&&r.valid),main=rows.filter(r=>r.head==='main'&&r.valid);
  const placeholderRows=fix.filter(r=>PLACEHOLDER_CELLS.includes(r.cell));
  const notFixed=placeholderRows.filter(r=>!(r.verdict==='success-exact'&&r.click==='success'));
  const wrong=fix.filter(r=>r.verdict==='wrong-adoption'||r.verdict==='wrong-success');
  const removed=fix.filter(r=>r.cell==='twin-removed'),removedAccepted=removed.filter(r=>!r.refused);
  const recreate=fix.filter(r=>r.cell==='twin-recreate'),recreateLost=recreate.filter(r=>r.verdict!=='success-exact');
  const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r]));
  const regressions=fix.filter(r=>pair.get(`${unitKey(r)}/${r.rep}`)?.verdict==='success-exact'&&r.verdict!=='success-exact');
  const mainPlaceholderRefusals=main.filter(r=>r.placeholderRefusal).length;
  const brief=list=>list.slice(0,20).map(r=>({unit:unitKey(r),rep:r.rep,click:r.click,act:r.act,verdict:r.verdict}));
  return {
    coverage:{pass:cov.complete&&cov.covered},
    placeholderFixed:{pass:placeholderRows.length>0&&notFixed.length===0,rows:placeholderRows.length,failed:notFixed.length,
      mainPlaceholderRefusals,examples:brief(notFixed)},
    noWrongAdoption:{pass:wrong.length===0,fixRows:fix.length,wrong:wrong.length,
      mainWrong:main.filter(r=>r.verdict==='wrong-adoption'||r.verdict==='wrong-success').length,examples:brief(wrong)},
    twinRemovedRefused:{pass:removed.length>0&&removedAccepted.length===0,rows:removed.length,accepted:removedAccepted.length},
    twinRecreateHeld:{pass:recreate.length>0&&recreateLost.length===0,rows:recreate.length,lost:recreateLost.length,examples:brief(recreateLost)},
    noRegression:{pass:regressions.length===0,regressions:regressions.length,examples:brief(regressions)},
  };
}
