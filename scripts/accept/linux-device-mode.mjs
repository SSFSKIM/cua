#!/usr/bin/env node
// Live Linux fixture for the device mode through the facade (#171 M3; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "Device mode and the foreground route", Acceptance 6's gnome-text-editor case and Acceptance 8): over `cua serve`
// on stdio with cua's engine, it binds a gnome-text-editor window (GTK 4, a family that ignores the background route for
// coordinate clicks, keys and paste) by X11 window id, once in each device mode, and sends it a coordinate click, a key
// and typeText through the real facade. Before every input a harness-owned front window covers the screen and holds the
// focus, so the editor starts behind it.
//   - `shared` (CUA_DESKTOP_MODE=shared): each input is refused with `<App> does not accept background input; use a
//     dedicated desktop or activate the window first`, nothing reaches the field, and the desktop is left alone for the
//     whole call: the differential harness's continuous witness (scripts/linux-engine-diff/witness.mjs: root property,
//     restack and focus events in order, the focus and the pointer sampled every 5 ms) judges the span strictly.
//   - `dedicated`: each input takes effect through the foreground route: typeText of Acceptance 6's string reads back
//     exactly, a BackSpace removes its last character, a click near the field's start moves the caret there. The witness
//     must show the editor brought forward from behind the front window (only the target activated, raised and focused,
//     `judgeForegroundSpan`), and the editor is active and above the front window at the end.
// Two negative controls run beside them, and the fixture's own judges must fail both: a shared call during which the
// harness activates the editor and restores the front window, and a dedicated call that activates nothing (a read).
// The field is read through the fixture's own accessibility reads (busctl, scripts/linux-engine-diff/oracle.mjs), never
// through the engine under test. Approvals: only the fixture window's app is accepted, once per connection. Its whole
// GUI footprint: the front xterm and one standalone gnome-text-editor process per mode on an empty file in a directory it
// creates under /tmp (its session state there too). Each process is ended and its exit awaited (bounded, then SIGKILL),
// the directory removed after that, and a cleanup that fails fails the run.
// Needs the harness's xprobe built (cargo build --release in scripts/linux-engine-diff/xprobe). Run in the X session's
// environment, with cua's engine (CUA_LINUX_ENGINE_BIN names a build before its release):
//   CUA_NATIVE_ENGINE=cua node scripts/accept/linux-device-mode.mjs   JSON report; exit 0 when every step passes
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findTool} from '../../src/runtime/tools.mjs';
import {toplevel, within} from '../linux-engine-diff/clip.mjs';
import {Oracle} from '../linux-engine-diff/oracle.mjs';
import {XPROBE, configure} from '../linux-engine-diff/scenes.mjs';
import {judgeForegroundSpan, judgeSpan, startWitness} from '../linux-engine-diff/witness.mjs';
import {pinnedApprovals} from './lib.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
// Acceptance 6's text: Hangul, a combining acute after e, an emoji beyond the BMP, a newline.
const TEXT = 'cua171 안녕 é 🙂\nline2';
const REFUSAL = /does not accept background input; use a dedicated desktop or activate the window first/;
// How long a span stays open after the call answers: a change the request caused late still falls inside it.
const QUIET_MS = 300;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {engine: process.env.CUA_NATIVE_ENGINE ?? null, engineBin: process.env.CUA_LINUX_ENGINE_BIN ?? null, text: TEXT, steps};
const dir = mkdtempSync('/tmp/cua-device-mode-');
const owned = [];   // {what, child}: every process the fixture started
const hex = id => `0x${Number(id).toString(16)}`;
const activeWindow = () => /window id # (0x[0-9a-f]+)/.exec(execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], {encoding: 'utf8'}))?.[1] ?? null;
const stacking = () => (/# (.*)$/.exec(execFileSync('xprop', ['-root', '_NET_CLIENT_LIST_STACKING'], {encoding: 'utf8'}).trim())?.[1] ?? '').split(', ').filter(Boolean);
// Whether client window `a` is above client window `b` in the managed stacking order (bottom first).
const above = (a, b) => { const order = stacking(); return order.indexOf(hex(a)) > order.indexOf(hex(b)) && order.includes(hex(b)); };
// Whether the active window is window `id` itself (the window manager names the client window).
const activeIs = id => activeWindow() === hex(id);

function spawnOwned(what, command, args, options = {}) {
  const child = spawn(command, args, {stdio: 'ignore', ...options});
  owned.push({what, child});
  return child;
}

// The X window whose title is exactly `title`, polled.
async function windowTitled(title) {
  for (let i = 0; i < 80; i++) {
    try {
      const ids = execFileSync('xdotool', ['search', '--name', `^${title}$`], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
      if (ids.length === 1) return Number(ids[0]);
    } catch {}
    await sleep(250);
  }
  throw new Error(`no single window titled ${title}`);
}

// The front window: an xterm of the fixture's own over the whole screen, holding the focus.
async function openFront() {
  const title = `cua-device-front-${randomBytes(3).toString('hex')}`;
  spawnOwned('front xterm', findTool('xterm', process.env.PATH), ['-T', title, '-e', 'sleep', '86400']);
  const id = await windowTitled(title);
  configure(id, 0, 0, 1280, 800);
  return id;
}
const frontToTop = front => execFileSync('xdotool', ['windowactivate', '--sync', String(front)]);

// A gnome-text-editor window of the fixture's own on an empty file -> {pid, label}.
function openEditor(mode) {
  const label = `cua-device-${mode}-${randomBytes(3).toString('hex')}`;
  const file = join(dir, `${label}.txt`);
  writeFileSync(file, '');
  const child = spawnOwned(`gnome-text-editor (${mode})`, findTool('gnome-text-editor', process.env.PATH), ['--standalone', file],
    {env: {...process.env, XDG_DATA_HOME: join(dir, `${label}-data`), XDG_STATE_HOME: join(dir, `${label}-state`)}});
  return {pid: child.pid, label};
}

// The editor's document through the fixture's own reads: the largest editable text object of its own frame.
async function findField(oracle, editor) {
  for (let i = 0; i < 40; i++) {
    try {
      const frames = oracle.appsOf(editor.pid).flatMap(app => oracle.children(app)).filter(f => String(oracle.name(f)).includes(editor.label));
      let best = null;
      for (const n of frames.flatMap(f => oracle.walk(f)).filter(x => ['text', 'text box', 'entry'].includes(x.role))) {
        try {
          if (!oracle.states(n.id).editable) continue;
          const e = oracle.extents(n.id);
          if (!best || e.w * e.h > best.area) best = {id: n.id, area: e.w * e.h};
        } catch {}
      }
      if (best) return best.id;
    } catch {}
    await sleep(250);
  }
  throw new Error(`${editor.label} has no editable text the fixture can read`);
}

// What a span's report shows, briefly, for the record.
const shown = r => ({changes: (r.changes ?? []).slice(0, 8), restacks: (r.restacks ?? []).length, focus: (r.focus ?? []).length, samples: r.samples});

// The judges. Shared: refused, the field as it was, the witness strict and clean, the front window still in front.
function sharedHeld(r) {
  return !r.answer.ok && REFUSAL.test(r.answer.error ?? '') && r.after.text === r.before.text && r.after.caret === r.before.caret
    && r.strict.clean && r.after.frontActive && r.after.frontAbove;
}
// Dedicated: the input's effect, and the editor brought forward from behind the front window: the foreground allowance
// clean with the activation and the raise among what changed, the editor active and above the front window at the end.
function dedicatedHeld(r, effect) {
  return r.answer.ok && effect && r.before.frontAbove && r.foreground.clean && r.foreground.allowed.includes('active')
    && r.foreground.allowed.includes('stacking') && r.after.targetActive && !r.after.frontAbove;
}

// One device mode: a session with CUA_DESKTOP_MODE=<mode>, its own editor behind the front window, the three inputs
// and the mode's negative control, each in a witnessed span.
async function runMode(mode, {oracle, witness, front}) {
  const editor = openEditor(mode);
  const pinned = new Set(), asked = [];
  const session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_DESKTOP_MODE: mode, CUA_SHIM_PERSIST: 'session'}, clientName: `cua-device-mode-${mode}`,
    onServerRequest: pinnedApprovals(() => pinned, asked)});
  try {
    await session.initialize();
    const find = await session.js(`const deadline = Date.now() + 20000; let win;
      while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => (w.title ?? '').includes(${JSON.stringify(editor.label)})); if (!win) await new Promise(r => setTimeout(r, 500)); }
      if (!win) throw new Error('the fixture window did not appear');
      globalThis.fixtureWindow = win; nodeRepl.write(JSON.stringify({windowId: win.id, app: win.app}));`, 90_000);
    const found = /\{"windowId".*\}$/m.exec(resultText(find))?.[0];
    const window = found ? JSON.parse(found) : null;
    if (typeof window?.app === 'string' && window.app) pinned.add(window.app);
    const bind = window && await session.js(`globalThis.fixtureApp = await cua.getApp({windowId: fixtureWindow.id}); nodeRepl.write('{"bound":true}');`, 90_000);
    if (!step(`${mode}: bind the gnome-text-editor window by X11 id`, !!window && !bind?.result?.isError && /"bound":true/.test(bind ? resultText(bind) : ''), window ?? resultText(find).slice(0, 600)))
      throw new Error('bind');
    const field = await findField(oracle, editor);
    const target = window.windowId;
    const frame = toplevel(target);
    const desk = () => ({active: activeWindow(), frontActive: activeIs(front), targetActive: activeIs(target), frontAbove: above(front, target)});
    // Each input in its own witnessed span, the front window brought back on top (outside every span) before it: the
    // answer, the field and the desktop before and after, and the span judged both strictly and by the foreground
    // allowance. `meanwhile` runs inside the span after the call (the negative control's own desktop change).
    const send = async (what, code, meanwhile) => {
      frontToTop(front);
      await sleep(QUIET_MS);
      const before = {text: oracle.text(field), caret: oracle.caret(field), ...desk()};
      const {value: reply, report: span} = await witness.span(`${mode}:${what}`, async () => {
        const answer = await session.js(`try { await fixtureApp.${code}; nodeRepl.write(JSON.stringify({ok: true})); } catch (e) { nodeRepl.write(JSON.stringify({ok: false, error: String(e?.message ?? e)})); }`, 60_000);
        if (meanwhile) await meanwhile();
        await sleep(QUIET_MS);
        return answer;
      });
      const answer = JSON.parse(/\{"ok".*\}$/m.exec(resultText(reply))?.[0] ?? '{"ok":false,"error":"no answer"}');
      return {what, answer, before, after: {text: oracle.text(field), caret: oracle.caret(field), ...desk()},
        strict: judgeSpan(span), foreground: judgeForegroundSpan(span, {target, frame, focusWithin: w => within(w, target)}), span: shown(span)};
    };
    const activateAndRestore = async () => {
      execFileSync('xdotool', ['windowactivate', '--sync', String(target)]);
      await sleep(50);
      frontToTop(front);
    };
    if (mode === 'shared') {
      for (const [what, code] of [['click', 'click([30, 72])'], ['pressKey', 'pressKey("BackSpace")'], ['typeText', `typeText(${JSON.stringify(TEXT)})`]]) {
        const r = await send(what, code);
        step(`shared: ${what} is refused with the device sentence; nothing reached the field, and the witness saw the desktop left alone for the whole call`, sharedHeld(r), r);
      }
      const control = await send('control', `typeText(${JSON.stringify(TEXT)})`, activateAndRestore);
      step('shared, negative control: the editor activated and the front window restored during a shared call fails the shared judge', !sharedHeld(control) && !control.strict.clean, control);
    } else {
      const typed = await send('typeText', `typeText(${JSON.stringify(TEXT)})`);
      step('dedicated: typeText of Acceptance 6\'s string reads back exactly, once, and the witness saw the editor brought forward from behind the front window',
        dedicatedHeld(typed, typed.before.text === '' && typed.after.text === TEXT), typed);
      const key = await send('pressKey', 'pressKey("BackSpace")');
      step('dedicated: a key takes effect (BackSpace removes the last character), the editor brought forward again', dedicatedHeld(key, key.after.text === TEXT.slice(0, -1)), key);
      const click = await send('click', 'click([30, 72])');
      step('dedicated: a coordinate click takes effect (the caret moves from the end to the click, near the field\'s start), the editor brought forward again',
        dedicatedHeld(click, click.after.caret < click.before.caret && click.after.text === key.after.text), click);
      const control = await send('control', 'getAXState({emit: false})');
      step('dedicated, negative control: a call that activates nothing fails the dedicated judge, even granted its effect', control.answer.ok && !dedicatedHeld(control, true), control);
    }
    const ended = await session.call('end_task');
    step(`${mode}: end_task`, ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
    const approvals = asked.filter(a => a.method === 'elicitation/create');
    step(`${mode}: the window's app was asked once and accepted, nothing else asked`, approvals.length === 1 && approvals[0].app === window.app && approvals[0].action === 'accept',
      {asked: approvals, otherRequests: asked.length - approvals.length});
  } finally {
    const exit = await session.terminate();
    step(`${mode}: cua serve exited cleanly`, exit.code === 0 && !exit.forced, exit);
  }
}

