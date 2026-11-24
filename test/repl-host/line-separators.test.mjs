// #565: node:readline (Node 24 and later, the own host's Node) ends a line at U+2028 (LS) and U+2029 (PS), which
// JSON.stringify leaves raw, so a message carrying either was cut in two and dropped: a window or tab title holding
// one hung the cell until its budget reset the kernel. Through cua's own REPL host (a real supervisor, kernel and
// trusted worker over MCP, supervisor-harness.mjs): the client's request, the kernel's result and a trusted service's
// answer (the path a browser tab title or a Linux window title takes from the trusted worker) all arrive whole, and the
// host's output carries them escaped. Needs Node 24 or later (CUA_NODE); skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {kernelNode} from './kernel-harness.mjs';
import {startHost, texts} from './supervisor-harness.mjs';

const {node, skip} = kernelNode();
const own = {skip, timeout: 60_000};
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
// Well under the 60 s reset seen live: a dropped message fails here, at the budget's end, rather than hanging.
const BUDGET_MS = 10_000;

// The host's raw stdout from now on.
function written(host) {
  let text = '';
  host.child.stdout.setEncoding('utf8').on('data', chunk => { text += chunk; });
  return () => text;
}

test('a cell whose code and output hold LS and PS completes with both whole, escaped on the host\'s output', own, async t => {
  const host = await startHost(t, {node});
  const out = written(host);
  const result = await host.js(`nodeRepl.write("tab${LS}title${PS}end")`, {timeoutMs: BUDGET_MS});
  assert.deepEqual({text: texts(result), isError: result.isError ?? false}, {text: [`tab${LS}title${PS}end`], isError: false});
  assert.match(out(), /tab\\u2028title\\u2029end/);
  assert.equal(/[\u2028\u2029]/.test(out()), false, 'no raw LS or PS on the host\'s output');
});

const TITLES = {titles: `export async function handleRpc() {
  return {title: 'Inbox' + String.fromCharCode(0x2028) + 'draft' + String.fromCharCode(0x2029) + 'end'};
}`};

test('a trusted service\'s answer holding LS and PS (a window or tab title) reaches the cell whole', own, async t => {
  const host = await startHost(t, {node, services: TITLES});
  const result = await host.js('const {title} = await nodeRepl.rpc("titles", {}); nodeRepl.write(JSON.stringify([...title].map(c => c.charCodeAt(0))));', {timeoutMs: BUDGET_MS});
  assert.equal(result.isError ?? false, false, texts(result).join('\n'));
  assert.deepEqual(JSON.parse(texts(result)[0]), [...`Inbox${LS}draft${PS}end`].map(c => c.charCodeAt(0)));
});
