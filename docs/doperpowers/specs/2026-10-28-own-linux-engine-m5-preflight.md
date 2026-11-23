# #171 M5 pre-flight (draft for the design session)

- Spec: `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`, cited as `L<n>` (the spec at 78b4959c).
- Report: `…-report.md`, cited as `R L<n>`. Evidence under `docs/evidence/2026-10-28-own-linux-engine/` is cited by its
  path below that directory (`m4/gate/README.md`).
- Base: `feat/171-m5` = main 78b4959c (M4's squash, #380).
  - Engine 0.4.0, pinned in `runtime/engine/linux-engine.json`: x64 `751ec9be…`, arm64 `0cbde8f0…`.
  - Plugin 0.28.0. `MIN_ENGINE_VERSION` 0.4.0. `DEFAULT_NATIVE_ENGINE` is `vendor` (`src/runtime/launch.mjs` L458).
  - `native/linux-engine/` at 78b4959c equals the released commit c55c8e08 (`git diff --stat c55c8e08 HEAD --
    native/linux-engine` prints nothing).
- This pre-flight ran no acceptance, created no VM, committed nothing and touched no ticket. Its probes were read-only
  HTTP requests and reads of this VM (`~/.local/share/cua-171/m5-preflight/`).
- Loop tasks continue M4's numbering, from task 81. "T" numbers are this document's rows.
- **Revision 2.** The first draft is 483bdf05. This one folds in:
  - the design session's rulings on the forks (sminos 704): §6 lists each with its ruling;
  - an adversarial review's three findings: R2 fails closed (T3, F8a); the default is shown by a mode of its own (§3,
    T10); the head is frozen after the arm64 pilot's fixes, with a rule for a later fix (§4, §8);
  - the VM's timing, counted from the approval of this pre-flight (§7.1, §9).
- Still for the design session to confirm: F8a, F5a, F6a and the supersession rule (§6, "To confirm").

## 0. What the research found

Four findings change the plan. Sources are in §10.

