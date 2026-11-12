// M4's gate as one runnable sequence (#171 M4, T18; the design session's M4 pre-flight, "The gate", as later tasks
// adjusted it): its steps, each one launched on its own, in one sitting on one candidate. gate.mjs lists, prints and
// runs them; this module is the plan and the commands, pure.
//
// Every step lasts 45 minutes or less (estimated from the M3 gate's rows and M4's latest full sittings) and is a valid
// run on its own: its own `--run`, its own out directory, and, for a verdict step, its own stub check and an explicit
// `--ops` (its scenes' operations, so the desktop's run once, in V2). The verdict steps run on the person's display
// `:0`, launched by the T18 executor in the declared sitting through task 50's guards (run71.sh under wrap71.py); the
// runner prints them and never runs them. Every other step runs on a private display: the harness's own X server under
// gate.mjs's wrapper (`private`), or the one the experiment starts itself (`own`).
//
// Coverage (the pre-flight's list, adjusted by T7 revised, T14, T16, T17 and T19): M3's full verdict run with M4's scenes
// appended in a frozen order (identity, the minimized scenes; the identity scene's Chrome windows after
// device-chrome-dnd, and V5 under the gate's Chrome ballast so its drops meet M3's window load); the over-budget scene
// through the facade; the drag cells (every family and kind 30 of 30, Chrome's and Firefox's canvas, Chrome's drag and
// drop, the thumbs, Writer unprimed since T16 removed the priming); the events experiment's `move`; the settle through
// the service as shipped (T8, T16's 25 ms drag); the facade suites on the candidate (repl-parity, native-baseline with
// compare --engines, linux-native, linux-device-mode: w5's facade.sh); T7 revised's acceptance on the shipped engine (the focus-timer
// experiment's shipped lane and its stops); the device cases of #263 and #264 (V5's device-chrome-dnd, and the real late
// takes of `t14-late`, which the device scene cannot produce); T19's predicates manifest; T17's Electron cells
// (`t17-fix3`, judged by drop-signals-judge.mjs `electronDropVerdict`). Apart in the same sitting, at twice the load
// (16 stress-ng workers on 8 cores, `--load-factor 2`): thumbs and ranges at 40 a side, the Chromium and Gecko kinds,
// the settle's observations, the paste and exit settle, the accept signal's false releases and the late takes, T17's
// Electron cells, and GTK 4's covered capture.

import { SCENE_OPS } from '../linux-engine-diff/ops.mjs';

/** The M3 gate's scenes (`m3-gate-musl`), then M4's, in the frozen order. */
export const M3_SCENES = ['desktop', 'gedit', 'chrome', 'chrome-input', 'over-budget', 'retention', 'chrome-textarea', 'chrome-address-bar', 'gnome-text-editor', 'paste-target', 'device-gtk4', 'device-firefox', 'device-xterm', 'device-qt', 'device-chrome', 'device-chrome-dnd'];
export const M4_SCENES = ['identity', 'identity-gtk3', 'identity-gtk4', 'identity-kate', 'minimized', 'minimized-xterm', 'minimized-recorder'];
export const GATE_SCENES = [...M3_SCENES, ...M4_SCENES];

/** gedit's operations split across two steps: the newest build's failing clipboard_write alone is about 15 minutes (T2). */
const GEDIT_TEXT = ['type_text', 'type_text_selection', 'type_text_dedicated', 'clipboard_read', 'clipboard_write', 'clipboard_release', 'caret_placed'];

const verdict = (name, minutes, scenes, what, { only = {}, ballast = false } = {}) => ({ name, kind: 'verdict', display: ':0', load: 'idle', minutes, scenes, only, ballast, what });
const experiment = (name, display, load, minutes, args, what, { pilot = null } = {}) => ({ name, kind: 'experiment', display, load, minutes, args, what, pilot });
const LOAD2 = ['--load-factor', '2'];
/** w5's runner of the facade suites (T18), relative to the checkout. */
export const FACADE_SCRIPT = 'docs/evidence/2026-10-28-own-linux-engine/m4/facade/scripts/facade.sh';
/** A facade suite's part, run by facade.sh on a private desktop of its own; its pilot is the part itself. */
const suite = (name, minutes, part, what) => ({ name, kind: 'suite', display: 'own', load: 'idle', minutes, args: [part], what, pilot: (args) => args });

