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
//   - each of the six imports by name, and `sharp` resizes an image `pngjs` made while `classic-level` writes and reads a
//     key in the session's temp, which loads each architecture's native code inside the sandbox;
//   - the native files the kernel mapped (/proc/self/maps, which does identify them: `.node` and libvips), each under the
//     module tree, classic-level's, sharp's and libvips among them;
//   - the confinement step (./linux-confinement.mjs) with its positive controls;
//   - end_task, a clean exit, and no run entry left.
// The driver (./linux-runtime.mjs) runs it plain and under `strace -f`, where the kernel must also have opened each
// selected entry (the report's `imports.selected`) and nothing under runtimes/.
//
//   node scripts/accept/linux-browser-only.mjs   JSON report on stdout; exit 0 when every step passes
// It refuses to start on display :0 or with no DISPLAY: every run is on a private display.
import {existsSync, mkdtempSync, readdirSync, realpathSync, rmSync} from 'node:fs';
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
// The tools a browser-only session lists at least.
export const BROWSER_TOOLS = ['js', 'end_task', 'profiles_list'];

const inside = (dir, path) => { const rel = relative(dir, path); return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep); };

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

/** The imports' and the native uses' judge. -> problems. */
export function useProblems(use) {
  if (!use || typeof use !== 'object') return ['the cell reported no imports'];
  const problems = [];
  for (const spec of SPECIFIERS) if (use.imported?.[spec] !== 'ok') problems.push(`${spec} did not import (${use.imported?.[spec] ?? 'not tried'})`);
  for (const what of ['sharp', 'classic-level']) if (use.used?.[what] !== 'ok') problems.push(`${what} did not run (${use.used?.[what] ?? 'not tried'})`);
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
  const report = {fixture: 'linux-browser-only', home, engineSetting: process.env.CUA_NATIVE_ENGINE ?? null, steps};
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
    const usedProblems = used.result?.isError ? [`the cell failed: ${resultText(used).slice(0, 300)}`] : useProblems(use);
    step('each of the six imports by name; sharp resizes a pngjs image and classic-level writes and reads a key in the sandbox', usedProblems.length === 0, {imported: use?.imported ?? null, used: use?.used ?? null, problems: usedProblems});
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
