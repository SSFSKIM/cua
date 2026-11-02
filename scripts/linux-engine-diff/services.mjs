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
// The truncation line (M4): a rendered state ends with `Accessibility tree truncated: …` when its read carried the
// engine's `truncated`. Equal lanes prove nothing about it, so it is set aside before the lanes are compared and judged
// in each lane on its own: its count is the sum of the `truncated` that lane's service returned for that very read, and
// there is no line when none came. In the cua lane every read a step makes, whether or not the step renders it (the
// query's), must also carry `truncated` exactly when it was cut, as deviations.mjs declares it (services-judge.mjs).
//
// usage: node scripts/linux-engine-diff/services.mjs --vendor-js <@oai/sky directory> --engine <cua-engine> --out <dir>
//          [--scenes gedit,chrome,over-budget]
// exit 0 when every step of every scene is equal across lanes and gives its expected outcome in each (EXPECT below);
// the scenes' windows are closed either way.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {splitTruncationLine} from './normalize.mjs';
import {Desktop} from './scenes.mjs';
import {judgeTruncation} from './services-judge.mjs';

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
// worker's JSON transport does (undefined crosses as null; non-enumerable functions do not cross). `reads` records each
// get_window_state answer the service gives, and whether its request had a query, for the truncation judge.
async function facade(lane, service, reads) {
  globalThis.nodeRepl = {rpc: async (_name, message) => {
    const answer = await service.handleRpc(message);
    if (message.type === 'execute' && message.method === 'get_window_state') reads.push({state: answer ?? {}, filtered: Boolean(message.args?.[0]?.query?.trim())});
    return answer === undefined ? null : JSON.parse(JSON.stringify(answer));
  }};
  const {sky} = await import(`../../src/cua-api/sky.mjs?lane=${lane}`);
  return sky;
}
const lanes = [];
for (const [lane, service] of [['vendor', vendorService], ['cua', cuaService]]) {
  const reads = [];
  lanes.push({lane, reads, sky: await facade(lane, service, reads)});
}

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
    ctx.truncated = state.truncated ?? null;
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

// What each step must give in each lane, beside being equal across lanes: the ordinary steps succeed with their window,
// state, tree or screenshot present; the two negative steps fail with the sentence they exist to reach. An outcome
// that is equal across lanes but not this (both lanes failing alike, a window not found) fails the step.
const isState = value => typeof value === 'string' && value.startsWith('Accessibility source: ') && value.split('\n').length > 1;
const EXPECT = {
  window: o => typeof o.value?.id === 'number',
  state: o => isState(o.value),
  tree: o => typeof o.value?.tree?.id === 'string' && typeof o.value.tree.native_id === 'string' && o.value.tree.children.length > 0,
  query: o => typeof o.value === 'string' && o.value.length > 0,
  'state-after-query': o => isState(o.value),
  screenshot: o => isState(o.value?.state) && o.value.screenshots === 1 && Array.isArray(o.value.size) && o.value.size[0] > 0,
  'unknown-id': o => o.error === 'Unknown element ID 999999 for this window; refresh get_window_state()',
  'unknown-action': o => /^AT-SPI action "cua171-no-such-action" is unavailable/.test(o.error ?? ''),
};

// The steps that render a state, and where the rendered text is in their outcome.
const RENDERED = {state: o => o.value, 'state-after-query': o => o.value, screenshot: o => o.value?.state};

// A step's outcome with its rendered state's truncation line set aside, for the comparison across lanes, and the count
// that line shows (null for no line; undefined for a step that renders no state).
function splitOutcome(step, outcome) {
  const rendered = RENDERED[step]?.(outcome);
  if (typeof rendered !== 'string') return {compared: outcome, shown: undefined};
  const {state, shown} = splitTruncationLine(rendered);
  return {compared: step === 'screenshot' ? {value: {...outcome.value, state}} : {value: state}, shown};
}

