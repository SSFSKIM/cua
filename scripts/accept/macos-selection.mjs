// The macOS default-selection mode's homes and judges (#117 M5, T11a; the M4/M5 pre-flight's sitting E and §7 "The
// default switch, mechanically"), modeled on Linux's (#171 M5, linux-selection.mjs, whose selection judges it shares):
// with nothing selecting an engine, a macOS computer session on a home whose approved engine this cua drives selects
// cua's engine by default, and every other home keeps the vendor's host and engine with a warning naming why and the
// remedy. The runner, macos-default-selection.mjs, shapes each home on a runner and reads `cua doctor --json` there;
// everything here is pure.
//
// Two lanes judge the default home. `fixture`: a synthetic approved bundle (scripts/probe/fixture-engine.mjs), a
// selection check only: doctor's inspection of that bundle cannot pass (it is not cua's engine), so the engine row is
// recorded, not judged. `approved`: the run's own engine, built ad hoc and approved in a disposable runner home (the
// hosted+ witness): doctor's inspection is judged by its facts (approvedInspectionProblem), a failed one named apart
// from a wrong selection.
import {defaultSelectionProblem} from './linux-selection.mjs';

export {defaultSelectionProblem};

// The version every approved build before T9 reports, so what every owner's Mac holds until O1 approves a newer one:
// the outdated home's engine.
export const PRE_MINIMUM_VERSION = '0.1.0';

// Each home the mode shapes: whether it holds an approved engine (`engine`: 'minimum', the fixture at the service's
// minimum; 'old', PRE_MINIMUM_VERSION's; null, none), whether cua's own host finds a Node 24 (`node`: false runs cua
// on an older Node with none on the way), and what the default must select there (`expect`: 'cua', or the reason it
// keeps the vendor's engine, src/runtime/launch.mjs nativeEngineFor and macosComputerHost).
export const HOMES = Object.freeze({
  default: Object.freeze({engine: 'minimum', node: true, expect: 'cua'}),
  none: Object.freeze({engine: null, node: true, expect: 'engine_not_installed'}),
  node: Object.freeze({engine: 'minimum', node: false, expect: 'own_host_node_unavailable'}),
  outdated: Object.freeze({engine: 'old', node: true, expect: 'engine_outdated'}),
});
export const FALLBACK_HOMES = Object.freeze(Object.fromEntries(Object.entries(HOMES).filter(([, home]) => home.expect !== 'cua').map(([kind, home]) => [kind, home.expect])));

// What the engine row must name as the way on, per fallback: the approval with no approved engine (the row names `cua
// engine build`, repl.host `cua install --engine`), both steps for one below the minimum with nothing pending (T9),
// and the Node the own host needs.
const REMEDIES = Object.freeze({
  engine_not_installed: ['cua engine approve'],
  engine_outdated: ['cua install --engine', 'cua engine approve'],
  own_host_node_unavailable: ['Node 24'],
});

const row = (report, name) => (report?.checks ?? []).find(check => check.name === name);
export const LANES = Object.freeze(['fixture', 'approved']);

// repl.host's selection as its row states it: `<host> host (<reason>)` opens the session's sentence.
const HOST_LINE = /^(cua|vendor) host \(([a-z_]+)\)/;
/** The host doctor's repl.host row says a session here runs -> {host, reason, status} (host and reason null when the
 * row states none, as for a refusal), or null without the row. */
export function hostOf(report) {
  const found = row(report, 'repl.host');
  if (!found) return null;
  const [, host = null, reason = null] = HOST_LINE.exec(found.detail ?? '') ?? [];
  return {host, reason, status: found.status};
}

/**
 * The default home's judge: null when doctor says the default selected cua's engine and runs it on cua's own host
 * (repl.host `cua host (cua_engine)`, pass); in the `approved` lane doctor's inspection of the approved bundle must hold
 * as well (approvedInspectionProblem, against `sourceBuild`, this checkout's engine build), its failure named as such,
 * apart from a wrong selection.
 */
export function defaultHomeProblem(report, {lane = 'fixture', sourceBuild = null} = {}) {
  if (!LANES.includes(lane)) return `no lane ${lane}: ${LANES.join(' or ')}`;
  const selection = defaultSelectionProblem(report);
  if (selection) return selection;
  const host = hostOf(report);
  if (!host) return 'cua doctor --json reports no repl.host row';
  if (host.host !== 'cua' || host.reason !== 'cua_engine' || host.status !== 'pass')
    return `doctor's repl.host row is ${host.status}, ${host.host ? `${host.host} host (${host.reason})` : 'no host'}, not cua's host for cua's engine (cua_engine) with pass`;
  return lane === 'approved' ? approvedInspectionProblem(report, sourceBuild) : null;
}

const GRANT_NAMES = Object.freeze({accessibility: 'Accessibility', screenRecording: 'Screen Recording', inputMonitoring: 'Input Monitoring'});
/**
 * The approved lane's inspection judge, on doctor's structured facts (report.engine, doctor-engine.mjs factsReport)
 * rather than its row's verdict: the hosted job signs ad hoc, which doctor's row always warns on (signatureWords), so
 * the row cannot pass there. A failing row is rejected as it stands. Otherwise the approved bundle must be this
 * checkout's build, the engine that answered at its socket that bundle, its three grants held (the hosted approval
 * grants all three) and doctor's launch of it clean; then a warning is accepted only when the bundle is signed ad hoc
 * and no other of the row's warnings (installedRow's: the source build, the grants, the launch, route 3's advice) holds.
 */
