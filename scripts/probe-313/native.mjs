// #313's hosted A/B, the native cells: on one engine head (--engine), an element click by token on native text entry in
// a background app, then type_text of a marker where it is harmless.
//   app/<desktop>/<field|search|combo|notes>   Probe313.app (app.swift) behind a frontmost TextEdit, shared and
//                     dedicated: an NSTextField, an NSSearchField, an editable NSComboBox, an NSTextView; the focus
//                     starts on a button; the app's log says where the first responder went and what text changed
//   textedit/shared/text   TextEdit's document text area, behind a frontmost Probe313.app
//   finder/shared/rename   Finder's rename field (a file selected, Return), behind a frontmost TextEdit
//   finder/shared/search   a Finder window's search field, if its tree shows one
//   settings/shared/search System Settings' search field, behind a frontmost TextEdit
// Each records the node's action names (whether its record advertises AXPress, which is what sends it to the action and
// so to the read-back), the answer and its elementClick record, the app's focused element after (ax.swift focus).
//
//   node scripts/probe-313/native.mjs --engine <cua-engine> --ax <ax> --app <Probe313 binary> --out <dir> [--cells <prefix,…>]
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {firefoxProfile, FIREFOX, placePid} from '../probe-287/browser.mjs';
import {sleep, sh, osa, fileName, frontmost, lean, centre, startEngine, stopEngine, frontTextEdit, axTool, answer, config, writeResults} from './lib.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-313 native: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax'), APP = arg('app');
const ONLY = arg('cells')?.split(',');
if (!OUT || !ENGINE || !AX || !APP) { console.error('usage: native.mjs --engine <bin> --ax <bin> --app <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const ax = axTool(AX);
const log = (...a) => console.log('probe-313 native:', ...a);
const MARK = 'QZ';
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const label = n => `${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''} ${n.identifier ?? ''} ${n.placeholder ?? ''}`;

async function launchProbeApp(tag) {
  const logPath = join(OUT, `app-${fileName(tag)}.jsonl`);
  const child = spawn(APP, [logPath], {stdio: 'ignore'});
  for (let i = 0; i < 80; i++) { await sleep(250); try { if (readFileSync(logPath, 'utf8').includes('"ready"')) break; } catch {} }
  await sleep(800);
  return {child, pid: child.pid, logPath, events: () => { try { return readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } }};
}

const APP_TARGETS = {
  field: n => n.role === 'AXTextField' && !/search/i.test(n.subrole ?? '') && /alpha bravo/.test(String(n.value ?? '')),
  search: n => n.role === 'AXTextField' && /search/i.test(n.subrole ?? '') || n.role === 'AXSearchField',
  combo: n => n.role === 'AXComboBox',
  notes: n => n.role === 'AXTextArea',
};
const CELLS = [];
for (const desktop of ['shared', 'dedicated']) for (const t of Object.keys(APP_TARGETS)) CELLS.push({label: `app/${desktop}/${t}`, kind: 'app', desktop, target: t});
CELLS.push({label: 'textedit/shared/text', kind: 'textedit', desktop: 'shared'});
CELLS.push({label: 'finder/shared/rename', kind: 'finder-rename', desktop: 'shared'});
CELLS.push({label: 'finder/shared/search', kind: 'finder-search', desktop: 'shared'});
CELLS.push({label: 'settings/shared/search', kind: 'settings', desktop: 'shared'});
// The follow-up (run 42402098567 reached neither Finder field, and no native field advertised AXPress): Finder's rename
// field with Finder in front (its field ends when Finder resigns); a Finder window's search, expanded first by an
// element click on its toolbar button; Safari's and Firefox's own address fields (text entry outside any web area).
CELLS.push({label: 'x/finder/front/rename', kind: 'finder-rename', desktop: 'shared', finderFront: true});
CELLS.push({label: 'x/finder/shared/search-expanded', kind: 'finder-search', desktop: 'shared', expand: true});
CELLS.push({label: 'x/safari/shared/address', kind: 'safari-address', desktop: 'shared'});
CELLS.push({label: 'x/safari/dedicated/address', kind: 'safari-address', desktop: 'dedicated'});
CELLS.push({label: 'x/firefox/shared/address', kind: 'firefox-address', desktop: 'shared'});
CELLS.push({label: 'x/firefox/dedicated/address', kind: 'firefox-address', desktop: 'dedicated'});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

// The target app and its node for a cell: {pid, find, type (whether type_text is harmless), events?, cleanup}.
async function setUp(spec, row) {
  if (spec.kind === 'app') {
    const app = await launchProbeApp(spec.label);
    row.textEdit = await frontTextEdit(TEXT_DOC);
    return {pid: app.pid, find: APP_TARGETS[spec.target], type: true, events: app.events,
      cleanup: async () => { app.child.kill('SIGTERM'); await sleep(500); if (app.child.exitCode === null) app.child.kill('SIGKILL'); }};
  }
  if (spec.kind === 'textedit') {
    // TextEdit's own document as the target, the probe app in front of it.
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(2000);
    osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {400, 40}\nset size of window 1 to {500, 400}\nend tell\nend tell');
    const front = await launchProbeApp(spec.label);
    osa('tell application "System Events"\ntell (first process whose unix id is ' + front.pid + ')\nset frontmost to true\nset position of window 1 to {0, 40}\nend tell\nend tell');
    await sleep(800);
    row.front = frontmost();
    return {pid: pidOf('TextEdit'), find: n => n.role === 'AXTextArea', type: true,
      cleanup: async () => { front.child.kill('SIGTERM'); await sleep(500); }};
  }
  if (spec.kind === 'finder-rename' || spec.kind === 'finder-search') {
    const dir = join(OUT, `finder-${spec.kind}`);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'probe313 rename.txt'), 'x\n');
    sh('open', [dir]);
    await sleep(2500);
    osa('tell application "Finder" to set bounds of front window to {400, 40, 1010, 500}');
    if (spec.kind === 'finder-rename') {
      row.select = osa(`tell application "Finder"\nactivate\nselect (POSIX file "${join(dir, 'probe313 rename.txt')}" as alias)\nend tell`);
      await sleep(800);
      row.rename = osa('tell application "System Events" to tell process "Finder" to key code 36');
      await sleep(1200);
    }
    if (spec.finderFront) row.front = frontmost(); else row.textEdit = await frontTextEdit(TEXT_DOC);
    const find = spec.kind === 'finder-rename'
      ? n => n.role === 'AXTextField' && /probe313/.test(String(n.value ?? ''))
      : n => n.role === 'AXSearchField' || (n.role === 'AXTextField' && /search/i.test(`${n.subrole ?? ''} ${label(n)}`));
    return {pid: pidOf('Finder'), find, type: spec.kind === 'finder-search',
      expand: spec.expand ? n => n.role === 'AXButton' && /search/i.test(`${n.subrole ?? ''} ${label(n)}`) : null,
      cleanup: async () => { osa('tell application "System Events" to tell process "Finder" to key code 53'); osa('tell application "Finder" to close every window'); await sleep(500); }};
  }
  if (spec.kind === 'safari-address' || spec.kind === 'firefox-address') {
    // A loaded local page (no field of its own), so the focus is on the page, not on the address field.
    const page = join(OUT, 'blank.html');
    writeFileSync(page, '<!doctype html><title>probe313 blank</title><p>probe313 blank page</p>\n');
    const frame = {x: 400, y: 30, w: 620, h: 600};
    let pid, child = null;
    if (spec.kind === 'safari-address') {
      sh('pkill', ['-x', 'Safari']);
      await sleep(1500);
      sh('open', ['-a', 'Safari', `file://${page}`]);
      for (let i = 0; i < 80 && !pid; i++) { await sleep(250); pid = pidOf('Safari'); }
    } else {
      const profile = firefoxProfile(join(OUT, `ff-${fileName(spec.label)}`));
      child = spawn(FIREFOX, ['-profile', profile, '-no-remote', '-new-instance', `file://${page}`], {stdio: 'ignore'});
      pid = child.pid;
    }
    for (let i = 0; i < 40 && placePid(pid, frame) !== 0; i++) await sleep(250);
    await sleep(3000);
    row.textEdit = await frontTextEdit(TEXT_DOC);
    return {pid, find: n => ['AXTextField', 'AXComboBox', 'AXSearchField'].includes(n.role) && n.frame && n.frame.y < 140, type: true,
      cleanup: async () => { if (child) { child.kill('SIGTERM'); await sleep(1500); if (child.exitCode === null) child.kill('SIGKILL'); } else sh('pkill', ['-x', 'Safari']); await sleep(1000); }};
  }
  if (spec.kind === 'settings') {
    sh('open', ['-a', 'System Settings']);
    let pid = null;
    for (let i = 0; i < 60 && !pid; i++) { await sleep(250); pid = pidOf('System Settings'); }
    await sleep(4000);
    osa(`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {400, 40}\nend tell\nend tell`);
    row.textEdit = await frontTextEdit(TEXT_DOC);
    return {pid, find: n => n.role === 'AXSearchField' || (n.role === 'AXTextField' && /search/i.test(`${n.subrole ?? ''} ${label(n)}`)), type: true,
      cleanup: async () => { sh('pkill', ['-x', 'System Settings']); await sleep(1000); }};
  }
  throw new Error(`kind ${spec.kind}`);
}

