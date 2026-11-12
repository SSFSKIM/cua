// The application under test, verified before a cell counts (#171 M4, T16's fix wave; the design session, 2026-11-10).
// A scene's launch command and window title say what was asked for, not what came: an empty .odp launched with
// `--impress` opened in Writer, and T16's Impress rows then measured Writer (task 72's review, finding 3). So a runner
// reads the application through AT-SPI, as the harness's own reads (oracle.mjs) see it, and refuses the scene unless it
// is the one named: its AT-SPI application's name and toolkit, and, where one application serves several document
// types (LibreOffice's modules share one process), the role of the document its frame holds.

import { splitNodeId } from './matrix-judge.mjs';

/** A scene whose application is not the one under test: its cells never count. */
export class IdentityRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'IdentityRefused';
  }
}

/**
 * What each family's application must show: `application` (the AT-SPI application's Name), `toolkit` (its
 * `ToolkitName`), `toolkit_major` (the leading integer of its `Version`), and `document` (the role of the first
 * document node under the frame, where the family has one); a part left out is not checked. A family with no AT-SPI
 * tree at all declares `wm_class` alone (its X11 `WM_CLASS`, `instance / class`). As read on the #171 VM:
 * - task 72's fix wave (`--plan identity`): LibreOffice 24.2 on its gtk3 plugin is `soffice` with toolkit `gtk` in
 *   every module, so only the document's role tells Writer, Calc and Impress apart;
 * - task 74 (runs ident-1, pilot-id-3 and pilot-id-5, private displays): Qt 5 (5.15.13) and Qt 6 (6.4.2) both name
 *   their toolkit `Qt`, and the fixtures share a script, so only the major tells qt5-* from qt6-*; it is declared for
 *   every Qt family (kate is Qt 5, Qt Creator Qt 6), never for a browser, whose versions move with upgrades (Chrome's
 *   bridge says 1.0). GTK 4's Python fixtures all show `Unnamed`, as read: that tells GTK 4 (`GTK`) from GTK 3
 *   (`gtk`) and from gnome-text-editor, not one GTK 4 fixture from another. xterm, the X11 recorder and Writer on its
 *   gen plugin put no tree on the bus.
 */
export const APP_IDENTITY = {
  writer: { application: 'soffice', toolkit: 'gtk', document: 'document text' },
  calc: { application: 'soffice', toolkit: 'gtk', document: 'document spreadsheet' },
  impress: { application: 'soffice', toolkit: 'gtk', document: 'document presentation' },
  'gtk3-frame': { application: 'point-gtk3.py', toolkit: 'gtk', document: null },
  'writer-gen': { wm_class: 'libreoffice / libreoffice-writer' },
  gedit: { application: 'gedit', toolkit: 'gtk' },
  'gnome-text-editor': { application: 'gnome-text-editor', toolkit: 'GTK' },
  'gnome-terminal': { application: 'gnome-terminal-server', toolkit: 'gtk' },
  'gtk4-button': { application: 'Unnamed', toolkit: 'GTK' },
  'gtk4-input': { application: 'Unnamed', toolkit: 'GTK' },
  'atspi-gtk4': { application: 'Unnamed', toolkit: 'GTK' },
  'settle-gtk3': { application: 'settle-gtk3.py', toolkit: 'gtk' },
  'gtk-scale': { application: 'gtk-scale.py', toolkit: 'gtk' },
  'gtk-table': { application: 'gtk-table.py', toolkit: 'gtk' },
  'qt5-input': { application: 'qt-input.py', toolkit: 'Qt', toolkit_major: 5 },
  'qt5-breeze': { application: 'qt-input.py', toolkit: 'Qt', toolkit_major: 5 },
  'qt5-fusion': { application: 'qt-input.py', toolkit: 'Qt', toolkit_major: 5 },
  'qt6-input': { application: 'qt-input.py', toolkit: 'Qt', toolkit_major: 6 },
  'settle-qt5': { application: 'settle-qt.py', toolkit: 'Qt', toolkit_major: 5 },
  'settle-qt6': { application: 'settle-qt.py', toolkit: 'Qt', toolkit_major: 6 },
  'atspi-qt5': { application: 'atspi-qt.py', toolkit: 'Qt', toolkit_major: 5 },
  'atspi-qt6': { application: 'atspi-qt.py', toolkit: 'Qt', toolkit_major: 6 },
  kate: { application: 'kate', toolkit: 'Qt', toolkit_major: 5 },
  qtcreator: { application: 'QtCreator', toolkit: 'Qt', toolkit_major: 6 },
  firefox: { application: 'Firefox', toolkit: 'Gecko' },
  chrome: { application: 'Google Chrome', toolkit: 'Chromium' },
  electron: { application: 'electron', toolkit: 'Chromium' },
  xterm: { wm_class: 'xterm / XTerm' },
  'xterm-allow': { wm_class: 'xterm / XTerm' },
  // the differential run's scenes that no family opens (run.mjs `SCENE_FAMILY`): the identity cases' fixture windows
  // (pages/identity-windows.py) and the minimized cases' recorder (xprobe record)
  'identity-gtk3': { application: 'identity-windows.py', toolkit: 'gtk' },
  'identity-gtk4': { application: 'Unnamed', toolkit: 'GTK' },
  recorder: { wm_class: 'cua171-recorder / Cua171-recorder' },
};

