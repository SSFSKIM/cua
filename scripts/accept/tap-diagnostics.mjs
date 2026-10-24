// Public diagnostics come from structured node:test events, never parsed assertion YAML. TAP can contain unescaped
// object keys, including forged failure/closing lines. Only suite-reporter.mjs emits the JSON records read below;
// it does not forward test stdout, t.diagnostic, error prose or object operands into that channel.
import {fileURLToPath} from 'node:url';

const ENUMS = {
  failureType: new Set(['testCodeFailure', 'subtestsFailed', 'cancelledByParent', 'testTimeoutFailure', 'hookFailed', 'testAborted', 'uncaughtException', 'unhandledRejection']),
  operator: new Set(['==', '!=', '===', '!==', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'fail', 'ifError']),
};
// Error.code is caller-controlled, not a trusted namespace. Unknown values are explicitly withheld, not shape-checked.
const CODES = new Set(['ERR_ASSERTION', 'ERR_TEST_FAILURE', 'ERR_INVALID_ARG_TYPE', 'ERR_MODULE_NOT_FOUND', 'ENOENT', 'EACCES', 'EPERM', 'EPIPE', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EADDRINUSE']);
const withheld = value => ({withheld: true, type: value === null ? 'null' : typeof value, ...(typeof value === 'string' ? {chars: value.length} : {})});
const scalar = value => value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : withheld(value);
export const diagnosticName = value => String(value)
  .replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '<withheld>')
  .replace(/\/(?:Users|home)\/[^/\s'"]+/g, '~')
  .replace(/[\r\n\u{2028}\u{2029}]/gu, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).slice(0, 1000);

export function failureDiagnostic(data, {root}) {
  const coordinate = raw => {
    if (typeof raw !== 'string' || /[()\r\n]/.test(raw)) return '<withheld>';
    if (raw.startsWith('file://')) {
      const suffix = raw.match(/(:\d+:\d+)$/)?.[1];
      if (!suffix) return '<withheld>';
      try { raw = fileURLToPath(raw.slice(0, -suffix.length)) + suffix; } catch { return '<withheld>'; }
      if (/[()\r\n]/.test(raw)) return '<withheld>';
    }
    // Error.stack is itself caller-controlled (and starts with error prose). Only the runner's independently
    // reported test file may supply a path; a forged message frame cannot introduce another private path or label.
    if (raw.replace(/:\d+:\d+$/, '') === data.file && raw.startsWith(root.replace(/\/$/, '') + '/') && /:\d+:\d+$/.test(raw))
      return diagnosticName('<repo>/' + raw.slice(root.replace(/\/$/, '').length + 1));
    return '<withheld>';
  };
  const wrapper = data.details?.error;
  const error = wrapper?.cause instanceof Error ? wrapper.cause : wrapper;
  const result = {name: diagnosticName(data.name), location: coordinate(`${data.file}:${data.line}:${data.column}`)};
  if (ENUMS.failureType.has(wrapper?.failureType)) result.failureType = wrapper.failureType;
  if (!error) return {...result, diagnosticMissing: true};
  if ('code' in error) result.code = CODES.has(error.code) ? error.code : withheld(error.code);
  if (ENUMS.operator.has(error.operator)) result.operator = error.operator;
  for (const key of ['expected', 'actual', 'exitCode']) if (key in error) result[key] = scalar(error[key]);
  result.error = withheld(error.message);
  result.stack = typeof error.stack === 'string' ? error.stack.split('\n').slice(1).map(line => {
    // Only the terminal parenthesized coordinate, or a standalone frame, can be a source location. A function label
    // may itself contain the checkout root; never search for the first root substring in the frame.
    const candidate = line.match(/\(([^()\r\n]+:\d+:\d+)\)$/)?.[1]
      ?? line.match(/^\s*at ((?:file:\/\/|\/|node:)[^()\r\n]+:\d+:\d+)$/)?.[1];
    return coordinate(candidate);
  }).filter(frame => frame !== '<withheld>').slice(0, 20) : [];
  return result;
}

export const FAILURE_PREFIX = '# cua-accept-failure ';
export const COMPLETE_PREFIX = '# cua-accept-complete ';

// Kept beside TAP-shaped counts/skip lines for the existing verdict readers, but no raw TAP assertion is trusted.
// A reporter that dies before its final root summary leaves complete:false, rather than invented diagnostics.
export function tapDiagnostics(text, {maxFailures = 100, maxRecordChars = 32768} = {}) {
  const failures = [];
  let truncated = false, complete = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(COMPLETE_PREFIX)) {
      if (line === COMPLETE_PREFIX + 'false' || line === COMPLETE_PREFIX + 'true') {
        complete = true; truncated ||= line === COMPLETE_PREFIX + 'true';
      }
    } else if (line.startsWith(FAILURE_PREFIX)) {
      if (failures.length >= maxFailures || line.length > maxRecordChars) { truncated = true; continue; }
      try { failures.push(JSON.parse(line.slice(FAILURE_PREFIX.length))); }
      catch { truncated = true; }
    }
  }
  return {failures, truncated, complete};
}
