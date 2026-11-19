// The route audits' traces, kept beside the run's results so a later judge can re-judge them (#171 M5, task 106; the
// design session's rulings 858 and 863). arm64's V1 at H'''' could not be re-judged under the fixed foreign-window
// rule: the proxy's stop removed every trace, and the audit rows keep only their first ten findings.
//
// What is kept is never the raw trace: on a person's display it carries their windows' titles and their clipboard
// (GetProperty replies, ChangeProperty data). It is a projection (`projectTrace`): the foreign-window judge's own input
// (foreign.mjs `xtraceElements`), each element cut to an allowlist of the fields the judge reads (`PROJECTION`), each
// value checked for its kind; a field or a value nobody listed is dropped. A ClientMessage's type, an atom any client
// may intern, is kept only when it is one of the protocol's own (foreign.mjs `CLIENT_MESSAGE_TYPES`), which the live
// judge names too, so a replay labels each finding as the run did. Judged by foreign.mjs `judgeForeign`, the
// projection gives the raw trace's findings (audit-traces.test.mjs). The route audits' other judges (forbidden
// requests, the foreground route) are not re-judged from it.
//
// Each execution keeps its own (`<out>/audit-traces/<run>-<execution id>/`), all of an audited operation's lifecycles
// or none: they are written into a staging directory and published by renaming it into place only once every write
// succeeded. A failure leaves nothing published, and its staging is removed as best it can be: a removal that fails is
// recorded with the audit (`cleanup`), never thrown.
// Every byte written is charged to the run's cap (`--audit-traces <MB>`, `off` for none), and nothing is kept once the
// out directory's filesystem would fall below a floor of free space, so the results always have room. The audit row's
// `kept_traces` names the files, the run and execution they belong to, and what the judge read them against (the
// registered window ids, the root), or why they were not kept. Keeping them changes what the run writes, after the
// audit's traces have ended, never what it runs or judges.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

import { CLIENT_MESSAGE_TYPES, xtraceElements } from './foreign.mjs';

/** Where a run keeps its route audits' projections, under its output directory. */
export const AUDIT_TRACES_DIR = 'audit-traces';
/** The kept files' form: one projected judge element a line, gzipped. */
export const AUDIT_TRACE_FORMAT = 'foreign-elements-1';
/** A run's cap on what it writes, compressed, unless `--audit-traces` names another (in MB) or `off`. */
export const DEFAULT_AUDIT_TRACE_MB = 256;
/** The free space the out directory's filesystem keeps: nothing is kept that would take it below this. */
export const DEFAULT_FREE_FLOOR_BYTES = 2 * 1024 ** 3;

/**
 * The fields of each judge element (foreign.mjs `xtraceElements`) the judge reads, by its kind: the allowlist. Every
 * other field is dropped, the raw request text first among them.
 */
export const PROJECTION = {
  req: ['c', 'seq', 'major', 'ours', 'op', 'window', 'parent', 'attributes', 'structure', 'property', 'incr', 'empty', 'delete', 'destination', 'event', 'cmWindow', 'cmType', 'requestor', 'selection', 'target', 'dst', 'focus', 'resource', 'type', 'detail'],
  error: ['c', 'seq', 'major', 'exact', 'code', 'bad'],
  base: ['c', 'base', 'mask'],
  destroyed: ['w'],
  parent: ['w', 'parent'],
  reparent: ['w', 'parent'],
  selreq: ['c', 'requestor', 'property', 'selection', 'target'],
};
/**
 * The string-valued fields and the values each may keep: a request's or an event's name and an XTEST event's type are
 * xtrace's own names for them; a ClientMessage's type only from the protocol's finite list.
 */
const NAMES = { op: (v) => /^[A-Za-z]{1,40}$/.test(v), event: (v) => /^[A-Za-z]{1,40}$/.test(v), type: (v) => /^[A-Za-z0-9 ]{1,40}$/.test(v), cmType: (v) => CLIENT_MESSAGE_TYPES.has(v) };
const ATTRIBUTE = /^[a-z-]{1,32}$/;

/** A listed field's value, if it is of a kind the judge reads (a number, a boolean, null, a named constant, a protocol name), else undefined. */
function allowed(field, value) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return NAMES[field]?.(value) ? value : undefined;
  if (field === 'attributes' && Array.isArray(value)) return value.every((a) => typeof a === 'string' && ATTRIBUTE.test(a)) ? [...value] : undefined;
  if (value && typeof value === 'object' && Object.keys(value).every((k) => k === 'keyword' || k === 'value') && /^[A-Za-z]{1,32}$/.test(value.keyword ?? '') && (value.value === undefined || Number.isFinite(value.value))) return { keyword: value.keyword, ...(value.value !== undefined ? { value: value.value } : {}) };
  return undefined;
}

