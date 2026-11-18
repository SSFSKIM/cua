// An engine over the wire: one process, `<bin> server [flags]`, one JSON request per line on stdin, one response
// per line on stdout. Requests go one at a time; each is timed from its write to its answer, and the first also
// from the process's spawn (the cold sample a service pays on first use). cua-engine's `--stats` lines on stderr are
// matched to their requests by id; the lines it writes with no request (`"id": null`: an after-release watch run out
// between requests, engine.rs `tick`) are kept, in order, with the next request's answer.
//
// Every engine's settle counter (#171 M5, task 103; ruling 827's condition, rulings 832 and 834): a run that records
// its engines (`recordEngines`, the harness's entry point) gets `settle-counts.json` in its out directory, each
// engine's last `drop_settles` from the `--stats` lines it already reads (settle-counts.mjs). Only a development run's
// opt-in, `--engine-stats`, gives `--stats` to every cua lane besides: `--stats` is not inert (a paste's confirmation
// reads the text around it again, and every request writes a line after its answer), so a counted run never takes it,
// and without it every engine starts exactly as before. The opt-in's lines go to each engine's own stats file and the
// record, never to the runner: its answers' `stats` and `untied` and the stderr tail an exit's error quotes are what
// they are without it.

import { appendFileSync, closeSync, mkdirSync, openSync, readSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { engineEnvironment } from './app-env.mjs';
import { ENGINE_STATS_DIR, engineEntry, settleCounts, writeSettleCounts } from './settle-counts.mjs';
import { xExecFileSync, xSpawn } from './xspawn.mjs';

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
 * For engines that code of another's starts with this process's environment (the two-services instrument: the vendor's
 * service and cua's own service, given no environment, each spawn their engine with process.env): puts the open run's
 * TMPDIR there, the value every other engine of the run gets (`engineEnvironment`), so both lanes share it. Only while a
 * run is open; answers the function that puts the harness's own back. The harness's own temporary directories made
 * meanwhile go there too, and with the run's scratch.
 */
export function runTmpdirInProcess() {
  if (!openRun) throw new Error("no run is open: the run's TMPDIR exists from Desktop.begin to the run's end");
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = engineEnvironment(process.env, openRun).TMPDIR;
  return () => {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  };
}

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

// the record of the run's engines (`recordEngines`): one at a time in a harness process
let recording = null;

/**
 * Records every engine started from now on for the out directory's settle-counts.json (settle-counts.mjs): `run` its
 * name where the command line gave one, `vendors` the vendor builds the run named (no counter is asked of them). With
 * `optIn` (`--engine-stats`, a development run's) every engine whose build `isCuaBuild` finds cua's, and that its runner
 * did not start with `--stats`, gets `--stats` too, its lines written to a stats file of its own. Answers the function
 * that writes the record, also called at the process's exit; nothing is written when no engine started.
 */
export function recordEngines({ out, run = null, vendors = [], optIn = false, isCuaBuild = cuaBuild }) {
  // the vendor builds by the paths the run named and what they resolve to now, while they exist
  const vendorPaths = new Set(vendors.filter(Boolean).flatMap((v) => [v, real(v)]));
  const state = { out, optIn, isCuaBuild, vendorPaths, engines: [], written: false };
  const started = new Date().toISOString();
  recording = state;
  const finish = () => {
    if (state.written) return;
    state.written = true;
    process.off('exit', finish);
    if (recording === state) recording = null;
    if (!state.engines.length) return;
    mkdirSync(out, { recursive: true });
    const engines = state.engines.map(engineEntry);
    writeSettleCounts(out, { harness_pid: process.pid, run, opt_in: optIn, started, finished: new Date().toISOString(), engines });
  };
  process.on('exit', finish);
  return finish;
}

const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** Whether a `--version` answer is cua-engine's (`cua-engine <version> (<commit>)`, candidate.mjs reads the same). */
export const isCuaVersion = (text) => /^cua-engine \S+/.test(String(text ?? ''));

/** Whether `path` is an ELF file: an engine build, never a stand-in script. */
export function isElfFile(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const head = Buffer.alloc(4);
    return readSync(fd, head, 0, 4, 0) === 4 && head.toString('latin1') === '\x7fELF';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const builds = new Map();

/**
 * Whether the build at `bin` is cua-engine, by its `--version`, once per path: the vendor's builds refuse the flag
 * (and `--stats`), and a file that is no ELF executable is never run to ask.
 */
export function cuaBuild(bin, env = process.env) {
  if (!builds.has(bin)) builds.set(bin, isElfFile(bin) && isCuaVersion(new Engine({ label: 'version', bin, env }).version()));
  return builds.get(bin);
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
    // the engine's own `--stats` lines, written with no request, since the last answer that took them
    this.untied = [];
    this.stderrTail = '';
    // the settle record's (settle-counts.mjs `engineEntry`): how `--stats` came, its lines, the last counter
    this.stats = null;
    this.statsFile = null;
    this.lines = 0;
    this.unparsable = 0;
    this.dropSettles = null;
    // whether the engine's last stats line was its own snapshot after the requests (`"id": null`, with drop_settles):
    // only that one follows what its exit did, and the exit can end a held handle, which can settle
    this.final = false;
    this.ended = false;
    // the requests sent, by command: the settle runs only inside a drag or a drag_handle
    this.sent = {};
  }

  /** The build's `--version` answer, '' when it gives none (the vendor's builds refuse the flag). */
  version() {
    try {
      return xExecFileSync(this.bin, ['--version'], { encoding: 'utf8', env: this.env ?? process.env, timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return '';
    }
  }

  /** Whether the process was started (it is started once, by the first sample or by untimed preparation). */
  get started() {
    return Boolean(this.child);
  }

  start() {
    const rec = recording;
    const env = engineEnvironment(this.env ?? process.env, openRun);
    // --stats its runner gave it (asked, or in its own args), parsed as ever; else the opt-in's, for a cua build alone
    // (asked once per build), never a second flag; all of it before the timed spawn
    const own = this.statsWanted || this.args.includes('--stats');
    if (rec?.optIn && !own) this.probed = rec.isCuaBuild(this.bin, env);
    this.stats = own ? 'asked' : this.probed ? 'opt-in' : null;
    // the engine's identity from what the run started, at its launch: a build the run named as the vendor's, a cua lane
    // (it took cua's --stats), or unidentified, which the record holds to the counter as a cua lane (the candidate's
    // copy may be gone by the harness's end)
    if (rec) this.build = rec.vendorPaths.has(this.bin) || rec.vendorPaths.has(real(this.bin)) ? 'vendor' : this.stats ? 'cua' : 'unidentified';
    this.spawnedAt = now();
    const args = ['server', ...this.args, ...(this.statsWanted || this.stats === 'opt-in' ? ['--stats'] : [])];
    this.argv = args;
    this.child = xSpawn(this.bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.pid = this.child.pid;
    if (rec) {
      rec.engines.push(this);
      if (rec.optIn && this.stats) this.statsFile = { out: rec.out, path: join(ENGINE_STATS_DIR, `${process.pid}.${this.label.replace(/[^A-Za-z0-9_.-]+/g, '_')}.${this.pid}.jsonl`) };
      // every line of stderr is read by the time the process closes
      this.child.once('close', () => {
        this.ended = true;
      });
    }
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
          this.noteStats(line, undefined);
          if (this.stats !== 'opt-in') this.stderrTail = `${this.stderrTail}unparsable --stats line: ${line.slice(0, 200)}\n`.slice(-4000);
          return;
        }
        this.noteStats(line, stats);
        // the opt-in's lines are the record's alone: its runner asked for none
        if (this.stats === 'opt-in') return;
        if (stats?.id === null) this.untied.push(stats);
        else this.statsById.set(stats?.id, stats);
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

  /** One `--stats` line, for the settle record: counted, its counter kept when it has one, and written to the stats file. */
  noteStats(line, stats) {
    this.lines += 1;
    if (stats === undefined) this.unparsable += 1;
    const counts = settleCounts(stats?.drop_settles);
    if (counts) this.dropSettles = counts;
    this.final = Boolean(counts) && stats?.id === null;
    if (this.statsFile) {
      mkdirSync(join(this.statsFile.out, ENGINE_STATS_DIR), { recursive: true });
      appendFileSync(join(this.statsFile.out, this.statsFile.path), `${line}\n`);
    }
  }

  /**
   * Sends one request and waits for its answer: `{id, response, ms, sinceSpawnMs, stats, untied}`, `untied` the
   * engine's own `--stats` lines written since the previous answer (empty without `--stats`).
   */
  async request(command, input = {}, { timeoutMs = 120000 } = {}) {
    const id = this.nextId++;
    const first = id === 1;
    this.sent[command] = (this.sent[command] ?? 0) + 1;
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
    // read once this request's own line is in, so every line the engine wrote before it is too (stderr keeps its order)
    const untied = this.untied.splice(0);
    return { id, response, ms: at - sentAt, sinceSpawnMs: first ? at - this.spawnedAt : null, stats, untied };
  }

  /** Writes several requests at once (pipelined) and waits for every answer. */
  async pipeline(requests, { timeoutMs = 120000 } = {}) {
    const started = now();
    const wallStart = Date.now();
    const waits = requests.map(({ command, input }) => {
      const id = this.nextId++;
      this.sent[command] = (this.sent[command] ?? 0) + 1;
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
