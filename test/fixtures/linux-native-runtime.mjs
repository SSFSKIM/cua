// A Linux runtime for cua's own REPL host on any test machine (#171 M6b: cua's own parts, nothing of the vendor's): a
// scratch home holding cua's module tree for `arch` (own-linux-runtime.mjs), resolved as a connection resolves it, and
// an engine double behind cua's real Linux service (src/services/engine/linux/service.mjs), which a launch names as
// CUA_LINUX_ENGINE_BIN. Nothing runs a real engine and no display is touched.
// - The engine (../helpers/fake-linux-engine.mjs) answers from a fixed desktop of two gedit windows: window 7 works,
//   window 8 fails every text input with an error that repeats the text it was given (as a native error may carry what
//   it was asked to type). Its requests are read back as `engineLog()`: each one's pid, command and window id and, for
//   text, only the SHA-256 of what arrived.
// - The sandbox helper (where `cua install` places the pinned codex-linux-sandbox, src/sandbox/linux.mjs) is a recording
//   double: it writes its argv under <home>/helper-launches and runs the command after `--` unconfined, as its child.
//   Its SHA-256 (`helperSha`) is what a launch must name as the pinned one (CUA_REPL_SANDBOX_HELPER_SHA256).
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {shortScratch} from './runtime-fixture.mjs';
import {fakeModuleTree} from './own-linux-runtime.mjs';
import {fakeLinuxEngine} from '../helpers/fake-linux-engine.mjs';
import {quote} from '../../scripts/browser-parity/topology.mjs';
import {helperFor} from '../../src/sandbox/linux.mjs';

// Window 8 answers its own state, and refuses text, naming what it was given.
const FAILING_WINDOW = `export function answer(command, input) {
  if (input?.window?.id !== 8) return undefined;
  if (typeof input.text === 'string') return {error: 'AT-SPI could not insert ' + input.text};
  if (command === 'get_window_state') return {output: {window: input.window, ax_tree_source: 'at_spi',
    ax_tree: {id: ':1.5/org/a11y/atspi/accessible/8', role: 'frame', name: 'other', states: ['enabled'], children: []},
    screenshots: input.include_screenshot === false ? [] : [{filepath: new URL('./shot.jpg', import.meta.url).pathname}]}};
  return undefined;
}
`;

const launcher = dir => `#!/bin/sh\nmkdir -p ${quote(dir)}\nfor a in "$@"; do printf '%s\\n' "$a"; done > ${quote(dir)}/$$\n`
  + 'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done\nshift\n"$@"\nexit $?\n';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// -> {home, runtime, engine, secretsDir, helperSha, engineLog(), launches()}. `secrets` ({label: value}) are written into
// a store at <home>/secrets (mode 0600 files in a 0700 directory), returned as `secretsDir`.
export function linuxNativeRuntime(t, {arch = 'arm64', secrets = {}} = {}) {
  const scratch = shortScratch();
  t.after(scratch.cleanup);
  const home = realpathSync(scratch.dir);
  const host = {platform: 'linux', arch};
  fakeModuleTree(home, host);
  const runtime = resolveRuntime({home, host});
  const engine = fakeLinuxEngine(t, {behaviour: FAILING_WINDOW});
  const launchesDir = join(home, 'helper-launches');
  const helper = helperFor({home, arch});
  mkdirSync(dirname(helper.path), {recursive: true});
  writeFileSync(helper.path, launcher(launchesDir));
  chmodSync(helper.path, 0o755);
  const secretsDir = join(home, 'secrets');
  mkdirSync(secretsDir, {mode: 0o700});
  for (const [label, value] of Object.entries(secrets)) writeFileSync(join(secretsDir, label), value, {mode: 0o600});
  return {
    home, runtime, engine, secretsDir, helperSha: sha256(readFileSync(helper.path)),
    engineLog: () => engine.requests().map(({pid, command, input}) => ({pid, command, window: input?.window?.id ?? null, ...(typeof input?.text === 'string' ? {text: sha256(input.text)} : {})})),
    launches: () => (existsSync(launchesDir) ? readdirSync(launchesDir).map(pid => readFileSync(join(launchesDir, pid), 'utf8').split('\n').slice(0, -1)) : []),
  };
}
