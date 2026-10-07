// `cua agent install|uninstall|status` on Linux (src/remote/systemd.mjs) against a scratch user home and a fake
// `systemctl --user` modelling one user manager: no test reads or changes a real systemd manager or ~/.config/systemd.
// The quoting the unit uses was checked against systemd 255 on Ubuntu 24.04 (docs/evidence/2026-10-06-linux-agent-and-x64.md).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {AGENT_UNIT, agentStatus, agentUnitPath, installAgent, installedJob, readUnit, uninstallAgent} from '../src/remote/systemd.mjs';
import {enrollDevice} from '../src/remote/device.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {fakeLoginctl, fakeSystemctl} from './fixtures/fake-systemctl.mjs';

const NODE = '/opt/node & "co"/bin/node';
const CLI = '/home/me/cua 100%/$HOME/bin/cua\'s.mjs';

function setup(t, {enrol = true, relayUrl, linger = 'no', ...fake} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua home');
  const userHome = join(s.dir, 'user');
  mkdirSync(userHome);
  if (enrol) enrollDevice({home, ...(relayUrl ? {relayUrl} : {})});
  const systemctl = fakeSystemctl({userHome, ...fake});
  const loginctl = fakeLoginctl({linger});
  const common = {userHome, user: 'me', systemctl: systemctl.run, loginctl: loginctl.run};
  const install = (options = {}) => installAgent({home, env: {CUA_HOME: home}, node: NODE, cli: CLI, loadRelay: async () => {}, ...common, ...options});
  return {home, userHome, systemctl, loginctl, common, install, unit: agentUnitPath(userHome)};
}

test('install writes the user unit (node, cli, agent run --http, the display, Restart=on-failure, the log, CUA_HOME and the surfaces), reloads, enables and starts it', async t => {
  const {home, userHome, systemctl, install, unit} = setup(t);
  const result = await install({http: '192.168.1.20:7801', env: {CUA_HOME: home, DISPLAY: ':1', XAUTHORITY: '/home/me/.Xauthority'}});
  assert.equal(unit, join(userHome, '.config', 'systemd', 'user', AGENT_UNIT));
  assert.equal(statSync(unit).mode & 0o777, 0o644);
  const text = readFileSync(unit, 'utf8');
  const log = join(home, 'state', 'agent.log');
  assert.ok(text.includes('ExecStart="/opt/node & \\"co\\"/bin/node" "/home/me/cua 100%%/$$HOME/bin/cua\'s.mjs" "agent" "run" "--http" "192.168.1.20:7801"\n'), 'quoted, escaped, %% and $$');
  for (const line of ['Type=exec', 'Restart=on-failure', 'RestartSec=10', 'KillMode=mixed', `StandardOutput=append:${log}`, `StandardError=append:${log}`, 'WantedBy=default.target', 'Environment="DISPLAY=:1"'])
    assert.ok(text.split('\n').includes(line), line);
  const job = readUnit(text);
  assert.deepEqual(job, {
    programArguments: [NODE, CLI, 'agent', 'run', '--http', '192.168.1.20:7801'],
    node: NODE, cli: CLI, args: ['--http', '192.168.1.20:7801'],
    environment: {DISPLAY: ':1', XAUTHORITY: '/home/me/.Xauthority', CUA_HOME: home, CUA_SHIM_SURFACES: 'computer,browser'},
    restart: 'on-failure', standardOutPath: log, standardErrorPath: log,
  });
  assert.equal(statSync(join(home, 'state')).isDirectory(), true, 'the log\'s directory exists before systemd opens the log');
  assert.deepEqual(systemctl.calls.filter(c => c[0] !== 'show'), [['daemon-reload'], ['enable', AGENT_UNIT], ['restart', AGENT_UNIT]]);
  assert.equal(systemctl.calls[0][0], 'show', 'the manager is asked before anything is written');
  assert.deepEqual(systemctl.texts, [text]);
  assert.equal(result.path, unit);
  assert.equal(result.log, log);
  assert.deepEqual(result.programArguments, job.programArguments);
  assert.deepEqual({running: result.status.running, pid: result.status.pid, enabled: result.status.enabled, linger: result.status.linger}, {running: true, pid: 4343, enabled: true, linger: false});
});

test('the display defaults to :0 with no XAUTHORITY; flags win over the session; --relay and the agent settings are carried', async t => {
  const {home, install, unit} = setup(t, {relayUrl: 'wss://relay.example/ws'});
  await install({surfaces: 'browser', env: {}});
  let job = readUnit(readFileSync(unit, 'utf8'));
  assert.deepEqual(job.args, ['--relay']);
  assert.deepEqual(job.environment, {DISPLAY: ':0', CUA_SHIM_SURFACES: 'browser'}, 'no CUA_HOME when unset; no XAUTHORITY when neither the session nor a flag has one');
  await install({display: ':2.0', xauthority: '/run/user/1000/gdm/Xauthority', env: {DISPLAY: ':9', XAUTHORITY: '/elsewhere', CUA_AGENT_IDLE_MINUTES: '30'}, home});
  job = readUnit(readFileSync(unit, 'utf8'));
  assert.deepEqual(job.environment, {DISPLAY: ':2.0', XAUTHORITY: '/run/user/1000/gdm/Xauthority', CUA_SHIM_SURFACES: 'computer,browser', CUA_AGENT_IDLE_MINUTES: '30'});
});

