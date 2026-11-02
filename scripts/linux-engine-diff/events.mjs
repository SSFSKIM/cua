// The input events experiment (Design, Input: "the same press_key, key_down and key_up sequences produce the same X
// key events in both engines"; Clicks, scroll, drag, move: "kept exactly"): every engine gets the same request
// sequences against a recorder window (`xprobe record`) on a private X server the experiment starts itself (Xvfb),
// so the desktop route's XTEST input reaches nobody's desktop. Per scenario and engine it records each request's
// answer and every event the recorder received, and compares them with the pinned build's, event by event: type,
// whether it was sent (SendEvent) or real, detail (keycode or button), state, the window it went to and its
// coordinates. Timestamps are not compared (each engine anchors its own).
//
// The newest vendor build presses a chord's keys back to back where the pinned one paces them (behaviour §11.3),
// and cua paces them not at all; the events and their order are the same, which is what this checks.

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { desktopEntry } from './desktop-entry.mjs';
import { SPEED_GAPS, declaredDeviation, declaredSpeedGap } from './deviations.mjs';
import { Engine } from './engine.mjs';
import { XPROBE } from './scenes.mjs';
import { median, noiseVerdict, speedLabel } from './stats.mjs';
import { VendorJsEngine } from './vendor-js.mjs';

/** The verdicts of a passing group (stats.mjs `speedLabel`). */
const PASSING = ['faster', 'same (within noise)', 'within the bound'];

/** The recorder's top-level window on the private screen (root coordinates); its child covers the lower-right quarter. */
export const RECORDER = { x: 100, y: 100, width: 800, height: 600 };
/** Where the real pointer is put before each desktop scenario: inside the top-level, outside its child. */
export const POINTER_START = [300, 300];

const W = '$W';
const k = (key, extra = {}) => ({ command: 'press_key', input: { window: W, key, ...extra } });
const down = (key, window = W) => ({ command: 'key_down', input: window ? { window, key } : { key } });
const up = (key, window = W) => ({ command: 'key_up', input: window ? { window, key } : { key } });
const desk = (step) => {
  const { window, ...input } = step.input;
  return { ...step, input };
};

/** Shortcuts whose case must not change what is pressed (`Z` is z without Shift; `Ctrl+Z` stays undo). */
const MIXED_CASE = ['a', 'A', 'z', 'Z', 'shift+z', 'Shift+Z', 'ctrl+z', 'Ctrl+Z', 'CTRL+z', 'Ctrl+Shift+Z', 'ctrl+shift+t', 'Ctrl+Shift+T', 'XK_Return', 'Return', 'alt+F5', 'Ctrl+Alt+Shift+A', 'super+L'];
/** Keysyms the layout puts at level 1 (Shift synthesized), duplicates and the plus-sign grammar. */
const GRAMMAR = ['!', '@', 'shift+!', '!+@', 'ctrl++', '+', 'a+a', '<', 'kp_enter', 'f12', 'space', 'Escape'];

