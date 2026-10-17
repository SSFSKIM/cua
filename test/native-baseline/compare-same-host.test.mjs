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
import {nativeEnvironment} from '../../scripts/native-baseline/remote.mjs';
import {sandboxLaunchOf} from '../../scripts/native-baseline/provenance.mjs';
import {buildLaunch} from '../../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../../src/runtime/manifest.mjs';
import {scratch as runtimeScratch, fixturePin} from '../fixtures/runtime-fixture.mjs';
import {realpathSync} from 'node:fs';

const SCRIPT = fileURLToPath(new URL('../../scripts/native-baseline.mjs', import.meta.url));
const OWN_NODE = {path: '/scratch/node/24.22.0/bin/node', version: 'v24.22.0'};
const VENDOR_NODE = {path: '/scratch/runtimes/26.928.40906-darwin-arm64/node', version: 'v24.21.0'};
const BEFORE = {launcher: 'codex-cli', tmpdir: 'inherited'}, AFTER = {launcher: 'cua', tmpdir: 'session'};
const attest = (host, launch) => ({host, serverInfo: host === 'cua' ? {name: 'cua-repl-host', version: '0.2.0'} : {name: 'node_repl', version: '0.1.0'},
  _meta: {'cua/nativeExecution': host === 'cua' ? OWN_NODE : VENDOR_NODE, 'cua/sandboxLaunch': launch, ...(host === 'cua' ? {'cua/replHost': {host: 'cua', version: '0.2.0'}} : {})}});

