// scripts/sandbox-probe/m1-judge.mjs: the cfprefs item's before/after verdict. Both runs complete, and equal but for the
// kernel exit status M1 changes (the Codex CLI's code=137 before, Node's signal=9 after).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgeBeforeAfter} from '../../scripts/sandbox-probe/m1-judge.mjs';

const CASE = 'cells/lifecycle/child-exit-settles';
const WARNING = 'ExperimentalWarning: VM Modules is an experimental feature and might change at any time';
const died = (pid, status, nodePid, {reason = 'stdout_eof', stream_error = null, tail = WARNING, meta} = {}) => ({case: CASE, cell: 'interrupted', isError: true, ...(meta ? {meta} : {}),
  content: [{type: 'text', text: 'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: '
  + JSON.stringify({kernel_pid: pid, kernel_status: status, kernel_stderr_tail: `(node:${nodePid}) ${tail}`, reason, stream_error})}]});
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

test('on the exit cell itself, only the declared facts are set aside: any other field of its diagnostic or row fails', () => {
  const before = run([died(100, 'exited(code=137)', 101, {meta: {'codex/nodeReplExecutionDurationMs': 5}})]);
  const after = over => run([died(200, 'exited(signal=9)', 200, {meta: {'codex/nodeReplExecutionDurationMs': 9}, ...over})]);
  assert.equal(judgeBeforeAfter({diff: exitDiff, before, after: after({})}).ok, true, 'the volatile duration aside, equal');
  for (const [label, over] of [['reason', {reason: 'stream_error'}], ['stream_error', {stream_error: 'EPIPE'}], ['stderr tail', {tail: 'Error: something else'}],
    ['meta', {meta: {'cua/replHost': {host: 'cua', version: '9'}}}]]) {
    const judgement = judgeBeforeAfter({diff: exitDiff, before, after: after(over)});
    assert.equal(judgement.ok, false, label);
    assert.equal(judgement.exitStatus, 'undeclared', label);
  }
});
