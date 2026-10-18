# Acceptance tooling (#157), 2026-10-18

The fixes for the harness defects #115's live runs on the Mac mini surfaced: the four items in #157's body and those its
two comments added. The branch is `fix/157-acceptance-tooling`. Every live run on the mini went through the gate in
`scripts/mini-rules.mjs` (sitting log in `mini-rules/sitting-log.txt`). The one GUI run, the TextEdit witness, ran inside
a CI-opt hold the dispatching session arranged (18:17:43Z to 18:37:43Z).

## What changed, item by item

| # | Defect | Fix | Proof |
|---|---|---|---|
| 1 | accept-native left its fixture TextEdit running and in front | `scripts/accept/fixture-app.mjs`: the fixture quits only a TextEdit the run caused to start, then gives the front back to the app that held it before (`textedit.mjs` steps "quit the TextEdit this run started, and only it" and "hand the front back …") | unit tests (`test/accept-fixture-app.test.mjs`); the cua-free witness on the mini, 10/10 (`textedit-witness/witness.json`) |
| 2 | A pause past the 15-minute idle stop restarted the runtime: a restart notice and lost REPL state in a paused cell | Every repl-parity lane's serve runs with `CUA_RUNTIME_IDLE_MS=0` on both hosts (`scripts/repl-parity/topology.mjs` `ownNodeEnv`), so the runtime stays warm | `test/repl-parity/topology.test.mjs` "every parity lane keeps its runtime warm through a pause" |
| 3 | accept-native item 1 failed two tests, seen only on the mini | Root cause, not specific to the mini: accept-native puts the TAP reporter in NODE_OPTIONS, and `verifyUnitProofs` added a second `--test-reporter` on the command line. With two reporters and one destination, `node --test` refuses to start. The unit-proof child now takes the reporter from NODE_OPTIONS alone | the new coverage test; item 1 on the mini (below) |
| 4 | accept-native item 10 failed its tracked-file and clean-clone checks | Four defects, below | item 10 on the mini (below) |
| c1 | Browser cleanup could close a window's last tab | Nothing added. Every harness close (chrome-cells' close cells, the parity scratch tab's `close()`) runs as a cell in a cua session. The browser service sends it as `Target.closeTarget` through cua's host, the only Chrome route (README), and #148's `keepWindow` in `src/chrome/host.mjs` already keeps the window | code reading: `src/chrome/host.mjs` closeTab and keepWindow, `src/browser-service/cdp.mjs:540` |
| c2 | The gate's frontmost regex read only `bundleID="…"` | `frontmost` uses key-guard's `parseFrontmost`, which reads both spellings | `test/mini-rules.test.mjs` |
| c2 | `watch.mjs` wrote to a hardcoded M1 sitting log | It was never in the repository (it lived in `/tmp/cua-115-m1/`). It is now `scripts/mini-watch.mjs`, with `--log` required and its mode, pause and hold files as arguments | `test/mini-watch.test.mjs` |
| c2 | Parity discarded each connection's stderr | `StdioClient` keeps a bounded tail (64 KiB). It writes the tail to `<out>/diagnostics/<connection>.stderr.log` only when a connection ends abnormally: a nonzero exit, a signal the harness did not send, or any exit before the harness closed it | `test/repl-parity/mcp.test.mjs` |
| c2 | `~/Developer/GitHub/cua-parity` on the mini was left at 8782604 | Reset to main (3383f6d) | `git status -sb`: `## main...origin/main` |

### Item 1: causal ownership of the fixture TextEdit

