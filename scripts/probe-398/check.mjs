// Scoring, summaries and gates for the #398 fixture lanes. Pure: unit-tested by kit.test.mjs. Field truth is the owned
// fixture's booleans; every projected diagnostic is a member of a closed vocabulary or an engine error name.
import {PLACEHOLDER_CELLS,TWIN_CELLS,STALE_CELLS,UNITS,TARGET_LABEL,TWIN,unitKey} from './cells.mjs';

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
// No answer to judge: the reply never came, or its error carried no usable name.
const NO_ANSWER=new Set(['missing','other']);
export const VALID_BAR=0.8, EXERCISED_BAR=0.5;
const name=x=>typeof x==='string'&&/^[A-Za-z][A-Za-z0-9]{0,47}$/.test(x)?x:'other';
// An engine reply as a closed outcome: success, the engine's error name, or why there was none.
export function outcomeOf(reply){
  if(reply==='skipped')return 'skipped';
  if(!reply||typeof reply!=='object')return 'missing';
  if(reply.error)return name(reply.error.errorName??'unnamed');
  return reply.result!==undefined?'success':'missing';
}
// Why a native error says it refused, as a closed code from its message (ValueSetting.swift, ValueWithoutFocus.swift):
// the post-write re-fetch found no field (`refetch`), a late click's drift (`drift`), the unfocused write's read-back
// (`unfocused`), anything else (`other`); null without an error.
export function whyOf(reply){
  const m=reply&&typeof reply==='object'?reply.error?.message:null;
  if(typeof m!=='string')return null;
  if(/could not be found again/.test(m))return 'refetch';
  if(/without a click to focus/.test(m))return 'unfocused';
  if(/just after/.test(m))return 'drift';
  return 'other';
}
const FIELDS=new Set(['setup','static','focus','rotate','input','search','twinA','twinB','solo','other','none']);
const field=x=>FIELDS.has(x)?x:'other';
// What the observation showed of the target's placeholder: an attribute with text, an empty one, or none.
export const placeholderShape=node=>!node?null:typeof node.placeholder!=='string'?'absent':node.placeholder.trim()===''?'empty':'set';
export const roleCode=x=>typeof x==='string'&&/^AX(TextField|TextArea|ComboBox|SearchField|SecureTextField)$/.test(x)?x:x==null?null:'other';
// Whether the engine's own observation after the actions shows another placeholder for the target than the observation
// before them did: the text differs, the attribute appeared or went, or the node is gone (null when not re-observed).
export function axChangedOf(before,after,reobserved){
  if(!reobserved||!before)return null;
  if(!after)return true;
  return (typeof before.placeholder==='string'?before.placeholder:null)!==(typeof after.placeholder==='string'?after.placeholder:null);
}

