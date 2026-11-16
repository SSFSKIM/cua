import test from 'node:test';
import assert from 'node:assert/strict';
import {plan, classify, summarize, expected, ENGINE_REF} from './model.mjs';

// These checks protect denominators and prevent a successful post from being called an effect.
test('full and smoke cover every labelled cell, without silently reducing repetitions',()=>{
 const full=plan(false),smoke=plan(true);
 assert.equal(full.length,2560);assert.equal(smoke.length,128);
 assert.equal(new Set(full.map(x=>x.id)).size,2560);
 for(const c of smoke)assert.equal(full.filter(x=>x.cell===c.cell).length,20);
 assert.equal(full.filter(x=>x.scene==='background'&&x.key==='Left'&&x.variant==='window').length,80);
 assert.equal(full.filter(x=>x.scene==='foreground').length,320);
 assert.equal(full.filter(x=>x.reader===false).length,160);
 assert.equal(ENGINE_REF,'3c669314e0a5f35aedf20f9b792604fc09628c45');
 assert.deepEqual(expected('alt+Left'),[24,0]);assert.deepEqual(expected('cmd+shift+Left'),[0,29]);
});
const owner={pageId:'a'.repeat(32),timeOrigin:123,ownerEpoch:1};
function fixture(overrides={}){
 const c=plan(true).find(c=>c.variant==='baseline'&&c.scene==='background'&&c.key==='Left'&&c.editor==='contenteditable');
 const snap=(s,delay)=>({...owner,op:'sample',text:'Old draft sentence goes here.',selection:s,focused:true,visibility:'visible',delay});
 return {...c,owner,setup:{...snap([29,0],0),...owner},samples:[snap([28,0],0),snap([28,0],50),snap([28,0],250),snap([28,0],1000)],
  identityBefore:{windowTitle:'probe354:'+owner.pageId,windowID:42,frontmostPid:2},identityAfter:{windowTitle:'probe354:'+owner.pageId,windowID:42,frontmostPid:2},targetPid:1,coverPid:2,
  action:{error:null,probe:{posted:[{type:10,keycode:123}],variant:'baseline'}},watch:{complete:true,samples:[{frontmostPid:2,targetAboveCover:false,orderReadable:true}]},
  axBefore:{range:[29,0],sameFocused:true},axSamples:[{delay:1000,range:[28,0],sameFocused:true}],...overrides};
}
test('DOM movement, not RPC success or readable AX, is the effect oracle',()=>{
 const r=fixture();assert.equal(classify(r).effect,true);
 const unchanged=r.samples.map(s=>({...s,selection:[29,0]}));
 const score=classify({...r,samples:unchanged});
 assert.equal(score.scorable,true);assert.equal(score.effect,false);assert.equal(score.plainSuccessNoEffect,true);
 assert.equal(score.axFalseConfirm,true);
});
test('stale AX cannot confirm, and a boundary no-op does not claim consumption',()=>{
 const r=fixture({axSamples:[{delay:1000,range:[29,0],sameFocused:true}]});
 assert.equal(classify(r).axConfirms,false);assert.equal(classify(r).axAfterAgrees,false);
 const b=fixture({boundary:true,expected:[0,0],setup:{...r.setup,selection:[0,0]},samples:r.samples.map(s=>({...s,selection:[0,0]})),axBefore:{range:[0,0],sameFocused:true},axSamples:[{delay:1000,range:[0,0],sameFocused:true}]});
 assert.equal(classify(b).effect,true);assert.equal(classify(b).axConfirms,false);
 assert.equal(classify(fixture({axBefore:{range:null,sameFocused:true}})).axPairReadable,false);
 assert.equal(classify(fixture({axBefore:{range:[29,0],sameFocused:false}})).axConfirms,false);
});
test('ownership loss, missing final sample and focus/window mismatch exclude effect rates',()=>{
 const r=fixture();
 for(const change of [
  {samples:r.samples.map(s=>({...s,pageId:'b'.repeat(32)}))},
  {samples:r.samples.slice(0,3)},
  {identityAfter:{...r.identityAfter,windowID:43}},
  {setup:{...r.setup,selection:[28,0]}},
  {watch:{complete:true,samples:[]}},
 ])assert.equal(classify({...r,...change}).scorable,false);
});
test('transient foreground or ordering change remains a side effect, never repaired away',()=>{
 const r=fixture({watch:{complete:true,samples:[{frontmostPid:1,targetAboveCover:true,orderReadable:true},{frontmostPid:2,targetAboveCover:false,orderReadable:true}]}});
 assert.equal(classify(r).sideEffect,true);assert.equal(classify(r).safeEffect,false);
 const missing=classify(fixture({watch:{complete:true,samples:[{frontmostPid:2,targetAboveCover:null,orderReadable:false}]}}));
 assert.equal(missing.sideEffectKnown,false);assert.equal(missing.safeEffect,false);
});
test('key-induced editor focus loss is a scored failure, not a fixture exclusion',()=>{
 const r=fixture();r.samples.at(-1).focused=false;
 const s=classify(r);assert.equal(s.scorable,true);assert.equal(s.effect,false);assert.equal(s.editorFocusLost,true);assert.equal(s.safeEffect,false);
});
test('coverage reader catches missing, duplicated, foreign, and mode-mixed rows',()=>{
 const r=fixture();const s=summarize([r],true);
 assert.equal(s.coverage.complete,false);assert.equal(s.coverage.missing,127);
 assert.equal(s.cells.find(x=>x.cell===r.cell).scorable,1);
 assert.equal(summarize([r,r],true).coverage.duplicates,1);
 assert.equal(summarize([{...r,id:'foreign'}],true).coverage.unknown,1);
 assert.equal(summarize([{...r,rep:2}],true).coverage.mismatched,1);
});
