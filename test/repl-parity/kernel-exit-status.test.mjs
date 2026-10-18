// The kernel exit status (#115): M1 declared one difference on macOS, the own host's kernel being Node itself
// (`exited(signal=9)` after SIGKILL) where the vendor's kernel was the Codex CLI wrapping Node (`exited(code=137)`).
// M2 retires it: the vendor host's children are Node too, exec'd by cua's compat executable through sandbox-exec, so
// both hosts report the same status and the cell compares as any other.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareParityRuns, validateExpected} from '../../scripts/repl-parity/compare.mjs';

const id = 'cells/lifecycle/child-exit-settles';
const committed = JSON.parse(readFileSync(new URL('./expected-differences.json', import.meta.url), 'utf8'));
const WARNING = 'ExperimentalWarning: VM Modules is an experimental feature and might change at any time | (Use `node --trace-warnings ...` to show where the warning was created)';
const died = ({pid, status, nodePid, reason = 'stdout_eof'}) => 'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: '
  + JSON.stringify({kernel_pid: pid, kernel_status: status, kernel_stderr_tail: `(node:${nodePid}) ${WARNING}`, reason, stream_error: null});
const meta = host => ({host, platform: 'darwin', runtimeRelease: '26.928.40906-darwin-arm64', service: 'cua', backend: 'no-services', sandbox: 'scoped', surfaces: ['browser'], complete: true,
  caseIds: [id], caseCells: {[id]: ['warm', 'interrupted', 'boundary']}, connections: ['c1'],
  hostAttestations: [host === 'cua' ? {connection: 'c1', host, serverInfo: {name: 'cua-repl-host', version: '9.9.9'}, executionFacts: {ownNode: {path: '/device/node', version: 'v24.18.0'}}, _meta: {'cua/replHost': {host: 'cua', version: '9.9.9'}}}
    : {connection: 'c1', host, serverInfo: {name: 'rmcp', version: '1.5.0'}, _meta: null}]});
const run = (host, text) => ({meta: meta(host), tools: {tools: []}, rows: [
  {case: id, cell: 'warm', ok: true, content: [{type: 'text', text: 'warm'}], isError: false},
  {case: id, cell: 'interrupted', ok: true, content: [{type: 'text', text}], isError: true},
  {case: id, cell: 'boundary', ok: true, value: {kind: 'interrupted-execution', settled: true, executions: 1, reconnected: false}},
  {case: id, assertion: {ok: true}},
]});
const entry = {kind: 'kernel-exit-status', id: 'own-kernel-is-node', issue: '#115', platform: 'darwin', case: id, cell: 'interrupted', field: 'node_repl diagnostics',
  vendor: {kernel_status: 'exited(code=137)', kernelIsStderrNode: false}, cua: {kernel_status: 'exited(signal=9)', kernelIsStderrNode: true}, reason: 'M1'};

test('the committed expected differences no longer declare a kernel exit status, and the kind is refused', () => {
  validateExpected(committed);
  assert.equal(committed.some(e => e.kind === 'kernel-exit-status'), false);
  assert.throws(() => validateExpected([entry]), /Invalid/);
});

test('both hosts\' kernels are Node: the same status compares equal with no entry; any status difference is a difference', () => {
  const vendor = (o = {}) => run('vendor', died({pid: 35159, status: 'exited(signal=9)', nodePid: 35159, ...o}));
  const own = (o = {}) => run('cua', died({pid: 4242, status: 'exited(signal=9)', nodePid: 4242, ...o}));
  const same = compareParityRuns(vendor(), own());
  assert.equal(same.ok, true, JSON.stringify(same.differences));
  assert.equal(compareParityRuns(vendor({status: 'exited(code=137)', nodePid: 35278}), own()).ok, false, 'the Codex CLI\'s status is no longer accepted');
  assert.equal(compareParityRuns(vendor(), own({status: 'exited(signal=15)'})).ok, false);
});