// One row's verdicts. `first` is the fixture's read right after the actions, `read` the settled one; `axChanged` the
// re-observation's verdict on the placeholder; `observeFailed` an engine observation (or the target in it) missing after
// a valid prepare, which is the head's own answer and so a valid row.
export function score({cell,attested,observeFailed=false,click,act,actWhy=null,first,read,axChanged=null}){
  const stale=STALE_CELLS.includes(cell),placeholderCell=PLACEHOLDER_CELLS.includes(cell)&&cell!=='static';
  const target=read?.target;
  const others=Array.isArray(read?.othersWritten)?read.othersWritten.map(field):[];
  const focusedOthers=Object.entries(read?.focusesSinceMark??{}).filter(([k,n])=>k!==target&&Number(n)>0).map(([k])=>field(k));
  // A field other than the target written (the setup field's canary included), or focused by the actions.
  const wrongAdoption=attested&&!observeFailed&&(others.length>0||focusedOthers.length>0);
  const exact=read?.exact===true;
  const realized=stale?true:placeholderCell?Number(first?.placeholderChanges)>0:null;
  const exercised=stale?true:placeholderCell?realized&&axChanged===true:null;
  let verdict;
  if(!attested)verdict='invalid';
  else if(observeFailed)verdict='observe-failed';
  else if(wrongAdoption)verdict='wrong-adoption';
  else if(act==='success'&&exact&&(stale||read?.sameNode===true))verdict='success-exact';
  else if(act==='success')verdict='wrong-success';
  else if(NO_ANSWER.has(act)||act==='skipped'&&NO_ANSWER.has(click))verdict='no-answer';
  else if(act==='skipped')verdict='click-refused';
  else if(exact)verdict='refused-delivered';
  else verdict='refused';
  const refused=['click-refused','refused-delivered','refused'].includes(verdict);
  const identity=x=>IDENTITY_REFUSALS.has(x)&&x!=='valueUnconfirmed';
  // A refusal correlated with a placeholder change: the field the observation named is still the same node, present, its
  // placeholder changed by the first read after the actions and in the engine's own re-observation, and the refusal is an
  // identity refusal (valueUnconfirmed only when its re-fetch found no field).
  const placeholderCorrelated=placeholderCell&&refused&&exercised===true&&read?.sameNode===true&&read?.present===true&&
    (identity(click)||identity(act)||act==='valueUnconfirmed'&&actWhy==='refetch');
  return {verdict,exact,realized,exercised,wrongAdoption,othersWritten:others,focusedOthers,refused,placeholderCorrelated,
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
      verdicts:tally(v.map(r=>r.verdict)),click:tally(v.map(r=>r.click)),act:tally(v.map(r=>r.act)),actWhy:tally(v.map(r=>r.actWhy??'none')),
      realized:v.filter(r=>r.realized===true).length,exercised:v.filter(r=>r.exercised===true).length,
      unexercised:v.filter(r=>r.exercised===false).length,axChanged:v.filter(r=>r.axChanged===true).length,
      placeholderCorrelated:v.filter(r=>r.placeholderCorrelated).length,presentationLost:v.filter(r=>r.presentationHeld===false).length,
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
export function gates(rows,{coverage:cov,units=UNITS}){
  const fix=rows.filter(r=>r.head==='fix'&&r.valid),main=rows.filter(r=>r.head==='main'&&r.valid);
  const of=(list,u)=>list.filter(r=>r.cell===u.cell&&r.seq===u.seq);
  const brief=list=>list.slice(0,20).map(r=>({unit:unitKey(r),rep:r.rep,click:r.click,act:r.act,verdict:r.verdict}));
  // Every placeholder row an exact success after a successful click, and each changing unit actually exercised: its
  // placeholder changed in the fixture and in the engine's own re-observation on at least EXERCISED_BAR of its rows.
  const placeholderRows=fix.filter(r=>PLACEHOLDER_CELLS.includes(r.cell));
  const notFixed=placeholderRows.filter(r=>!(r.verdict==='success-exact'&&r.click==='success'));
  const exercise=Object.fromEntries(units.filter(u=>PLACEHOLDER_CELLS.includes(u.cell)&&u.cell!=='static').map(u=>{
    const list=of(fix,u);return [unitKey(u),{valid:list.length,exercised:list.filter(r=>r.exercised===true).length}];
  }));
  const underExercised=Object.entries(exercise).filter(([,x])=>x.valid===0||x.exercised<EXERCISED_BAR*x.valid).map(([k])=>k);
  const wrong=fix.filter(r=>r.verdict==='wrong-adoption'||r.verdict==='wrong-success');
  // The removed twin refused by an identity refusal from the click or the write, with an answer and nothing delivered.
  const removed=fix.filter(r=>r.cell==='twin-removed');
  const removedAccepted=removed.filter(r=>!((IDENTITY_REFUSALS.has(r.click)||IDENTITY_REFUSALS.has(r.act))&&!NO_ANSWER.has(r.act)&&!r.exact&&
    r.verdict!=='wrong-adoption'&&r.verdict!=='wrong-success'));
  const recreate=fix.filter(r=>r.cell==='twin-recreate'),recreateLost=recreate.filter(r=>r.verdict!=='success-exact');
  const solo=fix.filter(r=>r.cell==='solo-renamed'),soloLost=solo.filter(r=>r.verdict!=='success-exact');
  const pair=new Map(main.map(r=>[`${unitKey(r)}/${r.rep}`,r]));
  const regressions=fix.filter(r=>pair.get(`${unitKey(r)}/${r.rep}`)?.verdict==='success-exact'&&r.verdict!=='success-exact');
  // The claimed presentation: per unit, no more fix rows than main's on which something other than the cover activated.
  const presentation=Object.fromEntries(units.map(u=>[unitKey(u),{fix:of(fix,u).filter(r=>r.presentationHeld===false).length,
    main:of(main,u).filter(r=>r.presentationHeld===false).length}]));
  const presentationWorse=Object.entries(presentation).filter(([,x])=>x.fix>x.main).map(([k])=>k);
  return {
    coverage:{pass:cov.complete&&cov.covered},
    placeholderFixed:{pass:placeholderRows.length>0&&notFixed.length===0&&underExercised.length===0,rows:placeholderRows.length,
      failed:notFixed.length,underExercised,exercise,mainPlaceholderCorrelated:main.filter(r=>r.placeholderCorrelated).length,examples:brief(notFixed)},
    noWrongAdoption:{pass:wrong.length===0,fixRows:fix.length,wrong:wrong.length,
      mainWrong:main.filter(r=>r.verdict==='wrong-adoption'||r.verdict==='wrong-success').length,examples:brief(wrong)},
    twinRemovedRefused:{pass:removed.length>0&&removedAccepted.length===0,rows:removed.length,accepted:removedAccepted.length,examples:brief(removedAccepted)},
    twinRecreateHeld:{pass:recreate.length>0&&recreateLost.length===0,rows:recreate.length,lost:recreateLost.length,examples:brief(recreateLost)},
    soloAdopted:{pass:solo.length>0&&soloLost.length===0,rows:solo.length,lost:soloLost.length,
      mainSuccess:main.filter(r=>r.cell==='solo-renamed'&&r.verdict==='success-exact').length,examples:brief(soloLost)},
    noRegression:{pass:regressions.length===0,regressions:regressions.length,examples:brief(regressions)},
    presentation:{pass:presentationWorse.length===0,worse:presentationWorse,
      fixLost:fix.filter(r=>r.presentationHeld===false).length,mainLost:main.filter(r=>r.presentationHeld===false).length},
  };
}
