// #159: the hosted gate's artifact is public (the repo is), so it holds only the allowlisted forms
// scripts/sandbox-probe/hosted-public.mjs writes: labels, outcomes, booleans and counts, and the fingerprints' scratch
// paths. A value planted in a free-text field, a stderr excerpt, an argument or an environment must never reach them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareFingerprints, judgeFingerprints} from '../../scripts/sandbox-probe/compare.mjs';
import {PUBLIC_FORMS} from '../../scripts/sandbox-probe/hosted-public.mjs';

const PLANTED = 'planted-7f3a91c2';
const leaks = value => JSON.stringify(value).includes(PLANTED);

// A raw fingerprint record (oracle.mjs fingerprint --launcher cua) of one run under the scratch root `root`, its session
// `session`: the harness's labelled targets name the roots (cua-home, config-cua, checkout), the env and cwd hold paths
// under them.
const CHECKOUT = '/Users/runner/work/cua/cua';
function rawRecord({root, session, role = 'worker', home: childHome, dropFromDenyList, extraEnv = {}}) {
  const cua = `${root}/home`, user = `${root}/userhome`, run = `${cua}/run/${session}`;
  const deny = [`${user}/.config/claude-secrets`, `${user}/.config/cua`, cua].filter(path => path !== dropFromDenyList);
  const env = {HOME: childHome ?? user, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: `${run}/tmp`, CODEX_SANDBOX: 'seatbelt', CODEX_SANDBOX_NETWORK_DISABLED: '1',
    CUA_REPL_NODE_MODULE_DIRS: `${cua}/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules`,
    ...(role === 'worker' ? {LANG: 'C.UTF-8', CUA_REPL_NODE_PATH: `${cua}/node/24.22.0/bin/node`, CUA_REPL_SANDBOX_EXEC: '/usr/bin/sandbox-exec',
      CUA_SANDBOX_DENY_READ: JSON.stringify({deny, reexpose: [`${cua}/runtimes`, `${cua}/node`, run, `${run}/tmp`], metadataOnly: [cua, `${cua}/run`], tiers: []})} : {}),
    ...extraEnv};
  const path = (op, label, target, result, errno) => ({op, filter: 'path', label, target, result, ...(errno === undefined ? {} : {errno})});
  const checks = [path('file-read-data', 'cwd', run, 'allow'), path('file-read-data', 'home', env.HOME, 'allow'), path('file-read-metadata', 'cua-home', cua, 'allow'),
    path('file-read-data', 'cua-home', cua, 'deny', 1), path('file-read-data', 'config-cua', `${user}/.config/cua`, 'deny', 1), path('file-read-data', 'checkout', CHECKOUT, 'allow'),
    {op: 'network-outbound', filter: 'attempt', label: 'harness-tcp', target: '127.0.0.1:49183', result: 'deny', errno: 1}];
  const pins = {ok: true, rows: [{label: 'cua-home', op: 'file-read-metadata', want: 'allow', got: 'allow'}, {label: 'cua-home', op: 'file-read-data', want: 'deny', got: 'deny'}]};
  return {input: {env: {SECRET: PLANTED}, args: ['-p', `(allow file-read* (literal "${PLANTED}"))`], policy: {}}, launcher: `cua-${role}`,
    fingerprint: {pid: 4242, cwd: run, sandboxed: true, env, checks}, ...(role === 'kernel' ? {pins} : {})};
}
const A = {root: '/Users/runner/work/_temp/cua159.GQRnri', session: '0526d32c-75d8-455c-9082-fee557b58dea'};
const B = {root: '/Users/runner/work/_temp/cua159.xY7pQ2', session: 'aefd9a57-41e2-486d-814b-67f2982222f2'};
const judged = (left, right) => judgeFingerprints(compareFingerprints(left.fingerprint, right.fingerprint), 'hosted-baseline/cua');