function approvedInspectionProblem(report, sourceBuild) {
  const engine = row(report, 'engine'), facts = report.engine;
  if (engine.status === 'fail') return `the default selected cua's engine on cua's host, but doctor's inspection of the approved bundle is fail: ${engine.detail}`;
  if (!sourceBuild) return 'the approved lane judges the bundle against this checkout\'s engine build, and none was given';
  if (!facts?.socket || !facts.permissions) return 'cua doctor --json reports no inspection of the approved bundle';
  if (facts.approved !== true || facts.approvedBuild !== sourceBuild || facts.build !== sourceBuild)
    return `the approved bundle is build ${facts.approvedBuild}, running build ${facts.build}, not this checkout's (${sourceBuild})`;
  if (facts.socket.ownerIsApproved !== true) return 'the engine doctor read at the socket is not the approved bundle';
  const missing = Object.keys(GRANT_NAMES).filter(grant => facts.permissions[grant] !== true);
  if (missing.length) return `cua Engine lacks ${missing.map(grant => GRANT_NAMES[grant]).join(', ')}, which the hosted approval grants`;
  const launched = facts.launched;
  if (launched?.replaced || launched?.error) return `doctor's launch of the approved bundle did not end cleanly: ${launched.error ?? launched.detail}`;
  if (facts.routeAdvice?.length) return `doctor's engine row warns, route 3 advice for ${facts.routeAdvice.join(', ')}`;
  if (engine.status === 'warn' && facts.signature?.kind !== 'adhoc')
    return `doctor's engine row warns, and the bundle is not signed ad hoc (the one warning this lane expects): ${engine.detail}`;
  return engine.status === 'pass' || engine.status === 'warn' ? null : `doctor's engine row is ${engine.status}`;
}

/**
 * A fallback home's judge (`kind` a key of FALLBACK_HOMES): null when doctor says the default kept the vendor's engine
 * and host for that home's reason, the engine row and repl.host each a warning, the engine row naming the reason and
 * its remedy; else what differs.
 */
export function fallbackSelectionProblem(report, kind) {
  const reason = FALLBACK_HOMES[kind];
  if (!reason) return `no fallback home ${kind}: ${Object.keys(FALLBACK_HOMES).join(', ').replace(/, (?=[^,]*$)/, ' or ')}`;
  if (!report || typeof report !== 'object') return 'cua doctor --json printed no report';
  const engine = row(report, 'engine'), host = row(report, 'repl.host');
  if (!report.engine || !engine || !host) return 'cua doctor --json reports no engine selection';
  const {selected, reason: found} = report.engine;
  if (selected !== 'vendor' || found !== reason) return `the session selects ${selected} (${found}), not the vendor's engine for ${reason}`;
  if (engine.status !== 'warn') return `doctor's engine row is ${engine.status}, not a warning`;
  if (!engine.detail.includes(`(${reason})`)) return `doctor's engine row does not name its reason, ${reason}`;
  const missing = REMEDIES[reason].filter(words => !engine.detail.includes(words));
  if (missing.length) return `doctor's engine row does not name ${missing.join(' or ')}`;
  if (host.status !== 'warn' || !host.detail.startsWith(`vendor host (${reason})`)) return `doctor's repl.host row is ${host.status} and does not keep the vendor host for ${reason}`;
  return null;
}

/** The judge of home `kind` in `lane`: the default home's where cua's engine is expected, else the fallback's. */
export const judgeFor = (kind, {lane = 'fixture', sourceBuild = null} = {}) => (HOMES[kind]?.expect === 'cua' ? report => defaultHomeProblem(report, {lane, sourceBuild}) : report => fallbackSelectionProblem(report, kind));

/**
 * The sitting's verdict from each home's doctor report (`reports`, kind -> report) in `lane` (the approved lane's
 * `sourceBuild` with it): {pass, homes: {kind: problem | null}}. Every home of HOMES is judged; one without a report fails.
 */
export function sittingVerdict(reports, {lane = 'fixture', sourceBuild = null} = {}) {
  const homes = Object.fromEntries(Object.keys(HOMES).map(kind => [kind, kind in reports ? judgeFor(kind, {lane, sourceBuild})(reports[kind]) : 'not run']));
  return {pass: Object.values(homes).every(problem => problem === null), homes};
}

/**
 * Why `home` (its real path) may not stand in as the default home's approved engine, or null: the approved lane runs
 * only on a GitHub-hosted runner (`env.RUNNER_ENVIRONMENT`), in a disposable home strictly under the runner's temp
 * directory (`runnerTemp`, its real path; never the account's own home, `accountHome`), whose approved engine is this
 * checkout's build (`approvedBuild`, the home's installedEngine build or null; `sourceBuild`, engine-bundle.mjs
 * engineBuild). Doctor launches and stops an approved bundle it inspects, so nothing else may be named.
 */
export function approvedHomeProblem({home, env, runnerTemp, accountHome, approvedBuild, sourceBuild}) {
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted') return '--approved-home runs only on a GitHub-hosted runner (RUNNER_ENVIRONMENT=github-hosted)';
  if (!runnerTemp) return '--approved-home needs the runner\'s temp directory (RUNNER_TEMP)';
  if (home === accountHome || !home.startsWith(`${runnerTemp}/`)) return `--approved-home must be a disposable home under the runner's temp directory (${runnerTemp}), not ${home}`;
  if (!approvedBuild) return `--approved-home ${home} holds no approved engine`;
  if (approvedBuild !== sourceBuild) return `the engine approved in ${home} is build ${approvedBuild}, not this checkout's (${sourceBuild}): the run builds and approves its own`;
  return null;
}