async function cell(spec) {
  const row = {label: spec.label, desktop: spec.desktop};
  let target, engine;
  try {
    target = await setUp(spec, row);
    row.pid = target.pid;
    if (!row.pid) { row.problem = 'no target process'; return row; }
    engine = await startEngine(ENGINE, join(OUT, 's'), spec.label);
    const w = engine.wire;
    row.ping = (await w.call('ping', spec.desktop === 'dedicated' ? {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'} : {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const state = await w.execute('get_app_state', {pid: target.pid});
    const observedAt = Date.now();
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    let sky = state.result;
    writeFileSync(join(OUT, `skyshot-${fileName(spec.label)}.json`), JSON.stringify(sky, null, 1));
    row.window = sky.window;
    if (target.expand) {
      // The field shows only once its toolbar button is clicked: that click by token first, then a new observation.
      const button = sky.nodes.find(target.expand);
      if (!button) { row.problem = 'no button to expand'; return row; }
      row.expandNode = {role: button.role, subrole: button.subrole, title: button.title, actions: button.actions};
      row.expand = answer(await w.execute('click', {pid: target.pid, element: button.token}, {lineage: sky.lineage}));
      await sleep(1500);
      const again = await w.execute('get_app_state', {pid: target.pid});
      if (again.error) { row.problem = {getAppStateAfterExpand: again.error}; return row; }
      sky = again.result;
      writeFileSync(join(OUT, `skyshot-${fileName(spec.label)}-expanded.json`), JSON.stringify(sky, null, 1));
    }
    const node = sky.nodes.find(target.find);
    if (!node?.frame) {
      row.problem = 'no target node with a frame';
      row.textNodes = sky.nodes.filter(n => /Text|Search|Combo/.test(n.role)).slice(0, 20).map(n => ({role: n.role, subrole: n.subrole, title: n.title, description: n.description, value: n.value, actions: n.actions}));
      return row;
    }
    row.targetNode = {role: node.role, subrole: node.subrole, title: node.title, description: node.description, actions: node.actions, frame: node.frame,
      advertisesPress: (node.actions ?? []).includes('AXPress'), advertisesPick: (node.actions ?? []).includes('AXPick')};
    const p = centre(node.frame);
    row.axBefore = ax.at(target.pid, p);
    const wait = observedAt + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    row.frontBefore = frontmost();
    const eventsBefore = target.events?.().length ?? 0;
    const started = Date.now();
    const click = await w.execute('click', {pid: target.pid, element: node.token}, {lineage: sky.lineage});
    row.clickMs = Date.now() - started;
    row.click = lean(click);
    row.answer = answer(click);
    row.axAfter = ax.at(target.pid, p);
    await sleep(1500);
    row.frontAfter = frontmost();
    row.focusAfter = ax.focus(target.pid);
    if (target.events) row.appEvents = target.events().slice(eventsBefore);
    if (target.type) {
      const typed = await w.execute('type_text', {pid: target.pid, text: MARK});
      row.typed = {answer: answer(typed)};
      await sleep(1200);
      row.typed.focus = ax.focus(target.pid);
      if (target.events) row.typed.appEvents = target.events().slice(eventsBefore).filter(e => e.ev === 'text');
      row.typed.frontAfter = frontmost();
    }
    sh('screencapture', ['-x', join(OUT, `screen-${fileName(spec.label)}.png`)]);
    const later = await w.execute('get_app_state', {pid: target.pid});
    const f = later.result?.nodes?.find(n => n.token === later.result.focused);
    row.focusedAfter = f ? {role: f.role, subrole: f.subrole, title: f.title, value: typeof f.value === 'string' ? f.value.slice(0, 80) : f.value} : (later.error ?? later.result?.focused ?? null);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    row.engineStderr = await stopEngine(engine);
    try { await target?.cleanup(); } catch {}
    await sleep(1000);
  }
  return row;
}

const cfg = config({engine: ENGINE});
log('config', JSON.stringify(cfg));
const rows = [];
for (const spec of RUN) {
  const row = await cell(spec);
  rows.push(row);
  writeResults(OUT, cfg, rows);
  const a = row.answer ?? {};
  log(`${row.label}: ${a.answer ?? 'no click'} route=${a.route} elementClick=${JSON.stringify(a.elementClick)} actions=${JSON.stringify(row.targetNode?.actions)} front ${row.frontBefore} -> ${row.frontAfter}`);
  log(`${row.label}: axBefore focused=${row.axBefore?.focusedValue} settable=${row.axBefore?.focusedSettable}; axAfter focused=${row.axAfter?.focusedValue} appFocused=${JSON.stringify(row.focusAfter?.focused)} events=${JSON.stringify(row.appEvents?.map(e => `${e.ev}:${e.id}`))}`);
  if (row.typed) log(`${row.label}: typed ${row.typed.answer?.answer} focus=${JSON.stringify(row.typed.focus?.focused)} text=${JSON.stringify(row.typed.appEvents)}`);
  if (row.exception || row.problem) log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''} ${row.textNodes ? JSON.stringify(row.textNodes) : ''}`);
}
process.exit(0);
