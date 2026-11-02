// The two-services instrument's truncation judge (services.mjs), apart from the script so it is tested without a
// display.

import { isDeepStrictEqual } from 'node:util';

import { fixtureTruncationMismatch, lineAsReported } from './deviations.mjs';

/**
 * One lane's step, judged for `truncated` (M4 T3):
 * - `reads`: every get_window_state answer the step got from the lane's service, in order, each `{state, filtered}`
 *   (`filtered`: its request had a query). This path has no `--stats` record of each read's cut points (cua's service
 *   spawns its engines), so in the cua lane each read is judged against what the harness's page is known to hold
 *   (`fixtureTruncationMismatch`), whether or not the step renders anything; the wire run judges the field against the
 *   engine's record. A filtered read is judged with `whole`, the lane's last whole read of the window, and fails when
 *   there is none.
 * - `hydrated`: the `truncated` of the state the facade gave the step (sky.mjs's hydration keeps it), where the step
 *   returns one; it must be the last read's.
 * - `shown`: the count the step's rendered state's truncation line shows (null for no line), where it renders one; it
 *   must be the last read's sum, and there is no line without a read.
 * Returns whether all of it holds, and the whole read the lane's next steps judge filtered reads against.
 */
export function judgeTruncation({ scene, lane, reads, whole = null, hydrated, shown }) {
  let holds = true;
  for (const { state, filtered } of reads) {
    if (lane === 'cua') holds &&= filtered ? whole !== null && fixtureTruncationMismatch({ scene, state, whole }) === null : fixtureTruncationMismatch({ scene, state }) === null;
    if (!filtered) whole = state;
  }
  const last = reads.at(-1)?.state.truncated ?? null;
  if (hydrated !== undefined) holds &&= reads.length > 0 && isDeepStrictEqual(hydrated, last);
  if (shown !== undefined) holds &&= reads.length > 0 && lineAsReported(shown, last);
  return { holds, whole };
}
