// A row off a GitHub-hosted runner that needs another input source or per-context preference than the owner's
// (ruling 1188): the harness never writes them there (./hitoolbox.mjs), so it reads the owner's and runs only what
// their values allow. A row that needs another value is NO VERDICT, `ownerInput` (./front-key.mjs sampleCause), with
// a cause naming the preference and the value it needed; the summary counts them (./summary.mjs), so the report shows
// what the owner's machine could not judge. On a hosted runner, a source its setup could not enable makes the rows
// needing it NO VERDICT `venue` the same way (ruling 1189).
import {INPUT_WRITES_HOSTED_ONLY, PER_CONTEXT_NAME, ownerValueName} from './hitoolbox.mjs';
import {ABC} from './live-checks.mjs';

// The owner's values off a hosted runner, from the device's `source state` answer just read. The run reads them at its
// start and again at each probe or field boundary, since the owner may switch either during a run: a row is held
// against what reads at its boundary, never the first reading. A change is kept in `ctx.meta.inputSource.drift`
// ({at, from, to}); the first reading stays in `meta.inputSource` as it was read. Sets ctx.ownerInput, perContextOff
// and latin. -> the owner's values now.
export function ownerInputNow(ctx, state, at) {
  const now = {source: state?.current ?? null, perContext: state?.perContext ?? null};
  const before = ctx.ownerInput;
  if (before && JSON.stringify(before) !== JSON.stringify(now)) (ctx.meta.inputSource.drift ??= []).push({at, from: before, to: now});
  ctx.ownerInput = now;
  ctx.perContextOff = now.perContext === false;
  ctx.latin = ctx.perContextOff && now.source === ABC;
  return now;
}

// What a row needs (`needs`: {source?: id, perContext?: boolean, switch?: what the row switches during it}) against
// the owner's ({source, perContext}); `why` the run only reads (off a hosted runner, or a baseline the restore could
// not put back: malformedBaseline). -> the cause, or null when the owner's values are the row's.
export function ownerInputCause(owner, needs, why = INPUT_WRITES_HOSTED_ONLY) {
  const parts = [];
  if (needs.perContext !== undefined && owner?.perContext !== needs.perContext) parts.push(`${PER_CONTEXT_NAME} ${ownerValueName(needs.perContext)}, the owner's is ${ownerValueName(owner?.perContext ?? null)}`);
  if (needs.source && owner?.source !== needs.source) parts.push(`the input source ${needs.source}, the owner's is ${owner?.source ?? 'unread'}`);
  if (needs.switch) parts.push(needs.switch);
  return parts.length ? `${why ?? INPUT_WRITES_HOSTED_ONLY}; the row needs ${parts.join(', and ')}` : null;
}
// Why a hosted run only reads when the preference reads malformed: the restore never writes a malformed value back
// (./live-device.mjs restoreInputSource), so a run that changed it could not put it back. A hosted runner's
// precondition, so its rows are NO VERDICT venue (readOnlyMarks), not ownerInput. -> the refusal, or null.
export const malformedBaseline = perContext => (perContext?.malformed
  ? `${PER_CONTEXT_NAME} reads malformed (${perContext.malformed}): a restore could not put it back, so nothing is saved, selected or written`
  : null);
// A read-only run's row marks: `venue` on a hosted runner whose baseline it could not restore (`ctx.venueReadOnly`,
// the reason), `ownerInput` off a hosted runner (ruling 1188).
export const readOnlyMarks = (ctx, cause) => (ctx.venueReadOnly ? venueInputMarks(cause) : ownerInputMarks(cause));
// The sources a row selects that the runner's venue could not enable (ruling 1189: its setup did not read them back
// as enabled and selectable in TIS's list), named. -> the cause, or null when the venue holds every one.
export function venueInputCause(missing, needs) {
  const lacking = (needs ?? []).filter(id => (missing ?? []).includes(id));
  return lacking.length ? `the runner's setup could not enable ${lacking.join(' and ')} (TISEnableInputSource did not read ${lacking.length === 1 ? 'it' : 'them'} back as enabled and selectable in TIS's list; ruling 1189): the row needs ${lacking.length === 1 ? 'it' : 'them'}, and is never run under the US layout` : null;
}
// A row's marks for the venue: `venueInput` the cause (NO VERDICT `venue`, ./front-key.mjs), `invalid` its backstop.
export const venueInputMarks = cause => ({ok: false, venueInput: cause, invalid: cause});

// The row's marks: `ownerInput` the cause, `invalid` the same as a backstop, so nothing that reads only `invalid`
// counts it.
export const ownerInputMarks = cause => ({ok: false, ownerInput: cause, invalid: cause});
