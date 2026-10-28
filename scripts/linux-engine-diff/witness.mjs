// The witness (Design, Verification system): `xprobe witness` watches the desktop for the whole of an operation —
// root PropertyNotify for _NET_ACTIVE_WINDOW and _NET_CLIENT_LIST_STACKING, and the input focus and the pointer
// sampled every 5 ms — from before the request is sent until after its answer; any change in that span fails the
// operation, whatever the state at its end.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** The judgement of one span report. */
export function judgeSpan(report) {
  if (!report || report.error) return { clean: false, fields: ['protocol'], samples: 0, max_gap_ms: null };
  const fields = [...new Set(report.changes.map((c) => c.field))];
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
