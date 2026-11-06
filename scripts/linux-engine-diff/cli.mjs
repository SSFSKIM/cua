// The command line (Design, Interfaces and Dependencies, "The harness"), with M0's additions: `--variant` (a cua
// engine with extra flags, one more engine in the rotation), `--run` (a name for the rows a run appends),
// `--experiment` (the capture-readiness and key-pace measurements), `--record-wire` (the spike's wire fixtures) and
// `--summarize` (rewrite summary.md from results.jsonl); and M0.4's: `--experiment matrix` (the application-family
// matrix), `--family` (the families an experiment runs on, by name, families.mjs) and `--load` (every core busy
// during the experiment); and #267's: a verdict run is a release gate on the attested candidate `--cua` names
// (candidate.mjs), or `--dev`, a run on any build that is not one.

export const USAGE = `usage:
  linux-engine-diff.mjs --check-wire --vendor-js <@oai/sky directory>
  linux-engine-diff.mjs --vendor <bin> --newest <bin> --cua <artifact> --scene <list> --ops <list|all> --out <dir>
      [--dev] [--blocks 3] [--samples-tree 7] [--samples-input 5] [--variant <label>=<cua flags>]... [--run <name>]
      [--occlusion covered|visible|partial (drag, kinds)] [--no-counts] [--no-audit] [--via wire|vendor-js --vendor-js <@oai/sky directory>]
  linux-engine-diff.mjs --experiment capture-readiness|key-pace|matrix|qt-bridge|element-click|partial-cover|events|engine-readiness|drag|kinds|dnd|atspi|focus-timer|engine-stop|qt-activation|settle --cua <bin> --out <dir> [--run <name>]
      [--vendor <bin> --newest <bin>] [--family <list>] [--load | --load-factor <workers per core>] [--no-grabs] [--dnd-short] [--stops-only] [--exit-settle-ms <ms>] [--scenarios <list>] [--lanes <list>] [--trace] (focus-timer) [--dnd-cold [--cover-ms N] [--prelude dedicated] [--ballast gate] [--stray nudge|popup:N] [--park-pointer X,Y]] (dnd) [--samples-input 5] [--samples-text 2] [--trials 12] [--geometry WxH]
      [--via vendor-js --vendor-js <@oai/sky directory>] (events only) [--lanes <labels>] (drag, kinds, dnd, engine-stop, qt-activation)
      [--released <bin>] [--kinds click,key-click,press_key,drag,scroll] (qt-activation)
      [--control-root <cua checkout> [--paths idle,eof,signal,remote,held-back] [--cases hold,burst,handle] [--sandbox scoped|disabled] [--require-burst-cut]] (engine-stop)
      [--family <list>] [--kinds <list>] [--routes background,desktop,dedicated] [--lanes shipped,settle-<ms>...] [--no-audit] (settle)
  linux-engine-diff.mjs --record-wire --cua <bin>
  linux-engine-diff.mjs --summarize --out <dir>`;

/** The operations of the `desktop` scene (run.mjs SCENE_OPS.desktop), the ones that need no scene window. */
export const DESKTOP_OPS = ['list_windows'];

const VALUE_FLAGS = {
  '--vendor': 'vendor',
  '--newest': 'newest',
  '--cua': 'cua',
  '--out': 'out',
  '--vendor-js': 'vendorJs',
  '--via': 'via',
  '--run': 'run',
  '--experiment': 'experiment',
  '--occlusion': 'occlusion',
  // the engine-stop experiment's control: a checkout whose REPL host stops the tree at once (engine-stop.mjs)
  '--control-root': 'controlRoot',
  // the qt-activation experiment's released lane: cua's engine as a release shipped it (qt-activation.mjs)
  '--released': 'released',
};
const NUMBER_FLAGS = { '--blocks': 'blocks', '--samples-tree': 'samplesTree', '--samples-input': 'samplesInput', '--samples-text': 'samplesText', '--trials': 'samplesTrials', '--first-rounds': 'firstRounds' };

