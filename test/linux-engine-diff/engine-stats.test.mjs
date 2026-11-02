import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { Engine } from '../../scripts/linux-engine-diff/engine.mjs';

// A stand-in engine speaking the wire: it answers every request ok and writes, for request 1, a `--stats` line that
// does not parse, and for every later request a well-formed one.
const FAKE = `#!${process.execPath}
const { createInterface } = require('node:readline');
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  process.stdout.write(JSON.stringify({ id, ok: true, output: null }) + '\\n');
  process.stderr.write(id === 1 ? '{"stats": {"id": 1, "tree": \\n' : JSON.stringify({ stats: { id, tree: { source: 'at_spi' } } }) + '\\n');
});
`;

test("an unparseable --stats line leaves its request without stats, and the engine's later lines still count", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-engine-stats-'));
  const bin = join(dir, 'fake-engine.cjs');
  writeFileSync(bin, FAKE);
  chmodSync(bin, 0o700);
  const engine = new Engine({ label: 'cua', bin, stats: true }).start();
  try {
    const first = await engine.request('get_window_state', {});
    assert.equal(first.response.ok, true);
    assert.equal(first.stats, null, 'no stats for a line that does not parse');
    const second = await engine.request('get_window_state', {});
    assert.deepEqual(second.stats, { id: 2, tree: { source: 'at_spi' } });
    assert.match(engine.stderrTail, /unparsable --stats line/);
  } finally {
    await engine.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
