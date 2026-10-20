#!/usr/bin/env node
// cua's engine service in either REPL host, checked headless (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "Engine selection, host switch and retirement", Verification system part 1, and the Decision Log's "M1b pre-flight"
// item 6). With `--host vendor`, comparison A's lane: cua's service loaded in the VENDOR trusted worker
// (CUA_REPL_HOST=vendor). With `--host cua`, the target row: cua's engine on cua's own host (CUA_REPL_HOST unset), through
// its supervisor, its native-pipe relay and its trusted-code-path check. Either way the service gets CUA_ENGINE_APP and
// CUA_ENGINE_SCREENSHOTS in nodeRepl.env, nodeRepl.nativePipe and nodeRepl.launchServices, reaches the engine, and its
// results' engine attestation reaches the MCP client.
//
//   node scripts/probe-engine-lane.mjs --home <installed CUA_HOME> --user-home <new scratch dir> [--host vendor|cua] [--report <file>]
//
// Path under test: MCP client -> `cua serve` (scripts/probe/serve-engine-lane.mjs: production serve, plus one probe
// reporter service) with CUA_NATIVE_ENGINE=cua -> the selection's row -> the host -> its trusted worker ->
// src/services/sky.mjs -> src/services/engine/service.mjs -> the engine client -> nodeRepl.nativePipe -> a FAKE engine
// this probe runs, already listening at the engine.sock beside the bundle CUA_ENGINE_APP names. The bundle is a fixture
// approved engine (scripts/probe/fixture-engine.mjs) under the scratch --user-home, which the connection gets as HOME;
// it is never launched (its executable leaves a marker if it ever runs, which the probe checks), and neither is the
// vendor helper. The reporter asks each host's LaunchServices relay to open an .app that does not exist, in the shape
// cua's engine client launches the engine with ({applicationPath}), so the cold launch's request is known to reach the
// host's supervisor; nothing exists there to launch. No GUI, no grant, no real engine: the engine at the approved
// location of the account's own home is never read. cua's own host needs a Node 24 or later: the CUA_HOME's managed one,
// or CUA_NODE from the caller's environment.
// Cells: the reporter's view of the worker; setup and list_apps through cua's service; get_app_state of a fixture app,
// whose approval elicitation the probe accepts. The report holds each check's label and pass, a code as detail at most;
// nothing it prints carries a path or an environment value. Exit 0 PASS, 1 FAIL, 2 usage.
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient} from './browser-parity/mcp.mjs';
import {FIXTURE_ENGINE, fixtureEngineLaunched, placeFixtureEngine} from './probe/fixture-engine.mjs';
import {startFakeEngine} from '../test/helpers/fake-engine.mjs';
import {socketPathFor} from '../src/services/engine/client.mjs';
import {ENGINE_SERVICE} from '../src/runtime/launch.mjs';
import {REPL_HOST_NAME} from '../src/repl-host/identity.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVE = fileURLToPath(new URL('./probe/serve-engine-lane.mjs', import.meta.url));
const APP = {appPath: '/Applications/Engine Lane Fixture.app', bundleIdentifier: 'io.github.ssfskim.cua.engine-lane-fixture', displayName: 'Engine Lane Fixture'};
const PID = 4242;
// The vendor host's serverInfo name (its rmcp server), and cua's own host's.
const SERVER_NAMES = {vendor: 'rmcp', cua: REPL_HOST_NAME};
// How each host's supervisor refuses `{applicationPath}` naming an .app that does not exist: the vendor checks the path
// first (recovered from node_repl, docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md);
// cua's own host asks `open -n -g -a`, which finds nothing to open (src/repl-host/launch-services.mjs).
const ABSENT_REFUSALS = {vendor: /LaunchServices application path does not exist/, cua: /^failed to dispatch LaunchServices open: /};

// The pids of processes whose command line names `pattern` (pgrep -f), as a set.
const pids = pattern => { try { return new Set(execFileSync('/usr/bin/pgrep', ['-f', pattern], {encoding: 'utf8'}).trim().split('\n').filter(Boolean)); } catch { return new Set(); } };
const started = (before, after) => [...after].filter(pid => !before.has(pid)).length;

