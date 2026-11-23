// The hosted kit's one TCC writer (scripts/hosted-sittings/tcc.mjs; ruling 1111, O0): off a GitHub-hosted macOS
// runner, or without the owner's O0 entry in the pinned design spec's Decision Log, it refuses before any access to a
// store, so the store here is a spy that must never be called. Nothing in this file touches a real TCC database or git.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CLIENTS, DECISION_LOG_ENTRY, DECISION_MARKER, decisionEntryProblem, grantRows, O0_COMMIT, pinnedDecisionLog, SERVICES, SYSTEM_DB} from '../../scripts/hosted-sittings/tcc.mjs';

// The spec as it holds the entry (wrapped as the spec wraps it, in its own Decision Log section), and the ways it may not.
const O0 = '- Decision (2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the\n  owner\'s Macs (O0; ruling 1111)): a kit that writes a TCC row refuses, before any write, unless …\n  Date/Author: 2026-11-23, the owner.\n';
const OTHER = '- Decision (2026-11-23, ruling 1141; amends O0a above): pre-recording replayd\'s approval does not prevent its alert.\n';
const spec = log => `# Design\n\n## Progress\n\n- done\n\n## Decision Log\n\n${log}\n## Outcomes & Retrospective\n\n- none\n`;
const WITH_O0 = spec(`${OTHER}\n${O0}`);
const SHA = O0_COMMIT;
const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin', decisionLog: () => ({sha: SHA, text: WITH_O0})};
const throwsIfCalled = () => { throw new Error('the Decision Log was read before the hosted guard'); };

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

// Ruling 1137: every refusal gives zero store calls. Off the host the Decision Log is never read: the hosted guard comes first.
const quoted = spec(`- Decision (2026-11-24, revoked): the entry "${DECISION_MARKER}" no longer holds.\n`);
// An example of the bullet, not the bullet: inside a fence (``` or ~~~, at any indent) or as indented code.
const fenced = spec(`${OTHER}\nAn example of the form:\n\n\`\`\`\n${O0}\`\`\`\n`);
const tildes = spec(`${OTHER}\n~~~markdown\n${O0}~~~\n`);
// The heading and the bullet both inside one fence: an example of a Decision Log, not the spec's.
// Fences the scanner cannot place without a full CommonMark parser are refused as ambiguous (fix wave 4's review): a
// closer indented four or more inside a top-level fence (literal content, which would leave the rest fenced), a fence
// that opens on a list marker before the Decision Log, and such a list fence whose indented closer reads as an opener.
const indentedCloser = `# Design\n\n\`\`\`\nexample\n    \`\`\`\n## Decision Log\n\n${O0}\`\`\`\n`;
const listFence = `# Design\n\n- \`\`\`js\n  code\n  \`\`\`\n\n## Decision Log\n\n${O0}`;
const listCloser = `# Design\n\n1. an example:\n   ~~~\n   x\n   ~~~\n\n## Decision Log\n\n${O0}`;
const fencedHeading = `# Design\n\n\`\`\`markdown\n## Decision Log\n\n${O0}\`\`\`\n`;
const indented = spec(`${OTHER}\nThe form:\n\n${O0.split('\n').map(line => (line ? `    ${line}` : line)).join('\n')}`);
const outside = `## Notes\n\n${O0}\n## Decision Log\n\n${OTHER}`;
const refusals = {
  'RUNNER_ENVIRONMENT unset': [{...HOSTED, env: {}, decisionLog: throwsIfCalled}, /refused: .*GitHub-hosted/],
  'a self-hosted runner': [{...HOSTED, env: {RUNNER_ENVIRONMENT: 'self-hosted'}, decisionLog: throwsIfCalled}, /refused: .*GitHub-hosted/],
  'not macOS': [{...HOSTED, platform: 'linux', decisionLog: throwsIfCalled}, /refused: .*GitHub-hosted/],
  'the O0 entry missing from the Decision Log': [{...HOSTED, decisionLog: () => ({sha: SHA, text: spec(OTHER)})}, /refused: .*O0.*no entry of its own/],
  'the marker quoted inside another entry': [{...HOSTED, decisionLog: () => ({sha: SHA, text: quoted})}, /refused: .*O0.*no entry of its own/],
  'the marker outside the Decision Log section': [{...HOSTED, decisionLog: () => ({sha: SHA, text: outside})}, /refused: .*O0.*no entry of its own/],
  'the marker only in a ``` fenced example': [{...HOSTED, decisionLog: () => ({sha: SHA, text: fenced})}, /refused: .*O0.*no entry of its own/],
  'the marker only in a ~~~ fenced example': [{...HOSTED, decisionLog: () => ({sha: SHA, text: tildes})}, /refused: .*O0.*no entry of its own/],
  'a closer indented four spaces inside a top-level fence': [{...HOSTED, decisionLog: () => ({sha: SHA, text: indentedCloser})}, /refused: .*fences are ambiguous/],
  'a fence opening on a list marker before the Decision Log': [{...HOSTED, decisionLog: () => ({sha: SHA, text: listFence})}, /refused: .*fences are ambiguous/],
  'a list item\'s fence whose closer looks like an opener': [{...HOSTED, decisionLog: () => ({sha: SHA, text: listCloser})}, /refused: .*fences are ambiguous/],
  'the heading and the entry only in a fenced example': [{...HOSTED, decisionLog: () => ({sha: SHA, text: fencedHeading})}, /refused: .*no "## Decision Log" section/],
  'the marker only in indented code': [{...HOSTED, decisionLog: () => ({sha: SHA, text: indented})}, /refused: .*O0.*no entry of its own/],
  'no Decision Log section': [{...HOSTED, decisionLog: () => ({sha: SHA, text: O0})}, /refused: .*no "## Decision Log" section/],
  'the pinned spec file missing': [{...HOSTED, decisionLog: () => null}, /refused: .*no pinned design spec/],
  'a pin that is not a full commit': [{...HOSTED, decisionLog: () => ({sha: 'db775127', text: WITH_O0})}, /refused: .*not a full commit/],
};
for (const [name, [where, message]] of Object.entries(refusals)) {
  test(`grantRows refuses before any store access: ${name}`, () => {
    const {store, calls} = spyStore();
    assert.throws(() => grantRows(GRANTS, {...where, store}), message);
    assert.deepEqual(calls, []);
  });
}

