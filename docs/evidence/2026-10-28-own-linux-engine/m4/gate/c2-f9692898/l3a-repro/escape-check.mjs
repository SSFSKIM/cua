#!/usr/bin/env node
// Task 77, L3a's bounded Escape check (a development run, not counted; the controller's approval, 2026-11-14): on a private
// display of its own, the run's own Chrome on the settle experiment's chrome-text page (matrix.html, the window covered
// by a front window, the background route), candidate 2's engine over the wire, 16 stress-ng workers. Reads the field's
// first word with clipboard_read until one Copy times out (the trigger), confirms the stuck state with 3 reads, sends
// Escape to the window on the background route, and reads 3 more. Before and after each step it probes Chrome's whole
// application subtree, frames included, for menu nodes (role menu, popup menu, menu item, menu bar) and their showing and
// visible states. The page is the harness's matrix.html with one line more counting the Escape keydowns and contextmenu
// events it receives (esc-page.html beside this script), so an Escape's reaching the page shows; the clipboard is read
// (xclip) after the timeout, while its run's own owner still holds it, and after the Escape, for a Copy served late.
// No engine change; it only reads AT-SPI, and sends the engine the same requests the settle cell does.
// usage: node escape-check.mjs <harness checkout> <candidate> <out directory> [max reads before the trigger, 150]
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';

const [H, CANDIDATE, OUT, MAX = '150'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const lib = (m) => import(join(H, 'scripts/linux-engine-diff', m));
const { startPrivateServer } = await lib('xtools.mjs');
const { Desktop, a11yBusAddress } = await lib('scenes.mjs');
const { Oracle } = await lib('oracle.mjs');
const { FAMILIES, openFamily } = await lib('families.mjs');
const { verifiedScene } = await lib('app-identity.mjs');
const { Engine, runTmpdirInProcess } = await lib('engine.mjs');
const { LIVE_RUN, assertReachable } = await lib('xspawn.mjs');
const { startOwner } = await lib('clip.mjs');
const { preorder } = await lib('normalize.mjs');
const { connectBus } = await lib('bus-client.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = join(OUT, 'escape-check.jsonl');
const log = (o) => {
  const line = JSON.stringify({ wall: Date.now(), ...o });
  appendFileSync(LOG, line + '\n');
  console.log(line.slice(0, 400));
};
const WORD = 'cua171';
const SEED = `${WORD} settle field`;

delete process.env[LIVE_RUN];
assertReachable('the escape check', [], { DISPLAY: ':cua171-escape-check' });
process.env.DISPLAY = ':cua171-escape-check';
const server = await startPrivateServer({ out: OUT });
assertReachable('the escape check', [], { DISPLAY: server.display });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: CANDIDATE, run: 't77-escape-check', logs: OUT });
let wm = null;
let engine = null;
let load = null;
let bus = null;
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
  engine = new Engine({ label: 'cua', bin: CANDIDATE }).start();
  if (!oracle.text(sc.field)) {
    for (const c of SEED) await engine.request('press_key', { window: { id: sc.id }, key: c === ' ' ? 'space' : c });
    for (let i = 0; i < 40 && oracle.text(sc.field) !== SEED; i++) await sleep(50);
  }
  desktop.arrangeFront('covered');
  await sleep(300);
  bus = await connectBus(a11yBusAddress());
  const call = (d, p, m, sig = '', body = []) => bus.call(d, p, A, m, sig, body);
  let app = null;
  for (const [d, p] of (await call('org.a11y.atspi.Registry', '/org/a11y/atspi/accessible/root', 'GetChildren'))[0]) {
    const [[, name]] = await bus.call(d, p, 'org.freedesktop.DBus.Properties', 'Get', 'ss', [A, 'Name']).catch(() => [[null, '']]);
    if (/chrom/i.test(String(name))) app = { d, p };
  }
  // Chrome's whole application subtree: its menu nodes with their states, and the application's direct children
  const probe = async (tag) => {
    const menus = [];
    const top = [];
    let seen = 0;
    const stack = [[app.d, app.p, 0, null]];
    while (stack.length && seen < 20000) {
      const [d, p, depth, parentRole] = stack.pop();
      seen++;
      const role = (await call(d, p, 'GetRoleName').catch(() => [null]))[0];
      const [w0] = (await call(d, p, 'GetState').catch(() => [[0, 0]]))[0];
      const st = { showing: Boolean(w0 & (1 << 25)), visible: Boolean(w0 & (1 << 30)) };
      if (depth === 1) top.push({ path: p, role, ...st });
      if (MENU_ROLES.has(role)) menus.push({ path: p, role, depth, parent: parentRole, ...st });
      if (depth < 40) for (const [cd, cp] of (await call(d, p, 'GetChildren').catch(() => [[]]))[0].reverse()) stack.push([cd, cp, depth + 1, role]);
    }
    log({ probe: tag, nodes: seen, top, menus: menus.slice(0, 40), menu_count: menus.length, showing_menus: menus.filter((m) => m.showing).length });
  };
  const clip = () => {
    try {
      return execFileSync('xclip', ['-o', '-selection', 'clipboard'], { encoding: 'utf8', timeout: 3000 }).slice(0, 60);
    } catch (e) {
      return `(none: ${String(e.message).split('\n')[0].slice(0, 60)})`;
    }
  };
  const page = async () => preorder((await desktop.state(sc)).ax_tree).find((n) => typeof n.name === 'string' && n.name.startsWith('esc '))?.name ?? null;
  const read = async (tag, { keep = false } = {}) => {
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
  await probe('start');
  // the page's listener works: an Escape sent while no menu is up reaches it (the positive control)
  log({ page_before_control: await page() });
  const control = await engine.request('press_key', { window: { id: sc.id }, key: 'Escape' });
  await sleep(400);
  log({ control_escape: control.response.ok === true, page_after_control: await page() });
  const cores = availableParallelism();
  load = spawn('stress-ng', ['--cpu', String(cores * 2), '--cpu-method', 'matrixprod', '--timeout', '1h', '--quiet'], { stdio: 'ignore', detached: true });
  log({ load: cores * 2 });
  await sleep(3000);
  let triggered = null;
  for (let i = 0; i < Number(MAX) && !triggered; i++) {
    const r = await read(`pre-${i}`, { keep: true });
    if (!r.response.ok && /clipboard update timed out/.test(String(r.response.error))) triggered = r;
    else await r.owner.stop();
    if (!triggered) await sleep(250);
  }
  log({ triggered: Boolean(triggered) });
  if (triggered) {
    // a Copy Chrome serves late takes CLIPBOARD from the run's owner, which still holds it
    for (const at of [0, 1000, 3000]) {
      await sleep(at ? at - (at === 3000 ? 1000 : 0) : 0);
      log({ late_service_check_ms: at, clipboard: clip() });
    }
    await triggered.owner.stop();
    await probe('after the timeout');
    for (let i = 0; i < 3; i++) {
      await read(`stuck-${i}`);
      await probe(`after stuck read ${i}`);
    }
    log({ page_before_escape: await page(), clipboard_before_escape: clip() });
    const esc = await engine.request('press_key', { window: { id: sc.id }, key: 'Escape' });
    log({ escape: esc.response.ok === true, error: esc.response.ok ? null : String(esc.response.error) });
    await sleep(400);
    log({ page_after_escape: await page(), clipboard_after_escape: clip() });
    await probe('after Escape');
    for (let i = 0; i < 3; i++) await read(`post-escape-${i}`);
    await probe('end');
  }
} finally {
  if (load) {
    try {
      process.kill(-load.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
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
