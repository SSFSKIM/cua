#!/usr/bin/env node
// Comparison A's lane, checked headless (#117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system part 1, and the Decision Log's "M1b pre-flight" item 6): cua's engine service loaded in the
// VENDOR trusted worker gets what it needs there, CUA_ENGINE_APP and CUA_ENGINE_SCREENSHOTS in nodeRepl.env, and
// nodeRepl.nativePipe and nodeRepl.launchServices, and its results' engine attestation reaches the MCP client.
//
//   node scripts/probe-engine-lane.mjs --home <installed CUA_HOME> --user-home <new scratch dir> [--report <file>]
//
// Path under test: MCP client -> `cua serve` (scripts/probe/serve-engine-lane.mjs: production serve, plus one probe
// reporter service) with CUA_NATIVE_ENGINE=cua and CUA_REPL_HOST=vendor -> the selection's comparison-A row -> the vendor
// cua-repl -> node_repl -> its trusted worker -> src/services/sky.mjs -> src/services/engine/service.mjs -> the engine
// client -> nodeRepl.nativePipe -> a FAKE engine this probe runs, already listening at the engine.sock beside the bundle
// CUA_ENGINE_APP names. The bundle is a fixture approved engine (scripts/probe/fixture-engine.mjs) under the scratch
// --user-home, which the connection gets as HOME; it is never launched, and neither is the vendor helper (the probe
// fails if a SkyComputerUseService or cua-engine process appears during the run). No GUI, no grant, no real engine:
// the engine at the approved location of the account's own home is never read.
// Cells: the reporter's view of the worker; setup and list_apps through cua's service; get_app_state of a fixture app,
// whose approval elicitation the probe accepts. The report holds each check's label and pass, a code as detail at most;
// nothing it prints carries a path or an environment value. Exit 0 PASS, 1 FAIL, 2 usage.
import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient} from './browser-parity/mcp.mjs';
import {FIXTURE_ENGINE, placeFixtureEngine} from './probe/fixture-engine.mjs';
import {startFakeEngine} from '../test/helpers/fake-engine.mjs';
import {socketPathFor} from '../src/services/engine/client.mjs';
import {ENGINE_SERVICE} from '../src/runtime/launch.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVE = fileURLToPath(new URL('./probe/serve-engine-lane.mjs', import.meta.url));
const APP = {appPath: '/Applications/Engine Lane Fixture.app', bundleIdentifier: 'io.github.ssfskim.cua.engine-lane-fixture', displayName: 'Engine Lane Fixture'};
const PID = 4242;

// The pids of processes whose command line names `pattern` (pgrep -f), as a set.
const pids = pattern => { try { return new Set(execFileSync('/usr/bin/pgrep', ['-f', pattern], {encoding: 'utf8'}).trim().split('\n').filter(Boolean)); } catch { return new Set(); } };
const started = (before, after) => [...after].filter(pid => !before.has(pid)).length;

export async function probeEngineLane({home, userHome}) {
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
  const elicitations = [];
  const env = {PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: userHome, CUA_HOME: home, LANG: 'en_US.UTF-8', ...(process.env.TMPDIR ? {TMPDIR: process.env.TMPDIR} : {}),
    ...(process.env.USER ? {USER: process.env.USER, LOGNAME: process.env.USER} : {}),
    CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'computer', CUA_NATIVE_ENGINE: 'cua', CUA_REPL_HOST: 'vendor'};
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
    check('the selection is comparison A\'s lane: the vendor host, cua\'s engine', launch.replHost.host === 'vendor' && launch.replHost.reason === 'explicit'
      && launch.nativeEngine?.engine === 'cua' && launch.nativeEngine.build === FIXTURE_ENGINE.build && launch.env.CUA_SKY_SERVICE === ENGINE_SERVICE);
    check('the launch names no vendor helper', launch.env.SKY_CUA_SERVICE_PATH === null);
    check('the vendor host answered', init.serverInfo?.name !== 'cua-repl-host');

    const reported = await cell('nodeRepl.write("\\n" + JSON.stringify(await nodeRepl.rpc("engineLaneReporter", {})))');
    const worker = reported.json;
    check('the reporter ran in the vendor trusted worker', !reported.error && worker !== null);
    check('nodeRepl.env carries CUA_ENGINE_APP: the approved bundle', worker?.env.CUA_ENGINE_APP === installed.bundlePath && worker.env.CUA_ENGINE_APP === launch.env.CUA_ENGINE_APP);
    check('nodeRepl.env carries CUA_ENGINE_SCREENSHOTS: the session\'s run directory', worker?.env.CUA_ENGINE_SCREENSHOTS === launch.env.CUA_ENGINE_SCREENSHOTS
      && launch.env.CUA_ENGINE_SCREENSHOTS === join(launch.cwd, 'screenshots') && launch.cwd.startsWith(join(realHome, 'run') + '/'));
    check('nodeRepl.env names cua\'s service and no vendor helper', worker?.env.CUA_SKY_SERVICE === ENGINE_SERVICE && worker.env.SKY_CUA_SERVICE_PATH === null);
    check('nodeRepl.nativePipe.createConnection is a function', worker?.nativePipe === 'function');
    check('nodeRepl.launchServices.openApplication is the relay\'s: it refuses an empty target', worker?.launchServices === 'function'
      && /exactly one of applicationPath or bundleIdentifier/.test(worker.openApplication ?? ''));
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
    check('the service\'s cua/nativeEngine reaches the client through the vendor host', attested?.engine === 'cua' && attested.version === FIXTURE_ENGINE.version
      && attested.build === FIXTURE_ENGINE.build && observed.meta['codex/toolSurface']?.kind === 'computerUse');
  } catch (error) {
    check('the lane ran to the end', false, error.code && /^[A-Z_]+$|^[a-z_]+$/.test(String(error.code)) ? String(error.code) : undefined);
  } finally {
    await client.close();
    await fake.stop();
  }
  const after = watched.map(pids);
  check('nothing was launched: no SkyComputerUseService or cua-engine appeared', watched.every((_, i) => started(before[i], after[i]) === 0));
  return {ok: checks.every(c => c.pass), checks};
}

async function main() {
  const {values} = parseArgs({options: {home: {type: 'string'}, 'user-home': {type: 'string'}, report: {type: 'string'}}});
  if (process.platform !== 'darwin' || !values.home || !values['user-home']) {
    process.stderr.write('probe-engine-lane: macOS only; pass --home <installed CUA_HOME> --user-home <new scratch dir> [--report <file>]\n');
    return 2;
  }
  const report = await probeEngineLane({home: resolve(values.home), userHome: resolve(values['user-home'])});
  if (values.report) writeFileSync(values.report, JSON.stringify(report, null, 2) + '\n');
  process.stderr.write(`probe-engine-lane: ${report.ok ? 'PASS' : 'FAIL'}\n`);
  return report.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
