// The cua extension's manifest and popup. The manifest's `key` must give CUA_EXTENSION_ID (the unpacked load, the
// self-hosted CRX and the Store build share that id); the popup shows the host connection (and why not, notably the
// host's protocol_mismatch refusal), the instance id's first 8 characters and the count of held debuggees. Spec:
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "The extension".
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {CUA_EXTENSION_ID, CUA_HOST_NAME, extensionIdFromKey} from '../src/chrome/extension.mjs';
import {createChromeStub, EXTENSION_DIR, MANIFEST} from './helpers/chrome-stub.mjs';
import {render, start, statusLines} from '../extension/popup.js';

const waitFor = async (predicate, what, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (!(await predicate())) { if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`); await new Promise(r => setTimeout(r, 2)); }
};

test('the manifest is MV3 "cua" with exactly the needed permissions, no declared content scripts, and a key that gives CUA_EXTENSION_ID', () => {
  assert.equal(MANIFEST.manifest_version, 3);
  assert.equal(MANIFEST.name, 'cua');
  assert.match(MANIFEST.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([...MANIFEST.permissions].sort(), ['alarms', 'debugger', 'downloads', 'nativeMessaging', 'scripting', 'storage', 'tabGroups', 'tabs']);
  // Page guards are injected into owned tabs only (chrome.scripting), which needs every host; nothing runs in a page
  // by declaration.
  assert.deepEqual(MANIFEST.host_permissions, ['<all_urls>']);
  for (const field of ['optional_permissions', 'content_scripts', 'web_accessible_resources', 'update_url'])
    assert.equal(MANIFEST[field], undefined, field);
  assert.equal(extensionIdFromKey(MANIFEST.key), CUA_EXTENSION_ID);
  assert.deepEqual(MANIFEST.background, {service_worker: 'background.js'});
  assert.equal(MANIFEST.action.default_popup, 'popup.html');

  // Every file the manifest names exists; icons are PNGs of their declared size.
  const icons = {...MANIFEST.icons, ...MANIFEST.action.default_icon};
  for (const [size, path] of Object.entries(icons)) {
    const png = readFileSync(join(EXTENSION_DIR, path));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', path);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [Number(size), Number(size)], path);
  }
  for (const path of [MANIFEST.background.service_worker, MANIFEST.action.default_popup]) assert.ok(existsSync(join(EXTENSION_DIR, path)), path);
  // No build step and no dependencies: nothing but the files the manifest serves.
  assert.deepEqual(readdirSync(EXTENSION_DIR).sort(), ['background.js', 'icons', 'manifest.json', 'popup.html', 'popup.js']);
});

test('the worker\'s host name and protocol version are the checkout\'s', () => {
  const source = readFileSync(join(EXTENSION_DIR, 'background.js'), 'utf8');
  assert.match(source, new RegExp(`const HOST_NAME = '${CUA_HOST_NAME.replaceAll('.', '\\.')}';`));
  assert.match(source, /const PROTOCOL_VERSION = 1;/);
});

test('popup lines: connected, refused by the host, or Chrome\'s reason; the instance id\'s first 8 characters; the debuggee count', () => {
  const base = {hostName: CUA_HOST_NAME, instanceId: '3f1c6c1e-2a3b-4c5d-8e9f-0123456789ab', debuggees: 2, refusal: null, error: null};
  assert.deepEqual(statusLines({...base, connected: true}),
    {host: 'host: connected io.github.ssfskim.cua', instance: 'instance: 3f1c6c1e', debuggees: 'debuggees: 2'});
  assert.equal(statusLines({...base, connected: false, refusal: {code: 'protocol_mismatch', message: 'the extension speaks protocol 2; this host speaks 1'}}).host,
    'host: disconnected io.github.ssfskim.cua (protocol_mismatch: the extension speaks protocol 2; this host speaks 1)');
  assert.equal(statusLines({...base, connected: false, error: 'Specified native messaging host not found.'}).host,
    'host: disconnected io.github.ssfskim.cua (Specified native messaging host not found.)');
  assert.equal(statusLines({...base, connected: false}).host, 'host: disconnected io.github.ssfskim.cua');
  assert.deepEqual(statusLines(null), {host: 'host: unknown (the extension\'s worker did not answer)', instance: 'instance: -', debuggees: 'debuggees: -'});
});

test('the popup page loads popup.js as a module and renders the worker\'s answer, here the host\'s protocol_mismatch', async () => {
  const html = readFileSync(join(EXTENSION_DIR, 'popup.html'), 'utf8');
  assert.match(html, /<script type="module" src="popup\.js"><\/script>/);
  for (const id of ['host', 'instance', 'debuggees']) assert.match(html, new RegExp(`id="${id}"`));

  const stub = createChromeStub({nativeHost: 'fake'});
  stub.load();
  await waitFor(() => stub.hostPeers[0]?.hello, 'hello');
  stub.hostPeers[0].notify('hostRefused', {code: 'protocol_mismatch', message: 'the extension speaks protocol 1; this host speaks 2'});
  stub.hostPeers[0].exit();
  await waitFor(async () => (await stub.sendMessage({type: 'cua.status'})).refusal, 'the refusal');

  const elements = Object.fromEntries(['host', 'instance', 'debuggees'].map(id => [id, {textContent: ''}]));
  await render({getElementById: id => elements[id]}, stub.chrome);
  assert.equal(elements.host.textContent, 'host: disconnected io.github.ssfskim.cua (protocol_mismatch: the extension speaks protocol 1; this host speaks 2)');
  assert.equal(elements.instance.textContent, `instance: ${stub.state.storage.extensionInstanceId.slice(0, 8)}`);
  assert.equal(elements.debuggees.textContent, 'debuggees: 0');

  // A worker that does not answer still leaves a readable popup.
  const silent = {runtime: {sendMessage: () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'))}};
  await render({getElementById: id => elements[id]}, silent);
  assert.equal(elements.host.textContent, 'host: unknown (the extension\'s worker did not answer)');
});

test('an open popup follows the worker: a refusal arriving after it opened replaces "connected"', async () => {
  const stub = createChromeStub({nativeHost: 'fake'});
  stub.load();
  await waitFor(() => stub.hostPeers[0]?.hello, 'hello');
  const elements = Object.fromEntries(['host', 'instance', 'debuggees'].map(id => [id, {textContent: ''}]));
  await start({getElementById: id => elements[id]}, stub.chrome);
  assert.equal(elements.host.textContent, 'host: connected io.github.ssfskim.cua');

  stub.hostPeers[0].notify('hostRefused', {code: 'protocol_mismatch', message: 'the extension speaks protocol 1; this host speaks 2'});
  await waitFor(() => elements.host.textContent.includes('protocol_mismatch'), 'the popup updating');
  assert.equal(elements.host.textContent, 'host: disconnected io.github.ssfskim.cua (protocol_mismatch: the extension speaks protocol 1; this host speaks 2)');

  const tab = stub.addTab();
  await stub.hostPeers[0].request('debugger.attach', {tabId: tab.id});
  await waitFor(() => elements.debuggees.textContent === 'debuggees: 1', 'the debuggee count updating');
});
