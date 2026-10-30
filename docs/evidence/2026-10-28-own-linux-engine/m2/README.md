# #171 M2: text and clipboard (the proof)

On the #171 VM (`dc-linux171-1e68`, the declared device `cua-171`: Ubuntu 24.04.4, x86-64, 8 vCPU, X11 on `:0`,
Openbox), before M2's release. The cua engine is the build being released: `native/linux-engine/target/release/
cua-engine`, `cua-engine 0.2.0 (de4802a5f277)`, the branch review's engine fixes in (the take checks the snapshot's
XFIXES owner generation under a server grab; the unconfirmed-paste window is display-wide, `CUA_CLIPBOARD_QUARANTINE`).
The harness is at 426e25f2, which changes no engine file. The vendor builds are the pinned 26.928.40906 and the newest
26.1023.51421. The commands are the spec's Concrete Steps (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md):
the differential harness with M2's scenes, the family matrix, then the facade suites. The release, the pin and the
checks on the released asset followed the branch review ("The release and the pinned engine", below).

Every run below is on that build. The earlier sittings on older engine builds (`m2-wire` on e0168c63, the review
rounds' `m2-review*` runs) are superseded and removed from this directory; they stay in the branch's history (5a229a08
and before).

What this proves (Plan of Work, M2): Acceptance 6, and Acceptance 2–5 for the text and clipboard commands, on x86-64.
gnome-text-editor's dedicated-mode case runs on the engine directly (`--desktop dedicated`); its facade-level run is
M3's (Decision Log, M2 pre-flight).

## The differential verdict run (`diff/`, run `m2-final`)

`node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$BUILT" --scene
gedit,chrome,over-budget,retention,chrome-textarea,chrome-address-bar,gnome-text-editor,paste-target --ops all --run
m2-final` (Concrete Steps' M2 scenes, plus `paste-target`, the GTK 3 window the paste cases need), three blocks.

**Its verdict line: `run valid; every verdict PASS`, and it exits 0.** This is the run that gates the release and the
merge.

- **Valid.** The stub engine failed both the witness and the X request audit. The foreground checks held: the
  allowance failed another window raised and the top one raised back, 50 ms apart and under one server grab, and the
  focus and the active window switched to another window and back under one server grab; it passed the target raised
  and the target activated through the window manager.
- **The desktop route's groups were topped up** (Decision Log, the design session's top-up). The three blocks give
  one cold sample an engine, so each `desktop` operation got 17 fresh-engine rounds, and every desktop group was judged
  on 20 cold and 21 warm samples an engine, never on medians of fewer:

  | op | pinned cold / warm | newest | cua | verdict |
  |---|---|---|---|---|
  | `list_windows` | 144.7 / 124.1 | 146.4 / 130.8 | 13.6 / 7.4 | PASS |
  | `list_apps` | 128.9 / 136.0 | 119.6 / 127.8 | 13.7 / 9.7 | PASS |
  | `get_screenshot` | 35.8 / 27.4 | 36.5 / 29.2 | 33.7 / 24.3 | PASS |
  | `launch_app` | 4.4 / 0.7 | 4.6 / 0.7 | 4.0 / 0.7 | PASS (warm 0.68 against 0.67: same within noise, [−0.1, 0.08], bound 1 ms) |

  `launch_app`'s cold request, which an earlier sitting judged on three samples a side, passes on twenty: 4.0 ms
  against the pinned build's 4.4. `get_screenshot`'s cold request passes outright, so the declared parity listing is
  not used in this run.
- Every other operation of M1a's set passes on the M2 engine: over-budget retained ids equal to the pinned build's,
  the bus-call bound held on gedit, Chrome and the over-budget page.

### The text and clipboard commands (Acceptance 2–4)

Medians in ms, cold / warm, 3 blocks (6 samples a block; `clipboard_release` 11). The bar is built from the vendor
samples that succeeded, and no sample whose preparation failed (`prepare_error`) is timed; "–" where neither build
succeeded. "Applied" counts cua's samples whose text landed exactly once where the caret or selection was, read through
the harness's own AT-SPI reads: every text operation now proves its effect on every sample, and one it could not read
fails (no cua sample was unreadable). "Route" is the route each cua request must take and took (Decision Log, M2.2).

| scene | op | pinned | newest | cua | bar | cua applied | route | verdict |
|---|---|---|---|---|---|---|---|---|
| gedit | `type_text` | 10210.0 / 10204.5 (fails, PasteText) | 908.6 / 923.9 | 179.0 / 166.3 | 908.6 / 923.9 | 18/18 | background 18/18 | PASS |
| gedit | `type_text`, preselected range | 10209.8 / 10204.4 (fails) | 900.0 / 932.9 | 178.1 / 164.0 | 900.0 / 932.9 | 18/18 | background 18/18 | PASS |
| gedit | `type_text`, cua `--desktop dedicated` | – | – | 177.1 / 174.3 | – | 18/18, witness clean | background 18/18 | PASS |
| gedit | `type_characters` `Hi 42!` | no such command | 575.3 / 569.4 | 107.7 / 102.1 | 575.3 / 569.4 | 18/18 | background 18/18 | PASS |
| gedit | `clipboard_read` | 523.6 / 541.3 (12 of 18 fail) | 612.7 / 558.1 | 39.1 / 35.7 | 523.6 / 541.3 | 18/18 | – | PASS |
| gedit | `clipboard_write` | fails (see below) | 10202.9 / 10203.0 (fails, PasteText) | 172.7 / 164.2 | – | 18/18 | background 18/18 | PASS, declared |
| gedit | `clipboard_release` | 4.3 / 0.1 (20 samples untimed, `prepare_error`) | 3.3 / 0.1 | 2.3 / 0.1 | 3.3 / 0.1 | – (no effect outside the engine) | – | PASS (warm same within noise) |
| chrome-textarea | `type_text` | 1041.9 / 1002.9 | 989.3 / 2438.7 (17 of 18 false errors) | 180.7 / 167.8 | 989.3 / 1002.9 | 18/18 | background 18/18 | PASS |
| chrome-address-bar | `type_text`, one line | 1116.6 / 1167.5 | 1187.9 / 1158.9 | 209.7 / 189.1 | 1116.6 / 1158.9 | 18/18, read back exactly | background 18/18 | PASS |
| gnome-text-editor | `type_text`, cua `--desktop dedicated` | fails | fails | 75.6 / 82.2 | – | 18/18 | foreground 18/18 | PASS, declared |

- **The text** of Acceptance 6, `cua171 안녕 é 🙂\nline2` with a combining acute after the e, read back exactly in gedit,
  the textarea page and gnome-text-editor; the address bar's single line `cua171 안녕 é 🙂` read back exactly.
- **The clipboard after every paste** held the harness's own prior text (cua 18/18 in every text operation that
  pastes). For `clipboard_write`, the harness's owner takes CLIPBOARD between the read and the write: cua leaves that
  owner's text (18/18), the vendor builds the snapshot (newest 0/18), the declared deviation (Decision Log, M0.1 folded).
- **Declared answers:** cua's success where no vendor build applies the text (gedit's `clipboard_write`;
  gnome-text-editor). The display-wide window's refusal is declared for `type_text`, `clipboard_write` and
  `clipboard_read` (any cua engine on the display); no sample of this run met it. The harness waits the window out
  before every text sample and every safety case, never removing it, since the unconfirmed paste's target may still
  convert until it ends.
- **The bus trace** (Acceptance 6): a pass per text operation and engine, a fresh process under `dbus-monitor`, and
  the whole safety-case phase. cua: PasteText 0, InsertText 0, SetTextContents 0 everywhere; the pinned build calls
  PasteText in gedit's `type_text` and the newest in `clipboard_write`.
- **Speed:** cua is at or below the bar on every text and clipboard command, cold and warm, often five to sixty
  times faster; `clipboard_release`'s warm median (0.13 against the newest build's 0.11 ms, a map removal in every
  engine) passes as "same within noise": interval [0, 0.04] over 30 samples a side, within the bound on its upper end,
  max(5% of the bar, 1 ms) = 1 ms.
- **No cua sample's preparation failed.** Vendor findings, recorded, not the bar: the pinned build's `clipboard_read`
  failed 12 of 18 (`editable element has no selected text to Copy` in its own window from the second block on), so 12 of
  its `clipboard_write` samples and 20 of its `clipboard_release` samples were sent a handle it never issued
  (`prepare_error`, untimed); the newest build answered 17 of 18 Chrome textarea pastes with a false error after a
  correct edit (the regression Acceptance 6's address-bar case covers; its address-bar pastes were all answered
  success).

### The witness, keyed to the route (Acceptance 5; Decision Log, M2.2 and the reviews)

The route each cua text request must take is fixed before it is sent (`text.mjs` `expectedRoute`): the foreground
route for gnome-text-editor in dedicated mode, the background route on every other scene. A request whose reported
route differs, or that records none, fails its witness; the foreground allowance is granted only where both are the
foreground route. Every cua text request took its expected route, and in shared mode the witness and the X request
audit were clean on every one.

- **gedit, `--desktop dedicated`** (`type_text_dedicated`): expected and taken `background` on 18/18, the witness,
  which allows nothing on that route, clean.
- **gnome-text-editor, `--desktop dedicated`** (`type_text`): expected and taken `foreground` on 18/18, the witness
  clean within the allowance on 18/18. The witness's evidence is protocol events, never coalesced, kept on every
  sample:
  - the restacks (`SubstructureNotify` on the root): one `ConfigureNotify` a sample, the target's frame to the top, and
    189 creations and destructions of unmapped windows, which change nothing stacked;
  - the focus and activation (`FocusChange` on the root and every root child, and the `_NET_ACTIVE_WINDOW` requests):
    one activation request for the target, then one `FocusOut` of the previous frame and one `FocusIn` of the
    target's frame, a sample.

  Nothing changed in the 300 ms after each request, and no grab was left. The X request audit on the foreground route
  (`auditForeground`) was clean: its 14 requests the background route forbids are the target's activation, raise and
  focus and XTEST input, and nothing named another window.
- **`restore_refused`** (gnome-text-editor, dedicated, a safety case): the target already active and on top, so no
  restack; the activation request and the focus moving inside the target's own window, the witness clean.

### The paste safety cases (Acceptance 6; `diff/summary.md`, "Paste safety cases")

cua alone, after the blocks, each on windows of its own, each ending every engine, clipboard owner and target window
it started however it ended; a disposal that fails fails its case. Each case, and each late-conversion trial, starts
once the display-wide window an earlier unconfirmed case opened has closed. Every case passed, with no cleanup failure:

| case | what it showed |
|---|---|
| `focus_change` (3 trials) | the prior owner held the engine's snapshot `TARGETS` while the harness moved the focus to the page's other field: `requested field or selection changed before dispatch; nothing was sent`, neither field changed, the prior text kept |
| `focus_change_takeover` (retake 0, 20, 50 ms) | the same, and the prior owner took CLIPBOARD back as soon as the engine owned it: nothing sent, the new owner's text intact |
| `silent_owner` | the prior owner never answered: `clipboard capture timed out: … within 500 ms; nothing was sent` (646 ms), and the next paste went in, so both locks were released |
| `concurrent` (3 trials) | two engines pasted distinct markers at once: each once in its own window, nothing crossed, the prior text kept |
| `contention` | two engines, 20 pastes each with random gaps of 0–30 ms: every paste succeeded, each field holds exactly its own markers in order, the prior text kept (median 179 ms, max 240) |
| `late_page` | the page inserts 3 s after its paste event: unconfirmed at 2.2 s, then the text once at the caret, the next request at once |
| `ignored_page` | unconfirmed at 2.2 s, the field unchanged, the next request at once |
| `stalled_incr` | 100 KB, the INCR transfer never acknowledged: unconfirmed at 2.1 s (the engine saw the stall), the next request at once |
| `late_convert` | a conversion 1.5 s after the chord was served the paste itself; 3 s after, with the chord's time and with CurrentTime, refused; never the prior text. Each trial's paste is unconfirmed, and the next trial's paste, started once the display's window closed, was accepted |
| `unreadable` | a field with no Text interface: unconfirmed, the application received the text once |
| `caret_placed` (gedit) | a caret placed, the focus moved to a toolbar button, `type_text` naming the field: clicked, the caret put back, the text at the caret; the route expected and taken `background`, the witness clean |
| `restore_refused` (gnome-text-editor, dedicated) | the focus moved to the search bar: clicked through XTEST, GTK 4 refused the caret's restore, the text went in once; the route expected and taken `foreground`, the witness allowance held |

The unconfirmed answers are all `Paste was sent once and could not be confirmed; read the field before retrying`,
never a sentence that permits a retry.

## The family matrix (`matrix/`, run `m2-final-matrix`)

`--experiment matrix --family gedit,gnome-text-editor,firefox,chrome,gnome-terminal,xterm`, covered. gnome-terminal
is in the matrix (VTE, `Gnome-terminal`, its paste chord Ctrl+Shift+V), and cua's `type_text` runs beside the vendor
builds' in shared mode:

| family | type_text pinned / newest / cua | cua's answer |
|---|---|---|
| gedit | 0/2 / 2/2 / 2/2 | success |
| gnome-text-editor | 0/2 / 0/2 / 0/2 | `org.gnome.TextEditor does not accept background input; use a dedicated desktop or activate the window first`, nothing sent |
| Firefox | 0/2 / 2/2 / 2/2 | success (the marker's emoji: Gecko's U+FEFF rule) |
| Chrome | 2/2 / 2/2 / 2/2 | success |
| gnome-terminal | 0/2 / 0/2 / 2/2 | success, through Ctrl+Shift+V |
| xterm | 0/2 / 0/2 / 0/2 | `XTerm has no verified paste route; nothing was sent` |

Clicks and keys are as M0.4 recorded them (gnome-terminal takes both). Acceptance 5 holds on every family: cua's
witness and audit clean wherever the vendor builds' are. The run is complete.

## repl-parity, the native suite (`parity/`)

Prepared at, and run from, 426e25f2, the cua lane on the build (`--engine-bin`). The text cases are positive:
`native/app/typetext` and `native/app/paste` require a successful return, the marker exactly once and the window
alive.

| Lane | Result |
|---|---|
| vendor (`--engine vendor`) | complete, `RECORDED_VENDOR_DEFECT`: 31 covered, 2 declared vendor defects (`editable Paste did not insert text`, marker count 0, gedit alive) |
| cua (`--engine cua --engine-bin <build>`) | complete, `PASS`: 33 covered. The text cases answered `NATIVE:["undefined",1,false]` and, after the two intentional format refusals, the same for paste |
| `diff … --expected scripts/repl-parity/expected/native-linux.json` (`parity/diff.json`) | `ok: true`, 0 differences, 2 declared (`linux-text-typetext-m2`, `linux-text-paste-m2`) |

## Native baseline (`baseline/`)

Prepared at, and run from, 426e25f2; experiment `171-m2-20261030`; three runs a lane, interleaved (`cv/run-n`, then
`cc/run-n`), the default plan, the cua lane on the build (`--engine-bin`). The research fixture's gedit on
`scratch.txt` was ended first.

`compare --engines cv cc` (`baseline/engines.md`): **VERDICT: PASS**. The engine is the only attested difference, and
the typeText and paste method cases are judged as positive: every cua sample must return, survive and read its text
back.

| Operation (engine-answered) | vendor median, ms | cua median, ms |
|---|---|---|
| warm.getAXState | 519.4 | 96.4 |
| warm.getScreenshot | 638.0 | 116.5 |
| bind.getApp | 764.3 | 156.2 |
| task.total (pressKey task) | 18889.2 | 9554.0 |
| warm.getState / warm.listApps | 24.0 / 23.4 | 16.6 / 15.9 |
| method.typeText | 10236.0, every sample `editable Paste did not insert text` | 169.4, every sample returned, gedit alive, the text read back |
| method.paste | 10241.2, the same failure | 163.8, the same success |

No cua median is above the vendor's on an operation the engine answers. Four operations no engine answers
(`cold.miss.tools_list`, the binder's paste-format and scroll-by-pages refusals, `end_task`) have cua medians 0.1 to
5.2 ms above the vendor lane's, inside the tolerance rule; `engines.md` lists them.

## The Linux acceptance fixture (`accept/`)

`CUA_NATIVE_ENGINE=cua CUA_LINUX_ENGINE_BIN=<build> node scripts/accept/linux-native.mjs` on the VM's default home
(before the release, the build stands in for the pinned engine): **PASS**, 11 of 11 steps. The marker is typed with
`typeText` and read back from the accessibility tree exactly once (`accept/accept-linux-native-cua.json`). On the
released asset, without `CUA_LINUX_ENGINE_BIN`, it ran again after the release (`release/`, below).

## The release and the pinned engine (`release/`)

`linux-engine.yml` was dispatched with `publish: true` on the reviewed head 8b49b682, run
https://github.com/SSFSKIM/cua/actions/runs/41090954823. That run built, tested and attested both arches natively,
then published `linux-engine-v0.2.0`. `node scripts/linux-engine-pin.mjs linux-engine-v0.2.0` verified both
attestations and wrote `runtime/engine/linux-engine.json`:

| arch | SHA-256 |
|---|---|
| x64 | `2a0036acfb331f612ab2ce79b8a5ae902e29232f406ce1d3395ab83b1b0c543c` |
| arm64 | `b28c13a8dc3168a498cef226f96308c08d4c09979b9fc92c0d454edca65dc9f9` |

The released engine is built from 8b49b682, whose engine sources are de4802a5's, the build every run above used; only
the commit in its version line differs.

On the #171 VM (x86-64), on the pinned asset:

- **Acceptance 9, fresh home.** `CUA_HOME=<fresh> cua install --engine` installed cua's Linux engine 0.2.0
  (linux-engine-v0.2.0) at `<fresh>/engine/linux/cua-engine`.
  - `file` reports `ELF 64-bit LSB pie executable, x86-64, static-pie linked, stripped`.
  - `--version` prints `cua-engine 0.2.0 (8b49b6825ae5)`, and its SHA-256 is the pin's.
  - With `CUA_NATIVE_ENGINE=cua`, `cua doctor` passes the engine row: "sessions here run the pinned cua-engine 0.2.0
    (linux-engine-v0.2.0) … SHA-256 2a0036ac…".
- **Acceptance 1 and the Linux acceptance fixture, VM default home.** After `cua install --engine`, the fixture ran
  as `CUA_NATIVE_ENGINE=cua node scripts/accept/linux-native.mjs`, with no `CUA_LINUX_ENGINE_BIN`, under
  `release/accept-watch.mjs`. The watcher sampled the process table every 50 ms (3,369 samples). Report:
  `release/accept-linux-native-cua.json`.
  - All 11 steps passed, the marker typed with `typeText` and read back exactly once.
  - The most `sky_linux` processes seen at once was 0.
  - The one engine process was `/Users/new/.local/share/cua/engine/linux/cua-engine`, the child of the trusted
    worker (`src/repl-host/trusted-worker.mjs`).
- **Not run here:** the arm64 install, which is M5's on the arm64 VM. The release run tested the arm64 asset natively
  on GitHub's `ubuntu-24.04-arm` runner.

## Gate

`ci-gate` on the head that carries this evidence: see the pull request (the evidence commit changes no code).
