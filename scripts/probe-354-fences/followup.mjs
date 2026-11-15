// Follow-up measurement cohort for the next builder head. Never pooled with primary or caret evidence: it re-measures what
// the primary run could not score (six shards that never completed, four Unicode-cap cells invalidated by the fixture's
// UTF-8 decoding), adds ending-Return and multiline controls for the textareas, and adds the no-key Safari questions.
// Plans are filtered from the existing full plans, so historical cell ids and repetition numbers survive; the no-key
// plain cell is the only new cell. Pure: no I/O.
import {abPlan} from './ab-model.mjs';
import {matrix} from './matrix.mjs';
export const FOLLOWUP='followup';
// Primary-run cap cells whose answer the fixture corrupted: branch reps 1, 4 and 7, control rep 7.
export const CAP_RETRIES=Object.freeze({branch:Object.freeze([1,4,7]),main:Object.freeze([7])});
// Same length and alphabet as the synthetic 32-byte hex secret, so plain and secret no-key cells differ only in privacy.
export const NO_KEY_TEXT='0123456789abcdef'.repeat(4);
// Each shard runs its scopes in order; the fixed cap retries come last so an early abort cannot cost the controls.
export const FOLLOWUP_SCOPES=Object.freeze({
 'safari-textarea':Object.freeze(['text-controls']),
 'safari-input':Object.freeze(['no-key']),
 'safari-contenteditable':Object.freeze(['ending-return']),
 'cft-textarea':Object.freeze(['text-controls','unicode-cap-retries']),
 'cft-contenteditable':Object.freeze(['full']),'cft-compose':Object.freeze(['full']),
 'firefox-textarea':Object.freeze(['full']),'firefox-input':Object.freeze(['full']),'firefox-contenteditable':Object.freeze(['full']),'firefox-compose':Object.freeze(['full'])
});
export function followupMatrix(only='all'){
 const all=matrix('all').include.filter(c=>Object.hasOwn(FOLLOWUP_SCOPES,c.id));
 if(only.trim()==='all')return {include:all};
 const want=only.split(',').map(s=>s.trim()).filter(Boolean),unknown=want.filter(id=>!all.some(c=>c.id===id));
 if(!want.length||unknown.length)throw Error('unknown or empty follow-up shard ids: '+(unknown.join(',')||only));
 return {include:all.filter(c=>want.includes(c.id))};
}
// `reps` scales every scope except the cap retries, which are a fixed list and the only part that differs between arms.
const SCOPES={
 full:({browser,editor,reps})=>abPlan({browser,editor,reps}),
 // The full plan's own cells. Return is text in textarea and contenteditable, so both kinds are expected confirmed.
 'ending-return':({browser,editor,reps})=>abPlan({browser,editor,reps}).filter(c=>c.part==='ending-return'),
 'text-controls':({browser,editor,reps})=>abPlan({browser,editor,reps}).filter(c=>['ending-return','multiline'].includes(c.part)),
 'unicode-cap-retries':({browser,editor,arm})=>{
  const wanted=CAP_RETRIES[arm];
  return abPlan({browser,editor,reps:Math.max(...wanted)}).filter(c=>c.variant==='unicode-cap'&&wanted.includes(c.rep));
 },
 // No press_key between setup and type_text. The secret cell is the existing trusted-wrapper equality cell, which already has no key.
 'no-key':({browser,editor,reps})=>{
  const secrets=abPlan({browser,editor,reps}).filter(c=>c.part==='secret'&&c.variant==='equality'),out=[];
  for(let rep=1;rep<=reps;rep++){
   const plain={part:'no-key',editor,key:null,variant:'plain',length:NO_KEY_TEXT.length,rep,id:['no-key',editor,'plain',rep].join('/'),text:NO_KEY_TEXT,expectedAnswer:'confirmed'};
   const secret=secrets.find(c=>c.rep===rep);
   out.push(...(rep%2?[plain,secret]:[secret,plain]));
  }
  return out;
 }
};
export function followupPlan({browser,editor,arm,reps}){
 const scopes=FOLLOWUP_SCOPES[browser+'-'+editor];
 if(!scopes||!['main','branch'].includes(arm)||!Number.isInteger(reps)||reps<1)throw Error('invalid follow-up plan: '+[browser,editor,arm,reps].join('/'));
 return scopes.flatMap(scope=>SCOPES[scope]({browser,editor,arm,reps}));
}
