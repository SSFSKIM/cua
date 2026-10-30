// The paste safety cases of M2 (Plan of Work, M2, Decisions; Acceptance 6): cua's engine alone, judged on what each
// case exists to show, never against a vendor build. They run after the differential blocks, as operations of the M2
// scenes, each on windows of its own:
//
// - chrome-textarea (pages/text.html): `focus_change` (the focus moved to the page's other field while the engine's
//   snapshot is in progress: refused with nothing sent), `focus_change_takeover` (the same, and the prior owner takes
//   CLIPBOARD back as soon as the engine owns it: nothing sent, the new owner's contents intact), `silent_owner` (the
//   prior owner never answers the snapshot: nothing sent within the bound, the locks released), `concurrent` (two
//   engines paste distinct markers at the same moment, each into its own window), `contention` (two engines paste in a
//   tight loop with random gaps), `late_page` (the page inserts the paste's text 3 s after its paste event),
//   `ignored_page` (the page drops the paste);
// - paste-target (pages/paste-target.py, a GTK 3 window whose conversions the harness controls): `stalled_incr` (the
//   target stalls an INCR transfer), `late_convert` (the target converts 1.5 s and 3 s after the chord, with the
//   chord's timestamp and with CurrentTime), `unreadable` (a field with no Text interface);
// - gedit: `caret_placed` (a caret placed, the focus moved away, then `type_text` with the field's element id: the
//   focusing click, the caret put back, the text at the caret);
// - gnome-text-editor, dedicated mode: `restore_refused` (the same through the foreground route; GTK 4 refuses the
//   caret's restore and the text still goes in, once).
//
// Every case's requests run inside witness spans; the bus calls of the whole phase are checked for PasteText,
// InsertText and SetTextContents (run.mjs).

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';

import { clipRead, grabs, startOwner, toplevel, waitQuarantineOver, within } from './clip.mjs';
import { Engine } from './engine.mjs';
import { PAGES } from './scenes.mjs';
import {
  CHANGED,
  NOTHING_SENT,
  judgeConcurrent,
  judgeContention,
  judgeLateConvert,
  judgeRefusal,
  judgeUnconfirmed,
} from './safety-judge.mjs';
import { occurrences, pasted } from './text.mjs';
import { judgeRouteSpan } from './witness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------
// the witness of a case's request, by the route it took

/**
 * The witness of one request whose route is known beforehand (`expected`: text.mjs `expectedRoute`, null where none
 * applies), judged by `judgeRouteSpan` against the route the engine reports it took (Decision Log, M2.2): the foreground
 * route's allowance only where both are the foreground route, and then nothing may change after the request ends (a
 * quiet span) or stay grabbed; a route other than the expected one fails. Where the foreground route is expected, the
 * target's top-level (its window manager frame) is read before the span, for the restack judge.
 */
export async function routeWitness(witness, tag, target, expected, fn) {
  const frame = expected === 'foreground' ? toplevel(target) : null;
  const result = await witness.span(tag, fn);
  const route = result.value?.stats?.route ?? null;
  const judged = judgeRouteSpan(result.report, { expected, reported: route, target, frame, focusWithin: (w) => within(w, target) });
  if (!judged.foreground) return { ...result, route, judged };
  const quiet = await witness.span(`${tag}:after`, () => sleep(300));
  const held = grabs();
  const fields = [...judged.fields];
  if (!quiet.witness.clean) fields.push(...quiet.witness.fields.map((f) => `${f} after the request`));
  if (held.pointer !== 'free' || held.keyboard !== 'free') fields.push(`grab left (${JSON.stringify(held)})`);
  return { ...result, route, judged: { clean: fields.length === 0, fields, allowed: judged.allowed } };
}

// ---------------------------------------------------------------------------------------------------------------
// the cases (live)

