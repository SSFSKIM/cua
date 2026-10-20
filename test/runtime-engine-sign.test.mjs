// The engine's signing (src/runtime/engine-sign.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "Install, signing and permissions", the Decision Log's "M1b's signing route" and "M1b pre-flight" item 2): the
// identity from CUA_SIGNING_IDENTITY or engine.json's signingIdentity, never printed; ad hoc and GUI-session signing
// in-process; signing from an SSH session through a one-shot launchd job in the GUI domain, bounded, booted out, and
// failing with the keychain-prompt sentence. Every codesign, launchctl and the job's run are fakes: nothing here signs
// with an identity, touches launchd or raises a prompt.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {CERT_SHA1, NAME, fakeCodesignRead, markSigned} from './helpers/fake-codesign.mjs';
import {parsePlist} from '../src/remote/plist.mjs';
import {
  SIGN_JOB_SCRIPT, SIGN_JOB_TIMEOUT_MS, identityMatches, jobCodesignMs, readSignature, recordedIdentity, resolveSigningIdentity, runSignJob, signBundle, signWaitMs,
} from '../src/runtime/engine-sign.mjs';

const SHA1 = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';

function home(t, settings) {
  const s = scratch('cua-sign-home-');
  t.after(s.cleanup);
  if (settings !== undefined) {
    mkdirSync(join(s.dir, '.config', 'cua'), {recursive: true});
    writeFileSync(join(s.dir, '.config', 'cua', 'engine.json'), typeof settings === 'string' ? settings : JSON.stringify(settings));
  }
  return s.dir;
}

test('the identity comes from CUA_SIGNING_IDENTITY, else engine.json\'s signingIdentity; without either the refusal names both and ad hoc', t => {
  const dir = home(t, {signingIdentity: SHA1});
  assert.deepEqual(resolveSigningIdentity({env: {HOME: dir}}), {identity: SHA1, source: 'settings'});
  assert.deepEqual(resolveSigningIdentity({env: {HOME: dir, CUA_SIGNING_IDENTITY: NAME}}), {identity: NAME, source: 'env'});
  const none = home(t);
  assert.throws(() => resolveSigningIdentity({env: {HOME: none}}), error => {
    assert.equal(error.code, 'engine_identity_missing');
    assert.match(error.message, /signingIdentity/);
    assert.match(error.message, /CUA_SIGNING_IDENTITY/);
    assert.match(error.hint, /security find-identity -v -p codesigning/);
    assert.match(error.hint, /--sign adhoc/);
    return true;
  });
  assert.throws(() => resolveSigningIdentity({env: {HOME: home(t, {signingIdentity: ''})}}), {code: 'engine_identity_missing'});
  assert.throws(() => resolveSigningIdentity({env: {HOME: home(t, '{not json')}}), {code: 'engine_settings_invalid'});
  assert.throws(() => resolveSigningIdentity({env: {HOME: home(t, '[1]')}}), {code: 'engine_settings_invalid'});
  assert.throws(() => resolveSigningIdentity({env: {HOME: home(t, {signingIdentity: 7})}}), {code: 'engine_settings_invalid'});
});

test('a signature reads as the leaf certificate\'s SHA-1 and subject, ad hoc, or none; it matches a configured SHA-1 or common name', t => {
  const s = scratch('cua-sign-read-');
  t.after(s.cleanup);
  const bundle = join(s.dir, 'cua Engine.app');
  assert.equal(readSignature(bundle, {runSync: fakeCodesignRead}), null, 'unsigned');
  markSigned(bundle, 'identity');
  const signed = readSignature(bundle, {runSync: fakeCodesignRead});
  assert.deepEqual(signed, {kind: 'identity', sha1: CERT_SHA1, authority: NAME});
  assert.equal(recordedIdentity(signed), CERT_SHA1);
  assert.equal(identityMatches(signed, CERT_SHA1), true);
  assert.equal(identityMatches(signed, CERT_SHA1.toLowerCase()), true, 'a SHA-1 in either case');
  assert.equal(identityMatches(signed, NAME), true, 'the common name');
  assert.equal(identityMatches(signed, SHA1), false);
  assert.equal(identityMatches(signed, 'Apple Development: Someone Else (TEAM123456)'), false);
  assert.equal(identityMatches(signed, null), null, 'nothing configured');
  markSigned(bundle, 'adhoc');
  const adhoc = readSignature(bundle, {runSync: fakeCodesignRead});
  assert.deepEqual(adhoc, {kind: 'adhoc'});
  assert.equal(recordedIdentity(adhoc), 'adhoc');
  assert.equal(identityMatches(adhoc, CERT_SHA1), false);
});

