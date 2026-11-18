# #171 M5 T7, the arm64 acceptance (task 99), from 2026-11-18

**Acceptance on the pinned release, counted.** This first part ran at the frozen head **H‴ = `f6275fb6`**, on the
acceptance home's own `cua install` of **linux-engine-v0.4.0**: `cua-engine` sha256 `0cbde8f0…`, `cua-engine 0.4.0
(c55c8e08d9cb)`, the pin's arm64 asset. The pinned rule takes it inside each step. The machine is the GCE arm64 VM
`dc-linux171arm-996d` (c4a-standard-8, aarch64, uid 501, home /Users/new).

**Status: interim.** Setup, H‴'s local proof, item 9 and the private idle block are done.
- H‴'s local proof passed, by the controller's two rulings below.
- Item 9 passes.
- All 25 idle steps that ran exited 0 by their own judge at H‴.
- S1, H1 and H2 were skipped, as class A, by ruling 827.

The `:0` sitting, the block at twice the load, the class-A reruns and the unjudged passes run later at **H⁗ on 0.4.1**,
per rulings 827 and 828. 0.4.0 has a false ok (L4a, the Decision Log's "T6 on arm64"), so 0.4.1 is being cut with a
settle before the release, and their records will be added here.

## Setup

- **Checkout:** `t7-arm64` is a fresh git worktree of the VM's clone, detached and clean at
  `f6275fb600ae719f29cf32b206676e1a70a02e26`, made beside task 96's checkout and not in it.
  - It had a real `npm ci`, then `node node_modules/electron/install.js` (electron v44.9.0), then xprobe (aarch64), built
    through the VM's cargo wrapper.
  - All of it ran under `locked.sh t7-arm64`, 09:58:54–09:59:22Z, with 0 changes before and after
    (`scripts/setup.sh`, `setup-all.sh`, `setup-t7.log`).
  - main's comparison checkout, `t7-main`, was made the same way at origin/main **`a39d26ff`**, without xprobe, for
    ruling 743's npm test comparison (`setup-main.log`).
- **The run's Node:** 24.22.1 at `~/.local/share/cua-171/node24`, first on PATH for every harness command, as in the
  pilot. The image's Node 26 is untouched.
- **The acceptance home:** `~/.local/share/cua-171/m5/home-arm64` (CUA_HOME). Its own `cua install` ran under a HOME
  and XDG directories of the run's, with an empty secret store, 0 entries (`scripts/install-home.sh`, `.log`).
  - It placed 26.928.40906-linux-arm64, the sandbox helper, Node 24.22.0 and linux-engine-v0.4.0.
  - The engine's sha256 `0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42` equals the pin's arm64
    asset. `file` reads `ELF 64-bit LSB executable, ARM aarch64 … statically linked`, and `install.json` has build
    `pinned`.
  - `gate.mjs check --pinned` exited 0, attested: linux-engine.yml runs 43637317960 on `release/linux-engine-v0.4.0`
    and 43608161213 on `feat/171-m4`, both GitHub-hosted and naming the arm64 subject. native/linux-engine is as at
    c55c8e08, and the checkout is at f6275fb6, clean.
- **Chrome (F2):** the judged Chrome is **Google Chrome 156.0.8078.73** (`google-chrome-stable 156.0.8078.73-1
  arm64`, held; `scripts/chrome-check.log`).
  - The harness runs `google-chrome` (chrome.mjs `CHROME_COMMAND`), which PATH resolves to `/usr/local/bin/google-chrome`.
  - That is cua-provision's wrapper: it runs `/usr/bin/google-chrome-stable --force-renderer-accessibility
    --password-store=basic --no-first-run --no-default-browser-check`, which leads to `/opt/google/chrome`.
  - Current stable in Google's arm64 pool, read on 2026-11-18, is **158.0.8127.36**, not 157. F2's unjudged pass uses
    whatever is current stable when it runs.
- **Firefox:** task 59's Mozilla Firefox 159.0 arm64, first on PATH for the gate's private steps (`firefoxDir`).
- **`gate.mjs --list`** (`scripts/list.txt`): 50 steps, 1231 min estimated.

## H‴'s local proof, before any counted step

`scripts/linux-engine-gate/local-proof.sh` from the T7 checkout was run as it is (task 91, ruling 774).
- Each part ran under `locked.sh t7-arm64` with its own `timeout`, and hold-sittings stopped later parts
  (`scripts/proof.sh`; logs `scripts/proof/`).
- The run's Node was first on PATH, cargo came through the VM's wrapper, and rustup from `~/.cargo/bin`.
- The script's strict line reads `proof: FAIL: npm-test exit 1, npm-test-compare exit 1, two-screens exit 1`
  (`scripts/proof/proof.log`). The controller ruled on the two failures (below).
- **Hosted ci-gate on H‴** (the controller's): run 44278659157 passed 7 of 8 gates. engine-linux failed on the known
  clipboard flake (`an_unconfirmed_paste_s_current_time_refusal…`, tech-debt-tracker.md, its fourth sighting). Its
  rerun, [44283284127](https://github.com/SSFSKIM/cua/actions/runs/44283284127), passed, so H‴ is **GREEN**.

| part | command | UTC (11-18) | result |
|---|---|---|---|
| npm test at H‴ | `npm test` in t7-arm64 | 10:00:12–10:02:54 | 6101 tests: 5854 pass, **48 fail**, 199 skipped (exit 1; ruled below) |
| npm test at main | `npm test` in t7-main (a39d26ff) | 10:02:54–10:05:27 | 5855 tests: 5612 pass, **47 fail**, 196 skipped (exit 1) |
| harness suite | `npm run test:linux-engine-diff` | 10:05:27–10:06:06 | 1246 tests: 1242 pass, 0 fail, 4 skipped; exit 0 |
| harness-dbus | the gate's run line (`CUA171_DBUS_TESTS=required node test/linux-engine-diff/suite-check.mjs` over its six files; the apt packages are installed) | 10:06:06–10:06:30 | 91/91; exit 0 |
| engine-linux, static | `rustup toolchain install`; `rustup target add aarch64-unknown-linux-musl`; `cargo fmt --check`; both `cargo clippy … -D warnings`; `cargo build --release --locked --target aarch64-unknown-linux-musl` | 10:06:30–10:07:31 | exit 0 |
| engine-linux, live | `CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session --dbus-daemon=tests/dbus-daemon-quiet -- cargo test --release --locked --target aarch64-unknown-linux-musl --features live -- --test-threads 1` | 10:07:31–10:15:44 | 622 passed, 0 failed, 1 ignored, over 11 test binaries; exit 0 |
| engine-linux, two screens | `tests/two-screens.sh` | 10:37:51 | **exit 1 before any test ran** (below) |
| two screens on aarch64 | `scripts/two-screens-aarch64.sh` (below) | 10:39:54–10:39:55 | **3/3** on Xorg :100 (two screens) and :101 (resizable); exit 0 |

**two-screens (the controller's ruling: passed by the aarch64 copy).** `native/linux-engine/tests/two-screens.sh`
names `--target x86_64-unknown-linux-musl`, which has no std on this arm64 VM (E0463), so the part failed before any
test ran (`scripts/proof/two-screens.log`). That is a portability defect in the gate script, not a test result. The
pinned rule keeps native/linux-engine as released, so the copy was made outside the checkout, at
`scripts/two-screens-aarch64.sh` (made by `scripts/proof-extra.sh`). It changes two lines and nothing else
(`scripts/proof/two-screens-aarch64.log`):

```
16c16
< cd "$(dirname "$0")/.."
---
> cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-arm64/native/linux-engine
78c78
<   cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- \
---
>   cargo test --release --locked --target aarch64-unknown-linux-musl --features live --test live_device -- \
```

Its three tests passed: a_drag_handle_ended_with_the_pointer_on_another_screen…,
a_drag_handle_moved_into_screen_area_added_after_the_engine_started…, and
an_exit_with_a_drag_handle_held_and_the_pointer_on_another_screen…. The script's target is for the tracker and the next
engine release; the controller logs it.

**npm test, by ruling 743 (the controller's ruling: passes).** H‴ passes when it fails nothing that main doesn't, or
when what it fails alone also flakes at main. The sets are by test name (`scripts/failing.mjs` over the two logs;
`scripts/proof/npm-test-compare.txt`).
- Failing at H‴: 48. Failing at main: 47. The full lists are in that file.
- Failing at H‴ only:
  - `test/native-baseline/run.test.mjs :: a TextEdit whose etime reads 1 s more than the bind has run is still the run's; 2 s more is not`
  - `test/native-baseline/run.test.mjs :: comparison A's candidate lane (vendor host, cua's engine): the engine named in every serve, attested on every result, its stops and its process recorded`
