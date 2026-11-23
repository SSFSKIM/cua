// cua's Linux service loads inside cua's own trusted worker (src/repl-host/trusted-worker.mjs), whose resolve hook
// refuses any import whose real path lies outside CUA_REPL_TRUSTED_CODE_PATHS. On Linux those are cua's own code roots
// only (src/runtime is not among them), so an import that reaches past them would pass every unit test here and fail
// every live computer session. This loads the service in a child Node with a copy of that hook and exactly the trusted
// paths a Linux computer launch names (#171 M6a, task 153: the service's remedy names this cua's installer without
// importing src/runtime).
import '../helpers/scratch-home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {buildLaunch, LINUX_ENGINE_SERVICE, SKY_SERVICE} from '../../src/runtime/launch.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {MIN_ENGINE_VERSION} from '../../src/services/engine/linux/client.mjs';
import {scratch} from '../fixtures/runtime-fixture.mjs';
import {fakeInstalledEngine, fakeModuleTree} from '../fixtures/own-linux-runtime.mjs';

// The own worker's rule (trusted-worker.mjs L44-79), over the module the launch names as CUA_SKY_SERVICE.
const WORKER = `
import {registerHooks} from 'node:module';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const roots = (process.env.CUA_REPL_TRUSTED_CODE_PATHS ?? '').split(path.delimiter).filter(entry => path.isAbsolute(entry))
  .flatMap(root => { try { return [realpathSync.native(root)]; } catch { return []; } });
const trusted = filename => roots.some(root => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
});
registerHooks({resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier, context);
  if (resolved.url.startsWith('file:')) {
    const filename = realpathSync.native(fileURLToPath(resolved.url));
    if (!trusted(filename)) throw new Error('Trusted RPC dependency must resolve within a configured trusted code path: ' + specifier);
    return {...resolved, url: pathToFileURL(filename).href};
  }
  return resolved;
}});
try {
  const service = await import(pathToFileURL(process.env.CUA_SKY_SERVICE).href);
  process.stdout.write(JSON.stringify({loaded: typeof service.createService}));
} catch (error) { process.stdout.write(JSON.stringify({loadError: error.message})); }
`;

const load = env => new Promise((resolve, reject) => execFile(process.execPath, ['--input-type=module', '-e', WORKER], {env, encoding: 'utf8'}, (error, stdout, stderr) => {
  if (error) return reject(new Error(`${error.message}\n${stderr}`));
  resolve(JSON.parse(stdout));
}));

function linuxLaunch(t) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const host = {platform: 'linux', arch: 'x64'};
  fakeModuleTree(home, host);
  fakeInstalledEngine(home, MIN_ENGINE_VERSION);
  const runtime = resolveRuntime({home, host});
  return buildLaunch({runtime, home, sessionId: '6f1c2d3e-0000-4000-8000-000000000153', ambient: {HOME: '/home/u', PATH: '/usr/bin'},
    services: {sky: SKY_SERVICE}, resolveOwnNode: () => process.execPath});
}

test('cua\'s Linux service and everything it imports load under exactly the trusted paths of a Linux computer launch', {skip: typeof registerHooks !== 'function'}, async t => {
  const {env} = linuxLaunch(t);
  assert.equal(env.CUA_SKY_SERVICE, LINUX_ENGINE_SERVICE);
  assert.deepEqual(await load(env), {loaded: 'function'});
});

test('the hook copy is effective: without src/services trusted, cua\'s Linux service cannot load', {skip: typeof registerHooks !== 'function'}, async t => {
  const {env} = linuxLaunch(t);
  const services = realpathSync(new URL('../../src/services', import.meta.url));
  const narrowed = env.CUA_REPL_TRUSTED_CODE_PATHS.split(':').filter(root => realpathSync(root) !== services).join(':');
  const {loadError} = await load({...env, CUA_REPL_TRUSTED_CODE_PATHS: narrowed});
  assert.match(loadError, /Trusted RPC dependency must resolve within a configured trusted code path/);
});