/** The scenarios: a name, the route, and the steps (`$W` is the recorder window). */
export function scenarios() {
  const keys = [
    ...MIXED_CASE.map((key) => ({ name: `press_key ${key}`, steps: [k(key)] })),
    ...GRAMMAR.map((key) => ({ name: `press_key ${key}`, steps: [k(key)] })),
    { name: 'press_key with duration', steps: [k('ctrl+a', { duration: 50 })] },
    { name: 'press_key bad key', steps: [k('ctrl+bogus')] },
    { name: 'press_key empty', steps: [k('')] },
    { name: 'held ctrl around press_key a', steps: [down('ctrl'), k('a'), up('ctrl')] },
    { name: 'held Ctrl around press_key Shift+Z', steps: [down('Ctrl'), k('Shift+Z'), up('Ctrl')] },
    { name: 'two holds sharing ctrl', steps: [down('ctrl+a'), down('ctrl+b'), up('ctrl+a'), up('ctrl+b')] },
    { name: 'a repeated hold is one hold', steps: [down('shift'), down('shift'), up('shift'), up('shift')] },
    { name: 'key_up of nothing held', steps: [up('ctrl')] },
    { name: 'a hold is named by its normalized chord', steps: [down('Ctrl+A'), up('control_l+xk_a')] },
    { name: 'order makes a different hold', steps: [down('ctrl+shift'), up('shift+ctrl'), up('ctrl+shift')] },
    { name: 'held shift under a click chord', steps: [down('shift'), { command: 'click', input: { window: W, x: 20, y: 20, key: 'ctrl' } }, up('shift')] },
    { name: 'bad keys in holds', steps: [down('bogus'), up('bogus'), down(''), up('')] },
    { name: 'holds left at exit are released with their state', steps: [down('ctrl+shift'), down('alt')] },
    { name: 'held key across another window request', steps: [down('alt'), { command: 'move', input: { window: W, x: 30, y: 30 } }, k('x'), up('alt')] },
  ];
  const pointer = [
    { name: 'click', steps: [{ command: 'click', input: { window: W, x: 10, y: 10 } }] },
    { name: 'click in the child', steps: [{ command: 'click', input: { window: W, x: 450, y: 350 } }] },
    { name: 'right click', steps: [{ command: 'click', input: { window: W, x: 10, y: 10, mouse_button: 'right' } }] },
    { name: 'middle double click held 0', steps: [{ command: 'click', input: { window: W, x: 10, y: 10, mouse_button: 'm', click_count: 2, duration: 0 } }] },
    { name: 'click with a chord', steps: [{ command: 'click', input: { window: W, x: 10, y: 10, key: 'ctrl+shift' } }] },
    { name: 'click outside the window', steps: [{ command: 'click', input: { window: W, x: 900, y: 10 } }] },
    { name: 'click validation', steps: [{ command: 'click', input: { window: W, x: 10 } }, { command: 'click', input: { window: W } }, { command: 'click', input: { window: W, x: 10, y: 10, key: 'bogus' } }] },
    { name: 'move', steps: [{ command: 'move', input: { window: W, x: 10, y: 10 } }, { command: 'move', input: { window: W, x: 450, y: 350, key: 'shift' } }] },
    { name: 'scroll at the centre', steps: [{ command: 'scroll', input: { window: W, direction: 'down' } }] },
    { name: 'scroll at a point', steps: [{ command: 'scroll', input: { window: W, direction: 'up', pixels: 120, x: 10, y: 10 } }, { command: 'scroll', input: { window: W, direction: 'l', pixels: 150, x: 10, y: 10 } }, { command: 'scroll', input: { window: W, direction: 'right', pixels: 50, x: 10, y: 10, key: 'shift' } }] },
    { name: 'scroll validation', steps: [{ command: 'scroll', input: { window: W, direction: 'down', pixels: 0 } }, { command: 'scroll', input: { window: W, direction: 'down', x: 10 } }, { command: 'scroll', input: { window: W, direction: 'down', pixels: 0, x: 10, y: 10 } }, { command: 'scroll', input: { window: W, direction: 'down', element_id: ':1.1/x', x: 1, y: 1 } }] },
    { name: 'drag', steps: [{ command: 'drag', input: { window: W, path: [{ x: 10, y: 10 }, { x: 30, y: 17 }, { x: 450, y: 350 }] } }] },
    { name: 'a bad chord on move, scroll and drag', steps: [{ command: 'move', input: { window: W, x: 10, y: 10, key: 'bogus' } }, { command: 'scroll', input: { window: W, direction: 'down', key: 'bogus' } }, { command: 'drag', input: { window: W, path: [{ x: 10, y: 10 }, { x: 12, y: 12 }], key: 'bogus' } }] },
    // the child destroys itself on its ButtonPress (`xprobe record … fragile`): the request is interrupted, and the
    // window session a held key keeps must still serve the next request in the live parent. Which X request meets
    // the destroyed child first is a race with the recorder, so the interrupted step must be an interruption in both
    // lanes (`interruptedStep`): failed with an X Window error after the child received button 1, its events equal
    // up to that press and the failing request's name free; the steps after it are compared exactly.
    { name: 'an interrupted drag under a held key, then a move', fragile: true, steps: [down('ctrl'), { command: 'drag', input: { window: W, path: [{ x: 450, y: 350 }, { x: 460, y: 360 }] }, interrupted: true }, { command: 'move', input: { window: W, x: 10, y: 10 } }, up('ctrl')] },
    { name: 'an interrupted click under a held key, then a move', fragile: true, steps: [down('ctrl'), { command: 'click', input: { window: W, x: 450, y: 350 }, interrupted: true }, { command: 'move', input: { window: W, x: 10, y: 10 } }, { command: 'click', input: { window: W, x: 10, y: 10 } }, up('ctrl')] },
    // the recorder's top-level destroys itself on its KeyPress (`xprobe record … fragile-key`), so the held key's
    // release meets a window that is gone: the pinned build answers success, cua the X error (a declared deviation,
    // deviations.mjs `interrupted_hold`; Decision Log, M0.2)
    { name: 'a key hold whose window is destroyed', fragileKey: true, deviation: 'interrupted_hold', steps: [k('a', { duration: 200 })] },
    { name: 'drag with a chord, and a short path', steps: [{ command: 'drag', input: { window: W, path: [{ x: 10, y: 10 }, { x: 13, y: 14 }], key: 'alt' } }, { command: 'drag', input: { window: W, path: [{ x: 10, y: 10 }] } }] },
  ];
  const desktop = [
    ...['a', 'Z', 'Ctrl+Z', '!', 'ctrl++', 'a+a'].map((key) => ({ name: `desktop press_key ${key}`, steps: [desk(k(key))] })),
    { name: 'desktop press_key bad key', steps: [desk(k('ctrl+bogus'))] },
    { name: 'desktop held ctrl around press_key a', steps: [down('ctrl', null), desk(k('a')), up('ctrl', null)] },
    { name: 'desktop two holds sharing ctrl', steps: [down('ctrl+a', null), down('ctrl+b', null), up('ctrl+a', null), up('ctrl+b', null)] },
    { name: 'desktop holds left at exit', steps: [down('ctrl+shift', null)] },
    { name: 'desktop hold and a window hold are apart', steps: [down('ctrl', null), up('ctrl'), up('ctrl', null)] },
    { name: 'desktop click', steps: [{ command: 'click', input: { x: 200, y: 200 } }] },
    { name: 'desktop click in place', steps: [{ command: 'click', input: {} }, { command: 'click', input: { mouse_button: 'right', click_count: 2, key: 'shift' } }] },
    { name: 'desktop click far', steps: [{ command: 'click', input: { x: 850, y: 650, key: 'ctrl' } }] },
    { name: 'desktop move', steps: [{ command: 'move', input: { x: 700, y: 500 } }, { command: 'move', input: { x: 700, y: 500 } }, { command: 'move', input: { x: 710, y: 498, key: 'alt' } }] },
    { name: 'desktop move_relative', steps: [{ command: 'move_relative', input: { dx: 10, dy: -5 } }, { command: 'move_relative', input: { dx: -3, dy: 4, key: 'shift' } }, { command: 'move_relative', input: { dx: 1, dy: 1, x: 3 } }] },
    { name: 'desktop scroll', steps: [{ command: 'scroll', input: { direction: 'down', pixels: 240 } }, { command: 'scroll', input: { direction: 'u', x: 600, y: 450, key: 'ctrl' } }] },
    { name: 'desktop drag', steps: [{ command: 'drag', input: { path: [{ x: 200, y: 200 }, { x: 230, y: 215 }, { x: 600, y: 500 }] } }] },
    { name: 'desktop drag short path', steps: [{ command: 'drag', input: { path: [{ x: 200, y: 200 }] } }] },
    { name: 'drag_handle', steps: [{ command: 'drag_handle', input: { action: 'start', x: 200, y: 200 } }, { command: 'drag_handle', input: { action: 'move_to', x: 300, y: 260 } }, { command: 'drag_handle', input: { action: 'end' } }] },
    { name: 'drag_handle stray end', steps: [{ command: 'drag_handle', input: { action: 'end' } }] },
  ];
  // type_characters is the newest build's command (the pinned one has none): judged against the newest build. A
  // refusal is one per scenario, since a declared deviation excuses one step's answer.
  const tc = (text) => ({ command: 'type_characters', input: { window: W, text } });
  const typing = [
    { name: 'type_characters mixed case, digits and shifted symbols', steps: [tc(' AbZ09!?'), tc('<>|aa')] },
    { name: 'type_characters empty', steps: [tc('')] },
    ...[
      ['a character off the layout', 'aé'],
      ['a control character', 'ab\ncd'],
      ['a combining mark', 'x́'],
      ['a character beyond Latin-1', 'Ω'],
    ].map(([what, text]) => ({ name: `type_characters refuses ${what} before typing anything`, deviation: 'type_characters', steps: [tc(text)] })),
  ].map((s) => ({ ...s, reference: 'newest' }));
  const activation = [{ name: 'activate_window', steps: [{ command: 'activate_window', input: { window: W } }] }];
  // launch_app against the experiment's own desktop entry only (no system entries): its program touches a file
  const launch = [{ name: 'launch_app', apps: true, steps: ['Events Probe', 'events-probe', ' EVENTS-PROBE.desktop ', 'missing', '  '].map((app) => ({ command: 'launch_app', input: { app } })) }];
  return [
    ...keys.map((s) => ({ ...s, route: 'window' })),
    ...typing.map((s) => ({ ...s, route: 'window' })),
    ...pointer.map((s) => ({ ...s, route: 'window' })),
    ...desktop.map((s) => ({ ...s, route: 'desktop' })),
    ...activation.map((s) => ({ ...s, route: 'window' })),
    ...launch.map((s) => ({ ...s, route: 'window' })),
  ];
}

