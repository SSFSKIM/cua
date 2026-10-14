// The native baseline's before/after comparison (acceptance 8): per judged operation the candidate's wall median must be
// within max(10%, 500 ms) of the baseline's, or faster; outcomes and sample counts are kept; SSH overhead and approval
// wait are reported apart from what is judged; runs that are incomplete, unattested or measured on another machine get
// no verdict at all.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compare, latencyLimit, renderComparison} from '../../scripts/native-baseline/compare.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const attest = host => ({host, serverInfo: host === 'cua' ? {name: 'cua-repl-host', version: '0.2.0'} : {name: 'node_repl', version: '0.1.0'},
  _meta: host === 'cua' ? {'cua/replHost': {host: 'cua', version: '0.2.0'}} : null});
const meta = (host, n, extra = {}) => ({
  device: 'cua-linux', host, hostAttestations: Array.from({length: 6}, () => attest(host)), connections: 6,
  commit: host === 'cua' ? 'bbbbbbb' : 'aaaaaaa', complete: true, protocolVersion: '2025-06-18', platform: 'linux',
  plan: {samples: 30, cold: 5, tasks: 10, coldPlan: ['miss', 'hit', 'miss', 'hit', 'hit']},
  runtime: {release: '26.928.40906-linux-arm64'}, hardware: {model: 'aarch64, 4 CPUs', memoryBytes: 8 * 1024 ** 3},
  os: {name: 'Ubuntu', version: '24.04.5 LTS', build: '7.0.0-38-generic'}, display: {pixels: '1024 x 768', resolution: '1024 x 768', scale: 1},
  service: {surface: 'computer', engine: 'sky', answered: 'vendor', helper: 'pinned runtime'}, sandbox: {mode: 'disabled', explicit: false},
  started: `2026-10-14T0${n}:00:00Z`, finished: `2026-10-14T0${n}:05:00Z`, ...extra,
});
const range = (n, f) => Array.from({length: n}, (_, i) => f(i + 1));
// One run's rows, covering the whole plan of meta() (5 cold, 30 warm, 10 tasks, the Linux method cases); `scale`
// multiplies the judged latencies, `ssh` is the run's ssh.roundtrip, `tweak` edits the rows.
const METHODS = {
  'method.typeText': {outcome: 'threw', methodError: 'Resource temporarily unavailable (os error 11)', target: 'exited'},
  'method.paste': {outcome: 'threw', methodError: 'Resource temporarily unavailable (os error 11)', target: 'exited'},
  'method.paste.format': {outcome: 'threw', methodError: 'Linux paste supports only text format.', target: 'survived'},
  'method.setValue': {outcome: 'threw', methodError: 'setValue is unavailable on Linux; use click, pressKey, and typeText.', target: 'survived'},
  'method.selectText': {outcome: 'threw', methodError: 'selectText is unavailable on Linux.', target: 'survived'},
  'method.scroll.pages': {outcome: 'threw', methodError: 'Linux scroll accepts { pixels }, not pages.', target: 'survived'},
};
function rows({scale = 1, ssh = 100, tweak = r => r} = {}) {
  const warm = (op, wallMs, extra = {}) => range(30, s => ({op, sample: s, ok: true, wallMs: wallMs * scale, ...extra}));
  return [
    ...range(5, s => ({op: 'ssh.roundtrip', sample: s, ok: true, wallMs: ssh})),
    // Cold connections 1 and 3 found no handshake record (miss), 2, 4 and 5 found one (hit); every phase of each.
    ...[[1, 'miss'], [2, 'hit'], [3, 'miss'], [4, 'hit'], [5, 'hit']].flatMap(([s, label]) => [
      {op: `cold.${label}.initialize`, sample: s, ok: true, wallMs: ssh + (label === 'miss' ? 900 : 700) * scale, planned: label},
      {op: `cold.${label}.tools_list`, sample: s, ok: true, wallMs: 20 * scale, planned: label},
      {op: `cold.${label}.first_js`, sample: s, ok: true, wallMs: (label === 'miss' ? 580 : 480) * scale, inCellMs: 0.01, planned: label},
      {op: `cold.${label}.total`, sample: s, ok: true, wallMs: ssh + (label === 'miss' ? 1500 : 1200) * scale, planned: label},
    ]),
    ...warm('warm.noop', 20, {inCellMs: 0.02}), ...warm('warm.getState', 30), ...warm('warm.listApps', 30),
    {op: 'setup.findWindow', sample: 1, ok: true, wallMs: 700 * scale},
    {op: 'bind.getApp', sample: 1, ok: true, wallMs: 500 * scale, approvals: 0},
    {op: 'approval.elicitation', sample: 1, ok: true, wallMs: 60 * scale},
    ...warm('warm.getAXState', 100, {inCellMs: 60 * scale, chars: 900}), ...warm('warm.getScreenshot', 120),
    ...['task.act', 'task.verify', 'task.clear'].flatMap(op => range(10, s => ({op, sample: s, ok: true, wallMs: 2000 * scale}))),
    ...range(10, s => ({op: 'task.total', sample: s, ok: true, wallMs: 6000 * scale, inCellMs: 5900 * scale, outcome: 'typed with pressKey, verified, cleared'})),
    ...Object.entries(METHODS).map(([op, outcome]) => ({op, sample: 1, ok: true, wallMs: 20, ...outcome})),
    {op: 'end_task', sample: 1, ok: true, wallMs: 30 * scale},
  ].map(tweak);
}
function side(t, host, runs) {
  const dir = mkdtempSync(join(tmpdir(), `native-compare-${host}-`));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  runs.forEach(({meta: m, rows: r}, i) => {
    const root = join(dir, `run-${i + 1}`);
    mkdirSync(root);
    writeFileSync(join(root, 'meta.json'), JSON.stringify(m));
    writeFileSync(join(root, 'results.jsonl'), r.filter(Boolean).map(row => JSON.stringify(row)).join('\n') + '\n');
  });
  return dir;
}
const three = (host, options = {}, metaExtra = {}) => [1, 2, 3].map(n => ({meta: meta(host, n, metaExtra), rows: rows(options)}));
const judge = (t, vendor, cua) => compare(readRuns(side(t, 'vendor', vendor)), readRuns(side(t, 'cua', cua)));
const op = (result, name) => result.operations.find(o => o.op === name);

