// Why a macOS computer session keeps the vendor engine while cua's is the default, and what to run, in one line (design
// ruling 1148). "No approved cua engine" is the normal first-run state on every Mac between the install that builds cua's
// engine pending and the owner's first `cua engine approve`, so it is said plainly, the same words everywhere: on the
// first js result of each connection (src/mcp/server.mjs, `cua/engineNotice`), in `cua doctor`'s repl.host and engine
// rows, and in the refusal of a connection that finds no vendor runtime either (src/mcp/connection.mjs).
//
// The reason, for a selection that kept the vendor engine for want of an approved one (nativeEngineFor's
// `engine_not_installed`): a build pending beside the approved location that the service would drive (built, awaiting
// approve), else the last build's recorded failure (engine-build-failure.mjs), else a pending build older than the
// minimum (approving it would not be used, so the remedy builds a newer one first, as outdatedRemedy words it), else not
// built. For an approved engine older than the service's minimum (`engine_outdated`) its version, with outdatedRemedy's
// remedy. No other selection has a notice (an explicit selection gets its engine or a refusal; a missing Node 24 is
// repl.host's own warning).
import {engineDirectory, shortBuild} from './engine.mjs';
import {outdatedRemedy, pendingEngine, pendingMeetsMinimum} from './engine-minimum.mjs';
import {readBuildFailure} from './engine-build-failure.mjs';
import {MIN_ENGINE_VERSION as MIN_MACOS_ENGINE_VERSION} from '../services/engine/client.mjs';

const BUILD_THEN_APPROVE = 'run `cua install --engine`, then `cua engine approve` with the owner at the console';

// -> {why, remedy} | null. `pending` (engine-minimum.mjs pendingEngine's) and `buildFailure` (readBuildFailure's) are
// read for engine_not_installed; an outdated selection carries its own.
export function engineFallback({selection, pending = null, buildFailure = null, minimum = MIN_MACOS_ENGINE_VERSION}) {
  if (selection?.engine !== 'vendor') return null;
  if (selection.reason === 'engine_not_installed') {
    if (pendingMeetsMinimum(pending, minimum))
      return {why: `no approved cua engine (build ${shortBuild(pending.build)} built, awaiting approve)`, remedy: 'to use it, run `cua engine approve` with the owner at the console'};
    if (buildFailure) return {why: `no approved cua engine (build failed: ${buildFailure.cause})`, remedy: `fix that, then ${BUILD_THEN_APPROVE}`};
    // A build pending below the minimum: approving it would leave the session on the vendor engine (ruling 1118's rule,
    // as outdatedRemedy words it for an approved engine).
    if (pending?.bundlePath)
      return {why: `no approved cua engine (build ${shortBuild(pending.build)} pending is version ${pending.engineVersion}, older than ${minimum}, the oldest this cua drives)`,
        remedy: `to use cua's engine, ${outdatedRemedy(pending, minimum)}`};
    return {why: 'no approved cua engine (not built)', remedy: `to use cua's engine, ${BUILD_THEN_APPROVE}`};
  }
  if (selection.reason === 'engine_outdated')
    return {why: `the approved cua engine is version ${selection.outdated.engineVersion}, older than ${selection.minimum}, the oldest this cua drives`,
      remedy: outdatedRemedy(selection.pending, selection.minimum)};
  return null;
}

// engineFallback with its inputs read: `engine` carries nativeEngineFor's seams (`pending`, `minimumVersion`) and
// `buildFailure`; without them, the files of the engine directory under `env.HOME`. Nothing is read for a selection
// with no notice.
export function engineFallbackFor({selection, env, engine = {}}) {
  if (selection?.engine !== 'vendor' || selection.reason !== 'engine_not_installed') return engineFallback({selection});
  const dir = () => engineDirectory(env.HOME);
  const pending = (engine.pending ?? (() => pendingEngine({dir: dir()})))();
  const buildFailure = (engine.buildFailure ?? (() => readBuildFailure({dir: dir()})))();
  return engineFallback({selection, pending, buildFailure, minimum: engine.minimumVersion ?? MIN_MACOS_ENGINE_VERSION});
}

// `subject` with its verb ('this session keeps', 'macOS computer sessions keep').
export const fallbackLine = (subject, {why, remedy}) => `${subject} the vendor engine: ${why}; ${remedy}`;
// The line a connection's first js result carries, text and `cua/engineNotice` alike.
export const sessionNotice = fallback => fallbackLine('cua: this session keeps', fallback);
