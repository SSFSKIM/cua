// Bounded public TAP diagnostics. Never persist a raw TAP/YAML dump: assertion messages, string/object operands,
// function labels and child stderr can contain credentials. Keep coordinates, fixed codes and scalar operands;
// withheld fields still say how much evidence was suppressed. No YAML evaluation or secret-store access.
const ENUMS = {
  failureType: new Set(['testCodeFailure', 'subtestsFailed', 'cancelledByParent', 'testTimeoutFailure', 'hookFailed', 'testAborted', 'uncaughtException', 'unhandledRejection']),
  operator: new Set(['equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual', 'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'fail', 'ifError']),
};
const unquote = value => value.replace(/^(['"])(.*)\1$/, '$2');
const withheld = value => ({withheld: true, chars: value.length, lines: value.split('\n').length});
const scalar = value => /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?)$/i.test(value) ? JSON.parse(value.toLowerCase()) : withheld(value);

export function tapDiagnostics(text, {root, redact = value => value, maxFailures = 100, maxBlockChars = 32768} = {}) {
  const safeName = value => redact(value)
    .replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '<withheld>')
    .replace(/\/(?:Users|home)\/[^/\s'"]+/g, '~').slice(0, 1000);
  const coordinate = value => {
    const raw = unquote(value).replace(/^file:\/\//, '');
    if (root && raw.startsWith(root.replace(/\/$/, '') + '/') && /:\d+:\d+$/.test(raw))
      return safeName('<repo>/' + raw.slice(root.replace(/\/$/, '').length + 1));
    if (/^node:[a-zA-Z0-9_./-]+:\d+:\d+$/.test(raw)) return raw;
    return '<withheld>';
  };
  const failures = [];
  let truncated = false, current = null, block = null;
  const finish = complete => {
    if (!block) return;
    if (!complete) current.diagnosticIncomplete = true;
    const fields = [];
    for (const line of block.lines) {
      const match = line.match(/^([A-Za-z]+):(?: (.*))?$/);
      if (match) fields.push({key: match[1], value: match[2] ?? ''});
      else if (fields.length && /^\s/.test(line)) fields.at(-1).value += '\n' + line;
    }
    for (const {key, value} of fields) {
      if (ENUMS[key]?.has(unquote(value))) current[key] = unquote(value);
      else if (key === 'code' && /^ERR_[A-Z_]{1,60}$/.test(unquote(value))) current.code = unquote(value);
      else if (key === 'location') current.location = coordinate(value);
      else if (['expected', 'actual', 'exitCode'].includes(key)) current[key] = scalar(value);
      else if (key === 'error') current.error = withheld(value);
      else if (key === 'stack') current.stack = value.split('\n').slice(1).map(line => {
        // The function label is never copied; only an owned source or Node-internal coordinate can survive.
        const at = root ? line.indexOf(root.replace(/\/$/, '') + '/') : -1;
        const candidate = at >= 0 ? line.slice(at) : line.match(/node:[a-zA-Z0-9_./-]+:\d+:\d+\)?$/)?.[0];
        return candidate ? coordinate(candidate.replace(/\)$/, '')) : '<withheld>';
      }).filter(frame => frame !== '<withheld>').slice(0, 20);
    }
    block = null;
  };
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const failure = line.match(/^(\s*)not ok \d+ - (.*)$/);
    if (failure && (!block || failure[1].length < block.indent)) {
      finish(false);
      if (failures.length >= maxFailures) { truncated = true; current = null; continue; }
      current = {name: safeName(failure[2]), diagnosticMissing: true};
      failures.push(current);
      continue;
    }
    if (!current) continue;
    if (!block && /^\s+---$/.test(line)) {
      delete current.diagnosticMissing;
      block = {indent: line.indexOf('---'), chars: 0, lines: []};
    } else if (block) {
      if (line === ' '.repeat(block.indent) + '...') { finish(true); current = null; continue; }
      block.chars += line.length + 1;
      if (block.chars <= maxBlockChars) block.lines.push(line.slice(block.indent));
      else { current.diagnosticTruncated = true; truncated = true; }
    } else if (/^\s*(?:ok \d+|# Subtest:|1\.\.)/.test(line)) current = null;
  }
  finish(false);
  return {failures, truncated};
}
