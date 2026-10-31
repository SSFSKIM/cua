// The sitting's input-source switch (the spec's Decision Log, the second sitting; the runbook's "The second sitting").
// The judged timing series run under a Latin layout and the recorded series under the owner's own source (./timing.mjs),
// and the owner may leave the Mac once their attended steps are done. So, with the owner's yes recorded first
// (`source consent yes`, which keeps the source they were on), the kit selects ABC before each judged series and the
// owner's own source before each owner-source series and at the end (`source restore`), through its own probe
// (./input-source.swift, compiled once like the target guard's, ./target-guard.mjs). A selection counts only when the
// source read back is the one selected; otherwise the series stops before any session opens. With no yes recorded
// nothing is switched, and the series' own check of the source (./timing.mjs latinSourceProblem) decides as before.
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compiled} from '../native-matrix/matrix-device.mjs';
import {PROBE_CACHE} from './target-guard.mjs';

export const SOURCE_SCRIPT = fileURLToPath(new URL('./input-source.swift', import.meta.url));
export const LATIN_SOURCE = 'com.apple.keylayout.ABC';
export const CONSENT_FILE = 'input-source.json';

// The recorded answer in <out>/input-source.json ({consent, at, owner: {id, name}}), or null.
export const readConsent = out => (existsSync(join(out, CONSENT_FILE)) ? JSON.parse(readFileSync(join(out, CONSENT_FILE), 'utf8')) : null);

// The owner's answer, with the source they are on now (`reading`: the probe's `current`). -> the record written.
export function writeConsent(out, {consent, reading, now = () => new Date().toISOString()}) {
  if (!reading?.id) throw new Error('the current input source could not be read, so the owner\'s own could not be kept; nothing recorded');
  const record = {consent, at: now(), owner: {id: reading.id, name: reading.name ?? null}};
  writeFileSync(join(out, CONSENT_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// The source to select for `which` ('latin': the judged series; 'owner': the owner's own), or null when the owner gave
// no yes (nothing is switched then).
export function sourceToSelect(consent, which) {
  if (consent?.consent !== true) return null;
  if (which === 'latin') return LATIN_SOURCE;
  if (which === 'owner') return consent.owner?.id ?? null;
  throw new Error('the source to select is latin or owner');
}

// Why a selection's answer ({requested, status, current}) does not hold, or null: the source must be enabled, the
// selection accepted, and the current source read back the one selected.
export function selectionProblem(answer, requested) {
  if (!answer || answer.error) return `the input-source probe gave no answer${answer?.error ? ` (${answer.error})` : ''}`;
  if (answer.status === null) return `no enabled input source is ${requested} (System Settings, Keyboard, Text Input): nothing was switched`;
  if (answer.status !== 0) return `selecting ${requested} was refused (status ${answer.status})`;
  if (answer.current?.id !== requested) return `${requested} was selected, but the current source reads ${answer.current?.id ?? 'nothing'}`;
  return null;
}

// The live probe, compiled once. -> {current(), select(id)}: its answers.
export function liveSourceSwitch({cache = PROBE_CACHE} = {}) {
  let bin = null;
  const run = args => {
    bin ??= compiled(SOURCE_SCRIPT, cache);
    return JSON.parse(execFileSync(bin, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000}).trim().split('\n').at(-1));
  };
  return {current: () => run(['current']).current, select: id => run(['select', id])};
}

// Why the source must not be selected now, or null: with per-document input sources a selection changes the source of
// whatever window has the keys, so it goes only while the scene's recorded launch has its run window in front
// (`problem`: the target guard's reading of `record`, ./target-guard.mjs) and that window is on top of the frontmost
// application (`frontmost`: {pid, topWindow}, the engine's windows passed over).
export function sourceTargetProblem({record, problem, frontmost}) {
  if (problem) return problem;
  if (frontmost?.pid !== record.pid) return `the frontmost is process ${frontmost?.pid ?? 'none'}, not the ${record.id} scene's ${record.pid}`;
  if (frontmost.topWindow?.number !== record.window.number) return `the frontmost app's top window is ${frontmost.topWindow?.number ?? 'none'}, not the run window ${record.window.number}`;
  return null;
}

// Selects the source for `which` from the recorded consent in `out`, and says whether it holds; refused, with nothing
// selected, when `targetProblem` names one. `beforeSelect` runs right before the TIS call, after the consent and the
// target are checked, so a caller learns of every attempt (a failed read-back included) and of nothing else.
// -> the task's result.
export function switchSource({out, which, sources, targetProblem = null, beforeSelect = () => {}}) {
  const consent = readConsent(out), id = sourceToSelect(consent, which);
  if (!id) return {ok: true, which, switched: false, reason: consent ? 'the owner said no: they switch by hand' : 'no answer recorded (source consent): nothing is switched'};
  if (targetProblem) return {ok: false, which, switched: false, requested: id, problem: `${id} not selected: ${targetProblem}`};
  beforeSelect();
  const answer = sources.select(id), problem = selectionProblem(answer, id);
  return {ok: problem === null, which, switched: true, requested: id, current: answer?.current ?? null, ...(problem ? {problem} : {})};
}

// After a run that failed, by a thrown failure (`ctx.error`) or an ordinary failed result (`ctx.failed`), once a
// selection was attempted (`ctx.sourceChanged`, set right before the TIS call, so a failed read-back counts), the
// owner's recorded source put back and read back; null when there is nothing to undo. With `targetProblem` (the
// scene's window no longer on top) nothing is selected, since it would change another window's source: the result says
// the source was left as it is, and `source restore` puts it back. A run that ended well keeps its source for the next
// series; `source restore` ends the sitting.
export function restoreAfterFailure({ctx, out, sources, targetProblem = null}) {
  if (!ctx.sourceChanged || !(ctx.error || ctx.failed > 0)) return null;
  if (targetProblem) {
    return {ok: false, which: 'owner', switched: false, left: true,
      problem: `the input source was left as it is: ${targetProblem}; put the owner's back with \`cursor-sitting.mjs source restore --out ${out}\` once the scene is back on top (or the scenes are down)`};
  }
  return switchSource({out, which: 'owner', sources});
}