test('a fingerprint\'s public form: checks without targets, pins row by row, env and cwd relative to the run\'s own roots, no input', () => {
  const out = PUBLIC_FORMS.fingerprint(rawRecord({...A, role: 'kernel'}));
  assert.deepEqual(out, {launcher: 'cua-kernel', fingerprint: {sandboxed: true, cwd: '<cua-home>/run/<session>',
    env: {HOME: '<home>', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: '<cua-home>/run/<session>/tmp', CODEX_SANDBOX: 'seatbelt', CODEX_SANDBOX_NETWORK_DISABLED: '1',
      CUA_REPL_NODE_MODULE_DIRS: '<cua-home>/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules'},
    checks: [{op: 'file-read-data', filter: 'path', label: 'cwd', result: 'allow'}, {op: 'file-read-data', filter: 'path', label: 'home', result: 'allow'},
      {op: 'file-read-metadata', filter: 'path', label: 'cua-home', result: 'allow'}, {op: 'file-read-data', filter: 'path', label: 'cua-home', result: 'deny', errno: 1},
      {op: 'file-read-data', filter: 'path', label: 'config-cua', result: 'deny', errno: 1}, {op: 'file-read-data', filter: 'path', label: 'checkout', result: 'allow'},
      {op: 'network-outbound', filter: 'attempt', label: 'harness-tcp', result: 'deny', errno: 1}]},
  pins: {ok: true, rows: [{label: 'cua-home', op: 'file-read-metadata', want: 'allow', got: 'allow'}, {label: 'cua-home', op: 'file-read-data', want: 'deny', got: 'deny'}]}});
  const worker = PUBLIC_FORMS.fingerprint(rawRecord(A));
  assert.deepEqual(Object.keys(worker), ['launcher', 'fingerprint'], 'a worker\'s has no pins');
  assert.deepEqual(JSON.parse(worker.fingerprint.env.CUA_SANDBOX_DENY_READ).deny, ['<home>/.config/claude-secrets', '<home>/.config/cua', '<cua-home>']);
  for (const value of [worker, out]) {
    assert.equal(leaks(value), false);
    assert.equal(JSON.stringify(value).includes(A.root), false, 'no scratch path');
    assert.equal(JSON.stringify(value).includes(A.session), false, 'no session id');
  }
});

test('two runs under different scratch roots and sessions publish the same form, judged equal to each other', () => {
  for (const role of ['kernel', 'worker']) {
    const [a, b] = [A, B].map(run => PUBLIC_FORMS.fingerprint(rawRecord({...run, role})));
    assert.deepEqual(a, b);
    assert.equal(judged(a, b).ok, true, role);
  }
});

test('judged public form against public form, a check row, the worker\'s deny list and HOME moving are each caught', () => {
  const base = role => PUBLIC_FORMS.fingerprint(rawRecord({...A, role}));
  const kernel = rawRecord({...B, role: 'kernel'});
  kernel.fingerprint.checks.find(row => row.label === 'config-cua').result = 'allow';
  const row = judged(base('kernel'), PUBLIC_FORMS.fingerprint(kernel));
  assert.equal(row.ok, false);
  assert.deepEqual(row.undeclared.checks.map(c => [c.label, c.left.result, c.right.result]), [['config-cua', 'deny', 'allow']]);

  // The negative control: ~/.config/cua dropped from the deny list shows on a worker only in CUA_SANDBOX_DENY_READ.
  const dropped = judged(base('worker'), PUBLIC_FORMS.fingerprint(rawRecord({...B, dropFromDenyList: `${B.root}/userhome/.config/cua`})));
  assert.equal(dropped.ok, false);
  assert.deepEqual(dropped.undeclared.env.differing.map(d => d.name), ['CUA_SANDBOX_DENY_READ']);

  for (const home of [`${B.root}/elsewhere`, `${B.root}/home`, `${B.root}/userhome/sub`]) for (const role of ['kernel', 'worker']) {
    const moved = judged(base(role), PUBLIC_FORMS.fingerprint(rawRecord({...B, role, home})));
    assert.equal(moved.ok, false, `${role}: HOME at ${home}`);
    assert.deepEqual(moved.undeclared.env.differing.map(d => d.name), ['HOME']);
  }
});

