#!/usr/bin/env node
// #159: the judge of ci-kit gate `sandbox-denials` (scripts/repl-parity/hosted/hosted.sh denials). #115 M1 compared
// the sandbox denials of the Codex CLI's profile (before) with cua's own (after); the Codex CLI profile is gone, so the
// hosted check is one-sided. The denials cua's own host raises over repl-parity's `cells` and `services` suites
// (`log stream --style ndjson --predicate 'sender == "Sandbox"'`), reduced by scripts/sandbox-probe/denials.mjs (node
// processes only, filesystem targets as classes), must hold no preferences (cfprefs) denial and stay within the
// declared set, M1's accepted after side (denials-declared.json). A stream that recorded no Sandbox event at all fails:
// the check would be vacuous.
//
//   node scripts/repl-parity/hosted/denials-within.mjs <denials.ndjson> <denials-declared.json>
//
// Prints one line per denial kind (operation and target class, ephemeral ports normalised) with its count, then the
// verdict's counts; exit 1 when the denials do not hold. The log is public: a kind outside the declared set shows its
// target only when it is a class or a plain service, sysctl or domain name, otherwise `<withheld>`.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareDenials, summarize} from '../../sandbox-probe/denials.mjs';

// Two loopback connections differ only in their ephemeral port.
export const kindOf = ({operation, target}) => `${operation} ${target.replace(/:\d+$/, ':<port>')}`;
const PREFERENCES = /cfprefs|user-preference|preferences/;
const PUBLIC_OPERATION = /^[a-z][a-z0-9*-]{0,63}$/;
const PUBLIC_TARGET = /^(<[a-z ]{1,40}>|[A-Za-z0-9][A-Za-z0-9._-]{0,127}|remote:\*:<port>)$/;

// A kind's public line: a declared kind is already in the repository; any other shows only label-shaped parts.
export function publicKind({operation, target}, declared) {
  const kind = kindOf({operation, target});
  if (declared.has(kind)) return kind;
  const normal = target.replace(/:\d+$/, ':<port>');
  return `${PUBLIC_OPERATION.test(operation) ? operation : '<withheld>'} ${PUBLIC_TARGET.test(normal) ? normal : '<withheld>'}`;
}

// ndjson text, the declared list ({operation, target}) -> {events, kinds: [{kind, line, count, declared}], preferences,
// undeclared, ok}. `events` counts the stream's Sandbox denials of every process, before the reduction keeps node's.
export function judgeDenials(text, declaredList) {
  const declared = new Set(declaredList.map(kindOf));
  let events = 0;
  for (const line of text.split('\n')) {
    try { if (/\bdeny\(\d+\)/.test(String(JSON.parse(line).eventMessage ?? ''))) events++; } catch {}
  }
  const after = summarize(text);
  const kinds = new Map();
  for (const d of after) {
    const kind = kindOf(d);
    const entry = kinds.get(kind) ?? {kind, line: publicKind(d, declared), count: 0, declared: declared.has(kind)};
    entry.count += d.count;
    kinds.set(kind, entry);
  }
  const list = [...kinds.values()];
  const preferences = new Set([...compareDenials([], after).preferences.map(kindOf), ...list.filter(k => PREFERENCES.test(k.kind)).map(k => k.kind)]).size;
  const undeclared = list.filter(k => !k.declared).length;
  return {events, kinds: list, preferences, undeclared, ok: events > 0 && preferences === 0 && undeclared === 0};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [log, declaredFile] = process.argv.slice(2);
  if (!log || !declaredFile) { console.error('usage: denials-within.mjs <denials.ndjson> <denials-declared.json>'); process.exit(2); }
  const verdict = judgeDenials(readFileSync(log, 'utf8'), JSON.parse(readFileSync(declaredFile, 'utf8')).declared);
  for (const k of verdict.kinds) console.log(`  denial: ${k.line} x${k.count}${k.declared ? '' : '  (undeclared)'}`);
  console.log(`  Sandbox events ${verdict.events}, node denial kinds ${verdict.kinds.length}, preferences ${verdict.preferences}, undeclared ${verdict.undeclared}`);
  process.exitCode = verdict.ok ? 0 : 1;
}
