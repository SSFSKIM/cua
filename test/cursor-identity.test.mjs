// The agent cursor's identity and switch, resolved on the trusted side (src/runtime/cursor-identity.mjs; #235's spec,
// "Lifecycle and identity", "Settings", "Remote devices"): each field's sources in order, the label's cleaning, the hash
// colour, a remote client's context checked field by field, and the sminos name through the plugin's `who --session`.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CURSOR_PALETTE, aliasOf, cursorContext, cursorEnv, cursorLabel, hashColor, locateSminos, remoteCursor, resolveCursorContext, sminosName}
  from '../src/runtime/cursor-identity.mjs';

const SESSION = 'b93055dd-d0e2-41ed-817f-ba9da4ffd2b6';
const scratch = () => mkdtempSync(join(tmpdir(), 'cua-cursor-identity-'));

test('the palette is the engine\'s eight hues in its order', () => {
  const swift = readFileSync(fileURLToPath(new URL('../native/engine/Sources/Engine/Cursor/CursorPalette.swift', import.meta.url)), 'utf8');
  const line = /let cursorPalette: \[RGB\] = \[([^\]]+)\]/.exec(swift)?.[1];
  assert.deepEqual(CURSOR_PALETTE, [...line.matchAll(/"(#[0-9a-f]{6})"/g)].map(m => m[1]));
});

test('a label is trimmed, stripped of control characters and cut at 24 characters with an ellipsis; empty is none', () => {
  assert.equal(cursorLabel('  Research \n'), 'Research');
  assert.equal(cursorLabel('Re\u0007se\u001barch'), 'Research');
  assert.equal(cursorLabel('a'.repeat(24)), 'a'.repeat(24));
  assert.equal(cursorLabel('a'.repeat(30)), `${'a'.repeat(23)}…`);
  assert.equal(cursorLabel(`${'a'.repeat(22)} bcdef`), `${'a'.repeat(22)}…`, 'no space before the ellipsis');
  assert.equal(cursorLabel('👩‍💻'.repeat(30)), `${'👩‍💻'.repeat(23)}…`, 'cut by characters as the pill counts them, never inside one');
  for (const empty of ['', '  ', '\u0007\t', undefined, null, 7]) assert.equal(cursorLabel(empty), null, String(empty));
});

test('the hash colour is a stable pick of the eight hues', () => {
  assert.equal(hashColor(SESSION), hashColor(SESSION));
  assert.ok(CURSOR_PALETTE.includes(hashColor(SESSION)));
  const picks = new Set(Array.from({length: 64}, (_, i) => hashColor(`session-${i}`)));
  assert.ok(picks.size >= 6, `64 seeds spread over the hues (${picks.size})`);
});

test('the label: MAWS\'s, else the sminos name, else the project folder\'s name; the colour: MAWS\'s, else the session id\'s hash', () => {
  const base = {CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_PROJECT_DIR: '/Users/x/Developer/cua-235'};
  assert.deepEqual(cursorContext({env: {...base, CUA_CURSOR_LABEL: 'Research', CUA_CURSOR_COLOR: '#2F6FEB'}, sminosName: 'cursor235'}),
    {label: 'Research', color: '#2f6feb', enabled: true});
  assert.deepEqual(cursorContext({env: base, sminosName: 'cursor235'}), {label: 'cursor235', color: hashColor(SESSION), enabled: true});
  assert.deepEqual(cursorContext({env: base}), {label: 'cua-235', color: hashColor(SESSION), enabled: true});
  assert.equal(cursorContext({env: {CLAUDE_CODE_SESSION_ID: SESSION}, cwd: '/w/linux171'}).label, 'linux171', 'no project directory: the working directory');
  assert.equal(cursorContext({env: {...base, CUA_CURSOR_LABEL: ' \u0007 '}, sminosName: '  '}).label, 'cua-235', 'an empty label falls through');
  assert.equal(cursorContext({env: {}, cwd: '/w/linux171'}).color, hashColor('linux171'), 'no session id: the label\'s hash');
  assert.deepEqual(cursorContext({env: {}, cwd: '/'}), {label: null, color: hashColor(''), enabled: true}, 'no source at all: the engine keeps its placeholder');
});

