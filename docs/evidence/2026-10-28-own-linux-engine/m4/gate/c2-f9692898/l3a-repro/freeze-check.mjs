#!/usr/bin/env node
// Task 77, L3a's second bounded check (a development run, not counted; the controller's approval and ruling 684,
// 2026-11-14): the stuck state forced instead of hunted. On a private display of its own, idle, the run's own Chrome on
// esc-page.html (the harness's matrix.html plus counters of the Escape keydowns and contextmenu events the page gets), the
// window covered by a front window, candidate 2's engine over the wire. A dbus-monitor on the run's accessibility bus
// sees the engine's second DoAction of a clipboard_read (the menu's Copy item); on its method return, the run's own
// Chrome browser process (the scene window's _NET_WM_PID, checked to run on the run's user-data-dir, never another) is
// stopped (SIGSTOP) for STOP_MS, longer than COPY_WAIT, and continued, under a guard that continues it on any exit.
// Then: fidelity (a later Copy refused "context menu did not open" with no menu node, as in L3a and r2), with an AT-SPI
// probe of Chrome's whole subtree and an X probe (xprobe popups: Chrome's viewable override-redirect windows; xprobe
// grabs: whether a grab is held); then, only if the forced state matches, the recoveries from safest: a gated Escape
// (only with a menu shown in AT-SPI or mapped in X), a synthetic focus cycle (press_key shift), a real activation cycle,
// and a plain Escape as a diagnostic, each followed by a read, the page's counters and the clipboard. No engine change.
// usage: node freeze-check.mjs <harness checkout> <candidate> <out directory>
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createInterface } from 'node:readline';

const [H, CANDIDATE, OUT] = process.argv.slice(2);
const STOP_MS = 2600;
const OWNER_PID = 2546101; // the person's Chrome: never signalled
mkdirSync(OUT, { recursive: true });
const lib = (m) => import(join(H, 'scripts/linux-engine-diff', m));
const { startPrivateServer, XPROBE, xdotool } = await lib('xtools.mjs');
const { Desktop, a11yBusAddress } = await lib('scenes.mjs');
const { Oracle } = await lib('oracle.mjs');
const { FAMILIES, openFamily, windowPid } = await lib('families.mjs');
const { verifiedScene } = await lib('app-identity.mjs');
const { Engine, runTmpdirInProcess } = await lib('engine.mjs');
const { LIVE_RUN, assertReachable } = await lib('xspawn.mjs');
const { startOwner } = await lib('clip.mjs');
const { preorder } = await lib('normalize.mjs');
const { connectBus } = await lib('bus-client.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = join(OUT, 'freeze-check.jsonl');
const log = (o) => {
  const line = JSON.stringify({ wall: Date.now(), ...o });
  appendFileSync(LOG, line + '\n');
  console.log(line.slice(0, 500));
};
const WORD = 'cua171';
const SEED = `${WORD} settle field`;

// the stopped browser is always continued: on a normal end, an error, a signal, or the process's exit
let stopped = null;
const resume = () => {
  if (stopped) {
    try {
      process.kill(stopped, 'SIGCONT');
    } catch {
      // gone
    }
    stopped = null;
  }
};
process.on('exit', resume);
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, () => { resume(); process.exit(130); });
const hardStop = setTimeout(() => { log({ timeout: 'the check ran past 12 min' }); resume(); process.exit(3); }, 12 * 60 * 1000);

