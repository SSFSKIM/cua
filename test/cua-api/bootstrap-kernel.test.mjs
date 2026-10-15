// CuaBootstrap in a real own-host kernel (src/repl-host/kernel.mjs): the production banner (src/runtime/launch.mjs)
// imports src/cua-api/bootstrap.mjs in the first cell, inside the kernel's vm context with string code generation off,
// and the facade reaches its services only through nodeRepl.rpc, answered here by Sky and browser-service doubles at
// the kernel's trusted_service_request seam (no trusted worker, no browser). It proves the global `cua` and `agent`,
// the enabled-surface checks, the first-call document bytes and their named output order, emit:false and
// rewriteDocumentation's requestMeta suppression. Needs Node 24 or later (CUA_NODE).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kernelNode, startKernel} from '../repl-host/kernel-harness.mjs';
import {CUA_BOOTSTRAP_BANNER} from '../../src/runtime/launch.mjs';
import {API_MANIFEST} from '../../src/browser-service/api-manifest.mjs';
import {browserDouble} from './browser-client-harness.mjs';

const {node, skip} = kernelNode();
const doc = name => readFileSync(new URL(`../../docs/cua-api/${name}`, import.meta.url), 'utf8');
const CORE = `${doc('core.md')}\n${doc('confirmations.md')}`;
const BROWSERS = [{id: 'b1', name: 'Chrome', type: 'extension', metadata: {extensionInstanceId: 'inst-1'}}];
const browserService = browserDouble({list_browsers: BROWSERS, get_browser_documentation: 'DOC b1', list_tabs: {tabs: [{id: 't1', title: 'One'}]}, browser_user_open_tabs: {tabs: []}});
const SKY = {
  mac: {setup: {target: 'mac', methods: ['list_apps', 'get_app_state', 'click']}, list_apps: [{id: 'com.apple.Notes', displayName: 'Notes'}], get_app_state: {text: 'AX Notes', screenshot: null, app: 'Notes'}},
  linux: {setup: {target: 'linux', methods: ['list_apps', 'list_windows', 'get_window_state']}, list_apps: [], list_windows: [{id: 3, app: 'gedit'}],
    get_window_state: {window: {id: 3, app: 'gedit'}, ax_tree_source: 'at_spi', ax_tree: {id: 'n1', role: 'frame', name: 'Editor', children: []}, screenshots: []}},
};

function reply(target, services) {
  return message => {
    if (message.type !== 'trusted_service_request') return undefined;
    services.push(message.service === 'sky' ? message.request.type === 'setup' ? 'sky.setup' : `sky.${message.request.method}` : `browser.${message.request.method === 'setup' ? 'setup' : message.request.params.type}`);
    const answer = message.service === 'sky'
      ? SKY[target][message.request.type === 'setup' ? 'setup' : message.request.method]
      : message.request.method === 'setup' ? {apiManifest: API_MANIFEST, disabledMemberIds: []} : browserService(message.request.params);
    return {type: 'trusted_service_response', id: message.id, ok: true, value: answer ?? null};
  };
}

