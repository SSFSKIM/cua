# M0 spike half: executor report (#117)

Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`. Branch `feat/117-own-native-engine`. My commits run from 87065a2 to this report's commit. The range also carries the dispatching session's spec commits, the reading agent's research commits, and two merges of the owner's input branches (5bc152a0, 0e8cbd77).

Executed 2026-10-18/19 on the MacBook by the plan-executor for maws-3f. Nothing has run on the mini.

## Status

**DONE_WITH_CONCERNS: ready for the mini sitting.**

All build tasks are reviewed clean, and the owner's input half is merged. The sitting can now prove:
- both halves of the promote rule;
- every probe, (a) through (f);
- the goldens, including the action sequences;
- the settle counts.

The MacBook windows ran the cua lane once without input (the shakedown) and the vendor lane once. They ended before the cua lane could run with input; the reason is under "MacBook windows" below.

## What was built

| Part | Paths | Commits | Review |
|---|---|---|---|
| Engine, observation half | `native/engine/` (Swift 6, Apple frameworks only, SwiftPM test target), `scripts/spike/engine/assemble.mjs`, `test/native-engine*.test.mjs` | 0b7a1b9, fa6a80ac, cb3bfdf6, c20d3305, 1ca14d9c, 558e7071, 8b30523f | clean after three rounds, then the tuning rounds |
| Engine, input half (the owner's) | `Input.swift`, `Keyboard.swift`, `Mouse.swift`, `Activation.swift`, `Tap.swift`, `Probe.swift` | merged as 5bc152a0 and 0e8cbd77 | reviewed on the owner's branch |
| Spike service | `scripts/spike/engine/{client,render,service,serve}.mjs` and their tests | f674385, e9c79d5, 0661048a | clean |
| Scenes and fixtures | `scenes.mjs`, `scene-processes.mjs`, `fixtures/` (Chrome for Testing 155.0.8059.84 pinned by SHA-256, the Electron fixture), `front-window.swift`, the `electron` 44.9.0 dev dependency | 2c38a84..5741442, cdefe035, 7b5c0a50, 6cfb3cdc, b470b293, ccf1043c | clean |
| Measure | `measure.mjs`, `measure/` (both lanes, local and over ssh; approve, stop, status, cleanup, probe-f, summary) | 4aee098 .. bc45ba85 | clean |

**Engine (build b6d962fe at the window; rebuilt for the sitting).**
- Protocol and server:
  - the socket server with `flock`, the uid check and the 0700 directory;
  - 8 MiB framing;
  - `ping`, `status`, `approve`, and `shutdown` (atomic with accept);
  - `list_apps`, and `resolve_app` with a resolution cache;
  - the forbidden list enforced on every app-scoped `execute`.
- `get_app_state`, returning the Interfaces `Skyshot`:
  - the 20-attribute set plus the renderer-grammar fields;
  - the width rule, depth 200, and the budgets;
  - the menu bar;
  - the public fetch and the private `_AXUIElementCopyHierarchy` route, each switchable;
  - `readSet: full|reduced` with a census;
  - one-attribute enablement for web-shaped apps and the vendor's named bundles, with the web-area wait run once per process;
  - lineage indexes;
  - the deferred settle, which reuses its tree and reports notification counts;
  - the ScreenCaptureKit capture with cached shareable content.
- Input (the owner's): routes 1–3, keys, the listen-only tap, and the keystroke probe. Every error from an input method carries the input meta.
- An os_log line on every exit path.

**Service and harness.**
- `serve.mjs` runs cua's own host through the real `buildLaunch`, with the spike service behind the real `src/services/sky.mjs`; `src/` is untouched.
- The service resolves once per (connection, app) and forwards the spike switches.
- `measure.mjs` runs both lanes on a declared device and on this Mac. On this Mac, the vendor lane runs through prepare.mjs's approved-home functions in process, with guards for a live home.
- Input cells and probes are on (`CUA_INPUT_METHODS_BUILT`).
- The Finder redactor fails closed.

## Live results on the MacBook (development grants; direction only)

- **Approval and probe (f).**
  - Accessibility was visible to the running process at once; Screen Recording only after a relaunch.
  - A new bundle copy raised the capture confirmation once.
  - Staged rebuilds at the same path and identity re-raised nothing.
  - The scratch home's vendor helper copy, at a new path, raised the confirmation once.
- **Shakedown, cua lane before tuning** (in-cell medians):
  - TextEdit: getAXState 156 ms, getScreenshot 126 ms.
  - Trees: TextEdit 118, Finder-200 474, Chrome 264, Electron 205 ms.
- **Vendor lane on the same Mac** (window 3): this is the same-machine baseline.
  - TextEdit: getAXState 78 ms, getScreenshot 84 ms; task.total 4,360 ms.
  - Trees: TextEdit 94, Chrome 84, Electron 75, Finder 669 ms (14 valid samples).
  - Screenshots: Chrome 81, Electron 77 ms.
  - The vendor exposed no web content on either Chromium scene: 45 and 12 elements, with the page containers empty. cua exposed both pages' controls. This is a finding-elements result; its cause is still unknown.
- **Tuning findings.**
  - Resolution is not the cost: the engine takes 0.2–0.6 ms.
  - The in-cell gap is the service's relay round trips plus the render.
  - Settle at rest gets to the vendor's quiet point; its extra time is tree reads.
  - The web-area wait ran on every observation, about 145 ms each. It now runs once per process.
  - The reduced read set saves about 22 ms on Finder-200. The big reads, actions and focusable, need a live census first.
- **Taints** (in window 3's `taint.json`): the owner quit Finder mid-run, which voids Finder rows after 00:26:46 local and every input row from then on.

All of this is in the spec's Surprises & Discoveries.

## MacBook windows: what stopped them

- The owner's terminal (cmux) brought itself to the front on terminal activity, including this run's own output. The harness's #162 key guard and front-window checks then refused, correctly.
- **The general lesson** (recorded in Surprises): the Mac running a sitting must have no app at its console that activates on terminal activity, including whatever hosts the coordinating session. The mini is driven over SSH, with Terminal.app at its console, and meets this.
- Harness bugs found and fixed through the windows:
  - the missing `appWindowState` import;
  - recovery of a stale Finder record;
  - scenes.mjs's answer lost on exit 1, now fail-closed;
  - the action-target matcher;
  - a Finder action target that sat outside the visible rows;
  - the Chrome translate bubble breaking the fixed state.

## Decisions folded into the spec (Decision Log, chronological)

- **Pre-flight**, then revised. Resolution is cached per (connection, app), and the engine enforces the forbidden list on every call. Folding resolution into get_app_state was rejected, because it would observe before approval.
- **Interfaces extended** to the renderer's grammar. `cua/settle` moved onto the observation result. Every error from an input method carries the input meta.
- **Labelled departures:**
  - scoped enablement;
  - "no longer valid" for a retired index;
  - settle reuse;
  - the web-area wait once per process;
  - the per-role read set, proven by rendering equivalence.
- **Scenes:** the Finder refusal counts on-screen windows only. A hidden Finder refuses, and so does an unreadable hidden state.
- **Scope:** the owner wrote the input half. The agents' attempts were withheld by a safety classifier; see Surprises.
- **Open for critique** (Decision Log entry 1):
  - the engine/service numbering split;
  - get_app_state during the debounce;
  - cross-connection paste;
  - enablement release;
  - settle options (b) and (c).

## Mini sitting

**Needs from the CI-opt hold.**
- The mini's CI runner is paused and idle for the whole sitting, about 3½ hours with margin.
- No other cua session or harness uses the mini's approved vendor home or its approved engine location during the sitting.
- The console runs no app that activates on terminal activity.

**Owner steps.**
- Answer at the console over Screen Sharing:
  - the Accessibility and Screen Recording prompts for "cua Engine";
  - a possible Screen Recording "Quit & Reopen";
  - the capture confirmation for the new bundle;
  - a possible Input Monitoring prompt when probe (d)(i) first creates the tap;
  - probe (f)'s confirmations.
- Send one keystroke over Screen Sharing when probe (d)'s operator step asks for it.
- Keep hands off the console whenever a lane runs.

**Not needed for M0:** the mini's own certificate and the `security set-key-partition-list` step. The bundle is built and signed on the MacBook and copied.

**Commands**, run from the MacBook in /Users/new/Developer/GitHub/cua-117. `<sha>` is the branch head pushed for the sitting; `<home>` is the mini's approved vendor runtime home (the native baseline's `--approved-runtime`).

```
# 0. MacBook: build and sign the sitting's engine (the identity's SHA-1 from security find-identity; never written to a file)
swift build -c release --package-path native/engine --scratch-path /tmp/cua-engine-build
node scripts/spike/engine/assemble.mjs --build /tmp/cua-engine-build --identity "$CUA_SIGNING_IDENTITY" --out /tmp/cua-engine-spike
# 1. Place the harness checkout at the sitting's commit (5 min)
node scripts/native-baseline.mjs prepare --device mini --commit <sha>
ssh mini 'cd ~/Developer/GitHub/cua-parity && npm ci && node scripts/spike/engine/scenes.mjs place-chrome && node scripts/spike/engine/scenes.mjs build-electron'
# 2. Copy the engine to the approved location, in buildEngine's order (2 min)
node scripts/spike/engine/measure.mjs stop --device mini
ssh mini 'rm -rf "Library/Application Support/cua/engine/staging" && mkdir -p "Library/Application Support/cua/engine/staging"'
tar -C /tmp/cua-engine-spike -cf - "cua Engine.app" | ssh mini 'tar -C "Library/Application Support/cua/engine/staging" -xf -'
ssh mini 'cd "Library/Application Support/cua/engine" && rm -rf previous && { [ -d "cua Engine.app" ] && mv "cua Engine.app" previous || true; } && mv "staging/cua Engine.app" "cua Engine.app"'
# 3. Approve (10 min). OWNER: the two grant prompts, then Enter (the operator relays it), then the capture confirmation
node scripts/spike/engine/measure.mjs approve --device mini --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/approve
node scripts/spike/engine/measure.mjs status --device mini
# 4. Preflight (refuses an owner Finder window on screen, a hidden Finder, an unreadable hidden state, a running TextEdit)
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/scenes.mjs preflight --run "$HOME/Library/Caches/cua-harness/spike-scenes"'
# 5. Vendor triple FIRST (about 45 min): its guarded super+2 sets the shared scene folder's list view
node scripts/spike/engine/measure.mjs --device mini --lane vendor --runs 3 --approved-runtime <home> --probes c --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/vendor
# 6. cua triple with input (about 90 min). OWNER: a possible Input Monitoring prompt at (d)(i); one keystroke over Screen Sharing at (d)'s operator step
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 3 --approved-runtime <home> --probes c --operator --node /opt/homebrew/bin/node --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/cua
# 7. Probe (f), operator-guided (15 min). OWNER: whether each step raised the capture confirmation
node scripts/spike/engine/measure.mjs probe-f --device mini --out docs/doperpowers/research/2026-10-18-own-native-engine/spike/probe-f
# 8. Summary and teardown (10 min)
node scripts/spike/engine/measure.mjs summary docs/doperpowers/research/2026-10-18-own-native-engine/spike
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/scenes.mjs down all --run "$HOME/Library/Caches/cua-harness/spike-scenes"'
node scripts/spike/engine/measure.mjs stop --device mini
# If a vendor run dies: node scripts/spike/engine/measure.mjs cleanup --device mini --preparation <run dir>/preparation.json (each run logs the exact line)
```

Expected length: about 3 hours of lane time, plus the owner's prompts. Run a single lane per run first (`--runs 1`) if the first vendor run shows a harness problem; the triple only counts once both lanes run clean.

## Unresolved review findings (deferred minors)

- **Finder `useCount` flake** in the engine test: seen once, not reproduced.
- **`_meta` per-call keys** are carried as `null`; measure.mjs reads null as absent.
- **`cua/engineMs` after a declined approval** holds the resolve round trip. Cosmetic.
- **Rows/Columns** bounds are half-open in the engine; M1a's goldens settle whether the vendor's are inclusive.
- **Localized role words** weaken the Finder goldens on the Korean mini. Privacy-safe.
- **The redactor's first index** sets the start rather than assuming 0.
- **Enablement is never released.** Open for critique.
- **Local vendor lane:**
  - the managed-Node test does not prove the check runs before any move;
  - an unreadable session record's message carries a misleading parenthesis;
  - a pre-existing crash window between prepare.mjs's restore rename and its recovery.json write.
- **`indexOfTarget`** can still match a longer title that ends with the target name (comment corrected; the first matching line wins).

## Environmental friction

- **Safety classifier.** It withheld every agent asked to write the input half, and once a worker whose context held that discussion. The owner wrote the input half by hand.
- **Reviewer model.** sol was at its usage limit until Oct 24, so the task reviews ran on opus.
- **Shared spec.** The dispatching session once swept an uncommitted spec edit; since then spec changes come to me as messages.
- **MacBook console.** cmux took the front on terminal activity (see "MacBook windows").

## Residue

- **The mini sitting itself**, above. Its summary decides promote or discard.
- **The engine's unexplained exit** on 2026-10-18 between 21:55 and 21:57. Exit logging names every path now. Watch the sitting's logs (`log show --predicate 'subsystem == "io.github.ssfskim.cua.engine"'`) before counting the cold rows.
- **A live read census before any per-role drop** of actions or focusable reads, checked against M1a's renderer.
- **The vendor's missing web content on the Chromium scenes.** Confirm it at the sitting; probe (c′) names the enablement rule.
