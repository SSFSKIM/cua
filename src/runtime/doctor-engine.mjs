// cua doctor's `engine` row (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md: acceptance 1; "Install,
// signing and permissions"; the Input section's route 4; the Decision Log's "M3 pre-flight" item 1) and the report's
// `engine` object, which `cua doctor --json` carries beside the checks.
//
// The selection is the launcher's (launch.mjs nativeEngineFor, with the inputs repl.host uses). When cua's engine is
// the one selected, the row reads the approved location through engine.mjs inspectEngine: the bundle and its records,
// the signature as a match and a kind (never the identity), and the engine's `status`, which gives the three grants
// (Input Monitoring the intervention tap's), whether the socket's owner is the approved bundle, the probe mode's
// ability, the route-4 overrides the engine read at launch and the apps `routeAdvice` names. An engine already running
// is read and left alone; with none running, inspectEngine launches the approved bundle, reads it and stops it (never a
// pending or unapproved one). When the vendor's engine is selected, nothing is launched, connected to or signed: the
// row says cua's engine is not selected, how to select it and what the approved location holds, from its files only.
// Off macOS, or without the computer surface, no native engine applies.
//
// Status: `fail` where every session is refused or cannot observe (no approved engine for an explicit selection, an
// unknown setting, an engine.json the engine refuses to start with, a bundle that is not cua's engine, the engine
// unreadable or unlaunchable, another engine at the socket, Accessibility or Screen Recording not granted); `warn`
// where sessions run with less than the design means (Input Monitoring missing, so intervention detection is off; the
// signature not the configured identity's; route 3 advising an override; the default's fallback to the vendor engine;
// an engine doctor launched and could not stop); `skip` where cua's engine is not in use; else `pass`. The probe's
// ability is reported, not judged.
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {CuaError} from './errors.mjs';
import {BUNDLE_ID} from './engine-bundle.mjs';
import {ENGINE_GRANTS, engineDirectory, engineRecords, grantSteps, inspectEngine, shortBuild} from './engine.mjs';
import {readEngineSettings} from './engine-sign.mjs';
import {nativeEngineFor} from './launch.mjs';
import {surfacesFrom} from '../mcp/surface.mjs';

const result = (name, status, detail) => ({name, status, detail});
const SETTINGS = '~/.config/cua/engine.json';
const UNREAD = Object.freeze({accessibility: null, screenRecording: null, inputMonitoring: null});
const SEVERITY = ['pass', 'warn', 'fail'];
const worst = statuses => statuses.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a), 'pass');

export const defaultInspectEngine = ({env}) => inspectEngine({dir: engineDirectory(env.HOME || homedir()), env});
export const defaultEngineRecords = ({env}) => engineRecords({dir: engineDirectory(env.HOME || homedir())});

// -> {row, report}; `report` is undefined off macOS. `engine` carries nativeEngineFor's inputs ({config, installed,
// defaultEngine}), shared with repl.host so both read the same selection; `inspect` and `records` read the approved
// location (inspectEngine's and engineRecords' reports; seams for tests, which never launch anything).
export async function engineCheck({env, platform, engine = {}, inspect = defaultInspectEngine, records = defaultEngineRecords}) {
  if (platform !== 'darwin') return {row: result('engine', 'skip', 'cua\'s native engine is macOS\'s; computer sessions here use the pinned Linux helper (#171 replaces it)')};
  let surfaces;
  try { surfaces = surfacesFrom(env.CUA_SHIM_SURFACES); } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    return {row: result('engine', 'skip', 'CUA_SHIM_SURFACES is not valid (see repl.host), so no session runs here'), report: notApplicable('invalid_surfaces')};
  }
  if (!surfaces.includes('computer'))
    return {row: result('engine', 'skip', 'the computer surface is off here (CUA_SHIM_SURFACES), so no session drives a native engine'), report: notApplicable('computer_surface_off')};

  const config = engine.config ?? (() => readEngineSettings({env}));
  const selection = select(env, {...engine, config});
  if (selection.selected === null)
    return {row: result('engine', 'fail', `${selection.refused.message}; every macOS computer session is refused (${selection.refused.code})`), report: {...notApplicable(selection.refused.code), refused: selection.refused}};
  if (selection.selected === 'vendor') return vendorRow(selection, records({env}));
  const facts = await inspect({env});
  const settings = settingsOf(config);
  return selection.installed ? installedRow(selection, facts, settings) : notInstalledRow(selection, facts, settings);
}

