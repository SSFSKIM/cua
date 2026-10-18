// #159: the hosted gate's artifact is public (the repo is), so it holds only the allowlisted forms
// scripts/sandbox-probe/hosted-public.mjs writes: labels, outcomes, booleans and counts, and the fingerprints' scratch
// paths. A value planted in a free-text field, a stderr excerpt, an argument or an environment must never reach them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PUBLIC_FORMS} from '../../scripts/sandbox-probe/hosted-public.mjs';

const PLANTED = 'planted-7f3a91c2';
const leaks = value => JSON.stringify(value).includes(PLANTED);

test('a fingerprint\'s public form is the launcher, the fingerprint\'s judged fields and the pins, without its input', () => {
  const fingerprint = {pid: 4242, cwd: '/s/home/run/x', sandboxed: true, env: {HOME: '/s/userhome', TOKEN: '<redacted>'},
    checks: [{op: 'file-read-data', filter: 'path', label: 'store', target: '/s/userhome/.config/claude-secrets', result: 'deny'}]};
  const pins = {ok: true, rows: [{label: 'cua-home', op: 'file-read-metadata', want: 'allow', got: 'allow'}]};
  const record = {input: {env: {SECRET: PLANTED}, args: ['-p', `(allow file-read* (literal "${PLANTED}"))`], policy: {}}, launcher: 'cua-kernel', fingerprint, pins};
  const out = PUBLIC_FORMS.fingerprint(record);
  assert.deepEqual(out, {launcher: 'cua-kernel', fingerprint: {sandboxed: true, cwd: fingerprint.cwd, env: fingerprint.env, checks: fingerprint.checks}, pins});
  assert.equal(leaks(out), false);
  assert.deepEqual(Object.keys(PUBLIC_FORMS.fingerprint({...record, pins: undefined})), ['launcher', 'fingerprint'], 'a worker\'s has no pins');
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
