# Superseded: the first vendor computer run on the mini (2026-10-17, 10:52Z sitting)

`run-1/` is a complete vendor-host computer run of `scripts/native-baseline.mjs`, made at harness commit `8afd143` on 2026-10-17 from 10:52:28 to 10:53:36Z. It ran with the account's real HOME, a scratch XDG_CONFIG_HOME, and the approved runtime copy `~/cua-115/home` served in place. Its `meta.json` is unedited.

**Why it is not part of the M0 triple.** The re-review of task 3's fixes ruled that the native helper's ownership must be witnessed causally. Each mini run now gives its serves a TMPDIR of its own (`<scratch>/tmp`). buildLaunch copies that TMPDIR into node_repl's environment, and `open` passes it on to the helper. That changes what every run records in its launch witness: `sandboxLaunch.tmpdir` reads `inherited`, where this run reads `unset`. The three runs of a triple must agree, so the vendor computer triple is retaken whole, run-1 to run-3, into `../mini-vendor-computer/`. This run stays here as a record.

**The sitting.**
- The idle check passed before the run (CI runner idle twice, no queued macOS job, mini load under 2).
- The run completed: every row, one TextEdit approval answered by the harness, TextEdit quit, no serve left. Its preparation was cleaned up (`state/` and `run/` restored).
- After the run, `com.apple.UserNotificationCenter` was frontmost, so the sequence stopped (`../mini-rules/sitting-log.txt`).
- The dialog was already up at 10:27:45Z, before this run. It followed sandboxd's `kTCCServiceSystemPolicyAppDataDetailed` checks, and the subject of the one request allowed to prompt is private in the log. The owner answered it by hand at 10:57:49Z.
- The idle check could pass under a dialog because every macOS CI job then fails at once and the runner reads idle. That is why the gate now requires Terminal frontmost on both readings.
- The run's own `TCCAccessRequest` at 10:52:55Z came from this work (inside the run, kind unknown). The screen captures were allowed throughout.
- See the spec's Surprises & Discoveries entry on the second permission dialog.
