// A scratch CUA_HOME that looks like a verified install of the checked-in pin to the resolver (which checks structure
// only), but whose vendor node is this Node and whose cua-repl entry is the fake upstream (fake-upstream-process.mjs).
// Signatures are never involved. The home lives under /tmp, outside $TMPDIR, as the scoped sandbox requires (a home
// under $TMPDIR is the misconfiguration `inTmpdir` sets up). `mode` selects the fake upstream's teardown behavior;
// `helper` installs the stand-in Keychain helper as $CUA_HOME/bin/cua-keychain in that FAKE_HELPER_MODE, for runs with
// CUA_SHIM_SECRETS=on (otherwise served processes run with secrets off and no Keychain helper is ever started).
// `host` installs the checked-in pin of another host instead (a Linux one, say), for code that takes the host injected;
// the fake upstream runs under this Node either way.
import {mkdirSync, writeFileSync, symlinkSync, realpathSync, chmodSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPins, selectPin} from '../../src/runtime/manifest.mjs';
import {REPO, scratch, shortScratch} from './runtime-fixture.mjs';

export const FAKE_UPSTREAM = join(REPO, 'test', 'fixtures', 'fake-upstream-process.mjs');
// A checked-in pin exists for this process's host (darwin-arm64, linux-x64, linux-arm64): the CLI and serve can resolve
// a forged install here.
export const installedHomeSupported = (() => { try { selectPin(loadPins()); return true; } catch { return false; } })();

export function fakeInstalledHome(t, {inTmpdir = false, mode, helper, host} = {}) {
  const s = inTmpdir ? scratch() : shortScratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const pin = selectPin(loadPins(), host);
  const root = join(home, 'runtimes', pin.release);
  for (const [key, rel] of Object.entries(pin.layout)) {
    const path = join(root, rel);
    if (key === 'moduleDir' || key === 'skyServiceApp') { mkdirSync(path, {recursive: true}); continue; }
    mkdirSync(dirname(path), {recursive: true});
    if (key === 'node') symlinkSync(process.execPath, path);
    else if (key === 'cuaRepl') writeFileSync(path, mode
      ? `process.argv[2] = ${JSON.stringify(mode)};\nawait import(${JSON.stringify(pathToFileURL(FAKE_UPSTREAM).href)});\n`
      : `import ${JSON.stringify(pathToFileURL(FAKE_UPSTREAM).href)};\n`);
    else writeFileSync(path, '');
  }
  writeFileSync(join(root, 'install.json'), JSON.stringify({schema: 1, release: pin.release, archive: {sha256: pin.archive.sha256, length: pin.archive.length}}));
  writeFileSync(join(home, 'current.json'), JSON.stringify({schema: 1, release: pin.release}));
  if (helper) {
    mkdirSync(join(home, 'bin'));
    const fake = join(REPO, 'test', 'fixtures', 'fake-keychain-helper.mjs');
    writeFileSync(join(home, 'bin', 'cua-keychain'), `#!/bin/sh\nFAKE_HELPER_MODE=${helper} exec ${JSON.stringify(process.execPath)} ${JSON.stringify(fake)} "$@"\n`);
    chmodSync(join(home, 'bin', 'cua-keychain'), 0o755);
  }
  return home;
}
