// The O0 source pinned at preparation (scripts/hosted-sittings/pin.mjs): the setup step, never the TCC writer, fetches
// the design spec at one full commit (the entry's own, O0_COMMIT, unless the workflow names a later one) and writes it
// to a run-owned file the writer reads. git is a spy here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pinDecision} from '../../scripts/hosted-sittings/pin.mjs';
import {DECISION_SPEC, O0_COMMIT} from '../../scripts/hosted-sittings/tcc.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_TEMP: '/t'};
const TIP = 'e'.repeat(40), BRANCH = 'refs/remotes/origin/docs/117-progress';
// `tip`: what FETCH_HEAD names after the branch's fetch; `branchFails`: that fetch fails (a cached tracking ref may still hold anything).
function spies({present = false, fetched = O0_COMMIT, reviewed = [], branchFails = false} = {}) {
  const calls = [], written = [];
  const git = args => {
    calls.push(args.join(' '));
    if (args[0] === 'cat-file') { if (!present && !calls.some(c => c.startsWith('fetch'))) throw new Error('missing'); return ''; }
    if (args[0] === 'fetch') { if (branchFails && args.includes('refs/heads/docs/117-progress')) throw new Error('could not read from remote'); return ''; }
    if (args[0] === 'rev-parse') return `${calls.at(-2)?.includes('docs/117-progress') ? TIP : fetched}\n`;
    if (args[0] === 'show') return '## Decision Log\n';
    // `merge-base --is-ancestor <commit> <reviewed>`: true for the pairs `reviewed` names.
    if (args[0] === 'merge-base') { if (!reviewed.includes(`${args[2]} ${args[3]}`)) throw new Error('not an ancestor'); return ''; }
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

test('a commit already present is not fetched; a later commit may be named, in full only, and only from the reviewed branch', () => {
  const later = 'a'.repeat(40);
  const {calls, deps} = spies({present: true, reviewed: [`${later} ${TIP}`]});
  assert.equal(pinDecision({...deps, commit: later}).sha, later);
  assert.ok(!calls.some(c => c.startsWith('fetch -q --depth')));
  // The ancestry is tested against the tip this run fetched (FETCH_HEAD), never a ref a checkout may hold from before.
  assert.deepEqual(calls.filter(c => /^(fetch|merge-base|rev-parse)/.test(c)), [`merge-base --is-ancestor ${later} ${O0_COMMIT}`, 'fetch -q origin refs/heads/docs/117-progress', 'rev-parse FETCH_HEAD', `merge-base --is-ancestor ${later} ${TIP}`]);
  // A failed fetch: a cached tracking ref that holds the candidate proves nothing, so the override is refused.
  const cached = spies({present: true, branchFails: true, reviewed: [`${later} ${BRANCH}`, `${later} ${TIP}`]});
  assert.throws(() => pinDecision({...cached.deps, commit: later}), /could not fetch docs\/117-progress/);
  assert.ok(!cached.calls.some(c => c.startsWith('show')) && !cached.written.length);
  // A commit on no reviewed source is refused before its spec is read; an ancestor of the default is reviewed.
  const stray = spies({present: true});
  assert.throws(() => pinDecision({...stray.deps, commit: 'c'.repeat(40)}), /not on a reviewed source/);
  assert.ok(!stray.calls.some(c => c.startsWith('show')) && !stray.written.length);
  const older = 'd'.repeat(40);
  assert.equal(pinDecision({...spies({present: true, reviewed: [`${older} ${O0_COMMIT}`]}).deps, commit: older}).sha, older);
  assert.throws(() => pinDecision({...spies().deps, commit: 'db775127'}), /a full commit/);
  assert.throws(() => pinDecision({...spies({fetched: 'b'.repeat(40)}).deps}), /fetched b{40}, not db775127/);
});

test('off a GitHub-hosted runner nothing is fetched or written', () => {
  const {calls, written, deps} = spies();
  assert.throws(() => pinDecision({...deps, env: {}}), /refused/);
  assert.deepEqual([calls, written], [[], []]);
});
