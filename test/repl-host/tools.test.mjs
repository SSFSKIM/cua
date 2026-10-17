// HostMcp's contract: the own host's tools are the vendor's base tools, as M0 recorded them through cua's proxy, and its
// argument errors are the vendor's sentences (observed on the pinned node_repl, 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {InvalidParams, PROTOCOL_VERSIONS, SERVER_INSTRUCTIONS, initializeResult, jsArguments, resetArguments, toolsFor, turnEndedArguments} from '../../src/repl-host/tools.mjs';
import {REPL_HOST_NAME, REPL_HOST_VERSION} from '../../src/repl-host/identity.mjs';
import {jsRulesFor, modelTools} from '../../src/mcp/surface.mjs';

const recorded = JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json', import.meta.url), 'utf8')).tools;

test('through cua\'s proxy the own host\'s tools are exactly the effective contract M0 recorded from the vendor host', () => {
  const shown = modelTools(toolsFor({sandboxed: true}), {surfaces: ['browser'], platform: 'darwin'});
  assert.deepEqual(shown.filter(t => ['js', 'js_reset'].includes(t.name)), recorded.filter(t => ['js', 'js_reset'].includes(t.name)));
  assert.ok(recorded.find(t => t.name === 'js').description.startsWith(jsRulesFor(['browser'], {platform: 'darwin'})), 'the recorded text is cua\'s rules over the base text');
});

test('the base tools: js, js_reset and the private turn_ended, in the vendor\'s order, without the hidden module-directory tool', () => {
  const tools = toolsFor({sandboxed: true});
  assert.deepEqual(tools.map(t => t.name), ['js', 'js_reset', 'turn_ended']);
  const [js, reset, turnEnded] = tools;
  assert.equal(Object.hasOwn(js.inputSchema.properties.timeout_ms, 'default'), false, 'the 30 s default is advertised in words, never as a schema default');
  assert.deepEqual(js.inputSchema.required, ['code']);
  assert.equal(Object.hasOwn(reset.inputSchema, 'required'), false);
  assert.deepEqual(reset.annotations, {readOnlyHint: true, destructiveHint: false, openWorldHint: false});
  assert.deepEqual(turnEnded.annotations, {idempotentHint: true});
  assert.deepEqual(turnEnded._meta, {ui: {visibility: []}});
  assert.deepEqual(turnEnded.inputSchema.required, ['hook_event_name', 'session_id', 'turn_id']);
  assert.equal(Object.hasOwn(toolsFor({sandboxed: false})[0], 'annotations'), false, 'js is annotated only when the host can sandbox it');
  assert.deepEqual(toolsFor({sandboxed: false})[1].annotations, reset.annotations);
});

test('initialize names cua-repl-host and its version, negotiates the protocol as rmcp 1.5.0 does and advertises the sandbox meta only when it can sandbox', () => {
  const result = initializeResult({protocolVersion: '2025-06-18', sandboxed: true});
  assert.deepEqual(result, {
    protocolVersion: '2025-06-18',
    capabilities: {experimental: {'codex/sandbox-state-meta': {}}, tools: {listChanged: true}},
    serverInfo: {name: REPL_HOST_NAME, version: REPL_HOST_VERSION},
    instructions: SERVER_INSTRUCTIONS,
  });
  for (const version of PROTOCOL_VERSIONS) assert.equal(initializeResult({protocolVersion: version, sandboxed: true}).protocolVersion, version);
  assert.equal(initializeResult({protocolVersion: '2099-01-01', sandboxed: true}).protocolVersion, '2025-11-25');
  assert.equal(initializeResult({sandboxed: true}).protocolVersion, '2025-11-25');
  assert.deepEqual(initializeResult({protocolVersion: '2025-06-18', sandboxed: false}).capabilities, {tools: {listChanged: true}});
});

const refusal = fn => { try { fn(); } catch (error) { assert.ok(error instanceof InvalidParams, error.message); return error.message; } assert.fail('accepted'); };

