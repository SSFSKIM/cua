// A stopped differential run cleans up as a finished one does (#171, task 22): SIGINT or SIGTERM runs the harness's
// own cleanup before the process ends, so a run stopped by hand never strands its scene windows in the person's Chrome
// (task 21's stopped gate run left 20 of them, closed by title afterwards).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const STOP = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/stop.mjs')).href;

/**
 * A child process that hooks a cleanup taking `cleanupMs` (it writes `cleaned` to a file when done), prints `ready`
 * and waits; with `unhook`, it removes the hook first. Answers `{child, file, ready}`.
 */
function child({ cleanupMs = 200, unhook = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-stop-test-'));
  const file = join(dir, 'cleaned');
  const script = join(dir, 'child.mjs');
  writeFileSync(
    script,
    `import { writeFileSync } from 'node:fs';
import { cleanupOnStop } from ${JSON.stringify(STOP)};
const off = cleanupOnStop(async () => {
  await new Promise((r) => setTimeout(r, ${cleanupMs}));
  writeFileSync(${JSON.stringify(file)}, 'cleaned');
});
${unhook ? 'off();' : ''}
setInterval(() => {}, 1000);
process.stdout.write('ready\\n');
`,
  );
  const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  // a child that never got ready (its import failed) fails the test instead of hanging it
  const ready = Promise.race([new Promise((resolve) => proc.stdout.once('data', resolve)), exited.then((e) => assert.fail(`the child exited before it was ready: ${JSON.stringify(e)}`))]);
  return { proc, file, dir, ready, exited };
}

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

for (const [signal, code] of [
  ['SIGTERM', 143],
  ['SIGINT', 130],
]) {
  test(`${signal} runs the cleanup to its end, then the process exits ${code}`, async () => {
    const c = child();
    try {
      await c.ready;
      c.proc.kill(signal);
      assert.deepEqual(await c.exited, { code, signal: null });
      assert.equal(read(c.file), 'cleaned');
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  });
}

test('a second signal during the cleanup does not cut it short', async () => {
  const c = child({ cleanupMs: 400 });
  try {
    await c.ready;
    c.proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 100));
    c.proc.kill('SIGTERM');
    c.proc.kill('SIGINT');
    assert.deepEqual(await c.exited, { code: 143, signal: null });
    assert.equal(read(c.file), 'cleaned');
  } finally {
    rmSync(c.dir, { recursive: true, force: true });
  }
});

test('once unhooked (the run ended and cleaned up itself), a signal is handled as before', async () => {
  const c = child({ unhook: true });
  try {
    await c.ready;
    c.proc.kill('SIGTERM');
    assert.deepEqual(await c.exited, { code: null, signal: 'SIGTERM' });
    assert.equal(read(c.file), null);
  } finally {
    rmSync(c.dir, { recursive: true, force: true });
  }
});
