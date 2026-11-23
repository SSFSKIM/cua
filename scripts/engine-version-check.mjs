#!/usr/bin/env node
// The engine-version rule (#117 M5, R4; docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md): every change
// to cua's macOS engine program raises engineVersion (native/engine/Sources/Engine/Version.swift, which the assembler
// copies into the bundle's CFBundleShortVersionString), so an approved engine's version says which source it was built
// from at least, and the service's minimum (src/services/engine/client.mjs MIN_ENGINE_VERSION) can tell an engine too
// old to drive. The program is native/engine/ less its Tests/ and build products: the files `build` hashes
// (src/runtime/engine-bundle.mjs), the assembler aside, which writes the bundle around the program and is not part of it.
//
//   node scripts/engine-version-check.mjs [--base <rev>] [--head <rev>]
//
// Compares <base>..<head> (two dots), by default CI_KIT_BASE..CI_KIT_HEAD as ci-kit sets them for the `engine-version`
// gate (for a pull request, the base it merges into and its merge commit), else HEAD for the head. Without a base (a
// dispatch, or a local run naming none) there is no change to check, and it passes saying so. Locally, name the branch
// point: --base "$(git merge-base origin/main HEAD)". Exit 1 with the sentence on stderr when the rule is broken.
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {precedes, versionParts} from '../src/services/engine/client.mjs';

const ENGINE = 'native/engine/';
export const VERSION_FILE = `${ENGINE}Sources/Engine/Version.swift`;
const NOT_PROGRAM = /^native\/engine\/Tests\/|(^|\/)(\.build|\.swiftpm)\/|(^|\/)\.DS_Store$/;
const NAMED = 5;

// Whether a changed path (repository-relative, `/`-separated) is part of the engine's program.
export const countsAsEngineChange = path => path.startsWith(ENGINE) && !NOT_PROGRAM.test(path);

// The engineVersion a Version.swift text declares, or null.
export const declaredVersion = text => /\bengineVersion = "([^"]+)"/.exec(text ?? '')?.[1] ?? null;

// -> null when the change keeps the rule, else the sentence saying how it breaks it. `changed`: the paths the change
// touches; `base` and `head`: engineVersion on each side (null where Version.swift declares none; a base without one
// has nothing to move from).
export function versionMoveProblem({changed, base, head}) {
  const engine = changed.filter(countsAsEngineChange);
  if (!engine.length || base === null) return null;
  if (head === null) return `no engineVersion in ${VERSION_FILE}`;
  const [from, to] = [versionParts(base), versionParts(head)];
  if (!to) return `engineVersion "${head}" in ${VERSION_FILE} is not major.minor.patch`;
  if (!from || precedes(from, to)) return null;
  const files = engine.length > NAMED ? `${engine.slice(0, NAMED).join(', ')} and ${engine.length - NAMED} more` : engine.join(', ');
  if (base === head) return `${ENGINE} changed (${files}), but engineVersion is still ${base}: raise it in ${VERSION_FILE}, so a Mac's approved engine says it predates this change (and raise MIN_ENGINE_VERSION in src/services/engine/client.mjs if the service now relies on it)`;
  return `${ENGINE} changed (${files}), and engineVersion went from ${base} to ${head}: raise it above ${base} in ${VERSION_FILE}`;
}

function git(args) {
  const run = spawnSync('git', args, {encoding: 'utf8'});
  return run.status === 0 ? {ok: true, out: run.stdout} : {ok: false, err: run.stderr.trim()};
}

function main() {
  const {values} = parseArgs({options: {base: {type: 'string'}, head: {type: 'string'}}});
  const base = values.base || process.env.CI_KIT_BASE || '';
  const head = values.head || process.env.CI_KIT_HEAD || 'HEAD';
  if (!base) {
    console.log('engine-version: no base to compare with (a dispatch, or no --base), so no change to check');
    return 0;
  }
  const diff = git(['diff', '--name-only', base, head]);
  if (!diff.ok) { console.error(`engine-version: git diff ${base} ${head} failed: ${diff.err}`); return 2; }
  const changed = diff.out.split('\n').filter(Boolean);
  const at = rev => { const shown = git(['show', `${rev}:${VERSION_FILE}`]); return shown.ok ? declaredVersion(shown.out) : null; };
  const [from, to] = [at(base), at(head)];
  const problem = versionMoveProblem({changed, base: from, head: to});
  if (problem) { console.error(`engine-version: ${problem}`); return 1; }
  const engine = changed.filter(countsAsEngineChange).length;
  console.log(engine ? `engine-version: engineVersion ${from ?? 'none'} → ${to} with ${engine} engine file${engine === 1 ? '' : 's'} changed`
    : 'engine-version: no change to the engine\'s program');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
