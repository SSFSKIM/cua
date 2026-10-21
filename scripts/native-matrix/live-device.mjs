// The device side of the M2a.5 hold (./live.mjs; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2a.5
// "Live on the mini"): run from the harness checkout on the Mac that shows the scenes, over ssh, one JSON line on stdout
// per command (exit 1 with {error} when it fails). cua's lane talks to the approved engine's socket directly, as the
// device's own uid outside any sandbox (./goldens-device.mjs engineClientFor), one connection per command, so every
// check's observations and actions share a lineage; the vendor's lane is the controller's (a vendor serve).
//
//   begin --run <dir> --commit <sha>   the refusals (./live-checks.mjs liveRefusals); with none, the owner's front app
//                                      saved in the run directory (its pid stays here) and the approved engine stopped
//   minimized --run <dir>              the minimized-window check on the run's TextEdit (cua's engine only)
//   menu --run <dir> [--menu-activation off|on]
//                                      cua's lane of the menu check: the run's TextEdit behind the run's Finder window,
//                                      each menu item's press with M2a.2's spikeMenuActivation switch off (the default) or on
//   paste --run <dir>                  the paste check: a plain and a Markdown paste and type_text under Korean 2-Set into
//                                      the run's TextEdit behind the run's Finder window; the owner's clipboard compared
//                                      before and after here (only whether it is the same leaves)
//   enablement --run <dir>             two connections, one after the other, observing the run's Chrome for Testing
//   input-source                       the owner's source and per-context preference saved, Korean 2-Set selected
//                                      through the approved bundle's probe, read back, the saved ones restored
//   input-source-restore               the saved source and preference restored (what put-back runs)
//   watch start|stop --run <dir>       the approved bundle's `--probe watch-activations` around the vendor's lane
//   putback --run <dir>                the put-back (./live-checks.mjs putBackPlan), every step tried
//
// What leaves the device: booleans, counts, element counts, error names and the engine's bounded sentences,
// input-source ids, bundle ids of apps that activated. No observation's text, title or value, no screenshot (each is
// removed as soon as its answer is in), no pid of an app the run does not own.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {dirname, isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {installedEngine, stopEngine} from '../../src/runtime/engine.mjs';
import {engineBuild, engineVersion} from '../../src/runtime/engine-bundle.mjs';
import {configuredIdentity, readSignature} from '../../src/runtime/engine-sign.mjs';
import {CHROME_FOR_TESTING_BUNDLE_ID} from './fixtures/chrome-for-testing.mjs';
import {FIXTURE_BUNDLE_ID} from './fixtures/electron-fixture.mjs';
import {SCENE_BUNDLE_IDS, TEXTEDIT_BUNDLE_ID, activateScene, main as scenesMain, preflight as scenesPreflight, reactivateApp, readState} from '../repl-parity/scenes-mac.mjs';
import {appWindows, frontmostProcess, runningApps} from '../repl-parity/scenes-mac-device.mjs';
import {engineCheck, engineClientFor, main as goldensDeviceMain, ownershipProblems} from './goldens-device.mjs';
import {controllerCheckout} from './goldens.mjs';
import {REPO_ROOT} from './goldens-install.mjs';
import {
  FIRST_LINE, KOREAN_2SET, alertCandidates, MENU_ITEMS, PASTE_TARGETS, allSelected, enablementOf, enablementVerdict, failureOf, firstLineBold, frontAppAction, inputSourceVerdict, liveRefusals,
  menuBarItem, menuItemAt, minimizeButton, minimizedVerdict, parsePerContext, pasteVerdict, perContextRestore, putBackPlan, restoreTarget, textArea,
} from './live-checks.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
export const SCREENSHOT_DIR = 'live-screenshots';
export const FRONTMOST_FILE = 'live-frontmost.json';
const WATCH_FILE = 'live-watch.json';
// The owner's input source and per-context preference, saved before a switch, beside the harness's other caches, so the
// next put-back restores them after a run that died (first record wins, as Finder's saved preferences).
export const SAVED_INPUT_SOURCE = join(homedir(), 'Library/Caches/cua-harness/input-source.json');
// How long a window takes to minimize or come back (the Dock's animation), polled.
const WINDOW_MS = 5_000, WINDOW_POLL_MS = 250;
// Between the enablement check's two connections: the engine releases when it sees the first one close.
export const RELEASE_WAIT_MS = 1_000;
// What the minimized check writes and selects in the run's document.
const SET_VALUE = 'cua minimized set value check';
const SELECT_TEXT = 'minimized';
const TYPED = ' typed';
const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---- Engine calls ----------------------------------------------------------------------------------------------------

