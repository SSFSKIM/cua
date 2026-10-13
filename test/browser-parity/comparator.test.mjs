import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
import {createNormalizer} from '../../scripts/browser-parity/normalize.mjs';
const base = [
  {case:'read', cell:'value', ok:true, value:{text:'exact snapshot'}, ms:1, trace:[]},
  {case:'read', cell:'error', ok:false, error:{code:'timeout', message:'Timed out'}, ms:2, trace:[]},
  {case:'read', assertion:{ok:true}},
];
const copy = () => structuredClone(base);

test('comparator rejects removed cases/cells, changed values/errors/assertions and duplicates', () => {
  assert.equal(compareRuns(base, copy()).ok, true);
  for (const mutate of [r => r.splice(0, 1), r => r.splice(0), r => r[0].value.text = 'changed',
    r => r[1].error.code = 'other', r => r[1].error.message = 'Different', r => r[2].assertion.ok = false,
    r => r.push(r[0])]) {
    const r = copy(); mutate(r); assert.equal(compareRuns(base, r).ok, false);
  }
  const r = copy(); r[0].ms = 900; assert.equal(compareRuns(base, r).ok, true);
  assert.equal(compareRuns([], []).ok, false, 'empty evidence is not parity');
});

test('trace is optional, otherwise method multiset uses only declared bounded polling allowances', () => {
  const a = copy(), b = copy();
  a[0].trace = [{cdp:'Input.dispatchMouseEvent'}, {cdp:'Runtime.callFunctionOn'}];
  assert.equal(compareRuns(a, b).ok, true, 'empty resident-host trace is no trace');
  b[0].trace = [{cdp:'Runtime.callFunctionOn'}, {cdp:'Input.dispatchMouseEvent'}];
  assert.equal(compareRuns(a, b).ok, true);
  b[0].trace.push({cdp:'Runtime.callFunctionOn'});
  assert.equal(compareRuns(a, b).ok, false);
  a[0].pollingAllowance = b[0].pollingAllowance = {'Runtime.callFunctionOn':1};
  assert.equal(compareRuns(a, b).ok, true);
  b[0].trace.push({cdp:'Input.dispatchMouseEvent'});
  assert.equal(compareRuns(a, b).ok, false);
});

test('skips require a declared reason; allowances cannot hide missing coverage or failed assertions', () => {
  const a = [{case:'disabled', skip:'capability absent', assertion:{ok:true}}];
  assert.equal(compareRuns(a, a).ok, true);
  assert.equal(compareRuns([{case:'disabled', skip:true}], [{case:'disabled', skip:true}]).ok, false);
  const b = copy(); b[0].value = 9;
  const expected = [{cases:['read'], cells:['value'], kind:'semantic', reason:'lifted evaluate'}];
  assert.equal(compareRuns(base, b, {expected}).ok, true);
  assert.equal(compareRuns(base, b.slice(1), {expected}).ok, false);
  b[2].assertion.ok = false;
  assert.equal(compareRuns(base, b, {expected}).ok, false);
  assert.equal(compareRuns(b, b).ok, false, 'equally failed assertions are not success');
});

test('normalizer maps ids by encounter order, masks volatile fields but preserves snapshot text and user ids', async () => {
  const a = createNormalizer(), b = createNormalizer();
  assert.deepEqual(await a({tabId:'42', browser_id:'chrome-abc', timestamp:'2026-10-01', requestId:'random-a', text:'snapshot 123'}),
    await b({tabId:'79', browser_id:'chrome-def', timestamp:'2026-10-02', requestId:'random-b', text:'snapshot 123'}));
  assert.deepEqual(await a({tabId:'42', other:{id:'user-value'}}), {tabId:'<tab:1>', other:{id:'user-value'}});
  assert.notDeepEqual(await a({text:'snapshot 123'}), await b({text:'snapshot 124'}));
});

test('unbounded and non-polling trace allowances cannot conceal a regression',()=>{
  const a=copy(),b=copy();a[0].trace=[{cdp:'DOM.querySelector'}];b[0].trace=[{cdp:'DOM.querySelector'},{cdp:'DOM.querySelector'}];
  a[0].pollingAllowance=b[0].pollingAllowance={'DOM.*':-1};
  assert.equal(compareRuns(a,b).ok,false);
  a[0].pollingAllowance=b[0].pollingAllowance={'DOM.*':'unbounded'};
  assert.equal(compareRuns(a,b).ok,false);
});

test('semantic projection distinguishes arrays from objects, including empty values',()=>{
  const a=copy(),b=copy();a[0].value=[];b[0].value={};
  assert.equal(compareRuns(a,b).ok,false);
  a[0].value=['value'];b[0].value={0:'value'};
  assert.equal(compareRuns(a,b).ok,false);
});
