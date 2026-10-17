// The declared configuration transition (#115): the Linux native fixture moves from its forced `disabled` sandbox to
// the new Linux computer default, `scoped`. A diff of the M0 vendor control against a later own-host run accepts exactly
// that before/after pair on the cases the entry lists, and exactly the cell outcomes it declares; any other change of
// configuration or outcome is still a difference.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareParityRuns, validateExpected, NATIVE_FIXTURE, LINUX_COMPUTER_DEFAULT} from '../../scripts/repl-parity/compare.mjs';

const moved = 'native/cua/computer.target', other = 'native/cua/listapps';
const DISABLED = {surfaces: ['computer'], sandbox: 'disabled'}, SCOPED = {surfaces: ['computer'], sandbox: 'scoped'};
const meta = (host, configuration) => ({host, platform: 'linux', runtimeRelease: '26.928.40906-linux-arm64', service: 'cua', backend: 'native', sandbox: 'per-case',
  surfaces: ['computer', 'browser'], complete: true, caseIds: [moved, other], caseCells: {[moved]: ['exercise', 'end-task'], [other]: ['exercise', 'end-task']},
  caseConfigurations: {[moved]: configuration, [other]: configuration}, caseProofs: {[moved]: 'native-live', [other]: 'native-live'}, connections: ['c1'],
  hostAttestations: [host === 'cua' ? {connection: 'c1', host, serverInfo: {name: 'cua-repl-host', version: '9.9.9'}, executionFacts: {ownNode: {path: '/device/node', version: 'v24.18.0'}}, _meta: {'cua/replHost': {host: 'cua', version: '9.9.9'}}}
    : {connection: 'c1', host, serverInfo: {name: 'rmcp', version: '1.5.0'}, _meta: null}]});
const say = value => [{type: 'text', text: 'NATIVE:' + JSON.stringify(value)}];
const ended = {ok: true, content: [], isError: false, structuredContent: {status: 'ended'}};
const rows = ({target = ['linux'], apps = {found: true}} = {}) => [
  {case: moved, cell: 'exercise', ok: true, content: say(target), isError: false},
  {case: moved, cell: 'end-task', ...ended},
  {case: moved, assertion: {ok: true}},
  {case: other, cell: 'exercise', ok: true, content: say(apps), isError: false},
  {case: other, cell: 'end-task', ...ended},
  {case: other, assertion: {ok: true}},
];
const control = (patch = {}) => ({meta: meta('vendor', DISABLED), tools: {tools: []}, rows: rows(patch)});
const own = (patch = {}, configuration = SCOPED) => ({meta: meta('cua', configuration), tools: {tools: []}, rows: rows(patch)});
const transition = (patch = {}) => ({kind: 'configuration-transition', id: 'linux-computer-default-scoped', issue: '#115',
  reason: 'The Linux native fixture runs under the new Linux computer default (scoped, the kernel confined) instead of a forced disabled sandbox',
  platform: 'linux', field: 'caseConfigurations', before: DISABLED, after: SCOPED, cases: [moved, other], cells: [], ...patch});
const socketGone = {case: moved, cell: 'exercise', before: {content: say(['linux'])}, after: {content: say(['linux', 'no-socket'])}};

test('the transition names the fixture\'s forced configuration and the new Linux computer default', () => {
  assert.deepEqual(NATIVE_FIXTURE, DISABLED);
  assert.deepEqual(LINUX_COMPUTER_DEFAULT, SCOPED);
});

test('without the entry the configuration change is a difference; with it the diff is clean, in either side order', () => {
  const plain = compareParityRuns(control(), own());
  assert.equal(plain.ok, false);
  assert.ok(plain.differences.some(d => d.kind === 'configuration' && d.field === 'caseConfigurations'), JSON.stringify(plain.differences));
  const accepted = compareParityRuns(control(), own(), {expected: [transition()]});
  assert.equal(accepted.ok, true, JSON.stringify(accepted.differences));
  assert.deepEqual(accepted.expected.map(e => [e.kind, e.case, e.field]), [['configuration-transition', moved, 'caseConfigurations'], ['configuration-transition', other, 'caseConfigurations']]);
  assert.equal(compareParityRuns(own(), control(), {expected: [transition()]}).ok, true, 'either side order');
  // Before the transition (both sides on the fixture's configuration) the entry changes nothing.
  assert.equal(compareParityRuns(control(), {...control(), meta: meta('cua', DISABLED)}, {expected: [transition()]}).ok, true);
});

