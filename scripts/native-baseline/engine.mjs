// The native engine's part of the baseline harness (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 1 and its opening paragraph). A macOS computer run names its REPL host and its native engine
// apart (--host, --engine) and the one approved engine of the device (--approved-engine); harnesses never build one.
// - Lanes. --host vendor --engine vendor (today's path), --host vendor --engine cua (cua's service loaded in the vendor
//   trusted worker, comparison A's candidate) and --host cua --engine cua. The vendor engine accepts only the vendor
//   host as a peer, so --host cua --engine vendor is refused before anything runs, as the launcher would refuse it.
// - The approved engine and the build. On the device, in the serve's own environment (HOME the account's, as prepare.mjs
//   keeps it for an approved-runtime run), the harness reads the approved engine exactly as the serve's selection does
//   (src/runtime/engine.mjs installedEngine under engineDirectory(HOME), as src/runtime/launch.mjs nativeEngineFor) and
//   computes the checkout's build (src/runtime/engine-bundle.mjs engineBuild). A run refuses unless that engine is the
//   one --approved-engine names and its build is the checkout's; the attestation then has to name the same build.
// - The engine attestation. Every js result carries `_meta['cua/nativeEngine']` {engine, version, build} (the proxy's
//   launch attestation, or cua's service's own from its ping); a run is sound only when one value answered all of
//   them: the requested engine, cua's at the approved version and build, the vendor's at the run's runtime release.
// - The helper attestation. Both engines' processes are classified (remote.mjs classifyHelpers): the pinned runtime's
//   SkyComputerUseService, the approved engine's cua-engine, or another copy of either. The requested engine's own
//   process must have started during the run (every run stops cua's engine at its start, prepare.mjs, and the vendor
//   helper is never running when a run is prepared), and the other engine's own process must not have.
// - A launch failure. On a cua-engine run the first call into the engine launches it, through the host's relay (on the
//   vendor host its plain `open -a`). A cell that fails because the engine did not come up is that failure, reported as
//   such by the run, never a timing sample.
import {readFileSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {engineDirectory, enginePaths, installedEngine} from '../../src/runtime/engine.mjs';
import {engineBuild} from '../../src/runtime/engine-bundle.mjs';
import {configuredIdentity, identityMatches, readSignature} from '../../src/runtime/engine-sign.mjs';
import {bundleIdentity} from '../../src/services/engine/client.mjs';

export const ENGINES = Object.freeze(['vendor', 'cua']);
// The process each engine's helper attestation names, by its origin for the run's own copy.
const OWN = Object.freeze({vendor: {origin: 'pinned runtime', process: 'SkyComputerUseService', who: 'the pinned runtime\'s helper'},
  cua: {origin: 'approved engine', process: 'cua-engine', who: 'the approved engine\'s process'}});

// A build as an attestation shows it: a cua engine build (a 64-hex hash) by its first 12, anything else (the vendor's
// runtime release) whole. src/runtime/engine.mjs shortBuild cuts every build to 12 characters, which would truncate
// the vendor's release (26.928.40906-darwin-arm64 to 26.928.40906), hence this one.
export const attestedBuild = build => (typeof build === 'string' && /^[0-9a-f]{64}$/.test(build) ? build.slice(0, 12) : String(build ?? 'none'));

// The run's options against its platform and surface: --engine and --approved-engine belong to a macOS computer run,
// which needs both, on one of the three lanes.
export function assertEngineOptions({platform, surface, host, engine, approvedEngine}) {
  if (platform !== 'darwin' || surface !== 'computer') {
    if (engine !== undefined || approvedEngine !== undefined) throw new Error(`--engine and --approved-engine select the macOS native engine; a ${platform} ${surface} run has none`);
    return;
  }
  if (!ENGINES.includes(engine)) throw new Error('a macOS computer run needs --engine vendor|cua (the native engine, selected apart from --host)');
  if (host === 'cua' && engine === 'vendor') throw new Error('--host cua --engine vendor cannot run: the vendor engine accepts only the vendor host\'s node_repl as a peer (the launcher refuses it as repl_host_refused); the lanes are --host vendor --engine vendor, --host vendor --engine cua and --host cua --engine cua');
  if (approvedEngine === undefined) throw new Error('a macOS computer run needs --approved-engine <the approved cua Engine.app on the device>: every run serves the one approved engine in place, and harnesses never build one');
  if (!/^\/[^\0\n]*$/.test(approvedEngine)) throw new Error('--approved-engine needs an absolute path');
}

// The approved bundle's signature as evidence may carry it (the spec's M1b pre-flight item 2): its kind and whether it
// matches the configured signing identity, never the identity itself (approvedEngineFacts keeps only these two keys, and
// {kind: null, identityMatches: null} when the signature cannot be read).
function publicSignature(bundle, env) {
  const signature = readSignature(bundle);
  return {kind: signature?.kind ?? null, identityMatches: signature ? identityMatches(signature, configuredIdentity({env})) : null};
}

// Device side, run by the preflight in the serve's environment: the checkout's build, the approved engine as the serve's
// selection resolves it (null when none is approved) with its signature (publicSignature), and what explains a missing
// one (approved.json's build, the bundle's own build); the bundle --approved-engine names and the approved one, each by
// its real path. `installed`, `checkoutBuild` and `signatureOf` are seams for the tests.
export function approvedEngineFacts({approvedEngine, env = process.env, installed, checkoutBuild = () => engineBuild(), signatureOf = bundle => publicSignature(bundle, env)}) {
  const dir = engineDirectory(env.HOME || homedir());
  const real = path => { try { return realpathSync(path); } catch { return null; } };
  const app = (installed ?? (() => installedEngine({dir})))();
  const paths = enginePaths(dir);
  const signatureOfApproved = bundle => {
    try { const {kind = null, identityMatches: matches = null} = signatureOf(bundle) ?? {}; return {kind, identityMatches: matches}; } catch { return {kind: null, identityMatches: null}; }
  };
  let approvedRecordBuild = null, bundleBuild = null;
  try { approvedRecordBuild = JSON.parse(readFileSync(paths.approved, 'utf8'))?.build ?? null; } catch {}
  try { bundleBuild = bundleIdentity(paths.bundle).build; } catch {}
  return {
    checkoutBuild: checkoutBuild(),
    installed: app ? {bundlePath: app.bundlePath, engineVersion: app.engineVersion, build: app.build, signature: signatureOfApproved(app.bundlePath)} : null,
    installedReal: app ? real(app.bundlePath) : null,
    approvedEngineReal: approvedEngine ? real(approvedEngine) : null,
    approvedRecordBuild, bundleBuild, home: env.HOME ?? null,
  };
}

// The approved engine a run may serve, from the device's facts -> {approved, checkoutBuild}; otherwise a refusal naming
// why. Harnesses never build: the remedy is always the sitting's build and approve, from this checkout.
export function checkApprovedEngine(facts, approvedEngine) {
  if (!facts || facts.error || typeof facts.checkoutBuild !== 'string')
    throw new Error(`the device could not read the approved engine or the checkout's engine build${facts?.error ? `: ${facts.error}` : ''}`);
  const remedy = 'build and approve it from this checkout before the run (cua engine build, then cua engine approve with the owner at the console); harnesses never build';
  if (!facts.installed) {
    const why = facts.bundleBuild === null ? 'there is no engine bundle at the approved location'
      : facts.approvedRecordBuild === null ? 'the bundle has no approved.json beside it'
      : facts.bundleBuild !== facts.approvedRecordBuild ? `the bundle's build ${attestedBuild(facts.bundleBuild)} is pending: approved.json names ${attestedBuild(facts.approvedRecordBuild)}`
      : 'the bundle\'s signature is not approved.json\'s';
    throw new Error(`no approved engine on the device under HOME ${facts.home ?? '?'}: ${why}; ${remedy}`);
  }
  if (!facts.approvedEngineReal || facts.approvedEngineReal !== facts.installedReal)
    throw new Error(`--approved-engine ${approvedEngine} is not the approved engine the serve resolves (${facts.installed.bundlePath})`);
  if (facts.installed.build !== facts.checkoutBuild)
    throw new Error(`the checkout's engine build ${attestedBuild(facts.checkoutBuild)} is not the approved build ${attestedBuild(facts.installed.build)}: ${remedy}`);
  return {approved: facts.installed, checkoutBuild: facts.checkoutBuild};
}

// Adds one js result's engine attestation to `record` ({attested: distinct values, unattested: a count}).
export function attestEngine(record, result) {
  if (!record) return;
  const value = result?._meta?.['cua/nativeEngine'];
  if (!value || typeof value !== 'object') { record.unattested++; return; }
  const kept = {engine: value.engine ?? null, version: value.version ?? null, build: value.build ?? null};
  if (!record.attested.some(a => a.engine === kept.engine && a.version === kept.version && a.build === kept.build)) record.attested.push(kept);
}

// The problem with a run's engine attestation and helper attestation, or null (also null for a run that records no
// engine: one before engine attestation, or not a macOS computer run).
export function engineProblem(meta, name) {
  const record = meta?.nativeEngine;
  if (!record) return null;
  const {requested, approved, checkoutBuild} = record;
  if (!approved?.build || !checkoutBuild) return `${name}: records no approved engine or checkout build`;
  if (approved.build !== checkoutBuild) return `${name}: the checkout's build ${attestedBuild(checkoutBuild)} is not the approved build ${attestedBuild(approved.build)}`;
  if (record.unattested > 0) return `${name}: ${record.unattested} js results carry no cua/nativeEngine attestation`;
  if (record.attested?.length !== 1) return `${name}: ${record.attested?.length ?? 0} distinct engine attestations (${JSON.stringify(record.attested ?? [])}); one engine must answer every result`;
  const [answered] = record.attested;
  if (answered.engine !== requested) return `${name}: the ${answered.engine} engine answered, not the requested ${requested}`;
  if (requested === 'cua') {
    if (answered.build !== checkoutBuild) return `${name}: the attested build ${attestedBuild(answered.build)} is not the checkout's and approved build ${attestedBuild(checkoutBuild)}`;
    if (answered.version !== approved.engineVersion) return `${name}: the attested version ${answered.version} is not the approved engine's ${approved.engineVersion}`;
  } else if (answered.build !== meta.runtime?.release) return `${name}: the vendor engine attests the runtime ${answered.build}, not the run's ${meta.runtime?.release}`;
  return helperProblem(meta, name, requested);
}

function helperProblem(meta, name, requested) {
  const helpers = meta.service?.helpers;
  if (!Array.isArray(helpers)) return `${name}: records no helper attestation`;
  const other = requested === 'cua' ? 'vendor' : 'cua';
  const own = (helper, engine) => helper.kind === engine && helper.origin === OWN[engine].origin && helper.startedDuringRun === true;
  if (!helpers.some(h => own(h, requested))) return `${name}: no ${OWN[requested].origin} process (${OWN[requested].process}) started during the run`;
  if (helpers.some(h => own(h, other))) return `${name}: ${OWN[other].who} (${OWN[other].process}) started during a ${requested}-engine run`;
  return null;
}

// The engine's launch failure in one cell's result ({cell, failure}, the run loop's), as its text; null for any other
// outcome. These are cua's service's sentences for an engine that did not come up or is not the bundle's
// (src/services/engine/client.mjs establish and check, bundleIdentity).
const LAUNCH_FAILURE = /cua engine (did not start|launch request failed|API version mismatch|mismatch|native pipe is unavailable)|cua engine: (cannot read the bundle's Info\.plist|the bundle's Info\.plist at .* names no CFBundleShortVersionString or CUAEngineBuild)/;
export function launchFailureOf(r) {
  const text = r?.cell ? (r.cell.ok ? null : r.cell.error) : r?.failure;
  return typeof text === 'string' && LAUNCH_FAILURE.test(text) ? text : null;
}
