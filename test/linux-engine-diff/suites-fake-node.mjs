// The suites runner's harness commands, faked for its tests (suites-runner.test.mjs): what each would answer, chosen by
// FAKE_* variables, every call appended to FAKE_LOG. The runner's other node calls run the real node.
//   FAKE_DIFF       repl-parity diff's exit status (0)
//   FAKE_CLEANUP    the exit statuses of repl-parity cleanup-prepared, in call order, comma-separated (0)
//   FAKE_COMPARE    native-baseline compare --engines's answers in call order, comma-separated: pass, topup, unproved, fail
//   FAKE_CHECK      gate.mjs check --pinned's exit status (0)
//   bin/cua.mjs install (a fixture's run home) answers 0 and installs nothing
//   FAKE_CHECK      gate.mjs check --pinned's exit status (0)
//   bin/cua.mjs install (a fixture's run home) answers 0 and installs nothing
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const log = process.env.FAKE_LOG;
const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);
appendFileSync(log, `${args.join(' ')}\n`);
const nth = (pattern) => calls().filter((l) => pattern.test(l)).length - 1;
const pick = (list, i, fallback) => (list ? list.split(',')[i] ?? list.split(',').at(-1) : fallback);

const [script, action] = args;
if (script.endsWith('repl-parity.mjs')) {
  if (action === 'prepare') console.log(JSON.stringify({ ownedPreparation: { home: '/fake/prepared-home' }, display: ':9', xSession: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/fake/bus' } }));
  if (action === 'cleanup-prepared') process.exit(Number(pick(process.env.FAKE_CLEANUP, nth(/cleanup-prepared/), '0')));
  if (action === 'diff') process.exit(Number(process.env.FAKE_DIFF ?? '0'));
  process.exit(0);
}
if (script.endsWith('gate.mjs')) {
  const code = Number(process.env.FAKE_CHECK ?? '0');
  console.log(code ? 'gate step refused: (fake) not the pinned engine' : 'acceptance on the pinned release: (fake)');
  process.exit(code);
}
if (script === 'bin/cua.mjs') process.exit(0);
if (script.endsWith('native-baseline.mjs')) {
  if (action !== 'compare') process.exit(0);
  const answer = pick(process.env.FAKE_COMPARE, nth(/native-baseline\.mjs compare/), 'pass');
  if (answer === 'topup') {
    console.error('TOP-UP NEEDED: click');
    console.error('VERDICT: FAIL');
    process.exit(1);
  }
  if (answer === 'fail') {
    console.error('VERDICT: FAIL');
    process.exit(1);
  }
  if (answer === 'unproved') console.error('UNPROVED (a declared gap, not a pass; ruling 9): click [-1, 3] ms, bound 1 ms, 40 / 40 samples');
  console.error('VERDICT: PASS');
  process.exit(0);
}
process.exit(0);
