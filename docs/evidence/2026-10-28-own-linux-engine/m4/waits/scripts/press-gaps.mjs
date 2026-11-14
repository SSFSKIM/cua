// From analyze-order.mjs --json lines on stdin: the press's delay after the activation request, min / median / max.
import { readFileSync } from 'node:fs';

const rows = readFileSync(0, 'utf8').trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)).filter((r) => r.press);
const gaps = rows.map((r) => r.press.t_ms - r.activate_ms).sort((a, b) => a - b);
const off = rows.filter((r) => !r.press.on_target || r.press.before_raise).length;
console.log(`${rows.length} presses; after the activation request min ${gaps[0].toFixed(1)} median ${gaps[Math.floor(gaps.length / 2)].toFixed(1)} max ${gaps.at(-1).toFixed(1)} ms; off target or before the raise ${off}`);
