#!/usr/bin/env node
// A facade suite on a private desktop, never the person's `:0` (#171 M4, T18). Through the harness's own tools
// (scripts/linux-engine-diff): its private X server (`startPrivateServer`: Xvfb -displayfd, 1280x800, watched, marked
// CUA171_PRIVATE_DISPLAY), then
//   --session  a session of the run's on it (`startPrivateSession`: a dbus-daemon that can start only the
//              accessibility bus launcher, the launcher wired to the display's AT_SPI_BUS, accessibility switched on,
//              the daemon under a home of the run's with its settings in memory), for the suites that take the X session
//              they find (repl-parity's and the native baseline's device side read openbox's environment) or run with
//              their caller's (the acceptance fixtures);
//   (bare)     no session, for the two-services instrument, whose own Desktop starts the run's session on a private
//              display;
// and Openbox on it. Openbox's environment, which is what the device side discovers, holds the private DISPLAY, an
// XAUTHORITY that does not exist (the server keeps no authority), the private bus (--session) and the unchanged
// XDG_RUNTIME_DIR and XDG_DATA_DIRS. The suite command runs with that environment and CUA_PARITY_DISPLAY naming the
// display; then everything is ended in reverse order and the server's watchdog gives its verdict. session.json records
// the display, the processes and the verdict.
// This process is no declared live run: it reaches only the display it started (xspawn.mjs).
// usage: node private-desktop.mjs --harness <checkout> --out <dir> [--session] -- <command> [args...]
//   exit: the command's status; 1 when the command passed but the watchdog was not clean; 2 on a setup failure
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';

const split = process.argv.indexOf('--');
if (split < 0 || split === process.argv.length - 1) {
  console.error('usage: private-desktop.mjs --harness <checkout> --out <dir> [--session] -- <command> [args...]');
  process.exit(2);
}
const {values} = parseArgs({args: process.argv.slice(2, split), options: {harness: {type: 'string'}, out: {type: 'string'}, session: {type: 'boolean', default: false}}});
const [command, ...args] = process.argv.slice(split + 1);
const harness = resolve(values.harness), out = resolve(values.out);
fs.mkdirSync(out, {recursive: true});
// a name no X library parses as a display, so nothing of this process reaches `:0` by mistake before the server is up
process.env.DISPLAY = ':cua171-facade-private-desktop';
const lib = file => import(join(harness, 'scripts/linux-engine-diff', file));
const {startPrivateServer} = await lib('xtools.mjs');
const {xSpawn, xExecFileSync, NO_AUTHORITY} = await lib('xspawn.mjs');
const {startPrivateSession} = await lib('session-bus.mjs');
const {launchEnvironment, runHome} = await lib('app-env.mjs');
const {discoverDesktopEnvironment} = await import(join(harness, 'scripts/repl-parity/desktop.mjs'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const record = {mode: values.session ? 'session' : 'bare', harness, command: [command, ...args], started: new Date().toISOString()};
const save = () => fs.writeFileSync(join(out, 'session.json'), JSON.stringify(record, null, 2) + '\n');

const ended = [];
let server = null, session = null, wm = null, status = 2;
try {
  server = await startPrivateServer({out});
  if (server.display === ':0') throw new Error('not a private display');
  Object.assign(record, {display: server.display, server: server.pid});
  // the person's session's XDG_DATA_DIRS when this environment has none (the variable alone, read as the harness reads it)
  const dataDirs = process.env.XDG_DATA_DIRS ?? discoverDesktopEnvironment(fs, {display: ':0'}).XDG_DATA_DIRS;
  const env = {...process.env, DISPLAY: server.display, XAUTHORITY: NO_AUTHORITY, ...(dataDirs ? {XDG_DATA_DIRS: dataDirs} : {})};
  for (const name of ['DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'AT_SPI_BUS_ADDRESS']) delete env[name];
  if (values.session) {
    const scratch = join(out, 'session-scratch');
    for (const dir of Object.values(runHome(scratch))) fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    fs.mkdirSync(join(scratch, 'tmp'), {recursive: true, mode: 0o700});
    session = await startPrivateSession({dir: join(out, 'session'), display: server.display,
      env: launchEnvironment({scratch, base: {...process.env, DISPLAY: server.display}, privateDisplay: true, settings: 'memory', sessionBus: false, app: "the run's session bus"})});
    env.DBUS_SESSION_BUS_ADDRESS = session.address;
    Object.assign(record, {bus: session.address, busPid: session.pid, a11y: session.a11y ?? null});
  }
  wm = xSpawn('openbox', [], {env, stdio: 'ignore'});
  let check = '';
  for (let i = 0; i < 50 && !/window id/.test(check); i++) {
    try { check = xExecFileSync('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], {env, encoding: 'utf8', timeout: 5000}); } catch { check = ''; }
    if (!/window id/.test(check)) await sleep(100);
  }
  if (!/window id/.test(check)) throw new Error('openbox did not take the private display');
  Object.assign(record, {openbox: wm.pid, environment: Object.fromEntries(['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'].map(k => [k, env[k] ?? null]))});
  save();
  // the suite in a process group of its own, so a stop reaches all of it (a shell's children too), and the desktop is
  // taken down only once the suite has exited
  const child = spawn(command, args, {env: {...env, CUA_PARITY_DISPLAY: server.display}, stdio: 'inherit', detached: true});
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { try { process.kill(-child.pid, signal); } catch { /* gone */ } });
  const result = await new Promise(done => child.once('exit', (code, signal) => done({code, signal})));
  record.result = result;
  status = result.code ?? 1;
} catch (error) {
  record.setupError = error.message;
  console.error(`private-desktop: ${error.message}`);
} finally {
  if (wm) { wm.kill('SIGTERM'); await sleep(300); ended.push({what: 'openbox', pid: wm.pid}); }
  if (session) record.busStop = await session.stop();
  if (server) {
    const verdict = await server.stop();
    record.watchdog = {clean: verdict.clean, reason: verdict.reason ?? null};
    if (!verdict.clean && status === 0) status = 1;
  }
  record.finished = new Date().toISOString();
  record.ended = ended;
  save();
}
console.error(`private-desktop: ${record.display ?? '(no display)'} ${record.mode}; command exit ${record.result?.code ?? record.result?.signal ?? 'none'}; watchdog ${record.watchdog ? (record.watchdog.clean ? 'clean' : record.watchdog.reason) : 'none'}`);
process.exit(status);
