// The same tracked-text policy as item 10, without installation, packaging or a full-suite invocation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {personalText} from '../scripts/accept/lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

test('tracked code and fixtures contain no account-home paths or token-like strings beyond the existing mini layout', () => {
  // Check the capture account too, even when this runs on a differently named hosted runner.
  const capture = JSON.parse(readFileSync(join(root, 'docs/evidence/2026-10-17-own-sandbox/m0/argv-capture/capture-signed-scoped.json')));
  const recordedHome = capture.input.env.HOME.split('/').slice(0, 3).join('/');
  const homes = [...new Set([homedir(), recordedHome])];
  const paths = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const bad = paths.filter(path => !path.startsWith('docs/') && !path.endsWith('.md') && existsSync(join(root, path))).flatMap(path => {
    const text = readFileSync(join(root, path), 'latin1');
    return homes.some(home => { const result = personalText(path, text, home); return result.home || result.token; }) ? [path] : [];
  });
  assert.deepEqual(bad, []);
});