// A recorder of the async runner: answers by a handler per program, records every call.
function recorder(handlers) {
  const calls = [];
  const run = async (file, args, options = {}) => {
    calls.push({file, args, options});
    const handler = handlers[file];
    if (!handler) throw new Error(`unexpected ${file} ${args.join(' ')}`);
    return handler(args, options);
  };
  return {run, calls};
}
const ok = (stdout = '') => ({code: 0, stdout, stderr: ''});

test('ad hoc signs in this process with hardened runtime and no timestamp, then verifies strictly', async t => {
  const s = scratch('cua-sign-adhoc-');
  t.after(s.cleanup);
  const {run, calls} = recorder({'/usr/bin/codesign': () => ok()});
  await signBundle(join(s.dir, 'cua Engine.app'), {identity: 'adhoc', run, env: {HOME: s.dir}});
  assert.deepEqual(calls.map(c => c.args), [
    ['--force', '--sign', '-', '--options', 'runtime', '--timestamp=none', join(s.dir, 'cua Engine.app')],
    ['--verify', '--strict', join(s.dir, 'cua Engine.app')],
  ]);
});

test('in the GUI session (launchctl managername Aqua) the identity signs in this process', async t => {
  const dir = home(t, {signingIdentity: SHA1});
  const {run, calls} = recorder({'/bin/launchctl': args => (assert.deepEqual(args, ['managername']), ok('Aqua\n')), '/usr/bin/codesign': () => ok()});
  await signBundle(join(dir, 'b.app'), {run, env: {HOME: dir}});
  assert.deepEqual(calls.map(c => [c.file, ...c.args.slice(0, 3)]), [
    ['/bin/launchctl', 'managername'],
    ['/usr/bin/codesign', '--force', '--sign', SHA1],
    ['/usr/bin/codesign', '--verify', '--strict', join(dir, 'b.app')],
  ]);
});

test('a codesign failure in this process is a refusal whose text never carries the identity', async t => {
  const dir = home(t, {signingIdentity: SHA1});
  const {run} = recorder({'/bin/launchctl': () => ok('Aqua\n'), '/usr/bin/codesign': () => ({code: 1, stdout: '', stderr: `${SHA1}: no identity found\n`})});
  await assert.rejects(signBundle(join(dir, 'b.app'), {run, env: {HOME: dir}}), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.ok(!JSON.stringify({m: error.message, h: error.hint}).includes(SHA1), 'redacted');
    assert.match(error.message, /no identity found/);
    return true;
  });
});

