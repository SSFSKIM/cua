// #368: with a MAWS backend configured the agent learns of the in-app browser (key maws) from the texts it reads before
// profiles_list: js's search hint, js's rules and the host notes. Without one every text is what it was.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness, initialized, UPSTREAM_TOOLS} from './fixtures/mcp-harness.mjs';
import {hostNotesFor, jsRulesFor, modelTools} from '../src/mcp/surface.mjs';
import {settingsFrom} from '../src/mcp/server.mjs';

const MAWS_RULE = '- In MAWS: cua.getBrowser() with no id is this session\'s in-app browser (key maws). Use a Chrome profile only when the user names one.';
const JS_MAWS_RULE = '- In MAWS: cua.getBrowser() with no id is this session\'s in-app browser (key maws); its tabs show in the session\'s Browser panel, which the user watches. Use it for any page; it needs no profiles_list call. Where a browser id goes, "maws" or another profiles_list key works too; there is no "iab" browser, and visible does not apply: leave it out. Use a Chrome profile only when the user names one, and then follow profiles_list\'s rules.';
const UPSTREAM_INSTRUCTIONS = 'UI automation through cua_repl using the initialized cua API.';
const CAP = 2048;
const PLATFORMS = ['darwin', 'linux'];
const SURFACE_SETS = [['computer'], ['browser'], ['computer', 'browser']];
const hintOf = (tools, name) => tools.find(t => t.name === name)._meta['anthropic/searchHint'];

test('with a MAWS backend, js\'s search hint names the in-app browser first, and js_reset\'s is unchanged', () => {
  const hint = (surfaces, platform, inAppBrowser) => hintOf(modelTools(UPSTREAM_TOOLS, {surfaces, platform, inAppBrowser}), 'js');
  assert.equal(hint(['computer', 'browser'], 'darwin', true), 'control macos apps, this session\'s MAWS in-app browser and the user\'s chrome profiles: click, type, fill forms, read, screenshot');
  assert.equal(hint(['computer', 'browser'], 'linux', true), 'control linux apps, this session\'s MAWS in-app browser and the user\'s chrome profiles: click, type, fill forms, read, screenshot');
  assert.equal(hint(['browser'], 'darwin', true), 'operate this session\'s MAWS in-app browser and the user\'s chrome browser profiles: open tabs, read pages, fill forms, screenshot');
  for (const platform of PLATFORMS) for (const surfaces of SURFACE_SETS) {
    assert.equal(hintOf(modelTools(UPSTREAM_TOOLS, {surfaces, platform, inAppBrowser: true}), 'js_reset'), hintOf(modelTools(UPSTREAM_TOOLS, {surfaces, platform}), 'js_reset'));
  }
});

test('without the browser surface a MAWS backend changes no text (profiles_list does not exist, nothing names a browser)', () => {
  for (const platform of PLATFORMS) {
    const plain = modelTools(UPSTREAM_TOOLS, {surfaces: ['computer'], platform});
    assert.deepEqual(modelTools(UPSTREAM_TOOLS, {surfaces: ['computer'], platform, inAppBrowser: true}), plain);
    assert.equal(jsRulesFor(['computer'], {platform, inAppBrowser: true}), jsRulesFor(['computer'], {platform}));
    assert.equal(hostNotesFor(['computer'], {platform, inAppBrowser: true}), hostNotesFor(['computer'], {platform}));
  }
});

