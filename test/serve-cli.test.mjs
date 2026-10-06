// `cua serve` and the plugin's `cua-shim.mjs` end to end, as real processes, against a scratch CUA_HOME whose
// "installed" release runs a fake upstream in place of the vendor runtime. This proves the server consumes the actual
// resolver and launcher: allowlisted environment, owned per-connection working directory, and cleanup at close.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, symlinkSync, realpathSync, chmodSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {loadPins, selectPin} from '../src/runtime/manifest.mjs';
import {PassThrough} from 'node:stream';
import {once} from 'node:events';
import {REPO, scratch, shortScratch} from './fixtures/runtime-fixture.mjs';
import {serve} from '../src/mcp/server.mjs';
import {SKY_SERVICE, BROWSER_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {chromeFacts, OPENAI_EXTENSION_ID} from '../src/profiles/chrome.mjs';
import {LIVENESS_CELL} from '../src/profiles/inventory.mjs';
import {sandboxState} from '../src/runtime/sandbox.mjs';
import {CLASSIC_LEVEL_MODULES, NO_CLASSIC_LEVEL, writeStore} from './fixtures/classic-level.mjs';

const supported = process.platform === 'darwin' && process.arch === 'arm64';
const FAKE = join(REPO, 'test', 'fixtures', 'fake-upstream-process.mjs');
const SCOPED = sandboxState('scoped', '/');

// A home that looks like a verified install of the checked-in pin to the resolver (which checks structure only), but
// whose vendor node is this Node and whose cua-repl entry is the fake upstream. Signatures are never involved here.
// The served processes run with CUA_SHIM_SECRETS=off: the real Keychain helper (if built) is never started by this
// Node-only suite; the in-process test at the end wires a stand-in helper instead. The home lives under /tmp, outside
// $TMPDIR, as the scoped sandbox requires (a home under $TMPDIR is the misconfiguration `inTmpdir` sets up).
// `mode` selects the fake upstream's teardown behavior (fake-upstream-process.mjs); `helper` installs the stand-in
// Keychain helper as $CUA_HOME/bin/cua-keychain in that FAKE_HELPER_MODE, for runs with CUA_SHIM_SECRETS=on.
function fakeInstalledHome(t, {inTmpdir = false, mode, helper} = {}) {
  const s = inTmpdir ? scratch() : shortScratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const pin = selectPin(loadPins());
  const root = join(home, 'runtimes', pin.release);
  for (const [key, rel] of Object.entries(pin.layout)) {
    const path = join(root, rel);
    if (key === 'moduleDir' || key === 'skyServiceApp') { mkdirSync(path, {recursive: true}); continue; }
    mkdirSync(dirname(path), {recursive: true});
    if (key === 'node') symlinkSync(process.execPath, path);
    else if (key === 'cuaRepl') writeFileSync(path, mode
      ? `process.argv[2] = ${JSON.stringify(mode)};\nawait import(${JSON.stringify(pathToFileURL(FAKE).href)});\n`
      : `import ${JSON.stringify(pathToFileURL(FAKE).href)};\n`);
    else writeFileSync(path, '');
  }
  writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}}));
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: pin.release}));
  if (helper) {
    mkdirSync(join(home, 'bin'));
    const fake = join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs');
    writeFileSync(join(home, 'bin', 'cua-keychain'), `#!/bin/sh\nFAKE_HELPER_MODE=${helper} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`);
    chmodSync(join(home, 'bin', 'cua-keychain'), 0o755);
  }
  return home;
}

