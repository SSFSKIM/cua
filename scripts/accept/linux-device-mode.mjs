#!/usr/bin/env node
// Live Linux fixture for the device mode through the facade (#171 M3; docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "Device mode and the foreground route", Acceptance 6's gnome-text-editor case and Acceptance 8): over `cua serve`
// on stdio with cua's engine, it binds a gnome-text-editor window (GTK 4, a family that ignores the background route for
// coordinate clicks, keys and paste) by X11 window id, once in each device mode, and sends it a coordinate click, a key
// and typeText:
//   - `shared` (CUA_DESKTOP_MODE=shared): each refused with `<App> does not accept background input; use a dedicated
//     desktop or activate the window first`, and nothing reached the window or the desktop (its text and caret as they
//     were, the active window unchanged);
//   - `dedicated`: each takes effect through the foreground route, the window left active: typeText of Acceptance 6's
//     string returns success and the field reads back exactly that string; a BackSpace removes its last character; a
//     click near the field's start moves the caret there from the end.
// The field is read through the fixture's own accessibility reads (busctl, scripts/linux-engine-diff/oracle.mjs), never
// through the engine under test. Approvals: only the fixture window's app is accepted, once per connection. Its whole
// GUI footprint: one standalone gnome-text-editor process per mode on an empty file in a directory it creates under
// /tmp (its session state there too), ended and removed in `finally`.
// Run in the X session's environment, with cua's engine (CUA_LINUX_ENGINE_BIN names a build before its release):
//   CUA_NATIVE_ENGINE=cua node scripts/accept/linux-device-mode.mjs   JSON report; exit 0 when every step passes
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findTool} from '../../src/runtime/tools.mjs';
import {Oracle} from '../linux-engine-diff/oracle.mjs';
import {pinnedApprovals} from './lib.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
// Acceptance 6's text: Hangul, a combining acute after e, an emoji beyond the BMP, a newline.
const TEXT = 'cua171 안녕 é 🙂\nline2';
const REFUSAL = /does not accept background input; use a dedicated desktop or activate the window first/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {engine: process.env.CUA_NATIVE_ENGINE ?? null, engineBin: process.env.CUA_LINUX_ENGINE_BIN ?? null, text: TEXT, steps};
const dir = mkdtempSync('/tmp/cua-device-mode-');
const editors = [];
const activeWindow = () => /window id # (0x[0-9a-f]+)/.exec(execFileSync('xprop', ['-root', '_NET_ACTIVE_WINDOW'], {encoding: 'utf8'}))?.[1] ?? null;

// A gnome-text-editor window of the fixture's own on an empty file -> {pid, label}.
function openEditor(mode) {
  const label = `cua-device-${mode}-${randomBytes(3).toString('hex')}`;
  const file = join(dir, `${label}.txt`);
  writeFileSync(file, '');
  const child = spawn(findTool('gnome-text-editor', process.env.PATH), ['--standalone', file], {detached: true, stdio: 'ignore',
    env: {...process.env, XDG_DATA_HOME: join(dir, `${label}-data`), XDG_STATE_HOME: join(dir, `${label}-state`)}});
  editors.push(child);
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
const fieldOf = (oracle, id) => ({text: oracle.text(id), caret: oracle.caret(id)});

// One device mode: a session with CUA_DESKTOP_MODE=<mode>, its own editor, the three inputs, each judged.
async function runMode(mode, oracle) {
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
    const hex = `0x${window.windowId.toString(16)}`;
    // Each input in its own cell: what it answered, and the field and active window after it.
    const send = async (what, code) => {
      const before = {...fieldOf(oracle, field), active: activeWindow()};
      const reply = await session.js(`try { await fixtureApp.${code}; nodeRepl.write(JSON.stringify({ok: true})); } catch (e) { nodeRepl.write(JSON.stringify({ok: false, error: String(e?.message ?? e)})); }`, 60_000);
      const answer = JSON.parse(/\{"ok".*\}$/m.exec(resultText(reply))?.[0] ?? '{"ok":false,"error":"no answer"}');
      await sleep(300);
      return {what, answer, before, after: {...fieldOf(oracle, field), active: activeWindow()}};
    };
    const inputs = [
      ['click', 'click([30, 72])'],
      ['pressKey', 'pressKey("BackSpace")'],
      ['typeText', `typeText(${JSON.stringify(TEXT)})`],
    ];
    if (mode === 'shared') {
      for (const [what, code] of inputs) {
        const r = await send(what, code);
        step(`shared: ${what} is refused with the device sentence, and nothing reached the window or the desktop`,
          !r.answer.ok && REFUSAL.test(r.answer.error) && r.after.text === r.before.text && r.after.caret === r.before.caret && r.after.active === r.before.active, r);
      }
    } else {
      const typed = await send('typeText', inputs[2][1]);
      step('dedicated: typeText of Acceptance 6\'s string returns success and reads back exactly, once, the window left active',
        typed.answer.ok && typed.before.text === '' && typed.after.text === TEXT && typed.after.active !== null && windowOwns(typed.after.active, hex), typed);
      const key = await send('pressKey', inputs[1][1]);
      step('dedicated: a key takes effect (BackSpace removes the last character)', key.answer.ok && key.after.text === TEXT.slice(0, -1), key);
      const click = await send('click', inputs[0][1]);
      step('dedicated: a coordinate click takes effect (the caret moves from the end to the click, near the field\'s start)',
        click.answer.ok && click.after.caret < click.before.caret && click.after.text === key.after.text, click);
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

// Whether the active window `active` is the fixture's window `hex` or its window manager's frame around it.
function windowOwns(active, hex) {
  if (active === hex) return true;
  try { return execFileSync('xwininfo', ['-children', '-id', active], {encoding: 'utf8'}).includes(hex); } catch { return false; }
}

try {
  if (!step('preconditions', process.platform === 'linux' && !!process.env.DISPLAY && process.env.CUA_NATIVE_ENGINE === 'cua' && !!findTool('gnome-text-editor', process.env.PATH),
    {display: process.env.DISPLAY ?? null, engine: process.env.CUA_NATIVE_ENGINE ?? null})) throw new Error('preconditions');
  const oracle = new Oracle();
  await runMode('shared', oracle);
  await runMode('dedicated', oracle);
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
} finally {
  for (const child of editors) try { process.kill(child.pid, 'SIGTERM'); } catch {}
  rmSync(dir, {recursive: true, force: true});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
