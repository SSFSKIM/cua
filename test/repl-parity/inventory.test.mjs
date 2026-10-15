import {rowCovered,verifyUnitProofs,secretProofContract} from '../../scripts/repl-parity/coverage.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import scenarios from './scenarios/index.mjs';

const inventoryUrl = new URL('./inventory.json', import.meta.url);
const surfaceUrl = new URL('../../docs/doperpowers/research/2026-10-14-own-repl-host/surface-inventory.md', import.meta.url);
const spec = 'docs/doperpowers/specs/2026-10-14-own-repl-host-design.md';
const platforms = ['darwin', 'linux'];
const milestones = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];
const slug = text => text.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
const contractId = (kind, object, name) => `${kind}/${slug(object)}/${slug(name)}`;
const sorted = values => [...values].sort();

// Table 1, not its prose totals, is the membership oracle. Keep escaped TS union pipes inside cells.
export function parseSurface(text) {
  const table = text.match(/^## Table 1 — INCLUDED\s*\n([\s\S]*?)^## Table 2\b/m)?.[1];
  assert.ok(table, 'missing included Table 1');
  const rows = table.split('\n').filter(line => line.startsWith('|') && !/^\|(?: Kind |---)/.test(line)).map(line => {
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map(cell => cell.trim().replaceAll('\\|', '|'));
    assert.equal(cells.length, 8, `malformed Table 1 row: ${line}`);
    const [kind, object, name, declaration, source, implementation, service, behavior] = cells;
    assert.ok(['member', 'type'].includes(kind), `unknown Table 1 kind: ${kind}`);
    return {id: contractId(kind, object, name), kind, object, name, declaration,
      source: source.replaceAll('`', ''), implementation, service, behavior};
  });
  assert.ok(rows.length, 'empty included Table 1');
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'colliding Table 1 ids');
  return rows;
}

export function memberMilestone(contract) {
  if (contract.object === 'host nodeRepl') return 'M1';
  // Full native/Target contracts include M3 binder doubles AND M4 live Linux observations/errors.
  if (['App', 'Target (App + decorated Tab)'].includes(contract.object)
      || contract.object === 'cua' && ['computer', 'computer.target', 'computer.launch_app', 'getApp', 'listApps', 'listWindows'].includes(contract.name)) return 'M4';
  return 'M3';
}

// Hidden cases assert get/in/ownKeys/descriptors, or unavailable IDs for capability collections.
// Advertised cases exercise the same contract on the existing capability host, never a skip.
function hidden(contract) {
  return /Capability|^WebMcpTools$/.test(contract.object)
    || contract.object === 'browser AXAPI' // parent Tab.ax is provider-gated
    || contract.object === 'browser BrowserUser' // parent Browser.user is absent on CDP
    || /"unsupportedByDefaultIn":\[[^\]]*"(?:extension|cdp)"/.test(contract.behavior);
}

export function memberCases(contract) {
  const tail = contract.id.slice('member/'.length);
  if (contract.object === 'host nodeRepl') return contract.name === 'write'
    ? ['cells/output/write-values', 'cells/output/write-ids']
    : [...imageCases(), 'cells/output/image-acknowledgement', 'cells/output/ordered-images', 'cells/output/unawaited-emissions'];
  // api/ includes source-grounded platform binder doubles; native/ is Linux-only live proof.
  if (memberMilestone(contract) === 'M4') return [`api/${tail}`, `native/${tail}`];
  return hidden(contract) ? [`hidden/${tail}`, `capability-host/${tail}`] : [`api/${tail}`];
}

// Mirror browser-parity's scenario IDs: slash-separated IDs, default-exported scenario objects.
// Task 3 resolves these IDs to runnable scenarios (id, milestone, cells, assert, contracts: [row.id]).
// Type rows share the consuming/returning member cases; no type-only scenario can claim coverage.
function scope(contract) {
  return contract.object === 'first-call named type' || ['cua', 'App', 'Target (App + decorated Tab)', 'decorated Tab'].includes(contract.object)
    ? ['first-call named type', 'browser named type', 'capability named type']
    : contract.object === 'capability named type' || /Capability|^WebMcpTools$/.test(contract.object)
      ? ['capability named type', 'browser named type', 'first-call named type']
      : ['browser named type', 'capability named type', 'first-call named type'];
}

