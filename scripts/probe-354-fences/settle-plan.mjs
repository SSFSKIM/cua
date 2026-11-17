// Paired measurement, not an observer diagnostic. References remain held until the final after head is supplied.
import {abPlan,assertPins} from './ab-model.mjs';
import {followupPlan} from './followup.mjs';
export const SETTLE_MODE='settle-ab';
export function settlePlan({browser,editor,arm,reps}){
 if(!['main','branch'].includes(arm))throw Error('invalid comparison arm');
 const core=abPlan({browser,editor,reps}).filter(c=>['race','clean'].includes(c.part));
 return browser==='safari'&&editor==='input'?core.concat(followupPlan({browser,editor,arm,reps})):core;
}
export function measurementRefs(mode,{main,branch,before,after}){
 const selected=mode===SETTLE_MODE?{main:before,branch:after}:{main,branch};
 assertPins(selected.main,selected.branch);return selected;
}