The dispatching session asked first whether the process environment could serve as the witness. It cannot. `ps -E` shows
no environment for platform apps: 0 entries for Finder and Terminal on both Macs (macOS 26.6.2 and 27.0), and none for
the TextEdit the witness started (`envShownByPsE: [false]`). Ownership is therefore by launch, as the session allowed.
After review round 1 the rule is:
- **Captured at launch.** Right after its own `open` returns, the run polls for a new TextEdit pid, every 100 ms for at
  most 10 s, and records the time it took. A pid counts when it was absent from the before-set and its `ps -o lstart`
  launch time (C locale, read in UTC so a fall-back hour is not ambiguous; whole seconds) is no earlier than the second
  the run began. Exactly one such pid is recorded as `{pid, launch time}`. None means the document went to a TextEdit
  already running. Several is ambiguous and records none. A poll that runs past the bound is a miss, recorded as one and
  never guessed.
- **Never re-scanned.** Cleanup considers only the recorded pid, and only while that pid still has the same launch
  time. A TextEdit the owner starts mid-run, one relaunched after ours exits, or a reused pid is never selected. A
  TextEdit running before the run is never quit.
- **Quit only when alone.** A TextEdit the run started can still receive someone else's document during a pause, so it
  is quit only when the fixture's close step saw TextEdit report no window at all and no GUI stop or identity loss
  happened. Otherwise nothing is signalled, the quit step is BLOCKED and names the pid left running, and the front is
  still handed back.
- **Quit and hand back.** The fixture sends SIGTERM and waits up to 5 s. A TextEdit that does not exit is a FAIL step.
  The fixture then activates the app that was frontmost before the run (`open -b`) and confirms it.

The full accept-native TextEdit sitting (item 5 with a live helper) is **deferred to the next owner sitting with an
approved helper**. The approved runtime copy, `~/cua-115/home`, was removed on 2026-10-18. A fresh install would put a
new helper on disk, which raises a screen-capture confirmation only the owner can answer. The owner's resident home must
not be touched.

The witness ran the harness's own launch and cleanup path without cua, from 18:19:47Z to 18:19:54Z
(`textedit-witness/witness.json`, PASS):
- **Running before.** The witness started TextEdit with a plain `open -a TextEdit <file>` (pid 38131) and gave the front
  back. The harness path's document went to the same pid. The harness cleanup owned and quit nothing, 38131 survived,
  and the front went back to Terminal. Only then did the witness's own teardown quit 38131.
- **Started by the run.** The run's `open` started pid 38360. The cleanup owned exactly it, quit it, and Terminal was in
  front.
- **End state.** No TextEdit was running and Terminal was in front. Both were checked independently afterwards with
  `pgrep` and `lsappinfo`, and by the gate's front-after reading.

### Item 2: why keep the runtime warm rather than allow the notice

An idle stop does more than add a notice. The restarted runtime has lost its REPL state, so a later cell of the same
case could differ in value too, and an allowed notice would not cover that. No parity case exercises the idle stop. The
setting changes nothing for a cell that is not held past 15 minutes, and both hosts get it.

### Items 3 and 4 on the mini

`accept-native --items 1,10` at 8318fe3 on the mini scored both items PASS (`accept-native-items-1-10/acceptance.json`,
overall PASS, from 18:25:26Z to 18:27:42Z). It ran from a detached scratch clone (`~/cua-157`) in accept-native's own
`env -i` environment, the same one `ACCEPT_REMOTE` uses: TMPDIR and XDG_CONFIG_HOME pointing at scratch, a scratch
CUA_HOME, Node 26.4.0.
- **Item 1, npm test: PASS.** 2892 of 2963 passed and 0 failed. 71 declared skips were accepted, each listed with its
  count: 68 research-tree differentials and 3 platform-only tests.
- **Item 10: PASS on every check.**
  - Tracked files: none flagged, and the 5 declared mini-layout files are exempt only from the home-path rule.
  - Packaging: 218 files.
  - Clean clone `npm test`: 2857 of 2963 passed. It came from a clean clone of the detached HEAD, which is the case
    that failed before. Its 106 skips are the 71 above plus 35 npm-package-gated ones, accepted because the clone has
    no `node_modules`.
  - No research trees needed.