const last = (events, type) => events.filter((e) => e.type === type).at(-1);
const at = (e, x, y) => Boolean(e) && e.root_x === x && e.root_y === y;
/** The pointer moved by (dx, dy) from where it was, read on the private server (`xdotool getmouselocation`). */
const movedBy = (dx, dy) => ({ before, after }) => after[0] === before[0] + dx && after[1] === before[1] + dy;
/** Button 1 pressed (not sent) with the pointer at (x, y). */
const pressedAt = (x, y) => ({ after, events }) => at(last(events, 'ButtonPress'), x, y) && last(events, 'ButtonPress').detail === 1 && after[0] === x && after[1] === y;
/** The pointer at (x, y), its last motion there with button 1 held (state Button1Mask). */
const heldTo = (x, y) => ({ after, events }) => {
  const m = last(events, 'MotionNotify');
  return at(m, x, y) && (m.state & 256) !== 0 && after[0] === x && after[1] === y;
};
/** Button 1 released at (x, y). */
const releasedAt = (x, y) => ({ events }) => {
  const r = last(events, 'ButtonRelease');
  return at(r, x, y) && r.detail === 1;
};

/**
 * The desktop-only commands through OpenAI's JavaScript client (`--experiment events --via vendor-js`): only
 * well-formed requests (the client validates before the engine sees anything), each step with its effect read back
 * on the private server.
 */
export const VENDOR_JS_SCENARIOS = [
  {
    name: 'desktop move_relative',
    route: 'desktop',
    steps: [
      { command: 'move_relative', input: { dx: 10, dy: -5 }, effect: movedBy(10, -5) },
      { command: 'move_relative', input: { dx: -3, dy: 4, key: 'shift' }, effect: movedBy(-3, 4) },
    ],
  },
  {
    name: 'drag_handle',
    route: 'desktop',
    steps: [
      { command: 'drag_handle', input: { action: 'start', x: 200, y: 200 }, effect: pressedAt(200, 200) },
      { command: 'drag_handle', input: { action: 'move_to', x: 300, y: 260 }, effect: heldTo(300, 260) },
      { command: 'drag_handle', input: { action: 'end' }, effect: releasedAt(300, 260) },
    ],
  },
];

/**
 * The effect-bearing steps (those with an effect read) where the candidate did not take effect, whatever the vendor
 * builds did on them (Decision Log, M1a.4: cua's effect is judged absolutely); a step the candidate lacks is a miss.
 */
export function effectMisses(steps, records, candidate) {
  return steps.flatMap((step, i) => (step.effect && records[candidate]?.[i]?.effect !== true ? [i] : []));
}

/**
 * A scenario's effect verdict: each candidate's misses, failing on any; a scenario whose effect no vendor build took
 * fails too, since its reader then proves nothing.
 */
export function judgeScenarioEffects(steps, records, candidates) {
  const misses = Object.fromEntries(candidates.map((label) => [label, effectMisses(steps, records, label)]));
  const vendorTook = ['pinned', 'newest'].some((v) => records[v]?.some((s) => s.effect === true));
  return { pass: vendorTook && Object.values(misses).every((m) => m.length === 0), misses };
}

function pointerOn(env) {
  const text = execFileSync('xdotool', ['getmouselocation', '--shell'], { env, encoding: 'utf8' });
  const value = (key) => Number(text.match(new RegExp(`^${key}=(-?\\d+)`, 'm'))?.[1]);
  return [value('X'), value('Y')];
}

/** The event fields compared across engines (not the timestamp). */
export function normalizeEvent(event) {
  const { time, ...rest } = event;
  return rest;
}

/** Replaces the recorder placeholder in a step's input. */
export function bindStep(step, window) {
  const input = Object.fromEntries(Object.entries(step.input).map(([key, value]) => [key, value === W ? { id: window } : value]));
  return { command: step.command, input };
}

/** Whether a recorded event is the child's button-1 press, the event on which a fragile recorder destroys it. */
const childPress = (e) => e.type === 'ButtonPress' && e.window === 'child' && e.detail === 1;

/**
 * An interrupted step, reduced to what two lanes must share: the answer as its class (failed, an X Window error, the
 * child pressed with button 1 before it) and the events up to and including that press. What follows the press is
 * the race with the recorder's destruction, and is kept apart (`suffix`), as is the failing request's name.
 */
export function interruptedStep(response, events) {
  const press = events.findIndex(childPress);
  return {
    answer: { ok: response.ok, x_window_error: !response.ok && /error_kind: Window\b/.test(String(response.error)), child_pressed: press >= 0 },
    events: press >= 0 ? events.slice(0, press + 1) : events,
    suffix: press >= 0 ? events.slice(press + 1) : [],
  };
}

/** The answer an interrupted step must have, in the reference as in the candidate. */
export const INTERRUPTED = { ok: false, x_window_error: true, child_pressed: true };