// The engine nativeEngineFor selects -> {selected: 'cua' | 'vendor' | null, reason, refused, installed}. Its refusals
// keep what they say about the engine: engine_not_installed is cua's selected without an approved engine,
// repl_host_refused the vendor's selected under CUA_REPL_HOST=cua (the host's refusal, which repl.host names), and
// invalid_setting no engine at all.
function select(env, engine) {
  const host = env.CUA_REPL_HOST === 'cua' || env.CUA_REPL_HOST === 'vendor' ? env.CUA_REPL_HOST : null;
  try {
    const chosen = nativeEngineFor({env, requestedHost: host, ...engine});
    if (chosen.reason === 'engine_not_installed') return {selected: 'cua', reason: 'engine_not_installed', source: 'default', refused: null, installed: false};
    return {selected: chosen.engine, reason: chosen.reason, source: chosen.reason, refused: null, installed: chosen.engine === 'cua'};
  } catch (error) {
    if (!(error instanceof CuaError)) throw error;
    const refused = {code: error.code, message: error.message};
    if (error.code === 'engine_not_installed') return {selected: 'cua', reason: error.code, source: sourceOf(env, engine.config), refused, installed: false};
    if (error.code === 'repl_host_refused') return {selected: 'vendor', reason: error.code, source: sourceOf(env, engine.config), refused, installed: false};
    return {selected: null, reason: error.code, refused, installed: false};
  }
}
// Where a refused selection came from (nativeEngineFor read the same setting before it refused).
const sourceOf = (env, config) => (env.CUA_NATIVE_ENGINE ? 'explicit' : config()?.engine !== undefined ? 'settings' : 'default');
const SOURCE_WORDS = {
  explicit: engine => `CUA_NATIVE_ENGINE=${engine}`,
  settings: engine => `"engine": "${engine}" in ${SETTINGS}`,
  default: () => 'the default engine',
};

function notApplicable(reason) {
  return {selected: null, reason, refused: null, bundle: null, exists: null, version: null, build: null, approved: null, approvedBuild: null, approvedAt: null,
    pending: null, signature: null, running: null, launched: null, statusError: null, socket: null, permissions: UNREAD, probe: {canPostHid: null}, routes: null, routeAdvice: null};
}

// ---- the vendor's engine selected ----

function vendorRow(selection, records) {
  const why = selection.source === 'default' ? 'the default engine is the vendor\'s' : SOURCE_WORDS[selection.source]('vendor');
  const serves = selection.refused ? `; sessions here are refused (${selection.refused.code}; see repl.host)` : ', so macOS computer sessions use the vendor\'s Codex Computer Use helper (helper.live)';
  const holds = records.approved && records.exists ? `approved.json approves build ${shortBuild(records.approved.build)} at ${records.bundlePath}`
    : records.pending && records.exists ? `a bundle at ${records.bundlePath} is pending approval (build ${shortBuild(records.pending.build)}; cua engine approve)`
    : records.exists ? `a bundle at ${records.bundlePath} is not approved (cua engine approve)`
    : 'none is installed on this Mac (cua engine build, then cua engine approve with the owner at the console)';
  return {
    row: result('engine', 'skip', `cua's engine is not selected: ${why}${serves}. `
      + `CUA_NATIVE_ENGINE=cua, or "engine": "cua" in ${SETTINGS}, selects cua's own, which runs an approved engine: ${holds}`),
    report: {...notApplicable(selection.reason), selected: 'vendor', refused: selection.refused, bundle: records.bundlePath, exists: records.exists,
      approved: records.exists ? null : false, approvedBuild: records.approved?.build ?? null, approvedAt: records.approved?.approvedAt ?? null, pending: records.pending},
  };
}

// ---- cua's engine selected ----

// The report's facts from inspectEngine's read.
function factsReport(selection, facts, settings) {
  const status = facts.status;
  const permissions = status ? {accessibility: status.accessibility === true, screenRecording: status.screenRecording === true, inputMonitoring: status.inputMonitoring === true} : UNREAD;
  return {
    selected: 'cua', reason: selection.reason, refused: selection.refused,
    bundle: facts.bundlePath, exists: facts.exists, version: facts.engineVersion, build: facts.build,
    approved: facts.approved, approvedBuild: facts.approvedBuild, approvedAt: facts.approvedAt, pending: facts.pending,
    signature: facts.signature, running: facts.running, launched: facts.launch, statusError: facts.statusError,
    socket: {path: status?.socket ?? null, ownerIsApproved: status ? ownsSocket(facts) : null},
    permissions, probe: {canPostHid: status ? status.canPostHid === true : null},
    routes: status ? status.routes ?? {} : settings.routes, routeAdvice: status ? status.routeAdvice ?? [] : null,
  };
}

