// A row off a GitHub-hosted runner that needs another input source or per-context preference than the owner's
// (ruling 1188): the harness never writes them there (./hitoolbox.mjs), so it reads the owner's and runs only what
// their values allow. A row that needs another value is NO VERDICT, `ownerInput` (./front-key.mjs sampleCause), with
// a cause naming the preference and the value it needed; the summary counts them (./summary.mjs), so the report shows
// what the owner's machine could not judge.
import {INPUT_WRITES_HOSTED_ONLY, PER_CONTEXT_NAME, ownerValueName} from './hitoolbox.mjs';

// What a row needs (`needs`: {source?: id, perContext?: boolean, switch?: what the row switches during it}) against
// the owner's ({source, perContext}). -> the cause, or null when the owner's values are the row's.
export function ownerInputCause(owner, needs) {
  const parts = [];
  if (needs.perContext !== undefined && owner?.perContext !== needs.perContext) parts.push(`${PER_CONTEXT_NAME} ${ownerValueName(needs.perContext)}, the owner's is ${ownerValueName(owner?.perContext ?? null)}`);
  if (needs.source && owner?.source !== needs.source) parts.push(`the input source ${needs.source}, the owner's is ${owner?.source ?? 'unread'}`);
  if (needs.switch) parts.push(needs.switch);
  return parts.length ? `${INPUT_WRITES_HOSTED_ONLY}; the row needs ${parts.join(', and ')}` : null;
}
// The row's marks: `ownerInput` the cause, `invalid` the same as a backstop, so nothing that reads only `invalid`
// counts it.
export const ownerInputMarks = cause => ({ok: false, ownerInput: cause, invalid: cause});
