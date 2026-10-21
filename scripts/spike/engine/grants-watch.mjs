#!/usr/bin/env node
// Grant evidence for the second input sitting (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, the
// Decision Log's delegated unknowns U5, U7 and U8; the runbook under docs/doperpowers/research/2026-10-18-own-native-
// engine/spike/sit2/). Runs on the device, from the harness checkout, over ssh. It only reads: it never edits TCC, never
// answers a dialog, and keeps nothing about another app: a line or an entry is kept only when it names one of the match
// strings (the engine's bundle ids and its display names by default).
//
//   grants-watch.mjs tcc-stream --out <file> [--match a,b]   the TCC subsystem's log, filtered, as JSON lines, until
//                                                             SIGTERM or SIGINT (start it in the background, stop it with kill)
//   grants-watch.mjs capture-approvals [--match a,b]          replayd's ScreenCaptureApprovals.plist, filtered, as JSON
//                                                             ({readable: false, error} when the file cannot be read)
import {spawn, spawnSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const DEFAULT_MATCH = Object.freeze(['io.github.ssfskim.cua.engine', 'cua Engine', 'cua-engine']);
export const TCC_PREDICATE = 'subsystem == "com.apple.TCC"';
export const CAPTURE_APPROVALS = join(homedir(), 'Library', 'Group Containers', 'group.com.apple.replayd', 'ScreenCaptureApprovals.plist');

const mentions = (text, match) => typeof text === 'string' && match.some(m => text.includes(m));

// One `log stream --style ndjson` line -> the kept event or null (another app's, malformed, or the stream's banner).
export function tccEvent(line, match = DEFAULT_MATCH) {
  let event;
  try { event = JSON.parse(line); } catch { return null; }
  if (!event || typeof event !== 'object' || !mentions(event.eventMessage, match)) return null;
  return {timestamp: event.timestamp ?? null, process: event.processImagePath?.split('/').pop() ?? null, category: event.category ?? null,
    messageType: event.messageType ?? null, eventMessage: event.eventMessage};
}

// The approvals plist (as plain JSON) -> only the entries that name a match string, by key or anywhere in the value.
export function captureApprovals(plist, match = DEFAULT_MATCH) {
  const kept = {};
  const walk = (value, path) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, inner] of Object.entries(value)) {
        if (mentions(key, match) || mentions(JSON.stringify(inner), match)) {
          if (mentions(key, match) || !inner || typeof inner !== 'object') kept[[...path, key].join('/')] = inner;
          else walk(inner, [...path, key]);
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((inner, i) => { if (mentions(JSON.stringify(inner), match)) kept[[...path, i].join('/')] = inner; });
    }
  };
  walk(plist, []);
  return kept;
}

const PLIST_TO_JSON = 'import json,plistlib,sys\nwith open(sys.argv[1],"rb") as f: print(json.dumps(plistlib.load(f), default=str))';

function readApprovals(match) {
  const read = spawnSync('/usr/bin/python3', ['-I', '-c', PLIST_TO_JSON, CAPTURE_APPROVALS], {encoding: 'utf8'});
  if (read.status !== 0) return {readable: false, path: CAPTURE_APPROVALS, error: (read.stderr || read.error?.message || '').trim().split('\n').pop()};
  return {readable: true, path: CAPTURE_APPROVALS, at: new Date().toISOString(), entries: captureApprovals(JSON.parse(read.stdout), match)};
}

function tccStream(out, match) {
  const file = createWriteStream(out, {flags: 'a', mode: 0o600});
  const child = spawn('/usr/bin/log', ['stream', '--style', 'ndjson', '--level', 'debug', '--predicate', TCC_PREDICATE], {stdio: ['ignore', 'pipe', 'inherit']});
  let rest = '';
  child.stdout.setEncoding('utf8').on('data', chunk => {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) { const event = tccEvent(line, match); if (event) file.write(`${JSON.stringify(event)}\n`); }
  });
  const stop = () => { child.kill('SIGTERM'); };
  process.on('SIGTERM', stop).on('SIGINT', stop);
  child.on('exit', code => file.end(() => process.exit(code === null || code === 0 ? 0 : 1)));
  process.stdout.write(`${JSON.stringify({streaming: true, pid: process.pid, out})}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [command, ...rest] = process.argv.slice(2);
  const flag = name => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const match = flag('match') ? flag('match').split(',').filter(Boolean) : [...DEFAULT_MATCH];
  if (command === 'tcc-stream' && flag('out')) tccStream(flag('out'), match);
  else if (command === 'capture-approvals') process.stdout.write(`${JSON.stringify(readApprovals(match))}\n`);
  else { process.stderr.write('usage: grants-watch.mjs tcc-stream --out <file> [--match a,b] | capture-approvals [--match a,b]\n'); process.exit(2); }
}