/** A paste-target window (pages/paste-target.py) and what it reports; `hold(scene)` as soon as its program runs. */
async function openTarget(desktop, mode, hold) {
  const label = desktop.label('target', mode.replace(/[^a-z0-9]+/gi, ''));
  const child = spawn('python3', ['-I', join(PAGES, 'paste-target.py'), label, mode], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
  child.unref();
  const reports = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      reports.push(JSON.parse(line));
    } catch {
      // not a report
    }
  });
  const scene = { kind: 'family', role: mode, label, pid: child.pid, group: true, reports };
  desktop.windows.push(scene);
  hold(scene);
  const info = await desktop.waitForWindow((w) => w.title === label, label);
  scene.id = info.id;
  const state = await desktop.waitForTree(scene);
  const { preorder } = await import('./normalize.mjs');
  const nodes = preorder(state.ax_tree);
  scene.field = nodes.find((n) => n.role === 'text')?.id ?? null;
  return scene;
}

const waitReport = async (scene, pred, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const found = scene.reports.filter(pred);
    if (found.length) return found;
    await sleep(50);
  }
  return [];
};

const textOf = (oracle, id) => {
  try {
    return oracle.text(id);
  } catch {
    return null;
  }
};

/** A field's `{text, caret, selection}` through the harness's own reads. */
const stateOf = (oracle, id) => {
  try {
    return { text: oracle.text(id), caret: oracle.caret(id), selection: oracle.selection(id) };
  } catch {
    return { text: null, caret: null, selection: null };
  }
};

function caretToEnd(oracle, id) {
  try {
    oracle.setCaret(id, oracle.count(id));
  } catch {
    // an editor that refuses it keeps its caret
  }
}

const stamp = () => Date.now().toString(36);

/**
 * The cases. Every engine, clipboard owner and target window a case starts is ended when the case ends, however it
 * ends (`guarded`): a case that throws half-way through its setup leaves nothing running into the next, and a cleanup
 * that fails fails the case.
 */
export class Cases {
  /**
   * `settle()` waits out cua's display-wide unconfirmed-paste window before each case and each late-conversion trial
   * (`clip.mjs` `waitQuarantineOver`): an unconfirmed case opens it, and while it runs every cua engine refuses text
   * requests. It is waited out, never removed: the case's target may still convert until it ends.
   */
  constructor({ desktop, witness, cua, emit, settle = waitQuarantineOver }) {
    Object.assign(this, { desktop, witness, cua, emit, settle });
    this.oracle = desktop.oracle;
    this.pending = [];
  }

  /**
   * A cleanup the running case owes, run when it ends (`releaseAll`); `what` names it in a failure. Each disposal
   * establishes for itself that what it ends is already gone (an engine or owner that has exited, a window the case
   * closed) and returns quietly then; anything it throws is a failure.
   */
  defer(fn, what = 'cleanup') {
    this.pending.push({ fn, what });
  }

  /** Every cleanup owed, newest first, each whatever the others did; returns the failures, `what: message`. */
  async releaseAll() {
    const failures = [];
    for (const { fn, what } of this.pending.splice(0).reverse()) {
      try {
        await fn();
      } catch (error) {
        failures.push(`${what}: ${error?.message ?? error}`);
      }
    }
    return failures;
  }

  /**
   * `fn` as one case: its cleanups run when it ends, by its answer or by an exception. A failed cleanup fails the case:
   * a case that answered throws `cleanup failed: …`; a case that threw keeps its own error, the failures attached as
   * `cleanupFailures`.
   */
  async guarded(fn) {
    let value;
    let thrown = null;
    try {
      await this.settle();
      value = await fn();
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }
    const failures = await this.releaseAll();
    if (thrown) {
      if (failures.length) thrown.cleanupFailures = failures;
      throw thrown;
    }
    if (failures.length) throw new Error(`cleanup failed: ${failures.join('; ')}`);
    return value;
  }

  engine(args = []) {
    const engine = new Engine({ label: 'cua', bin: this.cua, args, stats: true });
    this.defer(() => engine.close(), 'engine');
    return engine.start();
  }

