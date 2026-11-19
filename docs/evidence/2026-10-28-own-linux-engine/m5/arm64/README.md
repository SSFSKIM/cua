# #171 M5 T7, the arm64 acceptance (task 99), from 2026-11-18

**Acceptance on the pinned release, counted.** This first part ran at the frozen head **H‴ = `f6275fb6`**, on the
acceptance home's own `cua install` of **linux-engine-v0.4.0**: `cua-engine` sha256 `0cbde8f0…`, `cua-engine 0.4.0
(c55c8e08d9cb)`, the pin's arm64 asset. The pinned rule takes it inside each step. The machine is the GCE arm64 VM
`dc-linux171arm-996d` (c4a-standard-8, aarch64, uid 501, home /Users/new).

**Status: complete.** Three parts.
- **At H‴ on 0.4.0:** setup, H‴'s local proof (passed, by the controller's two rulings below), item 9 (passes), and the
  private idle block: all 25 steps that ran exited 0 by their own judge. S1, H1 and H2 were skipped as class A
  (ruling 827), and those idle steps that are not class A stand on H‴.
- **At H⁗ = `3b5c0441` on 0.4.1** (the section "At H⁗ on 0.4.1" below), private parts only:
  - the class-A steps and D1's cross-check: all exited 0, and the cross-check matches on the shipped lane (rulings 854 and the controller's);
  - the block at twice the load: 12 steps exited 0 and 4 exited 1, each since ruled. L3b passes under #302's key_up
    form (`m5/rejudge-302-keyup.txt`). L3c and L3d are a declared arm64 twice-load limit (rulings 872, 876; #429). L4b
    is a finding, not a step failure (rulings 871, 872). Each stored FAIL stays in the table beside its ruling;
  - the 828(c) counter pilot: not taken in all 9 steps;
  - F2's private part on Chrome 158;
  - ruling 872's activation experiment.
- **At H⁵ = `7d554dea` on 0.4.1** (the section "At H⁵" below): the `:0` sitting, F2's `:0` parts and F3.
  - V1, V2, V3, V4 and Z0 pass, each with its all-clear clear.
  - **V5 FAILs on two cells**, and the FAIL stands at H⁵ (ruling 886). `chrome_dnd_short_in_front_shared` 1/2 is a
    judged false ok, and `chrome_dnd_shared` 1/0 and 2/0 were not cancelled. The cause is task 112's: Chrome's
    renderer fired dragstart after the engine's release, so the browser refused the drag. A fix is being measured for
    0.4.2.
  - V5's first attempt was stopped by wrap71 25 s in. It is kept, with its flag record and its clearance.
  - F2 and F3 are unjudged. F3's V3 was stopped by the guard and stands as stopped (ruling 773).
- V1 at H⁗ had stopped that sitting on a harness fault in the audit's window ownership (hold-sittings at 23:34:28Z,
  cleared by the controller at 23:36Z). Task 106's fix is in H⁵, and V1 to V5 and Z0 reran there (857.3).

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

## At H⁗ on 0.4.1 (2026-11-18 21:12Z to 11-19 09:0xZ)

The head is **H⁗ = `3b5c0441`**. Its ci-gate is GREEN 8/8 (run 44394454677), and its Decision Log entry is "the engine
cut to 0.4.1 and the frozen head H⁗". The engine is **linux-engine-v0.4.1**: arm64 `cua-engine` sha256
`8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0`, `cua-engine 0.4.1 (7522dcb8fb8c)`, statically
linked. The records are in `h4/`.

### Setup and local proof

- **The checkout.** `t7-h4` is a fresh worktree detached and clean at `3b5c0441`, with `npm ci`, electron 44.9.0 and
  xprobe, under the lock (`scripts/setup-all-h4.sh`, `setup-h4.log`). The compare checkout `t7-main2` is at origin/main
  **`517ab543`** (`setup-main2.log`).
- **The acceptance home.** `~/.local/share/cua-171/m5/home-arm64-041` is fresh. Its own `cua install` placed the 0.4.1
  engine above (the brief's digest, the pin's arm64 asset), and `gate.mjs check --pinned` exited 0 with the attestation
  of run 44380699966 (`scripts/install-home-h4.sh`, `.log`). Chrome is still 156.0.8078.73 and held
  (`chrome-check-h4.log`).
- **The proof.** The brief left out the engine lines, since the engine source is the released 7522dcb8's, which ci-gate
  covered. Each part ran under the lock (`scripts/proof-h4/`):
  - the harness suite: 1311 tests, 1307 pass, 0 fail, 4 skipped;
  - harness-dbus: 91/91;
  - npm test: 6167 tests and **50 fail** at H⁗; 5859 tests and **50 fail** at main.
- **npm test, by ruling 743** (`proof-h4/npm-test-compare.txt`). H⁗ passes it.
  - Failing at H⁗ only: `test/native-baseline/run.test.mjs` :: "a TextEdit whose etime reads 1 s more…" and "an engine
    that will not stop when the run ends…".
  - Failing at main only: run.test.mjs's serviceMs row test, and serve-lazy's MAWS-notes test.
  - The file alone, alternated 10 times at each head under the lock (`proof-h4/flake-run-test.log`): 14 test failures
    at H⁗ and 6 at main. Both H⁗-only tests fail at main too: the TextEdit test 3 times, engine-stop twice. This is the
    same sampler-window flake as at H‴.

### The step table at H⁗

Every row ran at H⁗ (`3b5c0441`) on 0.4.1, holder t7-arm64, through `scripts/drive-h4.sh` and `step-h4.sh` (the same
quiet wait inside the hold). The idle steps not listed here stand on H‴ (`f6275fb6`) in the table above. "Load" is the
1-, 5- and 15-minute average at the step's start and at its release.

| step | stands on | acquire (UTC) | step start | release | min | exit | load at step start | load at release | end | result |
|---|---|---|---|---|---:|---:|---|---|---|---|
| D1 | 3b5c0441 | 11-18 21:26:26 | 21:26:26 | 21:48:49 | 22.4 | 0 | 0.00 0.43 0.53 | 0.61 0.51 0.48 | clean; end check clear | the cross-check (below): the judges' verdict for `cua` PASS, #358 declared |
| D2 | 3b5c0441 | 11-18 21:48:49 | 21:48:49 | 22:07:04 | 18.3 | 0 | 0.64 0.52 0.48 | 0.17 0.21 0.29 | clean; end check clear | **class A**: PASS |
| S1 | 3b5c0441 | 11-18 22:07:04 | 22:07:04 | 22:40:14 | 33.2 | 0 | 0.17 0.21 0.29 | 0.14 0.11 0.24 | unclean: pid 1501826 openbox; end check clear | **class A**: complete, 50 series; chrome-input and electron-input `move desktop` each 1 late, then 30 consecutive |
| H1 | 3b5c0441 | 11-18 22:40:14 | 22:40:14 | 22:57:42 | 17.5 | 0 | 0.14 0.11 0.24 | 0.20 0.21 0.21 | clean; end check clear | **class A**: no false ok, no missing landing, no false error; #365 0 of 60; ruling 830's mismatches none in 320 |
| H2 | 3b5c0441 | 11-18 22:57:42 | 22:57:42 | 23:15:39 | 17.9 | 0 | 0.20 0.21 0.21 | 0.22 0.18 0.20 | clean; end check clear | **class A**: no false ok, no missing landing, no false error; **ruling 838: cua:desktop root 0 ok, 30 unconfirmed of 30; cua:handle root 0 ok, 30 unconfirmed of 30**; ruling 830 none in 320 |
| V1 | 3b5c0441 | (the sitting) 23:15:57 | 23:15:57 | 23:34:28 | 18.5 | 1 | 0.16 0.16 0.19 | 0.35 0.45 0.39 | all-clear **not clear**: hold-sittings | **stopped the sitting** on a harness fault (below); no verdict |
| L1 | 3b5c0441 | 11-18 23:36:55 | 23:36:55 | 00:07:51 | 30.9 | 0 | 0.11 0.29 0.33 | 14.94 16.18 14.44 | clean; end check clear | **class A**: the judges' verdict PASS |
| L2a | 3b5c0441 | 11-19 00:07:51 | 00:10:42 | 00:37:24 | 26.7 | 0 | 0.92 9.17 12.02 | 17.33 17.04 16.12 | clean; end check clear | PASS |
| L2b | 3b5c0441 | 11-19 00:37:24 | 00:40:24 | 00:59:40 | 19.3 | 0 | 0.86 9.32 13.28 | 16.96 16.88 15.95 | clean; end check clear | **class A**: PASS |
| L2c | 3b5c0441 | 11-19 00:59:40 | 01:02:30 | 01:35:00 | 32.5 | 0 | 0.99 9.55 13.28 | 18.31 18.25 17.48 | clean; end check clear | PASS |
| L3a | 3b5c0441 | 11-19 01:35:00 | 01:38:00 | 02:15:38 | 37.6 | 0 | 0.92 10.00 14.40 | 15.55 16.86 16.88 | unclean: pid 1623502 openbox; end check clear | complete, 26 series; chrome-input `key_up desktop` 1 late, then 30 consecutive |
| L3b | 3b5c0441 | 11-19 02:15:38 | 02:18:28 | 02:39:20 | 20.9 | **1** | 0.91 9.54 14.05 | 17.14 16.75 16.07 | unclean: pid 1634962 openbox; end check clear | **class A. Stored: FAIL**, electron-input `key_up desktop`, no 30 consecutive in 33 (5 late); #302 listed apart: press_key background 4 of 30, desktop 7 of 30 (below). **Ruled: PASS under #302's key_up form** (rulings 864, 865, 869; task 107's re-judge, `m5/rejudge-302-keyup.txt`): 4 of 33 runs read the form (186.8–251.4 ms), trial 32 stays an honest miss, and trials 0–31 make the 30 consecutive |
| L3c | 3b5c0441 | 11-19 02:39:20 | 02:42:20 | 03:20:21 | 38.0 | **1** | 0.85 9.16 13.23 | 17.17 16.97 16.66 | unclean: pid 1645673 openbox; end check clear | **Stored: FAIL**, gedit `activate_window background`, no 30 consecutive in 39 (4 late); firefox-input right_click background 1 refused, then 30. **Ruled: a declared arm64 twice-load limit** (rulings 871, 872, 876; #429): ruling 872's experiment found X focus on the target at the answer in 200/200 and the key landing in 200/200, so typing goes to the right window |
| L3d | 3b5c0441 | 11-19 03:20:21 | 03:23:21 | 04:07:49 | 44.5 | **1** | 0.85 9.28 13.72 | 15.51 16.47 16.61 | unclean: pid 1673631 openbox; end check clear | **Stored: FAIL**, `activate_window background` on kate (3 late in 33), qtcreator (3 in 51), writer (2 in 39), gnome-terminal (2 in 40); gnome-terminal `click desktop` (2 in 31); gnome-terminal click background 1 late, then 30. **Ruled: a declared arm64 twice-load limit** (rulings 871, 872, 876; #429), as L3c |
| L3e | 3b5c0441 | 11-19 04:07:49 | 04:10:39 | 04:48:18 | 37.6 | 0 | 0.91 9.31 13.83 | 16.81 16.71 16.39 | unclean: pid 1715907 openbox; end check clear | complete, 37 series, no miss |
| L4a | 3b5c0441 | 11-19 04:48:18 | 04:51:18 | 05:12:44 | 21.4 | 0 | 0.85 9.16 13.51 | 15.06 16.21 15.82 | clean; end check clear | **class A**: no false ok, no missing landing beyond the residue; **residue (827 3b): cua plain 0 of 100, cua:handle plain 1 of 100, bound 2**; **ruling 830: cua left 1 of 30** (listed apart, not a fail, not a false ok); #365 0 of 60 |
| L4b | 3b5c0441 | 11-19 05:12:44 | 05:15:34 | 05:31:40 | 16.1 | **1** | 0.88 9.17 13.16 | 15.70 16.57 15.68 | clean; end check clear | **Stored: FAIL**, "cua:accept left: answered ok with no drop and nothing pending on 1 of 30 (#18)", the measurement lane `cua:accept`, not shipped (below); 5 false releases at the accept on its inzone-out cell, 2 answered ok. **Ruled: a finding, not a step failure** (rulings 871, 872): `cua:accept` sits behind `--drag-dnd-release-at-accept`, which nothing that ships can select; listed as at x64 |
| L4c | 3b5c0441 | 11-19 05:31:40 | 05:34:31 | 05:36:36 | 2.1 | 0 | 0.92 9.37 13.04 | 15.12 11.81 13.47 | clean; end check clear | every late take reported (5 of 5); 26 drags that never took answered as plain drags |
| L5 | 3b5c0441 | 11-19 05:36:36 | 05:39:26 | 05:41:04 | 1.6 | 0 | 0.88 6.68 11.21 | 12.96 9.13 11.63 | clean; end check clear | complete |
| F3a | 3b5c0441 | 11-19 05:41:04 | 05:43:44 | 06:04:40 | 20.9 | 0 | 0.89 5.34 9.79 | 15.53 17.11 15.44 | unclean: pid 1779092 openbox; end check clear | complete |
| F3b | 3b5c0441 | 11-19 06:04:40 | 06:07:30 | 06:22:25 | 14.9 | 0 | 0.91 9.68 12.85 | 15.50 16.31 15.28 | unclean: pid 1812417 openbox; end check clear | complete |
| F4 | 3b5c0441 | 11-19 06:22:25 | 06:25:16 | 06:30:25 | 5.2 | 0 | 0.90 9.22 12.71 | 15.21 13.66 13.69 | unclean: pid 1830303 openbox; end check clear | complete |

The openbox unclean ends are the known record-teardown race (ruling 730 (a)). Every end check was clear, and no start
check refused.

### D1's cross-check (§8.1 point 2; the controller's ruling and the design session's ruling 854)

`scripts/compare-drag.mjs` (in compare-settle.mjs's form) compares D1 at H‴ on 0.4.0 with D1 at H⁗ on 0.4.1, cell by
cell (`scripts/crosscheck-D1.txt`). Its own line reads DIFFERS, on one control-lane verdict. The controller and ruling
854 read it as matching: the cross-check is judged on the shipped lane, and the control lanes are listed apart with
both counts.
- **The shipped lane `cua`: identical in every cell.** Takes: select, range, scroller and dnd 30/30, canvas 40/40.
  Witnesses: clean, with dnd "changed" as declared. Verdicts: PASS, with dnd the declared #358 gap. The step verdict is
  PASS. Warm medians at H‴ / H⁗: range 126.1 / 126.1 ms, dnd 354.7 / 354.6, canvas 473.4 / 473.3.
- **The control and comparison lanes, apart** (H‴ against H⁗):
  - Chrome range `cua:0ms`: 29/30 (FAIL) at H‴, 30/30 (PASS) at H⁗;
  - Chrome scroller `cua:0ms`: 7/30 at H‴, 3/30 at H⁗ (FAIL both);
  - Chrome canvas newest: 21/40 at H‴, 24/40 at H⁗.

### V1 and the hold (the sitting, 23:15:57Z)

V1 exited 1 at 23:34:28Z, and its all-clear wrote hold-sittings. The audit counted 16 vendor-lane requests as changes
to windows the harness did not open:
- `SendEvent FocusOut` and `UnredirectWindow`, the vendor's per-request teardown;
- from the pinned build on gedit type_text, type_text_selection and clipboard_write, and from the newest on
  clipboard_write;
- on 0x01800064, 0x02c00064 and 0x01a00064.

Those three ids are the run's own gedit windows: the lane restores record them, and restarted gedits reuse them. Each
teardown came after the vendor ended its own gedit; V1 recorded scene ends of pinned 189, newest 63 and cua 0, all
declared. wrap71 had 0 flags and 0 decoy connections, there were no leftovers, the run's own side was clean, and the
pointer was restored. The cua lane's verdicts in V1 passed: 7 PASS rows and the caret case. The controller accepted
this as a harness fault in the audit's window ownership and cleared the hold at 23:36Z
(`h4/hold-sittings-cleared-2026-11-18T23-36Z.txt`). The fix goes to the design session. V1 stays in `h4/out/` as
recorded.

### The settle counter at H⁗ (`settle-check.mjs` over every step directory; `scripts/settle-check-h4.txt`)

| reading | steps |
|---|---|
| **TAKEN** (each already class A, rerun here) | H1 (entered 560, second_rest 0), H2 (entered 560, second_rest 15), L4a (entered 560, second_rest 11); skipped, unsettled and settle_failed_activation_confirmed 0 in each |
| not taken | L4b, L4c, L5, F3a, F3b (entered 0) |
| unknown (ruling 834: the counted runs keep no stats) | D1, D2, S1, L1, L2a, L2b, L2c, L3a–L3e, F4 (F4: 6 of 319 engines unrecorded; the recorded entered 0) |

No class-B step read TAKEN.

### The counter pilot, ruling 828(c) (uncounted; `h4/counter-pilot/`, `scripts/settle-check-pilot.txt`)

The class-B idle steps that ran at H‴ and send a drag or a handle (task 98's reach table) whose engines start through
engine.mjs, once each in pilot form at idle: `--dev --pilot 2 --engine-stats`, the home's 0.4.1 engine (06:30–07:14Z,
11-19). R1–R4, S2–S4 and ES are refused `--engine-stats` by the gate: their engines start through cua's service or
`cua serve`.

| step | settle-check | the pilot's own exit |
|---|---|---|
| D1 | not taken (12 engines) | 1: "chrome scroller: cua missed runs 0 1", with reach 146 px against the pinned mean 111 but "took" 0/2 for cua and the newest alike, a 2-sample artefact of the pinned build's own results; the counted D1 took 30/30 at both heads |
| D3, D4, D5 | not taken | 0 |
| E1 | not taken (133 engines) | 0 |
| P4, P6, P5 | not taken | 0 |
| C1 | not taken | 0 |

### The design session's open findings at H⁗

These are reported to the controller as they came, with the analysis files beside the records. Nothing reran.
- **L3b**, electron-input `key_up desktop` (`h4/l3b-keyup-302-check.txt`):
  - 5 late key-ups at 186.8–263.9 ms after the answer; key_up's settle is 50 ms;
  - none cold, answered in 0.2–3.5 ms;
  - each followed by late autorepeat key-downs;
  - #302's judge covers only `press_key`, and its counting criteria don't fit this page's autorepeat offset.
- **L3c and L3d**, `activate_window` and gnome-terminal `click desktop` (`h4/l3cd-confirmation-check.txt`):
  - activate_window (14 runs): the engine answers once the window is on top and its own SetInputFocus's reply is
    checked. The rows carry no engine-side confirmation time.
  - In those 14, the harness saw the window manager's `_NET_ACTIVE_WINDOW` name the target 85–108 ms after the answer.
  - The two click desktop runs are sent to the desktop as it is, with nothing waited for.
- **L4b:** `cua:accept` is gated by the engine flag `--drag-dnd-release-at-accept` (main.rs:181–182, default false,
  engine.rs:89–94 "Measurement only … Not shipped"). The shipped service's spawn passes `server --desktop <mode>` and
  nothing else (src/services/engine/linux/client.mjs:108).
- **Ruling 872's activation experiment** (development runs, never counted; `h4/a872/`, `scripts/activation-872*.mjs`,
  `.sh`, `a872b-chain.sh`):
  - The setup: on a private display at twice the load, 40 runs per family, each starting from the front window.
    `activate_window`, then one `press_key` "x" on the desktop route at the answer, a 500 ms witness watch, and the
    key's landing read from the target's own record.
  - The first run (`a872/full`, the focus read from the witness's 5 ms timeline): focus left the target 0 times in
    200, and the key landed 200/200. In 12 runs the timeline placed the focus change 0.1–6.7 ms after the answer,
    inside the witness's sample gap of 6.8–14.9 ms, so those 12 are unresolved.
  - The precise rerun (`a872/full-b`) read GetInputFocus and `_NET_ACTIVE_WINDOW` at the instant of the answer, on its
    own X connection (round trip median about 1 ms, max 7).

    | family | X focus on the target at the answer | `_NET_ACTIVE_WINDOW` the target at the answer | focus left the target in 500 ms | key landed in the target |
    |---|---:|---:|---:|---:|
    | gedit | 40/40 | 39/40 | 0 | 40/40 |
    | kate | 40/40 | 38/40 | 0 | 40/40 |
    | qtcreator | 40/40 | 40/40 | 0 | 40/40 |
    | writer | 40/40 | 37/40 | 0 | 40/40 |
    | gnome-terminal | 40/40 | 37/40 | 0 | 40/40 |

    The script's reading is (b). The smoke runs (2 per family) agreed.

### F2's private part, unjudged (development runs; `h4/f2/`)

- **The Chrome.** Current stable for arm64, **158.0.8127.36-1**, was fetched from Google's repository and checked
  (`scripts/fetch-chrome-stable.sh`, `.log`; `h4/chrome-158-index/`):
  - InRelease gpgv Good, by Google's key EB4C 1BFD … 4796; with one byte changed it fails;
  - the arm64 Packages sha256 is in InRelease, and the deb's sha256 `e06dc16e…` is in Packages.
  - It was extracted into its own directory and never installed. The judged 156 stayed installed and held.
  - A `google-chrome` wrapper with cua-provision's flags, first on PATH, made the harness's `CHROME_COMMAND` resolve to
    it (`scripts/f2-private.sh`). The harness records no Chrome version; that the runs drove 158 rests on this PATH
    chain: the driver's log names the 158 wrapper, gate.mjs:378 only prepends Firefox's directory, and app-env keeps
    PATH.
- **D1** (`--pinned --dev`, 07:36–08:00Z): exit 0, the judges' verdict for `cua` PASS.
- **S1** (08:00–08:34Z): exit 0, complete.
- **Waiting with the sitting:** V2's Chrome scene, V3 and V5 on Chrome 158 (F2's `:0` parts), and all of F3.

### Scan

The whole `m5/arm64/` was scanned before the commit (`scripts/scan-evidence.sh`, file names only): 2220 files, 0
token-shaped hits.

## At H⁵ (2026-11-19 09:20Z to 13:47Z; task 109)

The head is **H⁵ = `7d554dea`**. Its ci-gate is GREEN 8/8 (run 44494920319, on tree b1b92a7d, which equals
7d554dea's), and it was accepted under ruling 877. Its Decision Log entry is "the frozen head H⁵". The engine is still
**linux-engine-v0.4.1** (arm64 sha256 `8850abcb…`). The records are in `h5/`. Holder `task109-arm64`; the lock lines
are `h5/scripts/lock-lines.txt`.

### Setup and local proof

- **The checkout.** `t109-h5` is a fresh worktree detached and clean at `7d554dea` (0 changes before and after). It had
  `npm ci`, electron 44.9.0 and xprobe (aarch64), under the lock (`h5/scripts/setup-all.sh`, `setup-h5.log`).
- **The acceptance home.** `home-arm64-041` is reused, since the pin is unchanged (`h5/scripts/home-check.sh`, `.log`).
  - Its engine's sha256 is `8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0`, the brief's and the
    pin's arm64 asset, and it reads `cua-engine 0.4.1 (7522dcb8fb8c)`, statically linked.
  - `gate.mjs check --pinned` from the H⁵ checkout exited 0, attested by run 44380699966. The run home's secret store
    holds 0 entries.
  - Chrome is still 156.0.8078.73, held (`chrome-check.log`).
- **The proof** (H⁵ changes only the harness's judges and the audit's recording, and ci-gate covered the rest). Each
  part ran under the lock (`h5/scripts/proof/`, `proof.log`: "proof: PASS"):
  - the harness suite: 1368 tests, 1363 pass, 0 fail, 4 skipped, 1 todo (#425, ruling 860's declared gap);
  - harness-dbus: 91/91.

### The step table at H⁵

The `:0` steps ran through the sitting launcher (`sitting.mjs`) around run71.sh under M5's wrap71, each exactly as
`gate.mjs print` gave it with only its leading `locked.sh` stripped (`h5/scripts/run-sitting.sh`,
`sitting-locked.sh`, `sitting.sh`; `zero-commands.txt`).
- The sitting ran in one hold (CUA_LOCK_MAX 330m). V5's rerun, F2 and F3 each took their own hold
  (`chain-v5-f2-f3.sh`).
- Before each step the launcher checked that hold-sittings was absent. After each step `after-step.sh` read the
  step's kept traces, rejudge-audit and settle-check (`after-<step>[-suffix].txt`).
- The pre-checks are `zero-precheck*.out`: no hold, no stress-ng, the stand-in session's Chrome (pid 9512) the only
  `:0` client, the pointer at 640,400, and no leftovers.

Load is the 1-, 5- and 15-minute average. Every row ran at H⁵ on 0.4.1.

| step | stands on | step start (UTC, 11-19) | end | min | exit | load at start | load at end | all-clear | result |
|---|---|---|---|---:|---:|---|---|---|---|
| V1 | 7d554dea | 09:41:17 | 09:59:47 | 18.5 | 0 | 0.00 0.00 0.52 | 0.19 0.26 0.35 | clear | every verdict PASS. Text windows a lane ended: pinned 189, newest 63, cua 0, all declared vendor ends |
| V2 | 7d554dea | 09:59:47 | 10:15:48 | 16.0 | 0 | 0.19 0.26 0.35 | 0.82 0.89 0.72 | clear | every verdict PASS |
| V3 | 7d554dea | 10:15:48 | 10:49:49 | 34.0 | 0 | 0.82 0.89 0.72 | 0.38 0.73 0.78 | clear | no verdict FAIL. Listed apart: the chrome-input drag cua (declared refusal); right_click_fallback and secondary_action cua (declared unconfirmed); `activate_window` cua within the bound (cold [0.315, 0.405], warm [0.885, 0.955] against 1 ms) |
| V4 | 7d554dea | 10:49:50 | 11:14:56 | 25.1 | 0 | 0.38 0.73 0.78 | 0.34 0.35 0.43 | clear | every verdict PASS; every paste case |
| Z0 | 7d554dea | 11:14:56 | 11:24:56 | 10.0 | 0 | 0.34 0.35 0.43 | 0.20 0.39 0.46 | clear | the judges' verdict for `cua`: PASS (firefox dnd `cua:0ms` missed a run, as at x64) |
| V5, first attempt | 7d554dea | 11:24:57 | 11:25:27 | 0.5 | 1 | 0.20 0.39 0.46 | 0.32 0.40 0.46 | **not clear**: hold-sittings | **stopped by wrap71** 19.5 s into the run, with no verdict (below). Kept as `V5.pinned-release.stopped-1` |
| V5 | 7d554dea | 11:29:20 | 12:05:21 | 36.0 | 1 | 0.02 0.19 0.36 | 0.47 0.53 0.54 | clear | **FAIL**: `chrome_dnd_shared` cua and `chrome_dnd_short_in_front_shared` cua. 50 other rows pass. **The FAIL stands at H⁵ (ruling 886)** (below) |

| step | wrap71 samples | flags | decoy connections | leftovers | pointer | owner side |
|---|---:|---:|---:|---|---|---|
| V1 | 9845 | 0 | 0 | none | restored, reads 640 400 | Chrome profile mtime only |
| V2 | 8174 | 0 | 0 | none | restored | mtime only |
| V3 | 17627 | 0 | 0 | none | restored | mtime only |
| V4 | 12874 | 0 | 0 | none | restored | mtime only |
| Z0 | 4844 | 0 | 0 | none | restored | no difference |
| V5, first attempt | 228 | **1** | 0 | none | restored | no difference |
| V5 | 16783 | 0 | 0 | none | restored | mtime only |

The owner side's one difference is the stand-in session's Chrome writing its own profile's mtime, as in every sitting.
The harness's Chrome was the judged 156 in every counted step: wrap71's process records name `/opt/google/chrome` or
`/usr/bin/google-chrome-stable` for every harness Chrome process (V2 33, V3 37, V5 54) and Chrome 158's path for none.

### V5 at H⁵: two cells FAIL, and the FAIL stands (ruling 886)

V5 was judged live, with ruling 680 encoded (867a). Its verdict reads "FAIL: device-chrome-dnd chrome_dnd_shared cua,
device-chrome-dnd chrome_dnd_short_in_front_shared cua". No cell reads incomplete and no sample was excluded as premise
unmet, so this is not route D's stop.

| cell | the judge's reason | the samples |
|---|---|---|
| `chrome_dnd_short_in_front_shared` cua | "a drag answered ok with no drop and nothing pending on 1 of 9 samples (1/2); the effect was not verified on 1 of 9 samples (1/2)". drops: samples 9, landed 8, ok 9, **false_ok 1**, unconfirmed_landed 0 | 1/2 (warm, 252.67 ms): ok, no notice, `press.taken` false. The page counted one more dragstart and one more dragend, no drop (34 → 34), and effect 1 → 0 |
| `chrome_dnd_shared` cua | "not cancelled with the drag-and-drop sentence on 2 of 9 samples (1/0, 2/0)" | each block's cold first sample (158.24 and 157.5 ms): a plain-drag ok, `dnd.outcome` no_start, `press.taken` false, no notice. The page counted one more dragstart and dragend and no drop |

- **The cause (task 112's diagnosis; the Decision Log's entry for ruling 886).** In all three samples, Chrome's
  renderer ran dragstart **after** the engine's release: 47.3 ms after it (in front, 1/2), 107.9 ms (cancel, 1/0)
  and 98.8 ms (cancel, 2/0). The engine had answered within 2.5 ms of its release.
  - The browser refused the drag at the IPC level, because dragstart came after the button-up. Nothing the engine
    could see at the X level separates these drags from a plain drag: its XdndSelection watch and its press watch saw
    nothing.
  - The settle did not run and could not have: `drop_settles.entered` is 0 on every stats line.
  - The mode was already met at M4's gate (candidate 1), so it is not arm64-only.
- **In-front 1/2 is a judged false ok.** In the cancel cell nothing changed on the desktop at the X level.
- **A fix is being measured for linux-engine 0.4.2.** V5's stored verdict stands as recorded beside the ruling.
- `chrome_dnd_late_take_shared` cua passes under the encoded 680 rule. Its span-limited samples are 0/0 (dragend
  305 ms, answer 157.5), 1/0 (302, 157.43), 1/2 (264, 156.37), 2/0 (310, 157.46) and 2/2 (265, 156.58).

### The stopped first attempt, and its clearance (`h5/out/V5.pinned-release.stopped-1/`)

V5's first attempt read NOT CLEAR 25 s into its run (`flags.jsonl`, `wrap-summary.json`, `all-clear.txt`). The
controller cleared the hold under ruling 730(b) (`h5/out/hold-sittings-cleared-2026-11-19T11-40Z.txt`).
- **The findings, by kind:**
  - 1 outside-peer-connection: t 19.471 s, pid 2181578 (no record: it lived under one ~107 ms sample gap), peer
    `@37d51` (a Linux autobind address), no peer pid, inode 19820785;
  - 0 decoy connections, 0 window findings and 0 audit rows. The run reached only its begin row.
  - The all-clear's second line, the missing end row, follows from wrap71's stop (the harness exited 143).
- **What the records show.** The flagged process sat between the run's own google-chrome-stable launch (pid 2181571,
  19.453 s, run-owned profile) and that Chrome's first renderer (19.578 s).
  - No listener held `@37d51` afterwards. The stand-in session's Chrome and its crashpad handlers were alive and would
    have shown a live listener.
  - The extended 773 rule flags an autobind connection whose holder is absent by design, so the guard failed closed.
    Nothing reached a person: this VM's `:0` is nobody's display.
- V5 reran whole into a clean directory, under every guard. Its command is identical to the sitting's
  (`zero-commands-v5r.txt`).

### Kept traces and rejudge-audit (rulings 858(b), 863)

Every audit row of every V step carries `kept_traces` with its files, and `rejudge-audit.mjs` over each step
directory reproduces the stored findings (`h5/scripts/after-*.txt`, `.rejudge.jsonl`).

| run | audit rows | with kept traces | files | rejudge-audit |
|---|---:|---:|---:|---|
| V1 | 16 | 16 | 20 | reproduces: moved 0, unkept 0, foreign 0 stored / 0 now |
| V2 | 30 | 30 | 30 | reproduces (the same) |
| V3 | 69 | 69 | 69 | reproduces |
| V4 | 28 | 28 | 28 | reproduces |
| V5 | 52 | 52 | 52 | reproduces |
| F2 V2, V3, V5 | 30, 69, 52 | all | 30, 69, 52 | reproduces in each |
| F3 V2 | 30 | 30 | 30 | reproduces |
| Z0; V5's first attempt; F3 V3 | 0 | – | 0 | nothing to re-judge. Z0 is an experiment with no route audit, and the two stopped runs reached no audit |

The traces are not committed. All 380 files are on the x64 host under `~/.local/share/cua-171/m5/arm64-h5-traces/`
(`out/`, `f2/`, `f3/`, each `<step dir>/run/audit-traces/…`), copied before the VM's lease ends. Each file is listed
with its sha256 in `h5/scripts/kept-traces.sha256`.

### The settle counter at H⁵ (`h5/scripts/settle-check.txt`)

| reading | steps |
|---|---|
| **TAKEN** | none |
| not taken (every engine's counter at 0) | V1, V2; F2 V2; F3 V2 |
| unknown (ruling 834; every recorded counter entered 0) | V3 and V4 (2 audit engines each run with `stats: false`), V5 (20 of 218), Z0 (no stats); F2 V3 and V5; and the two stopped runs (one engine each, unrecorded) |

### F2's `:0` parts, unjudged (development runs; `h5/f2/`)

V2, V3 and V5 ran on current stable **Chrome 158.0.8127.36**, in one hold (12:05:22–13:30:31Z), with `--dev`
(`zero-commands-f2.txt`). It was extracted and never installed, as in F2's private part (`h4/f2/`). The judged 156
stayed installed and held.
- **Which Chrome ran.** The sitting put the 158 wrapper first on PATH (`chrome-stable/158.0.8127.36-1/bin`), and each
  step logged `google-chrome --version`: "Google Chrome 158.0.8127.36" (`h5/f2/zero.log`).
- The records confirm it. wrap71's process records show every harness Chrome process launched from the 158 tree
  (V2 34, V3 41, V5 67) and none from `/opt/google/chrome`.
- **V2:** every verdict PASS; the all-clear is clear (8027 samples, 0 flags).
- **V3:** no verdict FAIL, with the same listed-apart cells as the counted V3; clear (17486 samples, 0 flags).
- **V5:** FAIL on `chrome_dnd_shared` cua, 1 of 9 samples (2/0, cold, 157.65 ms, a plain-drag ok with no take). That is
  the counted run's shape, met once here on Chrome 158. `chrome_dnd_short_in_front_shared` passed: 9 landed, 0 false
  ok. `chrome_dnd_late_take_shared` passed, with span-limited samples 0/0, 1/0 and 2/0. The all-clear is clear (16688
  samples, 0 flags).

### F3, the vendor's third build, unjudged (development runs; `h5/f3/`)

V2 and then V3 ran once each with **26.1111.21308** given as `--newest`, against the same pinned home and its engine
(`gate.mjs print V2|V3 --pinned <home> --dev --newest <its sky_linux_arm64>`; `zero-commands-f3.txt`). They ran in one
hold, 13:30:31–13:47:03Z. The build was verified by T6 (`pilot/README.md`): the deb's sha256 is `c5c5aa09…` and its own
`_gpgorigin` gives GOODSIG and VALIDSIG. Its `sky_linux_arm64` sha256 `99c69092dcd74f147c6eb6db818dc6810264d72913513a9ade0354e4125c9eef`
was read again before the run.
- **V2:** "development run, not a release gate: every verdict PASS"; clear (8086 samples, 0 flags).
- **V3:** **stopped by the guard** 6.6 s into the run, with no rows beyond its begin. It stands as stopped, with no
  rerun (the controller, under ruling 773, as x64's F3 V3).
  - The flag was 1 outside-peer-connection: t 6.565 s, pid 2524837, the run's own google-chrome-stable launch (seen
    once at 6.534 s, run-owned profile). Its peer was `@d9dd9` (autobind), peer pid 2524876 with no record, inode
    22572618.
  - That pid's number sits among the run zygote's children forked at 6.672–6.674 s.
  - There were 0 decoy connections and 0 window findings.
  - The controller cleared the hold under ruling 730(b) (`h5/f3/hold-sittings-cleared-2026-11-19T13-55Z.txt`).
- So V3's `scroll` and `drag` have no third-build medians on arm64. x64's came from its stopped V3's raw rows, which ran
  long enough to complete chrome-input; this one stopped before any sample.

The operations from F3's V2, three medians each (cold / warm, ms): the pinned build, the third build, cua. F3's V3 gives
none.

| scene | op | cold: pinned / 26.1111.21308 / cua (ms) | warm: pinned / 26.1111.21308 / cua (ms) |
|---|---|---|---|
| gedit | tree | 197.8 / 193.3 / 54.6 | 191.5 / 187.5 / 49.8 |
| chrome | tree | 185.4 / 185.1 / 69.8 | 181.6 / 179.9 / 65.7 |
| gedit | tree_shot | 308.2 / 307.2 / 77 | 297.8 / 298.9 / 59 |
| chrome | tree_shot | 298.4 / 299.7 / 97.7 | 292.7 / 292.4 / 76.6 |
| gedit | press_key | 271.7 / 238.7 / 5.4 | 267.4 / 234.3 / 0.5 |
| chrome | press_key | 271.9 / 238.8 / 4.7 | 267.6 / 234.5 / 0.5 |
| gedit | click | 217.6 / 218.2 / 17.8 | 213.2 / 213.5 / 12.7 |
| chrome | click | 217.4 / 218.1 / 16.8 | 213.3 / 213.6 / 12.8 |

### Scans (rulings 863, 874, 875)

- **Token-shaped strings** (`scripts/scan-evidence.sh`, file names only): the whole `m5/arm64/`, 2595 files,
  0 hits.
- **No `:0` window title or key code** in the committed `h5/` (`h5/scripts/privacy-scan.mjs`, `privacy-run.sh`):
  - The check took the titles of every `:0` client window at the time of the scan (`_NET_WM_NAME`, `WM_NAME` and
    `WM_ICON_NAME` of the stand-in session's Chrome, the only client; the harness's windows were gone). They were
    piped from the VM straight into the scan, never written or printed, and each was counted in every file.
  - It also counted rows whose held-release samples or findings name a key or button code (task 106's pattern), and
    minimized rows whose events carry a raw numeric code or whose key lists hold codes.
  - The result: 375 files, 3 titles looked for, **0 title hits, 0 held-code rows, 0 raw minimized codes**.
  - Positive controls: the same scan finds x64's V3 at H (`m5/x64/out/V3.pinned-release`): 2 held-code rows and 27 raw
    minimized codes, before ruling 874's tokens. A title known to be in those rows is found too.

## Files

- `h5/`: the H⁵ part (`out/`: the counted sitting, V5's stopped first attempt and its clearance; `f2/`: F2's `:0`
  parts on Chrome 158; `f3/`: F3, with V3's stop and its clearance; `scripts/`: task 109's launchers and records, the
  after-step readings, `settle-check.txt`, `kept-traces.sha256` and the scans). The kept route-audit traces are left
  out (on the x64 host, above).
- `h4/`: the H⁗ part (`out/`: the counted steps and V1; `counter-pilot/`; `f2/`; `a872/`; the hold's clearance record;
  Chrome 158's index; the L3b and L3c/L3d analyses).
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
