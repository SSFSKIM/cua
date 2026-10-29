// Which native engine answered a Linux computer session, for the facade harnesses' engine lanes
// (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The facade suites; Decision Log M1b.2): on Linux no js
// result attests its engine, so the harness reads the trusted worker's child itself, by its executable
// (/proc/<pid>/exe, never its command line). A lane is sound only when the engine it requested answered, at the
// executable the lane names (the pinned runtime's sky_linux_<arch> on the vendor lane; the installed or named
// cua-engine on the cua lane), as the trusted worker's child, and nothing else did. Used on the device by
// test/repl-parity/serve-native.mjs and scripts/native-baseline/linux.mjs, and judged on the controller.
import * as nodeFs from 'node:fs';
import {basename, join} from 'node:path';
import {Writable} from 'node:stream';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {linuxEnginePath} from '../../src/runtime/linux-engine.mjs';

export const ENGINES = Object.freeze(['vendor', 'cua']);
// The parent every answering engine must have: src/repl-host/trusted-worker.mjs, which spawns it.
export const TRUSTED_WORKER = 'trusted-worker.mjs';

// The engine an executable is, by its file name: cua's `cua-engine`, the vendor's `sky_linux_<arch>`, else null.
export function engineKind(exe) {
  const name = basename(String(exe ?? ''));
  return name === 'cua-engine' ? 'cua' : /^sky_linux_[A-Za-z0-9_]+$/.test(name) ? 'vendor' : null;
}

// What a process runs, named by its command line: the script a Node process runs (its first argument after the
// interpreter's options), else the executable's own name.
const programOf = argv => {
  if (!argv.length) return null;
  if (/^node(\d+)?$/.test(basename(argv[0]))) {
    const script = argv.slice(1).find(arg => !arg.startsWith('-'));
    if (script) return basename(script);
  }
  return basename(argv[0]);
};

// The engine processes among the descendants of `root` (a pid) in the /proc tree at `proc` -> [{pid, exe, kind,
// parent}]: `exe` what /proc/<pid>/exe names, `parent` its parent's program (programOf). A process that ends while it is
// read is skipped.
export function engineProcesses(root, {proc = '/proc', fs = nodeFs} = {}) {
  const parents = new Map();
  for (const name of fs.readdirSync(proc)) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = fs.readFileSync(join(proc, name, 'stat'), 'utf8');
      // The command name may hold spaces and parentheses: the fields after it start after the last ')'.
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      parents.set(Number(name), ppid);
    } catch {}
  }
  const descends = pid => { for (let at = parents.get(pid), seen = 0; at !== undefined && seen < 4096; at = parents.get(at), seen++) if (at === root) return true; return false; };
  const found = [];
  for (const pid of [...parents.keys()].sort((a, b) => a - b)) {
    if (!descends(pid)) continue;
    let exe;
    try { exe = fs.readlinkSync(join(proc, String(pid), 'exe')); } catch { continue; }
    const kind = engineKind(exe);
    if (!kind) continue;
    let argv = [];
    try { argv = fs.readFileSync(join(proc, String(parents.get(pid)), 'cmdline'), 'utf8').split('\0').filter(Boolean); } catch {}
    found.push({pid, exe, kind, parent: programOf(argv)});
  }
  return found;
}

// The distinct engines seen across observations (pids dropped: a restarted engine of the same executable is the same).
export function mergeObservations(...lists) {
  const seen = new Map();
  for (const {exe, kind, parent} of lists.flat()) seen.set(JSON.stringify([exe, kind, parent]), {exe, kind, parent});
  return [...seen.values()];
}

