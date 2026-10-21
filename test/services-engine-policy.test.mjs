// The policy of cua's own macOS engine service (src/services/engine/policy.mjs; docs/doperpowers/specs/2026-10-18-own-
// native-engine-design.md, Design "The service", Policy and approvals; Interfaces, Policy): the forbidden list and the
// risk table as data, the vendor's withComputerUsePolicy flow (R/A-contract.md §2.6) asking on every call with the
// message and meta the harness matcher expects, the refusal on anything but accept, the supervisor's approval memory
// keyed on the resolved bundle id, and the engine's generated Swift copy of the list, regenerated and compared here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO} from './fixtures/runtime-fixture.mjs';
import {isTextEditApproval} from '../scripts/accept/lib.mjs';
import {elicitationParams} from '../src/repl-host/elicitation.mjs';
import {approvalMemory} from '../src/mcp/approval-memory.mjs';
import {serverError} from '../src/services/engine/protocol.mjs';
import {
  FORBIDDEN, HIGH_RISK, RISK_SUBTITLE, SWIFT_POLICY_FILE, SYSTEM_SECURITY, approvalRequest, createPolicy, refusal, riskOf, swiftPolicySource,
} from '../src/services/engine/policy.mjs';

const TARGETS = {
  TextEdit: {appPath: '/System/Applications/TextEdit.app', bundleIdentifier: 'com.apple.TextEdit', displayName: 'TextEdit', isRunning: true, pid: 501},
  Terminal: {appPath: '/System/Applications/Utilities/Terminal.app', bundleIdentifier: 'com.apple.Terminal', displayName: 'Terminal', isRunning: true, pid: 502},
  Chrome: {appPath: '/Applications/Google Chrome.app', bundleIdentifier: 'com.google.Chrome', displayName: 'Google Chrome', isRunning: true, pid: 503},
  Tool: {appPath: '/opt/tools/Tool.app', bundleIdentifier: null, displayName: 'Tool', isRunning: false, pid: null},
};
const byString = {...TARGETS, [TARGETS.TextEdit.appPath]: TARGETS.TextEdit, 'com.apple.TextEdit': TARGETS.TextEdit};

// A trusted worker's nodeRepl as the policy uses it, with the client's answers from `answer(request)`; `memory` puts the
// connection's approval memory (cua's proxy, src/mcp/approval-memory.mjs) in front of the client, as a cua session does.
function worker({answer = () => ({action: 'accept', content: null, _meta: {persist: 'session'}}), memory = false, requestMeta = {'x-codex-turn-metadata': {call_id: 'call-7'}}} = {}) {
  const asked = [];
  const meta = [];
  const remembered = approvalMemory();
  const toWorker = message => {
    if (memory) {
      const recalled = remembered.recall({_meta: message.meta});
      if (recalled) return {ok: true, ...recalled, _meta: null};
    }
    asked.push(structuredClone(message));
    const outcome = {ok: true, ...answer(message)};
    if (memory) remembered.record({_meta: message.meta}, outcome);
    return outcome;
  };
  const nodeRepl = {
    requestMeta,
    setResponseMeta: value => meta.push(structuredClone(value)),
    createElicitation: async request => {
      const {ok, ...fields} = toWorker({message: request.message, meta: request.meta ?? null});
      assert.ok(ok);
      return fields;
    },
  };
  return {nodeRepl, asked, meta};
}

function policyFor(options = {}, resolve = async app => { const target = byString[app]; if (!target) throw new Error(`unknown ${app}`); return target; }) {
  const w = worker(options);
  return {...w, policy: createPolicy({nodeRepl: w.nodeRepl, resolve})};
}

test('the forbidden list and the risk table are data: the vendor\'s ids, compared without case', () => {
  for (const id of ['com.apple.keychainaccess', 'com.apple.Passwords', 'com.1password.1password', 'com.1password.safari', 'com.bitwarden.desktop',
    'com.dashlane.dashlanephonefinal', 'com.lastpass.LastPass', 'com.nordsec.nordpass', 'me.proton.pass.electron', 'me.proton.pass.catalyst']) {
    assert.ok(FORBIDDEN.includes(id), id);
  }
  assert.equal(FORBIDDEN.length, 10, 'the vendor\'s list and nothing of cua\'s');
  assert.equal(refusal('com.apple.ScreenContinuity'), null, 'iPhone Mirroring is the vendor\'s to drive (its own bundle-id constant and AppInstructions)');
  assert.deepEqual(SYSTEM_SECURITY, ['com.apple.UserNotificationCenter', 'com.apple.LocalAuthenticationRemoteService', 'com.apple.SecurityAgent']);
  assert.equal(refusal('com.apple.passwords'), 'Computer Use is not allowed to use the app \'com.apple.passwords\' for safety reasons.');
  assert.equal(refusal('com.apple.SecurityAgent'), 'Computer use actions are not allowed for system security process: com.apple.SecurityAgent');
  assert.equal(refusal('com.apple.TextEdit'), null);
  assert.equal(refusal(null), null);

  for (const id of ['com.apple.Terminal', 'com.googlecode.iterm2', 'com.mitchellh.ghostty', 'org.alacritty', 'com.apple.Safari', 'com.google.Chrome',
    'org.mozilla.firefox', 'company.thebrowser.dia', 'com.duckduckgo.macos.browser']) {
    assert.ok(HIGH_RISK.includes(id), id);
    assert.equal(riskOf(id.toUpperCase()), 'high', id);
  }
  assert.equal(riskOf('com.apple.TextEdit'), 'low');
  assert.equal(riskOf('com.google.chrome.for.testing'), 'low', 'Chrome for Testing is in no list');
  assert.equal(riskOf(null), 'low');
});

