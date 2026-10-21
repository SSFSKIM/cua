// The engine lane a live script serves (#117 M3; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, the
// Decision Log's "M3 pre-flight" item 3, and the whole-M1b rule: every lane pins the engine it means and refuses on the
// attestation, never on the selection alone). Shared by verify.mjs and scripts/probe-lifecycle.mjs, and meant for the
// acceptance scripts (scripts/accept/textedit.mjs, scripts/accept-native.mjs): the pinned engine, the environment `cua serve` runs with, the host and engine the launcher selects for it
// (src/runtime/launch.mjs replHostFor, as cua serve's connection calls it), the attestation every js result must carry,
// and the paths the process and socket checks judge by. Reads the approved engine and the vendor helper's Info.plist;
// starts nothing.
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {DEFAULT_NATIVE_ENGINE, replHostFor} from '../../src/runtime/launch.mjs';
import {EXECUTABLE} from '../../src/runtime/engine-bundle.mjs';
import {plistString, socketPathFor} from '../../src/services/engine/client.mjs';
import {pinnedEngine} from './lib.mjs';

// A usage error (exit 2 in the scripts): --engine where no engine is driven, or an unknown engine.
export class LaneUsageError extends Error {}

// The engine a lane pins, before anything is read: `flag` is --engine (undefined when not given), `env` the caller's
// environment, `home` the CUA_HOME it serves, `surfaces` the server's (settingsFrom). A macOS computer session pins an
// engine (`pin` {engine, pinnedBy}) and serves with CUA_NATIVE_ENGINE set to it; anywhere else no engine is driven, `pin`
// is null and --engine is a usage error (LaneUsageError, as is an unknown engine). -> {pin, serveEnv}.
export function pinLane({flag, env, home, surfaces, platform = process.platform}) {
  const engineDriven = platform === 'darwin' && surfaces.includes('computer');
  if (flag !== undefined && !engineDriven) throw new LaneUsageError('--engine applies only to the computer surface on macOS');
  let pin = null;
  if (engineDriven) {
    try { pin = pinnedEngine({flag, env, defaultEngine: DEFAULT_NATIVE_ENGINE}); } catch (error) { throw new LaneUsageError(error.message); }
  }
  return {pin, serveEnv: {...env, CUA_HOME: home, ...(pin ? {CUA_NATIVE_ENGINE: pin.engine} : {})}};
}

// On macOS, the host and engine the launcher selects for `serveEnv` (replHostFor, as cua serve's connection calls it):
// `selection` {host, reason, node?, engine?}, whose refusal (an engine not installed, a host that cannot run) is thrown
// as the launcher's CuaError, and `expected`, the attestation every js result must carry when an engine is pinned.
// Elsewhere both are null. `runtime`: resolveRuntime's. -> {selection, expected}.
export function selectLane({pin, serveEnv, home, runtime, surfaces, platform = process.platform}) {
  if (platform !== 'darwin') return {selection: null, expected: null};
  const selection = replHostFor({platform, surfaces, ambient: serveEnv, home});
  return {selection, expected: pin ? expectedAttestation({engine: pin.engine, selection, runtime}) : null};
}

// The attestation a result of the pinned engine carries, as the launcher builds it (src/runtime/launch.mjs buildLaunch):
// cua's, the approved bundle's version and build; the vendor's, its helper's CFBundleShortVersionString (null when
// unreadable) and the runtime release.
export function expectedAttestation({engine, selection, runtime}) {
  if (engine === 'cua') return {engine, version: selection.engine.app.engineVersion, build: selection.engine.app.build};
  let version = null;
  try { version = plistString(readFileSync(join(runtime.paths.skyServiceApp, 'Contents', 'Info.plist'), 'utf8'), 'CFBundleShortVersionString'); } catch { /* unreadable: null, as the launcher reads it */ }
  return {engine, version, build: runtime.release};
}

// What the process and socket checks judge cua's engine by: the approved bundle's executable (as LaunchServices runs
// it), its socket, and the directory it lives in (one of cua's roots). `selection` must have selected cua's engine.
export function approvedEngineFacts(selection) {
  const bundlePath = selection.engine.app.bundlePath;
  return {bundlePath, executable: join(bundlePath, 'Contents', 'MacOS', EXECUTABLE), socket: socketPathFor(bundlePath), directory: dirname(bundlePath)};
}

// The Nodes that are cua's in a session: the one running cua serve (`hostNode`, the caller's real execPath) and the own
// host's, when the selection resolved one.
export const cuaNodes = ({hostNode, selection}) => [hostNode, ...(selection?.node ? [selection.node] : [])];