export function typeConsumers(contracts) {
  const types = contracts.filter(row => row.kind === 'type');
  const references = contract => new Set([...contract.declaration.split(/<br><br>(?:type|interface) /)[0].matchAll(/\b[A-Z][A-Za-z0-9]*\b/g)].flatMap(([name]) => {
    const match = scope(contract).map(object => types.find(type => type.object === object && type.name === name)).find(Boolean);
    return match && match.id !== contract.id ? [match.id] : [];
  }));
  const result = new Map(types.map(type => [type.id, []]));
  for (const member of contracts.filter(row => row.kind === 'member')) {
    const seen = references(member);
    // Named structural aliases and returned collection methods are consumers even without an annotation token.
    for (const type of types) if (type.name === member.object || type.name === member.object.replace(/^browser /, '')
      || type.name === 'BrowserProvider' && (member.object === 'cua' && member.name === 'browsers'
        || member.object === 'browser Browsers' && ['get', 'list'].includes(member.name))
      || type.name === 'BrowserManagementNamespace' && member.object.startsWith('ManagementBrowserCapability.')) seen.add(type.id);
    const queue = [...seen];
    for (const id of queue) for (const next of references(types.find(type => type.id === id))) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    for (const id of seen) result.get(id).push(member);
  }
  return result;
}

const behaviorGroups = {
  M1: {
    bindings: 'persistent redeclare ordinary-error-partial-bindings',
    await: 'top-level',
    imports: 'dynamic static-refused process-global-refused process-module-refused builtins',
    globals: 'node-repl-immutable tmp-dir-immutable context env-frozen-allowlist request-meta rpc-configured-only string-codegen-refused wasm-codegen-refused',
    timeouts: 'default-30000 explicit-short fresh-heap late-reply-generation-fence',
    reset: 'clears-bindings preserves-task-id generation-fence fresh-banner',
    errors: 'thrown-cell-recovery vendor-sentences-is-error',
    output: 'write-values write-ids console-grouping-newlines ordered-content ordered-images unawaited-emissions image-acknowledgement',
    images: 'invalid-url empty-url unknown-bytes empty-bytes invalid-object invalid-mime rejected-promise',
    lifecycle: 'running-cancellation-eventual-result control-traffic-while-running eof-settles-no-replay child-exit-settles owned-group-teardown',
    confinement: 'default scoped disabled trusted-write-root-overlap linux-fail-closed no-unsandboxed-fallback',
  },
  M2: {
    output: 'structured-content-and-meta',
    elicitation: 'accept decline cancel content-and-meta unsupported-form malformed-reply accepted-response-persistence',
    budget: 'suspend-resume nested-suspension remaining-budget approval-and-startup-waits',
    hooks: 'after-success after-ordinary-error sequential-after-code background-drain submitted-code-phase separate-positive-timeouts unregister concurrent-best-effort-turn-end turn-end-deadlines end-task-after-hooks deduplicated-turn-end',
    trusted: 'realpath-roots symlink-escape-refused no-privileges-through-cell-import lazy-service-cache execution-request-correlation message-only-error-boundary response-meta emit-content-item-order privileged-env-allowlist no-account-telemetry-app-server',
    'native-pipe': 'absolute-path connect-timeout base64-correlation frozen-interface data-close-error',
    'launch-services': 'open-application-macos-boundary',
  },
  M3: {
    facade: 'emit-false-state emit-false-screenshot emit-false-combined initial-tab-snapshot dom-only-input-refusal all-settled-inventory',
    documentation: 'first-call-core-policy-bytes browser-docs-before-state emit-false-keeps-first-use-docs core-once browser-once rewrite-cached-order rewrite-same-request-meta-suppressed rewrite-later-request-meta reset-timeout-fresh-bootstrap confirmations-policy-override auxiliary-other-browser-apis',
    profiles: 'bounded-inventory-own-host',
  },
};
const imageFormats = ['png', 'jpeg', 'webp'];
const byteForms = ['buffer', 'uint8array', 'arraybuffer', 'arraybuffer-view'];
const imageForms = ['data-url', 'file-url', ...byteForms, ...byteForms.map(form => `object-${form}`)];
function imageCases() {
  return imageFormats.flatMap(format => imageForms.flatMap(form => [false, true].map(promised =>
    `cells/emit-image/${format}/${form}${promised ? '-promised' : ''}`)));
}

