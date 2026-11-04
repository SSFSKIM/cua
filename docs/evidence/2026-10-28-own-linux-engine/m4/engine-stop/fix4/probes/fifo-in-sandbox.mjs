// Probe (fix 4): can a process inside the trusted worker's sandbox (codex-linux-sandbox, role worker) open for writing a
// FIFO that a process outside made under the session's TMPDIR, and write to it; under the default state (nothing
// writable) and a scoped one. usage: node fifo-in-sandbox.mjs <worktree> <helper>
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync, openSync, readSync, closeSync, constants, rmSync, mkdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const [wt, helperPath] = process.argv.slice(2);
const {sandboxedLaunch} = await import(`${wt}/src/sandbox/index.mjs`);
const sha256 = createHash('sha256').update(readFileSync(helperPath)).digest('hex');
const run = mkdtempSync('<probes>/run-');
const tmp = join(run, 'tmp');
mkdirSync(tmp, {mode: 0o700});
const dir = mkdtempSync(join(tmp, 'cua-held-'));
const fifo = join(dir, 'held');
execFileSync('mkfifo', ['-m', '600', fifo]);
const reader = openSync(fifo, constants.O_RDONLY | constants.O_NONBLOCK);
const states = {
  default: undefined,
  scoped: {sandboxCwd: pathToFileURL(run).href, permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries: [
    {path: {type: 'special', value: {kind: 'root'}}, access: 'read'}, {path: {type: 'special', value: {kind: 'tmpdir'}}, access: 'write'}]}}},
};
for (const [name, state] of Object.entries(states)) {
  const script = `printf ${name}-ok > "$FIFO" && echo wrote; touch "$TMPDIR/x-${name}" 2>&1 && echo touched || echo no-touch; ls -l "$FIFO"`;
  const launch = sandboxedLaunch({platform: 'linux', state, role: 'worker', command: ['/bin/sh', '-c', script],
    env: {PATH: '/usr/bin:/bin', TMPDIR: tmp, FIFO: fifo, HOME: process.env.HOME}, cwd: run, readPaths: [], denyRead: null, helper: {path: helperPath, sha256}});
  const r = spawnSync(launch.command, launch.args, {env: launch.env, cwd: launch.cwd, encoding: 'utf8', timeout: 20000});
  const buf = Buffer.alloc(64);
  let n;
  try { n = readSync(reader, buf); } catch (e) { n = e.code; }
  console.log(name, 'status', r.status, 'stdout', JSON.stringify(r.stdout), 'stderr', JSON.stringify((r.stderr ?? '').slice(-300)),
    'read', typeof n === 'number' ? JSON.stringify(buf.subarray(0, n).toString()) : n);
}
closeSync(reader);
rmSync(run, {recursive: true, force: true});
