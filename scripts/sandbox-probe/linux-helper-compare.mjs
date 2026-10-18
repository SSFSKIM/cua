#!/usr/bin/env node
// #115 acceptance 8, its Linux line (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md): the probe outcomes under
// the vendor `codex` and under cua's helper invocation are equal for scoped and default. Both helpers are run as cua
// runs its pinned one (src/sandbox/linux.mjs linuxCommand: `--sandbox-policy-cwd <cwd> --command-cwd <cwd>
// --permission-profile <JSON> -- <command>`, from `$CUA_HOME/sandbox/<tag>/`, with cua's fixed PATH), on the profiles
// cua itself renders for the kernel and the worker (src/sandbox/policy.mjs roleProfile with denyListFor's Linux list on
// a scratch home), and each runs the same check: reads, listings and writes of every deny-list location, the module
// tree, the run directory and session temp, hard links, and TCP and AF_UNIX connects. The vendor `codex` (0.159.2, the
// pinned deb's) is the helper by its argv[0] name. Outcomes are errno codes; the verdict is equality per role and mode.
//
//   node scripts/sandbox-probe/linux-helper-compare.mjs --home <CUA_HOME with an installed runtime and node/> \
//       --vendor <path to the vendor codex> --cua <path to cua's helper> --out <file.json>
//
// The scratch home and HOME it builds hold synthetic sentinels only; it removes them. Linux only.
import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {isDeepStrictEqual} from 'node:util';
import {denyListFor, prepareDenyTargets, realDenyList, roleProfile} from '../../src/sandbox/policy.mjs';
import {sandboxState} from '../../src/runtime/sandbox.mjs';
import {linuxCommand} from '../../src/sandbox/linux.mjs';
import {sandboxedEnv} from '../../src/sandbox/env.mjs';
import {managedNode} from '../../src/runtime/managed-node.mjs';
import {locateRuntime} from '../../src/runtime/manifest.mjs';

const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

// The check every helper runs: {label: outcome}, outcome 'ok' or an errno code.
export const CHECK = `
const fs = require('node:fs'), net = require('node:net'), path = require('node:path');
const [targets, writes, links, tcpPort, socketPath] = JSON.parse(process.argv[1]);
const out = {};
const r = (label, f) => { try { f(); out[label] = 'ok'; } catch (e) { out[label] = e.code ?? 'error'; } };
for (const [label, p] of Object.entries(targets)) { r('read ' + label, () => fs.readFileSync(p)); r('list ' + label, () => fs.readdirSync(path.dirname(p))); }
for (const [label, p] of Object.entries(writes)) r('write ' + label, () => fs.writeFileSync(p, 'x'));
for (const [label, [from, to]] of Object.entries(links)) r('link ' + label, () => fs.linkSync(from, to));
const connect = (label, o) => new Promise(done => { const s = net.connect(o); s.once('connect', () => { out[label] = 'ok'; s.destroy(); done(); }); s.once('error', e => { out[label] = e.code; done(); }); });
(async () => { await connect('tcp connect', {host: '127.0.0.1', port: tcpPort}); await connect('unix connect', {path: socketPath}); process.stdout.write(JSON.stringify(out) + '\\n'); })();
`;

function runUnder({helper, profile, cwd, node, env, args}) {
  const {file, args: argv} = linuxCommand({profile, cwd, command: [node, '-e', CHECK, JSON.stringify(args)], helper: {path: helper}});
  const dir = fs.mkdtempSync('/tmp/cua-compare-out-');
  const [outFile, errFile] = [join(dir, 'out'), join(dir, 'err')];
  const [out, err] = [fs.openSync(outFile, 'w'), fs.openSync(errFile, 'w')];
  return new Promise(done => {
    const child = spawn(file, argv, {cwd, env, stdio: ['ignore', out, err]});
    fs.closeSync(out); fs.closeSync(err);
    const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = fs.readFileSync(outFile, 'utf8').trim(), stderr = fs.readFileSync(errFile, 'utf8').trim().slice(-500);
      fs.rmSync(dir, {recursive: true, force: true});
      let outcomes = null;
      try { outcomes = JSON.parse(stdout.split('\n').at(-1)); } catch { /* reported below */ }
      done({code, outcomes, ...(outcomes ? {} : {stderr})});
    });
  });
}

