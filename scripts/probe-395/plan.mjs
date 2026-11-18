// #395 trial plan. Pure: no I/O, no GUI. Every number here is a public design parameter; no content is chosen here.
// A round is one repetition of every cell, shuffled with a seeded generator so cell order is randomized within the round
// and the run's order can be reproduced from the recorded seed. The matched content pair (variants a and b) alternates by
// repetition, offset per cell so each round carries both variants about equally.
export const PAGES=Object.freeze(['small','large']);
export const KINDS=Object.freeze(['plain','secret','password']);
export const LENGTHS=Object.freeze([8,32,128]);
export const LARGE_NODES=1600;
// Main cells type into the public seed (plain, secret) at a collapsed caret; a password field cannot be typed into, so its
// seed is built to reach the very same field length and caret as the typed cells of the same label length.
export const SEED_LENGTH=29,CARET=3;
export const CONTROL_SEED_LENGTH=160,LONG_SEED_LENGTH=200;
export const PASSWORD_RANGE=16,PASSWORD_RANGE_LENGTHS=Object.freeze([8,128]);
// Plain caret controls, per page, over a 160-character seed: [name, selection start, replaced length, typed length, final
// selection length (a script selects it after typing, no focus change)]. They vary the caret and the field length while the
// other is held fixed, and two end non-collapsed.
export const CONTROLS=Object.freeze([
 ['len168-caret130-sel12',102,20,28,12],['len168-caret68-sel24',20,40,48,24],['caret130-len288',2,0,128,0],
].map(c=>Object.freeze(c)));
// Matched plain pairs inside one page, one field node, measured back to back: unchanged (same geometry, same content),
// content (same geometry, different content), prefix (same content through the caret, the field after it a different length).
export const PAIRS=Object.freeze([
 Object.freeze({role:'unchanged',a:Object.freeze({start:122,typed:8,seed:CONTROL_SEED_LENGTH}),b:Object.freeze({start:122,typed:8,seed:CONTROL_SEED_LENGTH})}),
 Object.freeze({role:'content',a:Object.freeze({start:60,typed:8,seed:CONTROL_SEED_LENGTH}),b:Object.freeze({start:60,typed:8,seed:CONTROL_SEED_LENGTH})}),
 Object.freeze({role:'prefix',a:Object.freeze({start:122,typed:8,seed:CONTROL_SEED_LENGTH}),b:Object.freeze({start:122,typed:8,seed:LONG_SEED_LENGTH})}),
]);
export const CONTROL_REPS=5,PASSWORD_RANGE_REPS=3;
// One number per geometry: five three-digit fields (seed length, selection start, replaced length, typed length, final range).
export const recipeOf=(seed,start,replaced,typed,range)=>[seed,start,replaced,typed,range].reduce((n,x)=>n*1000+x,0);
export function mulberry32(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function shuffle(list,random){const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
const variantOf=(rep,offset)=>(rep-1+offset)%2?'b':'a';
// A cell is typed (plain, secret) or seeded (password). `pairKey` is shared by exactly two cells that are measured back to
// back; `recipe` is the numeric geometry they were built from.
function cellBase(x){return {seedVariant:'a',finalRange:0,pairKey:null,pairRole:null,recipe:null,...x}}
function mainCell(rep,page,kind,length,pair=true){
 const typed=kind!=='password',offset=PAGES.indexOf(page)+(typed?0:KINDS.indexOf(kind))+LENGTHS.indexOf(length); // plain and secret of a pair share a variant
 const seedLength=typed?SEED_LENGTH:SEED_LENGTH+length,start=typed?CARET:CARET+length,typedLength=typed?length:0;
 return cellBase({id:['main',page,kind,length,rep].join('/'),part:'main',rep,page,kind,length,tag:kind+'-'+length,variant:variantOf(rep,offset),
  seedLength,selStart:start,selLength:0,typedLength,expected:{caret:CARET+length,selectionEnd:CARET+length,length:SEED_LENGTH+length},
  ...(typed&&pair?{pairKey:['main',page,length,rep].join('/'),pairRole:'plain-secret',recipe:recipeOf(seedLength,start,0,typedLength,0)}:{})});
}
function controlCell(rep,page,index){
 const [name,start,selLength,length,range]=CONTROLS[index],seedLength=CONTROL_SEED_LENGTH,caret=start+length;
 return cellBase({id:['control',page,name,rep].join('/'),part:'caret-control',control:name,rep,page,kind:'plain',length,tag:'plain-'+length,variant:variantOf(rep,PAGES.indexOf(page)+index),
  seedLength,selStart:start,selLength,typedLength:length,finalRange:range,expected:{caret,selectionEnd:caret+range,length:seedLength-selLength+length}});
}
// The cells of one pair: two cells of one page, measured back to back in a random order.
function pairCells(rep,page,index){
 const {role,a,b}=PAIRS[index],variant=variantOf(rep,PAGES.indexOf(page)+index),pairKey=['control',page,role,rep].join('/');
 return ['a','b'].map(side=>{
  const g=side==='a'?a:b,caret=g.start+g.typed,content=role==='content'?side:variant;
  return cellBase({id:['control',page,role,side,rep].join('/'),part:'pair-control',control:role,rep,page,kind:'plain',length:g.typed,tag:'plain-'+g.typed,variant:content,
   seedVariant:role==='content'?side:'a',seedLength:g.seed,selStart:g.start,selLength:0,typedLength:g.typed,pairKey,pairRole:role,recipe:recipeOf(g.seed,g.start,0,g.typed,0),
   expected:{caret,selectionEnd:caret,length:g.seed+g.typed}});
 });
}
// Password cells that keep a non-collapsed selection: nothing is typed; the seed reaches the typed cells' field length.
function passwordRangeCell(rep,page,length){
 const seedLength=SEED_LENGTH+length,start=CARET+length;
 return cellBase({id:['password-range',page,length,rep].join('/'),part:'password-range',rep,page,kind:'password',length,tag:'password-'+length,variant:variantOf(rep,PAGES.indexOf(page)+PASSWORD_RANGE_LENGTHS.indexOf(length)),
  seedLength,selStart:start,selLength:PASSWORD_RANGE,typedLength:0,expected:{caret:start,selectionEnd:start+PASSWORD_RANGE,length:seedLength}});
}
// Units of one repetition: a unit is one cell or a pair that stays adjacent. Order inside a round is randomized by unit.
export function roundUnits(rep,{controlReps=CONTROL_REPS,passwordRangeReps=PASSWORD_RANGE_REPS}={}){
 const units=[];
 for(const page of PAGES)for(const length of LENGTHS){
  units.push(['plain','secret'].map(kind=>mainCell(rep,page,kind,length)));
  units.push([mainCell(rep,page,'password',length)]);
 }
 if(rep<=controlReps)for(const page of PAGES){
  for(let i=0;i<PAIRS.length;i++)units.push(pairCells(rep,page,i));
  for(let i=0;i<CONTROLS.length;i++)units.push([controlCell(rep,page,i)]);
 }
 if(rep<=passwordRangeReps)for(const page of PAGES)for(const length of PASSWORD_RANGE_LENGTHS)units.push([passwordRangeCell(rep,page,length)]);
 return units;
}
export const roundCells=(rep,o)=>roundUnits(rep,o).flat();
// Pure self-check: unique ids, and every pairKey on exactly two cells of one page, repetition and role.
export function checkPlan(rounds){
 const ids=new Set(),keys=new Map();
 for(const c of rounds.flat()){
  if(ids.has(c.id))throw Error('duplicate cell');ids.add(c.id);
  if(c.pairKey!==null){
   if(!Number.isSafeInteger(c.recipe))throw Error('pair without recipe');
   const k=keys.get(c.pairKey)??[];k.push(c);keys.set(c.pairKey,k);
  }
 }
 for(const k of keys.values())if(k.length!==2||k[0].page!==k[1].page||k[0].rep!==k[1].rep||k[0].pairRole!==k[1].pairRole)throw Error('unpaired key');
 return {cells:ids.size,pairs:keys.size};
}
export function plan({reps,seed,controlReps=CONTROL_REPS,passwordRangeReps=PASSWORD_RANGE_REPS}){
 if(!Number.isInteger(reps)||reps<1||reps>20)throw Error('invalid repetitions');
 const random=mulberry32(seed);
 const rounds=Array.from({length:reps},(_,i)=>shuffle(roundUnits(i+1,{controlReps,passwordRangeReps}),random).flatMap(u=>shuffle(u,random)));
 checkPlan(rounds);
 return rounds;
}
// The two warmup cells ride the same code path, one per page, and are not scored or paired.
export const WARMUPS=Object.freeze(PAGES.map(page=>({...mainCell(0,page,'plain',8,false),id:'warmup/'+page,part:'warmup',rep:0,variant:'a'})));