/** The roles a document search stops at: below them is content, not the window's structure. */
const DOCUMENT = /^document /;
const PRUNE = ['menu bar', 'menu', 'popup menu', 'tool bar', 'status bar', 'table'];

/** The leading integer of a toolkit's version (`5` of `5.15.13`), or null where it has none. */
const majorOf = (version) => {
  const m = /^(\d+)/.exec(String(version ?? ''));
  return m ? Number(m[1]) : null;
};

/**
 * The identity of a scene's application through AT-SPI, from its frame: `{application, toolkit, toolkit_major,
 * document}`, the document the role of the first document node met breadth first (null for none within `limit`
 * nodes), looked for only with `document` (each node met costs reads of the bus: a family that declares no document
 * skips the walk, and its identity then has none).
 */
export function readIdentity(oracle, frame, { limit = 400, document: walk = true } = {}) {
  const at = splitNodeId(String(frame));
  if (!at) throw new Error(`${frame} is not an AT-SPI node`);
  const root = `${at.bus}:/org/a11y/atspi/accessible/root`;
  const get = (read) => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  const application = get(() => oracle.name(root));
  const { toolkit, toolkit_version: version } = oracle.toolkit(frame);
  const identity = { application, toolkit, toolkit_major: majorOf(version) };
  if (!walk) return identity;
  let document = null;
  const queue = [frame];
  for (let seen = 0; queue.length && seen < limit && document === null; seen++) {
    const id = queue.shift();
    const role = get(() => oracle.role(id));
    if (role === null) continue;
    if (DOCUMENT.test(role)) document = role;
    else if (!PRUNE.includes(role)) queue.push(...(get(() => oracle.children(id)) ?? []));
  }
  return { ...identity, document };
}

/** The parts an entry may declare; one it leaves undefined is not checked. */
const PARTS = ['application', 'toolkit', 'toolkit_major', 'document', 'wm_class'];

/**
 * Whether an identity is the family's (`APP_IDENTITY`): `{ok, why}`, `why` naming each part that differs. A family
 * with no entry is refused, so a runner cannot count a family nobody said how to verify.
 */
export function identityVerdict(identity, family, expected = APP_IDENTITY[family]) {
  if (!expected) return { ok: false, why: [`no identity is declared for family ${family}`] };
  const why = [];
  for (const part of PARTS) {
    if (expected[part] === undefined) continue;
    if ((identity?.[part] ?? null) !== expected[part]) why.push(`${part} ${JSON.stringify(identity?.[part] ?? null)}, not ${JSON.stringify(expected[part])}`);
  }
  return { ok: why.length === 0, why };
}