function launch(entry, home, args = [], extraEnv = {}) {
  const child = spawn(process.execPath, [entry, ...args], {
    env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off', AMBIENT_SECRET: 'must-not-reach-runtime', NODE_REPL_TRUSTED_SERVICES: '{"sky":"/evil.mjs"}', CUA_SHIM_CODEX_HOME: '/tmp/legacy', ...extraEnv},
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const frames = [];
  const waiters = [];
  createInterface({input: child.stdout}).on('line', line => {
    const msg = JSON.parse(line);
    frames.push(msg);
    for (const w of [...waiters]) if (w.id === msg.id) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const exit = new Promise(resolve => child.on('exit', (code, signal) => {
    // A request still waiting when the server exits fails now rather than at its timeout.
    setImmediate(() => { for (const w of waiters.splice(0)) w.reject(new Error(`server exited (${code ?? signal}); stderr: ${stderr}`)); });
    resolve({code, signal, stderr});
  }));
  let id = 0;
  const request = (method, params = {}) => {
    const n = ++id;
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id: n, method, params}) + '\n');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no response to ${method}; stderr: ${stderr}`)), 10_000);
      waiters.push({id: n, resolve: m => { clearTimeout(timer); resolve(m); }, reject: e => { clearTimeout(timer); reject(e); }});
    });
  };
  const call = (name, args = {}) => request('tools/call', {name, arguments: args});
  return {child, frames, exit, request, call};
}

const records = home => readFileSync(join(home, 'state', 'codex', 'fake-upstream.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('cua serve without an installed runtime fails classified, writing nothing to the MCP stream', {skip: !supported}, async t => {
  const s = scratch();
  t.after(s.cleanup);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), s.dir, ['serve']);
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /runtime_not_installed/);
  assert.deepEqual(server.frames, []);
});

test('cua serve runs the resolved runtime with an allowlisted environment in an owned directory and removes it at close', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.equal(init.result.serverInfo.name, 'fake-upstream');
  assert.match(init.result.instructions, /Host notes/);
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  const js = await server.call('js', {code: 'hello'});
  const echoed = JSON.parse(js.result.content[0].text);
  assert.equal(echoed.code, 'hello');
  const end = await server.call('end_task');
  assert.deepEqual(end.result.structuredContent, {status: 'ended', ended: true, taskId: echoed.turn.turn_id});

  const [{start}] = records(home);
  const sessionDir = start.cwd;
  assert.equal(dirname(sessionDir), join(home, 'run'));
  assert.equal(start.cwdMode, 0o700);
  assert.equal(start.env.CODEX_HOME, join(home, 'state', 'codex'));
  assert.equal(start.env.CUA_REPL_ENABLED_SURFACES, 'computer');
  assert.equal(start.env.AMBIENT_SECRET, undefined);
  assert.equal(start.env.CUA_SHIM_CODEX_HOME, undefined);
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE}, 'the trusted sky wrapper is registered, never an ambient override');
  assert.deepEqual(start.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').slice(1), [dirname(SKY_SERVICE), ...SERVICE_SUPPORT_DIRS]);
  assert.equal(start.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.deepEqual(Object.keys(start.env).filter(key => key.startsWith('CUA_SECRETS_')), ['CUA_SECRETS_UNAVAILABLE'], 'no broker when secrets are off');
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, 'secrets_disabled');
  const turnEnded = records(home).find(r => r.received?.params?.name === 'turn_ended').received;
  assert.equal(turnEnded.params.arguments.session_id, echoed.turn.session_id);
  const sent = records(home).filter(r => r.received?.method === 'tools/call').map(r => r.received.params);
  assert.deepEqual(sent.map(p => p.name), ['js', 'turn_ended']);
  for (const p of sent) assert.deepEqual(p._meta['codex/sandbox-state-meta'], {...SCOPED, sandboxCwd: pathToFileURL(sessionDir).href}, `${p.name} carries the default (scoped) sandbox state`);
  assert.equal(turnEnded.params.arguments.turn_id, echoed.turn.turn_id);
  assert.equal(dirname(sessionDir).endsWith('run'), true);
  assert.equal(sessionDir.endsWith(echoed.turn.session_id), true, 'the run directory is named by the connection session');

  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 0, stderr);
  assert.equal(existsSync(sessionDir), false);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('with CUA_SHIM_SURFACES=computer,browser, serve registers both wrappers, configures the vendor browser service and answers profiles_list from the registry', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const chromeDir = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  mkdirSync(chromeDir, {recursive: true});
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}, school: {chromeProfileDirectory: 'Profile 6'}}}));
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'computer,browser', HOME: userHome, BROWSER_USE_BACKEND_PATHS: '/tmp/evil.sock'});
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.match(init.result.instructions, /cua\.getBrowser\(\{extensionInstanceId\}\)/);
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list']);
  const profiles = await server.call('profiles_list');
  assert.deepEqual(profiles.result.structuredContent, {status: 'ok', profiles: [
    {key: 'personal', ready: false, reason: 'extension_not_installed'},
    {key: 'school', ready: false, reason: 'profile_directory_missing'},
  ]});
  await server.call('js', {code: 'hello'});
  const [{start}] = records(home);
  assert.equal(start.env.CUA_REPL_ENABLED_SURFACES, 'computer,browser');
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE, browser: BROWSER_SERVICE});
  assert.match(start.env.CUA_BROWSER_VENDOR_SERVICE, /@oai\/browser-desktop\/scripts\/browser-service\.mjs$/);
  assert.equal(start.env.BROWSER_USE_AVAILABLE_BACKENDS, 'chrome');
  assert.equal(start.env.BROWSER_USE_BACKEND_PATHS, undefined, 'an ambient backend list never reaches the runtime');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
});

test('profiles_list and cua profiles list check a bound profile against the live backends, one tab-free listing launch per request', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const extension = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  const backendsFile = join(home, 'state', 'codex', 'fake-backends.json');
  mkdirSync(dirname(backendsFile), {recursive: true});
  const listingOf = (...ids) => JSON.stringify({backends: ids.map(instanceId => ({instanceId, family: 'chrome', profileName: null, tabCount: null}))});

  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'browser', HOME: userHome});
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const seen = {};
  for (const [state, listing] of [['live', listingOf('other', 'inst-a')], ['stale', listingOf('inst-new')], ['none live', listingOf()], ['listing failed', null]]) {
    if (listing === null) rmSync(backendsFile); else writeFileSync(backendsFile, listing);
    const reply = await server.call('profiles_list');
    seen[state] = reply.result.structuredContent.profiles[0];
    if (state === 'stale') assert.match(reply.result.content[0].text, /cua profiles bind personal/);
    if (state === 'none live') assert.match(reply.result.content[0].text, /Chrome profile "Default".*extension's icon/);
  }
  assert.deepEqual(seen, {
    live: {key: 'personal', ready: true, extensionInstanceId: 'inst-a'},
    stale: {key: 'personal', ready: false, reason: 'binding_stale'},
    'none live': {key: 'personal', ready: false, reason: 'host_not_live'},
    'listing failed': {key: 'personal', ready: false, reason: 'backends_unlistable'},
  });
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 0, stderr);
  assert.match(stderr, /profiles_list: the live Chrome extension backends could not be listed \(listing_failed\)/);
  const cells = records(home).filter(r => r.received?.method === 'tools/call').map(r => r.received.params.arguments);
  assert.equal(cells.length, 4, 'one listing cell per request, nothing on the serving runtime');
  assert.ok(cells.every(c => c.code === LIVENESS_CELL), 'each listing is the tab-free cell');
  // Each listing launch sends the default (scoped) sandbox state for its own working directory.
  let launchCwd;
  for (const r of records(home)) {
    if (r.start) launchCwd = r.start.cwd;
    if (r.received?.method === 'tools/call') assert.deepEqual(r.received.params._meta['codex/sandbox-state-meta'], {...SCOPED, sandboxCwd: pathToFileURL(launchCwd).href});
  }
  const starts = records(home).filter(r => r.start).map(r => r.start.env);
  assert.equal(starts.length, 5, 'the serving runtime and one bounded launch per profiles_list');
  assert.ok(starts.slice(1).every(env => env.CUA_REPL_ENABLED_SURFACES === 'browser'));
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'every listing removed its working directory');

  writeFileSync(backendsFile, listingOf('inst-new'));
  const list = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list'], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /^personal\s+not ready\s+Default\s+its bound extension instance is not among the live backends.*cua profiles bind personal.*$/m);
  writeFileSync(backendsFile, listingOf());
  const asleep = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list'], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  assert.match(asleep.stdout, /^personal\s+not ready\s+Default\s+no live OpenAI extension backend serves it.*Chrome profile "Default"/m, 'the CLI says what profiles_list says');
  writeFileSync(backendsFile, listingOf('inst-a'));
  const json = JSON.parse(spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list', '--json'], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000}).stdout);
  assert.deepEqual(json.profiles.map(p => [p.key, p.ready, p.extensionInstanceId]), [['personal', true, 'inst-a']]);
});

// Issue #21: the vendor's label beside each candidate, "unlabelled" without one; an ambiguous name binds nothing, a
// unique one binds automatically and marks the backend that decided it.
test('cua profiles bind shows each candidate\'s label, binds a unique name automatically and nothing ambiguous', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const userData = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome');
  const extension = join(userData, 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  mkdirSync(join(userData, 'Profile 8'), {recursive: true});
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: {Default: {name: 'Personal'}, 'Profile 8': {name: 'Work'}}}}));
  const registry = JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default'}}});
  writeFileSync(join(home, 'profiles.json'), registry);
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  const live = backends => writeFileSync(join(home, 'state', 'codex', 'fake-backends.json'), JSON.stringify({backends: [
    {instanceId: 'inst-a', family: 'chrome', profileName: 'Work\u009b2J\u202e', tabCount: 2},
    {instanceId: 'inst-b', family: 'chrome', profileName: 'Personal', tabCount: 5},
    {instanceId: 'inst-c', family: 'chrome', profileName: null, tabCount: null},
    ...backends,
    {family: 'edge'},
  ]}));
  const cua = args => spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'bind', 'personal', ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  const rowsOf = stdout => stdout.split('\n').filter(line => /^\s+\d\) extension instance/.test(line));

  live([{instanceId: 'inst-d', family: 'chrome', profileName: 'Personal', tabCount: 1}]);
  const text = cua([]);
  assert.equal(text.status, 1, text.stderr);
  const rows = rowsOf(text.stdout);
  assert.equal(rows.length, 4, text.stdout);
  assert.match(rows[0], /inst-a\s+2 tab\(s\)\s+profile directory unknown\s+labelled "Work\\u009b2J\\u202e" \(another profile's name\)$/, 'a C1 control or bidi override in a label is printed escaped');
  assert.ok(!/[\u0080-\u009f\u202e]/.test(text.stdout + text.stderr), 'no raw control reaches the terminal');
  assert.match(rows[1], /inst-b\s+5 tab\(s\)\s+profile directory unknown\s+labelled "Personal" \(this profile's name\)$/);
  assert.match(rows[2], /inst-c\s+\? tab\(s\)\s+profile directory unknown\s+unlabelled$/);
  assert.match(rows[3], /inst-d\s+1 tab\(s\)\s+profile directory unknown\s+labelled "Personal" \(this profile's name\)$/);
  assert.match(text.stdout, /personal was not bound: several live backends carry this profile's name/);
  assert.match(text.stdout, /cua profiles bind personal --extension-instance-id <id>/);
  assert.match(text.stdout, /1 extension backend\(s\) of a browser other than Google Chrome not listed/);
  const json = cua(['--json']);
  assert.equal(json.status, 1, json.stderr);
  const ambiguous = JSON.parse(json.stdout);
  assert.deepEqual({outcome: ambiguous.outcome, reason: ambiguous.reason, labels: ambiguous.backends.map(b => [b.instanceId, b.profileName, b.label, b.likelyMatch])}, {
    outcome: 'pick_required', reason: 'several_matching_backends', labels: [
      ['inst-a', 'Work\u009b2J\u202e', 'other-profile', undefined], ['inst-b', 'Personal', 'this-profile', undefined],
      ['inst-c', null, 'unlabelled', undefined], ['inst-d', 'Personal', 'this-profile', undefined]]});
  assert.equal(readFileSync(join(home, 'profiles.json'), 'utf8'), registry, 'an ambiguous name wrote nothing');

  live([]);
  const automatic = cua([]);
  assert.equal(automatic.status, 0, automatic.stderr);
  assert.match(automatic.stdout, /bound personal to extension instance inst-b \(the runtime labelled exactly one live backend with this profile's unique name\)/);
  assert.match(rowsOf(automatic.stdout)[1], /inst-b\s+5 tab\(s\)\s+profile directory unknown\s+labelled "Personal" \(this profile's name\)\s+<- likely match$/, 'the listing shows which label decided it');
  assert.equal(JSON.parse(readFileSync(join(home, 'profiles.json'), 'utf8')).profiles.personal.extensionInstanceId, 'inst-b');
  const again = JSON.parse(cua(['--json']).stdout);
  assert.deepEqual({how: again.how, id: again.extensionInstanceId, marked: again.backends.filter(b => b.likelyMatch).map(b => b.instanceId)}, {how: 'automatic', id: 'inst-b', marked: ['inst-b']});

  const picked = cua(['--extension-instance-id', 'inst-c']);
  assert.equal(picked.status, 0, picked.stderr);
  assert.match(picked.stdout, /bound personal to extension instance inst-c \(your explicit pick\)/);
});

// Issue #21 step 2: cua's own directory mapping beside each candidate, with the installed release's classic-level (the
// fake release links a real one in) reading copies of fixture extension stores; colliding names bind by directory.
test('cua profiles bind shows each candidate\'s profile directory, binds by directory where names collide, and --dry-run records nothing', {skip: !supported || NO_CLASSIC_LEVEL}, async t => {
  const home = fakeInstalledHome(t);
  const pin = selectPin(loadPins());
  symlinkSync(join(CLASSIC_LEVEL_MODULES, 'classic-level'), join(home, 'runtimes', pin.release, pin.layout.moduleDir, 'classic-level'));
  const userHome = join(home, 'user');
  const userData = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome');
  for (const [dir, id] of [['Default', 'inst-a'], ['Profile 12', 'inst-b']]) {
    const extension = join(userData, dir, 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
    mkdirSync(extension, {recursive: true});
    writeFileSync(join(extension, 'manifest.json'), '{}');
    mkdirSync(join(userData, dir, 'Local Extension Settings'), {recursive: true});
    const db = await writeStore(join(userData, dir, 'Local Extension Settings', OPENAI_EXTENSION_ID), id, {keepOpen: true});
    t.after(() => db.close());
  }
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: {Default: {name: '직장'}, 'Profile 12': {name: '직장'}}}}));
  const registry = JSON.stringify({version: 1, profiles: {school: {chromeProfileDirectory: 'Profile 12'}}});
  writeFileSync(join(home, 'profiles.json'), registry);
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  writeFileSync(join(home, 'state', 'codex', 'fake-backends.json'), JSON.stringify({backends: [
    {instanceId: 'inst-a', family: 'chrome', profileName: '직장', tabCount: 3}, {instanceId: 'inst-b', family: 'chrome', profileName: '직장', tabCount: 1},
    {instanceId: 'inst-c', family: 'chrome', profileName: null, tabCount: 0}]}));
  const cua = args => spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'bind', 'school', ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  const rowsOf = stdout => stdout.split('\n').filter(line => /^\s+\d\) extension instance/.test(line));

  const dry = cua(['--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would bind school to extension instance inst-b \(this profile directory's extension store records exactly this live backend\); dry run, nothing was recorded/);
  const rows = rowsOf(dry.stdout);
  assert.match(rows[0], /inst-a\s+3 tab\(s\)\s+Chrome profile "Default" "직장" \(another profile's directory\)\s+labelled "직장"/);
  assert.match(rows[1], /inst-b\s+1 tab\(s\)\s+Chrome profile "Profile 12" "직장" \(this profile's directory\)\s+labelled "직장" .*<- likely match$/);
  assert.match(rows[2], /inst-c\s+0 tab\(s\)\s+profile directory unknown\s+unlabelled$/);
  assert.equal(readFileSync(join(home, 'profiles.json'), 'utf8'), registry, 'the dry run wrote nothing');
  assert.deepEqual(readdirSync(join(home, 'staging')), [], 'no store copy left behind');

  const json = JSON.parse(cua(['--json']).stdout);
  assert.deepEqual({ok: json.ok, by: json.by, id: json.extensionInstanceId, map: json.directoryMap, placed: json.backends.map(b => b.chromeProfile?.directory ?? null)},
    {ok: true, by: 'directory', id: 'inst-b', map: {status: 'complete'}, placed: ['Default', 'Profile 12', null]});
  assert.equal(JSON.parse(readFileSync(join(home, 'profiles.json'), 'utf8')).profiles.school.extensionInstanceId, 'inst-b');

  if (process.getuid?.() === 0) return;
  chmodSync(join(userData, 'Local State'), 0o000);
  let denied;
  try { denied = cua(['--dry-run']); } finally { chmodSync(join(userData, 'Local State'), 0o644); }
  assert.equal(denied.status, 1, 'unplaced and with names unknown: the pick is the user\'s');
  assert.match(denied.stderr, /note: this process cannot read Chrome's Local State \(EACCES\): backend labels cannot be compared with this profile's name and the candidates' profile directories are unknown; grant Full Disk Access/);
  assert.equal(denied.stderr.match(/Local State/g).length, 1, 'one refused read, one note');
  assert.equal(rowsOf(denied.stdout).filter(row => /profile directory unknown/.test(row)).length, 3);
});

// `cua` with its listing launches' teardown reported unconfirmed (test/fixtures/unconfirmed-teardown-hooks.mjs).
const UNCONFIRMED_TEARDOWN = `--import=data:text/javascript,${encodeURIComponent(`import {register} from 'node:module'; register(${JSON.stringify(pathToFileURL(join(REPO, 'test', 'fixtures', 'unconfirmed-teardown-hooks.mjs')).href)});`)}`;

test('cua profiles list still shows the profiles but fails when its listing runtime was not confirmed stopped; an empty listing does not fail', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const extension = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  const bound = {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'};
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: bound}}));
  mkdirSync(join(home, 'state', 'codex'), {recursive: true});
  writeFileSync(join(home, 'state', 'codex', 'fake-backends.json'), JSON.stringify({backends: [{instanceId: 'inst-a', family: 'chrome', profileName: null, tabCount: null}]}));
  const cua = (args, node = []) => spawnSync(process.execPath, [...node, join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list', ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  const unlistable = {key: 'personal', ...bound, ready: false, reason: 'backends_unlistable'};

  const json = cua(['--json'], [UNCONFIRMED_TEARDOWN]);
  assert.equal(json.status, 1, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {ok: false, profiles: [unlistable], listingError: 'runtime_teardown_unconfirmed'});
  const human = cua([], [UNCONFIRMED_TEARDOWN]);
  assert.equal(human.status, 1, human.stderr);
  assert.match(human.stdout, /^personal\s+not ready\s+Default\s+the live OpenAI extension backends could not be listed/m);
  assert.match(human.stderr, /could not be listed \(runtime_teardown_unconfirmed: .*owned processes may remain/);

  writeFileSync(join(home, 'state', 'codex', 'fake-backends.json'), JSON.stringify({backends: []}));
  const empty = cua(['--json']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(JSON.parse(empty.stdout), {ok: true, profiles: [{...unlistable, reason: 'host_not_live'}]}, 'an empty listing is evidence: no host is live');
  assert.equal(cua([]).status, 0);
  assert.deepEqual(readdirSync(join(home, 'run')), [], 'every listing removed its working directory');
});

test('with CUA_SHIM_SANDBOX=default serve sends no sandbox state; an invalid value fails classified before anything is launched', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SANDBOX: 'default'});
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  await server.call('js', {code: 'hello'});
  await server.call('js_reset');
  await server.call('end_task');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
  const sent = records(home).filter(r => r.received?.method === 'tools/call').map(r => r.received.params);
  assert.deepEqual(sent.map(p => p.name), ['js', 'js_reset', 'turn_ended']);
  for (const p of sent) assert.equal('codex/sandbox-state-meta' in p._meta, false, p.name);

  const other = fakeInstalledHome(t);
  const invalid = launch(join(REPO, 'bin', 'cua.mjs'), other, ['serve'], {CUA_SHIM_SANDBOX: 'managed'});
  invalid.child.stdin.end();
  const {code, stderr} = await invalid.exit;
  assert.equal(code, 1);
  assert.match(stderr, /CUA_SHIM_SANDBOX must be scoped, disabled or default \[invalid_setting\]/);
  assert.equal(existsSync(join(other, 'state', 'codex', 'fake-upstream.jsonl')), false);
});

// Issue #36: under the scoped default a CUA_HOME below $TMPDIR puts the runtime's trusted modules inside a write root,
// and node_repl would refuse every kernel. serve and the listing launch refuse first, naming the conflict; disabled
// has no write roots to conflict with.
test('under the scoped default a CUA_HOME below $TMPDIR fails serve and the listing classified, naming the conflict; disabled serves it', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {inTmpdir: true});
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /CUA_SHIM_SANDBOX=scoped lets JavaScript cells write \$TMPDIR \(.*\), which contains the trusted code path .*runtimes.*\[sandbox_conflict\]/);
  assert.match(stderr, /outside \$TMPDIR.*CUA_SHIM_SANDBOX=disabled/);
  assert.deepEqual(server.frames, []);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'nothing was launched');
  assert.deepEqual(readdirSync(join(home, 'run')), []);

  const userHome = join(home, 'user');
  const extension = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  const list = args => spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'profiles', 'list', ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome}, encoding: 'utf8', timeout: 30_000});
  const json = list(['--json']);
  assert.equal(JSON.parse(json.stdout).listingError, 'sandbox_conflict', json.stderr);
  assert.match(list([]).stderr, /sandbox_conflict: CUA_SHIM_SANDBOX=scoped lets JavaScript cells write \$TMPDIR/);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no listing launch was made');

  const disabled = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SANDBOX: 'disabled'});
  await disabled.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  await disabled.call('js', {code: 'hello'});
  disabled.child.stdin.end();
  assert.equal((await disabled.exit).code, 0);
  const [js] = records(home).filter(r => r.received?.method === 'tools/call').map(r => r.received.params);
  assert.deepEqual(js._meta['codex/sandbox-state-meta'].permissionProfile, {type: 'disabled'});
});

test('cua profiles list and bind reject an invalid CUA_SHIM_SANDBOX classified, before any listing launch', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const userHome = join(home, 'user');
  const extension = join(userHome, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  for (const args of [['profiles', 'list', '--json'], ['profiles', 'list'], ['profiles', 'bind', 'personal', '--json']]) {
    const run = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), ...args], {env: {...process.env, CUA_HOME: home, HOME: userHome, CUA_SHIM_SANDBOX: 'managed'}, encoding: 'utf8', timeout: 30_000});
    assert.notEqual(run.status, 0, args.join(' '));
    assert.match(run.stdout + run.stderr, /CUA_SHIM_SANDBOX must be scoped, disabled or default/, args.join(' '));
    assert.match(run.stdout + run.stderr, /invalid_setting/, args.join(' '));
  }
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false, 'no listing launch was made');
});

test('an invalid CUA_SHIM_SURFACES fails classified before anything is launched', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SURFACES: 'iab'});
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 1);
  assert.match(stderr, /CUA_SHIM_SURFACES must be computer, browser or computer,browser \[invalid_setting\]/);
  assert.equal(existsSync(join(home, 'state', 'codex', 'fake-upstream.jsonl')), false);
});

test('each connection gets its own random session ID', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const sessions = [];
  for (let i = 0; i < 2; i++) {
    const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
    await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
    const js = await server.call('js', {code: 'id'});
    sessions.push(JSON.parse(js.result.content[0].text).turn.session_id);
    server.child.stdin.end();
    assert.equal((await server.exit).code, 0);
  }
  assert.notEqual(sessions[0], sessions[1]);
});

test('a connection\'s own session approval file is removed at close; other sessions\' files are left alone', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const sessions = join(home, 'state', 'codex', 'computer-use', 'sessions');
  mkdirSync(sessions, {recursive: true});
  const other = join(sessions, '00000000-0000-4000-8000-000000000000.toml');
  writeFileSync(other, '[apps]\nallowed = []\n');
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const js = await server.call('js', {code: 'approve'});
  const own = join(sessions, `${JSON.parse(js.result.content[0].text).turn.session_id}.toml`);
  assert.equal(existsSync(own), true, 'the runtime wrote the connection\'s approvals');
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
  assert.equal(existsSync(own), false);
  assert.equal(existsSync(other), true);
});

test('the plugin entry cua-shim.mjs is the same server', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'cua-shim.mjs'), home);
  const init = await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.equal(init.result.serverInfo.name, 'fake-upstream');
  const list = await server.request('tools/list');
  assert.deepEqual(list.result.tools.map(tool => tool.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  server.child.stdin.end();
  assert.equal((await server.exit).code, 0);
});

test('an upstream exit fails the pending call, cleans up and exits nonzero', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const js = await server.call('js', {code: 'exit'});
  assert.equal(js.result.isError, true);
  assert.equal(js.result.structuredContent.code, 'connection_failed');
  const {code} = await server.exit;
  assert.equal(code, 1);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('SIGTERM closes the connection and its runtime', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  const [{start}] = records(home);
  server.child.kill('SIGTERM');
  const {code} = await server.exit;
  assert.equal(code, 0);
  assert.throws(() => process.kill(start.pid, 0), {code: 'ESRCH'});
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('close is bounded even when the host stops reading the MCP stream', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const child = spawn(process.execPath, [join(REPO, 'bin', 'cua.mjs'), 'serve'], {env: {...process.env, CUA_HOME: home, CUA_SHIM_SECRETS: 'off'}, stdio: ['pipe', 'pipe', 'ignore']});
  child.stdout.pause(); // a host that never reads: the server's 8 MiB reply cannot drain
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({code, signal})));
  for (const msg of [
    {jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}},
    {jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'js', arguments: {code: 'big'}}},
  ]) child.stdin.write(JSON.stringify(msg) + '\n');
  await new Promise(r => setTimeout(r, 1000));
  child.stdin.end();
  const started = Date.now();
  const exit = await Promise.race([exited, new Promise(r => setTimeout(() => r(null), 15_000))]);
  if (!exit) child.kill('SIGKILL');
  assert.ok(exit, 'cua serve did not exit while its output was blocked');
  assert.ok(Date.now() - started < 12_000);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('serve starts the connection\'s broker before the runtime, hands only the runtime its endpoint and token, lists through it and stops it at close', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const record = join(home, 'helper-record.json');
  const keychainHelper = {
    built: true, command: process.execPath, args: [join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs'), 'broker'],
    env: {FAKE_HELPER_MODE: 'serve', FAKE_HELPER_SECRETS: JSON.stringify({'work-password': 'pw-sentinel-9q'}), FAKE_HELPER_RECORD: record},
  };
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const diagnostics = [];
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, keychainHelper, diagnostics: line => diagnostics.push(line)});
  t.after(async () => { input.end(); await served; });  // a failed assertion must not leave the server (and the suite) running
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  await reply(1);
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  const list = await reply(2);
  assert.deepEqual(list.result.structuredContent, {status: 'ok', labels: ['work-password']});

  const {config, argv} = JSON.parse(readFileSync(record, 'utf8'));
  assert.deepEqual(argv, ['broker']);
  const [{start}] = records(home);
  assert.equal(start.env.CUA_SECRETS_BROKER_ENDPOINT, config.socket);
  assert.equal(start.env.CUA_SECRETS_BROKER_TOKEN, config.token);
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, undefined);
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE});
  assert.equal(config.socket, join(home, 'run', `${start.cwd.split('/').pop()}.sock`));
  assert.equal(start.argv.includes(config.token), false);
  assert.equal(existsSync(config.socket), true);
  assert.equal(JSON.stringify(frames).includes(config.token), false, 'the token never reaches the MCP stream');
  assert.equal(JSON.stringify(frames).includes('pw-sentinel-9q'), false);

  input.end();
  assert.equal(await served, 0, diagnostics.join('\n'));
  assert.equal(existsSync(config.socket), false);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

test('serve runs the Keychain helper installed in $CUA_HOME/bin when none is passed, as a copy of cua without a build does', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  mkdirSync(join(home, 'bin'));
  const installed = join(home, 'bin', 'cua-keychain');
  const fake = join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs');
  writeFileSync(installed, `#!/bin/sh\nFAKE_HELPER_SECRETS='{"from-cua-home":"x"}' exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`);
  chmodSync(installed, 0o755);
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, diagnostics: () => {}});
  t.after(async () => { input.end(); await served; });
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  for (let i = 0; i < 400 && !frames.some(f => f.id === 2); i++) await new Promise(r => setTimeout(r, 25));
  assert.deepEqual(frames.find(f => f.id === 2).result.structuredContent, {status: 'ok', labels: ['from-cua-home']});
  input.end();
  assert.equal(await served, 0);
});

