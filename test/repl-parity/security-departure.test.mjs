// A declared security departure (#135) exempts exactly one case's outcome on one platform, and only when the vendor
// side is the declared vendor defect and the own side is the exact passing refusal the entry names.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareParityRuns, validateExpected} from '../../scripts/repl-parity/compare.mjs';

const id = 'cells/confinement/no-unsandboxed-fallback';
const REFUSAL = 'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: {"kernel_pid":"<process:1>","kernel_status":"exited(code=73)","kernel_stderr_tail":"fixture sandbox launcher refused","reason":"stdout_eof","stream_error":null}';
const committed = JSON.parse(readFileSync(new URL('./expected-differences.json', import.meta.url), 'utf8'));
const departure = committed.find(e => e.kind === 'security-departure');
const meta = host => ({host, platform: 'linux', runtimeRelease: '26.928.40906-linux-arm64', service: 'cua', backend: 'no-services', sandbox: 'scoped', surfaces: ['browser'], complete: true,
  caseIds: [id], caseCells: {[id]: ['reset', 'refused', 'boundary']}, connections: ['c1'],
  hostAttestations: [host === 'cua' ? {connection: 'c1', host, serverInfo: {name: 'cua-repl-host', version: '9.9.9'}, _meta: {'cua/replHost': {host: 'cua', version: '9.9.9'}}}
    : {connection: 'c1', host, serverInfo: {name: 'rmcp', version: '1.5.0'}, _meta: null}]});
const vendor = () => ({meta: meta('vendor'), tools: {tools: []}, rows: [
  {case: id, cell: 'reset', ok: true, content: [{type: 'text', text: 'js kernel reset'}], isError: false},
  {case: id, cell: 'refused', ok: true, content: [{type: 'text', text: '{"outsideWrite":true}'}], isError: false},
  {case: id, cell: 'boundary', ok: true, value: {kind: 'sandbox-launch-failure', codeExecuted: true, toolError: false, outsideWrite: true, launcherInvoked: true}},
  {case: id, assertion: {ok: false, reason: 'failed sandbox launch must be refused with no out-of-policy write'}},
]});
const own = () => ({meta: meta('cua'), tools: {tools: []}, rows: [
  {case: id, cell: 'reset', ok: true, content: [{type: 'text', text: 'js kernel reset'}], isError: false},
  {case: id, cell: 'refused', ok: true, content: [{type: 'text', text: REFUSAL.replace('"<process:1>"', '4242')}], isError: true},
  {case: id, cell: 'boundary', ok: true, value: {kind: 'sandbox-launch-failure', codeExecuted: false, toolError: true, outsideWrite: false, launcherInvoked: true}},
  {case: id, assertion: {ok: true}},
]});

test('the committed #135 departure is scoped to the Linux no-unsandboxed-fallback outcome and pins the own host\'s exact refusal', () => {
  validateExpected(committed);
  assert.deepEqual({case: departure.case, platform: departure.platform, field: departure.field, issue: departure.issue, cells: departure.cells},
    {case: id, platform: 'linux', field: 'assertion', issue: '#135', cells: ['refused', 'boundary']});
  assert.deepEqual(departure.cua.result.content, [{type: 'text', text: REFUSAL}]);
});

test('the departure accepts the declared vendor defect against the own host\'s exact refusal, and nothing else differs', () => {
  assert.equal(compareParityRuns(vendor(), own()).ok, false, 'without the entry the outcomes differ');
  const result = compareParityRuns(vendor(), own(), {expected: [departure]});
  assert.equal(result.ok, true, JSON.stringify(result.differences));
  assert.deepEqual(result.expected.map(e => [e.case, e.field, e.kind]), [[id, 'assertion', 'security-departure']]);
  assert.equal(compareParityRuns(own(), vendor(), {expected: [departure]}).ok, true, 'either side order');
});

test('the departure exempts nothing when either side is not exactly what it declares', () => {
  const mutations = [
    ['own host wrote outside the policy', (v, o) => { o.rows[2].value.outsideWrite = true; }],
    ['own host ran the code', (v, o) => { o.rows[2].value.codeExecuted = true; }],
    ['own host failed its assertion', (v, o) => { o.rows[3].assertion = {ok: false, reason: 'x'}; }],
    ['own refusal worded otherwise', (v, o) => { o.rows[1].content[0].text = 'something else'; }],
    ['own refusal not an error', (v, o) => { o.rows[1].isError = false; }],
    ['vendor not the declared defect', (v) => { v.rows[2].value.outsideWrite = false; }],
    ['another platform', (v, o) => { v.meta.platform = 'darwin'; o.meta.platform = 'darwin'; }],
    ['another cell still differs', (v, o) => { o.rows[0].content[0].text = 'changed'; }],
  ];
  for (const [label, mutate] of mutations) {
    const v = vendor(), o = own();
    mutate(v, o);
    assert.equal(compareParityRuns(v, o, {expected: [departure]}).ok, false, label);
  }
});

test('malformed departures are refused before anything is compared', () => {
  for (const change of [{field: 'content'}, {platform: 'windows'}, {issue: 'none'}, {vendorDefect: 'forged'}, {case: 'cells/other'}, {cells: ['refused']},
    {cua: {...departure.cua, assertion: {ok: false}}}, {cua: {...departure.cua, result: {...departure.cua.result, isError: false}}}, {extra: true}])
    assert.throws(() => validateExpected([{...departure, ...change}]), /security departure/, JSON.stringify(change));
});
