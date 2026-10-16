// M5 task 6 copy of ../../../m4/accept/run.mjs: runs one unchanged Linux acceptance runner on cua-linux under the
// host-attesting wrapper, from this Mac. Changed for M5's managed Node (Decision Log, M5 task 1b and the four rulings):
//   - linux-native runs in the prepared session environment, the fresh `cua install` scratch home and its private HOME
//     (`prepare` facts: home, userHome), with CUA_NODE unset, so cua's own host resolves the cua-installed Node itself;
//   - the two browser runners run, as at M4, on the H4 home (#113's cua-route home, where `me`'s host runs and keeps its
//     status), because their host-identity steps read that host's pid and status from $CUA_HOME; the prepared scratch
//     home only links the backend socket (diagnostics/accept-browser-runners-on-scratch-home). The H4 home has no
//     managed Node and is never installed into, so CUA_NODE names the prepared home's cua-installed Node;
//   - ./attest-serve.mjs also records the Node that actually ran the supervisor, and ./attest-summary.mjs requires it to
//     be the managed Node of the serve's home;
//   - the two attestation files are copied to a scratch directory on the VM with their relative imports rewritten to the
//     prepared clone, so the clone stays clean at the recorded head (this harness may be a later, evidence-only commit).
// Each runner executes in the prepared clone, inside the VM's X session (scripts/repl-parity/topology.mjs linuxSession),
// with the Concrete Steps environment. Both the runner's report and the records are copied into <out>/, and the VM's
// scratch directory is removed.
//   CUA_PARITY_SCRATCH_PREFIX=cua-m5t6- node docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/accept/run.mjs \
//     linux-native|linux-chrome|linux-chrome-features <out-dir>
// Exit 0 only when the runner prints status PASS (exit 0) and the attestation summary holds.
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {linuxSession, parityScratchPrefix, quote, remoteCommand} from '../../../../../../scripts/repl-parity/topology.mjs';
import {REPL_HOST_VERSION} from '../../../../../../src/repl-host/identity.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const here = fileURLToPath(new URL('./', import.meta.url));
const prepared = JSON.parse(readFileSync(join(root, '.doperpowers/sde/repl-parity/cua-linux.json'), 'utf8'));
const H4 = '/home/admin/.local/share/cua-h4';
const scratchSession = {CUA_HOME: prepared.home, HOME: prepared.userHome, CHROME_CONFIG_HOME: `${prepared.userHome}/.config`, XDG_CONFIG_HOME: `${prepared.userHome}/.config`};
const h4Session = {CUA_HOME: H4, CUA_NODE: prepared.ownNode?.path};
const RUNNERS = {
  'linux-native': {env: {CUA_REPL_HOST: 'cua', CUA_SHIM_SURFACES: 'computer', ...scratchSession}, args: []},
  'linux-chrome': {env: {CUA_REPL_HOST: 'cua', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_SURFACES: 'browser', ...h4Session}, args: [prepared.profile]},
  'linux-chrome-features': {env: {CUA_REPL_HOST: 'cua', CUA_BROWSER_SERVICE: 'cua', CUA_SHIM_SURFACES: 'browser', ...h4Session}, args: []},
};
const [name, out] = process.argv.slice(2);
if (!RUNNERS[name] || !out) throw new Error(`usage: run.mjs ${Object.keys(RUNNERS).join('|')} <out-dir>`);
if (prepared.device !== 'cua-linux' || prepared.nodeMode !== 'managed' || prepared.nodeOverride || !prepared.ownedPreparation || !prepared.userHome)
  throw new Error('prepare cua-linux with the managed Node (no --node) first');
const commit = prepared.commit, harnessCommit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const scratch = `/tmp/${parityScratchPrefix(process.env)}accept`, records = `${scratch}/${name}.jsonl`;
const {env, args} = RUNNERS[name];
const environment = env;
const assignments = Object.entries({...environment, CUA_ATTEST_OUT: records, NODE_OPTIONS: `--import=${scratch}/attest-serve.mjs`})
  .map(([k, v]) => `${k}=${quote(v)}`).join(' ');
const remote = (script, input) => {
  const {command, args: argv} = remoteCommand('cua-linux', script);
  return spawnSync(command, argv, {encoding: 'utf8', maxBuffer: 64 << 20, input});
};
const clone = quote(prepared.checkout);
// The scratch copies import the clone's modules by absolute path.
const deployed = file => readFileSync(join(here, file), 'utf8').replaceAll("'../../../../../../", `'${prepared.checkout}/`);
for (const file of ['attest-serve.mjs', 'attest-summary.mjs']) {
  const put = remote(`mkdir -p ${quote(scratch)} && cat > ${quote(`${scratch}/${file}`)}`, deployed(file));
  if (put.status !== 0) throw new Error(`could not place ${file} on the VM: ${put.stderr}`);
}
const started = new Date().toISOString();
const ran = remote(`${linuxSession}\ncd ${clone} && test "$(git rev-parse HEAD)" = ${quote(commit)} && test -z "$(git status --porcelain)" && rm -f ${quote(records)} && env -u CUA_NODE ${assignments} node scripts/accept/${name}.mjs ${args.map(quote).join(' ')}`);
const finished = new Date().toISOString();
const judged = remote(`cd ${clone} && node ${quote(`${scratch}/attest-summary.mjs`)} ${quote(records)} ${quote(REPL_HOST_VERSION)} ${quote(commit)} ${quote(prepared.home)}`);
const raw = remote(`cat ${quote(records)}`);
remote(`rm -f ${quote(records)} ${quote(`${scratch}/attest-serve.mjs`)} ${quote(`${scratch}/attest-summary.mjs`)} && rmdir ${quote(scratch)} 2>/dev/null; true`);
const dir = resolve(out);
mkdirSync(dir, {recursive: true});
let report = null;
try { report = JSON.parse(ran.stdout); } catch {}
writeFileSync(join(dir, `${name}.json`), `${JSON.stringify({runner: `scripts/accept/${name}.mjs`, args, environment: {...environment, CUA_NODE: environment.CUA_NODE ?? '(unset)'},
  device: 'cua-linux', checkout: prepared.checkout, commit, harnessCommit, started, finished, exitCode: ran.status, report, stdoutUnparsed: report ? undefined : ran.stdout.slice(-4000),
  stderrTail: ran.stderr.split('\n').slice(-20).join('\n')}, null, 1)}\n`);
writeFileSync(join(dir, `${name}-attest.jsonl`), raw.stdout);
writeFileSync(join(dir, `${name}-attest-summary.json`), judged.stdout);
const verdict = {runner: name, exitCode: ran.status, status: report?.status ?? null, attested: judged.status === 0};
console.log(JSON.stringify(verdict));
process.exitCode = verdict.exitCode === 0 && verdict.status === 'PASS' && verdict.attested ? 0 : 1;