test('serve without a built helper still serves, and secrets_list says how to build it', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const input = new PassThrough();
  const output = new PassThrough();
  const frames = [];
  createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'on'}, input, output, keychainHelper: {built: false, path: '/nowhere/cua-keychain'}, diagnostics: () => {}});
  t.after(async () => { input.end(); await served; });
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}}) + '\n');
  input.write(JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'secrets_list', arguments: {}}}) + '\n');
  for (let i = 0; i < 400 && frames.length < 2; i++) await new Promise(r => setTimeout(r, 25));
  const list = frames.find(f => f.id === 2);
  assert.deepEqual(list.result.structuredContent, {status: 'unavailable', code: 'helper_not_built'});
  assert.match(list.result.content[0].text, /npm run build:helper/);
  const [{start}] = records(home);
  assert.deepEqual(Object.keys(start.env).filter(key => key.startsWith('CUA_SECRETS_')), ['CUA_SECRETS_UNAVAILABLE']);
  assert.equal(start.env.CUA_SECRETS_UNAVAILABLE, 'helper_not_built', 'a secret reference fails with this reason');
  assert.deepEqual(JSON.parse(start.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE});
  input.end();
  assert.equal(await served, 0);
});

// In process: a fake installed home with a bound personal profile whose Default extension manifest exists (a scratch
// Chrome user-data directory), served with the browser surface and an injected readiness listing. The input never
// destroys itself, so its 'close' marks the server's own close, right after its final flush. `highWaterMark` sizes the
// MCP stream's buffers: at 1, once the client pauses `lines`, every later write stays pending, as on a full pipe.
function boundBrowserServe(t, listBackends, {highWaterMark} = {}) {
  const home = fakeInstalledHome(t);
  const userData = join(home, 'user', 'Library', 'Application Support', 'Google', 'Chrome');
  const extension = join(userData, 'Default', 'Extensions', OPENAI_EXTENSION_ID, '1.0_0');
  mkdirSync(extension, {recursive: true});
  writeFileSync(join(extension, 'manifest.json'), '{}');
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {personal: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'}}}));
  const input = new PassThrough({autoDestroy: false});
  const output = new PassThrough(highWaterMark === undefined ? {} : {highWaterMark});
  const frames = [];
  const lines = createInterface({input: output}).on('line', line => frames.push(JSON.parse(line)));
  const diagnostics = [];
  const served = serve({home, env: {...process.env, CUA_SHIM_SECRETS: 'off', CUA_SHIM_SURFACES: 'browser'}, input, output,
    chrome: chromeFacts({userData}), listBackends, diagnostics: line => diagnostics.push(line)});
  t.after(async () => { input.end(); await served; });
  const send = msg => input.write(JSON.stringify({jsonrpc: '2.0', ...msg}) + '\n');
  const reply = async id => { for (let i = 0; i < 400; i++) { const f = frames.find(m => m.id === id); if (f) return f; await new Promise(r => setTimeout(r, 25)); } throw new Error(`no reply ${id}`); };
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}}});
  return {input, output, lines, send, reply, served, diagnostics};
}

