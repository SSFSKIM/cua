// The release proof's negative controls, live (M4's T4 fix round; the M2 lesson: a judge is trusted once a control
// built from the exact failure it exists to catch fails it in a live run). On a private Xvfb with its own Openbox and
// session bus, never the person's display, each lane holds Shift on a window, minimizes it, then releases in its own
// way, and is judged by the harness's own judges (minimized.mjs, audit.mjs):
// - background, on a managed `xprobe record` window: the real key_up; a no-op (no key_up at all); an extra press (a
//   synthetic `x` press and release sent to the window through the traced display, then the real key_up);
// - foreground, on an xterm in dedicated mode: the real key_up; a no-op; an extra press (an XTEST `x` press and
//   release through the traced display, then the real key_up).
// Run inside `dbus-run-session`, with $1 the cua engine and DISPLAY the private server. Prints one JSON line a lane.
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { auditHeldRelease, parseXtrace, startProxy } from '../../../../../../scripts/linux-engine-diff/audit.mjs';
import { Engine } from '../../../../../../scripts/linux-engine-diff/engine.mjs';
import { isMinimized, syntheticHold, syntheticRelease, windowState, xtestHold, xtestRelease } from '../../../../../../scripts/linux-engine-diff/minimized.mjs';
import { XPROBE } from '../../../../../../scripts/linux-engine-diff/scenes.mjs';

const ENGINE = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keysDown = () => JSON.parse(execFileSync(XPROBE, ['keys-down'], { encoding: 'utf8' }));

function recorder(title) {
  const child = spawn(XPROBE, ['record', '0', '0', '600', '400', 'managed', title], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = [];
  const waiters = [];
  createInterface({ input: child.stdout }).on('line', (l) => {
    lines.push(JSON.parse(l));
    for (const w of waiters.splice(0)) w();
  });
  const next = async (match) => {
    for (;;) {
      const i = lines.findIndex(match);
      if (i >= 0) return lines.splice(0, i + 1);
      await new Promise((r) => waiters.push(r));
    }
  };
  return {
    child,
    async mark(tag) {
      child.stdin.write(`mark ${tag}\n`);
      return (await next((m) => m.mark === tag)).filter((m) => m.type).map(({ time, ...e }) => e);
    },
  };
}

async function windowTitled(title) {
  for (let i = 0; i < 100; i++) {
    try {
      return Number(execFileSync('xdotool', ['search', '--name', `^${title}$`], { encoding: 'utf8' }).trim().split('\n')[0]);
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`${title} never appeared`);
}

async function lane({ route, how, window, rec }) {
  const proxy = await startProxy({ display: process.env.DISPLAY });
  const engine = new Engine({ label: 'cua', bin: ENGINE, args: route === 'foreground' ? ['--desktop', 'dedicated'] : [], env: proxy.env }).start();
  const facts = { route, how };
  if (rec) await rec.mark('before');
  const before = keysDown();
  await proxy.mark('hold:0');
  const down = await engine.request('key_down', { window: { id: window }, key: 'shift' });
  await proxy.mark('held:0');
  const holdEvents = rec ? await rec.mark('hold') : null;
  const held = keysDown();
  execFileSync(XPROBE, ['minimize', String(window)]);
  if (rec) await rec.mark('minimized');
  await proxy.mark('release:0');
  if (how === 'extra-press') {
    // the extra input goes through the traced display, as an engine's own would
    const args = route === 'background' ? ['key', '--window', String(window), 'x'] : ['key', 'x'];
    execFileSync('xdotool', args, { env: proxy.env });
  }
  const up = how === 'no-op' ? null : await engine.request('key_up', { window: { id: window }, key: 'shift' });
  await sleep(400);
  await proxy.mark('released:0');
  const releaseEvents = rec ? await rec.mark('release') : null;
  const after = keysDown();
  facts.answers = { key_down: down.response.ok, key_up: up ? up.response.ok : 'not sent' };
  facts.still_minimized = isMinimized(windowState(window));
  if (route === 'background') {
    const hold = syntheticHold(holdEvents);
    facts.hold = { held: hold.held, extra: hold.extra.length };
    facts.release = syntheticRelease(releaseEvents, hold.held);
  } else {
    facts.hold = { keys_before: before, keys_held: held };
    facts.release = xtestRelease(after, xtestHold(before, held));
  }
  // the engine's exit releases what a no-op left held; that is after the last mark, outside the judged spans
  await engine.close();
  await sleep(200);
  const audited = auditHeldRelease(parseXtrace(await proxy.stop()), window, { route, marks: proxy.marks });
  facts.audit = { clean: audited.clean, held: audited.samples, forbidden: [...new Set(audited.forbidden.map((f) => f.what))] };
  facts.verdict = facts.release.ok && audited.clean ? 'PASS' : 'FAIL';
  execFileSync(XPROBE, ['restore', String(window)]);
  await sleep(300);
  console.log(JSON.stringify(facts));
}

const rec = recorder('cua171-controls-recorder');
const recWindow = await windowTitled('cua171-controls-recorder');
const xterm = spawn('xterm', ['-T', 'cua171-controls-xterm', '-e', 'sleep', '600'], { stdio: 'ignore' });
const xtermWindow = await windowTitled('cua171-controls-xterm');
await sleep(500);
try {
  for (const how of ['real', 'no-op', 'extra-press']) await lane({ route: 'background', how, window: recWindow, rec });
  for (const how of ['real', 'no-op', 'extra-press']) await lane({ route: 'foreground', how, window: xtermWindow });
} finally {
  rec.child.stdin.end();
  xterm.kill();
}
