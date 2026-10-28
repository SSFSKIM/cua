import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditRequests, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';

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
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua' };
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: true, newest: true, cua: true } }).pass, true);
  const dirty = judgeOperation(base, { ...opts, audits: { pinned: true, newest: true, cua: false } });
  assert.equal(dirty.pass, false);
  assert.match(dirty.reasons.join(), /audit/);
  // an operation the audit did not reach for cua is not a clean audit
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: true, newest: true } }).pass, false);
  // activation: no vendor build is clean in either, so neither is required of cua
  const activate = [...rows('pinned', false), ...rows('newest', false), ...rows('cua', false)];
  assert.equal(judgeOperation(activate, { ...opts, audits: { pinned: false, newest: false, cua: false } }).pass, true);
  // no audit pass at all (a run without the audit) leaves the verdict to the witness
  assert.equal(judgeOperation(base, { ...opts, audits: null }).pass, true);
});
