// The M4 release gate's stored records (docs/evidence/2026-10-28-own-linux-engine/m4/gate/), read as the rows a step
// wrote: the fixtures of the rulings M5 encodes as the gate's own judges (#371, #373, P6's Fisher rule).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const GATE = join(dirname(fileURLToPath(import.meta.url)), '../../docs/evidence/2026-10-28-own-linux-engine/m4/gate');

/** A step's stored rows: `<candidate out>/<step>.release-gate/run/results.jsonl`, gzipped or not. */
export function gateRows(out, step) {
  const dir = join(GATE, out, `${step}.release-gate/run`);
  let text;
  try {
    text = gunzipSync(readFileSync(join(dir, 'results.jsonl.gz'))).toString('utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    text = readFileSync(join(dir, 'results.jsonl'), 'utf8');
  }
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

/** Each stored step the rulings were made on, by candidate: its out directory. */
export const CANDIDATES = { 1: 'out', 2: 'c2-f9692898/out', 3: 'c3-c55c8e08/out' };
