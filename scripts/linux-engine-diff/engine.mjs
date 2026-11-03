// An engine over the wire: one process, `<bin> server [flags]`, one JSON request per line on stdin, one response
// per line on stdout. Requests go one at a time; each is timed from its write to its answer, and the first also
// from the process's spawn (the cold sample a service pays on first use). cua-engine's `--stats` lines on stderr are
// matched to their requests by id.

import { engineEnvironment } from './app-env.mjs';
import { xSpawn } from './xspawn.mjs';
import { createInterface } from 'node:readline';

const now = () => Number(process.hrtime.bigint()) / 1e6;

const operationWatchers = new Set();

// the scratch directory of the run open now (`runEngines`): every engine started meanwhile writes its temporary files
// there, in the run's TMPDIR (app-env.mjs `engineEnvironment`, task 51)
let openRun = null;

/**
 * The run whose engines start from now on (scenes.mjs `Desktop.begin`; one run at a time in a harness process): each
 * one, cua's and the vendor builds' alike, gets the run's TMPDIR under `scratch`. Returns the function that ends it.
 */
export function runEngines(scratch) {
  openRun = scratch;
  return () => {
    if (openRun === scratch) openRun = null;
  };
}

/** The open run's scratch directory, or null between runs. */
export const runningScratch = () => openRun;

/**
 * Every request an engine makes on a window, reported when it is answered to `watch({engine, window, command, start,
 * end})` (wall-clock ms): the spans during which that window's client may open popups of the operation's own (scenes.mjs
 * `Desktop.operations`, foreign.mjs `judgeForeign`). Returns the function that stops the watch.
 */
export function watchOperations(watch) {
  operationWatchers.add(watch);
  return () => operationWatchers.delete(watch);
}

/** A request's span to every watch, when it names a window. */
function reportOperation(engine, command, input, start) {
  const window = input?.window?.id;
  if (!window || operationWatchers.size === 0) return;
  const op = { engine, window, command, start, end: Date.now() };
  for (const watch of operationWatchers) watch(op);
}

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
    const env = engineEnvironment(this.env ?? process.env, openRun);
    this.child = xSpawn(this.bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
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
        // a line that does not parse leaves its request without stats, which a check that needs them fails
        let stats;
        try {
          ({ stats } = JSON.parse(line));
        } catch {
          this.stderrTail = `${this.stderrTail}unparsable --stats line: ${line.slice(0, 200)}\n`.slice(-4000);
          return;
        }
        this.statsById.set(stats?.id, stats);
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
    const wallStart = Date.now();
    this.child.stdin.write(`${JSON.stringify({ id, command, input })}\n`);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ response: { id, ok: false, error: `no answer within ${timeoutMs} ms` }, at: now() }), timeoutMs);
    });
    const { response, at } = await Promise.race([answered, timeout]);
    clearTimeout(timer);
    reportOperation(this, command, input, wallStart);
    let stats = null;
    if (this.statsWanted) {
      // the engine writes a request's line just after its answer; a check that needs it fails without it, so a busy
      // machine's late line is waited for (2 s), off the timed span, which ended at the answer
      const until = now() + 2000;
      while (!this.statsById.has(id) && now() < until) await new Promise((r) => setTimeout(r, 2));
      stats = this.statsById.get(id) ?? null;
      this.statsById.delete(id);
    }
    return { response, ms: at - sentAt, sinceSpawnMs: first ? at - this.spawnedAt : null, stats };
  }

  /** Writes several requests at once (pipelined) and waits for every answer. */
  async pipeline(requests, { timeoutMs = 120000 } = {}) {
    const started = now();
    const wallStart = Date.now();
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
    for (const { command, input } of requests) reportOperation(this, command, input, wallStart);
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
