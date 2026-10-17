// scripts/sandbox-probe/m1-judge.mjs: the cfprefs item's before/after verdict. Both runs complete, and equal but for the
// kernel exit status M1 changes (the Codex CLI's code=137 before, Node's signal=9 after).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgeBeforeAfter} from '../../scripts/sandbox-probe/m1-judge.mjs';

const CASE = 'cells/lifecycle/child-exit-settles';
const WARNING = 'ExperimentalWarning: VM Modules is an experimental feature and might change at any time';
const died = (pid, status, nodePid) => ({case: CASE, cell: 'interrupted', isError: true, content: [{type: 'text', text: 'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: '
  + JSON.stringify({kernel_pid: pid, kernel_status: status, kernel_stderr_tail: `(node:${nodePid}) ${WARNING}`, reason: 'stdout_eof', stream_error: null})}]});
const run = (rows, complete = true) => ({meta: {complete}, rows});
const exitDiff = {ok: false, differences: [{kind: 'semantic', case: CASE, cell: 'interrupted'}]};

test('equal complete runs hold; the declared exit status difference holds only as declared', () => {
  assert.equal(judgeBeforeAfter({diff: {ok: true, differences: []}, before: run([]), after: run([])}).ok, true);
  const before = run([died(100, 'exited(code=137)', 101)]), after = run([died(200, 'exited(signal=9)', 200)]);
  assert.deepEqual(judgeBeforeAfter({diff: exitDiff, before, after}), {ok: true, incomplete: [], undeclared: [], exitStatus: 'declared'});
  assert.equal(judgeBeforeAfter({diff: exitDiff, before, after: run([died(200, 'exited(signal=15)', 200)])}).ok, false, 'another signal');
  assert.equal(judgeBeforeAfter({diff: exitDiff, before, after: run([died(200, 'exited(signal=9)', 201)])}).ok, false, 'the kernel is not the stderr\'s Node');
  assert.equal(judgeBeforeAfter({diff: {ok: false, differences: [...exitDiff.differences, {kind: 'semantic', case: 'cells/x', cell: 'c'}]}, before, after}).ok, false, 'another difference');
  assert.deepEqual(judgeBeforeAfter({diff: {ok: true, differences: []}, before: run([], false), after: run([])}).incomplete, ['before']);
  assert.equal(judgeBeforeAfter({diff: {ok: true, differences: []}, before: run([], false), after: run([])}).ok, false, 'an incomplete run');
});
