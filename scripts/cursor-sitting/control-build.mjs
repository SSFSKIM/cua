// #187's control build, the isolating slot's BEFORE half (~/.local/share/187/next-slot-plan.md A1 and its ruling 1;
// the engine's Decision Log entry of 2026-11-05): native/engine/ copied whole into a scratch directory, the copy's
// Package.swift given `swiftSettings: [.define("CUA_CONTROL_NO_INERT_CLICK")]` on its Engine target and nowhere else, and
// the copy built by the unchanged shipping builder: src/cli.mjs's `engine build`, whose buildEngine takes the copy as its
// sourceRoot. Under the condition, activationClickPlan's one inertOutside return becomes `skipped controlBuild` and the
// ping's identity names `variant: control-no-inert-click`; nothing else differs. The build id hashes the copy's
// Package.swift, so the control gets its own id; the shipping Package.swift and builder are untouched, so no release
// can produce it.
//
// The copy is checked before anything builds: every source file byte-identical to the checkout's but Package.swift, and
// Package.swift differing from the shipping one by the one inserted line. Its record (control.json) names both builds.
import {cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join, relative, sep} from 'node:path';
import {ENGINE_SOURCE, engineBuild} from '../../src/runtime/engine-bundle.mjs';

export const CONTROL_DEFINE = 'CUA_CONTROL_NO_INERT_CLICK';
export const CONTROL_VARIANT = 'control-no-inert-click';
export const CONTROL_RECORD = 'control.json';
// Build products and SwiftPM state are not copied (the build's own scratch goes elsewhere).
const NOT_COPIED = new Set(['.build', '.swiftpm', '.DS_Store']);
// The Engine target's head as the shipping Package.swift writes it: its name and path lines, the path line's indent kept.
const ENGINE_TARGET = /(\.executableTarget\(\n\s*name: "Engine",\n(\s*)path: "Sources\/Engine",\n)/g;

// The shipping Package.swift with the define on its Engine target only. Refuses a file that already defines it,
// declares swiftSettings anywhere (the edit assumes none to merge with), or does not hold the Engine target's head
// exactly once. -> the copy's text.
export function controlPackage(text) {
  if (text.includes(CONTROL_DEFINE)) throw new Error(`Package.swift already names ${CONTROL_DEFINE}: the shipping one never does`);
  if (/\bswiftSettings\b/.test(text)) throw new Error('Package.swift declares swiftSettings: the control edit adds the Engine target\'s only one, so change the kit with it');
  const heads = [...text.matchAll(ENGINE_TARGET)];
  if (heads.length !== 1) throw new Error(`Package.swift holds the Engine target's head (name "Engine", path "Sources/Engine") ${heads.length} times, not once`);
  return text.replace(ENGINE_TARGET, (head, _, indent) => `${head}${indent}swiftSettings: [.define("${CONTROL_DEFINE}")],\n`);
}

// Every file under `root` but the ones not copied, as relative paths.
function filesOf(root, dir = root) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    if (NOT_COPIED.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesOf(root, path) : entry.isFile() ? [relative(root, path).split(sep).join('/')] : [];
  }).sort();
}

// The copy made and checked in `scratch` (a new directory): `scratch`/engine/ the source with the control's
// Package.swift, `scratch`/control.json its record. `source`: the checkout's native/engine. -> {copy, shippingBuild,
// controlBuild, record}.
export function prepareControlSource({scratch, source = ENGINE_SOURCE, now = () => new Date()}) {
  if (existsSync(scratch)) throw new Error(`${scratch} already exists; the control build's copy goes to a new directory`);
  const copy = join(scratch, 'engine');
  mkdirSync(scratch, {recursive: true, mode: 0o700});
  cpSync(source, copy, {recursive: true, filter: from => !NOT_COPIED.has(basename(from))});
  const shippingPackage = readFileSync(join(source, 'Package.swift'), 'utf8');
  writeFileSync(join(copy, 'Package.swift'), controlPackage(shippingPackage));
  // Only Package.swift differs, by one line.
  const files = filesOf(source), copied = filesOf(copy);
  if (JSON.stringify(files) !== JSON.stringify(copied)) throw new Error(`the copy in ${copy} does not hold the same files as ${source}`);
  const changed = files.filter(f => !readFileSync(join(source, f)).equals(readFileSync(join(copy, f))));
  if (JSON.stringify(changed) !== JSON.stringify(['Package.swift'])) throw new Error(`the copy differs from the source in ${changed.join(', ') || 'nothing'}, not in Package.swift alone`);
  const added = readFileSync(join(copy, 'Package.swift'), 'utf8').split('\n').filter(line => !shippingPackage.split('\n').includes(line));
  if (added.length !== 1 || !added[0].includes(`.define("${CONTROL_DEFINE}")`)) throw new Error('the copy\'s Package.swift differs from the shipping one by more than the define');
  const shippingBuild = engineBuild({sourceRoot: source}), controlBuild = engineBuild({sourceRoot: copy});
  if (shippingBuild === controlBuild) throw new Error('the control copy has the shipping build id: its Package.swift is not part of the build');
  const record = {preparedAt: now().toISOString(), source, copy, define: CONTROL_DEFINE, variant: CONTROL_VARIANT, added: added[0].trim(), shippingBuild, controlBuild};
  writeFileSync(join(scratch, CONTROL_RECORD), `${JSON.stringify(record, null, 2)}\n`, {mode: 0o600});
  return {copy, shippingBuild, controlBuild, record};
}

// Whether a preparation's record (control.json) is one preparation of this checkout: its shipping build is the
// checkout's own, and its control build is that tree with the one define, both computed again from a fresh copy.
// -> {ok, shippingBuild, controlBuild, source, preparedAt, problem?}.
export function checkPair(record, {source = ENGINE_SOURCE} = {}) {
  const base = {shippingBuild: record?.shippingBuild ?? null, controlBuild: record?.controlBuild ?? null, source: record?.source ?? null, preparedAt: record?.preparedAt ?? null};
  if (!base.shippingBuild || !base.controlBuild) return {ok: false, ...base, problem: `the preparation's record names no ${base.shippingBuild ? 'control' : 'shipping'} build`};
  const dir = mkdtempSync(join(tmpdir(), 'cua-187-pair-'));
  try {
    const now = prepareControlSource({scratch: join(dir, 'control'), source});
    const problem = now.shippingBuild !== base.shippingBuild ? `the preparation's shipping build ${base.shippingBuild.slice(0, 12)} is not this checkout's ${now.shippingBuild.slice(0, 12)} (another source tree)`
      : now.controlBuild !== base.controlBuild ? `the preparation's control build ${base.controlBuild.slice(0, 12)} is not this tree with the define (${now.controlBuild.slice(0, 12)})` : null;
    return {ok: problem === null, ...base, ...(problem ? {problem} : {})};
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

// The control build installed in `home`'s engine directory, pending approval, by the CLI's own `engine build`
// (`cliMain`: src/cli.mjs main) with the copy as buildEngine's sourceRoot and the swift scratch under `scratch`.
// `signWait`: the CLI's --sign-wait. -> {code, copy, shippingBuild, controlBuild}.
export async function buildControl({home, scratch, cliMain, engineDir, signWait = null, source = ENGINE_SOURCE}) {
  const prepared = prepareControlSource({scratch, source});
  const code = await cliMain(['engine', 'build', ...(signWait ? ['--sign-wait', String(signWait)] : [])],
    {dir: engineDir, sourceRoot: prepared.copy, scratchPath: join(scratch, 'swift-build'), env: {...process.env, HOME: home}});
  return {code, ...prepared};
}
