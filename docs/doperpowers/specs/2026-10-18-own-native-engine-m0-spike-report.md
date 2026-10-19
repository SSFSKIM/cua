# M0 spike half: executor report (#117)

Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`. Branch `feat/117-own-native-engine`, commits 87065a2..1d8460d8 (this report's commit follows). Executed 2026-10-18/19 on the MacBook by the plan-executor for maws-3f. Nothing was run on the mini.

## Status

**DONE_WITH_CONCERNS.** The four build tasks are built and review-clean. The spike can prove the promote rule's speed half, probes (c), (c′) and (f), the goldens and the settle counts at the mini sitting. The engine's input half is **not built**: the owner is writing it by hand on `feat/117-input`.

Open item: the MacBook shakedown of the cua lane over the four scenes did not run. Every scene's preflight refused while one owner Finder window (number 183841) was open off screen, minimized or on another Space. Nothing launched.

## What was built

| Task | Paths | Commits | Review |
|---|---|---|---|
| T1 engine core (observation) | `native/engine/` (Swift 6, Apple frameworks only, SwiftPM test target), `scripts/spike/engine/assemble.mjs`, `test/native-engine*.test.mjs` | 0b7a1b9, fa6a80ac, cb3bfdf6, c20d3305 | clean after three fix rounds (opus reviewer; sol was at its usage limit until Oct 24) |
| T2 spike service | `scripts/spike/engine/{client,render,service,serve}.mjs`, `test/spike-engine-{client,render,service,serve}.test.mjs` | f674385, e9c79d5 | clean |
| T3 scenes and fixtures | `scripts/spike/engine/scenes.mjs`, `scene-processes.mjs`, `fixtures/` (Chrome for Testing 155.0.8059.84 pinned by SHA-256, the Electron fixture), `front-window.swift`, `electron` 44.9.0 dev dependency | 2c38a84..5741442 | clean |
| T4 measure | `scripts/spike/engine/measure.mjs`, `measure/`, `test/spike-engine-measure*.test.mjs` | 4aee098, 4977e1d, fc6e3e35 | clean after two rounds |

**Engine (build 52cf40cc…).**

Protocol and server:
- Socket server with `flock`, the uid check and the 0700 directory.
- 8 MiB framing, plus `ping`, `status`, `approve` and `shutdown` (atomic with accept).
- `list_apps`, and `resolve_app` by id, name, path or pid.

`get_app_state` returns the `Skyshot` of Interfaces (25fa9b1 and a8b0a931):
- the 20 attributes plus the renderer-grammar fields;
- the width rule with `shown.ranges`, depth 200, the node, value and 6 MiB budgets, menu-bar items;
- the public per-element fetch and the private `_AXUIElementCopyHierarchy` route, switchable per request (`prefetch`);
- one-attribute enablement, on web-shaped apps and the vendor's named bundles only;
- the web-area wait;
- lineage indexes: sibling-structural, never reused, a cut carries entries over, re-resolution gated by the monitor;
- the deferred settle, whose busy walk hands its reads to the observation, with notification counts in `timings`;
- the ScreenCaptureKit window capture with a cached shareable content;
- an os_log line on every exit path.

`click`, `press_key` and `type_text` answer `notImplemented`.

**Service and harness.**
- `serve.mjs` runs cua's own host through the real `buildLaunch` and `spawnUpstream`. The spike service sits behind the real `src/services/sky.mjs`; `src/` is untouched.
- `measure.mjs` provides `approve` (the full EngineInstall loop), `stop`, `status`, `probe-f`, the vendor and cua lanes, and `summary`.
- Input cells sit behind `CUA_INPUT_METHODS_BUILT` and report "not run: input methods not built" until it is set.
- The Finder redactor fails closed.

## Live results on the MacBook (development grants, owner-approved)

- **Approval.** Accessibility was visible to the running process at once. Screen Recording was visible only after relaunch. The first capture raised the per-bundle confirmation, which the owner answered.
- **Probe (f) on this Mac.** A staged rebuild at the same path with the same identity (b5b659bf, then 52cf40cc) kept both grants and raised no capture confirmation; the capture succeeded. A copy at a new path is still open for the mini.
- **First timings** (direction only: the MacBook was loaded and the vendor's 51 ms is the mini's figure). A 47-node TextEdit tree plus a screenshot took 109–218 ms on the engine side with the public route and 149–231 ms with the hierarchy route. Capture was 22–51 ms once shareable content was cached. App resolution alone was 30–39 ms per call.
- **Unexplained exit.** The engine exited once, between 21:55 and 21:57, after the capture confirmation was answered, with no crash report. Tests were ruled out, since all their paths are under scratch bundles. Exit logging now exists. Not reproduced since.

All of this is in the spec's Surprises & Discoveries.

## Decisions folded into the spec (Decision Log)

- **Pre-flight.** `resolve_app` runs per call and one elicitation is asked per app (the supervisor hop the designed service pays is noted for the verdict). Nothing prompts before the owner.
- **Interfaces extended.** Skyshot gains `menuBar`, `selectedElements` and `settle`. Node gains the optional attributes, `valueType`, `domClassList`, `focusable`/`selectable`/`disclosable`, `servesAsTitleFor`, `shown` and `ranges`. Indexes are numbered over the nodes the engine emits.
- **`cua/settle` placement.** It is set on the observation result.
- **Labelled departures.** Enablement is scoped. A retired index answers "no longer valid". The settle reuses its busy walk.
- **Open for critique** (Decision Log entry 1): the engine/service numbering split, `get_app_state` during the debounce, cross-connection paste, and enablement release.
- **Scope without input.** What the sitting proves now, and what waits for the owner's branch.

## Environmental friction

- **Input half withheld.** A model-side safety classifier withheld every agent asked to write the input half (posting, fake activation, the tap): three workers, plus the dispatching session. It also once withheld a worker whose context held that discussion. Per the dispatching session's rule, nothing was re-dispatched; the owner writes it.
- **sol unavailable.** sol is at its usage limit until Oct 24, so task reviews ran on opus.
- **Spec swept by the coordinator.** The coordinator's commit c9cdcb2 swept an uncommitted Surprises edit; the duplicate was removed. The coordinator now routes spec changes through me.

## Mini-sitting command list (the spec's Concrete Steps as corrected at 1d8460d8)

```
node scripts/spike/engine/measure.mjs stop --device mini
ssh mini 'rm -rf "Library/Application Support/cua/engine/staging" && mkdir -p "Library/Application Support/cua/engine/staging"'
tar -C /tmp/cua-engine-spike -cf - "cua Engine.app" | ssh mini 'tar -C "Library/Application Support/cua/engine/staging" -xf -'
ssh mini 'cd "Library/Application Support/cua/engine" && rm -rf previous && { [ -d "cua Engine.app" ] && mv "cua Engine.app" previous || true; } && mv "staging/cua Engine.app" "cua Engine.app"'
node scripts/spike/engine/measure.mjs approve --device mini        # OWNER at the console presses Enter once both grants are given, then answers the capture confirmation
node scripts/spike/engine/measure.mjs status --device mini
node scripts/native-baseline.mjs prepare --device mini --commit <sha>
ssh mini 'cd ~/Developer/GitHub/cua-parity && npm ci && node scripts/spike/engine/scenes.mjs place-chrome && node scripts/spike/engine/scenes.mjs build-electron'
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/scenes.mjs preflight --run "$(mktemp -d)"'   # refuses an owner Finder window on screen, a hidden Finder, a running TextEdit
node scripts/spike/engine/measure.mjs --device mini --lane vendor --runs 3 --approved-runtime <home> --probes c --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/vendor
node scripts/spike/engine/measure.mjs --device mini --lane cua    --runs 3 --approved-runtime <home> --probes c --node /opt/homebrew/bin/node --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/cua
node scripts/spike/engine/measure.mjs probe-f --device mini --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/probe-f
node scripts/spike/engine/measure.mjs summary docs/doperpowers/research/2026-10-18-own-native-engine/spike
```

These lines differ from the spec's original Concrete Steps as follows:

- The fixtures need `npm ci` plus `place-chrome` and `build-electron` on the device. Electron 44 has no postinstall step, so its binary is fetched on the first build.
- Preflight refuses any owner Finder window on screen (off-screen ones, including Finder's own document-sized window, are a note; Decision Log 2026-10-19), a hidden Finder, and any running TextEdit.
- The vendor triple must run first. Its guarded `super+2` sets the shared scene folder's list view, which the cua lane only checks.
- `--probes c` selects probe (c).
- `--node` names the own host's Node.
- `status` and `probe-f` are new commands.
- The approve loop's Enter is the operator's confirmation. On the MacBook the executor pressed it on the owner's relayed confirmation.

The mini's Node is v26.4.0 at `/opt/homebrew/bin/node`; that was read once at the start, with no GUI and no engine involved.

## Not run / pending

- **The MacBook cua-lane shakedown over the four scenes.** It needs owner Finder window 183841 closed. The Chrome for Testing and Electron fixture first launches, `open -g` on a folder, and the target roles are therefore unconfirmed live.
- **Probes (a), (b), (d) and (e), the action-sequence goldens and the cua lane's TextEdit task cells.** These wait for `feat/117-input`.
- **A full `npm test` at fc6e3e35.** It was interrupted to run `npm ci` for the window. The focused suites passed: native-engine 18/18 (Swift 52/52) and spike-engine 105/105.

## Unresolved review findings (deferred minors)

- **Finder `useCount` flake** in `test/native-engine.test.mjs`. It was seen once and has not reproduced.
- **Every result's `_meta` carries the per-call keys, mostly as `null`.** The own host's merge cannot delete a key, and measure.mjs reads `null` as absent.
- **`cua/engineMs` after a declined approval** holds the `resolve_app` round trip. This is cosmetic.
- **Rows/Columns bounds** are half-open in the engine. The renderer prints them only when lower < upper; whether the vendor's bounds are inclusive is for M1a's goldens.
- **Localized (Korean) role words weaken the Finder goldens** on the mini. This is privacy-safe: those lines are replaced whole.
- **The redactor's first element index sets the start** rather than assuming 0.
- **Enablement is never released**, so it stays set while the app keeps running. This is open for critique.

## Residue

- **The input half** (`feat/117-input`, owner). After it merges, set `CUA_INPUT_METHODS_BUILT`. Then run probes (a), (b), (d) and (e) and the action-sequence goldens in a second mini sitting. The input branch's one integration duty is `connection.markActed(app)` after posting.
- **The engine's unexplained exit** (2026-10-18 21:55–21:57). Exit logging now names every path. Reproduce the exit, or rule it out, before the sitting's cold rows count.
- **Cache app resolution in the engine.** Resolution costs 30–39 ms per call on the MacBook. This is the next tuning iteration before the promote verdict.