const desktop = new Desktop({cua: values.engine, run: `services-${process.pid}`, logs: values.out});
const rows = [];
const setup = [];
try {
  for (const {sky} of lanes) setup.push({target: sky.target, methods: Object.keys(sky).filter(key => key !== 'target')});
  const setupExpected = lane => lane.target === 'linux' && lane.methods.length === 20 && lane.methods.includes('get_window_state');
  const setupEqual = JSON.stringify(setup[0]) === JSON.stringify(setup[1]);
  rows.push({scene: '-', step: 'setup', ok: setupEqual && setupExpected(setup[0]) && setupExpected(setup[1]), equal: setupEqual,
    expected: {vendor: setupExpected(setup[0]), cua: setupExpected(setup[1])}, vendor: summarize(setup[0]), cua: summarize(setup[1])});
  for (const name of SCENES) {
    const scene = name === 'gedit' ? await desktop.openGedit('services', 'cua171 services scene\nline two\n')
      : name === 'chrome' ? await desktop.openChrome('services', 'scene.html')
        : name === 'over-budget' ? await desktop.openChrome('services', 'over-budget.html') : null;
    if (!scene) throw new Error(`unknown scene ${name}`);
    const contexts = Object.fromEntries(lanes.map(({lane}) => [lane, {}]));
    for (const [step, run] of STEPS) {
      const outcomes = {};
      const stepReads = {};
      const read = {};
      for (const {lane, sky, reads} of lanes) {
        outcomes[lane] = await settled(() => run({sky, scene, ctx: contexts[lane]}));
        // the state reads this step made; `read` keeps the last one's `truncated` (null for none), undefined for none
        stepReads[lane] = reads.splice(0);
        read[lane] = stepReads[lane].length ? stepReads[lane].at(-1).state.truncated ?? null : undefined;
      }
      const split = {vendor: splitOutcome(step, outcomes.vendor), cua: splitOutcome(step, outcomes.cua)};
      const equal = JSON.stringify(split.vendor.compared) === JSON.stringify(split.cua.compared);
      const truncation = {};
      for (const {lane} of lanes) {
        const ctx = contexts[lane];
        const judged = judgeTruncation({scene: name, lane, reads: stepReads[lane], whole: ctx.whole ?? null, hydrated: step === 'tree' ? ctx.truncated : undefined, shown: split[lane].shown});
        truncation[lane] = judged.holds;
        ctx.whole = judged.whole;
      }
      const expected = {vendor: EXPECT[step](outcomes.vendor) && truncation.vendor, cua: EXPECT[step](outcomes.cua) && truncation.cua};
      const row = {scene: name, step, ok: equal && expected.vendor && expected.cua, equal, expected, vendor: summarize(split.vendor.compared), cua: summarize(split.cua.compared)};
      if (read.vendor !== undefined || read.cua !== undefined) row.truncated = {vendor: read.vendor ?? null, cua: read.cua ?? null};
      if (split.cua.shown !== undefined) row.line = {vendor: split.vendor.shown, cua: split.cua.shown};
      if (outcomes.vendor.error || outcomes.cua.error) Object.assign(row, {vendorError: outcomes.vendor.error ?? null, cuaError: outcomes.cua.error ?? null});
      if (step === 'tree') row.nodes = {vendor: contexts.vendor.nodes, cua: contexts.cua.nodes};
      if (step === 'state' || step === 'state-after-query') row.lines = {vendor: outcomes.vendor.value?.split('\n').length, cua: outcomes.cua.value?.split('\n').length};
      if (step === 'screenshot') row.jpeg = {vendor: contexts.vendor.jpeg, cua: contexts.cua.jpeg};
      rows.push(row);
      console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.equal ? 'equal' : 'different'} expected=${expected.vendor}/${expected.cua} ${name} ${step}${row.nodes ? ` (${row.nodes.cua} nodes)` : ''}${row.truncated?.cua ? ` truncated ${JSON.stringify(row.truncated.cua)}` : ''}${row.line?.cua != null ? ` line ${row.line.cua}` : ''}${row.vendorError ? ` [${row.vendorError}]` : ''}`);
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
const allPass = rows.every(row => row.ok);
const table = rows.map(row => `| ${row.scene} | ${row.step} | ${row.ok ? 'pass' : '**FAIL**'} | ${row.equal ? 'equal' : '**different**'} | ${row.expected.vendor && row.expected.cua ? 'yes' : `**no** (vendor ${row.expected.vendor}, cua ${row.expected.cua})`} | ${row.nodes?.cua ?? row.lines?.cua ?? ''} | ${row.truncated?.cua ? `${JSON.stringify(row.truncated.cua)}${row.line ? `, line ${row.line.cua}` : ''}` : ''} | ${row.vendorError ?? ''} |`);
writeFileSync(join(values.out, 'summary.md'), [`# Two services, one engine: ${allPass ? 'every step passes' : 'FAILURES'}`, '',
  `Engine: \`${engineVersion}\` (${values.engine}); checkout ${commit}; scenes ${SCENES.join(', ')}; ${new Date().toISOString()}.`, '',
  'A step passes when the two lanes are equal and each gives the step\'s expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach. The truncation line is set aside before the lanes are compared and judged in each lane: its count is the `truncated` that lane\'s service returned for the read, and every read the cua lane\'s steps make, the query\'s included, carries `truncated` exactly when it was cut (deviations.mjs; the over-budget page is built with both limits\' cuts).', '',
  '| scene | step | verdict | vendor service vs cua service | expected outcome | nodes / rendered lines (cua) | truncated, line count (cua) | both lanes\' error |', '|---|---|---|---|---|---|---|---|', ...table, ''].join('\n'));
console.log(allPass ? 'VERDICT: every step passes' : 'VERDICT: failures');
process.exit(allPass ? 0 : 1);
