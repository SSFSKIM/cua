# Gate #184, the route A/B half: removed as overtaken

- **Ticket:** [#184](https://github.com/SSFSKIM/cua/issues/184), M2b's hold-3 proof (the same-build triple and hold
  3's route A/B). Gate of the macOS default switch (M5 pre-flight §6), task T8b for the A/B half.
- **State:** the A/B half is removed on `feat/117-m5`. Its witness is the removal's diff, so it needs no runner.
  **Closed as overtaken** once the diff lands. The triple half stays open, and T13 closes it with sitting C.

## The ruling

Ruling 1108 (the M4/M5 pre-flight's rulings; posted on #184): **#184's route A/B is closed as overtaken, and
`CUA_ENGINE_SPIKE_ROUTE` is removed.**

- The A/B compared an element click's natural route against a forced route 1 on the Electron fixture's button, which
  is behind the user window.
- The routes it compared have since been rebuilt by #200, #282 and #453 to #463.
- Hold 10's five valid samples (forced route 1 2/2, natural route 3 3/3) therefore describe an engine that no longer
  exists.

The pre-flight's closing condition (§6, "Who closes each gate") is: "`CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell
are gone, and the ticket's A/B part is closed as overtaken."

## The change

Commit `99a2e812b`: "native matrix and engine service: hold 3's route A/B is removed, CUA_ENGINE_SPIKE_ROUTE with it
(refs #184)". It removes:

- **The engine service's switch** (`src/services/engine/service.mjs`): the service no longer forwards a click's
  `spikeRoute` under any environment. The vendor-field whitelist (`FIELDS`) is now the only thing a request forwards,
  as bd1136f1 had it before hold 3.
- **The harness serve's launch hook** (`scripts/native-baseline/spike-route.mjs`, deleted, with its test), its use in
  `scripts/native-baseline/serve.mjs`, and the serve command's `spikeRoute` option (`scripts/native-baseline/remote.mjs`,
  `scripts/native-matrix/lane.mjs`).
- **The matrix's `route-ab` cell**: `scripts/native-matrix/route-ab.mjs` and its test (deleted); the registry entry;
  the `route-ab` plan, the `routeAb` plan field, its scenes and its section in `run.mjs`; the `route-ab` row section
  in `cell-result.mjs`; the `--natural-only` flag in `scripts/native-matrix.mjs`.
- **The tracker entry**: the env-gated spike route moved to Resolved in `tech-debt-tracker.md`.
- **One test**: `test/runtime-launch.test.mjs`'s "an ambient CUA_ENGINE_SPIKE_ROUTE=1 never reaches the worker". Its
  variable no longer exists. That the launch drops the caller's environment is tested elsewhere in the same file.

What stays, and why:

- **The engine's own `spikeRoute` argument** (`native/engine/Sources/Engine/Input.swift`, `spikeRouteArg`). The engine
  never read `CUA_ENGINE_SPIKE_ROUTE`; the variable lived only in the service and the harness. The M0 spike's measure
  harness still sends the argument through its own service (`scripts/spike/engine/`). No product path reaches it now.
  No Swift changed, so `engineVersion` is untouched.
- **The record**: hold 3's `route-ab` results (`docs/doperpowers/research/2026-10-18-own-native-engine/m2b/hold3/`),
  the design spec's Decision Log entries (2026-10-22, "hold 3's route A/B") and the M2b report. They are record, not
  live descriptions. Today's `summary` reads hold 3's `matrix/` directory as before. The `route-ab` result files
  beside it no longer validate, since their section is gone, but no judgment reads them.

## Unit witnesses

Each was written first and failed against the code before the removal
(`node --test test/native-matrix/cli.test.mjs test/native-matrix/registry.test.mjs test/native-baseline/remote.test.mjs test/services-engine-service.test.mjs`):

```
not ok 3 - a macOS computer serve and its preflight name the requested native engine; the preflight reads the approved engine on the device
not ok 14 - hold 3's route A/B is gone (ruling 1108, #184): --natural-only is no option of any cell
not ok 15 - the matrix's own cells resolve to plans, the probe cells and the Korean matrix among them; an unknown one lists the cells
not ok 28 - a click's spikeRoute never reaches the engine, whatever the worker's environment
# pass 60
# fail 4
```

- `test/services-engine-service.test.mjs`, "a click's spikeRoute never reaches the engine, whatever the worker's
  environment". With no environment and with `CUA_ENGINE_SPIKE_ROUTE=1`, a click carrying any `spikeRoute` reaches the
  engine as `{app, element}` and nothing more. Before the removal, the variable forwarded the route.
- `test/native-baseline/remote.test.mjs`: no serve command sets the variable, even one asked with `spikeRoute: true`.
- `test/native-matrix/registry.test.mjs`: `route-ab` resolves to no cell and no plan, and `cell --list` no longer
  names it.
- `test/native-matrix/cli.test.mjs`: `--natural-only` is an unknown option, and the usage names neither it nor
  `route-ab`.

After: services-engine-service 44/44, remote 12/12, registry 6/6, cli 2/2, runtime-launch 56/56. The native-matrix
and native-baseline suites with both of those files: 652/652.

## The removal's witness

The tree outside the record, after `99a2e812b`:

```
$ git grep -n -e CUA_ENGINE_SPIKE_ROUTE -e route-ab -e natural-only -e spike-route -- src scripts native test bin hooks skills .github
test/native-baseline/remote.test.mjs:36:  assert.doesNotMatch(serveCommand({...at, engine: 'cua', spikeRoute: true}).args[3], /CUA_ENGINE_SPIKE_ROUTE/);
test/native-matrix/cli.test.mjs:19:test('hold 3\'s route A/B is gone (ruling 1108, #184): --natural-only is no option of any cell', () => {
test/native-matrix/cli.test.mjs:20:  assert.throws(() => parseCommand(['cell', 'korean', ...LANE, '--natural-only']), /Unknown option '--natural-only'/);
test/native-matrix/cli.test.mjs:21:  assert.doesNotMatch(USAGE, /natural-only|route-ab/);
test/native-matrix/registry.test.mjs:46:  await assert.rejects(resolveCell('route-ab', {load}), /no cell route-ab/);
test/native-matrix/registry.test.mjs:47:  assert.throws(() => planOf('route-ab'), /no plan route-ab/);
test/services-engine-service.test.mjs:260:  for (const env of [{}, {CUA_ENGINE_SPIKE_ROUTE: '1'}]) {
```

Every remaining line is a test that the name is gone.

## Closing condition (met by the diff)

`CUA_ENGINE_SPIKE_ROUTE` and the `route-ab` cell are gone, and the ticket's A/B part is closed as overtaken. Once the
branch lands, post that on #184 with this file's link. The ticket stays open for the triple.

## What remains

- **#184's same-build triple**: three valid vendor/cua pairs judged at one frozen head, which is sitting C (T13).
  Nothing in this removal touches it.
- **Folding**: the design spec's Decision Log entry of 2026-10-22 ("a click's `spikeRoute` reaches the engine from
  model code only under `CUA_ENGINE_SPIKE_ROUTE=1`") wants a successor entry saying the switch was removed under
  ruling 1108. That is the design session's to fold.