test('the latency limit is the baseline median plus max(10%, 500 ms)', () => {
  assert.equal(latencyLimit(100), 600);
  assert.equal(latencyLimit(5000), 5500);
  assert.equal(latencyLimit(6000), 6600);
});

test('equal runs pass every judged operation; ssh, approval and harness setup are reported, not judged', t => {
  const result = judge(t, three('vendor'), three('cua'));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS');
  assert.equal(op(result, 'warm.noop').verdict, 'pass');
  assert.deepEqual({samples: op(result, 'warm.noop').baseline.samples, ok: op(result, 'warm.noop').candidate.ok}, {samples: 90, ok: 90});
  for (const name of ['ssh.roundtrip', 'approval.elicitation', 'setup.findWindow']) assert.equal(op(result, name).verdict, 'not judged', name);
  assert.deepEqual([result.baseline.host, result.candidate.host], ['vendor', 'cua']);
});

test('a candidate median within 10% (or 500 ms) passes, beyond it fails; faster always passes', t => {
  // task.total: 6000 ms baseline, 6600 ms limit. 1.09x passes, 1.11x fails; warm.noop (20 ms) is under the 500 ms floor.
  const within = judge(t, three('vendor'), three('cua', {scale: 1.09}));
  assert.equal(op(within, 'task.total').verdict, 'pass');
  assert.equal(op(within, 'task.total').limitMs, 6600);
  const beyond = judge(t, three('vendor'), three('cua', {scale: 1.11}));
  assert.equal(op(beyond, 'task.total').verdict, 'fail');
  assert.match(op(beyond, 'task.total').reasons.join(), /median 6660.* above the limit 6600/);
  assert.equal(op(beyond, 'warm.noop').verdict, 'pass');
  assert.equal(beyond.verdict, 'FAIL');
  const faster = judge(t, three('vendor'), three('cua', {scale: 0.5}));
  assert.equal(faster.verdict, 'PASS');
});

test('cold connections are judged net of each side\'s ssh.roundtrip median', t => {
  // The candidate's ssh pipe is 2 s slower; its cold.miss.total wall is 2 s more, its net time the same.
  const result = judge(t, three('vendor'), three('cua', {ssh: 2100}));
  const total = op(result, 'cold.miss.total');
  assert.equal(total.verdict, 'pass');
  assert.deepEqual({baseline: total.baseline.judgedMs, candidate: total.candidate.judgedMs, basis: total.basis}, {baseline: 1500, candidate: 1500, basis: 'wall median net of ssh.roundtrip median'});
  assert.equal(op(result, 'warm.noop').basis, 'wall median');
});

test('fewer successes than the baseline fail the operation; sample counts are kept on both sides', t => {
  const cua = three('cua', {tweak: r => (r.op === 'task.total' && r.sample === 3 ? {...r, ok: false, error: 'the typed sentence is not in the window'} : r)});
  const result = judge(t, three('vendor'), cua);
  const task = op(result, 'task.total');
  assert.equal(task.verdict, 'fail');
  assert.deepEqual({baseline: [task.baseline.samples, task.baseline.ok], candidate: [task.candidate.samples, task.candidate.ok]}, {baseline: [30, 30], candidate: [30, 27]});
  assert.match(task.reasons.join(), /27\/30 succeeded, the baseline 30\/30/);
});