test('the transition accepts only its declared pair, on its listed cases, between a vendor control and the own host', () => {
  const rejected = [
    ['own host under another mode', control(), own({}, {surfaces: ['computer'], sandbox: 'default'})],
    ['own host with another surface set', control(), own({}, {surfaces: ['computer', 'browser'], sandbox: 'scoped'})],
    ['control not on the fixture configuration', {...control(), meta: meta('vendor', SCOPED)}, own()],
    ['both own host', {...own(), meta: meta('cua', DISABLED)}, own()],
    ['another platform', {...control(), meta: {...meta('vendor', DISABLED), platform: 'darwin'}}, {...own(), meta: {...meta('cua', SCOPED), platform: 'darwin'}}],
  ];
  for (const [label, a, b] of rejected) assert.equal(compareParityRuns(a, b, {expected: [transition()]}).ok, false, label);
  // A case the entry does not list keeps the strict rule.
  const unlisted = compareParityRuns(control(), own(), {expected: [transition({cases: [moved]})]});
  assert.equal(unlisted.ok, false);
  assert.deepEqual(unlisted.differences.filter(d => d.kind === 'configuration').map(d => d.case), [other]);
});

test('a cell difference that follows from the transition is accepted only as declared, field for field', () => {
  const changed = own({target: ['linux', 'no-socket']});
  assert.equal(compareParityRuns(control(), changed, {expected: [transition()]}).ok, false, 'undeclared cell difference');
  const accepted = compareParityRuns(control(), changed, {expected: [transition({cells: [socketGone]})]});
  assert.equal(accepted.ok, true, JSON.stringify(accepted.differences));
  assert.ok(accepted.expected.some(e => e.case === moved && e.cell === 'exercise' && e.fields.includes('content')));
  const rejected = [
    ['own side not the declared value', control(), own({target: ['linux', 'something else']})],
    ['control side not the declared value', control({target: ['darwin']}), changed],
    ['another field of the declared cell differs', control(), (() => { const o = own({target: ['linux', 'no-socket']}); o.rows[0].isError = true; return o; })()],
    ['a cell of another case differs', control(), own({target: ['linux', 'no-socket'], apps: {found: false}})],
    ['the transition did not happen', control(), {...own({target: ['linux', 'no-socket']}), meta: meta('cua', DISABLED)}],
  ];
  for (const [label, a, b] of rejected) assert.equal(compareParityRuns(a, b, {expected: [transition({cells: [socketGone]})]}).ok, false, label);
});

test('the entry is refused unless it is exactly the declared transition', () => {
  validateExpected([transition({cells: [socketGone]})]);
  const invalid = [
    ['another before', transition({before: SCOPED})],
    ['another after', transition({after: {surfaces: ['computer'], sandbox: 'default'}})],
    ['a non-native case', transition({cases: [moved, 'cells/bindings/persistent']})],
    ['no cases', transition({cases: []})],
    ['duplicate cases', transition({cases: [moved, moved]})],
    ['another platform', transition({platform: 'darwin'})],
    ['another field', transition({field: 'sandbox'})],
    ['no issue', transition({issue: undefined})],
    ['no reason', transition({reason: ''})],
    ['an unknown key', transition({ignore: true})],
    ['a cell outside the listed cases', transition({cases: [other], cells: [socketGone]})],
    ['a cell with unequal field sets', transition({cells: [{...socketGone, after: {content: [], isError: true}}]})],
    ['a cell declaring a non-result field', transition({cells: [{case: moved, cell: 'exercise', before: {meta: {}}, after: {meta: {x: 1}}}]})],
    ['a cell declaring nothing', transition({cells: [{case: moved, cell: 'exercise', before: {}, after: {}}]})],
    ['the same cell twice', transition({cells: [socketGone, socketGone]})],
  ];
  for (const [label, entry] of invalid) assert.throws(() => validateExpected([entry]), /configuration transition/, label);
  assert.throws(() => validateExpected([transition(), transition({id: 'second'})]), /configuration transition/, 'two transitions');
});

test('the committed expected differences still validate', () => {
  validateExpected(JSON.parse(readFileSync(new URL('./expected-differences.json', import.meta.url), 'utf8')));
});
