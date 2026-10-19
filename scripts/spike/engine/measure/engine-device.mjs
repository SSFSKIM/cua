#!/usr/bin/env node
// The device side of measure.mjs's engine steps (the own native engine spec, Interfaces: EngineProtocol's status,
// approve and shutdown; EngineInstall.approveEngine; "Install, signing and permissions", the approved engine). Run in the
// harness checkout on the Mac that holds the approved engine (over ssh, or on this Mac for `--device local`); every
// command prints one JSON line and exits 0, a usage error exits 2.
//
//   node scripts/spike/engine/measure/engine-device.mjs <command> [--engine <bundle>]
//     rpc <method> [<params JSON>]  one request on a fresh connection to engine.sock beside the bundle:
//                                   {ok: true, result} | {ok: false, error: {code, message, errorName, ...}} |
//                                   {ok: false, unreachable: <errno code>} when no engine listens
//     bundle                        {bundle, exists, engineVersion, build, identity}: the Info.plist's version and build
//                                   (assemble.mjs writes them), identity the SHA-1 of the leaf signing certificate (the
//                                   form `security find-identity` lists and `signingIdentity` names), or "adhoc"
//     approved                      {approved: approved.json beside the bundle, or null}
//     write-approved <JSON>         writes approved.json {build, identity, approvedAt} beside the bundle (0600, atomic)
//     launch [--plain]              `open -n -g -a <bundle>`; --plain is `open -a <bundle>` (probe (c)'s activation check)
//     checkout-build                {build, engineVersion}: this checkout's engine build (assemble.mjs engineBuild)
//     input-source <current|id>     the bundle's `--probe input-source` as a separate instance through
//                                   `open -n -g -W --stdout <file>`; the probe's JSON
//     copy <dir> / remove-copy <dir>  a copy of the bundle at <dir>/cua Engine.app (probe (c) and (f)); <dir> must be a
//                                   direct child of the approved engine directory's parent named engine-probe-*
//
// `--engine` defaults to the approved location, ~/Library/Application Support/cua/engine/cua Engine.app. Nothing here
// reads a window, a title or an accessibility value; the engine's own status and approve answers carry grants and pids.
import {createConnection} from 'node:net';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeFrame, FrameDecoder, socketPathFor} from '../client.mjs';
import {engineBuild, engineVersion} from '../assemble.mjs';

export const APPROVED_ENGINE = join(homedir(), 'Library', 'Application Support', 'cua', 'engine', 'cua Engine.app');
const RPC_TIMEOUT_MS = {approve: 120_000};
const DEFAULT_RPC_TIMEOUT_MS = 15_000;

// One JSON-RPC request on its own connection. -> {ok, result} | {ok: false, error} | {ok: false, unreachable}.
export function rpc(socket, method, params = {}, {timeoutMs = RPC_TIMEOUT_MS[method] ?? DEFAULT_RPC_TIMEOUT_MS} = {}) {
  return new Promise(resolve => {
    const decoder = new FrameDecoder();
    let settled = false, connected = false;
    const done = value => { if (settled) return; settled = true; clearTimeout(timer); connection.destroy(); resolve(value); };
    const timer = setTimeout(() => done({ok: false, error: {code: null, errorName: 'timeout', message: `no answer to ${method} within ${timeoutMs} ms`}}), timeoutMs);
    const connection = createConnection(socket);
    connection.on('connect', () => { connected = true; connection.write(encodeFrame({jsonrpc: '2.0', id: 1, method, params})); });
    connection.on('data', chunk => {
      let messages;
      try { messages = decoder.push(chunk); } catch (error) { return done({ok: false, error: {code: null, errorName: 'transport', message: error.message}}); }
      const answer = messages.find(m => m?.id === 1);
      if (!answer) return;
      done(answer.error ? {ok: false, error: answer.error} : {ok: true, result: answer.result});
    });
    connection.on('error', error => done(connected ? {ok: false, error: {code: null, errorName: 'transport', message: error.code ?? error.message}} : {ok: false, unreachable: error.code ?? 'error'}));
    connection.on('close', () => done(connected ? {ok: false, error: {code: null, errorName: 'transport', message: 'the engine closed the connection without answering'}} : {ok: false, unreachable: 'closed'}));
  });
}

const plist = (bundle, key) => {
  try { return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null; }
  catch { return null; }
};

