// A declared kernel exit status (#115 M1): on macOS the own host's kernel is Node itself (sandbox-exec execs it), so a
// kernel killed with SIGKILL reports Node's own status, `exited(signal=9)`, where the vendor's kernel, the Codex CLI
// wrapping Node, reports `exited(code=137)`; and the kernel's pid is the Node whose warning the stderr tail carries,
// where the vendor's is the CLI's. The entry exempts exactly that pair on that one cell, and nothing else.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareParityRuns, validateExpected} from '../../scripts/repl-parity/compare.mjs';

const id = 'cells/lifecycle/child-exit-settles';
const committed = JSON.parse(readFileSync(new URL('./expected-differences.json', import.meta.url), 'utf8'));
const entry = committed.find(e => e.kind === 'kernel-exit-status');
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
const vendor = (o = {}) => run('vendor', died({pid: 35159, status: 'exited(code=137)', nodePid: 35278, ...o}));
const own = (o = {}) => run('cua', died({pid: 4242, status: 'exited(signal=9)', nodePid: 4242, ...o}));

test('the committed entry names exactly the child-exit-settles cell on macOS, its status pair and the reason', () => {
  validateExpected(committed);
  assert.equal(committed.filter(e => e.kind === 'kernel-exit-status').length, 1);
  assert.deepEqual(entry, {kind: 'kernel-exit-status', id: 'own-kernel-is-node', issue: '#115', platform: 'darwin', case: id, cell: 'interrupted', field: 'node_repl diagnostics',
    vendor: {kernel_status: 'exited(code=137)', kernelIsStderrNode: false}, cua: {kernel_status: 'exited(signal=9)', kernelIsStderrNode: true},
    reason: 'the own host\'s kernel is Node itself (spec, \'The own host launches through it directly\'); retired in M2 when the vendor host\'s children are also Node via the compat execve'});
});

test('the entry accepts the vendor\'s code=137 against the own host\'s signal=9, in either order, and nothing else differs', () => {
  assert.equal(compareParityRuns(vendor(), own()).ok, false, 'without the entry the cell differs');
  const result = compareParityRuns(vendor(), own(), {expected: [entry]});
  assert.equal(result.ok, true, JSON.stringify(result.differences));
  assert.deepEqual(result.expected.map(e => [e.kind, e.case, e.cell, e.field]), [['kernel-exit-status', id, 'interrupted', 'node_repl diagnostics']]);
  assert.equal(compareParityRuns(own(), vendor(), {expected: [entry]}).ok, true, 'either side order');
});

test('any other exit difference stays a difference', () => {
  const mutations = [
    ['own host killed by another signal', () => [vendor(), own({status: 'exited(signal=15)'})]],
    ['own host exited with a code', () => [vendor(), own({status: 'exited(code=1)'})]],
    ['vendor exited with another code', () => [vendor({status: 'exited(code=1)'}), own()]],
    ['vendor reported a signal', () => [vendor({status: 'exited(signal=9)'}), own()]],
    ['own kernel is not the stderr\'s Node', () => [vendor(), own({nodePid: 4243})]],
    ['vendor kernel is the stderr\'s Node', () => [vendor({nodePid: 35159}), own()]],
    ['another diagnostic field differs', () => [vendor(), own({reason: 'stream_error'})]],
    ['another platform', () => { const v = vendor(), o = own(); v.meta.platform = o.meta.platform = 'linux'; return [v, o]; }],
    ['another cell still differs', () => { const o = own(); o.rows[0].content[0].text = 'changed'; return [vendor(), o]; }],
    ['the same status pair on another case', () => {
      const other = 'cells/lifecycle/eof-settles-no-replay', move = r => { r.meta.caseIds = [other]; r.meta.caseCells = {[other]: r.meta.caseCells[id]}; r.rows.forEach(x => { x.case = other; }); return r; };
      return [move(vendor()), move(own())];
    }],
  ];
  for (const [label, make] of mutations) {
    const [v, o] = make();
    assert.equal(compareParityRuns(v, o, {expected: [entry]}).ok, false, label);
  }
});

test('an entry naming any other case, cell, platform or status pair is refused', () => {
  const variants = [
    {case: 'cells/lifecycle/eof-settles-no-replay'}, {cell: 'warm'}, {platform: 'linux'}, {issue: '#116'}, {reason: ''}, {extra: true},
    {vendor: {kernel_status: 'exited(code=1)', kernelIsStderrNode: false}}, {cua: {kernel_status: 'exited(signal=15)', kernelIsStderrNode: true}},
    {cua: {kernel_status: 'exited(signal=9)', kernelIsStderrNode: false}}, {field: 'content'},
  ];
  for (const patch of variants) assert.throws(() => validateExpected([{...entry, ...patch}]), /Invalid kernel exit status/, JSON.stringify(patch));
  assert.throws(() => validateExpected([entry, {...entry}]), /Invalid kernel exit status/, 'one entry at most');
});
