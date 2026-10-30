// The command line (Design, Interfaces and Dependencies, "The harness"), with M0's additions: `--variant` (a cua
// engine with extra flags, one more engine in the rotation), `--run` (a name for the rows a run appends),
// `--experiment` (the capture-readiness and key-pace measurements), `--record-wire` (the spike's wire fixtures) and
// `--summarize` (rewrite summary.md from results.jsonl); and M0.4's: `--experiment matrix` (the application-family
// matrix), `--family` (the families an experiment runs on, by name, families.mjs) and `--load` (every core busy
// during the experiment).

export const USAGE = `usage:
  linux-engine-diff.mjs --check-wire --vendor-js <@oai/sky directory>
  linux-engine-diff.mjs --vendor <bin> --newest <bin> --cua <bin> --scene <list> --ops <list|all> --out <dir>
      [--blocks 3] [--samples-tree 7] [--samples-input 5] [--variant <label>=<cua flags>]... [--run <name>]
      [--occlusion covered|visible|partial (drag, kinds)] [--no-counts] [--no-audit] [--via wire|vendor-js --vendor-js <@oai/sky directory>]
  linux-engine-diff.mjs --experiment capture-readiness|key-pace|matrix|qt-bridge|element-click|partial-cover|events|engine-readiness|drag|kinds|dnd --cua <bin> --out <dir> [--run <name>]
      [--vendor <bin> --newest <bin>] [--family <list>] [--load] [--samples-input 5] [--samples-text 2] [--trials 12] [--geometry WxH]
      [--via vendor-js --vendor-js <@oai/sky directory>] (events only) [--lanes <labels>] (drag, kinds)
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
    else if (flag === '--no-counts') a.counts = false;
    else if (flag === '--no-audit') a.audit = false;
    else if (flag === '--load') a.load = true;
    else if (flag === '--family') a.families = need().split(',').filter(Boolean);
    else if (flag === '--lanes') a.lanes = need().split(',').filter(Boolean);
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
    if (!['capture-readiness', 'key-pace', 'matrix', 'qt-bridge', 'element-click', 'partial-cover', 'events', 'engine-readiness', 'drag', 'kinds', 'dnd'].includes(a.experiment)) throw new Error(`unknown experiment ${a.experiment}\n${USAGE}`);
    if (['matrix', 'element-click', 'partial-cover', 'events'].includes(a.experiment)) require('vendor', 'newest');
    if (['qt-bridge', 'engine-readiness', 'drag', 'kinds', 'dnd'].includes(a.experiment)) require('vendor');
    // the drag and kinds experiments also measure a window with its bottom half covered (Gecko's cover condition)
    if (!['covered', 'visible', ...(['drag', 'kinds'].includes(a.experiment) ? ['partial', 'partial-deep'] : [])].includes(a.occlusion)) throw new Error(`--occlusion ${a.occlusion} is not one ${a.experiment} takes`);
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
