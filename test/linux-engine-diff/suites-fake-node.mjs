// The suites runner's harness commands, faked for its tests (suites-runner.test.mjs): what each would answer, chosen by
// FAKE_* variables, every call appended to FAKE_LOG. The runner's other node calls run the real node.
//   FAKE_RUN        repl-parity run's exit status (0); the run writes M6a's stored cua lane to its --out
//                   (parity-run-fixture.mjs), with the changes FAKE_LANE names (comma-separated: short, text, vendor,
//                   elsewhere, incomplete), and on a candidate (--engine-bin) that candidate as every case's engine
//   FAKE_CLEANUP    the exit statuses of repl-parity cleanup-prepared, in call order, comma-separated (0)
//   FAKE_CHECK      gate.mjs check --pinned's exit status (0)
//   FAKE_PROBE      the fallback probe's exit statuses (scripts/accept/linux-fallback.mjs), in call order (0)
//   bin/cua.mjs install (a fixture's run home) answers 0 and installs nothing
// The sampler (watch.mjs, which would run the fixture) and the fallback probe log the selection they ran with too, as
// `ENV CUA_NATIVE_ENGINE=<value>` or `ENV CUA_NATIVE_ENGINE unset`.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCuaLane } from './parity-run-fixture.mjs';

const args = process.argv.slice(2);
const log = process.env.FAKE_LOG;
const calls = () => readFileSync(log, 'utf8').split('\n').filter(Boolean);
appendFileSync(log, `${args.join(' ')}\n`);
const nth = (pattern) => calls().filter((l) => pattern.test(l)).length - 1;
const pick = (list, i, fallback) => (list ? list.split(',')[i] ?? list.split(',').at(-1) : fallback);

const [script, action] = args;
const selection = () => appendFileSync(log, `ENV CUA_NATIVE_ENGINE${process.env.CUA_NATIVE_ENGINE === undefined ? ' unset' : `=${process.env.CUA_NATIVE_ENGINE}`}\n`);
if (script.endsWith('/watch.mjs') && !script.endsWith('engine-watch.mjs')) { selection(); process.exit(0); }
if (script.endsWith('linux-fallback.mjs')) { selection(); process.exit(Number(pick(process.env.FAKE_PROBE, nth(/linux-fallback\.mjs/), '0'))); }
if (script.endsWith('repl-parity.mjs')) {
  if (action === 'prepare') console.log(JSON.stringify({ ownedPreparation: { home: '/fake/prepared-home' }, display: ':9', xSession: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/fake/bus' } }));
  if (action === 'cleanup-prepared') process.exit(Number(pick(process.env.FAKE_CLEANUP, nth(/cleanup-prepared/), '0')));
  if (action === 'run') {
    const out = args[args.indexOf('--out') + 1];
    const lane = writeCuaLane(out, process.env.FAKE_LANE ? process.env.FAKE_LANE.split(',') : []);
    const bin = args.includes('--engine-bin') ? args[args.indexOf('--engine-bin') + 1] : null;
    if (bin) {
      for (const entry of lane.meta.engineAnswered) {
        entry.expected = bin;
        entry.observed = entry.observed.map((o) => ({ ...o, exe: bin }));
      }
      lane.meta.engineBin = bin;
      writeFileSync(join(out, 'meta.json'), `${JSON.stringify(lane.meta, null, 2)}\n`);
    }
    process.exit(Number(process.env.FAKE_RUN ?? '0'));
  }
  process.exit(0);
}
if (script.endsWith('gate.mjs')) {
  const code = Number(process.env.FAKE_CHECK ?? '0');
  console.log(code ? 'gate step refused: (fake) not the pinned engine' : 'acceptance on the pinned release: (fake)');
  process.exit(code);
}
if (script === 'bin/cua.mjs') process.exit(0);
process.exit(0);
