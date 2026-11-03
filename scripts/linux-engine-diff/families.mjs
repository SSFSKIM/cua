// The application families of M0.4's matrix (Plan of Work, M0, Matrix; Design, Device mode and the foreground
// route): how the harness opens each family's representative application on a document or page it owns, which of
// its accessibility objects an input lands in, and how the effect is read back. Every application is started as
// its own process group (so the harness can end it whole) with scratch settings where the application keeps any,
// so nothing of the person's sessions or documents is opened, and its window is told apart by a label the harness
// chose (the file name, the page title, the terminal title) or by its process.
//
// Every one starts as an instance of the run's own, never handing its window to a person's running instance or
// taking over a person's profile (task 43): gedit and gnome-text-editor `--standalone` (no GApplication handoff), kate
// `-n` (a new instance, never KDE's unique-instance handoff), qtcreator on its own settings path (it joins a running
// instance only with `-client`, `-block` or `-pid`), Firefox `--no-remote --new-instance` on a scratch profile,
// LibreOffice on a scratch user installation (its single-instance pipe is named for it), Electron on a scratch user
// data directory (neither app asks for the single-instance lock), Chrome as the run's own instance (chrome.mjs),
// gnome-terminal on a terminal server of the scene's own (`vteLaunch`), and xterm and the harness's Python scenes as
// plain processes (no single-instance mechanism at all). And none writes the person's files or settings (task 45):
// every one runs with a home of the run's (app-env.mjs).
//
// Kinds: `editor` (one editable text object holds the document), `paragraphs` (a Writer document: one object per
// paragraph), `page` (a browser on pages/matrix.html: a field that holds the focus and a button counting its
// clicks), `electron` (cua's Electron fixture: its field and its "Pressed N times" status), `terminal` (xterm
// running a recorder of what it receives, with mouse reporting on).

import { xExecFileSync } from './xspawn.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CHROME_ENV } from './chrome.mjs';
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

/** Firefox's own variable: accessibility on, whatever the session bus and the settings say (B2, task 47). */
const A11Y_ON_GECKO = { GNOME_ACCESSIBILITY: '1' };

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
  writeFileSync(file, ctx.doc ?? DOC);
  return file;
}

/** The page a browser family opens: the caller's (`page`, a file under pages/) or the matrix's. */
const pageOf = (ctx) => ctx.page ?? 'matrix.html';
export const ELECTRON_PAGE_APP = join(here, 'pages', 'electron-page');

const byTitle = (label) => (w) => typeof w.title === 'string' && w.title.includes(label);
const byPid = (pid) => (w) => windowPid(w.id) === pid;