test('js arguments: code required, timeout_ms a nonzero integer defaulting to 30000, a non-empty title; the vendor\'s sentences otherwise', () => {
  assert.deepEqual(jsArguments({code: '1'}), {code: '1', timeoutMs: 30000});
  assert.deepEqual(jsArguments({code: '1', timeout_ms: 50, title: 'x'.repeat(81)}), {code: '1', timeoutMs: 50, title: 'x'.repeat(81)}, 'the title\'s length limit is advertised, not enforced');
  assert.deepEqual(jsArguments({code: '1', timeout_ms: null, title: null}), {code: '1', timeoutMs: 30000});
  const cases = [
    [{code: '1', timeout_ms: 0}, 'js: invalid value: integer `0`, expected a nonzero u64'],
    [{code: '1', timeout_ms: -1}, 'js: invalid value: integer `-1`, expected a nonzero u64'],
    [{code: '1', timeout_ms: '5'}, 'js: invalid type: string "5", expected a nonzero u64'],
    [{code: '1', timeout_ms: 5.5}, 'js: invalid type: floating point `5.5`, expected a nonzero u64'],
    [{code: '1', title: ''}, 'js: title must be non-empty'],
    [{code: '1', foo: 1}, 'js: unknown field `foo`, expected one of `title`, `code`, `timeout_ms`'],
    [{}, 'js: missing field `code`'],
    [undefined, 'js: missing field `code`'],
    [{code: 5}, 'js: invalid type: integer `5`, expected a string'],
    [{code: null}, 'js: invalid type: null, expected a string'],
  ];
  for (const [args, sentence] of cases) assert.equal(refusal(() => jsArguments(args)), sentence, JSON.stringify(args));
});

test('js_reset takes no arguments, and turn_ended takes three non-empty ids', () => {
  resetArguments({});
  resetArguments(undefined);
  assert.equal(refusal(() => resetArguments({x: 1})), 'js_reset: unknown field `x`, there are no fields');
  assert.deepEqual(turnEndedArguments({hook_event_name: 'Stop', session_id: 's', turn_id: 't'}), {hookEventName: 'Stop', sessionId: 's', turnId: 't'});
  assert.equal(refusal(() => turnEndedArguments({hook_event_name: 'Stop', session_id: 's'})), 'turn_ended: missing field `turn_id`');
  assert.equal(refusal(() => turnEndedArguments({hook_event_name: '', session_id: 's', turn_id: 't'})), 'turn_ended requires non-empty event, session, and turn IDs');
});

test('the launch\'s overrides replace the base text the way the vendor\'s launcher overrides do, and nothing else', async () => {
  const {parseToolOverrides} = await import('../../src/repl-host/tools.mjs');
  const {toolOverrides} = await import('../../src/repl-host/instructions.mjs');
  const overrides = toolOverrides({platform: 'linux', surfaces: ['computer', 'browser']});
  const base = toolsFor({sandboxed: true});
  const effective = toolsFor({sandboxed: true, overrides: parseToolOverrides(JSON.stringify(overrides))});
  assert.equal(effective[0].description, overrides.tools.js.description);
  assert.equal(effective[0].inputSchema.properties.code.description, overrides.tools.js.field_descriptions.code);
  assert.equal(effective[1].description, overrides.tools.js_reset.description);
  const strip = tools => tools.map(({description, inputSchema, ...rest}) => ({...rest, inputSchema: {...inputSchema, properties: Object.fromEntries(Object.entries(inputSchema.properties).map(([k, {description: _d, ...v}]) => [k, v]))}}));
  assert.deepEqual(strip(effective), strip(base), 'schemas, annotations and meta are the base ones');
  assert.deepEqual(effective[2], base[2], 'turn_ended is never overridden');
  assert.equal(initializeResult({protocolVersion: '2025-06-18', sandboxed: true, overrides}).instructions, 'UI automation through cua_repl using the initialized cua API.');
  assert.equal(parseToolOverrides(undefined), null);
  assert.equal(parseToolOverrides(''), null);
  for (const bad of ['{', '[]', '{"tools":{"js":{"description":1}}}', '{"server_instructions":2}', '{"tools":{"js":{"field_descriptions":{"code":null}}}}'])
    assert.throws(() => parseToolOverrides(bad), /CUA_REPL_TOOL_OVERRIDES must be/, bad);
});