/** One engine's answer, reduced to what is compared: success, or the error with the X sequence number masked. */
export function normalizeAnswer(response) {
  if (response.ok) return { ok: true, output: response.output };
  return { ok: false, error: String(response.error).replace(/sequence: \d+/g, 'sequence: N').replace(/\b\d{5,}\b/g, '<id>') };
}

/** The first difference between two scenario records (`{answers, events}` per step), or null. */
export function firstDifference(reference, candidate) {
  for (let i = 0; i < reference.length; i++) {
    const [a, b] = [reference[i], candidate[i]];
    if (!b) return { step: i, what: 'missing step' };
    // an interruption scenario proves nothing unless the reference was interrupted as planned
    if (a.interrupted && JSON.stringify(a.answer) !== JSON.stringify(INTERRUPTED)) return { step: i, what: 'reference not interrupted', reference: a.answer };
    if (JSON.stringify(a.answer) !== JSON.stringify(b.answer)) return { step: i, what: 'answer', reference: a.answer, candidate: b.answer };
    const n = Math.max(a.events.length, b.events.length);
    for (let j = 0; j < n; j++) {
      const [ea, eb] = [a.events[j], b.events[j]];
      if (JSON.stringify(ea) !== JSON.stringify(eb)) return { step: i, what: 'event', index: j, reference: ea ?? null, candidate: eb ?? null };
    }
  }
  return null;
}

/**
 * A private X server: `Xvfb -displayfd`, so the display number is the server's choice; `-noreset`, so it does not
 * reset (and recompile its keymap) each time its last client leaves; its output not piped, since a full pipe would
 * stall the keymap compiler and with it the server.
 */
async function startServer() {
  const child = spawn('Xvfb', ['-displayfd', '3', '-noreset', '-screen', '0', '1280x800x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  const display = await new Promise((resolve, reject) => {
    let text = '';
    child.stdio[3].on('data', (chunk) => {
      text += chunk;
      if (text.includes('\n')) resolve(`:${text.trim()}`);
    });
    child.once('exit', (code) => reject(new Error(`Xvfb exited (${code})`)));
  });
  return { display, stop: () => child.kill('SIGTERM') };
}

class Recorder {
  constructor(env, { focus = false, fragile = false, fragileKey = false } = {}) {
    const { x, y, width, height } = RECORDER;
    const flags = [...(focus ? ['focus'] : []), ...(fragile ? ['fragile'] : []), ...(fragileKey ? ['fragile-key'] : [])];
    this.child = spawn(XPROBE, ['record', String(x), String(y), String(width), String(height), ...flags], { env, stdio: ['pipe', 'pipe', 'inherit'] });
    this.lines = [];
    this.waiters = [];
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const message = JSON.parse(line);
      this.lines.push(message);
      for (const waiter of this.waiters.splice(0)) waiter();
    });
  }

  async next(match) {
    for (;;) {
      const index = this.lines.findIndex(match);
      if (index >= 0) return this.lines.splice(0, index + 1);
      await new Promise((resolve) => this.waiters.push(resolve));
    }
  }

  async ready() {
    const [ready] = (await this.next((m) => m.ready)).slice(-1);
    return ready.window;
  }

  /** The events received since the last mark. */
  async mark(tag) {
    this.child.stdin.write(`mark ${tag}\n`);
    const lines = await this.next((m) => m.mark === tag);
    return lines.filter((m) => m.type).map(normalizeEvent);
  }

  async close() {
    this.child.stdin.end();
    await new Promise((resolve) => this.child.once('exit', resolve));
  }
}

/**
 * Runs one scenario on one engine: a fresh recorder and engine process (or, through the vendor JavaScript, a fresh
 * client's engine), the pointer put at its start. A step with an `effect` has it judged from the pointer read before
 * and after it and the events the recorder received.
 */
async function runScenario(scenario, engine, env, { via = 'wire', skyDir } = {}) {
  execFileSync('xdotool', ['mousemove', String(POINTER_START[0]), String(POINTER_START[1])], { env });
  const recorder = new Recorder(env, { focus: scenario.route === 'desktop', fragile: scenario.fragile, fragileKey: scenario.fragileKey });
  const window = await recorder.ready();
  const engineEnv = scenario.apps ? { ...env, XDG_DATA_HOME: env.EVENTS_APPS, XDG_DATA_DIRS: '' } : env;
  const process_ = (via === 'vendor-js' ? new VendorJsEngine({ label: engine.label, bin: engine.bin, skyDir, env: engineEnv }) : new Engine({ label: engine.label, bin: engine.bin, args: engine.args ?? [], env: engineEnv })).start();
  const steps = [];
  try {
    for (const [i, step] of scenario.steps.entries()) {
      const { command, input } = bindStep(step, window);
      const before = step.effect ? pointerOn(env) : null;
      const { response, ms } = await process_.request(command, input, { timeoutMs: 30000 });
      const events = await recorder.mark(`step-${i}`);
      const timed = { ms: Math.round(ms * 100) / 100, first: i === 0 };
      const effect = step.effect ? { effect: response.ok === true && step.effect({ before, after: pointerOn(env), events }) } : {};
      if (step.interrupted) steps.push({ command, interrupted: true, ...interruptedStep(response, events), raw: normalizeAnswer(response), ...timed });
      else steps.push({ command, answer: normalizeAnswer(response), events, ...timed, ...effect });
    }
    await process_.close();
    steps.push({ command: 'exit', answer: { ok: true }, events: await recorder.mark('exit') });
    if (scenario.apps) {
      // the launched program's effect, then cleared for the next engine
      const launched = join(env.EVENTS_APPS, '..', 'launched');
      for (let i = 0; i < 100 && !existsSync(launched); i++) await new Promise((r) => setTimeout(r, 10));
      steps.push({ command: 'launched', answer: { ok: existsSync(launched) }, events: [] });
      rmSync(launched, { force: true });
    }
  } finally {
    await process_.close();
    await recorder.close();
  }
  return steps;
}

/** A speed group is judged only when every engine has at least this many samples in it; a smaller one is recorded. */
export const MIN_JUDGED = 20;