const real = path => { try { return realpathSync(path); } catch { return path; } };
// Whether the engine that answered is the approved bundle: its own report of where it runs from and its build.
const ownsSocket = facts => facts.approved === true && real(facts.status.bundlePath) === real(facts.bundlePath) && facts.status.build === facts.build;

function notInstalledRow(selection, facts, settings) {
  const source = SOURCE_WORDS[selection.source]('cua');
  const consequence = selection.refused ? 'so every macOS computer session is refused (engine_not_installed)' : 'so macOS computer sessions keep the vendor host and engine until one is';
  const parts = [installState(facts)];
  if (settings.problem) parts.push(settings.problem);
  return {row: result('engine', selection.refused || settings.problem ? 'fail' : 'warn', `cua's engine is selected (${source}), but no approved engine is installed, ${consequence}: ${parts.join('; ')}`),
    report: factsReport(selection, facts, settings)};
}

// Why the bundle at the approved location is not the approved engine, and what to run.
function installState(facts) {
  const at = facts.bundlePath;
  if (!facts.exists) return `no bundle at ${at}: build it with cua engine build, then approve it with cua engine approve (the owner at the console)`;
  if (facts.approved === null) return `the signature of the bundle at ${at} could not be read (${facts.signature?.reason ?? 'unknown'}), so it is not taken as approved; codesign may be waiting behind a prompt at the console`;
  if (facts.pending && facts.pending.build === facts.build) return `the bundle at ${at} (build ${shortBuild(facts.build)}) is pending approval: run cua engine approve with the owner at the console`;
  if (facts.approvedBuild && facts.approvedBuild !== facts.build) return `the bundle at ${at} is build ${shortBuild(facts.build)}, but approved.json approves build ${shortBuild(facts.approvedBuild)}: run cua engine approve with the owner at the console`;
  if (facts.approvedBuild) return `the bundle at ${at} is not signed as approved.json records: rebuild it with cua engine build, then cua engine approve`;
  return `the bundle at ${at} (build ${shortBuild(facts.build)}) is not approved: run cua engine approve with the owner at the console`;
}

function installedRow(selection, facts, settings) {
  const report = factsReport(selection, facts, settings);
  const verdicts = [];
  const say = (status, text) => { verdicts.push(status); return text; };
  const parts = [`the approved cua Engine.app at ${facts.bundlePath} (version ${facts.engineVersion}, build ${shortBuild(facts.build)})`];
  parts.push(signatureWords(facts.signature, say));
  if (facts.bundleId !== BUNDLE_ID) parts.push(say('fail', `but it is not cua's engine (bundle id ${facts.bundleId ?? 'unreadable'}), so doctor does not launch it`));
  else parts.push(processWords(facts, report, say));
  if (facts.status) {
    parts.push(...grantWords(facts.status, facts.bundlePath, say));
    parts.push(facts.status.canPostHid === true ? 'the probe mode can post HID events (cua-engine --probe keystroke)' : 'the probe mode cannot post HID events, so the harnesses\' keystroke cells refuse');
  }
  parts.push(...routeWords(report, settings, facts.status, say));
  return {row: result('engine', worst(verdicts), `cua's engine is selected (${SOURCE_WORDS[selection.source]('cua')}): ${parts.join('; ')}`), report};
}

function signatureWords(signature, say) {
  if (signature?.kind === 'adhoc') return say('warn', 'signed ad hoc, so its grants do not survive a rebuild: set signingIdentity in ' + SETTINGS + ', then cua engine build and cua engine approve');
  if (signature?.identityMatches === true) return 'signed by the configured identity';
  if (signature?.identityMatches === false) return say('warn', 'signed, but not by the configured signing identity: cua engine build re-signs it with that identity, then cua engine approve');
  return say('warn', `signed, but no signing identity is configured to compare it with (signingIdentity in ${SETTINGS}, or CUA_SIGNING_IDENTITY; a rebuild needs one)`);
}

