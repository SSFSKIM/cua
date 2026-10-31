# The agent cursor's attended sitting (#235, M3): the runbook

Status: **first sitting run 2026-10-30 (items 1–11 done, verdicts in `sitting/`; 12–13 failed); the second sitting is prepared: the owner about 25 minutes (items 3, 1 recorded, 5), then the timing unattended** (below). This is the kit for M3 of
`docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md`: Acceptance 1–13 on the owner's MacBook, with the
branch's engine built and approved, `CUA_NATIVE_ENGINE=cua`, #117's harness scenes, the owner watching and a screen
recording running. When it has run, this file gets its outcome at the top and the sitting's records land in
`sitting/` beside it.

Two people run it. The **operator** (a Claude Code session or a person at a terminal on the MacBook) runs every command
below. The **owner** sits at the MacBook, answers the macOS prompts, does the few physical inputs the items need,
watches, and gives each verdict. Nothing here runs on the Mac mini.

## Length, and what only the owner does

**About an hour at the Mac (50–65 minutes)**, of which about 25 minutes need the owner's hands or eyes:

| part | minutes | the owner |
|---|---|---|
| Set up at the Mac (the list below), start the recording | 3 | does it |
| Build and approve the branch's engine | 6–10 | the key prompt and three grants |
| Bring the scenes up, run items 1–7, 9–11, 8 with verdicts | 28–33 | watches, acts on cues, gives verdicts |
| Items 12 and 13, the timing | 11 | watches the first minute of 13, then leaves the Mac untouched |
| Put the saved engine back, or keep this one | 2–5 | decides; re-grants only if the grants did not survive |

What only the owner does, all of it at the MacBook's console:
1. Answer codesign's prompt for the signing key during the build (the login keychain's "Allow" / "Always Allow"; it may
   ask for the login password).
2. Grant **cua Engine** Accessibility, Screen & System Audio Recording and Input Monitoring in System Settings during
   `cua engine approve`, and any screen-capture confirmation macOS shows; again after the restore only if the restored
   build's grants did not survive.
3. Start and stop the QuickTime screen recording.
4. Arrange windows when asked (items 1 and 4).
5. The physical inputs the items cue: clicks in TextEdit (3, 7), the click on the arrow's tip (5), closing menus with
   Escape or a click (4, 6), switching apps and Spaces, minimising and restoring, locking the screen and unlocking it
   with the login password, entering and leaving full screen (6), Reduce Motion on and off (9).
6. Watch each item and give its verdicts, judge the vendor-versus-cua feel (11) and the halo's look.
7. Decide at the end whether to keep this branch's engine or have the saved one put back.

## Before you sit down (the owner)

**What macOS will ask you.** Every prompt the sitting can raise, and when:
- `cua engine build`: codesign signs the bundle with your Apple Development identity and macOS asks to let it use the
  key in your login keychain.
- `cua engine approve`: Accessibility, Screen & System Audio Recording and Input Monitoring for **cua Engine**. When
  macOS shows no prompt, approve prints the by-hand steps (System Settings, Privacy & Security, the `+` button, the
  bundle at `~/Library/Application Support/cua/engine/cua Engine.app`); then it relaunches the engine to take the
  grants, and may raise a screen-capture confirmation, which you answer. Input Monitoring is what lets the engine see
  your clicks (items 3, 5 and 7's half-transparent state).
- QuickTime Player's own Screen Recording permission, if you have not recorded the screen with it before.
- Item 11's vendor run uses OpenAI's computer-use helper (Codex Computer Use) with the grants it already has from your
  own sessions; if those have lapsed, macOS asks for them again.
- Unlocking the screen in item 6 asks for your login password, typed by you.
- Nothing else is expected. The harness answers cua's own "Allow Computer Use to use …?" approvals itself, for its
  scene apps only and for the session only; Chrome for Testing runs with a mock keychain, so it asks for no keychain
  access; the activation watcher is the approved engine's own bundle, which needs no grant of its own. If any other
  prompt appears (a firewall question for node, say: the relay listens on 127.0.0.1 only), stop and tell the operator;
  Deny is the safe answer.

**What the sitting opens and drives.** Only these apps, and only the windows the harness creates:
- **TextEdit**, launched by the harness on its own rich-text document under the run directory, in English; the harness
  quits it when the scenes come down. Your own TextEdit documents are never opened.
- **Chrome for Testing** (the harness's copy, version 155, with its own fresh profile under the run directory, on a
  loopback page the harness serves). It stands in for Safari in item 1: your Safari and your Chrome are never touched.
- **cua Electron Fixture**, the harness's own app with a button that counts its presses.
- **QuickTime Player** (you start the recording), **System Settings** (you grant and toggle), **Mission Control /
  Spaces** and the **Dock** (you, in item 6).
- The vendor's **Codex Computer Use** helper in item 11, as your own sessions start it.
- A loopback relay and a second cua agent for item 8, both from this checkout, in a scratch directory; your own cua
  agent, enrolment, devices and secrets are untouched.

**What to close or set first.**
- Quit **TextEdit** (save anything open in it): the harness refuses to start while a TextEdit it did not launch runs.
  No Chrome for Testing or Electron fixture window should be open either.
- Make sure a **second desktop Space** exists (Mission Control, `+`), and that Control-Left and Control-Right switch
  Spaces (System Settings, Keyboard, Keyboard Shortcuts, Mission Control).
- **Reduce motion** and **Increase contrast** off (System Settings, Accessibility, Display); item 9 turns Reduce motion
  on and off again.
- The keyboard's input source on a Latin layout (ABC or U.S.) for the whole sitting: on another source cua's engine
  types by pasting, which would change item 7, and press_key goes through the input method's composition, which would
  change the timing. `timing` checks it with TextEdit in front and refuses a judged series under any other source.
- Work on the MacBook's built-in display (item 6's menu-bar check is about its camera housing); keep the Mac on power.
- **Do Not Disturb** on, so no notification lands in the recording or on a window being timed.
- No session of yours on cua's engine (yours use the vendor engine unless you set `CUA_NATIVE_ENGINE=cua`): the
  sitting stops and relaunches the engine.

