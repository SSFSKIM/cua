// The compat executable's JavaScript (#115 M2, src/sandbox/codex-compat.mjs): the macOS vendor host's CODEX_CLI_PATH.
// `sandbox` accepts exactly node_repl's recovered template, takes the role from the script's basename and its settings
// from the session's compat file (located from TMPDIR and CODEX_HOME), and execs /usr/bin/sandbox-exec; `app-server`
// answers the native helper's policy read; anything else exits 1 with a sentence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {sandboxArgs, sandboxPolicy, sandboxState} from '../../src/runtime/sandbox.mjs';
import {main, parseInlineTable, parseSandboxArgv, roleOf, sandboxRequest} from '../../src/sandbox/codex-compat.mjs';
import {locateSettings, readSettings} from '../../src/sandbox/compat-settings.mjs';

// A cua home with one session's compat settings, as buildLaunch writes them.
function session(t, {id = 's1'} = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-compat-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'cua'), cwd = join(home, 'run', id), sessionTmp = join(cwd, 'tmp'), codexHome = join(home, 'state', 'codex');
  for (const dir of [sessionTmp, codexHome, join(home, 'state', 'compat'), join(home, 'runtimes', 'r', 'bin')]) mkdirSync(dir, {recursive: true});
  const denyRead = {deny: [join(root, 'user', '.config', 'store'), join(root, 'user', '.config', 'cua'), home],
    reexpose: [join(home, 'runtimes'), join(home, 'node'), cwd, sessionTmp], metadataOnly: [home, join(home, 'run')], tiers: []};
  const file = join(home, 'state', 'compat', `${id}.json`);
  writeFileSync(file, JSON.stringify({denyRead, sessionTmp, home}));
  const env = {HOME: join(root, 'user'), PATH: '/usr/bin:/bin', TMPDIR: sessionTmp, CODEX_HOME: codexHome, LANG: 'C', NODE_REPL_AUTH_TOKEN: 'synthetic'};
  return {root, home, cwd, sessionTmp, codexHome, denyRead, file, env, node: join(home, 'runtimes', 'r', 'bin', 'node')};
}

// node_repl's rendering of a call's state (shim.log): its read entries first, then the state's.
function template(s, {mode = 'scoped', script = 'kernel.js'} = {}) {
  const scripts = join(s.sessionTmp, '.tmpAbC123');
  const policy = sandboxPolicy(mode === 'scoped' ? sandboxState('scoped', s.cwd) : undefined, {readPaths: [join(s.home, 'runtimes', 'r', 'bin'), scripts]});
  return sandboxArgs(policy, [s.node, '--experimental-vm-modules', join(scripts, script), ...(script === 'kernel.js' ? ['--session-id', 'x', '--working-dir', s.cwd] : [s.cwd])]);
}

// main with doubles for the process boundary; `execve` records instead of replacing the process.
async function run(argv, env, {cwd, execve, stdin = ''} = {}) {
  let stderr = '', stdout = '';
  const execs = [], chdirs = [];
  const input = new PassThrough();
  input.end(stdin);
  const io = {stdin: input, stdout: {write: text => { stdout += text; }}, stderr: {write: text => { stderr += text; }}, cwd: () => cwd, chdir: dir => chdirs.push(dir),
    execve: execve ?? ((file, args, childEnv) => { execs.push({file, args, env: childEnv}); }), canExecute: () => true};
  const code = await main(argv, env, io);
  return {code, stderr, stdout, execs, chdirs};
}

test('the inline-table subset: bare and quoted keys, strings with escapes, nested tables, booleans; nothing else', () => {
  assert.deepEqual(parseInlineTable('{filesystem = {"/a b" = "read", ":workspace_roots" = {"." = "write"}}, network = {enabled = false}}'),
    {filesystem: {'/a b': 'read', ':workspace_roots': {'.': 'write'}}, network: {enabled: false}});
  assert.deepEqual(parseInlineTable('{"q\\"\\\\\\u00e9" = "x"}'), {'q"\\é': 'x'});
  assert.deepEqual(parseInlineTable('{}'), {});
  for (const bad of ['', '{', '{a = "x",}', '{a = "x" b = "y"}', '{a = "x", a = "y"}', '{a = 1}', '{a = \'x\'}', '{a = "x"} trailing', '{a = [1]}',
    '{"\\q" = "x"}', '{a = "unterminated}', '{a.b = "x"}', '{= "x"}', '{a = "x\ny"}'])
    assert.throws(() => parseInlineTable(bad), /table/, `refused: ${JSON.stringify(bad)}`);
});

