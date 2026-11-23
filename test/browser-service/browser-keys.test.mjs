// #493: profiles_list keys as browser ids (the call's `cua/browserKeys` metadata), and the Selected Browser block's name
// for a MAWS backend.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BROWSER_KEYS_META, BrowserContext, documentedName} from '../../src/browser-service/browsers.mjs';
import {Documentation} from '../../src/browser-service/docs.mjs';
import {API_MANIFEST} from '../../src/browser-service/manifest.mjs';
import {currentBrowserKeys} from '../../src/chrome/discovery.mjs';

const extension = (id, instance, extra = {}) => ({id, info: {type: 'extension', family: 'chrome', name: 'cua', metadata: {extensionInstanceId: instance}, ...extra}});

// A context over a fixed list of browsers (no sockets): the selection logic alone. `keys()` is the current call's.
function contextOver(browsers, keys) {
  const meta = {current: keys};
  const context = new BrowserContext({env: {}, get requestMeta() { return meta.current === undefined ? {} : {[BROWSER_KEYS_META]: meta.current}; }, addTurnEndedHandler: () => () => {}});
  context.browsers = browsers;
  return Object.assign(context, {callWith: keys => { meta.current = keys; }});
}
const selected = async (context, id) => { try { return (await context.get(id)).id; } catch (error) { return {miss: error.message}; } };

// Ruling 1112's invariant: a selection lands in a Chrome profile only when it names that profile exactly, by its id or
// by its registered key; never through a built-in selector, a MAWS key or a stale alias. One MAWS session with two
// panels (listed first, as client-mode hosts are) and Chrome profiles registered under hostile keys.
test('a selection lands in a Chrome profile only when it names that profile, by id or by its current key', async t => {
  const home = mkdtempSync(join(tmpdir(), 'cua-keys-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const register = profiles => writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: Object.fromEntries(Object.entries(profiles)
    .map(([key, extensionInstanceId], i) => [key, {chromeProfileDirectory: `Profile ${i}`, extensionInstanceId, boundAt: 'x', route: 'cua'}]))}));
  const registry = {personal: 'inst-personal', iab: 'inst-iab', chrome: 'inst-chrome', extension: 'inst-extension', maws: 'inst-maws', 'maws-2': 'inst-maws-2',
    work: 'inst-personal', school: 'inst-school'};
  const maws1 = extension('1', 'maws:app-1', {profileName: 'MAWS'}), maws2 = extension('2', 'maws:app-2', {profileName: 'MAWS'});
  const chrome = Object.fromEntries(['personal', 'iab', 'chrome', 'extension', 'maws', 'maws-2', 'work'].map((key, i) => [key, extension(String(10 + i), `inst-${key}`)]));
  const context = contextOver([maws1, maws2, ...Object.values(chrome)]);

  // At the first call maws-2 has not said hello yet, and `work` is bound to the personal profile.
  register(registry);
  context.callWith(currentBrowserKeys(home, {mawsKeys: {maws: 'maws:app-1'}}));
  assert.equal(await selected(context, 'work'), chrome.personal.id);
  assert.match((await selected(context, 'maws-2')).miss, /^Browser is not available: maws-2\./, 'a MAWS key before its hello is never the Chrome profile registered under it');
  // Then maws-2 connects, and `work` is rebound to its own profile.
  register({...registry, work: 'inst-work'});
  context.callWith(currentBrowserKeys(home, {mawsKeys: {maws: 'maws:app-1', 'maws-2': 'maws:app-2'}}));

  const rows = [
    ['iab', 'miss'], ['chrome', maws1.id], ['extension', maws1.id], ['maws', maws1.id], ['maws-2', maws2.id], ['work', chrome.work.id],
    ['school', 'miss'], ['personal', chrome.personal.id], [chrome.iab.id, chrome.iab.id],
  ];
  for (const [selector, expected] of rows) {
    const got = await selected(context, selector);
    assert.deepEqual(expected === 'miss' ? Object.keys(got) : got, expected === 'miss' ? ['miss'] : expected, `${selector} -> ${JSON.stringify(got)}`);
  }
  const miss = (await selected(context, 'iab')).miss;
  assert.match(miss, /profiles_list keys: "personal", "work", "maws", "maws-2"\. "iab" names a browser type or family, not the profile registered under it: select that profile with cua\.getBrowser\(\{extensionInstanceId: "inst-iab"\}\)\.$/);
  assert.doesNotMatch((await selected(context, 'school')).miss, /"iab"|"chrome"|"extension"|"school"/, 'a colliding or missing key is never offered');
});

test('maws falls back as the unqualified default does: its instance unknown (the marker) or not listed, the first MAWS instance', async () => {
  const chrome = extension('1', 'chrome-personal');
  const maws = extension('2', 'maws:app-7');
  assert.equal(await contextOver([chrome, maws], {maws: 'maws:'}).get('maws'), maws);
  assert.equal(await contextOver([chrome, maws], {maws: 'maws:app-1'}).get('maws'), maws);
  await assert.rejects(contextOver([chrome, maws], {maws: 'maws:app-7', 'maws-2': 'maws:'}).get('maws-2'), {code: 'browser_not_found'}, 'only maws falls back');
  await assert.rejects(contextOver([chrome], {maws: 'maws:'}).get('maws'), {message: 'Browser is not available: maws. Browser ids: "1"; profiles_list keys: none.'}, 'never to Chrome');
});

