# #171 M2: text and clipboard (M2.3, the proof)

On the #171 VM (`dc-linux171-1e68`, the declared device `cua-171`: Ubuntu 24.04.4, x86-64, 8 vCPU, X11 on `:0`),
before M2's release: the cua engine is the local build of the branch head (`native/linux-engine/target/release/
cua-engine`, `cua-engine 0.2.0 (e0168c63871c)`), the vendor builds the pinned 26.928.40906 and the newest
26.1023.51421. The commands are the spec's Concrete Steps (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md):
the differential harness with M2's scenes, then the facade suites. The release, the pin and the checks on the released
asset come after the branch review and are not here.

What this proves (Plan of Work, M2): Acceptance 6, and Acceptance 2–5 for the text and clipboard commands, on x86-64.
gnome-text-editor's dedicated-mode case runs on the engine directly (`--desktop dedicated`); its facade-level run is
M3's (Decision Log, M2 pre-flight).

## The differential run (`diff/`, run `m2-wire`, harness and engine at e0168c63)

`node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "$BUILT" --scene
gedit,chrome,over-budget,retention,chrome-textarea,chrome-address-bar,gnome-text-editor,paste-target --ops all`
(Concrete Steps' M2 scenes, plus `paste-target`, the GTK 3 window the paste cases need). Three blocks; the stub engine
failed both the witness and the audit (the run is valid).

Every verdict passes except one: `desktop get_screenshot`, cold 36.4 ms against 33.6. That is M1a's parity listing,
unchanged: a fresh engine's first desktop capture is the vendor's own `GetImage` (the MIT-SHM segment is made after the
first answer), and M1a recorded it as **parity** under Acceptance 3's rule over three sittings (Decision Log, M1a.4;
`m1a/README.md`, item 3). M2 does not touch the capture path. Every other operation of M1a's set passes again on the M2
engine (over-budget retained ids equal to the pinned build's; the bus-call bound held on gedit, Chrome and the
over-budget page).

### The text and clipboard commands (Acceptance 2–4)

Medians in ms, cold / warm, 3 blocks (6 samples a block; `clipboard_release` 11). The bar is built from the vendor
samples that succeeded; "–" where neither build succeeded. "Applied" counts cua's samples whose text landed exactly
once where the caret or selection was (read through AT-SPI).

| scene | op | pinned | newest | cua | bar | cua applied | verdict |
|---|---|---|---|---|---|---|---|
| gedit | `type_text` | 10207.7 / 10204.3 (fails, PasteText) | 921.2 / 929.5 | 171.5 / 159.9 | 921.2 / 929.5 | 18/18 | PASS |
| gedit | `type_text`, preselected range | 10207.8 / 10204.3 (fails) | 943.6 / 939.8 | 167.2 / 160.2 | 943.6 / 939.8 | 18/18 | PASS |
| gedit | `type_text`, cua `--desktop dedicated` | – | – | 173.5 / 160.8 | – | 18/18, witness clean | PASS |
| gedit | `type_characters` `Hi 42!` | no such command | 570.7 / 568.2 | 107.2 / 101.9 | 570.7 / 568.2 | 18/18 | PASS |
| gedit | `clipboard_read` | 533.2 / 565.4 (12 of 18 fail) | 552.9 / 557.7 | 38.1 / 34.5 | 533.2 / 557.7 | 18/18 | PASS |
| gedit | `clipboard_write` | fails (see below) | 10202.7 / 10202.9 (fails, PasteText) | 169.4 / 162.1 | – | 18/18 | PASS, declared |
| gedit | `clipboard_release` | 3.0 / 0.1 | 3.2 / 0.1 | 2.6 / 0.1 | 3.0 / 0.1 | – | PASS (warm same within noise) |
| chrome-textarea | `type_text` | 1045.1 / 1010.4 | 1028.5 / 2437.6 (17 of 18 false errors) | 175.4 / 169.1 | 1028.5 / 1010.4 | 18/18 | PASS |
| chrome-address-bar | `type_text`, one line | 1125.4 / 1168.2 | 1157.8 / 1127.7 | 189.1 / 184.0 | 1125.4 / 1127.7 | 18/18, read back exactly | PASS |
| gnome-text-editor | `type_text`, cua `--desktop dedicated` | fails | fails | 73.6 / 67.8 | – | 18/18 | PASS, declared |

- **The text** of Acceptance 6, `cua171 안녕 é 🙂\nline2` with a combining acute after the e, read back exactly in gedit,
  the textarea page and gnome-text-editor; the address bar's single line `cua171 안녕 é 🙂` read back exactly.
- **The clipboard after every paste** held the harness's own prior text (cua 18/18 in every text operation that
  pastes). For `clipboard_write`, the harness's owner takes CLIPBOARD between the read and the write: cua leaves that
  owner's text (18/18), the vendor builds the snapshot (newest 0/18), the declared deviation (Decision Log, M0.1 folded).
- **Declared answers:** cua's success where no vendor build applies the text (gedit's `clipboard_write`; gnome-text-
  editor). M1a's refusals (`<command> is not available in this engine build`) are gone from `deviations.mjs`.
- **The bus trace** (Acceptance 6): a pass per text operation and engine, a fresh process under `dbus-monitor`, and
  the whole safety-case phase. cua: PasteText 0, InsertText 0, SetTextContents 0 everywhere; the pinned build calls
  PasteText in gedit's `type_text` and the newest in `clipboard_write`. (The engine's sources name none of the three.)
- **Speed:** cua is at or below the bar on every text and clipboard command, cold and warm, often five to sixty
  times faster; `clipboard_release`'s warm median (0.13 against 0.12 ms, a map removal in every engine) passes as
  "same within noise" under Acceptance 3's rule, interval [0, 0.02] over 30 samples a side.
- **Vendor findings, recorded, not the bar:** the pinned build's `clipboard_read` failed 12 of 18 (`editable element
  has no selected text to Copy` in its own window from the second block on), so its `clipboard_write` samples got a
  handle it never issued (`prepare_error` in `results.jsonl`); the newest build answered 17 of 18 Chrome textarea
  pastes with a false error after a correct edit (the regression Acceptance 6's address-bar case covers; this sitting's
  address-bar pastes were all answered success).

### The witness, keyed to the route (Acceptance 5; Decision Log, M2.2)

cua reports the route of every text request on its `--stats` line. In shared mode every cua text request took the
background route, and the witness and the X request audit were clean on every one. The two dedicated-mode cases:

- **gedit, `--desktop dedicated`** (`type_text_dedicated`): the route stayed `background` (gedit takes it), and the
  witness, which allows nothing on that route, stayed clean on 18/18.
- **gnome-text-editor, `--desktop dedicated`** (`type_text`): the route was `foreground` on 18/18. The witness allowed
  exactly the target's activation (the active window and the input focus going into it, the stacking order changed
  only by its raise), nothing changed in the 300 ms after each request, and no grab was left. The audit is not
  required on the foreground route, whose activation and XTEST input are the route itself.

### The paste safety cases (Acceptance 6; `diff/summary.md`, "Paste safety cases")

cua alone, after the blocks, each on windows of its own. Every case passed:

| case | what it showed |
|---|---|
| `focus_change` (3 trials) | the prior owner held the engine's snapshot `TARGETS` while the harness moved the focus to the page's other field: `requested field or selection changed before dispatch; nothing was sent`, neither field changed, the prior text kept |
| `focus_change_takeover` (retake 0, 20, 50 ms) | the same, and the prior owner took CLIPBOARD back as soon as the engine owned it: nothing sent, the new owner's text intact |
| `silent_owner` | the prior owner never answered: `clipboard capture timed out: … within 500 ms; nothing was sent` (640 ms), and the next paste went in, so both locks were released |
| `concurrent` (3 trials) | two engines pasted distinct markers at once: each once in its own window, nothing crossed, the prior text kept |
| `contention` | two engines, 20 pastes each with random gaps of 0–30 ms: every paste succeeded, each field holds exactly its own markers in order, the prior text kept (median 185 ms, max 262) |
| `late_page` | the page inserts 3 s after its paste event: unconfirmed at 2.2 s, then the text once at the caret, the next request at once |
| `ignored_page` | unconfirmed at 2.2 s, the field unchanged, the next request at once |
| `stalled_incr` | 100 KB, the INCR transfer never acknowledged: unconfirmed at 2.1 s (the engine saw the stall), the next request at once |
| `late_convert` | a conversion 1.5 s after the chord was served the paste itself; 3 s after, with the chord's time and with CurrentTime, refused; never the prior text |
| `unreadable` | a field with no Text interface: unconfirmed, the application received the text once |
| `caret_placed` (gedit) | a caret placed, the focus moved to a toolbar button, `type_text` naming the field: clicked, the caret put back, the text at the caret |
| `restore_refused` (gnome-text-editor, dedicated) | the focus moved to the search bar: clicked through XTEST, GTK 4 refused the caret's restore, the text went in once; the foreground route's witness allowance held |

The unconfirmed answers are all `Paste was sent once and could not be confirmed; read the field before retrying`,
never a sentence that permits a retry.

## The family matrix (`matrix/`, run `m2-matrix`)

`--experiment matrix --family gedit,gnome-text-editor,firefox,chrome,gnome-terminal,xterm`, covered. gnome-terminal
joins the matrix (VTE, `Gnome-terminal`, its paste chord Ctrl+Shift+V), and cua's `type_text` runs beside the vendor
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
witness and audit clean wherever the vendor builds' are.

## repl-parity, the native suite (`parity/`)

Prepared at, and run from, e0168c63. The text cases are positive now (M1b's temporary candidate expectations are
removed): `native/app/typetext` and `native/app/paste` require a successful return, the marker exactly once and the
window alive.

| Lane | Result |
|---|---|
| vendor (`--engine vendor`) | complete, `RECORDED_VENDOR_DEFECT`: 31 covered, 2 declared vendor defects (`editable Paste did not insert text`, marker count 0, gedit alive) |
| cua (`--engine cua --engine-bin <build>`) | complete, `PASS`: 33 covered. The text cases answered `NATIVE:["undefined",1,false]` and, after the two intentional format refusals, the same for paste |
| `diff … --expected scripts/repl-parity/expected/native-linux.json` (`parity/diff.json`) | `ok: true`, 0 differences, 2 declared (`linux-text-typetext-m2`, `linux-text-paste-m2`) |

## Native baseline (`baseline/`)

Prepared at, and run from, e0168c63; experiment `171-m2-20261030`; three runs a lane, interleaved (`cv/run-n`, then
`cc/run-n`), the default plan. The research fixture's gedit on `scratch.txt` was ended first.

`compare --engines cv cc` (`baseline/engines.md`): **VERDICT: PASS**. The engine is the only attested difference, and
the typeText and paste method cases are judged as positive: M1b's temporary outcome (until M2) is gone, and every cua
sample must return, survive and read its text back.

| Operation (engine-answered) | vendor median, ms | cua median, ms |
|---|---|---|
| warm.getAXState | 538.2 | 97.5 |
| warm.getScreenshot | 634.8 | 118.4 |
| bind.getApp | 627.8 | 152.2 |
| task.total (pressKey task) | 18975.3 | 9545.3 |
| warm.getState / warm.listApps | 22.8 / 20.9 | 18.2 / 18.2 |
| method.typeText | 10242.6, every sample `editable Paste did not insert text` | 160.3, every sample returned, gedit alive, the text read back |
| method.paste | 10244.9, the same failure | 164.0, the same success |

No cua median is above the vendor's on an operation the engine answers. Eight operations no engine answers (the
cold-connection phases, `warm.noop`, the binder's paste-format, selectText and scroll-by-pages refusals) have cua
medians 0.2 to 25 ms above the vendor lane's, inside the tolerance rule; `engines.md` lists them.

## The Linux acceptance fixture (`accept/`)

`CUA_NATIVE_ENGINE=cua CUA_LINUX_ENGINE_BIN=<build> node scripts/accept/linux-native.mjs` on the VM's default home
(before the release, the build stands in for the pinned engine): **PASS**, 11 of 11 steps. The marker is typed with
`typeText` now and read back from the accessibility tree exactly once (`accept/accept-linux-native-cua.json`). On the
released asset, without `CUA_LINUX_ENGINE_BIN`, it runs again after the release.

## Gate

`ci-gate` on the head that carries this evidence: see the pull request (the evidence commit changes no code).