1. **Google Chrome and Chrome for Testing both publish Linux arm64 builds.** The brief's premise is out of date.
   - Google's apt repository lists `Architectures: amd64 arm64`, and its arm64 index carries `google-chrome-stable
     157.0.8103.78-1` (read 2026-11-14). Google added the arm64 builds in late July 2026.
   - Chrome for Testing publishes `linux-arm64` on Stable, Beta, Dev and Canary, since 153.
   - This repository already ran it: Google Chrome deb `154.0.8037.97-1` on Ubuntu 24.04 aarch64, with the extension
     force-installed by policy and cua's native host started (`docs/evidence/2026-10-06-linux-acceptance.md`,
     `docs/evidence/2026-10-07-own-extension-linux.md`).
   - `deploy/cloud-vm/cua-provision.sh` installs `google-chrome-stable` with `Architectures: $arch`, so it needs no
     change for arm64.
2. **The vendor has arm64 builds of both judged versions, and a third, newer build.**
   - The pinned arm64 build is `runtime/releases/26.928.40906-linux-arm64.json` (`sky_linux_arm64`), still served
     (453,477,698 bytes, the pin's length).
   - The newest build the spec names, 26.1023.51421, is served for arm64 (494,741,274 bytes). Its contents were not
     downloaded or checked here.
   - The vendor's `Packages` index now lists 26.1111.21308 for both architectures. So 26.1023.51421 is no longer the
     newest, and the index's hash chain, which R/F §0 used for the x64 package, no longer covers it (C11, C12, F3).
3. **The pinned vendor build's text input crashed gedit on arm64.** `typeText` and `paste` ended gedit with SIGSEGV every
   time on the arm64 VM of 2026-10-06 (`docs/evidence/2026-10-06-linux-acceptance.md`, "Text input, measured"). On x64
   it fails after 10.2 s and gedit survives. So on arm64 the pinned lane is expected to end its own scene window
   wherever it types: in V1, and in the vendor lanes of R1 and R2. No harness run has met that (C10).
4. **`cax31` is 8 vCPU, 16 GB, 160 GB, at €0.0336 an hour, in Germany and Finland only.** A price table verified on
   2026-11-10 marks it "Limited CAX". Hetzner's own pages fetched here did not state it. `devcloud vm up --dry-run` is
   the check, and it runs only on the Macs.

Two more facts from this VM that the plan uses:

- The x64 VM's Chrome is 156.0.8078.73, the version M4's gate ran on. Google's repository now installs 157.0.8103.78,
  and both versions' debs are still in its pool for both architectures (F2).
- The x64 VM's default home still holds engine 0.3.0 (`~/.local/share/cua/engine/linux/install.json`), which
  `MIN_ENGINE_VERSION` 0.4.0 refuses. The cua plugin's sessions on this VM run from that home: their `cua-shim`
  processes set no `CUA_HOME` and no `CUA_NATIVE_ENGINE` (F5).

## 1. The items

### 1.1 Venue and assets, for every item

- **The engine** is the one `cua install` fetched into a home of the run's, at the pin, with its sha256 checked against
  `runtime/engine/linux-engine.json` before each step. No `CUA_LINUX_ENGINE_BIN`, no `--engine-bin`, no local build
  (L190, L334). T1 builds the rule that enforces this.
- **The home** is always the run's: `HOME`, the XDG directories, an empty `claude-secrets` and `CUA_HOME`, as
  `m4/release/` ran its checks. Never the VM's default home.
  - Why: the default home's trusted side can reach the owner's secret store, and on the x64 VM its engine is the
    owner's 0.3.0 install, which the controller ruled is not upgraded by a run (`m4/release/README.md`).
  - Every application is a harness instance in a home of the run's (L216).
- **The display** is split as M4's gate split it, on both architectures.
  - The verdict steps V1–V5 and Z0 run on a real `:0`: Xorg, Openbox and a logged-in session. Items 5 and 8 claim
    something about a desktop a person uses. M4's gate found V5's lost path there (L2282), and Firefox's drag timing
    differs there from any private display (L623).
  - Every other step runs on a private display, where load and window state are the run's own.
  - Item 1's and item 9's checks run on a private display in a fresh home, as `m4/release/` did.
- **What needs a person.**
  - x64 `:0` sittings: the design session's GO, announced 45 minutes ahead, under task 50's guards. The owner's windows
    are on that display; the owner need not be there.
  - arm64 `:0`: nobody's display. Same commands and guards, no announcement.
  - The owner: the default (§3). The design session tells the owner the arm64 VM's life and price (F6).
  - Nothing needs a TCC-like grant or the person's real profile. Nothing runs on the Macs (L214).

### 1.2 The commands

`--pinned` is T1's proposed flag; today the runner takes `--candidate <file>`. `ARCH` is `x64` or `arm64` (L362).

```bash
ACC="$HOME/.local/share/cua-171/m5/home-$ARCH"          # the acceptance home, a home of the run's
OUTROOT="$HOME/.local/share/cua-171/m5/out-$ARCH"       # outside the checkout (gate.mjs refuses one inside)
EVID="docs/evidence/2026-10-28-own-linux-engine/m5/$ARCH"
# item 9, in an empty home on a private display
FRESH="$(mktemp -d)"
CUA_HOME="$FRESH" node bin/cua.mjs install --engine
CUA_HOME="$FRESH" CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor
file "$FRESH/engine/linux/cua-engine"
# every other item: the gate's steps on the pinned engine
node scripts/linux-engine-gate/gate.mjs --list --pinned "$ACC" --out "$OUTROOT"
node scripts/linux-engine-gate/gate.mjs run <step> --pinned "$ACC" --out "$OUTROOT"     # private steps, by the driver, under locked.sh
node scripts/linux-engine-gate/gate.mjs print <step> --pinned "$ACC" --out "$OUTROOT"   # a :0 step's command, run in the sitting
```

### 1.3 Each item, on both architectures

Steps are `scripts/linux-engine-gate/steps.mjs`'s names. Evidence is `m5/<arch>/<step>/`, copied from `$OUTROOT`.
"no" in the last column means headless: a private display and no sitting.

| # | Item (L192–204) | Steps | Venue | Passing means | Needs a person |
|---|---|---|---|---|---|
| 1 | No vendor process | R3 (`scripts/accept/linux-native.mjs` under the 50 ms sampler), and the fresh home's `cua doctor` | private, a fresh run home | 11 of 11 steps. The sampler's maximum of `sky_linux` is 0. The engine that answered is the home's installed binary, a child of the trusted worker. Doctor passes `engine` with 0.4.0, the pin's hash and service `cua` | no |
| 2 | The same answers | V1–V5 | `:0` | each of the 21 commands' output equals the vendor's or a declared deviation, retention included. T5 and T7 list which step ran each of the 21. V3's two `menuUnconfirmed` cells and M3's refused chrome-input drag are listed apart, never as passes | x64: GO |
| 3 | At or below the bar | V1–V5 (speed), D1 (Chrome canvas and drag and drop, the thumb), D2 (Electron's thumb), D3 (Firefox canvas), E1 (desktop `move`) | `:0`; D and E private | every series is faster, the same within noise or within the bound, at 20 or more samples a side. The seven listed operations are reported with three medians each. Thumbs land at or past the pinned mean on 30 of 30. Declared gaps #358 and #373 are listed apart | x64: GO for V |
| 4 | Same elements | V2 (gedit, Chrome, over-budget), FB (the facade's line) | `:0`; FB private | cua's nodes equal the vendor's on the same scene, whatever the count (C6). Over-budget: retained ids equal, bus calls within the vendor's plus 256, and the truncation line in `getAXState` and the combined observation | x64: GO for V2 |
| 5 | Background left alone | every window-targeted operation of V1–V5 in `shared` mode | `:0` | witness unchanged for the whole span and the audit clean, wherever the vendor's witness is. Each step's stub engine fails both | x64: GO |
| 6 | Text arrives once | V1 (gedit), V4 (Chrome's textarea and address bar, gnome-text-editor in `dedicated`, the paste safety cases) | `:0` | the Unicode string reads back exactly. Every safety case holds. The run's bus trace holds no `PasteText`, `InsertText` or `SetTextContents` | x64: GO |
| 7 | Identity and minimized | V5 (identity), V3 (minimized), R1 (the minimized case through the real facade) | `:0`; R1 private | each duplicate returns its own marker or the sentence, never a one-node tree. A minimized window is listed, read, and refuses a screenshot | x64: GO for V |
| 8 | Device mode | V4 (GTK 4, xterm, Qt), V5 (Firefox, Chrome), P1–P6 (T19's manifest), R4 (`linux-device-mode.mjs`) | `:0`; P and R4 private | every listed kind refuses in `shared` with nothing sent and takes effect in `dedicated`. Element actions pass in `shared`. R4 is 18 of 18 with both negative controls | x64: GO for V |
| 9 | Install | the block above | private, an empty home | the pinned asset is fetched and its hash verified. Doctor passes `engine`. `file` says `static-pie linked` on x64 and `statically linked` on arm64 (C7) | no |
| 10 | Suites | R1 (repl-parity and its diff), R2 (`compare --engines`), R3; `ci-gate` on the head for `npm test` and `engine-linux` | private; CI | R1's cua lane passes and its diff shows only declared differences. R2 prints VERDICT: PASS by in-cell time, with no engine-answered series left undetermined (F8, F8a). Both record the installed engine as the trusted worker's child. `ci-gate` is GREEN (C8) | no |
| 11 | Both architectures | items 2–8 on the arm64 VM, against its vendor builds | as above | as above, with the arm64 vendor outcomes declared (C10) and anything not shown listed (§7.3) | no |

Beyond the eleven items, the gate's other steps run too, on both architectures (F1, ruled): S1–S4 (the settle as
shipped), F1a–F2 (the paste settle and the stops), H1, H2 and C1 (drops), Z0, and the block at twice the load (L1–F4).
M4's two cut candidates were both found there or on `:0`.

After the judged run, unjudged and listed apart (F2 and F3, ruled):

- on arm64, the Chrome steps once more on current stable Chrome (V2's Chrome scene, V3, V5, D1, S1's Chrome cells), as
  development runs;
- on both VMs, item 3's seven operations once against the vendor's third build, 26.1111.21308, given as `--newest`, as
  a development run. On x64 it takes a short `:0` sitting.

Items 12 and 13 are M6's. Item 13 cites M5's sitting for the vendor lanes (L206, L2296), so M5 commits every vendor
series it measures, raw rows included, on both architectures.

## 2. The docs

Three places teach the Linux engine today, and the spec's M5 entry names two of them. The third, the `js` tool's host
rules, is model-facing and already wrong for a session that selects cua's engine, so T8 changes it now, not with the
flip (sminos 704).

| Where | Today | What changes |
|---|---|---|
| `README.md` "Linux", its opening (L1067–1078 of the README) | says cua "still installs its retained native engine from OpenAI's official Linux package" and drives `sky_linux` | Two engines. cua's own is `cua-engine`: a static binary pinned in `runtime/engine/linux-engine.json`, built and attested by `linux-engine.yml`, fetched by `cua install`, replaced by `cua install --engine`. What still comes from the vendor package until M6a (the module tree and the runtime record). Where each was shown: `m5/x64/`, `m5/arm64/` |
| `README.md` "Linux", a new part "cua's own engine" | absent | Selection (`CUA_NATIVE_ENGINE`, `engine.json`'s `engine`, the default as the owner decided it). The device mode (`CUA_DESKTOP_MODE`, `engine.json`'s `desktop`, `shared` by default, `dedicated` written by the cloud template) and what each does. The capability report in `cua doctor`'s `engine` row. The `minimized` field. The three text answers (applied, not applied, unconfirmed). The truncation line. An engine older than this cua needs is refused at the first request, and `cua install --engine` fixes it |
| `README.md` "What it needs" | names XTEST, Composite and XFIXES | Adds what cua's engine uses beside them: DAMAGE (without it a fixed 100 ms wait per pixmap), MIT-SHM where the display is local, and `org.a11y.Status` `IsEnabled` for Qt 6's tree |
| `README.md` "What differs from macOS", the Typing and Secrets entries | describe the helper's crash and failure as Linux's behaviour | Say which engine. With cua's engine `typeText` and `paste` insert exact Unicode text. The crash and the failure are the vendor engine's |
| `README.md`, a new part "Known limitations (cua's engine)" | absent | The list below |
| `README.md` "Configuration" table | has neither variable | Rows for `CUA_NATIVE_ENGINE` and `CUA_DESKTOP_MODE`, with the `engine.json` keys |
| `README.md` "Verify and acceptance" | no Linux engine check | `scripts/accept/linux-native.mjs` and `linux-device-mode.mjs` |
| `deploy/cloud-vm/README.md` "What the VM ends up with" | says the computer surface runs from the pinned runtime; no device mode | The engine `cua install` placed; `"desktop": "dedicated"` in the user's `engine.json`; `IsEnabled` set at session start |
| A Linux document of cua's own, `docs/cua-api/linux-engine.md`, beside `core.md` (F4, ruled) | `core.md` says "Linux input stays bound to the selected window. Sky sends it without activating that window" (its L162), and its `WindowInfo` is `{ id, app, title? }`. `core.md` itself stays as it is | The device mode and its refusal sentence. `minimized: true` in `listWindows()` with L84's meaning: read works, a screenshot does not, input answers `Window <id> is minimized; activate it first`. The unconfirmed answers and what to do after one. The truncation line. Every sentence is worded to hold under either engine: it names an answer and what to do on meeting it, and the vendor engine never gives those answers. Served after `core.md` when the computer surface is Linux, as `agent-cursor.md` is on macOS: `src/cua-api/documentation.mjs` gains the file and an option, and `create-tinysky-alt.mjs` passes it. That facade touch is allowed on M3's truncation-line precedent and gets a Decision Log line. `docs/cua-api/PROVENANCE.md` gains its row ("none: cua's own text") |
| `src/mcp/surface.mjs` `LINUX_COMPUTER_RULES` (the `js` tool's host rules) | "typeText and paste crash GTK3 text views: type there with pressKey" | The sentence follows the session's selected engine, in T8, before any flip. Under the vendor's engine it stays. Under cua's it is replaced by one that fits: typeText and paste insert text, and a refusal names the device mode. `jsRulesFor` and `modelTools` take the engine, and `src/mcp/server.mjs` passes the connection's selection. Not in M5's Touches (C1) |
| `.claude-plugin/plugin.json` description | "through OpenAI's computer-use runtime" | With the flip, Linux's default is cua's own engine |

**Known limitations**, each stated for a user, with its ticket:

- **Electron.** An Electron application exposes its tree only when started with `--force-renderer-accessibility` (#228).
  Without it cua sees one X11 node. cua does not add the flag.
- **GTK 4 needs `dedicated` mode for input.** Clicks at coordinates, keys, text, scroll, move and drag are refused in
  `shared` mode with `<App> does not accept background input; use a dedicated desktop or activate the window first`.
  Element actions work in both modes.
- **`menuUnconfirmed`.** A requested context menu answers ok only once a menu is seen. Otherwise: `showContextMenu was
  sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the
  window before retrying`. A page that draws its own menu gets this answer (#377). GTK 4's, Firefox's and Qt's menus
  are not detected (#379).
- **The Chromium menu line**, quoted from `native/linux-engine/README.md`: "In Chromium, a context menu requested on a
  window that is not focused (perform_secondary_action showContextMenu, the right-button fallback, or a window-bound
  right click) does not stay open after the request. To use a menu item, focus the window first where you may (on a
  shared desktop, only when the person allows it), or use the clipboard operations for copy and paste." (#378)
- **From M4's Outcomes (L2259–2277), what a user can meet:**
  - Firefox takes background pointer input only while the real pointer is inside its window. Otherwise `shared` mode
    refuses (#353's rule; its residue #362).
  - xterm ignores background keys: refused in `shared` mode.
  - Chromium drags are refused unless their whole path is visible. A drag into Chrome on a `shared` desktop is
    cancelled before the drop unless Chrome is already in front.
  - A drop that lands after the engine answered is reported at the next reply, and the next acting request is refused
    once. Electron drops answer unconfirmed in 6 to 7.5% of landings (#364). Stated races: #365, #372.
  - A context-menu Copy that Chrome does not serve within 2 s answers `clipboard update timed out`, and that window's
    menus may then stop opening (#375, #376).
  - Qt: wheel scrolling is ignored by the toolkit (L585). A paste into kate or Qt Creator lands and answers
    unconfirmed (L603).
  - Minimized windows refuse input. Duplicate windows that cannot be told apart answer `Window <id> matches several
    accessibility windows; close or retitle the duplicates`.
  - Declared speed gaps against the vendor: Chrome's long drop (#358), `activate_window` (#373), the hold (#263), the
    short drop (#269). An Electron key release can show in the tree after the settle (#302).
  - Out of scope, with tickets: Wayland (#224), characters off the keyboard layout through `type_characters` (#226),
    pixel-precise scrolling (#227), held input after an engine death on a shared display (#277).

## 3. The default

**What flips.**

- `src/runtime/launch.mjs` L458: `DEFAULT_NATIVE_ENGINE` is one constant for both platforms, and its comment is the
  macOS engine's ("the vendor's until M5 flips it", which is #117's M5 and #192's decision). The flip makes the default
  per platform: `cua` on Linux, `vendor` on macOS, unchanged there, with a test (C16).
- Its readers: `nativeEngineFor` (L481) and `nativeEngineSetting` (L556) in the same file; `doctor-engine.mjs`, which
  already has the sentence "cua's engine is the default, but none is installed"; `scripts/probe/pinned-engine.mjs`;
  and the mirror `scripts/repl-parity/selection.mjs` (`ORACLE_DEFAULT_ENGINE`, L145 of the spec).
- Tests: `test/runtime-launch.test.mjs`, `test/doctor-engine-linux.test.mjs`,
  `test/repl-parity/selection-oracle.test.mjs`.
- `.claude-plugin/plugin.json`: 0.28.0 to 0.29.0, under L218's conditions (`ci-gate` green with `test` and
  `sandbox-live`, the macOS-visible changes listed, nothing of another initiative's bump). The pull request carries
  this one bump whichever way the owner decides, since T8's Linux document and `js` rule are plugin-visible too.
- The README's sentences that state the default, and the plugin's description.

**What a Linux session gets after the flip** (`linuxEngineFor`, launch.mjs L501–516, with F5 as ruled):

- no setting and an engine at or above `MIN_ENGINE_VERSION` installed: cua's engine, reason `default`;
- no setting and none installed: the vendor's, status `warn`, so an update does not break a home that never installed
  (today's behaviour);
- no setting and an older engine installed: the vendor's, with a warning that names `cua install --engine` (F5, built in
  T10). Today such a home selects cua's engine and is refused at its first request, because `installedLinuxEngine` reads
  only the file's metadata;
- `CUA_NATIVE_ENGINE=cua` or `"engine": "cua"` with an older engine: refused as today, with `cua-engine <found> is older
  than 0.4.0, which this cua needs; run cua install --engine`;
- `CUA_NATIVE_ENGINE=vendor`, or `"engine": "vendor"`: the vendor's, until M6b.

**How the default is shown live** (the review's finding: unsetting the variable outside the wrapper proves nothing).

- Today `scripts/accept/linux-device-mode.mjs` requires `process.env.CUA_NATIVE_ENGINE === 'cua'` (its L226), and the
  suites' runner sets the variable itself for R3 and R4 (`m4/facade/scripts/facade.sh` L99 and L105).
- T10 adds a **default-selection mode** to the runner and to both fixtures (`linux-native.mjs`, `linux-device-mode.mjs`).
  The explicit mode stays as it is. In the default mode:
  - the runner sets no `CUA_NATIVE_ENGINE`, and the run home's `engine.json` carries no `engine` key (its `desktop` key
    may stand, since R4 sets the device mode for each of its two modes);
  - the fixture refuses to start unless both hold, and says which did not;
  - it reads the selection from `cua doctor --json`'s `engine` row and requires `selected` `cua` with reason `default`;
  - the sampler requires the trusted worker's engine child to be the run home's installed `cua-engine`, and no
    `sky_linux` at any sample;
  - the report records the mode, the selection and its reason.
- Its negative control is the unflipped default. T10 lands as two commits: the mode first, with the default still
  `vendor`, where it must fail naming `vendor` and `default`; then the flip, where it passes.
- **The fallback homes get their own probe**, not the cua-default mode's checks: that mode requires `selected` `cua`
  and no `sky_linux`, so a fallback home could never pass it. R3 also requires a `typeText` into gedit, which the
  pinned vendor build fails, or crashes on arm64. Three homes on the flip commit: one with no engine, one holding
  0.3.0, and one holding a 0.4.0 `install.json` beside a 0.3.0 executable (F5a). For each, the probe:
  - asserts the same unset selection inputs as the default mode;
  - requires doctor's `engine` row to say `vendor`, with a `warn` naming the reason (no engine, older than 0.4.0, or a
    record that doesn't match its executable) and `cua install --engine`;
  - requires the trusted worker's engine child to be the pinned vendor's `sky_linux`, and no `cua-engine`;
  - runs one observation the vendor build supports: list the apps, bind a harness window, and read its tree. It sends
    no input.

  The full R3 and R4 checks and the zero-`sky_linux` assertion stay with the home that holds the current engine.

**What the owner sees before deciding**: one page, `m5/README.md`, "For the owner".

1. Items 1–11 on both architectures: verdict and link.
2. The measured bar: the seven operations of item 3, each with its three medians, on x64 and arm64.
3. Everything declared, listed apart: the gaps, V3's two unconfirmed cells, #302, the within-the-bound passes, and
   whatever arm64 could not show.
4. What changes for a user: text arrives; requests that the vendor answered ok with no effect now refuse or answer
   unconfirmed (L2259–2267); the device mode; the limitations of §2.
5. The way back: `CUA_NATIVE_ENGINE=vendor` or `engine.json`, per session or per home, until M6b.
6. The flipped default, live, from the prepared flip commit on both VMs: R3 and R4 in the default-selection mode
   above, its failure on the commit before the flip, and the two fallback homes.
7. The unjudged passes: current stable Chrome on arm64, and the vendor's 26.1111.21308 on both.

**If the owner says no.**

- The flip commit is not merged. M5's pull request lands the acceptance evidence, the harness changes and the docs,
  which then describe cua's engine as selectable and the default as `vendor`.
- The decision goes into the Decision Log with its reason and what would change it. Progress marks M5 done with the
  default unchanged.
- #266 closes on the arm64 verdict either way.
- M6a may still start (L340: it removes nothing). M6b cannot: its soak is of the default.
- The plugin bump stays: T8's Linux document and `js` rule land either way (L218: every plugin-visible change).

## 4. Decomposition into loop tasks

| T | Scope | Files | Consumes | Produces, and its proof |
|---|---|---|---|---|
| T1 | **The pinned-release rule.** A run takes the engine a run home's `cua install` placed, and refuses unless: its sha256 is the pin's for this architecture; the release workflow's attestation names those bytes; `--version` names the attested commit; `native/linux-engine/` in the checkout equals that commit's; and no override is set. Labelled "acceptance on the pinned release". The runner's vendor paths follow the architecture. The facade suites run with no `--engine-bin` and no `CUA_LINUX_ENGINE_BIN`, the device named by the environment | `scripts/linux-engine-diff/candidate.mjs`, `scripts/linux-engine-gate/{gate,steps}.mjs`, a suites runner beside `m4/facade/scripts/facade.sh`, `test/linux-engine-diff/` | – | Failing-first tests: another digest, an unattested file, a changed engine tree, an override in the environment and the other architecture's asset are each refused. One live step on x64. Reviewed for false greens first (L2212) |
| T2 | **The gate's rulings become judges** (#371, and C22). #302 in the settle lane's judge, as #371 states it, with the stored S1 and L3b rows as fixtures. #373 in `SPEED_GAPS`, which is empty today. P6's one-sided Fisher rule in the predicates judge. The late take's witness span stays a re-judge script | `scripts/linux-engine-diff/{action-settle,deviations,predicates}.mjs`, `test/linux-engine-diff/` | – | Each rule passes the stored rows it was ruled on and fails every negative control `m4/gate/scripts/*-controls.mjs` holds. A lost key, a refusal or an invalid run still fails |
| T3 | **In-cell judging, and R2 fails closed** (#370; F8 ruled, F8a to confirm). `compare --engines` on Linux judges an engine-answered operation by its in-cell time and reports wall time beside it, unjudged. Today a series still undetermined after its one top-up comes back as `verdict: 'undetermined'`, and an operation fails only on `'fail'` (`compare.mjs` L318 and L416–418), so R2 can exit 0 without the bound being shown: M4's release-window concession (L1911–1918). In M5 such a series fails R2. The one exception is a series the design session declares a gap by name, in a list the comparison reads; it is then printed as **unproved**, apart from the passes, and the evidence reports it from that list, never from R2's exit status. macOS unchanged, with a test | `scripts/native-baseline/compare.mjs`, `scripts/native-baseline.mjs` (its "reported, not a failure" line), `scripts/linux-engine-gate/steps.mjs` (R2's text), `test/native-baseline/` | – | The stored `m4/facade/baseline/` rows re-judged in-cell. A cell slower in-cell fails. **A negative fixture whose pooled interval still crosses the bound: the comparison fails and exits nonzero.** With that series declared, it exits 0 and lists it as unproved; a declaration naming another series does not cover it |
| T4 | **arm64 in the harness**, in two rounds. *Static*, in wave 0: per-architecture vendor expectations for repl-parity (today's three are x64's); the `:0` guards assume `/Users/new` and uid 501 (`wrap71.py`) and read both from the session if the arm64 VM differs; a lane whose vendor build ends its scene window is restarted lane-neutrally, counted, and never scored against cua. *The pilots' fixes*, after T6: whatever the arm64 and x64 pilots found in the harness, and the arm64 vendor outcomes as declared expectations | `scripts/repl-parity/expected/`, `test/repl-parity/vendor-defects.json`, `scripts/linux-engine-diff/{scenes,text}.mjs`, the `:0` guards under `m4/pointer-route/scripts/` or copies of them under `m5/`; then what the pilots name | T1; its second round T6 | Tests on x64 for the static round. The second round is reviewed like any harness change, for false greens first, and **the head is frozen only after it** |
| T6 | **The arm64 VM made ready, and the pilots.** §7's install list. The newest arm64 vendor package checked by its own signature and extracted. Then every step once in its smallest form on arm64, as a development run. Beside it on x64: the private steps in their smallest form on the pinned engine, and one `:0` step in a short sitting, so T1–T3 are seen live before the judged run | evidence `m5/arm64/pilot/`, `m5/x64/pilot/`; no judged evidence | the VM; T1 and T4's static round reviewed; T2 and T3 where they have landed | The inventory. The vendor's arm64 outcomes (L1001). The "not shown on arm64" list. Chrome checked as §7.3 says. Findings go to T4's second round, or to the design session |
| T5 | **x64 acceptance.** §1's steps on the pinned engine, in the gate's frozen order, on the #171 VM. One `:0` sitting of six steps. Then F3's unjudged lane | evidence `m5/x64/` | the frozen head H (§8): T1–T3, and T4 after T6 | Every step passes by its own judge, at H. `m5/x64/README.md` with the step table, lock lines, loads and each step's SHA |
| T7 | **arm64 acceptance.** The same steps at the same H on the arm64 VM, against its vendor builds. Then F2's and F3's unjudged passes | evidence `m5/arm64/` | H; T6 | As T5. Closes #266 |
| T8 | **The docs** of §2, written for the default as it stands. The Linux document and its facade option (F4), with a Decision Log line. The `js` rule that follows the selected engine, now | `README.md`, `deploy/cloud-vm/README.md`, `docs/cua-api/linux-engine.md`, `docs/cua-api/PROVENANCE.md`, `src/cua-api/{documentation,create-tinysky-alt}.mjs`, `test/cua-api/`, `src/mcp/{surface,server}.mjs`, `test/mcp-browser-surface.test.mjs` | – | Each limitation's sentence checked against the engine's own text. The quoted line equal to the engine README's. The Linux document is served for a Linux surface and not for macOS, and `core.md`'s bytes are unchanged. The `js` rule: the GTK 3 sentence under the vendor's engine, the new one under cua's, by test. How the connection's selection reaches `tools/list` is T8's to establish |
| T10 | **The flip, prepared before the decision and merged on the owner's yes.** The default per platform. F5: a default selection whose installed engine is older than `MIN_ENGINE_VERSION` keeps the vendor's engine with a warning naming `cua install --engine`; an explicit selection still refuses (F5a: how the version is read). The default-selection mode of §3 in the runner and both fixtures. The plugin's bump and the README's default sentences | `src/runtime/{launch,linux-engine,doctor-engine}.mjs`, `scripts/repl-parity/selection.mjs`, `scripts/probe/pinned-engine.mjs`, `scripts/accept/{linux-native,linux-device-mode}.mjs`, T1's suites runner and its sampler, `test/{runtime-launch,doctor-engine-linux}.test.mjs`, `test/repl-parity/selection-oracle.test.mjs`, `.claude-plugin/plugin.json`, `README.md` | H; T5 and T7 passed | Unit tests for each row of §3's list, macOS's default unchanged by test. Live on both VMs, before the arm64 VM goes: R1–R4 again on the flip commit (it changes `launch.mjs`, which every suite launches through), R3 and R4 also in the default mode, that mode failing on the commit before the flip, and the two fallback homes. On yes: `ci-gate` GREEN with `test` and `sandbox-live` |
| T9 | **Close-out.** `m5/README.md` with "For the owner". F7's ticket text handed to the design session. The spec folded. The whole-branch review. The pull request | `docs/evidence/…/m5/README.md`, the spec, the report | T5, T7, T8, T10's live checks | The owner's decision, recorded. On yes, T10's commit is merged with it |

**Order.** Each task is reviewed clean before what consumes it runs. T10 is built and shown before T9 closes.

| Wave | Tasks | Notes |
|---|---|---|
| 0 | T1, T2, T3, T4's static round, T8 | disjoint files, each in its own worktree. The VM is created now, and T6's install runs beside them |
| 1 | T6's pilots, on both VMs | as development runs, at wave 0's reviewed tip |
| 2 | T4's second round, reviewed; then the head is frozen as H and pushed | no freeze before this. With no pilot finding, the freeze follows the pilots at once |
| 3 | T5 and T7 at H, one on each VM; then the unjudged passes. T10 is built meanwhile | T5's `:0` sitting needs the GO. Neither judged run starts before H |
| 4 | T10 shown live on both VMs; the arm64 VM deleted | |
| 5 | T9, the decision, and on yes T10 merged | |

**Why x64 waits.** T5 does not start before H, though the x64 VM is free from wave 0 on. A judged x64 run at an earlier
head would be superseded by any pilot fix that reaches its steps, and both architectures would then stand on different
SHAs. The x64 VM spends the wait on its pilot, which costs a few hours and proves T1–T3 live.

**Where the tickets go.**

| Ticket | In M5 | Why |
|---|---|---|
| #266 | T6, T7 | L2295; its criterion is the gate on the shipped arm64 asset: the whole list (F1) |
| #370 | T3 | L2295, L696; adopted (F8), with R2 failing closed (F8a) |
| #371 | T2 | L2295, L2031 |
| #228 | T8, as a limitation only | its Decision log: #171 documents it and changes no launch behaviour |
| #192 | out | the macOS engine's decision. It matters here only because the constant is shared (C16) |
| #373, P6's rule | T2 | not assigned by the spec, but without them V3 and P6 exit 1 again and pass by script (C22) |
| a new ticket, lasting arm64 CI | T9 hands over its text (§6, F7) | the design session registers it and tells CI-opt |

## 5. Conflicts and ambiguities

| # | Issue | Where | Proposed resolution |
|---|---|---|---|
| C1 | M5's Touches name evidence, two docs, `launch.mjs` and `plugin.json`. M5 also needs the harness, the suites, tests and `src/mcp/surface.mjs` | L332 | Each task's list here supersedes it, as M4's C13 did |
| C2 | The M5 block is one harness command over seven scenes. M4's Outcomes say the gate's runner and scripts carry over: 49 steps, 23 scenes | L480–491 against L2295 | The gate's step list is M5's run. The block's scenes lack the device, identity and minimized scenes that items 7 and 8 need. Rewrite the block at the fold |
| C3 | `$INSTALLED` is the VM's default home, and the block installs into it | L370, L488 against L216 and `m4/release/README.md` | An acceptance home of the run's (§1.1) |
| C4 | The gate's candidate must be built from the checkout's commit. M5's harness changes after the release | `candidate.mjs` ("commit mismatch") against T2–T4 | T1: the bytes are the pin's and the engine's sources are unchanged since the released commit |
| C5 | The suites' runner passes `--engine-bin` and `CUA_LINUX_ENGINE_BIN` | `m4/facade/scripts/facade.sh` against L190 | T1: the installed engine, as `m4/release/scripts/checks.sh` ran R3 and R4 |
| C6 | Item 4 says 480 and 222 nodes. Since task 49 the gedit scene reads 486 in a home of the run's | L197 against L599 | Equality with the vendor on the same scene. Counts recorded per architecture |
| C7 | Item 9 wants `file` to say statically linked. x64 prints `static-pie linked` | L202, `m4/release/README.md` | Both count: musl and not dynamic, as `candidate.mjs` `elfTarget` reads it |
| C8 | Item 10 wants `npm test` to pass. On a Linux VM about 51 tests fail for platform reasons. `engine-linux` runs on x64 only | L203, R L611, `.github/ci-kit.yml` | `ci-gate` on the head is the proof for both. arm64's engine tests are the release workflow's arm64 job (run 43637317960). Neither is rerun on a VM |
| C9 | Item 10 says "no cua median above the vendor's". T18 replaced that with the interval rule, and #370 changes what is timed | L203, L1905–1915 | Decided (F8): item 10 is amended to in-cell time with wall time beside it, and to F8a once confirmed |
| C10 | "Against that machine's vendor builds": the pinned arm64 build ends gedit on text input. The parity expectations are x64's. The vendor lane of R2 may lose its window mid-run | L204, L527, L1001 | T6's pilot records what happens. The outcomes are declared per architecture. The bar for gedit text falls to the newest build, as on x64, where the pinned build fails. A failure blamed on a vendor build is checked against the harness's state first (L2239) |
| C11 | "The newest build" is 26.1023.51421. The vendor now ships 26.1111.21308 | L58 | Decided (F3): the bar stays the spec's two; the third runs once, unjudged |
| C12 | The newest build's package check went through the `Packages` index, which now lists only 26.1111.21308 | L480; R/F §0 | Check the arm64 26.1023.51421 package by its own `_gpgorigin` signature against the vendor key, as the pins' `notes` record for the pinned packages. Keep a copy of both packages off the VM: the pool is not promised |
| C13 | The VM is "deleted after the run". #266 says never take a VM down without the owner | L334 against #266 | Settled (F6): deleted after T7 and the unjudged passes, with a 5-day lease as the backstop. The design session tells the owner its life and price |
| C14 | "Provisioned the same way". The x64 VM is a devcloud host with `cua-provision.sh` run on it (`/etc/cua-provision.conf`: user `new`, ref `main`, deb `pin`, extension `hosted`), plus packages added by hand through M0–M4. cua has no `devenv/`, which the devcloud skill says a project needs | L190, L334 | §7's list is "the same way". How `devcloud vm up` treats a project without `devenv/` was not verified |
| C15 | Each VM needs "one ready bound Chrome profile, which repl-parity's prepare requires". Since T18 the suites prepare `--native-only` on a private display | L380 against `facade.sh` | No bound profile is needed for M5. The template still binds `me` |
| C16 | One default constant serves macOS and Linux | launch.mjs L458 | Per platform (§3) |
| C17 | The flip and a home whose engine is older than `MIN_ENGINE_VERSION` | launch.mjs L501–516, `client.mjs` | Decided (F5): the default keeps the vendor's engine with a warning; built in T10 |
| C18 | M5 documents the device mode and `minimized` "in `docs/cua-api/core.md`". That file's bytes are held to the vendor's document plus listed edits, by test. It is also served to vendor-engine sessions and on macOS | L213, L330 against `docs/cua-api/PROVENANCE.md` | Decided (F4): cua's own Linux document; `core.md` is not edited. L213 and L330 are amended at the fold |
| C19 | M5 lists two known limitations. M4 added more | L330 against L2259–2277 | §2's list |
| C20 | The x64 VM runs Chrome 156. A new VM installs 157 | this VM; Google's index | Decided (F2): 156 on both for the judged run |
| C25 | The first draft froze the head before the arm64 pilot, whose fixes then changed it | the review; §4, §8 | The freeze follows T6 and T4's second round. T5 and T7 run one SHA. A later fix follows §8's supersession rule |
| C26 | The default cannot be shown by unsetting the variable: R4's fixture requires it and the runner sets it | `linux-device-mode.mjs` L226, `facade.sh` L99, L105 | The default-selection mode of §3, in T10 |
| C27 | R2 exits 0 with a series still undetermined after its top-up, which item 3 does not count as a pass | `compare.mjs` L318, L416–418; L196; L1911–1918 | F8a, in T3 |
| C21 | Firefox must be Mozilla's, never the snap. The x64 VM uses 159.0~build1 | L670, R L606 | Mozilla's apt repository has 159.0~build1 for arm64: the same version, unpacked the same way |
| C22 | M4's gate passed S1 and L3b, V3, P6 and one V5 by re-judge scripts. M5 "as written" should pass by its judges. The spec assigns only #371 | `m4/gate/README.md`, "Steps that passed by a ruling" | T2 encodes #302, #373 and P6's rule. The late take's witness span stays a script and is run if it recurs. Superseded 2026-11-19: ruling 680 is encoded in V5's live judge at H⁵ (ruling 867; the spec's Decision Log, "the frozen head H⁵") |
| C23 | An engine fix "ends with its own release and the affected items run again". Nothing says how much reruns, or on which architecture | L334 | M4's rule (R L444): the steps the diff reaches, plus one cross-check, on both architectures, since the pin moves for both. The fix is released first (0.4.x), then the steps run on the pinned asset |
| C24 | The brief gives M4 as about 18 days. The spec's Progress has M3 done on 2026-11-02 and M4 on 2026-11-14 | L26–27 | §9 uses the spec's dates: about 13 days |

## 6. Design forks

### Decided (the design session, sminos 704)

| F | Choice | Ruling | Where it lands |
|---|---|---|---|
| **F1** | What runs on each architecture | The whole 49-step list on both | T5, T7; §1.3 |
| **F2** | Chrome's version | 156.0.8078.73 on both for the judged run. Then one unjudged pass of the Chrome steps on current stable, on arm64 | §7.2 item 2; T7 |
| **F3** | The vendor's third build | The bar stays the spec's two. 26.1111.21308 runs once, unjudged, on item 3's seven operations | T5, T7; C11 |
| **F4** | Where the model reads the device mode and `minimized` | cua's own Linux document, worded to hold under either engine. The facade touch it needs, the option `create-tinysky-alt.mjs` passes, is allowed on M3's truncation-line precedent and gets a Decision Log line | T8; §2 |
| **F5** | A default selection that finds an engine older than `MIN_ENGINE_VERSION` | It keeps the vendor's engine, with a warning naming `cua install --engine`. An explicit selection still refuses | T10; §3 |
| **F6** | The arm64 VM's life | Deleted after T7 and the unjudged passes, with a 5-day lease as the backstop. This settles C13. The design session tells the owner its life and price | §7.1 |
| **F7** | Lasting arm64 CI after the VM | A ticket at close-out. Its text is below. The design session registers it and tells CI-opt | T9 |
| **F8** | #370 | Adopted: engine-answered operations are judged by in-cell time, with wall time reported beside it. Item 10's text is amended with it | T3; C9 |
| – | The `js` rule about GTK 3 text views | It follows the selected engine, in T8, not waiting for the flip. It is already wrong for a session with `CUA_NATIVE_ENGINE=cua` | T8; §2 |

### To confirm

| F | Proposal | Why |
|---|---|---|
| **F8a** (approved, sminos 705) | In M5, an engine-answered series still undetermined after its one top-up **fails R2**. The exception is a series the design session declares a gap by name. A declared series is reported as **unproved**, listed apart, and read from the comparison's own list, never inferred from R2's exit status | Item 3 tells undetermined apart from a pass: at 40 a side it "fails or stands as a declared speed gap" (L196). `compare.mjs` reports it and passes, which was M4's concession inside the release window (L1911–1918). M5 has no such window. T3 carries a negative fixture whose pooled interval still crosses the bound |
| **F5a** (approved, sminos 705; digest binding added from the re-review) | For F5, the installed engine's version is read from the home's `install.json`, not by running the engine, and it is trusted only when the record's digest matches the executable, as `inspectLinuxEngine` already requires (`src/runtime/linux-engine.mjs` L175). A record that cannot be read, or whose digest doesn't match, counts as older, so that home too keeps the vendor's engine with the warning. Tests cover the unreadable record, and a valid newer record beside an older executable. One boundary (ruling 1063, 2026-11-22, T10 at f99f727f): an executable whose hash equals the current pin's asset is the pinned binary, whatever `install.json` says, and reads as the pin's version, since F5a guards against running an unpinned binary and a hash match rules that out; a test keeps it, and the doctor naming such a record stale is on the tracker | Selection runs at every launch. `readEngineRecord` checks only the record's shape, and `placeLinuxEngine` replaces the executable before writing the record (L159), so an interrupted downgrade can leave an old engine beside a valid newer record. Trusting that record would select cua and then refuse the first request, which is the break F5 prevents. Hashing the executable at launch costs one read of about 2 MB (the x64 0.4.0 asset is 2,130,784 bytes). The safe side of any doubt is the engine that still works |
| **§8.1's supersession rule** (approved, sminos 705) | A harness fix after the freeze replaces H by M4's scoped rerun with a cross-check, on both architectures, or by a full rerun where the cross-check differs or shared code changed | T5 and T7 must end on one SHA, and the rule says which evidence is regenerated |
| **F6a** (approved, sminos 705) | The arm64 VM stays about 8 hours past the unjudged passes, for T10's live checks, and goes at about hour 78. Read strictly, F6 deletes it at about hour 70, and the default is then shown live on x64 only | The default flips for arm64 too, and the review asked that it be shown by a mode that proves the selection. The 8 hours are inside the lease and cost about €0.30 |

### F7's ticket, drafted

> **Title:** Linux engine: an arm64 leg of the `engine-linux` gate, so arm64 stays covered after M5's VM
>
> **Problem & intent.** cua's Linux engine ships an arm64 asset, and from M5 it may be the default engine on arm64
> machines. M5 judged that asset once, on a devcloud arm64 VM that was then deleted (#266). After that, arm64 is covered
> only when a release is cut: `linux-engine.yml` builds and tests the arm64 asset natively on `ubuntu-24.04-arm`. The
> `engine-linux` ci-kit gate, which runs on every pull request that touches `native/linux-engine/**`, builds and tests
> x86-64 only. So an arm64-only regression is first seen at release time.
>
> Intent: a pull request that changes the engine is tested on arm64 before it merges.
>
> **Seams.** `.github/ci-kit.yml` (`engine-linux`: the musl build, clippy, and the live tests under `xvfb-run` with
> `dbus-run-session`, on the `hosted` lane); `.github/workflows/linux-engine.yml` (its arm64 job is the working recipe);
> ci-kit's lanes.
>
> **Constraints.**
> - GitHub-hosted runners only. No vendor package is fetched in CI (the spec's CI rule), so this is the engine's own
>   tests, never a comparison against the vendor.
> - The x86-64 leg is unchanged.
> - Whether ci-kit has, or needs, a lane for `ubuntu-24.04-arm` is the first question, and CI-opt's to answer.
> - Spawned by #171 (M5). Parent N/A. Blocked-by N/A.
>
> **Success criteria.**
> - `ci-gate` on a commit that touches `native/linux-engine/**` runs the engine's build and live tests on arm64 and
>   reports them as a gate, or as a leg of `engine-linux`.
> - A deliberately arm64-only failing test turns that gate red and leaves the x86-64 leg green.
>
> **Decision log.**
> - Registered at #171 M5's close-out, by the design session's ruling (sminos 704, F7).
>
> **Sources.** `docs/doperpowers/specs/2026-10-28-own-linux-engine-m5-preflight.md` (F7);
> `docs/evidence/2026-10-28-own-linux-engine/m5/arm64/`.
>
> Board: category enhancement; status ready-for-architect; priority P3; spawned-by #171; relates-to #266.

## 7. The arm64 VM

### 7.1 When, how long, and its end

Hours are counted from the design session's approval of this pre-flight (hour 0), in the order of §4 and §9.

- **When it is needed: day 1, hour 2.**
  - Hours 0 to 2 are the design session's: `--dry-run`, telling the owner its life and price, and creation.
  - It may come as late as hour 6 at no cost: its install takes 4 to 6 hours and the pilot cannot start before wave 0
    is reviewed, about hour 12. After hour 6, each hour's delay moves the freeze, and so both judged runs, by an hour.
  - `feat/171-m5` is already pushed (483bdf05), so the clone has what it needs. The install needs no harness change.
- **What it does, hour by hour.**

  | Hours | The VM |
  |---|---|
  | 2–10 | T6's install (§7.2) and the vendor packages |
  | 12–20 | T6's pilot: every step in its smallest form |
  | 20–36 | waits while T4's second round is fixed and reviewed. It is kept: a rebuild is a day |
  | 36–66 | T7, at H |
  | 66–70 | the unjudged passes: current stable Chrome, and the vendor's third build |
  | 72–78 | T10's live checks on the flip commit |
  | about 78 | deleted: day 4, hour 6 |

- **How long: about 76 hours with no cut**, a little over three days. One cut adds 24 to 36 hours, to about hour 110.
- **The lease: 5 days** (F6), which ends at about hour 122 and so covers one cut. A second cut needs `devcloud vm lease`
  before then.
- **The price**: the design session's to state, from devcloud's GCE provider (c4a-standard-8, us-west1). Hetzner's
  `cax31`, the first choice, was €0.0336 an hour.
- **The request**, with the flags the devcloud skill names (`devcloud vm --help` has the rest; the location flag was not
  verified):

  ```bash
  # GCE through devcloud's provider (doperpowers board #187); the provider and type flags are that provider's,
  # not verified until it lands. The design session creates the VM at the head the controller names.
  devcloud vm up --label linux171arm --project SSFSKIM/cua@feat/171-m5 --type c4a-standard-8 --ttl 5d --dry-run
  devcloud vm up --label linux171arm --project SSFSKIM/cua@feat/171-m5 --type c4a-standard-8 --ttl 5d
  ```

- **The type** (the Decision Log's "M5 arm64 VM" entry, 2026-11-18): GCE `c4a-standard-8`, 8 vCPU (Google Axion,
  Neoverse V2), 32 GB, a Hyperdisk boot disk of at least 160 GB, in us-west1. Twice the load stays 16 workers on both
  VMs. Hetzner's `cax31` (8 vCPU Ampere Altra, 16 GB), planned first, was unavailable in every location for three days.
  - 8 vCPU is at the devcloud cap, not beyond it, so its creation needs no yes from the owner, while fewer than three
    VMs made without one are alive.
  - If Hetzner refuses it (exit 3): another EU location, then an 8 vCPU arm64 type on Google Compute Engine, which
    devcloud ships and where #115's M3 ran its arm64 box (`docs/evidence/2026-10-17-own-sandbox/m3/`).
- **Its end** (F6). `devcloud vm down <name>` after T7 and the unjudged passes, and after T10's live checks if F6a is
  confirmed, once the evidence is pushed (it refuses while work is unpushed). The lease is the backstop.

### 7.2 What is installed

From this VM's apt history, its conf and M4's lessons (L2295). Everything is installed by T6.

0. **The image** (GCE): Ubuntu 24.04 LTS arm64 from GCE's public image family (`ubuntu-2404-lts-arm64`), on a
   Hyperdisk Balanced boot disk (C4A takes Hyperdisk only) of at least 160 GB. No nested virtualization is needed.
   GCE's guest agent manages the login user and its keys: the `:0` guards read the person from the session (T4's
   static round), so check the uid and home before the pilot rather than assume 501 and `/Users/new`. A C4A guest
   has no GPU device: with no `/dev/dri/card*`, `cua-provision.sh` writes Xorg's dummy driver at 1280x800, where the
   x64 VM's `:0` runs on its `card0`. That is §8.2's second cut, a different Xorg driver; the pilot records which
   driver and size `:0` ran, and a scene that assumes the x64 VM's screen size is a pilot finding.
1. **The template.** `deploy/cloud-vm/cua-provision.sh` as root, with the x64 VM's conf and the ref changed:
   `CUA_USER=new`, `CUA_REF=feat/171-m5`, `CUA_REPO=https://github.com/SSFSKIM/cua`, `CUA_DEB=pin`,
   `CUA_EXTENSION=hosted`. It gives the desktop on `:0`, Google Chrome with the extension by policy, Node, `/opt/cua`,
   the pinned arm64 runtime and engine in the user's home, `"desktop": "dedicated"` and `IsEnabled`.
2. **Chrome**, as F2 rules: `google-chrome-stable_156.0.8078.73-1_arm64.deb` from Google's pool, then held.
3. **The matrix's applications**: `gnome-text-editor xterm libreoffice-writer libreoffice-gtk3 libreoffice-calc
   libreoffice-impress kate qtcreator gnome-terminal yad python3-pyqt5 python3-pyqt6 python3-gi gir1.2-gtk-3.0
   gir1.2-gtk-4.0 breeze`.
4. **The harness's tools**: `xvfb stress-ng xtrace xdotool xclip build-essential pkg-config`.
5. **Fonts**: `fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji`. The x64 VM has them, and they move Openbox's
   frame and render the Korean and emoji of the text cases.
6. **Firefox**: Mozilla's deb 159.0~build1 for arm64, unpacked as task 59 did and first on `PATH`
   (`~/.local/share/cua-171/task59/bin`). Never the snap.
7. **Rust 1.94.1** through rustup, for xprobe only. No engine built there is judged.
8. **In the checkout** (the worktree of L396–402, on `feat/171-m5`): `npm ci`, then `node
   node_modules/electron/install.js` (electron 44.9.0 has a linux-arm64 build), then xprobe built.
9. **The vendor builds.** The pinned one comes with `cua install`. The newest arm64 package is fetched, checked (C12)
   and extracted to the `NEWEST` path of L368.
10. **The run's plumbing**: the ssh alias `cua-171-arm64` (L386–391); `locked.sh` and the lock files, which live only
    on the x64 VM under `~/.local/share/cua-171/`; `gh` signed in, for the attestation checks.

**Checks before the pilot**: `uname -m`; the user's uid and home, which the `:0` guards assume are 501 and `/Users/new`;
which Xorg driver `:0` runs on (`/dev/dri/card*`); `cua doctor`; no snap browser on `PATH`.

### 7.3 Chromium on arm64

**Proposal: the same product as on x64, Google Chrome's deb from Google's repository.** No snap, no Playwright build
and no Debian package is needed. The design session's two candidates are ranked below as fallbacks.

How the engine treats it as Chrome. Each line is from the engine's code or Chromium's; none was observed on arm64 here,
and T6 checks each with one cell before T7 starts.

| What the engine reads | Where | Why arm64's Chrome answers the same | T6's check |
|---|---|---|---|
| The family, by X11 class | `families.rs`: the "Chrome" entry matches `Google-chrome`, `Chromium` and `Chromium-browser` by class, before any toolkit lookup | Chromium takes the class from `--class`, else from its desktop file's base name with the first letter raised (`chrome/browser/shell_integration_linux.cc`, `GetProgramClassClass`). Branded Chrome's is `google-chrome`. Nothing there depends on the architecture | `xprop WM_CLASS` on the harness's Chrome window |
| The AT-SPI tree | `scripts/linux-engine-diff/chrome.mjs`: `ACCESSIBILITY_ENABLED=1` starts the bridge, `--force-renderer-accessibility` gives the pages' trees | Both conditions were measured on aarch64 with Chrome 154: the window joins AT-SPI once accessibility is enabled, and the pages' trees need the flag (`docs/evidence/2026-10-06-linux-acceptance.md`, "Chrome's AT-SPI exposure") | V2's Chrome read in the pilot: `at_spi`, nodes equal to the vendor's |
| Drag and drop | `dnd.rs`: Chrome's client takes `XdndSelection` when its drag starts, and asks for `_NET_ACTIVE_WINDOW` after a drop. The "Chrome" entry sets `drop_changes_desktop` | Chromium's X11 platform code, shared by every Linux build | V5's `device-chrome-dnd` cells and C1 in the pilot: a take seen, a drop confirmed |
| A context menu | `copy.rs` `open_menu`: a new child of the application holding a `menu item`, within 1 s | Chromium's views and its ATK bridge | S1's `secondary_action` and its `menu_unconfirmed` control in the pilot |

The cua extension and native host are not part of #171's acceptance. They installed on aarch64 in October, and the
template installs them again.

**Fallbacks, if the deb fails on the VM**, in order:

1. Chrome for Testing's `linux-arm64` archive. The same code. Its window class and policy directory were not verified;
   `--class=Google-chrome` would force the class.
2. Playwright's Chromium for linux-arm64. An open-source Chromium build, which the "Chrome" entry matches if its class
   is `Chromium` or `Chromium-browser`; not verified. Whether Playwright now fetches Chrome for Testing there instead
   was not found.
3. Debian's `chromium` deb. It is 150.x for arm64 in bookworm and trixie, seven majors behind, and it mixes Debian
   packages into Ubuntu 24.04.
4. Never Ubuntu 24.04's `chromium-browser`: it is a transitional package for the snap, V5's fault class (L670).

**What still cannot be shown on arm64.** With branded Chrome there, no item is known to lack its browser. The list is
`m5/arm64/README.md`, "Not shown on arm64": T6 fills it and the design session sees it before T7 starts. A cell on it
stands as declared for item 11, never as passed and never dropped silently. What may land on it:

- gedit text against the pinned build, if that build ends gedit on every sample (C10). cua's effect is still judged
  absolutely, and the bar is the newest build's;
- any operation neither arm64 vendor build succeeds at, which then has no bar there;
- `npm test` and `engine-linux` on arm64 hardware (C8).

## 8. The run, and what cuts it

### 8.1 The frozen head, and what replaces it

- **No freeze before the pilots' fixes.** T1–T3, T4's static round, T6's pilots and T4's second round all land on
  `feat/171-m5`, each reviewed. Only then is the harness head frozen, as **H**.
- **T5 and T7 run the same H.** Each VM runs from a fresh worktree detached at H, clean, with `npm ci`, the Electron
  binary and xprobe (L2295). Every step's record names the SHA it ran at.
- **What does not move H**: commits that touch no file a step runs, such as T8's docs and the evidence itself.
  `native/linux-engine/` never changes without a release (T1 refuses a run otherwise).
- **A harness fix after the freeze** (to confirm, §6). The fix is reviewed and gives H′. Then, as M4's gate reran
  candidates 2 and 3 (R L444; `m4/gate/README.md`, "The rerun lists"):
  1. **Reached steps rerun at H′, on both architectures.** A step is reached when the diff H..H′ touches its script, its
     scenes or pages, its judge, or anything it launches through. The list is written down, with the reason for each
     step kept, before anything reruns.
  2. **One cross-check a VM**: a step the diff does not reach reruns at H′ and is compared with its record at H, cell by
     cell, with its failures and audits (`m4/gate/scripts/compare-settle.mjs` is the form).
  3. **A full rerun at H′, on both**, if a cross-check differs, or if the diff touches what every step shares: the pinned
     rule, the runner, the witness, the audit, the stub check.
  4. **A fix to a judge alone** may re-judge the stored rows of the steps it reaches through H′'s judge, with that judge's
     negative controls, in place of rerunning them. Such a step is listed as re-judged at H′.
  5. A step that neither reran nor was re-judged stands on H. The README's step table carries a SHA column, and the pull
     request states H, H′ and which steps stand on each.
  6. A fix found on one architecture still reruns its reached steps on both. No step ends at different SHAs on the two.
- **The flip commit** (T10) is beyond H by design. It changes `launch.mjs`, which every facade suite launches through, so
  R1–R4 rerun on it on both VMs (about 95 minutes each), and R3 and R4 also in the default mode. Nothing else is
  reached.

### 8.2 The run

- **The order** is the gate's (`steps.mjs`): the private idle steps under the driver, the `:0` sitting, then the block
  at twice the load. Every step runs under the host lock.
- **Before a vendor build is blamed** (L2239): the scene's text restored per lane, no stress-ng or harness process left,
  titles unique to the run. On arm64 also: did the vendor end the window.
- **A harness or environment fault** is fixed and the step rerun, as M4's D2 and V5 were. An environment fault changes
  no SHA. A harness fault follows §8.1.
- **An engine fault cuts the release.** The fix is reviewed, released as 0.4.x and pinned. The steps its diff reaches
  rerun on both architectures with one cross-check (C23).

What could cut it, most likely first:

1. **A timing constant tuned on the x64 VM that a slower arm64 core misses**: the per-kind settle, the 25 ms wait for
   `TARGETS`, the hold to press + 250 ms, the 350 ms floor, the browser rest of one frame, the 2 s Copy wait, the 1 s
   menu wait. Most exposed at twice the load. The pilot runs every step once, so it can show a gross miss before the
   freeze, but not a rate.
2. **The arm64 `:0`**: a different Xorg driver changes when a redirected window's contents are ready.
3. **A real architecture fault in the engine.** The unit and live tests already pass natively on `ubuntu-24.04-arm`,
   so this would be one only a real desktop shows.
4. **A false success found late**, M4's costliest class (L2279–2282).

Chrome is not on this list: both judged runs use 156 (F2). What current stable changes is seen in the unjudged pass and
goes to the owner's page, not to the verdict.

## 9. Timeline

From M4's costs. M4 ran loop tasks 28 to 80 from 2026-11-02 to 2026-11-14 (C24). Its gate ran three candidates in about
32 hours (`m4/gate/README.md`, "Every step"): candidate 1's idle block and `:0` sitting took 12.7 hours, candidate 2's
reruns 10, candidate 3's 3.2. The next candidate started 5.5 and 6 hours after each cut. A release build takes 7
minutes (`m4/release/README.md`).

| Task | Hours | Basis |
|---|---|---|
| T1 | 6–10 | M4's T1 took two review rounds; this adds the runner and the suites |
| T2 | 6–10 | three rules with controls; the re-judge scripts' review found three P2 |
| T3 | 6–10 | the in-cell judge, the fail-closed rule with its fixture, a macOS-unchanged test |
| T4, static | 3–5 | |
| T6 | 12–18 | the install 4–6; the pilots 4–6 of machine time on each VM, side by side; reading them |
| T4, second round | 4–16 | what the pilots find, and its review. Nothing found: 0 |
| T5 | 21–24, machine | 1,216 planned minutes. One `:0` sitting of about 3.5 hours, on the GO |
| T7 | 21–30, machine | the same list on slower cores; no sittings to wait for |
| the unjudged passes | 3–4 | the Chrome steps on arm64; seven operations against the third build on both |
| T8 | 8–12 | the docs, the Linux document and its option, the `js` rule; with review |
| T10 | 6–10, and `ci-gate` on yes | the default, F5, the default mode; the hosted macOS runners once queued 1 h 40 (R L624) |
| T9 | 6–10 | a small branch to review; the owner's page |

**Hours from the approval of this pre-flight**, with no cut:

| Hours | What runs | The arm64 VM |
|---|---|---|
| 0–12 | wave 0: T1, T2, T3, T4's static round, T8 | created at hour 2; install to hour 10 |
| 12–20 | T6's pilots on both VMs | pilot |
| 20–36 | T4's second round and its review; **H frozen at about hour 36** | waits |
| 36–66 | T5 and T7 at H. T10 built beside them | T7 |
| 66–70 | the unjudged passes | passes |
| 72–78 | T10 shown live on both VMs | live checks, then deleted at about hour 78 |
| 78–90 | T9; the owner's page ready at about hour 90 | – |

- **With no cut: about four days to the owner's page.** The new order costs about half a day against the first draft:
  the x64 run now waits for the arm64 pilot's fixes instead of starting at hour 24. If the pilots find nothing, the
  freeze comes at about hour 22 and that half day returns.
- **Each cut adds a day to a day and a half**: the fix and its review, a release, the reached steps on both VMs. A
  harness fix after the freeze costs less: its reached steps and a cross-check, hours rather than a day.
- **Plan for one cut: five to five and a half days.** M4's lesson is to plan for it (L2294).
- Not counted: usage stops, which cost M4 about 17 hours (R L468–471), the wait for a GO, and the owner's time to
  decide.

## 10. Sources, and what was not verified

**Sources** (read 2026-11-14).

- Google's apt repository: `https://dl.google.com/linux/chrome-stable/deb/dists/stable/Release` (`Architectures: amd64
  arm64`) and `…/main/binary-arm64/Packages` (`google-chrome-stable 157.0.8103.78-1`). Pool files for 156.0.8078.73-1
  and 157.0.8103.78-1 answer 200 for both architectures.
- Chrome for Testing:
  `https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json` (`linux-arm64` on
  all four channels).
- When the arm64 builds arrived: `https://www.omgubuntu.co.uk/2026/07/chrome-arm64-linux-available`,
  `https://calibreapp.com/blog/chrome-for-linux-arm64`,
  `https://linuxiac.com/google-chrome-quietly-arrives-on-arm64-linux/`. Google's requirements page says "an ARM
  processor": `https://support.google.com/chrome/a/answer/7100626`.
- Chromium's window class:
  `https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/shell_integration_linux.cc`.
- The vendor's packages: `https://persistent.oaistatic.com/codex-app-prod/linux/deb/pool/main/c/chatgpt/` (HEAD
  requests for both versions and architectures) and `…/dists/stable/main/binary-arm64/Packages` (26.1111.21308).
- Hetzner: `https://cloudtally.eu/hetzner-cloud-prices` (verified 2026-11-10 by its own statement).
- Debian's chromium: `https://qa.debian.org/madison.php?package=chromium`. Ubuntu's:
  `https://packages.ubuntu.com/noble/chromium-browser`.
- Firefox for arm64: `https://packages.mozilla.org/apt/dists/mozilla/main/binary-arm64/Packages`.
- Electron 44.9.0 for arm64: the release's `electron-v44.9.0-linux-arm64.zip` answers 200.
- This VM: `/etc/cua-provision.conf`, the apt history, `dpkg-query`, the default home's `install.json`.

**Not verified.**

- Chrome on the cax31 itself. Nothing was installed or run. §7.3 rests on October's aarch64 evidence and on source.
- Chrome for Testing's and Playwright's builds: their window class, their policy directory, and what Playwright
  fetches on linux-arm64.
- `cax31` from Hetzner's own pages, and its availability today.
- devcloud: how `vm up` treats a project with no `devenv/`, its location flag, and the new VM's uid and home.
- The newest arm64 vendor package's contents (494 MB, not downloaded), and its signature.
- Whether the pinned arm64 build still ends gedit under cua's own host. October's run was on the vendor's host.
- `qtcreator` and `stress-ng` for noble arm64: the lookups timed out.
- Whether ci-kit has an arm64 lane.
- How the connection's engine selection reaches `tools/list` in `src/mcp/server.mjs`, for the `js` rule (T8).
- That `cua doctor --json`'s `engine` row carries the selection and its reason in the form the default mode needs. It was
  read in `doctor-engine.mjs` (`selected`, `reason`), not run.
