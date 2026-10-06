// The browser surface as the model sees it (M11, acceptance C1/C4 at the protocol level): with the browser surface
// the server adds profiles_list and the Chrome host notes; by default nothing changes. The settings parser maps
// CUA_SHIM_SURFACES to the launcher's surfaces.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness, initialized, UPSTREAM_TOOLS, structured} from './fixtures/mcp-harness.mjs';
import {DEFAULT_HOST_NOTES, LINUX_HOST_NOTES, hostNotesFor, SECRETS_LIST_TOOL} from '../src/mcp/surface.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';
import {addProfile, bindProfile} from '../src/profiles/registry.mjs';
import {profileReadiness} from '../src/profiles/commands.mjs';

const UPSTREAM_INSTRUCTIONS = 'UI automation through cua_repl using the initialized cua API.';

async function toolsOf(h) {
  await initialized(h);
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  return (await list.response).result.tools;
}

const PROFILES = [
  {key: 'personal', chromeProfileDirectory: 'Default', ready: true, extensionInstanceId: 'inst-a', boundAt: '2026-10-03T00:00:00.000Z'},
  {key: 'work', chromeProfileDirectory: 'Profile 8', ready: false, reason: 'extension_not_installed'},
];

test('by default the surface is unchanged: four tools, the native host notes, no profiles_list', async () => {
  const h = harness();
  const tools = await toolsOf(h);
  assert.deepEqual(tools.map(t => t.name), ['js', 'js_reset', 'end_task', 'secrets_list']);
  assert.equal(tools.find(t => t.name === 'secrets_list').description, SECRETS_LIST_TOOL.description);
  assert.equal(hostNotesFor(['computer']), DEFAULT_HOST_NOTES);
  const call = await h.client.call('profiles_list').response;
  assert.equal(call.error.code, -32602);
});

test('with the browser surface, profiles_list is the fifth tool and returns keys, readiness and instance ids only', async () => {
  const h = harness({server: {surfaces: ['computer', 'browser'], profiles: {list: () => PROFILES}}});
  const tools = await toolsOf(h);
  assert.deepEqual(tools.map(t => t.name), ['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list']);
  const tool = tools.find(t => t.name === 'profiles_list');
  assert.deepEqual(tool.inputSchema, {type: 'object', properties: {}, additionalProperties: false});
  assert.equal(typeof tool._meta['anthropic/searchHint'], 'string');
  assert.match(tools.find(t => t.name === 'secrets_list').description, /locator\.fill/, 'secret references are documented for Chrome fills too');
  const response = await h.client.call('profiles_list').response;
  assert.deepEqual(structured(response), {status: 'ok', profiles: [
    {key: 'personal', ready: true, extensionInstanceId: 'inst-a'},
    {key: 'work', ready: false, reason: 'extension_not_installed'},
  ]});
  assert.ok(!JSON.stringify(response).includes('Profile 8') && !JSON.stringify(response).includes('Default'), 'no directory names');
  assert.equal(h.upstream.calls('profiles_list').length, 0, 'answered by the server');
});