// The SSH case: launchd's bootstrap runs the job, which the fake runs at once in this process from the plist it was
// given (its ProgramArguments and EnvironmentVariables), with a fake codesign.
function sshWorld(t, {settings = {signingIdentity: SHA1}, env = {}, job = 'runs', gui = true, codesign = () => ({status: 0, stdout: '', stderr: ''})} = {}) {
  const dir = home(t, settings);
  const jobs = [];
  const temp = scratch('cua-sign-tmp-');
  t.after(temp.cleanup);
  const {run, calls} = recorder({
    '/bin/launchctl': async args => {
      if (args[0] === 'managername') return ok('Background\n');
      if (args[0] === 'print' && args[1] !== 'gui/501') {
        const plist = jobs.at(-1).plist;
        if (job === 'dies' || job === 'killed') {
          writeFileSync(plist.StandardErrorPath, `node: cannot open ${SHA1}\nfor signer ${NAME}\nError: Cannot find module\n`);
          // A job a signal killed shows its terminating signal and may show no exit code.
          return ok(`${plist.Label} = {\n\tstate = not running\n${job === 'killed' ? '\tlast terminating signal = Killed: 9' : '\tlast exit code = 1'}\n}\n`);
        }
        return ok(`${plist.Label} = {\n\tstate = running\n\tlast exit code = (never exited)\n}\n`);
      }
      if (args[0] === 'print') return gui ? ok('gui/501 = {\n}\n') : {code: 113, stdout: '', stderr: 'Could not find domain for port identifier: gui/501\n'};
      if (args[0] === 'bootstrap') {
        const text = readFileSync(args[2], 'utf8');
        const plist = parsePlist(text);
        jobs.push({plist, text, mode: 0});
        if (job === 'runs') {
          const [, script, flag, bundle, result] = plist.ProgramArguments;
          assert.equal(script, SIGN_JOB_SCRIPT);
          assert.equal(flag, '--job');
          runSignJob({bundle, resultPath: result, env: plist.EnvironmentVariables, runSync: (file, a, o) => { Object.assign(jobs.at(-1), {codesign: [file, ...a], codesignOptions: o}); return codesign(file, a, o); }});
        }
        return ok();
      }
      if (args[0] === 'bootout') return ok();
      throw new Error(`launchctl ${args.join(' ')}`);
    },
    '/usr/bin/codesign': () => ok(),
  });
  let clock = 0;
  const timing = {sleep: async ms => { clock += ms; }, now: () => clock};
  return {dir, run, calls, jobs, options: {run, env: {HOME: dir, ...env}, uid: 501, node: '/opt/node/bin/node', tmp: temp.dir, ...timing}};
}

test('over SSH the identity signs through a one-shot job in gui/<uid>: no command line carries it, the job is booted out and its files removed', async t => {
  const w = sshWorld(t);
  const bundle = join(w.dir, 'cua Engine.app');
  await signBundle(bundle, w.options);
  assert.equal(w.jobs.length, 1);
  const [{plist, text}] = w.jobs;
  assert.match(plist.Label, /^io\.github\.ssfskim\.cua\.engine\.sign\.[0-9a-f-]+$/);
  assert.deepEqual(plist.ProgramArguments.slice(0, 4), ['/opt/node/bin/node', SIGN_JOB_SCRIPT, '--job', bundle]);
  assert.equal(plist.RunAtLoad, true);
  assert.equal(plist.KeepAlive, undefined);
  assert.deepEqual(plist.EnvironmentVariables, {HOME: w.dir, CUA_SIGN_CODESIGN_MS: String(jobCodesignMs(SIGN_JOB_TIMEOUT_MS))}, 'the job reads the identity from the setting itself');
  assert.ok(!text.includes(SHA1), 'the plist does not carry the identity');
  assert.deepEqual(w.jobs[0].codesign, ['/usr/bin/codesign', '--force', '--sign', SHA1, '--options', 'runtime', '--timestamp=none', bundle]);
  const launchctl = w.calls.filter(c => c.file === '/bin/launchctl').map(c => c.args);
  assert.deepEqual(launchctl.map(a => a[0]), ['managername', 'print', 'bootstrap', 'bootout']);
  assert.equal(launchctl[1][1], 'gui/501');
  assert.equal(launchctl[2][1], 'gui/501');
  assert.equal(launchctl[3][1], `gui/501/${plist.Label}`);
  for (const args of launchctl) assert.ok(!args.join(' ').includes(SHA1));
  assert.ok(!existsSync(join(plist.ProgramArguments[4], '..')), 'the job\'s directory is removed');
  assert.deepEqual(w.calls.filter(c => c.file === '/usr/bin/codesign').map(c => c.args.slice(0, 2)), [['--verify', '--strict']], 'only the verify runs here');
});

