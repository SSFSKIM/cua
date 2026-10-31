// The engine client of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Design "The
// service" and "Process model"; Interfaces): the service's one cua-engine, a stdio child of the trusted worker.
//
// Starting. Before each start the client runs `<engine> --version` and refuses an engine older than
// MIN_ENGINE_VERSION, the oldest whose wire this service relies on (0.3.0: `capabilities` and `--desktop`), or one whose
// version line it cannot read; nothing is spawned then. It spawns `<engine> server --desktop <mode>` and sends
// `capabilities` as the new process's first request, keeping the answer for the service. Requests made while it starts
// wait for it, in call order.
//
// The wire is the vendor's (R/A §1.6): one `{id, command, input}` line per request on stdin, ids increasing from 1 for
// the client's life; each stdout line `{id, ok, output | error, restart?}` settles the pending request with that id, so
// requests may be pipelined (the engine executes them one at a time, in order). `output` is the command's JSON value.
// An error answer rejects with its sentence. `restart: true` ends that engine and fails every other request pending on
// it with the same error; a line that is not JSON or carries no numeric id ends it too; an engine that exits fails what
// was pending with its status and the last 8 KiB of its stderr. The next request starts a fresh engine. As the vendor's
// transport does, the child's pipes are unref'd and the child is ref'd only while a request is pending, so an idle
// engine never holds the worker; the engine ends with the worker.
// The vendor's SkyLinuxTransport (@oai/sky 0.7.5 targets/linux/sky_linux_transport.js) is the reference; its sentences
// that name sky_linux name cua-engine here.
import {execFile, spawn} from 'node:child_process';

export const MIN_ENGINE_VERSION = '0.3.0';
const STDERR_TAIL = 8192;
const VERSION_TIMEOUT_MS = 5000;
const REMEDY = 'run cua install --engine';

// The version a `cua-engine --version` line names (`cua-engine 0.3.0 (9381f166e106)`), or null.
export function engineVersionOf(line) {
  return /^cua-engine (\d+\.\d+\.\d+) /.exec(String(line))?.[1] ?? null;
}

// Whether version `found` is older than `wanted`, both `major.minor.patch`.
export function isOlder(found, wanted) {
  const a = found.split('.').map(Number), b = wanted.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

const bounded = text => (text.length > 200 ? `${text.slice(0, 200)}…` : text);

// Resolves once the engine at `path` is new enough; rejects with the sentence that says why not.
function checkVersion(path, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(path, ['--version'], {timeout: timeoutMs}, (error, stdout) => {
      if (error) return reject(new Error(`cua-engine at ${path} could not be run (${error.code ?? error.signal ?? error.message}); ${REMEDY}`));
      const line = stdout.split('\n')[0].trim();
      const found = engineVersionOf(line);
      if (found === null) return reject(new Error(`cua-engine at ${path} printed no version this cua recognizes (${JSON.stringify(bounded(line))}); ${REMEDY}`));
      if (isOlder(found, MIN_ENGINE_VERSION)) return reject(new Error(`cua-engine ${found} is older than ${MIN_ENGINE_VERSION}, which this cua needs; ${REMEDY}`));
      resolve();
    });
  });
}

// `path` the engine; `desktop` the device mode it is started in.
export function createEngineClient({path, desktop = 'shared', versionTimeoutMs = VERSION_TIMEOUT_MS}) {
  let child = null;
  let starting = null;
  let capabilities = null;
  let nextId = 1;
  let stdoutBuffer = '';
  let stderrTail = '';
  const pending = new Map();

  // Ends `proc` as the current engine (if it still is) and fails every request pending on it with `error`.
  function retire(proc, error) {
    if (child === proc) {
      child = null;
      capabilities = null;
      stdoutBuffer = '';
      stderrTail = '';
    }
    proc.unref();
    if (proc.exitCode === null && proc.signalCode === null) proc.kill();
    for (const [id, waiter] of pending) {
      if (waiter.proc !== proc) continue;
      pending.delete(id);
      waiter.reject(error);
    }
  }

  function settle(proc, line) {
    let answer;
    try { answer = JSON.parse(line); } catch {
      return retire(proc, new Error(`cua-engine server emitted invalid JSON: ${bounded(line)}`));
    }
    if (answer === null || typeof answer !== 'object' || typeof answer.id !== 'number') return retire(proc, new Error('cua-engine server response missing numeric id'));
    const waiter = pending.get(answer.id);
    if (!waiter) return;
    pending.delete(answer.id);
    if (![...pending.values()].some(other => other.proc === proc)) proc.unref();
    if (answer.ok === true) return waiter.resolve(answer.output);
    const error = new Error(typeof answer.error === 'string' ? answer.error : `cua-engine request failed: ${waiter.command}`);
    if (answer.restart === true) retire(proc, error);
    waiter.reject(error);
  }

  function launch() {
    const proc = spawn(path, ['server', '--desktop', desktop], {stdio: ['pipe', 'pipe', 'pipe']});
    for (const stream of [proc.stdin, proc.stdout, proc.stderr]) stream.unref?.();
    proc.stdin.on('error', error => retire(proc, error));
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', chunk => {
      if (child !== proc) return;
      stdoutBuffer += chunk;
      for (let end; child === proc && (end = stdoutBuffer.indexOf('\n')) !== -1;) {
        const line = stdoutBuffer.slice(0, end).trim();
        stdoutBuffer = stdoutBuffer.slice(end + 1);
        if (line !== '') settle(proc, line);
      }
    });
    proc.stderr.on('data', chunk => { if (child === proc) stderrTail = `${stderrTail}${chunk}`.slice(-STDERR_TAIL); });
    proc.on('exit', (code, signal) => {
      const status = signal == null ? `exit=${code ?? 'unknown'}` : `signal=${signal}`;
      const tail = child === proc ? stderrTail.trim() : '';
      retire(proc, new Error(`cua-engine stopped (${status})${tail ? `: ${tail}` : ''}`));
    });
    proc.on('error', error => retire(proc, error));
    return proc;
  }

  function send(proc, command, input) {
    const id = nextId++;
    proc.ref();
    return new Promise((resolve, reject) => {
      pending.set(id, {proc, command, resolve, reject});
      proc.stdin.write(`${JSON.stringify({id, command, input})}\n`, 'utf8');
    });
  }

  // The running engine, started (version checked, capabilities read) if there is none.
  function engine() {
    if (starting) return starting;
    if (child) return Promise.resolve(child);
    starting = (async () => {
      await checkVersion(path, versionTimeoutMs);
      const proc = launch();
      child = proc;
      try {
        capabilities = await send(proc, 'capabilities', {});
      } catch (error) {
        retire(proc, error);
        throw error;
      }
      return proc;
    })().finally(() => { starting = null; });
    return starting;
  }

  return {
    // Sends `command` with `input`; resolves to its output.
    async request(command, input) {
      return send(await engine(), command, input);
    },
    // The capability report of the running engine, which is started if there is none.
    async capabilities() {
      await engine();
      return capabilities;
    },
    close() {
      if (child) retire(child, new Error('cua-engine was closed'));
    },
  };
}