// One get_app_state as cua's service sends it (always with the screenshot), the image removed once the answer is in.
async function getState(client, app, screenshots) {
  const {result} = await client.execute('get_app_state', {app, includeScreenshot: true, outputDirectory: screenshots});
  const url = result?.screenshot?.url;
  if (typeof url === 'string' && url.startsWith('file:')) {
    const path = fileURLToPath(url);
    if (path.startsWith(`${screenshots}/`) && !path.slice(screenshots.length + 1).includes('/')) fs.rmSync(path, {force: true});
  }
  return result;
}
// An action as a result keeps it: {ok, route, posted, activationGuardMs?, entered?} or failureOf's fields.
async function attempt(fn) {
  try {
    const {result} = await fn();
    const meta = result?.meta;
    return {ok: true, route: meta?.inputRoute ?? null, posted: meta?.startedAt != null,
      ...(meta?.activationGuardMs != null ? {activationGuardMs: meta.activationGuardMs} : {}), ...(meta?.entered != null ? {entered: meta.entered} : {})};
  } catch (error) { return {ok: false, ...failureOf(error)}; }
}
// Polls `test()` until it holds or `boundMs` pass. -> whether it held.
async function until(test, io, boundMs = WINDOW_MS) {
  for (const t0 = io.now(); ;) {
    if (await test()) return true;
    if (io.now() - t0 >= boundMs) return false;
    await io.sleep(WINDOW_POLL_MS);
  }
}

// ---- The minimized window --------------------------------------------------------------------------------------------

// The pre-flight entry's item 2 and M2a.4's item 2, on the run's TextEdit window: minimized through its own minimize
// button (an advertised AXPress, route 1, touching no other window), observed (the tree there, the screenshot null with
// its reason), a synthesized click on the text area refused naming the minimized window with nothing posted, set_value
// and select_text acting and read back; then what type_text and ⌘A do (the coordinator's addition: whether the value
// changed, whether the selection became the whole value), each read back without un-minimizing; and the window put
// back on screen (`open -a`, AppKit's reopen un-minimizes it; the put-back returns the owner's front app).
export async function minimizedCheck({record, client, io, screenshots}) {
  const steps = {};
  let touched = false, problem = null;
  try {
    problem = await minimizedSteps({record, client, io, screenshots, steps, touch: () => { touched = true; }});
  } catch (error) {
    problem = `the minimized check stopped: ${String(error.message).slice(0, 300)}`;
  } finally {
    if (touched) {
      const front = await io.activate('textedit');
      const onScreen = await until(() => io.windowOnScreen(record.pid, record.window.number) === true, io);
      steps.restore = {ok: front?.ok === true && onScreen, onScreen};
    }
  }
  return {...(problem ? {problem} : {}), steps, verdict: minimizedVerdict(steps)};
}

async function minimizedSteps({record, client, io, screenshots, steps, touch}) {
  const app = record.app, observe = () => getState(client, app, screenshots);
  let shot = await observe();
  const owned = ownershipProblems('textedit', shot, record);
  if (owned.length) return `the observation is not the run's TextEdit window (${owned.map(p => p.message).join('; ')}); nothing was sent`;
  const button = minimizeButton(shot);
  if (!button) return 'the run\'s TextEdit window shows no minimize button; nothing was sent';
  touch();
  steps.minimize = await attempt(() => client.execute('click', {app, element: button.token}, {lineage: shot.lineage}));
  steps.minimize.minimized = steps.minimize.ok && await until(() => io.windowOnScreen(record.pid, record.window.number) === false, io);
  if (!steps.minimize.minimized) return 'the window did not minimize; no further input was sent';

  try { shot = await observe(); } catch (error) {
    steps.observe = {ok: false, ...failureOf(error)};
    return 'the minimized window\'s observation was refused; no further input was sent';
  }
  const area = textArea(shot);
  steps.observe = {ok: true, treePresent: Array.isArray(shot.nodes) && shot.nodes.length > 0, textArea: Boolean(area), screenshotNull: shot.screenshot === null,
    screenshotOmitted: shot.screenshotOmitted ?? null, engineSaysMinimized: shot.timings?.minimized === true};
  if (!area) return 'the minimized window\'s observation shows no text area; no further input was sent';

  // A synthesized click (the text area advertises no AXPress): refused before anything is posted.
  const click = await attempt(() => client.execute('click', {app, element: area.token}, {lineage: shot.lineage}));
  steps.click = {...click, refused: !click.ok, namesMinimized: !click.ok && /minimized/i.test(click.message ?? '')};
  // An element scroll (62235d71): refused as windowMinimized before the scroll into view, nothing scrolled.
  const scroll = await attempt(() => client.execute('scroll', {app, element: area.token, direction: 'down', pages: 1}, {lineage: shot.lineage}));
  steps.scroll = {...scroll, refused: !scroll.ok};

  steps.setValue = await attempt(() => client.execute('set_value', {app, element: area.token, value: SET_VALUE}, {lineage: shot.lineage}));
  shot = await observe();
  steps.setValue.valueMatches = textArea(shot)?.value === SET_VALUE;

  steps.selectText = await attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: SELECT_TEXT}, {lineage: shot.lineage}));
  shot = await observe();
  steps.selectText.selectionMatches = shot.selectedText === SELECT_TEXT;

  const before = textArea(shot)?.value;
  steps.typeText = await attempt(() => client.execute('type_text', {app, text: TYPED}, {lineage: shot.lineage}));
  shot = await observe();
  steps.typeText.valueChanged = textArea(shot)?.value !== before;

  steps.selectAll = await attempt(() => client.execute('press_key', {app, key: 'super+a'}, {lineage: shot.lineage}));
  shot = await observe();
  const value = textArea(shot)?.value;
  steps.selectAll.effect = typeof value === 'string' && value.length > 0 && shot.selectedText === value;
  return null;
}

