// #398's cells: which field a trial acts on, what the fixture does to its placeholder or its handle, and the action
// sequence. Field truth is the owned fixture's own (./page.mjs, ./fixture.swift), never read through cua.
import {randomInt} from 'node:crypto';

export const LANES=['cft','safari','electron','appkit'];
// The placeholder changes (and `static`, which never changes: the control). Each runs both sequences.
export const PLACEHOLDER_CELLS=['static','focus','rotate','input','search'];
// The stale-handle twins: the first of two fields alike but for their placeholder is recreated alike, recreated with
// another placeholder, or removed, between the observation and the first action.
export const TWIN_CELLS=['twin-recreate','twin-renamed','twin-removed'];
// A unique field (no twin) recreated with another placeholder: the stale handle's only otherwise-matching replacement,
// which a tiebreak adopts and a strict fallback walk refuses.
export const SOLO_CELLS=['solo-renamed'];
// The cells whose observed handle `mark` makes stale.
export const STALE_CELLS=[...TWIN_CELLS,...SOLO_CELLS];
// `set`: click the field's element, then set_value on the same element. `type`: click it, then type_text.
export const SEQUENCES=['set','type'];
export const UNITS=[...PLACEHOLDER_CELLS.flatMap(cell=>SEQUENCES.map(seq=>({cell,seq}))),...STALE_CELLS.map(cell=>({cell,seq:'set'}))];
export const unitKey=u=>`${u.cell}/${u.seq}`;
// The label each cell's target is found by in the observation; the twins share one and are told apart by placeholder.
export const TARGET_LABEL={static:'Probe398 static',focus:'Probe398 focus',rotate:'Probe398 rotate',input:'Probe398 input',
  search:'Probe398 search','solo-renamed':'Probe398 solo'};
export const SOLO={label:'Probe398 solo',placeholder:'Probe398 street address',renamed:'Probe398 street and number'};
export const TWIN={label:'Probe398 twin',a:'Probe398 first name',b:'Probe398 last name'};

// Synthetic ASCII: upper-case consonants after a fixed prefix (never a word, never a placeholder's text).
export const ascii=n=>Array.from({length:n},()=>'BCDFGHJKLMNPQRSTVWXY'[randomInt(20)]).join('');
export const materialize=u=>({...u,value:'Q398'+ascii(10)});

// Rows in run order. A qualification interleaves the heads, alternating which goes first per unit and repetition.
export function plan({mode,heads,units=UNITS}){
  const reps=mode==='smoke'?1:mode==='qualify'?20:10;
  const rows=[];
  for(let rep=0;rep<reps;rep++)units.forEach((u,i)=>{
    const order=heads.length===2&&(rep+i)%2===1?[heads[1],heads[0]]:heads;
    for(const head of order)rows.push({...u,rep,head});
  });
  return rows;
}
