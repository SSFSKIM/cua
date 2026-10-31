# The agent cursor's attended sitting (#235, M3): the runbook

Status: **prepared, not yet run.** This is the kit for M3 of
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
  types by pasting, which would change item 7 and the timing.
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
last attempt. The sessions inherit the operator's environment: run from a Claude Code session, their default label is
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
| 1 Where the agent acts | `$S drive 1 --run "$RUN" --out "$OUT"` | places TextEdit and Chrome for Testing side by side, clicks the terminal; watches the cursor fade in at TextEdit's alignment button, glide on a curve to the page's checkbox, dip at each, each control changing before or while it arrives | each click's time and the control's value right after it (`changedWithinMs`); watches `first-target`, `second-target` |
| 2 Identity | `$S drive 2 --run "$RUN" --out "$OUT" [--other-session <another Claude Code session's id>]` | watches two cursors in two colours, a's pill this session's sminos name, b's the other session's sminos name (or, without `--other-session`, the folder name `cua-235`); then c's pill "Research" in blue | `two-cursors`, `maws-label` |
| 3 States and timing | `$S drive 3 --run "$RUN" --out "$OUT"` | watches the rock, the fade at 5 s (about 0.44 s), the fade back in at the target; on the cue clicks once in TextEdit's text, watches the half-transparent cursor, its return at the agent's next action, and end_task's immediate fade | `thinking`, `fade`, `fade-in`, `taken-over`, `taken-over-cleared`, `end-task` |
| 4 Covered and front | `$S drive 4 --run "$RUN" --out "$OUT"` | drags Chrome over TextEdit's right half; watches the cursor go under Chrome; with TextEdit in front, the cursor above its open Format menu (Escape on the cue); with TextEdit behind, the cursor above the menu the agent opened, then, on the cue, clicks Chrome's window to close it and watches the cursor drop under Chrome within about 0.25 s | `covered`, `front-menu`, `background-menu`, `menu-closed` |
| 6 Attached between actions | `$S drive 6 --run "$RUN" --out "$OUT"` | on cues: clicks Chrome (the cursor drops below it at once), switches to the second Space and back, minimises TextEdit (hidden within about 0.25 s) and brings it back from the Dock, locks and unlocks the screen, presses Escape on the Help menu, puts TextEdit into full screen and out | `switch-app`, `space-away`, `space-back`, `minimise`, `lock`, `after-lock`, `menu-bar-row`, `full-screen` |
| 5 Never in the way | `$S drive 5 --run "$RUN" --out "$OUT"` | says go, then on the cue clicks the arrow's tip where it rests on the fixture's button; watches it turn half-transparent; then sees the cursor on screen while the agent's screenshot is taken | the fixture's count before and after (+2: the agent's press and the owner's), the next action's refusal sentence (the intervention ledger saw the click on the fixture's pid), the activation watcher's lines (`activations.jsonl`: none for the engine), the agent's screenshot (`item-5-step-*.png`/`.jpg`, which must show no cursor), `taken-over`, `screenshot` |
| 7 Typing keeps it alive | `$S drive 7 --run "$RUN" --out "$OUT"` | watches the cursor stay visible through a type_text of about 7 s, return at its last point on a press_key after fading; on the cue clicks in TextEdit and watches the next press_key clear the half-transparent state | the typing rate and the long type_text's time; `long-typing`, `key-after-fade`, `taken-over`, `key-clears` |
| 9 Reduce Motion | `$S drive 9 --run "$RUN" --out "$OUT"` | turns Reduce motion on, watches the moves (short straight eases, no squash, tilt, swell or rock; an opacity dip), turns it off | `reduce-motion` |
| 11 The motion matches the vendor's | `$S drive 11 --engine vendor --run "$RUN" --out "$OUT"`, then `$S drive 11 --engine cua --run "$RUN" --out "$OUT"` | watches the same eight moves, the vendor's cursor then cua's, and judges the feel (and the halo's look) | `motion-vendor`, `motion-cua`, with the owner's words in the note; the unit part of 11 is M1's (`swift test`, `CursorMotionTests`) |
| 10 Off switches | `$S drive 10 --run "$RUN" --out "$OUT"` | watches: no cursor with `"cursor": false`; then only one of two sessions showing one | engine.json's switch written and put back byte for byte (`engine.json.before` while it runs); `cua engine status` reading `cursor: off (engine.json)`, then `cursor: on`; `device-off`, `session-off` |
| 8 Remote devices | `$S remote run --kit "$KIT" --run "$RUN" --out "$OUT"` | watches two cursors, "Loop A" in green and "loop-bravo" in its own colour, and a third session's click land with no cursor | `$KIT/relay.log`, `$KIT/agent.log` (outside the evidence); `remote-cursors` |
| 13 Click speed | `$S timing clicks --run "$RUN" --out "$OUT"` | for the first minute watches the cursor's start on the fixture's button presses (route 3: it may lag the click by up to 100 ms), then leaves the Mac untouched | 20 samples a side of coordinate clicks, element clicks (with each one's route) and drags; `timing.md`; `route-3-lag` |
| 12 Typing speed | `$S timing typing --run "$RUN" --out "$OUT"` | leaves the Mac untouched (about 5 minutes) | 20 samples a side of a 200-character type_text and of 30 press_key calls; `timing.md` |

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
