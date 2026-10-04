// M12: install places the pinned archive's Chrome plugin as its own component inside the release tree, with the host
// configuration next to the host, and adds it to an already installed release without changing anything that exists.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, existsSync, readdirSync, statSync, lstatSync, rmSync, mkdirSync, realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join, relative} from 'node:path';
import {installRuntime, useRuntime} from '../src/runtime/install.mjs';
import {parsePin, resolveRuntime} from '../src/runtime/manifest.mjs';
import {chromeComponentPaths, hostConfigFor, HOST_CONFIG_FILE} from '../src/runtime/chrome-component.mjs';
import {scratch, zipFixture, fixturePin, acceptSignatures, realPinJson} from './fixtures/runtime-fixture.mjs';

const darwin = process.platform === 'darwin';
const HOST = {platform: 'darwin', arch: 'arm64'};
const expectCode = code => err => { assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`); return true; };
const pointer = home => existsSync(join(home, 'current.json')) ? JSON.parse(readFileSync(join(home, 'current.json'), 'utf8')).release : null;
const stagingLeftovers = home => existsSync(join(home, 'staging')) ? readdirSync(join(home, 'staging')) : [];

function setup(t, {archive: archiveOptions, pin: pinOverrides} = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const archive = zipFixture(s.dir, archiveOptions);
  const pin = parsePin(fixturePin({sha256: archive.sha256, length: archive.length, ...pinOverrides}));
  return {dir: s.dir, home: join(s.dir, 'home'), archive, pin};
}
const install = (ctx, extra = {}) => installRuntime({home: ctx.home, manifest: ctx.pin, archivePath: ctx.archive.zip, verifySignatures: acceptSignatures, host: HOST, ...extra});

// Every entry under `root` with what a change would alter (type, mode, size, mtime, inode).
function snapshot(root) {
  const out = new Map();
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const s = lstatSync(path);
      out.set(relative(root, path), `${s.isDirectory() ? 'd' : s.isSymbolicLink() ? 'l' : 'f'} ${s.mode} ${s.size} ${s.mtimeMs} ${s.ino}`);
      if (s.isDirectory()) walk(path);
    }
  };
  walk(root);
  return out;
}

// Installs the base release as the M2-era installer left it: everything but the Chrome plugin component.
async function baseOnlyRelease(t) {
  const ctx = setup(t);
  await install(ctx);
  const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
  rmSync(join(root, ctx.pin.chromePlugin.dir), {recursive: true, force: true});
  return {...ctx, root};
}

test('the pin names the Chrome plugin, where it lands, its host and scripts, the host signature and the native host', () => {
  const pin = parsePin(realPinJson());
  assert.equal(pin.chromePlugin.from, 'ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome');
  assert.equal(pin.chromePlugin.dir, 'chrome-plugin');
  assert.equal(pin.chromePlugin.layout.host, 'extension-host/macos/arm64/ChatGPT for Chrome');
  assert.deepEqual(pin.chromePlugin.signing, ['extension-host/macos/arm64/ChatGPT for Chrome']);
  assert.equal(pin.chromePlugin.nativeHost.name, 'com.openai.codexextension');
  assert.deepEqual(pin.chromePlugin.nativeHost.extensionIds, ['hehggadaopoacecdllhhajmbjkdcmajg', 'odlomjlbamekndcpllcnffbgeohgkmjh']);
});

test('pin parsing rejects a malformed chromePlugin section', () => {
  const cases = {
    unknownField: p => { p.chromePlugin.postInstall = 'sh x'; },
    missingLayoutKey: p => { delete p.chromePlugin.layout.browserService; },
    extraLayoutKey: p => { p.chromePlugin.layout.other = 'scripts/x.mjs'; },
    escapingFrom: p => { p.chromePlugin.from = 'ChatGPT.app/../x'; },
    escapingLayout: p => { p.chromePlugin.layout.host = '../cua_node/bin/node'; },
    dirCollidesWithComponent: p => { p.chromePlugin.dir = 'cua_node'; },
    dirIsTheRecord: p => { p.chromePlugin.dir = 'install.json'; },
    dirIsAPath: p => { p.chromePlugin.dir = 'a/b'; },
    signingNotTheHost: p => { p.chromePlugin.signing = ['scripts/browser-client.mjs']; },
    badHostName: p => { p.chromePlugin.nativeHost.name = 'com.openai/../x'; },
    badExtensionId: p => { p.chromePlugin.nativeHost.extensionIds = ['not-an-extension-id']; },
    noExtensionIds: p => { p.chromePlugin.nativeHost.extensionIds = []; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const pin = realPinJson();
    mutate(pin);
    assert.throws(() => parsePin(pin), expectCode('invalid_pin'), name);
  }
});

test('a fresh install places the Chrome plugin as its own recorded component with the host configuration beside the host', {skip: !darwin}, async t => {
  const ctx = setup(t);
  const signed = [];
  const result = await install(ctx, {verifySignatures: async (root, pin) => { signed.push([root, pin.signing.components]); return acceptSignatures(root, pin); }});
  const home = realpathSync(ctx.home);
  const root = join(home, 'runtimes', ctx.pin.release);
  const component = join(root, 'chrome-plugin');
  assert.deepEqual(readdirSync(root).sort(), ['CodexCLI.app', 'chrome-plugin', 'cua_node', 'install.json']);
  assert.equal(result.chromeHost.root, component);
  assert.equal(result.chromeHost.changed, true);
  // The whole plugin directory is kept (its scripts import ../node_modules), and nothing else from the app.
  assert.ok(existsSync(join(component, 'node_modules/classic-level.mjs')));
  assert.ok(existsSync(join(component, 'scripts/installManifest.mjs')));
  // The host's signature is checked with the pinned team, on the component, separately from the base release.
  assert.ok(signed.some(([where, components]) => where.endsWith('/chrome-plugin') && components.join() === 'extension-host/macos/arm64/ChatGPT for Chrome'), JSON.stringify(signed));
  const config = JSON.parse(readFileSync(join(component, 'extension-host/macos/arm64', HOST_CONFIG_FILE), 'utf8'));
  assert.deepEqual(config, {
    schemaVersion: 1, channel: 'prod',
    browserClientPath: join(component, 'scripts/browser-client.mjs'),
    browserServicePath: join(component, 'scripts/browser-service.mjs'),
    codexCliPath: join(root, 'CodexCLI.app/Contents/MacOS/codex'),
    nodePath: join(root, 'cua_node/bin/node'),
    nodeReplPath: join(root, 'cua_node/bin/node_repl'),
    codexHome: join(home, 'state', 'codex'),
    proxyHost: '127.0.0.1', proxyPort: 0,
  });
  // Final paths, never the staging directory the config was written in.
  assert.doesNotMatch(JSON.stringify(config), /staging/);
  assert.ok(statSync(join(home, 'state', 'codex')).isDirectory());
  const record = JSON.parse(readFileSync(join(component, 'component.json'), 'utf8'));
  assert.equal(record.component, 'chrome-plugin');
  assert.equal(record.release, ctx.pin.release);
  assert.deepEqual(record.archive, {sha256: ctx.archive.sha256, length: ctx.archive.length});
  // The base release record is what M2 wrote; the component does not change it.
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(root, 'install.json'), 'utf8'))).sort(), ['archive', 'installedAt', 'release', 'schema', 'source']);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('the component paths and host configuration derive from the resolved runtime', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  const runtime = resolveRuntime({home: ctx.home, pins: [ctx.pin], host: HOST});
  const paths = chromeComponentPaths(runtime);
  assert.equal(paths.root, join(runtime.root, 'chrome-plugin'));
  assert.equal(paths.host, join(runtime.root, 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome'));
  assert.equal(paths.config, join(runtime.root, 'chrome-plugin/extension-host/macos/arm64/extension-host-config.json'));
  assert.deepEqual(hostConfigFor(runtime), JSON.parse(readFileSync(paths.config, 'utf8')));
});

test('installing again with the component in place is a no-op that needs no archive', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
  const before = snapshot(root);
  rmSync(ctx.archive.zip);
  const again = await install(ctx, {fetch: async () => { throw new Error('must not download'); }});
  assert.equal(again.changed, false);
  assert.equal(again.chromeHost.changed, false);
  assert.deepEqual(snapshot(root), before);
});

test('an installed release without the component gains it additively: no existing entry changes', {skip: !darwin}, async t => {
  const ctx = await baseOnlyRelease(t);
  const before = snapshot(ctx.root);
  const pointerBefore = statSync(join(ctx.home, 'current.json'));
  const result = await install(ctx);
  assert.equal(result.changed, true);
  assert.equal(result.chromeHost.changed, true);
  const after = snapshot(ctx.root);
  for (const [path, state] of before) assert.equal(after.get(path), state, path);
  const added = [...after.keys()].filter(path => !before.has(path));
  assert.ok(added.length > 0);
  assert.ok(added.every(path => path === 'chrome-plugin' || path.startsWith('chrome-plugin/')), added.join(', '));
  assert.ok(existsSync(join(ctx.root, 'chrome-plugin/extension-host/macos/arm64/extension-host-config.json')));
  assert.equal(statSync(join(ctx.home, 'current.json')).mtimeMs, pointerBefore.mtimeMs);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('adding the component to an installed release downloads the pinned archive when no --archive is given', {skip: !darwin}, async t => {
  const ctx = await baseOnlyRelease(t);
  const bytes = readFileSync(ctx.archive.zip);
  const requested = [];
  const result = await install(ctx, {archivePath: undefined, fetch: async url => { requested.push(String(url)); return new Response(bytes); }});
  assert.deepEqual(requested, [ctx.pin.archive.url]);
  assert.equal(result.chromeHost.changed, true);
  assert.equal(JSON.parse(readFileSync(join(ctx.root, 'chrome-plugin/component.json'), 'utf8')).source, 'download');
});

test('a component whose host signature fails is not placed, and the installed release and pointer stay as they were', {skip: !darwin}, async t => {
  const ctx = await baseOnlyRelease(t);
  const before = snapshot(ctx.root);
  const rejectHost = async (root, pin) => pin.signing.components.map(c => ({component: c, valid: !c.includes('ChatGPT for Chrome'), detail: 'bad'}));
  await assert.rejects(install(ctx, {verifySignatures: rejectHost}), err => {
    assert.equal(err.code, 'signature_invalid');
    assert.match(err.message, /ChatGPT for Chrome/);
    return true;
  });
  assert.deepEqual(snapshot(ctx.root), before);
  assert.equal(pointer(ctx.home), ctx.pin.release);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
  // A fresh install with a bad host signature activates nothing.
  const fresh = setup(t);
  await assert.rejects(install(fresh, {verifySignatures: rejectHost}), expectCode('signature_invalid'));
  assert.equal(pointer(fresh.home), null);
  assert.equal(existsSync(join(fresh.home, 'runtimes', fresh.pin.release)), false);
});

test('an archive without the plugin, or without its host, cannot place the component', {skip: !darwin}, async t => {
  const ctx = setup(t, {archive: {omit: ['chrome/extension-host/macos/arm64/ChatGPT for Chrome']}});
  await assert.rejects(install(ctx), expectCode('layout_invalid'));
  assert.equal(pointer(ctx.home), null);
  assert.deepEqual(stagingLeftovers(ctx.home), []);
});

test('a damaged component is never repaired in place, and a component path that is not ours is refused untouched', {skip: !darwin}, async t => {
  const ctx = setup(t);
  await install(ctx);
  const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
  const host = join(root, 'chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome');
  rmSync(host);
  await assert.rejects(install(ctx), err => {
    assert.equal(err.code, 'chrome_component_invalid');
    assert.ok(err.hint.includes(join(root, 'chrome-plugin')), err.hint);
    return true;
  });
  assert.equal(existsSync(host), false);

  const other = await baseOnlyRelease(t);
  const target = join(other.root, 'chrome-plugin');
  mkdirSync(target);
  writeFileSync(join(target, 'keep'), 'not ours');
  const listing = () => spawnSync('/bin/ls', ['-laR', target], {encoding: 'utf8'}).stdout;
  const before = listing();
  await assert.rejects(install(other), expectCode('target_occupied'));
  assert.equal(listing(), before);
  assert.deepEqual(stagingLeftovers(other.home), []);
});

test('a placed component whose host configuration is missing or wrong is refused by a repeated install, not reported unchanged', {skip: !darwin}, async t => {
  const damage = {
    'configuration removed': config => rmSync(config),
    'configuration unreadable': config => writeFileSync(config, 'not json'),
    'node outside the release': config => writeFileSync(config, JSON.stringify({...JSON.parse(readFileSync(config, 'utf8')), nodePath: '/usr/bin/true'})),
    'codexHome not the server\'s own': config => writeFileSync(config, JSON.stringify({...JSON.parse(readFileSync(config, 'utf8')), codexHome: '/Users/x/.codex'})),
  };
  for (const [name, apply] of Object.entries(damage)) {
    const ctx = setup(t);
    await install(ctx);
    const root = join(realpathSync(ctx.home), 'runtimes', ctx.pin.release);
    const config = join(root, 'chrome-plugin/extension-host/macos/arm64', HOST_CONFIG_FILE);
    apply(config);
    const before = snapshot(root);
    await assert.rejects(install(ctx), err => {
      assert.equal(err.code, 'chrome_component_invalid', `${name}: ${err.code} ${err.message}`);
      assert.equal(err.cause?.code, 'host_config_invalid', name);
      assert.match(err.message, /extension-host-config\.json/, name);
      assert.ok(err.hint.includes(join(root, 'chrome-plugin')), err.hint);
      return true;
    });
    assert.deepEqual(snapshot(root), before, `${name}: never repaired in place`);
  }
});

// Two installed releases in one home, the second active, for `runtime use` back to the first.
async function twoReleases(t) {
  const first = setup(t, {pin: {release: '0.0.1-darwin-arm64'}});
  await install(first);
  const second = setup(t, {pin: {release: '0.0.2-darwin-arm64'}});
  second.home = first.home;
  await install(second);
  const root = join(realpathSync(first.home), 'runtimes', first.pin.release);
  const use = (extra = {}) => useRuntime({home: first.home, release: first.pin.release, pins: [first.pin, second.pin], verifySignatures: acceptSignatures, host: HOST, ...extra});
  return {home: first.home, root, component: join(root, 'chrome-plugin'), use, active: second.pin.release};
}

test('runtime use refuses a release whose placed component no longer verifies, with install\'s classification, and keeps the pointer', {skip: !darwin}, async t => {
  const damage = {
    'host deleted': [m => rmSync(join(m.component, 'extension-host/macos/arm64/ChatGPT for Chrome')), 'layout_invalid'],
    'configuration deleted': [m => rmSync(join(m.component, 'extension-host/macos/arm64', HOST_CONFIG_FILE)), 'host_config_invalid'],
    'host signature rejected': [() => {}, 'signature_invalid', {verifySignatures: async (root, pin) => pin.signing.components.map(c => ({component: c, valid: !c.includes('ChatGPT for Chrome'), detail: 'bad'}))}],
  };
  for (const [name, [apply, cause, extra]] of Object.entries(damage)) {
    const m = await twoReleases(t);
    apply(m);
    await assert.rejects(m.use(extra), err => {
      assert.equal(err.code, 'chrome_component_invalid', `${name}: ${err.code} ${err.message}`);
      assert.equal(err.cause?.code, cause, name);
      assert.ok(err.hint.includes(m.component), err.hint);
      return true;
    });
    assert.equal(pointer(m.home), m.active, name);
  }
});

test('runtime use still selects a release installed before the component existed, and refuses a component path that is not ours', {skip: !darwin}, async t => {
  const legacy = await twoReleases(t);
  rmSync(legacy.component, {recursive: true, force: true});
  const used = await legacy.use();
  assert.equal(used.release, '0.0.1-darwin-arm64');
  assert.equal(pointer(legacy.home), '0.0.1-darwin-arm64');

  const other = await twoReleases(t);
  rmSync(other.component, {recursive: true, force: true});
  mkdirSync(other.component);
  writeFileSync(join(other.component, 'keep'), 'not ours');
  await assert.rejects(other.use(), expectCode('target_occupied'));
  assert.equal(readFileSync(join(other.component, 'keep'), 'utf8'), 'not ours');
  assert.equal(pointer(other.home), other.active);
});