test('a colour that is not #rrggbb is ignored with a log line; CUA_CURSOR=0 turns the session off, an unknown value is logged', () => {
  const lines = [];
  const out = cursorContext({env: {CLAUDE_CODE_SESSION_ID: SESSION, CUA_CURSOR_COLOR: 'blue', CUA_CURSOR: 'off'}, cwd: '/w/a', log: line => lines.push(line)});
  assert.equal(out.color, hashColor(SESSION));
  assert.equal(out.enabled, true);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /CUA_CURSOR_COLOR is not #rrggbb/);
  assert.match(lines[1], /CUA_CURSOR is neither 0 nor 1/);
  assert.equal(cursorContext({env: {CUA_CURSOR: '0'}, cwd: '/w/a'}).enabled, false);
  assert.equal(cursorContext({env: {CUA_CURSOR: '1'}, cwd: '/w/a'}).enabled, true);
});

test('the worker\'s environment carries the three variables', () => {
  assert.deepEqual(cursorEnv({label: 'Research', color: '#2f6feb', enabled: true}), {CUA_CURSOR_LABEL: 'Research', CUA_CURSOR_COLOR: '#2f6feb'});
  assert.deepEqual(cursorEnv({label: null, color: '#2f6feb', enabled: false}), {CUA_CURSOR_COLOR: '#2f6feb', CUA_CURSOR: '0'});
});

test('a remote client\'s cua/cursor is checked field by field, and its fields come first', () => {
  assert.deepEqual(remoteCursor(undefined), {cursor: null, refused: []});
  assert.deepEqual(remoteCursor({label: 'Research', color: '#2f6feb', enabled: true}), {cursor: {label: 'Research', color: '#2f6feb', enabled: true}, refused: []});
  assert.deepEqual(remoteCursor({label: `R\u0007${'x'.repeat(40)}`, color: 'blue', enabled: 'no'}),
    {cursor: {label: `R${'x'.repeat(22)}…`}, refused: ['color', 'enabled']});
  assert.deepEqual(remoteCursor({label: 7, color: null}), {cursor: {}, refused: ['label', 'color']});
  assert.deepEqual(remoteCursor({label: '  '}), {cursor: {}, refused: []}, 'an empty label is none, not a refusal');
  for (const bad of [null, 'Research', ['x']]) assert.deepEqual(remoteCursor(bad), {cursor: null, refused: ['cua/cursor']});
  const device = {CUA_CURSOR_LABEL: 'device', CUA_CURSOR: '0'};
  assert.deepEqual(cursorContext({env: device, given: {label: 'Research', enabled: true}}), {label: 'Research', color: hashColor('Research'), enabled: true});
  assert.deepEqual(cursorContext({env: device, given: {color: '#2f6feb'}}), {label: 'device', color: '#2f6feb', enabled: false}, 'a refused or absent field is the device\'s own');
});

test('the address line\'s alias: the alias before #short, none for the short alone or anything else', () => {
  assert.equal(aliasOf('Sminos-Session: cursor235#b93055dd (cua on macbook)\n'), 'cursor235');
  assert.equal(aliasOf('Sminos-Session: two words#b93055dd (cua on macbook)'), 'two words');
  assert.equal(aliasOf('Sminos-Session: b93055dd (cua on macbook)'), null);
  assert.equal(aliasOf(''), null);
  assert.equal(aliasOf('usage: sminos who <commit|PR>'), null);
});

// A plugins record naming a fake sminos CLI that prints what `script` says (or sleeps), under a scratch config dir.
function fakeSminos(script) {
  const config = scratch(), install = join(config, 'plugins', 'cache', 'doperpowers', 'sminos', '1.27.17');
  const scripts = join(install, 'skills', 'sminos', 'scripts');
  mkdirSync(scripts, {recursive: true});
  const cli = join(scripts, 'sminos');
  writeFileSync(cli, `#!/bin/sh\n${script}\n`);
  chmodSync(cli, 0o755);
  writeFileSync(join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({version: 2, plugins: {
    'other@x': [{scope: 'user', installPath: '/nowhere'}],
    'sminos@doperpowers': [{scope: 'user', installPath: join(config, 'missing')}, {scope: 'user', installPath: install}]}}));
  return {config, cli};
}

test('the sminos CLI is the installed plugin\'s, by Claude Code\'s plugins record', () => {
  const {config, cli} = fakeSminos('exit 0');
  assert.equal(locateSminos({env: {CLAUDE_CONFIG_DIR: config}}), cli);
  assert.equal(locateSminos({env: {CLAUDE_CONFIG_DIR: scratch()}}), null, 'no record: no CLI');
  const home = scratch();
  mkdirSync(join(home, '.claude'));
  assert.equal(locateSminos({env: {HOME: home}}), null);
});