test('the recovered template is accepted: node_repl\'s read entries become read paths, the rest the state, in the run directory', t => {
  const s = session(t);
  const {filesystem, command} = parseSandboxArgv(template(s));
  assert.equal(command[0], s.node);
  const request = sandboxRequest({filesystem, cwd: s.cwd});
  assert.deepEqual([...request.readPaths].sort(), [join(s.home, 'runtimes', 'r', 'bin'), join(s.sessionTmp, '.tmpAbC123')].sort());
  assert.equal(request.state.sandboxCwd, sandboxState('scoped', s.cwd).sandboxCwd);
  assert.deepEqual(sandboxPolicy(request.state, {readPaths: request.readPaths}).filesystem, sandboxPolicy(sandboxState('scoped', s.cwd), {readPaths: request.readPaths}).filesystem,
    'the same table cua\'s own state renders');
  const fallback = sandboxRequest({...parseSandboxArgv(template(s, {mode: 'default'})), cwd: s.cwd});
  assert.deepEqual(sandboxPolicy(fallback.state, {readPaths: fallback.readPaths}).filesystem, sandboxPolicy(undefined, {readPaths: fallback.readPaths}).filesystem);
});

test('node_repl\'s own rendering, as shim.log recorded it, is accepted', () => {
  const argv = ['sandbox', '-c', 'shell_environment_policy.inherit="all"', '-c', 'default_permissions="node_repl"', '-c',
    'permissions.node_repl={filesystem = {"/r/cua_node/bin" = "read", "/r/cua_node/lib/node_modules" = "read", "/t/.tmp5yQpum" = "read", ":root" = "read", ":tmpdir" = "write", ":workspace_roots" = {"." = "write"}}, network = {enabled = false}}',
    '--', '/r/cua_node/bin/node', '--experimental-vm-modules', '/t/.tmp5yQpum/kernel.js'];
  const {filesystem} = parseSandboxArgv(argv);
  assert.deepEqual(Object.keys(filesystem), ['/r/cua_node/bin', '/r/cua_node/lib/node_modules', '/t/.tmp5yQpum', ':root', ':tmpdir', ':workspace_roots']);
});

test('every deviation from the template is refused with a sentence', t => {
  const s = session(t);
  const good = template(s);
  const at = key => good.findIndex(a => a.startsWith(key));
  const swap = (i, value) => good.map((a, j) => (j === i ? value : a));
  const perms = good[at('permissions.node_repl=')];
  const cases = {
    'no subcommand': [],
    'another key': swap(at('default_permissions='), 'model="o3"'),
    'another value': swap(at('shell_environment_policy.'), 'shell_environment_policy.inherit="none"'),
    'keys out of order': ['sandbox', '-c', good[4], '-c', good[2], ...good.slice(5)],
    'a fourth key': ['sandbox', '-c', 'features.use_legacy_landlock=true', ...good.slice(1)],
    'a Unix-socket grant': [...good.slice(0, good.indexOf('--')), '--allow-unix-socket', '/tmp/s', ...good.slice(good.indexOf('--'))],
    'no command': good.slice(0, good.indexOf('--') + 1),
    'no --': good.filter(a => a !== '--'),
    'a malformed table': swap(at('permissions.node_repl='), perms.slice(0, -1)),
    'the network on': swap(at('permissions.node_repl='), perms.replace('enabled = false', 'enabled = true')),
    'another table member': swap(at('permissions.node_repl='), perms.replace('network = ', 'proxy = {}, network = ')),
    'a relative path': swap(at('permissions.node_repl='), perms.replace('{"/', '{"relative/')),
    'a path that is not read': swap(at('permissions.node_repl='), perms.replace('/bin" = "read"', '/bin" = "write"')),
    'an unknown special': swap(at('permissions.node_repl='), perms.replace('":root"', '":home"')),
    'a project-roots subpath': swap(at('permissions.node_repl='), perms.replace('{"." = "write"}', '{"sub" = "write"}')),
  };
  for (const [label, argv] of Object.entries(cases))
    assert.throws(() => parseSandboxArgv(argv), error => error.message.length > 20, label);
});

test('the role is the script\'s basename: kernel.js the kernel, trusted-worker.js the worker, anything else the kernel', () => {
  assert.equal(roleOf(['/n', '--experimental-vm-modules', '/t/.tmpX/kernel.js', '--session-id', 'a']), 'kernel');
  assert.equal(roleOf(['/n', '--experimental-vm-modules', '/t/.tmpX/trusted-worker.js', '/w']), 'worker');
  assert.equal(roleOf(['/n', '--experimental-vm-modules', '/t/.tmpX/trusted-worker.js.bak']), 'kernel');
  assert.equal(roleOf(['/n', '--experimental-vm-modules', '/t/trusted-worker.js/kernel.js']), 'kernel');
  assert.equal(roleOf(['/n', '--experimental-vm-modules']), 'kernel');
  assert.equal(roleOf(['/t/trusted-worker.js']), 'kernel', 'the Node itself is never the script');
});