// ---- The menu path, cua's lane ---------------------------------------------------------------------------------------

// The vendor reading's item 10 on cua's engine: the run's TextEdit in the background behind the run's Finder window.
// Per item: the menu-bar click (the record, nothing posted), the rooted observation and the item's enabled state, the
// item's element click (not sent when it reads disabled), the effect read back through an observation; Bold after the
// document's first line is selected. After each action the frontmost process is read (the user window must stay in
// front), and the approved bundle's activation watcher runs throughout. `menuActivation` sends M2a.2's engine-only
// `spikeMenuActivation: true` with each item's press (route 3's activation around the route-1 press; never with the
// menu-bar record's click), so the hold runs the lane with it off and on and the result sets the default.
export async function menuCheck({record, user, client, io, screenshots, menuActivation = false}) {
  const userInFront = () => io.frontmost()?.pid === user.pid;
  if (!userInFront()) return {problem: 'the user window (the run\'s Finder) is not in front; nothing was sent'};
  const watch = io.watch.start();
  const items = {};
  let problem = null;
  try {
    for (const id of Object.keys(MENU_ITEMS)) items[id] = await menuItem({id, record, client, io, screenshots, userInFront, menuActivation});
  } catch (error) { problem = `the menu check stopped: ${String(error.message).slice(0, 300)}`; }
  finally {
    const lines = await io.watch.stop(watch);
    items.activations = activationsOf(lines, watch);
  }
  const {activations, ...byItem} = items;
  return {...(problem ? {problem} : {}), menuActivation, items: byItem, activations};
}

async function menuItem({id, record, client, io, screenshots, userInFront, menuActivation}) {
  const {menu, path} = MENU_ITEMS[id], app = record.app, observe = () => getState(client, app, screenshots);
  const out = {};
  let shot = await observe();
  const owned = ownershipProblems('textedit', shot, record);
  if (owned.length) throw new Error(`the observation is not the run's TextEdit window (${owned.map(p => p.code).join(', ')})`);
  if (id === 'bold') {
    const selected = await attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: FIRST_LINE}, {lineage: shot.lineage}));
    shot = await observe();
    out.prepared = selected.ok && shot.selectedText === FIRST_LINE;
  }
  const bar = menuBarItem(shot, menu);
  if (!bar) return {...out, found: false, reason: `no ${menu} menu-bar item in the observation`};
  out.record = await attempt(() => client.execute('click', {app, element: bar.token}, {lineage: shot.lineage}));
  out.userInFront = [userInFront()];
  shot = await observe();
  out.rooted = shot.nodes?.[0]?.role === 'AXMenuBarItem' && shot.nodes[0].title === menu;
  const item = menuItemAt(shot, path);
  if (!item) return {...out, found: false};
  out.found = true;
  out.enabled = item.flags?.enabled !== false;
  if (out.enabled) {
    out.click = await attempt(() => client.execute('click', {app, element: item.token, ...(menuActivation ? {spikeMenuActivation: true} : {})}, {lineage: shot.lineage}));
    out.clicked = out.click.ok;
    out.userInFront.push(userInFront());
  } else out.clicked = false;
  shot = await observe();
  out.effect = id === 'selectAll' ? allSelected(shot.selectedText) : firstLineBold(textArea(shot)?.valueMarkdown);
  return out;
}

// The watcher's lines as a result keeps them: what activated or deactivated, by bundle id (whether it is a scene app),
// with the device's time, never another app's pid; the probe's own first line left out.
export function activationsOf(lines, watch) {
  return (lines ?? []).filter(line => line?.kind && line.pid !== watch?.pid)
    .map(line => ({kind: line.kind, bundleId: line.bundleId ?? null, scene: SCENE_BUNDLE_IDS.includes(line.bundleId), ...(line.at ? {at: line.at} : {})}));
}

// ---- Paste (M2a.3) ---------------------------------------------------------------------------------------------------

