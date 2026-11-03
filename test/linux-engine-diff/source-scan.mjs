// The harness's source, read for its process starts (#171 M4; app-env.test.mjs's and xspawn.test.mjs's source tests):
// every JavaScript module of the harness and its entry point, comments blanked, and every call that starts a process,
// with its command (the call's first argument) and whether it goes through the spawner's display check (xspawn.mjs).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const HARNESS = join(import.meta.dirname, '../../scripts/linux-engine-diff');

/** Every JavaScript module of the harness, as `{file, text}`, comments blanked (lines kept). */
export function harnessModules() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (['target', 'node_modules'].includes(name)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(mjs|js)$/.test(name)) out.push({ file: relative(HARNESS, path), text: readFileSync(path, 'utf8') });
    }
  };
  walk(HARNESS);
  out.push({ file: '../linux-engine-diff.mjs', text: readFileSync(join(HARNESS, '..', 'linux-engine-diff.mjs'), 'utf8') });
  const blank = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return out.map(({ file, text }) => ({ file, text: blank(text) }));
}

/** `text` with every string literal's contents blanked, lengths kept, so a search finds code only. */
export const blankStrings = (text) => text.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (s) => s[0] + ' '.repeat(s.length - 2) + s.at(-1));

/** A call's first argument: the text up to the first comma at its own depth. */
export function firstArgument(text, open, code = blankStrings(text)) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = code[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return text.slice(open, i).trim();
      depth--;
    } else if (c === ',' && depth === 0) return text.slice(open, i).trim();
  }
  return text.slice(open).trim();
}

/** Where the parenthesis opened at `open - 1` closes, in `code`: the index just after it. */
function closing(code, open) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      if (depth === 0) return i + 1;
      depth--;
    }
  }
  return code.length;
}

const PROCESS_APIS = ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'];

/** The local names a module imports from `source` for `wanted` (aliases too). */
function imported(text, source, wanted) {
  const names = new Set();
  const from = source.replace(/[.$/]/g, '\\$&');
  for (const m of text.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${from}['"]`, 'g'))) {
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/);
      if (wanted.includes(orig)) names.add(alias ?? orig);
    }
  }
  return names;
}

/** `names` and every parameter defaulting to one of them (`run = execFileSync`). */
function withDefaults(text, names) {
  for (const m of text.matchAll(/(\w+)\s*=\s*(\w+)\s*(?=[,)}])/g)) if (names.has(m[2])) names.add(m[1]);
  return names;
}

/**
 * A module's process starts, `{file, line, command, guarded, at}`: a call of child_process's starts (by import, alias,
 * a parameter defaulting to one, or a dynamic import), unguarded; a call of the spawner's `xSpawn` or `xExecFileSync`,
 * or of a launcher behind its `guard(…)`, guarded.
 */
export function processStarts({ file, text }) {
  const code = blankStrings(text);
  const starts = [];
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const calls = (names, guarded) => {
    for (const name of names) {
      const pattern = new RegExp(`(?<![\\w.$])${name.replace(/[.$]/g, '\\$&')}\\s*\\(`, 'g');
      for (const m of code.matchAll(pattern)) starts.push({ file, line: lineOf(m.index), command: firstArgument(text, m.index + m[0].length, code), guarded, at: m.index });
    }
  };
  calls(withDefaults(text, imported(text, 'node:child_process', PROCESS_APIS)), false);
  for (const m of text.matchAll(/import\(\s*['"]node:child_process['"]\s*\)\)\s*\.\s*(\w+)\s*\(/g)) starts.push({ file, line: lineOf(m.index), command: firstArgument(text, m.index + m[0].length), guarded: false, at: m.index });
  const xspawn = file === 'xspawn.mjs' ? null : file.startsWith('../') ? './linux-engine-diff/xspawn.mjs' : './xspawn.mjs';
  if (xspawn) {
    calls(withDefaults(text, imported(text, xspawn, ['xSpawn', 'xExecFileSync'])), true);
    for (const name of imported(text, xspawn, ['guard'])) {
      for (const m of code.matchAll(new RegExp(`(?<![\\w.$])${name}\\s*\\(`, 'g'))) {
        const after = closing(code, m.index + m[0].length);
        const next = /^\s*\(/.exec(code.slice(after));
        if (next) starts.push({ file, line: lineOf(m.index), command: firstArgument(text, after + next[0].length, code), guarded: true, at: m.index });
      }
    }
  }
  return starts;
}

/** Every process start of the harness's modules. */
export const harnessStarts = (modules = harnessModules()) => modules.flatMap(processStarts);
