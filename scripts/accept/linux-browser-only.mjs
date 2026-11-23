#!/usr/bin/env node
// The browser-only session of acceptance 12 (#171 M6a, T6; the M6a pre-flight §5.2, "The browser-only session", F7):
// over `cua serve` with CUA_SHIM_SURFACES=browser, launched from cua's own parts, in the environment
// linux-runtime-env.sh makes. No tab: M6a changes what a browser-only launch resolves and imports, not the browser route.
//   - the handshake and the tool list;
//   - the browser service answers: a cell's `cua.listBrowsers({emit: false})` gives a list, empty or not (the liveness
//     call; profiles_list returns before any listing when no profile is ready);
//   - where each of the six packages is selected: the cell makes the kernel's own call for each specifier
//     (src/repl-host/kernel.mjs: `createRequire(<base>/__node_repl__.cjs).resolve(spec, {conditions: node, import})`
//     over the base it reads from its own environment, CUA_REPL_NODE_MODULE_DIRS), and each must be the entry ENTRIES
//     names under the resolved module tree. `import.meta.resolve` gives back the specifier for a package, so it shows
//     nothing; a CommonJS dependency or a mapped library does not identify its entry, so the entry is witnessed itself;
//   - the six imports by name (the coordinator's ruling on F7, task 152): pixelmatch, pngjs, jpeg-js and classic-level
//     must import; the kernel's loader refuses playwright and sharp by name under the cua before M6a too, from
//     identical entry files, so their by-name outcome must equal the older cua's (`--baseline <file>`, its `imported`
//     map, which the driver takes from a browser-only session of that cua): the same refusal, the same message once paths
//     are set aside; any new difference, a new success included, fails. `sharp` then runs through `require` from the same
//     base and resizes an image `pngjs` made, while `classic-level` writes and reads a key in the session's temp, which
//     loads each architecture's native code inside the sandbox;
//   - the native files the kernel mapped (/proc/self/maps, which does identify them: `.node` and libvips), each under the
//     module tree, classic-level's, sharp's and libvips among them;
//   - the confinement step (./linux-confinement.mjs) with its positive controls;
//   - end_task, a clean exit, and no run entry left.
// The driver (./linux-runtime.mjs) runs it plain and under `strace -f`, where the kernel must also have opened each
// selected entry (the report's `imports.selected`) and nothing under runtimes/.
//
//   node scripts/accept/linux-browser-only.mjs --baseline <file>   JSON report on stdout; exit 0 when every step passes
// It refuses to start on display :0 or with no DISPLAY: every run is on a private display.
import {existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {helperFor} from '../../src/sandbox/linux.mjs';
import {confinementStep} from './linux-confinement.mjs';
import {openSession, resultText} from './mcp-session.mjs';

/** The six packages cells import, and the entry each must resolve to under the kernel's conditions (node, import). */
export const ENTRIES = Object.freeze({
  playwright: 'playwright/index.mjs',
  sharp: 'sharp/dist/index.mjs',
  pixelmatch: 'pixelmatch/index.js',
  pngjs: 'pngjs/lib/png.js',
  'jpeg-js': 'jpeg-js/index.js',
  'classic-level': 'classic-level/index.js',
});
export const SPECIFIERS = Object.keys(ENTRIES);
// Judged by name; and compared, by name, with the cua before M6a's outcome (its loader refuses them as this one does).
export const BY_NAME = ['pixelmatch', 'pngjs', 'jpeg-js', 'classic-level'];
export const COMPARED = ['playwright', 'sharp'];
// The tools a browser-only session lists at least.
export const BROWSER_TOOLS = ['js', 'end_task', 'profiles_list'];

const inside = (dir, path) => typeof dir === 'string' && within(dir, path);
const within = (dir, path) => { const rel = relative(dir, path); return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep); };

/**
 * The cell that makes the kernel's own resolution for each of `specifiers`: the bases from CUA_REPL_NODE_MODULE_DIRS as
 * the kernel normalizes them (a trailing node_modules dropped), `createRequire(<base>/__node_repl__.cjs).resolve` with the
 * kernel's conditions, the first base that resolves winning. A cell has no `process`, so the environment is read from
 * /proc/self/environ. One line of JSON: `{selection: {bases, selected: {spec: path | null}}}`.
 */
export const selectionCell = specifiers => `const fs = await import('node:fs'), path = await import('node:path'), {createRequire} = await import('node:module');
  const env = Object.fromEntries(fs.readFileSync('/proc/self/environ', 'utf8').split('\\0').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const bases = (env.CUA_REPL_NODE_MODULE_DIRS ?? '').split(':').map(e => e.trim()).filter(e => path.isAbsolute(e)).map(e => (path.basename(e) === 'node_modules' ? path.dirname(e) : e));
  const selected = {};
  for (const spec of ${JSON.stringify(specifiers)}) {
    selected[spec] = null;
    for (const base of bases) { try { selected[spec] = createRequire(path.join(base, '__node_repl__.cjs')).resolve(spec, {conditions: new Set(['node', 'import'])}); break; } catch {} }
  }
  nodeRepl.write(JSON.stringify({selection: {bases, selected}}));`;

