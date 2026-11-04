import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attributeFocusOuts, focusSessions, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { settleFocus } from '../../scripts/linux-engine-diff/events.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { LANES, SCENARIOS, UNCONFIRMED, expectedSessions, focusTimerVerdict, insertedAt, keysOf, missCause, rawOks, readStatsLine, runPasses, tenth, trialRow, scenario, seriesVerdict, settledRead, pasteTexts } from '../../scripts/linux-engine-diff/focus-timer.mjs';

// M4's T7, the FocusOut timer: the audit of each deferred FocusOut. Lines in the shape the VM's xtrace prints a
// background session's SendEvents (audit.test.mjs has the same shapes).
const A = 0x012000f8;
const B = 0x01400010;
const hex = (w) => `0x${w.toString(16).padStart(8, '0')}`;
const send = (window, event) => `000:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(window)} event-mask=0 ${event}`;
const focusIn = (w) => send(w, `FocusIn(9) detail=Nonlinear(0x03) event=${hex(w)} mode=Normal(0x00)`);
const focusOut = (w) => send(w, `FocusOut(10) detail=Nonlinear(0x03) event=${hex(w)} mode=Normal(0x00)`);
const key = (w) => send(w, `KeyPress(2) keycode=0x26 time=0x00000000 root=0x000003c5 event=${hex(w)} child=None(0x00000000) root-x=0 root-y=0 event-x=0 event-y=0 state=0 same-screen=true(0x01)`);
const release = (w) => send(w, `KeyRelease(3) keycode=0x26 time=0x00000000 root=0x000003c5 event=${hex(w)} child=None(0x00000000) root-x=0 root-y=0 event-x=0 event-y=0 state=0 same-screen=true(0x01)`);
const trace = (lines) => parseXtrace(lines.join('\n'));
const burst = (w, n) => [focusIn(w), ...Array.from({ length: n }, () => [key(w), release(w)]).flat(), focusOut(w)];
const record = (window, scheduled_by, cause, after_input_ms = 100.2, reported_on = null) => ({ window, cause, after_input_ms, scheduled_by, reported_on });

test("a background burst's synthetic focus is one session: its FocusIn, its keys, its FocusOut", () => {
  const { sessions, problems } = focusSessions(trace(burst(A, 3)));
  assert.deepEqual(problems, []);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].destination, A);
  assert.equal(sessions[0].inputs, 6);
  assert.equal(sessions[0].closed, true);
});

