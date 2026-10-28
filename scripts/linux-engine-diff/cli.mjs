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
      [--occlusion covered|visible] [--no-counts]
  linux-engine-diff.mjs --experiment capture-readiness|key-pace|matrix|qt-bridge|element-click|partial-cover --cua <bin> --out <dir> [--run <name>]
      [--vendor <bin> --newest <bin>] [--family <list>] [--load] [--samples-input 5] [--samples-text 2]
  linux-engine-diff.mjs --record-wire --cua <bin>
  linux-engine-diff.mjs --summarize --out <dir>`;

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
const NUMBER_FLAGS = { '--blocks': 'blocks', '--samples-tree': 'samplesTree', '--samples-input': 'samplesInput', '--samples-text': 'samplesText' };

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
    else if (flag === '--load') a.load = true;
    else if (flag === '--family') a.families = need().split(',').filter(Boolean);
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
    if (!['capture-readiness', 'key-pace', 'matrix', 'qt-bridge', 'element-click', 'partial-cover'].includes(a.experiment)) throw new Error(`unknown experiment ${a.experiment}\n${USAGE}`);
    if (['matrix', 'element-click', 'partial-cover'].includes(a.experiment)) require('vendor', 'newest');
    if (a.experiment === 'qt-bridge') require('vendor');
  }
  else {
    require('vendor', 'newest', 'cua', 'out');
    if (a.scenes.length === 0) throw new Error(`--scene is required\n${USAGE}`);
    if (!a.ops) throw new Error(`--ops is required\n${USAGE}`);
    if (a.via && a.via !== 'wire') throw new Error('--via vendor-js arrives with M1a; M0 drives the engines over the wire');
    if (!['covered', 'visible'].includes(a.occlusion)) throw new Error('--occlusion is covered or visible');
  }
  return a;
}