/** A seeded generator, so a run's intervals can be computed again from its rows. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The bootstrap 95% interval of median(a) − median(b): each sample resampled with replacement, `rounds` times, the
 * 2.5th and 97.5th percentiles of the differences. With strata (each sample's request), a sample is resampled within
 * its own stratum, so every resample keeps the group's mix of requests and its median does not jump between them.
 */
export function medianDifferenceInterval(a, b, { rounds = 2000, seed = 171, strataA = null, strataB = null } = {}) {
  const random = mulberry32(seed);
  const split = (xs, strata) => {
    const by = new Map();
    xs.forEach((x, i) => {
      const s = strata?.[i] ?? '';
      if (!by.has(s)) by.set(s, []);
      by.get(s).push(x);
    });
    return [...by.values()];
  };
  const [partsA, partsB] = [split(a, strataA), split(b, strataB)];
  const resample = (parts) => median(parts.flatMap((xs) => Array.from(xs, () => xs[Math.floor(random() * xs.length)])));
  const diffs = Array.from({ length: rounds }, () => resample(partsA) - resample(partsB)).sort((x, y) => x - y);
  const at = (q) => diffs[Math.min(diffs.length - 1, Math.max(0, Math.round(q * (diffs.length - 1))))];
  return [at(0.025), at(0.975)].map((v) => Math.round(v * 1000) / 1000);
}

/**
 * The request times per route, command and series: each engine's median, and cua's against the faster vendor build's.
 * Over the wire the desktop route's judged times come from `blocks` (`desktopBlocks`' interleaved fresh engines over the
 * scenarios' sequences), and the scenarios' own desktop times are recorded beside them as `… in a scenario`.
 * A group is judged only when every engine has `minSamples`, and only through the interval guard, whichever way the
 * medians point (Acceptance 3, revised at M3.1): a bootstrap interval of the median difference whose upper end is
 * within the bound (stats.mjs `noiseBound`: max(5% of the bar, 1 ms)) passes, labelled by its interval (stats.mjs
 * `speedLabel`: "faster", "same (within noise)" or "within the bound"); otherwise:
 * - a loss a speed gap declares (deviations.mjs) is "declared gap";
 * - an interval that includes 0 but reaches past the bound is "undetermined" while more samples may come (`final`
 *   false: `runEvents` adds rounds), and a failure (`wide`) once they are final;
 * - otherwise it fails. Scenarios that deliberately fail (validation, bad keys) are timed too: every engine gets them.
 */
export function eventSpeeds(scenarioRows, { vendors = ['pinned', 'newest'], candidate = 'cua', blocks = null, minSamples = MIN_JUDGED, gaps = SPEED_GAPS, mismatches = [], final = true } = {}) {
  const groups = new Map();
  // a timed request that did not answer as the pinned build's proves nothing about speed (blockAnswerMismatches)
  const wrong = new Set(mismatches.map((m) => `${m.engine}|${m.key}`));
  const add = (row, fromBlocks) => {
    for (const [label, steps] of Object.entries(row.records)) {
      const keys = fromBlocks ? blockKeys(steps) : [];
      for (const [i, step] of steps.entries()) {
        if (typeof step.ms !== 'number') continue;
        if (fromBlocks && wrong.has(`${label}|${keys[i]}`)) continue;
        const series = (step.first ? 'first' : 'later') + (blocks && row.route === 'desktop' && !fromBlocks ? ' in a scenario' : '');
        const key = `${row.route}|${step.command}|${series}`;
        if (!groups.has(key)) groups.set(key, { ms: {}, strata: {} });
        (groups.get(key).ms[label] ??= []).push(step.ms);
        // a stratum is one request: its sequence and its place in it
        (groups.get(key).strata[label] ??= []).push(`${step.scenario ?? ''}#${step.step ?? ''}`);
      }
    }
  };
  for (const row of scenarioRows) add(row, false);
  for (const row of blocks ?? []) add(row, true);
  const out = [];
  for (const [key, { ms: byEngine, strata }] of groups) {
    const [route, command, series] = key.split('|');
    const medians = Object.fromEntries(Object.entries(byEngine).map(([label, xs]) => [label, median(xs)]));
    const present = vendors.filter((v) => typeof medians[v] === 'number');
    const fastest = present.length ? present.reduce((a, b) => (medians[b] < medians[a] ? b : a)) : null;
    const bar = fastest ? medians[fastest] : null;
    const mine = medians[candidate];
    const judged = bar !== null && typeof mine === 'number' && [...vendors, candidate].every((l) => (byEngine[l]?.length ?? 0) >= minSamples);
    const interval = judged ? medianDifferenceInterval(byEngine[candidate], byEngine[fastest], { strataA: strata[candidate], strataB: strata[fastest] }) : null;
    const noise = judged ? noiseVerdict(interval, bar) : null;
    const gap = judged && noise !== 'same' ? declaredSpeedGap({ op: command, route, series }, gaps) : null;
    let verdict;
    if (!judged) verdict = 'too few samples, not judged';
    else if (noise === 'same') verdict = speedLabel(interval);
    else if (gap) verdict = 'declared gap';
    else if (noise === 'wide' && !final) verdict = 'undetermined';
    else verdict = 'fail';
    const n = Math.min(...[...vendors, candidate].map((l) => byEngine[l]?.length ?? 0));
    out.push({ route, command, series, n, medians, bar, faster: fastest, interval, verdict, pass: PASSING.includes(verdict) ? true : verdict === 'fail' ? false : null, ...(gap ? { gap } : {}), ...(noise === 'wide' ? { wide: true } : {}) });
  }
  return out.sort((a, b) => `${a.route}${a.command}${a.series}`.localeCompare(`${b.route}${b.command}${b.series}`));
}

/**
 * The experiment's outcome: cua's answers, events and effects as the pinned build's, and over the wire no judged request time
 * failing (Acceptance 3) and every `required` group judged, none left with too few samples; through the vendor client the
 * times include its deferred settle, so they are recorded, not judged.
 */
export function eventsPass({ answers, speeds, via, required = [] }) {
  if (via === 'vendor-js') return answers;
  return answers && speeds.every((s) => s.verdict !== 'fail' && s.verdict !== 'undetermined') && missingSpeedGroups(speeds, required).length === 0;
}

