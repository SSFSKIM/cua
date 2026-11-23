// Task 89: which of the engine's 21 commands (the pinned vendor's 20 and type_characters) each verdict step ran. For every
// :0 step's run, its cua verdict rows (op, scene, verdict) from results.jsonl, and each op's command read from the
// harness's own op table at H (ops.mjs OPS): the command names its timed function sends (request, else send/run),
// found in that function's source. An op whose command can't be read that way is printed with `?` for a hand check.
// usage: node op-commands.mjs <worktree> <out root> <label dir> <step>...
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [wt, out, label, ...steps] = process.argv.slice(2);
const { OPS } = await import(join(wt, 'scripts/linux-engine-diff/ops.mjs'));
export const COMMANDS = ['list_windows', 'list_apps', 'get_window_state', 'get_screenshot', 'launch_app', 'activate_window', 'click', 'perform_secondary_action', 'press_key', 'key_down', 'key_up', 'type_text', 'type_characters', 'scroll', 'move', 'move_relative', 'drag', 'drag_handle', 'clipboard_read', 'clipboard_write', 'clipboard_release'];
const sent = (fn) => COMMANDS.filter((c) => new RegExp(`['"\`]${c}['"\`]`).test(String(fn)));
function commandOf(op) {
  const o = OPS[op];
  if (!o) return ['?'];
  for (const key of ['request', 'send', 'run', 'timed']) if (typeof o[key] === 'function' && sent(o[key]).length) return sent(o[key]);
  if (COMMANDS.includes(op)) return [op];
  return ['?'];
}
const byCommand = new Map(COMMANDS.map((c) => [c, []]));
const unmapped = [];
const cases = [];
for (const step of steps) {
  const f = join(out, `${step}.${label}`, 'run', 'results.jsonl');
  if (!existsSync(f)) { console.log(`${step}: no results`); continue; }
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'verdict' && r.candidate === 'cua');
  for (const r of rows) {
    const cmds = commandOf(r.op);
    const cell = `${step} ${r.scene}/${r.op}: ${r.verdict ?? (r.pass ? 'pass' : 'fail')}`;
    if (OPS[r.op]?.kind === 'case' || r.scene === 'cases') { cases.push(cell); continue; }
    if (cmds[0] === '?') unmapped.push(cell);
    for (const c of cmds) if (byCommand.has(c)) byCommand.get(c).push(cell);
  }
}
for (const [c, cells] of byCommand) {
  const stepsRan = [...new Set(cells.map((x) => x.split(' ')[0]))].join(', ') || 'none';
  const verdicts = [...new Set(cells.map((x) => x.split(': ')[1]))].join(', ');
  console.log(`${c}\t${stepsRan}\t${cells.length} cells\t${verdicts}`);
}
console.log(`cases, cua alone, not a command's output (${cases.length}): ${cases.join('; ')}`);
console.log(`unmapped (${unmapped.length}):`);
for (const u of unmapped) console.log(`  ${u}`);