test('the settings are located from TMPDIR (the session) and CODEX_HOME (the home) and read once', t => {
  const s = session(t);
  const located = locateSettings(s.env);
  assert.deepEqual(located, {home: s.home, sessionId: 's1', file: s.file});
  assert.deepEqual(readSettings(located, s.env), {denyRead: s.denyRead, sessionTmp: s.sessionTmp, home: s.home});
});

test('each settings refusal: TMPDIR or CODEX_HOME that does not locate the file, a missing or malformed file, a file naming another session', t => {
  const s = session(t);
  const refusals = {
    'TMPDIR unset': {...s.env, TMPDIR: undefined},
    'TMPDIR relative': {...s.env, TMPDIR: 'run/s1/tmp'},
    'TMPDIR outside run/<id>/tmp': {...s.env, TMPDIR: join(s.root, 'elsewhere', 'tmp')},
    'TMPDIR the caller\'s': {...s.env, TMPDIR: '/var/folders/xy/T/'},
    'TMPDIR not normalized': {...s.env, TMPDIR: join(s.home, 'run', 's1', 'tmp') + '/'},
    'TMPDIR with ..': {...s.env, TMPDIR: `${s.home}/run/../run/s1/tmp`},
    'TMPDIR one level deeper': {...s.env, TMPDIR: join(s.sessionTmp, 'tmp')},
    'a session id of another shape': {...s.env, TMPDIR: join(s.home, 'run', '.hidden', 'tmp')},
    'CODEX_HOME unset': {...s.env, CODEX_HOME: undefined},
    'CODEX_HOME relative': {...s.env, CODEX_HOME: 'state/codex'},
    'CODEX_HOME outside <home>/state': {...s.env, CODEX_HOME: join(s.home, 'codex')},
    'CODEX_HOME naming another home': {...s.env, CODEX_HOME: join(s.root, 'other', 'state', 'codex')},
  };
  for (const [label, env] of Object.entries(refusals)) {
    const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
    assert.throws(() => readSettings(locateSettings(clean), clean), error => error.message.length > 20, label);
  }
});

test('each settings-file refusal: missing, not JSON, another shape, a home or session temp that differs, a symlink', t => {
  const s = session(t);
  const write = content => writeFileSync(s.file, typeof content === 'string' ? content : JSON.stringify(content));
  const good = {denyRead: s.denyRead, sessionTmp: s.sessionTmp, home: s.home};
  const files = {
    'not JSON': '{"denyRead":',
    'an array': '[]',
    'an extra member': {...good, extra: 1},
    'a member missing': {denyRead: s.denyRead, home: s.home},
    'a malformed deny list': {...good, denyRead: {deny: ['relative'], reexpose: [], metadataOnly: [], tiers: []}},
    'a deny list without its tiers': {...good, denyRead: {deny: [], reexpose: [], metadataOnly: []}},
    'another home': {...good, home: join(s.root, 'other')},
    'another session temp': {...good, sessionTmp: join(s.home, 'run', 's2', 'tmp')},
  };
  for (const [label, content] of Object.entries(files)) {
    write(content);
    assert.throws(() => readSettings(locateSettings(s.env), s.env), error => error.message.length > 20, label);
  }
  rmSync(s.file);
  assert.throws(() => readSettings(locateSettings(s.env), s.env), /settings/, 'missing');
  writeFileSync(join(s.root, 'planted.json'), JSON.stringify(good));
  symlinkSync(join(s.root, 'planted.json'), s.file);
  assert.throws(() => readSettings(locateSettings(s.env), s.env), /settings/, 'a symlink is not the session\'s file');
  rmSync(s.file);
  write({...good, denyRead: null});
  assert.deepEqual(readSettings(locateSettings(s.env), s.env).denyRead, null, 'a disabled connection\'s file carries no list');
});

test('sandbox: the kernel is exec\'d under sandbox-exec with its deny list, in its run directory, with the sandbox\'s environment', async t => {
  const s = session(t);
  const result = await run(template(s), s.env, {cwd: s.cwd});
  assert.equal(result.code, undefined, result.stderr);
  assert.equal(result.execs.length, 1);
  const [{file, args, env}] = result.execs;
  assert.equal(file, '/usr/bin/sandbox-exec');
  assert.equal(args[0], '/usr/bin/sandbox-exec', 'argv[0]');
  assert.deepEqual(args.slice(args.indexOf('--') + 1), template(s).slice(template(s).indexOf('--') + 1), 'the command itself');
  assert.ok(args.some(a => a.startsWith('-DREADABLE_ROOT') && a.endsWith(`=${s.home}`)), 'the cua home is excluded from what the kernel reads');
  assert.ok(args.some(a => a === `-DWRITABLE_ROOT_0=${s.sessionTmp}`), 'the session temp stays writable');
  assert.equal(env.NODE_REPL_AUTH_TOKEN, undefined, 'the original\'s stripped names');
  assert.equal(env.CODEX_SANDBOX, 'seatbelt');
  assert.equal(env.TMPDIR, s.sessionTmp);
  assert.deepEqual(result.chdirs, [s.cwd]);
});

