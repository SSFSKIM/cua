// The hosted kit's one TCC writer (scripts/hosted-sittings/tcc.mjs; ruling 1111, O0): off a GitHub-hosted macOS
// runner it refuses before any access to a store, so the store here is a spy that must never be called. Nothing in this
// file touches a real TCC database.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CLIENTS, DECISION_LOG_ENTRY, grantRows, SERVICES, SYSTEM_DB} from '../../scripts/hosted-sittings/tcc.mjs';

function spyStore({csreq = () => 'fade', rows = []} = {}) {
  const calls = [];
  const store = {
    exists: path => { calls.push(['exists', path]); return true; },
    csreq: bundle => { calls.push(['csreq', bundle]); return csreq(bundle); },
    sql: (db, statement) => { calls.push(['sql', db, statement]); return statement.startsWith('select') ? rows.join('\n') : ''; },
  };
  return {store, calls};
}
const GRANTS = [{client: CLIENTS.engine, bundle: '/Users/runner/Library/Application Support/cua/engine/pending/cua Engine.app'},
  {client: CLIENTS.vendor, bundle: '/Users/runner/Library/Application Support/cua/runtimes/r/Codex Computer Use.app'}];

const refusals = {
  'RUNNER_ENVIRONMENT unset': {env: {}, platform: 'darwin'},
  'a self-hosted runner': {env: {RUNNER_ENVIRONMENT: 'self-hosted'}, platform: 'darwin'},
  'not macOS': {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'linux'},
};
for (const [name, where] of Object.entries(refusals)) {
  test(`grantRows refuses before any store access: ${name}`, () => {
    const {store, calls} = spyStore();
    assert.throws(() => grantRows(GRANTS, {...where, store}), /refused: .*GitHub-hosted/);
    assert.deepEqual(calls, []);
  });
}

test('on a GitHub-hosted macOS runner it writes the system database only: four services for each bundle id, then reads them back', () => {
  const rows = GRANTS.flatMap(g => Object.values(SERVICES).map(s => `${s}|${g.client}|2`));
  const {store, calls} = spyStore({rows});
  const logged = [];
  const report = grantRows(GRANTS, {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', store, log: line => logged.push(line), now: () => 1_700_000_000_000});
  assert.deepEqual(calls[0], ['exists', SYSTEM_DB]);
  const writes = calls.filter(c => c[0] === 'sql' && c[2].startsWith('insert'));
  assert.equal(writes.length, 8);
  assert.ok(calls.filter(c => c[0] === 'sql').every(c => c[1] === SYSTEM_DB), 'the user database is never touched (H0: the runner ignores it)');
  for (const service of ['kTCCServiceAccessibility', 'kTCCServiceScreenCapture', 'kTCCServiceListenEvent', 'kTCCServicePostEvent'])
    for (const client of ['io.github.ssfskim.cua.engine', 'com.openai.sky.CUAService'])
      assert.ok(writes.some(c => c[2].includes(`'${service}', '${client}', 0, 2, 4, 1, X'fade'`)), `${service} for ${client}`);
  assert.deepEqual(report.rows, GRANTS.map(g => ({client: g.client, granted: Object.keys(SERVICES)})));
  assert.deepEqual(report.missing, []);
  assert.equal(report.decision, DECISION_LOG_ENTRY);
  assert.match(logged.join('\n'), /Decision Log.*TCC rows may be written by kits on GitHub-hosted runners only/);
});

test('a row the database does not read back is reported missing', () => {
  const {store} = spyStore({rows: [`${SERVICES.accessibility}|${CLIENTS.engine}|2`]});
  const report = grantRows(GRANTS.slice(0, 1), {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', store, log: () => {}});
  assert.deepEqual(report.missing, ['io.github.ssfskim.cua.engine screenRecording', 'io.github.ssfskim.cua.engine inputMonitoring', 'io.github.ssfskim.cua.engine postEvent']);
});

test('only the two engines\' bundle ids are written', () => {
  const {store, calls} = spyStore();
  assert.throws(() => grantRows([{client: 'com.example.other', bundle: '/Applications/Other.app'}], {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', store}), /only cua's engine and the vendor's helper/);
  assert.deepEqual(calls, []);
});