test('profiles_list hides a stale, sleeping or unverifiable binding\'s instance id and says what the user has to do', async () => {
  const bound = {chromeProfileDirectory: 'Default', extensionInstanceId: 'inst-old', boundAt: '2026-10-03T00:00:00.000Z'};
  const h = harness({server: {surfaces: ['browser'], profiles: {list: async () => [
    {key: 'home', ...bound, chromeProfileDirectory: 'Profile 3', extensionInstanceId: 'inst-h', ready: false, reason: 'host_not_live'},
    {key: 'personal', ...bound, ready: false, reason: 'binding_stale'},
    {key: 'school', ...bound, chromeProfileDirectory: 'Profile 6', extensionInstanceId: 'inst-s', ready: false, reason: 'backends_unlistable'},
    {key: 'work', chromeProfileDirectory: 'Profile 8', ready: true, extensionInstanceId: 'inst-w'},
  ]}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  assert.equal(response.result.isError, false);
  assert.deepEqual(structured(response), {status: 'ok', profiles: [
    {key: 'home', ready: false, reason: 'host_not_live'},
    {key: 'personal', ready: false, reason: 'binding_stale'},
    {key: 'school', ready: false, reason: 'backends_unlistable'},
    {key: 'work', ready: true, extensionInstanceId: 'inst-w'},
  ]});
  assert.ok(!/Default|Profile/.test(JSON.stringify(structured(response))), 'the structured entries carry no directory');
  const text = response.result.content[0].text;
  // The user's step happens in that Chrome profile, so the guidance names its directory (never its display name).
  assert.match(text, /home is not ready \(host_not_live\): .*Chrome profile "Profile 3".*click the OpenAI \(ChatGPT\) extension's icon.*then retry/);
  assert.match(text, /personal is not ready \(binding_stale\): .*Chrome profile "Default".*can mint a new instance id.*cua profiles bind personal/);
  assert.match(text, /school is not ready \(backends_unlistable\): .*could not be listed/);
  assert.match(text, /do not bind or pick a profile for them/);
  assert.ok(!/inst-old|inst-s\b|inst-h|Profile 6|Profile 8/.test(text), 'no instance id, and no directory where the user has no step');
});

test('a registry that cannot be read is a value-free error, not an empty list', async () => {
  const h = harness({server: {surfaces: ['browser'], profiles: {list: () => { throw Object.assign(new Error('/Users/x/profiles.json is bad'), {code: 'profiles_invalid'}); }}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  assert.equal(response.result.isError, true);
  assert.deepEqual(structured(response), {status: 'error', code: 'profiles_invalid'});
});

// The operating rules from the Homework 1b dogfood (issue #23,
// docs/evidence/2026-10-05-homework-1b-dogfooding.md): the general ones on every surface, the Chrome ones with the
// browser surface only.
const GENERAL_RULES = {
  'call end_task when the task is done': /Call end_task as soon as the task is done, before your final reply/,
  'one serial controller': /One controller per task, one js call at a time\./,
  'observe, act, verify': /Observe, act, verify: a call returning is not success/,
  'stop after an unchanged state': /If the state is unchanged, stop and find out why rather than repeat/,
  'readiness waits, not fixed delays': /Wait for a visible readiness condition in a bounded poll, not a fixed delay/,
};
const BROWSER_RULES = {
  'getBrowser only with an id from profiles_list, which is asked again on failure': /cua\.getBrowser\(\{extensionInstanceId\}\) only an id profiles_list returned for the profile the user means; if that fails, call profiles_list again/,
  'never pick or bind a profile': /Never pick or bind a profile for the user/,
  'DOM-only tabs': /tab\.playwright/,
  'keys go to a focusable element, not a frame body, and cua.type pastes': /never a frame body; tab\.cua\.type pastes/,
  'the fixed 3 s browser action cap and how to wait longer': /Locator actions, waits and evaluate stop at 3 s \(timeoutMs can only shorten it\); to wait longer, loop short waits to your own deadline under a larger js timeout_ms\./,
  'read-only evaluate': /evaluate is read-only: no fetch, no require, objects are non-extensible\./,
  'createBrowserTab limit': /timeout_ms of at least 60000/,
  'leftover tab': /tab may still have opened/,
  'closing the only window unloads the profile and its host': /closing your tab or end_task unloads it; mark a tab handoff/,
};

test('the host notes carry every operating rule for their surfaces and keep the instructions within 2048 characters', async () => {
  for (const surfaces of [['computer'], ['browser'], ['computer', 'browser']]) {
    const notes = hostNotesFor(surfaces, {platform: 'darwin'});
    const browser = surfaces.includes('browser');
    for (const [rule, pattern] of Object.entries(GENERAL_RULES)) assert.match(notes, pattern, `${surfaces.join()}: ${rule}`);
    for (const [rule, pattern] of Object.entries(BROWSER_RULES)) {
      if (browser) assert.match(notes, pattern, `${surfaces.join()}: ${rule}`);
      else assert.doesNotMatch(notes, pattern, `${surfaces.join()} has no Chrome rule: ${rule}`);
    }
    const h = harness({server: {surfaces, hostNotes: notes, profiles: {list: () => []}}});
    const instructions = (await initialized(h)).result.instructions;
    assert.equal(instructions, `${UPSTREAM_INSTRUCTIONS}\n\n${notes}`);
    assert.ok(instructions.length <= 2048, `${surfaces.join()}: ${instructions.length} characters`);
  }
  assert.doesNotMatch(hostNotesFor(['browser'], {platform: 'darwin'}), /osascript|getAXState\(\) on it relaunches/, 'native-only notes stay out of a browser-only connection');
  assert.ok(hostNotesFor(['computer', 'browser'], {platform: 'darwin'}).startsWith(DEFAULT_HOST_NOTES), 'the native notes are kept whole beside the browser ones');
});

// Phase F: the Linux constant replaces the macOS-only sentences and fits the same 2,048-character budget beside the
// vendor's line, on every surface combination.
const LINUX_RULES = {
  'bind by X11 window': /cua\.getApp\(\{windowId\}\) with an id from listWindows\(\)/,
  'no element setters, paste types': /setValue and selectText do not exist; paste types/,
  'X keysyms': /Key names are X keysyms/,
  'no per-app approval': /No app asks for approval: this connection drives every window of the session/,
  'the trusted wrapper is not a boundary': /the trusted wrapper is not a boundary on Linux/,
};
const MACOS_ONLY = /macOS|osascript|getAXState|approval once per connection|typeText drops characters|role names are in the system language/;

test('the Linux host notes carry the Linux rules, none of the macOS-only ones, and fit 2048 characters on every surface', async () => {
  assert.equal(hostNotesFor(['computer'], {platform: 'linux'}), LINUX_HOST_NOTES);
  for (const surfaces of [['computer'], ['browser'], ['computer', 'browser']]) {
    const notes = hostNotesFor(surfaces, {platform: 'linux'});
    for (const [rule, pattern] of Object.entries(GENERAL_RULES)) assert.match(notes, pattern, `linux ${surfaces.join()}: ${rule}`);
    for (const [rule, pattern] of Object.entries(LINUX_RULES)) {
      if (surfaces.includes('computer')) assert.match(notes, pattern, `linux ${surfaces.join()}: ${rule}`);
      else assert.doesNotMatch(notes, pattern, `linux ${surfaces.join()} has no computer rule: ${rule}`);
    }
    for (const [rule, pattern] of Object.entries(BROWSER_RULES)) if (surfaces.includes('browser')) assert.match(notes, pattern, `linux ${surfaces.join()}: ${rule}`);
    assert.doesNotMatch(notes, MACOS_ONLY, `linux ${surfaces.join()}`);
    const h = harness({server: {surfaces, hostNotes: notes, profiles: {list: () => []}}});
    const instructions = (await initialized(h)).result.instructions;
    assert.equal(instructions, `${UPSTREAM_INSTRUCTIONS}\n\n${notes}`);
    assert.ok(instructions.length <= 2048, `linux ${surfaces.join()}: ${instructions.length} characters`);
  }
  assert.equal(hostNotesFor(['browser'], {platform: 'linux'}), hostNotesFor(['browser'], {platform: 'darwin'}), 'the Chrome notes are the same on both');
  assert.equal(settingsFrom({}, {platform: 'linux'}).hostNotes, LINUX_HOST_NOTES);
  assert.equal(settingsFrom({}, {platform: 'darwin'}).hostNotes, DEFAULT_HOST_NOTES);
});

test('CUA_SHIM_SURFACES selects computer (default), browser or both, and anything else is refused', () => {
  assert.deepEqual(settingsFrom({}).surfaces, ['computer']);
  assert.deepEqual(settingsFrom({CUA_SHIM_SURFACES: 'browser'}).surfaces, ['browser']);
  assert.deepEqual(settingsFrom({CUA_SHIM_SURFACES: 'computer,browser'}).surfaces, ['computer', 'browser']);
  assert.deepEqual(settingsFrom({CUA_SHIM_SURFACES: 'browser, computer'}).surfaces, ['computer', 'browser']);
  for (const bad of ['', 'iab', 'computer,computer', 'computer,browser,iab', ','])
    assert.throws(() => settingsFrom({CUA_SHIM_SURFACES: bad}), error => error.code === 'invalid_setting', JSON.stringify(bad));
});

test('profiles_list with unreadable Chrome data: a bound live profile is ready, the rest say why and the agent is told to tell the user', async t => {
  const s = scratch();
  t.after(s.cleanup);
  const home = join(s.dir, 'cua');
  const chrome = fakeChromeFacts({Default: {extension: 'unreadable'}, 'Profile 8': {extension: 'unreadable'}, 'Profile 6': {directory: 'unreadable'}});
  addProfile({home, key: 'personal', directory: 'Default', chrome});
  addProfile({home, key: 'school', directory: 'Profile 6', chrome});
  addProfile({home, key: 'work', directory: 'Profile 8', chrome});
  bindProfile({home, key: 'personal', extensionInstanceId: 'inst-p'});
  bindProfile({home, key: 'school', extensionInstanceId: 'inst-s'});
  const listBackends = async () => ({backends: [{instanceId: 'inst-p', family: 'chrome'}], teardown: {confirmed: true, steps: ['eof']}});
  const h = harness({server: {surfaces: ['browser'], profiles: {list: async () => (await profileReadiness({home, chrome, listBackends})).profiles}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  assert.deepEqual(structured(response), {status: 'ok', profiles: [
    {key: 'personal', ready: true, extensionInstanceId: 'inst-p'},
    {key: 'school', ready: false, reason: 'chrome_data_unreadable'},
    {key: 'work', ready: false, reason: 'chrome_data_unreadable'},
  ]});
  const text = response.result.content[0].text;
  assert.match(text, /school is not ready \(chrome_data_unreadable\): this process cannot read Chrome's data directory .*Full Disk Access.*not confirmed live/);
  assert.match(text, /work is not ready \(chrome_data_unreadable\): .*not bound yet/);
  assert.match(text, /Tell the user/);
  assert.ok(!/EPERM|Default|Profile 8/.test(JSON.stringify(structured(response))), 'no error codes or directory names in the model-visible list');
});

// The tools' search hints name the platform too (spike #12 (d)): Linux says linux, macOS keeps its exact hints.
test('search hints say linux on Linux and keep their macOS wording on macOS, on every surface', async () => {
  const {modelTools} = await import('../src/mcp/surface.mjs');
  const hints = tools => Object.fromEntries(tools.map(t => [t.name, t._meta?.['anthropic/searchHint']]));
  assert.deepEqual(hints(modelTools(UPSTREAM_TOOLS, {surfaces: ['computer'], platform: 'darwin'})), {
    js: 'control macos apps through their gui (computer use): click, type, read the screen, screenshot',
    js_reset: 'reset the computer-use session for macos gui control',
    end_task: 'finish end complete the current macos gui computer-use task',
    secrets_list: 'list stored secret credential labels for computer-use typing',
  });
  assert.equal(hints(modelTools(UPSTREAM_TOOLS, {surfaces: ['computer', 'browser'], platform: 'darwin'})).js, 'control macos apps and the user\'s chrome browser profiles: click, type, fill forms, read, screenshot');
  for (const surfaces of [['computer'], ['browser'], ['computer', 'browser']]) {
    const tools = modelTools(UPSTREAM_TOOLS, {surfaces, platform: 'linux'});
    assert.doesNotMatch(JSON.stringify(tools.map(t => t._meta)), /macos/i, surfaces.join());
    if (surfaces.includes('computer')) assert.match(hints(tools).js, /linux/);
  }
  const h = harness({server: {surfaces: ['computer'], platform: 'linux', profiles: {list: () => []}}});
  await initialized(h);
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
  const served = (await list.response).result.tools;
  assert.match(hints(served).js, /linux/);
  assert.equal(settingsFrom({}, {platform: 'linux'}).platform, 'linux');
});
