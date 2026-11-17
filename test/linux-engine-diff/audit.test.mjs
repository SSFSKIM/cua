import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditHeldRelease, auditRequests, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';

// Lines in the shape the VM's xtrace prints them (R/F §0, §4.1; the vendor traces under W/traces/).
const XTEST_QUERY = [
  "000:<:0232: 16: Request(98): QueryExtension name='XTEST'",
  '000:>:0232:32: Reply to QueryExtension: present=true(0x01) major-opcode=132 first-event=0 first-error=0',
];
const FAKE_INPUT = '000:<:0233: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=0x06,0x00';
const BACKGROUND = [
  '000:<:02db: 44: Request(25): SendEvent propagate=false(0x00) destination=0x012000f8 event-mask=0 EnterNotify(7) detail=Nonlinear(0x03) mode=Normal(0x00)',
  '000:<:02dd: 44: Request(25): SendEvent propagate=false(0x00) destination=0x012000f8 event-mask=0 MotionNotify(6) detail=Normal(0x00)',
  '000:<:02de: 16: Request(12): ConfigureWindow window=0x012000f8 values={width=10}',
  "000:<:02df: 16: Request(18): ChangeProperty mode=Replace(0x00) window=0x012000f8 property=0x134(\"_NET_ACTIVE_WINDOW\")",
  '000:>:02e0:32: Reply to GetInputFocus: revert-to=Parent(0x02) focus=0x012000f8',
];
const ACTIVATE = '000:<:012b: 44: Request(25): SendEvent propagate=false(0x00) destination=0x0000021d event-mask=SubstructureNotify,SubstructureRedirect ClientMessage(33) format=0x20 window=0x012000f8 type=0x134("_NET_ACTIVE_WINDOW") data=0x01';
const RAISE = '000:<:012d: 16: Request(12): ConfigureWindow window=0x012000f8 values={stack-mode=Above(0x00)}';
const FOCUS = '001:<:012f: 12: Request(42): SetInputFocus revert-to=PointerRoot(0x01) focus=0x012000f8 time=CurrentTime(0x00000000)';
const WARP = '001:<:0130: 24: Request(41): WarpPointer src-window=None(0x00000000) dst-window=0x0000021d';

test('parseXtrace reads requests per connection and the extensions the server reported', () => {
  const parsed = parseXtrace([...XTEST_QUERY, FAKE_INPUT, ...BACKGROUND, FOCUS].join('\n'));
  assert.equal(parsed.extensions.XTEST, 132);
  const fake = parsed.requests.find((r) => r.seq === 0x233);
  assert.deepEqual([fake.conn, fake.major, fake.minor], [0, 132, 2]);
  assert.equal(parsed.requests.find((r) => r.seq === 0x12f).conn, 1);
  assert.equal(parsed.requests.find((r) => r.seq === 0x12f).name, 'SetInputFocus');
  // replies are not requests
  assert.equal(parsed.requests.filter((r) => r.seq === 0x2e0).length, 0);
});

test('the background route passes the audit: synthetic events, a resize and a property write are allowed', () => {
  const audit = auditRequests(parseXtrace([...XTEST_QUERY, ...BACKGROUND].join('\n')));
  assert.equal(audit.clean, true);
  assert.deepEqual(audit.forbidden, []);
  assert.ok(audit.requests > 0);
});

test('each forbidden request fails the audit, named', () => {
  for (const [line, what] of [
    [ACTIVATE, '_NET_ACTIVE_WINDOW ClientMessage'],
    [RAISE, 'ConfigureWindow stack-mode'],
    [FOCUS, 'SetInputFocus'],
    [WARP, 'WarpPointer'],
    [FAKE_INPUT, 'XTEST FakeInput'],
  ]) {
    const audit = auditRequests(parseXtrace([...XTEST_QUERY, ...BACKGROUND, line].join('\n')));
    assert.equal(audit.clean, false, what);
    assert.deepEqual(audit.forbidden.map((f) => f.what), [what]);
  }
});

test("FakeInput is matched by the server's XTEST opcode, wherever xtrace's decoder names it", () => {
  // another server reporting XTEST at another opcode, and a decoder that prints the request generically
  const lines = [
    "000:<:0001: 16: Request(98): QueryExtension name='XTEST'",
    '000:>:0001:32: Reply to QueryExtension: present=true(0x01) major-opcode=140 first-event=0 first-error=0',
    '000:<:0002: 36: Request(140,2): UNKNOWN',
    '000:<:0003: 36: Request(132,2): UNKNOWN',
  ];
  const audit = auditRequests(parseXtrace(lines.join('\n')));
  assert.deepEqual(audit.forbidden.map((f) => [f.seq, f.what]), [[2, 'XTEST FakeInput']]);
  // XTEST's other requests (GetVersion, CompareCursor) are not input
  assert.equal(auditRequests(parseXtrace([...XTEST_QUERY, '000:<:0234: 8: XTEST-Request(132,0): GetVersion'].join('\n'))).clean, true);
});

