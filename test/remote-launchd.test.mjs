// `cua agent install|uninstall|status` (src/remote/launchd.mjs) against a scratch user home and a fake `launchctl`
// that models one gui/<uid> domain: no test reads or changes the real launchd domain or ~/Library/LaunchAgents.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {AGENT_LABEL, agentPlistPath, agentStatus, installAgent, parseLaunchdPrint, readPlist, uninstallAgent} from '../src/remote/launchd.mjs';
import {enrollDevice} from '../src/remote/device.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {fakeLaunchctl, printed} from './fixtures/fake-launchctl.mjs';

const UID = 501;
const NODE = '/opt/node & <co>/bin/node';
const CLI = '/Users/me/"cua"/bin/cua\'s.mjs';

function setup(t, {enrol = true, relayUrl, ...fake} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua home');
  const userHome = join(s.dir, 'user');
  mkdirSync(userHome);
  if (enrol) enrollDevice({home, ...(relayUrl ? {relayUrl} : {})});
  const launchctl = fakeLaunchctl(fake);
  const common = {userHome, uid: UID, launchctl: launchctl.run, settleMs: 1};
  const install = (options = {}) => installAgent({home, env: {CUA_HOME: home}, node: NODE, cli: CLI, ...common, ...options});
  return {home, userHome, launchctl, common, install, plist: agentPlistPath(userHome)};
}