// The leaf signing certificate's SHA-1, as `security find-identity` prints it; "adhoc" for an ad hoc signature; null
// when the bundle is unsigned or unreadable.
export function signingIdentity(bundle, {exec = execFileSync} = {}) {
  const scratch = fs.mkdtempSync(join(tmpdir(), 'cua-engine-identity-'));
  try {
    let details = '';
    try { details = exec('/usr/bin/codesign', ['-dvv', bundle], {encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe']}); }
    catch (error) { details = String(error.stderr ?? ''); }
    try { exec('/usr/bin/codesign', ['-d', `--extract-certificates=${join(scratch, 'cert')}`, bundle], {stdio: 'ignore'}); } catch {}
    const leaf = join(scratch, 'cert0');
    if (fs.existsSync(leaf)) return createHash('sha1').update(fs.readFileSync(leaf)).digest('hex').toUpperCase();
    return /Signature=adhoc/.test(details) ? 'adhoc' : null;
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

export function bundleFacts(bundle) {
  if (!fs.existsSync(join(bundle, 'Contents', 'Info.plist'))) return {bundle, exists: false};
  return {bundle: fs.realpathSync(bundle), exists: true, engineVersion: plist(bundle, 'CFBundleShortVersionString'), build: plist(bundle, 'CUAEngineBuild'), identity: signingIdentity(bundle)};
}

const approvedPath = bundle => join(dirname(bundle), 'approved.json');
export function readApproved(bundle) {
  try { return JSON.parse(fs.readFileSync(approvedPath(bundle), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function writeApproved(bundle, record) {
  const {build, identity, approvedAt} = record ?? {};
  if (![build, identity, approvedAt].every(v => typeof v === 'string' && v)) throw new Error('approved.json needs {build, identity, approvedAt}');
  const path = approvedPath(bundle), temporary = `${path}.${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify({build, identity, approvedAt}, null, 2) + '\n', {mode: 0o600});
  fs.renameSync(temporary, path);
  return {written: path};
}

// A probe copy lives beside the approved engine's directory, in a directory of its own named engine-probe-*, so its
// socket path stays short and removing it can never reach anything else.
export function probeCopyDir(bundle, dir) {
  const parent = dirname(dirname(bundle));
  if (dirname(dir) !== parent || !/^engine-probe-[A-Za-z0-9-]+$/.test(basename(dir))) throw new Error(`a probe copy lives at ${parent}/engine-probe-<name>`);
  return dir;
}

// The approved bundle's `--probe keystroke --user-pid <pid> --user-bounds <x,y,w,h> <text>` as its own instance, run
// to completion; -> the probe's JSON.
export function keystroke(bundle, pid, bounds, text, {exec = execFileSync} = {}) {
  if (!/^\d+$/.test(String(pid))) throw new Error('keystroke takes a pid number');
  if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d)?$/.test(bounds)) throw new Error('keystroke bounds are x,y,w,h');
  if (/[\n\0]/.test(text) || text.length > 200) throw new Error('keystroke text is one short line');
  const scratch = fs.mkdtempSync(join(tmpdir(), 'cua-engine-probe-'));
  try {
    const out = join(scratch, 'out.json'), err = join(scratch, 'err.txt');
    exec('/usr/bin/open', ['-n', '-g', '-W', '--stdout', out, '--stderr', err, '-a', bundle, '--args',
      '--probe', 'keystroke', '--user-pid', String(pid), '--user-bounds', bounds, text], {stdio: 'ignore', timeout: 60_000});
    return JSON.parse(fs.readFileSync(out, 'utf8').trim().split('\n').at(-1));
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

// The approved bundle's `--probe watch-activations` as its own resident instance: started without -W, its pid read from
// the first line it prints; the scratch directory is kept for `watch-stop <pid> <dir>`, which kills it and answers its
// printed lines.
export function watch(bundle, {exec = execFileSync, wait = ms => setTimeoutSync(ms)} = {}) {
  const scratch = join(tmpdir(), `cua-engine-watch-${Date.now()}`);
  fs.mkdirSync(scratch, {mode: 0o700});
  const out = join(scratch, 'out.json'), err = join(scratch, 'err.txt');
  exec('/usr/bin/open', ['-n', '-g', '--stdout', out, '--stderr', err, '-a', bundle, '--args', '--probe', 'watch-activations'], {stdio: 'ignore', timeout: 30_000});
  for (let i = 0; i < 50; i++) {
    if (fs.existsSync(out)) {
      const first = fs.readFileSync(out, 'utf8').trim().split('\n')[0];
      const parsed = first ? JSON.parse(first) : null;
      if (parsed?.pid) return {pid: parsed.pid, out, dir: scratch};
    }
    wait(100);
  }
  fs.rmSync(scratch, {recursive: true, force: true});
  throw new Error('the watch-activations probe did not print its pid');
}

export function watchStop(pid, dir, {kill = process.kill} = {}) {
  if (!/^\d+$/.test(String(pid)) || !/^\//.test(dir) || dirname(dir) !== tmpdir()) throw new Error("watch-stop takes the watch's pid and its directory");
  try { kill(Number(pid), 'SIGTERM'); } catch {}
  for (let i = 0; i < 20; i++) { try { process.kill(Number(pid), 0); setTimeoutSync(100); } catch { break; } }
  const lines = fs.existsSync(join(dir, 'out.json'))
    ? fs.readFileSync(join(dir, 'out.json'), 'utf8').split('\n').filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
    : [];
  fs.rmSync(dir, {recursive: true, force: true});
  return {stopped: true, lines};
}

function setTimeoutSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// The approved bundle's `--probe input-source <arg>` as its own instance; -> the probe's JSON.
export function inputSource(bundle, arg, {exec = execFileSync} = {}) {
  if (!/^(current|[A-Za-z0-9._-]+)$/.test(arg)) throw new Error('input-source takes current or an input source id');
  const scratch = fs.mkdtempSync(join(tmpdir(), 'cua-engine-probe-'));
  try {
    const out = join(scratch, 'out.json'), err = join(scratch, 'err.txt');
    exec('/usr/bin/open', ['-n', '-g', '-W', '--stdout', out, '--stderr', err, '-a', bundle, '--args', '--probe', 'input-source', arg], {stdio: 'ignore', timeout: 60_000});
    const line = fs.readFileSync(out, 'utf8').trim().split('\n').at(-1);
    return JSON.parse(line);
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

export async function main(argv) {
  const args = [...argv];
  let engine = APPROVED_ENGINE;
  const at = args.indexOf('--engine');
  if (at !== -1) { engine = args[at + 1]; args.splice(at, 2); }
  if (!engine?.startsWith('/')) throw new Error('--engine needs the absolute path of the bundle');
  const [command, ...rest] = args;
  switch (command) {
    case 'rpc': {
      const [method, params] = rest;
      if (!['ping', 'status', 'approve', 'shutdown', 'probe_tap'].includes(method)) throw new Error('rpc takes ping, status, approve, shutdown or probe_tap');
      return rpc(socketPathFor(engine), method, params ? JSON.parse(params) : (method === 'ping' ? {clientApiVersion: 'cua-engine-1'} : {}));
    }
    case 'bundle': return bundleFacts(engine);
    case 'approved': return {approved: readApproved(engine)};
    case 'write-approved': return writeApproved(engine, JSON.parse(rest[0] ?? 'null'));
    case 'launch':
      execFileSync('/usr/bin/open', rest[0] === '--plain' ? ['-a', engine] : ['-n', '-g', '-a', engine], {stdio: 'ignore', timeout: 30_000});
      return {launched: true, plain: rest[0] === '--plain'};
    case 'checkout-build': return {build: engineBuild(), engineVersion: engineVersion()};
    case 'input-source': return inputSource(engine, rest[0] ?? 'current');
    case 'keystroke': return keystroke(engine, rest[0], rest[1], rest[2]);
    case 'watch': return watch(engine);
    case 'watch-stop': return watchStop(rest[0], rest[1]);
    case 'copy': {
      const dir = probeCopyDir(engine, rest[0]);
      fs.mkdirSync(dir, {mode: 0o700});
      execFileSync('/usr/bin/ditto', [engine, join(dir, 'cua Engine.app')], {stdio: 'ignore'});
      return {copy: join(dir, 'cua Engine.app')};
    }
    case 'remove-copy': {
      const dir = probeCopyDir(engine, rest[0]);
      fs.rmSync(dir, {recursive: true, force: true});
      return {removed: dir};
    }
    default: throw Object.assign(new Error('usage: engine-device.mjs rpc <method> [params] | bundle | approved | write-approved <json> | launch [--plain] | checkout-build | input-source <current|id> | keystroke <pid> <x,y,w,h> <text> | watch | watch-stop <pid> <dir> | copy <dir> | remove-copy <dir> [--engine <bundle>]'), {usage: true});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    out => process.stdout.write(JSON.stringify(out) + '\n'),
    error => { process.stdout.write(JSON.stringify({ok: false, error: {errorName: 'device', message: error.message}}) + '\n'); process.exitCode = error.usage ? 2 : 0; });
}
