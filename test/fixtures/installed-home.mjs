// A scratch CUA_HOME that looks like a verified install of the checked-in pin to the resolver (which checks structure
// only), but whose vendor node is this Node and whose cua-repl entry is the fake upstream (fake-upstream-process.mjs).
// Signatures are never involved. The home lives in a short directory outside $TMPDIR (shortScratch), as the scoped sandbox requires (a home
// under $TMPDIR is the misconfiguration `inTmpdir` sets up). `mode` selects the fake upstream's teardown behavior.
// `host` installs the checked-in pin of another host instead (a Linux one, say), for code that takes the host injected;
// the fake upstream runs under this Node either way.
import {mkdirSync, writeFileSync, symlinkSync, realpathSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadPins, selectPin} from '../../src/runtime/manifest.mjs';
import {REPO, scratch, shortScratch} from './runtime-fixture.mjs';
import {bwrapUserns} from '../../src/runtime/linux-desktop.mjs';

export const FAKE_UPSTREAM = join(REPO, 'test', 'fixtures', 'fake-upstream-process.mjs');
// A checked-in pin exists for this process's host (darwin-arm64, linux-x64, linux-arm64): the CLI and serve can resolve
// a forged install here.
export const installedHomeSupported = (() => { try { selectPin(loadPins()); return true; } catch { return false; } })();
// On Linux a scoped launch (a browser-only connection, cua profiles list and bind) runs only where bubblewrap can create
// an unprivileged user namespace; elsewhere cua refuses it (sandbox_unavailable). Tests that spawn the real CLI on such a
// path skip with this reason there, as the darwin-only tests skip off macOS; there is deliberately no switch to bypass
// the check. False where scoped launches work, else the skip reason.
export const NO_SCOPED_LAUNCH = process.platform === 'linux' && (await bwrapUserns()).status !== 'pass'
  && 'this host refuses unprivileged user namespaces (or has no bubblewrap), so cua refuses scoped launches here (sandbox_unavailable)';

export function fakeInstalledHome(t, {inTmpdir = false, mode, host} = {}) {
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
  return home;
}