/**
 * The cell that imports each package by name, runs sharp and classic-level natively in the sandbox, and lists the
 * native files its process mapped. One line of JSON: `{use: {imported: {spec: 'ok' | why}, used: {sharp, 'classic-level'},
 * via: {sharp, 'classic-level'}: 'import' | 'require', natives}}`. A refused import still fails the imports' judge.
 */
export const useCell = () => `const fs = await import('node:fs'), path = await import('node:path'), {createRequire} = await import('node:module');
  const env = Object.fromEntries(fs.readFileSync('/proc/self/environ', 'utf8').split('\\0').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const why = e => String(e?.code ?? e?.message ?? e).slice(0, 300);
  const out = {imported: {}, used: {}, via: {}};
  const mods = {};
  for (const spec of ${JSON.stringify(SPECIFIERS)}) { try { mods[spec] = await import(spec); out.imported[spec] = 'ok'; } catch (e) { out.imported[spec] = why(e); } }
  const pick = (m, name) => m?.[name] ?? m?.default?.[name];
  // A package the kernel's loader refused by name is still loaded for its native use, by require from the same base, so
  // the mapped natives say where its code came from whatever the import said; \`via\` records which.
  const base = (env.CUA_REPL_NODE_MODULE_DIRS ?? '').split(':').filter(e => path.isAbsolute(e)).map(e => (path.basename(e) === 'node_modules' ? path.dirname(e) : e))[0];
  const load = spec => { if (mods[spec]) { out.via[spec] = 'import'; return mods[spec]; } out.via[spec] = 'require'; return createRequire(path.join(base, '__node_repl__.cjs'))(spec); };
  // playwright through require from the kernel's base, as cua's own code loads it (ruling 1162), whatever the import
  // said; the require cache then names the files it loaded, its entry and playwright-core's among them.
  try {
    const pw = createRequire(path.join(base, '__node_repl__.cjs'))('playwright');
    out.via.playwright = 'require';
    out.used.playwright = typeof pw?.chromium?.launch === 'function' ? 'ok' : 'no chromium.launch on what it loaded';
  } catch (e) { out.via.playwright = 'require'; out.used.playwright = why(e); }
  try {
    const files = Object.keys(createRequire(path.join(base, '__node_repl__.cjs')).cache).filter(f => /\\/node_modules\\/playwright(-core)?\\//.test(f));
    const inside = f => f.startsWith(path.join(base, 'node_modules') + '/');
    out.loaded = {playwright: {entry: files.find(f => /\\/node_modules\\/playwright\\/index\\.js$/.test(f)) ?? null, core: files.find(f => /\\/node_modules\\/playwright-core\\/index\\.js$/.test(f)) ?? null,
      files: files.length, outside: files.filter(f => !inside(f)).slice(0, 5)}};
  } catch (e) { out.loaded = {playwright: null, error: why(e)}; }
  try {
    const PNG = pick(mods.pngjs, 'PNG'), sharpModule = load('sharp'), sharp = sharpModule?.default ?? sharpModule;
    const png = new PNG({width: 4, height: 4}); png.data.fill(200);
    const resized = await sharp(PNG.sync.write(png)).resize(2, 2).png().toBuffer();
    const meta = await sharp(resized).metadata();
    out.used.sharp = meta.width === 2 && meta.height === 2 ? 'ok' : 'resized to ' + meta.width + 'x' + meta.height;
  } catch (e) { out.used.sharp = why(e); }
  try {
    const ClassicLevel = pick(load('classic-level'), 'ClassicLevel');
    const db = new ClassicLevel(path.join(env.TMPDIR, 'cua-m6a-level'), {valueEncoding: 'utf8'});
    await db.open(); await db.put('m6a', 'written in the sandbox'); const value = await db.get('m6a'); await db.close();
    out.used['classic-level'] = value === 'written in the sandbox' ? 'ok' : 'read back ' + JSON.stringify(value);
  } catch (e) { out.used['classic-level'] = why(e); }
  out.natives = [...new Set(fs.readFileSync('/proc/self/maps', 'utf8').split('\\n').map(l => l.trim().split(/\\s+/).slice(5).join(' '))
    .filter(p => p.startsWith('/') && (/\\.node$/.test(p) || /libvips/.test(p))))];
  nodeRepl.write(JSON.stringify({use: out}));`;

