# What linux-engine 0.4.2 reaches in M5's acceptance (task 120)

Read-only analysis for the design session's rulings under the pre-flight's §8.1 and §8.2
(`docs/doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md`). No run, no VM step, no code change. The form is
task 98's reach table for 0.4.1 (`m5/l4a-fix/README.md` §6 on `m5-l4a-fix`).

- **Engine diff:** `7522dcb8..9371d234 -- native/linux-engine/` (the `linux-engine-v0.4.1` tag to the `linux-engine-v0.4.2`
  tag), read in the code, not from the release notes.
- **Harness and facade diff:** `7d554dea..9089476e`, outside `native/`. 7d554dea is H⁵, the head every step's record
  stands on or was ruled equivalent to (rulings 858, 859). 9089476e is `m5-pin-042`'s tip: the 0.4.2 tag merged into
  feat with task 119's pin and `MIN_ENGINE_VERSION` 0.4.2. The brief's range `7522dcb8..9371d234` also carries
  H⁗→H⁵'s harness (tasks 106–108). The H⁵ entry already ruled on those, so they are left out here. "The 0.4.2 head"
  below means 9089476e or whatever feat becomes once it is merged; naming it is the design session's call.
- **Where the steps stand now** comes from `m5/x64/README.md` and `m5/arm64/README.md` (the H, H‴, H⁗ and H⁵ step
  tables), and their minutes are the ones measured there.

## In short

- **Class A, 18 steps on each architecture:** V5, D1, D2, S1, H1, H2, C1, K1, K2, K3, L1, L2a, L2b, L3a, L3b, L4a, L4b and
  L4c. Each sends drags or `drag_handle`s whose source is a Chrome or Electron window, so the 450 ms hold, the
  identification, the pings, the 700 ms watch and (for Chrome) the extension run in them. Compared with 0.4.1's list,
  the new members are the Chrome steps (V5, D1, C1, L2a, L3a, L4b, L4c) and the new K steps.
- **C1 and L4c should not be run as planned.** Their plan (`t14-late`, freeze-250) produces late takes only because
  0.4.1 released at press + 250. With 0.4.2's hold the take falls inside the hold. The judge then fails the step on
  its own vacuity rule: "no late take came: the sitting proves nothing of #264". The plan needs a ruling first
  (below).
- **Class B, by the same-bytes argument (B1):** Z0, D3, D4, D5, S3, L2c, L3d, P4, P5, P6, E1, R1, F2, F4 and ES. They
  enter changed functions with every new branch untaken, and every new branch's condition is static: it holds only for
  a Chromium-family source, and their plans have none.
- **Class B, by new reads only (B2):** V4, S2, S4, L3c and L3e. Their non-Chromium drags on the foreground route now
  send a few read requests before the press (`foreground_press_window`). Those reads return the window the drag names,
  so every byte after them is 0.4.1's, and no judge in these steps reads a drag's time.
- **Unreached:** V1, V2, V3, FB, R2, R3, R4, F1a, F1b, F3a, F3b, P1, P2, P3 and L5. They send no drag or handle, or one
  that is refused before any new line runs.
- **The harness diff** touches the runner (`gate.mjs`), the engine launcher (`engine.mjs`), Chrome's launcher
  (`chrome.mjs`) and the scenes (`scenes.mjs`). For every step but the K steps these changes are inert by
  construction, so they don't change the list (§3). By the letter of §8.1 point 3, though, a change to the runner
  calls for a full rerun. That needs a ruling.