test('the approval request is the vendor\'s: its message and meta, which the harness matcher accepts once the host makes the MCP request', () => {
  const request = approvalRequest({toolName: 'get_app_state', target: TARGETS.TextEdit, callId: 'call-7'});
  assert.deepEqual(request, {
    message: 'Allow Computer Use to use "TextEdit"?',
    meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: 'low',
      tool_call_id: 'call-7', tool_name: 'get_app_state', tool_params: {app: 'com.apple.TextEdit'},
      tool_params_display: [{name: 'app', display_name: 'App', value: 'TextEdit'}],
    },
  });
  const {params} = elicitationParams({message: request.message, requested_schema: {type: 'object', properties: {}}, meta: request.meta}, {formSupported: true});
  assert.ok(isTextEditApproval({method: 'elicitation/create', params}));

  const high = approvalRequest({toolName: 'click', target: TARGETS.Terminal});
  assert.equal(high.meta.riskLevel, 'high');
  assert.equal(high.meta.subtitle, RISK_SUBTITLE);
  assert.equal('tool_call_id' in high.meta, false);
  assert.deepEqual(Object.keys(high.meta), ['codex_approval_kind', 'connector_id', 'connector_name', 'persist', 'riskLevel', 'subtitle', 'tool_name', 'tool_params', 'tool_params_display']);
  assert.deepEqual(approvalRequest({toolName: 'click', target: TARGETS.Tool}).meta.tool_params, {app: '/opt/tools/Tool.app'}, 'an app without a bundle id is keyed by its path');
});

test('withPolicy: the tool surface reset then named, the approval asked on every call, the action run on the input with app replaced by the resolved path', async () => {
  const {policy, asked, meta} = policyFor();
  const seen = [];
  const input = {app: 'TextEdit', element_index: 3};
  const result = await policy.withPolicy('click', input, (given, target) => { seen.push({given, target, frozen: Object.isFrozen(given)}); return 'done'; });
  assert.equal(result, 'done');
  assert.deepEqual(seen, [{given: {app: TARGETS.TextEdit.appPath, element_index: 3}, target: TARGETS.TextEdit, frozen: true}]);
  assert.equal(input.app, 'TextEdit', 'the caller\'s input is left alone');
  assert.deepEqual(meta, [
    {'codex/toolSurface': {app: null, kind: 'computerUse'}},
    {'codex/toolSurface': {app: {appId: 'com.apple.TextEdit', kind: 'appId'}, kind: 'computerUse'}},
  ]);
  await policy.withPolicy('get_app_state', {app: 'TextEdit'}, () => {});
  assert.equal(asked.length, 2, 'the policy asks on every call; remembering is the host\'s');
  assert.equal(asked[1].meta.tool_call_id, 'call-7');

  const chrome = policyFor();
  await chrome.policy.withPolicy('get_app_state', {app: 'Chrome'}, () => {});
  assert.deepEqual(chrome.meta.at(-1), {'codex/toolSurface': {app: {appId: 'com.google.Chrome', kind: 'appId'}, kind: 'computerUse'}, 'codex/computerUseChrome': true});
});

test('withPolicy: anything but accept fails "Computer Use was not approved to use <app>" and runs nothing', async () => {
  for (const action of ['decline', 'cancel']) {
    const {policy} = policyFor({answer: () => ({action, content: null, _meta: null})});
    let ran = false;
    await assert.rejects(policy.withPolicy('get_app_state', {app: 'TextEdit'}, () => { ran = true; }), error => error.message === 'Computer Use was not approved to use TextEdit');
    assert.equal(ran, false);
  }
});

test('withPolicy: the supervisor\'s memory answers a repeat for the same resolved bundle, whatever string named it, and asks for another app', async () => {
  const {policy, asked} = policyFor({memory: true});
  await policy.withPolicy('get_app_state', {app: 'TextEdit'}, () => {});
  await policy.withPolicy('click', {app: TARGETS.TextEdit.appPath}, () => {});
  await policy.withPolicy('type_text', {app: 'com.apple.TextEdit'}, () => {});
  assert.equal(asked.length, 1, 'one question per app per connection');
  await policy.withPolicy('get_app_state', {app: 'Terminal'}, () => {});
  assert.equal(asked.length, 2);
  const declining = policyFor({memory: true, answer: () => ({action: 'decline', content: null, _meta: null})});
  for (let i = 0; i < 2; i++) await assert.rejects(declining.policy.withPolicy('get_app_state', {app: 'TextEdit'}, () => {}), /not approved/);
  assert.equal(declining.asked.length, 1, 'a decline is remembered too, so a retrying model is not asked again');
});