/** The JSON a cell wrote on its own line, keyed by `key`; null when absent or malformed. */
export function cellJson(text, key) {
  const line = new RegExp(`^\\{"${key}":.*\\}$`, 'm').exec(text ?? '')?.[0];
  try { return line ? JSON.parse(line)[key] ?? null : null; } catch { return null; }
}

/** The tool list's judge: every name of BROWSER_TOOLS listed. -> problems. */
export function toolsProblems(names) {
  if (!Array.isArray(names)) return ['tools/list gave no list'];
  return BROWSER_TOOLS.filter(name => !names.includes(name)).map(name => `the tool list lacks ${name}`);
}

/**
 * The selection's judge: each specifier selected, and its path the entry ENTRIES names under `moduleDir` (compared by
 * real path; `real` a seam). -> problems.
 */
export function selectionProblems({selected, moduleDir, specifiers = SPECIFIERS, real = realpathSync}) {
  if (!selected || typeof selected !== 'object') return ['the cell reported no selection'];
  const canonical = path => { try { return real(path); } catch { return path; } };
  const problems = [];
  for (const spec of specifiers) {
    const path = selected[spec];
    const expected = join(moduleDir, ENTRIES[spec]);
    if (typeof path !== 'string') problems.push(`${spec} was not selected from any base`);
    else if (canonical(path) !== canonical(expected)) problems.push(`${spec} selected ${path}, not ${expected}`);
  }
  return problems;
}

