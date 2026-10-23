// Append-only Finder phase evidence survives a failed pin, interrupted controller and scene-state removal.
// Read only CG metadata for the exact recorded pid/window; never infer ownership from position or bounds.
import {appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';

// Project the probe's bounded trace: fixed stage/attribute enums, numeric relative times and frame fields only.
// Missing/invalid trace data is diagnostic absence, never evidence that placement succeeded.
export function frameProbeTrace(trace) {
  if (!trace || !Array.isArray(trace.samples) || !Array.isArray(trace.setters)) return null;
  const ms = value => Number.isFinite(value) && value >= 0;
  const keys = ['x', 'y', 'width', 'height'];
  return {
    samples: trace.samples.slice(0, 25).flatMap(sample => {
      if (!['initial', 'after-size', 'final'].includes(sample?.stage) || !ms(sample.atMs)) return [];
      if (sample.frame !== null && !keys.every(k => Number.isFinite(sample.frame?.[k]))) return [];
      return [{stage: sample.stage, atMs: sample.atMs,
        frame: sample.frame === null ? null : Object.fromEntries(keys.map(k => [k, sample.frame[k]]))}];
    }),
    setters: trace.setters.slice(0, 2).flatMap(setter => {
      if (!['size', 'position'].includes(setter?.attribute) || !ms(setter.startMs) || !ms(setter.endMs)
        || setter.endMs < setter.startMs || !Number.isSafeInteger(setter.axError)) return [];
      return [{attribute: setter.attribute, startMs: setter.startMs, endMs: setter.endMs, axError: setter.axError}];
    }),
  };
}

export const FINDER_STEPS_FILE = 'finder-steps.jsonl';
export function finderStepEvidence({run, record, phase, io}) {
  const identity = {scene: 'finder', phase, pid: record.pid, window: record.window.number, invocation: randomUUID()};
  let sequence = 0;
  const append = event => {
    const row = {...identity, sequence: sequence++, at: (io.now ?? Date.now)(), ...event};
    appendFileSync(join(run, FINDER_STEPS_FILE), JSON.stringify(row) + '\n', {mode: 0o600, flush: true});
    return row;
  };
  const sample = point => {
    let windows;
    try { windows = io.appWindows(record.pid); }
    catch { return append({type: 'frame', point, status: 'unreadable', bounds: null}); }
    const matches = windows.filter(w => w.ownerPid === record.pid && w.number === record.window.number);
    if (matches.length !== 1) return append({type: 'frame', point, status: matches.length ? 'ambiguous' : 'missing', bounds: null});
    const window = matches[0], keys = ['x', 'y', 'width', 'height'];
    if (!keys.every(k => Number.isFinite(window.bounds?.[k]))) return append({type: 'frame', point, status: 'unreadable', bounds: null});
    return append({type: 'frame', point, status: 'read', bounds: Object.fromEntries(keys.map(k => [k, window.bounds[k]])), onScreen: window.onScreen === true});
  };
  return {append, sample};
}