test('the O0 entry must be an entry of the Decision Log section, as the spec wraps it', () => {
  assert.equal(decisionEntryProblem(WITH_O0), null);
  assert.equal(decisionEntryProblem(spec(`${O0}\n${OTHER}`)), null, 'wherever it sits among the entries');
  for (const text of [spec(OTHER), quoted, outside, fenced, tildes, indented]) assert.match(decisionEntryProblem(text), /no entry of its own/);
  assert.equal(decisionEntryProblem(spec(`\`\`\`\nan example\n\`\`\`\n\n${O0}`)), null, 'the entry itself after a closed fence still counts');
  assert.match(decisionEntryProblem(spec(O0.replace('(O0; ruling 1111)', '(O0)'))), /no entry of its own/, 'the marker whole, never a prefix of it');
});

test('the pinned spec is the file the setup wrote and the commit it names, read with no git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-pinned-'));
  try {
    const file = join(dir, 'design.md');
    writeFileSync(file, WITH_O0);
    assert.deepEqual(pinnedDecisionLog({CUA_HOSTED_DECISION_FILE: file, CUA_HOSTED_DECISION_SHA: SHA}), {sha: SHA, text: WITH_O0, file});
    assert.equal(pinnedDecisionLog({CUA_HOSTED_DECISION_FILE: join(dir, 'gone.md'), CUA_HOSTED_DECISION_SHA: SHA}), null);
    assert.equal(pinnedDecisionLog({CUA_HOSTED_DECISION_SHA: SHA}), null);
    assert.equal(pinnedDecisionLog({CUA_HOSTED_DECISION_FILE: file}).sha, null);
  } finally { rmSync(dir, {recursive: true, force: true}); }
  assert.equal(O0_COMMIT, 'db775127652ebae5e0c7d90b5f5e2785f8e5711e', 'where the O0 entry was recorded, on docs/117-progress');
});

test('on a GitHub-hosted macOS runner it writes the system database only: four services for each bundle id, then reads them back', () => {
  const rows = GRANTS.flatMap(g => Object.values(SERVICES).map(s => `${s}|${g.client}|2`));
  const {store, calls} = spyStore({rows});
  const logged = [];
  const report = grantRows(GRANTS, {...HOSTED, store, log: line => logged.push(line), now: () => 1_700_000_000_000});
  assert.deepEqual(calls[0], ['exists', SYSTEM_DB]);
  const writes = calls.filter(c => c[0] === 'sql' && c[2].startsWith('insert'));
  assert.equal(writes.length, 8);
  assert.ok(calls.filter(c => c[0] === 'sql').every(c => c[1] === SYSTEM_DB), 'the user database is never touched (H0: the runner ignores it)');
  for (const service of ['kTCCServiceAccessibility', 'kTCCServiceScreenCapture', 'kTCCServiceListenEvent', 'kTCCServicePostEvent'])
    for (const client of ['io.github.ssfskim.cua.engine', 'com.openai.sky.CUAService'])
      assert.ok(writes.some(c => c[2].includes(`'${service}', '${client}', 0, 2, 4, 1, X'fade'`)), `${service} for ${client}`);
  assert.deepEqual(report.rows, GRANTS.map(g => ({client: g.client, granted: Object.keys(SERVICES)})));
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.decision, {entry: DECISION_LOG_ENTRY, commit: SHA});
  assert.match(logged.join('\n'), new RegExp(`Decision Log at ${SHA}.*TCC rows may be written by kits on GitHub-hosted runners only`), 'the write cites the pinned commit');
});

test('a row the database does not read back is reported missing', () => {
  const {store} = spyStore({rows: [`${SERVICES.accessibility}|${CLIENTS.engine}|2`]});
  const report = grantRows(GRANTS.slice(0, 1), {...HOSTED, store, log: () => {}});
  assert.deepEqual(report.missing, ['io.github.ssfskim.cua.engine screenRecording', 'io.github.ssfskim.cua.engine inputMonitoring', 'io.github.ssfskim.cua.engine postEvent']);
});

test('only the two engines\' bundle ids are written', () => {
  const {store, calls} = spyStore();
  assert.throws(() => grantRows([{client: 'com.example.other', bundle: '/Applications/Other.app'}], {...HOSTED, store}), /only cua's engine and the vendor's helper/);
  assert.deepEqual(calls, []);
});