delete process.env[LIVE_RUN];
assertReachable('the freeze check', [], { DISPLAY: ':cua171-freeze-check' });
process.env.DISPLAY = ':cua171-freeze-check';
const server = await startPrivateServer({ out: OUT });
assertReachable('the freeze check', [], { DISPLAY: server.display });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: CANDIDATE, run: 't77-freeze-check', logs: OUT });
let wm = null;
let engine = null;
let bus = null;
let monitor = null;
let restoreTmpdir = () => {};
const A = 'org.a11y.atspi.Accessible';
const MENU_ROLES = new Set(['menu', 'popup menu', 'menu item', 'menu bar', 'check menu item', 'radio menu item']);
try {
  await desktop.begin({ startRecord: async () => null });
  restoreTmpdir = runTmpdirInProcess();
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const PAGE = relative(join(H, 'scripts/linux-engine-diff/pages'), join(import.meta.dirname, 'esc-page.html'));
  const sc = await openFamily(desktop, oracle, 'chrome', 'settle-chrome-text', { geometry: FAMILIES.chrome.geometry, page: PAGE });
  await verifiedScene(desktop, oracle, sc, 'chrome');
  const state = await desktop.state(sc);
  sc.field ??= preorder(state.ax_tree).find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
  if (!sc.field) throw new Error('no field');
  // the run's own Chrome browser process: the scene window's pid, on the run's own user-data-dir
  const pid = windowPid(sc.id);
  const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
  const at = cmdline.findIndex((a) => a.startsWith('--user-data-dir'));
  const dataDir = at < 0 ? null : cmdline[at].includes('=') ? cmdline[at].split('=').slice(1).join('=') : cmdline[at + 1];
  // and a descendant of this process: its parent chain reaches this check's pid
  const parent = (p) => Number(readFileSync(`/proc/${p}/stat`, 'utf8').split(') ')[1].split(' ')[1]);
  let up = pid;
  for (let i = 0; i < 20 && up > 1 && up !== process.pid; i++) up = parent(up);
  const ours = up === process.pid;
  log({ chrome_pid: pid, user_data_dir: dataDir, descendant_of_this_check: ours });
  if (!pid || pid === OWNER_PID || !ours) throw new Error(`not the run's own Chrome: pid ${pid}, descendant ${ours}, user-data-dir ${dataDir}`);
  engine = new Engine({ label: 'cua', bin: CANDIDATE }).start();
  if (!oracle.text(sc.field)) {
    for (const c of SEED) await engine.request('press_key', { window: { id: sc.id }, key: c === ' ' ? 'space' : c });
    for (let i = 0; i < 40 && oracle.text(sc.field) !== SEED; i++) await sleep(50);
  }
  desktop.arrangeFront('covered');
  await sleep(300);
  const address = a11yBusAddress();
  bus = await connectBus(address);
  const call = (d, p, m, sig = '', body = []) => bus.call(d, p, A, m, sig, body);
  let app = null;
  for (const [d, p] of (await call('org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', 'GetChildren'))[0]) {
    const [[, name]] = await bus.call(d, p, 'org.freedesktop.DBus.Properties', 'Get', 'ss', [A, 'Name']).catch(() => [[null, '']]);
    if (/chrom/i.test(String(name))) app = { d, p };
  }
  const clip = () => {
    try {
      return execFileSync('xclip', ['-o', '-selection', 'clipboard'], { encoding: 'utf8', timeout: 3000 }).slice(0, 60);
    } catch (e) {
      return `(none: ${String(e.message).split('\n')[0].slice(0, 60)})`;
    }
  };
  const page = async () => preorder((await desktop.state(sc)).ax_tree).find((n) => typeof n.name === 'string' && n.name.startsWith('esc '))?.name ?? null;
  const xprobe = (args) => {
    try {
      return execFileSync(XPROBE, args, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (e) {
      return `(failed: ${String(e.stderr || e.message).trim().slice(0, 160)})`;
    }
  };
  const probe = async (tag) => {
    const menus = [];
    let seen = 0;
    const stack = [[app.d, app.p, 0, null]];
    while (stack.length && seen < 20000) {
      const [d, p, depth, parentRole] = stack.pop();
      seen++;
      const role = (await call(d, p, 'GetRoleName').catch(() => [null]))[0];
      const [w0] = (await call(d, p, 'GetState').catch(() => [[0, 0]]))[0];
      const st = { showing: Boolean(w0 & (1 << 25)), visible: Boolean(w0 & (1 << 30)) };
      if (MENU_ROLES.has(role)) menus.push({ path: p, role, depth, parent: parentRole, ...st });
      if (depth < 40) for (const [cd, cp] of (await call(d, p, 'GetChildren').catch(() => [[]]))[0].reverse()) stack.push([cd, cp, depth + 1, role]);
    }
    const popups = xprobe(['popups', String(sc.id)]);
    const grabs = xprobe(['grabs']);
    const out = { probe: tag, nodes: seen, menu_count: menus.length, showing_menus: menus.filter((m) => m.showing).length, menus: menus.slice(0, 12), x_popups: popups, x_grabs: grabs };
    log(out);
    return out;
  };
  const read = async (tag, { owner: keep = false } = {}) => {
    try {
      oracle.on(sc.field, 'org.a11y.atspi.Text', 'RemoveSelection', 'i', 0);
    } catch {
      // none
    }
    oracle.setCaret(sc.field, [...oracle.text(sc.field)].length);
    if (!oracle.select(sc.field, 0, WORD.length)) throw new Error('the selection was refused');
    const owner = await startOwner(`stale ${tag}`);
    const t0 = performance.now();
    const { response } = await engine.request('clipboard_read', { window: { id: sc.id } });
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    const after = clip();
    if (!keep) await owner.stop();
    log({ read: tag, ok: response.ok === true, error: response.ok ? null : String(response.error), ms, clipboard_after: after, page: await page() });
    if (response.ok) await engine.request('clipboard_release', { handle: response.output });
    return { response, owner };
  };
  const running = () => readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1]?.[0];

  await probe('start');
  for (let i = 0; i < 3; i++) await read(`base-${i}`);

  // the freeze: on the return of the read's second DoAction (the menu's Copy item), the browser stopped for STOP_MS
  monitor = spawn('dbus-monitor', ['--address', address, "type='method_call',interface='org.a11y.atspi.Action',member='DoAction'", "type='method_return'"], { stdio: ['ignore', 'pipe', 'ignore'] });
  const lines = createInterface({ input: monitor.stdout });
  let calls = [];
  let armed = false;
  let froze = null;
  lines.on('line', (line) => {
    if (!armed) return;
    const callm = line.match(/^method call .* serial=(\d+) .*member=DoAction/);
    if (callm) calls.push(callm[1]);
    const ret = line.match(/^method return .* reply_serial=(\d+)/);
    if (ret && calls.length >= 2 && ret[1] === calls[1] && !froze) {
      process.kill(pid, 'SIGSTOP');
      stopped = pid;
      froze = Date.now();
      setTimeout(resume, STOP_MS);
    }
  });
  await sleep(1000);
  armed = true;
  const forced = await read('forced', { owner: true });
  armed = false;
  for (let i = 0; i < 40 && stopped; i++) await sleep(100);
  resume();
  await sleep(300);
  log({ froze_at: froze, stop_ms: STOP_MS, state_after_continue: running(), forced_ok: forced.response.ok, forced_error: forced.response.ok ? null : String(forced.response.error) });
  for (const at of [0, 1000, 3000]) {
    if (at) await sleep(at === 3000 ? 2000 : 1000);
    log({ late_service_check_ms: at, clipboard: clip() });
  }
  await forced.owner.stop();
  monitor.kill();
  monitor = null;
  if (running() !== 'S' && running() !== 'R') throw new Error(`Chrome is not running again: state ${running()}`);
  // fidelity: the real stuck state is a later Copy refused "context menu did not open" with no menu node
  await probe('after the timeout');
  const f1 = await read('fidelity-0');
  const f2 = await read('fidelity-1');
  const fp = await probe('fidelity');
  const faithful = [f1, f2].every((r) => !r.response.ok && /context menu did not open/.test(String(r.response.error))) && fp.showing_menus === 0;
  log({ faithful, forced_timed_out: !forced.response.ok && /clipboard update timed out/.test(String(forced.response.error)) });
  if (faithful) {
    const counters = async (tag) => log({ step: tag, page: await page(), clipboard: clip() });
    // 1. a gated Escape: only on a menu shown in AT-SPI or mapped in X
    const g = await probe('before the gated Escape');
    const mapped = /"popups":\[\d/.test(g.x_popups);
    if (g.showing_menus > 0 || mapped) {
      await counters('before the gated Escape');
      const r = await engine.request('press_key', { window: { id: sc.id }, key: 'Escape' });
      await sleep(400);
      await counters(`after the gated Escape (ok ${r.response.ok})`);
      await read('after-gated-escape');
    } else log({ gated_escape: 'not sent: no menu shown in AT-SPI and none mapped in X' });
    // 2a. a synthetic focus cycle: the background route's FocusIn and FocusOut around a modifier key
    await counters('before the synthetic focus cycle');
    await engine.request('press_key', { window: { id: sc.id }, key: 'shift' });
    await sleep(400);
    await counters('after the synthetic focus cycle');
    const s = await read('after-synthetic-focus');
    // 2b. a real activation cycle: the window activated, then the front window again
    if (!s.response.ok) {
      await counters('before the activation cycle');
      xdotool('windowactivate', '--sync', sc.id);
      await sleep(400);
      desktop.arrangeFront('covered');
      await sleep(400);
      await counters('after the activation cycle');
      await read('after-activation-cycle');
    }
    // 3. a plain Escape, a diagnostic only
    await probe('before the plain Escape');
    await counters('before the plain Escape');
    await engine.request('press_key', { window: { id: sc.id }, key: 'Escape' });
    await sleep(400);
    await counters('after the plain Escape');
    await read('after-plain-escape');
    await probe('end');
  }
} finally {
  clearTimeout(hardStop);
  resume();
  monitor?.kill();
  bus?.close();
  if (engine) await engine.close();
  restoreTmpdir();
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  const watched = await server.stop();
  log({ end: true, watchdog_clean: watched?.clean ?? null });
}