test('a readiness listing whose runtime teardown is unconfirmed makes profiles_list unlistable and serve exit 1', {skip: !supported}, async t => {
  const unconfirmed = async () => ({backends: [{instanceId: 'inst-a', family: 'chrome'}], teardown: {confirmed: false, steps: ['eof', 'sigterm', 'sigkill'], reason: 'a group member survived'}});
  const {input, send, reply, served, diagnostics} = boundBrowserServe(t, unconfirmed);
  await reply(1);
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'ok', profiles: [{key: 'personal', ready: false, reason: 'backends_unlistable'}]});
  input.end();
  assert.equal(await served, 1);
  assert.ok(diagnostics.some(l => /readiness listing's runtime could not be confirmed stopped; owned processes may remain/.test(l)), diagnostics.join('\n'));
});

test('serve waits for a readiness listing still running at close, keeping its signal handlers until it settles', {skip: !supported}, async t => {
  let started;
  const begun = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const baseline = new Set(process.listeners('SIGTERM'));
  const {input, send, reply, served} = boundBrowserServe(t, async () => { started(); await held; return {backends: [{instanceId: 'inst-a', family: 'chrome'}], teardown: {confirmed: true, steps: ['eof']}}; });
  await reply(1);
  const own = process.listeners('SIGTERM').filter(h => !baseline.has(h));
  assert.equal(own.length, 1, 'serve installed its SIGTERM handler');
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  await begun;
  input.end();
  let settled = false;
  served.then(() => { settled = true; });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(settled, false, 'serve does not return while the listing runs');
  assert.ok(process.listeners('SIGTERM').includes(own[0]), 'serve\'s SIGTERM handler is still installed while it waits');
  release();
  assert.deepEqual((await reply(2)).result.structuredContent, {status: 'ok', profiles: [{key: 'personal', ready: true, extensionInstanceId: 'inst-a'}]}, 'a reading client still gets the reply');
  assert.equal(await served, 0);
  assert.ok(!process.listeners('SIGTERM').includes(own[0]), 'the handler goes once the listing settled');
});

