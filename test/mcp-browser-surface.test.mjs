// The browser surface as the model sees it (M11, acceptance C1/C4 at the protocol level): with the browser surface
// the server adds profiles_list, whose description carries the Chrome rules; by default nothing changes. The settings
// parser maps CUA_SHIM_SURFACES to the launcher's surfaces.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertModelSeesText, harness, initialized, UPSTREAM_TOOLS, structured} from './fixtures/mcp-harness.mjs';
import {DEFAULT_HOST_NOTES, LINUX_HOST_NOTES, hostNotesFor, jsRulesFor, SECRETS_LIST_TOOL} from '../src/mcp/surface.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';
import {join} from 'node:path';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {fakeChromeFacts} from './fixtures/chrome-facts.mjs';
import {ACCESS_NOTE} from '../src/profiles/chrome.mjs';
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
  assert.equal(hostNotesFor(['computer'], {platform: 'darwin'}), DEFAULT_HOST_NOTES);
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
  const {guidance, ...fields} = structured(response);
  assert.deepEqual(fields, {status: 'ok', profiles: [
    {key: 'personal', ready: true, extensionInstanceId: 'inst-a'},
    {key: 'work', ready: false, reason: 'extension_not_installed'},
  ]});
  // Claude Code shows the model only a successful result's structured content, so the guidance is there, and the text
  // (for other clients) carries it once, before a JSON line that does not repeat it.
  assert.equal(guidance, 'work is not ready (extension_not_installed): the OpenAI extension is not installed in this Chrome profile (install it there yourself; cua never does).\nTell the user; do not bind or pick a profile for them.');
  assert.equal(response.result.content[0].text, `${guidance}\n${JSON.stringify(fields)}`);
  assertModelSeesText(response);
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
  const {guidance: text, ...fields} = structured(response);
  assert.deepEqual(fields, {status: 'ok', profiles: [
    {key: 'home', ready: false, reason: 'host_not_live'},
    {key: 'personal', ready: false, reason: 'binding_stale'},
    {key: 'school', ready: false, reason: 'backends_unlistable'},
    {key: 'work', ready: true, extensionInstanceId: 'inst-w'},
  ]});
  assert.ok(!/Default|Profile/.test(JSON.stringify(fields)), 'the profile entries carry no directory');
  assert.ok(response.result.content[0].text.startsWith(`${text}\n`), 'the text carries the same guidance');
  assertModelSeesText(response);
  // The user's step happens in that Chrome profile, so the guidance names its directory (never its display name).
  assert.match(text, /home is not ready \(host_not_live\): .*Chrome profile "Profile 3".*click the OpenAI \(ChatGPT\) extension's icon.*then retry/);
  assert.match(text, /personal is not ready \(binding_stale\): .*Chrome profile "Default".*can mint a new instance id.*cua profiles bind personal/);
  assert.match(text, /school is not ready \(backends_unlistable\): .*could not be listed/);
  assert.match(text, /do not bind or pick a profile for them/);
  assert.ok(!/inst-old|inst-s\b|inst-h|Profile 6|Profile 8/.test(text), 'no instance id, and no directory where the user has no step');
});