// Ends an owned process and waits for its exit: SIGTERM, up to `ms`, then SIGKILL, up to 2 s more.
// -> {what, pid, outcome: 'already gone' | 'terminated' | 'killed' | 'still running'}.
async function terminate({what, child}, ms = 5000) {
  const gone = () => child.exitCode !== null || child.signalCode !== null;
  const exited = new Promise(resolve => { if (gone()) resolve(); else child.once('exit', resolve); });
  const wait = limit => Promise.race([exited.then(() => true), sleep(limit).then(() => false)]);
  if (gone()) return {what, pid: child.pid, outcome: 'already gone'};
  try { child.kill('SIGTERM'); } catch {}
  if (await wait(ms)) return {what, pid: child.pid, outcome: 'terminated'};
  try { child.kill('SIGKILL'); } catch {}
  return {what, pid: child.pid, outcome: (await wait(2000)) ? 'killed' : 'still running'};
}

let witness = null;
try {
  if (!step('preconditions', process.platform === 'linux' && !!process.env.DISPLAY && process.env.CUA_NATIVE_ENGINE === 'cua'
    && !!findTool('gnome-text-editor', process.env.PATH) && !!findTool('xterm', process.env.PATH) && existsSync(XPROBE),
    {display: process.env.DISPLAY ?? null, engine: process.env.CUA_NATIVE_ENGINE ?? null, xprobe: existsSync(XPROBE)})) throw new Error('preconditions');
  const oracle = new Oracle();
  witness = await startWitness(XPROBE);
  const front = await openFront();
  await runMode('shared', {oracle, witness, front});
  await runMode('dedicated', {oracle, witness, front});
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
} finally {
  const ended = [];
  for (const entry of owned) ended.push(await terminate(entry));
  let witnessStopped = true;
  if (witness) try { await Promise.race([witness.stop(), sleep(5000).then(() => { throw new Error('the witness did not stop'); })]); } catch { witnessStopped = false; }
  let removed = null;
  try { rmSync(dir, {recursive: true, force: true}); removed = !existsSync(dir); } catch (error) { removed = String(error.message); }
  step('cleanup: every process the fixture started has exited, the witness stopped, and its directory removed after them',
    ended.every(e => e.outcome !== 'still running') && witnessStopped && removed === true, {processes: ended, witnessStopped, removed});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
