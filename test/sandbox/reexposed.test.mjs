// The port's one widening deviation (src/sandbox/seatbelt.mjs header): the metadata of denied directories above a
// re-exposed path, so that path resolves. These pin its bounds on the launch the own host actually renders (policy.mjs
// deny list -> index.mjs sandboxedLaunch -> the port): exactly the cua home and its run/ for the macOS layout, as
// literals at their real paths, metadata only; never the secret store, ~/.config/cua or another session's run
// directory; nothing at all when no re-exposed path sits under a denied one. On a Mac, sandbox-exec itself confirms
// that metadata is all the grant gives.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SandboxStateError, sandboxState} from '../../src/runtime/sandbox.mjs';
import {sandboxedLaunch} from '../../src/sandbox/index.mjs';
import {denyListFor, realDenyList} from '../../src/sandbox/policy.mjs';
import {STORE_RELATIVE} from '../../src/secrets/store.mjs';

const SESSION = '7062c419-3288-4b60-970f-a808ecfcf291';
const OTHER = '0b4f6f43-2f5a-4c55-9c39-5d0bd0a1f0a2';

// A macOS-shaped cua home and user home in a scratch directory, as buildLaunch sees them.
function layout(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-reexposed-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'cuahome'), user = join(root, 'user');
  const cwd = join(home, 'run', SESSION), sessionTmp = join(cwd, 'tmp'), other = join(home, 'run', OTHER);
  const modules = join(home, 'runtimes', 'r', 'modules');
  for (const dir of [sessionTmp, other, modules, join(home, 'node'), join(home, 'state'), join(user, STORE_RELATIVE), join(user, '.config', 'cua')]) mkdirSync(dir, {recursive: true});
  writeFileSync(join(modules, 'index.mjs'), 'export {};\n');
  writeFileSync(join(user, STORE_RELATIVE, 'CUA115_SENTINEL'), 'synthetic\n');
  return {root, home, user, cwd, sessionTmp, other, modules, store: join(user, STORE_RELATIVE), configCua: join(user, '.config', 'cua')};
}

const launchFor = ({mode = 'scoped', role = 'kernel', cwd, sessionTmp, user, modules, denyRead, command = ['/usr/bin/true']}) =>
  sandboxedLaunch({platform: 'darwin', state: sandboxState(mode, cwd) ?? undefined, role, command, env: {HOME: user, TMPDIR: sessionTmp, PATH: '/usr/bin:/bin'}, cwd, readPaths: [modules], denyRead});
const params = (args, prefix) => args.filter(a => a.startsWith(`-D${prefix}`)).map(a => a.slice(a.indexOf('=') + 1));
const grants = args => params(args, 'REEXPOSED_ANCESTOR_');

