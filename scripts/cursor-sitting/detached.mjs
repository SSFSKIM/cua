// A subprocess in its own process group, for what the isolating slot's cleanup runs (#187; the re-review of 5e5999cb):
// a terminal's Ctrl-C signals the whole foreground group, so a helper run with execFileSync in the kit's own group dies
// with it even while the kit ignores the signal, and the restore it served refuses. spawnSync and execFileSync have no
// detached option; this is spawn, detached, awaited, its output captured, with a timeout that kills its whole group.
import {spawn} from 'node:child_process';

// -> {code, signal, stdout, stderr, timedOut, error?}.
export function runDetached(file, args, {env = process.env, cwd, timeout = 60_000} = {}) {
  return new Promise(resolve => {
    let child;
    try { child = spawn(file, args, {env, cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe']}); } catch (error) { resolve({code: null, signal: null, stdout: '', stderr: '', timedOut: false, error}); return; }
    let stdout = '', stderr = '', timedOut = false, settled = false;
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeout);
    const done = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    child.on('error', error => done({code: null, signal: null, stdout, stderr, timedOut, error}));
    child.on('close', (code, signal) => done({code, signal, stdout, stderr, timedOut}));
  });
}

// One entry copied as engine-copy copies it (ditto on macOS, else cp -a), in its own group. Throws on failure.
export async function copyDetached(from, to) {
  const ditto = process.platform === 'darwin';
  const r = await runDetached(ditto ? '/usr/bin/ditto' : 'cp', ditto ? [from, to] : ['-a', from, to], {timeout: 120_000});
  if (r.code !== 0) throw new Error(`${ditto ? 'ditto' : 'cp -a'} ${from} failed (${r.timedOut ? 'timed out' : r.signal ?? `exit ${r.code}`}): ${String(r.stderr || r.error?.message || '').trim().split('\n').at(-1)}`);
}