- Failing at main only:
  - `test/serve-lazy.test.mjs :: a MAWS session's notes, js hint and js rules name the in-app browser; a plain one's do not`

The two H‴-only failures flake at both heads.
- `test/native-baseline/run.test.mjs` alone was run 10 times at each head, alternating H‴ and main, under the lock,
  10:40:08–10:44:04Z (`scripts/proof-extra.sh`, `proof/flake-run-test.log`, `proof/flake-<checkout>-<n>.log`).
- At H‴ it had **16** test failures over the 10 runs; at main **7**. The tally is read from each run's log. The
  driver's "exit" column reads the `date`'s exit, ruling 774's defect, so it is not used.
  - H‴: the TextEdit etime test 4 times, comparison A's candidate lane 4, the serviceMs row test 3, the engineMs row
    test 2, "a cua-engine run in which the pinned vendor helper started…" 2, and the engine-stop test 1.
  - main: the TextEdit etime test 5 times, and the serviceMs row test 2.
- All six tests exist at both heads, and their assertions are the same kind at both. Most often it is "this run: no
  approved engine process (cua-engine) started during the run". These are the macRun stubs' process-sampler window of
  about 500 ms missing a process's start: macOS-path unit tests run on Linux, and no counted step runs them. The
  controller logs them in the tracker.

