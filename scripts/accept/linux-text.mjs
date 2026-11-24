#!/usr/bin/env node
// The item 6 witness of acceptance 12 (#171 M6a, T6; the M6a pre-flight §5.2, "The item 6 witness", F10): through
// `cua serve` launched from cua's own parts, in `shared` mode, `typeText` of acceptance 6's own string (TEXT,
// scripts/linux-engine-diff/text.mjs: Hangul, a combining acute after e, an emoji beyond the BMP, a newline) into a
// harness gedit. The call must answer success, and the field must hold the string exactly, once, read by the fixture's
// own accessibility reads (scripts/linux-engine-diff/oracle.mjs, busctl on the accessibility bus), never through the
// engine: the field is found under the gedit process's own application, read empty before the call, and read again
// after it settles. This shows text arriving through the real facade from the own parts; the rest of item 6 (Chrome's
// textarea and address bar, the paste safety cases, the bus trace) is credited from M5 (F10).
// (E5's read-only rollback onto the vendor's engine went with that engine in #171 M6b.)
//
//   node scripts/accept/linux-text.mjs   JSON report on stdout; exit 0 when every step passes; any argument is refused (exit 2)
// Its whole GUI footprint is one standalone gedit on an empty file in a directory it creates, ended in `finally`. It
// refuses to start on display :0 or with no DISPLAY: every run is on a private display.
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {findTool} from '../../src/runtime/tools.mjs';
import {pinnedApprovals} from './lib.mjs';
import {cellJson} from './linux-browser-only.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {Oracle} from '../linux-engine-diff/oracle.mjs';
import {TEXT, occurrences} from '../linux-engine-diff/text.mjs';

const chars = text => [...text];

/**
 * The witness's judge: the call answered success (`typed` {ok, error?}), the field read empty before it (`before`) and,
 * after it (`after`), holding `text` exactly, once. Characters are code points, counted from 1. -> problems.
 */
export function textProblems({typed, before, after, text = TEXT}) {
  const problems = [];
  if (typed?.ok !== true) problems.push(`typeText did not answer success${typed?.error ? `: ${typed.error}` : ''}`);
  if (typeof before !== 'string') problems.push('the field was not read before the call');
  else if (before !== '') problems.push(`the field was not empty before the call (${chars(before).length} characters)`);
  if (typeof after !== 'string') { problems.push('the field was not read after the call'); return problems; }
  const count = occurrences(after, text);
  if (count > 1) problems.push(`the field holds the text ${count} times`);
  else if (count === 0) {
    const a = chars(after), t = chars(text);
    let at = 0;
    while (at < a.length && at < t.length && a[at] === t[at]) at++;
    problems.push(`the field does not hold the text: it differs at character ${at + 1} (${a.length} characters read, ${t.length} typed)`);
  } else if (after !== text) problems.push(`the field holds more than the text (${chars(after).length} characters, the text is ${chars(text).length})`);
  return problems;
}

/**
 * The document: the first editable, multi-line text node, breadth first, under the accessibility applications of process
 * `pid`, through the oracle's own reads (`appsOf`, `children`, `role`, `states` {editable, multiLine}); null when there
 * is none within `limit` nodes. A one-line editable text (gedit's search entry, shallower than the document) is not it.
 */
export function findEditableText(oracle, pid, {limit = 5000} = {}) {
  const queue = [...oracle.appsOf(pid)];
  for (let seen = 0; queue.length && seen < limit; seen++) {
    const id = queue.shift();
    try {
      if (oracle.role(id) === 'text') { const states = oracle.states(id); if (states.editable && states.multiLine) return id; }
      queue.push(...oracle.children(id));
    } catch {
      // a node gone meanwhile
    }
  }
  return null;
}

// AT-SPI's state bits the field is chosen by (atspi-constants.h: ATSPI_STATE_EDITABLE 7, ATSPI_STATE_MULTI_LINE 17).
const EDITABLE = 7, MULTI_LINE = 17;

