# #171 M5: cua's own Linux engine on x64 and arm64: the acceptance evidence, and the Linux default for decision

## For the owner

This page is for one decision: whether a Linux session that names no engine runs on **cua's own engine**,
`cua-engine` 0.4.3, instead of the **vendor engine** (`sky_linux`, the engine inside OpenAI's computer-use runtime,
which cua installs and uses by default today). macOS does not change. Either way, a user can still choose either
engine (part 5).

**Where the evidence stands.**

- **arm64: complete on 0.4.3.** At the frozen head H8 every step 0.4.3 can reach passes, V5 on the real desktop
  included, apart from one measurement lane nothing that ships can select (#474, part 3)
  ([arm64 README, at H8](arm64/README.md#L1109);
  [Decision Log, the counted reach at H8](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2707)).
- **x64: complete on 0.4.3 except its last real-desktop sitting.** Every step of the reach passed on its first run
  ([x64 README, at H8](x64/README.md#L1243)). V5 last ran at H6 on 0.4.2 and passed 52 of 52
  ([x64 V5 at H6](x64/README.md#L938)).
  **PENDING:** x64's V5 at H8 on 0.4.3, in the owner's window 11-23 02:30–08:00Z; it fills the x64 V5 cells below.
- **PENDING:** the flipped default, shown live: T10's live checks on both machines (task 137), part 6.
- **PENDING:** the reach table of main's new commits, which says which steps, if any, they send back to a run.

Steps that 0.4.3's change cannot reach stand on the run of an earlier release (the reach rule, under "How to read").
Part 1 names, for every item, the release each verdict stands on.

### What a user gets

- **Text arrives, exactly and once.** On x64, `typeText` into gedit takes 69.9 ms and reads back exactly 40 times out
  of 40. The pinned vendor build fails it after 10.2 s (10,204.1 ms, 0 of 40 read back equal), and the newest vendor
  build takes 838.4 ms ([V1 at H⁗](x64/h4/zero/V1.pinned-release/run/summary.md)). On arm64 cua takes 42.3 ms
  against the newest build's 769.8, and the pinned build ends gedit instead of typing (0 of 40)
  ([V1 at H⁵](arm64/h5/out/V1.pinned-release/run/summary.md)).
- **Several times faster.** A read of gedit's 480-element tree takes 81.8 ms against the faster vendor build's 567.6
  on x64, and 49.3 against 186.4 on arm64. A key press takes 1 ms against 235.7 (x64) and 0.4 against 234.1 (arm64);
  a click 13.8 against 214.9, and 12.6 against 213.1 (warm medians, part 2).
- **Answers that are true.** Requests the vendor answered "ok" without doing anything now take effect, refuse with a
  sentence the agent can act on, or say "unconfirmed" (part 4). 0.4.1 and 0.4.2 each fixed a false "ok" the run found
  in the release before (the next section). 0.4.3 mitigates a third, on a long Chrome drag and drop (#459), to a
  measured residual bound, not zero: no false ok in 200 measured drags at arm64 twice the load, 95% upper bound 1.5%.
- **The person's desktop is left alone.** On a shared desktop, input to a background window moves neither the active
  window, the focus nor the pointer. An application that ignores background input is refused instead of being brought
  forward (part 4).
- **Windows are reported as they are.** A minimized window is listed and still reads. A tree too large to read whole
  says so. Duplicate windows that can't be told apart are refused rather than read as a one-node tree.

### What a user loses or meets

- **Some applications need a dedicated desktop for input**: GTK 4 applications such as gnome-text-editor, xterm's
  keys, and Firefox while the real pointer is outside its window. On a shared desktop these are refused with a
  sentence, where the vendor sent input they ignore ([README, the device mode](../../../../README.md#L1262)).
- **Every short drag from a Chrome or Electron window takes about 450 ms.** The engine keeps the button down until
  450 ms after the press unless the page starts its drag and drop sooner, because Chrome drops a drag its page starts
  after the button is up. A 40 px Chrome selection takes 455.1 ms on x64 and 452.2 on arm64, against the newest vendor
  build's 320.8 and 311.7; a scrollbar thumb 455.1 and 452.2 against 262.7 and 257.9
  ([x64 D1 at H8](x64/h8/out/D1.pinned-release/run/summary.md),
  [arm64 D1 at H8](arm64/h8/out/D1.pinned-release/run/summary.md)). Electron's short drags take 456–457 ms against
  the newest build's 262–324 ([x64 D2 at H6](x64/h6/out/D2.pinned-release/run/summary.md)). These drags carry no
  speed verdict; the cost is declared to you here
  ([Decision Log, 900.4](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2557)).
- **A page whose own dragstart code blocks longer than about 450 ms can lose the drag behind an "ok".** On Chrome 156
  at idle on x64, a dragstart handler busy 400 ms landed 6 of 6 (24 of 24 pooled with a dragstart handler busy 150 ms
  and press handlers busy 150 and 400 ms), and one busy 500 or 600 ms lost 6 of 6 each, every one a plain ok
  ([0.4.2's release notes](engine-042/release-notes.md#L88)). It is a
  declared limit ([Decision Log, 900.2](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2602)).
- **Chrome's long drag and drop is about 27–31 ms slower than the newest vendor build** (#358, within its declared
  40 ms), and a drop whose path goes on past 350 ms after its take ends about 25 ms later for 0.4.3's tail.
  Bringing a window to the front is about 7–9 ms slower on x64 (#373). On x64 at twice the load, a short Chrome
  drop's release came up to about 7 ms after the 350 ms it is held for; it costs time only (part 3).
- **Under heavy load the window manager can record a window as active up to about 100 ms after `activate_window`
  answers**, on both machines; keyboard focus and typed keys already go to the right window (#429, part 3).
- **On arm64 at twice the load, about 1 in 8 Chrome drags onto a page in front didn't land on 0.4.2, and said so**
  (#449): 87 of 750 across 0.4.2's development heads. No rate was measured on 0.4.3, the release proposed as the
  default (part 3).
- **On arm64 at twice the load, an Electron drop can answer ok where it landed outside the target** (#415, a declared
  limit): 4 of 30 long Electron drags at H8 on 0.4.3, 3 of 30 in L4a at H6 on 0.4.2 (part 3).
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
- **What an "ok" claims differs by engine** (ruling 960). cua's plain ok on a Chrome drop claims the drop was
  confirmed. The vendor's ok claims only that the action ran, and says nothing about a drop. So a cua false ok and a
  vendor ok with no drop are different things. The comparable wrong outcome on both is a drop at a stale position,
  where the page dropped somewhere the path had already left.
- **A residual bound** is the exact one-sided 95% upper bound on a rate measured as 0 in n: 1.5% for 0 in 200.
- **Steps** are the gate's: V1–V5 and Z0 on the real desktop; D1–D5 the drag experiment per family (D1 Chrome, D2
  Electron, D3 Firefox); C1 and K1–K3 Chrome's late-take bands, its hold's canary and regression cells; H1 and H2
  Electron's drops; S1–S4 the settle series; L1–L4d steps at twice the load (L4a–L4d the drops); R1–R4 the facade
  suites; P1–P6 the device-mode probes; E1 the desktop route's events.
- **A head** is the frozen commit of the test harness a run used:

  | engine | heads |
  |---|---|
  | 0.4.0 | H (`fefe306c`), H‴ (`f6275fb6`) |
  | 0.4.1 | H⁗ (`3b5c0441`), H⁵ (`7d554dea`) |
  | 0.4.2 | H6 (`69bd7993`), H7 (`ae3fc1e8`), H7.1 (`96fa1fd3`) |
  | 0.4.3 | H8 (`048140a2`) |

- **The reach rule.** When a release changes the engine, only the steps its change can reach run again; every other
  step stands on its last run, with one cross-check step rerun to show it would not move
  ([Decision Log, rulings 827 and 828](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2444)). 0.4.3
  changes only how a Chrome drop ends, so its reach is the Chrome-source steps (D1, C1, K1–K3, L2a, L4b, L4c, L4d, V5),
  with H1 as the cross-check and item 9 and the doctor for the new asset
  ([Decision Log, the list](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2708)). H1 at H8 matched
  its H6 record cell by cell on both machines, so the steps outside the reach stand
  ([x64](x64/README.md#L1366), [arm64](arm64/README.md#L1160)).

### The engine on trial: 0.4.3, and the two releases before it

0.4.1 and 0.4.2 each fixed a false "ok" the acceptance run had just found in the release before. 0.4.3 mitigates the
third, #459, to a measured residual bound; #459 stays open.

**0.4.1: Electron drops** ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2400)).
- **The fault.** 0.4.0 read an Electron application's "accept" cursor at the release, but Electron can lag 30–100 ms
  behind the pointer, so the answer was for a place the pointer had already left. At twice the load: 62 false oks in
  128 drags on arm64, 15 in 128 on x64.
- **The rule.** Before the drop the engine asks the application, twice, whether it has caught up, and counts the
  accept only if both were answered with the pointer at rest between them. Each wait is bounded at 150 ms; an
  application that doesn't answer gets the unconfirmed answer, never an ok.
- **Measured:** 0 false oks in 560 drags in each of three runs, the added wait median 1.1–2.6 ms
  ([0.4.1's measurement](engine-041/README.md#L89)). In the counted Electron drop steps since (H1, H2, L4a), 0 false
  oks on both machines.

**0.4.2: Chrome drags whose page starts late**
([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2492)).
- **The fault.** arm64's V5 on 0.4.1 failed two cells: Chrome's page started its drag 47–108 ms after the engine had
  released the button, so the browser refused it, and the engine, which saw nothing, answered ok
  ([arm64 V5 at H⁵](arm64/README.md#L511)). It isn't arm-only: on x64 at twice the load the same shape came in 36 of 52
  cold samples of the cancel cell.
- **The rule.** A drag from a Chrome or Electron window keeps its button down until press + 450 ms unless the page
  takes the drag sooner, then releases at once. For a source positively identified as Chrome or Chromium, a slow
  answer to the window manager's ping extends the hold to 650 ms, and a drag with no drag and drop by then answers ok
  with the notice "the page may have started a drag that did not complete"
  ([Decision Log, 897–900](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2549)).
- **Measured:** V5's two cells pass on both machines (52 of 52 at H6 on each). At arm64 twice the load, 0 false oks
  in front on Chrome 156 and 158, 75 samples each, and every page that started past 450 ms was caught by the
  extension ([the residue check](engine-042/tail/README.md#L53)).
- **What it costs:** the 450 ms short drag and the 450 ms handler limit above. A late take, a drag and drop that
  starts after the release, now has a window of about 3 ms
  ([Decision Log, 931](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2587)).

**0.4.3: a long Chrome drag and drop ends on a tail (#459, mitigated, not fixed)**
([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2646);
[release notes](https://github.com/SSFSKIM/cua/releases/tag/linux-engine-v0.4.3)).
- **The fault, on 0.4.1 and 0.4.2.** A Chrome drop is held at least 350 ms after its page takes it. A path that went
  on past that was released straight after its last step. Under load Chrome then dropped on an answer one renderer
  round trip old, at a position the path had already left, and confirmed the drop, so the engine answered a plain ok.
  The counted L4d on 0.4.2 found it at twice the load: on arm64 10 false oks and 5 stale-position drops in 100 long
  drags, plus one stale drop in the floor cell; on x64 1 false ok in 100. The vendor builds, on the same cell and
  load, made 0 stale-position drops in 100 each
  ([Decision Log, 986–988](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2647)). Chromium's
  source explains it, and a standalone program with no cua code in it reproduces it; a Chromium bug report was drafted
  from that program.
- **The rule, the owner's option B** (rulings 990, 997). The engine ends every such drop the way the newest vendor
  build ends a drag: rest 8 ms, move to the last point, rest 8 ms, move there again, rest 8 ms, release. A drop that
  ends inside its 350 ms is scheduled the same two visits, 16 and 8 ms before the 350 ms ends, with the release kept at
  take + 350: a visit whose time has passed, or whose wakeup would land within 4 ms of the release, is skipped rather
  than moving the release. Observed: in the development runs at arm64 twice the load the in-floor tail skipped one
  visit on 10 drags and both on 5 (15 of 191), none answering wrong
  ([0.4.3's measurement, part 2](engine-043/measure/README.md#L51)); in the counted x64 L4d at twice the load the
  in-floor releases came 350–357.3 ms after the take, and counted rows don't record how many visits ran
  ([x64 L4d](x64/README.md#L1344)). A `drag_handle` end into Chrome gets the visits too. A second option, answering
  such drops unconfirmed, is built and shipped off.
- **The residual bound.** No false ok and no stale-position drop in 200 measured long Chrome drags at arm64 twice the
  load: 95% upper bound 1.5% each. The 0.4.2 control interleaved with them gave 9 false oks and 6 stale drops in 100
  ([0.4.3's measurement, part 1](engine-043/measure/README.md#L30)). Pooled with the 200 tail drags measured before
  the candidate, 0 in 400, bound 0.75%. The handle end: 0 in 300, bound 1.0%
  ([part 10](engine-043/measure/README.md#L244)). It is not "fixed": the bound is what was measured.
- **In the counted runs at H8**, L4d at twice the load on both machines: 0 false oks and 0 stale-position drops on
  every Chrome cell, 100 long drags and 360 floor drags each; on x64 300 of 300 plain drops landed, on arm64 300 of
  300 ([x64 L4d](x64/README.md#L1333), [arm64 L4d](arm64/README.md#L1192)).
- **What it costs:** about 25 ms on a drop whose path outlasts the 350 ms (+25.7–25.9 ms median), about 20 ms on a
  Chrome handle end, and no time by its schedule on a drop that ends inside it (the observed release under load is in
  part 3). D1's three runs on x64 stayed inside #358's 40 ms bound
  ([part 4](engine-043/measure/README.md#L97)).
- **Released** from ba5b0438 by the attested release workflow (run 44966356899): x64 `f1513e79…921f`, arm64
  `dd74e19b…cf1e`, byte-identical to the measured arm64 binary, both attestations verified. Pinned with
  `MIN_ENGINE_VERSION` 0.4.3: a session refuses an older engine before anything is sent
  ([Decision Log, the release and the pin](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2700)).
- **What the tail is not proven on:** on the foreground and desktop routes the visits are a 1 px step and back
  through XTEST, proved by the engine's live test only, with no counted rate; and no counted step sends a Chrome drop
  on the desktop route (#460, part 3).

### 1. The eleven acceptance items, on both machines

The items are the spec's [Acceptance](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L188), 1–11.
Each was run on the exact release assets `cua install` fetches, in a home of the run's own with an empty secret store.
Each cell names the release its verdict stands on.

| # | What it proves, for a user | x64 | arm64 |
|---|---|---|---|
| 1 | No vendor process runs when cua's engine is selected | **Pass** on 0.4.0: only the installed `cua-engine` ran, under cua's trusted worker, and no `sky_linux` ([R3 at H](x64/README.md#L174)). Item 9 shows doctor naming the 0.4.3 pin. R3 reruns on 0.4.3 with the flip (part 6) | **Pass** on 0.4.0, the same ([R3 at H‴](arm64/README.md#L197)). The same rerun with the flip |
| 2 | Every one of the 21 commands answers as the vendor's does, or as declared | **Pass**: V1–V4 on 0.4.1 ([at H⁗](x64/README.md#L539); [the 21 commands at H](x64/README.md#L299)); V5 on 0.4.2, 52 of 52 ([at H6](x64/README.md#L938)); `move_relative` and `drag_handle`, which V1–V5 don't send, by E1 on 0.4.1 ([E1 at H⁗](x64/README.md#L578); [the map](x64/README.md#L325)). **PENDING:** V5 on 0.4.3 at H8 (the owner's window). Declared cells in part 3 | **Pass**: V1–V4 on 0.4.1 ([at H⁵](arm64/README.md#L489)); V5 on 0.4.3, 52 of 52 ([at H8](arm64/README.md#L1213)); `move_relative` and `drag_handle` by E1 on 0.4.0 ([E1 at H‴](arm64/README.md#L200)). Declared cells in part 3 |
| 3 | At or below the vendor's speed | **Pass**: the seven operations on 0.4.1 (V2, V3 at H⁗); Chrome's drags on 0.4.3 ([D1 at H8](x64/h8/out/D1.pinned-release/run/summary.md)); Electron's on 0.4.2 ([D2 at H6](x64/h6/out/D2.pinned-release/run/summary.md)); Firefox's on 0.4.0 (D3 at H); desktop moves on 0.4.1 (E1 at H⁗). #358 and #373 declared (parts 2 and 3) | **Pass**: the seven operations on 0.4.1 (V2, V3 at H⁵); Chrome's drags on 0.4.3 ([D1 at H8](arm64/h8/out/D1.pinned-release/run/summary.md)); Electron's on 0.4.2 ([D2 at H6](arm64/h6/out/D2.pinned-release/run/summary.md)); Firefox's and desktop moves on 0.4.0 (D3, E1 at H‴). #358 declared; `activate_window` within the bound (parts 2 and 3) |
| 4 | The same elements as the vendor reads | **Pass**: gedit, Chrome and the over-budget page, V2 on 0.4.1 ([V2 at H⁗](x64/README.md#L540)); the truncation line through the facade, FB on 0.4.0 ([FB at H](x64/README.md#L176)) | **Pass**: V2 on 0.4.1 ([at H⁵](arm64/README.md#L490)); the truncation line, FB on 0.4.0 ([FB at H‴](arm64/README.md#L199)) |
| 5 | Background input leaves a person's windows, focus and pointer alone | **Pass**: the sitting's V1–V5 and Z0 on 0.4.1, every all-clear clear, 0 changes to windows the run did not open over 195 audits ([the sitting at H⁗](x64/README.md#L630), [the scan](x64/README.md#L658)); V5 on 0.4.2 clear with the owner's windows unchanged over 209 checks ([V5 at H6](x64/README.md#L962)). **PENDING:** V5 at H8 | **Pass**: every completed run clear: V1–V4, Z0 and V5 on 0.4.1 ([at H⁵](arm64/README.md#L497)), V5 on 0.4.2 ([at H6](arm64/README.md#L712)) and on 0.4.3 ([at H8](arm64/README.md#L1213)). Set apart: three V5 attempts the guard stopped (one at H⁵, two at H8) read NOT CLEAR and have no verdict (#432, part 3). Nobody uses this desktop (part 3) |
| 6 | Text arrives once, exactly | **Pass**: gedit, Chrome's textarea and address bar, gnome-text-editor on a dedicated desktop, every paste safety case ([V1](x64/README.md#L539), [V4](x64/README.md#L542)), on 0.4.1 | **Pass**: V1 and V4 on 0.4.1, every paste case ([at H⁵](arm64/README.md#L489)) |
| 7 | Duplicate and minimized windows | **Pass**: V3 on 0.4.1 ([at H⁗](x64/README.md#L541)), V5 on 0.4.2 ([at H6](x64/README.md#L938)), R1 on 0.4.0 ([at H](x64/README.md#L172)) | **Pass**: V3 on 0.4.1 with no verdict FAIL ([at H⁵](arm64/README.md#L491)), V5 on 0.4.3 ([at H8](arm64/README.md#L1213)); R1 through the real facade on 0.4.0 ([at H‴](arm64/README.md#L195)) |
| 8 | The device mode: refused on a shared desktop, applied on a dedicated one | **Pass**: V4 on 0.4.1 ([at H⁗](x64/README.md#L542)), V5 on 0.4.2 ([at H6](x64/README.md#L938)), P1–P6 and R4 on 0.4.0 ([P1–P6 at H](x64/README.md#L186), [R4 at H](x64/README.md#L175)) | **Pass**: V4 on 0.4.1, V5 on 0.4.3, P1–P6 and R4 on 0.4.0 ([V4](arm64/README.md#L492), [P1](arm64/README.md#L209), [R4](arm64/README.md#L198)) |
| 9 | `cua install --engine` fetches, verifies and installs the engine | **Pass** on 0.4.3 in an empty home: the pin's hash, `static-pie`, doctor's engine row passes on 0.4.3 ([item 9 at H8](x64/README.md#L1287)) | **Pass** on 0.4.3, the same; doctor 17 PASS, 7 SKIP, 3 BLOCKED (the Chrome registration rows of an empty home) ([at H8](arm64/README.md#L1117)) |
| 10 | The suites pass | **Pass** on 0.4.0: R1 (34 cases a lane, only declared differences), R2 (`VERDICT: PASS`, nothing left unproved), R3 ([R1–R3](x64/README.md#L172)). ci-gate green on the 0.4.3 pin after reruns of two flakes it can't reach ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2704)). R1–R4 rerun with the flip | **Pass** on 0.4.0: R1 (the vendor's three declared arm64 defects), R2 (the vendor's typeText and paste not judged, part 3), R3 ([R1–R3](arm64/README.md#L195)). The same rerun with the flip |
| 11 | Items 2–8 hold on arm64 | – | **Pass**: items 2–8 above, each on the releases its arm64 cell names (0.4.0 to 0.4.3) |

**The gate's other steps.** On x64 every step passes at its last run except L3a at H6, which fails on the declared
#429 limit, extended to x64 at twice the load (part 3) ([at H6](x64/README.md#L754)). On arm64 every idle step passes
([at H‴](arm64/README.md#L171), [at H6](arm64/README.md#L681)); at twice the load L3c and L3d stand on #429's declared
limit, and L4b fails only on the unshipped measurement lane (part 3). arm64's L4c
fell under its floor at H6 for a harness race, which H7 closed; it passed at H7 and at H8
([at H7](arm64/README.md#L1019), [at H8](arm64/README.md#L1147)).

**Which release each step stands on.**

| release | x64 | arm64 |
|---|---|---|
| 0.4.3 (H8) | D1, C1, K1–K3, L2a, L4b, L4c, L4d; H1 (the cross-check); item 9 and the doctor. **PENDING:** V5 | the same, and V5 |
| 0.4.2 (H6) | D2, S1, H2, L1, L2b, L3a, L3b, L4a; S2 (the cross-check for V4, S4, L3c, L3e); V5 until H8's | D2, S1, H2, L1, L2b, L3a, L3b, L4a; S2 (the same cross-check) |
| 0.4.1 (H⁗, H⁵) | V1–V4, Z0 and E1 (H⁗) | V1–V4 and Z0 (H⁵); the twice-load steps outside the later reaches, L3c and L3d among them (H⁗) |
| 0.4.0 (H, H‴) | R1–R4, FB, P1–P6, D3–D5 and the other steps outside every reach (H) | R1–R4, FB, P1–P6, E1, D3–D5 and the other steps outside every reach (H‴) |

**Where the evidence is thinner than the item.** Items 1 and 10, and the device-mode probes P1–P6, stand on 0.4.0.
0.4.1 to 0.4.3 changed only how the engine confirms and ends a drop, and these steps either never reach that code or
were shown not to take it (rulings 827, 828, 929, 990). Part 6's live checks run R3 and R4 on 0.4.3.

### 2. The measured bar

**The seven operations** (V2 and V3, real desktop, on 0.4.1: x64 at H⁗, arm64 at H⁵), in ms, cold / warm, pinned /
newest / cua. Every row but the last passes as **faster**, with cua's interval wholly below 0.

| scene, operation | x64: pinned | x64: newest | x64: cua | arm64: pinned | arm64: newest | arm64: cua |
|---|---|---|---|---|---|---|
| gedit, 480-element tree read | 620.7 / 615 | 592.1 / 567.6 | 94.3 / 81.8 | 194.3 / 191.3 | 190.2 / 186.4 | 53.3 / 49.3 |
| Chrome, 222-element page read | 507.4 / 453.5 | 502.3 / 480.2 | 72.3 / 61.3 | 182.9 / 180.2 | 182.6 / 181.5 | 71.4 / 68 |
| gedit, window screenshot | 790 / 743.2 | 738.1 / 772.6 | 135.9 / 103.7 | 302.9 / 295.9 | 298 / 293.9 | 75 / 58 |
| Chrome, window screenshot | 640.5 / 586.5 | 621.5 / 590.4 | 118.8 / 92.9 | 295.1 / 290.8 | 295.2 / 292.6 | 97.9 / 78.2 |
| gedit, `press_key` | 273.5 / 269.2 | 240.3 / 235.7 | 7.1 / 1 | 270.7 / 267.2 | 237.7 / 234.1 | 4.6 / 0.4 |
| Chrome, `press_key` | 273.7 / 269.5 | 240.6 / 236.2 | 6 / 1.2 | 270.9 / 267.4 | 237.9 / 234.3 | 4 / 0.5 |
| gedit, `click` | 219.9 / 214.9 | 223.3 / 215.5 | 20.4 / 13.8 | 216.6 / 213.1 | 217.1 / 213.3 | 16.9 / 12.6 |
| Chrome, `click` | 219.9 / 215.1 | 220.8 / 215.6 | 19 / 14.5 | 216.7 / 213.2 | 217.3 / 213.5 | 16.2 / 12.7 |
| Chrome, `scroll` (covered window) | 315.1 / 311.8 | 316.4 / 311.9 | 114.4 / 110.1 | 311.9 / 309.4 | 312.7 / 309.7 | 111.5 / 108.9 |
| Chrome, `drag` (covered window) | 708.5 / 713.4 | 419 / 413.7 | 3.8 / 1.2 | 657.7 / 655.8 | 399.9 / 397.1 | 2.6 / 0.5 |

The last row is a **declared refusal**: a Chromium drag on a shared desktop is refused unless its path is visible, so
cua's time is a refusal's, not a drag's. Source: the rows of V2 and V3 ([x64 V2](x64/h4/zero/V2.pinned-release/run/summary.md),
[x64 V3](x64/h4/zero/V3.pinned-release/run/summary.md), [arm64 V2](arm64/h5/out/V2.pinned-release/run/summary.md),
[arm64 V3](arm64/h5/out/V3.pinned-release/run/summary.md)), read with the run's own extractor
(`x64/scripts/seven-ops.py`). V2 and V3 are outside 0.4.2's and 0.4.3's reach (rulings 929, 990), so these stand on
0.4.1.

**Drags, judged with every run's effect.** Warm medians in ms.

| | x64 | arm64 |
|---|---|---|
| Chrome canvas path | cua 477.4 against the newest build's 515.25: faster, [−44.2, −33.25] ([D1 at H8](x64/h8/out/D1.pinned-release/run/summary.md)) | cua 473.7 against the pinned build's 1045.4, since the newest gave up the bar at 19 usable runs of 40 (the judge's rule); against newest's 485.5, [−12.3, −11.6] offline ([D1 at H8](arm64/h8/out/D1.pinned-release/run/summary.md); [D1's reading](arm64/README.md#L1152)) |
| Chrome drag and drop | cua 368.7 against 337.9: **declared gap #358**, [27.8, 32.7] within its 40 ms | cua 355 against 328.1: **declared gap #358**, [26.8, 27] within its 40 ms |
| Firefox canvas path | cua 354.6 against the newest's 515.2: faster ([D3 at H](x64/out/D3.pinned-release/run/summary.md), 0.4.0) | cua 351.9 against the pinned build's 1063.55, since the newest took only 1 of 40: faster ([D3 at H‴](arm64/out/D3.pinned-release/run/summary.md), 0.4.0) |
| Chrome's scrollbar thumb | 30 of 30 land at or past the pinned build's mean, shortest 146 px against its 130.7 (D1 at H8) | 30 of 30, shortest 146 px against 128.8 (D1 at H8) |
| Electron's scrollbar thumb | 30 of 30, shortest 144 px against 130.4 ([D2 at H6](x64/h6/out/D2.pinned-release/run/summary.md)) | 30 of 30, shortest 143 px against 129.8 ([D2 at H6](arm64/h6/out/D2.pinned-release/run/summary.md)) |
| Desktop `move`, first request / later ones | 74.72 against the pinned 83.29 and newest 83.98; 0.46 against 8.64 and 6.04: faster ([E1 at H⁗](x64/h4/out/E1.pinned-release/run/summary.md)) | 72.97 against 81.14 and 81.49; 0.10 against 8.16 and 5.36: faster ([E1 at H‴](arm64/out/E1.pinned-release/run/summary.md), 0.4.0) |

D1's "witness changed" on the drag and drop row is a stacking notification whose value did not change; it cannot hide
a drop ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2586)).

### 3. Everything declared, listed apart

None of these counts as a pass.

**Declared speed gaps and costs.**

| gap | what a user meets | x64 | arm64 |
|---|---|---|---|
| #358 | Chrome's long drag and drop is a little slower than the newest vendor build. The engine holds every drop briefly so it can tell an honest answer | 368.7 ms against 337.9, [27.8, 32.7] within the declared 40 ms (D1 at H8). The upper end sits 7.3 ms inside the bound at H8, 3.1 at H6: run-to-run spread is several ms, so any change that adds time to a Chrome press starts here. **#457** (P3) measures the share of the engine's pre-press identification of a Chrome source and takes it off the press path if material ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2619)) | 355 against 328.1, [26.8, 27] (D1 at H8) |
| #373 | Bringing a window to the front is about 7–9 ms slower, because the engine waits until the window is really on top before the next input goes out | cold 11.39 ms against the bar's 4.77, [4.63, 10.915]; warm 9.93 against 0.69, [6.955, 11.93]; within its 15 ms bound ([V3 at H⁗](x64/h4/zero/V3.pinned-release/run/summary.md)) | no gap on arm64: cold 2.6 against 2.2, warm 1.1 against 0.2, a pass **within the bound** of 1 ms, listed with those below ([V3 at H⁵](arm64/h5/out/V3.pinned-release/run/summary.md)) |
| the hold | Short drags from Chrome or Electron take about 450 ms (above). No speed verdict judges them | 455.1 ms against newest's 320.8 (Chrome select, D1 at H8) | 452.2 against 311.7 |
| the in-floor release under load | A short Chrome drop is scheduled for release 350 ms after its take. In the counted x64 L4d at twice the load it came 350–357.3 ms after the take; how many tail visits ran is not readable from counted rows. Time only; the 350 ms is a minimum ([Decision Log, 1051](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2725); [x64 L4d](x64/README.md#L1344)) | counted: up to 7.3 ms past | development runs only (the candidate, not counted): 0.1 ms past, with one or both visits skipped on 15 of 191 ([0.4.3's measurement](engine-043/measure/README.md#L51)); the counted L4d gives no release timing |

**Unconfirmed or refused by design** (V3, the Chrome page that draws its own context menu, #377):

- `right_click_fallback` and `secondary_action`: the action took effect 40 of 40 times, and cua answered
  **unconfirmed** 40 of 40, where the vendor answered ok. The answer takes about a second, the engine's wait for a menu:
  on x64 1,038 and 1,037.5 ms warm against the vendor's 706.5 and 353
  ([V3 at H⁗](x64/h4/zero/V3.pinned-release/run/summary.md)); on arm64 1,021 and 1,020 against 512.1 and 253.8
  ([V3 at H⁵](arm64/h5/out/V3.pinned-release/run/summary.md)) (rulings 687, 688).
- `drag` on a covered Chrome window: **refused** (part 2's last row).

**#302, an Electron key release that reaches the tree late.** The key arrives; its release shows in the page's tree
after the engine's settle has passed. Each run that fits #302's form counts toward a series' 30 consecutive passes and
is listed apart. Counts from the last run of each step, on 0.4.2 at H6.

| form | x64 | arm64 |
|---|---|---|
| `press_key` | 4 of 30 at idle ([S1 at H6](x64/README.md#L746)); 1 background and 3 desktop at twice the load ([L3b at H6](x64/README.md#L755)) | 3 background and 5 desktop at twice the load ([L3b at H6](arm64/README.md#L703)) |
| `key_up`, a key held across separate down and up requests, which X repeats as it does a person's held key | 0 | 2 at twice the load at H6; at H⁗, 4 of 33, 186.8–251.4 ms after a 0.2–3.5 ms answer, where L3b passes once this form is judged ([the re-judge](rejudge-302-keyup.txt#L42); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2468)) |

**#429 (P2): the window manager's record of the active window lags `activate_window` under load.** In a few runs the
window manager's `_NET_ACTIVE_WINDOW` named the target 85–108 ms after the engine answered.
- arm64 at twice the load (L3c, L3d, on 0.4.1): gedit 4 of 39, kate 3 of 33, Qt Creator 3 of 51, Writer 2 of 39,
  gnome-terminal 2 of 40, and a desktop click 2 of 31. Both steps stand as recorded failures, ruled a declared limit
  ([L3c, L3d](arm64/README.md#L324); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2484)).
- x64 at twice the load (L3a at H6, on 0.4.2): 2 of 41 Chrome `activate_window` runs, 91 and 94 ms late. Recorded as a
  failure on the same declared limit, now extended to x64
  ([L3a's failure](x64/README.md#L808); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2614)).
- **What a user feels was measured directly.** In 200 runs on arm64 at twice the load, keyboard focus was on the
  target at the answer 200 of 200 times, stayed there for 500 ms, and a key sent right after the answer landed in the
  target 200 of 200 ([the experiment](arm64/README.md#L410)). On x64, 400 runs on 0.4.1 and 0.4.2 gave the same: focus
  and the key right 400 of 400, the record's lag at most 16.5 ms ([ruling 950's measurement](x64/README.md#L832)).
- #429 makes `activate_window` answer once the window manager names the target, bounded, and unconfirmed on expiry.

**#449 (P3): on arm64 at twice the load, on 0.4.2, about 1 in 8 Chrome drags onto a page in front didn't land, and
said so. No rate was measured on 0.4.3.** On 0.4.2's development heads, 87 of 750 such drags didn't land (11.6%), each answered with a notice (85 the unconfirmed-drop notice, 2
the hold notice), none with a plain ok. 0.4.1 lost 71 of 300 (23.7%), 12 of them behind a plain ok (Chrome 156 only)
([the lost drops](engine-042/tail/lost-drops.md);
[Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2585)). Measured on 0.4.2. 0.4.3's
in-floor tail also ends these drops, and no rate was measured on it.

**#459 (P2), the long Chrome drag and drop: a measured residue, not a fix.** The 0.4.3 tail above. The residual
bound is 1.5% (0 in 200) for false oks and for stale-position drops at arm64 twice the load; the counted L4d on both
machines found 0 ([0.4.3's measurement](engine-043/measure/README.md#L41)). The release notes state the bound and
never say "fixed" (ruling 997). The engine's Linux document tells the agent that a misplaced drop reported as made is
rare, not impossible, and to read the page when it matters where a long drag dropped. #459 stays open.

**#474 (P3): L4b, the unshipped accept lane.** L4b measures `cua:accept`, a variant that drops at Chrome's accept
cursor, behind an engine flag that defaults off; nothing that ships can select it. 0.4.3 leaves that lane on 0.4.2's
release by design. At H8 it answered ok with no drop 3 of 30 times on arm64, #459's shape. On x64 its 5 false releases
on inzone-out (1 answered ok) are listed apart, and it passed. The shipped lanes in the same steps were clean:
plain-long 300 of 300 landed on both machines. #474 retires the lane or brings it under the tail
([arm64 L4b](arm64/README.md#L1167); [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2716)).

**#468 (P3): a Chrome drop's confirmation is judged by when the engine reads it, not by the X server's order.** A
confirmation read late could, in principle, be credited to the wrong moment and give a false ok. It is pre-existing and
was seen 0 times in 486 rows
([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2681)).

**#460 (P3): what no counted step covers.** No counted step sends a Chrome drop on the desktop route, or a Chrome
`drag_handle` that takes ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2642)).
0.4.3's tail on the XTEST routes (a 1 px step forward along the last segment and back, at each visit) is proved by its
live test only, with no counted rate (ruling 1002). The handle end's tail was measured in development runs only,
0 in 300 (above).

**Passes within a bound.**

| pass | x64 | arm64 |
|---|---|---|
| gedit `clipboard_release`, warm | within the bound, [0.06, 0.125] ms ([V1 at H⁗](x64/h4/zero/V1.pinned-release/run/summary.md)) | within the bound, [0.03, 0.04] ms ([V1 at H⁵](arm64/h5/out/V1.pinned-release/run/summary.md)) |
| desktop `launch_app`, warm | within the bound, [0.2, 0.82] ms ([V2 at H⁗](x64/h4/zero/V2.pinned-release/run/summary.md)) | within the bound, [0.2, 0.31] ms ([V2 at H⁵](arm64/h5/out/V2.pinned-release/run/summary.md)) |
| Chrome `activate_window` | the declared gap #373 (above) | within the bound, cold [0.315, 0.405], warm [0.885, 0.955] ms (V3 at H⁵) |
| desktop `key_up`, later requests | within the bound, [0.005, 0.08] ms ([E1 at H⁗](x64/h4/out/E1.pinned-release/run/summary.md)) | within the bound, [0.01, 0.01] ms ([E1 at H‴](arm64/out/E1.pinned-release/run/summary.md)) |
| L4a's residue: plain Electron drops at twice the load that honestly answered unconfirmed and didn't land, at most 2 in 100 | 0 of 100, and 0 of 100 by drag handle ([at H6](x64/README.md#L914)) | 0 of 100, and 0 of 100 by drag handle ([at H6](arm64/README.md#L704); [the rule](l4a-residue/README.md)) |
| V5's late-take drag into Chrome | **passes by ruling 680, now built into the judge**: a drag that ended after the observation window closed passes only with every other check met (the notice, the read, the refused next request). At H6, 1 such sample in 9 (the recorded drag duration 191 ms, against the answer at 168.71 ms + 20) ([V5 at H6](x64/README.md#L957)). **PENDING:** V5 at H8 | the same rule, 5 such samples at H8, all passing ([V5 at H8](arm64/README.md#L1213)) |

**#415 (P2), a declared limit (ruling 830): an Electron ok whose drop missed the zone.** Under heavy load Electron's
renderer can lag the final dragover, so the drag answers ok, matching Electron's own dragend, for a drop that landed
outside the target: Electron said the drop was copied, and the drop zone's counter did not move. It is listed apart
in every run, never counted as a Chrome false ok, and the steps that carry it pass.
- x64: none in 320 drags in each of H1, H2 and L4a at H6 ([x64](x64/README.md#L912)).
- arm64: none in 320 in H1 and H2 at H6 and H1 at H8. At twice the load, L4a listed **3 of 30** drags in its
  `cua left` cell at H6 (1 of 30 at H⁗) ([L4a at H6](arm64/README.md#L704)), and on 0.4.3 L4d's Electron long-left
  cell answered **4 plain oks in 30** that were these mismatches ([L4d at H8](arm64/README.md#L1209)). That is the
  rate a user can meet at twice the load on arm64; L4d's pass stands.

**Ruling 838**, Electron drags that end over Chrome, counted by answer: 0 ok, 30 unconfirmed of 30 on each lane, on both
machines (H2 at H6; [x64](x64/README.md#L916), [arm64](arm64/README.md#L693)).

**#418 (P3).** When an Electron drop into Chrome can't be confirmed by its own check but Chrome's activation confirms
it, the answer is ok and the model isn't told the check failed; it is recorded only in the engine's statistics
([ruling 835](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2426)).

**Identifying a Chrome source.** 0.4.2's extended hold applies only to a source positively identified as Chrome or
Chromium. Its rate is counted only over drags whose hold waited: a drag Chrome took during its path, or one that held
nothing, records no identification, and that is not a failure (ruling 954). At H8, C1 and L4c identified 40 of 40 on
x64, and the K steps identified every held drag from inside the sandbox, as in service
([x64](x64/README.md#L1379)); on arm64 neither step had an unexercised row, which an unidentified one would be.

**#425 (P3), a harness gap.** On a private display, the harness's whole-run record could excuse a change to a window by
crediting it to one of the run's own windows created up to a second later. It is a gap in the test, not the engine.
It reaches only private displays, where only the run's own programs run. It is declared, carried as a pending test,
and P3, after M5 ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2466)).

**#432 (P3): the real-desktop guard stops arm64 sittings, failing closed.** The guard stops a sitting when the run
connects to anything it can't count as the run's own. On arm64 the run's own Chrome connects to its own crash
handler, which detaches itself, so the guard becomes its parent instead of the run's harness and no longer counts it
as the run's. Both ends are the run's, so nothing reached a person's session. It stopped arm64's frozen-head V5
sittings 3 times in 6 across H⁵ to H8 (5 in 17 counting development sittings), each in its first 81 s, and none of
x64's 4. At H8, V5 passed on the second rerun. The fix (a holder descending from the guard passes; anything else
still stops) is planned on #432 after M5 ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2717);
[the stops at H8](arm64/README.md#L1222)).

**What arm64 could not show.**

- **A thin vendor bar for text.** On arm64 the vendor builds end the run's gedit when they type, paste or write the
  clipboard. In R2, on a private display, every vendor typeText and paste sample did, so they read "not judged: the
  vendor never completed it" ([vendor ends](arm64/README.md#L253)). In the real-desktop sitting the newest build typed 40 of
  40 and set the bar, while the two vendor lanes ended 252 of the run's text windows (pinned 189, newest 63)
  ([V1 at H⁵](arm64/README.md#L489)). cua's own text checks apply throughout.
- **Nobody's desktop.** arm64's real desktop runs on a virtual screen (Xorg's dummy driver, 1280x800) that nobody uses.
  The background-input checks there show the engine's behaviour, not a person's session
  ([Decision Log, the arm64 VM](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2312)).
- **The browser's version isn't recorded by every step.** That a step drove Chrome 156 or 158 rests on the guard's
  process records or the program path logged beside it
  ([Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L718)).
- **arm64 after this run.** Once the arm64 VM is deleted, the engine is tested on arm64 only when a release is cut.
  A ticket for an arm64 leg of the pull-request gate is drafted for close-out
  ([F7](../../../doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md#L367)).
- The engine's two-screen test script names x64 only. It ran on arm64 from a two-line copy, 3 of 3
  ([H‴'s local proof](arm64/README.md#L81)).

### 4. What changes for a user

- **Text arrives** in every family the run covers (item 6). Each `typeText` and `paste` answers applied, not applied
  with nothing sent, or unconfirmed, and nothing is sent twice
  ([README, what a session sees](../../../../README.md#L1273)).
- **Requests the vendor answered ok with no effect now take effect, refuse, or say unconfirmed.** Among them: Chromium
  drops taken after the release, Firefox's background pointer input with the real pointer outside its window, an
  expired drag handle, and a context menu that never opened
  ([M4's outcomes](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2778)). M5's releases fixed two
  false oks the run found after M4, Electron drops read at a stale cursor (0.4.1) and Chrome pages that start their
  drag late (0.4.2), and mitigated a third, long Chrome drags and drops released on a stale position, to a measured
  residual bound (0.4.3, #459 open).
- **The device mode.** `shared`, the default, assumes a person may be using the desktop: background input changes
  nothing they see, and input an application would ignore is refused with a sentence. `dedicated` gives the desktop to
  the agent; the cloud template sets it ([README](../../../../README.md#L1262)).
- **The limits** ([README](../../../../README.md#L1297)): Electron's tree needs `--force-renderer-accessibility`
  (#228); GTK 4 needs a dedicated desktop for input; Firefox and xterm in the background; context menus (#377, #378,
  #379); a context-menu Copy Chrome doesn't serve (#375, #376); Chromium drags, the 450 ms hold and its handler limit,
  and the long drop's tail (#459); late drops (#364, #365, #372); Qt's wheel and paste; minimized and duplicate
  windows; the declared speed gaps (#358, #373, #263, #269, #302); out of scope: Wayland (#224), characters off the
  keyboard layout (#226), pixel-precise scrolling (#227), held input after an engine dies on a shared desktop (#277).
- **Limits named during M5**, each with its ticket:
  - **#379** (P3): GTK 4's, Firefox's and Qt's menus are not detected, so those requests answer unconfirmed.
  - **#393** (P3): a menu check confirms that *a* menu appeared, not necessarily the one requested, when another menu
    opens at the same moment. It is the Linux twin of macOS's #392
    ([#393](https://github.com/SSFSKIM/cua/issues/393)).
  - **#418** (P3): an Electron drop into Chrome confirmed only by Chrome's activation answers ok with no note (part 3).
  - **#429** (P2): `activate_window` can answer before the window manager records the new active window (part 3).
  - **#449** (P3): on 0.4.2, about 1 in 8 Chrome drags onto a page in front at arm64 twice the load didn't land, and
    said so; no rate was measured on 0.4.3.
  - **#415** (P2): at twice the load on arm64, an Electron drop can answer ok where it landed outside the target, 4 in
    30 at H8 (part 3).
  - **#459** (P2): the long Chrome drag and drop's residual bound, 1.5% (part 3).
  - **#468**, **#474**, **#457**, **#460** (P3): the confirmation's read order, the unshipped accept lane, #358's
    margin and the coverage gaps (part 3).
  - **#384** (closed), the browser, not the Linux engine: under near-saturating CPU load, a background tab the agent
    drives can stall reads for 3–15 s. It is documented as a heavy-load limit in main's README, from 0.28.14
    ([#384](https://github.com/SSFSKIM/cua/issues/384)).
  - **The engine's clipboard unit test is flaky in CI**, six sightings, each passing on rerun. It is a test's race,
    not a user's ([tech-debt-tracker](../../../../tech-debt-tracker.md#L74);
    [Decision Log](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2309)).
  - **#425** and **#432** (P3) are the harness's, not a user's (part 3).

### 5. The way back

A user who wants the vendor engine back sets `CUA_NATIVE_ENGINE=vendor` in `cua serve`'s environment, for that
server's sessions, or `"engine": "vendor"` in `~/.config/cua/engine.json`, for every session of the account. The
variable wins over the file. This stays available until M6b retires the vendor engine
([README, selecting it](../../../../README.md#L1252)).

After the flip, a home with no cua engine, an engine older than 0.4.3, or an install record that doesn't match its
file keeps the vendor engine on its own, with a warning that names `cua install --engine`. An explicit choice of cua's
engine still refuses an old one ([F5](../../../doperpowers/specs/2026-10-28-own-linux-engine-design.md#L2224)).

### 6. The flipped default, live

**PENDING:** T10's live checks on both machines (task 137) fill this part. They are
([pre-flight §8.1](../../../doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md#L548)):
- R1–R4 rerun on the flip commit, since it changes `launch.mjs`, which every facade suite launches through;
- R3 and R4 with no engine setting, which must select cua's engine with reason `default` and run no `sky_linux`;
- the same checks on the commit before the flip, which must fail naming `vendor`;
- the fallback homes (no engine, an older one, a mismatched record), which must keep the vendor engine with the
  warning.

**Superseded:** task 86 ran these on x64 at an older base, `62a461f6`, on engine 0.4.0. Before the flip, R3 and R4
failed as required, naming `vendor (default)`. After it, R3 passed 13 of 13, R4 20 of 20, and each fallback home 9 of 9
(task 86's report, local). They are not cited as this decision's evidence.

### 7. The unjudged passes

These ran once each, as development runs, and are not verdicts.

**The vendor's third build, 26.1111.21308** (V2 and V3; x64 on 0.4.0 at H, [F3's lane](x64/README.md#L416); arm64 on
0.4.1 at H⁵, [F3](arm64/README.md#L597)). cold / warm, ms: pinned / 26.1111.21308 / cua.

| scene, operation | x64 | arm64 |
|---|---|---|
| gedit, tree read | 647 / 572.6; 600.3 / 574.1; 93 / 80.3 | 197.8 / 191.5; 193.3 / 187.5; 54.6 / 49.8 |
| Chrome, page read | 454.8 / 440.3; 445.3 / 426.5; 67.3 / 63.7 | 185.4 / 181.6; 185.1 / 179.9; 69.8 / 65.7 |
| gedit, screenshot | 751.8 / 720.1; 732.2 / 709.8; 137 / 106.4 | 308.2 / 297.8; 307.2 / 298.9; 77 / 59 |
| Chrome, screenshot | 594.5 / 572.6; 606.4 / 553.7; 124.8 / 89.1 | 298.4 / 292.7; 299.7 / 292.4; 97.7 / 76.6 |
| gedit, `press_key` | 273.3 / 269; 240.5 / 235.8; 6.9 / 1.1 | 271.7 / 267.4; 238.7 / 234.3; 5.4 / 0.5 |
| Chrome, `press_key` | 273.5 / 269.2; 240.4 / 236; 5.8 / 1.4 | 271.9 / 267.6; 238.8 / 234.5; 4.7 / 0.5 |
| gedit, `click` | 219.5 / 215.3; 222.9 / 215.9; 21.2 / 13.9 | 217.6 / 213.2; 218.2 / 213.5; 17.8 / 12.7 |
| Chrome, `click` | 219 / 215; 220.4 / 215.7; 18.9 / 14 | 217.4 / 213.3; 218.1 / 213.6; 16.8 / 12.8 |
| Chrome, `scroll` (covered) | 314.8 / 311.3; 316.5 / 311.9; 114.5 / 110.1 | none: V3 was stopped by the guard before any sample |
| Chrome, `drag` (covered) | 713.4 / 710.4; 417.6 / 412.6; 3.5 / 1.1, a refusal | none |

Each build was verified before use: on x64 against the vendor's signed index and its own signature, on arm64 by its
package's signature and digest (T6). x64's V3 rows come from a run a harness guard stopped after its series were
complete; arm64's V3 stopped 6.6 s in, on the same guard
class as #432, and stands as stopped.

**Chrome 158 (current stable) on arm64**, on 0.4.1:
- private display: D1 passed and S1 completed on Chrome 158.0.8127.36 ([F2's private part](arm64/README.md#L431));
- real desktop: V2 every verdict PASS, V3 no verdict FAIL; V5 failed `chrome_dnd_shared` on 1 of 9 samples, the shape
  0.4.2 fixed, and passed its in-front and late-take cells ([F2's `:0` parts](arm64/README.md#L581)).
- Chrome 158 is also judged, not only seen: the counted K2 runs the hold's canary on it and passed on both machines at
  H6 and H8 ([arm64 at H8](arm64/README.md#L1136), [x64 at H8](x64/README.md#L1294)).

### If you say no

The flip is not merged. M5's pull request still lands the evidence, the harness and the docs, which then describe
cua's engine as selectable and the vendor engine as the default. The decision and what would change it go into the
Decision Log. #266, arm64's verdict, closes either way. The plugin version still goes up, because the Linux document
and the agent's rules change either way. M6a, a vendor-free runtime, can still start; M6b, retiring the vendor
engine, cannot, because its trial period is of the default
([pre-flight, if the owner says no](../../../doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md#L258)).
