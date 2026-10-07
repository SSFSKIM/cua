// relay/deploy/update.sh --ext <dist dir>: the self-hosted cua extension onto the relay's Caddy /ext/ route (spec
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "Distribution", H4). ssh and scp are stand-ins on
// PATH that record what they were asked to do; the live run is in the H4 evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {updateManifestXml} from '../scripts/extension-pack.mjs';

const UPDATE = fileURLToPath(new URL('../relay/deploy/update.sh', import.meta.url));
const CADDYFILE = fileURLToPath(new URL('../relay/deploy/Caddyfile', import.meta.url));

// A scratch PATH whose ssh prints the live site address when asked for it and logs every call; scp copies the local
// file into <dir>/remote/ under its remote base name, so a test can read what was sent.
function harness(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-relay-ext-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'remote'));
  const log = join(dir, 'calls.log');
  writeFileSync(join(bin, 'ssh'), `#!/usr/bin/env bash
printf 'ssh %s\\n' "\${@: -1}" >>'${log}'
case "\${@: -1}" in *awk*Caddyfile*) echo 'relay.example' ;; esac
exit 0
`);
  writeFileSync(join(bin, 'scp'), `#!/usr/bin/env bash
printf 'scp %s -> %s\\n' "\${@: -2:1}" "\${@: -1}" >>'${log}'
cp "\${@: -2:1}" '${dir}/remote/'"$(basename "\${@: -1}")"
`);
  for (const name of ['ssh', 'scp']) chmodSync(join(bin, name), 0o755);
  const run = (...args) => spawnSync('bash', [UPDATE, '--host', '203.0.113.7', ...args], {encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
  const calls = () => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
  const dist = (files = {}) => {
    const out = join(dir, `dist-${Math.random().toString(16).slice(2)}`);
    mkdirSync(out);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
    return out;
  };
  return {dir, run, calls, dist};
}
const XML = updateManifestXml({id: 'jkejaaijdfpohkdhankllbekkhmnippb', version: '0.1.0', crxUrl: 'https://relay.example/ext/cua-extension-0.1.0.crx'});

test('update.sh --ext refuses a directory without update.xml or without the CRX it names, before any ssh', t => {
  const h = harness(t);
  for (const files of [{}, {'update.xml': XML}, {'update.xml': XML.replace('cua-extension-0.1.0.crx', "x'y.crx"), "x'y.crx": 'crx'}, {'update.xml': '<gupdate/>'}]) {
    const result = h.run('--ext', h.dist(files));
    assert.equal(result.status, 2, `${JSON.stringify(Object.keys(files))}: ${result.stderr}`);
  }
  assert.equal(h.run('--ext', join(h.dir, 'missing')).status, 2);
  assert.equal(h.calls(), '');
});

test('update.sh --ext copies the CRX before update.xml, installs the Caddyfile with the live site address, reloads Caddy and leaves the relay running', t => {
  const h = harness(t);
  const dir = h.dist({'update.xml': XML, 'cua-extension-0.1.0.crx': 'crx bytes'});
  const result = h.run('--ext', dir);
  assert.equal(result.status, 0, result.stderr);
  const calls = h.calls();
  const crxAt = calls.indexOf('cua-extension-0.1.0.crx ->'), xmlAt = calls.indexOf('update.xml ->');
  assert.ok(crxAt >= 0 && xmlAt > crxAt, calls);
  assert.equal(readFileSync(join(h.dir, 'remote', 'Caddyfile.new'), 'utf8'), readFileSync(CADDYFILE, 'utf8').replaceAll('@HOST@', 'relay.example'));
  assert.match(calls, /caddy validate/);
  assert.match(calls, /systemctl reload caddy/);
  assert.match(calls, /install -m 0644 .*update\.xml/);
  assert.doesNotMatch(calls, /restart cua-relay|git fetch/);
});

test('update.sh --ext with --ref also moves and restarts the relay; with neither it still runs main', t => {
  const h = harness(t);
  const both = h.run('--ext', h.dist({'update.xml': XML, 'cua-extension-0.1.0.crx': 'crx'}), '--ref', 'feat/x');
  assert.equal(both.status, 0, both.stderr);
  assert.match(h.calls(), /git fetch -q origin 'feat\/x'/);
  assert.match(h.calls(), /systemctl restart cua-relay/);

  const plain = harness(t);
  assert.equal(plain.run().status, 0);
  assert.match(plain.calls(), /git fetch -q origin 'main'.*\n(.*\n)*.*systemctl restart cua-relay/);
});
