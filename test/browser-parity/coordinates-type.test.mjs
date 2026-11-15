// #168: when input/coordinates' type cell is not acknowledged (one red in 15 unstressed hosted runs, the vendor host),
// its error says why: whether the input had the focus, what had it, and the input's value. The cell's value on
// success is unchanged ('pointer'). The real cell runs here against a stand-in tab and document.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import coordinates from './scenarios/input/coordinates.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const cell = coordinates.cells.find(c => c.label === 'type');

function tab({acknowledged, active, value}) {
  const input = {tagName: 'INPUT', id: 'input', value};
  const document = {activeElement: active === 'input' ? input : {tagName: active.toUpperCase(), id: ''}, querySelector: s => (s === '#input' ? input : null)};
  const page = vm.createContext({document});
  return {
    cua: {click: async () => {}, type: async () => {}},
    playwright: {
      evaluate: async fn => vm.runInContext(`(${fn.toString()})()`, page),
      locator: selector => ({
        waitFor: async () => { if (!acknowledged) throw new Error('Error: Playwright selector deadline exceeded\nlocator.waitFor(attached) timed out for selector ' + selector); },
        evaluate: async fn => fn(input),
      }),
    },
  };
}

test('the type cell still answers the typed value when the fixture acknowledges it', async () => {
  assert.equal(await new AsyncFunction('tab', cell.code)(tab({acknowledged: true, active: 'input', value: 'pointer'})), 'pointer');
});

test('an unacknowledged type names whether the input had the focus, what had it, and the input\'s value', async () => {
  for (const [active, value, seen] of [['body', '', {focused: false, active: {tag: 'body', id: ''}, value: ''}],
    ['input', 'pointer', {focused: true, active: {tag: 'input', id: 'input'}, value: 'pointer'}]]) {
    let error;
    try { await new AsyncFunction('tab', cell.code)(tab({acknowledged: false, active, value})); } catch (e) { error = e; }
    assert.ok(error, active);
    const line = /; seen (\{.*\})$/.exec(error.message);
    assert.ok(line, `${active}: ${error.message}`);
    assert.deepEqual(JSON.parse(line[1]), seen, active);
    assert.match(error.message, /^the typed text was not acknowledged within 3000ms/);
  }
});