// Who answered at the socket: the engine already running, the one doctor launched, or none.
function processWords(facts, report, say) {
  const {status, launch} = facts;
  if (facts.statusError) return say('fail', `the engine at its socket answered status with an error: ${facts.statusError}`);
  if (launch?.error && !launch.pid) return say('fail', `no engine was running, and launching this bundle to read its grants failed: ${launch.error}; sessions launch it the same way`);
  if (status && report.socket.ownerIsApproved === false)
    return say('fail', `the engine answering at ${status.socket} (pid ${status.pid}) is not this bundle: it runs ${status.bundlePath}, build ${shortBuild(status.build)}; sessions refuse it on its build: stop it with cua engine stop`);
  if (facts.running) return `the engine answering at ${status.socket} (pid ${status.pid}) is this bundle, already running: read and left alone`;
  if (launch?.stopped) return `no engine was running, so doctor launched this bundle (open -n -g -a, pid ${launch.pid}) to read its grants and stopped it`;
  if (launch?.leftRunning) return `no engine was running, so doctor launched this bundle (pid ${launch.pid}) to read its grants; a session connected before doctor could stop it, so it was left running for that session (${launch.detail})`;
  if (launch?.error) return say('warn', `no engine was running, so doctor launched this bundle (pid ${launch.pid}) to read its grants, and could not stop it: ${launch.error}`);
  return say('fail', 'no engine is running and doctor did not launch one, so its grants are unread');
}

const GRANT_LABEL = {accessibility: 'Accessibility', screenRecording: 'Screen Recording', inputMonitoring: 'Input Monitoring'};
const GRANT_EFFECT = {
  accessibility: ['fail', 'so every observation fails permissionsPending'],
  screenRecording: ['fail', 'so every observation fails permissionsPending (a text observation captures too)'],
  inputMonitoring: ['warn', 'so the engine runs with intervention detection off'],
};
function grantWords(status, bundle, say) {
  return ENGINE_GRANTS.map(grant => {
    if (status[grant.key] === true) return `${GRANT_LABEL[grant.key]} granted${grant.key === 'inputMonitoring' ? ' (the intervention tap\'s)' : ''}`;
    const [verdict, effect] = GRANT_EFFECT[grant.key];
    return say(verdict, `${GRANT_LABEL[grant.key]} not granted, ${effect}: ${grantSteps(grant, bundle)}`);
  });
}

// The route-4 overrides (the running engine's, read at its launch; else engine.json's, read at the next) and the apps
// route 3's guard has failed three actions in a row for.
function routeWords(report, settings, status, say) {
  const words = [];
  if (settings.problem) words.push(say('fail', settings.problem));
  const apps = Object.keys(report.routes ?? {}).sort();
  words.push(apps.length ? `route 4 (the foreground assist) for ${apps.join(', ')}, by the owner's override${status ? '' : ` in ${SETTINGS}, read at the engine's next launch`}` : 'no route-4 override');
  if (status && settings.routes) {
    const filed = Object.keys(settings.routes).sort();
    if (filed.join('\n') !== apps.join('\n'))
      words.push(`${SETTINGS} now lists ${filed.length ? filed.join(', ') : 'no override'}, which the running engine has not read: cua engine stop applies it at the next launch`);
  }
  if (report.routeAdvice?.length)
    words.push(say('warn', `route 3 could not prepare ${report.routeAdvice.join(', ')} for a background click three actions in a row: if the owner accepts a moment in front for it, add "routes": {"<bundle id>": 4} to ${SETTINGS}`));
  return words;
}

// engine.json's keys the engine reads at launch (native/engine/Sources/Engine/Config.swift), checked as it checks them:
// a value it refuses stops it at start. -> {routes: {...} | null, problem: string | null}.
function settingsOf(config) {
  let settings;
  try { settings = config(); } catch { return {routes: null, problem: null}; } // unreadable: nativeEngineFor refused already
  if (!settings || typeof settings !== 'object') return {routes: null, problem: null};
  const problems = [];
  if (settings.peerPolicy !== undefined && settings.peerPolicy !== 'uid') problems.push(`peerPolicy in ${SETTINGS} must be "uid" (or absent)`);
  let routes = {};
  if (settings.routes !== undefined) {
    const table = settings.routes;
    const valid = table && typeof table === 'object' && !Array.isArray(table) && Object.entries(table).every(([id, route]) => id && route === 4);
    if (valid) routes = {...table};
    else { routes = null; problems.push(`routes in ${SETTINGS} must map bundle ids to 4, the foreground route (or be absent)`); }
  }
  return {routes, problem: problems.length ? `${problems.join(', and ')}, so the engine refuses to start (exit 78)` : null};
}
