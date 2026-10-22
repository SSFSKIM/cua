// The TextEdit fixture's cells share their connection's top level (scripts/accept/textedit.mjs, #117 M3.4): connection A
// binds twice before typing and connection B reads back after binding, so a cell's own names must not be redeclared at
// that top level; only `globalThis.app` outlives a cell. Each connection's cells run here in order in one context, as the
// host runs them, with TextEdit and the computer API stubbed (their awaits dropped so the cells run as scripts).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {bindCell, guarded, readbackCell} from '../scripts/accept/textedit.mjs';

const DOC = 'cua-accept-fixture.txt';
const MARKER = 'CUAMARKER0123';

function connection() {
  const written = [];
  const app = {
    getAXState: () => `Window: "${DOC}"\nValue: ${MARKER}, ID: First Text View`,
    typeText: () => {}, pressKey: () => {}, getScreenshot: () => new Uint8Array([0xff, 0xd8, 1]),
  };
  const context = vm.createContext({cua: {getApp: () => app}, nodeRepl: {write: text => written.push(JSON.parse(text))}});
  const run = cell => vm.runInContext(cell
    .replaceAll('await import(\'node:crypto\')', '({createHash: () => ({update: () => ({digest: () => "hash"})})})')
    .replaceAll('await ', ''), context);
  return {run, written};
}

test('a connection binds twice and acts after, with no cell redeclaring another\'s names', () => {
  const a = connection();
  for (const cell of [bindCell(DOC), bindCell(DOC), guarded(DOC, `app.typeText("x");\nnodeRepl.write(JSON.stringify({fixture: true, typed: true}))`)]) a.run(cell);
  assert.deepEqual(a.written, [{fixture: true, own: true}, {fixture: true, own: true}, {fixture: true, typed: true}]);
});

test('a bind, a guarded key, the readback and the guarded close run in one connection', () => {
  const b = connection();
  for (const cell of [bindCell(DOC), guarded(DOC, 'nodeRepl.write(JSON.stringify({fixture: true, done: true}))'), readbackCell(DOC, MARKER),
    guarded(DOC, 'app.pressKey("super+w");\nnodeRepl.write(JSON.stringify({fixture: true, pressed: true}))')]) b.run(cell);
  assert.deepEqual(b.written, [{fixture: true, own: true}, {fixture: true, done: true},
    {fixture: true, own: true, hash: 'hash', startsWithMarker: true, chars: MARKER.length}, {fixture: true, pressed: true}]);
});

test('a guarded cell whose document is not in front reports the lost identity and does nothing', () => {
  const c = connection();
  c.run(bindCell('another.txt'));
  c.run(guarded('another.txt', 'nodeRepl.write(JSON.stringify({fixture: true, acted: true}))'));
  assert.deepEqual(c.written, [{fixture: true, own: false}, {fixture: true, identityLost: true}]);
});