/**
 * Verifies a scene's application (`scene.frame`, its AT-SPI frame) as its family's before any of its cells counts;
 * throws `IdentityRefused` otherwise. Returns the identity read, for the run's record.
 */
export function verifyIdentity(oracle, scene, family = scene.family) {
  if (!scene.frame) throw new IdentityRefused(`${scene.label}: no AT-SPI frame to verify its application by`);
  const identity = readIdentity(oracle, scene.frame, { document: APP_IDENTITY[family]?.document !== undefined });
  return judged(identity, scene, family);
}

function judged(identity, scene, family) {
  const verdict = identityVerdict(identity, family);
  if (!verdict.ok) throw new IdentityRefused(`${scene.label} is not ${family}'s application: ${verdict.why.join('; ')}`);
  return identity;
}

/**
 * `verifyIdentity` for any scene a runner opens, before any of its cells counts: each of its windows (`scene.windows`,
 * a scene of several, or the scene itself), at its AT-SPI frame, or where the scene carries none (the scenes no
 * family opener resolved) at the frame its window state (`desktop.state`) gives; a family with no AT-SPI tree (an
 * entry declaring `wm_class` alone) by its X11 `WM_CLASS` (`wmClassOf`, families.mjs `wmClass`, given by the runner).
 * The scene is left as it was. Returns the identity read (an array of them for a scene of several windows); throws
 * `IdentityRefused` otherwise.
 */
export async function verifySceneIdentity(desktop, oracle, scene, family, { wmClassOf } = {}) {
  const expected = APP_IDENTITY[family];
  const windows = scene.windows?.length ? scene.windows : [scene];
  const identities = [];
  for (const win of windows) {
    if (expected && expected.application === undefined && expected.wm_class !== undefined) {
      identities.push(judged({ wm_class: wmClassOf(win.id) }, win, family));
      continue;
    }
    identities.push(expected ? verifyIdentity(oracle, { label: win.label, frame: await frameOf(desktop, oracle, win, scene) }, family) : judged(null, win, family));
  }
  return scene.windows?.length ? identities : identities[0];
}

/**
 * A scene a runner opened, verified as `family`'s (`verifySceneIdentity`, its `WM_CLASS` read by families.mjs
 * `wmClass` unless `wmClassOf` is given) before any of its cells counts: returned with its identity (`identity`), or
 * closed and refused (`IdentityRefused`).
 */
export async function verifiedScene(desktop, oracle, scene, family = scene.family, { wmClassOf } = {}) {
  try {
    scene.identity = await verifySceneIdentity(desktop, oracle, scene, family, { wmClassOf: wmClassOf ?? (await import('./families.mjs')).wmClass });
  } catch (error) {
    await desktop.close([scene]);
    throw error;
  }
  return scene;
}

/**
 * Where a window's application is read: its frame where the scene carries one; else its process's application where
 * it has exactly one on the bus (a fixture's windows of one title, whose state the engine refuses to read apart; the
 * application's root answers the same reads); else the frame its window state gives. A state that cannot be read
 * refuses the scene with the read's error.
 */
async function frameOf(desktop, oracle, win, scene) {
  if (win.frame) return win.frame;
  const pid = win.pid ?? scene.pid;
  const apps = pid && typeof oracle.appsOf === 'function' ? oracle.appsOf(pid) : [];
  if (apps.length === 1) return apps[0];
  let state;
  try {
    state = await desktop.state(win);
  } catch (error) {
    throw new IdentityRefused(`${win.label}: its application could not be read: ${error.message}`);
  }
  return state.ax_tree_source === 'at_spi' ? state.ax_tree?.id : null;
}