test('install writes the GUI-session job (node, cli, agent run --http, KeepAlive, RunAtLoad, the log, CUA_HOME and the surfaces) and bootstraps it', async t => {
  const {home, userHome, launchctl, install, plist} = setup(t);
  const result = await install({http: '192.168.1.20:7801'});
  assert.equal(plist, join(userHome, 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`));
  assert.equal(statSync(plist).mode & 0o777, 0o644, 'launchd refuses a plist others may write');
  const text = readFileSync(plist, 'utf8');
  assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
  assert.ok(text.includes('<string>/opt/node &amp; &lt;co&gt;/bin/node</string>'), 'paths are XML-escaped');
  const job = readPlist(text);
  const log = join(home, 'state', 'agent.log');
  assert.deepEqual(job, {
    label: AGENT_LABEL,
    programArguments: [NODE, CLI, 'agent', 'run', '--http', '192.168.1.20:7801'],
    node: NODE, cli: CLI, args: ['--http', '192.168.1.20:7801'],
    environment: {CUA_HOME: home, CUA_SHIM_SURFACES: 'computer,browser'},
    keepAlive: {SuccessfulExit: false}, runAtLoad: true, standardOutPath: log, standardErrorPath: log,
  });
  assert.match(text, /<key>KeepAlive<\/key>\n\t<dict>\n\t\t<key>SuccessfulExit<\/key>\n\t\t<false\/>\n\t<\/dict>/, 'launchd restarts a failure, never a deliberate stop');
  assert.equal(statSync(join(home, 'state')).isDirectory(), true, 'the log\'s directory exists before launchd opens the log');
  assert.deepEqual(launchctl.calls.filter(c => c[0] !== 'print'), [['bootstrap', `gui/${UID}`, plist]]);
  assert.deepEqual(launchctl.plists, [text]);
  assert.equal(result.plist, plist);
  assert.equal(result.node, NODE);
  assert.equal(result.log, log);
  assert.deepEqual(result.programArguments, job.programArguments);
  assert.equal(result.status.running, true);
  assert.equal(result.status.pid, 4242);
});

test('install adds --relay when the device has a relay URL, takes --surfaces, and records CUA_HOME only when it is set', async t => {
  const {home, install, plist} = setup(t, {relayUrl: 'wss://relay.example/ws'});
  await install({surfaces: 'browser'});
  let job = readPlist(readFileSync(plist, 'utf8'));
  assert.deepEqual(job.args, ['--relay']);
  assert.deepEqual(job.environment, {CUA_HOME: home, CUA_SHIM_SURFACES: 'browser'});
  await install({http: '127.0.0.1:7801', surfaces: 'browser, computer', env: {HOME: '/elsewhere'}, home});
  job = readPlist(readFileSync(plist, 'utf8'));
  assert.deepEqual(job.args, ['--relay', '--http', '127.0.0.1:7801']);
  assert.deepEqual(job.environment, {CUA_SHIM_SURFACES: 'computer,browser'}, 'surfaces in canonical order; no CUA_HOME when unset');
});

test('install on an installed job replaces the plist, boots the old job out and bootstraps once launchd has let it go', async t => {
  const {launchctl, install, plist} = setup(t, {bootoutLag: 2});
  await install({http: '127.0.0.1:7801'});
  await install({http: '127.0.0.1:7802'});
  const verbs = launchctl.calls.map(c => c[0]);
  assert.deepEqual(verbs.filter(v => v !== 'print'), ['bootstrap', 'bootout', 'bootstrap']);
  const afterBootout = verbs.slice(verbs.indexOf('bootout') + 1);
  assert.ok(afterBootout.indexOf('bootstrap') > 2, `the new job waits for the old one to be gone: ${afterBootout}`);
  assert.deepEqual(readPlist(launchctl.plists[1]).args, ['--http', '127.0.0.1:7802']);
  assert.equal(readFileSync(plist, 'utf8'), launchctl.plists[1]);
});

test('install refuses, before writing anything or calling launchctl, with nothing to serve, without an enrolment, or with a bad address or surface list', async t => {
  for (const [options, setupOptions, code] of [
    [{}, {}, 'agent_nothing_to_serve'],
    [{http: '127.0.0.1:7801'}, {enrol: false}, 'remote_not_enrolled'],
    [{}, {enrol: false}, 'remote_not_enrolled'],
    [{http: '0.0.0.0'}, {}, 'invalid_http_address'],
    [{http: '127.0.0.1:7801', surfaces: 'computer,keyboard'}, {}, 'invalid_setting'],
    [{http: '127.0.0.1:7801', surfaces: ''}, {}, 'invalid_setting'],
    [{http: '127.0.0.1:7801', node: '/bin/node\u0001'}, {}, 'agent_path_unsupported'],
  ]) {
    const {launchctl, install, plist, home} = setup(t, setupOptions);
    await assert.rejects(install(options), {code}, JSON.stringify(options));
    assert.equal(existsSync(plist), false);
    assert.equal(existsSync(join(home, 'state')), false);
    assert.deepEqual(launchctl.calls, []);
  }
});

test('a bootstrap launchd refuses is agent_bootstrap_failed with launchctl\'s words; the plist stays for status and doctor to show', async t => {
  const {install, plist} = setup(t, {bootstrapFails: true});
  await assert.rejects(install({http: '127.0.0.1:7801'}), error => {
    assert.equal(error.code, 'agent_bootstrap_failed');
    assert.match(error.message, /Input\/output error/);
    return true;
  });
  assert.equal(existsSync(plist), true);
});

test('status reads the plist and launchd: not installed (launchd not asked), running with its pid, loaded but stopped, not loaded, unreadable', async t => {
  const {launchctl, install, common, plist} = setup(t);
  let status = await agentStatus(common);
  assert.deepEqual(status, {label: AGENT_LABEL, plist, installed: false, loaded: false, running: false});
  assert.deepEqual(launchctl.calls, [], 'no plist: launchd is not asked');

  await install({http: '127.0.0.1:7801'});
  status = await agentStatus(common);
  assert.equal(status.installed, true);
  assert.equal(status.job.node, NODE);
  assert.deepEqual({loaded: status.loaded, running: status.running, pid: status.pid, state: status.state}, {loaded: true, running: true, pid: 4242, state: 'running'});

  launchctl.running = false;
  launchctl.lastExit = '1';
  status = await agentStatus(common);
  assert.deepEqual({loaded: status.loaded, running: status.running, pid: status.pid, state: status.state, lastExitCode: status.lastExitCode},
    {loaded: true, running: false, pid: undefined, state: 'not running', lastExitCode: '1'});

  launchctl.loaded = false;
  status = await agentStatus(common);
  assert.deepEqual({installed: status.installed, loaded: status.loaded, running: status.running}, {installed: true, loaded: false, running: false});

  writeFileSync(plist, '<plist><dict><key>Label</key><string>something.else</string></dict></plist>');
  status = await agentStatus(common);
  assert.equal(status.installed, true);
  assert.equal(status.job, undefined);
  assert.match(status.invalid, /Label/);
});

test('uninstall boots the job out and removes the plist; with nothing installed it changes nothing and says so', async t => {
  const {launchctl, install, common, plist} = setup(t);
  assert.deepEqual(await uninstallAgent(common), {label: AGENT_LABEL, plist, bootedOut: false, removed: false});
  await install({http: '127.0.0.1:7801'});
  assert.deepEqual(await uninstallAgent(common), {label: AGENT_LABEL, plist, bootedOut: true, removed: true});
  assert.equal(existsSync(plist), false);
  assert.equal(launchctl.loaded, false);
  // A job still loaded whose plist someone deleted is booted out all the same.
  await install({http: '127.0.0.1:7801'});
  rmSync(plist);
  assert.deepEqual(await uninstallAgent(common), {label: AGENT_LABEL, plist, bootedOut: true, removed: false});
});

test('readPlist accepts the job cua writes with keys added by hand, and refuses anything else', () => {
  const base = args => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>${AGENT_LABEL}</string>
<key>ProgramArguments</key><array>${args.map(a => `<string>${a}</string>`).join('')}</array>
<key>ProcessType</key><string>Interactive</string>
</dict></plist>`;
  assert.deepEqual(readPlist(base(['/n', '/c', 'agent', 'run', '--relay'])), {
    label: AGENT_LABEL, programArguments: ['/n', '/c', 'agent', 'run', '--relay'], node: '/n', cli: '/c', args: ['--relay'],
    environment: {}, keepAlive: false, runAtLoad: false, standardOutPath: undefined, standardErrorPath: undefined,
  });
  assert.equal(readPlist(base(['/n', '/c', 'agent', 'run']).replace('<key>ProcessType</key><string>Interactive</string>', '<key>KeepAlive</key><true/>')).keepAlive, true);
  for (const text of ['not a plist', '<plist><array/></plist>', base(['/n', '/c', 'serve']), base(['/n']),
    base(['/n', '/c', 'agent', 'run']).replace(AGENT_LABEL, 'other.label'),
    `<plist><dict><key>Label</key><string>${AGENT_LABEL}</string><key>ProgramArguments</key><array><integer>1</integer></array></dict></plist>`,
    base(['/n', '/c', 'agent', 'run']).replace('<key>ProcessType</key>', '<key>EnvironmentVariables</key><dict><key>A</key><true/></dict><key>X</key>'),
    base(['/n', '/c', 'agent', 'run']).replace('<key>ProcessType</key><string>Interactive</string>', '<key>KeepAlive</key><string>yes</string>'),
    base(['/n', '/c', 'agent', 'run']).replace('<key>ProcessType</key><string>Interactive</string>', '<key>KeepAlive</key><dict><key>SuccessfulExit</key><string>no</string></dict>')])
    assert.throws(() => readPlist(text), {code: 'agent_plist_invalid'}, text);
});

test('parseLaunchdPrint reads the job\'s own state, pid and last exit code, never a nested section\'s', () => {
  assert.deepEqual(parseLaunchdPrint(printed({pid: 77})), {state: 'running', pid: 77, lastExitCode: '(never exited)'});
  assert.deepEqual(parseLaunchdPrint(printed({state: 'not running', lastExit: '78: Function not implemented'})), {state: 'not running', pid: undefined, lastExitCode: '78: Function not implemented'});
});