test('the effective text is the vendor launcher\'s assembly for each platform and surface set, with only the approved browser edits', async () => {
  const {BROWSER_EDITS, applyEdits, toolOverrides} = await import('../../src/repl-host/instructions.mjs');
  const {readFileSync} = await import('node:fs');
  const read = name => readFileSync(new URL(`../../src/repl-host/instructions/${name}`, import.meta.url), 'utf8');
  for (const platform of ['darwin', 'linux']) {
    const dir = platform === 'darwin' ? 'macos' : 'linux';
    const part = name => read(`${dir}/${name}.md`).trimEnd();
    const browser = applyEdits(read(`${dir}/browser.md`), BROWSER_EDITS).trimEnd();
    assert.deepEqual(toolOverrides({platform, surfaces: ['browser']}).tools.js.description, [part('description'), browser, read('computer-disabled.md').trimEnd(), part('output')].join('\n\n'));
    assert.deepEqual(toolOverrides({platform, surfaces: ['computer']}).tools.js.description, [part('description'), read('browser-disabled.md').trimEnd(), part('computer'), part('output')].join('\n\n'));
    assert.deepEqual(toolOverrides({platform, surfaces: ['computer', 'browser']}).tools.js.description, [part('description'), browser, part('computer'), part('output')].join('\n\n'));
    // The edits remove exactly the excluded in-app browser and MCP Apps lines; every other line is the vendor's.
    const vendorLines = read(`${dir}/browser.md`).split('\n');
    const kept = browser.split('\n');
    assert.deepEqual(vendorLines.filter(line => !kept.includes(line)), [
      'For an existing tab identified by URL in browser context (including the current IAB tab):',
      'To open a URL in the in-app browser (`@Browser`):',
      'let tab = await cua.createBrowserTab("iab", url, { visible: boolean });',
      '- `"mcpapps"`: use `cua.getBrowser({ id: "mcpapps" })` for existing full-screen MCP Apps in the task’s side panel.',
      '- `"iab"` (in-app browser): in `createBrowserTab`, use `visible: true` to show the browser; `false` to keep it hidden.',
    ]);
    assert.doesNotMatch(browser, /iab|IAB|mcpapps|in-app/);
  }
  assert.throws(() => applyEdits('nothing to edit', BROWSER_EDITS), /does not match exactly once/);
  assert.throws(() => toolOverrides({platform: 'win32', surfaces: ['browser']}), /unsupported cua_repl platform=win32/);
});

test('the copies are the pinned vendor bytes (26.928.40906 @oai/cua-repl/instructions)', async () => {
  const {createHash} = await import('node:crypto');
  const {readFileSync} = await import('node:fs');
  const sha = name => createHash('sha256').update(readFileSync(new URL(`../../src/repl-host/instructions/${name}`, import.meta.url))).digest('hex');
  const PINNED = {
    'browser-disabled.md': '6d1be6d881b8b340dabb04d277bfc5c0690fb855031f023bc882284904dd6d9a',
    'code.md': 'c0cc551f6c6116c5276baecc68c1139d25c205570281e02b6ad483526e4bede9', 'computer-disabled.md': 'c34c37e1549a55281eaecf6e29b4878313cfecf5983559a98a6fca1f6d1cf53c',
    'reset.md': '8293a9ec45999391940bdfce1637fb5c4d708f89b5d726b4d03800df9cb795af', 'server.md': '6001fb94250c49c234d96cbe08913ad9340e71e48b1709d8c0d598b46a25ea9e',
    'browser.md': '063027bad00dd242148c8f798a55f420ce5c893547b4d5b352747c8d04e79ed5', 'computer.md': 'e8318bd16b9792b517d300802583961317d7e0cb3a3a4ed776a681ed20f16f7d',
    'description.md': '096e5cea5931c9c23adc839211bfe3764039a2e68dd47b627ae0d8bc22fdaed6', 'output.md': 'e239db8a09d3fb3b2a626e19a64be96da0130374675acf709649bef99430d486',
  };
  for (const [name, hash] of Object.entries(PINNED)) {
    if (['browser.md', 'computer.md', 'description.md', 'output.md'].includes(name)) for (const dir of ['macos', 'linux']) assert.equal(sha(`${dir}/${name}`), hash, `${dir}/${name}`);
    else assert.equal(sha(name), hash, name);
  }
});
