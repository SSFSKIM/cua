// The O0 source pinned at preparation (scripts/hosted-sittings/pin.mjs): the setup step, never the TCC writer, fetches
// the design spec at one full commit (the entry's own, O0_COMMIT, unless the workflow names a later one) and writes it
// to a run-owned file the writer reads. git is a spy here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pinDecision} from '../../scripts/hosted-sittings/pin.mjs';
import {DECISION_SPEC, O0_COMMIT} from '../../scripts/hosted-sittings/tcc.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '/t'};
function spies({present = false, fetched = O0_COMMIT} = {}) {
  const calls = [], written = [];
  const git = args => {
    calls.push(args.join(' '));
    if (args[0] === 'cat-file') { if (!present && !calls.some(c => c.startsWith('fetch'))) throw new Error('missing'); return ''; }
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse') return `${fetched}\n`;
    if (args[0] === 'show') return '## Decision Log\n';
    throw new Error(args.join(' '));
  };
  return {calls, written, deps: {env: HOSTED, platform: 'darwin', git, write: (path, text) => written.push([path, text])}};
}

test('by default the entry\'s own commit is fetched, checked and its spec written where the writer reads it', () => {
  const {calls, written, deps} = spies();
  const pin = pinDecision(deps);
  assert.deepEqual(pin, {sha: O0_COMMIT, file: `/t/hosted-sittings-decision/design-${O0_COMMIT}.md`,
    env: {CUA_HOSTED_DECISION_FILE: `/t/hosted-sittings-decision/design-${O0_COMMIT}.md`, CUA_HOSTED_DECISION_SHA: O0_COMMIT}});
  assert.deepEqual(calls, [`cat-file -e ${O0_COMMIT}^{commit}`, `fetch -q --depth 1 origin ${O0_COMMIT}`, 'rev-parse FETCH_HEAD', `cat-file -e ${O0_COMMIT}^{commit}`, `show ${O0_COMMIT}:${DECISION_SPEC}`]);
  assert.deepEqual(written, [[pin.file, '## Decision Log\n']]);
});

test('a commit already present is not fetched; a later commit may be named, in full only', () => {
  const later = 'a'.repeat(40);
  const {calls, deps} = spies({present: true});
  assert.equal(pinDecision({...deps, commit: later}).sha, later);
  assert.ok(!calls.some(c => c.startsWith('fetch')));
  assert.throws(() => pinDecision({...spies().deps, commit: 'db775127'}), /a full commit/);
  assert.throws(() => pinDecision({...spies({fetched: 'b'.repeat(40)}).deps}), /fetched b{40}, not db775127/);
});

test('off a GitHub-hosted runner nothing is fetched or written', () => {
  const {calls, written, deps} = spies();
  assert.throws(() => pinDecision({...deps, env: {}}), /refused/);
  assert.deepEqual([calls, written], [[], []]);
});
