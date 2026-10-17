// The same-host comparison (#115 acceptance 11): one host's runs before a change against its runs after it on the same
// machine. Only the cold first_js rows are judged, by the harness's limit; everything else is reported. The only
// configuration differences it permits are the ones acceptance 11 lists (the sandbox launcher, the per-session TMPDIR,
// and on Linux computer sessions the sandbox mode from disabled to scoped), each recorded in the result; any other
// difference gives no verdict.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readRuns} from '../../scripts/native-baseline/summary.mjs';
import {compareSameHost, renderComparison, SAME_HOST_JUDGED} from '../../scripts/native-baseline/compare.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const OWN_NODE = {path: '/scratch/node/24.22.0/bin/node', version: 'v24.22.0'};
const VENDOR_NODE = {path: '/scratch/runtimes/26.928.40906-darwin-arm64/node', version: 'v24.21.0'};
const BEFORE = {launcher: 'codex-cli', tmpdir: 'inherited'}, AFTER = {launcher: 'cua', tmpdir: 'session'};
const attest = (host, launch) => ({host, serverInfo: host === 'cua' ? {name: 'cua-repl-host', version: '0.2.0'} : {name: 'node_repl', version: '0.1.0'},
  _meta: {'cua/nativeExecution': host === 'cua' ? OWN_NODE : VENDOR_NODE, 'cua/sandboxLaunch': launch, ...(host === 'cua' ? {'cua/replHost': {host: 'cua', version: '0.2.0'}} : {})}});

