// The application families of M0.4's matrix (Plan of Work, M0, Matrix; Design, Device mode and the foreground
// route): how the harness opens each family's representative application on a document or page it owns, which of
// its accessibility objects an input lands in, and how the effect is read back. Every application is started as
// its own process group (so the harness can end it whole) with scratch settings where the application keeps any,
// so nothing of the person's sessions or documents is opened, and its window is told apart by a label the harness
// chose (the file name, the page title, the terminal title) or by its process.
//
// Kinds: `editor` (one editable text object holds the document), `paragraphs` (a Writer document: one object per
// paragraph), `page` (a browser on pages/matrix.html: a field that holds the focus and a button counting its
// clicks), `electron` (cua's Electron fixture: its field and its "Pressed N times" status), `terminal` (xterm
// running a recorder of what it receives, with mouse reporting on).

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { preorder } from './normalize.mjs';
import { PAGES, configure } from './scenes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, '..', '..');
export const ELECTRON = join(REPO, 'node_modules', 'electron', 'dist', 'electron');
export const ELECTRON_FIXTURE = join(REPO, 'scripts', 'native-matrix', 'fixtures', 'electron');
export const DOC = 'cua171 matrix line one\ncua171 matrix line two\n';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The subtrees an effect never lands in, skipped when the harness walks an application's objects itself.
const PRUNE = ['menu bar', 'menu', 'popup menu', 'tool bar', 'status bar', 'statusbar', 'page tab list', 'tree', 'list'];

const FIREFOX_PREFS = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.preonboarding.enabled': false,
  'browser.newtab.preload': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'startup.homepage_welcome_url': '',
  'datareporting.policy.firstRunURL': '',
  'datareporting.policy.dataSubmissionEnabled': false,
  'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'termsofuse.bypassNotification': true,
};

