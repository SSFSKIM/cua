// The witness (Design, Verification system): `xprobe witness` watches the desktop for the whole of an operation —
// root PropertyNotify for _NET_ACTIVE_WINDOW and _NET_CLIENT_LIST_STACKING, and the input focus and the pointer
// sampled every 5 ms — from before the request is sent until after its answer; any change in that span fails the
// operation, whatever the state at its end.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * The judgement of one span report. Conservative: a PropertyNotify for either watched property fails the span even
 * when the value reads back unchanged, since a change followed by a restore leaves the same value behind.
 */
export function judgeSpan(report) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], samples: 0, max_gap_ms: null };
  const notified = Object.entries(report.notifies ?? {}).filter(([, n]) => n > 0).map(([field]) => field);
  const fields = [...new Set([...report.changes.map((c) => c.field), ...notified])];
  return { clean: fields.length === 0, fields, samples: report.samples, max_gap_ms: report.max_gap_ms };
}

/** A running witness; `span(tag, fn)` runs fn inside a watched span and returns `{value, witness}`. */
export async function startWitness(xprobe, { tailMs = 20 } = {}) {
  const child = spawn(xprobe, ['witness'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  const queued = [];
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queued.push(message);
  });
  const next = () => (queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiting.push(resolve)));
  const ready = await next();
  if (!ready.ready) throw new Error(`the witness did not start: ${JSON.stringify(ready)}`);
  let seq = 0;
  return {
    async span(tag, fn) {
      const name = `${tag}#${++seq}`;
      child.stdin.write(`begin ${name}\n`);
      await next();
      let value;
      let error;
      try {
        value = await fn();
      } catch (e) {
        error = e;
      }
      await new Promise((r) => setTimeout(r, tailMs));
      child.stdin.write(`end ${name}\n`);
      const report = await next();
      if (error) throw error;
      return { value, report, witness: judgeSpan(report) };
    },
    async stop() {
      child.stdin.end();
      await new Promise((resolve) => child.once('exit', resolve));
    },
  };
}

/**
 * Whether a stacking order changed only by raising `target` to the top: `after` is `before` with the target moved to
 * the end (the stacking list is bottom first).
 */
export function raisedOnly(before, after, target) {
  if (!before.includes(target)) return false;
  const expected = [...before.filter((w) => w !== target), target];
  return expected.length === after.length && expected.every((w, i) => after[i] === w);
}

/**
 * The witness of a request that took the foreground route (Decision Log, M2.2: the allowance is keyed to the route the
 * request actually took, read from the engine's record, never to the desktop mode). On a dedicated desktop the route
 * may activate its target window and move the pointer, and nothing else: every change of the active window goes to the
 * target, every change of the input focus goes into it (`focusWithin`), the stacking order changes only by the target's
 * raise (`stackingRaised`, from the orders before and after the span), and the pointer may move. On its way the window
 * manager may pass through no active window and no input focus (None or PointerRoot), so long as the last change goes
 * to the target. Anything else, a protocol error included, is a violation. Returns `{clean, fields, allowed}`:
 * `fields` the violations, `allowed` the fields that changed within the allowance.
 */
export function judgeForegroundSpan(report, { target, focusWithin, stackingRaised }) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], allowed: [] };
  const bad = new Set();
  const allowed = new Set();
  const changes = report.changes ?? [];
  const toTarget = (to) => Array.isArray(to) && to.length === 1 && to[0] === target;
  const noneActive = (to) => Array.isArray(to) && (to.length === 0 || (to.length === 1 && to[0] === 0));
  const last = (field) => changes.filter((c) => c.field === field && !c.notify).at(-1);
  for (const c of changes) {
    if (c.field === 'pointer') allowed.add('pointer');
    else if (c.field === 'active') {
      if (c.notify || toTarget(c.to) || (noneActive(c.to) && toTarget(last('active').to))) allowed.add('active');
      else bad.add('active');
    } else if (c.field === 'focus') {
      if (focusWithin(c.to) || ([0, 1].includes(c.to) && focusWithin(last('focus').to))) allowed.add('focus');
      else bad.add('focus');
    } else if (c.field === 'stacking') {
      if (stackingRaised) allowed.add('stacking');
      else bad.add('stacking');
    } else bad.add(c.field);
  }
  return { clean: bad.size === 0, fields: [...bad], allowed: [...allowed] };
}
