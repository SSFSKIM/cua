#!/usr/bin/env node
// The two services on one engine (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, M3; the M3 pre-flight's
// M3.2 live proof): the vendor's @oai/sky service and cua's own Linux service (src/services/engine/linux/service.mjs),
// each driving its own process of the same cua-engine build, read the same harness-owned scenes through cua's facade
// (src/cua-api/sky.mjs, a fresh instance per service over a stand-in for the trusted RPC, and bind-linux-app.mjs), and
// every answer the model or the numbering depends on is compared:
//
//   setup                the target and the method list
//   window               the scene's list_windows entry
//   state                getAXState, the rendered state the model reads (element numbers included)
//   tree                 the numbered tree of a full observation: every node's decimal id and native id
//   query                a query observation's rendered tree (the numbering copied, not rebuilt)
//   state-after-query    getAXState again: numbers kept across the query
//   screenshot           the combined observation: its state, and one JPEG screenshot each (sizes recorded)
//   unknown-id           an element number the window never had: the refresh sentence
//   unknown-action       a real element (the first with actions) asked for an action it lacks: the engine's sentence,
//                        reached through the element's number
//
// The steps run in lockstep, the vendor's lane then cua's for each step, on the same window, so both read the same
// moment of the scene; the scenes run in one order in both lanes, so the counter the numbering shares across windows is
// compared too. Nothing that changes a window is sent. Results hold digests and counts, never a tree's text.
//
// usage: node scripts/linux-engine-diff/services.mjs --vendor-js <@oai/sky directory> --engine <cua-engine> --out <dir>
//          [--scenes gedit,chrome,over-budget]
// exit 0 when every step of every scene is equal; the scenes' windows are closed either way.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {Desktop} from './scenes.mjs';

const {values} = parseArgs({options: {'vendor-js': {type: 'string'}, engine: {type: 'string'}, out: {type: 'string'}, scenes: {type: 'string', default: 'gedit,chrome,over-budget'}}});
if (!values['vendor-js'] || !values.engine || !values.out) {
  console.error('usage: services.mjs --vendor-js <@oai/sky directory> --engine <cua-engine> --out <dir> [--scenes gedit,chrome,over-budget]');
  process.exit(2);
}
const SCENES = values.scenes.split(',');
const sha = text => createHash('sha256').update(text).digest('hex');

// The vendor's service reads its engine from OAI_SKY_LINUX_BIN when it first spawns it; cua's from its own settings.
process.env.OAI_SKY_LINUX_BIN = values.engine;
const vendorService = await import(pathToFileURL(join(values['vendor-js'], 'dist/project/cua/sky_js/src/service.js')).href);
const {createService} = await import('../../src/services/engine/linux/service.mjs');
const {bind_linux_app} = await import('../../src/cua-api/bind-linux-app.mjs');
const cuaService = createService({env: {CUA_ENGINE_BIN: values.engine, CUA_DESKTOP_MODE: 'shared'}});

// A facade over `service`, as a kernel has it: its own sky.mjs instance over an rpc that carries values as the trusted
// worker's JSON transport does (undefined crosses as null; non-enumerable functions do not cross).
async function facade(lane, service) {
  globalThis.nodeRepl = {rpc: async (_name, message) => {
    const answer = await service.handleRpc(message);
    return answer === undefined ? null : JSON.parse(JSON.stringify(answer));
  }};
  const {sky} = await import(`../../src/cua-api/sky.mjs?lane=${lane}`);
  return sky;
}
const lanes = [{lane: 'vendor', sky: await facade('vendor', vendorService)}, {lane: 'cua', sky: await facade('cua', cuaService)}];

const settled = async run => { try { return {value: await run()}; } catch (error) { return {error: String(error?.message ?? error)}; } };
const numbered = node => ({id: node.id, native_id: node.native_id, children: node.children.map(numbered)});
const countNodes = node => 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
// A JPEG's width and height, from its first start-of-frame marker.
function jpegSize(bytes) {
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) return [(bytes[i + 7] << 8) | bytes[i + 8], (bytes[i + 5] << 8) | bytes[i + 6]];
    i += 2 + length;
  }
  return null;
}
// The comparable part of a step's outcome, and what the results record of it: a digest and a size, never the text.
const summarize = outcome => {
  const text = JSON.stringify(outcome);
  return {sha256: sha(text), bytes: text.length};
};