test('profiles_list with every profile ready has no guidance: the text is its JSON line alone', async () => {
  const h = harness({server: {surfaces: ['browser'], profiles: {list: () => PROFILES.slice(0, 1)}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  assert.deepEqual(structured(response), {status: 'ok', profiles: [{key: 'personal', ready: true, extensionInstanceId: 'inst-a'}]});
  assert.equal(response.result.content[0].text, JSON.stringify(structured(response)));
});

test('a registry that cannot be read is a value-free error, not an empty list', async () => {
  const h = harness({server: {surfaces: ['browser'], profiles: {list: () => { throw Object.assign(new Error('/Users/x/profiles.json is bad'), {code: 'profiles_invalid'}); }}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  assert.equal(response.result.isError, true);
  assert.deepEqual(structured(response), {status: 'error', code: 'profiles_invalid'});
});

// Where each operating rule lives (issue #73; the rules come from the Homework 1b dogfood, issue #23,
// docs/evidence/2026-10-05-homework-1b-dogfooding.md, and the later phases). The server instructions carry the rules
// for every call on every surface, well inside Claude Code's 2,048-character cap on them; a surface's own rules are in
// the description of the tool they govern (profiles_list for Chrome, js for the computer, devices_use for devices),
// ahead of anything Claude Code's 2,048-character cap on a description would cut.
const GENERAL_RULES = {
  'use it when the GUI is the only way; the first js call returns the API docs': /the first js call returns the API docs/,
  'call end_task when the task is done': /Call end_task as soon as the task is done, before your final reply/,
  'an end_task error spends the connection': /An error spends the connection: report it/,
  'one serial controller': /One controller per task, one js call at a time\./,
  'only timeout_ms stops a running cell': /Only timeout_ms stops a running cell, not cancelling/,
  'observe, act, verify': /Observe, act, verify: a call returning is not success/,
  'stop after an unchanged state': /If the state is unchanged, stop and find out why rather than repeat/,
  'batch deterministic steps': /Batch deterministic steps\./,
  'readiness waits, not fixed delays': /Wait for a visible readiness condition in a bounded poll, not a fixed delay/,
  'never read the secret store; type references': /Never read ~\/\.config\/claude-secrets; type secrets as \{\{secret:KEY\}\}/,
  'the surface rules are in the tool descriptions': /Each tool's description carries the rules for its surface/,
};
const MACOS_APPROVAL = /Apps ask for approval once per connection; report a declined app, don't retry\./;
const DEVICES_RULE = /devices_use moves every tool to that machine, under the notes and descriptions it returns; end_task first\./;
const BROWSER_RULES = {
  'getBrowser only with an id from profiles_list, which is asked again on failure': /cua\.getBrowser\(\{extensionInstanceId\}\) only an id profiles_list returned for the profile the user means; if that fails, call profiles_list again/,
  'never pick or bind a profile': /Never pick or bind a profile for the user/,
  'DOM-only tabs': /Chrome tabs are DOM-only: tab\.playwright locators, not native input/,
  'keys go to a focusable element, not a frame body, and cua.type pastes': /never a frame body; tab\.cua\.type pastes/,
  'the fixed 3 s browser action cap and how to wait longer': /Locator actions, waits and evaluate stop at 3 s \(timeoutMs can only shorten it\); to wait longer, loop short waits to your own deadline under a larger js timeout_ms\./,
  'read-only evaluate': /evaluate is read-only: no fetch, no require, objects are non-extensible\./,
  'createBrowserTab limit': /createBrowserTab can take 60 s \(js timeout_ms of at least 60000\)/,
  'leftover tab': /tab may still have opened: tell the user, don't retry/,
  'closing the only window unloads the profile and its host': /closing your tab or end_task unloads it; mark a tab handoff to keep it/,
};
const BROWSER_POINTER = /Chrome: follow the rules in profiles_list's description/;
const COMPUTER_RULES = {
  'element indexes; coordinates in screenshot pixels, downscaled': /Prefer accessibility element indexes; coordinates are screenshot pixels \(apply the host's downscale\)/,
  'role names in the system language': /role names are in the system language/,
  'drop a quit app\'s handle': /Drop a quit app's handle: getAXState\(\) relaunches it\./,
  'typeText drops emoji: paste those': /typeText drops characters the layout cannot key \(emoji\); paste those and multiline text\./,
  'js_reset and rebind, never osascript': /If REPL state is confused, js_reset and rebind; never also use osascript\./,
};
// Phase F: the Linux rules replace the macOS-only ones.
const LINUX_RULES = {
  'bind by X11 window': /cua\.getApp\(\{windowId\}\) with an id from listWindows\(\); if REPL state is confused, js_reset and rebind/,
  'no setValue or selectText; paste types': /setValue and selectText do not exist; paste types like typeText/,
  'GTK3 text views: pressKey, not typeText or paste': /typeText and paste crash GTK3 text views: type there with pressKey/,
  'X keysyms': /one X keysym per call/,
  'element indexes; coordinates in screenshot pixels, downscaled': /Prefer accessibility element indexes; coordinates are screenshot pixels \(apply the host's downscale\)/,
  'no per-app approval': /No app asks for approval: this connection drives every window of the session/,
  'the trusted wrapper is not a boundary': /the trusted wrapper is not a boundary on Linux/,
};
const MACOS_ONLY = /macOS|osascript|getAXState|approval once per connection|typeText drops characters|role names are in the system language/;
const DESCRIPTION_CAP = 2048;
// A vendor js description longer than the cap, as the browser surface's is (2,847 characters with the browser alone,
// 2,952 with both, measured on the 2026-10 pin): cua's rules must come before the cut.
const LONG_VENDOR_JS = `Upstream js description. ${'Vendor text. '.repeat(240)}`;
// The vendor's js description with the computer surface alone, measured on the same pin (macOS): the default surface's
// whole description, cua's rules included, stays within the cap.
const VENDOR_COMPUTER_JS = 1511;
const COMBINATIONS = ['darwin', 'linux'].flatMap(platform => [['computer'], ['browser'], ['computer', 'browser']]
  .flatMap(surfaces => [false, true].map(devices => ({platform, surfaces, devices}))));

async function served({platform, surfaces, devices}) {
  const h = harness({server: {surfaces, platform, devices: devices ? {} : null, profiles: {list: () => []}}});
  const instructions = (await initialized(h)).result.instructions;
  const list = h.client.request('tools/list', {});
  h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS.map(t => (t.name === 'js' ? {...t, description: LONG_VENDOR_JS} : t))});
  const tools = Object.fromEntries((await list.response).result.tools.map(t => [t.name, t]));
  return {instructions, tools};
}

test('the instructions carry the rules for every call on every surface, no surface\'s own rule, and stay under 1,400 characters', async () => {
  for (const {platform, surfaces, devices} of COMBINATIONS) {
    const label = `${platform} ${surfaces.join()}${devices ? ' devices' : ''}`;
    const {instructions} = await served({platform, surfaces, devices});
    assert.equal(instructions, `${UPSTREAM_INSTRUCTIONS}\n\n${hostNotesFor(surfaces, {platform, devices})}`, label);
    for (const [rule, pattern] of Object.entries(GENERAL_RULES)) assert.match(instructions, pattern, `${label}: ${rule}`);
    assert.equal(MACOS_APPROVAL.test(instructions), platform === 'darwin' && surfaces.includes('computer'), `${label}: the per-app approval rule`);
    assert.equal(DEVICES_RULE.test(instructions), devices, `${label}: the devices rule with the device tools only`);
    for (const [rule, pattern] of Object.entries({...BROWSER_RULES, ...COMPUTER_RULES, ...LINUX_RULES}))
      assert.doesNotMatch(instructions, pattern, `${label}: ${rule} is in its tool's description`);
    assert.ok(instructions.length < 1400, `${label}: ${instructions.length} characters`);
  }
  assert.equal(hostNotesFor(['computer'], {platform: 'darwin'}), DEFAULT_HOST_NOTES);
  assert.equal(hostNotesFor(['computer'], {platform: 'linux'}), LINUX_HOST_NOTES);
  assert.equal(hostNotesFor(['browser'], {platform: 'linux'}), hostNotesFor(['browser'], {platform: 'darwin'}), 'the browser-only notes are the same on both');
  assert.equal(settingsFrom({}, {platform: 'linux'}).hostNotes, LINUX_HOST_NOTES);
  assert.equal(settingsFrom({}, {platform: 'darwin'}).hostNotes, DEFAULT_HOST_NOTES);
  assert.equal(settingsFrom({}, {platform: 'darwin', devices: true}).hostNotes, hostNotesFor(['computer'], {platform: 'darwin', devices: true}));
});

test('each surface\'s rules are in the description of its tool, ahead of the 2,048-character cut, and none is lost', async () => {
  for (const {platform, surfaces, devices} of COMBINATIONS) {
    const label = `${platform} ${surfaces.join()}${devices ? ' devices' : ''}`;
    const {instructions, tools} = await served({platform, surfaces, devices});
    const seen = name => tools[name]?.description.slice(0, DESCRIPTION_CAP) ?? '';
    const computer = surfaces.includes('computer');
    const browser = surfaces.includes('browser');

    // js: cua's rules, then the vendor's description and schema unchanged.
    const js = tools.js;
    assert.equal(js.description, `${jsRulesFor(surfaces, {platform})}\n\n${LONG_VENDOR_JS}`, `${label}: cua's rules prepended`);
    assert.deepEqual(js.inputSchema, UPSTREAM_TOOLS[0].inputSchema, `${label}: the vendor's schema`);
    assert.ok(jsRulesFor(surfaces, {platform}).length + 2 < DESCRIPTION_CAP, `${label}: cua's rules are never cut`);
    for (const [rule, pattern] of Object.entries(COMPUTER_RULES)) {
      if (!(platform === 'linux' && /element indexes/.test(rule))) assert.equal(pattern.test(seen('js')), computer && platform === 'darwin', `${label}: js ${rule}`);
    }
    for (const [rule, pattern] of Object.entries(LINUX_RULES))
      assert.equal(pattern.test(seen('js')), computer && (platform === 'linux' || /element indexes/.test(rule)), `${label}: js ${rule}`);
    assert.equal(BROWSER_POINTER.test(seen('js')), browser, `${label}: js points to profiles_list's rules`);

    // profiles_list: the Chrome rules, whole.
    assert.equal(Boolean(tools.profiles_list), browser, label);
    if (browser) {
      for (const [rule, pattern] of Object.entries(BROWSER_RULES)) assert.match(seen('profiles_list'), pattern, `${label}: profiles_list ${rule}`);
      assert.ok(tools.profiles_list.description.length <= DESCRIPTION_CAP, `${label}: profiles_list ${tools.profiles_list.description.length}`);
    }

    // devices_use: what a switch returns, and that it then applies.
    assert.equal(Boolean(tools.devices_use), devices, label);
    if (devices) {
      assert.match(seen('devices_use'), /returns that machine's host notes \(hostNotes\) and its own js and profiles_list descriptions \(tools\): while it is the target, follow those instead of this server's/, label);
      assert.match(seen('devices_use'), /Refused with task_open while a task is open: call end_task first/, label);
      assert.ok(tools.devices_use.description.length <= DESCRIPTION_CAP, label);
    }

    // Nothing the model sees on Linux carries a macOS-only rule.
    if (platform === 'linux') for (const text of [instructions, ...Object.keys(tools).map(seen)]) assert.doesNotMatch(text, MACOS_ONLY, label);
  }
  assert.ok(jsRulesFor(['computer'], {platform: 'darwin'}).length + 2 + VENDOR_COMPUTER_JS <= DESCRIPTION_CAP, 'the default surface\'s js description is never cut');
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
  const {guidance: text, ...fields} = structured(response);
  assert.deepEqual(fields, {status: 'ok', profiles: [
    {key: 'personal', ready: true, extensionInstanceId: 'inst-p'},
    {key: 'school', ready: false, reason: 'chrome_data_unreadable'},
    {key: 'work', ready: false, reason: 'chrome_data_unreadable'},
  ]});
  assert.ok(response.result.content[0].text.startsWith(`${text}\n`), 'the text carries the same guidance');
  assertModelSeesText(response);
  assert.match(text, /school is not ready \(chrome_data_unreadable\): this process cannot read Chrome's data directory .*not confirmed live/);
  assert.ok(text.includes(ACCESS_NOTE), 'the OS\'s access fix is named');
  assert.match(text, /work is not ready \(chrome_data_unreadable\): .*not bound yet/);
  assert.match(text, /Tell the user/);
  assert.ok(!/EPERM|Default|Profile 8/.test(JSON.stringify(structured(response))), 'no error codes, and no directory where the user has no step, in what the model sees');
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

// On Linux there is no secrets backend: secrets_list says so instead of teaching references Linux refuses.
test('secrets_list teaches the reference on both platforms; on Linux without setValue, which does not exist there', async () => {
  const {modelTools} = await import('../src/mcp/surface.mjs');
  const secretsTool = (surfaces, platform) => modelTools(UPSTREAM_TOOLS, {surfaces, platform}).find(t => t.name === 'secrets_list');
  assert.deepEqual(secretsTool(['computer'], 'darwin'), SECRETS_LIST_TOOL);
  assert.match(SECRETS_LIST_TOOL.description, /\/secret KEY in Claude Code or `cua secrets set KEY`/);
  assert.match(secretsTool(['computer', 'browser'], 'darwin').description, /whole value of setValue or of a Chrome tab's locator\.fill/);
  for (const surfaces of [['computer'], ['browser'], ['computer', 'browser']]) {
    const tool = secretsTool(surfaces, 'linux');
    assert.match(tool.description, /"\{\{secret:<label>\}\}" as the whole text of typeText or paste/, surfaces.join());
    assert.doesNotMatch(tool.description, /setValue|unsupported_platform/, surfaces.join());
    assert.equal(/locator\.fill/.test(tool.description), surfaces.includes('browser'), surfaces.join());
    assert.deepEqual(tool.inputSchema, SECRETS_LIST_TOOL.inputSchema);
    assert.deepEqual(tool.annotations, SECRETS_LIST_TOOL.annotations);
  }
});

// ---- MAWS (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, "profiles_list") ----------------------

const MAWS_RULE = '- In MAWS: cua.getBrowser() with no id is this session\'s in-app browser (key maws). Use a Chrome profile only when the user names one.';

test('with a MAWS backend configured, profiles_list lists maws ahead of the profiles and its description says the in-app browser is the default, under the cap', async () => {
  const entries = [{key: 'maws', ready: true, extensionInstanceId: 'maws:app-1'}, ...PROFILES.slice(0, 1)];
  for (const {platform, surfaces, devices} of COMBINATIONS.filter(c => c.surfaces.includes('browser'))) {
    const label = `${platform} ${surfaces.join()}${devices ? ' devices' : ''}`;
    const h = harness({server: {surfaces, platform, devices: devices ? {} : null, inAppBrowser: true, profiles: {list: () => entries}}});
    await initialized(h);
    const list = h.client.request('tools/list', {});
    h.upstream.reply(await h.upstream.nextRequest('tools/list'), {tools: UPSTREAM_TOOLS});
    const tool = (await list.response).result.tools.find(t => t.name === 'profiles_list');
    const lines = tool.description.split('\n');
    const first = lines.findIndex(line => line.startsWith('- Give cua.getBrowser'));
    assert.equal(lines[first], '- Give cua.getBrowser({extensionInstanceId}) only an id profiles_list returned for the profile the user means; if that fails, call profiles_list again.', `${label}: the first rule loses its last sentence`);
    assert.equal(lines[first + 1], MAWS_RULE, label);
    assert.doesNotMatch(tool.description, /Never pick or bind a profile for the user/, label);
    assert.ok(tool.description.length <= DESCRIPTION_CAP, `${label}: ${tool.description.length}`);
    const response = await h.client.call('profiles_list').response;
    assert.deepEqual(structured(response).profiles, [{key: 'maws', ready: true, extensionInstanceId: 'maws:app-1'}, {key: 'personal', ready: true, extensionInstanceId: 'inst-a'}]);
  }
  const plain = harness({server: {surfaces: ['browser'], profiles: {list: () => []}}});
  const description = (await toolsOf(plain)).find(t => t.name === 'profiles_list').description;
  assert.ok(!description.includes('In MAWS'), 'without a MAWS backend the description is unchanged');
});

test('maws unreachable reads as not ready with the reason and the step, never with an instance id', async () => {
  const h = harness({server: {surfaces: ['browser'], inAppBrowser: true, profiles: {list: () => [{key: 'maws', ready: false, reason: 'maws_unreachable'}]}}});
  await initialized(h);
  const response = await h.client.call('profiles_list').response;
  const {guidance, ...fields} = structured(response);
  assert.deepEqual(fields.profiles, [{key: 'maws', ready: false, reason: 'maws_unreachable'}]);
  assert.match(guidance, /^maws is not ready \(maws_unreachable\): MAWS is not running or this session's browser socket is gone, so start MAWS and call profiles_list again; or cua's peer check is unavailable and its relay refuses the browser service \(cua doctor's maws\.hosts row says why\)\./);
});
