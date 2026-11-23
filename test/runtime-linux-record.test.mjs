// The Linux runtime record (#171 M6a T2; the pre-flight's §2): runtime/linux-runtime.json names cua's own four parts by
// their pins (the module lock's SHA-256, the managed Node's version, the sandbox helper's upstream tag, the engine's
// version) instead of a vendor archive. It parses strictly, it must repeat each pin exactly, and its release name is
// derived from it, so a change to any part is a new release. Pins are read from a scratch copy of the checked-in ones
// where a test moves one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LINUX_RUNTIME_FILE, parseLinuxRuntime, loadLinuxRuntime, linuxRelease, ownInstaller} from '../src/runtime/manifest.mjs';
import {loadEnginePin} from '../src/runtime/linux-engine.mjs';
import {loadHelperPin} from '../src/sandbox/linux.mjs';
import {loadNodePins, selectNodePin} from '../src/runtime/managed-node.mjs';
import {REPO} from './fixtures/runtime-fixture.mjs';

const LINUX_X64 = {platform: 'linux', arch: 'x64'};
const LINUX_ARM64 = {platform: 'linux', arch: 'arm64'};
const expectCode = (code, pattern) => error => { assert.equal(error.code, code, `${error.code}: ${error.message}`); if (pattern) assert.match(error.message, pattern); return true; };
const checkedIn = () => JSON.parse(readFileSync(LINUX_RUNTIME_FILE, 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// A scratch copy of the record and the four pins it is bound to, as loadLinuxRuntime's options.
function pins(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-linux-record-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const copy = rel => { cpSync(join(REPO, rel), join(dir, rel), {recursive: true}); return join(dir, rel); };
  return {
    dir,
    file: copy('runtime/linux-runtime.json'),
    modulesDir: copy('runtime/modules'),
    nodePinsDir: copy('runtime/releases/node'),
    helperPinFile: copy('runtime/sandbox/linux-sandbox.json'),
    enginePinFile: copy('runtime/engine/linux-engine.json'),
  };
}
const edit = (file, change) => writeFileSync(file, change(readFileSync(file, 'utf8')));
const options = p => ({file: p.file, modulesDir: p.modulesDir, nodePinsDir: p.nodePinsDir, helperPinFile: p.helperPinFile, enginePinFile: p.enginePinFile});

// ---- the checked-in record ----

test('the checked-in record repeats the checked-in pins: the lock\'s SHA-256, the Node, the helper\'s tag and the engine', () => {
  const record = checkedIn();
  assert.deepEqual(Object.keys(record), ['schema', 'platform', 'modules', 'node', 'sandbox', 'engine']);
  assert.equal(record.modules.lock, sha256(readFileSync(join(REPO, 'runtime/modules/package-lock.json'))));
  assert.equal(record.sandbox.upstreamTag, loadHelperPin().upstreamTag);
  assert.equal(record.engine.version, loadEnginePin().version);
  for (const host of [LINUX_X64, LINUX_ARM64]) {
    assert.equal(record.node.version, selectNodePin(loadNodePins(), host).version);
    assert.deepEqual(loadLinuxRuntime({host}), record);
  }
});

test('the checked-in record is written as the pin script writes it: two-space JSON and a final newline', () => {
  assert.equal(readFileSync(LINUX_RUNTIME_FILE, 'utf8'), `${JSON.stringify(checkedIn(), null, 2)}\n`);
});

// ---- strict parsing ----

test('the record parses strictly: every unknown or missing field, at each level, is invalid_pin', () => {
  const base = checkedIn();
  const cases = {
    'unknown top-level field': r => { r.vendor = {}; },
    'missing top-level field': r => { delete r.sandbox; },
    'unknown field in modules': r => { r.modules.integrity = 'x'; },
    'missing field in modules': r => { delete r.modules.lock; },
    'unknown field in node': r => { r.node.path = '/usr/bin/node'; },
    'missing field in node': r => { delete r.node.version; },
    'unknown field in sandbox': r => { r.sandbox.sha256 = 'x'; },
    'missing field in engine': r => { delete r.engine.version; },
    'unknown field in engine': r => { r.engine.release = 'linux-engine-v0.4.3'; },
    'a part that is not an object': r => { r.engine = '0.4.3'; },
    'a part that is an array': r => { r.node = ['24.22.0']; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const json = structuredClone(base);
    change(json);
    assert.throws(() => parseLinuxRuntime(json), expectCode('invalid_pin'), name);
  }
  for (const value of [null, [], 'record', 1]) assert.throws(() => parseLinuxRuntime(value), expectCode('invalid_pin'), JSON.stringify(value));
});

test('the record\'s values parse strictly: schema 1, platform linux, and each part in its pin\'s own form', () => {
  const base = checkedIn();
  const bad = {
    schema: [2, '1', 0],
    platform: ['darwin', 'Linux', ''],
    'modules.lock': ['B71DC1F8185D2B37370BC0BB86BDDD1768F959C98C836D96721571BA65A0B08C', 'b71dc1f8', `${'a'.repeat(63)}g`, 7],
    'node.version': ['22.11.0', '23.9.9', '24.22', 'v24.22.0', '24.22.0-rc1', 24],
    'sandbox.upstreamTag': ['v0.163.0', 'rust-v0.163', 'rust-v0.163.0-alpha', 'linux-sandbox-rust-v0.163.0'],
    'engine.version': ['0.4', 'v0.4.3', '0.04.3', '0.4.3-rc1', ''],
  };
  for (const [path, values] of Object.entries(bad)) {
    for (const value of values) {
      const json = structuredClone(base);
      const keys = path.split('.');
      keys.slice(0, -1).reduce((o, k) => o[k], json)[keys.at(-1)] = value;
      assert.throws(() => parseLinuxRuntime(json), expectCode('invalid_pin', new RegExp(keys.at(-1))), `${path} = ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(parseLinuxRuntime(base), base);
  const newerNode = structuredClone(base);
  newerNode.node.version = '26.0.0';
  assert.equal(parseLinuxRuntime(newerNode).node.version, '26.0.0');
});

test('a record that is not JSON, or not there, is invalid_pin naming the file', t => {
  const p = pins(t);
  writeFileSync(p.file, '{"schema": 1,');
  assert.throws(() => loadLinuxRuntime({host: LINUX_X64, ...options(p)}), expectCode('invalid_pin', new RegExp(p.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
  rmSync(p.file);
  assert.throws(() => loadLinuxRuntime({host: LINUX_X64, ...options(p)}), expectCode('invalid_pin', /linux-runtime\.json/));
});

// ---- bound to the four pins ----

test('the scratch copy of the record and its pins loads, for each architecture', t => {
  const p = pins(t);
  for (const host of [LINUX_X64, LINUX_ARM64]) assert.deepEqual(loadLinuxRuntime({host, ...options(p)}), checkedIn());
});

test('each pin moved alone, the record still at the old value: invalid_pin naming both files and both values', t => {
  const record = checkedIn();
  const moves = {
    'the module lock': {
      move: p => edit(join(p.modulesDir, 'package-lock.json'), text => `${text}\n`),
      pinFile: p => join(p.modulesDir, 'package-lock.json'),
      values: p => [record.modules.lock, sha256(readFileSync(join(p.modulesDir, 'package-lock.json')))],
    },
    'the Node pin': {
      move: p => {
        for (const arch of ['x64', 'arm64']) {
          const from = join(p.nodePinsDir, `24.22.0-linux-${arch}.json`);
          writeFileSync(join(p.nodePinsDir, `24.23.0-linux-${arch}.json`), readFileSync(from, 'utf8').replaceAll('24.22.0', '24.23.0'));
        }
      },
      pinFile: p => join(p.nodePinsDir, '24.23.0-linux-x64.json'),
      values: () => [record.node.version, '24.23.0'],
    },
    'the sandbox helper pin': {
      move: p => edit(p.helperPinFile, text => text.replaceAll('rust-v0.163.0', 'rust-v0.164.0')),
      pinFile: p => p.helperPinFile,
      values: () => [record.sandbox.upstreamTag, 'rust-v0.164.0'],
    },
    'the engine pin': {
      move: p => edit(p.enginePinFile, text => text.replaceAll(record.engine.version, '9.9.9')),
      pinFile: p => p.enginePinFile,
      values: () => [record.engine.version, '9.9.9'],
    },
  };
  const quote = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [name, {move, pinFile, values}] of Object.entries(moves)) {
    const p = pins(t);
    move(p);
    const [was, now] = values(p);
    assert.throws(() => loadLinuxRuntime({host: LINUX_X64, ...options(p)}), error => {
      assert.equal(error.code, 'invalid_pin', `${name}: ${error.code}`);
      for (const part of [p.file, pinFile(p), was, now]) assert.match(error.message, new RegExp(quote(part)), `${name}: names ${part}`);
      return true;
    }, name);
  }
});

test('the record moved alone, its pins unchanged: invalid_pin too', t => {
  const record = checkedIn();
  for (const [path, value] of [['modules.lock', 'a'.repeat(64)], ['node.version', '24.21.0'], ['sandbox.upstreamTag', 'rust-v0.162.0'], ['engine.version', '0.4.2']]) {
    const p = pins(t);
    const json = structuredClone(record);
    const [part, field] = path.split('.');
    json[part][field] = value;
    writeFileSync(p.file, `${JSON.stringify(json, null, 2)}\n`);
    assert.throws(() => loadLinuxRuntime({host: LINUX_X64, ...options(p)}), expectCode('invalid_pin', new RegExp(value)), path);
  }
});

test('no engine pin at all, or a host with no Node pin, is refused', t => {
  const p = pins(t);
  rmSync(p.enginePinFile);
  assert.throws(() => loadLinuxRuntime({host: LINUX_X64, ...options(p)}), expectCode('invalid_pin', /engine/));
  const q = pins(t);
  for (const name of readdirSync(q.nodePinsDir)) if (name.includes('linux-arm64')) rmSync(join(q.nodePinsDir, name));
  assert.throws(() => loadLinuxRuntime({host: LINUX_ARM64, ...options(q)}), expectCode('unsupported_platform', /linux-arm64/));
  assert.deepEqual(loadLinuxRuntime({host: LINUX_X64, ...options(q)}), checkedIn());
});

// ---- the derived release name ----

test('the release name is derived from the four parts and the architecture, as the pre-flight writes it', () => {
  const record = checkedIn();
  const lock12 = record.modules.lock.slice(0, 12);
  assert.equal(linuxRelease(record, 'x64'), `cua-linux-x64-e${record.engine.version}-n${record.node.version}-s0.163.0-m${lock12}`);
  assert.equal(linuxRelease(record, 'arm64'), `cua-linux-arm64-e${record.engine.version}-n${record.node.version}-s0.163.0-m${lock12}`);
  assert.equal(linuxRelease(structuredClone(record), 'x64'), linuxRelease(record, 'x64'), 'stable');
});

test('the release name changes with each field and with the architecture, and is one safe path segment no vendor name can be', () => {
  const record = checkedIn();
  const base = linuxRelease(record, 'x64');
  const names = new Set([base, linuxRelease(record, 'arm64')]);
  for (const [part, field, value] of [['modules', 'lock', `${'0'.repeat(11)}1${record.modules.lock.slice(12)}`], ['node', 'version', '24.23.0'], ['sandbox', 'upstreamTag', 'rust-v0.164.0'], ['engine', 'version', '0.4.4']]) {
    const moved = structuredClone(record);
    moved[part][field] = value;
    names.add(linuxRelease(moved, 'x64'));
  }
  assert.equal(names.size, 6, 'each field and the architecture make a different name');
  for (const name of names) {
    assert.match(name, /^[A-Za-z0-9.-]+$/, name);
    assert.doesNotMatch(name, /^\d/, 'a vendor release starts with digits');
    assert.ok(!name.includes('..') && name !== '.' && !name.includes('/'));
  }
  assert.throws(() => linuxRelease(record, 'x64/..'), expectCode('unsupported_platform'));
});

// ---- the installer every Linux remedy names ----

test('ownInstaller names this checkout\'s own bin/cua.mjs by its absolute path, and the release it installs', () => {
  const entry = join(REPO, 'bin', 'cua.mjs');
  const installer = ownInstaller({release: 'cua-linux-x64-e0.4.3-n24.22.0-s0.163.0-mb71dc1f8185d'});
  assert.equal(installer.command, `node ${entry} install`);
  assert.equal(installer.hint, `run \`node ${entry} install\`; a \`cua\` from another checkout installs that checkout's runtime, which may not be cua-linux-x64-e0.4.3-n24.22.0-s0.163.0-mb71dc1f8185d`);
  assert.match(ownInstaller().hint, new RegExp(`^run \`node ${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} install\`; a \`cua\` from another checkout installs that checkout's runtime`));
  assert.doesNotMatch(installer.hint, /(^|[^/])\bcua install\b/, 'never the bare `cua install`');
});

test('ownInstaller quotes a path a shell would split', () => {
  assert.equal(ownInstaller({entry: '/home/u/My Plugins/cua/bin/cua.mjs'}).command, 'node \'/home/u/My Plugins/cua/bin/cua.mjs\' install');
  assert.equal(ownInstaller({entry: '/home/u/it\'s/bin/cua.mjs'}).command, 'node \'/home/u/it\'\\\'\'s/bin/cua.mjs\' install');
  assert.equal(ownInstaller({entry: '/opt/cua-1.2_x/bin/cua.mjs'}).command, 'node /opt/cua-1.2_x/bin/cua.mjs install');
});
