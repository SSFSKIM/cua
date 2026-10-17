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

// cua's port (src/sandbox/seatbelt.mjs, M1) against the signed CLI's capture for the same input: `port` is {args,
// env} from the port, its args in cua's numeric TIOCSTI form (a recorded deviation), read here in the tag's form. The
// child environments may differ only by what the CLI adds and cua's launcher leaves out: its arg0 PATH entry and
// CoreFoundation's __CF_USER_TEXT_ENCODING. -> compareCapture's result plus {tiocsti, cliOnlyEnv, equalButDeviations}.
const TIOCSTI = {numeric: '(deny file-ioctl (ioctl-command 2147578994))', symbolic: '(deny file-ioctl (ioctl-command TIOCSTI))'};
export function comparePortToCapture({captured, port}) {
  const [flag, profile, ...rest] = port.args;
  const numeric = profile.endsWith(`\n${TIOCSTI.numeric}`);
  const asTag = numeric ? `${profile.slice(0, -TIOCSTI.numeric.length)}${TIOCSTI.symbolic}` : profile;
  const result = compareCapture({captured, golden: {argsSymbolic: [flag, asTag, ...rest], env: port.env}});
  if (!result.captured) return result;
  const cliOnlyEnv = [];
  const differing = result.env.differing.filter(({name, captured: c, golden: g}) => {
    if (name === 'PATH' && /^[^:]*\/tmp\/arg0\/codex-arg0[A-Za-z0-9]+:/.test(c) && c.slice(c.indexOf(':') + 1) === g) { cliOnlyEnv.push('the CLI\'s arg0 PATH entry'); return false; }
    return true;
  });
  const onlyCaptured = result.env.onlyCaptured.filter(name => {
    if (name === '__CF_USER_TEXT_ENCODING') { cliOnlyEnv.push(name); return false; }
    return true;
  });
  return {...result, tiocsti: numeric ? 'numeric' : 'symbolic', cliOnlyEnv,
    equalButDeviations: result.argvEqual && !differing.length && !onlyCaptured.length && !result.env.onlyGolden.length};
}

// Named per run: the CLI's arg0 directory ($CODEX_HOME/tmp/arg0/codex-arg0<random>) and the session's run directory
// (run/<uuid>, with its temp).
const normalizeValue = value => value.replace(/codex-arg0[A-Za-z0-9]+/g, 'codex-arg0*')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<session>');

// Checks are matched by (op, filter, label) and compared by result and errno: two failures of the same check are
// different outcomes when their errno differs (EPERM from the sandbox against ECONNREFUSED from an absent listener).
export function compareFingerprints(left, right) {
  const SEP = '\u0000';
  const index = fp => new Map(fp.checks.map(row => [[row.op, row.filter, row.label].join(SEP), {result: row.result, errno: row.errno ?? null}]));
  const a = index(left), b = index(right);
  const checks = [...new Set([...a.keys(), ...b.keys()])].sort()
    .filter(key => JSON.stringify(a.get(key) ?? null) !== JSON.stringify(b.get(key) ?? null)).map(key => {
      const [op, filter, label] = key.split(SEP);
      return {op, filter, label, left: a.get(key) ?? null, right: b.get(key) ?? null};
    });
  const normalize = env => Object.fromEntries(Object.entries(env).map(([k, v]) => [k, normalizeValue(v)]));
  const env = envDiff(normalize(left.env), normalize(right.env));
  const cwdEqual = normalizeValue(left.cwd) === normalizeValue(right.cwd);
  const equal = checks.length === 0 && env.onlyLeft.length + env.onlyRight.length + env.differing.length === 0 && cwdEqual && left.sandboxed === right.sandboxed;
  return {equal, sandboxed: [left.sandboxed, right.sandboxed], cwdEqual, checks, env};
}

// #115 M1: what the port's one widening (src/sandbox/seatbelt.mjs header, the metadata of denied ancestors) may give, in
// a kernel fingerprint under cua's launcher: the cua home and its run/ resolvable (metadata) but not listable (data), and
// another session's run directory neither. -> {ok, rows: [{label, op, want, got}]}; a missing row is no pass.
const GRANT_PINS = [['cua-home', 'allow', 'deny'], ['cua-home/run', 'allow', 'deny'], ['cua-home/run/other', 'deny', 'deny']];
export function metadataGrantPins(fingerprint) {
  const got = (label, op) => fingerprint.checks.find(row => row.filter === 'path' && row.label === label && row.op === op)?.result ?? null;
  const rows = GRANT_PINS.flatMap(([label, metadata, data]) => [['file-read-metadata', metadata], ['file-read-data', data]]
    .map(([op, want]) => ({label, op, want, got: got(label, op)})));
  return {ok: rows.every(row => row.got === row.want), rows};
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
