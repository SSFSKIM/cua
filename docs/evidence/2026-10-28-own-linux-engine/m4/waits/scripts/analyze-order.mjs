#!/usr/bin/env node
// Replays an `xprobe order-watch` record (server order) and, for every activation the engine requested (source 1),
// reports in order: the activation request, the target's focus (FocusIn on its frame), the frame's raise (the first
// ConfigureNotify that puts it on top of the stack), and the next button press, with the topmost viewable root child
// under the pointer at the press as the replayed stacking has it and as the pointer's own `child` read just after.
// The raise is judged by the replayed stacking: the frame on top of every mapped managed window that overlaps it.
// usage: analyze-order.mjs <order.jsonl[.gz]> [--json]
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const [file, flag] = process.argv.slice(2);
const raw = readFileSync(file);
const lines = (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
let stack = []; // bottom first: {id, mapped, x, y, w, h}
const find = (id) => stack.findIndex((w) => w.id === id);
const topAt = (x, y) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    const w = stack[i];
    if (w.mapped && x >= w.x && y >= w.y && x < w.x + w.w && y < w.y + w.h) return w.id;
  }
  return 0;
};
const isTop = (id) => {
  // on top of every other mapped managed (non-override-redirect) window that overlaps it
  const i = find(id);
  if (i < 0) return false;
  const me = stack[i];
  return !stack.slice(i + 1).some((w) => w.mapped && !w.or && w.x < me.x + me.w && me.x < w.x + w.w && w.y < me.y + me.h && me.y < w.y + w.h);
};
const runs = [];
let open = null;
for (const e of lines) {
  switch (e.kind) {
    case 'tree':
      stack = e.children.map(([id, mapped, or, x, y, w, h]) => ({ id, mapped: !!mapped, or: !!or, x, y, w, h }));
      break;
    case 'create':
      stack.push({ id: e.window, mapped: false, or: !!e.or, x: e.x, y: e.y, w: e.w, h: e.h });
      break;
    case 'configure': {
      const i = find(e.window);
      const w = i >= 0 ? stack.splice(i, 1)[0] : { id: e.window, mapped: false, or: !!e.or };
      Object.assign(w, { x: e.x, y: e.y, w: e.w, h: e.h });
      const at = e.above === 0 ? 0 : find(e.above) + 1;
      stack.splice(at, 0, w);
      if (open && open.frame === e.window && open.raised_ms === null && isTop(e.window)) open.raised_ms = e.t_ms;
      break;
    }
    case 'circulate': {
      const i = find(e.window);
      if (i >= 0) {
        const [w] = stack.splice(i, 1);
        if (e.place === 'top') stack.push(w);
        else stack.unshift(w);
      }
      break;
    }
    case 'map': {
      const i = find(e.window);
      if (i >= 0) stack[i].mapped = true;
      break;
    }
    case 'unmap': {
      const i = find(e.window);
      if (i >= 0) stack[i].mapped = false;
      break;
    }
    case 'destroy': {
      const i = find(e.window);
      if (i >= 0) stack.splice(i, 1);
      break;
    }
    case 'reparent': {
      const i = find(e.window);
      if (!e.to_root && i >= 0) stack.splice(i, 1);
      if (e.to_root && i < 0) stack.push({ id: e.window, mapped: false, or: !!e.or, x: 0, y: 0, w: 0, h: 0 });
      break;
    }
    case 'activate':
      if (e.source === 1) {
        if (open) runs.push(open);
        open = { client: e.window, activate_ms: e.t_ms, frame: null, focus_ms: null, raised_ms: null, active_ms: null, press: null };
      }
      break;
    case 'active':
      if (open && open.active_ms === null) open.active_ms = e.t_ms;
      break;
    case 'focus_in':
      // a frame's FocusIn (detail 4, NonlinearVirtual) names the top-level the focus entered
      if (open && open.frame === null && e.detail === 4 && find(e.window) >= 0) {
        open.frame = e.window;
        open.focus_ms = e.t_ms;
        if (isTop(e.window)) open.raised_ms = e.t_ms; // already on top when the focus came
      }
      break;
    case 'press':
      if (open && !open.press) {
        const top = topAt(e.pointer.x, e.pointer.y);
        open.press = { t_ms: e.t_ms, x: e.pointer.x, y: e.pointer.y, top_replayed: top, top_after: e.pointer.child, on_target: top === open.frame, before_raise: open.raised_ms === null };
      }
      break;
  }
}
if (open) runs.push(open);
if (flag === '--json') {
  for (const r of runs) console.log(JSON.stringify(r));
} else {
  const rel = (t, r) => (t === null ? '—' : (t - r.activate_ms).toFixed(1));
  console.log('| # | frame | focus +ms | raise +ms | _NET_ACTIVE_WINDOW +ms | press +ms | top under the press (replayed / read after) | press reached |');
  console.log('|---:|---|---:|---:|---:|---:|---|---|');
  runs.forEach((r, i) => {
    const p = r.press;
    console.log(`| ${i} | ${r.frame} | ${rel(r.focus_ms, r)} | ${rel(r.raised_ms, r)} | ${rel(r.active_ms, r)} | ${p ? rel(p.t_ms, r) : '—'} | ${p ? `${p.top_replayed} / ${p.top_after}` : '—'} | ${p ? (p.on_target ? 'target' : '**another window**') : 'no press'} |`);
  });
  const pressed = runs.filter((r) => r.press);
  const lost = pressed.filter((r) => !r.press.on_target);
  const beforeRaise = pressed.filter((r) => r.press.before_raise);
  console.log(`\n${runs.length} activations, ${pressed.length} with a press; ${lost.length} presses under another window; ${beforeRaise.length} pressed before the frame's raise.`);
  const foreground = runs.filter((r) => r.focus_ms !== null && r.focus_ms - r.activate_ms < 100);
  const lags = foreground.filter((r) => r.raised_ms !== null).map((r) => r.raised_ms - r.activate_ms).sort((a, b) => a - b);
  if (lags.length) console.log(`The raise after the activation request: median ${lags[lags.length >> 1].toFixed(1)} ms, largest ${lags.at(-1).toFixed(1)} ms (${lags.length} raises); ${foreground.filter((r) => r.raised_ms === null).length} with no raise seen; ${runs.length - foreground.length} activations left out (no focus within 100 ms: the sitting's setup).`);
  const order = runs.filter((r) => r.raised_ms !== null && r.active_ms !== null);
  console.log(`_NET_ACTIVE_WINDOW changed after the raise in ${order.filter((r) => r.active_ms >= r.raised_ms).length} of ${order.length} activations with both.`);
}