/**
 * The groups Acceptance 3 requires judged over the wire: every desktop input command's fresh-engine `first` and
 * `later` series, but `key_up`'s first (a fresh engine holds nothing; its first `key_up` is the no-op the window
 * route's verdict run times). The scenarios' own times are recorded only.
 */
export const MANDATORY_SPEED_GROUPS = ['press_key', 'key_down', 'key_up', 'click', 'move', 'move_relative', 'scroll', 'drag', 'drag_handle']
  .flatMap((command) => ['first', 'later'].map((series) => ({ route: 'desktop', command, series })))
  .filter((g) => !(g.command === 'key_up' && g.series === 'first'));

/** The required groups a run left unjudged, too few samples or none at all. */
export function missingSpeedGroups(speeds, required = MANDATORY_SPEED_GROUPS) {
  const judged = (g) => speeds.some((s) => s.route === g.route && s.command === g.command && s.series === g.series && s.verdict !== 'too few samples, not judged');
  return required.filter((g) => !judged(g));
}

/** Each block record's request: its round (or, in a recorded row without one, its occurrence), sequence and step. */
export function blockKeys(rows) {
  const seen = new Map();
  return rows.map((r) => {
    const at = `${r.scenario}#${r.step}`;
    const k = r.round ?? (seen.get(at) ?? 0);
    seen.set(at, (seen.get(at) ?? 0) + 1);
    return `${k}|${at}`;
  });
}

/**
 * The timed requests that did not answer as the pinned build's same request did (the same round, sequence and step;
 * a recorded row without its round counts occurrences): a time proves nothing about a request that went wrong, and a
 * deliberately invalid request keeps the refusal the pinned build answers.
 */
export function blockAnswerMismatches(records, candidates, reference = 'pinned') {
  const answerOf = (r) => JSON.stringify(r.answer ?? { ok: r.ok });
  const keyed = (rows) => new Map(blockKeys(rows).map((k, i) => [k, rows[i]]));
  const expected = keyed(records[reference] ?? []);
  const out = [];
  for (const engine of candidates) {
    const mine = keyed(records[engine] ?? []);
    for (const [key, want] of expected) {
      const got = mine.get(key);
      if (!got || answerOf(got) !== answerOf(want)) out.push({ engine, key, scenario: want.scenario, step: want.step, command: want.command, expected: want.answer ?? { ok: want.ok }, answered: got ? (got.answer ?? { ok: got.ok }) : null });
    }
  }
  return out;
}

/**
 * The desktop requests the speed gate times in fresh engines: every desktop scenario without launched programs or
 * interruptions, its window-bound steps left out (their route is the window's), and its first request once more at
 * the end, so every command has later samples too.
 */
export function blockSequences(list = scenarios()) {
  return list
    .filter((s) => s.route === 'desktop' && !s.apps && !s.fragile && !s.steps.some((st) => st.interrupted))
    .map((s) => {
      const steps = s.steps.filter((st) => !st.input?.window).map(({ effect, ...st }) => st);
      return { scenario: s.name, steps: [...steps, steps[0]] };
    })
    .filter((s) => s.steps.length > 1);
}

/**
 * The desktop route's request times, judged: every block sequence in a fresh engine per engine, `rounds` rounds, the
 * engines' order rotating each round, the pointer put at its start first and the engine given time to start, so its
 * first request is timed the way the differential run's cold sample is. Returns a row in the scenarios' shape.
 * A top-up (`commands`: only the sequences that send them) numbers its rounds on from `firstRound`, so its requests
 * never share a key with an earlier block's.
 */
async function desktopBlocks(engines, env, emit, { rounds = FIRST_ROUNDS, firstRound = 0, commands = null } = {}) {
  const records = Object.fromEntries(engines.map((e) => [e.label, []]));
  const sequences = blockSequences().filter((s) => !commands || s.steps.some((st) => commands.has(st.command)));
  for (let r = firstRound; r < firstRound + rounds; r++) {
    for (const sequence of sequences) {
      const order = [...engines.slice(r % engines.length), ...engines.slice(0, r % engines.length)];
      for (const engine of order) {
        execFileSync('xdotool', ['mousemove', String(POINTER_START[0]), String(POINTER_START[1])], { env });
        const process_ = new Engine({ label: engine.label, bin: engine.bin, args: engine.args ?? [], env }).start();
        try {
          await new Promise((resolve) => setTimeout(resolve, ENGINE_SETTLE_MS));
          for (const [i, step] of sequence.steps.entries()) {
            const { response, ms } = await process_.request(step.command, step.input, { timeoutMs: 30000 });
            records[engine.label].push({ command: step.command, scenario: sequence.scenario, round: r, step: i, ms: Math.round(ms * 100) / 100, first: i === 0, ok: response.ok === true, answer: normalizeAnswer(response) });
          }
          // a handle left down is let go before the engine exits
          if (sequence.steps.some((st) => st.command === 'drag_handle' && st.input?.action === 'start')) await process_.request('drag_handle', { action: 'end' });
        } finally {
          await process_.close();
        }
      }
    }
  }
  const mismatches = blockAnswerMismatches(records, engines.filter((e) => e.label.startsWith('cua')).map((e) => e.label));
  emit({ kind: 'events-blocks', rounds, first_round: firstRound, sequences: sequences.map((s) => s.scenario), settle_ms: ENGINE_SETTLE_MS, records, mismatches });
  return { route: 'desktop', records, mismatches };
}

/**
 * The desktop blocks' rounds: 20 fresh engines per engine and sequence, so every group a sequence sends has 20 samples
 * an engine, the fewest a group is judged on (Acceptance 3).
 */
export const FIRST_ROUNDS = MIN_JUDGED;
/** The samples an engine an undetermined group is topped up to; its outcome there is final (Acceptance 3). */
export const TOP_UP_TO = 2 * MIN_JUDGED;
/**
 * The top-ups the schedule allows: one to bring a short group to 20 (a group whose timed answers did not match), one to
 * bring a group undetermined at 20 to 40.
 */
export const TOP_UPS = 2;

const groupKey = (s) => `${s.route}|${s.command}|${s.series}`;
/** A group the desktop blocks sample, and so can top up: the desktop route's, not a scenario's own times. */
const blockGroup = (s) => s.route === 'desktop' && !s.series.endsWith(' in a scenario');