export function parseArgs(argv) {
  const a = {
    mode: 'run',
    blocks: 3,
    samplesTree: 7,
    samplesInput: 5,
    samplesText: 2,
    variants: [],
    families: [],
    load: false,
    scenes: [],
    ops: null,
    occlusion: 'covered',
    counts: true,
    audit: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    const need = () => {
      if (value === undefined) throw new Error(`${flag} needs a value`);
      i += 1;
      return value;
    };
    if (flag === '--check-wire') a.mode = 'check-wire';
    else if (flag === '--record-wire') a.mode = 'record-wire';
    else if (flag === '--summarize') a.mode = 'summarize';
    // a verdict run on any build, its verdict labelled not a release gate (candidate.mjs); without it the run is a gate
    else if (flag === '--dev') a.dev = true;
    else if (flag === '--no-counts') a.counts = false;
    else if (flag === '--no-audit') a.audit = false;
    // the dnd experiment without its 100 ms grab sampler, whose own grabs can fail Chrome's drag-start grab (M3.1)
    else if (flag === '--no-grabs') a.grabs = false;
    // the dnd experiment on the page's short drop (40 px from the near source), every lane's window activated first
    else if (flag === '--dnd-short') a.dndShort = true;
    // the focus-timer experiment's stop runs alone (the exit settle's measured steps, with --exit-settle-ms)
    else if (flag === '--stops-only') a.stopsOnly = true;
    // the focus-timer experiment's series of these scenarios alone, with no stop runs
    else if (flag === '--scenarios') a.scenarios = need().split(',').filter(Boolean);
    // the focus-timer experiment's series runs each through xtrace, a missed run's trace kept (a sitting of its own)
    else if (flag === '--trace') a.trace = true;
    // the stop runs' exit settle, 0 included
    else if (flag === '--exit-settle-ms') {
      const n = Number(need());
      if (!Number.isInteger(n) || n < 0) throw new Error('--exit-settle-ms needs a whole number of milliseconds');
      a.exitSettleMs = n;
    }
    // the dnd experiment cold (task 20): every drag the first request of a fresh engine, the lanes interleaved, each
    // window in front after the device case's settle; `--cover-ms` covers it fully first, as the gate's previous case did
    else if (flag === '--dnd-cold') a.dndCold = true;
    // each cold drag after the gate's case before it: cua's dedicated long drop into the covered window (foreground route)
    else if (flag === '--prelude') {
      if (need() !== 'dedicated') throw new Error('--prelude takes dedicated: the device case before the cold drop in a block');
      a.prelude = 'dedicated';
    }
    // measurement only: another client's momentary pointer and keyboard grab, that long after each cold drag is sent
    else if (flag === '--stray') {
      const m = need().match(/^(nudge|popup):(\d+)$/);
      if (!m) throw new Error('--stray needs nudge:<ms> or popup:<ms>');
      a.stray = { kind: m[1], ms: Number(m[2]) };
    }
    // measurement only: the real pointer parked at <x>,<y> (screen) just before each cold drag's window is put in front
    else if (flag === '--park-pointer') {
      const m = need().match(/^(\d+),(\d+)$/);
      if (!m) throw new Error('--park-pointer needs <x>,<y>');
      a.parkPointer = { x: Number(m[1]), y: Number(m[2]) };
    }
    // and with the gate's other Chrome windows open behind it (dnd.mjs GATE_BALLAST), as a full verdict run has them
    else if (flag === '--ballast') {
      if (need() !== 'gate') throw new Error('--ballast takes gate: the Chrome windows of a full verdict run');
      a.ballast = 'gate';
    }
    else if (flag === '--cover-ms') {
      const n = Number(need());
      if (!Number.isInteger(n) || n < 0) throw new Error('--cover-ms needs a whole number of ms, 0 or more');
      a.coverMs = n;
    }
    else if (flag === '--load') a.load = true;
    else if (flag === '--load-factor') {
      // CPU workers per core under --load (M3.1: a drag-and-drop race's edge is found by raising it)
      a.load = true;
      a.loadFactor = Number(need());
    }
    else if (flag === '--family') a.families = need().split(',').filter(Boolean);
    // the qt-activation and settle experiments' input kinds (qt-activation.mjs KINDS, action-settle-cells.mjs KIND_METHOD)
    else if (flag === '--kinds') a.kinds = need().split(',').filter(Boolean);
    // the settle experiment's routes (action-settle-cells.mjs CELLS)
    else if (flag === '--routes') {
      a.routes = need().split(',').filter(Boolean);
      for (const route of a.routes) if (!['background', 'desktop', 'dedicated'].includes(route)) throw new Error('--routes takes background, desktop and dedicated');
    }
    else if (flag === '--lanes') a.lanes = need().split(',').filter(Boolean);
    // the engine-stop experiment's stop paths, by name (engine-stop.mjs PATHS)
    else if (flag === '--paths') a.paths = need().split(',').filter(Boolean);
    // and its cases (engine-stop.mjs CASES), and the sandbox its cua serve runs the REPL host under
    else if (flag === '--cases') a.cases = need().split(',').filter(Boolean);
    // the control's bursts must show the cut, not merely be reported (engine-stop.mjs `engineStopVerdict`)
    else if (flag === '--require-burst-cut') a.requireBurstCut = true;
    else if (flag === '--sandbox') {
      const mode = need();
      if (!['scoped', 'disabled'].includes(mode)) throw new Error('--sandbox is scoped or disabled');
      a.sandbox = mode;
    }
    else if (flag === '--geometry') {
      const m = need().match(/^(\d+)x(\d+)$/);
      if (!m) throw new Error('--geometry needs <width>x<height>');
      a.geometry = [Number(m[1]), Number(m[2])];
    }
    else if (flag in VALUE_FLAGS) a[VALUE_FLAGS[flag]] = need();
    else if (flag in NUMBER_FLAGS) {
      const n = Number(need());
      if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a positive integer`);
      a[NUMBER_FLAGS[flag]] = n;
    } else if (flag === '--scene') a.scenes = need().split(',').filter(Boolean);
    else if (flag === '--ops') a.ops = need() === 'all' ? 'all' : value.split(',').filter(Boolean);
    else if (flag === '--variant') {
      const spec = need();
      const eq = spec.indexOf('=');
      if (eq < 1) throw new Error(`--variant needs <label>=<flags>, not ${spec}`);
      a.variants.push({ label: `cua:${spec.slice(0, eq)}`, args: spec.slice(eq + 1).split(/\s+/).filter(Boolean) });
    } else throw new Error(`unknown argument ${flag}\n${USAGE}`);
  }
  if (a.experiment) a.mode = 'experiment';
  for (const [key, flag] of [['coverMs', '--cover-ms'], ['prelude', '--prelude'], ['ballast', '--ballast'], ['stray', '--stray'], ['parkPointer', '--park-pointer']]) {
    if (a[key] !== undefined && !a.dndCold) throw new Error(`${flag} is the cold drag-and-drop run's (--dnd-cold)`);
  }
  if (a.dndCold) a.coverMs ??= 0;
  if (a.dev && a.mode !== 'run') throw new Error('--dev is the verdict run\'s: only a verdict run is a release gate');
  const require = (...keys) => {
    for (const key of keys) {
      const flag = Object.entries({ ...VALUE_FLAGS }).find(([, k]) => k === key)?.[0] ?? `--${key}`;
      if (!a[key] || (Array.isArray(a[key]) && a[key].length === 0)) throw new Error(`${flag} is required\n${USAGE}`);
    }
  };
  if (a.mode === 'check-wire') require('vendorJs');
  else if (a.mode === 'record-wire') require('cua');
  else if (a.mode === 'summarize') require('out');
  else if (a.mode === 'experiment') {
    require('cua', 'out');
    if (!['capture-readiness', 'key-pace', 'matrix', 'qt-bridge', 'element-click', 'partial-cover', 'events', 'engine-readiness', 'drag', 'kinds', 'dnd', 'atspi', 'focus-timer', 'engine-stop', 'qt-activation', 'settle'].includes(a.experiment)) throw new Error(`unknown experiment ${a.experiment}\n${USAGE}`);
    if (['matrix', 'element-click', 'partial-cover', 'events'].includes(a.experiment)) require('vendor', 'newest');
    if (['qt-bridge', 'engine-readiness', 'drag', 'kinds', 'dnd'].includes(a.experiment)) require('vendor');
    // the drag and kinds experiments also measure a window with its bottom half covered (Gecko's cover condition)
    if (!['covered', 'visible', ...(['drag', 'kinds'].includes(a.experiment) ? ['partial', 'partial-deep', 'partial-top'] : [])].includes(a.occlusion)) throw new Error(`--occlusion ${a.occlusion} is not one ${a.experiment} takes`);
    // the events experiment's desktop-only commands through OpenAI's JavaScript client
    if (a.via && !(a.experiment === 'events' && ['wire', 'vendor-js'].includes(a.via))) throw new Error('--via is wire or vendor-js, and among the experiments only events takes it');
    if (a.via === 'vendor-js' && !a.vendorJs) throw new Error(`--via vendor-js needs --vendor-js <@oai/sky directory>\n${USAGE}`);
  }
  else {
    require('vendor', 'newest', 'cua', 'out');
    if (!a.ops) throw new Error(`--ops is required\n${USAGE}`);
    // the desktop's operations (list_windows) need no scene; everything else does
    const desktopOnly = a.ops !== 'all' && a.ops.length > 0 && a.ops.every((op) => DESKTOP_OPS.includes(op));
    if (a.scenes.length === 0 && !desktopOnly) throw new Error(`--scene is required\n${USAGE}`);
    if (a.via && !['wire', 'vendor-js'].includes(a.via)) throw new Error('--via is wire or vendor-js');
    if (a.via === 'vendor-js' && !a.vendorJs) throw new Error(`--via vendor-js needs --vendor-js <@oai/sky directory>\n${USAGE}`);
    if (!['covered', 'visible'].includes(a.occlusion)) throw new Error('--occlusion is covered or visible');
  }
  // the vendor client starts the binary it is pointed at with no flags of ours, so a variant would measure the defaults
  if (a.via === 'vendor-js' && a.variants.length) throw new Error('--via vendor-js cannot run --variant lanes: the vendor client starts the engine without their flags');
  return a;
}