test('install refuses, before writing anything or calling systemctl, a bad display, a relative X authority, a control character, nothing to serve or no enrolment', async t => {
  for (const [options, setupOptions, code] of [
    [{http: '127.0.0.1:7801', display: 'zero'}, {}, 'invalid_display'],
    [{http: '127.0.0.1:7801', env: {DISPLAY: 'wayland-0'}}, {}, 'invalid_display'],
    [{http: '127.0.0.1:7801', xauthority: '.Xauthority'}, {}, 'invalid_xauthority'],
    [{http: '127.0.0.1:7801', node: '/bin/node\n'}, {}, 'agent_path_unsupported'],
    [{http: '127.0.0.1:7801', env: {CUA_AGENT_ALLOWED_ORIGINS: 'https://a.example\u0007'}}, {}, 'agent_path_unsupported'],
    [{}, {}, 'agent_nothing_to_serve'],
    [{http: '127.0.0.1:7801'}, {enrol: false}, 'remote_not_enrolled'],
    [{http: '127.0.0.1:7801', env: {CUA_AGENT_MAX_SESSIONS: '0'}}, {}, 'invalid_setting'],
  ]) {
    const {systemctl, install, unit, home} = setup(t, setupOptions);
    await assert.rejects(install(options), {code}, JSON.stringify(options));
    assert.equal(existsSync(unit), false);
    assert.equal(existsSync(join(home, 'state')), false);
    assert.deepEqual(systemctl.calls, []);
  }
});

test('an unreachable user manager refuses install before the unit is written, and reads as unknown in status', async t => {
  const {install, unit, common} = setup(t, {unreachable: true});
  await assert.rejects(install({http: '127.0.0.1:7801'}), error => {
    assert.equal(error.code, 'agent_systemd_unreachable');
    assert.match(error.message, /No medium found/);
    assert.match(error.hint, /XDG_RUNTIME_DIR/);
    return true;
  });
  assert.equal(existsSync(unit), false);
  mkdirSync(join(unit, '..'), {recursive: true});
  writeFileSync(unit, '[Service]\nExecStart=/n /c agent run --relay\n');
  const status = await agentStatus(common);
  assert.deepEqual({installed: status.installed, loaded: status.loaded, running: status.running}, {installed: true, loaded: false, running: false});
  assert.match(status.systemdError, /No medium found/);
});

test('install on an installed unit rewrites it and restarts the agent with the new one', async t => {
  const {systemctl, install} = setup(t);
  await install({http: '127.0.0.1:7801'});
  await install({http: '127.0.0.1:7802'});
  assert.equal(systemctl.texts.length, 2);
  assert.deepEqual(readUnit(systemctl.texts[1]).args, ['--http', '127.0.0.1:7802']);
  assert.deepEqual(systemctl.calls.filter(c => c[0] === 'restart').length, 2);
});

test('a start the manager refuses is agent_start_failed with systemctl\'s words; the unit stays for status and doctor to show', async t => {
  const {install, unit, common} = setup(t, {startFails: true});
  await assert.rejects(install({http: '127.0.0.1:7801'}), error => {
    assert.equal(error.code, 'agent_start_failed');
    assert.match(error.message, /control process exited with error code/);
    return true;
  });
  assert.equal(existsSync(unit), true);
  const status = await agentStatus(common);
  assert.deepEqual({loaded: status.loaded, running: status.running, state: status.state, lastExitCode: status.lastExitCode}, {loaded: true, running: false, state: 'failed (dead)', lastExitCode: '1'});
});

