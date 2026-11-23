// The macOS default-selection mode's homes and judges (#117 M5, T11a; the M4/M5 pre-flight's sitting E and §7 "The
// default switch, mechanically"), modeled on Linux's (#171 M5, linux-selection.mjs, whose selection judges it shares):
// with nothing selecting an engine, a macOS computer session on a home whose approved engine this cua drives selects
// cua's engine by default, and every other home keeps the vendor's host and engine with a warning naming why and the
// remedy. The runner, macos-default-selection.mjs, shapes each home on a runner and reads `cua doctor --json` there;
// everything here is pure.
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

/** The judge of home `kind`: the default's for the home where cua's engine is expected, else the fallback's. */
export const judgeFor = kind => (HOMES[kind]?.expect === 'cua' ? defaultSelectionProblem : report => fallbackSelectionProblem(report, kind));

/**
 * The sitting's verdict from each home's doctor report (`reports`, kind -> report): {pass, homes: {kind: problem |
 * null}}. Every home of HOMES is judged; one without a report fails.
 */
export function sittingVerdict(reports) {
  const homes = Object.fromEntries(Object.keys(HOMES).map(kind => [kind, kind in reports ? judgeFor(kind)(reports[kind]) : 'not run']));
  return {pass: Object.values(homes).every(problem => problem === null), homes};
}