test('an identity from CUA_SIGNING_IDENTITY reaches the job through its environment, never its arguments', async t => {
  const w = sshWorld(t, {settings: undefined, env: {CUA_SIGNING_IDENTITY: NAME}});
  await signBundle(join(w.dir, 'b.app'), w.options);
  const [{plist}] = w.jobs;
  assert.deepEqual(plist.EnvironmentVariables, {HOME: w.dir, CUA_SIGNING_IDENTITY: NAME, CUA_SIGN_CODESIGN_MS: String(jobCodesignMs(SIGN_JOB_TIMEOUT_MS))});
  assert.ok(!plist.ProgramArguments.join(' ').includes(NAME));
  assert.equal(w.jobs[0].codesign[3], NAME);
});

test('a job that does not finish in time is booted out, and the refusal says a keychain prompt waits on the console for Always Allow', async t => {
  const w = sshWorld(t, {job: 'hangs'});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), {...w.options, timeoutMs: 45_000}), error => {
    assert.equal(error.code, 'engine_sign_prompt_waiting');
    assert.match(error.message, /keychain prompt/);
    assert.match(error.message, /console/);
    assert.match(error.hint, /Always Allow/);
    assert.match(error.hint, /cua engine build/);
    assert.ok(!JSON.stringify({m: error.message, h: error.hint}).includes(SHA1));
    return true;
  });
  const launchctl = w.calls.filter(c => c.file === '/bin/launchctl').map(c => c.args[0]);
  assert.deepEqual([...new Set(launchctl)], ['managername', 'print', 'bootstrap', 'bootout']);
  assert.equal(launchctl.at(-1), 'bootout');
  assert.ok(launchctl.filter(a => a === 'print').length > 2, 'the job\'s state is read while waiting');
  assert.equal(w.calls.filter(c => c.file === '/usr/bin/codesign').length, 0);
});

test('a longer wait names the bound it used, and the hint says how to answer the prompt while codesign is still alive', async t => {
  const w = sshWorld(t, {job: 'hangs'});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), {...w.options, timeoutMs: 600_000}), error => {
    assert.equal(error.code, 'engine_sign_prompt_waiting');
    assert.match(error.message, /within 600 s /);
    assert.match(error.hint, /--sign-wait/);
    return true;
  });
});

test('the job\'s codesign waits as long as the sign wait, a little less than the build\'s own wait, so the build sees the job\'s answer first', () => {
  assert.equal(jobCodesignMs(45_000), 40_000, 'the default: 45 s for the build, 40 s for codesign');
  assert.equal(jobCodesignMs(600_000), 595_000);
  for (const wait of [2, 3_000, 9_999, 10_000, 45_000, 600_000, 1_800_000]) {
    const inner = jobCodesignMs(wait);
    assert.ok(Number.isInteger(inner) && inner >= 1 && inner < wait, `${wait} ms: codesign ${inner} ms, positive and inside the build's wait`);
    assert.ok(inner >= wait / 2, `${wait} ms: codesign still gets at least half`);
  }
  assert.equal(jobCodesignMs(1), 1, 'the shortest wait still gives codesign a bound, never 0 (spawnSync reads 0 as none)');
});

test('the plist built for a sign wait carries the job\'s codesign bound, and the job hands it to codesign', async t => {
  for (const timeoutMs of [45_000, 600_000]) {
    const w = sshWorld(t);
    await signBundle(join(w.dir, 'b.app'), {...w.options, timeoutMs});
    const [{plist, codesignOptions}] = w.jobs;
    assert.equal(plist.EnvironmentVariables.CUA_SIGN_CODESIGN_MS, String(jobCodesignMs(timeoutMs)));
    assert.ok(!plist.ProgramArguments.join(' ').includes(String(jobCodesignMs(timeoutMs))), 'through the environment, as the identity source is');
    assert.equal(codesignOptions?.timeout, jobCodesignMs(timeoutMs), `${timeoutMs} ms: the job's codesign is bounded by it, not a fixed 60 s`);
  }
});

