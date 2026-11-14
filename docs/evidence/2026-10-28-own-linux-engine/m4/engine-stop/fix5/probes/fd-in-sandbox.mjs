// Probe (fix 5): does a descriptor the trusted worker's launcher inherits survive the pinned codex-linux-sandbox and
// bwrap into the worker, in the default state and in a scoped one; and once a Node worker has reopened it close-on-exec,
// is it absent from what that worker spawns but present where the worker passes it (stdio)?
// usage: node fd-in-sandbox.mjs <worktree> <helper> <probes dir>
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const [wt, helperPath, probes] = process.argv.slice(2);
const {sandboxedLaunch} = await import(`${wt}/src/sandbox/index.mjs`);
const sha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const run = mkdtempSync(join(probes, 'run-'));
const tmp = join(run, 'tmp');
mkdirSync(tmp, {mode: 0o700});
const states = {
  default: undefined,
  scoped: {sandboxCwd: pathToFileURL(run).href, permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [
    {path: {type: 'special', value: {kind: 'root'}}, access: 'read'}, {path: {type: 'special', value: {kind: 'tmpdir'}}, access: 'write'}]}}},
};
// the worker's part: what it inherited at 3, then reopened close-on-exec through /proc and the original closed; a child
// spawned plainly (does it see the record?) and one given it in its stdio at 3 (it writes there)
const worker = `
const fs = require('node:fs'); const {spawnSync} = require('node:child_process');
const fds = () => fs.readdirSync('/proc/self/fd').map(n => { try { return n + '->' + fs.readlinkSync('/proc/self/fd/' + n); } catch { return n; } }).join(' ');
let out = 3; const say = (...a) => fs.writeSync(out, a.join(' ') + '\\n');
say('worker inherited:', fds());
const kept = fs.openSync('/proc/self/fd/3', fs.constants.O_WRONLY);
fs.closeSync(3); out = kept;
say('worker reopened at', kept, ':', fds());
const plain = spawnSync('/bin/sh', ['-c', 'for f in /proc/$$/fd/*; do printf "%s->%s " "\${f##*/}" "$(readlink $f)"; done'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
say('plain child fds:', plain.stdout, plain.error ?? '');
const given = spawnSync('/bin/sh', ['-c', 'printf from-engine > /proc/self/fd/3 && echo engine-wrote; printf via-3 >&3 && echo engine-wrote-3'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe', kept]});
say('given child:', JSON.stringify(given.stdout), JSON.stringify(given.stderr));
`;
for (const [name, state] of Object.entries(states)) {
  const launch = sandboxedLaunch({platform: 'linux', state, role: 'worker', command: [process.execPath, '-e', worker],
    env: {PATH: '/usr/bin:/bin', TMPDIR: tmp, HOME: process.env.HOME}, cwd: run, readPaths: [], denyRead: null, helper: {path: helperPath, sha256}});
  // an anonymous pipe at 3, as the shim makes one (a shell pipeline; Node's own 'pipe' is a socket pair)
  const rec = join(probes, `record-${name}.txt`);
  const child = spawn('/bin/bash', ['-c', '"$@" 3>&1 1>&2 | cat > "$REC"', 'bash', launch.command, ...launch.args],
    {env: {...launch.env, REC: rec}, cwd: launch.cwd, stdio: ['ignore', 'pipe', 'pipe']});
  let out = "", err = "";
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  const status = await new Promise(resolve => child.on('close', (code, signal) => resolve(code ?? signal)));
  await new Promise(resolve => setTimeout(resolve, 300));
  const record = readFileSync(rec, 'utf8');
  rmSync(rec);
  console.log(`== ${name}: status ${status}`);
  console.log(out.trim());
  if (err.trim()) console.log('stderr:', err.trim().slice(-400));
  console.log(`read outside:\n${record}`);
}
rmSync(run, {recursive: true, force: true});