Item 10's four defects were:
- **The clean clone.** `git clone --branch HEAD` fails from a detached checkout ("Remote branch HEAD not found"). It now
  clones without a checkout, fetches the checkout's own HEAD, checks it out detached, and confirms the commit.
- **The tracked-file scan.** Every earlier flag was the home-path rule: `/Users/new/` is the account home on both the
  controller and the mini. None was a credential pattern, except a PEM header in `tests/mods/guard/shell-exec.ts` that
  the first fixed run found. Generic fixtures now use a made-up home (`/Users/dev/`, slug hash recomputed), and the
  research-tree citation uses `~`. The files that are by design the mini's own layout are a declared exception to the
  home-path rule only (`MINI_LAYOUT_FILES`: `scripts/mini-rules.mjs`, the three `test/mini-*.test.mjs` that pin its
  paths, and a seatbelt recording made on the mini). The PEM header is assembled at run time. The scan reports each
  file with its rule, never the text.
- **The research-tree check.** It flagged comments that cite a research tree. A citation is not a dependency: a line
  counts only when the name appears outside a comment.
- **`npm test` without `node_modules`.** Three repl-parity tests imported `meriyah` from `node_modules`. They now parse
  with the kernel's vendored copy (`src/repl-host/vendor/meriyah`, the devDependency's exact 7.0.0).

## Acceptance rule change: declared skips

accept-native's suite verdict treated any skipped test as missing coverage (BLOCKED, since 9d1e51c). On the mini, 68 of
the 71 skips are vendor differentials gated on a local research tree (`CUA_VENDOR_CUA`, `CUA_VENDOR_BROWSER_CLIENT`),
which item 10 requires a clean checkout not to need. The other 3 are platform-only tests. Under the old rule, items 1
and 10 could not pass on any Mac.

With the dispatching session's approval, `DECLARED_SKIPS` (`scripts/accept/lib.mjs`) lists exact skip reasons that do
not count as missing coverage:
- A research-tree entry applies only while its variable is unset or names a path that does not exist. A differential
  that still skips with its tree present BLOCKS.
- A platform-only entry applies only on another platform.
- The check detail lists every accepted reason with its count.
- Any other skip, a skip count the reasons do not account for, or a TODO still BLOCKS.

The one Linux-only test that skipped with no reason now gives one ("Linux only: a systemd user unit").

## Mini runs

All of them went through `node scripts/mini-rules.mjs gated`, with the gate's two readings first and the front-after
check last:
- **Item 1's two tests, reproduced directly** under `env -i` on the mini (Node 26.4.0 and 22.18.0). They pass there:
  the failure needed accept-native's NODE_OPTIONS.
- **accept-native `--items 1,10` at 68c85ee** (the first fixed run). Item 1 had 0 failures but was BLOCKED by the skip rule. Item 10 found
  the remaining defects: a PEM header in `tests/mods/guard/shell-exec.ts`; three tests importing `meriyah` from
  `node_modules`, which a clean clone lacks (they now parse with the kernel's vendored Meriyah 7.0.0); and the
  research-tree pattern held in `lib.mjs`.
- **The TextEdit witness at e9cdc1f**, inside the hold, with `gated --hold` (the queue ignored; a busy runner or a
  Runner.Worker would still wait).
- **accept-native `--items 1,10` at e92ec4e.** Item 1 PASS. Item 10 was BLOCKED only by the clean clone's
  package-gated skips, which led to the package entries.
- **accept-native `--items 1,10` at 8318fe3.** Both PASS (above).

## Notes for whoever runs these next

- `mini-rules.mjs`'s `ACCEPT_REMOTE` still names 94366c1 and `~/cua-115/home`. Both are #115 M0's sitting, kept as the
  record of that run. A new accept-native sitting needs a script of its own with an approved helper.
- `gated --hold` exists for a run inside a CI-opt hold. Outside one, the gate still waits for the queue.