// The notification a native lane's serve sends before each tool result: {requested, expected, error, observed (the
// engine processes below the serve then), sampleError?}. A notification, so no result row carries it.
export const ENGINE_NOTIFICATION = 'cua/parityEngine';
// The serve's MCP output, line by line, with that notification written before every tool result (a response whose
// result has `content`); `sample` -> the engine processes now (engineProcesses of the serve's pid). Everything else is
// forwarded unchanged.
export function engineWitness(output, {record, sample}) {
  let pending = '';
  return new Writable({write(chunk, encoding, done) {
    try {
      pending += chunk.toString();
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        if (!line.trim()) continue;
        if (Array.isArray(JSON.parse(line).result?.content)) {
          let observed = [], sampleError;
          try { observed = sample(); } catch (error) { sampleError = error.message; }
          output.write(JSON.stringify({jsonrpc: '2.0', method: ENGINE_NOTIFICATION, params: {...record, observed, ...(sampleError ? {sampleError} : {})}}) + '\n');
        }
        output.write(line + '\n');
      }
      done();
    } catch (error) { done(error); }
  }});
}

// The executable a lane's engine must run from, in the cua home `home` the lane serves -> {requested, expected (its real
// path, or null), error}: the vendor lane's is the home's runtime's sky_linux_<arch>; the cua lane's is `engineBin`
// (CUA_LINUX_ENGINE_BIN, --engine-bin) when named, else the engine installed in the home. Device side.
export function expectedEngine({engine, home, engineBin, runtime = () => resolveRuntime({home}), fs = nodeFs}) {
  try {
    if (engine === 'vendor') return {requested: engine, expected: fs.realpathSync(runtime().paths.skyLinuxBin), error: null};
    const path = engineBin ?? linuxEnginePath(fs.realpathSync(home));
    try { return {requested: engine, expected: fs.realpathSync(path), error: null}; }
    catch { return {requested: engine, expected: null, error: engineBin ? `the named engine ${path} does not exist` : `no engine is installed at ${path}`}; }
  } catch (error) { return {requested: engine, expected: null, error: error.message}; }
}

// The problem with a run's engine lane, or null: a run that names its engine (meta.engine) records one observation per
// native case (meta.engineAnswered, each {case, connection, requested, expected, error?, observed}), each sound.
export function laneEngineProblem(meta) {
  if (meta?.engine === undefined) return null;
  const entries = meta.engineAnswered ?? [];
  for (const id of (meta.caseIds ?? []).filter(id => id.startsWith('native/'))) {
    const found = entries.filter(e => e.case === id);
    if (found.length > 1) return `${id}: observed twice`;
    if (found[0] && found[0].requested !== meta.engine) return `${id}: the lane requested ${meta.engine}, the observation ${found[0].requested}`;
    const problem = engineAnsweredProblem(found[0], id);
    if (problem) return problem;
  }
  return null;
}

// The problem with what answered a lane, or null: `record` is {requested, expected (the executable the lane names, or
// null with `error` saying why), observed (mergeObservations)}; `name` labels the sentence.
export function engineAnsweredProblem(record, name) {
  if (!record || !Array.isArray(record.observed)) return `${name}: records no engine observation`;
  const {requested, expected, observed} = record;
  if (!ENGINES.includes(requested)) return `${name}: the requested engine ${requested} is not vendor or cua`;
  // A failed observation leaves an interval nobody watched: the observations around it do not cover it.
  if (record.sampleError) return `${name}: an engine observation failed (${record.sampleError}), so what answered in that interval is unknown`;
  if (typeof expected !== 'string' || !expected.startsWith('/')) return `${name}: no expected ${requested} engine${record.error ? ` (${record.error})` : ''}`;
  if (engineKind(expected) !== requested) return `${name}: the expected executable ${expected} is not a ${requested} engine`;
  if (!observed.length) return `${name}: no engine process answered (none was the trusted worker's child while the lane ran)`;
  const other = observed.find(o => o.exe !== expected || o.kind !== requested);
  if (other) return `${name}: ${other.exe} (${other.kind}) answered, not the requested ${requested} engine at ${expected}`;
  const stray = observed.find(o => o.parent !== TRUSTED_WORKER);
  if (stray) return `${name}: the engine ran as a child of ${stray.parent ?? 'an unknown process'}, not of the trusted worker (${TRUSTED_WORKER})`;
  return null;
}
