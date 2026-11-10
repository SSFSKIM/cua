// Consumes audit-check.swift's stderr on the eventual hosted run; does not start Swift or read AX.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {privacyFindings} from './ab-model.mjs';
const records=readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>JSON.parse(l).probe354Audit);
assert.deepEqual(records,[
 {id:'zero-read-control',textReadAttempts:0,rangeReadAttempts:0,byAttribute:{}},
 {id:'range-only-negative-control',textReadAttempts:0,rangeReadAttempts:3,byAttribute:{AXSelectedTextRange:2,AXSelectedTextRanges:1}},
 {id:'text-read-control',textReadAttempts:5,rangeReadAttempts:0,byAttribute:{AXValue:1,AXSelectedText:1,AXAttributedValue:1,AXStringForRange:1,AXAttributedStringForRange:1}}
]);
const valueFreeResponse={error:{errorName:'typeUnconfirmed',message:'Observe, then use setValue.'}};
assert.deepEqual(privacyFindings(valueFreeResponse,{privateField:true,audit:records[0]}),[]);
assert.deepEqual(privacyFindings(valueFreeResponse,{privateField:true,audit:records[1]}),['audited selection-range-read attempts: 3']);
assert.deepEqual(privacyFindings(valueFreeResponse,{privateField:true,audit:records[2]}),['audited text-read attempts: 5']);
console.log('audit controls: zero-read accepted; internal range-only and text reads rejected');