/**
 * One stage of Acceptance 3's schedule (revised at M3.1): the groups judged on the samples so far, `open` with
 * undetermined groups left open (`eventSpeeds` `final` false) and `closed` with them failed (`final` true). A group is
 * decided at the first stage that judges it, and keeps that verdict (`frozen`, by group): a pass, a failure or a
 * declared gap on 20 samples an engine or more, or, undetermined on 40 or more, a failure. The groups the blocks can
 * top up and still need samples are `needs`, each with its `target`: 20 for a group short of them, 40 for one
 * undetermined below 40. Returns `{frozen, needs}`.
 */
export function eventStage(open, closed, frozen = new Map()) {
  const next = new Map(frozen);
  const needs = [];
  for (const s of open) {
    const key = groupKey(s);
    if (next.has(key)) continue;
    if (s.verdict === 'too few samples, not judged') {
      if (blockGroup(s) && s.n > 0) needs.push({ ...s, target: MIN_JUDGED });
      continue;
    }
    if (s.verdict === 'undetermined' && blockGroup(s) && s.n < TOP_UP_TO) {
      needs.push({ ...s, target: TOP_UP_TO });
      continue;
    }
    next.set(key, closed.find((c) => groupKey(c) === key));
  }
  return { frozen: next, needs };
}

/**
 * The rounds a top-up runs: enough for every group in `needs` to reach its target, at the samples a round gave it so far
 * (`rounds` rounds have run; a top-up runs every sequence that sends a needed command, so a needed group gains at the
 * same rate).
 */
export function topUpRoundsFor(needs, rounds) {
  return Math.max(0, ...needs.map((s) => Math.ceil(((s.target - s.n) * rounds) / s.n)));
}

/** The final verdicts: each group's from the stage that decided it, the rest judged on everything (`final`). */
export function settledSpeeds(speeds, frozen) {
  return speeds.map((s) => frozen.get(groupKey(s)) ?? s);
}
/** The wait after an engine's start before its first request: its own start is not the request's time. */
const ENGINE_SETTLE_MS = 150;

/** The experiment's engines: the two vendor builds, cua, and each `--variant` as the candidate binary with its flags. */
export function eventEngines(args) {
  return [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'newest', bin: args.newest, args: [] },
    { label: 'cua', bin: args.cua, args: [] },
    ...args.variants.map((v) => ({ label: v.label, bin: args.cua, args: v.args })),
  ];
}

