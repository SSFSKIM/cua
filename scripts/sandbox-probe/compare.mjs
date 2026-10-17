// The #115 oracles' comparisons (M0, reused in M1): what the signed CLI handed sandbox-exec (capture-argv.c) against
// what the original's generator renders for the same input (scripts/sandbox-golden), and two launchers' behavioural
// fingerprints (fingerprint.c) against each other. Per-run values are normalized away (the CLI's arg0 directory under
// $CODEX_HOME/tmp/arg0, which it names at random per run; the session's run/<uuid>; pids; target paths, which
// fingerprints compare by label);
// every remaining difference is named, never summarized away.

const special = kind => ({type: 'special', value: {kind}});
const SPECIAL = {':root': 'root', ':tmpdir': 'tmpdir', ':minimal': 'minimal', ':slash_tmp': 'slash_tmp'};

// The original's permission profile for cua's -c table (src/runtime/sandbox.mjs sandboxPolicy's `filesystem`, in its
// order): `:workspace_roots = {"." = access}` is the project roots, the other `:` keys their special paths.
export function profileFromPolicy(policy, {network = 'restricted'} = {}) {
  return {type: 'managed', network, file_system: {type: 'restricted', entries: policy.filesystem.map(([key, access]) => {
    if (key === ':workspace_roots') {
      if (typeof access !== 'object' || Object.keys(access).join() !== '.') throw new Error(`unsupported :workspace_roots value ${JSON.stringify(access)}`);
      return {path: special('project_roots'), access: access['.']};
    }
    if (Object.hasOwn(SPECIAL, key)) return {path: special(SPECIAL[key]), access};
    return {path: {type: 'path', path: key}, access};
  })}};
}

// An environment as a name-sorted object, from KEY=VALUE strings or an object.
export function envObject(env) {
  const entries = Array.isArray(env) ? env.map(item => { const at = item.indexOf('='); return [item.slice(0, at), item.slice(at + 1)]; }) : Object.entries(env);
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function envDiff(left, right) {
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return {
    onlyLeft: names.filter(n => !Object.hasOwn(right, n)),
    onlyRight: names.filter(n => !Object.hasOwn(left, n)),
    differing: names.filter(n => Object.hasOwn(left, n) && Object.hasOwn(right, n) && left[n] !== right[n]).map(name => ({name, left: left[name], right: right[name]})),
  };
}

// sandbox-exec's argv split into its parts: ['-p', profile, ...-D params, '--', ...command].
const parts = args => {
  const dash = args.indexOf('--');
  return {flag: args[0], profile: args[1], params: args.slice(2, dash), command: args.slice(dash + 1)};
};

// `captured`: capture-argv.c's output; `golden`: the generator's for the same input. The signed CLI is the tag's, so it
// is compared with the symbolic TIOCSTI form.
export function compareCapture({captured, golden}) {
  if (!captured.captured) return {captured: false, tries: captured.tries};
  const c = parts(captured.argv.slice(1)), g = parts(golden.argsSymbolic);
  const cl = c.profile.split('\n'), gl = g.profile.split('\n');
  const at = cl.findIndex((line, i) => line !== gl[i]);
  const firstLine = at === -1 && cl.length !== gl.length ? Math.min(cl.length, gl.length) : at;
  const width = Math.max(c.params.length, g.params.length);
  const paramsDiffering = Array.from({length: width}, (_, index) => ({index, captured: c.params[index] ?? null, golden: g.params[index] ?? null}))
    .filter(p => p.captured !== p.golden);
  const env = envDiff(envObject(captured.env), envObject(golden.env));
  return {
    captured: true,
    argv0: captured.argv[0],
    argvEqual: JSON.stringify(captured.argv.slice(1)) === JSON.stringify(golden.argsSymbolic),
    profileEqual: c.profile === g.profile,
    ...(firstLine === -1 ? {} : {firstProfileDifference: {line: firstLine + 1, captured: cl[firstLine] ?? null, golden: gl[firstLine] ?? null}}),
    paramsDiffering,
    commandEqual: JSON.stringify(c.command) === JSON.stringify(g.command),
    env: {onlyCaptured: env.onlyLeft, onlyGolden: env.onlyRight, differing: env.differing.map(({name, left, right}) => ({name, captured: left, golden: right}))},
  };
}

// Named per run: the CLI's arg0 directory ($CODEX_HOME/tmp/arg0/codex-arg0<random>) and the session's run directory
// (run/<uuid>, with its temp).
const normalizeValue = value => value.replace(/codex-arg0[A-Za-z0-9]+/g, 'codex-arg0*')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<session>');

export function compareFingerprints(left, right) {
  const index = fp => new Map(fp.checks.map(row => [`${row.op}\u0000${row.label}`, row.result]));
  const a = index(left), b = index(right);
  const checks = [...new Set([...a.keys(), ...b.keys()])].sort().filter(key => a.get(key) !== b.get(key)).map(key => {
    const [op, label] = key.split('\u0000');
    return {op, label, left: a.get(key) ?? null, right: b.get(key) ?? null};
  });
  const normalize = env => Object.fromEntries(Object.entries(env).map(([k, v]) => [k, normalizeValue(v)]));
  const env = envDiff(normalize(left.env), normalize(right.env));
  const cwdEqual = normalizeValue(left.cwd) === normalizeValue(right.cwd);
  const equal = checks.length === 0 && env.onlyLeft.length + env.onlyRight.length + env.differing.length === 0 && cwdEqual && left.sandboxed === right.sandboxed;
  return {equal, sandboxed: [left.sandboxed, right.sandboxed], cwdEqual, checks, env};
}

// Two experiment.mjs runs: the confinement cell's outcomes key by key, and whether each cell succeeded (timings and
// counts aside: app and window counts move with the desktop).
export function compareExperiments(left, right) {
  const a = left.results.confinement?.value ?? {}, b = right.results.confinement?.value ?? {};
  const confinementDiffering = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => ({key, left: a[key] ?? null, right: b[key] ?? null}));
  const names = [...new Set([...Object.keys(left.results), ...Object.keys(right.results)])].filter(name => name !== 'confinement');
  const cells = Object.fromEntries(names.map(name => [name, [left.results[name]?.ok ?? null, right.results[name]?.ok ?? null]]));
  return {confinementEqual: confinementDiffering.length === 0 && Boolean(left.results.confinement?.ok) === Boolean(right.results.confinement?.ok), confinementDiffering,
    cells, cellsEqual: Object.values(cells).every(([x, y]) => x === y)};
}