- **Proposed reruns:** class A and one cross-check (S2) on each architecture. That is about **6.5 machine hours on
  x64** (of which V5 is a 38-minute `:0` sitting under the owner's GO) and **6.8 on arm64**, from the measured
  minutes. From `steps.mjs`'s planned minutes it is 7.1 hours on each. C1's and L4c's few minutes wait on their
  ruling. R1–R4 rerun with the flip (T10), as §8.1 already plans.
- **Development runs can't stand in.** Tasks 116, 117 and 118 ran on local builds (not the pinned assets), mostly at
  earlier engine heads, ran parts of plans, and were labelled development runs (§5).

## 1. What 0.4.2 changes, as built

| what | where | the condition under which the new lines run |
|---|---|---|
| The hold: the button stays down to press + B (B = `TAKE_HOLD_AFTER_PRESS`, 450 ms, from 250) when nothing has taken by the path's end | `dnd.rs`; `engine/pointer.rs` `drag_along` | `take_hold` exists: the press window is Chromium-family (`families::blink`: the classes Chrome or Chromium, which include Electron by its toolkit). On a drag the engine lets drop, it runs from the path's end, as 0.4.1's 250 ms hold did |
| The same hold on a guarded drag, new: before the release dwell, and a take inside it is cancelled before the drop | `drag_along`, the `guard` branch | a guarded drag (shared mode, the background route, a family whose drop changes the desktop, which is Chrome, and not in front) with a Chromium source and `guard.looks()`. Not under `--dnd-cancel-after-release` or `--dnd-defer-take`, so not in V5's measurement-flag cells |
| The same hold at a `drag_handle`'s `end`, new | `engine/handle.rs` `release_handle(handle, true)` | the agent's `end` of a handle whose source is Chromium-family (`handle.after` is set) and which has not taken by then. The exit's, the idle bound's and a lost handle's releases pass `false` and hold nothing |
| The hold's motionless wait serves the release dwell or rest (`still`) | `drag_along`, `release_handle` | only after a hold that ended with no take. Otherwise `still` is 0 and the sleep is 0.4.1's |
| Identification before the press | `engine.rs` `browser_source`, `browser.rs`, `atspi.rs` `application_name_of`, `x11.rs` `role_and_machine` | every Chromium-family source, on every route and at a handle's start, while pings are on (the default). It reads `WM_CLASS` and `_NET_WM_PID`. For a Chrome class it also reads `WM_WINDOW_ROLE` and `WM_CLIENT_MACHINE` and makes AT-SPI calls on the engine's bus connection: the registry's children, each one's PID and the matched app's `Name`. The whole lookup is bounded at 50 ms (ruling 912), and past 50 ms it counts as none. Idle lookups take 1–5 ms. The counted block of task 118 at arm64 twice the load read at most 27.0 ms |
| Hold pings (`_NET_WM_PING` ClientMessages, sent by SendEvent to the source) | `hold_ping.rs` | a hold that waits with no take, on the sampler's own thread and its own X connection |
| Extension to press + 650 ms and the notice `the page may have started a drag that did not complete` | `adaptive_hold.rs` | an identified Chrome or Chromium browser source whose pings by B were not all under 20 ms (or were unanswered, in flight, or failed). Never for Electron or an unidentified source |
| A take caught only in the extension answers unconfirmed when nothing else can confirm it (`Confirming::Extended`) | `handle.rs` `after_hold`, `Engine::drag` | an extended hold that took, on a drop otherwise `Unjudged` (Chrome with no `_NET_ACTIVE_WINDOW`) |
| A take the hold saw counts for an Electron handle's settle | `release_handle`, `settling` | an Electron handle whose take the hold saw before the cursor watch read it |
| The late-take watch: from release + 300 to the later of release + 700 and press + B + 300; the drag's session (its `FocusOut`) lasts as long | `dnd.rs` `late_watch_end`, `LateWatch` | every drag that arms the after-release watch: a guarded drag, or a Chromium drag the engine lets drop |
| The exit-only watch end: stop + 650; the exit's settle capped at stop + 950 | `engine.rs` `shutdown(exit_by)`, `serve.rs` `exit_by` | an exit after a stop signal. The watch part runs only with an armed watch. The cap binds only when the last input came more than 650 ms after the signal |
| The source of a foreground drag is the client under the path's start when the start lies outside the named window | `engine/pointer.rs` `foreground_press_window`, `x11.rs` `holds_point`, `cover.rs` `inside` | **every foreground-route drag, any family**. It sends TranslateCoordinates, GetGeometry and the cover's reads before the press. It returns the named window whenever the start lies inside it and inside every ancestor's clip |
| Bounded bus setup and writes | `dbus.rs` `Bus::connect(address, deadline)`, `flush` | the new branches run only with a deadline, which only the identification passes. `Bus::connect(_, None)` and `flush` with no `write_by` send the same bytes as before (only a socket timeout is set once more) |
| The drag's reply carries `notice` | `engine.rs` reply composition | a drag or handle `end` whose hold was `noticed` |
| `--drag-dnd-hold-ping off`, `--drag-dnd-hold-ms` | `main.rs` | measurement only. No gate step passes them |

What doesn't change: `route_along` (the refusals of a covered Chromium path, a minimized window and a kind refused by
the device mode, all before anything is sent), every non-drag command, the 0.4.1 settle's own lines, the drop
confirmations, and the clipboard and text paths.

## 2. The harness and facade diff (7d554dea..9089476e, outside `native/`)