test('a job run without the bound (by hand) bounds codesign as the default sign wait does', t => {
  const s = scratch('cua-sign-job-bound-');
  t.after(s.cleanup);
  let options;
  runSignJob({bundle: join(s.dir, 'b.app'), resultPath: join(s.dir, 'r.json'), env: {HOME: s.dir, CUA_SIGNING_IDENTITY: NAME}, runSync: (file, a, o) => { options = o; return {status: 0, stderr: ''}; }});
  assert.equal(options?.timeout, jobCodesignMs(SIGN_JOB_TIMEOUT_MS));
});

test('the job\'s codesign killed at its bound reads as the keychain prompt waiting, not as a codesign failure', async t => {
  const w = sshWorld(t, {codesign: () => ({status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: Object.assign(new Error('spawnSync /usr/bin/codesign ETIMEDOUT'), {code: 'ETIMEDOUT'})})});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), {...w.options, timeoutMs: 600_000}), error => {
    assert.equal(error.code, 'engine_sign_prompt_waiting');
    assert.match(error.message, /within 600 s /);
    assert.match(error.hint, /Always Allow/);
    return true;
  });
  assert.equal(w.calls.filter(c => c.file === '/bin/launchctl').at(-1).args[0], 'bootout');
});

test('in the GUI session codesign is bounded by the sign wait too', async t => {
  const dir = home(t, {signingIdentity: SHA1});
  const {run, calls} = recorder({'/bin/launchctl': () => ok('Aqua\n'), '/usr/bin/codesign': () => ok()});
  await signBundle(join(dir, 'b.app'), {run, env: {HOME: dir}, timeoutMs: 600_000});
  assert.equal(calls.find(c => c.args[0] === '--force').options.timeout, 600_000);
});

test('the sign wait: 45 s by default, CUA_SIGN_WAIT_MS when set, --sign-wait over both; anything but a whole number of ms up to 30 min is refused naming its setting', () => {
  assert.equal(SIGN_JOB_TIMEOUT_MS, 45_000);
  assert.equal(signWaitMs({env: {}}), 45_000);
  assert.equal(signWaitMs({env: {CUA_SIGN_WAIT_MS: ''}}), 45_000, 'an empty variable reads as unset');
  assert.equal(signWaitMs({env: {CUA_SIGN_WAIT_MS: '600000'}}), 600_000);
  assert.equal(signWaitMs({flag: '120000', env: {CUA_SIGN_WAIT_MS: '600000'}}), 120_000);
  assert.equal(signWaitMs({flag: '120000', env: {CUA_SIGN_WAIT_MS: 'nonsense'}}), 120_000, 'the flag wins; the variable is not read');
  assert.equal(signWaitMs({flag: '1800000', env: {}}), 1_800_000);
  for (const bad of ['0', '-5', '1.5', '1e6', 'abc', ' 600000', '1800001', '']) {
    assert.throws(() => signWaitMs({flag: bad, env: {}}), error => error.code === 'engine_sign_wait_invalid' && /--sign-wait/.test(error.message) && /30 min/.test(error.message), `--sign-wait ${JSON.stringify(bad)}`);
    if (bad) assert.throws(() => signWaitMs({env: {CUA_SIGN_WAIT_MS: bad}}), error => error.code === 'engine_sign_wait_invalid' && /CUA_SIGN_WAIT_MS/.test(error.message), `CUA_SIGN_WAIT_MS ${JSON.stringify(bad)}`);
  }
});

test('a job that exits without a result fails at once with the redacted tail of its log, not the keychain-prompt sentence', async t => {
  const w = sshWorld(t, {job: 'dies'});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), w.options), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.match(error.message, /exited \(1\) without signing/);
    assert.match(error.message, /Cannot find module/);
    assert.ok(!error.message.includes(SHA1) && !error.message.includes(NAME), 'both forms redacted');
    return true;
  });
  assert.equal(w.calls.filter(c => c.file === '/bin/launchctl').at(-1).args[0], 'bootout');
});

