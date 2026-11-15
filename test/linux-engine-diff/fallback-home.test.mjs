// The fallback homes of #171 M5 (scripts/linux-engine-gate/fallback-home.mjs): each shaped from a home that holds this
// cua's install, and each one the default selection then keeps on the vendor's engine for its own reason. The engine
// assets are stand-ins served by a stubbed fetch, in scratch homes: nothing is downloaded.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FALLBACK_KINDS, OLDER_PIN, shapeFallbackHome, shapeProblem } from '../../scripts/linux-engine-gate/fallback-home.mjs';
import { installLinuxEngine } from '../../src/runtime/install.mjs';
import { nativeEngineFor } from '../../src/runtime/launch.mjs';
import { isOlder, MIN_ENGINE_VERSION } from '../../src/services/engine/linux/client.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const url = (version, arch) => `https://github.com/SSFSKIM/cua/releases/download/linux-engine-v${version}/cua-engine-${version}-linux-${arch}`;
const engine = (version) => Buffer.from(`#!/bin/sh\necho "cua-engine ${version} (0123456789ab)"\n`);
const pinFor = (version) => ({ version, release: `linux-engine-v${version}`, assets: { x64: { url: url(version, 'x64'), sha256: sha(engine(version)) }, arm64: { url: url(version, 'arm64'), sha256: sha(engine(version)) } } });
const CURRENT = pinFor(MIN_ENGINE_VERSION);
const OLDER = pinFor('0.3.0');
const HOST = { platform: 'linux', arch: 'x64' };
const serving = async (href) => {
  const bytes = engine(/linux-engine-v([\d.]+)\//.exec(href)[1]);
  return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};

test("the older pin is linux-engine-v0.3.0's, older than this cua needs, as the checked-in pin held it at M3's release", () => {
  assert.equal(OLDER_PIN.version, '0.3.0');
  assert.ok(isOlder(OLDER_PIN.version, MIN_ENGINE_VERSION));
  let recorded;
  try { recorded = execFileSync('git', ['-C', REPO, 'show', '9d3fdce6:runtime/engine/linux-engine.json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { recorded = null; }
  if (recorded) assert.deepEqual(OLDER_PIN, JSON.parse(recorded));
});

test('each fallback home, shaped from a current install, keeps the default on the vendor\'s engine for its own reason', async (t) => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'cua-fallback-home-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const reasons = { none: 'engine_not_installed', older: 'engine_outdated', unrecorded: 'engine_unrecorded' };
  assert.deepEqual(FALLBACK_KINDS, Object.keys(reasons));
  for (const kind of FALLBACK_KINDS) {
    const home = join(dir, kind);
    mkdirSync(home);
    await installLinuxEngine({ home, pin: CURRENT, fetch: serving, host: HOST });
    const byDefault = () => nativeEngineFor({ env: { HOME: join(dir, 'user') }, platform: 'linux', home, defaultEngine: 'cua', config: () => ({}) });
    assert.equal(byDefault().engine, 'cua', `${kind}: the current install is selected before it is shaped`);
    const shaped = await shapeFallbackHome({ home, kind, olderPin: OLDER, fetch: serving, host: HOST, pin: CURRENT });
    assert.equal(shapeProblem(shaped), null, `${kind}: ${JSON.stringify(shaped)}`);
    assert.deepEqual(byDefault(), { engine: 'vendor', reason: reasons[kind], status: 'warn' }, kind);
  }
  const unrecorded = await shapeFallbackHome({ home: join(dir, 'unrecorded'), kind: 'unrecorded', olderPin: OLDER, fetch: serving, host: HOST, pin: CURRENT });
  assert.deepEqual([unrecorded.engine.sha256, unrecorded.record], [sha(engine('0.3.0')), { version: MIN_ENGINE_VERSION, sha256: sha(engine(MIN_ENGINE_VERSION)) }], "0.3.0's file beside the current record");
  // a shape that did not take is named
  assert.match(shapeProblem({ kind: 'none', engine: { sha256: 'a' }, record: null, verifiedVersion: null }), /still placed/);
  assert.match(shapeProblem({ kind: 'older', engine: { version: MIN_ENGINE_VERSION }, record: null, verifiedVersion: MIN_ENGINE_VERSION }), /reads as/);
  assert.match(shapeProblem({ kind: 'unrecorded', engine: { sha256: 'a' }, record: { version: MIN_ENGINE_VERSION, sha256: 'a' }, verifiedVersion: MIN_ENGINE_VERSION }), /not a newer one/);
  await assert.rejects(shapeFallbackHome({ home: join(dir, 'none'), kind: 'other' }), /none, older, unrecorded, not other/);
});