test('a readiness listing that settles during close is answered before the final bounded flush, which drops the reply with the stream when the client stopped reading', {skip: !supported}, async t => {
  let started;
  const begun = new Promise(resolve => { started = resolve; });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const {input, output, lines, send, reply, served, diagnostics} = boundBrowserServe(t, async () => { started(); await held; return {backends: [{instanceId: 'inst-a'}], teardown: {confirmed: true, steps: ['eof']}}; }, {highWaterMark: 1});
  await reply(1);
  lines.pause(); // the client stops reading
  send({id: 2, method: 'tools/call', params: {name: 'profiles_list', arguments: {}}});
  await begun;
  input.end();
  // The listing settles once the server has finished closing, or after 1 s while the server waits for it. A reply
  // written after the final flush would stay pending on the unread stream with nothing left to drop it.
  await Promise.race([once(input, 'close'), new Promise(r => setTimeout(r, 1000))]);
  const releasedAt = Date.now();
  release();
  assert.equal(await served, 0);
  assert.ok(Date.now() - releasedAt < 3000, 'serve returns within the 1 s flush bound once the listing settled');
  assert.ok(output.destroyed, 'the unread reply went with the stream at the flush bound instead of staying pending');
  assert.ok(diagnostics.some(l => /did not read the final replies within 1 s/.test(l)), diagnostics.join('\n'));
});

