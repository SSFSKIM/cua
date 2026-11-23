// The focus probe's cost on a runner (#117 M5, T10b′; harness.md "Concerns": every front/key reading without --focus
// launches the approved bundle's `--probe focus` once, the activate check up to four times, unmeasured until a hosted
// run times it). The pilot times `samples` launches exactly as the matrix's device makes them
// (../native-matrix/live-device.mjs runProbe: its own LaunchServices instance, awaited to its exit), with no window
// named, as the key reading asks. It reads the system-wide focused application only, never a window of anyone's.
import {runProbe} from '../native-matrix/live-device.mjs';

// `probe(args)`: one probe launch, awaited (runProbe of the approved bundle); `now`: the clock. -> {samples, answered,
// medianMs, maxMs, ms}.
export function timeFocusProbe({bundle, samples = 5, probe = args => runProbe(bundle, args), now = Date.now} = {}) {
  const ms = [];
  let answered = 0;
  for (let i = 0; i < samples; i++) {
    const started = now();
    try {
      const answer = probe(['focus']);
      if (answer && typeof answer === 'object' && !answer.error) answered += 1;
    } catch { /* timed all the same; counted unanswered */ }
    ms.push(now() - started);
  }
  const sorted = [...ms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {samples, answered, medianMs, maxMs: sorted.at(-1), ms};
}