test('a fingerprint\'s public form withholds every value it does not know, keeping the name, and drops every field it does not name', () => {
  const record = rawRecord({...A, role: 'kernel', extraEnv: {OWNER_NOTE: `see ${PLANTED}`, API_TOKEN: '<redacted>'}});
  record.fingerprint.checks[0].detail = PLANTED;
  record.fingerprint.checks[1].message = `/Users/${PLANTED}`;
  record.fingerprint.note = PLANTED;
  record.pins.rows[0].target = PLANTED;
  record.pins.note = PLANTED;
  record.note = PLANTED;
  const out = PUBLIC_FORMS.fingerprint(record);
  assert.equal(leaks(out), false);
  assert.equal(out.fingerprint.env.OWNER_NOTE, '<withheld>');
  assert.equal(out.fingerprint.env.API_TOKEN, '<withheld>');
  assert.deepEqual(Object.keys(out.fingerprint), ['sandboxed', 'cwd', 'env', 'checks']);
  assert.deepEqual([...new Set(out.fingerprint.checks.flatMap(Object.keys))].sort(), ['errno', 'filter', 'label', 'op', 'result']);
  assert.deepEqual(Object.keys(out.pins), ['ok', 'rows']);
  assert.deepEqual([...new Set(out.pins.rows.flatMap(Object.keys))].sort(), ['got', 'label', 'op', 'want']);
  // The judgement still sees a withheld name come and go.
  assert.deepEqual(judged(PUBLIC_FORMS.fingerprint(rawRecord({...A, role: 'kernel'})), out).undeclared.env.onlyRight, ['API_TOKEN', 'OWNER_NOTE']);
});

test('port-vs-capture\'s public form is booleans and counts from the comparison, never its args, profiles or values', () => {
  const record = {input: {capture: `/x/${PLANTED}.json`, mode: 'scoped', cwd: `/s/${PLANTED}`}, port: {args: ['-p', PLANTED], env: {X: PLANTED}},
    comparison: {captured: true, argv0: `/usr/bin/${PLANTED}`, argvEqual: false, profileEqual: false,
      firstProfileDifference: {line: 7, captured: `(subpath "${PLANTED}")`, golden: '(subpath "/x")'},
      paramsDiffering: [{index: 0, captured: `-DA=${PLANTED}`, golden: '-DA=/x'}, {index: 2, captured: null, golden: '-DB=/y'}], commandEqual: true,
      env: {onlyCaptured: ['__CF_USER_TEXT_ENCODING'], onlyGolden: [], differing: [{name: 'PATH', captured: `${PLANTED}:/usr/bin`, golden: '/usr/bin'}]},
      tiocsti: 'numeric', cliOnlyEnv: ['__CF_USER_TEXT_ENCODING'], equalButDeviations: false}};
  const out = PUBLIC_FORMS['port-vs-capture'](record);
  assert.deepEqual(out, {mode: 'scoped', captured: true, argvEqual: false, profileEqual: false, firstProfileDifferenceLine: 7, paramsDiffering: 2, commandEqual: true,
    env: {onlyCaptured: ['__CF_USER_TEXT_ENCODING'], onlyGolden: [], differing: ['PATH']}, tiocsti: 'numeric', cliOnlyEnv: ['__CF_USER_TEXT_ENCODING'], equalButDeviations: false});
  assert.equal(leaks(out), false);
  assert.deepEqual(PUBLIC_FORMS['port-vs-capture']({input: {mode: 'default'}, comparison: {captured: false, tries: 20}}), {mode: 'default', captured: false});
});

test('own-sandbox\'s public form keeps labels, passes and only codes that look like error codes or numbers', () => {
  const report = {probe: 'own-sandbox', host: 'cua', home: `/s/${PLANTED}`, ok: false, modes: {scoped: {reads: {store: {ok: true, value: PLANTED}}}},
    checks: [{label: 'scoped: denied: store', pass: true, detail: 'EPERM'}, {label: 'scoped: a TCP connect fails', pass: false, detail: `connected to ${PLANTED}`},
      {label: 'scoped: exit', pass: false, detail: '13'}, {label: 'scoped: TMPDIR is the session\'s own', pass: true}, {label: 'linux', pass: false, detail: 'EPERM/EACCES'}]};
  const out = PUBLIC_FORMS['own-sandbox'](report);
  assert.deepEqual(out, {ok: false, checks: [{label: 'scoped: denied: store', pass: true, code: 'EPERM'}, {label: 'scoped: a TCP connect fails', pass: false},
    {label: 'scoped: exit', pass: false, code: '13'}, {label: 'scoped: TMPDIR is the session\'s own', pass: true}, {label: 'linux', pass: false}]});
  assert.equal(leaks(out), false);
  assert.deepEqual(PUBLIC_FORMS['engine-lane'](report), out, 'the engine lane publishes its checks the same way');
});