test('an empty or unreadable trace is never a clean audit', () => {
  assert.equal(auditRequests(parseXtrace('')).clean, false);
  assert.equal(auditRequests(parseXtrace('garbage\nmore garbage')).clean, false);
});

test('the verdict needs a clean audit wherever a vendor build keeps its witness or audit clean', async () => {
  const { judgeOperation } = await import('../../scripts/linux-engine-diff/stats.mjs');
  const rows = (engine, witness) => [
    { engine, series: 'cold', ms: 100, ok: true, witness, effect: true, equal: true },
    { engine, series: 'warm', ms: 90, ok: true, witness, effect: true, equal: true },
  ];
  const base = [...rows('pinned', true), ...rows('newest', true), ...rows('cua', true)];
  // the audit is judged here; speed needs 20 samples a side (speed-guard.test.mjs)
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', judgeSpeed: false };
  const a = (clean) => ({ clean, oks: [true, true] });
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: a(true), newest: a(true), cua: a(true) } }).pass, true);
  const dirty = judgeOperation(base, { ...opts, audits: { pinned: a(true), newest: a(true), cua: a(false) } });
  assert.equal(dirty.pass, false);
  assert.match(dirty.reasons.join(), /audit/);
  // an operation the audit did not reach for cua is not a clean audit
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: a(true), newest: a(true) } }).pass, false);
  // activation: no vendor build is clean in either, so neither is required of cua
  const activate = [...rows('pinned', false), ...rows('newest', false), ...rows('cua', false)];
  assert.equal(judgeOperation(activate, { ...opts, audits: { pinned: a(false), newest: a(false), cua: a(false) } }).pass, true);
  // no audit pass at all (a run without the audit) leaves the verdict to the witness
  assert.equal(judgeOperation(base, { ...opts, audits: null }).pass, true);
});

// M4's T4: a key held, the window minimized, then released. The trace is split at the harness's marks (the proxy's log
// offsets: `hold:<i>` and `held:<i>` around the hold, `release:<i>` and `released:<i>` around the release and its quiet),
// so each request is attributed to the request that sent it.
const TARGET = 0x012000f8;
const send = (seq, event, extra = '') => `000:<:${seq}: 44: Request(25): SendEvent propagate=false(0x00) destination=0x012000f8 event-mask=0 ${event}${extra}`;
const KEY_PRESS = (seq) => send(seq, 'KeyPress(2) keycode=0x32', ' time=0x00000000 root=0x000003c5 event=0x012000f8 child=None(0x00000000) root-x=1 root-y=1 event-x=1 event-y=1 state=0 same-screen=true(0x01)');
const KEY_RELEASE = (seq, code = '0x32') => send(seq, `KeyRelease(3) keycode=${code}`, ' time=0x00000000 root=0x000003c5 event=0x012000f8 child=None(0x00000000) root-x=1 root-y=1 event-x=1 event-y=1 state=Shift same-screen=true(0x01)');
const FOCUS_IN = (seq) => send(seq, 'FocusIn(9) detail=Nonlinear(0x03) event=0x012000f8 mode=Normal(0x00)');
const FOCUS_OUT = (seq) => send(seq, 'FocusOut(10) detail=Nonlinear(0x03) event=0x012000f8 mode=Normal(0x00)');
const MOTION = (seq) => send(seq, 'MotionNotify(6) detail=Normal(0x00)');
const fake = (seq, type, detail) => `000:<:${seq}: 36: XTEST-Request(132,2): UNKNOWN opcode=0x84 opcode2=0x02 unparsed-data=${type},${detail},0x00,0x00,0x00,0x00,0x00,0x00`;
const XTEST_PRESS = (seq) => fake(seq, '0x02', '0x32');
const XTEST_RELEASE = (seq) => fake(seq, '0x03', '0x32');

/** A trace's text and its marks, from lines and `{mark}` entries, the marks at the byte offsets the proxy records. */
function traced(parts) {
  let text = '';
  const marks = [];
  for (const part of parts) {
    if (typeof part === 'string') text += `${part}\n`;
    else marks.push({ tag: part.mark, at: Buffer.byteLength(text) });
  }
  return { trace: parseXtrace(text), marks };
}
const held = (route, parts) => {
  const { trace, marks } = traced([...XTEST_QUERY, ...parts]);
  return auditHeldRelease(trace, TARGET, { route, marks });
};
const m = (tag) => ({ mark: tag });

test('parseXtrace records where each request starts in the trace, in bytes, for the marks', () => {
  const { trace, marks } = traced([KEY_PRESS('0010'), m('held:0'), 'garbage é', KEY_RELEASE('0011')]);
  const [press, release] = trace.requests;
  assert.equal(press.at, 0);
  assert.ok(marks[0].at > press.at && marks[0].at <= release.at);
  assert.equal(release.at, Buffer.byteLength(`${KEY_PRESS('0010')}\ngarbage é\n`));
});