test('the macOS layout grants exactly the cua home and its run/, as metadata literals, under scoped and default', t => {
  const l = layout(t);
  const denyRead = realDenyList(denyListFor({home: l.home, env: {HOME: l.user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform: 'darwin'}));
  for (const mode of ['scoped', 'default']) {
    const {args} = launchFor({...l, mode, denyRead});
    assert.deepEqual(grants(args), [l.home, join(l.home, 'run')], mode);
    for (const never of [l.store, l.configCua, l.other, join(l.home, 'state')]) assert.equal(grants(args).some(g => g === never || g.startsWith(`${never}/`)), false, `${mode}: ${never}`);
    // One rule names the grant: literal file-read-metadata of exactly those params, last in the profile.
    const profile = args[1];
    const rules = profile.split('\n').filter(line => line.includes('REEXPOSED_ANCESTOR'));
    assert.deepEqual(rules, ['(allow file-read-metadata (literal (param "REEXPOSED_ANCESTOR_0")) (literal (param "REEXPOSED_ANCESTOR_1")))'], mode);
    assert.ok(profile.endsWith(rules[0]), `${mode}: last, so nothing after it narrows or widens it`);
    // file-read-data on those paths stays denied: no readable root is either of them or above them without excluding
    // the cua home, and the home itself is an exclusion of the root that covers it.
    const readable = args.filter(a => /^-DREADABLE_ROOT_\d+=/.test(a)).map(a => a.slice(a.indexOf('=') + 1));
    for (const granted of grants(args)) assert.equal(readable.includes(granted), false, `${mode}: ${granted} is not a readable root`);
    assert.ok(args.some(a => /^-DREADABLE_ROOT_\d+_EXCLUDED_\d+=/.test(a) && a.endsWith(`=${l.home}`)), `${mode}: the cua home is excluded from what is readable`);
  }
  assert.deepEqual(grants(launchFor({...l, role: 'worker', denyRead}).args), [], 'the worker denies nothing, so it grants nothing');
});

test('no grant when no re-exposed path sits under a denied directory', t => {
  const l = layout(t);
  for (const denyRead of [{deny: [l.store, l.configCua], reexpose: [], metadataOnly: [], tiers: []}, {deny: [l.store, l.configCua], reexpose: [l.modules], metadataOnly: [], tiers: []}, {deny: [l.store], reexpose: [l.cwd, l.sessionTmp], metadataOnly: [], tiers: []}]) {
    const {args} = launchFor({...l, denyRead});
    assert.deepEqual(grants(args), [], JSON.stringify(denyRead));
    assert.doesNotMatch(args[1], /file-read-metadata \(literal \(param "REEXPOSED/);
  }
});

test('a cua home reached through a symlink is granted at its real path, never at the link or a sibling', t => {
  const l = layout(t);
  const link = join(l.root, 'home-link');
  symlinkSync(l.home, link);
  // The deny list as spelled through the link (not canonicalized by the caller): the port resolves it itself.
  const via = path => path.replace(l.home, link);
  const denyRead = {deny: [l.store, l.configCua, link], reexpose: [via(join(l.home, 'runtimes')), via(join(l.home, 'node')), via(l.cwd), via(l.sessionTmp)], metadataOnly: [link, via(join(l.home, 'run'))], tiers: []};
  const {args} = launchFor({...l, denyRead});
  assert.deepEqual(grants(args), [l.home, join(l.home, 'run')]);
  assert.equal(args.some(a => a.includes(link)), false, 'nothing is rendered at the link\'s spelling');
});

const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
test('on a Mac, sandbox-exec gives the granted directories metadata only, and another session\'s run directory nothing', {skip: (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) && 'needs macOS sandbox-exec'}, t => {
  const l = layout(t);
  const denyRead = realDenyList(denyListFor({home: l.home, env: {HOME: l.user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform: 'darwin'}));
  const probe = 'for p in "$@"; do stat "$p" >/dev/null 2>&1 && m=allow || m=deny; ls "$p" >/dev/null 2>&1 && d=allow || d=deny; echo "$p $m $d"; done';
  const targets = [l.home, join(l.home, 'run'), l.other, l.store, l.configCua, join(l.home, 'state'), join(l.home, 'runtimes')];
  const {command, args, env, cwd} = launchFor({...l, denyRead, command: ['/bin/sh', '-c', probe, 'probe', ...targets]});
  const out = execFileSync(command, args, {env, cwd, encoding: 'utf8'});
  const seen = Object.fromEntries(out.trim().split('\n').map(line => { const [path, metadata, data] = line.split(' '); return [path, {metadata, data}]; }));
  assert.deepEqual(seen, {
    [l.home]: {metadata: 'allow', data: 'deny'},
    [join(l.home, 'run')]: {metadata: 'allow', data: 'deny'},
    [l.other]: {metadata: 'deny', data: 'deny'},
    [l.store]: {metadata: 'deny', data: 'deny'},
    [l.configCua]: {metadata: 'deny', data: 'deny'},
    [join(l.home, 'state')]: {metadata: 'deny', data: 'deny'},
    [join(l.home, 'runtimes')]: {metadata: 'allow', data: 'allow'},
  });
});

// The renderer's own bound (review finding, M1): a grant outside the launch's metadataOnly is refused, never rendered.
test('the port refuses a profile that needs a metadata grant outside the launch\'s allowed set', t => {
  const l = layout(t);
  const denyRead = realDenyList(denyListFor({home: l.home, env: {HOME: l.user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform: 'darwin'}));
  for (const metadataOnly of [[], [l.home], [join(l.home, 'run')], [l.store, l.home]])
    assert.throws(() => launchFor({...l, denyRead: {...denyRead, metadataOnly}}), error => error instanceof SandboxStateError && /does not allow/.test(error.message), JSON.stringify(metadataOnly));
  // An allowed set larger than needed grants only what is needed.
  assert.deepEqual(grants(launchFor({...l, denyRead: {...denyRead, metadataOnly: [...denyRead.metadataOnly, l.store]}}).args), [l.home, join(l.home, 'run')]);
});

// Overlapping layouts: the store, ~/.config/cua or a tier inside the home, or the home inside the store, never render.
test('an overlapping layout refuses the kernel launch before rendering, so the store never gets a metadata grant', t => {
  const l = layout(t);
  const layouts = {
    'home under the store': {home: join(l.store, 'cua'), env: {HOME: l.user}},
    'store under the home': {home: l.home, env: {HOME: l.user}, secretsDir: join(l.home, 'state', 'secrets')},
    '~/.config/cua under the home': {home: l.home, env: {HOME: join(l.home, 'user')}},
  };
  for (const [label, input] of Object.entries(layouts)) {
    const cwd = join(input.home, 'run', SESSION), sessionTmp = join(cwd, 'tmp');
    mkdirSync(sessionTmp, {recursive: true});
    const denyRead = realDenyList(denyListFor({...input, sessionId: SESSION, sessionTmp, platform: 'darwin'}));
    for (const mode of ['scoped', 'default'])
      assert.throws(() => launchFor({...l, mode, cwd, sessionTmp, denyRead}), {code: 'sandbox_conflict'}, `${label} (${mode})`);
  }
});

// macOS creates no deny target (the dispatching session's ruling, #115 M1): a store missing at launch is denied at its
// realish path, and seatbelt keeps denying it once it appears mid-session, through a symlinked ~/.config too.
test('on a Mac, a store root missing at launch and created mid-session stays denied, through a symlinked ~/.config too', {skip: (process.platform !== 'darwin' || !existsSync(SANDBOX_EXEC)) && 'needs macOS sandbox-exec'}, async t => {
  const l = layout(t);
  for (const symlinked of [false, true]) {
    const user = join(l.root, symlinked ? 'user-linked' : 'user-plain');
    if (symlinked) { mkdirSync(join(l.root, 'config-real')); mkdirSync(user); symlinkSync(join(l.root, 'config-real'), join(user, '.config')); }
    else mkdirSync(join(user, '.config'), {recursive: true});
    const store = join(user, STORE_RELATIVE);
    const denyRead = realDenyList(denyListFor({home: l.home, env: {HOME: user}, sessionId: SESSION, sessionTmp: l.sessionTmp, platform: 'darwin'}));
    const signal = join(l.sessionTmp, `go-${symlinked}`);
    const probe = 'until [ -e "$2" ]; do sleep 0.05; done; for p in "$1" "$1/KEY" "$3"; do stat "$p" >/dev/null 2>&1 && m=allow || m=deny; '
      + 'if [ -d "$p" ]; then ls "$p" >/dev/null 2>&1 && d=allow || d=deny; else cat "$p" >/dev/null 2>&1 && d=allow || d=deny; fi; echo "$m $d"; done';
    const launch = launchFor({...l, user, denyRead, command: ['/bin/sh', '-c', probe, 'probe', store, signal, join(user, 'control')]});
    assert.equal(existsSync(store), false, 'missing at launch');
    const child = spawn(launch.command, launch.args, {env: launch.env, cwd: launch.cwd});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    const done = new Promise(resolve => child.on('exit', resolve));
    await new Promise(r => setTimeout(r, 300));
    mkdirSync(store, {mode: 0o700});
    writeFileSync(join(store, 'KEY'), 'synthetic\n', {mode: 0o600});
    mkdirSync(join(user, 'control'));   // the control: a directory beside it, made at the same moment, which nothing denies
    writeFileSync(signal, '');
    await done;
    assert.equal(existsSync(join(store, 'KEY')), true, 'the store exists by the time the kernel looks');
    assert.equal(out.trim(), 'deny deny\ndeny deny\nallow allow', `${symlinked ? 'symlinked' : 'plain'} ~/.config: the late store and its key stay denied`);
  }
});
