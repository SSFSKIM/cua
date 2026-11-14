#!/usr/bin/env node
// Task 78's live proof of candidate 3's menu detection (a development run, not counted; DL 2026-11-14, rulings 684-688):
// on a private display of its own, each family the gate drives, its harness scene opened by the harness's own
// openFamily, the candidate engine over the wire. Per family:
//  - which elements offer `showContextMenu` (every action name in the tree, so a family's own name for a menu action
//    shows);
//  - `perform_secondary_action showContextMenu` on a visible one, and a right-button `click_element` on one with no
//    visible point (the fallback), each answer with its time, the menu as X shows it (`xprobe popups`) and as the
//    engine's detection sees it (a new child of the application holding a menu item), mirrored here;
//  - a real context menu opened through XTEST (a right click at a point in the window), with the mirrored detection:
//    whether the family's menus ever reach its tree as a new application child, and, where they do not, wherever else
//    a menu node shows in the application's tree;
//  - on the proof page (Chrome, Electron, Firefox): the control (a cancelled menu: menuUnconfirmed) and the page's own
//    ARIA role=menu, with the AT-SPI events the browser emits for it (children-changed, state-changed:showing) after
//    registering for them, measured only (ruling 687: no detection is built on them).
// Every menu opened is closed with an XTEST Escape, and the page's Escape count is read. No engine change.
// usage: node menu-proof.mjs <checkout> <candidate> <out directory> <family,...>
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const [H, CANDIDATE, OUT, LIST] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const lib = (m) => import(join(H, 'scripts/linux-engine-diff', m));
const { startPrivateServer, xdotool, xprobe, XPROBE } = await lib('xtools.mjs');
const { Desktop, a11yBusAddress } = await lib('scenes.mjs');
const { Oracle } = await lib('oracle.mjs');
const { FAMILIES, openFamily } = await lib('families.mjs');
const { verifiedScene } = await lib('app-identity.mjs');
const { Engine, runTmpdirInProcess } = await lib('engine.mjs');
const { LIVE_RUN, assertReachable } = await lib('xspawn.mjs');
const { preorder } = await lib('normalize.mjs');
const { connectBus } = await lib('bus-client.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = join(OUT, 'menu-proof.jsonl');
const log = (o) => {
  const line = JSON.stringify({ wall: Date.now(), ...o });
  appendFileSync(LOG, line + '\n');
  console.log(line.slice(0, 600));
};
const A = 'org.a11y.atspi.Accessible';
const ROOT = '/org/a11y/atspi/accessible/root';
const MENU_ROLES = new Set(['menu', 'popup menu', 'menu item', 'check menu item', 'radio menu item', 'menu bar']);
const PAGE = relative(join(H, 'scripts/linux-engine-diff/pages'), join(import.meta.dirname, 'menu-proof.html'));
const SCENES = {
  chrome: { family: 'chrome', page: true },
  electron: { family: 'electron', page: true },
  firefox: { family: 'firefox', page: true },
  gtk3: { family: 'gedit' },
  gtk4: { family: 'gnome-text-editor' },
  qt5: { family: 'kate' },
  qt6: { family: 'qtcreator' },
  libreoffice: { family: 'writer' },
};

// a bound on the whole run, whatever hangs
setTimeout(() => {
  console.error('menu proof: over its 30 min bound');
  process.exit(9);
}, 30 * 60 * 1000).unref();
delete process.env[LIVE_RUN];
assertReachable('the menu proof', [], { DISPLAY: ':cua171-menu-proof' });
process.env.DISPLAY = ':cua171-menu-proof';
const server = await startPrivateServer({ out: OUT });
assertReachable('the menu proof', [], { DISPLAY: server.display });
process.env.DISPLAY = server.display;
const desktop = new Desktop({ cua: CANDIDATE, run: 't78-menu-proof', logs: OUT });
let wm = null;
let engine = null;
let bus = null;
let restoreTmpdir = () => {};
try {
  await desktop.begin({ startRecord: async () => null });
  restoreTmpdir = runTmpdirInProcess();
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('visible');
  // the engine the requests go to: the candidate, or (CUA_PROOF_ENGINE) a vendor build beside it; the scene's reads
  // are the candidate's either way
  const ENGINE = process.env.CUA_PROOF_ENGINE ?? CANDIDATE;
  log({ engine: ENGINE });
  engine = new Engine({ label: ENGINE === CANDIDATE ? 'cua' : 'pinned', bin: ENGINE }).start();
  bus = await connectBus(a11yBusAddress());
  const call = (d, p, m, sig = '', body = []) => bus.call(d, p, A, m, sig, body);
  const children = async (d, p) => (await call(d, p, 'GetChildren').catch(() => [[]]))[0].map(([cd, cp]) => `${cd}:${cp}`);
  const roleOf = async (d, p) => (await call(d, p, 'GetRoleName').catch(() => [null]))[0];
  const nameOf = async (d, p) => {
    const [[, name]] = await bus.call(d, p, 'org.freedesktop.DBus.Properties', 'Get', 'ss', [A, 'Name']).catch(() => [[null, null]]);
    return name;
  };
  const split = (id) => {
    const i = id.indexOf(':/');
    return [id.slice(0, i), id.slice(i + 1)];
  };
  // the engine's detection, mirrored: a new child of the application holding a menu item (at most 500 nodes, depth 16)
  const menuIn = async (id) => {
    const stack = [[id, 0]];
    let seen = 0;
    while (stack.length && seen < 500) {
      const [node, depth] = stack.pop();
      seen++;
      const [d, p] = split(node);
      const role = await roleOf(d, p);
      if (role === 'menu item') return { item: await nameOf(d, p), path: p };
      if (depth < 16) for (const c of (await children(d, p)).reverse()) stack.push([c, depth + 1]);
    }
    return null;
  };
  const watch = async (appBus, before, ms) => {
    const started = performance.now();
    while (performance.now() - started < ms) {
      for (const c of (await children(appBus, ROOT)).filter((x) => !before.has(x))) {
        const found = await menuIn(c);
        if (found) {
          const [d, p] = split(c);
          return { seen_ms: Math.round(performance.now() - started), child: p, child_role: await roleOf(d, p), ...found };
        }
      }
      await sleep(20);
    }
    return null;
  };
  // wherever else a menu node shows in the application's tree (the windows included), at most 20,000 nodes
  const menusAnywhere = async (appBus) => {
    const out = [];
    const stack = [[`${appBus}:${ROOT}`, 0, null]];
    let seen = 0;
    while (stack.length && seen < 20000) {
      const [node, depth, parent] = stack.pop();
      seen++;
      const [d, p] = split(node);
      const role = await roleOf(d, p);
      // a menu bar and its items are always there: left out
      if (MENU_ROLES.has(role) && role !== 'menu bar' && parent !== 'menu bar') {
        const [w0] = (await call(d, p, 'GetState').catch(() => [[0, 0]]))[0];
        if (w0 & (1 << 25)) out.push({ path: p, role, depth, parent, name: role === 'menu item' ? await nameOf(d, p) : undefined });
      }
      if (depth < 40) for (const c of (await children(d, p)).reverse()) stack.push([c, depth + 1, role]);
    }
    return { nodes: seen, showing: out.length, first: out.slice(0, 8) };
  };
  // an element's middle on the screen (Component.GetExtents, screen coordinates)
  const middleOf = async (id) => {
    const [d, p] = split(id);
    const [[x, y, w, h]] = await bus.call(d, p, 'org.a11y.atspi.Component', 'GetExtents', 'u', [0]);
    return { x: Math.round(x + w / 2), y: Math.round(y + h / 2) };
  };
  const popups = (sc) => JSON.parse(xprobe(['popups', sc.id])).popups;
  const statusOf = async (sc) => {
    const names = preorder((await desktop.state(sc)).ax_tree).map((n) => n.name).filter((n) => typeof n === 'string');
    return names.find((n) => n.startsWith('context ')) ?? null;
  };
  const close = async (sc, page) => {
    const open = popups(sc);
    if (!open.length) return { popups: 0 };
    xdotool('key', 'Escape');
    const until = Date.now() + 2000;
    while (popups(sc).length && Date.now() < until) await sleep(20);
    return { popups: open.length, closed: popups(sc).length === 0, ...(page ? { status_after: await statusOf(sc) } : {}) };
  };
  const timed = async (command, input) => {
    const t0 = performance.now();
    const { response } = await engine.request(command, input);
    return { ok: response.ok === true, error: response.ok ? null : String(response.error).slice(0, 300), ms: Math.round(performance.now() - t0) };
  };
  // the scene client's popups through the trigger, every ~15 ms (asynchronously, so the request is not held up): when a
  // menu window was first and last seen, in ms from the trigger's start, and the answer's time
  const run = promisify(execFile);
  const timeline = (sc) => {
    const t0 = performance.now();
    const seen = [];
    let stop = false;
    const loop = (async () => {
      while (!stop) {
        const { stdout } = await run(XPROBE, ['popups', String(sc.id)]).catch(() => ({ stdout: '{"popups":[]}' }));
        if (JSON.parse(stdout).popups.length) seen.push(Math.round(performance.now() - t0));
        await sleep(15);
      }
    })();
    return async (answeredAt) => {
      await sleep(300);
      stop = true;
      await loop;
      return { first_ms: seen[0] ?? null, last_ms: seen.at(-1) ?? null, samples: seen.length, answered_ms: Math.round(answeredAt - t0) };
    };
  };
  // one trigger: the application's children before it, the trigger, the mirrored detection, the menu closed
  const attempt = async (tag, sc, appBus, trigger, { page = false, mirrorMs = 1000 } = {}) => {
    const before = new Set(await children(appBus, ROOT));
    const statusBefore = page ? await statusOf(sc) : null;
    const watching = timeline(sc);
    const answer = await trigger();
    const popupTimeline = await watching(performance.now());
    const mirrored = await watch(appBus, before, mirrorMs);
    const shown = popups(sc).length;
    const elsewhere = mirrored ? null : shown ? await menusAnywhere(appBus) : null;
    const closed = await close(sc, page);
    log({ family: sc.familyKey, attempt: tag, answer, popup_timeline: popupTimeline, mirrored, popups_after: shown, elsewhere, closed, ...(page ? { status_before: statusBefore } : {}) });
  };
  for (const key of LIST.split(',')) {
    const def = SCENES[key];
    let sc;
    try {
      sc = await openFamily(desktop, oracle, def.family, `menuproof-${key}`, { geometry: FAMILIES[def.family].geometry, ...(def.page ? { page: PAGE } : {}) });
      sc.familyKey = key;
      await verifiedScene(desktop, oracle, sc, def.family);
    } catch (error) {
      log({ family: key, open_failed: String(error.message).slice(0, 300) });
      continue;
    }
    try {
      desktop.raise?.(sc);
      await sleep(500);
      const state = await desktop.state(sc);
      const nodes = preorder(state.ax_tree);
      const appBus = split(state.ax_tree.id)[0];
      const actions = [...new Set(nodes.flatMap((n) => n.actions ?? []))];
      const offering = nodes.filter((n) => (n.actions ?? []).some((a) => a.toLowerCase() === 'showcontextmenu'));
      const visible = (n) => (n.states ?? []).includes('showing') && (n.states ?? []).includes('visible');
      log({ family: key, window: sc.id, source: state.ax_tree_source, nodes: nodes.length, action_names: actions, offering: offering.length, offering_visible: offering.filter(visible).length, first: offering.slice(0, 4).map((n) => ({ role: n.role, name: n.name, visible: visible(n), actions: n.actions })) });
      const named = (name) => offering.find((n) => n.name === name);
      const win = { window: { id: sc.id } };
      const shown = def.page ? named('Native') : offering.find(visible);
      const hidden = def.page ? named('Offscreen') : offering.find((n) => !visible(n));
      if (shown) await attempt('secondary_action', sc, appBus, () => timed('perform_secondary_action', { ...win, element_id: shown.id, action: 'showContextMenu' }), { page: def.page });
      else log({ family: key, attempt: 'secondary_action', skipped: 'no visible element offers showContextMenu' });
      if (hidden) await attempt('right_click_fallback', sc, appBus, () => timed('click', { ...win, element_id: hidden.id, mouse_button: 'right' }), { page: def.page });
      else log({ family: key, attempt: 'right_click_fallback', skipped: 'no element offering showContextMenu lacks a visible point' });
      if (def.page && shown && process.env.CUA_PROOF_IN_FRONT) {
        // Chrome the active window with the X focus: the engine's session then synthesizes no FocusIn or FocusOut
        xdotool('windowactivate', '--sync', sc.id);
        await sleep(400);
        await attempt('secondary_action_in_front', sc, appBus, () => timed('perform_secondary_action', { ...win, element_id: shown.id, action: 'showContextMenu' }), { page: true });
        await attempt('right_click_fallback_in_front', sc, appBus, () => timed('click', { ...win, element_id: hidden.id, mouse_button: 'right' }), { page: true });
        desktop.focusFront();
        await sleep(300);
      }
      if (def.page && process.env.CUA_PROOF_IN_FRONT) {
        // a coordinate right click on Native: with the window named (its route: the background one, Chrome ignoring no
        // click), and with none (the desktop route, XTEST at the screen point), each with the menu's timeline
        const n = nodes.find((m) => m.name === 'Native' && m.role === 'push button');
        const at = await middleOf(n.id);
        await attempt('coordinate_right_click_window', sc, appBus, () => timed('click', { ...win, x: at.x - state.window.x, y: at.y - state.window.y, mouse_button: 'right' }), { page: true });
        desktop.raise?.(sc);
        await sleep(300);
        await attempt('coordinate_right_click_desktop', sc, appBus, () => timed('click', { x: at.x, y: at.y, mouse_button: 'right' }), { page: true, mirrorMs: 1500 });
        desktop.focusFront();
        await sleep(300);
      }
      if (def.page && named('Cancelled')) await attempt('control_cancelled', sc, appBus, () => timed('perform_secondary_action', { ...win, element_id: named('Cancelled').id, action: 'showContextMenu' }), { page: true });
      // a real context menu, through XTEST: on the page's Native button, else the window's middle
      const info = state.window;
      const target = def.page ? nodes.find((n) => n.name === 'Native' && n.role === 'push button') : null;
      const at = target ? await middleOf(target.id) : { x: info.x + Math.round(info.width / 2), y: info.y + Math.round(info.height / 2) };
      await attempt('xtest_right_click', sc, appBus, async () => {
        // a move first elsewhere: `--sync` waits for a motion, and the pointer may already be at the point
        xdotool('mousemove', '1', '1');
        xdotool('mousemove', '--sync', at.x, at.y);
        await sleep(150);
        xdotool('click', '3');
        return { at };
      }, { page: def.page, mirrorMs: 2000 });
      if (def.page && (key === 'chrome' || key === 'firefox')) {
        // the page's own ARIA role=menu, with the events the browser emits for it once a listener is registered
        const registered = [];
        for (const event of ['object:children-changed', 'object:state-changed:showing']) {
          const r = await bus.call('org.a11y.atspi.Registry', '/org/a11y/atspi/registry', 'org.a11y.atspi.Registry', 'RegisterEvent', 's', [event]).then(() => 'ok', (e) => String(e.message).slice(0, 120));
          registered.push({ event, r });
        }
        await sleep(500);
        const mon = spawn('dbus-monitor', ['--address', a11yBusAddress(), "type='signal',interface='org.a11y.atspi.Event.Object'"], { stdio: ['ignore', 'pipe', 'ignore'] });
        let text = '';
        mon.stdout.on('data', (b) => (text += b));
        await sleep(800);
        const startAt = text.length;
        const custom = named('Custom') ?? nodes.find((n) => n.name === 'Custom');
        const t0 = performance.now();
        const answer = custom && (custom.actions ?? []).some((a) => a.toLowerCase() === 'showcontextmenu')
          ? await timed('perform_secondary_action', { ...win, element_id: custom.id, action: 'showContextMenu' })
          : await (async () => {
            const f = await middleOf(nodes.find((n) => n.name === 'Custom').id);
            xdotool('mousemove', '1', '1');
            xdotool('mousemove', '--sync', f.x, f.y);
            await sleep(100);
            xdotool('click', '3');
            return { xtest: true };
          })();
        await sleep(1500);
        mon.kill();
        const lines = text.slice(startAt).split('\n').filter((l) => l.startsWith('signal '));
        const members = {};
        for (const l of lines) {
          const m = l.match(/member=(\S+)/)?.[1] ?? '?';
          members[m] = (members[m] ?? 0) + 1;
        }
        const after = preorder((await desktop.state(sc)).ax_tree);
        const menuNode = after.find((n) => n.role === 'menu' || n.name === 'Page menu');
        const detail = text.slice(startAt).split('\n').filter((l) => /string "(add|remove|showing)/.test(l)).slice(0, 12);
        log({ family: key, attempt: 'aria_menu_events', registered, answer, ms_window: Math.round(performance.now() - t0), signals: lines.length, members, detail, menu_node: menuNode ? { role: menuNode.role, name: menuNode.name, states: menuNode.states } : null, status: await statusOf(sc) });
        xdotool('key', 'Escape');
        await sleep(300);
      }
    } catch (error) {
      log({ family: key, failed: String(error.stack ?? error.message).slice(0, 600) });
    } finally {
      await desktop.close?.(sc).catch(() => {});
    }
  }
} finally {
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
  // nothing of the run may keep it alive past its end (a stray handle held task 78's first full run, and the lock)
  setTimeout(() => process.exit(), 3000);
}