/** A drag step under load: `--trials` under 40 is refused at load (T10), so its pilot drops the load. */
const dragLoadPilot = (args, n) => [...args.filter((a, i) => a !== '--load-factor' && args[i - 1] !== '--load-factor'), '--trials', String(n)];
/** A predicates step's pilot: its kinds' leave cases alone (the manifest has no `--trials`). */
const leavePilot = (args) => [...args, '--plan', 'leave'];
/** The events experiment's pilot: two interleaved fresh engines per sequence. */
const eventsPilot = (args, n) => [...args, '--first-rounds', String(n)];
/** No smaller form: the step's pilot is the step. */
const asIs = (args) => args;

const drag = (families, extra = []) => ['--experiment', 'drag', '--vendor', '{vendor}', '--newest', '{newest}', '--occlusion', 'visible', '--family', families, ...extra];
const settle = (families, extra = []) => ['--experiment', 'settle', '--lanes', 'shipped', '--family', families, ...extra];
const signals = (family, plan, extra = []) => ['--experiment', 'drop-signals', '--family', family, '--plan', plan, ...extra];
const predicates = (ops) => ['--experiment', 'predicates', '--vendor', '{vendor}', '--ops', ops];
// T7 revised's scenarios in two sittings, as T7's and task 60's ran them: the click scenarios' series leave the page's
// focus in its other field, so an audit of keys after them types there (the pilot's F1: Chromium's key audits read '')
const FOCUS_KEYS = ['--experiment', 'focus-timer', '--scenarios', 'burst,aba,paste', '--lanes', 'shipped'];
const FOCUS_CLICKS = ['--experiment', 'focus-timer', '--scenarios', 'click-paste,click-field', '--lanes', 'shipped'];
// the stops are Chromium's (focus-timer.mjs: SIGTERM after keys and after clicks on Chrome and Electron); with every
// family named, the others go unmeasured and fail the sitting (the pilot's F2)
const FOCUS_STOPS = ['--experiment', 'focus-timer', '--stops-only', '--family', 'chrome,electron'];