function facadeKernel(t, {surfaces = 'browser,computer', target = 'mac'} = {}) {
  const kernel = startKernel(t, {node, env: {CUA_REPL_JS_BANNER: CUA_BOOTSTRAP_BANNER, CUA_REPL_TRUSTED_RPC_ENABLED: '1',
    CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES,CUA_REPL_BROWSER_ENV', ...(surfaces === null ? {} : {CUA_REPL_ENABLED_SURFACES: surfaces})}});
  const services = [];
  const exec = async (code, requestMeta) => (await kernel.exec(code, {requestMeta, reply: reply(target, services)})).result;
  return {exec, services};
}

const ok = result => { assert.equal(result.error, null, `cell failed: ${result.error}`); return result; };

test('the first cell installs cua and agent for the enabled surfaces and writes the first-call document as cua.core', {skip}, async t => {
  const {exec, services} = facadeKernel(t);
  const first = ok(await exec('nodeRepl.write(JSON.stringify([Object.keys(cua).sort(), cua.initialize === cua.getState, typeof agent, cua.browsers === agent.browsers, cua.computer.target]));', {turn: 1}));
  assert.deepEqual(JSON.parse(first.output), [['browsers', 'computer', 'createBrowserTab', 'getApp', 'getBrowser', 'getState', 'getTab', 'initialize', 'listApps', 'listBrowsers', 'listTabs', 'rewriteDocumentation'],
    true, 'object', true, 'mac']);
  assert.deepEqual(first.named_outputs, [CORE], 'the core document and the bundled policy, once');
  assert.deepEqual(services.sort(), ['browser.setup', 'sky.setup']);
  const setup = ok(await exec('nodeRepl.write(typeof cua.listWindows);'));
  assert.equal(setup.output, 'undefined', 'listWindows is Linux\'s');
  assert.deepEqual(setup.named_outputs, [], 'the core is written once per bootstrap');
});

test('a selected browser\'s documents come before the state; emit:false suppresses only the value; rewriteDocumentation skips the same requestMeta', {skip}, async t => {
  const {exec} = facadeKernel(t);
  ok(await exec('1;'));
  const selected = ok(await exec('const browser = await cua.getBrowser({id: "b1"}); await cua.getState(); await cua.getState({emit: false});'));
  const state = {apps: [{id: 'com.apple.Notes', displayName: 'Notes'}], browsers: [{...BROWSERS[0], tabs: [{id: 't1', title: 'One'}]}]};
  assert.deepEqual(selected.named_outputs, [`${doc('other-browser-apis.md')}\n\nDOC b1`, JSON.stringify(state)]);
  const rewritten = ok(await exec('await cua.rewriteDocumentation(); await cua.rewriteDocumentation();', {turn: 2}));
  assert.deepEqual(rewritten.named_outputs, [CORE, `${doc('other-browser-apis.md')}\n\nDOC b1`], 'each document once for this request');
  const app = ok(await exec('const notes = await cua.getApp("Notes"); await cua.listApps({emit: false}); nodeRepl.write(typeof notes.getAXState);'));
  assert.deepEqual([app.output, app.named_outputs], ['function', ['AX Notes']], 'getApp emits the initial state; listApps({emit:false}) nothing');
});

test('the request\'s valid confirmations override replaces the bundled policy in the core document', {skip}, async t => {
  const {exec} = facadeKernel(t, {surfaces: 'browser'});
  const first = ok(await exec('nodeRepl.write(JSON.stringify([Object.keys(cua).sort(), typeof agent]));', {'openai/confirmation_policies': {computer_use: 'POLICY'}}));
  assert.deepEqual(first.named_outputs, [`${doc('core.md')}\nPOLICY`]);
  assert.deepEqual(JSON.parse(first.output), [['browsers', 'createBrowserTab', 'getBrowser', 'getState', 'getTab', 'initialize', 'listBrowsers', 'listTabs', 'rewriteDocumentation'], 'object'],
    'browser-only: no computer members');
});

test('computer-only on Linux: no agent and no browser members; listWindows and a windowId getApp', {skip}, async t => {
  const {exec, services} = facadeKernel(t, {surfaces: 'computer', target: 'linux'});
  const first = ok(await exec('nodeRepl.write(JSON.stringify([Object.keys(cua).sort(), typeof agent, cua.computer.target]));'));
  assert.deepEqual(JSON.parse(first.output), [['computer', 'getApp', 'getState', 'initialize', 'listApps', 'listWindows', 'rewriteDocumentation'], 'undefined', 'linux']);
  assert.deepEqual(services, ['sky.setup']);
  const refused = await exec('await cua.getApp("gedit");');
  assert.equal(refused.error, 'linux getApp requires { windowId } from listApps() or listWindows().');
  assert.equal((await exec('await cua.getApp({windowId: 99});')).error, 'Window 99 is unavailable.');
  const bound = ok(await exec('const editor = await cua.getApp({windowId: 3}); nodeRepl.write(typeof editor.typeText);'));
  assert.deepEqual([bound.output, bound.named_outputs], ['function', ['Accessibility source: at_spi\nn1 frame Editor']], 'the window\'s full initial state before the App returns');
  assert.deepEqual(services.slice(-2), ['sky.list_windows', 'sky.get_window_state']);
});

test('the enabled surfaces are required and known; a refused bootstrap fails the cell with the vendor sentence', {skip}, async t => {
  assert.equal((await facadeKernel(t, {surfaces: 'browser,audio'}).exec('1;')).error, 'unknown CUA_REPL_ENABLED_SURFACES surface=audio');
  assert.equal((await facadeKernel(t, {surfaces: null}).exec('1;')).error, 'CUA_REPL_ENABLED_SURFACES is required');
});
