#!/usr/bin/env node
// Task 129 (ruling 989's offline check, read-only): m5-p459's outlasted gate, `release_sync::gate` as de3bc094 fixed it
// (rulings 967, 974), applied to L4d's Chrome t14-long rows on their recorded fields, row #8 named. Nothing runs live.
//   gate(outlasted, keepalives, last_spaced) = !outlasted || (keepalives == 0 && !last_spaced)   (release_sync.rs)
// Its inputs from a 0.4.2 row, which records neither directly:
//   - keepalives: the hold record's `keepalives`, which pointer.rs sets from the floor's fill (`floor_keepalives =
//     keepalives`);
//   - last_spaced: whether the floor spaced the path's last step. The floor's due for the last step is the take plus
//     350 ms (`dnd::step_due` over the floor), so the last step is spaced only when it went out before that; a path whose
//     release came after it (`after_take.release_after_take_ms` > 350, past the 2 ms the release itself takes) was not.
//     That is c-cost.mjs's offline rule (m5-p459, task 126): a take, no keepalive, release more than 2 ms past 350.
// (b')'s step runs where the gate opens on a drop the engine lets drop, its take seen by the release, never on a guarded
// drag (`taken.is_some() && hold.is_some()`): `after_release.released_with_take`, and the Chromium hold's record.
// Option (c), not built: with the gate open, a Chrome drop confirmed by its activation alone answers unconfirmed.
// usage: node gate459-row8.mjs <results.jsonl> [part] [cell] [i]
import { readFileSync } from 'node:fs';

const [f, part = '0', cell = 'long-left', i = '8'] = process.argv.slice(2);
const gate = (outlasted, keepalives, lastSpaced) => !outlasted || (keepalives === 0 && !lastSpaced);
const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'drop-signal' && r.part === Number(part) && r.cell === cell);
const inputs = (r) => {
  const keepalives = r.hold?.keepalives ?? null;
  const releaseAfterTake = r.after_take?.release_after_take_ms ?? null;
  const lastSpaced = !(Number.isFinite(releaseAfterTake) && releaseAfterTake > 352);
  const letDrop = r.after_release?.released_with_take === true && r.hold != null && r.hold.taken === true;
  const activationOnly = /^Activation/.test(r.after_release?.confirmed_by ?? '');
  return { keepalives, releaseAfterTake, lastSpaced, letDrop, activationOnly, open: gate(true, keepalives, lastSpaced) };
};
const r = rows.find((x) => x.i === Number(i));
const x = inputs(r);
console.log(`row #${r.i} (${cell}, part ${Number(part) + 1}): take ${r.hold?.take_after_press_ms} ms after the press; release ${x.releaseAfterTake} ms after the take; floor keepalives ${x.keepalives}; last step spaced ${x.lastSpaced} (the floor's end, take + 350 ms, came ${Math.round((x.releaseAfterTake - 350) * 10) / 10} ms before the release); confirmed_by ${r.after_release?.confirmed_by}; released_with_take ${r.after_release?.released_with_take}; answered ok ${r.ok}, notice ${r.notice ?? 'none'}`);
console.log(`1. the gate (de3bc094, outlasted): gate(true, ${x.keepalives}, ${x.lastSpaced}) = ${x.open}: it ${x.open ? 'OPENS' : 'stays shut'} on #${r.i}`);
console.log(`2. (b')'s release sync: ${x.open && x.letDrop ? 'it would have run' : 'it would not have run'} (gate ${x.open ? 'open' : 'shut'}, a drop the engine let drop with its take seen: ${x.letDrop}, unguarded Chromium hold: ${r.hold ? 'yes' : 'no'})`);
console.log(`3. option (c): ${x.open && x.activationOnly ? 'it would have answered #' + r.i + ' unconfirmed (gate open, its only confirmation Activation)' : 'it would not have changed the answer'}`);
const all = rows.map(inputs);
console.log(`\nover the cell's ${rows.length} rows: gate open on ${all.filter((y) => y.open).length}; let drop with the take seen ${all.filter((y) => y.letDrop).length}; confirmed by Activation ${all.filter((y) => y.activationOnly).length}; (c) would answer unconfirmed ${all.filter((y) => y.open && y.activationOnly).length} (the other ${rows.length - 1} already answer unconfirmed)`);