test('probe-secrets\' and doctor\'s public forms are statuses by name, without details or stderr excerpts', () => {
  const secrets = {scenario: 'live-native-secret-substitution', status: 'FAIL', release: 'r', label: 'l', date: 'd',
    steps: [{name: 'set', status: 'PASS', detail: `stderr: ${PLANTED}`}, {name: 'sentinel scan', status: 'FAIL', detail: PLANTED}], channels: [{name: PLANTED}]};
  const secretsOut = PUBLIC_FORMS['probe-secrets'](secrets);
  assert.deepEqual(secretsOut, {status: 'FAIL', steps: [{name: 'set', status: 'PASS'}, {name: 'sentinel scan', status: 'FAIL'}]});
  assert.equal(leaks(secretsOut), false);
  const doctor = {ok: true, home: `/s/${PLANTED}`, checks: [{name: 'sandbox.launcher', status: 'pass', detail: PLANTED, path: PLANTED}]};
  const doctorOut = PUBLIC_FORMS.doctor(doctor);
  assert.deepEqual(doctorOut, {ok: true, checks: [{name: 'sandbox.launcher', status: 'pass'}]});
  assert.equal(leaks(doctorOut), false);
});

test('hosted-public.mjs <form> <raw> <public> writes the public form, and refuses a form it does not know', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-hosted-public-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const run = (...args) => spawnSync(process.execPath, ['scripts/sandbox-probe/hosted-public.mjs', ...args], {cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8'});
  writeFileSync(join(dir, 'raw.json'), JSON.stringify({status: 'PASS', steps: [{name: 'set', status: 'PASS', detail: PLANTED}]}));
  const ok = run('probe-secrets', join(dir, 'raw.json'), join(dir, 'public.json'));
  assert.equal(ok.status, 0, ok.stderr);
  const written = readFileSync(join(dir, 'public.json'), 'utf8');
  assert.deepEqual(JSON.parse(written), {status: 'PASS', steps: [{name: 'set', status: 'PASS'}]});
  assert.equal(written.includes(PLANTED), false);
  const unknown = run('install', join(dir, 'raw.json'), join(dir, 'other.json'));
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /no public form/);
});

test('hosted-public.mjs fails on a report it cannot publish with a fixed message naming the form and the files, never the input', t => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-hosted-public-'));
  t.after(() => { chmodSync(join(dir, 'locked'), 0o700); rmSync(dir, {recursive: true, force: true}); });
  const run = (...args) => spawnSync(process.execPath, ['scripts/sandbox-probe/hosted-public.mjs', ...args], {cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8'});
  writeFileSync(join(dir, 'malformed.json'), `{"status": "PASS", "steps": [{"name": "${PLANTED}", `);
  writeFileSync(join(dir, 'misshapen.json'), JSON.stringify({status: PLANTED}));
  writeFileSync(join(dir, 'raw.json'), JSON.stringify({status: 'PASS', steps: [{name: 'set', status: 'PASS', detail: PLANTED}]}));
  mkdirSync(join(dir, 'locked'));
  chmodSync(join(dir, 'locked'), 0o500);
  for (const [raw, out] of [['malformed.json', 'a.json'], ['misshapen.json', 'b.json'], ['absent.json', 'c.json'], ['raw.json', join('locked', 'd.json')]]) {
    const failed = run('probe-secrets', join(dir, raw), join(dir, out));
    assert.notEqual(failed.status, 0, raw);
    assert.equal(failed.stdout, '');
    assert.equal(failed.stderr, `hosted-public: could not publish the probe-secrets form of ${raw} as ${out.split('/').pop()}\n`);
  }
});