// What the paste check writes: a plain paste, a Markdown paste (bold), and type_text's paste route over two lines.
export const PASTE = Object.freeze({text: 'cua paste plain', markdown: '**cua paste bold**', typed: 'cua typed paste\nsecond typed line'});
// Each paste step's deadline. The engine bounds its own waits by it (the paste lock's wait answers timeoutReached; the
// read and effect waits answer clipboardReadTimedOut at 2 s each), and the client gives the connection up a grace after
// it (src/services/engine/client.mjs), so no paste step outlives about 25 s; the alert's text read is bounded the same
// way, shorter.
export const PASTE_DEADLINE_MS = 20_000;
const ALERT_READ_DEADLINE_MS = 5_000;
const ALERT_TEXT_CHARS = 500;

// Thrown to stop the paste section once something the harness must not act past is seen (an alert, a step that
// outlived its bound); the steps so far are kept.
class PasteAbort extends Error {}

// M2a.3 live (its report's concerns: whether TextEdit reads the lazy item and shows the effect within the 2 s waits,
// whether ⌘V into a background app after route 3's activation lands), on the run's TextEdit behind the run's Finder
// window: each paste replaces a selected line of the run's document and is read back through an observation; type_text
// runs with Korean 2-Set selected through the approved bundle's probe (an input method takes the paste route) and the
// per-context input preference turned off for it when it read on (so the probe's selection is the engine's too), the
// owner's source and preference restored right after whatever happened (and verified again by the put-back, which owns
// the saved record). Before the first step and after each, the screen is read for a system alert (a pasteboard-privacy
// prompt): one aborts the section unclicked, its owner and text recorded. The owner's clipboard is fingerprinted here
// before and after (the engine restores it only while nobody else wrote it); only whether it is the same leaves.
export async function pasteCheck({record, user, client, io, screenshots}) {
  const userInFront = () => io.frontmost()?.pid === user.pid;
  if (!userInFront()) return {problem: 'the user window (the run\'s Finder) is not in front; nothing was sent'};
  const before = io.clipboard();
  const steps = {userInFront: []};
  let problem = null;
  try {
    problem = await pasteSteps({record, user, client, io, screenshots, steps, userInFront});
  } catch (error) {
    problem = error instanceof PasteAbort ? error.message : `the paste check stopped: ${String(error.message).slice(0, 300)}`;
  } finally {
    if (steps.inputSource) {
      const restored = await restoreInputSource({io, keep: true});
      steps.inputSource.restored = restored.sourceRestored === true && restored.perContextRestored === true;
      steps.inputSource.perContext.restored = io.readPerContext();
    }
    steps.clipboard = {same: io.clipboard() === before};
  }
  return {...(problem ? {problem} : {}), steps, verdict: pasteVerdict(steps)};
}

async function pasteSteps({record, user, client, io, screenshots, steps, userInFront}) {
  const app = record.app, observe = () => getState(client, app, screenshots);
  let shot = await observe();
  const owned = ownershipProblems('textedit', shot, record);
  if (owned.length) return `the observation is not the run's TextEdit window (${owned.map(p => p.message).join('; ')}); nothing was sent`;

  // The alert watch: the screen before the first step is the baseline; a candidate stops the section, never touched.
  const baseline = io.windows();
  const watchAlerts = async at => {
    const found = alertCandidates(baseline, io.windows(), {runPids: [record.pid, user.pid]});
    if (!found.length) { steps.pasteAlert = false; return; }
    steps.pasteAlert = true;
    steps.alert = {at, windows: found, text: await alertText(client, found, screenshots)};
    throw new PasteAbort(`a system alert appeared (${at}: ${found.map(w => w.ownerBundleId ?? w.ownerName).join(', ')}); the paste section stopped without touching it`);
  };
  // A step that outlived its bound spends the connection: the section stops there.
  const bounded = out => {
    if (!out.ok && /did not answer|timed out|closed/i.test(out.message ?? '') && !out.errorName) throw new PasteAbort(`a paste step did not answer within its bound: ${out.message}`);
    return out;
  };
  // Selects `line`, sends `request(lineage)`, reads the result back. -> the action's result and the area after it.
  const replace = async (line, request) => {
    const selected = await attempt(() => client.execute('select_text', {app, element: textArea(shot).token, text: line}, {lineage: shot.lineage}));
    shot = await observe();
    if (!selected.ok || shot.selectedText !== line) return {out: {ok: false, prepared: false, ...(selected.ok ? {} : {selectError: selected.errorName})}, area: textArea(shot)};
    const out = await attempt(() => request(shot.lineage));
    steps.userInFront.push(userInFront());
    return {out: {...out, prepared: true}, area: null, after: async () => { shot = await observe(); return textArea(shot); }};
  };
  const run = async (name, line, request, judge) => {
    const {out, area, after} = await replace(line, request);
    steps[name] = out;
    bounded(out);
    await watchAlerts(`after ${name}`);
    Object.assign(steps[name], judge(after ? await after() : area));
  };
  const [textLine, markdownLine, typedLine] = PASTE_TARGETS;
  const landed = (area, text, line) => typeof area?.value === 'string' && area.value.includes(text) && !area.value.includes(line);
  const deadline = {deadlineMs: PASTE_DEADLINE_MS};

  await watchAlerts('before text');
  await run('text', textLine, lineage => client.execute('paste', {app, text: PASTE.text, format: 'text'}, {lineage, ...deadline}),
    area => ({lands: landed(area, PASTE.text, textLine)}));

  const bold = PASTE.markdown.replace(/\*\*/g, '');
  await run('markdown', markdownLine, lineage => client.execute('paste', {app, text: PASTE.markdown, format: 'md'}, {lineage, ...deadline}),
    area => ({lands: landed(area, bold, markdownLine), bold: typeof area?.valueMarkdown === 'string' && area.valueMarkdown.includes(PASTE.markdown)}));

  // Korean 2-Set for type_text, with the per-context preference off while it runs (on, the probe's selection would
  // stay in the probe's own input context and the engine would read the owner's source).
  saveInputSource({io});
  const read = io.readPerContext();
  steps.inputSource = {perContext: {read, setOff: read === true, restored: null}};
  if (read === true) io.writePerContext(false);
  steps.inputSource.selected = io.probe(['input-source', KOREAN_2SET])?.selected === true;
  await watchAlerts('before typeText');
  await run('typeText', typedLine, lineage => client.execute('type_text', {app, text: PASTE.typed}, {lineage, ...deadline}),
    area => ({lands: landed(area, PASTE.typed, typedLine), sourceAfter: io.probe(['input-source', 'current'])?.id ?? null}));
  return null;
}

