// A stored cua lane of repl-parity's native suite, for R1's verdict (#171 M6b, T3): M6a's counted x64 cua lane
// (docs/evidence/2026-10-28-own-linux-engine/m6a/x64/regression/parity/cua), copied into a directory of the test's and
// changed as a test asks, so the verdict is judged on a real run's shape. The suites runner's fake writes it too.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STORED_CUA_LANE = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m6a/x64/regression/parity/cua/', import.meta.url);

/** The stored lane's {meta, rows}, fresh each call. */
export function storedCuaLane() {
  const meta = JSON.parse(readFileSync(new URL('meta.json', STORED_CUA_LANE), 'utf8'));
  const rows = readFileSync(new URL('results.jsonl', STORED_CUA_LANE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { meta, rows };
}

/** The changes a test may ask of the stored lane. */
export const LANE_CHANGES = {
  // 33 cases: the run selected one case fewer
  short: ({ meta, rows }) => {
    const dropped = meta.caseIds.at(-1);
    meta.caseIds = meta.caseIds.slice(0, -1);
    meta.coveredCases -= 1;
    meta.recordedCases -= 1;
    return { meta, rows: rows.filter((r) => r.case !== dropped) };
  },
  // the typeText case's assertion failed
  text: ({ meta, rows }) => ({ meta, rows: rows.map((r) => (r.case === 'native/app/typetext' && r.assertion ? { ...r, assertion: { ok: false, message: 'not inserted' } } : r)) }),
  // the vendor's engine answered a case under the trusted worker
  vendor: ({ meta, rows }) => {
    const entry = meta.engineAnswered.find((e) => e.case === 'native/app/typetext');
    entry.observed = entry.observed.map((o) => (o.role ? o : { ...o, exe: '/h/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64', kind: 'vendor' }));
    return { meta, rows };
  },
  // a cua-engine answered, but not one a home installed
  elsewhere: ({ meta, rows }) => {
    for (const entry of meta.engineAnswered) {
      entry.expected = '/tmp/built/cua-engine';
      entry.observed = entry.observed.map((o) => ({ ...o, exe: '/tmp/built/cua-engine' }));
    }
    return { meta, rows };
  },
  // the run did not finish
  incomplete: ({ meta, rows }) => ({ meta: { ...meta, complete: false, error: 'Task cleanup failed' }, rows }),
};

/** The stored lane written to `dir` (meta.json, results.jsonl), with the named changes applied. */
export function writeCuaLane(dir, changes = []) {
  let lane = storedCuaLane();
  for (const name of changes) lane = LANE_CHANGES[name](lane);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'meta.json'), `${JSON.stringify(lane.meta, null, 2)}\n`);
  writeFileSync(join(dir, 'results.jsonl'), `${lane.rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return lane;
}
