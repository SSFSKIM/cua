// The route audits' raw traces, kept beside the run's results so a later judge can re-judge them (#171 M5, task 106;
// the design session's ruling 858). arm64's V1 at H'''' could not be re-judged under the fixed foreign-window rule:
// the proxy's stop removed every trace, and the audit rows keep only their first ten findings. Each audited operation's
// lifecycles are kept now, compressed, under `<out>/audit-traces/`, with what the judge read them against (the run's
// registered window ids and the root) in the audit row's `kept_traces`. A run's kept traces are capped
// (`--audit-traces <MB>`, `off` for none); an audit whose traces were not kept says why. Keeping them changes what the
// run writes, after the audit's traces have ended, never what it runs or judges.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** Where a run keeps its route audits' traces, under its output directory. */
export const AUDIT_TRACES_DIR = 'audit-traces';
/** A run's cap on its kept traces, compressed, unless `--audit-traces` names another (in MB) or `off`. */
export const DEFAULT_AUDIT_TRACE_MB = 256;

/**
 * The run's keeper: `keep({name, traces, registered, root})` writes one audited operation's lifecycle traces (text, in
 * order) and answers the audit row's `kept_traces`: `{files, registered, root}` (files relative to `out`), or `{kept:
 * false, reason}` when the keeper is off or the traces would pass the run's cap. All of an operation's traces are kept,
 * or none.
 */
export function traceKeeper({ out, limitMb = DEFAULT_AUDIT_TRACE_MB }) {
  let used = 0;
  let n = 0;
  return {
    keep({ name, traces, registered, root }) {
      if (!limitMb) return { kept: false, reason: 'not kept: --audit-traces off' };
      const packed = traces.map((t) => gzipSync(Buffer.from(t ?? '', 'utf8')));
      const bytes = packed.reduce((sum, b) => sum + b.length, 0);
      if (used + bytes > limitMb * 1024 * 1024) return { kept: false, reason: `not kept: the run's ${limitMb} MB cap on kept traces would be passed (${used} bytes kept, ${bytes} more)` };
      n += 1;
      let files;
      try {
        mkdirSync(join(out, AUDIT_TRACES_DIR), { recursive: true });
        files = packed.map((b, i) => {
          const file = join(AUDIT_TRACES_DIR, `${String(n).padStart(3, '0')}-${name.replace(/[^A-Za-z0-9_.-]/g, '_')}-${i}.xtrace.gz`);
          writeFileSync(join(out, file), b);
          return file;
        });
      } catch (error) {
        // a full disk ends the keeping of this audit's traces, never the run: the row says so
        return { kept: false, reason: `not kept: ${error.message}` };
      }
      used += bytes;
      return { files, registered: [...registered].sort((a, b) => a - b), root };
    },
  };
}

/** A kept audit's traces as text, in lifecycle order, read from the run's output directory `out`; null where any is missing. */
export function readKeptTraces(out, kept) {
  if (!kept?.files?.length) return null;
  const paths = kept.files.map((f) => join(out, f));
  if (!paths.every(existsSync)) return null;
  return paths.map((p) => gunzipSync(readFileSync(p)).toString('utf8'));
}

/** `--audit-traces`' value: a cap in MB (a positive whole number), or `off` (0). */
export function parseAuditTraceCap(value) {
  if (value === 'off') return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error('--audit-traces needs a cap in MB (a positive whole number) or off');
  return n;
}