## Paths

```sh
REPO=/Users/new/Developer/GitHub/cua-235        # the worktree on feat/235-macos-cursor
DATE=2026-10-30                                 # the sitting's date
SIT="$HOME/.local/share/cua-235/sitting-$DATE"  # outside /tmp (macOS sweeps it)
RUN="$SIT/run"                                  # the harness scenes' run directory: their documents and profiles
KIT="$SIT/remote-kit"                           # item 8's loopback device: scratch homes, enrolment, credential
SAVED="$HOME/.local/share/cua-235/engine-before-$DATE"   # the saved engine (M3)
ASIDE="$HOME/.local/share/cua-235/engine-sitting-$DATE"  # where the restore moves this sitting's engine
OUT="$REPO/docs/evidence/2026-10-30-macos-agent-cursor/sitting"   # the records, committed afterwards
cd "$REPO"; S="node scripts/cursor-sitting.mjs"; SC="node scripts/repl-parity/scenes-mac.mjs"
```

## Before the owner sits down (the operator, unattended)

None of this needs the owner, draws on the screen or touches the engine.

```sh
npm ci && (cd relay && npm ci)          # ws, for the agent's relay link and the relay
$SC place-chrome && $SC build-electron  # the scenes' Chrome for Testing and Electron fixture (cached; a no-op when current)
$S prepare                              # compiles the target guard's window probe once (swiftc; reads no window, draws nothing)
$S remote prepare --kit "$KIT"          # prints what the kit still needs, then:
CUA_HOME="$KIT/device-home" node bin/cua.mjs install    # the device home's runtime (about 690 MB unless --archive <zip>)
$S remote prepare --kit "$KIT"          # "the kit is ready to enrol"
$S remote enroll --kit "$KIT"           # a device in the kit's own home, on a loopback relay port 7835
for i in 1 2 3 4 5 6 7 9 10; do $S drive $i --out "$OUT" --dry-run --quiet; done   # each item's steps, nothing sent
$S drive 11 --engine vendor --out "$OUT" --dry-run; $S timing typing --out "$OUT" --dry-run
```

**Save the MacBook's engine (M3).** Reads the engine and copies it; stops nothing.

```sh
node bin/cua.mjs engine status                              # recorded: build, approved, the grants, cursor
cp ~/.config/cua/engine.json "$SIT/engine.json.before" 2>/dev/null || echo "no engine.json"
$S save --home "$HOME" --to "$SAVED"
# expected: {"ok": true, "files": <n>, ...}; $SAVED holds engine/ (the bundle, approved.json, pending.json,
# usage.json, previous/), engine.json when there is one, and saved.json (the status and the tree's manifest)
```

`save` refuses a destination that exists and checks its copy against the tree; if the engine wrote while it copied, it
says so: run it again to a new directory with the engine stopped.

## The sitting

Every `drive` and `timing` command records into `$OUT/item-<n>.jsonl`. Cues to the owner are spoken (`say`) and
printed; when a step prints `waiting: once the owner is done, touch …/go`, the operator runs `touch "$OUT/go"` as soon
as the owner says done. After each item the operator asks the owner each of the item's `WATCH` lines and records the
answer: `$S verdict <item> <watch id> pass|fail [note] --out "$OUT"`. An item can be run again; the summary reads its
last attempt. Before every cell that acts on a scene, the runner checks from outside the engine that the scene is
still the run's own (its recorded launch, and its run window the app's front on-screen window; for keys, that window
on top of the frontmost app): if another window has come in front, the window is minimised, or the process is not
the scene's launch, the session stops with "refused, nothing sent" and nothing more goes to it. Put the scene back
(or bring it down and up again) and run the item again. The sessions inherit the operator's environment: run from a Claude Code session, their default label is
that session's sminos name; from a plain terminal it is the folder's name, `cua-235`.

**0. Recording.** The owner starts a QuickTime screen recording of the whole screen (File, New Screen Recording) and
keeps it running to the end. The operator notes the start time.

**1. Build and approve the branch's engine** (the spec's Concrete Steps).