// The steps of one scene, run for one lane; `context` carries what a lane's earlier step found (the window, a query).
const STEPS = [
  ['window', async ({sky, scene, ctx}) => (ctx.window = (await sky.list_windows()).find(w => w.id === scene.id))],
  ['state', async ({sky, ctx}) => (ctx.app = bind_linux_app(sky, ctx.window)).getAXState({emit: false})],
  ['tree', async ({sky, ctx}) => {
    const state = await sky.get_window_state({window: ctx.window, include_screenshot: false});
    // the query: the last named node's name, the same in both lanes when their trees are
    const names = [];
    (function visit(node) { if (node.name?.trim()) names.push(node.name.trim()); node.children.forEach(visit); })(state.ax_tree);
    ctx.query = names.at(-1)?.slice(0, 40) ?? 'a';
    // the element for the unknown action: the first node with actions, else the root
    const withActions = [];
    (function visit(node) { if (node.actions?.length) withActions.push(node.id); node.children.forEach(visit); })(state.ax_tree);
    ctx.actionTarget = withActions[0] ?? state.ax_tree.id;
    ctx.nodes = countNodes(state.ax_tree);
    return {source: state.ax_tree_source, tree: numbered(state.ax_tree)};
  }],
  ['query', async ({sky, ctx}) => (await sky.get_window_state({window: ctx.window, query: ctx.query, include_screenshot: false})).ax_tree.to_string()],
  ['state-after-query', async ({ctx}) => ctx.app.getAXState({emit: false})],
  ['screenshot', async ({ctx}) => {
    const {state, screenshot} = await ctx.app.getAXStateAndScreenshot({emit: false});
    ctx.jpeg = screenshot ? {bytes: screenshot.length, size: jpegSize(screenshot)} : null;
    return {state, screenshots: screenshot ? 1 : 0, size: ctx.jpeg?.size ?? null};
  }],
  ['unknown-id', async ({sky, ctx}) => sky.perform_secondary_action({window: ctx.window, element_id: '999999', action: 'expand'})],
  ['unknown-action', async ({sky, ctx}) => sky.perform_secondary_action({window: ctx.window, element_id: ctx.actionTarget, action: 'cua171-no-such-action'})],
];

const desktop = new Desktop({cua: values.engine, run: `services-${process.pid}`});
const rows = [];
const setup = [];
try {
  for (const {sky} of lanes) setup.push({target: sky.target, methods: Object.keys(sky).filter(key => key !== 'target')});
  rows.push({scene: '-', step: 'setup', equal: JSON.stringify(setup[0]) === JSON.stringify(setup[1]), vendor: summarize(setup[0]), cua: summarize(setup[1])});
  for (const name of SCENES) {
    const scene = name === 'gedit' ? await desktop.openGedit('services', 'cua171 services scene\nline two\n')
      : name === 'chrome' ? await desktop.openChrome('services', 'scene.html')
        : name === 'over-budget' ? await desktop.openChrome('services', 'over-budget.html') : null;
    if (!scene) throw new Error(`unknown scene ${name}`);
    const contexts = Object.fromEntries(lanes.map(({lane}) => [lane, {}]));
    for (const [step, run] of STEPS) {
      const outcomes = {};
      for (const {lane, sky} of lanes) outcomes[lane] = await settled(() => run({sky, scene, ctx: contexts[lane]}));
      const row = {scene: name, step, equal: JSON.stringify(outcomes.vendor) === JSON.stringify(outcomes.cua), vendor: summarize(outcomes.vendor), cua: summarize(outcomes.cua)};
      if (outcomes.vendor.error || outcomes.cua.error) Object.assign(row, {vendorError: outcomes.vendor.error ?? null, cuaError: outcomes.cua.error ?? null});
      if (step === 'tree') row.nodes = {vendor: contexts.vendor.nodes, cua: contexts.cua.nodes};
      if (step === 'state' || step === 'state-after-query') row.lines = {vendor: outcomes.vendor.value?.split('\n').length, cua: outcomes.cua.value?.split('\n').length};
      if (step === 'screenshot') row.jpeg = {vendor: contexts.vendor.jpeg, cua: contexts.cua.jpeg};
      rows.push(row);
      console.log(`${row.equal ? 'EQUAL' : 'DIFFERENT'} ${name} ${step}${row.nodes ? ` (${row.nodes.cua} nodes)` : ''}${row.vendorError ? ` [${row.vendorError}]` : ''}`);
    }
  }
} finally {
  await desktop.closeAll();
  cuaService.close();
}

const engineVersion = execFileSync(values.engine, ['--version'], {encoding: 'utf8'}).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
mkdirSync(values.out, {recursive: true});
writeFileSync(join(values.out, 'results.jsonl'), `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
const allEqual = rows.every(row => row.equal);
const table = rows.map(row => `| ${row.scene} | ${row.step} | ${row.equal ? 'equal' : '**different**'} | ${row.nodes?.cua ?? row.lines?.cua ?? ''} | ${row.vendorError ?? ''} |`);
writeFileSync(join(values.out, 'summary.md'), [`# Two services, one engine: ${allEqual ? 'every step equal' : 'DIFFERENCES'}`, '',
  `Engine: \`${engineVersion}\` (${values.engine}); checkout ${commit}; scenes ${SCENES.join(', ')}; ${new Date().toISOString()}.`, '',
  '| scene | step | vendor service vs cua service | nodes / rendered lines (cua) | both lanes\' error |', '|---|---|---|---|---|', ...table, ''].join('\n'));
console.log(allEqual ? 'VERDICT: every step equal' : 'VERDICT: differences');
process.exit(allEqual ? 0 : 1);
