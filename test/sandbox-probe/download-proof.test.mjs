import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadPins, RECORD_FILE} from '../../src/runtime/manifest.mjs';
import {downloadProof} from '../../scripts/sandbox-probe/download-proof.mjs';

const pin = loadPins().find(p => p.platform === 'darwin');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hosted-download-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const record = {schema: 1, release: pin.release, source: 'download', archive: {sha256: pin.archive.sha256, length: pin.archive.length}, private: 'PRIVATE-MARKER'};
  const put = value => writeFileSync(join(root, RECORD_FILE), JSON.stringify(value));
  put(record);
  const result = {ok: true, release: pin.release, source: 'download', changed: true, root, private: 'PRIVATE-MARKER'};
  return {root, record, result, put};
}

test('hosted download proof publishes only verified pin metadata, never raw install paths or fields', t => {
  const f = fixture(t);
  assert.deepEqual(downloadProof(f.result), {outcome: 'PASS', source: 'download', release: pin.release,
    urlHost: 'persistent.oaistatic.com', sha256: pin.archive.sha256, hashVerified: true, archiveSize: pin.archive.length});
  const report = join(f.root, 'result.json'); writeFileSync(report, JSON.stringify(f.result));
  const script = fileURLToPath(new URL('../../scripts/sandbox-probe/download-proof.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script, report], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /^hosted-gate: download proof \{"outcome":"PASS"/);
  assert.doesNotMatch(run.stderr, /PRIVATE-MARKER|hosted-download-/);
});

test('failed, reused, local-archive or mismatched installs cannot publish download evidence', t => {
  const f = fixture(t);
  for (const patch of [{ok: false}, {changed: false}, {source: 'archive'}, {release: 'unknown'}])
    assert.throws(() => downloadProof({...f.result, ...patch}));
  for (const record of [{...f.record, source: 'archive'}, {...f.record, archive: {...f.record.archive, sha256: 'b'.repeat(64)}}, {...f.record, archive: {...f.record.archive, length: 1}}]) {
    f.put(record); assert.throws(() => downloadProof(f.result));
  }
});