export async function probeEngineLane({home, userHome, host = 'vendor'}) {
  const checks = [];
  const check = (label, pass, detail) => { checks.push({label, pass: Boolean(pass), ...(detail ? {detail} : {})}); process.stderr.write(`${pass ? 'PASS' : 'FAIL'} ${label}\n`); };
  const watched = ['SkyComputerUseService', 'cua-engine'];
  const before = watched.map(pids);

  mkdirSync(userHome, {mode: 0o700});
  const installed = placeFixtureEngine(userHome);
  const fake = await startFakeEngine({after() {}}, socketPathFor(installed.bundlePath), {identity: {engineVersion: FIXTURE_ENGINE.version, build: FIXTURE_ENGINE.build}, handlers: {
    'execute:list_apps': () => [{id: APP.bundleIdentifier, displayName: APP.displayName, isRunning: true}],
    'execute:resolve_app': () => ({...APP, isRunning: true, pid: PID}),
    'execute:get_app_state': () => ({app: {...APP, pid: PID, catalyst: false}, window: {title: 'Engine lane', frame: {x: 0, y: 0, width: 100, height: 100}, pid: PID},
      lineage: 'lane-1', revision: 1, nodes: [], truncated: null, screenshot: null, focused: null, selectedText: null, selectedElements: [], menuBar: []}),
  }});
  const facts = join(userHome, 'launch-facts.json');
  const absentApp = join(realpathSync(userHome), 'cua-engine-lane-absent.app');
  const elicitations = [];
  const env = {PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: userHome, CUA_HOME: home, LANG: 'en_US.UTF-8', ...(process.env.TMPDIR ? {TMPDIR: process.env.TMPDIR} : {}),
    ...(process.env.USER ? {USER: process.env.USER, LOGNAME: process.env.USER} : {}), ...(process.env.CUA_NODE ? {CUA_NODE: process.env.CUA_NODE} : {}),
    CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'computer', CUA_NATIVE_ENGINE: 'cua', ...(host === 'vendor' ? {CUA_REPL_HOST: 'vendor'} : {})};
  const client = new StdioClient({command: process.execPath, args: [SERVE, facts], env, cwd: REPO, clientName: 'probe-engine-lane', timeoutMs: 120_000,
    onElicitation: (row, msg) => elicitations.push({action: row.action, connector: msg.params?._meta?.connector_id ?? null, app: msg.params?._meta?.tool_params?.app ?? null})});
  const cell = async code => {
    const result = await client.call('js', {code, timeout_ms: 60_000});
    const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return {error: result.isError === true, json: (() => { try { return JSON.parse(text.slice(text.lastIndexOf('\n{') + 1)); } catch { return null; } })(), meta: result._meta ?? {}};
  };
  try {
    const init = await client.initialize();
    const launch = JSON.parse(readFileSync(facts, 'utf8'));
    const realHome = realpathSync(home);
    const row = host === 'vendor' ? {host: 'vendor', reason: 'explicit'} : {host: 'cua', reason: 'cua_engine'};
    check(host === 'vendor' ? 'the selection is comparison A\'s lane: the vendor host (explicit), cua\'s engine' : 'the selection is the target row: cua\'s own host (cua_engine), cua\'s engine',
      launch.replHost.host === row.host && launch.replHost.reason === row.reason
      && launch.nativeEngine?.engine === 'cua' && launch.nativeEngine.build === FIXTURE_ENGINE.build && launch.env.CUA_SKY_SERVICE === ENGINE_SERVICE);
    check('the launch names no vendor helper', launch.env.SKY_CUA_SERVICE_PATH === null);
    check(`${host === 'vendor' ? 'the vendor host' : 'cua\'s own host'} answered (serverInfo ${SERVER_NAMES[host]})`, init.serverInfo?.name === SERVER_NAMES[host]);

    const reported = await cell(`nodeRepl.write("\\n" + JSON.stringify(await nodeRepl.rpc("engineLaneReporter", {absentApp: ${JSON.stringify(absentApp)}})))`);
    const worker = reported.json;
    check('the reporter ran in the trusted worker', !reported.error && worker !== null);
    check('nodeRepl.env carries CUA_ENGINE_APP: the approved bundle', worker?.env.CUA_ENGINE_APP === installed.bundlePath && worker.env.CUA_ENGINE_APP === launch.env.CUA_ENGINE_APP);
    check('nodeRepl.env carries CUA_ENGINE_SCREENSHOTS: the session\'s run directory', worker?.env.CUA_ENGINE_SCREENSHOTS === launch.env.CUA_ENGINE_SCREENSHOTS
      && launch.env.CUA_ENGINE_SCREENSHOTS === join(launch.cwd, 'screenshots') && launch.cwd.startsWith(join(realHome, 'run') + '/'));
    check('nodeRepl.env names cua\'s service and no vendor helper', worker?.env.CUA_SKY_SERVICE === ENGINE_SERVICE && worker.env.SKY_CUA_SERVICE_PATH === null);
    check('nodeRepl.nativePipe.createConnection is a function', worker?.nativePipe === 'function');
    check('nodeRepl.launchServices.openApplication refuses an empty target in the worker', worker?.launchServices === 'function'
      && worker.openEmpty?.accepted === false && /exactly one of applicationPath or bundleIdentifier/.test(worker.openEmpty.message ?? ''));
    check('the host\'s supervisor received the engine client\'s launch shape, {applicationPath}, and refused an absent .app',
      worker?.openAbsent?.accepted === false && ABSENT_REFUSALS[host].test(worker.openAbsent.message ?? ''));
    check('nodeRepl.withSuspendedTimeout, createElicitation and setResponseMeta are functions', worker && Object.values(worker.types).every(type => type === 'function'));
    check('a js result attests the launch\'s engine', reported.meta['cua/nativeEngine']?.engine === 'cua' && reported.meta['cua/nativeEngine'].build === FIXTURE_ENGINE.build);

    const listed = await cell('const setup = await nodeRepl.rpc("sky", {type: "setup"}); const apps = await nodeRepl.rpc("sky", {type: "execute", method: "list_apps", args: [{}]}); nodeRepl.write("\\n" + JSON.stringify({setup, apps}))');
    const ping = fake.received.find(r => r.method === 'ping');
    check('cua\'s service reached the engine through nativePipe at the bundle\'s socket', ping?.params?.clientApiVersion === 'cua-engine-1');
    check('setup and list_apps answered through cua\'s service', !listed.error && listed.json?.setup?.target === 'mac' && listed.json.apps?.[0]?.id === APP.bundleIdentifier);
    const observed = await cell(`nodeRepl.write("\\n" + JSON.stringify(await nodeRepl.rpc("sky", {type: "execute", method: "get_app_state", args: [{app: ${JSON.stringify(APP.bundleIdentifier)}}]})))`);
    const observation = fake.executes().find(params => params.method === 'get_app_state');
    check('one approval elicitation, from the policy, accepted', elicitations.length === 1 && elicitations[0].connector === 'computer-use' && elicitations[0].app === APP.bundleIdentifier);
    check('get_app_state rendered the engine\'s tree', !observed.error && /^Window: "Engine lane", App: Engine Lane Fixture\./.test(observed.json?.text ?? ''));
    check('get_app_state asked the engine to write into CUA_ENGINE_SCREENSHOTS', observation?.args?.outputDirectory === launch.env.CUA_ENGINE_SCREENSHOTS);
    const attested = observed.meta['cua/nativeEngine'];
    check('the service\'s cua/nativeEngine reaches the client', attested?.engine === 'cua' && attested.version === FIXTURE_ENGINE.version
      && attested.build === FIXTURE_ENGINE.build && observed.meta['codex/toolSurface']?.kind === 'computerUse');
  } catch (error) {
    check('the lane ran to the end', false, error.code && /^[A-Z_]+$|^[a-z_]+$/.test(String(error.code)) ? String(error.code) : undefined);
  } finally {
    await client.close();
    await fake.stop();
  }
  check('the fixture engine was never launched: its executable left no marker', !fixtureEngineLaunched(userHome));
  const after = watched.map(pids);
  check('no SkyComputerUseService or cua-engine process was running after the run that was not before it', watched.every((_, i) => started(before[i], after[i]) === 0));
  return {ok: checks.every(c => c.pass), checks};
}

async function main() {
  const {values} = parseArgs({options: {home: {type: 'string'}, 'user-home': {type: 'string'}, host: {type: 'string', default: 'vendor'}, report: {type: 'string'}}});
  if (process.platform !== 'darwin' || !values.home || !values['user-home'] || !Object.hasOwn(SERVER_NAMES, values.host)) {
    process.stderr.write('probe-engine-lane: macOS only; pass --home <installed CUA_HOME> --user-home <new scratch dir> [--host vendor|cua] [--report <file>]\n');
    return 2;
  }
  const report = await probeEngineLane({home: resolve(values.home), userHome: resolve(values['user-home']), host: values.host});
  if (values.report) writeFileSync(values.report, JSON.stringify(report, null, 2) + '\n');
  process.stderr.write(`probe-engine-lane: ${report.ok ? 'PASS' : 'FAIL'}\n`);
  return report.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