/** `--experiment events`: every scenario on every engine; whether cua matched the pinned build everywhere, and its speed. */
export async function runEvents(args, emit) {
  const server = await startServer();
  const home = mkdtempSync(join(tmpdir(), 'cua171-events-'));
  const env = { ...process.env, DISPLAY: server.display, XAUTHORITY: join(home, 'no-auth'), EVENTS_APPS: join(home, 'data') };
  mkdirSync(join(home, 'data', 'applications'), { recursive: true });
  writeFileSync(join(home, 'data', 'applications', 'events-probe.desktop'), desktopEntry('Events Probe', ['/usr/bin/touch', join(home, 'launched')]));
  const engines = eventEngines(args);
  const via = args.via ?? 'wire';
  const md = [`Through ${via === 'vendor-js' ? "OpenAI's JavaScript client (the desktop-only commands, well-formed requests, effects read back)" : 'the wire'}:`, '', '| scenario | newest | cua | effects (pinned / newest / cua) |', '|---|---|---|---|'];
  const scenarioRows = [];
  let blocks = null;
  // each desktop group's verdict from the stage of the schedule that decided it (eventStage)
  let frozen = new Map();
  let pass = true;
  try {
    for (const scenario of via === 'vendor-js' ? VENDOR_JS_SCENARIOS : scenarios()) {
      const records = {};
      for (const engine of engines) records[engine.label] = await runScenario(scenario, engine, env, { via, skyDir: args.vendorJs });
      const verdicts = {};
      const declared = {};
      // the build the scenario is judged against: the pinned one, or the newest for its own command
      const reference = scenario.reference ?? 'pinned';
      for (const engine of engines.filter((e) => e.label !== reference && !(reference === 'newest' && e.label === 'pinned'))) {
        let difference = firstDifference(records[reference], records[engine.label]);
        // a declared deviation excuses its own step's answer, and only when the candidate answered as declared
        if (difference?.what === 'answer' && scenario.deviation) {
          const deviation = declaredDeviation({ op: scenario.deviation, scene: 'events', field: 'answer', candidate: difference.candidate });
          if (deviation) {
            const excused = records[engine.label].map((step, i) => (i === difference.step ? { ...step, answer: records[reference][i].answer } : step));
            difference = firstDifference(records[reference], excused);
            if (!difference) declared[engine.label] = deviation.op;
          }
        }
        verdicts[engine.label] = difference;
        if (difference && engine.label.startsWith('cua')) pass = false;
      }
      // effects, where a scenario reads them: every effect-bearing step must take effect in cua's engines
      let misses = {};
      const judged = scenario.steps.some((s) => s.effect);
      if (judged) {
        const effects = judgeScenarioEffects(scenario.steps, records, engines.filter((e) => e.label.startsWith('cua')).map((e) => e.label));
        misses = effects.misses;
        if (!effects.pass) pass = false;
      }
      emit({ kind: 'events', scenario: scenario.name, route: scenario.route, via, records, differences: verdicts, declared, ...(judged ? { effect_misses: misses } : {}) });
      // a build the scenario is not judged against (the pinned build has no type_characters) times nothing in it
      const timed = reference === 'newest' ? Object.fromEntries(Object.entries(records).filter(([label]) => label !== 'pinned')) : records;
      scenarioRows.push({ route: scenario.route, records: timed });
      const cell = (label) => (label === reference ? 'the reference' : verdicts[label] ? `differs at step ${verdicts[label].step} (${verdicts[label].what})` : declared[label] ? `same but the declared answer (${declared[label]})` : 'same');
      const took = (label) => `${records[label].filter((s) => s.effect === true).length}/${records[label].filter((s) => typeof s.effect === 'boolean').length}`;
      md.push(`| ${scenario.name} | ${cell('newest')} | ${cell('cua')} | ${judged ? `${took('pinned')} / ${took('newest')} / ${took('cua')}${misses.cua?.length ? ` (**cua missed step ${misses.cua.join(', ')}**)` : ''}` : '–'} |`);
    }
    // over the wire, the desktop route's speed is judged from interleaved fresh engines, enough samples a group
    if (via === 'wire') {
      let rounds = args.firstRounds ?? FIRST_ROUNDS;
      blocks = [await desktopBlocks(engines, env, emit, { rounds })];
      // Acceptance 3: a group is judged on 20 samples an engine; one undetermined there is topped up to 40, where its
      // outcome is final; a group decided at a stage keeps that verdict (eventStage)
      for (let more = 1; ; more++) {
        const sofar = { blocks, mismatches: blocks.flatMap((b) => b.mismatches) };
        const stage = eventStage(eventSpeeds(scenarioRows, { ...sofar, final: false }), eventSpeeds(scenarioRows, { ...sofar, final: true }), frozen);
        frozen = stage.frozen;
        if (!stage.needs.length || more > TOP_UPS) break;
        const extra = topUpRoundsFor(stage.needs, rounds);
        emit({ kind: 'events-top-up', top_up: more, rounds: extra, groups: stage.needs.map((s) => ({ route: s.route, command: s.command, series: s.series, n: s.n, target: s.target, interval: s.interval, bar: s.bar })) });
        blocks.push(await desktopBlocks(engines, env, emit, { rounds: extra, firstRound: rounds, commands: new Set(stage.needs.map((s) => s.command)) }));
        rounds += extra;
      }
    }
  } finally {
    server.stop();
    rmSync(home, { recursive: true, force: true });
  }
  md.push('', pass ? 'cua sent the pinned build\'s events and answers in every scenario.' : 'cua differs from the pinned build; results.jsonl has each first difference.');
  const mismatches = (blocks ?? []).flatMap((b) => b.mismatches ?? []);
  if (mismatches.length) {
    pass = false;
    md.push('', `cua's timed desktop requests answered unlike the pinned build's (their times not counted): ${mismatches.slice(0, 10).map((m) => `${m.scenario} step ${m.step} (${m.command}) in round ${m.key.split('|')[0]}`).join('; ')}${mismatches.length > 10 ? `; ${mismatches.length - 10} more` : ''}.`);
  }
  const speeds = settledSpeeds(eventSpeeds(scenarioRows, { blocks, mismatches }), frozen);
  for (const row of speeds) emit({ kind: 'events-speed', via, ...row });
  const required = via === 'wire' ? MANDATORY_SPEED_GROUPS : [];
  const missing = missingSpeedGroups(speeds, required);
  if (missing.length) md.push('', `Incomplete: Acceptance 3's desktop groups left unjudged (too few samples or none): ${missing.map((g) => `${g.command} ${g.series}`).join(', ')}.`);
  const judging = via === 'vendor-js' ? "through the client they include its deferred settle, so they are recorded, not judged" : `the desktop route's \`first\` and \`later\` from ${args.firstRounds ?? FIRST_ROUNDS} interleaved fresh engines per engine and sequence, each time counted only when its answer is the pinned build's, the scenarios' own beside them; a group is judged only with ${MIN_JUDGED} samples an engine, and every Acceptance 3 desktop group must be, through the bootstrap 95% interval of cua minus the faster build alone: it passes when the interval's upper end is at most max(5% of the bar, 1 ms) (faster, same within noise, or within the bound), and fails when the interval lies above 0 beyond it; a group still undetermined at ${MIN_JUDGED} samples an engine is sampled to ${TOP_UP_TO}, where its outcome is final, and a group decided at ${MIN_JUDGED} keeps that verdict`;
  md.push('', `Request times per route and command (median ms; \`first\` is the request after the engine started, \`later\` the rest; ${judging}):`, '');
  md.push('| route | command | series | n | pinned | newest | cua | cua − faster, 95% interval | verdict |', '|---|---|---|---:|---:|---:|---:|---|---|');
  const f = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : '–');
  const shown = (r) => (via === 'vendor-js' ? (r.medians.cua <= r.bar ? 'at or below (recorded)' : 'above (recorded)') : r.verdict === 'fail' ? (r.wide ? '**fail** (undetermined: the interval reaches past the bound)' : '**fail**') : r.verdict === 'declared gap' ? `**declared gap** (${r.gap.section})` : r.verdict === 'within the bound' ? '**within the bound**' : r.verdict);
  for (const r of speeds) md.push(`| ${r.route} | ${r.command} | ${r.series} | ${r.n} | ${f(r.medians.pinned)} | ${f(r.medians.newest)} | ${f(r.medians.cua)} | ${r.interval ? `[${r.interval[0]}, ${r.interval[1]}]` : '–'} | ${shown(r)} |`);
  if (via !== 'vendor-js') {
    const listed = (verdict) => speeds.filter((s) => s.verdict === verdict);
    const line = (rows, f2) => rows.map((s) => `${s.route} ${s.command} ${s.series} (${f2(s)})`).join('; ');
    if (listed('within the bound').length) {
      md.push('', 'Within the bound (a small measured loss: the interval wholly above 0, its upper end inside max(5% of the bar, 1 ms)):', '', '| route | command | series | cua | bar | cua − faster, 95% interval |', '|---|---|---|---:|---:|---|');
      for (const s of listed('within the bound')) md.push(`| ${s.route} | ${s.command} | ${s.series} | ${f(s.medians.cua)} | ${f(s.bar)} | [${s.interval.join(', ')}] |`);
    }
    if (listed('declared gap').length) md.push('', `Declared speed gaps (deviations.mjs; not a pass): ${line(listed('declared gap'), (s) => `${f(s.medians.cua)} against ${f(s.bar)}, ${s.gap.section}: ${s.gap.reason}`)}.`);
    if (listed('fail').length) md.push('', `cua is slower than the faster vendor build over the wire: ${line(listed('fail'), (s) => `${f(s.medians.cua)} against ${f(s.bar)}, [${s.interval.join(', ')}]`)}.`);
  }
  return { md, pass: eventsPass({ answers: pass, speeds, via, required }), answers: pass, speeds, missing };
}
