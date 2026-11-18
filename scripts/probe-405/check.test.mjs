import test from 'node:test';
import assert from 'node:assert/strict';
import {judgePassword, judgeControls, timingStats} from './check.mjs';

const secret = 'q7x8n4m2r9w0';
const secure = {token:'p', depth:1, role:'AXTextField', subrole:'AXSecureTextField', title:'PW walk test', secure:true,
  value:null, valueType:null, valueMarkdown:null, valueDescription:null};
const plain = {token:'a', depth:1, role:'AXTextField', title:'Public control', value:'public-control'};
const area = {token:'b', depth:1, role:'AXTextArea', title:'Public notes', value:'public-textarea'};
const shot = (node = secure, extra = {}) => ({result:{nodes:[plain,area,node],menuBar:[],lineage:'s1',revision:2,focused:'p',selectedText:null,...extra}});
const controls = '1 text field Public control, Value: public-control\n2 text entry area Public notes, Value: public-textarea';
const fieldLine = '3 secure text field PW walk test, Value: secure text';
const full = `${controls}\n${fieldLine}`;
const noChange = 'There has been no change in the accessibility tree for Window: "Owned fixture".';
const diffHeader = 'The following is a diff from the previous accessibility tree for Window: "Owned fixture" with ~ and + representing changed and added elements, respectively. Removed elements are summarized by ID range.';
const cell = (native = shot(), text = full, diff = noChange, repeated = noChange) => ({native,text,diff,repeated,repeatNative:shot(),previousText:full});
const selected = text => `\nSelected text: \`\`\`\n${text}\n\`\`\`\n\nNote: Pay special attention to the content selected by the user.`;