// Issue #29: a connection's run entries ($CUA_HOME/run/<session>/, its broker socket and its owner record) go on every
// exit path serve controls, and what a killed server left is swept at the next start.
const waitFor = async (predicate, ms = 15_000) => {
  for (const until = Date.now() + ms; Date.now() < until; await new Promise(r => setTimeout(r, 25))) if (predicate()) return true;
  return false;
};

test('serve start sweeps the run entries of connections whose process is gone, says so, and leaves live and unrecorded ones', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t);
  const run = join(home, 'run');
  const [stale, live, unrecorded] = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c'];
  for (const id of [stale, live, unrecorded]) mkdirSync(join(run, id), {recursive: true});
  const gone = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout.toString();
  writeFileSync(join(run, `${stale}.pid`), `${gone}\n`);
  writeFileSync(join(run, `${live}.pid`), `${process.pid}\n`);
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve']);
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  assert.deepEqual(readdirSync(run).filter(n => ![live, `${live}.pid`, unrecorded].includes(n)).length, 2, 'only the connection\'s own directory and record were added');
  server.child.stdin.end();
  const {code, stderr} = await server.exit;
  assert.equal(code, 0, stderr);
  assert.match(stderr, new RegExp(`removed the leftovers of 1 connection whose cua process is gone \\(${stale}, pid ${gone}\\)`));
  assert.match(stderr, new RegExp(`left alone 1 entry with no owner record \\(${unrecorded}\\)`));
  assert.deepEqual(readdirSync(run).sort(), [live, `${live}.pid`, unrecorded]);
});