// The mini's own-host browser-only session, run at the harness's default plan (five cold connections a run).
const PLAN = {samples: 30, cold: 5, tasks: 10, coldPlan: ['miss', 'hit', 'miss', 'hit', 'hit']};
function browserMeta({host = 'cua', launch = BEFORE, experiment = '115-m0', n = 1, commit = 'aaaaaaa', ...extra} = {}) {
  return {measurement: {schema: 2, experiment, freshInstall: true}, nodeMode: 'managed', answeringNode: host === 'cua' ? OWN_NODE : VENDOR_NODE, sandboxLaunch: launch,
    controllerIdentity: {hostname: 'controller', platform: 'darwin', arch: 'arm64', os: '25.6', cpu: {model: 'Apple', count: 10}},
    deviceIdentity: {alias: 'mini', arch: 'arm64', hostname: 'mini', os: {name: 'macOS', version: '27.0'}, cpu: {model: 'Apple M2 Pro', count: 10}},
    xSession: {}, ownNode: OWN_NODE, home: '/scratch', userHome: '/scratch/home', node: 'v24.18.0', checkout: '/Users/someone/cua-parity',
    load: {device: {before: 'up', after: 'up'}, controller: {before: 'up', after: 'up'}},
    device: 'mini', host, surface: 'browser', hostAttestations: Array.from({length: 5}, () => attest(host, launch)), connections: 5, commit, complete: true,
    protocolVersion: '2025-06-18', platform: 'darwin', plan: PLAN,
    environment: {CUA_REPL_HOST: host, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'},
    runtime: {release: '26.928.40906-darwin-arm64'}, hardware: {model: 'Mac14,12', chip: 'Apple M2 Pro', memoryBytes: 16 * 1024 ** 3},
    os: {name: 'macOS', version: '27.0', build: '26A428'}, display: {pixels: '5120 x 2880', resolution: '2560 x 1440', scale: 2},
    service: {surface: 'browser'}, sandbox: {mode: 'scoped', explicit: false}, started: `2026-10-17T0${n}:00:00Z`, finished: `2026-10-17T0${n}:05:00Z`, ...extra};
}
function browserRows({firstJs = {miss: 580, hit: 480}, slow = 1, cold = PLAN.coldPlan} = {}) {
  return [
    ...[1, 2, 3, 4, 5].map(s => ({op: 'ssh.roundtrip', sample: s, ok: true, wallMs: 100})),
    ...cold.map((label, i) => [i + 1, label]).flatMap(([s, label]) => [
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
    hostAttestations: Array.from({length: 6}, () => attest('cua', launch)), connections: 6, ...extra};
}
function linuxRows() {
  const each = (op, n) => Array.from({length: n}, (_, i) => ({op, sample: i + 1, ok: true, wallMs: 30}));
  return [...browserRows(), ...each('warm.noop', 30), ...each('warm.getState', 30), ...each('warm.listApps', 30), ...each('setup.findWindow', 1), ...each('bind.getApp', 1),
    ...each('warm.getAXState', 30), ...each('warm.getScreenshot', 30), ...each('task.act', 10), ...each('task.verify', 10), ...each('task.clear', 10), ...each('task.total', 10),
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
    ['another plan', three(), three({plan: {...PLAN, samples: 10}}), /sample plan differs/],
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

// The baseline's TMPDIR as a real M0 run recorded it: the prepared serve's generated environment (env -i, so no TMPDIR)
// and, before #115 M1, a launch that copied the caller's TMPDIR, hence none ('unset'). Since M1 buildLaunch gives every
// launch its session's own TMPDIR, and the macOS own host no CODEX_CLI_PATH: the witness of a launch built from the same
// environment now says 'session', and 'cua' for the own host. The comparison accepts the M0 baseline against such an
// after run and records the change.
test('a prepared serve has no TMPDIR; since M1 its launches carry the session\'s own, the witness says so, and the change is permitted', t => {
  const s = runtimeScratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const generated = nativeEnvironment({home, userHome: join(home, 'home'), host: 'vendor', platform: 'darwin'});
  const shown = spawnSync('/bin/sh', ['-c', `env ${generated} ${JSON.stringify(process.execPath)} -e 'console.log(JSON.stringify(process.env))'`], {encoding: 'utf8', env: {PATH: process.env.PATH, TMPDIR: '/var/folders/caller/T/'}});
  assert.equal(shown.status, 0, shown.stderr);
  const serveEnv = JSON.parse(shown.stdout);
  assert.equal(serveEnv.TMPDIR, undefined, 'env -i drops the caller\'s TMPDIR');
  const runtime = runtimeFor({home, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null});
  const vendor = buildLaunch({runtime, home, sessionId: '6f1c2d3e-0000-4000-8000-000000000001', ambient: serveEnv});
  assert.deepEqual(sandboxLaunchOf(vendor, home), {launcher: 'codex-cli', tmpdir: 'session'}, 'the vendor host keeps the Codex CLI until M2, with the session\'s TMPDIR');
  const own = buildLaunch({runtime, home, sessionId: '6f1c2d3e-0000-4000-8000-000000000001', ambient: {...serveEnv, CUA_REPL_HOST: 'cua'}, surfaces: ['browser'], resolveOwnNode: () => process.execPath});
  assert.deepEqual(sandboxLaunchOf(own, home), {launcher: runtime.manifest.platform === 'darwin' ? 'cua' : 'codex-cli', tmpdir: 'session'}, 'the macOS own host launches through cua\'s own sandbox');
  const m0 = {launcher: 'codex-cli', tmpdir: 'unset'};
  const result = judge(t, three({launch: m0}), three({launch: AFTER}));
  assert.equal(result.verdict, 'PASS', result.problems.join(' | '));
  assert.deepEqual(result.permitted.map(p => [p.field, p.baseline, p.candidate]), [['sandbox launcher', 'codex-cli', 'cua'], ['TMPDIR', 'unset', 'session']]);
  // The reverse is no per-session TMPDIR, and is refused.
  assert.equal(judge(t, three({launch: AFTER}), three({launch: {launcher: 'cua', tmpdir: 'unset'}})).verdict, 'NO VERDICT');
});

test('runs smaller than the default plan are a diagnostic: the rule\'s verdict is reported, never as a PASS', t => {
  const small = (options = {}) => [1, 2, 3].map(n => ({meta: browserMeta({n, plan: {...PLAN, cold: 2}, connections: 2, hostAttestations: [attest('cua', BEFORE), attest('cua', BEFORE)], ...options}),
    rows: browserRows({cold: ['miss', 'hit']})}));
  const result = judge(t, small(), small());
  assert.deepEqual(result.problems, []);
  assert.equal(result.verdict, 'DIAGNOSTIC');
  assert.deepEqual(result.diagnostic.verdict, 'PASS');
  assert.match(renderComparison(result), /Verdict: \*\*DIAGNOSTIC\*\* \(the rule gives PASS; .*not acceptance evidence\)/);
  const cli = spawnSync(process.execPath, [SCRIPT, 'compare', '--same-host', side(t, small()), side(t, small())], {encoding: 'utf8'});
  assert.equal(cli.status, 1, 'a diagnostic never exits as a pass');
});

// The mini's native runs serve the owner-approved runtime copy in place (prepare.mjs): a recorded reuse stands in for a
// fresh install, and both sides must have served the same copy.
test('a run that reused the approved runtime is comparable when it records the reuse, and only against the same copy', async () => {
  const {environmentProblems} = await import('../../scripts/native-baseline/environment.mjs');
  const reuse = {approvedHome: '/scratch', release: '26.928.40906-darwin-arm64', runtimeRoot: '/scratch/runtimes/26.928.40906-darwin-arm64', helper: '/scratch/runtimes/26.928.40906-darwin-arm64/SkyComputerUseService.app', reason: 'r'};
  const runs = metas => metas.map((meta, i) => ({name: `run-${i + 1}`, meta}));
  const reused = n => browserMeta({n, measurement: {schema: 2, experiment: '115-m0', freshInstall: false}, runtimeReuse: reuse});
  assert.deepEqual(environmentProblems(runs([reused(1), reused(2), reused(3)])), []);
  const unrecorded = browserMeta({n: 1, measurement: {schema: 2, experiment: '115-m0', freshInstall: false}});
  assert.match(environmentProblems(runs([unrecorded]))[0], /not an M5 comparator/);
  const otherCopy = browserMeta({n: 2, measurement: {schema: 2, experiment: '115-m0', freshInstall: false}, runtimeReuse: {...reuse, helper: '/elsewhere/Sky.app'}});
  assert.ok(environmentProblems(runs([reused(1), otherCopy])).some(p => /runtimeReuse environment differs/.test(p)));
  assert.ok(environmentProblems(runs([reused(1), browserMeta({n: 2})])).some(p => /runtimeReuse environment differs/.test(p)));
});