test('status: not installed (the manager is not asked), running with pid and linger, stopped, damaged; installedJob never asks the manager', async t => {
  const {systemctl, loginctl, install, common, unit, userHome} = setup(t, {linger: 'yes'});
  assert.deepEqual(await agentStatus(common), {unit: AGENT_UNIT, path: unit, installed: false, loaded: false, running: false});
  assert.deepEqual(systemctl.calls, []);
  assert.deepEqual(loginctl.calls, []);
  await install({http: '127.0.0.1:7801'});
  let status = await agentStatus(common);
  assert.deepEqual({running: status.running, pid: status.pid, enabled: status.enabled, linger: status.linger, needsReload: status.needsReload}, {running: true, pid: 4343, enabled: true, linger: true, needsReload: false});
  assert.deepEqual(loginctl.calls.at(-1), ['show-user', 'me', '--property=Linger', '--value']);
  systemctl.active = false;
  status = await agentStatus(common);
  assert.deepEqual({loaded: status.loaded, running: status.running, pid: status.pid}, {loaded: true, running: false, pid: undefined});
  writeFileSync(unit, readFileSync(unit, 'utf8').replace('Restart=on-failure', 'Restart=always'));
  assert.equal((await agentStatus(common)).needsReload, true);
  const calls = systemctl.calls.length;
  writeFileSync(unit, '[Service]\nExecStart=/bin/true\n');
  assert.match(installedJob({userHome}).invalid, /not <node> <cua> agent run/);
  assert.equal(systemctl.calls.length, calls);
  rmSync(unit);
  mkdirSync(unit);
  assert.match((await agentStatus(common)).invalid, /could not be read \(EISDIR\)/);
});

test('linger reads unknown when logind has no record of the user', async t => {
  const {install, common} = setup(t, {linger: null});
  await install({http: '127.0.0.1:7801'});
  assert.equal((await agentStatus(common)).linger, null);
});

test('uninstall stops and disables the unit, removes it and reloads; with nothing installed it changes nothing and says so', async t => {
  const {systemctl, install, common, unit} = setup(t);
  assert.deepEqual(await uninstallAgent(common), {unit: AGENT_UNIT, path: unit, stopped: false, removed: false});
  assert.deepEqual(systemctl.calls.map(c => c[0]), ['show'], 'nothing to disable or reload');
  await install({http: '127.0.0.1:7801'});
  systemctl.calls.length = 0;
  assert.deepEqual(await uninstallAgent(common), {unit: AGENT_UNIT, path: unit, stopped: true, removed: true});
  assert.deepEqual(systemctl.calls.filter(c => c[0] !== 'show'), [['stop', AGENT_UNIT], ['disable', AGENT_UNIT], ['daemon-reload']]);
  assert.equal(existsSync(unit), false);
  assert.equal(systemctl.active, false);
  assert.equal(systemctl.loadedText, null);
  // A unit still loaded whose file someone deleted is stopped all the same.
  await install({http: '127.0.0.1:7801'});
  rmSync(unit);
  assert.deepEqual(await uninstallAgent(common), {unit: AGENT_UNIT, path: unit, stopped: true, removed: false});
  assert.equal(systemctl.active, false);
  // So is one whose file was deleted and the manager reloaded: not-found, but still running.
  await install({http: '127.0.0.1:7801'});
  rmSync(unit);
  await systemctl.run(['daemon-reload']);
  systemctl.calls.length = 0;
  assert.deepEqual(await uninstallAgent(common), {unit: AGENT_UNIT, path: unit, stopped: true, removed: false});
  assert.deepEqual(systemctl.calls.filter(c => c[0] !== 'show'), [['stop', AGENT_UNIT], ['daemon-reload']]);
  assert.equal(systemctl.active, false);
});

test('readUnit reads what cua writes and tolerates hand-added keys, but refuses what it cannot read as written', () => {
  const base = '[Unit]\nDescription=x\n[Service]\nExecStart="/n" "/c" "agent" "run" "--relay"\n';
  assert.deepEqual(readUnit(`${base}Nice=5\nX-Hand-Added=yes\nEnvironment=A=1 "B=two words"\nEnvironment=C=3\n[Install]\nWantedBy=default.target\n`).environment, {A: '1', B: 'two words', C: '3'});
  assert.deepEqual(readUnit('[Service]\nExecStart=/n /c agent run --http 127.0.0.1:7801\n').args, ['--http', '127.0.0.1:7801'], 'bare words');
  assert.deepEqual(readUnit(`${base}Environment=A=1\nEnvironment=\nEnvironment=B=2\n`).environment, {B: '2'}, 'an empty assignment resets the list, as systemd does');
  for (const [text, why] of [
    ['[Service]\nExecStart=/n /c agent run %h\n', /specifier %h/],
    ['[Service]\nExecStart=/n /c agent run $HOME\n', /environment variable/],
    ['[Service]\nExecStart=-/n /c agent run\n', /prefix/],
    [`${base}ExecStart=/n /c agent run\n`, /more than one ExecStart/],
    ['[Service]\nExecStart=/n /c agent serve\n', /not <node> <cua> agent run/],
    ['[Service]\nExecStart="/n /c agent run\n', /unclosed quote/],
    ['[Service]\nExecStart=/n /c agent run \\\n  --relay\n', /continues a line/],
    ['[Unit]\nDescription=no service\n', /no \[Service\] ExecStart/],
    ['[Service]\nnot a pair\n', /not key=value/],
  ]) assert.throws(() => readUnit(text), error => error.code === 'agent_unit_invalid' && why.test(error.message), String(why));
});