export const STEPS = [
  // ---- the verdict run on :0, M3's scenes and M4's in the frozen order
  verdict('V1', 40, ['gedit'], "gedit's text operations and its caret case (the newest build's clipboard_write about 15 min)", { only: { gedit: GEDIT_TEXT } }),
  verdict('V2', 39, ['desktop', 'gedit', 'chrome', 'over-budget'], "the desktop's operations (run here alone), gedit's reads and input, Chrome's, the over-budget page", { only: { gedit: SCENE_OPS.gedit.filter((op) => !GEDIT_TEXT.includes(op)) } }),
  verdict('V3', 35, ['chrome-input', 'retention', 'minimized', 'minimized-xterm', 'minimized-recorder'], "Chrome's input page, retention, the minimized scenes (T4)"),
  verdict('V4', 34, ['chrome-textarea', 'chrome-address-bar', 'gnome-text-editor', 'paste-target', 'device-gtk4', 'device-xterm', 'device-qt'], 'the browsers\' and GTK 4\'s text with the paste cases; the GTK 4, xterm and Qt device cases'),
  verdict('V5', 38, ['device-firefox', 'device-chrome', 'device-chrome-dnd', 'identity', 'identity-gtk3', 'identity-gtk4', 'identity-kate'], "Firefox's device cases (T19), Chrome's drags and drops with #263's and #264's cases, under the gate's Chrome ballast; identity (T5), its Chrome windows after device-chrome-dnd", { ballast: true }),
  experiment('Z0', ':0', 'idle', 25, drag('firefox,writer', ['--ops', 'dnd,select']), "on :0: T11's end rest landing Firefox's plain drop, and Writer's drag cell unprimed (T16)"),

  // ---- private, idle
  experiment('D1', 'private', 'idle', 35, drag('chrome'), "Chrome's drag cells: canvas and drag and drop judged on speed (Acceptance 3), the thumb at the pinned mean"),
  experiment('D2', 'private', 'idle', 30, drag('electron'), "Electron's drag cells, its thumb at the pinned mean"),
  experiment('D3', 'private', 'idle', 30, drag('firefox'), "Firefox's drag cells, the pointer parked inside (T19), its canvas judged on speed"),
  experiment('D4', 'private', 'idle', 25, drag('gedit,gtk-scale,gnome-text-editor,kate,qtcreator'), 'the GTK and Qt editors\' drag cells'),
  experiment('D5', 'private', 'idle', 25, drag('writer,xterm,xterm-allow,gtk4-input,gnome-terminal,writer-gen'), 'Writer (unprimed, T16), the terminals, GTK 4\'s scale, Writer through gen'),
  // the facade suites on the candidate (the design session's requirement, 2026-11-12): w5's facade.sh, each part on a
  // private desktop it starts itself, the candidate as its ENGINE_BIN; they count only when they pass on the artifact
  suite('R1', 40, 'parity', "repl-parity's native suite on both engine lanes, and the diff against its expected differences"),
  suite('R2', 35, 'baseline', 'native-baseline, three runs a lane interleaved, and compare --engines'),
  suite('R3', 5, 'accept', "scripts/accept/linux-native.mjs on the candidate, in a home of the run's"),
  suite('R4', 3, 'device', 'scripts/accept/linux-device-mode.mjs on the candidate'),
  { name: 'FB', kind: 'facade', display: 'private', load: 'idle', minutes: 5, args: ['--scenes', 'over-budget'], what: 'the over-budget scene through the real facade: the truncation line in getAXState and the combined observation (T3)', pilot: asIs },
  experiment('E1', 'own', 'idle', 8, ['--experiment', 'events', '--vendor', '{vendor}', '--newest', '{newest}'], "the events experiment: desktop move's later requests at or below the bar (T9)", { pilot: eventsPilot }),
  experiment('S1', 'own', 'idle', 39, settle('chrome,electron'), "the settle through cua's service as shipped: Chrome's and Electron's cells, audited"),
  experiment('S2', 'own', 'idle', 25, settle('firefox,gedit'), "the settle: Firefox's and gedit's cells"),
  experiment('S3', 'own', 'idle', 26, settle('kate,qtcreator,writer,gnome-terminal'), "the settle: kate's, Qt Creator's, Writer's (its drag at 25 ms, T16) and gnome-terminal's cells"),
  experiment('S4', 'own', 'idle', 30, settle('xterm,gtk3,qt5,qt6,gtk4'), "the settle: xterm's, GTK 3's, Qt 5's and 6's, GTK 4's cells"),
  experiment('F1a', 'own', 'idle', 20, FOCUS_KEYS, 'T7 revised on the shipped engine: burst, A-B-A, key then paste'),
  experiment('F1b', 'own', 'idle', 12, FOCUS_CLICKS, 'T7 revised on the shipped engine: click then paste, a click into another field then paste'),
  experiment('F2', 'own', 'idle', 8, FOCUS_STOPS, 'T7 revised: SIGTERM straight after keys and after clicks, 30 each on Chrome and Electron, and SIGKILL as the control', { pilot: asIs }),
  experiment('P1', 'private', 'idle', 30, predicates('click'), "T19's predicates manifest: Firefox's click cases", { pilot: leavePilot }),
  experiment('P2', 'private', 'idle', 30, predicates('scroll'), "T19's predicates manifest: scroll", { pilot: leavePilot }),
  experiment('P3', 'private', 'idle', 30, predicates('move'), "T19's predicates manifest: move", { pilot: leavePilot }),
  experiment('P4', 'private', 'idle', 30, predicates('select'), "T19's predicates manifest: select (the drag)", { pilot: leavePilot }),
  experiment('P5', 'private', 'idle', 16, [...predicates('click,scroll,move,select'), '--plan', 'leave'], "T19's leave cases: the pointer moved out during the request", { pilot: asIs }),
  experiment('H1', 'private', 'idle', 22, signals('electron', 't17-fix3'), "T17's Electron cells: plain drags and handles, the controls, the four releases off the window"),
  experiment('H2', 'private', 'gate-windows', 25, signals('electron', 't17-fix3', ['--ballast', 'gate']), "T17's Electron cells at the gate's window load"),
  experiment('C1', 'private', 'idle', 4, signals('chrome', 't14-late'), "#264's real late takes (T14), which the gate's device scene cannot produce"),

  // ---- private, twice the load
  experiment('L1', 'private', 'load2', 22, drag('chrome,electron', ['--ops', 'scroller,range', ...LOAD2]), 'thumbs and ranges at 40 a side against the pinned build (T12, #265)', { pilot: dragLoadPilot }),
  experiment('L2a', 'private', 'load2', 25, drag('chrome', ['--ops', 'select,dnd,canvas', ...LOAD2]), "Chrome's other kinds under the motion model (T11)", { pilot: dragLoadPilot }),
  experiment('L2b', 'private', 'load2', 22, drag('electron', ['--ops', 'select,dnd,canvas', ...LOAD2]), "Electron's other kinds under the motion model", { pilot: dragLoadPilot }),
  experiment('L2c', 'private', 'load2', 40, drag('firefox', LOAD2), "Gecko's kinds under the motion model", { pilot: dragLoadPilot }),
  experiment('L3a', 'own', 'load2', 26, settle('chrome', LOAD2), "the settle's observations: Chrome"),
  experiment('L3b', 'own', 'load2', 24, settle('electron', LOAD2), "the settle's observations: Electron"),
  experiment('L3c', 'own', 'load2', 31, settle('firefox,gedit', LOAD2), "the settle's observations: Firefox, gedit"),
  experiment('L3d', 'own', 'load2', 32, settle('kate,qtcreator,writer,gnome-terminal', LOAD2), "the settle's observations: kate, Qt Creator, Writer, gnome-terminal"),
  experiment('L3e', 'own', 'load2', 38, settle('xterm,gtk3,qt5,qt6,gtk4', LOAD2), "the settle's observations: xterm, GTK 3, Qt 5 and 6, GTK 4"),
  experiment('L4a', 'private', 'load2', 25, signals('electron', 't17-fix3', LOAD2), "T17's Electron cells at twice the load"),
  experiment('L4b', 'private', 'load2', 25, signals('chrome', 't14', LOAD2), "the accept signal's false releases (the measurement lane, T14's 300 long drops and the controls)"),
  experiment('L4c', 'private', 'load2', 4, signals('chrome', 't14-late', LOAD2), 'the late-take rate: real late takes at twice the load'),
  experiment('L5', 'private', 'load2', 4, ['--experiment', 'engine-readiness', '--vendor', '{vendor}', '--family', 'gnome-text-editor', ...LOAD2], "GTK 4's covered first captures judged by content (T9's shortened cap)"),
  experiment('F3a', 'own', 'load2', 30, [...FOCUS_KEYS, ...LOAD2], 'T7 revised at twice the load: burst, A-B-A, key then paste'),
  experiment('F3b', 'own', 'load2', 15, [...FOCUS_CLICKS, ...LOAD2], 'T7 revised at twice the load: click then paste, a click into another field then paste'),
  experiment('F4', 'own', 'load2', 10, [...FOCUS_STOPS, ...LOAD2], 'T7 revised at twice the load: SIGTERM straight after keys and after clicks', { pilot: asIs }),
];

