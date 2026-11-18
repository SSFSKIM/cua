// #361's cells: what each trial pastes, into which field, what the field must hold afterwards (judged by the owned
// fixture, never through cua) and, for a negative control, the exact content its one perturbation produces.
import {randomInt} from 'node:crypto';

// Input sources the hosted runner is asked to enable and select (TIS ids), keyed by the kit's short names.
export const SOURCES={
  ko:{id:'com.apple.inputmethod.Korean.2SetKorean',script:'hangul'},
  'ja-romaji':{id:'com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese',script:'japanese'},
  'ja-kana':{id:'com.apple.inputmethod.Kotoeri.KanaTyping.Japanese',script:'japanese'},
  zh:{id:'com.apple.inputmethod.SCIM.ITABC',script:'hanzi'},
};
export const LANES=['safari','cft','firefox','electron','appkit'];
export const PLAIN=['empty-cjk','empty-mixed','prefilled-cjk','prefilled-mixed','selection','multiline','newline-single'];
export const CONTROLS=['rewrite','add','stale'];
export const CELLS=[...PLAIN,...CONTROLS];
// The rewrite control's prefill is long and its caret central, so a bounded excerpt (#354: 100 UTF-16 units either side of
// the first difference) can never reach its first or last CANARY units; either appearing anywhere is an unbounded excerpt.
export const LONG_SIDE=150, CANARY=30;
// The one character a rewrite control puts in place of the first pasted one: same length, never in a generated text.
export const REWRITE_CHAR='※';

const pick=(lo,hi)=>String.fromCharCode(lo+randomInt(hi-lo+1));
// Synthetic ASCII is upper-case consonants: never 'z' (the add control's character), and never a run of six that ordinary
// protocol keys or English sentences could contain, so the privacy scan's 6-unit windows cannot collide with boilerplate.
// The CJK ranges never contain REWRITE_CHAR.
export const ascii=n=>Array.from({length:n},()=>'BCDFGHJKLMNPQRSTVWXY'[randomInt(20)]).join('');
const digits=n=>Array.from({length:n},()=>String(randomInt(10))).join('');
const scripts={
  hangul:()=>pick(0xac00,0xd7a3),
  // Hiragana and kanji alternately: what a Japanese source composes.
  japanese:i=>i%2?pick(0x4e00,0x9fa5):pick(0x3042,0x3093),
  hanzi:()=>pick(0x4e00,0x9fa5),
};
export function cjk(script,n){const f=scripts[script];if(!f)throw Error('unknown script');return Array.from({length:n},(_,i)=>f(i)).join('');}

const TEXT={
  cjk:s=>cjk(s,6),
  mixed:s=>`${cjk(s,2)} ${ascii(3)} ${digits(3)} ${cjk(s,2)}`,
  lines:s=>`${cjk(s,3)}\n${cjk(s,2)} ${ascii(3)}\n${cjk(s,2)}`,
  'two-lines':s=>`${cjk(s,3)}\n${cjk(s,3)}`,
};
const SHAPES={
  'empty-cjk':{field:'single',prefill:0,text:'cjk'},
  'empty-mixed':{field:'single',prefill:0,text:'mixed'},
  'prefilled-cjk':{field:'single',prefill:10,caret:'end',text:'cjk'},
  'prefilled-mixed':{field:'single',prefill:10,caret:5,text:'mixed'},
  selection:{field:'single',prefill:19,select:[4,11],text:'mixed'},
  multiline:{field:'multi',prefill:0,text:'lines'},
  'newline-single':{field:'single',prefill:0,text:'two-lines'},
  rewrite:{field:'single',prefill:2*LONG_SIDE,caret:LONG_SIDE,text:'cjk',effect:'rewrite'},
  add:{field:'single',prefill:0,text:'cjk',effect:'add'},
  stale:{field:'single',prefill:10,caret:'end',text:'cjk',effect:'stale'},
};

// What a field holds once the text went in where the selection was: a single-line field takes no newline (its Return adds
// nothing, as #354's keyed read-back expects), a multi-line one takes each as "\n".
export function landed(field,text){return field==='multi'?text.replace(/\r\n|\r/g,'\n'):text.replace(/\r\n|\r|\n/g,'');}

export function materialize(cell,source){
  const shape=SHAPES[cell],script=SOURCES[source]?.script;
  if(!shape||!script)throw Error('unknown cell or source');
  const initial=ascii(shape.prefill);
  const [start,end]=shape.select??(shape.caret==='end'?[initial.length,initial.length]:Number.isInteger(shape.caret)?[shape.caret,shape.caret]:[0,0]);
  const text=TEXT[shape.text](script),put=landed(shape.field,text);
  const surround=t=>initial.slice(0,start)+t+initial.slice(end);
  const effect=shape.effect??'none';
  // Exactly one perturbation, its result known in advance: the first pasted character rewritten in place, one 'z' added at
  // the caret once the paste lands, or the caret moved to the field's start before the paste lands.
  const control=effect==='rewrite'?surround(REWRITE_CHAR+put.slice(1)):effect==='add'?surround(put+'z'):
    effect==='stale'?put+initial:null;
  const canaries=shape.prefill>=2*LONG_SIDE?[initial.slice(0,CANARY),initial.slice(-CANARY)]:[];
  return {cell,field:shape.field,initial,start,end,text,expected:surround(put),control,effect,staleTo:effect==='stale'?0:null,
    lines:text.split(/\r\n|\r|\n/).length,canaries};
}

// Rows in run order. A qualification interleaves the heads, alternating which goes first per cell and repetition, and the
// paired rows of one cell and repetition receive the same text.
export function plan({mode,heads,cells=CELLS}){
  const reps=mode==='smoke'?1:mode==='qualify'?20:10;
  const rows=[];
  for(let rep=0;rep<reps;rep++)cells.forEach((cell,i)=>{
    const order=heads.length===2&&(rep+i)%2===1?[heads[1],heads[0]]:heads;
    for(const head of order)rows.push({cell,rep,head});
  });
  return rows;
}