for (const signal of ['SIGINT', 'SIGHUP']) {
  test(`${signal} closes a secrets-on connection like SIGTERM, removing its run entries and broker socket`, {skip: !supported}, async t => {
    const home = fakeInstalledHome(t, {helper: 'serve'});
    const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SECRETS: 'on'});
    await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
    await server.call('js', {code: 'task'});
    assert.equal(readdirSync(join(home, 'run')).filter(n => n.endsWith('.sock')).length, 1, 'the broker is serving');
    server.child.kill(signal);
    const {code, stderr} = await server.exit;
    assert.equal(code, 0, stderr);
    assert.deepEqual(readdirSync(join(home, 'run')), []);
  });
}

test('a signal that arrives while the connection is still starting closes it once it exists, leaving no run entries', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {helper: 'silent'});  // the broker never becomes ready: serve waits out its 3 s start
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SECRETS: 'on'});
  assert.ok(await waitFor(() => existsSync(join(home, 'run')) && readdirSync(join(home, 'run')).some(n => n.endsWith('.pid'))), 'serve claimed its session');
  server.child.kill('SIGTERM');
  const {code, signal, stderr} = await server.exit;
  assert.equal(signal, null, 'the signal was handled, not fatal');
  assert.equal(code, 0, stderr);
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});

// A client killed outright closes every pipe it held. Here the runtime needs SIGKILL, so the teardown writes diagnostics
// to a stderr nobody reads any more: that must neither crash the server nor cut its cleanup short.
test('a client that closes all its pipes mid-task gets an orderly close: exit 0, runtime gone, no run entries', {skip: !supported}, async t => {
  const home = fakeInstalledHome(t, {mode: 'ignore-term', helper: 'serve'});
  const server = launch(join(REPO, 'bin', 'cua.mjs'), home, ['serve'], {CUA_SHIM_SECRETS: 'on'});
  await server.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'e2e', version: '0'}});
  await server.call('js', {code: 'task'});
  const [{start}] = records(home);
  assert.equal(readdirSync(join(home, 'run')).length, 3, 'directory, broker socket and owner record while the task is open');
  server.child.stdout.destroy();
  server.child.stderr.destroy();
  server.child.stdin.end();
  const {code, signal} = await server.exit;
  assert.deepEqual({code, signal}, {code: 0, signal: null});
  assert.throws(() => process.kill(start.pid, 0), {code: 'ESRCH'});
  assert.deepEqual(readdirSync(join(home, 'run')), []);
});
