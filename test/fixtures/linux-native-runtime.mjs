// A Linux runtime for cua's own REPL host on any test machine: a scratch home with the checked-in Linux pin's layout
// (runtimeFor), whose vendor pieces are doubles. Nothing of the vendor runs and no display is touched.
// - The vendor Sky service (runtime.paths.skyVendorService) is shaped as @oai/sky 0.7.5's service.js with its linux
//   target (readable chatgpt-26.928.40906 R/cua_node/@oai/sky/dist/project/cua/sky_js/src/service.js:9-79,
//   targets/linux/sky_linux.js:6-29, sky_linux_transport.js:30-181): `setup` advertises the target and its methods,
//   `execute` sends `{id, command, input}` lines to one long-lived `<sky_linux> server` child over stdio and parses its
//   output, screenshots crossing as {filepath, data_url}; the child and its pipes are unref'd, as the vendor's are, so
//   only an outstanding request holds the worker for it.
// - sky_linux (runtime.paths.skyLinuxBin) is a JSONL server that answers from a fixed desktop of two gedit windows:
//   window 7 works, window 8 fails every input with an error that repeats the text it was given (as a native error may
//   carry what it was asked to type). It records each request in helper.jsonl beside itself: its pid, the command, the
//   window id and, for text, only the SHA-256 of what arrived.
// - The sandbox launcher (runtime.paths.codexCli) is a recording double: it writes its argv under
//   $CODEX_HOME/launches and runs the command after `--` unconfined.
import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {parsePin, runtimeFor} from '../../src/runtime/manifest.mjs';
import {linuxFixturePin, shortScratch} from './runtime-fixture.mjs';

const VENDOR_SKY = `import {spawn} from 'node:child_process';
const LINUX_METHODS = ['perform_secondary_action', 'click', 'clipboard_read', 'clipboard_release', 'clipboard_write', 'drag', 'drag_handle',
  'activate_window', 'get_screenshot', 'list_apps', 'list_windows', 'move', 'move_relative', 'press_key', 'key_down', 'key_up', 'scroll',
  'type_text', 'launch_app', 'get_window_state'];
const PARSED = new Set(['list_apps', 'list_windows', 'get_window_state', 'get_screenshot', 'clipboard_read']);
let child = null;
let buffer = '';
let nextId = 1;
const pending = new Map();
function helper() {
  if (child) return child;
  const started = spawn(process.env.OAI_SKY_LINUX_BIN, ['server'], {stdio: ['pipe', 'pipe', 'pipe']});
  for (const stream of [started.stdin, started.stdout, started.stderr]) stream.unref?.();
  started.stdout.setEncoding('utf8').on('data', chunk => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\\n')) !== -1;) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const answer = JSON.parse(line);
      const request = pending.get(answer.id);
      if (!request) continue;
      pending.delete(answer.id);
      if (pending.size === 0) started.unref();
      if (answer.ok === true) request.resolve(answer.output); else request.reject(new Error(answer.error));
    }
  });
  started.on('exit', code => {
    if (child === started) child = null;
    for (const [id, request] of pending) { pending.delete(id); request.reject(new Error('exit=' + code)); }
  });
  return (child = started);
}
function skyLinux(command, input) {
  const server = helper();
  server.ref();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject});
    server.stdin.write(JSON.stringify({id, command, input: input ?? {}}) + '\\n');
  });
}
const capture = shot => ({filepath: shot.filepath, data_url: shot.data_url});
export async function handleRpc(request) {
  if (request.type === 'setup') return {target: 'linux', methods: LINUX_METHODS};
  if (request.type !== 'execute') throw new Error('unsupported request ' + request.type);
  if (!LINUX_METHODS.includes(request.method)) throw new Error('Sky runtime method is not available: ' + request.method);
  const output = await skyLinux(request.method, request.args[0]);
  const value = PARSED.has(request.method) ? JSON.parse(output) : undefined;
  if (request.method === 'get_window_state') return {...value, screenshots: value.screenshots.map(capture)};
  if (request.method === 'get_screenshot') return value.map(capture);
  return value;
}
`;

