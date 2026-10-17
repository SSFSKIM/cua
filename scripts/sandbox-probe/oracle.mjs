#!/usr/bin/env node
// The #115 M0 launcher oracles, run on the mini against an installed scratch CUA_HOME (never the resident one):
//
//   node scripts/sandbox-probe/oracle.mjs capture --home <CUA_HOME> --user-home <HOME> --mode scoped|default --cli <codex> --cap <capture-argv> --out <file>
//     cua's own-host kernel launch for that mode, built by cua's own code (supervisor.mjs hostSettings + kernelLaunch over
//     sandbox.mjs sandboxState/sandboxPolicy), run under capture-argv.c: what the CLI handed /usr/bin/sandbox-exec.
//   node scripts/sandbox-probe/oracle.mjs golden --generator <cua-sandbox-golden> --capture <file> --out <file>
//     the original's generator on the same input, and compare.mjs's comparison with the capture.
//   node scripts/sandbox-probe/oracle.mjs fingerprint --home ... --user-home ... --mode ... --cli <codex> --fp <fingerprint> --out <file>
//     fingerprint.c in place of the kernel's command, under the same launch, with the deny-list locations, another
//     session's run directory and a harness TCP and Unix listener added as labelled targets.
//     With --generator <cua-sandbox-golden> instead of --cli, the same probe runs under /usr/bin/sandbox-exec with the
//     argv the original's generator renders for the kernel role: the mode's profile plus the spec's deny list (the
//     scratch store, ~/.config/cua and the whole cua home, with runtimes/ and node/ re-exposed read-only; the run
//     directory and its temp stay the write roots under scoped and are re-exposed read-only under default), in the
//     numeric TIOCSTI form cua's port emits: the spec's nesting, rendered by the original and enforced by the OS, before
//     any port exists.
//   node scripts/sandbox-probe/oracle.mjs compare-fingerprints <a.json> <b.json> [--out <file>]
//   node scripts/sandbox-probe/oracle.mjs compare-experiments <a.json> <b.json> [--out <file>]
//     two experiment.mjs runs (experiment A: the signed CLI against the public build; the replay against the signed CLI).
//
// The launch's environment is the kernel's own (hostSettings' kernelEnv: HOME, PATH, TMPDIR, the kernel settings) plus
// CODEX_HOME, exactly what the own host hands the CLI; its TMPDIR is the session's run/<id>/tmp, the spec's per-session
// temp. Nothing of the owner's is read: HOME is the scratch user home, CODEX_HOME the scratch home's.
import {execFile, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {hostSettings, kernelLaunch} from '../../src/repl-host/supervisor.mjs';
import {homeLayout, realHome} from '../../src/runtime/layout.mjs';
import {ownHostNode} from '../../src/runtime/launch.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {sandboxArgs, sandboxPolicy, sandboxState} from '../../src/runtime/sandbox.mjs';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';
import {compareCapture, compareExperiments, compareFingerprints, profileFromPolicy} from './compare.mjs';

const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
// KERN_PROCARGS2 carries the kernel's "apple" strings after the environment (per-process entropy and code identity, not
// environment variables): dropped from a capture by name, and the names recorded.
const APPLE_STRINGS = /^(pfz|stack_guard|malloc_entropy|ptr_munge|main_stack|executable_file|dyld_file|executable_cdhash|executable_boothash|th_port|security_config|dyld_hw_tpro|dyld_hw_tpro_pagers|arm64e_abi|executable_path|ptr_munge_x|dyld_flags)=/;

// cua's own-host kernel launch for `mode` in a fresh session of `home`, with `command` in place of the kernel's when given.
export function ownLaunch({home, userHome, mode, cli, command}) {
  const real = realHome(home);
  const layout = homeLayout(real);
  const runtime = resolveRuntime({home: real});
  const node = ownHostNode({ambient: {}, home: real});
  const sessionId = randomUUID();
  const cwd = join(layout.run, sessionId);
  mkdirSync(join(cwd, 'tmp'), {recursive: true, mode: 0o700});
  const env = {HOME: userHome, PATH: FIXED_PATH, TMPDIR: join(cwd, 'tmp'), LANG: 'C.UTF-8', CUA_REPL_NODE_PATH: node, CODEX_CLI_PATH: cli,
    CODEX_HOME: layout.codexHome, CUA_REPL_NODE_MODULE_DIRS: runtime.paths.moduleDir};
  const settings = hostSettings(env, {cwd});
  const state = sandboxState(mode, cwd) ?? undefined;
  const policy = sandboxPolicy(state, {readPaths: settings.readPaths});
  const launch = command
    ? {command: cli, args: sandboxArgs(policy, command), env: {...settings.kernelEnv, CODEX_HOME: layout.codexHome}, cwd: policy.cwd ?? cwd}
    : kernelLaunch(settings, policy);
  return {mode, sessionId, layout, runtime, policy, launch};
}

const json = value => `${JSON.stringify(value, null, 2)}\n`;
const describe = ({mode, sessionId, policy, launch}) => ({mode, sessionId, cli: launch.command, cwd: launch.cwd, policy, env: launch.env, args: launch.args});

function capture(values) {
  const built = ownLaunch({home: values.home, userHome: values['user-home'], mode: values.mode, cli: values.cli});
  const run = spawnSync(values.cap, ['--tries', '20', '--', built.launch.command, ...built.launch.args], {env: built.launch.env, cwd: built.launch.cwd, encoding: 'utf8', timeout: 600_000});
  const captured = JSON.parse(run.stdout.trim().split('\n').at(-1));
  if (captured.env) {
    captured.appleStringsDropped = captured.env.filter(e => APPLE_STRINGS.test(e)).map(e => e.split('=')[0]);
    captured.env = captured.env.filter(e => !APPLE_STRINGS.test(e));
  }
  // The session directory stays for `golden`, which renders against the same filesystem and then removes it.
  writeFileSync(values.out, json({input: describe(built), captured, captureExit: run.status}));
  process.stderr.write(`capture ${values.mode}: ${captured.captured ? `caught on try ${captured.try}` : `not caught in ${captured.tries} tries`}\n`);
}

function golden(values) {
  const record = JSON.parse(readFileSync(values.capture, 'utf8'));
  const {input} = record;
  const command = input.args.slice(input.args.indexOf('--') + 1);
  const goldenInput = {cwd: input.cwd, profile: profileFromPolicy(input.policy), command, env: input.env};
  const run = spawnSync(values.generator, [], {input: JSON.stringify(goldenInput), encoding: 'utf8',
    env: {HOME: input.env.HOME, PATH: FIXED_PATH, ...(input.env.TMPDIR ? {TMPDIR: input.env.TMPDIR} : {})}});
  rmSync(input.cwd, {recursive: true, force: true});
  if (run.status !== 0) throw new Error(`generator failed: ${run.stderr}`);
  const output = JSON.parse(run.stdout);
  writeFileSync(values.out, json({input: goldenInput, golden: output, comparison: compareCapture({captured: record.captured, golden: output})}));
}

// The kernel role's policy for `mode` in `cwd`: the mode's entries plus `deny` (none) and `reexpose` (read), in cua's
// key order (sandboxPolicy).
function kernelPolicy({mode, cwd, readPaths, deny, reexpose}) {
  const special = kind => ({type: 'special', value: {kind}});
  const base = mode === 'scoped' ? sandboxState('scoped', cwd).permissionProfile.file_system.entries : [{path: special('root'), access: 'read'}];
  const entries = [...base, ...deny.map(path => ({path: {type: 'path', path}, access: 'none'})), ...reexpose.map(path => ({path: {type: 'path', path}, access: 'read'}))];
  return sandboxPolicy({permissionProfile: {type: 'managed', file_system: {type: 'restricted', entries}, network: 'restricted'}, sandboxCwd: pathToFileURL(cwd).href}, {readPaths});
}

// The original's kernel-role argv for `built`'s launch (oracle's ownLaunch), run under sandbox-exec.
function goldenKernelLaunch(built, {generator, deny, reexpose}) {
  const {launch} = built;
  const command = launch.args.slice(launch.args.indexOf('--') + 1);
  const readPaths = built.policy.filesystem.filter(([key, access]) => !key.startsWith(':') && access === 'read').map(([key]) => key);
  const policy = kernelPolicy({mode: built.mode, cwd: launch.cwd, readPaths, deny, reexpose});
  const input = {cwd: launch.cwd, profile: profileFromPolicy(policy), command, env: launch.env};
  const run = spawnSync(generator, [], {input: JSON.stringify(input), encoding: 'utf8', env: {HOME: launch.env.HOME, PATH: FIXED_PATH, TMPDIR: launch.env.TMPDIR}});
  if (run.status !== 0) throw new Error(`generator failed: ${run.stderr}`);
  const output = JSON.parse(run.stdout);
  if (output.error) throw new Error(`the original refuses the kernel policy: ${output.error}`);
  return {policy, launch: {command: '/usr/bin/sandbox-exec', args: output.argsNumeric, env: output.env, cwd: launch.cwd}};
}

async function fingerprint(values) {
  const tcp = createServer(socket => socket.end());
  const sock = join(tmpdir(), `cuafp-${process.pid}.sock`);
  const uds = createServer(socket => socket.end());
  await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => uds.listen(sock, resolve));
  try {
    const userHome = values['user-home'];
    const real = realHome(values.home);
    const layout = homeLayout(real);
    const other = join(layout.run, 'other-session');
    mkdirSync(other, {recursive: true, mode: 0o700});
    // sandbox_check reports a missing path as denied, so every target exists (the spec creates the deny targets too).
    for (const dir of [join(userHome, '.config', 'cua'), join(userHome, STORE_RELATIVE)]) mkdirSync(dir, {recursive: true, mode: 0o700});
    const targets = {'cua-home': layout.home, 'cua-home/state': join(layout.home, 'state'), 'cua-home/runtimes': layout.runtimes, 'cua-home/node': layout.node,
      'cua-home/run/other': other, 'config-cua': join(userHome, '.config', 'cua'), store: join(userHome, STORE_RELATIVE),
      checkout: dirname(dirname(dirname(new URL(import.meta.url).pathname)))};
    // A file a cell must not be able to read through a link: a synthetic sentinel in the scratch store.
    const sentinel = join(userHome, STORE_RELATIVE, 'CUA115_SENTINEL');
    writeFileSync(sentinel, 'synthetic\n', {mode: 0o600});
    const command = [values.fp, ...Object.entries(targets).flatMap(([label, path]) => ['--path', `${label}=${path}`]), '--link', `store-sentinel=${sentinel}`,
      '--tcp', `harness-tcp=127.0.0.1:${tcp.address().port}`, '--unix', `harness-unix=${sock}`];
    const built = ownLaunch({home: values.home, userHome, mode: values.mode, cli: values.cli ?? '/nonexistent/codex', command});
    if (values.generator) Object.assign(built, goldenKernelLaunch(built, {generator: values.generator,
      deny: [targets.store, targets['config-cua'], layout.home],
      // Under default the run directory and its temp are no write roots, so they are re-exposed read-only (spec, "Policy").
      reexpose: [layout.runtimes, layout.node, ...(values.mode === 'default' ? [built.launch.cwd, built.launch.env.TMPDIR] : [])]}));
    const run = await new Promise(resolve => {
      // Asynchronous, so this process keeps accepting the probe's connections while it runs.
      execFile(built.launch.command, built.launch.args, {env: built.launch.env, cwd: built.launch.cwd, encoding: 'utf8', timeout: 60_000},
        (error, stdout, stderr) => resolve({status: error ? (error.code ?? 1) : 0, stdout, stderr}));
    });
    rmSync(join(layout.run, built.sessionId), {recursive: true, force: true});
    if (run.status !== 0) throw new Error(`fingerprint under ${built.launch.command} exited ${run.status}: ${run.stderr.slice(0, 2000)}`);
    writeFileSync(values.out, json({input: describe(built), launcher: values.label ?? values.cli ?? 'golden-kernel', fingerprint: JSON.parse(run.stdout)}));
  } finally {
    tcp.close(); uds.close(); rmSync(sock, {force: true});
  }
}

