// A stopped run's cleanup and the windows it is still opening (#171, task 22 review): a SIGTERM while a Chrome window
// is being discovered waits for that open, so the window that comes up meanwhile is closed too, and a stopping run asks
// for no new window. Display-free: the reader, the window search and the close are the test's own, and `google-chrome`
// on the PATH is a script that only says it was asked.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

const SCENES = pathToFileURL(join(import.meta.dirname, '../../scripts/linux-engine-diff/scenes.mjs')).href;

/** A directory with a fake `google-chrome` that touches `asked` and exits. */
function fakeChrome() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-stop-scenes-'));
  const asked = join(dir, 'asked');
  const bin = join(dir, 'bin');
  writeFileSync(join(dir, 'google-chrome'), `#!/bin/sh\ntouch ${JSON.stringify(asked)}\n`);
  chmodSync(join(dir, 'google-chrome'), 0o755);
  return { dir, asked, bin, env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` } };
}

/** A reader that lists the window titled `title` (id 123) from `delay` ms after `asked` exists. */
const readerSource = (asked, title, delay) => `{
  seen: null,
  async request(command) {
    if (command !== 'list_windows') return { response: { ok: false, error: 'not in this test' } };
    if (this.seen === null && existsSync(${JSON.stringify(asked)})) this.seen = Date.now();
    const up = this.seen !== null && Date.now() - this.seen >= ${delay};
    return { response: { ok: true, output: up ? [{ id: 123, title: ${JSON.stringify(title)}, app: 'Google-chrome' }] : [] } };
  },
  async close() {},
}`;

test('a SIGTERM while a Chrome window is being discovered waits for it, closes the window that came up, and exits 143', async () => {
  const chrome = fakeChrome();
  const log = join(chrome.dir, 'log');
  writeFileSync(log, '');
  const title = 'cua171-diff-stoptest-n0-scene-r - Google Chrome';
  const script = join(chrome.dir, 'child.mjs');
  writeFileSync(
    script,
    `import { appendFileSync, existsSync } from 'node:fs';
import { Desktop } from ${JSON.stringify(SCENES)};
const reader = ${readerSource(chrome.asked, title, 300)};
const desktop = new Desktop({ cua: 'unused', run: 'stoptest', reader, startActive: 0, nonce: 'n0' });
// the run's own session bus, as its start gives it (a test's, never started)
desktop.session = { address: 'unix:path=/nonexistent/cua171-test-run-bus', stop: async () => ({}) };
// nothing listed by its title yet when the signal comes: only the discovery can find it
desktop.findByTitle = () => [];
// the window that came up is still the run's when it is closed
desktop.windowTitle = () => ${JSON.stringify(title)};
desktop.closeWindow = (id) => appendFileSync(${JSON.stringify(log)}, 'close ' + id + '\\n');
desktop.openChrome('r', 'scene.html').catch((e) => appendFileSync(${JSON.stringify(log)}, 'open failed ' + e.message + '\\n'));
const asked = setInterval(() => {
  if (existsSync(${JSON.stringify(chrome.asked)})) {
    clearInterval(asked);
    process.stdout.write('asked\\n');
  }
}, 5);
setInterval(() => {}, 1000);
`,
  );
  const proc = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'], env: chrome.env });
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    await Promise.race([new Promise((resolve) => proc.stdout.once('data', resolve)), exited.then((e) => assert.fail(`exited before Chrome was asked: ${JSON.stringify(e)}`))]);
    // Chrome asked, its window not up yet (it comes 300 ms after)
    proc.kill('SIGTERM');
    assert.deepEqual(await exited, { code: 143, signal: null });
    assert.equal(readFileSync(log, 'utf8'), 'close 123\n');
  } finally {
    proc.kill('SIGKILL');
    rmSync(chrome.dir, { recursive: true, force: true });
  }
});

test('a stopping run asks for no new window', async () => {
  const chrome = fakeChrome();
  const saved = process.env.PATH;
  process.env.PATH = chrome.env.PATH;
  const desktop = new Desktop({ cua: 'unused', run: 'stoptest2', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  try {
    desktop.stopping = true;
    assert.throws(() => desktop.openChrome('r', 'scene.html'), /the harness is stopping/);
    assert.throws(() => desktop.openGedit('r', 'text'), /the harness is stopping/);
    assert.throws(() => desktop.openFront('visible'), /the harness is stopping/);
    assert.equal(existsSync(chrome.asked), false, 'Chrome was never asked');
    assert.deepEqual(desktop.windows, []);
  } finally {
    process.env.PATH = saved;
    desktop.unhookStop();
    await desktop.closeAll();
    rmSync(chrome.dir, { recursive: true, force: true });
  }
});

test('a Chrome window whose discovery failed is closed by its title', async () => {
  const chrome = fakeChrome();
  const saved = process.env.PATH;
  process.env.PATH = chrome.env.PATH;
  const closed = [];
  const desktop = new Desktop({ cua: 'unused', run: 'stoptest3', nonce: 'n0', reader: { request: async () => ({ response: { ok: false, error: 'reader gone' } }), close: async () => {} }, startActive: 0 });
  desktop.findByTitle = (title) => (title === 'cua171-diff-stoptest3-n0-scene-r - Google Chrome' ? [77] : []);
  desktop.session = { address: 'unix:path=/nonexistent/cua171-test-run-bus', stop: async () => ({}) };
  desktop.closeWindow = (id) => closed.push(id);
  try {
    await assert.rejects(desktop.openChrome('r', 'scene.html'), /list_windows failed: reader gone/);
    assert.deepEqual(closed, [77]);
    assert.deepEqual(desktop.windows, [], 'no longer registered');
  } finally {
    process.env.PATH = saved;
    desktop.unhookStop();
    await desktop.closeAll();
    rmSync(chrome.dir, { recursive: true, force: true });
  }
});