/** A parsed xtrace trace (audit.mjs `parseXtrace`) as the judge's elements, cut to the allowlist. */
export function projectTrace(trace, root) {
  const out = [];
  for (const el of xtraceElements(trace, root)) {
    const fields = PROJECTION[el.k];
    if (!fields) continue;
    const kept = { k: el.k };
    for (const f of fields) {
      const v = allowed(f, el[f]);
      if (v !== undefined) kept[f] = v;
    }
    out.push(kept);
  }
  return out;
}

/** The free space on `dir`'s filesystem, in bytes (its nearest existing ancestor's, before it is made). */
function freeBytes(dir) {
  let at = dir;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  const s = statfsSync(at);
  return s.bavail * s.bsize;
}

const safe = (name) => String(name).replace(/[^A-Za-z0-9_.-]/g, '_');
/** An execution's directory under `out`, relative: its run's name and its own id. */
const namespaceOf = (run, execution) => join(AUDIT_TRACES_DIR, `${safe(run)}-${execution}`);

/**
 * The run's keeper (one per execution): `keep({name, traces, registered, root})` writes one audited operation's
 * lifecycle traces (parsed, in order) as projections and answers the audit row's `kept_traces`: `{format, run,
 * execution, files, registered, root}` (files relative to `out`, all in one bundle directory of the audit's own), or
 * `{kept: false, reason, cleanup?}`. `free` and `fs` are the tests' own.
 */
export function traceKeeper({ out, run, limitMb = DEFAULT_AUDIT_TRACE_MB, floorBytes = DEFAULT_FREE_FLOOR_BYTES, execution = randomBytes(6).toString('hex'), free = freeBytes, fs = { mkdirSync, writeFileSync, renameSync, rmSync } }) {
  let charged = 0;
  let n = 0;
  const namespace = namespaceOf(run, execution);
  return {
    execution,
    /** The bytes this execution has written, kept or removed after a failure: what the cap counts. */
    charged: () => charged,
    keep({ name, traces, registered, root }) {
      if (!limitMb) return { kept: false, reason: 'not kept: --audit-traces off' };
      const packed = traces.map((t) => gzipSync(Buffer.from(projectTrace(t, root).map((el) => JSON.stringify(el)).join('\n'), 'utf8')));
      const bytes = packed.reduce((sum, b) => sum + b.length, 0);
      if (charged + bytes > limitMb * 1024 * 1024) return { kept: false, reason: `not kept: the run's ${limitMb} MB cap on kept traces would be passed (${charged} bytes written, ${bytes} more)` };
      let room;
      try {
        room = free(out);
      } catch (error) {
        return { kept: false, reason: `not kept: the free space on the out directory could not be read (${error.message})` };
      }
      if (room - bytes < floorBytes) return { kept: false, reason: `not kept: the out directory's filesystem would fall below its floor of free space (${room} bytes free, ${floorBytes} kept free)` };
      n += 1;
      // charged before anything is written: whatever reaches the disk counts, kept or removed
      charged += bytes;
      const bundle = join(namespace, `${String(n).padStart(3, '0')}-${safe(name)}`);
      const staging = join(out, namespace, `.staging-${String(n).padStart(3, '0')}`);
      try {
        fs.mkdirSync(staging, { recursive: true });
        packed.forEach((b, i) => fs.writeFileSync(join(staging, `${i}.elements.gz`), b));
        // published whole, once every write succeeded
        fs.renameSync(staging, join(out, bundle));
        return { format: AUDIT_TRACE_FORMAT, run, execution, files: packed.map((_, i) => join(bundle, `${i}.elements.gz`)), registered: [...registered].sort((a, b) => a - b), root };
      } catch (error) {
        // nothing of this audit was published; its staging goes as best it can, and the run goes on: the row says why
        const failed = { kept: false, reason: `not kept: ${error.message}` };
        try {
          fs.rmSync(staging, { recursive: true, force: true });
        } catch (cleanup) {
          failed.cleanup = `the staging ${staging} was left: ${cleanup.message}`;
        }
        return failed;
      }
    },
  };
}

/**
 * A kept audit's lifecycle projections (each a list of judge elements, in order), read from the run's output
 * directory `out` for the audit row of run `run`: null where the row's record is not of this form, names another run,
 * or names a file outside a published bundle of its own execution's directory, or where any file is missing.
 */
export function readKeptTraces(out, kept, run) {
  if (kept?.format !== AUDIT_TRACE_FORMAT || !kept.files?.length || kept.run !== run || !/^[0-9a-f]{6,}$/.test(String(kept.execution))) return null;
  const own = `${namespaceOf(kept.run, kept.execution)}/`;
  if (!kept.files.every((f) => normalize(f) === f && f.startsWith(own) && /^[^./][^/]*\/[^/]+$/.test(f.slice(own.length)))) return null;
  const paths = kept.files.map((f) => join(out, f));
  if (!paths.every(existsSync)) return null;
  return paths.map((p) =>
    gunzipSync(readFileSync(p))
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );
}

/** `--audit-traces`' value: a cap in MB (a positive whole number), or `off` (0). */
export function parseAuditTraceCap(value) {
  if (value === 'off') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error('--audit-traces needs a cap in MB (a positive whole number) or off');
  return n;
}
