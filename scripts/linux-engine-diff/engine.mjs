// An engine over the wire: one process, `<bin> server [flags]`, one JSON request per line on stdin, one response
// per line on stdout. Requests go one at a time; each is timed from its write to its answer, and the first also
// from the process's spawn (the cold sample a service pays on first use). cua-engine's `--stats` lines on stderr are
// matched to their requests by id.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const now = () => Number(process.hrtime.bigint()) / 1e6;

export class Engine {
  constructor({ label, bin, args = [], stats = false, env }) {
    this.label = label;
    this.env = env;
    this.bin = bin;
    this.args = args;
    this.statsWanted = stats;
    this.nextId = 1;
    this.pending = new Map();
    this.statsById = new Map();
    this.stderrTail = '';
  }

  /** Whether the process was started (it is started once, by the first sample or by untimed preparation). */
  get started() {
    return Boolean(this.child);
  }

  start() {
    this.spawnedAt = now();
    const args = ['server', ...this.args, ...(this.statsWanted ? ['--stats'] : [])];
    this.child = spawn(this.bin, args, { stdio: ['pipe', 'pipe', 'pipe'], ...(this.env ? { env: this.env } : {}) });
    this.pid = this.child.pid;
    this.exited = new Promise((resolve) => this.child.once('exit', (code, signal) => resolve({ code, signal })));
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const at = now();
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        response = { id: null, ok: false, error: `unparsable engine output: ${line.slice(0, 200)}` };
      }
      const waiter = this.pending.get(response.id);
      if (waiter) {
        this.pending.delete(response.id);
        waiter({ response, at });
      }
    });
    createInterface({ input: this.child.stderr }).on('line', (line) => {
      if (line.startsWith('{"stats"')) {
        const { stats } = JSON.parse(line);
        this.statsById.set(stats.id, stats);
      } else {
        this.stderrTail = `${this.stderrTail}${line}\n`.slice(-4000);
      }
    });
    this.exited.then(({ code, signal }) => {
      for (const [id, waiter] of this.pending) {
        this.pending.delete(id);
        waiter({ response: { id, ok: false, error: `engine exited (${code ?? signal}): ${this.stderrTail.trim()}` }, at: now() });
      }
    });
    return this;
  }

  /** Sends one request and waits for its answer: `{response, ms, sinceSpawnMs, stats}`. */
  async request(command, input = {}, { timeoutMs = 120000 } = {}) {
    const id = this.nextId++;
    const first = id === 1;
    const answered = new Promise((resolve) => this.pending.set(id, resolve));
    const sentAt = now();
    this.child.stdin.write(`${JSON.stringify({ id, command, input })}\n`);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ response: { id, ok: false, error: `no answer within ${timeoutMs} ms` }, at: now() }), timeoutMs);
    });
    const { response, at } = await Promise.race([answered, timeout]);
    clearTimeout(timer);
    let stats = null;
    if (this.statsWanted) {
      for (let i = 0; i < 50 && !this.statsById.has(id); i++) await new Promise((r) => setTimeout(r, 2));
      stats = this.statsById.get(id) ?? null;
      this.statsById.delete(id);
    }
    return { response, ms: at - sentAt, sinceSpawnMs: first ? at - this.spawnedAt : null, stats };
  }

  /** Writes several requests at once (pipelined) and waits for every answer. */
  async pipeline(requests, { timeoutMs = 120000 } = {}) {
    const started = now();
    const waits = requests.map(({ command, input }) => {
      const id = this.nextId++;
      const answered = new Promise((resolve) => this.pending.set(id, resolve));
      this.child.stdin.write(`${JSON.stringify({ id, command, input })}\n`);
      return answered;
    });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answers within ${timeoutMs} ms`)), timeoutMs);
    });
    const answers = await Promise.race([Promise.all(waits), timeout]);
    clearTimeout(timer);
    return { responses: answers.map((a) => a.response), ms: answers.at(-1).at - started };
  }

  /** Ends the process: its stdin closed, killed after 10 s; a process that has already exited is gone. */
  async close() {
    if (!this.child) return;
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 10000);
    await this.exited;
    clearTimeout(timer);
  }
}
