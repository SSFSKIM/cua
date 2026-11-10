#!/usr/bin/env node
// T16's GDK probe: what a GTK 3 window that selects motion hints (as LibreOffice's gtk3 frame does) receives of a drag,
// on a private Xvfb of its own (never :0, no window manager). For each window configuration (hint-window.py: the hint
// mask on or off, the handler asking for the pointer after each motion or not), a fresh window takes two background
// drags from cua-engine (the window named), then one desktop-route (XTEST) drag, and the probe counts the events GTK
// handed the window in each. Prints one JSON line per drag.
// usage: node hint-probe.mjs <cua-engine> [extra engine flags...]
// HINT_ORDER (environment): the drags each fresh window takes, background or xtest, comma-separated (default
// background,background,xtest); HINT_CONFIGS: the window configurations, mask:rearm, comma-separated (default all three).
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [engineBin, ...engineFlags] = process.argv.slice(2);
const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function privateDisplay() {
  const xvfb = spawn('Xvfb', ['-displayfd', '3', '-noreset', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  const display = await new Promise((resolve, reject) => {
    xvfb.stdio[3].once('data', (d) => resolve(`:${String(d).trim()}`));
    xvfb.once('exit', () => reject(new Error('Xvfb exited')));
  });
  if (display === ':0') throw new Error('not a private display');
  return { xvfb, display };
}

function engineClient(env) {
  const child = spawn(engineBin, ['server', ...engineFlags], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map();
  let id = 0;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const r = JSON.parse(line);
    pending.get(r.id)?.(r);
    pending.delete(r.id);
  });
  return {
    request(command, input) {
      const n = ++id;
      child.stdin.write(`${JSON.stringify({ id: n, command, input })}\n`);
      return new Promise((resolve) => pending.set(n, resolve));
    },
    close: () => child.kill('SIGTERM'),
  };
}

const { xvfb, display } = await privateDisplay();
const env = { ...process.env, DISPLAY: display, XAUTHORITY: '/nonexistent', NO_AT_BRIDGE: '1' };
try {
  const configs = (process.env.HINT_CONFIGS ?? 'hint:rearm,hint:none,nohint:none').split(',').map((c) => c.split(':'));
  const order = (process.env.HINT_ORDER ?? 'background,background,xtest').split(',');
  for (const [mask, rearm] of configs) {
    const title = `cua171-hint-${mask}-${rearm}`;
    const app = spawn('python3', ['-I', join(here, 'hint-window.py'), title, mask, rearm], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    const lines = [];
    createInterface({ input: app.stdout }).on('line', (l) => lines.push(l));
    for (let i = 0; i < 100 && !lines.some((l) => l.startsWith('ready')); i++) await sleep(100);
    let id = '';
    for (let i = 0; i < 50 && !/^\d+$/.test(id); i++) {
      try {
        id = execFileSync('xdotool', ['search', '--name', `^${title}$`], { env, encoding: 'utf8' }).trim().split('\n')[0];
      } catch {
        await sleep(100);
      }
    }
    await sleep(500);
    const engine = engineClient(env);
    const path = [{ x: 40, y: 100 }, { x: 240, y: 100 }];
    // each drag the other way from the one before it
    const along = (k) => (k % 2 === 0 ? path : [...path].reverse());
    const kinds = {
      background: (k) => engine.request('drag', { window: { id: Number(id) }, path: along(k) }),
      xtest: (k) => {
        const geo = execFileSync('xdotool', ['getwindowgeometry', '--shell', id], { env, encoding: 'utf8' });
        const x = Number(geo.match(/X=(\d+)/)[1]);
        const y = Number(geo.match(/Y=(\d+)/)[1]);
        return engine.request('drag', { path: along(k).map((p) => ({ x: x + p.x, y: y + p.y })) });
      },
    };
    for (const [k, kind] of order.entries()) {
      const label = `${k + 1} ${kind}`;
      const send = () => kinds[kind](k);
      const from = lines.length;
      const answer = await send();
      await sleep(800);
      const got = lines.slice(from);
      const motions = got.filter((l) => l.startsWith('motion '));
      console.log(JSON.stringify({ window: title, drag: label, ok: answer.ok, error: answer.error, presses: got.filter((l) => l.startsWith('press')).length, releases: got.filter((l) => l.startsWith('release')).length, motions: motions.length, first: motions[0] ?? null, last: motions.at(-1) ?? null, enters: got.filter((l) => l.startsWith('enter')).length }));
    }
    engine.close();
    app.kill('SIGTERM');
    await sleep(300);
  }
} finally {
  xvfb.kill('SIGTERM');
}