test('with a MAWS backend, js\'s rules carry the in-app browser rule itself, ahead of the Chrome pointer and under the cap', () => {
  for (const platform of PLATFORMS) for (const surfaces of [['browser'], ['computer', 'browser']]) {
    const label = `${platform} ${surfaces.join()}`;
    const rules = jsRulesFor(surfaces, {platform, inAppBrowser: true});
    const lines = rules.split('\n');
    const rule = lines.indexOf(JS_MAWS_RULE);
    assert.ok(rule > 0, `${label}: the rule is there`);
    assert.ok(JS_MAWS_RULE.indexOf('needs no profiles_list call') < JS_MAWS_RULE.indexOf('Chrome profile'), `${label}: the exemption comes before the Chrome sentence`);
    assert.match(lines[rule + 1], /^- Chrome: follow the rules in profiles_list's description/, `${label}: the Chrome pointer follows`);
    assert.equal(lines.length, jsRulesFor(surfaces, {platform}).split('\n').length + 1, `${label}: one line added`);
    assert.ok(rules.length + 2 < CAP, `${label}: not cut`);
  }
});

test('with a MAWS backend, the host notes gain one short line after the head, and the initialize answer stays within 2,048 characters', async () => {
  const feedbackDir = '~/Developer/GitHub/MAWS/plugin/cua/dogfood-feedback';
  for (const platform of PLATFORMS) for (const surfaces of [['browser'], ['computer', 'browser']]) for (const devices of [false, true]) {
    const label = `${platform} ${surfaces.join()}${devices ? ' devices' : ''}`;
    const options = {platform, devices, feedbackDir};
    const plain = hostNotesFor(surfaces, options).split('\n');
    const maws = hostNotesFor(surfaces, {...options, inAppBrowser: true}).split('\n');
    assert.equal(maws.length, plain.length + 1, label);
    assert.equal(maws[2], MAWS_RULE, `${label}: reuses the rule's wording, after the title and the head`);
    assert.deepEqual([...maws.slice(0, 2), ...maws.slice(3)], plain, `${label}: nothing else moves`);
    const settings = settingsFrom({CUA_SHIM_SURFACES: surfaces.join(), CUA_FEEDBACK_DIR: feedbackDir}, {platform, devices, inAppBrowser: true});
    assert.equal(settings.hostNotes, maws.join('\n'), label);
    const h = harness({server: {...settings, devices: devices ? {} : null, inAppBrowser: true, profiles: {list: () => []}}});
    const instructions = (await initialized(h)).result.instructions;
    assert.equal(instructions, `${UPSTREAM_INSTRUCTIONS}\n\n${maws.join('\n')}`, label);
    assert.ok(instructions.length <= CAP, `${label}: ${instructions.length} characters`);
  }
});

test('settingsFrom names the in-app browser in the notes only when told a backend is configured and the browser surface is on; a custom note is left alone', () => {
  for (const platform of PLATFORMS) {
    assert.equal(settingsFrom({CUA_SHIM_SURFACES: 'computer,browser'}, {platform, inAppBrowser: true}).hostNotes, hostNotesFor(['computer', 'browser'], {platform, inAppBrowser: true}));
    assert.equal(settingsFrom({CUA_SHIM_SURFACES: 'computer,browser'}, {platform}).hostNotes, hostNotesFor(['computer', 'browser'], {platform}));
    assert.equal(settingsFrom({}, {platform, inAppBrowser: true}).hostNotes, hostNotesFor(['computer'], {platform}));
  }
  assert.equal(settingsFrom({CUA_SHIM_SURFACES: 'browser', CUA_SHIM_HOST_NOTES: 'Custom.'}, {inAppBrowser: true}).hostNotes, 'Custom.');
});

// The no-backend texts are pinned: a digest of every hint, rule block, description and host-notes text for each
// platform, surface set and devices choice, recorded before #368 (the older tests compare these texts with themselves),
// re-recorded when secrets_list's description gained the masked-field rule (ruling 1ea561bc:795, 798), and again when
// #405 narrowed its length sentence to what the screen shows, on every platform (the macOS observation reads such a
// field as `secure text`, with no length).
function noBackendTexts() {
  const texts = [];
  for (const platform of PLATFORMS) for (const surfaces of SURFACE_SETS) for (const devices of [false, true]) {
    const tools = modelTools(UPSTREAM_TOOLS, {surfaces, platform, devices});
    texts.push(hostNotesFor(surfaces, {platform, devices}), hostNotesFor(surfaces, {platform, devices, feedbackDir: '~/fb'}),
      jsRulesFor(surfaces, {platform}), hintOf(tools, 'js'), hintOf(tools, 'js_reset'), tools.find(t => t.name === 'js').description,
      JSON.stringify(modelTools(UPSTREAM_TOOLS, {surfaces, platform, devices, inAppBrowser: false})));
  }
  return texts;
}
test('without a MAWS backend every hint, js rule block and host note is byte for byte what it was before #368', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(noBackendTexts())).digest('hex'), '32526b74c1e8fbbd76ed1ab30c244bf30bffd90cb76ddf418eb465063ef5f3ca');
});
