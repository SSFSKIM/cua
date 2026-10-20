// cua's own engine service (src/services/engine/service.mjs) where it runs: in the trusted worker, under the worker's
// sandbox. In the default mode (no sandbox state) that sandbox reads everything and writes nothing (src/sandbox/
// policy.mjs policyTable), so an observation must not need the worker to write: the screenshot directory is the
// launcher's to name (CUA_ENGINE_SCREENSHOTS, under the session's run directory) and the engine's to create. The child
// runs the service under sandbox-exec with the worker's default-mode profile and an in-process stand-in for the engine
// client; no GUI app is observed and no engine runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {REPO, shortScratch} from './fixtures/runtime-fixture.mjs';
import {sandboxedLaunch} from '../src/sandbox/index.mjs';

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

// The child: the service behind a stand-in client that answers resolve_app and get_app_state as the engine would, and a
// worker nodeRepl that approves; it observes TextEdit, then tries one write of its own, which the sandbox must refuse.
const CHILD = `
import {writeFileSync} from 'node:fs';
const {createService} = await import(${JSON.stringify(pathToFileURL(join(REPO, 'src/services/engine/service.mjs')).href)});
const app = {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501};
const node = (token, depth, role, extra) => ({token, depth, role, ...extra});
let outputDirectory = null;
const client = {identity: {engineVersion: '0.1.0', build: 'b1'}, execute: async (method, args) => {
  if (method === 'resolve_app') return {result: app, engineMs: 1};
  outputDirectory = args.outputDirectory;
  return {engineMs: 2, result: {app: {...app, catalyst: false}, window: {title: 'Untitled', frame: {x: 0, y: 0, width: 600, height: 400}, pid: 501},
    lineage: 'L', revision: 1, nodes: [node('t0', 0, 'AXWindow', {roleDescription: 'standard window', title: 'Untitled', actions: []})], menuBar: [],
    truncated: null, screenshot: {url: 'file://' + args.outputDirectory + '/a.jpg', width: 600, height: 400, scale: 1}, focused: null, selectedText: null,
    selectedElements: [], timings: {totalMs: 1}}};
}};
const nodeRepl = {env: process.env, requestMeta: {}, setResponseMeta: () => {}, withSuspendedTimeout: fn => fn(),
  createElicitation: async () => ({action: 'accept', content: null, _meta: {persist: 'session'}})};
const service = createService({nodeRepl, client});
const out = {};
try {
  const state = await service.handleRpc({type: 'execute', method: 'get_app_state', args: [{app: 'TextEdit', disableDiff: true}]});
  out.observed = {app: state.app, screenshot: state.screenshot, outputDirectory};
} catch (error) { out.observed = {error: error.message}; }
try { writeFileSync(process.env.CUA_ENGINE_SCREENSHOTS + '.probe', 'x'); out.write = 'allowed'; } catch (error) { out.write = error.code; }
process.stdout.write(JSON.stringify(out));
`;

test('under the default sandbox state the worker writes nothing, and an observation still goes out naming the launcher\'s screenshot directory', {skip: (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) && 'needs macOS sandbox-exec'}, t => {
  const s = shortScratch('cua-esb-');
  t.after(s.cleanup);
  const run = join(s.dir, 'run', 'session'), tmp = join(run, 'tmp');
  mkdirSync(tmp, {recursive: true});
  const screenshots = join(run, 'screenshots');
  const env = {HOME: process.env.HOME, PATH: '/usr/bin:/bin', TMPDIR: tmp, CUA_ENGINE_SCREENSHOTS: screenshots};
  const {command, args, env: childEnv, cwd} = sandboxedLaunch({platform: 'darwin', state: undefined, role: 'worker',
    command: [process.execPath, '--input-type=module', '-e', CHILD], env, cwd: run, readPaths: []});
  assert.equal(command, SANDBOX_EXEC);
  const out = JSON.parse(execFileSync(command, args, {env: childEnv, cwd, encoding: 'utf8'}));
  assert.equal(out.write, 'EPERM', 'the default state\'s worker writes nothing, in the run directory too');
  assert.deepEqual(out.observed, {app: '/System/Applications/TextEdit.app', screenshot: {url: `file://${screenshots}/a.jpg`}, outputDirectory: screenshots});
  assert.equal(existsSync(screenshots), false, 'the worker created nothing; the engine creates the directory');
});
