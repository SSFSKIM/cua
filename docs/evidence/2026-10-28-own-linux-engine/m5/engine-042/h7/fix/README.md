# H7's review fixes (#171 M5, task 128, Part 1): the review of cf1ef10f

**A development run, not a release gate.** Everything ran on the x64 VM, on private displays, against the pinned
linux-engine 0.4.2 in a run-owned home (task 121's, `cua-engine 0.4.2 (9371d2348cf8)`), under the host lock as `m5-h7`.
No engine change.

## What changed

1. **A stop past its thaw gets no credit.** `freezeBrowser` reads the clock again just before `SIGSTOP`. A timer that
   woke at or past the thaw sends no signal, and the stop is skipped with why ("the stop's timer woke 603 ms after the
   send, at or past the thaw at 600 ms"). The band judge now needs positive evidence: the row's `freeze.stopped_ms`
   before its cell's thaw. A row without a skip string is not exercised by that alone, and a row with no freeze record
   is unexercised. H6's rows carry the stop without H7's press fields; they are judged by their stop, as before.
2. **The press mark is bound to its trial by its value.** `_NET_WM_USER_TIME` holds the X server time of the press
   the browser read. A mark counts for a trial only when its value is:
   - newer than every value seen before it, so a repeat of the baseline, or of any earlier value, is no press;
   - not before the send's server time, so an earlier trial's queued notification is no press;
   - not after its own line's arrival on the same clock, so a server whose clock is not this machine's binds nothing,
     and the stops fail closed (skipped, unexercised).

   Each bound allows 2 ms of slack. The send's server time is read from this machine's monotonic clock
   (`serverNow`). The X server stamps its events with `GetTimeInMillis`, the kernel's monotonic clock in ms, and the
   probe below shows the two agree. The row records `press_time`, `sent_time` and any marks passed over
   (`press_ignored`), each with why.
3. **A band's late takes are its exercised rows'.** The band table's late-take column and the "no late take" finding
   count the exercised rows only. Every late take is still judged in full (reported or failed) and counted in the
   run's total.
4. **The probe owns its display** (`scripts/probe-usertime-any.sh`). It starts its X server as the harness does,
   with `Xvfb -displayfd`, so the server names its own free display. It sends no input until that display is known
   and the server is still the probe's child, refuses `:0`, and stops everything it started on any exit. Rerun on
   both Chromes (`probe/usertime-156-158.txt`).
   - Both marked the XTEST click and the synthetic one.
   - Every mark's value fell between the monotonic readings taken around its click: for Chrome 156, 2073879853 ≤
     2073879863 ≤ 2073879990, and 2073881027 ≤ 2073881039 ≤ 2073881168.
   - The earlier run (task 125) named `:78` outright. Its last Xvfb log, the 158 run's, shows the server starting with
     no "already active" error. The 156 run's log was overwritten, so that the server was its own is not provable
     from the record; the rerun replaces it.
5. **`launch-plan.mjs` renders each plan from the launch's own arguments.** It parses them with the harness's parser
   (cli.mjs `parseArgs`) and sits them as the run does (drop-signals.mjs `runSpecs`): the plan or the default one,
   the ballast's cells, the lanes and the `--trials` cap. The tests cover both architectures' full plans through
   `--arch`.
6. **The Chrome startup line on stderr** (`[...:WARNING:chrome/app/chrome_main_linux.cc:84] Read channel stable from
   /opt/google/chrome/CHROME_VERSION_EXTRA`, in both C1 development runs' `stderr.log.txt`) is browser startup noise:
   Chrome logs which release channel it read at every start. It says nothing about the run. The raw files are kept.

## The byte comparison against cf1ef10f (`comparison/`)

`scripts/compare.sh` prints each head's launches and plan contents with that head's own `launch-plan.mjs`, from one
fixed path under `env -i`. The renderer itself changed in fix 5.

| head | x64 | arm64 |
|---|---|---|
| cf1ef10f | 1256 lines, sha256 a52612b4…533eaf | 1256 lines, sha256 6db641ca…3e7f7a |
| ef9ac899 (the fixes) | 1256 lines, sha256 a52612b4…533eaf | 1256 lines, sha256 6db641ca…3e7f7a |

**Identical, byte for byte, on both architectures: no launch or plan changed, and no step reruns for these fixes.** The
old renderer and the new one also agree on every gate step: no gate step passes `--lanes` or `--trials`, or runs the
default plan.

## The x64 development run (`dev-run/`)

`gate.mjs run C1 --pinned <home> --dev`, at idle, at ef9ac899 (clean): **PASS**, 0 unexercised, 0 false oks, the edge
band's 1 late take reported. Every press mark was bound (`scripts/binding.mjs`):

| cell | n | bound | press marked (ms after send) | value − send (server ms) | stop began | thawed | skipped | marks passed over |
|---|---:|---:|---|---|---|---|---:|---|
| freeze-600 | 10 | 10 | 5–10 | 2–7 | 60–66 | 602–604 | 0 | none |
| freeze-646 | 5 | 5 | 5–8 | 2–6 | 59–63 | 648–650 | 0 | none |
| freeze-648 | 5 | 5 | 4–8 | 2–5 | 60–62 | 650–652 | 0 | none |
| freeze-650 | 5 | 5 | 5–14 | 2–6 | 60–69 | 651–654 | 0 | none |
| freeze-652 | 5 | 5 | 4–8 | 2–5 | 59–64 | 655–656 | 0 | none |
| freeze-700 | 10 | 10 | 4–8 | 2–6 | 60–63 | 700–702 | 0 | none |

Each press's server time came 2 to 7 ms after the send's, inside the bounds and far from a stale mark, which is a second
or more older.

## Tests

The RED runs are in `logs/` (`red-fix-judge.txt`, `red-fix-runner.txt`, `red-fix-launch-plan.txt`): each new test
failed before its fix.