test('two listed browsers carrying a key\'s instance: the key selects the first listed; a call without keys has none', async () => {
  const first = extension('4', 'chrome-personal');
  const second = extension('5', 'chrome-personal');
  assert.equal(await contextOver([first, second], {personal: 'chrome-personal'}).get('personal'), first);
  await assert.rejects(contextOver([first]).get('personal'), {message: 'Browser is not available: personal. Browser ids: "4"; profiles_list keys: none.'});
});

test('the key map: a reserved MAWS key is never Chrome\'s while MAWS backends are configured; without them it is an ordinary key', async t => {
  const home = mkdtempSync(join(tmpdir(), 'cua-keys-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  writeFileSync(join(home, 'profiles.json'), JSON.stringify({version: 1, profiles: {
    maws: {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-old', boundAt: 'x', route: 'cua'},
    personal: {chromeProfileDirectory: 'Profile 1', extensionInstanceId: 'inst-personal', boundAt: 'x', route: 'cua'},
    legacy: {chromeProfileDirectory: 'Profile 2', extensionInstanceId: 'inst-legacy', boundAt: 'x'},
    unbound: {chromeProfileDirectory: 'Profile 3'},
  }}));
  assert.deepEqual(currentBrowserKeys(home, {mawsKeys: {maws: 'maws:'}}), {personal: 'inst-personal', maws: 'maws:'});
  assert.deepEqual(currentBrowserKeys(home, {mawsKeys: {}}), {personal: 'inst-personal'}, 'not even before the first hello');
  assert.deepEqual(currentBrowserKeys(home), {maws: 'inst-old', personal: 'inst-personal'});
  writeFileSync(join(home, 'profiles.json'), 'not json');
  assert.deepEqual(currentBrowserKeys(home, {mawsKeys: {maws: 'maws:app-1'}}), {maws: 'maws:app-1'}, 'a damaged registry contributes no keys and fails nothing');
});

test('the Selected Browser block names a MAWS backend "MAWS in-app browser (<key>)" by its own key, and every other browser by its name', async () => {
  const keys = {maws: 'maws:app-1', 'maws-2': 'maws:app-2', personal: 'chrome-personal'};
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:app-1'}}, keys), 'MAWS in-app browser (maws)');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:app-2'}}, keys), 'MAWS in-app browser (maws-2)');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:app-2'}}, {maws: 'maws:'}), 'MAWS in-app browser', 'no key carries it: no key is guessed');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'chrome-personal'}}, keys), 'cua');
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '0.1.0'});
  const read = (instance, id) => docs.readBrowser({id, name: 'cua', type: 'extension', metadata: {extensionInstanceId: instance}, capabilities: {browser: [], tab: []}}, {browserKeys: keys});
  assert.deepEqual((await read('maws:app-1', '1')).split('\n').slice(0, 5), ['# Selected Browser', '- Name: MAWS in-app browser (maws)', '- Type: extension', '- ID: 1', '- Service: cua browser service 0.1.0']);
  assert.equal((await read('maws:app-2', '2')).split('\n')[1], '- Name: MAWS in-app browser (maws-2)');
  assert.equal((await read('chrome-personal', '3')).split('\n')[1], '- Name: cua');
});

test('a key bound after the runtime launched: the miss says this runtime cannot reach it and a new session can', async t => {
  const {keysBeyondLaunch} = await import('../../src/chrome/discovery.mjs');
  const {socketNameFor, socketPathFor} = await import('../../src/chrome/extension.mjs');
  const home = mkdtempSync(join(tmpdir(), 'cua-keys-'));
  t.after(() => rmSync(home, {recursive: true, force: true}));
  const keys = {maws: 'maws:app-1', personal: 'inst-personal', late: 'inst-late'};
  const launched = [join(home, 'chrome', 'm', 'aaaaaaaaaaaa-1.sock'), socketPathFor(realpathSync(home), socketNameFor('inst-personal'))].join(':');
  assert.deepEqual(keysBeyondLaunch(home, keys, launched), ['late'], 'MAWS keys are always listed; only a socket the launch lacks is beyond it');
  const context = contextOver([extension('1', 'maws:app-1')]);
  Object.defineProperty(context.runtime, 'requestMeta', {get: () => ({[BROWSER_KEYS_META]: keys, 'cua/browserKeysUnreached': ['late']})});
  await assert.rejects(context.get('late'), {message: 'Browser is not available: late. Browser ids: "1"; profiles_list keys: "maws". The profile keyed "late" was bound after this runtime launched, and this runtime cannot reach its browser: a new session can.'});
  await assert.rejects(context.get('personal'), {message: 'Browser is not available: personal. Browser ids: "1"; profiles_list keys: "maws".'}, 'a key the launch could reach misses as before');
});
