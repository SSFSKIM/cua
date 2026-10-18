// own-sandbox.mjs's cells (#115 M2): the vendor host's node_repl keeps a cell's top-level bindings for the next cell,
// so every cell runs in a block of its own, and its JSON report is the last text that parses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attackCell, cellCode, cellResult, probeCell, scriptDirCell} from '../scripts/accept/own-sandbox.mjs';

const AsyncFunction = (async () => {}).constructor;
// A persistent-scope double: the session's cells so far share one top-level scope, as the vendor kernel's do.
const persistentSession = () => {
  const cells = [];
  return {run: code => { cells.push(code); return new AsyncFunction('nodeRepl', cells.join('\n')); }};
};
const cells = [
  probeCell({targets: {a: {path: '/x', read: 'file', expect: 'v'}}, moduleDir: '/m', packageName: 'p', sentinel: '/s', writeOutside: '/o', tcpPort: 1, socketPath: '/k'}),
  scriptDirCell(),
  attackCell({scripts: '/t/.tmpA', run: '/h/run/x'}),
  "const fs = await import('node:fs'); nodeRepl.write(JSON.stringify(1));",
];

test('without a block the second cell redeclares the first one\'s bindings; with one every cell compiles in a shared scope', () => {
  const bare = persistentSession();
  bare.run(cells[0]);
  assert.throws(() => bare.run(cells[1]), SyntaxError);
  const blocked = persistentSession();
  for (const code of [...cells, ...cells]) assert.doesNotThrow(() => blocked.run(cellCode(code)));
});

test('the report is the last text that parses as JSON, whatever comes after it', () => {
  assert.deepEqual(cellResult(['first-call document', '{"ok":true}', 'Warning: fs was declared with const']), {ok: true});
  assert.deepEqual(cellResult(['{"a":1}', '{"b":2}']), {b: 2});
  assert.throws(() => cellResult(['no report here']), /no JSON report/);
});