/** The longest a step may be planned to take (the T18 executor's ruling 5). */
export const MAX_STEP_MINUTES = 45;

export const stepNamed = (name) => {
  const step = STEPS.find((s) => s.name === name);
  if (!step) throw new Error(`no gate step ${name}; the steps: ${STEPS.map((s) => s.name).join(', ')}`);
  return step;
};

/** A verdict step's operations: each scene's own (`SCENE_OPS`), or the part `only` names for a scene split across steps. */
export const verdictOps = (step) => [...new Set(step.scenes.flatMap((scene) => step.only[scene] ?? SCENE_OPS[scene]))];

/** A step's run name: one of its own per execution kind, so a gate's rows and a development run's never share one. */
export function runName(step, { gate, pilot }) {
  return `m4-${gate ? 'gate' : 'dev'}-${step.name}${pilot ? '-pilot' : ''}`;
}

/** The label every artifact of a step carries, and the directory name's form of it (candidate.mjs `gateLabel`). */
export function stepLabel({ gate, pilot }) {
  if (gate && pilot) throw new Error('a pilot is never a release gate: drop --pilot, or run it as a development run');
  return { label: gate ? 'release gate' : 'development run, not a release gate', slug: gate ? 'release-gate' : `development-run${pilot ? '.pilot' : ''}`, pilot: Boolean(pilot) };
}