test('a method case passes with the same observed outcomes, sample for sample, or strictly better ones; a different error fails', t => {
  const same = judge(t, three('vendor'), three('cua'));
  assert.equal(op(same, 'method.typeText').verdict, 'pass');
  assert.deepEqual({baseline: op(same, 'method.typeText').baseline.samples, candidate: op(same, 'method.typeText').candidate.samples}, {baseline: 3, candidate: 3});
  const different = judge(t, three('vendor'), three('cua', {tweak: r => (r.op === 'method.setValue' ? {...r, methodError: 'setValue is not a function'} : r)}));
  assert.equal(op(different, 'method.setValue').verdict, 'fail');
  assert.match(op(different, 'method.setValue').reasons.join(), /outcome differs/);
  const improved = {outcome: 'returned', methodError: undefined, target: 'survived', inserted: true};
  const better = judge(t, three('vendor'), three('cua', {tweak: r => (r.op === 'method.typeText' ? {...r, ...improved} : r)}));
  assert.equal(op(better, 'method.typeText').verdict, 'pass');
  assert.match(op(better, 'method.typeText').reasons.join(), /better/);
  // A text-input improvement needs the text observed in the surviving window, not merely no evidence against it.
  const unread = judge(t, three('vendor'), three('cua', {tweak: r => (r.op === 'method.typeText' ? {...r, ...improved, inserted: undefined} : r)}));
  assert.equal(op(unread, 'method.typeText').verdict, 'fail');
});

test('method outcomes keep their multiplicity: one degraded sample of three fails even when its outcome also occurs in the baseline', t => {
  // Baseline: 2 of 3 runs returned with the text inserted, 1 threw. Candidate: 1 returned, 2 threw.
  const vendor = [1, 2, 3].map(n => ({meta: meta('vendor', n), rows: rows({tweak: r => (r.op === 'method.paste' && n < 3 ? {...r, outcome: 'returned', methodError: undefined, target: 'survived', inserted: true} : r)})}));
  const cua = [1, 2, 3].map(n => ({meta: meta('cua', n), rows: rows({tweak: r => (r.op === 'method.paste' && n < 2 ? {...r, outcome: 'returned', methodError: undefined, target: 'survived', inserted: true} : r)})}));
  const result = judge(t, vendor, cua);
  assert.equal(op(result, 'method.paste').verdict, 'fail');
  assert.match(op(result, 'method.paste').reasons.join(), /outcome differs/);
});

test('method samples are timed under the same rule: median within max(10%, 500 ms), with median, p95 and max reported', t => {
  const result = judge(t, three('vendor'), three('cua', {tweak: r => (r.op === 'method.setValue' ? {...r, wallMs: 59_000} : r)}));
  const setValue = op(result, 'method.setValue');
  assert.equal(setValue.verdict, 'fail');
  assert.equal(setValue.limitMs, 520);
  assert.deepEqual(setValue.candidate.wall, {n: 3, median: 59_000, p95: 59_000, max: 59_000});
  assert.match(setValue.reasons.join(), /median 59000 ms is above the limit 520 ms/);
  assert.match(renderComparison(result), /\| method\.setValue \| 3 \| .* \| 3 \| .* \| 20\.0 \/ 20\.0 \/ 20\.0 \| 59000\.0 \/ 59000\.0 \/ 59000\.0 \| 520\.0 \| fail \|/);
});

test('a failure only the candidate records fails: a cold connection whose cleanup failed is not "not judged"', t => {
  // The runner writes cold.<label>.end_task only when that connection's end_task failed; a clean baseline has none.
  const failed = r => (r.op === 'cold.hit.total' && r.sample === 2 ? [r, {op: 'cold.hit.end_task', sample: 2, planned: 'hit', ok: false, error: 'end_task failed'}] : [r]);
  const cua = [1, 2, 3].map(n => ({meta: meta('cua', n), rows: rows().flatMap(failed)}));
  const result = judge(t, three('vendor'), cua);
  assert.equal(op(result, 'cold.hit.end_task').verdict, 'fail');
  assert.match(op(result, 'cold.hit.end_task').reasons.join(), /only the candidate has this operation, and 3 of its 3 samples failed/);
  assert.equal(result.verdict, 'FAIL');
});