// Writer's scratch profile: no tip of the day, and no word completion or autocorrection, which would change what a
// burst of keys leaves in a paragraph.
const WRITER_PROFILE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="ShowTipOfTheDay" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="FirstRun" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/AutoFunction/Completion"><prop oor:name="Enable" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/AutoFunction/Format/Option"><prop oor:name="UseAutoCorrect" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/AutoCorrect"><prop oor:name="TwoCapitalsAtStart" oor:op="fuse"><value>false</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/AutoCorrect"><prop oor:name="CapitalAtStartSentence" oor:op="fuse"><value>false</value></prop></item>
</oor:items>
`;

function scratchFile(ctx, ext = 'txt') {
  const file = join(ctx.dir, `${ctx.label}.${ext}`);
  writeFileSync(file, DOC);
  return file;
}

const byTitle = (label) => (w) => typeof w.title === 'string' && w.title.includes(label);
const byPid = (pid) => (w) => windowPid(w.id) === pid;

export function windowPid(id) {
  try {
    const text = execFileSync('xprop', ['-id', String(id), '_NET_WM_PID'], { encoding: 'utf8', timeout: 5000 });
    const m = text.match(/= (\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export function wmClass(id) {
  const text = execFileSync('xprop', ['-id', String(id), 'WM_CLASS'], { encoding: 'utf8', timeout: 5000 });
  const parts = [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return parts.join(' / ');
}

/** Each family: its title in the matrix, its kind, its window's size, and how it is launched. */
export const FAMILIES = {
  gedit: {
    title: 'GTK3 gedit',
    kind: 'editor',
    geometry: [900, 700],
    launch: (ctx) => ({ cmd: 'gedit', args: ['--standalone', scratchFile(ctx)], match: byTitle(ctx.label) }),
  },
  'gnome-text-editor': {
    title: 'GTK4 gnome-text-editor',
    kind: 'editor',
    geometry: [900, 700],
    // GTK 4.14 reports its objects' extents relative to the window, not the screen (the text box at 0,0 and the
    // window's size, M0.4 probe), so the text area is the window below its 56 px header bar
    area: (window) => ({ x: window.x, y: window.y + 56, w: window.width, h: window.height - 56 }),
    // its session (restored documents and drafts) lives under the XDG data and state directories: scratch ones
    launch: (ctx) => ({
      cmd: 'gnome-text-editor',
      args: ['--standalone', scratchFile(ctx)],
      env: { XDG_DATA_HOME: join(ctx.dir, 'data'), XDG_STATE_HOME: join(ctx.dir, 'state') },
      match: byTitle(ctx.label),
    }),
  },
  'gtk4-button': {
    title: 'GTK 4 button (harness scene)',
    kind: 'button',
    geometry: [600, 400],
    // pages/gtk4-button.py: one button whose label counts its presses
    launch: (ctx) => ({ cmd: 'python3', args: ['-I', join(PAGES, 'gtk4-button.py'), ctx.label], match: (w) => w.title === ctx.label }),
  },
  kate: {
    title: 'Qt 5 kate',
    kind: 'editor',
    geometry: [900, 700],
    // `-b` (block) as its desktop entry runs it: kate otherwise forks into the background
    launch: (ctx) => ({ cmd: 'kate', args: ['-n', '-b', scratchFile(ctx)], match: byTitle(ctx.label) }),
  },
  qtcreator: {
    title: 'Qt 6 qtcreator',
    kind: 'editor',
    geometry: [1100, 760],
    launch: (ctx) => ({ cmd: 'qtcreator', args: ['-settingspath', join(ctx.dir, 'qtcreator'), scratchFile(ctx)], match: byTitle(ctx.label) }),
  },
  firefox: {
    title: 'Firefox',
    kind: 'page',
    geometry: [1050, 780],
    launch: (ctx) => {
      const profile = join(ctx.dir, 'firefox');
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(profile, 'user.js'), Object.entries(FIREFOX_PREFS).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
      // a size asked for explicitly: the first window opens at it, not maximized (a new profile otherwise opens
      // maximized on this screen, where the window manager then refuses a resize)
      if (ctx.geometry) {
        const [width, height] = ctx.geometry;
        writeFileSync(join(profile, 'xulstore.json'), JSON.stringify({ 'chrome://browser/content/browser.xhtml': { 'main-window': { sizemode: 'normal', screenX: '0', screenY: '0', width: String(width), height: String(height) } } }));
      }
      const url = `${pathToFileURL(join(PAGES, 'matrix.html')).href}#${encodeURIComponent(ctx.label)}`;
      return { cmd: 'firefox', args: ['--no-remote', '--new-instance', '--profile', profile, url], match: byTitle(ctx.label) };
    },
  },
  chrome: {
    title: 'Chrome',
    kind: 'page',
    geometry: [1050, 780],
    // a window of the running Chrome (the person's browser, which keeps --force-renderer-accessibility), closed
    // with WM_DELETE_WINDOW
    chrome: true,
  },
  electron: {
    title: 'Electron (cua fixture)',
    kind: 'electron',
    geometry: [900, 700],
    // Chromium's web contents expose no tree on Linux without --force-renderer-accessibility (neither
    // ACCESSIBILITY_ENABLED=1 nor the bus's ScreenReaderEnabled turned it on; M0.4 probe)
    launch: (ctx) => ({
      cmd: ELECTRON,
      args: [ELECTRON_FIXTURE, `--cua-fixture-user-data=${join(ctx.dir, 'electron')}`, '--force-renderer-accessibility'],
      byPid: true,
    }),
  },
  writer: {
    title: 'LibreOffice Writer (gtk3)',
    kind: 'paragraphs',
    geometry: [1100, 760],
    launch: (ctx) => writerLaunch(ctx, 'gtk3'),
  },
  'writer-gen': {
    title: 'LibreOffice Writer (gen, X11 only)',
    kind: 'paragraphs',
    geometry: [1100, 760],
    // no AT-SPI provider: an effect is read as a change of the window's pixels (pixels.mjs)
    pixels: true,
    launch: (ctx) => writerLaunch(ctx, 'gen'),
  },
  // the differential run's large-table scenes (M1a.1's cases): a GTK 3 tree view over 10,000 rows (role `table` over
  // 5,000 children, read through the visible-table path) and a LibreOffice Calc sheet (its table of cells is sampled)
  'gtk-table': {
    title: 'GTK 3 tree view, 10,000 rows (harness scene)',
    kind: 'table',
    geometry: [500, 400],
    launch: (ctx) => ({ cmd: 'python3', args: ['-I', join(PAGES, 'gtk-table.py'), ctx.label, '10000'], match: (w) => w.title === ctx.label }),
  },
  calc: {
    title: 'LibreOffice Calc (gtk3)',
    kind: 'table',
    geometry: [1100, 700],
    launch: (ctx) => {
      const profile = join(ctx.dir, 'lo');
      mkdirSync(join(profile, 'user'), { recursive: true });
      writeFileSync(join(profile, 'user', 'registrymodifications.xcu'), WRITER_PROFILE);
      const file = join(ctx.dir, `${ctx.label}.csv`);
      writeFileSync(file, 'a,b,c\n1,2,3\n4,5,6\n');
      return {
        cmd: 'soffice',
        args: ['--calc', '--norestore', '--nologo', '--infilter=CSV:44,34,76', `-env:UserInstallation=${pathToFileURL(profile).href}`, file],
        env: { SAL_USE_VCLPLUGIN: 'gtk3' },
        match: byTitle(ctx.label),
      };
    },
  },
  xterm: {
    title: 'xterm',
    kind: 'terminal',
    geometry: [640, 400],
    launch: (ctx) => terminalLaunch(ctx, []),
  },
  'xterm-allow': {
    title: 'xterm, allowSendEvents on',
    kind: 'terminal',
    geometry: [640, 400],
    launch: (ctx) => terminalLaunch(ctx, ['-xrm', 'XTerm*allowSendEvents: true']),
  },
};

