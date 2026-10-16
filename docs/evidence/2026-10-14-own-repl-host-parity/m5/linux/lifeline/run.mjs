// M5 task 6: runs ./device.mjs on cua-linux from this Mac. The device script is copied to a scratch directory on the VM
// with its relative imports rewritten to the prepared clone, so the clone stays clean at the recorded head. It runs in
// the clone, inside the X session (scripts/repl-parity/topology.mjs linuxSession), with the prepared scratch home as the
// release source, the managed-Node preparation markers and no CUA_NODE. Writes the result to <out>.
//   CUA_PARITY_SCRATCH_PREFIX=cua-m5t6- node docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/lifeline/run.mjs <out.json>
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {linuxSession, parityScratchPrefix, quote, remoteCommand} from '../../../../../../scripts/repl-parity/topology.mjs';

const root = fileURLToPath(new URL('../../../../../../', import.meta.url));
const prepared = JSON.parse(readFileSync(join(root, '.doperpowers/sde/repl-parity/cua-linux.json'), 'utf8'));
const [out] = process.argv.slice(2);
if (!out) throw new Error('usage: run.mjs <out.json>');
if (prepared.device !== 'cua-linux' || prepared.nodeMode !== 'managed' || prepared.nodeOverride) throw new Error('needs the managed cua-linux preparation');
const scratch = `/tmp/${parityScratchPrefix(process.env)}lifeline`;
const remote = (script, input) => { const {command, args} = remoteCommand('cua-linux', script); return spawnSync(command, args, {encoding: 'utf8', input, maxBuffer: 16 << 20}); };
const source = readFileSync(fileURLToPath(new URL('./device.mjs', import.meta.url)), 'utf8').replaceAll("'../../../../../../", `'${prepared.checkout}/`);
const put = remote(`mkdir -p ${quote(scratch)} && cat > ${quote(`${scratch}/device.mjs`)}`, source);
if (put.status !== 0) throw new Error(`could not place device.mjs: ${put.stderr}`);
const env = {CUA_HOME: prepared.home, HOME: prepared.userHome, CUA_PARITY_REMOTE: '1', CUA_PARITY_NODE_MODE: 'managed'};
const ran = remote(`${linuxSession}\ncd ${quote(prepared.checkout)} && test "$(git rev-parse HEAD)" = ${quote(prepared.commit)} && test -z "$(git status --porcelain)" && env -u CUA_NODE ${Object.entries(env).map(([k, v]) => `${k}=${quote(v)}`).join(' ')} node ${quote(`${scratch}/device.mjs`)}`);
remote(`rm -f ${quote(`${scratch}/device.mjs`)} && rmdir ${quote(scratch)}; true`);
let result = null;
try { result = JSON.parse(ran.stdout); } catch {}
writeFileSync(out, `${JSON.stringify(result ? {commit: prepared.commit, environment: {...env, CUA_NODE: '(unset)'}, ...result} : {exitCode: ran.status, stdout: ran.stdout.slice(-4000), stderr: ran.stderr.slice(-4000)}, null, 1)}\n`);
console.log(JSON.stringify({exitCode: ran.status, ok: result?.ok ?? null, problems: result?.problems ?? null, ended: result?.results?.map(r => [r.scenario, r.childrenEndedMs])}));
process.exitCode = ran.status === 0 && result?.ok ? 0 : 1;