test('an operation the candidate lacks fails; one only the candidate has is reported', t => {
  const result = judge(t, three('vendor'), three('cua', {tweak: r => (r.op === 'cold.miss.initialize' ? {...r, op: 'cold.miss.renamed'} : r)}));
  assert.equal(op(result, 'cold.miss.initialize').verdict, 'fail');
  assert.match(op(result, 'cold.miss.initialize').reasons.join(), /no candidate samples/);
  assert.equal(op(result, 'cold.miss.renamed').verdict, 'not judged');
});

test('incomplete, unattested, mixed-host or unlike-machine runs get no verdict', t => {
  const cases = [
    [three('vendor'), [{meta: meta('cua', 1, {complete: false, error: 'boom'}), rows: rows()}, ...three('cua').slice(1)], /candidate: run-1 is incomplete/],
    [three('vendor'), three('cua', {}, {hostAttestations: [attest('vendor')]}), /candidate: .*host attestation/],
    [three('vendor', {}, {host: undefined, hostAttestations: undefined}), three('cua'), /baseline: .*no requested host/],
    [three('vendor'), three('cua', {}, {runtime: {release: '26.999.1-linux-arm64'}}), /release differs/],
    [three('vendor'), three('cua', {}, {display: {pixels: '1920 x 1080', resolution: '1920 x 1080', scale: 1}}), /display differs/],
    [three('vendor'), three('cua', {}, {plan: {samples: 10, cold: 5, tasks: 10, coldPlan: []}}), /sample plan differs/],
    [three('vendor'), three('vendor'), /the candidate attests the vendor host, not cua/],
    [three('vendor'), three('cua', {}, {sandbox: {mode: 'scoped', explicit: true}}), /sandbox differs/],
    [three('vendor'), three('cua', {}, {sandbox: undefined}), /candidate: run-1 records no sandbox policy/],
    [three('vendor'), three('cua').slice(0, 1), /candidate: 1 run, acceptance 8 needs three/],
    [three('vendor'), three('cua', {tweak: r => (r.op === 'warm.noop' && r.sample > 1 ? null : r)}), /candidate: run-1 covers 1 warm\.noop sample, the plan 30/],
    [three('vendor'), three('cua', {tweak: r => (r.op === 'method.paste' ? null : r)}), /candidate: run-1 covers 0 method\.paste samples, the plan 1/],
    // One phase of one cold connection missing from every run: its share would still look whole.
    [three('vendor'), three('cua', {tweak: r => (r.op === 'cold.miss.first_js' && r.sample === 1 ? null : r)}), /candidate: run-1 cold connection 1 \(miss\) lacks first_js/],
    [three('vendor'), three('cua', {tweak: r => (r.op === 'cold.hit.tools_list' && r.sample === 4 ? null : r)}), /candidate: run-1 cold connection 4 \(hit\) lacks tools_list/],
    [three('cua'), three('cua'), /the baseline attests the cua host, not vendor/],
  ];
  for (const [vendor, cua, problem] of cases) {
    const result = judge(t, vendor, cua);
    assert.equal(result.verdict, 'NO VERDICT');
    assert.ok(result.problems.some(p => problem.test(p)), `${problem}: ${result.problems.join(' | ')}`);
  }
});

test('the rendered comparison names both hosts, the rule, every operation and the verdict', t => {
  const text = renderComparison(judge(t, three('vendor'), three('cua', {scale: 1.11})));
  assert.match(text, /^# Native baseline comparison/m);
  assert.match(text, /\| REPL host \| vendor \| cua \|/);
  assert.match(text, /\| initialize answered by \| node_repl 0\.1\.0 \| cua-repl-host 0\.2\.0 \|/);
  assert.match(text, /max\(10%, 500 ms\)/);
  assert.match(text, /\| task\.total \| wall median \| 30\/30 \| 30\/30 \| 6000\.0 \| 6660\.0 \| 6600\.0 \| fail \|/);
  assert.match(text, /\| ssh\.roundtrip \| .* not judged \|/);
  assert.match(text, /Verdict: \*\*FAIL\*\*/);
});

test('the CLI compare command prints the comparison and exits 0 only on PASS', t => {
  const vendor = side(t, 'vendor', three('vendor')), cua = side(t, 'cua', three('cua')), slow = side(t, 'cua', three('cua', {scale: 2}));
  const pass = spawnSync(process.execPath, [SCRIPT, 'compare', vendor, cua], {encoding: 'utf8'});
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /Verdict: \*\*PASS\*\*/);
  const out = join(cua, 'comparison.md');
  const fail = spawnSync(process.execPath, [SCRIPT, 'compare', vendor, slow, '--out', out], {encoding: 'utf8'});
  assert.equal(fail.status, 1);
  assert.match(readFileSync(out, 'utf8'), /Verdict: \*\*FAIL\*\*/);
});