test('two windows under synthetic focus at once, input outside a session, a stray FocusOut and an unclosed session are each found', () => {
  // A's FocusOut after B's FocusIn: a flush that did not run before input to another window
  const overlap = focusSessions(trace([focusIn(A), key(A), focusIn(B), key(B), focusOut(A), focusOut(B)]));
  assert.match(overlap.problems.join('\n'), /two windows under synthetic focus at once/);
  assert.match(focusSessions(trace([key(A)])).problems.join('\n'), /input to 0x12000f8 outside a session/);
  assert.match(focusSessions(trace([focusOut(A)])).problems.join('\n'), /FocusOut to 0x12000f8 with no session open/);
  assert.match(focusSessions(trace([focusIn(A), key(A)])).problems.join('\n'), /0x12000f8's session was never closed/);
  assert.match(focusSessions(trace([focusIn(A), focusIn(A), focusOut(A)])).problems.join('\n'), /FocusIn to 0x12000f8 while its session was open/);
});

test('each FocusOut in the trace is attributed to the request whose input started its timer, deferred past its answer', () => {
  // A's burst (requests 1-3), B's (4-6), A's again (7-9): A flushed by 4, B by 7, A's last on its timer after 9's answer
  const lines = [...burst(A, 3), ...burst(B, 3), ...burst(A, 3)];
  const records = [record(A, 3, 'flush', 100.1, 4), record(B, 6, 'flush', 100.3, 7), record(A, 9, 'timer', 100.0, null)];
  const judged = attributeFocusOuts(trace(lines), records, { delayMs: 100 });
  assert.deepEqual(judged.problems, []);
  assert.equal(judged.clean, true);
  assert.deepEqual(
    judged.attributed.map(({ window, scheduled_by, cause, deferred }) => ({ window, scheduled_by, cause, deferred })),
    [
      { window: A, scheduled_by: 3, cause: 'flush', deferred: true },
      { window: B, scheduled_by: 6, cause: 'flush', deferred: true },
      { window: A, scheduled_by: 9, cause: 'timer', deferred: true },
    ],
  );
  // the control lane's: sent within its own request, before its answer
  const control = attributeFocusOuts(trace(burst(A, 1)), [record(A, 1, 'timer', 0.01, 1)], { delayMs: 0 });
  assert.deepEqual(control.attributed.map((a) => a.deferred), [false]);
});

test('a FocusOut sooner than the delay, a FocusOut the engine did not report, and one it reported but never sent each fail the audit', () => {
  const lines = burst(A, 2);
  assert.match(attributeFocusOuts(trace(lines), [record(A, 2, 'flush', 61.5, 3)], { delayMs: 100 }).problems.join('\n'), /61\.5 ms after its window's last input/);
  assert.match(attributeFocusOuts(trace(lines), [], { delayMs: 100 }).problems.join('\n'), /1 FocusOut in the trace and 0 reported/);
  assert.match(attributeFocusOuts(trace(lines), [record(A, 2, 'timer'), record(A, 2, 'timer')], { delayMs: 100 }).problems.join('\n'), /1 FocusOut in the trace and 2 reported/);
  assert.match(attributeFocusOuts(trace(lines), [record(B, 2, 'timer')], { delayMs: 100 }).problems.join('\n'), /the 1st FocusOut went to 0x12000f8, reported for 0x1400010/);
  // the control lane, no delay: each FocusOut within its own request is no failure
  assert.equal(attributeFocusOuts(trace(lines), [record(A, 2, 'timer', 0.02, 2)], { delayMs: 0 }).clean, true);
});

test('a trace with no requests is not clean', () => {
  assert.equal(attributeFocusOuts(trace([]), [], { delayMs: 100 }).clean, false);
});

// The events experiment compares each request's events with the pinned build's. cua's FocusOut follows a request's
// answer on its timer, so a step's events are read once the synthetic focus it left open has closed, as the pinned
// build's closes before it answers; a hold keeps its session open in every engine, and is read after the bound.
const ev = (type) => ({ type, send: true, detail: 3, mode: 0, window: 'top' });
const keyEvent = (type) => ({ type, send: true, detail: 38, state: 0, window: 'top', x: 0, y: 0, root_x: 0, root_y: 0 });

test("a step's events are read on until the synthetic focus it opened closes", async () => {
  const later = [[], [ev('FocusOut')]];
  let marks = 0;
  const mark = async () => later[marks++] ?? [];
  const { events, open } = await settleFocus([ev('FocusIn'), keyEvent('KeyPress'), keyEvent('KeyRelease')], { mark, sleep: async () => {}, boundMs: 300, pollMs: 20 });
  assert.equal(open, 0);
  assert.deepEqual(
    events.map((e) => e.type),
    ['FocusIn', 'KeyPress', 'KeyRelease', 'FocusOut'],
  );
  assert.equal(marks, 2);
});

test('a step whose focus closed before its answer is read once, as the vendor builds answer', async () => {
  let marks = 0;
  const { events, open } = await settleFocus([ev('FocusIn'), keyEvent('KeyPress'), ev('FocusOut')], {
    mark: async () => {
      marks += 1;
      return [];
    },
    sleep: async () => {},
  });
  assert.equal(open, 0);
  assert.equal(events.length, 3);
  assert.equal(marks, 0);
});

test("a held key's session stays open: the step is read after the bound, and the next step starts with it open", async () => {
  let slept = 0;
  const first = await settleFocus([ev('FocusIn'), keyEvent('KeyPress')], {
    mark: async () => [],
    sleep: async (ms) => {
      slept += ms;
    },
    boundMs: 300,
    pollMs: 20,
  });
  assert.equal(first.open, 1);
  assert.ok(slept >= 300, `${slept}`);
  // the release, in the next step: its FocusOut closes the session the earlier step opened
  const next = await settleFocus([keyEvent('KeyRelease')], { open: first.open, mark: async () => [ev('FocusOut')], sleep: async () => {} });
  assert.equal(next.open, 0);
  assert.deepEqual(
    next.events.map((e) => e.type),
    ['KeyRelease', 'FocusOut'],
  );
});

// The experiment's own rules (focus-timer.mjs).
test("a scenario's keys type its text, capitals through Shift, and each window's expected text is its own", () => {
  assert.deepEqual(keysOf('aBc'), ['a', 'shift+b', 'c']);
  const aba = scenario('aba', { a: 1, b: 2 });
  assert.deepEqual(aba.expected, { a: 'abcDefgHqrsTuvwX', b: 'ijkLmnoP' });
  assert.deepEqual(aba.requests.map((r) => r.input.window.id).filter((w, i, all) => i === 0 || all[i - 1] !== w), [1, 2, 1], 'A, then B, then A again');
  const paste = scenario('paste', { a: 1 });
  assert.deepEqual(paste.requests.at(-1), { command: 'type_text', input: { window: { id: 1 }, text: 'Pasted' } });
  assert.equal(paste.expected.a, 'abcDefgHPasted');
  const tagged = scenario('paste', { a: 1 }, { pasted: 'Pastedaab' });
  assert.deepEqual(tagged.requests.at(-1).input.text, 'Pastedaab');
  assert.equal(tagged.expected.a, 'abcDefgHPastedaab');
});

test("each run's paste text is its own in the sitting, letters only: a terminal's screen holds many runs' text, and a paste whose text the scrolled screen already shows cannot be confirmed", () => {
  const next = pasteTexts();
  const texts = Array.from({ length: 26 * 26 + 3 }, () => next());
  assert.equal(new Set(texts).size, texts.length);
  assert.equal(texts[0], 'Pastedaaa');
  assert.ok(texts.every((t) => /^Pasted[a-z]{3}$/.test(t)), texts.find((t) => !/^Pasted[a-z]{3}$/.test(t)));
  // no run's text holds another's
  assert.ok(texts.every((t, i) => texts.every((u, j) => i === j || !t.includes(u))));
});

test('the text must be the expected one at the caret read before, exactly: a key out of order, one missing or one late fails', () => {
  assert.equal(insertedAt('xy', 1, 'abc', 'xabcy'), true);
  assert.equal(insertedAt('xy', 1, 'abc', 'xacby'), false, 'reordered');
  assert.equal(insertedAt('xy', 1, 'abc', 'xaby'), false, 'cut');
  assert.equal(insertedAt('xy', 1, 'abc', 'xabcy?'), false, 'more than the text');
  // the rotation a prefix-and-suffix diff would take for the text: the caret tells them apart
  assert.equal(insertedAt('b', 0, 'ab', 'bab'), false);
  assert.equal(insertedAt('xy', null, 'abc', 'xabcy'), false, 'no caret, no verdict');
});

test('a timer series needs 30 consecutive passes: a miss restarts it and is counted', () => {
  assert.equal(seriesVerdict(Array(30).fill(true)).reached, true);
  const missed = seriesVerdict([...Array(29).fill(true), false, ...Array(29).fill(true)]);
  assert.deepEqual(missed, { runs: 59, misses: 1, streak: 29, reached: false });
  assert.equal(seriesVerdict([...Array(10).fill(true), false, ...Array(30).fill(true)]).reached, true);
});

test('the sessions a scenario must leave: one per burst on the timer lane, one per request on the control lane', () => {
  const ids = { a: 7, b: 9 };
  assert.deepEqual(expectedSessions('burst', 'timer', ids), [7]);
  assert.deepEqual(expectedSessions('aba', 'timer', ids), [7, 9, 7]);
  assert.deepEqual(expectedSessions('paste', 'timer', ids), [7, 7]);
  assert.equal(expectedSessions('burst', 'control', ids).length, 20);
  assert.deepEqual(expectedSessions('paste', 'control', ids), Array(9).fill(7));
});

const passingSeries = (family, lane, name) => ({ family, lane, scenario: name, runs: lane === 'control' ? 10 : 30, misses: lane === 'control' ? 4 : 0, streak: 30, reached: lane !== 'control', burst_ms_median: 3 });
const cleanAudit = (family, lane) => ({ family, lane, clean: true, attributed: [], deferred: 0, sessions: { expected: [1], seen: [1] }, problems: [], forbidden: [] });
const stopRow = (signal, ok) => ({ family: 'chrome', signal, ok, exited_after_answer_ms: 110 });
const results = (edit = (r) => r) =>
  edit({
    series: ['chrome', 'gedit'].flatMap((f) => ['timer', 'unredirect', 'control'].flatMap((lane) => SCENARIOS.map((name) => passingSeries(f, lane, name)))),
    audits: ['chrome', 'gedit'].flatMap((f) => ['timer', 'control'].map((lane) => cleanAudit(f, lane))),
    stops: [stopRow('SIGTERM', true), stopRow('SIGKILL', true)],
    skipped: [],
  });

test("the verdict passes only when every family's lanes, audits and stops did what they must", () => {
  const families = ['chrome', 'gedit'];
  assert.deepEqual(focusTimerVerdict(results(), { families }).failed, []);
  const failing = (edit) => focusTimerVerdict(results(edit), { families }).failed.join('\n');
  assert.match(
    failing((r) => ({ ...r, series: r.series.map((s) => (s.family === 'gedit' && s.lane === 'timer' && s.scenario === 'aba' ? { ...s, reached: false, misses: 2 } : s)) })),
    /gedit aba: no 30 consecutive passing runs/,
  );
  assert.match(
    failing((r) => ({ ...r, series: r.series.map((s) => (s.family === 'chrome' && s.lane === 'control' && s.scenario === 'paste' ? { ...s, misses: 0 } : s)) })),
    /chrome paste: the control lane showed no reorder/,
  );
  // the delay alone, each request's redirect dropped with its FocusOut as the control's is, must pass as the timer does
  assert.match(
    failing((r) => ({ ...r, series: r.series.map((s) => (s.family === 'chrome' && s.lane === 'unredirect' && s.scenario === 'burst' ? { ...s, reached: false, misses: 1 } : s)) })),
    /chrome burst \(unredirect\): no 30 consecutive passing runs/,
  );
  // the control's line says how its runs failed: a text cut or reordered, or only an answer (a paste racing the keys)
  const lines = focusTimerVerdict(results((r) => ({ ...r, series: r.series.map((s) => (s.lane === 'control' ? { ...s, wrong_text: 1 } : s)) })), { families }).md;
  assert.ok(lines.some((l) => l.startsWith('| chrome | control | burst |') && l.includes('fails without the delay (4/10; the text wrong in 1)')), lines.join('\n'));
  // a family where nothing reorders without the delay is reported, not failed
  assert.deepEqual(failing((r) => ({ ...r, series: r.series.map((s) => (s.family === 'gedit' && s.lane === 'control' ? { ...s, misses: 0 } : s)) })), '');
  assert.match(failing((r) => ({ ...r, audits: r.audits.map((a, i) => (i === 0 ? { ...a, clean: false } : a)) })), /chrome timer: the audit is not clean/);
  assert.match(failing((r) => ({ ...r, stops: [stopRow('SIGTERM', false), stopRow('SIGKILL', true)] })), /chrome SIGTERM: 1 of 1 runs did not drain/);
  assert.match(failing((r) => ({ ...r, stops: [stopRow('SIGTERM', true), stopRow('SIGKILL', false)] })), /chrome SIGKILL: .*the drain check is blind/);
  assert.match(failing((r) => ({ ...r, skipped: [{ family: 'gedit', why: 'no window' }], series: r.series.filter((s) => s.family !== 'gedit') })), /gedit could not be opened/);
  assert.match(focusTimerVerdict(results(), { families: [...families, 'kate'] }).failed.join('\n'), /kate was not measured/);
});

test('the lanes: the engine as it ships; the delay alone with each request unredirecting; the control, that without the delay', () => {
  assert.deepEqual(LANES.timer, []);
  assert.deepEqual(LANES.unredirect, ['--retention', 'per-request']);
  assert.deepEqual(LANES.control, ['--teardown-ms', '0', '--retention', 'per-request']);
});

test("a run passes on its text and its answers; only a Qt paste's unconfirmed answer is excused, its text still exact", () => {
  assert.equal(runPasses({ family: 'chrome', errors: [], exact: { a: true } }), true);
  assert.equal(runPasses({ family: 'chrome', errors: [UNCONFIRMED], exact: { a: true } }), false, 'Chromium confirms its pastes');
  assert.equal(runPasses({ family: 'kate', errors: [UNCONFIRMED], exact: { a: true } }), true);
  assert.equal(runPasses({ family: 'kate', errors: [UNCONFIRMED], exact: { a: false } }), false, 'the text decides');
  assert.equal(runPasses({ family: 'qtcreator', errors: ['requested field or selection changed before dispatch; nothing was sent'], exact: { a: true } }), false);
  assert.equal(runPasses({ family: 'gedit', errors: [], exact: { a: true, b: false } }), false);
});

// a fake clock and its reads: each read returns the next text, each wait advances the clock
const reads = (texts) => {
  let t = 0;
  let i = 0;
  return {
    read: async () => ({ text: texts[Math.min(i++, texts.length - 1)], caret: 0 }),
    opts: { sleep: async (ms) => { t += ms; }, now: () => t },
    count: () => i,
  };
};

test('a read settles when two reads agree, once the text is as long as the run must make it, at most the bound', async () => {
  // two equal reads before the keys show (a loaded renderer's tree) do not settle a read that waits for 4 characters
  const late = reads(['', '', '', 'ab', 'abcd', 'abcd']);
  assert.deepEqual(await settledRead(late.read, { want: 4, ...late.opts }), { text: 'abcd', caret: 0, settled: true, long_enough: true });
  // with nothing to wait for, two equal reads settle at once
  const now = reads(['x', 'x']);
  assert.equal((await settledRead(now.read, now.opts)).text, 'x');
  assert.equal(now.count(), 2);
  // keys that never come (a cut, delivered only with a later FocusIn) leave the read short at the bound, judged as read
  const cut = reads(['ab']);
  const short = await settledRead(cut.read, { want: 4, ...cut.opts });
  assert.equal(short.text, 'ab');
  assert.equal(short.long_enough, false);
});

test("a miss's cause: the guard refusing after an earlier miss is told apart from a miss of the run's own", () => {
  const run = (errors, exact = true) => ({ ok: false, errors, exact: { a: exact } });
  assert.equal(missCause(run(['a previous paste could not be confirmed and may still be read; nothing was sent; retry after 5 s'], false)), 'guard');
  assert.equal(missCause(run([UNCONFIRMED])), 'unconfirmed');
  assert.equal(missCause(run(['requested field or selection changed before dispatch; nothing was sent'], false)), 'refused');
  assert.equal(missCause(run([], false)), 'text');
  assert.equal(missCause({ ok: true, errors: [], exact: { a: true } }), null);
});

test("a run's row names its index `trial`, so the sitting's own `run` name survives the emit", () => {
  const row = trialRow('focus-timer-run', { family: 'chrome', lane: 'timer', scenario: 'burst' }, 7, { ok: true, run: 3 });
  assert.deepEqual(row, { kind: 'focus-timer-run', family: 'chrome', lane: 'timer', scenario: 'burst', trial: 7, ok: true });
  // the emit puts the sitting's name first and the row's fields after it: nothing in the row may overwrite it
  assert.equal({ run: 't56-idle', ...row }.run, 't56-idle');
});

test('times are kept to a tenth of a millisecond, medians included', () => {
  assert.equal(tenth(10.649999999999999), 10.6);
  assert.equal(tenth(null), null);
});

test('the raw count adds what independent starts hide: a tail an earlier cut left, a paste the retry guard would refuse', () => {
  const row = (ok, extra = {}) => ({ ok, miss: ok ? null : 'text', tail_at_start: false, ...extra });
  // run 1 cut its keys; on an independent start run 2 is clean, but its start met run 1's tail: a raw miss
  assert.deepEqual(rawOks([row(true), row(false), row(true, { tail_at_start: true }), row(true)]), [true, false, false, true]);
  // an unconfirmed paste: the next run's paste would have met the retry guard, had its start not waited it out
  assert.deepEqual(rawOks([row(false, { miss: 'unconfirmed' }), row(true), row(true)]), [false, false, true]);
});

test("the summary shows each series' independent and raw counts; the verdict judges the independent ones", () => {
  const families = ['chrome', 'gedit'];
  const lines = focusTimerVerdict(results((r) => ({ ...r, series: r.series.map((s) => (s.family === 'chrome' && s.lane === 'timer' && s.scenario === 'burst' ? { ...s, raw: { misses: 2, streak: 28, reached: false } } : s)) })), { families });
  assert.ok(lines.md.some((l) => l.startsWith('| chrome | timer | burst |') && l.includes('| 2 | 28 |')), lines.md.join('\n'));
  assert.deepEqual(lines.failed, [], 'raw misses are reported, not failed');
});

test("the exit settle's measured steps: the stop runs alone, the settle 0 included (the 100 ms drain alone)", () => {
  const args = parseArgs(['--experiment', 'focus-timer', '--cua', '/bin/true', '--out', '/tmp/x', '--stops-only', '--exit-settle-ms', '0']);
  assert.equal(args.stopsOnly, true);
  assert.equal(args.exitSettleMs, 0);
  assert.equal(parseArgs(['--experiment', 'focus-timer', '--cua', '/bin/true', '--out', '/tmp/x', '--exit-settle-ms', '250']).exitSettleMs, 250);
  assert.throws(() => parseArgs(['--experiment', 'focus-timer', '--cua', '/bin/true', '--out', '/tmp/x', '--exit-settle-ms', '-1']), /--exit-settle-ms/);
});

test("a --stats line's FocusOuts are read apart from the exit's settle, which is no FocusOut", () => {
  const out = { window: 7, cause: 'exit', after_input_ms: 100.1, scheduled_by: 20 };
  assert.deepEqual(readStatsLine(JSON.stringify({ stats: { id: null, focus_out: [out] } })), { focusOuts: [{ ...out, reported_on: null }], settle: null });
  assert.deepEqual(readStatsLine(JSON.stringify({ stats: { id: null, exit_settle: { waited_ms: 151.2 } } })), { focusOuts: [], settle: { waited_ms: 151.2 } });
  assert.deepEqual(readStatsLine(JSON.stringify({ stats: { id: 3, command: 'press_key' } })), { focusOuts: [], settle: null });
  assert.equal(readStatsLine('not stats'), null);
});