/**
 * A size asked for explicitly: Writer's first window opens at it, in the normal state (state 1), instead of maximized
 * on this screen, where the window manager then refuses a resize.
 */
function writerWindow([width, height]) {
  return `<item oor:path="/org.openoffice.Setup/Office/Factories/org.openoffice.Setup:Factory['com.sun.star.text.TextDocument']"><prop oor:name="ooSetupFactoryWindowAttributes" oor:op="fuse"><value>0,0,${width},${height};1;0,0,${width},${height};</value></prop></item>\n`;
}

function writerLaunch(ctx, plugin) {
  const profile = join(ctx.dir, 'lo');
  mkdirSync(join(profile, 'user'), { recursive: true });
  writeFileSync(join(profile, 'user', 'registrymodifications.xcu'), ctx.geometry ? WRITER_PROFILE.replace('</oor:items>', `${writerWindow(ctx.geometry)}</oor:items>`) : WRITER_PROFILE);
  return {
    cmd: 'soffice',
    args: ['--writer', '--norestore', '--nologo', `-env:UserInstallation=${pathToFileURL(profile).href}`, scratchFile(ctx)],
    env: { SAL_USE_VCLPLUGIN: plugin },
    match: byTitle(ctx.label),
  };
}

// The recorder: mouse reporting on, the terminal raw, every byte it receives appended to a file. The file is the
// script's first argument, never part of its text: its path carries the run's label, which is the caller's.
export function terminalLaunch(ctx, extra) {
  const record = join(ctx.dir, `${ctx.label}.input`);
  writeFileSync(record, '');
  const script = `printf '\\033[?1000h'; stty raw -echo; exec cat >> "$1"`;
  return { cmd: 'xterm', args: ['-T', ctx.label, ...extra, '-e', 'sh', '-c', script, 'sh', record], match: (w) => w.title === ctx.label, record };
}

/**
 * Opens a family's window on the harness's desktop: launched, found, sized and placed, its objects resolved.
 * Returns the scene: `{kind: 'family', family, id, pid, group, ...targets}`.
 */
export async function openFamily(desktop, oracle, name, role, { env = {}, geometry = null } = {}) {
  const family = FAMILIES[name];
  if (!family) throw new Error(`unknown family ${name}`);
  const label = desktop.label(name.replace(/[^a-z0-9]+/gi, ''), role);
  let scene;
  if (family.chrome) {
    const opened = await desktop.openChrome(role, 'matrix.html');
    scene = { ...opened, family: name, kindOf: family.kind };
  } else {
    const ctx = { label, dir: join(desktop.dir, label), geometry };
    mkdirSync(ctx.dir, { recursive: true });
    const spec = family.launch(ctx);
    const child = spawn(spec.cmd, spec.args, { stdio: 'ignore', detached: true, env: { ...process.env, ...(spec.env ?? {}), ...env } });
    child.unref();
    scene = { kind: 'family', family: name, kindOf: family.kind, role, label, pid: child.pid, group: true, record: spec.record ?? null, dir: ctx.dir, pixels: Boolean(family.pixels) };
    desktop.windows.push(scene);
    const match = spec.byPid ? byPid(child.pid) : spec.match;
    const info = await desktop.waitForWindow(match, label, 60000);
    scene.id = info.id;
  }
  const [w, h] = geometry ?? family.geometry;
  configure(scene.id, 0, 0, w, h);
  await settle(desktop, scene);
  await resolveTargets(desktop, oracle, scene);
  return scene;
}

/**
 * Waits until the window's tree (when it has one) reads the same twice. An application whose tree keeps changing
 * (qtcreator's) is taken as it is after 20 s, and the scene says so.
 */
async function settle(desktop, scene) {
  const started = Date.now();
  let previous = null;
  let last = null;
  while (Date.now() - started < 30000) {
    const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
    if (response.ok) {
      const text = JSON.stringify(response.output.ax_tree);
      last = response.output;
      const steady = text === previous;
      if (steady || Date.now() - started > 20000) {
        scene.window = last.window;
        scene.source = last.ax_tree_source;
        if (!steady) scene.unsettled = true;
        return;
      }
      previous = text;
    }
    await sleep(500);
  }
  throw new Error(`${scene.label ?? scene.id} has no readable window state`);
}