// An alert's text, read through the engine's observation of its owner (no screenshot, no input, bounded): the static
// texts' and buttons' strings, joined and capped. Null when the owner cannot be read.
async function alertText(client, windows, screenshots) {
  const owner = windows.find(w => w.ownerBundleId)?.ownerBundleId;
  if (!owner) return null;
  try {
    const {result} = await client.execute('get_app_state', {app: owner, includeScreenshot: false, outputDirectory: screenshots}, {deadlineMs: ALERT_READ_DEADLINE_MS});
    const strings = (result?.nodes ?? []).filter(n => n.role === 'AXStaticText' || n.role === 'AXButton')
      .map(n => n.value ?? n.title ?? n.description).filter(v => typeof v === 'string' && v.length > 0);
    return strings.join(' | ').slice(0, ALERT_TEXT_CHARS) || null;
  } catch (error) { return `(unread: ${String(error.errorName ?? error.message).slice(0, 120)})`; }
}

// ---- Enablement released ---------------------------------------------------------------------------------------------

// M2a.4's item 3 on the run's Chrome for Testing: a first connection observes and closes; after the engine has seen it
// close, a second connection observes. The engine's enablement diagnostics say what each observation found and did.
export async function enablementCheck({record, io, screenshots}) {
  const read = async () => {
    const client = io.client();
    try {
      const shot = await getState(client, record.app, screenshots);
      if (shot?.app?.pid !== record.pid) throw new Error('the observation is not of the run\'s Chrome for Testing');
      return enablementOf(shot.timings);
    } finally { await client.close(); }
  };
  const first = await read();
  await io.sleep(RELEASE_WAIT_MS);
  const second = await read();
  return {verdict: enablementVerdict({first, second})};
}

// ---- The input source ------------------------------------------------------------------------------------------------

const readSaved = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