function compareFiles(values, positionals, kind) {
  const [a, b] = positionals.map(file => JSON.parse(readFileSync(file, 'utf8')));
  const result = kind === 'experiments'
    ? {left: {file: positionals[0], label: a.label, cli: a.cli, appServer: a.appServer}, right: {file: positionals[1], label: b.label, cli: b.cli, appServer: b.appServer}, ...compareExperiments(a, b)}
    : {left: {file: positionals[0], launcher: a.launcher}, right: {file: positionals[1], launcher: b.launcher}, ...compareFingerprints(a.fingerprint, b.fingerprint)};
  if (values.out) writeFileSync(values.out, json(result));
  process.stdout.write(json(result));
}

async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, options: {home: {type: 'string'}, 'user-home': {type: 'string'}, mode: {type: 'string'},
    cli: {type: 'string'}, cap: {type: 'string'}, fp: {type: 'string'}, out: {type: 'string'}, generator: {type: 'string'}, capture: {type: 'string'}, label: {type: 'string'}}});
  const [command, ...rest] = positionals;
  if (command === 'capture') capture(values);
  else if (command === 'golden') golden(values);
  else if (command === 'fingerprint') await fingerprint(values);
  else if (command === 'compare-fingerprints') compareFiles(values, rest, 'fingerprints');
  else if (command === 'compare-experiments') compareFiles(values, rest, 'experiments');
  else throw new Error('usage: oracle.mjs capture|golden|fingerprint|compare-fingerprints ...');
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
