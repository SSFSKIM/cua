import test from 'node:test';
import assert from 'node:assert/strict';
import {judgePassword, judgeControls, timingStats} from './check.mjs';

const secret = 'q7x8n4m2r9w0';
const secure = {token:'p', depth:1, role:'AXTextField', subrole:'AXSecureTextField', title:'PW walk test', secure:true,
  value:null, valueType:null, valueMarkdown:null, valueDescription:'contains secure text'};
const plain = {token:'a', depth:1, role:'AXTextField', title:'Public control', value:'public-control'};
const area = {token:'b', depth:1, role:'AXTextArea', title:'Public notes', value:'public-textarea'};
const shot = (node = secure, extra = {}) => ({result:{nodes:[plain,area,node],menuBar:[],lineage:'s1',revision:2,focused:'p',selectedText:null,...extra}});
const controls = '1 text field Public control, Value: public-control\n2 text entry area Public notes, Value: public-textarea';
const full = `${controls}\n3 secure text field PW walk test, Value: secure text, Details: contains secure text`;
const noChange = 'There has been no change in the accessibility tree for Window: "Owned fixture".';
const cell = (native = shot(), text = full, diff = noChange, repeated = noChange) => ({native,text,diff,repeated,repeatNative:shot()});

test('an observed secure field, not a missing field, passes on full and both diff surfaces', () => {
  assert.deepEqual(judgePassword('fix',cell(),secret), []);
  assert.notEqual(judgePassword('fix',cell(shot(plain)),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(),controls),secret).length, 0);
});

test('reject native counts/selections and bits escaping via a changed diff or repeated output', () => {
  assert.notEqual(judgePassword('fix',cell(shot({...secure,numberOfCharacters:0})),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot({...secure,valueDescription:'12 characters'})),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(secure,{selectedText:'•••'})),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(),full,'~3 secure text field PW walk test, Value: •••'),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(),full,noChange,`Selected text: ${secret.slice(0,7)}`),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(),full,'~3 secure text field PW walk test, Value: secure text, Count: 12'),secret).length, 0);
});

test('main is a positive length-leak control; full and changed diff should show the provider mask', () => {
  const mask = '•'.repeat(secret.length), native = shot({...secure,secure:undefined,value:mask,valueType:'string',numberOfCharacters:secret.length});
  const row = {...cell(native,`${controls}\n3 secure text field PW walk test, Value: ${mask}`,`The following is a diff from the previous accessibility tree
~3 secure text field PW walk test, Value: ${mask}`),repeatNative:native};
  assert.deepEqual(judgePassword('main',row,secret,{changed:true}), []);
  assert.notEqual(judgePassword('main',{...row,diff:noChange},secret,{changed:true}).length, 0);
});

test('ordinary fields must both exist, retain values and compare as literal rendered lines', () => {
  const row = cell();
  assert.deepEqual(judgeControls(row,row),[]);
  assert.notEqual(judgeControls(row,{...row,text:full.replace('2 text','9 text')}).length,0);
  assert.notEqual(judgeControls(row,{...row,text:full.replace('public-textarea','missing')}).length,0);
  assert.notEqual(judgeControls(row,{...row,native:shot(secure,{nodes:[plain,secure]})}).length,0);
});

test('nearest-rank percentiles are in milliseconds, with invalid samples not silently dropped', () => {
  const samples = Array.from({length:20},(_,i)=>({wallMs:40-i,walkMs:i+1}));
  assert.deepEqual(timingStats(samples),{n:20,wallMs:[30,39,40],walkMs:[10,19,20]});
  assert.throws(()=>timingStats([...samples,{wallMs:1}]), /invalid sample/);
});

test('paste checker distinguishes character measurements from timing and confirmation', async () => {
  const {pasteDisclosures}=await import('./check.mjs');
  assert.deepEqual(pasteDisclosures({result:{meta:{paste:{confirmed:false,readWaitMs:23,perLine:[{confirmed:false}]}}}},secret),[]);
  assert.deepEqual(pasteDisclosures({result:{meta:{paste:{perLine:[{confirming:{range:[12,0],characters:12}}]}}}},secret),
    ['result.meta.paste.perLine.0.confirming.range','result.meta.paste.perLine.0.confirming.characters']);
  assert.deepEqual(pasteDisclosures({error:{message:'Entered 12 characters',meta:{entered:12}}},secret),['error.message','error.meta.entered']);
});
