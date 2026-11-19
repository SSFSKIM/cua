// A minimized release case's rows keep no key code (#171 M5, task 106, fix waves 5 and 6). On `:0` the foreground case reads
// the server's whole keymap (QueryKeymap) before the hold, while held and after the release, and the background case's
// recorder window can receive real input: a key the person holds or types would reach the row. The row keeps the
// engine's own synthetic events (the case's Shift) and, for everything else, only classes and counts; judgeMinimized
// judges the kept form exactly as it judged the codes. Display-free.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { MINIMIZED_OPS, durableKeys, judgeMinimized } from '../../scripts/linux-engine-diff/minimized.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FOREGROUND = 'minimized_xterm_key_up_foreground';
const BACKGROUND = 'minimized_key_up_background';
const audit = { clean: true, kind: 'held-release', answered: [{ ok: true }] };
const ok = (extra) => ({ block: 0, i: 0, ok: true, witness: true, still_minimized: true, ...extra });
const ev = (type, extra = {}) => ({ type, send: true, detail: 50, window: 'top', ...extra });
const focusIn = { type: 'FocusIn', send: true, detail: 3, mode: 0, window: 'top' };
const focusOut = { type: 'FocusOut', send: true, detail: 3, mode: 0, window: 'top' };
// the person's key, held or typed while the case runs: code 37, which the row must never keep
const PERSON = 37;
const real = (type) => ({ type, send: false, detail: PERSON, window: 'top', state: 4 });

/** A durable row's key and button events carry no code: a token at most (fix wave 6). */
const codeFree = (kept) => [...(kept.hold_events ?? []), ...(kept.release_events ?? [])].every((e) => !/^(Key|Button)/.test(e.type) || e.detail === undefined || /^k\d+$/.test(e.detail));

/** The verdict of a row as recorded, and as its durable form: the same, and the durable form holds no code. */
function same(op, row) {
  const kept = durableKeys(row);
  assert.deepEqual(judgeMinimized(op, [kept], audit), judgeMinimized(op, [row], audit), JSON.stringify(row));
  assert.ok(!JSON.stringify(kept).includes(`${PERSON}`), JSON.stringify(kept));
  assert.ok(codeFree(kept), JSON.stringify(kept));
  for (const f of ['keys_before', 'keys_held', 'keys_down']) assert.ok(!(f in kept), `${f} kept`);
  return kept;
}

test("a foreground case's keymap reads are kept as counts only, judged as before, whatever the person holds", () => {
  const rows = [
    ok({ keys_before: [], keys_held: [50], keys_down: [] }),
    ok({ keys_before: [], keys_held: [50], keys_down: [50] }),
    ok({ keys_before: [], keys_held: [], keys_down: [] }),
    ok({ keys_before: [PERSON], keys_held: [PERSON, 50], keys_down: [PERSON] }),
    ok({ keys_before: [PERSON], keys_held: [PERSON, 50], keys_down: [] }),
    ok({ keys_before: [], keys_held: [PERSON], keys_down: [] }),
    ok({ keys_before: [PERSON], keys_held: [PERSON], keys_down: [PERSON] }),
    ok({ keys_before: null, keys_held: [50], keys_down: null }),
    ok({ keys_before: [], keys_held: null, keys_down: [] }),
  ];
  const kept = rows.map((r) => same(FOREGROUND, r));
  assert.deepEqual(kept[3], { block: 0, i: 0, ok: true, witness: true, still_minimized: true, keys_held_new: 1, keys_still_down: 1 });
  assert.deepEqual(rows.map((r) => judgeMinimized(FOREGROUND, [r], audit).pass), [true, false, false, false, true, true, false, false, false]);
});