  /** A harness owner of CLIPBOARD (`clip.mjs`), stopped when the case ends. */
  async owner(text) {
    const owner = await startOwner(text);
    this.defer(() => owner.stop(), 'clipboard owner');
    return owner;
  }

  /**
   * An owner of the prior clipboard whose next TARGETS answer is held. Applications that watch CLIPBOARD (gedit, a
   * clipboard manager) read a new owner's TARGETS as soon as it takes over; the owner is armed only after they have, so
   * the request it holds is the engine's snapshot.
   */
  async armedOwner(text) {
    const owner = await this.owner(text);
    await sleep(600);
    owner.send('arm');
    await owner.waitFor((r) => r.armed);
    return owner;
  }

  /** A paste-target window, closed when the case ends unless the case closed it. */
  target(mode) {
    return openTarget(this.desktop, mode, (scene) =>
      this.defer(async () => {
        if (this.desktop.windows.includes(scene)) await this.desktop.close([scene]);
        // gone only when its process group is: signal 0 to a group that has ended answers ESRCH
        try {
          process.kill(-scene.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') return;
          throw error;
        }
        throw new Error(`${scene.label}'s process group ${scene.pid} is still running`);
      }, 'target window'),
    );
  }

  record(scene, op, trial, verdict, details) {
    this.emit({ kind: 'case', scene, op, trial, pass: verdict.pass, reasons: verdict.reasons, ...details });
    process.stdout.write(`case ${scene} ${op} ${trial}: ${verdict.pass ? 'PASS' : `FAIL (${verdict.reasons.join('; ')})`}\n`);
    return verdict.pass;
  }

  /** A textarea page window of the cases, its two fields found, the first focused with its caret at the end. */
  async textarea(role, paste = 'plain') {
    const { resolveField } = await import('./text.mjs');
    const scene = await this.desktop.openChrome(role, 'text.html', { stem: 'case', query: `paste=${paste}` });
    await resolveField(this.desktop, scene, 'chrome-textarea');
    return scene;
  }

  focusFirst(scene) {
    this.oracle.grabFocus(scene.field);
    caretToEnd(this.oracle, scene.field);
  }

  /** The focus moved to the page's other field while the engine's snapshot waits on the prior owner's TARGETS. */
  async focusChange(scene, { takeover }) {
    const engine = this.engine();
    let all = true;
    const trials = takeover ? [0, 20, 50] : [0, 1, 2];
    for (const [trial, delay] of trials.entries()) {
      this.focusFirst(scene);
      await sleep(200);
      const before = [textOf(this.oracle, scene.field), textOf(this.oracle, scene.other)];
      const prior = await this.armedOwner(`cua171 prior focus ${stamp()}`);
      const taken = `cua171 taken ${stamp()}`;
      if (takeover) {
        prior.send(`retake ${delay} ${taken}`);
        await prior.waitFor((r) => r.retake_armed);
      }
      const marker = `cua171-focus-${trial}`;
      const span = await this.witness.span(`case:focus:${trial}`, async () => {
        const answered = engine.request('type_text', { window: { id: scene.id }, text: marker });
        let moved = null;
        try {
          await prior.waitFor((r) => r.held === 'TARGETS', 5000);
          moved = this.oracle.grabFocus(scene.other);
        } finally {
          prior.send('go');
        }
        return { ...(await answered), moved };
      });
      await sleep(takeover ? 300 : 100);
      const clipboard = clipRead();
      const after = [textOf(this.oracle, scene.field), textOf(this.oracle, scene.other)];
      await prior.stop();
      const verdict = judgeRefusal({
        answer: span.value.response,
        sentence: takeover ? NOTHING_SENT : CHANGED,
        fields: before.map((b, i) => ({ before: b, after: after[i] })),
        clipboard,
        expectClipboard: takeover ? taken : prior.text,
      });
      if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
      if (span.value.moved !== true) verdict.reasons.push('the focus could not be moved during the snapshot');
      verdict.pass = verdict.reasons.length === 0;
      all = this.record('chrome-textarea', takeover ? 'focus_change_takeover' : 'focus_change', trial, verdict, {
        answer: span.value.response,
        ms: span.value.ms,
        retake_delay_ms: takeover ? delay : undefined,
        owner: prior.lines.filter((l) => !('request' in l)),
        fields: { before, after },
        paste: span.value.stats?.paste ?? null,
      }) && all;
    }
    await engine.close();
    this.focusFirst(scene);
    return all;
  }

  /** Two engines paste distinct markers at the same moment, each into its own window. */
  async concurrent(scenes) {
    const engines = scenes.map(() => this.engine());
    let all = true;
    for (let trial = 0; trial < 3; trial++) {
      for (const s of scenes) this.focusFirst(s);
      await sleep(200);
      const prior = await this.owner(`cua171 prior concurrent ${stamp()}`);
      const before = scenes.map((s) => stateOf(this.oracle, s.field));
      const markers = scenes.map((_, i) => `cua171-concurrent-${trial}-${i}-${stamp()}`);
      const span = await this.witness.span(`case:concurrent:${trial}`, () => Promise.all(engines.map((e, i) => e.request('type_text', { window: { id: scenes[i].id }, text: markers[i] }))));
      await sleep(300);
      const clipboard = clipRead();
      const after = scenes.map((s) => textOf(this.oracle, s.field));
      await prior.stop();
      const verdict = judgeConcurrent({ answers: span.value.map((v) => v.response), fields: scenes.map((s, i) => ({ before: before[i], after: after[i], marker: markers[i] })), clipboard, prior: prior.text });
      if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
      verdict.pass = verdict.reasons.length === 0;
      all = this.record('chrome-textarea', 'concurrent', trial, verdict, { answers: span.value.map((v) => v.response), ms: span.value.map((v) => Math.round(v.ms)), fields: { before, after } }) && all;
    }
    for (const e of engines) await e.close();
    return all;
  }

  /** Two engines paste in a tight loop with random gaps of 0–30 ms, 20 pastes each. */
  async contention(scenes, n = 20) {
    const engines = scenes.map(() => this.engine());
    for (const s of scenes) this.focusFirst(s);
    await sleep(200);
    const prior = await this.owner(`cua171 prior contention ${stamp()}`);
    const before = scenes.map((s) => stateOf(this.oracle, s.field));
    const markers = scenes.map((_, i) => Array.from({ length: n }, (__, k) => `[${'AB'[i]}${k}]`));
    const answers = [];
    const span = await this.witness.span('case:contention', () =>
      Promise.all(
        engines.map(async (e, i) => {
          for (const marker of markers[i]) {
            await sleep(Math.floor(Math.random() * 31));
            const { response, ms } = await e.request('type_text', { window: { id: scenes[i].id }, text: marker });
            answers.push({ ...response, engine: i, ms: Math.round(ms) });
          }
        }),
      ),
    );
    await sleep(300);
    const clipboard = clipRead();
    const after = scenes.map((s) => textOf(this.oracle, s.field));
    await prior.stop();
    const verdict = judgeContention({ answers, fields: scenes.map((s, i) => ({ before: before[i], after: after[i], markers: markers[i] })), clipboard, prior: prior.text });
    if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
    verdict.pass = verdict.reasons.length === 0;
    for (const e of engines) await e.close();
    const ms = answers.map((a) => a.ms).sort((a, b) => a - b);
    return this.record('chrome-textarea', 'contention', 0, verdict, { pastes: answers.length, ms_median: ms[Math.floor(ms.length / 2)], ms_max: ms.at(-1), fields: { before, after } });
  }

  /**
   * A silent clipboard owner (Plan of Work, M2, Decisions; Design, Snapshot bounds): the prior owner never answers the
   * engine's snapshot TARGETS, so the paste ends within the 500 ms bound with nothing sent, both locks released: the
   * next paste, once the owner answers again, goes in.
   */
  async silentOwner(scene) {
    const engine = this.engine();
    this.focusFirst(scene);
    await sleep(200);
    const prior = await this.owner(`cua171 prior silent ${stamp()}`);
    // after the clipboard watchers' reads of a new owner (armedOwner)
    await sleep(600);
    prior.send('silence');
    await prior.waitFor((r) => r.silent);
    const before = textOf(this.oracle, scene.field);
    const span = await this.witness.span('case:silent_owner', () => engine.request('type_text', { window: { id: scene.id }, text: `cua171-silent-${stamp()}` }));
    const after = textOf(this.oracle, scene.field);
    const clipboard = clipRead();
    const verdict = judgeRefusal({ answer: span.value.response, sentence: /^clipboard capture timed out: .*; nothing was sent$/, fields: [{ before, after }], clipboard, expectClipboard: prior.text });
    if (!(span.value.ms < 1500)) verdict.reasons.push(`answered after ${Math.round(span.value.ms)} ms, past the 500 ms TARGETS bound and its margin`);
    if (!prior.lines.some((l) => l.silenced)) verdict.reasons.push("the owner did not hold back the engine's TARGETS");
    // the locks were released: the next paste goes in, once
    const state = stateOf(this.oracle, scene.field);
    const marker = `cua171-after-silent-${stamp()}`;
    const next = await this.witness.span('case:silent_owner:next', () => engine.request('type_text', { window: { id: scene.id }, text: marker }));
    await sleep(300);
    const landedAfter = textOf(this.oracle, scene.field);
    await prior.stop();
    await engine.close();
    if (next.value.response.ok !== true || landedAfter !== pasted(state, marker)) verdict.reasons.push(`the next paste answered ${JSON.stringify(next.value.response)} and did not land once`);
    if (!span.witness.clean || !next.witness.clean) verdict.reasons.push('the witness changed');
    verdict.pass = verdict.reasons.length === 0;
    return this.record('chrome-textarea', 'silent_owner', 0, verdict, { answer: span.value.response, ms: Math.round(span.value.ms), next_ms: Math.round(next.value.ms) });
  }

  /** A page that applies the paste 3 s late (`late`) or drops it (`ignored`). */
  async pageCase(scene, op) {
    const engine = this.engine();
    this.focusFirst(scene);
    await sleep(200);
    const prior = await this.owner(`cua171 prior ${op} ${stamp()}`);
    const state = stateOf(this.oracle, scene.field);
    const before = state.text;
    const marker = `cua171-${op}-${stamp()}`;
    const span = await this.witness.span(`case:${op}`, () => engine.request('type_text', { window: { id: scene.id }, text: marker }));
    const next = await engine.request('list_windows', {});
    // the late page inserts 3 s after its paste event: read well after that
    await sleep(op === 'late_page' ? 4500 - span.value.ms : 1500);
    const after = textOf(this.oracle, scene.field);
    const clipboard = clipRead();
    await prior.stop();
    await engine.close();
    const verdict = judgeUnconfirmed({
      answer: span.value.response,
      ms: span.value.ms,
      boundMs: 3000,
      field: { before, after },
      // the late page applies the paste once, where the caret was, 3 s after its paste event
      expectField: op === 'late_page' ? pasted(state, marker) : before,
      next: { ok: next.response.ok, ms: next.ms },
      clipboard,
      expectClipboard: prior.text,
    });
    if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
    verdict.pass = verdict.reasons.length === 0;
    return this.record('chrome-textarea', op, 0, verdict, { answer: span.value.response, ms: Math.round(span.value.ms), next_ms: Math.round(next.ms), fields: { before: state, after }, paste: span.value.stats?.paste ?? null });
  }

  /** A target that stalls an INCR transfer: 100 KB of text, so the engine serves it in chunks. */
  async stalledIncr() {
    const scene = await this.target('stall-incr');
    const engine = this.engine();
    const prior = await this.owner(`cua171 prior stall ${stamp()}`);
    const before = textOf(this.oracle, scene.field);
    const text = `cua171-stall ${'0123456789'.repeat(10000)}`;
    const span = await this.witness.span('case:stalled_incr', () => engine.request('type_text', { window: { id: scene.id }, text }));
    const next = await engine.request('list_windows', {});
    await sleep(500);
    const after = textOf(this.oracle, scene.field);
    const clipboard = clipRead();
    await prior.stop();
    await engine.close();
    const paste = span.value.stats?.paste ?? null;
    // the transfer bounds: 2 s with no progress between INCR chunks after the transfer starts
    const verdict = judgeUnconfirmed({ answer: span.value.response, ms: span.value.ms, boundMs: 3000, field: { before, after }, expectField: before, next: { ok: next.response.ok, ms: next.ms }, clipboard, expectClipboard: prior.text });
    if (!paste?.log?.some((l) => /^target .* Stalled /.test(l))) verdict.reasons.push('the engine did not see the target stall an INCR transfer');
    if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
    verdict.pass = verdict.reasons.length === 0;
    const ok = this.record('paste-target', 'stalled_incr', 0, verdict, { answer: span.value.response, ms: Math.round(span.value.ms), next_ms: Math.round(next.ms), transfer: paste?.transfer, log: paste?.log, target: scene.reports });
    await this.desktop.close([scene]);
    return ok;
  }

  /** A target that converts late: 1.5 s (before the cleanup) and 3 s (after it), with the chord's time and CurrentTime. */
  async lateConvert() {
    let all = true;
    for (const [trial, mode] of ['late-convert:1500', 'late-convert:3000', 'late-convert-current:3000'].entries()) {
      // each trial's paste is unconfirmed: the next one starts once the window it opened has closed
      await this.settle();
      const scene = await this.target(mode);
      const engine = this.engine();
      const prior = await this.owner(`cua171 prior late ${stamp()}`);
      const before = textOf(this.oracle, scene.field);
      const marker = `cua171-late-convert-${trial}`;
      const span = await this.witness.span(`case:late_convert:${trial}`, () => engine.request('type_text', { window: { id: scene.id }, text: marker }));
      const received = await waitReport(scene, (r) => 'received' in r, 5000);
      const after = textOf(this.oracle, scene.field);
      await prior.stop();
      await engine.close();
      const verdict = judgeLateConvert({ answer: span.value.response, received, paste: marker, prior: prior.text, mustRefuse: mode.endsWith(':3000') });
      if (after !== before) verdict.reasons.push('the field changed');
      if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
      verdict.pass = verdict.reasons.length === 0;
      all = this.record('paste-target', 'late_convert', trial, verdict, { mode, answer: span.value.response, ms: Math.round(span.value.ms), received, paste: span.value.stats?.paste ?? null }) && all;
      await this.desktop.close([scene]);
    }
    return all;
  }

  /** A field with no readable Text: unconfirmed, and the application received the text once. */
  async unreadable() {
    const scene = await this.target('unreadable');
    const engine = this.engine();
    const prior = await this.owner(`cua171 prior unreadable ${stamp()}`);
    const marker = `cua171-unreadable-${stamp()}`;
    const span = await this.witness.span('case:unreadable', () => engine.request('type_text', { window: { id: scene.id }, text: marker }));
    const next = await engine.request('list_windows', {});
    await sleep(500);
    const pasted = scene.reports.filter((r) => 'pasted' in r).map((r) => r.pasted);
    const clipboard = clipRead();
    await prior.stop();
    await engine.close();
    const verdict = judgeUnconfirmed({ answer: span.value.response, ms: span.value.ms, boundMs: 3000, field: { before: '', after: pasted.join('|') }, expectField: marker, next: { ok: next.response.ok, ms: next.ms }, clipboard, expectClipboard: prior.text });
    if (!span.witness.clean) verdict.reasons.push(`the witness changed (${span.witness.fields.join(', ')})`);
    verdict.pass = verdict.reasons.length === 0;
    const ok = this.record('paste-target', 'unreadable', 0, verdict, { answer: span.value.response, ms: Math.round(span.value.ms), pasted, paste: span.value.stats?.paste ?? null });
    await this.desktop.close([scene]);
    return ok;
  }

  /**
   * A caret placed, the focus moved to another of the window's controls, then `type_text` naming the field: the engine
   * clicks the field, puts the caret back (or, where the toolkit refuses, continues where the click left it) and pastes
   * once. `scene`: gedit (background route) or gnome-text-editor (dedicated, the foreground route).
   */
  async caretPlaced(scene, sceneName, { dedicated }) {
    const op = dedicated ? 'restore_refused' : 'caret_placed';
    const { preorder } = await import('./normalize.mjs');
    const nodes = preorder((await this.desktop.state(scene)).ax_tree);
    const control = nodes.find((n) => n.role === 'push button' && (n.states ?? []).includes('focusable') && n.id !== scene.field);
    const engine = this.engine(dedicated ? ['--desktop', 'dedicated'] : []);
    // the foreground route leaves its window active: the front window takes the focus back when the case ends
    if (dedicated) this.defer(() => this.desktop.focusFront(), 'the focus given back');
    const before = textOf(this.oracle, scene.field);
    const placed = 6;
    let caretSet = false;
    try {
      caretSet = this.oracle.setCaret(scene.field, placed);
    } catch {
      // GTK 4 refuses
    }
    let moved;
    if (dedicated) {
      // GTK 4 answers no AT-SPI GrabFocus: the focus moves to the search bar as an agent on a dedicated desktop would move
      // it, the window activated and Ctrl+F sent through the desktop route (harness setup, outside the witnessed span)
      await engine.request('activate_window', { window: { id: scene.id } });
      await sleep(300);
      await engine.request('press_key', { key: 'ctrl+f' });
      await sleep(500);
      moved = this.oracle.states(scene.field).focused === false;
    } else moved = control ? this.oracle.grabFocus(control.id) : false;
    await sleep(300);
    const marker = `cua171-${op}-${stamp()}`;
    const expected = dedicated ? 'foreground' : 'background';
    const span = await routeWitness(this.witness, `case:${op}`, scene.id, expected, () => engine.request('type_text', { window: { id: scene.id }, element_id: scene.field, text: marker }));
    await sleep(300);
    const after = textOf(this.oracle, scene.field);
    if (dedicated) {
      // the search bar closed again (Escape to the window the engine left active), then the focus given back
      await engine.request('press_key', { key: 'Escape' });
      await sleep(200);
    }
    await engine.close();
    const paste = span.value.stats?.paste ?? null;
    const reasons = [];
    if (span.value.response.ok !== true) reasons.push(`answered ${JSON.stringify(span.value.response)}`);
    if (!moved) reasons.push('the focus could not be moved away from the field');
    if (paste?.clicked !== true) reasons.push('the engine did not click the field to focus it');
    if (dedicated) {
      if (paste?.restored !== false) reasons.push(`the restore was ${JSON.stringify(paste?.restored)}, not refused`);
      if (occurrences(String(after), marker) !== 1 || [...String(after)].length !== [...String(before)].length + [...marker].length) reasons.push('the text did not go in exactly once');
    } else {
      if (!caretSet) reasons.push('the caret could not be placed');
      if (paste?.restored !== true) reasons.push(`the restore was ${JSON.stringify(paste?.restored)}`);
      const expected = [...[...before].slice(0, placed), ...marker, ...[...before].slice(placed)].join('');
      if (after !== expected) reasons.push('the text did not land at the placed caret, once');
    }
    // the expected route, then its allowance (judgeRouteSpan): a route other than the expected one fails here
    if (!span.judged.clean) reasons.push(`the witness changed beyond the ${expected} route's allowance (${span.judged.fields.join(', ')})`);
    return this.record(sceneName, op, 0, { pass: reasons.length === 0, reasons }, { answer: span.value.response, ms: Math.round(span.value.ms), route: span.route, route_expected: expected, witness_allowed: span.judged.allowed, witness_changes: (span.report?.changes ?? []).slice(0, 30), witness_restacks: (span.report?.restacks ?? []).slice(0, 30), witness_focus: (span.report?.focus ?? []).slice(0, 30), paste });
  }
}

/** The cases each scene runs, in order. */
export const CASE_OPS = {
  'chrome-textarea': ['focus_change', 'focus_change_takeover', 'silent_owner', 'concurrent', 'contention', 'late_page', 'ignored_page'],
  'paste-target': ['stalled_incr', 'late_convert', 'unreadable'],
  gedit: ['caret_placed'],
  'gnome-text-editor': ['restore_refused'],
};

/**
 * Runs the planned cases (`plan`: `[{scene, op}]` of kind `case`) on windows of their own; returns whether all passed.
 * `openScene(sceneName, role)` opens a scene window as run.mjs does (gedit, gnome-text-editor).
 */
export async function runCases({ desktop, witness, cua, emit, plan, openScene }) {
  const cases = new Cases({ desktop, witness, cua, emit });
  const wanted = (scene, op) => plan.some((p) => p.scene === scene && p.op === op);
  let all = true;
  const run = async (scene, op, fn) => {
    if (!wanted(scene, op)) return;
    try {
      all = (await cases.guarded(fn)) && all;
    } catch (error) {
      all = false;
      emit({ kind: 'case', scene, op, trial: null, pass: false, reasons: [`threw: ${error.message}`, ...(error.cleanupFailures ?? []).map((f) => `cleanup failed: ${f}`)] });
      process.stdout.write(`case ${scene} ${op} threw: ${error.stack}\n`);
    }
  };
  const opened = [];
  const textarea = async (role, paste) => {
    const s = await cases.textarea(role, paste);
    opened.push(s);
    return s;
  };
  try {
    if (CASE_OPS['chrome-textarea'].some((op) => wanted('chrome-textarea', op))) {
      const a = await textarea('case_a');
      const b = await textarea('case_b');
      desktop.focusFront();
      await run('chrome-textarea', 'focus_change', () => cases.focusChange(a, { takeover: false }));
      await run('chrome-textarea', 'focus_change_takeover', () => cases.focusChange(a, { takeover: true }));
      await run('chrome-textarea', 'silent_owner', () => cases.silentOwner(a));
      await run('chrome-textarea', 'concurrent', () => cases.concurrent([a, b]));
      await run('chrome-textarea', 'contention', () => cases.contention([a, b]));
      if (wanted('chrome-textarea', 'late_page')) {
        const late = await textarea('case_late', 'late');
        desktop.focusFront();
        await run('chrome-textarea', 'late_page', () => cases.pageCase(late, 'late_page'));
      }
      if (wanted('chrome-textarea', 'ignored_page')) {
        const ignored = await textarea('case_ignored', 'ignored');
        desktop.focusFront();
        await run('chrome-textarea', 'ignored_page', () => cases.pageCase(ignored, 'ignored_page'));
      }
    }
    await run('paste-target', 'stalled_incr', () => cases.stalledIncr());
    await run('paste-target', 'late_convert', () => cases.lateConvert());
    await run('paste-target', 'unreadable', () => cases.unreadable());
    await run('gedit', 'caret_placed', async () => {
      const s = await openScene('gedit', 'case');
      opened.push(s);
      desktop.focusFront();
      return cases.caretPlaced(s, 'gedit', { dedicated: false });
    });
    await run('gnome-text-editor', 'restore_refused', async () => {
      const s = await openScene('gnome-text-editor', 'case');
      opened.push(s);
      desktop.focusFront();
      return cases.caretPlaced(s, 'gnome-text-editor', { dedicated: true });
    });
  } finally {
    await desktop.close(opened);
  }
  return all;
}