test('a background hold released on its minimized window: the hold proven, then exactly its release, the teardown allowed', () => {
  const sample = (i, release) => [m(`hold:${i}`), FOCUS_IN('0010'), KEY_PRESS('0011'), m(`held:${i}`), m(`release:${i}`), ...release, m(`released:${i}`)];
  const clean = held('background', [...sample(0, [KEY_RELEASE('0012'), FOCUS_OUT('0013')]), ...sample(1, [KEY_RELEASE('0022')])]);
  assert.deepEqual([clean.clean, clean.forbidden], [true, []]);
  assert.deepEqual(clean.samples.map((s) => s.held), [['key 50'], ['key 50']]);
  // the negative controls: a no-op release, and one that sends an extra press
  assert.equal(held('background', sample(0, [])).clean, false, 'a no-op key_up');
  assert.equal(held('background', sample(0, [FOCUS_OUT('0013')])).clean, false, 'only the teardown');
  assert.equal(held('background', sample(0, [KEY_PRESS('0012'), KEY_RELEASE('0013')])).clean, false, 'an extra press');
  assert.equal(held('background', sample(0, [KEY_RELEASE('0012'), KEY_RELEASE('0013')])).clean, false, 'released twice');
  assert.equal(held('background', sample(0, [KEY_RELEASE('0012', '0x25')])).clean, false, 'another key released');
  assert.equal(held('background', sample(0, [KEY_RELEASE('0012'), MOTION('0013')])).clean, false, 'motion');
  assert.equal(held('background', sample(0, [XTEST_RELEASE('0012')])).clean, false, 'released through XTEST');
  for (const line of [ACTIVATE, RAISE, FOCUS, WARP]) assert.equal(held('background', sample(0, [KEY_RELEASE('0012'), line])).clean, false, line);
  // the hold must be proven first: a release with no press before it proves nothing
  assert.equal(held('background', [m('hold:0'), FOCUS_IN('0010'), m('held:0'), m('release:0'), KEY_RELEASE('0012'), m('released:0')]).clean, false, 'no hold');
  // input outside the attributed spans, and a sample whose marks are missing
  assert.equal(held('background', [KEY_PRESS('0009'), ...sample(0, [KEY_RELEASE('0012')])]).clean, false, 'a press outside the spans');
  assert.equal(held('background', [m('hold:0'), KEY_PRESS('0011'), m('held:0'), KEY_RELEASE('0012')]).clean, false, 'the release unmarked');
  assert.equal(held('background', []).clean, false, 'no sample');
});

test('a foreground hold released on its minimized window: XTEST releases exactly the held keys, and nothing activates', () => {
  const sample = (i, release) => [m(`hold:${i}`), ACTIVATE, RAISE, FOCUS, XTEST_PRESS('0011'), m(`held:${i}`), m(`release:${i}`), ...release, m(`released:${i}`)];
  const clean = held('foreground', [...sample(0, [XTEST_RELEASE('0012')]), ...sample(1, [XTEST_RELEASE('0022')])]);
  assert.deepEqual([clean.clean, clean.forbidden], [true, []]);
  assert.deepEqual(clean.samples.map((s) => s.held), [['key 50'], ['key 50']]);
  assert.equal(held('foreground', sample(0, [])).clean, false, 'a no-op key_up');
  assert.equal(held('foreground', sample(0, [XTEST_PRESS('0012'), XTEST_RELEASE('0013')])).clean, false, 'an extra press');
  assert.equal(held('foreground', sample(0, [fake('0012', '0x06', '0x00'), XTEST_RELEASE('0013')])).clean, false, 'motion');
  assert.equal(held('foreground', sample(0, [fake('0012', '0x04', '0x01'), XTEST_RELEASE('0013')])).clean, false, 'a button press');
  for (const line of [ACTIVATE, RAISE, FOCUS, WARP]) assert.equal(held('foreground', sample(0, [line, XTEST_RELEASE('0012')])).clean, false, `the release sent ${line}`);
  assert.equal(held('foreground', sample(0, [KEY_RELEASE('0012')])).clean, false, 'released by SendEvent instead');
  // the hold's activation names the target; another window's is forbidden even there
  const other = ACTIVATE.replace('window=0x012000f8', 'window=0x01400001');
  assert.equal(held('foreground', [m('hold:0'), other, XTEST_PRESS('0011'), m('held:0'), m('release:0'), XTEST_RELEASE('0012'), m('released:0')]).clean, false, 'another window activated');
  assert.equal(held('foreground', [m('hold:0'), ACTIVATE, m('held:0'), m('release:0'), XTEST_RELEASE('0012'), m('released:0')]).clean, false, 'no hold');
  assert.equal(auditHeldRelease(parseXtrace(''), TARGET, { route: 'foreground', marks: [] }).clean, false, 'no trace');
});
