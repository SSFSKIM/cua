// The browser surface as the model sees it (M11, acceptance C1/C4 at the protocol level): with the browser surface
// the server adds profiles_list and the three Chrome host notes; by default nothing changes. The settings parser maps
// CUA_SHIM_SURFACES to the launcher's surfaces.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness, initialized, UPSTREAM_TOOLS, structured} from './fixtures/mcp-harness.mjs';
import {DEFAULT_HOST_NOTES, hostNotesFor, SECRETS_LIST_TOOL} from '../src/mcp/surface.mjs';
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
  assert.match(text, /personal is not ready \(binding_stale\): .*Chrome profile "Default".*mints a new (instance )?id.*cua profiles bind personal/);
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

test('the browser host notes carry the three Chrome rules and keep the instructions within 2048 characters', async () => {
  for (const surfaces of [['browser'], ['computer', 'browser']]) {
    const notes = hostNotesFor(surfaces);
    assert.match(notes, /profiles_list/, surfaces.join());
    assert.match(notes, /cua\.getBrowser\(\{extensionInstanceId\}\); if that fails, call profiles_list again/);
    assert.match(notes, /tab\.playwright/);
    assert.match(notes, /timeout_ms of at least 60000/);
    assert.match(notes, /tab may still have opened/);
    assert.match(notes, /end_task/);
    const h = harness({server: {surfaces, profiles: {list: () => []}}});
    const instructions = (await initialized(h)).result.instructions;
    assert.equal(instructions, `${UPSTREAM_INSTRUCTIONS}\n\n${notes}`);
    assert.ok(instructions.length <= 2048, `${surfaces.join()}: ${instructions.length} characters`);
  }
  assert.ok(!/osascript|getAXState\(\) on it relaunches/.test(hostNotesFor(['browser'])), 'native-only notes stay out of a browser-only connection');
  assert.ok(hostNotesFor(['computer', 'browser']).startsWith(DEFAULT_HOST_NOTES), 'the native notes are kept whole beside the browser ones');
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
