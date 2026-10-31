// A fake cua-engine for the tests of cua's Linux service (src/services/engine/linux/): an executable that speaks the
// engine's CLI and wire (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Interfaces): `--version` prints
// the version line, `server [--desktop <mode>]` answers one JSON request per stdin line, `{id, command, input}`, with
// `{id, ok, output | error, restart?}` on stdout. It records each start (its pid and argv) in spawns.jsonl and each
// request in requests.jsonl beside itself. No display is touched.
//
// Answers come from `behaviour`, the source of a module exporting `answer(command, input, ctx)` (ctx: {pid, desktop,
// count}, count being the requests this process received so far); it returns, or resolves to, undefined for the default
// answer, or one of {output}, {error, restart?}, {raw: <a line written as is>}, {exit: <code>, stderr?: <text>}. The
// defaults: capabilities is the X11 report with the started mode; list_windows two gedit windows (7, 8); list_apps
// their app; get_window_state a three-node tree of window 7 with one screenshot unless include_screenshot is false;
// get_screenshot that screenshot; clipboard_read a handle; every other command null.
import {chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const SHOT_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
export const WINDOWS = [
  {app: 'org.gnome.gedit', focused: true, height: 600, id: 7, modal: false, title: 'scratch', width: 800, window_type: 'normal', x: 0, y: 0},
  {app: 'org.gnome.gedit', focused: false, height: 600, id: 8, modal: false, title: 'other', width: 800, window_type: 'normal', x: 10, y: 10},
];
// The default tree: native ids as cua-engine names them (bus name plus object path).
export const TREE = {id: ':1.5/org/a11y/atspi/accessible/1', role: 'frame', name: 'scratch', states: ['enabled'], children: [
  {id: ':1.5/org/a11y/atspi/accessible/2', role: 'push button', name: 'Save', states: ['enabled'], actions: ['click'], children: []},
  {id: ':1.5/org/a11y/atspi/accessible/3', role: 'text', name: 'Document', states: ['enabled', 'editable'], children: []},
]};

const SERVER = ({dir, version}) => `#!${process.execPath}
import {appendFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
const dir = ${JSON.stringify(dir)};
const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write(${JSON.stringify(version)} + '\\n'); process.exit(0); }
appendFileSync(dir + '/spawns.jsonl', JSON.stringify({pid: process.pid, args}) + '\\n');
const desktop = args.includes('--desktop') ? args[args.indexOf('--desktop') + 1] : 'shared';
const {answer} = await import(dir + '/behaviour.mjs');
const WINDOWS = ${JSON.stringify(WINDOWS)};
const TREE = ${JSON.stringify(TREE)};
const shot = dir + '/shot.jpg';
function fallback(command, input) {
  switch (command) {
    case 'capabilities': return {output: {backend: 'x11', tree: 'at_spi', input: {background: true, desktop: true}, capture: {window: 'retained', desktop: true},
      text: {paste: 'verified', literal: true}, desktop, version: '0.3.0', build: 'fake'}};
    case 'list_windows': return {output: WINDOWS};
    case 'list_apps': return {output: [{id: 'org.gnome.gedit', name: 'Text Editor', windows: WINDOWS}]};
    case 'get_window_state': return {output: {window: WINDOWS[0], ax_tree: TREE, ax_tree_source: 'at_spi',
      screenshots: input.include_screenshot === false ? [] : [{filepath: shot}]}};
    case 'get_screenshot': return {output: [{filepath: shot}]};
    case 'clipboard_read': return {output: 'handle-1'};
    default: return {output: null};
  }
}
let count = 0;
createInterface({input: process.stdin}).on('line', async line => {
  const request = JSON.parse(line);
  count += 1;
  appendFileSync(dir + '/requests.jsonl', JSON.stringify({pid: process.pid, ...request}) + '\\n');
  const result = (await answer(request.command, request.input, {pid: process.pid, desktop, count})) ?? fallback(request.command, request.input);
  if ('exit' in result) { if (result.stderr) process.stderr.write(result.stderr); setTimeout(() => process.exit(result.exit), 20); return; }
  if ('raw' in result) { process.stdout.write(result.raw + '\\n'); return; }
  const answerLine = 'error' in result
    ? {id: request.id, ok: false, error: result.error, ...(result.restart ? {restart: true} : {})}
    : {id: request.id, ok: true, output: result.output};
  process.stdout.write(JSON.stringify(answerLine) + '\\n');
});
`;

// -> {path, dir, shot, spawns(), requests(), behave(source)}. `version` is the line `--version` prints; `behaviour` the
// answer module's source (see above); behave() replaces it for processes started afterwards.
export function fakeLinuxEngine(t, {version = 'cua-engine 0.3.0 (fake0000)', behaviour = 'export function answer() {}'} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-fake-linux-engine-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'cua-engine.mjs');
  writeFileSync(path, SERVER({dir, version}));
  chmodSync(path, 0o755);
  writeFileSync(join(dir, 'shot.jpg'), SHOT_BYTES);
  const behave = source => writeFileSync(join(dir, 'behaviour.mjs'), source);
  behave(behaviour);
  const lines = name => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []);
  return {path, dir, shot: join(dir, 'shot.jpg'), spawns: () => lines('spawns.jsonl'), requests: () => lines('requests.jsonl'), behave};
}
