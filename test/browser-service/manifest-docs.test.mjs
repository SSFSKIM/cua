// The manifest's member and capability selection and the first-use documentation built from it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {API_MANIFEST, browserCapabilities, disabledMemberIds, unsupportedMembers} from '../../src/browser-service/manifest.mjs';
import {Documentation} from '../../src/browser-service/docs.mjs';

const EXTENSION = {id: '1', name: 'cua', type: 'extension', capabilities: {browser: [{id: 'viewport', description: 'Viewport override'}], tab: []}};

test('an extension backend lacks the members the manifest marks unsupported there, unless its overrides grant them', () => {
  const missing = unsupportedMembers({apiManifest: API_MANIFEST, browserInfo: {type: 'extension'}, disabledMemberIds: new Set(['Tab.cua'])});
  for (const id of ['Tab.ax', 'Tabs.content', 'ContentAPI.export', 'BrowserUser.getTabContext', 'Tab.requestManualHandoff', 'Tab.cua']) assert.ok(missing.has(id), id);
  assert.ok(!missing.has('Tab.goto'));
  const granted = unsupportedMembers({apiManifest: API_MANIFEST, browserInfo: {type: 'extension', apiSupportOverrides: {'Tab.ax': true}}, disabledMemberIds: new Set()});
  assert.ok(!granted.has('Tab.ax'));
});

test('the launch\'s BROWSER_USE_DISABLE_* lists remove members and capabilities', () => {
  assert.deepEqual([...disabledMemberIds({BROWSER_USE_DISABLE_API_MEMBERS: ' Tab.cua,, Tab.dom_cua '})], ['Tab.cua', 'Tab.dom_cua']);
  assert.deepEqual([...disabledMemberIds({})], []);
  const caps = {browser: [{id: 'viewport'}, {id: 'visibility'}], tab: [{id: 'cdp'}]};
  assert.deepEqual(browserCapabilities({BROWSER_USE_DISABLE_BROWSER_CAPABILITIES: 'visibility', BROWSER_USE_DISABLE_TAB_CAPABILITIES: 'cdp'}, caps), {browser: [{id: 'viewport'}], tab: []});
  assert.deepEqual(browserCapabilities({}, undefined), {browser: [], tab: []});
});

test('the browser documentation: the selected browser with the service marker, the guidance, the capabilities, the API reference', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '9.8.7'});
  const text = await docs.readBrowser(EXTENSION);
  const lines = text.split('\n');
  assert.equal(lines[0], '# Selected Browser');
  assert.deepEqual(lines.slice(1, 5), ['- Name: cua', '- Type: extension', '- ID: 1', '- Service: cua browser service 9.8.7']);
  assert.ok(text.includes('# Tab Cleanup'), 'extension guidance is included');
  assert.ok(!text.includes('# In-app Browser Tab Mentions'), 'guidance for other backend types is not');
  assert.match(text, /# Additional Documentation\n.*\n- `browser-troubleshooting`: read when/);
  assert.match(text, /## Browser Capabilities\n- `viewport`: Controls an explicit browser viewport override/);
  assert.match(text, /## Tab Capabilities\n- None/);
  assert.match(text, /# API Reference\n/);
  assert.ok(text.includes('interface Tab {'));
  assert.ok(!/^\s+ax: AXAPI;/m.test(text), 'the AX member is not documented for an extension backend');
  assert.ok(!text.includes('interface AXAPI {'), 'nor the interfaces only it reaches');
  assert.ok(text.endsWith('```\n'));
});

test('a launch addendum closes the browser documentation; excluded and undocumented items stay out', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '1.0.0', addendum: 'ADDENDUM',
    excludedDocumentation: ['confirmations'], undocumentedApiMembers: ['Tab.goto']});
  const text = await docs.readBrowser(EXTENSION);
  assert.ok(text.endsWith('\n\nADDENDUM'));
  assert.ok(!text.includes('# Agent Confirmations Policy'));
  assert.ok(!/^\s+goto\(/m.test(text));
});

test('named documents: read when listed, refused otherwise; a required document must be read before its commands', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '1.0.0'});
  assert.match(await docs.read('screenshots'), /^# Screenshots/);
  await assert.rejects(docs.read('../api'), {message: 'Documentation is not available: ../api'});
  assert.throws(() => docs.assertRequiredDocumentationRead('tab_cdp_call'), {message: 'Required documentation has not been read: "confirmations", "capabilities/tab/cdp". Read the instructions with await agent.documentation.get("confirmations"); await agent.documentation.get("capabilities/tab/cdp").'});
  docs.assertRequiredDocumentationRead('list_tabs');
  await docs.readBrowser(EXTENSION);
  assert.throws(() => docs.assertRequiredDocumentationRead('tab_cdp_call'), {message: /"capabilities\/tab\/cdp"\. /}, 'a capability document is read on its own (vendor parity)');
  assert.match(await docs.read('capabilities/tab/cdp'), /^# Tab Capability: cdp/);
  docs.assertRequiredDocumentationRead('tab_cdp_call');
  docs.assertRequiredDocumentationRead('tab_cdp_events');
});

test('the API reference states cua\'s evaluate and budgets: the main world, no replay, 3 s by default up to 120 s, 0 one attempt', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '9.8.7'});
  const text = await docs.readBrowser(EXTENSION);
  assert.doesNotMatch(text, /read-only (?:page |DOM )?scope|read-only JavaScript/i, 'no read-only evaluate scope');
  assert.match(text, /\/\/ timeoutMs on locator, wait and evaluate calls is in milliseconds: 3000 by default, at most 120000; 0 makes one attempt\./);
  for (const member of ['evaluate<TResult, TArg>(pageFunction: PlaywrightEvaluateFunction', 'evaluate<TResult, TArg>(pageFunction: LocatorEvaluateFunction', 'evaluateAll<TResult, TArg>']) {
    const line = text.split('\n').find(l => l.includes(member));
    assert.match(line, /main world/, member);
    assert.match(line, /sent once and never re-run/, member);
  }
  assert.match(text, /type PlaywrightEvaluateOptions = \{\n  timeoutMs\?: number; \/\/ Milliseconds for resolving the locator and running the script: 3000 by default, at most 120000; 0 makes one attempt\. A script that times out, or whose page navigates or reloads while it runs, fails and is not run again: it may already have taken effect\./);
  assert.match(text, /type LocatorClickOptions = \{[^}]*timeoutMs\?: number; \/\/ Milliseconds to wait: 3000 by default, at most 120000; 0 makes one attempt\./);
  assert.match(text, /type LocatorPressSequentiallyOptions = \{\n  timeoutMs\?: number; \/\/ Milliseconds for the whole typing: 5000 by default and at most\./);
});