| file | what changed | which steps it touches, and how |
|---|---|---|
| `scripts/linux-engine-gate/steps.mjs` | K1, K2 and K3 added. `stepArgs` treats a canary as a verdict, plus `--engine-sandbox` | K only. Verdict steps' arguments are unchanged |
| `scripts/linux-engine-gate/gate.mjs` (**the runner**) | `currentStableChrome`, `intendedChrome` and `canaryCheck`. `runStep` puts the stable Chrome on PATH and records `canary_check`, and the exit includes the canary's proof | inert for every non-canary step. `step.chrome` is undefined, so `PATH` comes out as the same expression's value, `intended` is null, `canaryFailed` is false and the exit formula is unchanged |
| `scripts/linux-engine-diff/engine.mjs`, `engine-sandbox.mjs`, `cli.mjs`, `linux-engine-diff.mjs` | `--engine-sandbox` launches cua lanes inside codex-linux-sandbox | inert without the flag (`sandboxed` false, the same `xSpawn(bin, args, {stdio, env})`). Only the canary steps and K3 pass it |
| `chrome.mjs`, `scenes.mjs` | `CUA171_CHROME_COMMAND`. `cmdlineArgs` splits a rewritten process title, so `owns()` finds the run's browser at its end. `seen()` runs `<exe> --version` once per browser pid when the first window shows. The end row gains `desktop.chrome.browsers` | **every step that opens Chrome**, but only at the scene's open (outside any sample) and at the run's end. No sample, judge or verdict reads the new field except `canaryCheck`. Where H⁵ left a browser that outlived its windows, the run's end now terminates it |
| `device.mjs`, `premise.mjs`, `report.mjs` (**judges**) | `honestNotice` and `falseAlarm` (ruling 898.2), `holdCanary` (897.3, 898.4), `firstDropRead`/`drop_seen`, `reply_notice` also recorded on drop cases, a summary table | V5's judgments, and K1–K2's. On V4's foreground and background cases `honestNotice` is false unless a reply carries the hold notice, which no non-Chromium drag can produce, so V4's verdicts are unchanged |
| `drop-signals-judge.mjs`, `drop-signals.mjs`, `experiments.mjs`, `pages/drop-signals.html` | `holdRegressionVerdict` and the `hold-regression` and `hold-limit` plans. Two sources, `dragstart-500` and `-600`, at x 440–490, y 450–536 | K3. In C1, H1, H2, L4a, L4b and L4c's page, no existing cell's path enters the new divs. The cells start at x 530 or more, and `long-left` ends at x 500. The status line is parsed by name (`src starts/drops` pairs), so stored rows still parse |
| `src/services/engine/linux/methods.mjs`, `service.mjs`, `src/cua-api/bind-linux-app.mjs` (**the facade**) | every input goes through `engine.exchange`, the same as `request` with `.output`. `drag` and a handle's `end` resolve to `{notice}` when the reply carries one, and the facade writes it as the cell's text | the outcome changes only for a reply with a notice: a Chromium drag's `noticed` hold, or an unconfirmed-drop notice on a Chromium drop's own reply, which the facade now writes where 0.4.1 dropped it. Every facade and service step (R1–R4, FB, S1–S4, L3a–e, ES) enters the changed wrapper |
| `src/services/engine/linux/client.mjs`, `runtime/engine/linux-engine.json` | `MIN_ENGINE_VERSION` 0.4.2, and the pin | every pinned run reads the pin. This is the engine diff itself: as at H⁗ (task 104), the pin decides nothing beyond what the engine's diff reaches |
| `docs/cua-api/linux-engine.md` | a paragraph on the hold, the extension, the notice and the 700 ms watch | served on both lanes of R1 (under either engine), so the lanes still compare equal |
| `docs/evidence/…/m5/x64/h4/scripts/sitting.sh` | the sitting launcher exits with a failing step's status (888.6) | the `:0` sitting's exit code only. No step's verdict |

So the only harness change that moves a step's judgment is the judges', and those reach V5 and the K steps alone.
`chrome.mjs` and `scenes.mjs` touch every Chrome step, but only its open and end records. The structural argument that
H⁵'s mixed heads rested on (858, 859) applies to them.

## 3. The table

- **Classes.**
  - **A**: the new behaviour runs, so the step reruns counted.
  - **B1**: changed functions are entered, every new branch is untaken, and the same bytes go out. The branch
    conditions are static (a Chromium-family source, or an armed watch at exit), so the argument is the step's plan,
    as 843's static exclusions are. No runtime counter is needed: unlike 0.4.1's settle, whose branch depended on a
    take at run time.
  - **B2**: new read-only requests before the press, then 0.4.1's bytes. No judge in the step reads that drag's time.
  - **Unreached**: no drag or handle, or one refused before any new line runs.
- **"Stands on"** gives the head of the step's current record, and the engine version in brackets.
- **The minute columns** give each step's measured minutes at its last run, x64 / arm64.

