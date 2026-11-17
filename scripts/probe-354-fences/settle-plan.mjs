// Paired measurement, not an observer diagnostic. References remain held until the final after head is supplied.
import {abPlan,assertPins} from './ab-model.mjs';
import {followupPlan,NO_KEY_TEXT} from './followup.mjs';
export const SETTLE_MODE='settle-ab';
export function settlePlan({browser,editor,arm,reps}){
 if(!['main','branch'].includes(arm))throw Error('invalid comparison arm');
 const core=abPlan({browser,editor,reps}).filter(c=>['race','clean'].includes(c.part));
 if(browser!=='safari'||editor!=='input')return core;
 const extra=followupPlan({browser,editor,arm,reps});
 if(arm==='branch')for(let rep=1;rep<=reps;rep++)extra.push({part:'large-page',editor:'input',variant:'plain',rep,id:`large-page/input/plain/${rep}`,key:null,length:NO_KEY_TEXT.length,text:NO_KEY_TEXT,largePageNodes:1600,observerEffect:true});
 return core.concat(extra);
}
export function measurementRefs(mode,{main,branch,before,after}){
 const selected=mode===SETTLE_MODE?{main:before,branch:after}:{main,branch};
 assertPins(selected.main,selected.branch);return selected;
}