// Acceptance 6's whole-field substitution boundary is intentionally more specific than "secrets work".
// Each browser method is checked on execute AND executeWithRecovery; native Mac paths use doubles only.
const secretRefusals = 'invalid-label reserved-label unsupported-shape coerced-method extra-fields disabled unavailable unknown-label unsafe-store unreadable-store';
const secretBrowser = [
  ...['execute', 'execute-with-recovery'].flatMap(method => ['fill', 'ax-paste', 'ax-type-text', 'ax-set-value'].map(shape => `${method}/${shape}`)),
  ...secretRefusals.split(' ').map(name => `refuse/${name}`),
  'refuse/service-version', 'errors/rejection-sanitized', 'errors/recovery-envelope-sanitized', 'errors/worker-rejection-message-only',
  'no-substitution/embedded-marker', 'no-substitution/unsupported-fields', 'no-substitution/evaluate-strings', 'no-substitution/cdp-strings',
  'optional-fields/timeouts-and-text-format', 'reports/labels-not-values',
];
const secretNative = [
  ...secretRefusals.split(' ').map(name => `refuse/${name}`),
  'errors/post-read-sanitized', 'errors/worker-rejection-message-only',
  'no-substitution/embedded-marker', 'no-substitution/unsupported-methods-and-fields', 'no-substitution/javascript-strings', 'reports/labels-not-values',
];

export function requiredBehaviors() {
  const rows = [];
  const add = (kind, tail, milestone, source, applicable = platforms) => rows.push({
    id: `${kind}/${tail}`, kind, source, platforms: applicable, milestone,
    cases: [`${kind === 'cell' ? 'cells' : 'secrets'}/${tail}`],
  });
  for (const [milestone, groups] of Object.entries(behaviorGroups)) for (const [group, names] of Object.entries(groups)) {
    for (const name of names.split(' ')) add('cell', `${group}/${name}`, milestone, `${spec}#verification-and-acceptance`,
      group === 'launch-services' ? ['darwin'] : group === 'confinement' && name === 'linux-fail-closed' ? ['linux'] : platforms);
  }
  for (const id of imageCases()) add('cell', id.slice('cells/'.length), 'M1', `${spec}#verification-and-acceptance`);
  for (const name of secretBrowser) add('secret', `browser/${name}`, 'M3', 'src/services/browser.mjs');
  for (const name of secretNative) add('secret', `native/${name}`, 'M4', 'src/services/sky.mjs');
  for (const name of ['paste', 'type-text', 'set-value']) add('secret', `native/darwin/${name}`, 'M4', 'src/services/sky.mjs', ['darwin']);
  add('secret', 'native/linux/type-text', 'M4', 'src/services/sky.mjs', ['linux']);
  return rows.map(secretProofContract);
}

export function validateInventory(rows, contracts) {
  assert.ok(Array.isArray(rows), 'inventory must be an array');
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length, 'duplicate inventory id');
  const behavior = requiredBehaviors();
  const expected = new Map([...contracts, ...behavior].map(row => [row.id, row]));
  assert.deepEqual(sorted(rows.map(row => row.id)), sorted(expected.keys()), 'exact Table 1 and cell/secret membership');
  const consumers = typeConsumers(contracts);
  for (const row of rows) {
    assert.deepEqual(sorted(Object.keys(row)), sorted(['cases', 'id', 'kind', 'milestone', 'platforms', ...(row.proofs?['proofs']:[]), ...(row.kind==='secret'?['liveRequired',...(row.unitCases?['unitCases','unitProof']:[])]:[]), 'source']), row.id);

    assert.match(row.id, /^(member|type|cell|secret)\/[a-z0-9.-]+(?:\/[a-z0-9.-]+)+$/);
    const contract = expected.get(row.id);
    assert.equal(row.kind, contract.kind, `${row.id}: kind`);
    assert.equal(row.source, contract.source, `${row.id}: source`);
    assert.ok(milestones.includes(row.milestone), `${row.id}: invalid due milestone`);
    assert.deepEqual(row.platforms, contract.platforms ?? platforms, `${row.id}: applicable platforms (negative assertions count)`);
    assert.ok(Array.isArray(row.cases) && row.cases.length, `${row.id}: non-empty cases required`);
    assert.equal(new Set(row.cases).size, row.cases.length, `${row.id}: duplicate case`);
    for (const id of row.cases) assert.match(id, /^(api|native|hidden|capability-host|cells|secrets)\/[a-z0-9.-]+(?:\/[a-z0-9.-]+)+$/, `${row.id}: invalid case id`);
    if (row.kind === 'member') {
      assert.equal(row.milestone, memberMilestone(contract), `${row.id}: due milestone`);
      assert.deepEqual(sorted(row.cases), sorted(memberCases(contract)), `${row.id}: member/hidden/advertised cases`);
    } else if (row.kind === 'type') {
      const linked = consumers.get(row.id);
      assert.ok(linked.length, `${row.id}: no consuming/returning member`);
      const cases = new Set(linked.flatMap(memberCases));
      assert.deepEqual(sorted(row.cases), sorted(cases), `${row.id}: type must link its consuming/returning cases`);
      const due = linked.map(memberMilestone).sort().at(-1);
      assert.equal(row.milestone, due, `${row.id}: due with linked consumers`);
    } else {
      assert.equal(row.milestone, contract.milestone, `${row.id}: due milestone`);
      assert.deepEqual(row.cases, contract.cases, `${row.id}: required behavior case`);
      if(row.kind==='secret')for(const key of ['liveRequired','unitCases','unitProof'])assert.deepEqual(row[key],contract[key],`${row.id}: ${key} proof obligation`);
    }
    const proofs=Object.fromEntries(row.cases.flatMap(id=>{const scenario=scenarios.find(s=>s.id===id);const proof=scenario?.boundaryProof??(scenario?.backend==='binder-double'?'binder-double':undefined);return proof?[[id,proof]]:[];}));
    assert.deepEqual(row.proofs??{},proofs,`${row.id}: evidence proof kind must match its executable lane`);
  }
}

