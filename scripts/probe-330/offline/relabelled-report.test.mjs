import test from 'node:test';
import assert from 'node:assert/strict';
import {relabelledLabels,walkStats} from './relabelled-report.mjs';

test('refusal labels come from the engine sentence, including quoted label text',()=>{
  const message='The screen changed since the screenshot: the AXButton "Save" it showed at this point now reads "Delete". Nothing was sent. Call getScreenshot for a new screenshot, then give the coordinates in its pixels.';
  assert.deepEqual(relabelledLabels(message),{role:'AXButton',oldLabel:'Save',newLabel:'Delete'});
  const quoted='The screen changed since the screenshot: the AXStaticText "Say "hello"" it showed at this point now reads "Say "bye"". The app was activated in the background, but nothing was pressed. Call getScreenshot for a new screenshot.';
  assert.deepEqual(relabelledLabels(quoted),{role:'AXStaticText',oldLabel:'Say "hello"',newLabel:'Say "bye"'});
  assert.equal(relabelledLabels('The AXButton has moved.'),null);
});

test('walk statistics preserve every successful observation, including zero-ms walks',()=>{
  const observations=[0,1,2,4,8,16,32,64,128,256,512].map((ms,i)=>({label:`obs-${i}`,app:{displayName:'Safari'},timings:{walkMs:ms}}));
  observations.push({label:'failed',timings:{totalMs:100}});
  assert.deepEqual(walkStats(observations),{n:11,p50:16,p95:512,max:512});
});
