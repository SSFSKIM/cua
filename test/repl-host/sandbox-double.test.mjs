// The launcher double (supervisor-harness.mjs sandboxDouble) with a temp path that holds shell syntax: its paths are
// quoted, never run, and its launches are recorded where asked.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {launches, sandboxDouble} from './supervisor-harness.mjs';

test('a launcher double under a path holding $(...) and quotes runs nothing of it', t => {
  const root = mkdtempSync(join(tmpdir(), 'cua-double-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const dir = join(root, 'a$(touch pwned)b\'"c');
  mkdirSync(dir);
  for (const options of [{}, {exec: true}, {refuse: true}]) {
    const records = join(dir, `records-${Object.keys(options)[0] ?? 'plain'}`);
    const double = sandboxDouble(dir, {...options, records});
    const run = spawnSync(double, ['--flag', '--', '/bin/echo', 'ran'], {cwd: root, encoding: 'utf8'});
    assert.equal(existsSync(join(root, 'pwned')), false, `${JSON.stringify(options)}: the path's $(...) never ran`);
    assert.equal(launches(records).length, 1, `${JSON.stringify(options)}: ${run.stderr}`);
    if (!options.refuse) assert.equal(run.stdout, 'ran\n');
  }
});