export function stageInventory(rows, through, executableCases = new Set(), passedUnitProofs = new Set()) {
  assert.ok(milestones.includes(through), `invalid --through milestone: ${through}`);
  const due = rows.filter(row => milestones.indexOf(row.milestone) <= milestones.indexOf(through));
  const pending = rows.filter(row => !due.includes(row));
  const covered = due.filter(row => rowCovered(row,executableCases,passedUnitProofs));
  const uncovered = due.filter(row => !covered.includes(row));
  return {due, pending, covered, uncovered};
}

function assertCompleteStage(stage) {
  assert.deepEqual(stage.uncovered.map(row => row.id), [], 'due rows lack executable cases (task 3 links the scenario registry)');
}

const contracts = () => parseSurface(readFileSync(surfaceUrl, 'utf8'));
const inventory = () => JSON.parse(readFileSync(inventoryUrl, 'utf8'));

test('Table 1 parser excludes Table 2, retains escaped unions and derives stable object/member IDs', () => {
  const rows = parseSurface('## Table 1 — INCLUDED\n| member | browser Tab | id | `id: string \\| number` | `pin:12` | impl | none | text |\n| type | first-call named type | State | `type State = {};` | `pin:13` | impl | none | text |\n## Table 2 — EXCLUDED\n| member | legacy | gone | x | pin | impl | none | text |');
  assert.deepEqual(rows.map(({id, declaration, source}) => ({id, declaration, source})), [
    {id:'member/browser-tab/id', declaration:'`id: string | number`', source:'pin:12'},
    {id:'type/first-call-named-type/state', declaration:'`type State = {};`', source:'pin:13'},
  ]);
  assert.throws(() => parseSurface('no table'), /missing included Table 1/);
});

test('Table 1 parser fails closed on malformed or unknown contract kinds', () => {
  const document = kind => `## Table 1 — INCLUDED\n| member | cua | id | x | pin | impl | none | text |\n| ${kind} | extra | name | x | pin | impl | none | text |\n## Table 2 — EXCLUDED\n`;
  assert.throws(() => parseSurface(document('unknown')), /unknown Table 1 kind/);
  assert.throws(() => parseSurface(document('member').replace('extra | name |', 'extra |')), /malformed Table 1 row/);
});

test('type links distinguish same-named namespaces and stop at neighboring declarations', () => {
  const consumers = typeConsumers(contracts());
  const ids = id => sorted(consumers.get(id).map(member => member.id));
  assert.deepEqual(ids('type/browser-named-type/clickoptions'), ['member/browser-cuaapi/click']);
  assert.deepEqual(ids('type/first-call-named-type/clickoptions'), ['member/target-app-decorated-tab/click']);
  assert.deepEqual(ids('type/capability-named-type/cdpeventsoptions'), ['member/cdptabcapability/readevents']);
  assert.deepEqual(ids('type/first-call-named-type/browserprovider'), ['member/browser-browsers/get', 'member/browser-browsers/list', 'member/cua/browsers']);
  assert.ok(ids('type/capability-named-type/browsermanagementnamespace').includes('member/managementbrowsercapability.windows/method-string'));
  assert.deepEqual(ids('type/capability-named-type/browserauthfield'), ['member/browserauthtabcapability/request']);
});

test('every included contract and required cell/secret boundary has exact stable membership and linked cases', () => {
  validateInventory(inventory(), contracts());
});