// The mini's own-host browser-only session (two connections a run: the cold plan of 2).
function browserMeta({host = 'cua', launch = BEFORE, experiment = '115-m0', n = 1, commit = 'aaaaaaa', ...extra} = {}) {
  return {measurement: {schema: 2, experiment, freshInstall: true}, nodeMode: 'managed', answeringNode: host === 'cua' ? OWN_NODE : VENDOR_NODE, sandboxLaunch: launch,
    controllerIdentity: {hostname: 'controller', platform: 'darwin', arch: 'arm64', os: '25.6', cpu: {model: 'Apple', count: 10}},
    deviceIdentity: {alias: 'mini', arch: 'arm64', hostname: 'mini', os: {name: 'macOS', version: '27.0'}, cpu: {model: 'Apple M2 Pro', count: 10}},
    xSession: {}, ownNode: OWN_NODE, home: '/scratch', userHome: '/scratch/home', node: 'v24.18.0', checkout: '/Users/someone/cua-parity',
    load: {device: {before: 'up', after: 'up'}, controller: {before: 'up', after: 'up'}},
    device: 'mini', host, surface: 'browser', hostAttestations: [attest(host, launch), attest(host, launch)], connections: 2, commit, complete: true,
    protocolVersion: '2025-06-18', platform: 'darwin', plan: {samples: 30, cold: 2, tasks: 10, coldPlan: ['miss', 'hit', 'miss', 'hit', 'hit']},
    environment: {CUA_REPL_HOST: host, CUA_SHIM_SURFACES: 'browser', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'},
    runtime: {release: '26.928.40906-darwin-arm64'}, hardware: {model: 'Mac14,12', chip: 'Apple M2 Pro', memoryBytes: 16 * 1024 ** 3},
    os: {name: 'macOS', version: '27.0', build: '26A428'}, display: {pixels: '5120 x 2880', resolution: '2560 x 1440', scale: 2},
    service: {surface: 'browser'}, sandbox: {mode: 'scoped', explicit: false}, started: `2026-10-17T0${n}:00:00Z`, finished: `2026-10-17T0${n}:05:00Z`, ...extra};
}
function browserRows({firstJs = {miss: 580, hit: 480}, slow = 1} = {}) {
  return [
    ...[1, 2, 3, 4, 5].map(s => ({op: 'ssh.roundtrip', sample: s, ok: true, wallMs: 100})),
    ...[[1, 'miss'], [2, 'hit']].flatMap(([s, label]) => [
      {op: `cold.${label}.initialize`, sample: s, ok: true, wallMs: 900 * slow, planned: label},
      {op: `cold.${label}.tools_list`, sample: s, ok: true, wallMs: 20 * slow, planned: label},
      {op: `cold.${label}.first_js`, sample: s, ok: true, wallMs: firstJs[label], inCellMs: 0.01, planned: label},
      {op: `cold.${label}.total`, sample: s, ok: true, wallMs: 1500 * slow, planned: label},
    ]),
  ];
}
const three = (metaOptions = {}, rowOptions = {}) => [1, 2, 3].map(n => ({meta: browserMeta({n, ...metaOptions}), rows: browserRows(rowOptions)}));

// The GCE box's own-host computer session: the Linux sandbox mode moves from disabled to scoped.
const METHODS = ['method.typeText', 'method.paste', 'method.paste.format', 'method.setValue', 'method.selectText', 'method.scroll.pages'];
function linuxMeta({sandbox = 'disabled', launch = BEFORE, n = 1, ...extra} = {}) {
  const base = browserMeta({n, launch});
  return {...base, device: 'cua-gce', deviceIdentity: {...base.deviceIdentity, alias: 'cua-gce', hostname: 'gce'}, platform: 'linux', surface: 'computer',
    xSession: {DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority'}, gedit: {version: 'gedit 46', locale: {LANG: 'C.UTF-8'}},
    environment: {CUA_REPL_HOST: 'cua', CUA_SHIM_SURFACES: 'computer', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off', DISPLAY: ':0', XAUTHORITY: '/home/u/.Xauthority'},
    runtime: {release: '26.928.40906-linux-arm64'}, os: {name: 'Ubuntu', version: '24.04.3 LTS', build: '6.14.0-gcp'}, display: {pixels: '1280 x 800', resolution: '1280 x 800', scale: 1},
    hardware: {model: 'Google Compute Engine', chip: 'arm64, 4 CPUs', memoryBytes: 16 * 1024 ** 3},
    service: {surface: 'computer', engine: 'sky', answered: 'vendor', helper: 'pinned runtime'}, sandbox: {mode: sandbox, explicit: false},
    plan: {samples: 2, cold: 2, tasks: 1, coldPlan: ['miss', 'hit', 'miss', 'hit', 'hit']}, ...extra};
}
function linuxRows() {
  const each = (op, n) => Array.from({length: n}, (_, i) => ({op, sample: i + 1, ok: true, wallMs: 30}));
  return [...browserRows(), ...each('warm.noop', 2), ...each('warm.getState', 2), ...each('warm.listApps', 2), ...each('setup.findWindow', 1), ...each('bind.getApp', 1),
    ...each('warm.getAXState', 2), ...each('warm.getScreenshot', 2), ...each('task.act', 1), ...each('task.verify', 1), ...each('task.clear', 1), ...each('task.total', 1),
    ...METHODS.flatMap(op => each(op, 1)), ...each('end_task', 1)];
}
const linuxThree = (metaOptions = {}) => [1, 2, 3].map(n => ({meta: linuxMeta({n, ...metaOptions}), rows: linuxRows()}));

function side(t, runs) {
  const dir = mkdtempSync(join(tmpdir(), 'native-same-host-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  runs.forEach(({meta, rows}, i) => {
    const root = join(dir, `run-${i + 1}`);
    mkdirSync(root);
    writeFileSync(join(root, 'meta.json'), JSON.stringify(meta));
    writeFileSync(join(root, 'results.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  });
  return dir;
}
const judge = (t, before, after) => compareSameHost(readRuns(side(t, before)), readRuns(side(t, after)));
const op = (result, name) => result.operations.find(o => o.op === name);

test('the judged rows are the two cold first_js rows', () => {
  assert.deepEqual(SAME_HOST_JUDGED, ['cold.miss.first_js', 'cold.hit.first_js']);
});

test('one host before and after a change: the first_js rows are judged by the harness limit, every other row reported', t => {
  const same = judge(t, three(), three({commit: 'bbbbbbb', experiment: '115-m4'}));
  assert.deepEqual(same.problems, []);
  assert.equal(same.verdict, 'PASS');
  assert.equal(same.mode, 'same-host');
  assert.deepEqual(same.operations.filter(o => o.verdict !== 'not judged').map(o => o.op).sort(), ['cold.hit.first_js', 'cold.miss.first_js']);
  assert.equal(op(same, 'cold.miss.first_js').limitMs, 1080);
  // Other rows ten times slower are reported, not judged.
  assert.equal(judge(t, three(), three({}, {slow: 10})).verdict, 'PASS');
  // 1080 ms is the miss row's limit (580 + 500): within passes, beyond fails.
  assert.equal(judge(t, three(), three({}, {firstJs: {miss: 1080, hit: 480}})).verdict, 'PASS');
  const beyond = judge(t, three(), three({}, {firstJs: {miss: 1100, hit: 480}}));
  assert.equal(beyond.verdict, 'FAIL');
  assert.match(op(beyond, 'cold.miss.first_js').reasons.join(), /median 1100 ms is above the limit 1080 ms/);
});

test('the launcher and the per-session TMPDIR may change, and each change is recorded', t => {
  const result = judge(t, three(), three({launch: AFTER}));
  assert.equal(result.verdict, 'PASS', result.problems.join(' | '));
  assert.deepEqual(result.permitted.map(p => [p.field, p.baseline, p.candidate]), [['sandbox launcher', 'codex-cli', 'cua'], ['TMPDIR', 'inherited', 'session']]);
  assert.match(renderComparison(result), /## Permitted configuration differences[\s\S]*sandbox launcher: codex-cli -> cua[\s\S]*TMPDIR: inherited -> session/);
  assert.equal(judge(t, three(), three({launch: {launcher: 'cua-compat', tmpdir: 'inherited'}})).verdict, 'PASS');
  assert.deepEqual(judge(t, three(), three()).permitted, []);
});

test('on Linux computer sessions the sandbox mode may move from disabled to scoped, and that change is recorded', t => {
  const result = judge(t, linuxThree(), linuxThree({sandbox: 'scoped', launch: AFTER}));
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'PASS');
  assert.deepEqual(result.permitted.map(p => [p.field, p.baseline, p.candidate]),
    [['sandbox mode', 'disabled (platform default)', 'scoped (platform default)'], ['sandbox launcher', 'codex-cli', 'cua'], ['TMPDIR', 'inherited', 'session']]);
});

test('any other difference between the sides gives no verdict', t => {
  const cases = [
    ['the sandbox mode back to disabled', linuxThree({sandbox: 'scoped'}), linuxThree({sandbox: 'disabled'}), /sandbox differs/],
    ['an explicit sandbox mode', linuxThree(), linuxThree().map(r => ({...r, meta: {...r.meta, sandbox: {mode: 'scoped', explicit: true}}})), /sandbox differs/],
    ['a sandbox mode change on macOS', three(), three({sandbox: {mode: 'default', explicit: false}}), /sandbox differs/],
    ['the launcher back to the Codex CLI', three({launch: AFTER}), three({launch: BEFORE}), /sandbox launcher differs/],
    ['TMPDIR back to the caller\'s', three({launch: AFTER}), three({launch: {launcher: 'cua', tmpdir: 'inherited'}}), /TMPDIR differs/],
    ['no launch witness', three(), three({launch: null}), /sandbox launch witness/],
    ['another host', three(), three({host: 'vendor'}), /attests the vendor host, not cua/],
    ['another runtime release', three(), three({runtime: {release: '26.999.1-darwin-arm64'}}), /release differs/],
    ['another surface', three(), three({surface: 'computer', service: {surface: 'computer', engine: 'sky', answered: 'vendor'}}), /differs/],
    ['another device', three(), three({device: 'cua-gce'}), /device differs/],
    ['another plan', three(), three({plan: {samples: 30, cold: 5, tasks: 10, coldPlan: []}}), /plan differs/],
    ['a side mixing two sittings', three(), three().map((r, i) => (i === 1 ? {...r, meta: {...r.meta, measurement: {...r.meta.measurement, experiment: 'other'}}} : r)), /candidate run-2: experiment environment differs/],
    ['a side with two launch witnesses', three(), three().map((r, i) => (i === 2 ? {...r, meta: browserMeta({n: 3, launch: AFTER})} : r)), /candidate: run-3 .*sandbox launch/],
    ['an incomplete run', three(), three({complete: false}), /incomplete/],
  ];
  for (const [label, before, after, problem] of cases) {
    const result = judge(t, before, after);
    assert.equal(result.verdict, 'NO VERDICT', label);
    assert.ok(result.problems.some(p => problem.test(p)), `${label}: ${result.problems.join(' | ')}`);
  }
});

test('the CLI compare --same-host prints the same-host comparison and exits 0 only on PASS', t => {
  const before = side(t, three()), after = side(t, three({launch: AFTER})), slow = side(t, three({}, {firstJs: {miss: 2000, hit: 480}}));
  const pass = spawnSync(process.execPath, [SCRIPT, 'compare', '--same-host', before, after], {encoding: 'utf8'});
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /^# Native baseline comparison, same host/m);
  assert.match(pass.stdout, /Verdict: \*\*PASS\*\*/);
  const fail = spawnSync(process.execPath, [SCRIPT, 'compare', '--same-host', before, slow], {encoding: 'utf8'});
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /Verdict: \*\*FAIL\*\*/);
  // Without --same-host, two runs of one host are no vendor/cua comparison.
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'compare', before, after], {encoding: 'utf8'}).status, 1);
});