| step | venue, load | drags and handles it sends (source family, route) | what 0.4.2 can change there | class | timing judges and the 450 ms hold | x64 stands on | arm64 stands on | rerun | min x64 / arm64 |
|---|---|---|---|---|---|---|---|---|---:|
| V1 | `:0`, idle | none (gedit text) | nothing; the tree's bus setup is unchanged with no deadline | unreached | speed series of gedit text; no drag | H⁗ (0.4.1) | H⁵ (0.4.1) | no | – |
| V2 | `:0`, idle | none (the desktop's lists, gedit's and Chrome's reads, `press_key`, `click`) | only Chrome's open and end records (`chrome.mjs`) | unreached | the seven operations' series; no drag | H⁗ | H⁵ | no | – |
| V3 | `:0`, idle | chrome-input `drag` (Chrome, background, covered) and the minimized drags | both are refused before anything is sent (`route_along`, the minimized refusal), ahead of every new line. They are listed apart as a declared refusal at H, H⁗ and H⁵ | unreached | the refusal's time only | H⁗ | H⁵ | no | – |
| V4 | `:0`, idle | `gtk4_drag_shared` (refused) and `gtk4_drag_dedicated` (GTK 4, foreground) | `foreground_press_window`'s reads. The start lies inside the window, so the source is the named window and nothing is held | B2 | device cases with no speed series. The foreground audit forbids none of these reads | H⁗ | H⁵ | no (if B2 stands) | 27.0 / 25.1 |
| **V5** | `:0`, idle, under Chrome ballast | device-chrome (visible path: guarded; covered dedicated: foreground), all 14 device-chrome-dnd cells (guarded, in front, dedicated, late, defer, pointer outside, the select control), device-firefox drags (one foreground), identity | the guarded hold (new), the in-front hold 250→450, the identification, pings, the extension and its notice, the 700 ms watch and the session's later `FocusOut`, and V5's judge: honest notice, the canary on the in-front and select cells (V5's cua lane runs with `--stats`, so `holdCanary` judges it live) and `drop_seen` | **A** | ruling 680's span rule (`dur ≥ answer + 20 ms`) reads the answer's time. Answers now come at press + 450 or later, so the witness span covers more and span-limited samples can only become rarer. The canary's one-slow-press (≥ 20 ms) condition has not been shown on either `:0` | H⁗, a pass by ruling 680 | H⁵, **FAIL** (886) | **yes**, both. On x64 under the owner's GO | 37.6 / 36.0 |
| Z0 | `:0`, idle | Firefox dnd and select, Writer select (background, shared) | none: non-Chromium sources on the background route | B1 | Firefox drop landing; no Chromium drag | H⁗ | H⁵ | no | – |
| **D1** | private, idle | Chrome select, range, scroller, dnd and canvas (the drag experiment, shared; dnd in front) | select, range and scroller are held to press + 450 (task 116: 454 ms warm on x64, 452 on arm64, from about 129). dnd takes along its path, so nothing is held, but identification runs before every press. Canvas's path is past B, so nothing is held (`NOT_HELD`), plus identification | **A** | speed (warm) only for canvas and dnd. Canvas stays under the newest build: 476.5 / 473.3 ms against 514.0 / 486.1 (task 116), and 477.5 on x64 with identification (task 117, d16614ed). **dnd's #358 bound is 40 ms over newest. x64's interval at H⁗ is [24.6, 33.2], 6.8 ms of headroom. arm64's is [26.4, 26.6].** Identification adds about 1–5 ms to every Chrome drag, and no development run measured dnd with identification. The thumbs' reach: every judge passed in task 116 | H⁗ (the 0.4.1 cross-check) | H⁗ | **yes** | 21.5 / 22.4 |
| **D2** | private, idle | Electron select, range, scroller, dnd and canvas | held to 450 when no take (453–457 ms, task 116), X-property identification, pings, the 700 ms watch | **A** | none on speed: `LONG_PATHS` is Chrome's and Firefox's canvas and Chrome's dnd. The thumb's reach passed (task 116) | H⁗ | H⁗ | **yes** | 19.1 / 18.3 |
| D3 | private, idle | Firefox, background, the pointer parked inside | none | B1 | Firefox canvas speed: no new code | H (0.4.0) | H‴ (0.4.0) | no | – |
| D4 | private, idle | gedit, GTK scale, gnome-text-editor, kate, qtcreator (background) | none | B1 | none | H | H‴ | no | – |
| D5 | private, idle | Writer, xterm, gnome-terminal, GTK 4 input, Writer through gen (background) | none | B1 | none | H | H‴ | no | – |
| R1 | own, idle | gedit `drag` through the facade | the facade's `async drag` and the service's `exchange`. gedit's reply carries no notice, so the answer is the same. The Linux document's new paragraph is served on both lanes | B1 | none | H, re-judged at H‴ | H‴ | with the flip (T10, §8.1) | – |
| R2 | own, idle | none | the service wrapper (equivalent) | unreached | in-cell time of the engine's operations; no drag | H | H‴ | with the flip | – |
| R3 | own, idle | none | the service wrapper; the installed binary is now 0.4.2's | unreached | none | H | H‴ | with the flip | – |
| R4 | own, idle | none | the service wrapper | unreached | none | H | H‴ | with the flip | – |
| FB | private, idle | none | the facade's tree path is unchanged | unreached | none | H | H‴ | no | – |
| E1 | own, idle | the recorder window: window and desktop drags, a desktop `drag_handle`, an interrupted drag | none: the recorder isn't Chromium-family, so `take_hold` is None and `handle.after` is None, and `release_handle(_, true)` takes 0.4.1's path | B1 | desktop `move`'s timing: no new code | H⁗ | H‴ | no | – |
| **S1** | own, idle | chrome- and electron-input `drag` (background unobscured: guarded for Chrome), `drag` and `drag_handle` on the desktop route, and dedicated drags (foreground), all through the service | the holds (drag and handle end), identification, pings, the 700 ms watch (the session's `FocusOut` comes up to 400 ms later), the facade's `{notice}` | **A** | the settle is read after the answer, and a later answer only gives the effect more time | H⁗ | H⁗ | **yes** | 34.0 / 33.2 |
| S2 | own, idle | firefox-input `drag` (background) and **dedicated `drag` (foreground)**; gedit `drag` and a desktop `drag_handle` | `foreground_press_window`'s reads on Firefox's dedicated drag; otherwise B1 | B2 | none on drag time | H | H‴ | **cross-check** (§6) | 26.6 / 25.2 |
| S3 | own, idle | kate, qtcreator and Writer drags (background and desktop) | none | B1 | none | H | H‴ | no | – |
| S4 | own, idle | xterm drags (background, desktop); **gtk4-input dedicated `drag` (foreground)** | `foreground_press_window`'s reads | B2 | none | H | H‴ | no (if B2 stands) | 34.8 / 34.2 |
| F1a | own, idle | none (keys, paste) | Chrome's run-end record | unreached | the paste settle; no drag | H | H‴ | no | – |
| F1b | own, idle | none (clicks, paste) | as F1a | unreached | as F1a | H | H‴ | no | – |
| F2 | own, idle | none; SIGTERM after keys and clicks on Chrome and Electron | `shutdown(exit_by)` with no armed watch. The last input precedes the signal, so the settle (≤ last input + 300) never reaches the stop + 950 cap | B1 | the exit's timing: unchanged | H | H‴ | no | – |
| ES | own, idle | an xterm `drag_handle` left held at the stop; Chrome and Electron key bursts | the exit path as F2. The xterm handle ends with `end_drag_handle(false)`, as before, and isn't Chromium anyway | B1 | as F2 | H | H‴ | no | – |
| P1–P3 | private, idle | none (Firefox click, scroll, move) | none | unreached | none | H | H‴ | no | – |
| P4, P6, P5 | private, idle | Firefox select and dnd drags, shared (the predicates manifest runs cua in shared mode only), and the leave cases | none: non-Chromium, background | B1 | none | H | H‴ | no | – |
| **H1** | private, idle | Electron t17-fix3: plain drags, handles, controls, releases off the window | holds on no-take drags; **the handle `end` hold (new)**; the settle counts a take the hold saw (`held_take`); identification; pings; the 700 ms watch (a fresh engine's stdin exit runs it out, up to 400 ms more per drag) | **A** | none on speed. The landings, false oks and #365 | H⁗ | H⁗ | **yes** | 18.1 / 17.5 |
| **H2** | private, gate windows | the same, after the gate's dedicated Chrome prelude drop | the same, plus the prelude's Chrome foreground drag | **A** | as H1 | H⁗ | H⁗ | **yes** | 18.6 / 17.9 |
| **C1** | private, idle | Chrome `t14-late`: `freeze-250` × 40, the browser stopped from 60 to 250 ms after the send | **the hold absorbs the late take.** 0.4.1 released at press + 250, as the browser thawed, which produced the late takes: 9 on x64, 18 on arm64. 0.4.2 holds to 450, or to 650 when the frozen browser's pings go unanswered (Chrome is identified), and the take after the thaw falls inside the hold | **A** | `chromeDropVerdict` fails a `t14-late` sitting with no late take: "no late take came: the sitting proves nothing of #264". **Expected to fail by construction; needs a ruling** (§7) | H | H‴ | **after the ruling** | 1.9 / 1.6 |
| **K1** | private, idle, Chrome ballast, sandboxed | V5's in-front short drop and select control on the installed Chrome | all of the above; the canary | **A** (new step) | the canary's thresholds: busy ≥ 5 ms on half the held presses, ≥ 1 slow at ≥ 20 ms that started a drag | none | none | **yes**, first counted run | 15 planned |
| **K2** | as K1, on the current stable Chrome (extracted) | the same | the same; it refuses to start without `chrome-stable/current` on the VM | **A** (new) | as K1 | none | none | **yes** | 15 planned |
| **K3** | private, idle, sandboxed | Chrome `hold-regression`: `dragstart-150` and `dragstart-400`, 10 each | the fixed hold must land both. `holdRegressionVerdict` | **A** (new) | the takes come at 154–423 ms, inside B | none | none | **yes** | 6 planned |
| **L1** | private, twice the load | Chrome and Electron scroller and range, 40 a side | every run holds to 450 (none takes), plus identification and pings | **A** | no speed at load. The landed counts against the pinned build (Fisher), the distances | H⁗ | H⁗ | **yes** | 28.6 / 30.9 |
| **L2a** | private, twice the load | Chrome select, dnd and canvas | as D1 at load. Canvas's path may be held near B under load | **A** | no speed at load | H | H⁗ | **yes** | 23.2 / 26.7 |
| **L2b** | private, twice the load | Electron select, dnd and canvas | as D2 | **A** | no speed at load | H⁗ | H⁗ | **yes** | 15.8 / 19.3 |
| L2c | private, twice the load | Firefox (background) | none | B1 | none | H | H⁗ | no | – |
| **L3a** | own, twice the load | Chrome's settle cells (as S1's Chrome part) | as S1 | **A** | as S1 | H | H⁗ | **yes** | 30.9 / 37.6 |
| **L3b** | own, twice the load | Electron's settle cells | as S1 | **A** | as S1; #302's key_up form isn't touched | H⁗ | H⁗ (pass by 864/865) | **yes** | 17.5 / 20.9 |
| L3c | own, twice the load | Firefox (one dedicated drag, foreground) and gedit | the reads on Firefox's dedicated drag | B2 | none on drag time | H | H⁗ (declared limit, 871/872) | no (if B2 stands) | 32.3 / 38.0 |
| L3d | own, twice the load | kate, qtcreator, Writer, gnome-terminal | none | B1 | none | H | H⁗ (declared limit) | no | – |
| L3e | own, twice the load | xterm; gtk4-input dedicated drag (foreground) | the reads | B2 | none | H | H⁗ | no (if B2 stands) | 36.2 / 37.6 |
| **L4a** | private, twice the load | Electron t17-fix3 | as H1; the residue counts (827 3b) and 830's mismatches | **A** | none on speed | H⁗ | H⁗ | **yes** | 19.7 / 21.4 |
| **L4b** | private, twice the load | Chrome `t14`: long drops, controls, the `cua:accept` measurement lane | holds on the controls, identification, pings, the 700 ms watch | **A** | none on speed. The accept lane's false releases remain a finding (871/872) | H | H⁗ (FAIL ruled a finding) | **yes** | 13.8 / 16.1 |
| **L4c** | private, twice the load | Chrome `t14-late` at load | as C1: the hold, extended to 650 here as the frozen browser's pings go unanswered, absorbs the late takes | **A** | as C1: expected to fail on "no late take came" | H | H⁗ | **after the ruling** | 2.0 / 2.1 |
| L5 | private, twice the load | none (GTK 4 readiness) | none | unreached | none | H | H⁗ | no | – |
| F3a, F3b | own, twice the load | none | Chrome's run-end record | unreached | none | H | H⁗ | no | – |
| F4 | own, twice the load | none; SIGTERM after keys and clicks | as F2 | B1 | as F2 | H | H⁗ | no | – |

Beyond the gate's steps:
- **Item 9, the install, and item 1's fresh-home doctor:** the pinned asset itself changed, so its hash, `file`'s line
  and doctor's `engine` row (0.4.2, the pin's hash) must be shown again on each architecture. That takes about 5
  minutes each on a private display.
- **Item 10's `ci-gate`** runs on the 0.4.2 head as on any head.
- **Item 2:** the hold notice on `drag` and on a handle's `end` is a new cua-only answer, so it must be listed as a
  declared deviation (ruling 897) beside the 21 commands' table.

## 4. The 450 ms hold against the timing judges

From task 116's costs (`m5/engine-042/measure/` §6) and task 117's wave-4 D1 (the release notes):

- **D1's canvas**: its path runs past B, so nothing is held. 476.5 ms on x64 and 473.3 on arm64, against the newest
  build's 514.0 and 486.1. With identification, 477.5 on x64. The hold can't move it. Only identification adds
  anything, about 1–5 ms, and arm64's 12 ms margin still holds.
- **D1's dnd (#358, declared, bound 40 ms over the newest build)**: the take comes along the path, so nothing is held.
  But identification runs before the press on every Chrome drag. x64 has 6.8 ms of headroom against an idle
  lookup of 1–5 ms. **This is the one bound a 0.4.2 rerun could plausibly cross**, and no development run measured
  dnd with identification: task 116 ran at wave 2, which had none.
- **D1 and D2's select, range and scroller** go from about 129 ms to about 452–457. No judge reads their time; they
  are judged on landing and on the thumb's reach, which task 116 found passing. The cost goes into the owner's
  summary (900.4).
- **V1–V4's speed series** contain no drag that reaches new code: V3's Chrome drag is refused first.
- **R2's in-cell times** contain no drag.
- **E1's `move`** is unreached.
- **The settle steps (S, L3)** judge state read after the answer. A later answer can't make a settle miss.
- **V5's ruling-680 span rule** reads the answer's time. Later answers lengthen the witness span, which can only
  pass more drops through the witness, never fewer.
- **The exit (F2, F4, ES)**: the stop + 950 cap binds only when the last input came more than 650 ms after the signal,
  which no planned stop does. A fresh engine's stdin exit after a no-take Chromium drag now runs out up to 700 ms of
  watch, where 0.4.1 ran 300. That lengthens H1, H2, L4a, L1, L2a and L2b's wall time, but is judged nowhere.

## 5. The development runs on the candidate, and §8.1

| task | engine | what ran | why it can't stand in for a counted rerun |
|---|---|---|---|
| 116 (`m5-measure-042`, 62cc7322) | local static musl builds of 3dd381ec (a CI artifact, one pilot), fdaff715 and 313167a9: wave 2's fixed hold, with no identification, extension or notice | V5's two cells (cancel and in-front): at idle on arm64 `:0` through run71 and on an x64 private display, and at twice the load on both. D1 and D2's cells at idle (the cost), D1 and D2 drags at twice the load, and the sampler on and off | not the pinned asset from a run home (§1.1: no local build). Engine code since superseded by waves 3–6, which added identification, the extension and the notice, removed early release (900), and bounded the bus (912, 913). V5 run as 2 cells of its 52. A development run by label |
| 117 (waves 3–5, `m5-engine-042`; no report file, recorded in the release notes) | x64 local builds of fd050739 and d16614ed | V5's two cells for 20 blocks at idle and at twice the load. D1 select and D1 canvas. K1, K2 and K3. The drop-signals `hold-limit` cells. The sandboxed identification | the same: local bytes, heads before waves 5–6's engine changes (02f49327, c596c7df, f10946bf, 9371d234), partial steps, and no frozen harness head |
| 118 (`m5-tail-042`, c5347eba..6f7a3d42) | arm64 VM builds of 80b98959, f8bd6949, f10946bf and **9371d234** (`d0e2f2b2…`) | V5's two cells at twice the load, `--dev --no-audit`, 25 blocks a run. K1 and K2 20 times per harness. At 9371d234, a smoke: V5's two cells for 7 blocks per Chrome version, and K1 and K2 5 times each | the closest: the same source commit as the release. But a VM build is not the released asset (arm64 `25035ca1…`). V5 counts at `:0` and idle, with the audit, every cell; this was a private display at twice the load, two cells, with the audit off. The K runs ran at the tag's harness, not the frozen head's, and are labelled development runs |

None of them can stand in under §8.1 or §1.1. They do settle questions of risk: task 118 found 0 false oks in 525
in-front samples per Chrome version at arm64 twice the load, the canary passing 80 of 80, and identification at
most 27.0 ms. Task 116 found every D1 and D2 judge passing at B = 450.

## 6. Proposed reruns, per architecture

The order is the gate's: private idle steps, then the `:0` sitting, then the twice-load block. Every step runs at the
0.4.2 head on the pinned 0.4.2 asset from the run's home.

| list | x64 (measured min) | arm64 (measured min) | planned (`steps.mjs`) |
|---|---:|---:|---:|
| A, private idle: D1, D2, S1, H1, H2, C1 (after the ruling), K1, K2, K3 | 113.2 + K 36 = 149.2 | 110.9 + K 36 = 146.9 | 191 |
| A, twice the load: L1, L2a, L2b, L3a, L3b, L4a, L4b, L4c (after the ruling), plus about 3 min of quiet wait inside each hold after the first | 151.5 + 21 = 172.5 | 175.0 + 21 = 196.0 | 173 |
| A, `:0`: V5 | 37.6 (the owner's GO) | 36.0 | 38 |
| Cross-check: S2, compared cell by cell with its H (x64) or H‴ (arm64) record in the form of `compare-settle.mjs` | 26.6 | 25.2 | 25 |
| Item 9's install and item 1's doctor, fresh home | about 5 | about 5 | – |
| **Total** | **about 391 min, 6.5 h** | **about 409 min, 6.8 h** | 427 min, 7.1 h |

- **Why S2 is the cross-check.** It is the one unreached-in-behaviour step that runs `foreground_press_window`'s new
  reads, on Firefox's dedicated drag. It also runs gedit's desktop `drag_handle` through `release_handle(_, true)` with
  no Chromium source, and the service's changed wrapper. Chrome's run-end change is exercised by every class-A Chrome
  step's own end check. F2 (8 min) would add the exit path with no armed watch, if the design session wants a second
  cross-check.
- **If B2 is read as A** (the function rather than the branch, the alternative task 98 offered for 0.4.1): add V4
  (`:0`), S2, S4, L3c and L3e. On x64 that is V4 27.0 + S4 34.8 + L3c 32.3 + L3e 36.2 ≈ 136 min, about 2.3 h, with the
  quiet waits. On arm64 it is 25.1 + 34.2 + 38.0 + 37.6 ≈ 141 min. The cross-check then moves to D3 (18 min). On x64
  V4 joins V5 in the sitting.
- **If the runner's change is read as calling for a full rerun** (§8.1 point 3 by its letter), the whole gate runs
  again, about 17–20 machine hours per architecture.
- **V5's conditional slot**: as at H⁗ (823.3, 831), budget the owner's display for up to two more 60-minute V5 slots
  on x64. arm64's `:0` is nobody's display, so it needs no budget there.
- **R1–R4** rerun with the flip on both VMs, as §8.1 already plans (about 95 minutes each), provided the flip is
  measured on the 0.4.2 pin. If the flip lands before the 0.4.2 head, they rerun at the 0.4.2 head instead: they are
  B1 here, with a static argument only (gedit's drag, no notice).

## 7. For the design session

1. **C1 and L4c's plan.** `t14-late`'s freeze ends 250 ms after the send. 0.4.2 holds to 450, or to 650 for an
   identified Chrome whose pings go unanswered while it is frozen, so the take comes inside the hold. Both steps are
   expected to fail on the judge's "no late take came". This is from reading the code, not from a run: nothing has run
   `t14-late` on 0.4.2.
   - Option (a), recommended: a freeze that thaws after the extended hold. For example `freeze-700`, stopped from 60 to
     700 ms after the send. The take then follows a release at 650, and the 700 ms watch must catch and report it.
     This would show the lengthened watch's purpose on the shipped bytes. Task 116 saw no late take past 300 ms in any
     condition, so nothing yet does. It is a harness change, so it moves the head beyond 0.4.2's.
   - Option (b): rule #264's late-take claim proven by the engine's own watch tests and V5's late cells, and drop C1 and
     L4c.
2. **The runner and the shared harness files**, by §8.1 points 1 and 3's letter. I argue the change to `gate.mjs`,
   `engine.mjs` and `chrome.mjs` is inert for every non-canary step (§2). That would keep the list at A plus one
   cross-check, as 858 and 859 kept H⁵'s mixed heads.
3. **B2**: stands with S2 as the cross-check, or reruns (§6).
4. **#358 on x64 D1**: identification's 1–5 ms against 6.8 ms of headroom. If the rerun's interval passes 40 ms, the
   ruling to make is whether identification's cost counts in #358's bound. A development run of D1's dnd cell on the
   0.4.2 asset before the counted run would answer it for about 10 minutes.
5. **V5's canary on `:0`**: on x64 the held draggable presses read slow (≥ 20 ms) on 7 of 9 on Chrome 156 (K1, wave 4,
   private display). Neither `:0` has shown the condition at 0.4.2. On Chrome 156 a V5 with no slow press is unlikely,
   but if it happens it would be a canary FAIL in V5 that is no false ok.
6. **The 700 ms watch and V5's audits**: the drag's session `FocusOut` (a SendEvent) now comes up to 700 ms after a
   no-take Chromium drag's release, where it came at 300. An audited request inside that window that was refused before
   sending anything would have the `FocusOut` attributed to it (`auditAnswered`). V5's rerun shows whether any cell's
   timing meets this. Task 118's V5 runs had the audit off.

## 8. Not shown

- Any run. Every claim here is from reading the code at 9371d234 and 9089476e, and from the stored step tables.
- Whether C1 and L4c fail as predicted (§7.1).
- D1's dnd interval with identification (§7.4).
- The B2 reads' cost on `:0`, where the cover's reads walk the person's stacking. V4 is the only B2 step there.
- Wall-time growth from the 700 ms watch at a fresh engine's exit, per step.