test('inventory rejects removed/extra rows, duplicate IDs, changed sources, invalid stages and missing cases', () => {
  const rows = inventory(), surface = contracts();
  const reject = mutate => { const copy = structuredClone(rows); mutate(copy); assert.throws(() => validateInventory(copy, surface)); };
  reject(rows => rows.splice(rows.findIndex(row => row.kind === 'member'), 1));
  reject(rows => rows.splice(rows.findIndex(row => row.kind === 'type'), 1));
  reject(rows => rows.splice(rows.findIndex(row => row.kind === 'cell'), 1));
  reject(rows => rows.splice(rows.findIndex(row => row.kind === 'secret'), 1));
  reject(rows => rows.push({...rows[0], id:'member/excluded/not-in-table-1'}));
  reject(rows => rows.push(rows[0]));
  reject(rows => { rows[0].source = 'wrong:1'; });
  reject(rows => { rows[0].milestone = 'M6'; });
  reject(rows => { delete rows.find(r=>r.proofs).proofs; });
  reject(rows => { const row=rows.find(r=>r.proofs);row.proofs[Object.keys(row.proofs)[0]]='live'; });
  reject(rows => { rows[0].milestone = 'M5'; });
  reject(rows => { rows[0].cases = []; });
  reject(rows => { rows[0].platforms = ['win32']; });
  reject(rows => { rows[0].cases = ['../not-a-scenario']; });
});

test('capability-hidden members need BOTH ordinary hidden-member and advertised-capability proofs', () => {
  const rows = inventory(), surface = contracts();
  for (const prefix of ['hidden/', 'capability-host/']) {
    const copy = structuredClone(rows), row = copy.find(row => row.cases.some(id => id.startsWith(prefix)));
    assert.ok(row, `missing ${prefix} lane`);
    row.cases = row.cases.filter(id => !id.startsWith(prefix));
    assert.throws(() => validateInventory(copy, surface), /member\/hidden\/advertised cases/);
  }
  const copy = structuredClone(rows), type = copy.find(row => row.kind === 'type');
  type.cases = ['api/unrelated/method'];
  assert.throws(() => validateInventory(copy, surface), /type must link/);
});

test('stage coverage excludes later rows even if their cases exist; M5 rejects every uncovered row', () => {
  const rows = [{id:'early', milestone:'M1', cases:['early']}, {id:'later', milestone:'M3', cases:['later', 'other']}];
  const early = stageInventory(rows, 'M1', new Set(['early', 'later', 'other']));
  assert.deepEqual(early.covered.map(row => row.id), ['early']);
  assert.deepEqual(early.pending.map(row => row.id), ['later']);
  assertCompleteStage(early);
  assert.throws(() => assertCompleteStage(stageInventory(rows, 'M5', new Set(['early', 'later']))), /due rows lack executable/);
  assertCompleteStage(stageInventory(rows, 'M5', new Set(['early', 'later', 'other'])));
  assert.throws(() => stageInventory(rows, 'M1a'), /invalid --through/);
});

// Direct invocation: node test/repl-parity/inventory.test.mjs --through M1 (or --through=M1).
// npm/node --test: CUA_REPL_PARITY_THROUGH=M1. M5 turns on final completeness by selecting M5.
// M0 checks the complete inventory, NOT executable/live coverage. Task 3 populates this set only after
// validating scenario uniqueness, cells, assertions, contracts, platform/backend and due-stage linkage.
test('selected-stage completeness reports later contracts as pending, never covered', t => {
  const flag = process.argv.find(arg => arg.startsWith('--through='));
  const index = process.argv.indexOf('--through');
  const through = flag?.slice('--through='.length) ?? (index < 0 ? process.env.CUA_REPL_PARITY_THROUGH ?? 'M0' : process.argv[index + 1]);
  const executableCases = new Set(scenarios.filter(s=>s.backend!=='secret-double').map(scenario => scenario.id));
  const rows=inventory(),passedUnitProofs=verifyUnitProofs(rows);
  const stage = stageInventory(rows, through, executableCases,passedUnitProofs);
  t.diagnostic(`through ${through}: ${stage.due.length} due; ${stage.covered.length} executable-linked; ${stage.uncovered.length} uncovered (not live parity evidence)`);
  for (const milestone of milestones) {
    const pending = stage.pending.filter(row => row.milestone === milestone);
    if (pending.length) t.diagnostic(`PENDING ${milestone}: ${pending.length} rows; excluded from coverage`);
  }
  assertCompleteStage(stage);
});
