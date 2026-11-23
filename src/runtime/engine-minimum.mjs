// The macOS engine's minimum, as the selection and doctor word it (#117 M5, R4 and ruling 1118): the build pending
// beside the approved engine, read from the files alone, and the remedy for an approved engine older than the minimum
// the service drives (src/services/engine/client.mjs MIN_ENGINE_VERSION).
//
// A pending build is found in either layout of the approved location (src/runtime/engine.mjs): ruling 1118's pending
// slot, `pending/cua Engine.app` beside the approved bundle, which `cua engine approve` promotes; or, before it, the
// bundle at the approved path itself when pending.json names it and approved.json does not (a build that replaced the
// approved one). pending.json naming a build neither bundle is gives the build with no version and no bundle: there is
// nothing on disk to approve. A build that is approved.json's is not pending.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {BUNDLE_NAME} from './engine-bundle.mjs';
import {belowMinimum, bundleIdentity} from '../services/engine/client.mjs';

const record = path => {
  try { const value = JSON.parse(readFileSync(path, 'utf8')); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; } catch { return null; }
};
const identityAt = bundle => { try { return bundleIdentity(bundle); } catch { return null; } };

// The build pending beside the approved engine in the engine directory `dir` -> {build, engineVersion, bundlePath,
// builtAt} (engineVersion and bundlePath null when no bundle holds it; builtAt pending.json's when it names the build),
// or null. Never throws; reads no signature.
export function pendingEngine({dir}) {
  const pending = record(join(dir, 'pending.json'));
  const approvedBuild = record(join(dir, 'approved.json'))?.build ?? null;
  const builtAt = build => (pending?.build === build ? pending.builtAt ?? null : null);
  const slot = join(dir, 'pending', BUNDLE_NAME);
  const inSlot = identityAt(slot);
  if (inSlot?.build && inSlot.build !== approvedBuild) return {build: inSlot.build, engineVersion: inSlot.engineVersion, bundlePath: slot, builtAt: builtAt(inSlot.build)};
  if (typeof pending?.build !== 'string' || !pending.build || pending.build === approvedBuild) return null;
  const atApproved = join(dir, BUNDLE_NAME);
  const there = identityAt(atApproved);
  return there?.build === pending.build ? {build: pending.build, engineVersion: there.engineVersion, bundlePath: atApproved, builtAt: builtAt(pending.build)}
    : {build: pending.build, engineVersion: null, bundlePath: null, builtAt: builtAt(pending.build)};
}

// Whether approving `pending` would give an engine the service drives: a bundle on disk at or above `minimum`.
export const pendingMeetsMinimum = (pending, minimum) => Boolean(pending?.bundlePath) && !belowMinimum(pending.engineVersion, minimum);

// What to run for an approved engine older than `minimum` (ruling 1118): approve the build pending beside it when that
// build meets the minimum; else build this plugin's with `cua install --engine` (which stops at a pending build) and
// approve that. Approval is the owner's step at the console; nothing here or in install starts it.
export const outdatedRemedy = (pending, minimum) => (pendingMeetsMinimum(pending, minimum)
  ? `a newer build (${String(pending.build).slice(0, 12)}, version ${pending.engineVersion}) is pending beside it: approve it with \`cua engine approve\` with the owner at the console`
  : 'build it with `cua install --engine`, which builds it pending approval, then approve it with `cua engine approve` with the owner at the console');
