#!/usr/bin/env node
// Probe (task 61 fix, ruling B): inside the trusted worker's sandbox, as cua runs it (codex-linux-sandbox, the worker
// role's profile, scoped and default), can a process read /proc/<pid>/maps of a process outside the sandbox, by the pid
// the X server and _NET_WM_PID report? Prints, per mode, the sandbox's pid namespace against the host's and whether the
// outside pid's maps is readable. Reads only whether a line names libc; prints no map content.
// usage: node sandbox-proc.mjs <checkout> <CUA_HOME>
import {spawn, spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {join} from 'node:path';

const [checkout, home] = process.argv.slice(2);
const {roleProfile, sandboxState} = await (async () => {
  const policy = await import(join(checkout, 'src/sandbox/policy.mjs'));
  const sandbox = await import(join(checkout, 'src/runtime/sandbox.mjs'));
  return {roleProfile: policy.roleProfile, sandboxState: sandbox.sandboxState};
})();
const {linuxCommand} = await import(join(checkout, 'src/sandbox/linux.mjs'));
const helper = join(home, 'sandbox', 'rust-v0.163.0', 'codex-linux-sandbox');
const outside = spawn('sleep', ['60']);
const scratch = fs.mkdtempSync('/tmp/cua171-proc-');
const cwd = join(scratch, 'run');
fs.mkdirSync(cwd);
const check = `echo "ns $(readlink /proc/self/ns/pid)"; echo "pids $(ls -d /proc/[0-9]* | wc -l)"; ` +
  `if grep -q libc /proc/${outside.pid}/maps 2>/dev/null; then echo "outside maps readable"; else echo "outside maps unreadable"; fi; ` +
  `echo "outside comm $(cat /proc/${outside.pid}/comm 2>/dev/null || echo none)"`;
console.log(`host ns ${fs.readlinkSync('/proc/self/ns/pid')}, outside pid ${outside.pid}`);
for (const mode of ['scoped', 'default']) {
  const state = mode === 'scoped' ? sandboxState('scoped', cwd) : undefined;
  const {profile} = roleProfile({state, role: 'worker', readPaths: [], denyRead: [], network: 'restricted'});
  const {file, args} = linuxCommand({profile, cwd, command: ['/bin/sh', '-c', check], helper: {path: helper}});
  const run = spawnSync(file, args, {cwd, env: {PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: scratch}, encoding: 'utf8', timeout: 30000});
  console.log(`${mode}: exit ${run.status}\n${run.stdout.trim()}${run.stderr.trim() ? `\nstderr: ${run.stderr.trim().slice(-300)}` : ''}`);
}
outside.kill();
fs.rmSync(scratch, {recursive: true, force: true});
