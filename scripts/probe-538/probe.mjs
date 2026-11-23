#!/usr/bin/env node
// #538's hosted qualification probe of S (rulings 1172 to 1174; not a sitting of record, no M5 verdict): S is the
// key-focus-only state, the target holding the window server's key focus while another app is frontmost and no fake
// activation stands. Run on a GitHub-hosted macOS runner after `node scripts/hosted-sittings.mjs setup` (the guarded
// TCC rows, the approved engine), by .github/workflows/probe-538-s.yml, once per lane: `fix` (the #538 head merged
// into feat/117-m5) and `base` (the same checkout with native/ and src/ at feat/117-m5, which carries main 6baf3e36's
// delivery path).
//
//   node scripts/probe-538/probe.mjs --out <dir> --lane fix|base [--rounds 4] [--control-rounds 3]
//
// The scene: TextEdit's document is the person's window and frontmost; the Electron fixture (its pointerdown page, and
// ./fixtures/electron/probe538.js's control channel) opens a `type: 'panel'` window and focuses it, which should key
// the fixture's process without activating it. Two variants of S: `S-panel` (the panel key: the engine's primary
// window for the fixture is then the panel) and `S-main` (then the fixture's main window focused, BrowserWindow.focus,
// which may activate the app instead: the readings say). The control: the fixture activated and frontmost, panel
// hidden. Each act is one js call through `cua serve` (CUA_NATIVE_ENGINE=cua), read around it by ./reader.swift (front,
// key, window order, outside either engine) and by the fixture's own report (its focused window, both pages'
// pointerdown/mousedown/mouseup/click counters). Nothing here answers an alert or prompt, writes TCC or replayd.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {openSession} from '../accept/mcp-session.mjs';
import {cell, parseCell} from '../native-baseline/cells.mjs';
import {isSceneApproval} from '../native-matrix/goldens.mjs';
import {EMBEDDED} from '../native-matrix/matrix-text.mjs';
import {FIXTURE_BUNDLE_ID, POINTERDOWN_SWITCH} from '../native-matrix/fixtures/electron-fixture.mjs';
import {isAlertWindow, overlaps} from '../hosted-sittings/alert-guard.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const TEXTEDIT_BUNDLE = 'com.apple.TextEdit';
const SETTLE_MS = 1_500;   // after an act: the delivery guard's and the after-action watch's time, and a raise's
const sleep = ms => new Promise(r => setTimeout(r, ms));
const j = JSON.stringify;

const {values} = parseArgs({options: {out: {type: 'string'}, lane: {type: 'string'}, rounds: {type: 'string', default: '4'}, 'control-rounds': {type: 'string', default: '3'}}});
if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'darwin') { console.error('probe-538: GitHub-hosted macOS only'); process.exit(2); }
if (!values.out || !['fix', 'base'].includes(values.lane)) { console.error('usage: probe.mjs --out <dir> --lane fix|base'); process.exit(2); }
const out = resolve(values.out);
mkdirSync(out, {recursive: true});
const save = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n');
const run = mkdtempSync(join(process.env.RUNNER_TEMP ?? '/tmp', 'probe538-'));
const control = join(run, 'control');
mkdirSync(control, {recursive: true, mode: 0o700});
const log = line => process.stderr.write(`probe-538: ${line}\n`);

