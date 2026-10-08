// H1 probe harness (scripts/probe/chrome/host-layer.mjs): the judge that turns one run of the vendor service against
// the real host into PASS/FAIL per scenario, fed synthetic runs shaped like the harness's own. No runtime is launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {judgeHost} from '../scripts/probe/chrome/host-layer.mjs';

const call = (method, params = {}) => ({method, params});
function goodRun() {
  return {
    instanceId: 'inst-1', sessionId: 'sess-1', socketPath: '$CUA_HOME/chrome/b/abc.sock', hostListening: true,
    envKeys: ['BROWSER_USE_AVAILABLE_BACKENDS', 'BROWSER_USE_BACKEND_PATHS', 'CODEX_HOME', 'HOME'], hostEnvKeys: ['CUA_HOME'],
    authJsonPresent: false, authJsonPresentAfter: false,
    cells: {
      listBrowsers: {result: {browsers: [{type: 'extension', name: 'cua', metadata: {extensionInstanceId: 'inst-1'}}]}},
      createBrowserTab: {result: {created: '101'}},
      evaluate: {result: {value: 'h1-roundtrip:(() => {'}},
      viewport: {result: {capabilities: ['viewport'], done: true}},
    },
    extensionCalls: [call('tabs.query'), call('windows.query'), call('tabs.create', {url: 'about:blank', windowId: 1, group: {key: 'sess-1', title: 'cua'}}),
      call('debugger.attach', {tabId: 101}), call('debugger.sendCommand', {debuggee: {tabId: 101}, method: 'Runtime.evaluate'}),
      call('debugger.sendCommand', {debuggee: {tabId: 101}, method: 'Emulation.setDeviceMetricsOverride', params: {width: 800, height: 600, deviceScaleFactor: 1, mobile: false}}),
      call('debugger.sendCommand', {debuggee: {tabId: 101}, method: 'Emulation.clearDeviceMetricsOverride', params: {}}), call('debugger.detach', {tabId: 101}), call('tabs.remove', {tabId: 101})],
    turnEnded: {isError: false}, statusAfterTurn: {sessions: [{session_id: 'sess-1', tabs: []}]}, fakeTabsAfter: [100],
    hostExit: {code: 0, signal: null}, socketRemoved: true, statusRemoved: true,
  };
}
const statusOf = (run, id) => judgeHost(run).find(s => s.id === id)?.status;

test('a run where every step reached the host and came back passes every scenario', () => {
  assert.deepEqual(judgeHost(goodRun()).filter(s => s.status !== 'PASS').map(s => s.id), []);
});

test('createTab without a following attach, or a tab outside the session group, fails create-and-attach', () => {
  const noAttach = goodRun();
  noAttach.extensionCalls = noAttach.extensionCalls.filter(c => c.method !== 'debugger.attach');
  assert.equal(statusOf(noAttach, 'h1-create-and-attach'), 'FAIL');
  const ungrouped = goodRun();
  ungrouped.extensionCalls[2].params.group = {key: 'someone-else', title: 'cua'};
  assert.equal(statusOf(ungrouped, 'h1-create-and-attach'), 'FAIL');
});

test('a cell value the extension did not produce fails the round trip; an identity error fails the header scenario', () => {
  const invented = goodRun();
  invented.cells.evaluate.result.value = 'about:blank';
  assert.equal(statusOf(invented, 'h1-cdp-roundtrip'), 'FAIL');
  const identity = goodRun();
  identity.cells.createBrowserTab.result = {error: 'Browser request-header policy requires caller identity.'};
  assert.equal(statusOf(identity, 'h1-header-policy-skipped'), 'FAIL');
});

test('a tab left open or listed after the turn fails turn-end; a bypass switch in the vendor environment fails launch', () => {
  const leaked = goodRun();
  leaked.fakeTabsAfter = [100, 101];
  leaked.extensionCalls = leaked.extensionCalls.filter(c => c.method !== 'tabs.remove');
  assert.equal(statusOf(leaked, 'h1-turn-end'), 'FAIL');
  const listed = goodRun();
  listed.statusAfterTurn.sessions[0].tabs = [{tabId: 101}];
  assert.equal(statusOf(listed, 'h1-turn-end'), 'FAIL');
  const bypass = goodRun();
  bypass.envKeys.push('BROWSER_USE_DISABLE_AMBIENT_NETWORK');
  assert.equal(statusOf(bypass, 'h1-launch'), 'FAIL');
});

test('viewport: not offered, an override of another size, or no reset fails the viewport scenario', () => {
  const hidden = goodRun();
  hidden.cells.viewport.result.capabilities = [];
  assert.equal(statusOf(hidden, 'h1-viewport'), 'FAIL');
  const resized = goodRun();
  resized.extensionCalls.find(c => c.params.method === 'Emulation.setDeviceMetricsOverride').params.params.width = 1280;
  assert.equal(statusOf(resized, 'h1-viewport'), 'FAIL');
  const kept = goodRun();
  kept.extensionCalls = kept.extensionCalls.filter(c => c.params.method !== 'Emulation.clearDeviceMetricsOverride');
  assert.equal(statusOf(kept, 'h1-viewport'), 'FAIL');
});
