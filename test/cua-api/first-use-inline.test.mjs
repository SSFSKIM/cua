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
import {kernelNode} from '../repl-host/kernel-harness.mjs';
import {startHost, texts} from '../repl-host/supervisor-harness.mjs';

const {node, skip} = kernelNode();
const own = {skip};

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
  const {selection, keys} = SELECTIONS['a Chrome profile'];
  await assert.rejects(docs.read(`api-reference/${selection.id}`), {message: /^Documentation is not available: api-reference\/extension:1\. Its browser has not been documented/});
  await assert.rejects(docs.read('api-reference'), {message: /^Documentation is not available: api-reference\. Name the browser/});
  const text = await docs.readBrowser(selection, {browserKeys: keys});
  const catalogue = text.split('# Additional Documentation\n')[1].split('\n\n')[0];
  const names = [...catalogue.matchAll(/^- `([^`]+)`: /gmu)].map(([, name]) => name);
  for (const name of ['browser-safety', 'tab-cleanup-chrome', 'cua-browser-service', 'api-use-behavior', 'api-reference/extension:1']) assert.ok(names.includes(name), name);
  for (const name of names) assert.ok((await docs.read(name)).length > 0, name);
  assert.ok(text.includes('nodeRepl.write(await agent.documentation.get("api-reference/extension:1"))'), 'the API Reference names the full one');
  const full = await docs.read('api-reference/extension:1');
  for (const part of ['interface PlaywrightFrameLocator {', 'interface TabClipboardAPI {', 'type LocatorClickOptions = {', '  evaluateAll<TResult, TArg>', '  downloadMedia('])
    assert.ok(full.includes(part) && !text.includes(part), part);
});

test('the api-reference pointer is bound to its browser: after A, B, A each pointer still reads its own backend\'s reference', async () => {
  const docs = serviceDocumentation();
  const a = browserSelection({}, 'extension:1', announced('inst-a'));
  // B's backend does not support selectOption (its apiSupportOverrides), so its reference differs from A's there.
  const b = browserSelection({}, 'extension:2', {...announced('inst-b'), apiSupportOverrides: {'PlaywrightLocator.selectOption': false}});
  const pointer = text => JSON.parse(/nodeRepl\.write\(await agent\.documentation\.get\(("api-reference\/[^"]+")\)\)/u.exec(text)[1]);
  const selectOption = '  selectOption(value: SelectOptionInput';
  const firstA = await docs.readBrowser(a);
  const onB = await docs.readBrowser(b);
  assert.deepEqual([pointer(firstA), pointer(onB)], ['api-reference/extension:1', 'api-reference/extension:2']);
  assert.ok(firstA.includes(selectOption) && !onB.includes(selectOption), 'the summaries differ');
  assert.ok((await docs.read(pointer(firstA))).includes(selectOption), 'A\'s pointer after B was documented reads A\'s reference');
  const againA = await docs.readBrowser(a);
  assert.equal(pointer(againA), 'api-reference/extension:1');
  assert.ok((await docs.read(pointer(againA))).includes(selectOption));
  assert.ok(!(await docs.read(pointer(onB))).includes(selectOption), 'B\'s pointer after A again reads B\'s reference');
});

// Each balanced `nodeRepl.write(…)` call in `text`.
function writeCalls(text) {
  const calls = [];
  for (let at = text.indexOf('nodeRepl.write('); at !== -1; at = text.indexOf('nodeRepl.write(', at + 1)) {
    let depth = 0, end = at;
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++;
      else if (text[end] === ')' && --depth === 0) break;
    }
    calls.push(text.slice(at, end + 1));
  }
  return calls;
}

// On the own host a cell shows only what it writes or logs: an awaited lookup's string is not shown. So every lookup
// the documentation advertises prints its result, and each, run as written in a real kernel under cua's REPL host,
// puts the looked-up text in the visible tool response.
test('every advertised lookup prints its text in the own host\'s visible tool response', own, async t => {
  const docs = serviceDocumentation();
  const {selection, keys} = SELECTIONS['a Chrome profile'];
  const text = await docs.readBrowser(selection, {browserKeys: keys});
  const required = (() => { try { docs.assertRequiredDocumentationRead('tab_cdp_call'); } catch (error) { return error.message; } })();
  const sources = [text, await docs.read(`api-reference/${selection.id}`), required];
  const lookup = /await (?:agent\.documentation\.get\(|\(await \w+\.capabilities\.get\([^)]*\)\)\.documentation\(\)|browser\.documentation\(\))/gu;
  for (const source of sources) for (const match of source.matchAll(lookup))
    assert.equal(source.slice(match.index - 'nodeRepl.write('.length, match.index), 'nodeRepl.write(', `an advertised lookup that shows nothing: ${source.slice(match.index, match.index + 80)}`);
  const examples = [...new Set(sources.flatMap(writeCalls))]
    .map(code => code.replace('"<name>"', '"browser-safety"').replace('.get(id)', '.get("viewport")').replace('.get(name)', '.get("screenshots")'))
    .filter(code => !code.includes('<'));
  assert.ok(examples.length >= 6, examples.join('\n'));
  const host = await startHost(t, {node});
  await host.js('globalThis.agent = {documentation: {get: async name => `LOOKED-UP ${name}`}};'
    + 'const bound = kind => ({documentation: async () => `LOOKED-UP ${kind} documentation`, capabilities: {get: async id => ({documentation: async () => `LOOKED-UP ${kind} capability ${id}`})}});'
    + 'globalThis.browser = bound("browser"); globalThis.tab = bound("tab");');
  assert.ok(!texts(await host.js('await agent.documentation.get("browser-safety")')).join('').includes('LOOKED-UP'), 'the vendor\'s bare form shows nothing (why the examples print)');
  for (const code of examples) assert.match(texts(await host.js(code)).join(''), /LOOKED-UP /u, code);
});