test("a background case's real input is kept by its type alone, the engine's own synthetic events whole, judged as before", () => {
  const rows = [
    ok({ hold_events: [focusIn, ev('KeyPress')], release_events: [ev('KeyRelease'), focusOut] }),
    ok({ hold_events: [focusIn, ev('KeyPress'), real('KeyPress')], release_events: [ev('KeyRelease'), focusOut] }),
    ok({ hold_events: [focusIn, ev('KeyPress')], release_events: [real('KeyRelease'), ev('KeyRelease'), focusOut] }),
    ok({ hold_events: [real('KeyPress')], release_events: [real('KeyRelease')] }),
    ok({ hold_events: [], release_events: [] }),
    ok({ hold_events: null, release_events: null }),
    // a synthetic event of a key not the case's (another client's SendEvent, or a buggy engine): tokenised, judged alike
    ok({ hold_events: [focusIn, ev('KeyPress'), ev('KeyPress', { detail: PERSON })], release_events: [ev('KeyRelease'), ev('KeyRelease', { detail: PERSON }), focusOut] }),
    ok({ hold_events: [focusIn, ev('KeyPress')], release_events: [ev('KeyRelease', { detail: PERSON }), focusOut] }),
  ];
  const kept = rows.map((r) => same(BACKGROUND, r));
  assert.deepEqual(kept[1].hold_events, [focusIn, ev('KeyPress', { detail: 'k1' }), { type: 'KeyPress', send: false }]);
  // the token is the row's own and shared by the hold and the release: the release of the held key is the same token
  assert.deepEqual(kept[0].release_events, [ev('KeyRelease', { detail: 'k1' }), focusOut]);
  assert.deepEqual(rows.map((r) => judgeMinimized(BACKGROUND, [r], audit).pass), [true, false, false, false, false, false, true, false]);
});

/** Every results file under the committed evidence. */
function resultsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...resultsFiles(p));
    else if (/^results\.jsonl(\.gz)?$/.test(name)) out.push(p);
  }
  return out;
}

test('every stored minimized release verdict in the committed evidence is the same judged from its rows and from their durable form', () => {
  let judged = 0;
  for (const file of resultsFiles(join(REPO, 'docs', 'evidence', '2026-10-28-own-linux-engine'))) {
    const bytes = readFileSync(file);
    const all = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    // each run of the file on its own: its samples, its audit and its verdict
    for (const run of new Set(all.map((r) => r.run)))
    for (const op of [FOREGROUND, BACKGROUND]) {
      const rows = all.filter((r) => r.run === run);
      const samples = rows.filter((r) => r.kind === 'sample' && r.op === op && r.engine === 'cua');
      if (!samples.length || !samples.some((r) => 'keys_held' in r || 'hold_events' in r)) continue;
      const a = rows.find((r) => r.kind === 'audit' && r.op === op && r.engine === 'cua');
      const stored = a ? { clean: a.clean, kind: a.audit, oks: a.oks, answered: a.answered, forbidden: (a.forbidden ?? []).map((f) => f?.what ?? f) } : audit;
      const before = judgeMinimized(op, samples, stored);
      assert.deepEqual(judgeMinimized(op, samples.map(durableKeys), stored), before, `${file} ${op}`);
      const verdict = rows.find((r) => r.kind === 'verdict' && r.op === op);
      if (verdict && typeof verdict.pass === 'boolean') assert.equal(before.pass, verdict.pass, `${file} ${op}: the stored verdict`);
      judged++;
    }
  }
  assert.ok(judged >= 30, `judged ${judged} stored cases`);
});

/**
 * A release case run through its own prepare and check (ruling 875), the display's readers its: the engine answers the
 * hold, the keymap or the recorder shows the person's key 37 beside the case's Shift (50), held from before the hold to
 * after the release. Answers the row the case writes.
 */
async function runCase(op, { keymaps = [], marks = {} } = {}) {
  const def = MINIMIZED_OPS[op];
  const reads = [...keymaps];
  const ctx = {
    scene: { id: 0x01200001, recorder: def.holdRoute === 'background' ? { mark: async (tag) => marks[tag] ?? [] } : undefined },
    desktop: { focusFront: () => {} },
    engine: { request: async () => ({ response: { ok: true } }) },
    witnessed: async (fn) => fn(),
    readers: { keysDown: () => reads.shift() ?? null, contents: async () => ({ minimized: true }), activeWindow: () => 0x00600002, minimize: async (c) => { c.minimized = 'test'; } },
  };
  await def.prepare(ctx);
  return def.check(ctx);
}