## Item 9, the fresh install (§1.2), on a private display

`scripts/item9.sh` ran under the lock, inside M4's `private-desktop.mjs --session`: a private Xvfb `:1`, Openbox, and a
private bus with accessibility on. It used an empty home of the run's (`mktemp -d`: HOME, the XDG directories, an empty
secret store, CUA_HOME). The transcript is `scripts/item9/transcript.txt`, with the fresh directory written as
`<fresh>`.

| attempt | UTC (11-18) | lock status | what happened |
|---|---|---|---|
| 1 | 11:05:12–11:05:33 | 0 | **passes** (details below) |

- `cua install --engine` exited 0. It fetched 26.928.40906 arm64, the sandbox helper, linux-engine-v0.4.0 and Node
  24.22.0.
- The engine's sha256 `0cbde8f0…` **equals the pin**. `file` reads `ELF 64-bit LSB executable, ARM aarch64 …
  statically linked … stripped` (C7's `statically linked` on arm64). `--version` is `cua-engine 0.4.0 (c55c8e08d9cb)`,
  and install.json has build `pinned`.
- `CUA_NATIVE_ENGINE=cua cua doctor` exited 0. `engine` PASSES (0.4.0, the pin's hash, service `cua`), and
  `accessibility.enabled` PASSES. Its three chrome-route rows are BLOCKED, as in any empty home with no Chrome
  registration.
- No engine process of the home was left, the home was removed, and private-desktop exited 0 with its watchdog clean.

## The step table

- **Lock lines** are from `~/.local/share/cua-171/host-lock.log`, holder `t7-arm64` (`scripts/lock-lines.txt`). No
  hold reached its cap.
- **The driver** (`scripts/drive.sh`, with `step.sh` inside each hold) differs from T5's in one way: it waits for a
  quiet host *inside* the hold.
  - Another task, m5-l4a (the engine fix's design), runs experiments at twice the load on this VM under the same lock,
    so a quiet host read before the wait for the lock would say nothing about the host once the lock was taken.
  - Inside each hold, `step.sh` waits up to 6 minutes for no stress-ng and a 1-minute load below 1.0. It records the
    load it starts at, then runs `gate.mjs run <step> --pinned <home> --out <outroot> --holder t7-arm64`, capped at
    45 minutes, with CUA_LOCK_MAX=56m.
- **"Step start"** is that start, inside the hold, and minutes are counted from it. Where a step followed one of
  m5-l4a's holds, the 5- and 15-minute averages at the start still carry that load (D1, D5, F2).
- **The out root** is `~/.local/share/cua-171/m5/out-arm64`. Every `:0` step's printed command passed `gate.mjs print`'s
  pre-launch checks there (`scripts/zero-commands.txt`, run names `pinned-<step>`). Those steps run at H⁗.
- **"Stands on"** is the SHA whose judge the step's verdict is read by.

| step | stands on | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| D1 | f6275fb6 | 11-18 11:06:19 | 11:07:59 | 11:30:32 | 22.6 | 0 | 0.98 9.34 12.40 | 0.77 0.83 3.32 | clean; end check clear | the judges' verdict for `cua`: PASS (Chrome: canvas, drag and drop with **#358 declared**, the thumb at the pinned mean) |
| D2 | f6275fb6 | 11-18 11:47:53 | 11:47:53 | 12:06:06 | 18.2 | 0 | 0.22 0.20 1.19 | 0.04 0.09 0.43 | clean; end check clear | PASS (Electron's cells, its thumb at the pinned mean). **Class A** (ruling 827): it began at 11:47:53Z, before the plan change reached the run, so it ran on 0.4.0 and stands as recorded; it reruns on 0.4.1 at H⁗ |
| D3 | f6275fb6 | 11-18 12:06:12 | 12:06:12 | 12:24:25 | 18.2 | 0 | 0.04 0.09 0.43 | 0.33 0.32 0.36 | clean; end check clear | PASS (Firefox's cells, its canvas on speed) |
| D4 | f6275fb6 | 11-18 12:25:33 | 12:26:03 | 12:51:32 | 25.5 | 0 | 0.93 0.66 0.49 | 0.08 0.08 0.14 | clean; end check clear | PASS (the GTK and Qt editors' cells) |
| D5 | f6275fb6 | 11-18 13:12:46 | 13:15:37 | 13:34:05 | 18.5 | 0 | 0.97 9.27 10.41 | 0.09 0.30 3.17 | clean; end check clear | PASS (Writer unprimed, the terminals, GTK 4, Writer through gen) |
| R1 | f6275fb6 | 11-18 13:51:30 | 13:51:30 | 14:17:36 | 26.1 | 0 | 0.13 0.17 1.12 | 1.09 1.07 1.05 | clean; end check clear | repl-parity 34 cases on each lane: cua `PASS` (34 covered), vendor `RECORDED_VENDOR_DEFECT` (31 covered, the 3 declared arm64 defects); the diff exit 0; the prepared home pinned |
| R2 | f6275fb6 | 11-18 14:18:21 | 14:19:11 | 14:37:48 | 18.6 | 0 | 0.86 1.15 1.09 | 0.19 0.25 0.50 | clean; end check clear | `VERDICT: PASS` by in-cell time; `unproved.txt` empty; typeText and paste read "not judged: the vendor never completed it" (every vendor sample `target: exited`, T4 arm64 (a)) |
| R3 | f6275fb6 | 11-18 14:37:48 | 14:37:48 | 14:41:06 | 3.3 | 0 | 0.19 0.25 0.50 | 0.44 0.38 0.50 | clean; end check clear | linux-native passes; engine watch PASS: only the run home's installed cua-engine, under the trusted worker, no sky_linux |
| R4 | f6275fb6 | 11-18 14:41:06 | 14:41:06 | 14:42:03 | 0.9 | 0 | 0.44 0.38 0.50 | 0.69 0.45 0.52 | clean; end check clear | linux-device-mode passes; engine watch PASS |
| FB | f6275fb6 | 11-18 14:42:03 | 14:42:03 | 14:42:33 | 0.5 | 0 | 0.69 0.45 0.52 | 1.07 0.56 0.56 | clean; end check clear | every step PASS (the truncation line) |
| E1 | f6275fb6 | 11-18 14:42:33 | 14:42:43 | 14:50:29 | 7.8 | 0 | 0.91 0.54 0.55 | 0.09 0.14 0.33 | clean; end check clear | complete: "cua sent the pinned build's events and answers in every scenario"; desktop move first 72.97 ms against the pinned 81.14 and the newest 81.49 (faster, [-8.21, -8.13]), later 0.10 against 8.16 and 5.36 (faster); the interrupted drag by ruling 818 (below) |
| S1 | – | – | – | – | – | – | – | – | – | **skipped**: class A (ruling 827); runs on 0.4.1 at H⁗ |
| S2 | f6275fb6 | 11-18 14:50:29 | 14:50:29 | 15:15:41 | 25.2 | 0 | 0.09 0.14 0.33 | 0.28 0.24 0.23 | unclean: pid 924214 openbox; end check clear | complete: 30 settle series, every one ending on 30 consecutive; firefox-input right_click background 1 refused, then 30 consecutive (31 runs) |
| S3 | f6275fb6 | 11-18 15:16:12 | 15:16:12 | 15:39:59 | 23.8 | 0 | 0.56 0.31 0.26 | 0.05 0.14 0.27 | unclean: pid 959665 openbox; end check clear | complete: 31 series, no miss |
| S4 | f6275fb6 | 11-18 15:40:41 | 15:40:41 | 16:14:52 | 34.2 | 0 | 0.02 0.12 0.26 | 0.18 0.16 0.14 | unclean: pid 1005059 openbox; end check clear | complete: 37 series, no miss |
| F1a | f6275fb6 | 11-18 16:15:22 | 16:15:22 | 16:30:28 | 15.1 | 0 | 0.51 0.25 0.17 | 0.33 0.57 0.39 | unclean: pid 1056505 openbox; end check clear | complete: 24 series, no miss, audits as expected |
| F1b | f6275fb6 | 11-18 16:31:10 | 16:31:10 | 16:40:58 | 9.8 | 0 | 0.17 0.50 0.37 | 0.59 0.48 0.39 | unclean: pid 1091564 openbox; end check clear | complete: 9 series, no miss |
| F2 | f6275fb6 | 11-18 17:02:14 | 17:05:04 | 17:08:59 | 3.9 | 0 | 0.96 9.25 10.47 | 0.22 4.33 8.17 | unclean: pid 1126389 openbox; end check clear | complete: SIGTERM after keys and after clicks 30/30 each on Chrome and Electron; SIGKILL the control |
| ES | f6275fb6 | 11-18 17:26:21 | 17:26:21 | 17:37:55 | 11.6 | 0 | 0.28 0.27 2.73 | 0.18 0.29 1.47 | unclean: pid 1149724 openbox; end check clear | complete (every production stop path; the installed engine through `cua serve`) |
| P1 | f6275fb6 | 11-18 17:37:55 | 17:37:55 | 18:05:39 | 27.7 | 0 | 0.18 0.29 1.47 | 0.25 0.14 0.33 | clean; end check clear | every cell PASS (8 of 8) |
| P2 | f6275fb6 | 11-18 18:05:39 | 18:05:39 | 18:31:44 | 26.1 | 0 | 0.25 0.14 0.33 | 0.26 0.18 0.19 | clean; end check clear | every cell PASS (8 of 8) |
| P3 | f6275fb6 | 11-18 18:31:44 | 18:31:44 | 18:57:38 | 25.9 | 0 | 0.26 0.18 0.19 | 0.33 0.19 0.19 | clean; end check clear | every cell PASS (8 of 8) |
| P4 | f6275fb6 | 11-18 18:57:38 | 18:57:38 | 19:25:41 | 28.1 | 0 | 0.33 0.19 0.19 | 0.18 0.17 0.18 | clean; end check clear | every cell PASS (8 of 8) |
| P6 | f6275fb6 | 11-18 19:25:41 | 19:25:41 | 19:53:39 | 28.0 | 0 | 0.18 0.17 0.18 | 6.89 1.68 0.67 | clean; end check clear | every cell PASS (8 of 8), Firefox's dnd 30/30 by P6's Fisher judge (p = 1.0 against the pinned build) |
| P5 | f6275fb6 | 11-18 19:53:39 | 19:55:39 | 20:14:02 | 18.4 | 0 | 0.93 1.12 0.58 | 0.23 0.27 0.36 | clean; end check clear | every cell PASS (5 of 5: the leave cases) |
| H1 | – | – | – | – | – | – | – | – | – | **skipped**: class A (ruling 827); runs on 0.4.1 at H⁗ |
| H2 | – | – | – | – | – | – | – | – | – | **skipped**: class A (ruling 827); runs on 0.4.1 at H⁗ |
| C1 | f6275fb6 | 11-18 20:14:02 | 20:14:02 | 20:15:39 | 1.6 | 0 | 0.23 0.27 0.36 | 0.28 0.28 0.36 | clean; end check clear | every late take reported, no false ok, no missing landing (18 late takes, 18 reported; 20 drags that never took answered as plain drags; 0 of 2 landed drops unconfirmed) |

**The plan change, as it reached the run.** The controller's message (rulings 827, 828) came at about 11:55Z, while D2
held the lock (from 11:47:53Z). D2 was left to finish. The driver was stopped before D3 by its STOP file and started
again at 12:06:12Z on the idle steps left, without S1, H1 and H2 (`scripts/relaunch-idle.sh`; `out/driver.log` names
both runs). Of the class-A list (H1, H2, L4a, D2, L2b, L1, S1, L3b), the idle block holds D2, S1, H1 and H2. The rest
are in the twice-load block, which runs only at H⁗.

### E1's interrupted drag, through the audit proxy (ruling 818)

E1 now runs its fragile scenarios through the audit proxy in the judged run, which adds latency. Each scenario ran once
per lane. The outcome each sample took (`out/E1.pinned-release/run/results.jsonl`, the `events` rows):

| scenario | lane | answer | the error's window / the recorder's child | the trace |
|---|---|---|---|---|
| an interrupted drag under a held key, then a move | pinned | `ok:false, x_window_error, child_pressed`, 102.1 ms | 4194305 / 4194305 | traced, 2 sent after the press |
| | newest | the same, 104.0 ms | 4194305 / 4194305 | traced, 1 sent after the press |
| | **cua** | **`ok:false, x_window_error, child_pressed`**, 1.07 ms: **the interruption**, judged by its error naming the destroyed child | 4194305 / 4194305 | traced, 3 sent after the press |
| an interrupted click under a held key, then a move | pinned / newest / cua | `ok:false, x_window_error, child_pressed` on every lane (cua 12.8 ms) | 4194305 / 4194305 | traced |
| a key hold whose window is destroyed | newest, cua | the same as the pinned build, but the **declared answer** (`interrupted_hold`) | – | – |

So on arm64 through the proxy, cua's interrupted drag took the interruption (ok:false). In the pilot, without the proxy,
it took the whole drag (ok:true, 4 of 4). Both pass under ruling 818, each by its own condition.

## Declared and unconfirmed, listed apart (never passes)

| step | cell | what | its record |
|---|---|---|---|
| D1 | Chrome `dnd` cua | **declared speed gap #358**: 354.7 ms against the newest's 328.1, interval [26.5, 26.8], within the declared 40 ms | `out/D1.pinned-release/run/summary.md` |
| E1 | four `type_characters` refusals; `a key hold whose window is destroyed` | the same as the vendor's but the **declared answer** (type_characters, interrupted_hold) | `out/E1.pinned-release/run/summary.md` |
| C1 | Chrome's drops | findings, counted and not fails: 18 late takes, 18 reported; 20 drags that never took, answered as plain drags; 0 of 2 landed drops answered unconfirmed | `out/C1.pinned-release/run/summary.md` |
| S2 | firefox-input `right_click` background | one refused run, then the streak of 30: by the streak rule, a pass of its series, listed here because it missed once | `out/S2.pinned-release/run/summary.md` |

**Unproved (F8a):** R2's `unproved.txt` is empty: no engine-answered series was left undetermined, and none was declared
by name. **Unconfirmed:** none in this block. V3's two `menuUnconfirmed` cells come with the sitting.

## The arm64 vendor ends, in this block

- **Declared:** R1's vendor lane recorded exactly the three arm64 defects T4's arm64 part declared for
  `26.928.40906-linux-arm64`:
  - `linux-arm64-vendor-engine-typetext-ended-gedit`;
  - `linux-arm64-vendor-engine-paste-ended-gedit`;
  - `linux-arm64-vendor-engine-minimized-window-unavailable`.
- **R2:** every vendor sample of `method.typeText` and `method.paste` ended its target (`target: exited`, 3 each), so
  they set no timing and read "not judged: the vendor never completed it" (T4 arm64 (a), R2). cua's text obligations
  hold.
- **Undeclared:** none in this block's summaries. The `:0` steps' vendor ends, which T4 declares per build by binary
  sha256, come with the sitting at H⁗.

## Unclean ends and leftovers

- **Seven unclean ends on the run's own side** (ruling 730 (a): a finding, never a verdict failure): S2, S3, S4, F1a,
  F1b, F2 and ES. Each end record names the experiment display's own openbox as still running (pids 924214, 959665,
  1005059, 1056505, 1091564, 1126389, 1149724). This is the teardown race T5 recorded, logged by the controller as
  harness debt.
- No start check refused, and no step needed `gate.mjs leftovers --remove`. Every end check was clear.
- P6's release load (6.89 1-minute) came inside its own hold: nothing else held the lock then.

## Files

- `out/`: each idle step's directory as the runner wrote it (`<step>.pinned-release`: `step.json`, `README.md`, `run/`
  with its raw rows), each step's driver output, and `driver.log`. Every vendor series is committed with its raw rows
  (`run/results.jsonl`, gzipped over 1 MB), for items 12 and 13.
- `scripts/`: task 99's launchers and records as they ran:
  - the setup, the home and the Chrome check;
  - the local proof and its follow-ups (`proof/`, `two-screens-aarch64.sh`, `failing.mjs`);
  - item 9 and its transcript;
  - the driver and the relaunch;
  - the `:0` launchers and the printed commands, not yet run;
  - the step table (`step-table.mjs`, `table-idle.md`), the lock lines and the run's notes.
- The guard's decoy sockets and pidfiles are left out. The directory was scanned for token-shaped strings before the
  commit (`scripts/scan-evidence.sh`, file names only): the whole `m5/arm64/`, the pilot included, 1461 files, 0 hits. No secret value was read, and every run
  home's secret store was empty.