// An import's outcome as compared across the two cuas: 'ok', or its message with every absolute path set aside (the
// two trees lie in different places).
const outcomeClass = outcome => (typeof outcome === 'string' ? outcome.replace(/\/[^\s"'`]+/g, '<path>') : null);

/** COMPARED's by-name outcomes here and under the older cua (`older`, its `imported` map): `{spec: {here, older, same}}`. */
export function importComparison(use, older) {
  return Object.fromEntries(COMPARED.map(spec => {
    const here = use?.imported?.[spec] ?? null, then = older?.[spec] ?? null;
    return [spec, {here, older: then, same: here !== null && then !== null && outcomeClass(here) === outcomeClass(then)}];
  }));
}

/**
 * The imports' and the native uses' judge, `older` the cua before M6a's by-name outcomes and `root` the module tree:
 * BY_NAME import; COMPARED's outcomes equal the older cua's; playwright loads through require, its entry and
 * playwright-core's (and every file of either the require cache holds) from the tree (ruling 1162); sharp runs, through
 * require; classic-level runs. -> problems.
 */
export function useProblems(use, {older, root} = {}) {
  if (!use || typeof use !== 'object') return ['the cell reported no imports'];
  const problems = [];
  for (const spec of BY_NAME) if (use.imported?.[spec] !== 'ok') problems.push(`${spec} did not import (${use.imported?.[spec] ?? 'not tried'})`);
  // Criterion (c): the kernel refuses these two by name today (#531); once it lands they import by name, and this
  // comparison becomes a plain by-name pass again.
  for (const [spec, {here, older: then, same}] of Object.entries(importComparison(use, older))) {
    if (then === null) problems.push(`no outcome of the cua before M6a to compare ${spec}'s import with`);
    else if (!same) problems.push(`${spec}'s import by name differs from the cua before M6a's: ${JSON.stringify(here)} here, ${JSON.stringify(then)} there`);
  }
  for (const what of ['playwright', 'sharp', 'classic-level']) if (use.used?.[what] !== 'ok') problems.push(`${what} did not run (${use.used?.[what] ?? 'not tried'})`);
  for (const what of ['playwright', 'sharp']) if (use.used?.[what] === 'ok' && use.via?.[what] !== 'require') problems.push(`${what} did not run through require (${use.via?.[what] ?? 'unrecorded'})`);
  const pw = use.loaded?.playwright;
  for (const [what, path] of [['playwright\'s entry', pw?.entry], ['playwright-core\'s entry', pw?.core]]) {
    if (typeof path !== 'string') problems.push(`${what} was not loaded`);
    else if (!inside(root, path)) problems.push(`${what} was loaded from ${path}, not the module tree ${root}`);
  }
  if (pw?.outside?.length) problems.push(`${pw.outside.length} file${pw.outside.length === 1 ? '' : 's'} of playwright loaded from outside the module tree (${pw.outside[0]})`);
  return problems;
}

// The native files the six packages map when they load: classic-level's addon, sharp's addon and libvips.
const NATIVE_KINDS = [
  ['classic-level\'s addon', path => /\/classic-level\/.*\.node$/.test(path)],
  ['sharp\'s addon', path => /\/@img\/sharp-linux-[^/]+\/.*\.node$/.test(path)],
  ['libvips', path => /\/@img\/sharp-libvips-linux-[^/]+\/.*libvips/.test(path)],
];

/** The mapped natives' judge: each under `root` (the module tree), and each kind among them. -> problems. */
export function nativesProblems({natives, root}) {
  if (!Array.isArray(natives)) return ['the cell reported no mapped files'];
  const problems = natives.filter(path => !inside(root, path)).map(path => `${path} is mapped from outside the module tree ${root}`);
  for (const [what, is] of NATIVE_KINDS) if (!natives.some(path => is(path) && inside(root, path))) problems.push(`${what} is not mapped from the module tree ${root}`);
  return problems;
}

// --- the run ---------------------------------------------------------------------------------------------------------

async function main() {
  const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
  const home = process.env.CUA_HOME ?? defaultHome();
  const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
  const steps = [];
  const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
  const baseline = process.argv.includes('--baseline') ? process.argv[process.argv.indexOf('--baseline') + 1] : null;
  let older = null;
  try { older = baseline ? JSON.parse(readFileSync(baseline, 'utf8')) : null; } catch { older = null; }
  const report = {fixture: 'linux-browser-only', home, engineSetting: process.env.CUA_NATIVE_ENGINE ?? null, baseline, steps};
  const dir = mkdtempSync(join(tmpdir(), 'cua-browser-only-'));
  let session = null;
  try {
    const display = process.env.DISPLAY ?? '';
    if (!step('preconditions: Linux, a private display', process.platform === 'linux' && /^:\d+/.test(display) && !/^:0(\.\d+)?$/.test(display), {display})) throw new Error('preconditions');
    const runtime = resolveRuntime({home});
    report.moduleRoot = runtime.root;
    const runBefore = runEntries();
    session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-linux-browser-only'});
    const init = await session.initialize();
    const listed = await session.request('tools/list', {});
    const names = listed.result?.tools?.map(t => t.name) ?? null;
    const tools = toolsProblems(names);
    step('the handshake and the tool list', !!init && tools.length === 0, {server: init?.serverInfo?.name ?? null, tools: names, problems: tools});

    const live = await session.js(`const list = await cua.listBrowsers({emit: false}); nodeRepl.write(JSON.stringify({browsers: Array.isArray(list) ? list.length : null}));`, 60_000);
    const browsers = cellJson(resultText(live), 'browsers');
    step('the browser service answers: cua.listBrowsers gives a list', !live.result?.isError && Number.isInteger(browsers), {listed: browsers, ...(live.result?.isError ? {error: resultText(live).slice(0, 300)} : {})});

    const chosen = await session.js(selectionCell(SPECIFIERS), 60_000);
    const selection = cellJson(resultText(chosen), 'selection');
    report.imports = {bases: selection?.bases ?? null, selected: selection?.selected ?? null};
    const selectedProblems = chosen.result?.isError ? [`the cell failed: ${resultText(chosen).slice(0, 300)}`] : selectionProblems({selected: selection?.selected, moduleDir: runtime.paths.moduleDir});
    step('the kernel\'s resolver selects each of the six entries in the module tree', selectedProblems.length === 0, {problems: selectedProblems});

    const used = await session.js(useCell(), 180_000);
    const use = cellJson(resultText(used), 'use');
    report.imports.natives = use?.natives ?? null;
    report.imports.loaded = use?.loaded ?? null;
    report.imports.comparison = importComparison(use, older);
    const usedProblems = used.result?.isError ? [`the cell failed: ${resultText(used).slice(0, 300)}`] : useProblems(use, {older, root: runtime.root});
    step('pixelmatch, pngjs, jpeg-js and classic-level import by name, playwright and sharp as under the cua before M6a; sharp (through require) resizes a pngjs image and classic-level writes and reads a key in the sandbox',
      usedProblems.length === 0, {imported: use?.imported ?? null, comparison: report.imports.comparison, used: use?.used ?? null, via: use?.via ?? null, loaded: use?.loaded ?? null, problems: usedProblems});
    const mapped = nativesProblems({natives: use?.natives, root: runtime.root});
    step('the native files mapped are the module tree\'s: classic-level\'s, sharp\'s and libvips', mapped.length === 0, {mapped: use?.natives?.length ?? null, problems: mapped});

    const helper = helperFor({home, arch: process.arch}).path;
    report.confinement = await confinementStep({session, env: process.env, dir, helper: existsSync(helper) ? realpathSync(helper) : helper, resultText});
    step('the kernel connects to nothing: the controls reach the X server, the bus and two listeners, the kernel is refused on each, under the pinned helper',
      report.confinement.verdict.pass, report.confinement.verdict.problems);

    const ended = await session.call('end_task');
    step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
    const exit = await session.terminate();
    session = null;
    step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
    step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});
  } catch (error) {
    if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
  } finally {
    if (session) await session.terminate();
    rmSync(dir, {recursive: true, force: true});
  }
  report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
