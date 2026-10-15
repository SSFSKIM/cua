// M4 task 3: runs one unchanged Linux acceptance runner on cua-linux under the host-attesting wrapper, from this Mac.
// The runner executes in the prepared parity clone (scripts/repl-parity prepare), inside the VM's X session
// (scripts/repl-parity/topology.mjs linuxSession), with the Concrete Steps environment plus the own host's Node and,
// for the browser runners, the H4 cua-route home, all in this command's environment (never a shell profile).
// ./attest-serve.mjs records every `cua serve` the runner starts; ./attest-summary.mjs judges those records on the VM.
// Both the runner's report and the records are copied into <out>/, and the VM's scratch directory is removed.
//   CUA_PARITY_SCRATCH_PREFIX=cua-m4t3- node docs/evidence/2026-10-14-own-repl-host-parity/m4/accept/run.mjs \
//     linux-native|linux-chrome|linux-chrome-features <out-dir>
// Exit 0 only when the runner prints status PASS (exit 0) and the attestation summary holds.
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {linuxSession, parityScratchPrefix, quote, remoteCommand} from '../../../../../scripts/repl-parity/topology.mjs';
import {REPL_HOST_VERSION} from '../../../../../src/repl-host/identity.mjs';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const prepared = JSON.parse(readFileSync(join(root, '.doperpowers/sde/repl-parity/cua-linux.json'), 'utf8'));
const H4 = '/home/admin/.local/share/cua-h4';
const RUNNERS = {
  'linux-native': {env: {CUA_REPL_HOST: 'cua', CUA_SHIM_SURFACES: 'computer'}, args: []},
  'linux-chrome': {env: {CUA_REPL_HOST: 'cua', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_SURFACES: 'browser', CUA_HOME: H4}, args: [prepared.profile]},
  'linux-chrome-features': {env: {CUA_REPL_HOST: 'cua', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_SURFACES: 'browser', CUA_HOME: H4}, args: []},
};
const [name, out] = process.argv.slice(2);
if (!RUNNERS[name] || !out) throw new Error(`usage: run.mjs ${Object.keys(RUNNERS).join('|')} <out-dir>`);
if (prepared.device !== 'cua-linux' || !prepared.ownNode?.path) throw new Error('prepare cua-linux with --node first');
// The source under test is the prepared clone's commit (checked on the VM below); this harness may be a later,
// evidence-only commit, recorded apart.
const commit = prepared.commit, harnessCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const scratch = `/tmp/${parityScratchPrefix(process.env)}accept`, records = `${scratch}/${name}.jsonl`;
const {env, args} = RUNNERS[name];
const assignments = Object.entries({...env, CUA_NODE: prepared.ownNode.path, CUA_ATTEST_OUT: records,
  NODE_OPTIONS: '--import=./docs/evidence/2026-10-14-own-repl-host-parity/m4/accept/attest-serve.mjs'}).map(([k, v]) => `${k}=${quote(v)}`).join(' ');
const remote = script => {
  const {command, args: argv} = remoteCommand('cua-linux', script);
  return spawnSync(command, argv, {encoding: 'utf8', maxBuffer: 64 << 20});
};
const clone = quote(prepared.checkout);
const started = new Date().toISOString();
const ran = remote(`${linuxSession}\ncd ${clone} && test "$(git rev-parse HEAD)" = ${quote(commit)} && test -z "$(git status --porcelain)" && mkdir -p ${quote(scratch)} && rm -f ${quote(records)} && env ${assignments} node scripts/accept/${name}.mjs ${args.map(quote).join(' ')}`);
const finished = new Date().toISOString();
const judged = remote(`cd ${clone} && node docs/evidence/2026-10-14-own-repl-host-parity/m4/accept/attest-summary.mjs ${quote(records)} ${quote(REPL_HOST_VERSION)} ${quote(commit)}`);
const raw = remote(`cat ${quote(records)}`);
remote(`rm -f ${quote(records)} && rmdir ${quote(scratch)} 2>/dev/null; true`);
const dir = resolve(out);
mkdirSync(dir, {recursive: true});
let report = null;
try { report = JSON.parse(ran.stdout); } catch {}
writeFileSync(join(dir, `${name}.json`), `${JSON.stringify({runner: `scripts/accept/${name}.mjs`, args, environment: {...env, CUA_NODE: prepared.ownNode.path},
  device: 'cua-linux', checkout: prepared.checkout, commit, harnessCommit, started, finished, exitCode: ran.status, report, stdoutUnparsed: report ? undefined : ran.stdout.slice(-4000),
  stderrTail: ran.stderr.split('\n').slice(-20).join('\n')}, null, 1)}\n`);
writeFileSync(join(dir, `${name}-attest.jsonl`), raw.stdout);
writeFileSync(join(dir, `${name}-attest-summary.json`), judged.stdout);
const verdict = {runner: name, exitCode: ran.status, status: report?.status ?? null, attested: judged.status === 0};
console.log(JSON.stringify(verdict));
process.exitCode = verdict.exitCode === 0 && verdict.status === 'PASS' && verdict.attested ? 0 : 1;