const HELPER = `import {appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {createInterface} from 'node:readline';
const log = join(dirname(process.argv[1]), 'helper.jsonl');
const window = (id, title) => ({app: 'org.gnome.gedit', focused: id === 7, height: 600, id, modal: false, title, width: 800, window_type: 'normal', x: 0, y: 0});
const WINDOWS = [window(7, 'scratch'), window(8, 'failing')];
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const sha = text => createHash('sha256').update(text).digest('hex');
function answer(command, input) {
  const windowId = input.window?.id;
  if (command === 'list_apps') return JSON.stringify([{id: 'org.gnome.gedit', name: 'Text Editor', windows: WINDOWS}]);
  if (command === 'list_windows') return JSON.stringify(WINDOWS);
  if (command === 'get_window_state') return JSON.stringify({window: WINDOWS.find(w => w.id === windowId), ax_tree_source: 'at_spi',
    ax_tree: {id: 'n1', role: 'frame', name: 'scratch', children: [{id: 'n2', role: 'text', name: 'Document', children: []}]},
    screenshots: input.include_screenshot ? [{window_id: windowId, filepath: '/tmp/shot.png', data_url: 'data:image/png;base64,' + PNG}] : []});
  if (windowId === 8 && typeof input.text === 'string') throw new Error('AT-SPI could not insert ' + input.text);
  return null;
}
createInterface({input: process.stdin}).on('line', line => {
  const {id, command, input} = JSON.parse(line);
  appendFileSync(log, JSON.stringify({pid: process.pid, command, window: input.window?.id ?? null, ...(typeof input.text === 'string' ? {text: sha(input.text)} : {})}) + '\\n');
  try { process.stdout.write(JSON.stringify({id, ok: true, output: answer(command, input)}) + '\\n'); }
  catch (error) { process.stdout.write(JSON.stringify({id, ok: false, error: error.message}) + '\\n'); }
});
`;

const LAUNCHER = '#!/bin/sh\nmkdir -p "$CODEX_HOME/launches"\nfor a in "$@"; do printf \'%s\\n\' "$a"; done > "$CODEX_HOME/launches/$$"\n'
  + 'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done\nshift\n"$@"\nexit $?\n';

export const sha256 = text => createHash('sha256').update(text).digest('hex');

// -> {home, runtime, helperLog(), launches()}. `node` runs the sky_linux double. `secrets` ({label: value}) are written
// into a store at <home>/secrets (mode 0600 files in a 0700 directory), returned as `secretsDir`.
export function linuxNativeRuntime(t, {node, arch = 'arm64', secrets = {}}) {
  const scratch = shortScratch();
  t.after(scratch.cleanup);
  const home = realpathSync(scratch.dir);
  const runtime = runtimeFor({home, pin: parsePin(linuxFixturePin({arch, sha256: 'a'.repeat(64), length: 1})), record: null});
  const p = runtime.paths;
  mkdirSync(p.moduleDir, {recursive: true});
  for (const [path, body, mode] of [[p.skyVendorService, VENDOR_SKY], [`${p.skyLinuxBin}.mjs`, HELPER],
    [p.skyLinuxBin, `#!/bin/sh\nexec ${JSON.stringify(node)} ${JSON.stringify(`${p.skyLinuxBin}.mjs`)} "$@"\n`, 0o755], [p.codexCli, LAUNCHER, 0o755]]) {
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, body);
    if (mode) chmodSync(path, mode);
  }
  const secretsDir = join(home, 'secrets');
  mkdirSync(secretsDir, {mode: 0o700});
  for (const [label, value] of Object.entries(secrets)) writeFileSync(join(secretsDir, label), value, {mode: 0o600});
  const helperLogFile = join(dirname(p.skyLinuxBin), 'helper.jsonl');
  const launchesDir = join(home, 'state', 'codex', 'launches');
  return {
    home, runtime, secretsDir,
    helperLog: () => (existsSync(helperLogFile) ? readFileSync(helperLogFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []),
    launches: () => (existsSync(launchesDir) ? readdirSync(launchesDir).map(pid => readFileSync(join(launchesDir, pid), 'utf8').split('\n').slice(0, -1)) : []),
  };
}