test('the sminos name: `who --session <id>` from the session\'s directory, kept per session; a failure falls through and is asked again', async () => {
  const project = scratch();
  const {config} = fakeSminos('printf "%s\\n" "$*" > "$PWD/asked"; echo "Sminos-Session: cursor235#b93055dd (cua on macbook)"');
  const env = {CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_PROJECT_DIR: project, PATH: '/usr/bin:/bin'};
  assert.equal(await sminosName({env}), 'cursor235');
  assert.equal(readFileSync(join(project, 'asked'), 'utf8').trim(), `who --session ${SESSION}`);
  let asked = 0;
  assert.equal(await sminosName({env, run: async () => { asked++; return ''; }}), 'cursor235', 'kept for the session');
  assert.equal(asked, 0);
  const other = {...env, CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000001'};
  assert.equal(await sminosName({env: other, run: async () => { throw new Error('exit 2'); }}), null);
  assert.equal(await sminosName({env: other, run: async () => 'Sminos-Session: again#00000000 (cua on macbook)'}), 'again', 'a failure is not kept');
  assert.equal(await sminosName({env: {...env, CLAUDE_CODE_SESSION_ID: undefined}, run: () => assert.fail('no session id: no lookup')}), null);
  assert.equal(await sminosName({env: {...env, CLAUDE_CODE_SESSION_ID: 'not-a-session'}, run: () => assert.fail('not a session id')}), null);
  assert.equal(await sminosName({env: {...env, CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000002', SMNS_INTERNAL: '1'},
    run: () => assert.fail('an internal fork is no member')}), null);
});

test('the sminos lookup is bounded: a CLI that hangs is killed and the name falls through', async () => {
  const {config} = fakeSminos('sleep 5');
  const env = {CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000003', CLAUDE_PROJECT_DIR: scratch(), PATH: '/usr/bin:/bin'};
  const started = Date.now();
  assert.equal(await sminosName({env, timeoutMs: 150}), null);
  assert.ok(Date.now() - started < 1500, `settled at the bound (${Date.now() - started} ms)`);
  const out = await resolveCursorContext({env, lookup: async () => null});
  assert.equal(out.label, cursorLabel(env.CLAUDE_PROJECT_DIR.split('/').at(-1)), 'the folder\'s name instead');
});

test('the whole context: no lookup when MAWS or the remote client named the session', async () => {
  const lookup = () => assert.fail('not asked');
  assert.equal((await resolveCursorContext({env: {CUA_CURSOR_LABEL: 'Research'}, lookup})).label, 'Research');
  assert.equal((await resolveCursorContext({env: {}, given: {label: 'Remote'}, lookup})).label, 'Remote');
  assert.equal((await resolveCursorContext({env: {CLAUDE_CODE_SESSION_ID: SESSION}, cwd: '/w/x', lookup: async () => 'cursor235'})).label, 'cursor235');
});

// Review fix 1: one failure-normalized lookup per session, shared by every concurrent caller, dropped once it failed.
test('concurrent lookups of one session share one answer; a shared failure settles every caller to none and is asked again', async () => {
  const env = {CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000010', CLAUDE_PROJECT_DIR: '/w/fallback'};
  let asked = 0;
  const failing = async () => { asked++; await new Promise(resolve => setTimeout(resolve, 20)); throw new Error('exit 2'); };
  const both = await Promise.all([sminosName({env, locate: () => '/x/sminos', run: failing}), sminosName({env, locate: () => '/x/sminos', run: failing})]);
  assert.deepEqual(both, [null, null]);
  assert.equal(asked, 1, 'one lookup for both');
  const contexts = await Promise.all([resolveCursorContext({env}), resolveCursorContext({env})].map(p => p.then(c => c.label, e => `rejected: ${e.message}`)));
  assert.deepEqual(contexts, ['fallback', 'fallback']);
  assert.equal(await sminosName({env, locate: () => '/x/sminos', run: async () => 'Sminos-Session: back#00000000 (cua on macbook)'}), 'back', 'the failure was not kept');
});

test('concurrent lookups that time out settle every caller to none at the bound, and the timeout is not kept', async () => {
  const env = {CLAUDE_CODE_SESSION_ID: '00000000-0000-4000-8000-000000000011', CLAUDE_PROJECT_DIR: '/w/fallback'};
  const hang = () => new Promise(() => {});
  const started = Date.now();
  const both = await Promise.all([sminosName({env, locate: () => '/x/sminos', run: hang, timeoutMs: 80}), sminosName({env, locate: () => '/x/sminos', run: hang, timeoutMs: 80})]);
  assert.deepEqual(both, [null, null]);
  assert.ok(Date.now() - started < 1000, `settled at the bound (${Date.now() - started} ms)`);
  assert.equal(await sminosName({env, locate: () => '/x/sminos', run: async () => 'Sminos-Session: late#00000000 (cua on macbook)'}), 'late');
});