```sh
node bin/cua.mjs engine build --sign-wait 600000   # OWNER: the key prompt
node bin/cua.mjs engine approve                    # OWNER: the three grants, any capture confirmation
node bin/cua.mjs engine status
# expected: approved: yes; running: … accessibility true, screen recording true, input monitoring true; cursor: on
```

**2. The scenes.**

```sh
$SC preflight --run "$RUN"                   # expected: no refusals (TextEdit not running, no stray fixture)
$SC up textedit --run "$RUN" && $SC up chrome --run "$RUN" && $SC up electron --run "$RUN"
```

**3. The items**, in this order (6 reuses 4's window arrangement; 10 relaunches the engine; the timing comes last, so
nothing after it disturbs the Mac).

| item | the operator runs | the owner | recorded |
|---|---|---|---|
| 1 Where the agent acts | `$S drive 1 --run "$RUN" --out "$OUT" --clip <new .mov outside the repository>` | places TextEdit and Chrome for Testing side by side, touching, top and bottom edges level, clicks the terminal; watches the cursor fade in at TextEdit's alignment button, glide on a curve to the page's checkbox, dip at each, each control changing before or while it arrives | a `screencapture -v -R` clip of the two windows' rectangle, kept outside the repository (`--clip`; the second sitting's step 3); each click's meta and its control read back after it; watches `first-target`, `second-target`, and `order-first-target`, `order-second-target` from the clip's frames (`clip order`) |
| 2 Identity | `$S drive 2 --run "$RUN" --out "$OUT" --other-session 1ea561bc-a60d-4437-a6ac-fa7cd5eda54f` (the design session's id, sminos name `cua_repl`; the spec's Decision Log, the M3 kit) | watches two cursors in two colours, a's pill this session's sminos name, b's `cua_repl`; then c's pill "Research" in blue | `two-cursors`, `maws-label` |
| 3 States and timing | `$S drive 3 --run "$RUN" --out "$OUT"` | watches the rock, the fade at 5 s (about 0.44 s), the fade back in at the target; on the cue clicks once in TextEdit's text, watches the half-transparent cursor, its return at the agent's next action, and end_task's immediate fade | `thinking`, `fade`, `fade-in`, `taken-over`, `taken-over-cleared`, `end-task` |
| 4 Covered and front | `$S drive 4 --run "$RUN" --out "$OUT"` | drags Chrome over TextEdit's right half; watches the cursor go under Chrome; with TextEdit in front, the cursor above its open Format menu (Escape on the cue); with TextEdit behind, the cursor above the menu the agent opened, then, on the cue, clicks Chrome's window to close it and watches the cursor drop under Chrome within about 0.25 s | `covered`, `front-menu`, `background-menu`, `menu-closed` |
| 6 Attached between actions | `$S drive 6 --run "$RUN" --out "$OUT"` | on cues: clicks Chrome (the cursor drops below it at once), switches to the second Space and back, minimises TextEdit (hidden within about 0.25 s) and brings it back from the Dock, locks and unlocks the screen, presses Escape on the Help menu (the operator notes, in that watch's verdict, where the Help item sat relative to the camera housing: TextEdit's menus reach no further, the kit's accepted limit), puts TextEdit into full screen and out | `switch-app`, `space-away`, `space-back`, `minimise`, `lock`, `after-lock`, `menu-bar-row`, `full-screen` |
| 5 Never in the way | `$S drive 5 --run "$RUN" --out "$OUT"` | says go, then on the cue clicks the arrow's tip where it rests on the fixture's button; watches it turn half-transparent; then sees the cursor on screen while the agent's screenshot is taken | the focus proof: the approved bundle's focus probe (the focused app, the focused window, the focused element's value hash) before and after the cursor appears, glides and rests over the fixture, with no input but the agent's, each reading taken once the fixture's accessibility is on (its own record, waited for up to 10 s), naming the run window where it is then, and required usable (trusted, the fixture's process and its run window focused, the autofocused text field's value hash read: so the fixture window must not be moved or clicked between them) and the two equal; the fixture's count before and after (+2: the agent's press and the owner's), the next action's refusal sentence (the intervention ledger saw the click on the fixture's pid), the activation watcher's lines (`activations.jsonl`: none for the engine), the agent's screenshot (`item-5-step-*.png`/`.jpg`, which must show no cursor), `taken-over`, `screenshot`, `recording` (from item 1's clip) |
| 7 Typing keeps it alive | `$S drive 7 --run "$RUN" --out "$OUT"` | watches the cursor stay visible through a type_text of about 7 s, return at its last point on a press_key after fading; on the cue clicks in TextEdit and watches the next press_key clear the half-transparent state | the typing rate and the long type_text's time; `long-typing`, `key-after-fade`, `taken-over`, `key-clears` |
| 9 Reduce Motion | `$S drive 9 --run "$RUN" --out "$OUT"` | turns Reduce motion on (the harness then brings TextEdit in front of System Settings), watches the moves (short straight eases, no squash, tilt, swell or rock; an opacity dip), turns it off | `reduce-motion` |
| 11 The motion matches the vendor's | `$S drive 11 --engine vendor --run "$RUN" --out "$OUT"`, then `$S drive 11 --engine cua --run "$RUN" --out "$OUT"` | watches the same eight moves in TextEdit, brought to the front first, the vendor's cursor then cua's, and judges the feel (and the halo's look) | `motion-vendor`, `motion-cua`, with the owner's words in the note; the unit part of 11 is M1's (`swift test`, `CursorMotionTests`) |
| 10 Off switches | `$S drive 10 --run "$RUN" --out "$OUT"` | watches: no cursor with `"cursor": false`; then only one of two sessions showing one | engine.json's switch written and put back byte for byte (`engine.json.before` while it runs); `cua engine status` reading `cursor: off (engine.json)`, then `cursor: on`; `device-off`, `session-off` |
| 8 Remote devices | `$S remote run --kit "$KIT" --run "$RUN" --out "$OUT"` | watches two cursors, "Loop A" in green and "loop-bravo" in its own colour, and a third session's click land with no cursor | `$KIT/relay.log`, `$KIT/agent.log` (outside the evidence); `remote-cursors` |
| 13 Click speed | `$S timing clicks --run "$RUN" --out "$OUT"` | for the first minute watches the cursor's start on the fixture's button presses (route 3: it may lag the click by up to 100 ms), then leaves the Mac untouched | 20 samples a side of coordinate clicks, element clicks (with each one's route) and drags; `timing.md`; `route-3-lag` |
| 12 Typing speed | `$S timing typing --run "$RUN" --out "$OUT"` | leaves the Mac untouched (about 5 minutes) | 20 samples a side of a 200-character type_text and of 30 press_key calls; `timing.md` |
| 12 under the owner's source | after 12, the owner switches to their own source (2-Set Korean): `$S timing typing --owner-source --run "$RUN" --out "$OUT"`, then back to the Latin layout | leaves the Mac untouched | the same series, recorded with the source's reading in `item-12-owner-source.jsonl`, never judged (`timing-recorded.md`) |

Every timing series first reads the input source through the approved bundle's probe (`--probe input-source current`)
with TextEdit in front, and refuses before any session opens unless it is a plain, ASCII-capable keyboard layout whose
keys are translated with that same layout; the reading is kept in the series' first rows and in `timing.md`.

**The cursor's arms** (only if 12 or 13 fails with the defaults, or the design session asks): each arm takes one part of
what a visible cursor costs the window server away, through engine.json's `cursorDebug`, which the engine reads at
launch and strictly (`panelOut`: the panel never ordered in, every commit still made; `noBackdrop`: the halo's blur
hidden, its tint left; `noRock`: no rock; `legacyLayers`: the sitting's first build's layers, the arrow's blur filter
always installed and its shadow found from its alpha). `$S timing typing|clicks --arm <arm> --run "$RUN" --out "$OUT"`
writes the key (engine.json kept in `engine.json.before` meanwhile), stops the engine so the sessions relaunch it,
checks `cua engine status --json`'s `status.cursorDebug`, runs the series, then puts engine.json back and stops the
engine again; a failure on the way does the same. Each arm records in `item-<n>-<arm>.jsonl` and `timing-recorded.md`,
never judged; on against an arm, and an arm against off, go to the design session. For the finer split, every timing
series keeps the engine's timing signposts over its run in `$OUT/signposts-<item>.ndjson` (`log show --signpost`, read
when the series ends; `log stream` does not carry signposts): the request by method, `cursor.begin`/`end`/`commit`,
`cursor.apply` with `cursor.place`, `cursor.install`, `cursor.transition` and `cursor.caCommit`, `cursor.windowList`,
`main.sync.wait`/`run`, `route3.hold`, `route3.release`, `route3.guard.frontmost`/`windowOrder`, and
`pressKey.keyboardTarget`/`minimizedCheck`/`post`.

The timing commands judge as they finish, by #171's noise rule (`scripts/cursor-sitting/stats.mjs`, reusing
`scripts/linux-engine-diff/`'s bootstrap and bound): the bootstrap 95 % interval of median(on) − median(off) must
include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians. An
"undetermined" series is run again with `--samples 40`, never judged on fewer. A failure goes to the design session
before any change (the spec's Decision Log, M1 step 1).

**4. Down, and the summary.**

```sh
$SC down all --run "$RUN"            # quits the harness's TextEdit, Chrome for Testing and fixture; removes their files
$S judge --out "$OUT"; $S summary --out "$OUT"    # timing.md and summary.md: every watch with its verdict, or none
```

The owner stops the recording. The recording stays outside the repository
(`~/.local/share/cua-235/recordings/<DATE>.mov`, with its SHA-256 in this file's outcome); clips of items 1, 3, 5 and 11
are exported at 720p (QuickTime, File, Export As) and committed under `sitting/clips/` when each is under 25 MB.

## The second sitting: the owner about 25 minutes, then about 35–55 minutes unattended

The first sitting passed items 1–11 except two clauses, and failed 12 and 13 (the execution record's sitting section,
`docs/doperpowers/specs/2026-10-30-macos-agent-cursor-report.md`). The spec's Decision Log (2026-10-31, the second
sitting's scope) sets what this sitting runs, on the build the timing fixes produced (build id `b23a6e7a18c6`: head
caf2f462 or later with no engine change; the kit's own changes are not in the build):
- item 3 again, since thinking now starts 0.3 s after the last request, and a look check;
- item 1, recorded: its "the control changes before or while the cursor arrives" was the owner's watch only, and the
  order is now read from a `screencapture -v -R` clip of the two harness windows;
- item 5, the owner's click: its focus proof was unmet (both first readings ran before the fixture's accessibility was
  on, and run 2 named a window that had moved), which the kit now waits for and re-reads; item 1's clip answers its
  "appears in a screen recording";
- the timing, unattended: 13, 12 and the `legacyLayers` arm, then the owner's Korean series;
- keep or restore, asked afterwards.

Every step that needs the owner comes first. After item 5 the owner may leave the Mac, unlocked and untouched;
whether they do is their call. The kit switches the input source itself, with the owner's yes, so nobody has to be at
the Mac for the rest. The sitting records into a directory of its own, so the first sitting's records stay as they
were. The paths above hold, plus:

```sh
OUT2="$REPO/docs/evidence/2026-10-30-macos-agent-cursor/sitting-2026-10-31"; mkdir -p "$OUT2"
REC="$HOME/.local/share/cua-235/recordings"; mkdir -p "$REC"   # item 1's clip and its frames: never in the repository
```

| part | minutes | the owner |
|---|---|---|
| **With the owner** | **about 25 (22–28)** | |
| 1. Install and approve; the input-source question | 9–13 | the key prompt, the three grants, a yes or no |
| 2. Item 3 and the look | 4 | watches, verdicts, 30 s of looking |
| 3. The recorder's proof, then item 1, recorded | 4–6 | places the two windows (again if the kit refuses), watches |
| 4. Item 5 | 5 | says go, clicks the arrow's tip on the cue, watches |
| (the fallback, if neither of item 1's clicks went by route 3: item 13's first minute) | 1–2 | watches the cursor's start on route 3 |
| **Unattended** (the owner may leave) | **about 35 (34–55)** | nobody touches the Mac |
| 5. Item 13: coordinate click and drag at 40, element click at 20 | 10 (+10 if element click reruns at 40) | |
| 6. Item 12: type_text and press_key at 20 | 6 (+10 if one reruns at 40) | |
| 7. The `legacyLayers` arm, clicks and typing, 20 each | 12 | |
| 8. The owner's Korean series, 20 | 6 | |
| 9. The source back, the scenes down, the verdicts | 1 | |
| **Afterwards** (no one at the Mac) | | |
| 10. Item 1's order from the clip (the operator) | 15–25 | |
| 11. Keep or restore: a question to the owner, asked asynchronously | | answers when they can |

The times per sample come from the first sitting's records (`sitting/item-13.jsonl`, `item-12.jsonl`), per side:
- a clicks sample: the prime 0.47 s, the coordinate click 0.07 s, the element click 0.45 s (its observation and the
  click), the drag 0.07 s, then the 6 s gap, so 7.1 s (6.6 s without the element click);
- a typing sample: one cell of 1.7 s (the prime, two clicks, the type_text and 30 press_keys), then the 6 s gap, so
  7.7 s.

**Before it** (the operator, unattended): bring the scenes up as in "The scenes", re-placing nothing yet; dry-run the
items into `$OUT2` (`$S drive 1-check --out "$OUT2" --dry-run`, likewise 1, 3 and 5, `$S timing clicks --out "$OUT2"
--dry-run`, `$S timing typing --out "$OUT2" --dry-run`); check that `ffmpeg -version` and `ffprobe -version` answer
(`brew install ffmpeg` if not), for the recorder's proof and the analysis.

### With the owner

1. **Install and approve, and the input-source question.**
   - `CUA_SIGNING_IDENTITY=1AAFD20666E9358859B39E8F447572FBE39F52B0 node bin/cua.mjs engine build --sign-wait 600000`,
     then `node bin/cua.mjs engine approve`. The owner answers the key prompt and grants the three permissions.
     `node bin/cua.mjs engine status` must show build `b23a6e7a18c6`, approved, all three grants, `cursor: on` and
     `cursorDebug` null. The saved engine stays at `$SAVED` as before.
   - Ask the owner, while they are on their usual source (2-Set Korean): "May the kit switch your keyboard's input
     source by itself: to ABC for the judged timing, back to your own source for the series recorded under it, and
     back to it at the end?" Record the answer: `$S source consent yes --out "$OUT2"` (or `no`). The kit keeps the
     source they are on at that moment as theirs (`$OUT2/input-source.json`).
   - With a yes, each timing series selects its source itself, with TextEdit in front, and reads it back: ABC
     (`com.apple.keylayout.ABC`) for 13, 12 and the arm, the owner's own for the Korean series. TextEdit must come to
     the front first, or the series stops. The selection goes only while the harness's own TextEdit launch has its
     run window on top of the frontmost app: with per-document input sources it changes the source of whatever window
     has the keys. If the source read back is not the one selected (ABC not enabled, say), the series stops before any
     session opens. A series that fails at any point after a selection was attempted (by a thrown failure or a cell
     that answered failed) puts the owner's source back itself, onto the scene's own window only, recorded as its last
     row (`source-restored-after-failure`). If that window is no longer on top, it selects nothing (that would change
     another window's source), records `source-left-after-failure`, and prints a `!!!` line. The operator then runs
     `$S source restore --out "$OUT2"` once the scene is back on top, or after `$SC down all`. The series' own
     check (a Latin layout for a judged series) runs after the selection, as before. With a no, nothing is switched:
     the owner stays to switch by hand before 5 and again before 8, and this sitting is not hands-off.
2. **Item 3, states and timing, and a look check.** `$S drive 3 --run "$RUN" --out "$OUT2"`, with the same watches as
   before. The rock now begins a moment after the cursor settles (0.3 s with no request in flight). Then the owner
   looks at the cursor for about 30 s, resting and rocking, against what they approved:
   `$S verdict 3 look pass|fail "<the owner's words>" --out "$OUT2"`.
3. **The recorder's proof, then item 1, recorded.**
   - **The proof first** (about a minute, nothing driven): `$S drive 1-check --run "$RUN" --out "$OUT2" --clip
     "$REC/check-2026-10-31.mov"`. The owner places the windows as item 1 needs (below). The kit records their
     rectangle for 3 s and stops the recorder the way item 1 will. Then the operator checks, in this order:
     - the `record-stop` row in `$OUT2/item-1-check.jsonl` is `ok` with `bytes` and `sha256`: the stop wrote a movie;
     - `ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,width,height -of csv=p=0
       "$REC/check-2026-10-31.mov"` gives a frame count above 0 and a width twice the region's (`record-start`'s
       `region.width`, at the built-in display's 2 px per pt);
     - its first and last frames hold only the two harness windows. Extract them with `ffmpeg -v error -i
       "$REC/check-2026-10-31.mov" -vf "select='eq(n,0)'" -frames:v 1 "$REC/check-first.jpg"` (the last frame likewise,
       with `n` = the count − 1), and open them as images.

     Then delete the clip and both frames. If any check fails, item 1's clip cannot be had this sitting. Tell the
     design session, skip item 1, and go on with item 5.
   - **Item 1.** `$S drive 1 --run "$RUN" --out "$OUT2" --clip "$REC/item-1-2026-10-31.mov"`. The windows are already
     placed, so the owner only says done again.
   - **Then decide how item 13's `route-3-lag` is judged:** `$S clip routes --out "$OUT2"`. Its answer comes from the
     routes item 1's two clicks recorded, which are known only once they have run.
     - If either click went by route 3, that click's lag is measured from item 1's clip after the sitting (`clip lag`,
       "Afterwards"), and the owner may leave after item 5 as planned.
     - If neither did, the fallback applies. Neither outcome can be known in advance: an element's action goes by route
       1, or by route 3 (a held activation first) when its app does not believe it has focus (`actionRoute`,
       `Input.swift`; FocusHold.swift), which is how every element click on item 13's background fixture went in the
       first sitting. Under the fallback, item 13 runs first after item 5 anyway, and the owner
       stays to watch its first minute: the cursor's start on the fixture's button presses, which go by route 3. Then the
       operator records `$S verdict 13 route-3-lag pass|fail "<the owner's words>" --out "$OUT2"`, and the owner may
       leave. That adds 1–2 minutes with the owner.
   - **The placement** (the proof's and item 1's). The owner places TextEdit and Chrome for Testing side by side, touching, with their top and bottom edges level,
     so that together they fill a rectangle with nothing else in it, then clicks the operator's terminal, whose window
     must stay off them. The kit then reads where both windows are and records exactly their rectangle. It refuses,
     before any session opens and with nothing recorded, when part of the rectangle wider than 16 pt holds neither
     window (it names that part), when one of the two is still frontmost, or when a window of the frontmost app lies
     over it. The owner moves what it names, and the operator runs the item again. A run that fails after the recorder
     started leaves its clip, so the next run is given a new name (`item-1-2026-10-31-2.mov`).
   - The recorder is `screencapture -v -x -R`, from the operator's terminal: it needs the terminal's Screen & System
     Audio Recording permission, the same grant the first sitting's region captures used. If macOS asks anyway, the
     owner allows it, and answers "Later" if it asks to quit and reopen the terminal (quitting would end the operator's
     session). It runs on a pseudo-terminal of its own (`scripts/cursor-sitting/recorder-pty.py`), because it writes
     its movie only when a character is typed at its terminal. On a pipe it ignores the character, a signal kills it
     with no movie, and `-V` takes no stop at all (checked on the MacBook, 2026-10-31). The kit types that character at
     `record-stop`, at a 300 s cap, or when the kit itself goes away, and it ends a recorder still running 20 s after any
     of those (SIGTERM, then SIGKILL), so no recorder outlives the kit. A recorder that exits at once, or does not print
     its "type any character" prompt within 5 s (it came at 0.2 s on the MacBook), refuses the item the same way.
   - The owner watches `first-target` and `second-target` as before, and the operator records the two verdicts. The
     clip stops after the session has closed; the record keeps its region, both windows' bounds, the recorder's launch
     time and the clip's SHA-256, and each click's meta (`receivedAt`, `engineMs`, the action interval).
   - **What the clip may show, and what is committed.** The owner sees their own screen throughout. The clip holds
     only the rectangle of the two harness windows, but whatever crosses that rectangle while it records (a notification,
     a window the owner moves) is in it too, so the clip itself stays in `$REC`, outside the repository (the kit refuses
     a path inside it). Nothing from the clip is committed except the frames `clip order` copies into
     `$OUT2/item-1-frames/`, each cropped to one scene window. The operator looks at every one of them before committing
     and deletes any that shows anything but the scene window and the agent's cursor.
4. **Item 5, never in the way.** First give the fixture a fresh launch, so its press count starts at 0 (the first
   sitting's started at 1): `$SC down electron --run "$RUN" && $SC up electron --run "$RUN"`. Then
   `$S drive 5 --run "$RUN" --out "$OUT2"`, with the same owner steps and watches as before. Each focus reading now
   names the fixture's window where the window list puts it at that moment, and first waits, up to 10 s, until the
   fixture's own accessibility record says Chromium's accessibility is on, priming it once with the probe's
   AXManualAccessibility when it is off. Both `focus` rows must be `ok` (the second with `same: true`), each with its
   `bounds` and its `accessibility` wait. A reading that still finds no focused app with accessibility on is a finding
   for the design session, not a kit retry. The fixture must not be moved or clicked between the two readings.

   That is the owner's last step, unless `clip routes` said the fallback applies: then it is the first minute of item 13
   (below). Tell them the Mac must stay unlocked and untouched from then until the operator says it is done (about
   35–55 minutes): any input lands in a timed series, and a locked screen stops one.

### Unattended

Keep the Mac awake for the whole block, so neither the display nor the screen saver locks it:
`nohup caffeinate -di -t 5400 >/dev/null 2>&1 & echo $! > "$SIT/caffeinate.pid"`. The kit's own guards stop a
series whose scene is gone from the front (a locked screen, say) rather than time it.

5. **Item 13, click speed.** `$S timing clicks --run "$RUN" --out "$OUT2"`. Coordinate click and drag start at 40
   samples a side, since both were undetermined at 20 on the first build. Element click starts at 20. If it is
   undetermined, rerun it alone: `$S timing clicks --series element-click --samples 40 --run "$RUN" --out "$OUT2"`.
   `judge` takes each series from the last run that asked for it (each run records its series first), so a 40-sample
   run's verdict replaces the earlier one for every series it asked for, and only those, even when it failed before
   its first sample: never keep the better of the two. The `route-3-lag` watch is either
   the owner's, during this block's first minute (the fallback, decided after item 1), or measured from item 1's clip
   afterwards.
6. **Item 12, typing speed.** `$S timing typing --run "$RUN" --out "$OUT2"` (type_text and press_key at 20). Rerun an
   undetermined one alone at 40: `--series type-text` or `--series press-key`, with `--samples 40`.
7. **The `legacyLayers` arm, recorded.** `$S timing clicks --arm legacyLayers --run "$RUN" --out "$OUT2"`, then
   `$S timing typing --arm legacyLayers --run "$RUN" --out "$OUT2"` (20 each, under ABC). The arm restores the first
   build's layers. If the old cost comes back with it, that confirms the cause rather than a pass by noise. The other
   arms run only if 5 or 6 fails, and their numbers go to the design session.
8. **The owner's source, recorded.** `$S timing typing --owner-source --run "$RUN" --out "$OUT2"`. The kit selects the
   owner's own source (the one `source consent` kept) and records its reading; its press_key series is the one
   compared.
9. **The source back, the scenes down, the verdicts.** `$S source restore --out "$OUT2"` (the owner's source, read
   back; exit 1 says it is not), `$SC down all --run "$RUN"`, `$S judge --out "$OUT2"`, `$S summary --out "$OUT2"`,
   then `kill "$(cat "$SIT/caffeinate.pid")"`.

### Afterwards

10. **Item 1's order**, below, and **item 13's `route-3-lag` from the clip** when `clip routes` named a route-3 click
    (after the order, below).
11. **Keep or restore: ask the owner asynchronously.** Send the owner the question with the timing verdicts: keep this
    branch's engine, or have the saved one put back? Act on the answer when it comes ("After the sitting: put the saved
    engine back", below). The restore needs no one at the Mac unless the grants did not survive, and then it waits for
    the owner's next time at the Mac.

**After the sitting: item 1's order** (the operator alone; ffmpeg's load must not overlap a timing series, so only
once the unattended block has ended). The order comes from the clip's own frames: for each click, the first frame where its control changes
against the first frame where the arrow's tip reaches it. The request meta is put on the same clock as support. The
procedure:

```sh
$S clip frames --out "$OUT2" --frames "$REC/item-1-2026-10-31-frames"
# per target: the frame range kept and its first and last files; frames.json lists every frame's index and time
```

`frames` keeps every frame from 3.3 s before to 1.5 s after each click, as placed by the recorder's launch time. That
covers any recorder start up to 3 s after its launch, and the longest glide. The frames are cropped to the target scene's
window (TextEdit's for the first target, Chrome's for the second) and named `<target>-f<index>.jpg` by their index in
the clip. Judge four frames by eye, opening them as images. Search by halving: open the middle frame, then the middle
of the half that holds the change, and confirm the pick against the frame before it.
- **first-target, arrival:** the first frame in which any part of the cursor shows at TextEdit's alignment button (it
  fades in there; the frame before has none). This frame also anchors the clock.
- **first-target, change:** the first frame in which the alignment buttons show the new state (the click's row says
  which button it pressed, `clicked`; the read-back row says the result).
- **second-target, change:** the first frame in which the page's checkbox shows its new state (the click's row keeps
  its value `before`; the read-back row, its value after).
- **second-target, arrival:** the first frame in which the arrow's tip is on the checkbox at the end of its glide.

```sh
$S clip order --frames "$REC/item-1-2026-10-31-frames" --out "$OUT2" \
  first-target <change> <arrival> second-target <change> <arrival>
# item-1-order.md: each target's order, first frame against first frame (before: the change in an earlier frame; while:
# the same frame; after: a later frame, which fails) and how long after the engine received the click the control
# changed and the cursor arrived; exit 1 if a control changed after the arrival
```

`order` appends the verdicts `order-first-target` and `order-second-target`, and copies the four judged frames and the
frame before each into `$OUT2/item-1-frames/`; check each for privacy as above.

The join to the request's clock assumes the cursor's first frame shows at the first click's action start
(`actionInterval.startedAt`) plus the motion plan's 20 ms lead. It is flagged when that would start the clip before the
recorder was launched, or more than 3 s after. The order itself never depends on the join.

**Item 13's `route-3-lag` from the clip** (only for a click `clip routes` named as route 3). It uses the same frames
directory. For each route-3 click, judge two frames, both read from the frames on the clip's own clock, with no join
to the request meta:
- **change:** the control's first changed frame (the same frame `clip order` took);
- **start:** the cursor's first moving frame. For the first target, whose cursor fades in at it, that is its first
  visible frame (`clip order`'s arrival). For the second target it is the first frame, among
  `second-target-start-f<index>.jpg` (the same frames cropped to TextEdit's window, where the cursor rests), in which
  the cursor has left its resting place at the alignment button.

```sh
$S clip lag --frames "$REC/item-1-2026-10-31-frames" --out "$OUT2" second-target <change> <start>
# item-1-route3-lag.md: the lag measured as start − change, and bounded by the frames' own times: each event lies
# between its frame and the one before, so (start − 1) − change < lag ≤ start − (change − 1)
```

The verdict is against Acceptance 13's 100 ms: pass when the bound's top is at most 100 ms, fail when its bottom is
over, else undetermined. The resolution is the frame interval: at 30 fps a frame every 33.3 ms, so a measured lag up
to 67 ms passes and one over 133 ms fails; at the 57–60 fps screencapture recorded in the live check (16.7 ms), up to
83 ms passes and over 117 ms fails. `lag` appends item 13's `route-3-lag` verdict every time it judges: pass, fail, or
`undetermined`, which `summary` shows as the last word, so a rejudgement that no longer decides the clause leaves it
open rather than an earlier pass standing. It copies the four frames it used into
`$OUT2/item-1-frames/`; check them for privacy as above. Route 3's screen freeze holds the control's redraw as well as
the cursor's start, so both show only once the hold ends. The lag from the frames is what the owner would have seen
on the screen, which is what the watch asks.

The same frames show the agent's cursor in a `screencapture -v` recording, which is item 5's last clause:
`$S verdict 5 recording pass "the cursor in item 1's clip: item-1-frames/second-target-arrival-f<index>.jpg" --out
"$OUT2"`. Then run `summary` again.

## Known limits

- With an approved engine built before #235, the first-call document's agent-cursor paragraph (on every macOS computer
  session on cua's engine) promises a cursor that never draws, until the engine is rebuilt: the handshake carries no
  cursor capability for the facade to check, and none is added (the design session's call).
- Item 6's camera-housing case reaches TextEdit's Help menu item only (the kit's accepted limit).

## After the sitting: put the saved engine back (M3)

Unless the owner says to keep this branch's engine:

```sh
$S restore --home "$HOME" --from "$SAVED" --aside "$ASIDE"
# expected: {"ok": true, "status": {"build": "<the saved build>", "approved": true, "matches": true}, ...}
node bin/cua.mjs engine status   # the saved build, approved: yes
diff "$SIT/engine.json.before" ~/.config/cua/engine.json && echo "engine.json as before"
```

`restore` stops the engine first (refused while a session uses it: close it and run again), checks the saved copy
against its manifest before it changes anything, moves this sitting's engine and engine.json to `$ASIDE` (kept, not
deleted), copies the saved ones back and checks them. If it ends `ok: false` with "not approved", the grants did not
survive: run `node bin/cua.mjs engine approve` with the owner. Rebuilding from `origin/main` counts as a restore only if
its build id equals the saved one (`$SAVED/saved.json`, `status.build`). Remove `$SIT` (the scenes' files, the remote
kit's enrolment and its credential) once the records are committed; `$SAVED` and `$ASIDE` stay until the PR merges.