test('a job that a signal killed (no exit code, only a terminating signal) fails at once with its log tail too', async t => {
  const w = sshWorld(t, {job: 'killed'});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), w.options), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.match(error.message, /was terminated \(Killed: 9\) without signing/);
    assert.match(error.message, /Cannot find module/);
    assert.ok(!error.message.includes(SHA1) && !error.message.includes(NAME), 'both forms redacted');
    return true;
  });
  assert.equal(w.calls.filter(c => c.file === '/bin/launchctl').filter(c => c.args[0] === 'print').length, 2, 'one print for the domain, one for the job: no waiting out the timeout');
  assert.equal(w.calls.filter(c => c.file === '/bin/launchctl').at(-1).args[0], 'bootout');
});

test('with no GUI login the SSH sign refuses, naming the console login, and bootstraps nothing', async t => {
  const w = sshWorld(t, {gui: false});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), w.options), error => {
    assert.equal(error.code, 'engine_no_gui_login');
    assert.match(error.message, /logged in at this Mac's console/);
    return true;
  });
  assert.equal(w.jobs.length, 0);
});

test('with a SHA-1 configured, codesign\'s chain warning that names the certificate by its common name is redacted too', async t => {
  const dir = home(t, {signingIdentity: SHA1});
  const {run} = recorder({'/bin/launchctl': () => ok('Aqua\n'), '/usr/bin/codesign': () => ({code: 1, stdout: '',
    stderr: `Warning: unable to build chain to self-signed root for signer "${NAME}"\nb.app: errSecInternalComponent\n`})});
  await assert.rejects(signBundle(join(dir, 'b.app'), {run, env: {HOME: dir}}), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.match(error.message, /errSecInternalComponent/);
    assert.match(error.message, /for signer "<signing identity>"/);
    assert.ok(!error.message.includes(NAME) && !error.message.includes('TEAM123456'));
    return true;
  });
  // And the other way round: a common name configured, codesign naming a SHA-1.
  const named = home(t, {signingIdentity: NAME});
  const other = recorder({'/bin/launchctl': () => ok('Aqua\n'), '/usr/bin/codesign': () => ({code: 1, stdout: '', stderr: `${CERT_SHA1.toLowerCase()}: no identity found\n`})});
  await assert.rejects(signBundle(join(named, 'b.app'), {run: other.run, env: {HOME: named}}), error => !error.message.toUpperCase().includes(CERT_SHA1));
});

test('the job\'s codesign failure comes back as a refusal with the identity redacted', async t => {
  const w = sshWorld(t, {codesign: () => ({status: 1, stdout: '', stderr: `error: ${SHA1}: errSecInternalComponent\n`})});
  await assert.rejects(signBundle(join(w.dir, 'b.app'), w.options), error => {
    assert.equal(error.code, 'engine_sign_failed');
    assert.match(error.message, /errSecInternalComponent/);
    assert.ok(!error.message.includes(SHA1));
    return true;
  });
  assert.deepEqual(w.calls.filter(c => c.file === '/bin/launchctl').map(c => c.args[0]).at(-1), 'bootout');
});

test('the job refuses to run without an identity and writes the refusal as its result', t => {
  const s = scratch('cua-sign-job-');
  t.after(s.cleanup);
  const result = join(s.dir, 'result.json');
  runSignJob({bundle: join(s.dir, 'b.app'), resultPath: result, env: {HOME: s.dir}, runSync: () => assert.fail('codesign must not run')});
  const answer = JSON.parse(readFileSync(result, 'utf8'));
  assert.equal(answer.code, 'engine_identity_missing');
});

test('the job entry runs as launchd runs it: a usage error without its arguments, else its result file', t => {
  const s = scratch('cua-sign-entry-');
  t.after(s.cleanup);
  const env = {...process.env, HOME: s.dir};
  delete env.CUA_SIGNING_IDENTITY;
  assert.equal(spawnSync(process.execPath, [SIGN_JOB_SCRIPT], {env, encoding: 'utf8'}).status, 2);
  const result = join(s.dir, 'result.json');
  const ran = spawnSync(process.execPath, [SIGN_JOB_SCRIPT, '--job', join(s.dir, 'b.app'), result], {env, encoding: 'utf8'});
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(JSON.parse(readFileSync(result, 'utf8')).code, 'engine_identity_missing');
});
