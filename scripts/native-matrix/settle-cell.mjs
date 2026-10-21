// The settle cell (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 7: "the
// observation right after an action equals the observation two seconds later", scored on both engines in the
// differential suite). One implementation, the native-mac suite's: its ACTION cell's observation right after the action
// and two seconds later (test/repl-parity/scenarios/native-mac.mjs) and isSettled (scripts/repl-parity/native-mac-diff.mjs),
// per scene on the lane's engine. Every suite lane writes its settle rows as this cell's result (`settleResult`,
// written by scripts/repl-parity/native-mac.mjs runNativeMac into `<out>/result.json`), so the matrix's `summary` reads
// them in its one shape; `native-matrix.mjs cell settle` runs that lane (the registry's external source, runCell and
// cellIo). A lane that did not settle fails its row unless the suite's expected file declares it for that engine (its
// `settle` kind, `lane` the engine), the same declaration the suite's diff reads.
import {SCENE_IDS} from '../repl-parity/scenes-mac.mjs';
import {cellResult} from './cell-result.mjs';
import {controllerCheckout} from './goldens.mjs';
import {REPO_ROOT} from './goldens-install.mjs';

export const SETTLE_CELLS = Object.freeze(['settle']);

// A native-mac run's settle rows (its results.jsonl rows of cell 'settle') as the cell's result. `meta`: the run's
// meta.json; `declarations`: the suite's expected file's. -> CellResult.
export function settleResult({meta, rows, declarations = []}) {
  const engine = meta.engine;
  const attested = meta.engineAttestation?.attested?.[0];
  const out = (meta.plan?.scenes ?? SCENE_IDS).map(scene => {
    const base = {section: 'settle', id: `${scene}/settle`, engine, sample: 1, ok: false, scene};
    const row = rows.find(r => r.scene === scene && r.cell === 'settle');
    if (!row) return {...base, invalid: 'the scene\'s action did not complete: no settle reading'};
    const settled = row.settled === true;
    const rule = settled ? null : declarations.find(d => d.kind === 'settle' && d.lane === engine && (d.scene === '*' || d.scene === scene));
    return {...base, ok: settled, outcome: {settled}, ...(rule ? {declared: {kind: 'settle', cause: rule.cause}} : {})};
  });
  return cellResult({cell: 'settle', device: meta.device ?? null, started: meta.started, finished: meta.finished ?? new Date().toISOString(),
    lanes: [{host: meta.hostAttestation?.host ?? meta.host ?? null, engine, build: attested?.build ?? null, version: attested?.version ?? null}],
    complete: meta.complete === true, refused: Boolean(meta.refused?.length), problems: [...(meta.refused ?? []), ...(meta.problems ?? []), ...(meta.error ? [meta.error] : [])],
    rows: out, meta: {suite: meta.suite ?? 'native-mac', commit: meta.commit ?? null}});
}

// `cell settle`: the suite's lane on the requested host and engine (the sitting's checkout at this checkout's commit, as
// the matrix's own runs require), which writes the result where --out says. io: cellIo's. -> the suite's exit code, which
// is 0 for any complete lane: the registry's runExternal answers the result's verdict.
export async function runCell(name, options, io) {
  if (!SETTLE_CELLS.includes(name)) throw new Error(`settle-cell.mjs runs the settle cell, not ${name}`);
  const lane = {device: options.device, host: options.host, engine: options.engine, approvedRuntime: options.approvedRuntime, approvedEngine: options.approvedEngine};
  if (io.dryRun) {
    io.log(`dry: the native-mac suite's lane (--host ${lane.host} --engine ${lane.engine}) on ${lane.device}, whose settle rows become ${options.out}/result.json; nothing ran`);
    return 0;
  }
  return io.runSuite({...lane, commit: io.controllerCheckout().commit, out: options.out, ...(options.run ? {run: options.run} : {})});
}

// The suite's own io (scripts/repl-parity/native-mac.mjs nativeMacIo), loaded when the cell runs.
export function cellIo(options, {log = console.log, dryRun = false} = {}) {
  return {log, dryRun, controllerCheckout: () => controllerCheckout(REPO_ROOT),
    runSuite: async lane => { const suite = await import('../repl-parity/native-mac.mjs'); return suite.runNativeMac(lane, {...suite.nativeMacIo(lane.device), log}); }};
}
