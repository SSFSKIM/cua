// bin/cua-codex-compat, the sh script CODEX_CLI_PATH names on the macOS vendor host (#115 M2): it finds the Node the
// compat runs on (CUA_COMPAT_NODE for app-server, the session's .node file for sandbox) and refuses unless that is an
// absolute path to an executable file. A double stands in for the Node: it prints what it was run with.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from '../fixtures/runtime-fixture.mjs';

const WRAPPER = join(REPO, 'bin', 'cua-codex-compat');
const MAIN = join(realpathSync(REPO), 'src', 'sandbox', 'codex-compat.mjs');

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-compat-sh-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const home = join(root, 'cua'), tmp = join(home, 'run', 's1', 'tmp'), codexHome = join(home, 'state', 'codex');
  mkdirSync(tmp, {recursive: true});
  mkdirSync(codexHome, {recursive: true});
  mkdirSync(join(home, 'state', 'compat'));
  const node = join(root, 'node');
  writeFileSync(node, '#!/bin/sh\nprintf \'ran %s\\n\' "$*"\n');
  chmodSync(node, 0o755);
  const nodeFile = join(home, 'state', 'compat', 's1.node');
  writeFileSync(nodeFile, `${node}\n`);
  return {root, home, tmp, codexHome, node, nodeFile, env: {PATH: '/usr/bin:/bin', TMPDIR: tmp, CODEX_HOME: codexHome}};
}
const run = (args, env) => spawnSync(WRAPPER, args, {encoding: 'utf8', env});

test('sandbox runs codex-compat.mjs on the session\'s Node, with every argument', t => {
  const s = scratch(t);
  const result = run(['sandbox', '-c', 'a b', '--', '/n'], s.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `ran --disable-warning=ExperimentalWarning ${MAIN} sandbox -c a b -- /n\n`);
});

test('app-server runs on CUA_COMPAT_NODE and needs no session file', t => {
  const s = scratch(t);
  rmSync(s.nodeFile);
  const result = run(['app-server', '--listen', 'stdio://'], {PATH: '/usr/bin:/bin', CUA_COMPAT_NODE: s.node});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `ran --disable-warning=ExperimentalWarning ${MAIN} app-server --listen stdio://\n`);
});

test('the Node refusals: unset, relative, missing, not executable, a directory', t => {
  const s = scratch(t);
  writeFileSync(join(s.root, 'plain'), '');
  for (const [label, node, pattern] of [['unset', undefined, /CUA_COMPAT_NODE names no absolute Node path \(empty\)/], ['relative', 'bin/node', /no absolute Node path \(bin\/node\)/],
    ['missing', join(s.root, 'absent'), /not an executable file/], ['not executable', join(s.root, 'plain'), /not an executable file/], ['a directory', s.root, /not an executable file/]]) {
    const result = run(['app-server', '--listen', 'stdio://'], {PATH: '/usr/bin:/bin', ...(node === undefined ? {} : {CUA_COMPAT_NODE: node})});
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, pattern, label);
    assert.equal(result.stdout, '', label);
  }
  for (const [label, content, pattern] of [['empty', '', /name no Node/], ['relative', 'node\n', /no absolute Node path \(node\)/], ['not executable', `${join(s.root, 'plain')}\n`, /not an executable file/]]) {
    writeFileSync(s.nodeFile, content);
    const result = run(['sandbox'], s.env);
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, pattern, label);
  }
});

test('sandbox refuses when TMPDIR and CODEX_HOME do not locate the session\'s .node file', t => {
  const s = scratch(t);
  const cases = [
    ['TMPDIR unset', {...s.env, TMPDIR: undefined}, /TMPDIR \(unset\)/],
    ['TMPDIR the caller\'s', {...s.env, TMPDIR: '/var/folders/x/T/'}, /not the session temp/],
    ['TMPDIR outside run/<id>/tmp', {...s.env, TMPDIR: join(s.home, 'run', 's1', 'x', 'tmp')}, /not the session temp/],
    ['CODEX_HOME of another home', {...s.env, CODEX_HOME: join(s.root, 'other', 'state', 'codex')}, /do not name the same cua home/],
    ['CODEX_HOME unset', {...s.env, CODEX_HOME: undefined}, /CODEX_HOME \(unset\)/],
    ['another session', {...s.env, TMPDIR: join(s.home, 'run', 's2', 'tmp')}, /s2\.node do not exist/],
  ];
  for (const [label, env, pattern] of cases) {
    const result = run(['sandbox'], Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)));
    assert.equal(result.status, 1, label);
    assert.match(result.stderr, pattern, label);
    assert.equal(result.stdout, '', label);
  }
  rmSync(s.nodeFile);
  symlinkSync(s.node, s.nodeFile);
  const linked = run(['sandbox'], s.env);
  assert.equal(linked.status, 1, 'a symlinked .node file is not cua\'s');
});

test('any other subcommand exits 1 with a sentence, running nothing', t => {
  const s = scratch(t);
  for (const args of [[], ['login'], ['exec', 'x']]) {
    const result = run(args, {...s.env, CUA_COMPAT_NODE: s.node});
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /^cua-codex-compat: .*runs only `sandbox`/);
    assert.equal(result.stdout, '');
  }
});