// The owner's source and per-context preference, saved before the first switch; a record a run that died left is kept.
export function saveInputSource({io}) {
  const file = io.savedInputSource, existing = readSaved(file);
  if (existing) return {kept: true, saved: existing};
  const saved = {savedAt: new Date().toISOString(), source: {id: io.probe(['input-source', 'current']).id}, perContext: io.readPerContext()};
  fs.mkdirSync(dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(saved)}\n`, {mode: 0o600});
  return {kept: false, saved};
}

// The pre-flight entry's item 4: Korean 2-Set selected through the approved bundle's probe and read back by a second
// probe, the owner's source and per-context preference restored whatever happened.
export async function inputSourceCheck({io}) {
  const save = saveInputSource({io});
  let selected = null, readBack = null, error = null;
  try {
    const answer = io.probe(['input-source', KOREAN_2SET]);
    selected = {selected: answer?.selected === true, current: {id: answer?.current?.id ?? null}};
    readBack = {id: io.probe(['input-source', 'current'])?.id ?? null};
  } catch (thrown) { error = String(thrown.message).slice(0, 300); }
  const restored = await restoreInputSource({io, keep: true});
  const saved = {kept: save.kept, source: {id: save.saved.source?.id ?? null}, perContext: save.saved.perContext ?? null};
  return {saved, selected, readBack, restored, ...(error ? {error} : {}), verdict: inputSourceVerdict({saved, selected, readBack, restored})};
}

// The saved source selected again (when it is not the current one) and read back, the per-context preference written
// back where it differs; the record removed only once both hold.
export async function restoreInputSource({io, keep = false}) {
  const saved = readSaved(io.savedInputSource);
  if (!saved) return {saved: false};
  const source = restoreTarget(saved);
  if (io.probe(['input-source', 'current'])?.id !== source) io.probe(['input-source', source]);
  const sourceRestored = io.probe(['input-source', 'current'])?.id === source;
  const plan = perContextRestore(saved.perContext ?? null, io.readPerContext());
  if (plan.write) io.writePerContext(plan.value);
  const perContextRestored = io.readPerContext() === (saved.perContext ?? null);
  if (sourceRestored && perContextRestored && !keep) fs.rmSync(io.savedInputSource, {force: true});
  return {source, sourceRestored, perContextRestored, perContextWritten: plan.write === true, ...(plan.unrestorable ? {unrestorable: plan.unrestorable} : {})};
}

// ---- Begin and put back ----------------------------------------------------------------------------------------------

// The front app the owner had, saved on the device (its pid never leaves); one a run that died saved is kept.
export function saveFrontmost(run, front) {
  const file = join(run, FRONTMOST_FILE);
  if (fs.existsSync(file) || !front?.bundleId) return;
  fs.writeFileSync(file, `${JSON.stringify({pid: front.pid, bundleId: front.bundleId, savedAt: new Date().toISOString()})}\n`, {mode: 0o600});
}

export async function begin({run, commit, io}) {
  const preflight = io.preflight(run), checkout = io.gitState(), engine = io.engineCheck();
  const refusals = liveRefusals({preflight, checkout, engine, state: readState(run)}, {controllerCommit: commit});
  const facts = {checkout, engine: engine.engine ?? null};
  if (refusals.length) return {refusals, ...facts};
  const front = io.frontmost();
  saveFrontmost(run, front);
  return {refusals: [], ...facts, frontmost: {bundleId: front?.bundleId ?? null}, engineStop: await io.stop()};
}

const BUNDLES = Object.freeze({textedit: TEXTEDIT_BUNDLE_ID, chromeForTesting: CHROME_FOR_TESTING_BUNDLE_ID, electronFixture: FIXTURE_BUNDLE_ID});

// The put-back (./live-checks.mjs putBackPlan): each step tried whatever the one before answered. -> {plan, steps, ok}.
export async function putBack({run, io}) {
  const state = readState(run), frontFile = join(run, FRONTMOST_FILE);
  const front = readSaved(frontFile);
  const plan = putBackPlan({scenesUp: Object.keys(state.scenes ?? {}), inputSourceSaved: fs.existsSync(io.savedInputSource), frontSaved: Boolean(front)});
  const run1 = {
    'finder-teardown': async () => { const out = await io.goldensSteps(['steps', 'finder', '--run', run, '--phase', 'teardown']); return {ok: true, steps: out?.steps?.length ?? 0}; },
    'scenes-down': async () => { const out = await io.scenes(['down', 'all', '--run', run]); return {ok: out?.down === true, down: out?.down === true}; },
    'input-source': async () => { const out = await restoreInputSource({io}); return {ok: out.sourceRestored === true && out.perContextRestored === true, ...out}; },
    'engine-stop': async () => ({ok: true, ...await io.stop()}),
    'apps-check': async () => {
      const running = Object.fromEntries(Object.entries(BUNDLES).map(([name, bundleId]) => [name, io.runningApps(bundleId).length]));
      return {ok: Object.values(running).every(n => n === 0), running};
    },
    'front-app': async () => {
      const action = frontAppAction(front);
      if (!action.reactivate) return {ok: false, bundleId: front?.bundleId ?? null, reactivated: false, reason: action.reason};
      const out = await io.reactivate(front);
      const inFront = io.frontmost()?.pid === front.pid;
      if (inFront) fs.rmSync(frontFile, {force: true});
      return {ok: inFront, bundleId: front.bundleId, reactivated: out?.reactivated === true, inFront, ...(out?.reason ? {reason: out.reason} : {})};
    },
  };
  const steps = {};
  for (const step of plan) {
    try { steps[step] = await run1[step](); } catch (error) { steps[step] = {ok: false, error: String(error.message).slice(0, 300)}; }
  }
  return {plan, steps, ok: plan.every(step => steps[step].ok === true)};
}

// ---- The probe -------------------------------------------------------------------------------------------------------

// The approved bundle's `--probe <args>` as its own instance (UserProbe: `open -n -g -W --stdout <file> --stderr <file>`),
// run to completion. -> its last JSON line.
export function runProbe(bundle, args, {exec = execFileSync} = {}) {
  if (!args.every(a => /^[A-Za-z0-9._-]+$/.test(a))) throw new Error('a probe argument is a name or an input-source id');
  const scratch = fs.mkdtempSync(join(tmpdir(), 'cua-live-probe-'));
  try {
    const out = join(scratch, 'out.json'), err = join(scratch, 'err.txt');
    exec('/usr/bin/open', ['-n', '-g', '-W', '--stdout', out, '--stderr', err, '-a', bundle, '--args', '--probe', ...args], {stdio: 'ignore', timeout: 60_000});
    const line = fs.readFileSync(out, 'utf8').trim().split('\n').at(-1);
    return JSON.parse(line);
  } finally { fs.rmSync(scratch, {recursive: true, force: true}); }
}

// The resident `--probe watch-activations` (started without -W, its pid read from its first line), recorded in the run
// directory so `watch stop` finds it from another command. -> {pid, dir}.
export function startWatch(bundle, run, {exec = execFileSync, sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)} = {}) {
  const dir = fs.mkdtempSync(join(run, 'watch-'));
  const out = join(dir, 'out.json'), err = join(dir, 'err.txt');
  exec('/usr/bin/open', ['-n', '-g', '--stdout', out, '--stderr', err, '-a', bundle, '--args', '--probe', 'watch-activations'], {stdio: 'ignore', timeout: 30_000});
  for (let i = 0; i < 50; i++) {
    const first = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n')[0] : '';
    const pid = first ? JSON.parse(first)?.pid : null;
    if (Number.isInteger(pid)) {
      const watch = {pid, dir};
      fs.writeFileSync(join(run, WATCH_FILE), `${JSON.stringify(watch)}\n`, {mode: 0o600});
      return watch;
    }
    sleep(100);
  }
  fs.rmSync(dir, {recursive: true, force: true});
  throw new Error('the watch-activations probe did not print its pid');
}
// Stops the watcher (only while that pid still runs the engine's executable) and answers its lines.
export function stopWatch(watch, {exec = execFileSync} = {}) {
  if (!watch?.pid || !watch?.dir) return [];
  let command = '';
  try { command = exec('/bin/ps', ['-o', 'comm=', '-p', String(watch.pid)], {encoding: 'utf8'}).trim(); } catch {}
  if (command.endsWith('/cua-engine')) { try { process.kill(watch.pid, 'SIGTERM'); } catch {} }
  const out = join(watch.dir, 'out.json');
  const lines = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }) : [];
  fs.rmSync(watch.dir, {recursive: true, force: true});
  return lines;
}

// ---- The live device --------------------------------------------------------------------------------------------------

const PER_CONTEXT = ['com.apple.HIToolbox', 'AppleGlobalTextInputProperties'];
function readPerContextLive() {
  try { return parsePerContext(execFileSync('/usr/bin/defaults', ['read', ...PER_CONTEXT], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']})); } catch (error) {
    if (error.status === 1 && /does not exist|Could not find/.test(String(error.stderr ?? ''))) return null;
    throw new Error(`could not read the per-context input preference: ${String(error.stderr || error.message).trim().slice(0, 200)}`);
  }
}
function writePerContextLive(value) {
  execFileSync('/usr/bin/defaults', ['write', ...PER_CONTEXT, '-dict-add', 'TextInputGlobalPropertyPerContextInput', '-bool', value ? 'true' : 'false'], {stdio: 'ignore'});
}

// The general pasteboard's items and their types (osascript's JavaScript over AppKit), digested here. Types only, never
// the data: reading a type list raises no pasteboard-privacy alert where reading data may, and the owner's content
// never enters the harness. An item the engine's paste left behind carries M2a.3's concealed and transient markers, so
// a restore that did not happen shows as a different type list. -> a sha256 hex digest.
const CLIPBOARD_TYPES_JXA = `ObjC.import('AppKit');
const items = ObjC.unwrap($.NSPasteboard.generalPasteboard.pasteboardItems) || [];
JSON.stringify(items.map(item => (ObjC.unwrap(item.types) || []).map(t => ObjC.unwrap(t))));`;
export function clipboardDigest({exec = execFileSync} = {}) {
  const out = exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', CLIPBOARD_TYPES_JXA], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  return createHash('sha256').update(out).digest('hex');
}

// Every on-screen window at every layer (./system-windows.swift), for the paste check's alert watch.
const SYSTEM_WINDOWS_SCRIPT = fileURLToPath(new URL('./system-windows.swift', import.meta.url));
export function systemWindows({exec = execFileSync} = {}) {
  return JSON.parse(exec('/usr/bin/swift', [SYSTEM_WINDOWS_SCRIPT], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000})).windows;
}

const approvedBundle = () => {
  const installed = installedEngine();
  if (!installed) throw new Error('no approved engine on this Mac: build and approve it first (cua engine build, cua engine approve)');
  return installed.bundlePath;
};

export const defaultIo = run => ({
  client: () => engineClientFor(approvedBundle()),
  frontmost: () => frontmostProcess(),
  windowOnScreen: (pid, number) => appWindows(pid).find(w => w.number === number)?.onScreen ?? null,
  activate: id => activateScene(id, {run}),
  watch: {start: () => startWatch(approvedBundle(), run), stop: watch => stopWatch(watch)},
  probe: args => runProbe(approvedBundle(), args),
  readPerContext: readPerContextLive,
  clipboard: () => clipboardDigest(),
  windows: () => systemWindows(),
  writePerContext: writePerContextLive,
  savedInputSource: SAVED_INPUT_SOURCE,
  preflight: dir => scenesPreflight({run: dir}),
  gitState: () => controllerCheckout(REPO_ROOT),
  engineCheck: () => {
    const installed = installedEngine();
    return engineCheck({installed, checkout: {build: engineBuild(), engineVersion: engineVersion()},
      ...(installed ? {signature: readSignature(installed.bundlePath), configured: configuredIdentity()} : {})});
  },
  stop: () => stopEngine(),
  goldensSteps: args => goldensDeviceMain(args),
  scenes: args => scenesMain(args),
  runningApps: bundleId => runningApps(bundleId),
  reactivate: front => reactivateApp(front),
  sleep: sleepFor,
  now: Date.now,
});

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; } else positional.push(rest[i]);
  }
  return {command, positional, flags};
}
const USAGE = 'usage: live-device.mjs begin --run <dir> --commit <sha> | minimized|enablement|paste|putback --run <dir> | menu --run <dir> [--menu-activation off|on] | watch start|stop --run <dir> | input-source | input-source-restore';
const runDir = flags => {
  if (!flags.run || !isAbsolute(flags.run)) throw new Error('--run <absolute directory> is required');
  fs.mkdirSync(flags.run, {recursive: true, mode: 0o700});
  return fs.realpathSync(flags.run);
};
const sceneRecord = (run, id) => {
  const record = readState(run).scenes?.[id];
  if (!record) throw new Error(`scene ${id} is not up in ${run}`);
  return record;
};

export async function main(argv, {io: given = {}} = {}) {
  const {command, positional, flags} = parse(argv);
  if (command === 'input-source' || command === 'input-source-restore') {
    const io = {...defaultIo(null), ...given};
    return command === 'input-source' ? inputSourceCheck({io}) : restoreInputSource({io});
  }
  if (!['begin', 'minimized', 'menu', 'paste', 'enablement', 'putback', 'watch'].includes(command)) throw new Error(USAGE);
  if (command === 'menu' && flags['menu-activation'] !== undefined && !['off', 'on'].includes(flags['menu-activation'])) throw new Error(USAGE);
  const run = runDir(flags), io = {...defaultIo(run), ...given};
  const screenshots = join(run, SCREENSHOT_DIR);
  if (command === 'begin') {
    if (!/^[0-9a-f]{40}$/.test(flags.commit ?? '')) throw new Error('begin needs --commit <this checkout\'s commit>');
    return begin({run, commit: flags.commit, io});
  }
  if (command === 'putback') return putBack({run, io});
  if (command === 'watch') {
    if (positional[0] === 'start') { const watch = io.watch.start(); return {watching: true, pid: watch.pid}; }
    if (positional[0] !== 'stop') throw new Error(USAGE);
    const file = join(run, WATCH_FILE), watch = readSaved(file);
    const lines = io.watch.stop(watch);
    fs.rmSync(file, {force: true});
    return {activations: activationsOf(lines, watch)};
  }
  if (command === 'enablement') return enablementCheck({record: sceneRecord(run, 'chrome'), io, screenshots});
  const record = sceneRecord(run, 'textedit');
  const client = io.client();
  try {
    if (command === 'minimized') return await minimizedCheck({record, client, io, screenshots});
    if (command === 'paste') return await pasteCheck({record, user: sceneRecord(run, 'finder'), client, io, screenshots});
    return await menuCheck({record, user: sceneRecord(run, 'finder'), client, io, screenshots, menuActivation: flags['menu-activation'] === 'on'});
  } finally { await client.close(); }
}

if (process.argv[1] && SCRIPT === fs.realpathSync(process.argv[1])) {
  main(process.argv.slice(2)).then(
    out => { process.stdout.write(JSON.stringify(out) + '\n'); },
    error => { process.stdout.write(JSON.stringify({error: error.message}) + '\n'); process.exitCode = 1; });
}