test('an observed secure field, not a missing field, passes on full and both diff surfaces', () => {
  assert.deepEqual(judgePassword('fix',cell(),secret), []);
  assert.notEqual(judgePassword('fix',cell(shot(plain)),secret).length, 0);
  assert.notEqual(judgePassword('fix',cell(shot(),controls),secret).length, 0);
  assert.match(judgePassword('fix',cell(shot(),full+'\n'+fieldLine),secret).join('\n'), /full:.*expected one/);
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

test('when requested, the owned password token must be AX focused on every native surface', () => {
  const row = {...cell(),fullNative:shot()};
  assert.deepEqual(judgePassword('fix',row,secret,{requireFocus:true}), []);
  for (const surface of ['native','repeatNative','fullNative']) {
    assert.match(judgePassword('fix',{...row,[surface]:shot(secure,{focused:'a'})},secret,{requireFocus:true}).join('\n'),
      new RegExp(`${surface}:.*focused`));
  }
  assert.deepEqual(judgePassword('fix',{...cell(),native:shot(secure,{focused:null})},secret,{requireFocus:false}), []);
});

test('main selection is a separate positive control, not satisfied by the full value mask', () => {
  const valueMask = '•'.repeat(secret.length), selectionMask = '•'.repeat(7);
  const node = {...secure,secure:undefined,value:valueMask,valueType:'string'};
  const native = shot(node,{selectedText:selectionMask});
  const row = {...cell(native,`${controls}\n3 secure text field PW walk test, Value: ${valueMask}${selected(selectionMask)}`,
    `${diffHeader}\n~3 secure text field PW walk test, Value: ${valueMask}${selected(selectionMask)}`,noChange+selected(selectionMask)),
    repeatNative:native,fullNative:native};
  const options = {changed:true,selectedMaskLength:7};
  assert.deepEqual(judgePassword('main',row,secret,options), []);
  for (const surface of ['native','repeatNative','fullNative']) {
    assert.match(judgePassword('main',{...row,[surface]:shot(node,{selectedText:'••'})},secret,options).join('\n'),
      new RegExp(`${surface}:.*selected.*mask`));
  }
  for (const [surface,label] of [['text','full'],['diff','transition'],['repeated','repeat']]) {
    assert.match(judgePassword('main',{...row,[surface]:row[surface].replace(selected(selectionMask),'')},secret,options).join('\n'),
      new RegExp(`${label}:.*selected.*mask`));
  }
  const unsupported = {...row,native:shot(node),repeatNative:shot(node),fullNative:shot(node),
    text:row.text.replace(selected(selectionMask),''),diff:row.diff.replace(selected(selectionMask),''),repeated:noChange};
  assert.deepEqual(judgePassword('main',unsupported,secret,{changed:true,selectedMaskLength:null}), []);
  assert.deepEqual(judgePassword('main',unsupported,secret,{changed:true,selectedMaskLength:0}), []);
  assert.match(judgePassword('main',row,secret,{changed:true,selectedMaskLength:0}).join('\n'), /selected/);
});

test('fix checks that each diff keeps the owned secure tree node, not just its focus trailer', () => {
  const previous = `${controls}\n\t13 secure text field PW walk test, Value: secure text`;
  const current = previous;
  const focus = '\nThe focused UI element is 13 secure text field PW walk test, Value: secure text';
  const row = {...cell(),previousText:previous,sequencedText:current};
  const judge = row => judgePassword('fix',row,secret,{changed:true});
  assert.deepEqual(judge({...row,diff:noChange+focus,repeated:noChange+focus}), []);
  assert.deepEqual(judge({...row,diff:`${diffHeader}\nRemoved element IDs: 11-12, 14\n+\t17 text New control`}), []);
  for (const body of [
    'Removed element IDs: 13', 'Removed element IDs: 8, 11-13, 18-20',
    '-\t13 secure text field PW walk test, Value: secure text', '~\t13 text field Replacement, Value: ordinary',
  ]) {
    assert.match(judge({...row,diff:`${diffHeader}\n${body}${focus}`}).join('\n'), /transition:.*owned.*field/);
  }
  assert.match(judge({...row,repeated:`${diffHeader}\nRemoved element IDs: 13${focus}`}).join('\n'), /repeat:.*owned.*field/);
  assert.match(judge({...row,previousText:undefined}).join('\n'), /transition:.*baseline/);
  assert.match(judge({...row,diff:noChange+'\nRemoved element IDs: 13'}).join('\n'), /transition:.*owned.*field/);
  const next = current.replace('13 secure','17 secure');
  const replacement = `${diffHeader}\nRemoved element IDs: 13\n+\t17 secure text field PW walk test, Value: secure text`;
  assert.deepEqual(judge({...row,diff:replacement,sequencedText:next}), []);
  assert.match(judge({...row,diff:replacement}).join('\n'), /transition:.*owned.*field/);
  assert.match(judge({...row,sequencedText:current+', Placeholder: New placeholder'}).join('\n'), /transition:.*owned.*field/);
  assert.match(judge({...row,diff:`${diffHeader}\nRemoved element IDs: 11-?`}).join('\n'), /transition:.*removed/i);
});

test('fix rejects count and selection leaks in the focus trailer, other secure fields, and native root only', () => {
  const focus = 'The focused UI element is 3 secure text field PW walk test, Value: secure text';
  const row = cell(shot(secure,{nodes:[{...plain,numberOfCharacters:14},area,secure]}),
    full.replace('Value: public-control','Value: public-control, Count: 14'));
  assert.deepEqual(judgePassword('fix',row,secret), []);
  for (const line of [
    focus.replace('Value: secure text','Description: Value: secure text'),
    'The focused UI element is 3 text field No label, Count: 6',
    focus.replace('Value: secure text','Value: secure text maybe'),
    `${focus}, Selected text range: 0-7`, `${focus}, Range: 0-7`, `${focus}, Details: 12 characters`,
    '4 secure text field Another password, Value: secure text, Count: 6',
    '4 password field Another password, Value: *',
    '4 text field Another password, Value: secure text, Count: 6',
  ]) {
    assert.match(judgePassword('fix',{...row,repeated:noChange+'\n'+line},secret).join('\n'), /repeat:.*secure|repeat:.*field/);
  }
  for (const key of ['count','characterCount','numberOfCharacters','selectedTextRange','length','range']) {
    assert.match(judgePassword('fix',{...row,native:shot(secure,{[key]:0})},secret).join('\n'), /native:.*count or selection/);
  }
  assert.match(judgePassword('fix',{...row,native:shot(secure,{nodes:[plain,area,secure,
    {...secure,token:'another',title:'Second field',characterCount:6}]})},secret).join('\n'), /native:.*count or selection/);
  assert.match(judgePassword('fix',{...row,fullNative:shot({...secure,valueDescription:'password value details'})},secret).join('\n'), /fullNative:.*value metadata/);
  assert.match(judgePassword('fix',{...row,text:full.replace('Value: secure text','Value: ordinary, secure text')},secret).join('\n'), /full:.*marker/);
});

test('synthetic fragments from earlier inputs are rejected on native and rendered surfaces', async () => {
  const old = 'p8m3k4a1z9s7', fragment = old.slice(2,9);
  const options = {knownValues:new Set(['', old])};
  const row = {...cell(),fullNative:shot(secure,{window:{title:fragment}}),repeated:noChange+'\n'+fragment};
  const failures = judgePassword('fix',row,secret,options).join('\n');
  assert.match(failures,/fullNative:.*synthetic/);
  assert.match(failures,/repeat:.*synthetic/);
  assert.ok(!failures.includes(fragment));
  const {containsSynthetic} = await import('./check.mjs');
  assert.equal(containsSynthetic(JSON.stringify({result:{note:fragment}}),options.knownValues), true);
  assert.equal(containsSynthetic('ordinary control text',options.knownValues), false);
});

test('ordinary fields must both exist, retain values and compare as literal rendered lines', () => {
  const row = cell();
  assert.deepEqual(judgeControls(row,row),[]);
  assert.notEqual(judgeControls(row,{...row,text:full.replace('2 text','9 text')}).length,0);
  assert.notEqual(judgeControls(row,{...row,text:full.replace('public-textarea','missing')}).length,0);
  assert.notEqual(judgeControls(row,{...row,native:shot(secure,{nodes:[plain,secure]}),fullNative:shot()}).length,0);
  assert.match(judgeControls(row,{...row,fullNative:shot(secure,{nodes:[plain,secure]})}).join('\n'), /Public notes fullNative/);
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