test('a held set with a key not the harness\'s: through the cases\' own recording, the key is counted and its code never reaches the row', async () => {
  // foreground: the person's 37 is down before the hold, through it and after the release; the case's Shift is released
  const fg = await runCase(FOREGROUND, { keymaps: [[PERSON], [PERSON, 50], [PERSON]] });
  assert.deepEqual({ held: fg.keys_held_new, down: fg.keys_still_down }, { held: 1, down: 1 });
  assert.ok(!JSON.stringify(fg).includes(`${PERSON}`) && !JSON.stringify(fg).includes('50'), JSON.stringify(fg));
  // the same as the codes were judged: a key is still held at the server
  const raw = { block: 0, i: 0, ok: true, witness: true, still_minimized: true, keys_before: [PERSON], keys_held: [PERSON, 50], keys_down: [PERSON] };
  assert.deepEqual(judgeMinimized(FOREGROUND, [{ block: 0, i: 0, ok: true, witness: true, ...fg }], audit), judgeMinimized(FOREGROUND, [raw], audit));
  // background: the person's key arrives at the recorder window, real, in the hold and in the release
  const hold = [focusIn, ev('KeyPress'), real('KeyPress')];
  const releaseEvents = [ev('KeyRelease'), real('KeyRelease'), focusOut];
  const bg = await runCase(BACKGROUND, { marks: { hold, release: releaseEvents } });
  assert.deepEqual(bg.hold_events, [focusIn, ev('KeyPress', { detail: 'k1' }), { type: 'KeyPress', send: false }]);
  assert.deepEqual(bg.release_events, [ev('KeyRelease', { detail: 'k1' }), { type: 'KeyRelease', send: false }, focusOut]);
  assert.ok(!JSON.stringify(bg).includes(`${PERSON}`), JSON.stringify(bg));
  const rawBg = { block: 0, i: 0, ok: true, witness: true, still_minimized: true, hold_events: hold, release_events: releaseEvents };
  assert.deepEqual(judgeMinimized(BACKGROUND, [{ block: 0, i: 0, ok: true, witness: true, ...bg }], audit), judgeMinimized(BACKGROUND, [rawBg], audit));
});

test("a synthetic key event that is not the case's: through the cases' own recording, tokenised, its code never in the row (fix wave 6)", async () => {
  // send:true is X11's SendEvent bit alone: another client's synthetic KeyPress and KeyRelease of 37 during the case
  const hold = [focusIn, ev('KeyPress'), ev('KeyPress', { detail: PERSON })];
  const releaseEvents = [ev('KeyRelease', { detail: PERSON }), ev('KeyRelease'), focusOut];
  const bg = await runCase(BACKGROUND, { marks: { hold, release: releaseEvents } });
  assert.deepEqual(bg.hold_events, [focusIn, ev('KeyPress', { detail: 'k1' }), ev('KeyPress', { detail: 'k2' })]);
  assert.deepEqual(bg.release_events, [ev('KeyRelease', { detail: 'k2' }), ev('KeyRelease', { detail: 'k1' }), focusOut]);
  assert.ok(!/\b37\b|\b50\b/.test(JSON.stringify([bg.hold_events, bg.release_events])), JSON.stringify(bg));
  const rawBg = { block: 0, i: 0, ok: true, witness: true, still_minimized: true, hold_events: hold, release_events: releaseEvents };
  assert.deepEqual(judgeMinimized(BACKGROUND, [{ block: 0, i: 0, ok: true, witness: true, ...bg }], audit), judgeMinimized(BACKGROUND, [rawBg], audit));
});