// The oracle on the run's accessibility bus (the root window's AT_SPI_BUS, else the session bus's org.a11y.Bus), its
// states read with the multi-line bit.
function accessibilityOracle() {
  let oracle;
  try { oracle = new Oracle(); } catch {
    const out = execFileSync('busctl', ['--user', '--json=short', 'call', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus', 'GetAddress'], {encoding: 'utf8', timeout: 10_000});
    oracle = Object.assign(Object.create(Oracle.prototype), {address: JSON.parse(out).data[0]});
  }
  oracle.states = id => {
    const [[low]] = oracle.on(id, 'org.a11y.atspi.Accessible', 'GetState');
    return {editable: ((low >>> EDITABLE) & 1) === 1, multiLine: ((low >>> MULTI_LINE) & 1) === 1};
  };
  return oracle;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The fixture takes no argument -> null, or why `argv` is refused. `--read-only` was E5's rollback onto the vendor's
 * engine, which went with that engine (#171 M6b): an old invocation is refused by name, before anything starts, and is
 * never run as the typing witness (fix wave 1).
 */
export function argumentProblem(argv) {
  if (!argv.length) return null;
  if (argv.includes('--read-only')) return 'linux-text.mjs: --read-only (E5\'s read-only rollback onto the vendor\'s engine) was removed in cua 0.30.0 with that engine; this fixture is the item 6 typing witness and takes no argument';
  return `linux-text.mjs takes no argument: ${argv.join(' ')}`;
}

async function main() {
  const refused = argumentProblem(process.argv.slice(2));
  if (refused) {
    console.error(refused);
    process.exitCode = 2;
    return;
  }
  const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
  const home = process.env.CUA_HOME ?? defaultHome();
  const runEntries = () => (existsSync(join(home, 'run')) ? readdirSync(join(home, 'run')).sort() : []);
  const steps = [];
  const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
  const report = {fixture: 'linux-text', home, engineSetting: process.env.CUA_NATIVE_ENGINE ?? null, desktop: 'shared', steps};
  const dir = mkdtempSync(join(tmpdir(), 'cua-linux-text-'));
  const file = join(dir, `witness-${randomBytes(3).toString('hex')}.txt`);
  let gedit = null;
  let session = null;
  const pinned = new Set();
  const asked = [];
  try {
    const display = process.env.DISPLAY ?? '';
    const geditPath = findTool('gedit', process.env.PATH);
    if (!step('preconditions: Linux, a private display, gedit', process.platform === 'linux' && /^:\d+/.test(display) && !/^:0(\.\d+)?$/.test(display) && !!geditPath,
      {display, gedit: geditPath ?? null})) throw new Error('preconditions');
    writeFileSync(file, '');
    gedit = spawn(geditPath, ['--standalone', file], {detached: true, stdio: 'ignore'});
    const runBefore = runEntries();
    const env = {...process.env, CUA_SHIM_PERSIST: 'session', CUA_DESKTOP_MODE: 'shared'};
    session = openSession({args: [CLI, 'serve'], env, clientName: 'cua-linux-text', onServerRequest: pinnedApprovals(() => pinned, asked)});
    await session.initialize();

    // The fixture's own window, by its title, from the window list (which asks nothing); its app is the one approval
    // the fixture accepts.
    const find = await session.js(`const deadline = Date.now() + 30000; let win;
      while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => (w.title ?? '').includes(${JSON.stringify(basename(file))})); if (!win) await new Promise(r => setTimeout(r, 500)); }
      if (!win) throw new Error('the fixture window did not appear');
      globalThis.fixtureWindow = win; nodeRepl.write(JSON.stringify({window: {id: win.id, app: win.app}}));`, 90_000);
    const window = cellJson(resultText(find), 'window');
    if (typeof window?.app === 'string' && window.app) pinned.add(window.app);
    const bind = window && await session.js(`globalThis.fixtureApp = await cua.getApp({windowId: fixtureWindow.id});
      const tree = await fixtureApp.getAXState({emit: false, disableDiffing: true});
      nodeRepl.write(JSON.stringify({bound: {source: /Accessibility source: (\\S+)/.exec(tree)?.[1] ?? null, lines: tree.split('\\n').length}}));`, 90_000);
    const bound = bind ? cellJson(resultText(bind), 'bound') : null;
    if (!step('bind the harness gedit by X11 id', !find.result?.isError && pinned.size === 1 && !bind?.result?.isError && bound?.source === 'at_spi',
      bound ?? {window: window ?? null, error: resultText(bind ?? find).slice(0, 300)})) throw new Error('bind');

    // Through the fixture's own reads only: the field of the gedit process's own application.
    const oracle = accessibilityOracle();
    let field = null;
    for (const deadline = Date.now() + 30_000; !field && Date.now() < deadline;) { field = findEditableText(oracle, gedit.pid); if (!field) await sleep(500); }
    const read = () => { try { return field ? oracle.text(field) : null; } catch { return null; } };
    const before = read();
    step('the field is found and read through the fixture\'s own accessibility reads', !!field && typeof before === 'string', {found: !!field, before: before === null ? null : chars(before).length});
    const typing = await session.js(`const answer = await fixtureApp.typeText(${JSON.stringify(TEXT)}); nodeRepl.write(JSON.stringify({typed: {ok: true, answer: answer === undefined ? null : answer}}));`, 90_000);
    const typed = typing.result?.isError ? {ok: false, error: resultText(typing).split('\n').find(Boolean)?.slice(0, 300) ?? 'the cell failed'} : cellJson(resultText(typing), 'typed');
    // The field after the answer, and again once a second has passed: a late second paste is read too.
    const first = read();
    await sleep(1000);
    const after = read();
    const problems = textProblems({typed, before, after});
    report.text = {typed, after: after === null ? null : {characters: chars(after).length, occurrences: occurrences(after, TEXT), exact: after === TEXT}, settled: first === after};
    step('typeText answers success, and the field holds acceptance 6\'s string exactly, once', problems.length === 0, {problems});

    const ended = await session.call('end_task');
    step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
    const approvals = asked.filter(a => a.method === 'elicitation/create');
    step('approvals: the harness gedit\'s app asked once and accepted, nothing else asked', approvals.length === 1 && approvals[0].action === 'accept' && pinned.has(approvals[0].app),
      {asked: approvals.length, otherRequests: asked.length - approvals.length});
    const exit = await session.terminate();
    session = null;
    step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
    step('no run entry left for the connection', JSON.stringify(runEntries()) === JSON.stringify(runBefore), {before: runBefore, after: runEntries()});
  } catch (error) {
    if (!steps.some(s => s.status === 'FAIL')) step('fixture', false, error.message);
  } finally {
    if (session) await session.terminate();
    if (gedit?.pid) try { process.kill(gedit.pid, 'SIGTERM'); } catch {}
    rmSync(dir, {recursive: true, force: true});
  }
  report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