export async function compareHelpers({home, vendor, cua, scratch = fs.mkdtempSync('/tmp/cua-compare-')}) {
  const runtime = locateRuntime({home});
  const node = managedNode(home)?.path;
  if (!node) throw new Error(`no cua-installed Node in ${home}`);
  const session = 'compare-session', cwd = join(home, 'run', session), sessionTmp = join(cwd, 'tmp');
  const userHome = join(scratch, 'user');
  const sentinel = dir => { fs.mkdirSync(dir, {recursive: true, mode: 0o700}); fs.writeFileSync(join(dir, 'SENTINEL'), 'synthetic'); return join(dir, 'SENTINEL'); };
  const targets = {store: sentinel(join(userHome, '.config', 'claude-secrets')), 'config cua': sentinel(join(userHome, '.config', 'cua')),
    state: sentinel(join(home, 'state', 'compare')), remote: sentinel(join(home, 'remote', 'compare')), chrome: sentinel(join(home, 'chrome', 'compare')),
    'other run': sentinel(join(home, 'run', 'compare-other')), 'module tree': join(runtime.paths.moduleDir, fs.readdirSync(runtime.paths.moduleDir).find(n => !n.startsWith('.')))};
  fs.mkdirSync(sessionTmp, {recursive: true, mode: 0o700});
  const tcp = createServer(s => s.destroy()), socketPath = join(scratch, 's.sock'), unix = createServer(s => s.destroy());
  await new Promise(r => tcp.listen(0, '127.0.0.1', r));
  await new Promise(r => unix.listen(socketPath, r));
  const writes = {'run directory': join(cwd, 'w'), 'session temp': join(sessionTmp, 'w'), home: join(home, 'w'), 'runtimes': join(home, 'runtimes', 'w'), outside: join(scratch, 'w')};
  const links = {'store into run directory': [targets.store, join(cwd, 'l1')], 'state into session temp': [targets.state, join(sessionTmp, 'l2')]};
  const report = {probe: 'linux-helper-compare', helpers: {}, results: {}, equal: {}};
  try {
    for (const [name, path] of Object.entries({vendor, cua})) {
      const placed = join(home, 'sandbox', `compare-${name}`, 'codex-linux-sandbox');
      fs.mkdirSync(join(home, 'sandbox', `compare-${name}`), {recursive: true});
      fs.copyFileSync(path, placed); fs.chmodSync(placed, 0o755);
      report.helpers[name] = placed;
    }
    for (const mode of ['scoped', 'default']) {
      const state = mode === 'scoped' ? sandboxState('scoped', cwd) : undefined;
      const deny = prepareDenyTargets(realDenyList(denyListFor({home, env: {HOME: userHome}, sessionId: session, sessionTmp, platform: 'linux', mode})), {platform: 'linux', home: userHome});
      for (const role of ['kernel', 'worker']) {
        const {profile} = roleProfile({state, role, readPaths: [join(node, '..')], denyRead: deny, network: 'restricted'});
        const env = sandboxedEnv({PATH: FIXED_PATH, HOME: userHome, TMPDIR: sessionTmp}, {platform: 'linux', network: profile.network});
        const outcomes = {};
        for (const [name, helper] of Object.entries(report.helpers))
          outcomes[name] = await runUnder({helper, profile, cwd, node, env, args: [targets, writes, links, tcp.address().port, socketPath]});
        for (const f of [...Object.values(writes), ...Object.values(links).map(([, to]) => to)]) fs.rmSync(f, {force: true});
        report.results[`${mode} ${role}`] = outcomes;
        report.equal[`${mode} ${role}`] = !!outcomes.vendor.outcomes && isDeepStrictEqual(outcomes.vendor.outcomes, outcomes.cua.outcomes);
      }
    }
  } finally {
    tcp.close(); unix.close();
    for (const dir of ['state', 'remote', 'chrome'].map(d => join(home, d, 'compare'))) fs.rmSync(dir, {recursive: true, force: true});
    for (const dir of [join(home, 'run', 'compare-other'), cwd, join(home, 'sandbox', 'compare-vendor'), join(home, 'sandbox', 'compare-cua')]) fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(scratch, {recursive: true, force: true});
  }
  report.ok = Object.values(report.equal).every(Boolean);
  return report;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const {values} = parseArgs({options: {home: {type: 'string'}, vendor: {type: 'string'}, cua: {type: 'string'}, out: {type: 'string'}}});
  if (!values.home || !values.vendor || !values.cua || !values.out) { console.error('usage: linux-helper-compare.mjs --home <CUA_HOME> --vendor <codex> --cua <helper> --out <file>'); process.exit(2); }
  const report = await compareHelpers(values);
  fs.writeFileSync(values.out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ok: report.ok, equal: report.equal}));
  process.exitCode = report.ok ? 0 : 1;
}