/** The objects an input lands in: the text area, the field, the button or status, found once at open. */
async function resolveTargets(desktop, oracle, scene) {
  if (scene.kindOf === 'terminal') return;
  let nodes;
  if (scene.source === 'at_spi') {
    nodes = preorder((await desktop.state(scene)).ax_tree).map((n) => ({ id: n.id, role: n.role, name: n.name }));
  } else {
    // the engines' association found no frame (kate: its frame's Name is not its X11 title); the harness walks the
    // process's own frames, named for the harness's document
    const frames = oracle.appsOf(scene.pid).flatMap((app) => oracle.children(app));
    const ours = frames.filter((f) => {
      try {
        return String(oracle.name(f)).includes(scene.label);
      } catch {
        return false;
      }
    });
    nodes = ours.flatMap((f) => oracle.walk(f, { prune: PRUNE }));
    scene.oracleWalk = nodes.length;
  }
  if (nodes.length === 0) return;
  scene.frame = nodes[0].id;
  if (scene.kindOf === 'editor') {
    // the document: the largest editable text object
    let best = null;
    for (const n of nodes.filter((x) => ['text', 'text box', 'entry', 'document text', 'paragraph'].includes(x.role))) {
      try {
        if (!oracle.states(n.id).editable) continue;
        const e = oracle.extents(n.id);
        if (!best || e.w * e.h > best.area) best = { id: n.id, area: e.w * e.h };
      } catch {
        // not a component
      }
    }
    scene.field = best?.id ?? null;
  } else if (scene.kindOf === 'paragraphs') {
    scene.document = nodes.find((n) => n.role === 'document text')?.id ?? null;
  } else if (scene.kindOf === 'page') {
    scene.field = nodes.find((n) => n.role === 'entry' && n.name === 'Field')?.id ?? null;
    scene.button = nodes.find((n) => n.role === 'push button' && /^presses \d+$/.test(n.name ?? ''))?.id ?? null;
  } else if (scene.kindOf === 'button') {
    scene.button = nodes.find((n) => COUNTED.test(n.name ?? ''))?.id ?? null;
  } else if (scene.kindOf === 'electron') {
    scene.field = nodes.find((n) => n.role === 'entry' && n.name === 'Fixture text')?.id ?? null;
    scene.button = nodes.find((n) => n.role === 'push button' && n.name === 'Fixture button')?.id ?? null;
  }
}

/**
 * The family's text: the document, the paragraphs joined, the field, or what the terminal received. A terminal's
 * bytes are kept one character per byte (a mouse report's coordinates are bytes, not UTF-8), or with `utf8` decoded
 * as the text a paste delivers.
 */
export async function readText(desktop, oracle, scene, { utf8 = false } = {}) {
  try {
    if (scene.kindOf === 'terminal') return readFileSync(scene.record, utf8 ? 'utf8' : 'latin1');
    if (scene.kindOf === 'paragraphs') return scene.document ? paragraphs(oracle, scene).map((p) => p.text).join('\n') : null;
    if (!scene.field) return null;
    return oracle.text(scene.field);
  } catch {
    return null;
  }
}

function paragraphs(oracle, scene) {
  if (!scene.document) return [];
  return oracle
    .children(scene.document)
    .filter((id) => oracle.role(id) === 'paragraph')
    .map((id) => ({ id, text: oracle.text(id), caret: oracle.caret(id) }));
}

/** The caret: `{caret, text}` in an editor, `{paragraph, of, caret}` in a Writer document. */
export async function readCaret(desktop, oracle, scene) {
  try {
    if (scene.kindOf === 'paragraphs') {
      const ps = paragraphs(oracle, scene);
      const at = ps.findIndex((p) => p.caret >= 0);
      return { paragraph: at < 0 ? null : at, of: ps.length, caret: at < 0 ? null : ps[at].caret };
    }
    return { caret: oracle.caret(scene.field), text: oracle.text(scene.field) };
  } catch {
    return null;
  }
}

const COUNTED = /^presses \d+$/;

/** The click counter: the matrix page's or the GTK 4 scene's button label, the Electron fixture's status. */
export async function readCounter(desktop, oracle, scene) {
  const nodes = preorder((await desktop.state(scene)).ax_tree);
  const text = scene.kindOf === 'electron' ? nodes.find((n) => /^Pressed \d+ times?$/.test(n.name ?? ''))?.name : nodes.find((n) => COUNTED.test(n.name ?? ''))?.name;
  const m = text?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** The text area an editor click aims at, in screen coordinates. */
export function textArea(oracle, scene) {
  const own = FAMILIES[scene.family]?.area;
  if (own) return own(scene.window);
  const id = scene.kindOf === 'paragraphs' ? scene.document : scene.field;
  return id ? oracle.extents(id) : null;
}

export function familyNames(list) {
  for (const name of list) if (!FAMILIES[name]) throw new Error(`unknown family ${name}; known: ${Object.keys(FAMILIES).join(', ')}`);
  return list;
}

export function electronReady() {
  return existsSync(ELECTRON);
}
