// The manifest's member and capability selection and the first-use documentation built from it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {API_MANIFEST, browserCapabilities, disabledMemberIds, unsupportedMembers} from '../../src/browser-service/manifest.mjs';
import {Documentation} from '../../src/browser-service/docs.mjs';
import {DOCUMENTS} from '../../src/browser-service/docs-content.mjs';
import {serviceError} from '../../src/browser-service/errors.mjs';
import {DEADLINE_SENTENCE} from '../../src/browser-service/evaluate.mjs';
import {SELECTOR_DEADLINE_EXCEEDED} from '../../src/browser-service/selectors.mjs';
import {RESULT_LIMITS} from '../../src/browser-service/evaluate.mjs';

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
  assert.match(text, /\/\/ timeoutMs on locator, wait and evaluate calls is a per-phase budget in milliseconds: 3000 by default, at most 120000; 0 makes one attempt of at most 3000\./);
  for (const member of ['evaluate<TResult, TArg>(pageFunction: PlaywrightEvaluateFunction', 'evaluate<TResult, TArg>(pageFunction: LocatorEvaluateFunction', 'evaluateAll<TResult, TArg>']) {
    const line = text.split('\n').find(l => l.includes(member));
    assert.match(line, /main world/, member);
    assert.match(line, /sent once and never re-run/, member);
  }
  assert.match(text, /type PlaywrightEvaluateOptions = \{\n  timeoutMs\?: number; \/\/ Milliseconds for resolving the locator and running the script: 3000 by default, at most 120000; 0 makes one attempt\. A script that times out, or whose page navigates or reloads while it runs, fails and is not run again: it may already have taken effect\./);
  assert.match(text, /type LocatorClickOptions = \{[^}]*timeoutMs\?: number; \/\/ Milliseconds to wait: 3000 by default, at most 120000; 0 makes one attempt\./);
  assert.match(text, /type LocatorPressSequentiallyOptions = \{\n  timeoutMs\?: number; \/\/ Milliseconds for the whole typing: 5000 by default and at most\./);
});

// The final guidance (M5): what the model is told about cua's service, checked against what the service does.
test('the browser documentation teaches cua\'s service: the Chrome rules, the lifted budgets, evaluate in the page with no replay, no prompts, the errors as the model sees them', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '9.8.7'});
  const text = await docs.readBrowser(EXTENSION);
  const guide = DOCUMENTS['cua-browser-service'];
  assert.ok(text.includes(guide), 'the guidance is included in every browser\'s documentation');
  assert.ok(text.indexOf(guide) < text.indexOf('# API Use'), 'ahead of the vendor\'s API use guidance');
  // The Chrome rules.
  assert.match(guide, /DOM-only/);
  assert.match(guide, /`tab\.playwright` locators/);
  assert.match(guide, /Press keys on a focusable element[^\n]*never a frame's or the document's `body`/);
  // The lifted budgets, per phase (actions.mjs: resolution, then dispatch and the load it starts, each get timeoutMs).
  assert.match(guide, /a budget per phase, in milliseconds: 3000 by default, at most 120000/);
  assert.match(guide, /finding its element[^\n]*up to `timeoutMs`, then the action itself and any page load it starts up to `timeoutMs` again/);
  assert.match(guide, /`timeoutMs: 0` makes one attempt per phase, bounded by 3000/);
  assert.match(guide, /`timeout_ms` that covers the whole sequence of calls it awaits/);
  assert.doesNotMatch(guide, /that call's budget|longest budget/, 'timeoutMs is not the whole call\'s bound');
  // evaluate in the main world, and the no-replay rule.
  assert.match(guide, /main world/);
  assert.match(guide, /`fetch`/);
  assert.match(guide, /sent to the page once and never re-run/);
  assert.match(guide, /a timeout cannot roll back what the script already did/);
  const {maxDepth, maxArrayLength, maxObjectKeys, maxStringLength} = RESULT_LIMITS;
  assert.ok(guide.includes(`depth ${maxDepth}, up to ${maxArrayLength} array items and ${maxObjectKeys} keys per object, strings up to ${maxStringLength} characters`));
  // The dropped prompts.
  assert.match(guide, /asks for no approvals of its own/);
  assert.match(guide, /no site policy/);
  // The errors as the model sees them: a plain Error carrying the service's sentence, each quoted as the service says it.
  assert.match(guide, /plain `Error` whose message is the service's sentence; there is no error code/);
  for (const sentence of [
    serviceError('dialog_open', '<type>').message.split(' Use ')[0],
    SELECTOR_DEADLINE_EXCEEDED,
    'strict mode violation:',
    serviceError('tab_not_found', '<id>').message.split('. Existing')[0],
    serviceError('tab_detached').message,
    'Browser use cannot visit the requested page.',
    DEADLINE_SENTENCE,
    'playwright.evaluate was interrupted:',
    serviceError('browser_capability_unavailable', '<id>').message,
    serviceError('unsupported_command', '<type>').message,
  ]) assert.ok(guide.includes(sentence), sentence);
});

test('the vendor\'s guidance is kept where it still holds, and loses what belongs to OpenAI\'s products or to prompts cua does not make', async () => {
  const docs = new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: new Set(), serviceVersion: '9.8.7'});
  const text = await docs.readBrowser(EXTENSION);
  for (const heading of ['# Browser Safety', '# Agent Confirmations Policy', '# Session Naming Guidance', '# External Browser Tab Claiming', '# Tab Cleanup', '# Browser Control Interruption', '# API Use'])
    assert.ok(text.includes(heading), heading);
  assert.doesNotMatch(text, /may prompt user approval/, 'history asks no approval');
  assert.match(DOCUMENTS['api-use-behavior'], /Call `browser\.history\(\)` only when necessary for the request, never speculatively/);
  assert.doesNotMatch(text, /plugin:\/\/|openai-bundled|openai-curated/, 'no Codex app tab mentions');
  assert.match(DOCUMENTS['tab-claiming-chrome'], /call `browser\.user\.openTabs\(\)`, choose the matching returned tab/);
  assert.doesNotMatch(text, /excluding permission prompts/);
  assert.match(text, /type LocatorDownloadMediaOptions = \{\n  timeoutMs\?: number; \/\/ Download timeout in milliseconds; defaults to 120000\.\n\};/);
});