export function windowPid(id) {
  try {
    const text = xExecFileSync('xprop', ['-id', String(id), '_NET_WM_PID'], { encoding: 'utf8', timeout: 5000 });
    const m = text.match(/= (\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export function wmClass(id) {
  const text = xExecFileSync('xprop', ['-id', String(id), 'WM_CLASS'], { encoding: 'utf8', timeout: 5000 });
  const parts = [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  return parts.join(' / ');
}

/**
 * Each family: its title in the matrix, its kind, its window's size, and how it is launched. Every launch runs with the
 * run's environment (scenes.mjs `appEnvironment`: a home of the run's on every display, settings in memory on a
 * person's), its `env` holding only the family's own variables. `qt`: a Qt application, refused before it starts when it
 * would put no tree on the bus (`assertQtBridge`): on a display a person uses when the run's stand-in for org.a11y.Bus,
 * through which alone Qt turns its bridge on there, is not running (a11y-stub.mjs), and on a private display when the
 * run's accessibility switches are off. `home: 'xdg'` would keep the harness's HOME for a
 * family a separate HOME breaks (the run's XDG directories still apply); none needs it so far (task 45).
 */
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
  // M3.1: the GTK 4 input scene (pages/gtk4-input.py): a status line counting its scroll, scale, pointer moves, button
  // presses and keys, for the device mode's scroll, drag, move and click measurements and cases
  'gtk4-input': {
    title: 'GTK 4 input (harness scene)',
    kind: 'gtk4-input',
    geometry: [600, 400],
    // window-relative, as the scene lays itself out (pages/gtk4-input.py): GTK 4.14's extents are not window coordinates
    places: { scale: { x0: 20, x1: 580, y: 40 }, button: { x: 300, y: 103 }, list: { x: 300, y: 300 } },
    launch: (ctx) => ({ cmd: 'python3', args: ['-I', join(PAGES, 'gtk4-input.py'), ctx.label], match: (w) => w.title === ctx.label }),
  },
  // M3.1: the Qt input scene (pages/qt-input.py) under each major version, plain Qt widgets counting the pointer moves,
  // wheel events and presses that reach the toolkit, written to a record file: whether kate's and qtcreator's
  // difference is the version's or the applications'
  'qt5-input': {
    title: 'Qt 5 input (harness scene)',
    qt: true,
    kind: 'qt-input',
    geometry: [600, 400],
    launch: (ctx) => qtLaunch(ctx, 'qt5'),
  },
  'qt6-input': {
    title: 'Qt 6 input (harness scene)',
    qt: true,
    kind: 'qt-input',
    geometry: [600, 400],
    launch: (ctx) => qtLaunch(ctx, 'qt6'),
  },
  // M3.1: the same scene under Qt 5 with an auto-raise tool button whose hover highlight the style draws, under KDE's
  // Breeze and under Qt's own Fusion: whether a hover highlight that misses a background move is Breeze's
  'qt5-breeze': {
    title: 'Qt 5 Breeze (harness scene)',
    qt: true,
    kind: 'qt-style',
    geometry: [600, 400],
    launch: (ctx) => qtLaunch(ctx, 'qt5', 'breeze'),
  },
  'qt5-fusion': {
    title: 'Qt 5 Fusion (harness scene)',
    qt: true,
    kind: 'qt-style',
    geometry: [600, 400],
    launch: (ctx) => qtLaunch(ctx, 'qt5', 'fusion'),
  },
  'gtk-scale': {
    title: 'GTK 3 scale (harness scene)',
    kind: 'scale',
    geometry: [600, 300],
    // pages/gtk-scale.py: one horizontal scale, 0-100
    launch: (ctx) => ({ cmd: 'python3', args: ['-I', join(PAGES, 'gtk-scale.py'), ctx.label], match: (w) => w.title === ctx.label }),
  },
  kate: {
    title: 'Qt 5 kate',
    qt: true,
    kind: 'editor',
    geometry: [900, 700],
    // `-b` (block) as its desktop entry runs it: kate otherwise forks into the background
    launch: (ctx) => ({ cmd: 'kate', args: ['-n', '-b', scratchFile(ctx)], match: byTitle(ctx.label) }),
  },
  qtcreator: {
    title: 'Qt 6 qtcreator',
    qt: true,
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
      const prefs = { ...FIREFOX_PREFS, ...(ctx.page ? { 'widget.gtk.overlay-scrollbars.enabled': false } : {}) };
      writeFileSync(join(profile, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
      // a size asked for explicitly: the first window opens at it, not maximized (a new profile otherwise opens
      // maximized on this screen, where the window manager then refuses a resize)
      if (ctx.geometry) {
        const [width, height] = ctx.geometry;
        writeFileSync(join(profile, 'xulstore.json'), JSON.stringify({ 'chrome://browser/content/browser.xhtml': { 'main-window': { sizemode: 'normal', screenX: '0', screenY: '0', width: String(width), height: String(height) } } }));
      }
      const url = `${pathToFileURL(join(PAGES, pageOf(ctx))).href}#${encodeURIComponent(ctx.label)}`;
      // accessibility on: Gecko reads GNOME_ACCESSIBILITY first, then org.a11y.Status on the session bus, which the
      // run's has no launcher for on a person's display, then GSettings, in memory there (accessible/atk/Platform.cpp
      // `ShouldA11yBeEnabled`; B2, task 47)
      return { cmd: 'firefox', args: ['--no-remote', '--new-instance', '--profile', profile, url], env: A11Y_ON_GECKO, match: byTitle(ctx.label) };
    },
  },
  chrome: {
    title: 'Chrome',
    kind: 'page',
    geometry: [1050, 780],
    // a window of the run's own Chrome (scenes.mjs `openChrome`, chrome.mjs, with --force-renderer-accessibility),
    // closed with WM_DELETE_WINDOW
    chrome: true,
  },
  electron: {
    title: 'Electron (cua fixture)',
    kind: 'electron',
    geometry: [900, 700],
    // Chromium's web contents expose no tree on Linux without --force-renderer-accessibility (neither
    // ACCESSIBILITY_ENABLED=1 nor the bus's ScreenReaderEnabled turned it on; M0.4 probe), and its ATK bridge none without
    // ACCESSIBILITY_ENABLED=1 on the run's session bus, which has no org.a11y.Status on a person's display (chrome.mjs
    // `CHROME_ENV`; B2, task 47)
    launch: (ctx) =>
      ctx.page
        ? {
            cmd: ELECTRON,
            args: [ELECTRON_PAGE_APP, `--cua-page=${pathToFileURL(join(PAGES, ctx.page)).href}#${encodeURIComponent(ctx.label)}`, `--cua-user-data=${join(ctx.dir, 'electron')}`, '--force-renderer-accessibility'],
            env: CHROME_ENV,
            match: byTitle(ctx.label),
          }
        : {
            cmd: ELECTRON,
            args: [ELECTRON_FIXTURE, `--cua-fixture-user-data=${join(ctx.dir, 'electron')}`, '--force-renderer-accessibility'],
            env: CHROME_ENV,
            byPid: true,
          },
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
  // M2: the VTE family, whose paste chord is Ctrl+Shift+V (Ctrl+V inserts the next key literally in a shell; Design,
  // Device mode and the foreground route; Decision Log, M0.4). Its window belongs to a terminal server of the scene's
  // own, in the process group the harness starts (`vteLaunch`); the recorder still writes its own PID for the harness
  // to end it first
  'gnome-terminal': {
    title: 'gnome-terminal (VTE)',
    kind: 'terminal',
    geometry: [640, 400],
    launch: (ctx) => vteLaunch(ctx),
  },
};

/** The Qt input scene under a binding (and a style, with its tool button), its counts appended to a record file. */
function qtLaunch(ctx, binding, style) {
  const record = join(ctx.dir, `${ctx.label}.counts`);
  writeFileSync(record, '');
  const args = ['-I', join(PAGES, 'qt-input.py'), ctx.label, record, binding, ...(style ? [style] : [])];
  return { cmd: 'python3', args, match: (w) => w.title === ctx.label, record };
}

/** The Qt input scene's last counts: `{moves, wheels, presses, hovers}`, or null before its first line. */
export function readQtCounts(scene) {
  const last = readFileSync(scene.record, 'utf8').trim().split('\n').at(-1) ?? '';
  const m = last.match(/^moves (\d+) wheels (\d+) presses (\d+) hovers (\d+)$/);
  return m ? { moves: Number(m[1]), wheels: Number(m[2]), presses: Number(m[3]), hovers: Number(m[4]) } : null;
}

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
// script's first argument, never part of its text: its path carries the run's label, which is the caller's. With a
// document asked for (`ctx.doc`), the terminal shows it instead, mouse reporting off, so a drag selects its text.
export function terminalLaunch(ctx, extra) {
  if (ctx.doc) {
    const file = scratchFile(ctx);
    return { cmd: 'xterm', args: ['-T', ctx.label, ...extra, '-e', 'sh', '-c', 'cat "$1"; exec sleep 86400', 'sh', file], match: (w) => w.title === ctx.label, record: null };
  }
  const record = join(ctx.dir, `${ctx.label}.input`);
  writeFileSync(record, '');
  // with `motion`, every pointer motion is reported too (mode 1003)
  const script = `printf '\\033[?${ctx.motion ? 1003 : 1000}h'; stty raw -echo; exec cat >> "$1"`;
  return { cmd: 'xterm', args: ['-T', ctx.label, ...extra, '-e', 'sh', '-c', script, 'sh', record], match: (w) => w.title === ctx.label, record };
}

/** The D-Bus name of a scene's own gnome-terminal server: unique to the scene's label, a valid application id. */
export const terminalAppId = (label) => `org.cua171.Terminal.${String(label).replace(/[^A-Za-z0-9_]/g, '_')}`;

/** The terminal server, and the client that asks a server by its name (Ubuntu's `gnome-terminal` wrapper starts a server of its own for `--app-id`). */
export const TERMINAL_SERVER = '/usr/libexec/gnome-terminal-server';
export const terminalClient = (exists = existsSync) => (exists('/usr/bin/gnome-terminal.real') ? '/usr/bin/gnome-terminal.real' : 'gnome-terminal');

// The scene's own terminal server started under its name, then, once the name is on the session bus, the client
// asking that server, and only it, for the window. Server and client stay in the process group the harness started.
// The server, the client, the name and the client's arguments are the script's arguments, never its text.
const TERMINAL_SCRIPT = 'server="$1"; client="$2"; id="$3"; shift 3; "$server" --app-id "$id" & gdbus wait --session --timeout 20 "$id" || exit 1; exec "$client" --app-id "$id" "$@"';

/**
 * gnome-terminal running the recorder, on a terminal server of the scene's own (`terminalAppId`): a plain
 * `gnome-terminal` hands its window to the session's running server, the person's. The title is set by the program
 * itself as well as asked for, and its PID written to a file (ending the recorder closes the window, as the terminal
 * exits with its command). The recorder also shows what it receives, so a paste's text appears in the terminal's own
 * text, where an engine can confirm it.
 */
export function vteLaunch(ctx, { client = terminalClient() } = {}) {
  const terminal = (args) => ({ cmd: 'sh', args: ['-c', TERMINAL_SCRIPT, 'sh', TERMINAL_SERVER, client, terminalAppId(ctx.label), '--wait', '--title', ctx.label, '--', ...args] });
  if (ctx.doc) {
    const file = scratchFile(ctx);
    const pidfile = join(ctx.dir, `${ctx.label}.pid`);
    const script = `echo $$ > "$2"; printf '\\033]0;%s\\007' "$3"; cat "$1"; exec sleep 86400`;
    return { ...terminal(['sh', '-c', script, 'sh', file, pidfile, ctx.label]), match: (w) => w.title === ctx.label, record: null, pidfile };
  }
  const record = join(ctx.dir, `${ctx.label}.input`);
  const pidfile = join(ctx.dir, `${ctx.label}.pid`);
  writeFileSync(record, '');
  const script = `echo $$ > "$2"; printf '\\033]0;%s\\007\\033[?${ctx.motion ? 1003 : 1000}h' "$3"; stty raw -echo; exec tee -a "$1"`;
  return { ...terminal(['sh', '-c', script, 'sh', record, pidfile, ctx.label]), match: (w) => w.title === ctx.label, record, pidfile };
}

/**
 * Opens a family's window on the harness's desktop: launched, found, sized and placed, its objects resolved.
 * `stem`: the name in its window's label, where two scenes open one family for one engine (minimized-xterm beside
 * device-xterm), so each window has its own title and scratch directory. `env`: the application's own variables.
 * `bridge: false` skips a Qt family's check of the session's accessibility switches (`assertQtBridge`), for the one
 * experiment that opens Qt with them off on purpose (qt-bridge.mjs). Returns the scene: `{kind: 'family', family, id,
 * pid, group, ...targets}`.
 */
export async function openFamily(desktop, oracle, name, role, { env = {}, geometry = null, page = null, doc = null, motion = false, stem = name, bridge = true } = {}) {
  const family = FAMILIES[name];
  if (!family) throw new Error(`unknown family ${name}`);
  const label = desktop.label(stem.replace(/[^a-z0-9]+/gi, ''), role);
  let scene;
  if (family.chrome) {
    const opened = await desktop.openChrome(role, page ?? 'matrix.html');
    scene = { ...opened, family: name, kindOf: family.kind };
  } else {
    // a stopping run opens nothing more (scenes.mjs `stop`); the process is registered as soon as it is started
    desktop.assertOpen();
    const ctx = { label, dir: join(desktop.dir, label), geometry, page, doc, motion };
    mkdirSync(ctx.dir, { recursive: true });
    const spec = family.launch(ctx);
    // the application's own variables only: the rest of its environment is the run's (scenes.mjs `appEnvironment`)
    const own = { ...(spec.env ?? {}), ...env };
    // a Qt family puts no tree on the bus with the session's switches off, and on a person's display they stay as found
    if (family.qt && bridge) desktop.assertQtBridge(label, own);
    const child = desktop.spawnApp(label, spec.cmd, spec.args, { env: own, home: family.home ?? 'run', app: name });
    scene = { kind: 'family', family: name, kindOf: family.kind, role, label, pid: child.pid, group: true, record: spec.record ?? null, pidfile: spec.pidfile ?? null, dir: ctx.dir, pixels: Boolean(family.pixels) };
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
  if (scene.kindOf === 'terminal') {
    // effects are read from what the terminal's program received; a terminal with a tree (VTE) still names its toolkit
    if (scene.source === 'at_spi') scene.frame = (await desktop.state(scene)).ax_tree.id;
    return;
  }
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
  } else if (scene.kindOf === 'scale') {
    scene.slider = nodes.find((n) => n.role === 'slider')?.id ?? null;
  } else if (scene.kindOf === 'gtk4-input') {
    scene.status = nodes.find((n) => GTK4_STATUS.test(n.name ?? ''))?.id ?? null;
    scene.slider = nodes.find((n) => n.role === 'slider')?.id ?? null;
    scene.button = nodes.find((n) => n.name === 'press')?.id ?? null;
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
const GTK4_STATUS = /^scroll -?\d+ scale -?\d+ moves \d+ presses \d+ keys \d+ rights \d+$/;

/** The GTK 4 input scene's status line, parsed: `{scroll, scale, moves, presses, keys, rights}`, or null when not read. */
export async function readGtk4Status(desktop, scene) {
  const nodes = preorder((await desktop.state(scene)).ax_tree);
  const line = nodes.find((n) => GTK4_STATUS.test(n.name ?? ''))?.name;
  if (!line) return null;
  const num = (key) => Number(line.match(new RegExp(`\\b${key} (-?\\d+)`))[1]);
  return { scroll: num('scroll'), scale: num('scale'), moves: num('moves'), presses: num('presses'), keys: num('keys'), rights: num('rights') };
}

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
