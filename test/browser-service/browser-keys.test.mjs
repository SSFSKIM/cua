// #493: profiles_list keys as browser ids (CUA_BROWSER_KEYS), and the Selected Browser block's name for a MAWS backend.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserContext, documentedName} from '../../src/browser-service/browsers.mjs';
import {Documentation} from '../../src/browser-service/docs.mjs';
import {API_MANIFEST} from '../../src/browser-service/manifest.mjs';

const extension = (id, instance, extra = {}) => ({id, info: {type: 'extension', family: 'chrome', name: 'cua', metadata: {extensionInstanceId: instance}, ...extra}});

// A context over a fixed list of browsers (no sockets): the selection logic alone.
function contextOver(browsers, keys) {
  const context = new BrowserContext({env: keys === undefined ? {} : {CUA_BROWSER_KEYS: JSON.stringify(keys)}, addTurnEndedHandler: () => () => {}});
  context.browsers = browsers;
  return context;
}

test('a key selects the browser carrying its instance; ids, types and families keep their meaning first', async () => {
  const maws = extension('1', 'maws:app-1', {profileName: 'MAWS'});
  const chrome = extension('2', 'chrome-personal');
  const context = contextOver([maws, chrome], {maws: 'maws:app-1', personal: 'chrome-personal', extension: 'chrome-personal'});
  assert.equal(await context.get('maws'), maws);
  assert.equal(await context.get('personal'), chrome);
  assert.equal(await context.get('2'), chrome);
  assert.equal(await context.get('extension'), maws, 'a key named like a backend type does not shadow the type');
});

test('maws falls back as the unqualified default does: its instance unknown (the marker) or not listed, the first MAWS instance', async () => {
  const chrome = extension('1', 'chrome-personal');
  const maws = extension('2', 'maws:app-7');
  assert.equal(await contextOver([chrome, maws], {maws: 'maws:'}).get('maws'), maws);
  assert.equal(await contextOver([chrome, maws], {maws: 'maws:app-1'}).get('maws'), maws);
  await assert.rejects(contextOver([chrome, maws], {maws: 'maws:app-7', 'maws-2': 'maws:'}).get('maws-2'), {code: 'browser_not_found'}, 'only maws falls back');
  await assert.rejects(contextOver([chrome], {maws: 'maws:'}).get('maws'), {message: 'Browser is not available: maws. Browser ids: "1"; profiles_list keys: none.'}, 'never to Chrome');
});

test('two listed browsers carrying a key\'s instance: the key selects the first listed', async () => {
  const first = extension('4', 'chrome-personal');
  const second = extension('5', 'chrome-personal');
  assert.equal(await contextOver([first, second], {personal: 'chrome-personal'}).get('personal'), first);
});

test('a miss names every listed id and the keys that select a browser now', async () => {
  const context = contextOver([extension('1', 'maws:app-1'), extension('2', 'chrome-personal')], {maws: 'maws:app-1', personal: 'chrome-personal', work: 'chrome-work'});
  await assert.rejects(context.get('iab'), {code: 'browser_not_found', message: 'Browser is not available: iab. Browser ids: "1", "2"; profiles_list keys: "maws", "personal".'});
  await assert.rejects(contextOver([], undefined).get('maws'), {message: 'Browser is not available: maws. Browser ids: none; profiles_list keys: none.'});
});

test('the Selected Browser block names a MAWS backend "MAWS in-app browser (<key>)" and every other browser by its name', async () => {
  const keys = {maws: 'maws:app-1', 'maws-2': 'maws:app-2', personal: 'chrome-personal'};
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:app-1'}}, keys), 'MAWS in-app browser (maws)');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:app-2'}}, keys), 'MAWS in-app browser (maws-2)');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'maws:late'}}, {maws: 'maws:'}), 'MAWS in-app browser (maws)', 'an instance not known at launch is the first backend\'s');
  assert.equal(documentedName({name: 'cua', metadata: {extensionInstanceId: 'chrome-personal'}}, keys), 'cua');
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '0.1.0', browserKeys: keys});
  const text = await docs.readBrowser({id: '1', name: 'cua', type: 'extension', metadata: {extensionInstanceId: 'maws:app-1'}, capabilities: {browser: [], tab: []}});
  assert.deepEqual(text.split('\n').slice(0, 5), ['# Selected Browser', '- Name: MAWS in-app browser (maws)', '- Type: extension', '- ID: 1', '- Service: cua browser service 0.1.0']);
  const chrome = await docs.readBrowser({id: '2', name: 'cua', type: 'extension', metadata: {extensionInstanceId: 'chrome-personal'}, capabilities: {browser: [], tab: []}});
  assert.equal(chrome.split('\n')[1], '- Name: cua');
});
