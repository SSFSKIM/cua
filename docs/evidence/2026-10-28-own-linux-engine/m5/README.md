# #171 M5: cua's own Linux engine, accepted on x64 and arm64, and the Linux default

## For the owner

This page is for one decision: whether a Linux session that names no engine runs on **cua's own engine**,
`cua-engine` 0.4.1, instead of the **vendor engine** (`sky_linux`, the engine inside OpenAI's computer-use runtime,
which cua installs and uses by default today). macOS does not change. Either way, a user can still choose either
engine (part 5).

**Where the evidence stands.**

- **x64: complete.** Every one of the 50 test steps passes, V5 by a standing ruling (part 3). The steps 0.4.1's
  change could reach were run again on 0.4.1 and pass ([x64 README](x64/README.md#L472);
  [Decision Log, x64's acceptance at H⁗](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2452)).
- **arm64: complete except the real-desktop sitting**, the part that runs on a real desktop display, which is
  running now ([arm64 README](arm64/README.md#L248)). **PENDING:** arm64's sitting at H⁵ (V1–V5 and Z0, task 109)
  fills every arm64 cell marked PENDING below.
- **The flipped default, shown live: PENDING** (part 6).

### What a user gets

- **Text arrives, exactly and once.** On x64, `typeText` into gedit takes 69.9 ms and reads back exactly 40 times out
  of 40. The pinned vendor build fails it after 10.2 s (10,204.1 ms, 0 of 40 read back equal), and the newest vendor
  build takes 838.4 ms ([V1 at H⁗, gedit rows](x64/h4/zero/V1.pinned-release/run/summary.md)). On arm64 the vendor
  builds end gedit when they type, paste or write the clipboard ([arm64's vendor ends](arm64/README.md#L226)).
- **Several times faster.** A read of gedit's 480-element tree takes 81.8 ms against the faster vendor build's 567.6.
  A screenshot takes 103.7 against 743.2, a key press 1 against 235.7, and a click 13.8 against 214.9 (warm medians,
  x64, part 2).
- **Answers that are true.** Requests the vendor answered "ok" without doing anything now take effect, refuse with a
  sentence the agent can act on, or say "unconfirmed" (part 4). 0.4.1 removed the last false "ok" the run found
  ([below](#the-engine-on-trial-041)).
- **The person's desktop is left alone.** On a shared desktop, input to a background window moves neither the active
  window, the focus nor the pointer. An application that ignores background input is refused instead of being brought
  forward (part 4).
- **Windows are reported as they are.** A minimized window is listed and still reads. A tree too large to read whole
  says so. Duplicate windows that can't be told apart are refused rather than read as a one-node tree.

### What a user loses or meets

- **Some applications need a dedicated desktop for input**: GTK 4 applications such as gnome-text-editor, xterm's
  keys, and Firefox while the real pointer is outside its window. On a shared desktop these are refused with a
  sentence, where the vendor sent input they ignore ([README, the device mode](../../../../README.md#L1262)).
- **Two operations are measurably slower than the vendor**, both declared with a ticket: Chrome's long drag and drop,
  by 26–31 ms (#358), and bringing a window to the front, by about 7–9 ms (#373) (part 3).
- **Some context menus answer "unconfirmed" after about a second**: a page that draws its own menu, where the vendor
  answered "ok" (#377), and GTK 4's, Firefox's and Qt's menus, which the engine does not detect (#379) (part 3).
- **Chromium drags on a shared desktop are refused unless their whole path is visible**, and an Electron key release
  can reach the page's tree after the engine has answered (#302) (part 3).
- The full list of limits a user can meet is the README's
  [Known limitations (cua's engine)](../../../../README.md#L1297), summarized in part 4.

### How to read this page

- **The bar** is the faster of two vendor builds: the pinned 26.928.40906, which cua installs, and the newer
  26.1023.51421. **Cold** is a fresh engine's first request; **warm** is the median of later ones.
- **The real desktop** (`:0`) is a display a person uses, with a window manager and a logged-in session. A **private
  display** is an invisible one the run starts for itself. Steps that claim something about a person's desktop ran
  on the real one, and everything else on private displays.
- **Twice the load**: the machine is kept busy by stress workers, a load average of about 16, to find timing faults.
- **Declared** means a known gap or limit with a ticket. It is listed apart and never counted as a pass.
- **Within the bound** means a pass with a small measured loss: at most 5% of the bar or 1 ms, whichever is larger.
- **Unconfirmed** is the engine's own answer that it sent a request once and could not confirm its effect, so the
  agent reads before retrying. A **false ok** is an "ok" for an effect that did not happen; any one fails a step.
- **A head** is the frozen commit of the test harness a run used: H (`fefe306c`) and H‴ (`f6275fb6`) on engine 0.4.0,
  H⁗ (`3b5c0441`) and H⁵ (`7d554dea`) on 0.4.1. A step that 0.4.1's change cannot reach stands on its 0.4.0 run
  ([the reach rule](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2422), rulings 827 and 828).

### The engine on trial: 0.4.1

- **What it fixed.** 0.4.0 could answer "ok" for a drop from an Electron application that had not happened. Electron
  can lag 30–100 ms behind the pointer, and 0.4.0 read its "accept" cursor at the release, an answer for a place the
  pointer had already left. On those drags at twice the load: 62 false oks in 128 on arm64, 15 in 128 on x64. x64's
  0.4.0 run had passed only because its plan holds about 3 such drags a sitting
  ([Decision Log, ruling 827](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2400)).
- **The rule.** Before the drop the engine now asks the application, twice, whether it has caught up, and counts the
  accept only if both were answered with the pointer at rest between them. Each wait is bounded at 150 ms. An
  application that doesn't answer gets the unconfirmed answer, never an ok.
- **Measured** on the final candidate (the commits after it changed only the engine's statistics), 560 drags in each
  of three runs (arm64 at twice the load, arm64 idle, x64 at twice the load): 0 false oks, 0 plain drops that didn't
  land, 0 unanswered checks. The added wait, median / p95 / max: 2.6 / 8.6 / 90.0 ms, 1.1 / 1.5 / 14.5 ms and
  2.5 / 7.7 / 70.3 ms. With the application frozen on purpose, 10 of 10 drags on each machine answered unconfirmed and
  none answered ok ([0.4.1's measurement](engine-041/README.md#L89);
  [Decision Log, linux-engine-v0.4.1](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2423)).
- **In the counted runs** at H⁗, at twice the load: 0 false oks on both machines
  ([x64](x64/README.md#L616), [arm64 L4a](arm64/README.md#L300)).
- **Released** from 7522dcb8 by the attested release workflow (run 44380699966); the design session checked the tag,
  both digests and the attestation. Sessions refuse an engine older than 0.4.1 before anything is sent.

### 1. The eleven acceptance items, on both machines

The items are the spec's [Acceptance](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L188), 1–11.
Each was run on the exact release assets `cua install` fetches, in a home of the run's own with an empty secret store.

| # | What it proves, for a user | x64 | arm64 |
|---|---|---|---|
| 1 | No vendor process runs when cua's engine is selected | **Pass**: only the installed `cua-engine` ran, under cua's trusted worker, and no `sky_linux` ([R3](x64/README.md#L174)); doctor shows the pinned version and hash (item 9). On 0.4.0, standing under the reach rule | **Pass**, the same ([R3](arm64/README.md#L170)). On 0.4.0, standing under the reach rule |
| 2 | Every one of the 21 commands answers as the vendor's does, or as declared | **Pass** on 0.4.1: V1–V4 pass, V5 passes by ruling 680 (part 3) ([V1–V5 at H⁗](x64/README.md#L539); [the 21 commands at H](x64/README.md#L299)). Declared cells listed apart in part 3 | **PENDING:** V1–V5 at H⁵ (task 109). V1 at H⁗ stopped on a fault in the harness's audit and gave no verdict ([V1 and the hold](arm64/README.md#L325)) |
| 3 | At or below the vendor's speed | **Pass**, with #358 and #373 declared (parts 2 and 3) | **Pass so far** on the drag experiment and desktop moves (part 2). **PENDING:** the seven operations from V2 and V3 (task 109) |
| 4 | The same elements as the vendor reads | **Pass**: gedit, Chrome and the over-budget page ([V2 at H⁗](x64/README.md#L540)); the truncation line through the facade ([FB](x64/README.md#L176)) | **Pass** for the truncation line ([FB](arm64/README.md#L172)). **PENDING:** V2 (task 109) |
| 5 | Background input leaves a person's windows, focus and pointer alone | **Pass**: every real-desktop step's all-clear was clear, and the audit found 0 changes to windows the run did not open, over 195 audits ([the sitting](x64/README.md#L630), [the scan](x64/README.md#L658)) | **PENDING:** V1–V5 (task 109) |
| 6 | Text arrives once, exactly | **Pass**: gedit, Chrome's textarea and address bar, gnome-text-editor on a dedicated desktop, and every paste safety case ([V1](x64/README.md#L539), [V4](x64/README.md#L542)) | **PENDING:** V1 and V4 (task 109) |
| 7 | Duplicate and minimized windows | **Pass** ([V3, V5](x64/README.md#L541); [R1](x64/README.md#L172)) | **Pass** through the real facade ([R1](arm64/README.md#L168)). **PENDING:** V3 and V5 (task 109) |
| 8 | The device mode: refused on a shared desktop, applied on a dedicated one | **Pass**: V4, V5, P1–P6 and R4 ([V4](x64/README.md#L542), [P1–P6](x64/README.md#L186), [R4](x64/README.md#L175)) | **Pass** for P1–P6 and R4 ([P1–P6](arm64/README.md#L182), [R4](arm64/README.md#L171)). **PENDING:** V4 and V5 (task 109) |
| 9 | `cua install --engine` fetches, verifies and installs the engine | **Pass** in an empty home: the pin's hash, `static-pie linked`, doctor's engine row passes ([item 9](x64/README.md#L131)). Shown on 0.4.0 | **Pass**, the same, `statically linked` ([item 9](arm64/README.md#L123)). Shown on 0.4.0 |
| 10 | The suites pass | **Pass**: R1 (34 cases a lane, only declared differences), R2 (`VERDICT: PASS`, nothing left unproved), R3 ([R1–R3](x64/README.md#L172)); `ci-gate` GREEN 8/8 on H⁵, run 44494920319 ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2490)) | **Pass**: R1 (the vendor's three declared arm64 defects), R2 (the vendor's typeText and paste not judged, part 3), R3 ([R1–R3](arm64/README.md#L168)) |
| 11 | Items 2–8 hold on arm64 | – | **PENDING:** follows from items 2–8 above (task 109) |

**The gate's other steps** (the settle, the paste stops, drops and the block at twice the load) all pass on x64
([at H](x64/README.md#L150), [at H⁗](x64/README.md#L520)). On arm64 every idle step passes
([at H‴](arm64/README.md#L144), [at H⁗](arm64/README.md#L277)). At twice the load on arm64, 12 steps pass and four
were recorded as failing, each ruled by the design session and listed in part 3: L3b passes once #302's key-release
form is judged, L3c and L3d are a declared arm64 limit (#429), and L4b fails only on a measurement lane that no
shipped code can select.

**Where the evidence is thinner than the item.** Steps outside 0.4.1's reach ran on 0.4.0 on both machines: among
them items 1 and 9, the suites R1–R4, and the device-mode probes P1–P6. 0.4.1 changed how the engine confirms a
drop, and these steps either never reach that code or were shown not to take it (rulings 827, 828). On 0.4.1 the
install is shown by each acceptance home's own `cua install` and the pinned-release check ([x64](x64/README.md#L489),
[arm64](arm64/README.md#L255)), not by item 9's empty-home doctor. Part 6's live checks run R3 and R4 on the current
pin.

### 2. The measured bar

**The seven operations**, x64 on 0.4.1 (V2 and V3 at H⁗, real desktop), in ms, cold / warm. Every row but the last
passes as **faster**, with cua's interval wholly below 0.

| scene, operation | pinned | newest | cua | cua's verdict |
|---|---|---|---|---|
| gedit, 480-element tree read | 620.7 / 615 | 592.1 / 567.6 | 94.3 / 81.8 | faster |
| Chrome, 222-element page read | 507.4 / 453.5 | 502.3 / 480.2 | 72.3 / 61.3 | faster |
| gedit, window screenshot | 790 / 743.2 | 738.1 / 772.6 | 135.9 / 103.7 | faster |
| Chrome, window screenshot | 640.5 / 586.5 | 621.5 / 590.4 | 118.8 / 92.9 | faster |
| gedit, `press_key` | 273.5 / 269.2 | 240.3 / 235.7 | 7.1 / 1 | faster |
| Chrome, `press_key` | 273.7 / 269.5 | 240.6 / 236.2 | 6 / 1.2 | faster |
| gedit, `click` | 219.9 / 214.9 | 223.3 / 215.5 | 20.4 / 13.8 | faster |
| Chrome, `click` | 219.9 / 215.1 | 220.8 / 215.6 | 19 / 14.5 | faster |
| Chrome, `scroll` (covered window) | 315.1 / 311.8 | 316.4 / 311.9 | 114.4 / 110.1 | faster |
| Chrome, `drag` (covered window) | 708.5 / 713.4 | 419 / 413.7 | 3.8 / 1.2 | **declared refusal**: a Chromium drag on a shared desktop is refused unless its path is visible, so 1.2 ms is a refusal's time, not a drag's |

Source: the rows of [V2](x64/h4/zero/V2.pinned-release/run/summary.md) and
[V3](x64/h4/zero/V3.pinned-release/run/summary.md) at H⁗, read with the run's own extractor
(`x64/scripts/seven-ops.py`). The same table on 0.4.0, at H, is in the [x64 README](x64/README.md#L335).

**arm64, the seven operations. PENDING:** the same table from arm64's V2 and V3 at H⁵ (task 109).

**Drags, judged with every run's effect.** Warm medians in ms.

| | x64 | arm64 |
|---|---|---|
| Chrome canvas path | cua 476.7 against the newest build's 515.5: faster ([D1 at H⁗](x64/h4/out/D1.pinned-release/run/summary.md)) | cua 473.3 against 485.3: faster ([D1 at H⁗](arm64/h4/out/D1.pinned-release/run/summary.md)) |
| Chrome drag and drop | cua 369 against 338.4: **declared gap #358**, within its 40 ms | cua 354.6 against 328.1: **declared gap #358**, within its 40 ms |
| Firefox canvas path | cua 354.6 against the newest's 515.2: faster ([D3 at H](x64/out/D3.pinned-release/run/summary.md), 0.4.0) | cua 351.9 against the pinned build's 1063.55, since the newest took only 1 of 40: faster ([D3 at H‴](arm64/out/D3.pinned-release/run/summary.md), 0.4.0) |
| Chrome's scrollbar thumb | 30 of 30 land at or past the pinned build's mean, shortest 146 px against its 130.6 | 30 of 30, shortest 146 px against 128.3 |
| Electron's scrollbar thumb | 30 of 30, shortest 143 px against 129.4 ([D2 at H⁗](x64/h4/out/D2.pinned-release/run/summary.md)) | 30 of 30, shortest 144 px against 129.6 ([D2 at H⁗](arm64/h4/out/D2.pinned-release/run/summary.md)) |
| Desktop `move`, first request / later ones | 74.72 against the pinned 83.29 and newest 83.98; 0.46 against 8.64 and 6.04: faster ([E1 at H⁗](x64/h4/out/E1.pinned-release/run/summary.md)) | 72.97 against 81.14 and 81.49; 0.10 against 8.16 and 5.36: faster ([E1 at H‴](arm64/out/E1.pinned-release/run/summary.md), 0.4.0) |

### 3. Everything declared, listed apart

None of these counts as a pass.

**Declared speed gaps.**

| gap | what a user meets | x64 | arm64 |
|---|---|---|---|
| #358 | Chrome's long drag and drop is a little slower than the newest vendor build. The engine holds every drop briefly so it can tell an honest answer | 369 ms against 338.4, the difference [24.6, 33.2] within the declared 40 ms (D1 at H⁗) | 354.6 against 328.1, [26.4, 26.6] (D1 at H⁗) |
| #373 | Bringing a window to the front is about 7–9 ms slower, because the engine waits until the window is really on top before the next input goes out | cold 11.39 ms against the bar's 4.77, [4.63, 10.915]; warm 9.93 against 0.69, [6.955, 11.93]; within its 15 ms bound ([V3 at H⁗](x64/h4/zero/V3.pinned-release/run/summary.md)) | **PENDING:** V3 at H⁵ (task 109) |

**Unconfirmed or refused by design** (V3, Chrome page that draws its own context menu):

- `right_click_fallback` and `secondary_action`: the action took effect 40 of 40 times, and cua answered
  **unconfirmed** 40 of 40, where the vendor answered ok. The answer takes about a second, the engine's wait for a menu:
  1,038 and 1,037.5 ms warm, against the vendor's 706.5 and 353
  ([V3 at H⁗](x64/h4/zero/V3.pinned-release/run/summary.md); rulings 687, 688).
- `drag` on a covered Chrome window: **refused** (part 2's last row).
- arm64: **PENDING:** V3 at H⁵ (task 109).

**#302, an Electron key release that reaches the tree late.** The key arrives; its release shows in the page's tree
after the engine's settle has passed. Each run that fits #302's form counts toward a series' 30 consecutive passes and
is listed apart.

| form | x64 | arm64 |
|---|---|---|
| `press_key` | 6 of 30 at idle ([S1 at H⁗](x64/h4/out/S1.pinned-release/run/summary.md)); 4 of 30 at twice the load ([L3b at H⁗](x64/h4/out/L3b.pinned-release/run/summary.md)) | 0 at idle ([S1 at H⁗](arm64/h4/out/S1.pinned-release/run/summary.md)); 4 of 30 and 7 of 30 at twice the load ([L3b at H⁗](arm64/h4/out/L3b.pinned-release/run/summary.md)) |
| `key_up`, a key held across separate down and up requests, which X repeats as it does a person's held key | 0 in every stored L3b | 4 of 33 at twice the load, 186.8–251.4 ms after a 0.2–3.5 ms answer. L3b was recorded as failing and passes once this form is judged; its trial 32 stays an honest miss ([the re-judge](rejudge-302-keyup.txt#L42); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2468)) |

**arm64 at twice the load: the window manager lags `activate_window` (L3c, L3d; #429).** In a few runs per
application the tree lagged after `activate_window` answered: gedit 4 of 39, kate 3 of 33, Qt Creator 3 of 51,
Writer 2 of 39, gnome-terminal 2 of 40, and a desktop click 2 of 31. Both steps were recorded as failing. The design
session ruled them a declared arm64 limit, not an engine fault, after an experiment measured what a user would feel: in
200 runs at twice the load, keyboard focus was on the target at the answer 200 of 200 times and stayed there for
500 ms, and a key sent right after the answer landed in the target 200 of 200. The window manager's own record of the
active window had not caught up at the answer in 9 of 200. #429 (P2) makes `activate_window` wait for that record
([L3c, L3d](arm64/README.md#L297); [the experiment](arm64/README.md#L383);
[Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2484)).

**L4b, a finding, not a step failure.** L4b measures `cua:accept`, a variant that drops at the accept cursor. It sits
behind an engine flag that defaults off, and nothing that ships can select it. On arm64 it answered ok with no drop
once in 30, and in one cell released early at the accept 5 times, 2 of them answered ok
([L4b](arm64/README.md#L301); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2485)).
On x64 at H it released 6 times, 3 answered ok with nothing pending ([declared rows](x64/README.md#L378)).

**Passes within a bound.**

| pass | x64 | arm64 |
|---|---|---|
| gedit `clipboard_release`, warm | within the bound, [0.06, 0.125] ms ([V1 at H⁗](x64/h4/zero/V1.pinned-release/run/summary.md)) | **PENDING:** V1 at H⁵ (task 109) |
| desktop `launch_app`, warm | within the bound, [0.2, 0.82] ms ([V2 at H⁗](x64/h4/zero/V2.pinned-release/run/summary.md)) | **PENDING:** V2 at H⁵ (task 109) |
| desktop `key_up`, later requests | within the bound, [0.005, 0.08] ms ([E1 at H⁗](x64/h4/out/E1.pinned-release/run/summary.md)) | within the bound, [0.01, 0.01] ms ([E1 at H‴](arm64/out/E1.pinned-release/run/summary.md)) |
| L4a's residue: plain Electron drops at twice the load that honestly answered unconfirmed and didn't land, at most 2 in 100 | 0 of 100, and 0 of 100 by drag handle | 0 of 100, and **1 of 100** by drag handle ([L4a](arm64/README.md#L300); [the rule](l4a-residue/README.md)) |
| V5's late-take drag into Chrome | **passes by ruling 680**: in 1 of 9 samples the drag ended 221 ms after the press, after the observation window had closed (the answer at 164.02 ms, plus 20 ms). Every other check on it passed: the notice, the read, and the refused next request. The stored verdict FAIL stands beside the ruling ([V5 at H⁗, ruled](x64/README.md#L671); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2455)) | **PENDING:** V5 at H⁵, judged live by ruling 680 as now built into the judge (task 109) |

**Ruling 830, an ok whose drop missed the zone.** Electron said the drop was copied, and the drop zone's counter did
not move. It is an application-level limit, listed apart in every run.
- x64: none in 320 drags in each of H1, H2 and L4a ([x64](x64/README.md#L616)).
- arm64: none in 320 in each of H1 and H2. At twice the load, L4a listed **1 of 30** drags in its `cua left` cell
  ([L4a](arm64/README.md#L300)).

**Ruling 838**, Electron drags that end over Chrome, counted by answer: 0 ok, 30 unconfirmed of 30 on each lane, on both
machines (H2; [x64](x64/README.md#L616), [arm64](arm64/README.md#L289)).

**#425, a harness gap.** On a private display, the harness's whole-run record could excuse a change to a window by
crediting it to one of the run's own windows created up to a second later. It is a gap in the test, not the engine.
It reaches only private displays, where only the run's own programs run. It is declared, carried as a pending test,
and P3 after M5 ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2466)).

**What arm64 could not show.**

- **No vendor bar for text.** The arm64 vendor builds end gedit when they type, paste or write the clipboard. So
  cua's text has no vendor answer or timing to compare with: R2's typeText and paste read "not judged: the vendor never
  completed it". cua's own text checks still apply ([vendor ends](arm64/README.md#L226)).
- **Nobody's desktop.** arm64's real desktop runs on a virtual screen (Xorg's dummy driver, 1280x800) that nobody uses.
  The background-input checks there show the engine's behaviour, not a person's session
  ([Decision Log, the arm64 VM](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2312)).
- **The browser's version isn't recorded by the harness.** That F2's runs drove Chrome 158 rests on the program path
  logged beside them ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L715)).
- **arm64 after this run.** Once the arm64 VM is deleted, the engine is tested on arm64 only when a release is cut.
  A ticket for an arm64 leg of the pull-request gate is drafted for close-out
  ([F7](../../../doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md#L367)).
- The engine's two-screen test script names x64 only. It ran on arm64 from a two-line copy, 3 of 3
  ([H‴'s local proof](arm64/README.md#L54)).

### 4. What changes for a user

- **Text arrives** in every family the run covers (item 6). Each `typeText` and `paste` answers applied, not applied
  with nothing sent, or unconfirmed, and nothing is sent twice
  ([README, what a session sees](../../../../README.md#L1273)).
- **Requests the vendor answered ok with no effect now take effect, refuse, or say unconfirmed.** Among them: Chromium
  drops taken after the release, Firefox's background pointer input with the real pointer outside its window, an
  expired drag handle, and a context menu that never opened
  ([M4's outcomes](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2543)). The Electron drop that
  0.4.0 answered ok wrongly is fixed in 0.4.1 (above).
- **The device mode.** `shared`, the default, assumes a person may be using the desktop: background input changes
  nothing they see, and input an application would ignore is refused with a sentence. `dedicated` gives the desktop to
  the agent; the cloud template sets it ([README](../../../../README.md#L1262)).
- **The limits** ([README](../../../../README.md#L1297)): Electron's tree needs `--force-renderer-accessibility`
  (#228); GTK 4 needs a dedicated desktop for input; Firefox and xterm in the background; context menus (#377, #378,
  #379); a context-menu Copy Chrome doesn't serve (#375, #376); Chromium drags; late drops (#364, #365, #372); Qt's
  wheel and paste; minimized and duplicate windows; the declared speed gaps (#358, #373, #263, #269, #302); out of
  scope: Wayland (#224), characters off the keyboard layout (#226), pixel-precise scrolling (#227), held input after
  an engine dies on a shared desktop (#277).
- **Limits named during M5:**
  - **#379** (P3): GTK 4's, Firefox's and Qt's menus are not detected, so those requests answer unconfirmed.
  - **#393** (P3): a menu check confirms that *a* menu appeared, not necessarily the one requested, when another menu
    opens at the same moment. It is the Linux twin of macOS's #392
    ([#393](https://github.com/SSFSKIM/cua/issues/393)).
  - **#418** (P3): when an Electron drop into Chrome can't be confirmed by its own check but Chrome's activation
    confirms it, the answer is ok, and the model isn't told the check failed. It is recorded only in the engine's
    statistics ([ruling 835](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2426)).
  - **#429** (P2): `activate_window` can answer before the window manager records the new active window (part 3).
  - **#384**, the browser, not the Linux engine: under near-saturating CPU load, a background tab the agent drives can
    stall reads for 3–15 s. It is documented as a heavy-load limit in main's README, from 0.28.14
    ([#384](https://github.com/SSFSKIM/cua/issues/384)).
  - **The engine's clipboard unit test is flaky in CI**, six sightings, each passing on rerun. Its fix rides the next
    engine release ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2309)). It is a
    test's race, not a user's.

### 5. The way back

A user who wants the vendor engine back sets `CUA_NATIVE_ENGINE=vendor` in `cua serve`'s environment, for that
server's sessions, or `"engine": "vendor"` in `~/.config/cua/engine.json`, for every session of the account. The
variable wins over the file. This stays available until M6b retires the vendor engine
([README, selecting it](../../../../README.md#L1252)).

After the flip, a home with no cua engine, an engine older than 0.4.1, or an install record that doesn't match its
file keeps the vendor engine on its own, with a warning that names `cua install --engine`. An explicit choice of cua's
engine still refuses an old one ([F5](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2224)).

### 6. The flipped default, live

**PENDING:** task 110's live checks on the prepared flip, on a new base, on both machines:
- R3 and R4 with no engine setting at all, which must select cua's engine with reason `default` and run no `sky_linux`;
- the same checks on the commit before the flip, which must fail naming `vendor`;
- the fallback homes (no engine, an older one, a mismatched record), which must keep the vendor engine with the warning.

**Superseded:** task 86 ran these on x64 at an older base, `62a461f6`, on engine 0.4.0. Before the flip, R3 and R4
failed as required, naming `vendor (default)`. After it, R3 passed 13 of 13, R4 20 of 20, and each fallback home 9 of 9
(task 86's report, local). They are not cited as this decision's evidence.

### 7. The unjudged passes

These ran once each, as development runs, and are not verdicts.

**The vendor's third build, 26.1111.21308, x64** (on 0.4.0, at H; [F3's lane](x64/README.md#L416)). cold / warm, ms.

| scene, operation | pinned | 26.1111.21308 | cua |
|---|---|---|---|
| gedit, tree read | 647 / 572.6 | 600.3 / 574.1 | 93 / 80.3 |
| Chrome, page read | 454.8 / 440.3 | 445.3 / 426.5 | 67.3 / 63.7 |
| gedit, screenshot | 751.8 / 720.1 | 732.2 / 709.8 | 137 / 106.4 |
| Chrome, screenshot | 594.5 / 572.6 | 606.4 / 553.7 | 124.8 / 89.1 |
| gedit, `press_key` | 273.3 / 269 | 240.5 / 235.8 | 6.9 / 1.1 |
| Chrome, `press_key` | 273.5 / 269.2 | 240.4 / 236 | 5.8 / 1.4 |
| gedit, `click` | 219.5 / 215.3 | 222.9 / 215.9 | 21.2 / 13.9 |
| Chrome, `click` | 219 / 215 | 220.4 / 215.7 | 18.9 / 14 |
| Chrome, `scroll` (covered) | 314.8 / 311.3 | 316.5 / 311.9 | 114.5 / 110.1 |
| Chrome, `drag` (covered) | 713.4 / 710.4 | 417.6 / 412.6 | 3.5 / 1.1, a refusal |

The build was verified against the vendor's signed index and its own signature. V3's rows (scroll, drag) come from a
run a harness guard stopped after its series were complete.

**arm64:**
- **Chrome 158 (current stable), private display:** D1 passed and S1 completed on Chrome 158.0.8127.36
  ([F2's private part](arm64/README.md#L404)).
- **PENDING:** F2's real-desktop parts on Chrome 158 (V2's Chrome scene, V3, V5), after task 109's sitting.
- **PENDING:** F3, the seven operations against 26.1111.21308 on arm64, after task 109's sitting.

### If you say no

The flip is not merged. M5's pull request still lands the evidence, the harness and the docs, which then describe
cua's engine as selectable and the vendor engine as the default. The decision and what would change it go into the
Decision Log. #266, arm64's verdict, closes either way. The plugin version still goes up, because the Linux document
and the agent's rules change either way. M6a, a vendor-free runtime, can still start; M6b, retiring the vendor
engine, cannot, because its trial period is of the default
([pre-flight, if the owner says no](../../../doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md#L258)).