/**
 * A step's arguments to its harness script, `--out` left to the launcher (run71.sh, gate.mjs): `paths` names the
 * candidate, the vendor builds and the vendor's JavaScript client. A gate's experiment takes `--gate` (candidate.mjs's
 * checks), a gate's verdict run takes none (it is a gate unless `--dev`); a development run's verdict takes `--dev`. A
 * pilot (`pilot`, a count) runs the step's smallest form: its `pilot` transform, or `--trials <count>`, and for a
 * verdict one block.
 */
export function stepArgs(step, { paths, gate, pilot = null }) {
  const run = runName(step, { gate, pilot });
  const fill = (args) => args.map((a) => ({ '{vendor}': paths.vendor, '{newest}': paths.newest })[a] ?? a);
  if (step.kind === 'verdict') {
    return [
      '--vendor', paths.vendor, '--newest', paths.newest, '--cua', paths.candidate,
      '--scene', step.scenes.join(','), '--ops', verdictOps(step).join(','),
      '--blocks', pilot ? '1' : '3', '--run', run,
      ...(step.ballast ? ['--ballast', 'gate'] : []),
      ...(gate ? [] : ['--dev']),
    ];
  }
  if (step.kind === 'facade') return ['--vendor-js', paths.vendorJs, '--engine', paths.candidate, ...step.args];
  // the suite's part alone: its engine, out and label are facade.sh's environment (`suiteEnv`)
  if (step.kind === 'suite') return [...step.args];
  const base = fill(step.args);
  const sized = pilot ? (step.pilot ?? ((args, n) => [...args, '--trials', String(n)]))(base, pilot) : base;
  return [...sized, '--cua', paths.candidate, '--run', run, ...(gate ? ['--gate'] : [])];
}

/** The harness script a step runs, relative to the checkout. */
export const stepScript = (step) => ({ facade: 'scripts/linux-engine-diff/services.mjs', suite: FACADE_SCRIPT })[step.kind] ?? 'scripts/linux-engine-diff.mjs';

/**
 * A suite step's environment for facade.sh: the candidate (a gate's the checked copy), its out directory in the step's
 * labelled directory, its log directory `logs` (a short scratch one: facade.sh starts the private desktop's session bus
 * under it, and a socket's path has 108 bytes; the pilot's R3 and R4 met "Socket name too long"), and its label
 * (`counted`, which refuses an unclean tree, or `pilot`).
 */
export const suiteEnv = ({ candidate, dir, gate, logs }) => ({ ENGINE_BIN: candidate, OUT: `${dir}/run`, LOGS: logs, LABEL: gate ? 'counted' : 'pilot' });

/** The planned minutes: in all, per display (`:0`, and private, the experiments' own servers included) and per load. */
export function totals(steps = STEPS) {
  const sum = (list) => list.reduce((n, s) => n + s.minutes, 0);
  const by = (key) => Object.fromEntries([...new Set(steps.map(key))].map((k) => [k, sum(steps.filter((s) => key(s) === k))]));
  return { all: sum(steps), display: by((s) => (s.display === ':0' ? ':0' : 'private')), load: by((s) => s.load) };
}
