// #494: the first cell that selects a browser on cua's own host must be shown inline by the MCP client, not saved to a
// file. Claude Code (2.1.330, measured 2026-11-23 with a stdio MCP server and `claude -p`) keeps a tool result inline up
// to 50,000 characters of text, summed over its text items, and saves a longer one to a file, MAX_MCP_OUTPUT_TOKENS
// raised or not (that knob governs only its separate 25,000-token limit, far above documentation of this size). The
// first cell carries the core (cua.core) and the selected browser's first-use documentation (cua.browser.<id>), so both
// are measured together, as the bootstrap emitter writes them, under every core the own host emits with the browser
// surface: browser alone (MAWS), with a macOS computer surface (agent-cursor.md, the largest) and with a Linux one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create_bootstrap_emitter} from '../../src/cua-api/bootstrap-emitter.mjs';
import {create_documentation, read_documentation} from '../../src/cua-api/documentation.mjs';
import {setup_browser} from '../../src/cua-api/browser-api.mjs';
import {Documentation} from '../../src/browser-service/docs.mjs';
import {API_MANIFEST, disabledMemberIds} from '../../src/browser-service/manifest.mjs';
import {browserSelection} from '../../src/browser-service/browsers.mjs';
import {SERVICE_VERSION} from '../../src/browser-service/index.mjs';

const INLINE_LIMIT = 50_000;
// The first cell's documentation leaves the cell's own output at least 5% of the limit in the largest configuration
// (a macOS computer surface); without it the margin is far wider.
const TARGET = 47_500;
// The Tab interface is on the first screen of the browser's documentation.
const TAB_WITHIN = 7_000;

// The documentation the service builds for cua's host: the facade's exclusions and undocumented members, as the
// service's runtime passes them (src/browser-service/index.mjs), with no launch addendum (cua sets none).
function serviceDocumentation() {
  const options = setup_browser({setupBrowserRuntime: given => given, exclude_browser_confirmations: create_documentation(read_documentation).exclude_browser_confirmations});
  return new Documentation({apiManifest: API_MANIFEST, disabledMemberIds: disabledMemberIds({}), serviceVersion: SERVICE_VERSION, ...options});
}

// A browser as cua's native host announces it (src/chrome/host.mjs getInfo): MAWS's in-app browser carries its
// profileName and a maws: instance.
const announced = (extensionInstanceId, profileName) => ({type: 'extension', family: 'chrome', name: 'cua', version: '1.0.0',
  capabilities: {browser: [{id: 'viewport'}], tab: []}, metadata: {extensionInstanceId, ...(profileName ? {profileName} : {})}});
const SELECTIONS = {
  'MAWS': {selection: browserSelection({}, 'extension:2', announced('maws:app-1', 'MAWS')), keys: {maws: 'maws:app-1', personal: 'inst-personal'},
    name: 'MAWS in-app browser (maws)'},
  'a Chrome profile': {selection: browserSelection({}, 'extension:1', announced('inst-personal')), keys: {maws: 'maws:app-1', personal: 'inst-personal'}, name: 'cua'},
};
const CORES = {'browser alone': {}, 'a macOS computer surface': {agentCursor: () => true}, 'a Linux computer surface': {linuxEngine: () => true}};

// The named outputs of a first cell `await cua.getBrowser(...)`: the bootstrap's emit, then getBrowser's.
async function firstCell(docs, {selection, keys}, core) {
  const writes = [];
  const saved = globalThis.nodeRepl;
  globalThis.nodeRepl = {requestMeta: null, env: {}, write: (text, name) => { writes.push({name, text}); }};
  try {
    const emitter = create_bootstrap_emitter(create_documentation(read_documentation, core));
    await emitter.emit();
    const browser = {browserId: selection.id, documentation: () => docs.readBrowser(selection, {browserKeys: keys})};
    await emitter.load_browser_documentation(browser);
    await emitter.emit(undefined, {browser});
  } finally {
    globalThis.nodeRepl = saved;
  }
  return writes;
}

for (const [label, selected] of Object.entries(SELECTIONS)) {
  test(`the first getBrowser() cell on ${label} stays under the inline target, with the Tab interface on its first screen`, async () => {
    for (const [surfaces, core] of Object.entries(CORES)) {
      const writes = await firstCell(serviceDocumentation(), selected, core);
      assert.deepEqual(writes.map(({name}) => name), ['cua.core', `cua.browser.${selected.selection.id}`], surfaces);
      const total = writes.reduce((sum, {text}) => sum + text.length, 0);
      assert.ok(total <= TARGET, `${surfaces}: the first cell's documentation is ${total} characters, over the ${TARGET} target (Claude Code saves a result over ${INLINE_LIMIT} to a file)`);
      const browserDocument = writes[1].text;
      assert.ok(browserDocument.includes(`\n# Selected Browser\n- Name: ${selected.name}\n`), `${surfaces}: the Name line`);
      for (const member of ['interface Tab {', '  goto(url: string)', '  markHandoff()', '  markDeliverable()']) {
        const at = browserDocument.indexOf(member);
        assert.ok(at !== -1 && at < TAB_WITHIN, `${surfaces}: ${member.trim()} at ${at}, not within the first ${TAB_WITHIN} characters`);
      }
    }
  });
}

test('every pointer of the first-use documentation leads to a document, and the full API reference stays reachable', async () => {
  const docs = serviceDocumentation();
  await assert.rejects(docs.read('api-reference'), {message: 'Documentation is not available until a browser is selected: api-reference'});
  const text = await docs.readBrowser(SELECTIONS['a Chrome profile'].selection, {browserKeys: SELECTIONS['a Chrome profile'].keys});
  const catalogue = text.split('# Additional Documentation\n')[1].split('\n\n')[0];
  const names = [...catalogue.matchAll(/^- `([^`]+)`: /gmu)].map(([, name]) => name);
  for (const name of ['browser-safety', 'tab-cleanup-chrome', 'cua-browser-service', 'api-use-behavior', 'api-reference']) assert.ok(names.includes(name), name);
  for (const name of names) assert.ok((await docs.read(name)).length > 0, name);
  assert.match(text, /await agent\.documentation\.get\("api-reference"\)/, 'the API Reference names the full one');
  const full = await docs.read('api-reference');
  for (const part of ['interface PlaywrightFrameLocator {', 'interface TabClipboardAPI {', 'type LocatorClickOptions = {', '  evaluateAll<TResult, TArg>', '  downloadMedia('])
    assert.ok(full.includes(part) && !text.includes(part), part);
});