test('withPolicy: a forbidden app is refused with the vendor\'s sentence before any approval, whether the engine or the policy finds it', async () => {
  const engineRefuses = policyFor({}, async () => { throw serverError({code: -10006, message: 'Computer Use is not allowed to use the app \'com.apple.Passwords\' for safety reasons.', errorName: 'appNotAllowed'}); });
  await assert.rejects(engineRefuses.policy.withPolicy('get_app_state', {app: 'Passwords'}, () => {}),
    error => error.constructor === Error && error.message === 'Computer Use is not allowed to use the app \'com.apple.Passwords\' for safety reasons.');
  assert.equal(engineRefuses.asked.length, 0);

  const resolvesForbidden = policyFor({}, async () => ({appPath: '/Applications/1Password.app', bundleIdentifier: 'com.1password.1password', displayName: '1Password', isRunning: true, pid: 9}));
  await assert.rejects(resolvesForbidden.policy.withPolicy('click', {app: '1Password'}, () => {}),
    error => error.message === 'Computer Use is not allowed to use the app \'com.1password.1password\' for safety reasons.');
  assert.equal(resolvesForbidden.asked.length, 0);
  assert.deepEqual(resolvesForbidden.meta.at(-1)['codex/toolSurface'].app, {appId: 'com.1password.1password', kind: 'appId'});

  const otherFailure = policyFor({}, async () => { throw serverError({code: -10010, message: 'invalidApp', errorName: 'invalidApp'}); });
  await assert.rejects(otherFailure.policy.withPolicy('get_app_state', {app: 'Nope'}, () => {}), error => error.errorName === 'invalidApp');
});

test('withPolicy: the vendor\'s input checks', async () => {
  const {policy} = policyFor();
  const run = input => policy.withPolicy('click', input, () => {});
  await assert.rejects(run(null), {message: 'Computer Use app approval requires an object input'});
  await assert.rejects(run({app: ''}), {message: 'Computer Use app approval requires a non-empty app'});
  await assert.rejects(run({app: '  '}), {message: 'Computer Use app approval requires a non-empty app'});
  await assert.rejects(run({app: 3}), {message: 'Computer Use app approval requires a non-empty app'});
  await assert.rejects(run(Object.defineProperty({}, 'app', {get: () => 'TextEdit', enumerable: true})), {message: 'Computer Use app approval requires app to be a plain data property'});
  await assert.rejects(run(Object.defineProperty({app: 'TextEdit'}, 'x', {get: () => 1, enumerable: true})), {message: 'Computer Use app approval requires x to be a plain data property'});
  const noElicitation = createPolicy({nodeRepl: {setResponseMeta: () => {}}, resolve: async () => TARGETS.TextEdit});
  await assert.rejects(noElicitation.withPolicy('click', {app: 'TextEdit'}, () => {}), {message: 'Computer Use requires nodeRepl.createElicitation'});
});

test('withPolicy: tool_call_id comes from the turn metadata\'s call_id or item_id, as an object or its JSON', async () => {
  for (const [requestMeta, expected] of [
    [{'x-codex-turn-metadata': JSON.stringify({call_id: ' c-1 '})}, 'c-1'],
    [{'x-codex-turn-metadata': {item_id: 'i-2'}}, 'i-2'],
    [{'x-codex-turn-metadata': '{not json'}, undefined],
    [null, undefined],
  ]) {
    const {policy, asked} = policyFor({requestMeta});
    await policy.withPolicy('click', {app: 'TextEdit'}, () => {});
    assert.equal(asked[0].meta.tool_call_id, expected);
  }
});

test('the engine\'s copy of the list, native/engine/Sources/Engine/Policy.generated.swift, is what policy.mjs generates (regenerate: node scripts/generate-engine-policy.mjs)', () => {
  assert.equal(SWIFT_POLICY_FILE, 'native/engine/Sources/Engine/Policy.generated.swift');
  const committed = readFileSync(join(REPO, SWIFT_POLICY_FILE), 'utf8');
  const generated = swiftPolicySource();
  assert.equal(committed, generated, 'the committed Swift policy differs from policy.mjs; run node scripts/generate-engine-policy.mjs');
  for (const id of [...FORBIDDEN, ...SYSTEM_SECURITY]) assert.ok(generated.includes(`"${id.toLowerCase()}"`), id);
  assert.ok(generated.includes('Computer Use is not allowed to use the app \'\\(bundleIdentifier!)\' for safety reasons.'));
  assert.ok(generated.includes('Computer use actions are not allowed for system security process: \\(bundleIdentifier!)'));
});