test('sandbox: the worker gets the worker\'s profile (the deny list is the kernel\'s only), from the same settings', async t => {
  const s = session(t);
  const result = await run(template(s, {script: 'trusted-worker.js'}), s.env, {cwd: s.cwd});
  assert.equal(result.code, undefined, result.stderr);
  const [{args}] = result.execs;
  assert.ok(!args.some(a => a.startsWith('-DREADABLE_ROOT')), 'full read');
  assert.match(args[2], /\(allow file-read\*\)/);
});

test('sandbox: a missing settings file or a kernel without a deny list exits 1 with a sentence, before anything is exec\'d', async t => {
  const s = session(t);
  writeFileSync(s.file, JSON.stringify({denyRead: null, sessionTmp: s.sessionTmp, home: s.home}));
  const kernel = await run(template(s), s.env, {cwd: s.cwd});
  assert.equal(kernel.code, 1);
  assert.match(kernel.stderr, /^cua-codex-compat: .*deny list/);
  assert.equal(kernel.execs.length, 0);
  rmSync(s.file);
  const missing = await run(template(s, {script: 'trusted-worker.js'}), s.env, {cwd: s.cwd});
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /settings/);
  assert.equal(missing.execs.length, 0);
});

test('sandbox: an exec that fails exits 1 with a sentence', async t => {
  const s = session(t);
  const failed = await run(template(s), s.env, {cwd: s.cwd, execve: () => { throw Object.assign(new Error('ENOENT, No such file or directory'), {code: 'ENOENT'}); }});
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /could not run \/usr\/bin\/sandbox-exec \(ENOENT\)/);
  let stderr = '';
  const io = {stdin: new PassThrough(), stdout: {write() {}}, stderr: {write: text => { stderr += text; }}, cwd: () => s.cwd, chdir() {}, execve() { assert.fail('not exec\'d'); }, canExecute: () => false};
  assert.equal(await main(template(s), s.env, io), 1);
  assert.match(stderr, /sandbox-exec/);
});

test('app-server --listen stdio:// answers the recorded methods and exits 0 on EOF; it reads no session file', async t => {
  const s = session(t);
  rmSync(s.file);
  const request = `${JSON.stringify({id: 'A', method: 'initialize', params: {}})}\n`;
  const result = await run(['app-server', '--listen', 'stdio://'], {CODEX_HOME: s.codexHome}, {stdin: request});
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).result.codexHome, s.codexHome);
  const bare = await run(['app-server'], {CODEX_HOME: s.codexHome});
  assert.equal(bare.code, 1);
  const noHome = await run(['app-server', '--listen', 'stdio://'], {});
  assert.equal(noHome.code, 1);
  assert.match(noHome.stderr, /CODEX_HOME/);
});

test('anything else (login, exec, no subcommand) exits 1 with a sentence', async () => {
  for (const argv of [['login'], ['exec', 'x'], [], ['--version']]) {
    const result = await run(argv, {});
    assert.equal(result.code, 1, JSON.stringify(argv));
    assert.match(result.stderr, /^cua-codex-compat: /);
  }
});

test('writeCompatSettings writes both files 0600 in a 0700 directory, replacing an earlier launch\'s, and the compat reads them back', async t => {
  const {writeCompatSettings, removeCompatSettings, compatFiles} = await import('../../src/sandbox/compat-settings.mjs');
  const {readFileSync, statSync, existsSync} = await import('node:fs');
  const s = session(t);
  rmSync(join(s.home, 'state', 'compat'), {recursive: true});
  const files = writeCompatSettings({home: s.home, sessionId: 's1', denyRead: {...s.denyRead, tiers: ['/old']}, sessionTmp: s.sessionTmp, node: '/old/node'});
  const again = writeCompatSettings({home: s.home, sessionId: 's1', denyRead: s.denyRead, sessionTmp: s.sessionTmp, node: s.node});
  assert.deepEqual(again, files);
  assert.deepEqual(files, compatFiles({home: s.home, sessionId: 's1'}));
  assert.equal(statSync(files.dir).mode & 0o777, 0o700);
  for (const path of [files.json, files.node]) assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(readFileSync(files.node, 'utf8'), `${s.node}\n`);
  assert.deepEqual(readSettings(locateSettings(s.env), s.env), {denyRead: s.denyRead, sessionTmp: s.sessionTmp, home: s.home});
  removeCompatSettings({home: s.home, sessionId: 's1'});
  assert.equal(existsSync(files.json) || existsSync(files.node), false);
  removeCompatSettings({home: s.home, sessionId: 's1'});
});
