// Capture readiness after RedirectWindow (Design, Retention and the fixed waits): from one `xprobe retention`
// trial (the moments a window's captured contents changed after the redirect), when the contents became the
// window's real contents (the final ones, unchanged to the end of the span), and what an engine polling every p ms
// for two consecutive equal captures would have seen: when it would stop, and whether that was premature.

function contentAt(changes, t) {
  let hash = changes[0][1];
  for (const [at, h] of changes) {
    if (at <= t) hash = h;
    else break;
  }
  return hash;
}

export function analyzeTrial(trial, { pollMs = [1, 2, 5, 10, 20] } = {}) {
  const changes = trial.changes;
  const [readyMs, final] = changes.at(-1);
  const polls = {};
  for (const p of pollMs) {
    let previous = contentAt(changes, 0);
    let found = null;
    for (let t = p; t <= trial.span_ms; t += p) {
      const now = contentAt(changes, t);
      if (now === previous) {
        found = t;
        break;
      }
      previous = now;
    }
    polls[p] = { consecutive_equal_ms: found, premature: found !== null && (found < readyMs || contentAt(changes, found) !== final) };
  }
  // the black fraction of each distinct capture before the real contents (when the probe recorded it)
  const blackBefore = changes.slice(0, -1).map((c) => c[2]).filter((v) => typeof v === 'number');
  return { ready_ms: readyMs, final, equal_before: trial.before === final, transitions: changes.length, black_before_ready: blackBefore, polls };
}