// ---- device reads --------------------------------------------------------------------------------------------------
const readerBin = join(run, 'reader');
const compiled = spawnSync('swiftc', ['-O', '-o', readerBin, join(REPO, 'scripts/probe-538/reader.swift')], {encoding: 'utf8'});
if (compiled.status !== 0) { save('error.json', {phase: 'compile reader', stderr: compiled.stderr}); process.exit(1); }
const read = () => {
  const r = spawnSync(readerBin, [], {encoding: 'utf8', timeout: 10_000});
  try { return JSON.parse(r.stdout); } catch { return {error: r.stderr || 'no reading'}; }
};
const scenes = args => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/repl-parity/scenes-mac.mjs'), ...args], {encoding: 'utf8', cwd: REPO, timeout: 600_000});
  const last = String(r.stdout).trim().split('\n').at(-1);
  try { return JSON.parse(last); } catch { return {error: `scenes ${args[0]}: exit ${r.status}: ${String(r.stderr).trim().split('\n').at(-1)}`}; }
};
let requestSeq = 0;
async function ask(op, args = {}, boundMs = 8_000) {
  const id = `${Date.now()}-${++requestSeq}`;
  const file = join(control, `req-${id}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify({id, op, args}));
  spawnSync('/bin/mv', [`${file}.tmp`, file]);
  const answer = join(control, `res-${id}.json`);
  for (const t0 = Date.now(); Date.now() - t0 < boundMs;) {
    if (existsSync(answer)) { try { return JSON.parse(readFileSync(answer, 'utf8')); } catch { /* mid-rename */ } }
    await sleep(50);
  }
  return {id, op, ok: false, error: `no answer in ${boundMs} ms`};
}
async function until(accept, boundMs = 5_000) {
  let reading;
  for (const t0 = Date.now(); ;) {
    reading = read();
    if (accept(reading) || Date.now() - t0 >= boundMs) return {ok: accept(reading), reading};
    await sleep(150);
  }
}
const open = app => spawnSync('/usr/bin/open', ['-a', app], {encoding: 'utf8', timeout: 15_000}).status;

// ---- the engine session --------------------------------------------------------------------------------------------
const {CUA_HOME: _ignored, ...baseEnv} = process.env;
const elicitations = [];
const session = openSession({args: [join(REPO, 'bin/cua.mjs'), 'serve'], env: {...baseEnv, CUA_NATIVE_ENGINE: 'cua'}, clientName: 'cua-probe-538',
  onServerRequest: msg => { const yes = isSceneApproval(msg, [FIXTURE_BUNDLE_ID]); elicitations.push({app: msg.params?._meta?.tool_params?.app ?? null, accepted: yes}); return yes ? {action: 'accept', content: {}} : {action: 'decline'}; }});
const JPEG_SIZE = `const jpegSize = shot => {
  if (shot?.[0] === 0x89 && shot[1] === 0x50) { const v = new DataView(shot.buffer, shot.byteOffset, shot.byteLength); return {width: v.getUint32(16), height: v.getUint32(20)}; }
  if (shot?.[0] !== 0xff || shot[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < shot.length;) {
    if (shot[i] !== 0xff) { i++; continue; }
    const marker = shot[i + 1], length = (shot[i + 2] << 8) | shot[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {width: (shot[i + 7] << 8) | shot[i + 8], height: (shot[i + 5] << 8) | shot[i + 6]};
    i += 2 + length;
  }
  return null;
};`;
const HEAD = `${EMBEDDED}\n${JPEG_SIZE}\nconst fx = globalThis.__fx; const observe = () => fx.getAXState({emit: false, disableDiffing: true});`;
async function js(body, timeoutMs = 60_000) {
  const t0 = Date.now();
  const reply = await session.js(cell(`${HEAD}\n${body}`), timeoutMs);
  const text = (reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const parsed = parseCell(text);
  return {at: [t0, Date.now()], ok: parsed?.ok ?? false, value: parsed?.value ?? null, error: parsed ? parsed.error ?? null : (reply.timedOut ? 'no answer' : reply.error?.message ?? 'no result marker'),
    meta: reply.result?._meta ?? null};
}

// ---- the scene ------------------------------------------------------------------------------------------------------
const meta = {lane: values.lane, commit: spawnSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).stdout.trim(),
  dirty: spawnSync('git', ['status', '--porcelain', '--', 'native', 'src'], {cwd: REPO, encoding: 'utf8'}).stdout.trim().split('\n').filter(Boolean).length,
  run: process.env.GITHUB_RUN_ID ?? null, image: process.env.ImageVersion ?? null, started: new Date().toISOString(), elicitations};
const rows = [];
const checkpoint = () => { save('meta.json', meta); save('rows.json', rows); };
let exit = 0;
try {
  meta.textedit = scenes(['up', 'textedit', '--run', run]);
  if (meta.textedit.error) throw new Error(`textedit up: ${meta.textedit.error}`);
  meta.electron = scenes(['up', 'electron', '--run', run, '--electron-arg', POINTERDOWN_SWITCH, '--electron-arg', `--cua-fixture-probe538=${control}`]);
  if (meta.electron.error) throw new Error(`electron up: ${meta.electron.error}`);
  const fixturePid = meta.electron.pid, userPid = meta.textedit.pid, userWindow = meta.textedit.window?.number;
  checkpoint();

  // Place the fixture's main window and its panel clear of TextEdit's window and the alerts, on the main display.
  const first = read();
  meta.firstReading = first;
  const display = first.displays?.[0] ?? {x: 0, y: 0, width: 1920, height: 1080};
  const obstacles = (first.windows ?? []).filter(w => isAlertWindow(w) || w.ownerPid === userPid).map(w => w.bounds);
  const fits = (r, avoid) => r.x >= display.x && r.y >= display.y + 30 && r.x + r.width <= display.x + display.width && r.y + r.height <= display.y + display.height
    && !avoid.some(o => overlaps(r, o));
  const place = (width, height, avoid) => {
    for (let y = display.y + 40; y + height <= display.y + display.height; y += 20)
      for (let x = display.x + 20; x + width <= display.x + display.width; x += 20) if (fits({x, y, width, height}, avoid)) return {x, y, width, height};
    return null;
  };
  const mainFrame = place(720, 560, obstacles) ?? place(600, 460, obstacles);
  const panelFrame = mainFrame && place(360, 200, [...obstacles, mainFrame]);
  meta.layout = {display, obstacles, mainFrame, panelFrame, answer: await ask('layout', {main: mainFrame ?? undefined, panel: panelFrame ?? undefined})};
  checkpoint();

  meta.serverInfo = (await session.initialize())?.serverInfo ?? null;
  const bind = await js(`globalThis.__fx = await cua.getApp(${j(FIXTURE_BUNDLE_ID)}); const ax = await globalThis.__fx.getAXState({emit: false, disableDiffing: true}); return {title: windowTitleOf(ax), text: String(ax).slice(0, 6000)};`, 120_000);
  meta.bind = bind;
  meta.engine = bind.meta?.['cua/nativeEngine'] ?? null;
  checkpoint();
  if (!bind.ok) throw new Error(`bind: ${bind.error}`);

  // The fixture's windows by their window-server numbers, from its own report.
  const windowsOf = state => ({main: state?.main?.cgWindow ?? null, panel: state?.panel?.cgWindow ?? null});
  const indexIn = (reading, number) => (number == null ? -1 : (reading.windows ?? []).findIndex(w => w.number === number));
  const above = (reading, a, b) => { const ia = indexIn(reading, a), ib = indexIn(reading, b); return ia < 0 || ib < 0 ? null : ia < ib; };
  const brief = reading => ({front: reading.front ?? null, key: reading.key ?? null, axFocused: reading.axFocused ?? null});
  const pageCounts = state => ({main: state?.main?.page?.counters ?? null, panel: state?.panel?.page?.counters ?? null});
  const delta = (a, b) => (a && b ? Object.fromEntries(Object.keys(b).map(k => [k, b[k] - (a[k] ?? 0)])) : null);

  // The scenes. Each returns {reading, state, steps}; S is judged from the reading: TextEdit frontmost and the
  // fixture's process holding key focus.
  async function personInFront() {
    const steps = [{op: 'panel-hide', answer: (await ask('panel-hide')).ok}];
    steps.push({open: open(meta.textedit.app ?? '/System/Applications/TextEdit.app')});
    const front = await until(r => r.front?.pid === userPid && r.key?.pid === userPid);
    steps.push({personFront: front.ok});
    return steps;
  }
  async function keyThePanel(steps) {
    const shown = await ask('panel-show');
    steps.push({op: 'panel-show', ok: shown.ok, focusedWindow: shown.state?.focusedWindow ?? null});
    const s = await until(r => r.front?.pid === userPid && r.key?.pid === fixturePid, 3_000);
    steps.push({s: s.ok});
  }
  const sceneSetup = {
    'S-panel': async ({beforeS}) => {
      const steps = await personInFront();
      const prep = beforeS ? await beforeS() : null;
      await keyThePanel(steps);
      return {steps, prep};
    },
    'S-main': async () => {
      const steps = await personInFront();
      await keyThePanel(steps);
      const focused = await ask('main-focus');
      steps.push({op: 'main-focus', ok: focused.ok, focusedWindow: focused.state?.focusedWindow ?? null});
      await sleep(300);
      return {steps, prep: null};
    },
    control: async () => {
      const steps = [{op: 'panel-hide', answer: (await ask('panel-hide')).ok}];
      steps.push({open: open(meta.electron.app)});
      const front = await until(r => r.front?.pid === fixturePid && r.key?.pid === fixturePid);
      steps.push({fixtureFront: front.ok});
      return {steps, prep: null};
    },
  };

  // The preparations: an observation (for an element) or a screenshot (for a point) of the fixture's primary window.
  const observeFor = name => js(`const ax = await observe(); return {title: windowTitleOf(ax), index: indexOfTarget(ax, ${j(name)})};`);
  const shotFor = () => js(`const ax = await observe(); const size = jpegSize(await fx.getScreenshot({emit: false})); return {title: windowTitleOf(ax), size};`);
  // A point of the fixture's main window in the screenshot's pixels, from the page's own rect of `id`.
  const mainPoint = (state, id, size, fx = 0.5) => {
    const w = state?.main, rect = w?.page?.rects?.[id];
    if (!w || !rect || !size) return null;
    const scale = size.width / w.bounds.width;
    return [Math.round((w.content.x - w.bounds.x + rect.x + rect.width * fx) * scale), Math.round((w.content.y - w.bounds.y + rect.y + rect.height / 2) * scale)];
  };
  const ACTIONS = {
    'coord-panel': {kind: 'click', prepAfterS: async () => {
      const p = await shotFor(); const size = p.value?.size;
      return {prep: p, act: size && p.value?.title === 'cua probe panel' ? `await fx.click(${j([Math.round(size.width / 2), Math.round(size.height / 2)])}); return {sent: true};` : null};
    }},
    'drag-panel': {kind: 'drag', prepAfterS: async () => {
      const p = await shotFor(); const size = p.value?.size;
      const y = size && Math.round(size.height / 2);
      return {prep: p, act: size && p.value?.title === 'cua probe panel' ? `await fx.drag(${j([Math.round(size.width * 0.3), y])}, ${j([Math.round(size.width * 0.7), y])}); return {sent: true};` : null};
    }},
    'coord-main': {kind: 'click', prepAfterS: async () => {
      const p = await shotFor(), state = await ask('state'), point = mainPoint(state.state, 'pointer', p.value?.size);
      return {prep: {...p, point}, act: point && p.value?.title === 'cua Electron fixture' ? `await fx.click(${j(point)}); return {sent: true};` : null};
    }},
    'drag-main': {kind: 'drag', prepAfterS: async () => {
      const p = await shotFor(), state = await ask('state');
      const from = mainPoint(state.state, 'text', p.value?.size, 0.2), to = mainPoint(state.state, 'text', p.value?.size, 0.8);
      return {prep: {...p, from, to}, act: from && to && p.value?.title === 'cua Electron fixture' ? `await fx.drag(${j(from)}, ${j(to)}); return {sent: true};` : null};
    }},
    // Element clicks on the main window: `Pointer target` (a button: AXPress, or a synthesized click when its point
    // lands on a strict descendant) and `Fixture status` (a status line advertising no action: a synthesized click).
    'element-pointer': {kind: 'click', element: 'Pointer target'},
    'element-status': {kind: 'click', element: 'Fixture status'},
  };
  const elementPrep = async name => { const p = await observeFor(name); return {prep: p, act: p.value?.index != null && p.value?.title === 'cua Electron fixture' ? `await fx.click(${p.value.index}); return {sent: true};` : null}; };

  const rounds = Number(values.rounds), controlRounds = Number(values['control-rounds']);
  const plan = [];
  for (let r = 1; r <= Math.max(rounds, controlRounds); r++) {
    if (r <= rounds) {
      for (const action of ['coord-panel', 'element-pointer', 'element-status', 'drag-panel']) plan.push({scene: 'S-panel', action, round: r});
      for (const action of ['coord-main', 'element-pointer', 'element-status', 'drag-main']) plan.push({scene: 'S-main', action, round: r});
    }
    if (r <= controlRounds) for (const action of ['coord-main', 'element-pointer', 'element-status', 'drag-main']) plan.push({scene: 'control', action, round: r});
  }
  meta.plan = plan.length;
  for (const step of plan) {
    const spec = ACTIONS[step.action], row = {...step, kind: spec.kind};
    rows.push(row);
    try {
      // S-panel's element clicks observe the main window before the panel is keyed (once it is, the fixture's primary
      // window is the panel); every other act prepares in its scene.
      const beforeS = step.scene === 'S-panel' && spec.element ? () => elementPrep(spec.element) : null;
      const setup = await sceneSetup[step.scene]({beforeS});
      row.setup = setup.steps;
      const prepared = setup.prep ?? (spec.element ? await elementPrep(spec.element) : await spec.prepAfterS());
      row.prep = prepared.prep;
      const stateBefore = await ask('state'), before = read();
      row.before = {...brief(before), focusedWindow: stateBefore.state?.focusedWindow ?? null, counters: pageCounts(stateBefore.state),
        windows: windowsOf(stateBefore.state), mainAboveUser: above(before, stateBefore.state?.main?.cgWindow, userWindow),
        panelAboveUser: above(before, stateBefore.state?.panel?.cgWindow, userWindow), panelVisible: stateBefore.state?.panel?.visible ?? null};
      row.s = before.front?.pid === userPid && before.key?.pid === fixturePid;
      row.fixtureFront = before.front?.pid === fixturePid;
      if (!prepared.act) { row.skipped = 'the preparation did not find its target in the expected window'; checkpoint(); continue; }
      const acted = await js(prepared.act);
      await sleep(SETTLE_MS);
      const stateAfter = await ask('state'), after = read();
      row.act = {ok: acted.ok, error: acted.error, at: acted.at, meta: acted.meta};
      row.after = {...brief(after), focusedWindow: stateAfter.state?.focusedWindow ?? null, counters: pageCounts(stateAfter.state),
        mainAboveUser: above(after, stateAfter.state?.main?.cgWindow, userWindow), panelAboveUser: above(after, stateAfter.state?.panel?.cgWindow, userWindow)};
      const m = acted.meta ?? {};
      const d = {main: delta(row.before.counters.main, row.after.counters.main), panel: delta(row.before.counters.panel, row.after.counters.panel)};
      const pointerEvents = ['pointerdown', 'mousedown', 'mouseup'].reduce((n, k) => n + (d.main?.[k] ?? 0) + (d.panel?.[k] ?? 0), 0);
      row.judged = {
        refusedKeyFocusOnly: m['cua/pointerRefusal']?.reason === 'keyFocusOnly',
        pointerRefusal: m['cua/pointerRefusal'] ?? null,
        carriedByElementRoute: m['cua/pointerRefusal']?.reason === 'keyFocusOnly' && acted.ok,
        errorName: m['cua/errorName'] ?? null,
        inputRoute: m['cua/inputRoute'] ?? null,
        delivery: m['cua/delivery'] ?? null,
        elementClick: m['cua/elementClick'] ?? null,
        posted: pointerEvents > 0,
        counterDelta: d,
        clicked: ((d.main?.click ?? 0) + (d.panel?.click ?? 0)) > 0,
        orderChanged: row.before.mainAboveUser !== row.after.mainAboveUser,
        mainRaisedOverUser: row.before.mainAboveUser === false && row.after.mainAboveUser === true,
        frontChanged: row.before.front?.pid !== row.after.front?.pid,
        keyChanged: row.before.key?.pid !== row.after.key?.pid,
      };
      log(`${step.scene} ${step.action} r${step.round}: S=${row.s} refused=${row.judged.refusedKeyFocusOnly} ok=${acted.ok} posted=${row.judged.posted} order ${row.before.mainAboveUser}->${row.after.mainAboveUser}${acted.ok ? '' : ` (${row.judged.errorName ?? acted.error})`}`);
    } catch (error) {
      row.error = String(error?.stack ?? error);
    }
    checkpoint();
  }
} catch (error) {
  meta.error = String(error?.stack ?? error);
  exit = 1;
} finally {
  meta.ended = new Date().toISOString();
  try { await session.close(); } catch { /* recorded by the transcript's absence */ }
  meta.serveStderrTail = String(session.stderr ?? '').split('\n').slice(-60).join('\n');
  meta.down = scenes(['down', 'all', '--run', run]);
  checkpoint();
  try { rmSync(join(run, 'reader'), {force: true}); } catch {}
}
process.exit(exit);
