# #171 M5 T6, the arm64 pilot (task 96), 2026-11-18

**Development runs on the pinned release, never counted.** This is arm64's first live run of every gate step, each once
in its smallest form (`gate.mjs run <step> --pinned <home> --pilot 2`: the gate value `pinned-dev`, the engine taken by
the pinned rule inside each step). No verdict here is T7's. A finding is analysed and sent to the controller, not fixed
here: the fixes go to T4's arm64 part under the pre-flight's §8.1 on both architectures.

- **The VM:** `dc-linux171arm-996d`, GCE `c4a-standard-8` (8 vCPU Google Axion, 31 GB), us-west1-a, Ubuntu 24.04.5
  aarch64, kernel 7.0.0-1017-gcp. It was created by the design session at `feat/171-m5` da306cc6, which is H″ (a5218d94)
  plus docs and tests only. It was reached as `ssh cua-171-arm64`.
- **Checkout:** `t96-arm64`, a fresh git worktree of the VM's clone, detached and clean at
  `da306cc6319e7e9da282812402308c074b872dee`. It had `npm ci`, electron v44.9.0 and xprobe (aarch64) built through the
  cargo wrapper under the lock, with 0 changes before and after (`scripts/setup.sh`, `setup.log`).
- **The pilot home:** `~/.local/share/cua-171/m5/pilot-arm64/home` (CUA_HOME). Its own `cua install` ran under a HOME
  and XDG directories of the run's, with an empty secret store (0 entries) (`scripts/install-home.sh`, `.log`).
  - It placed 26.928.40906-linux-arm64, the sandbox helper, Node 24.22.0 for cua's REPL host, and
    **linux-engine-v0.4.0**.
  - `cua-engine` sha256 `0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42` is the pin's arm64 asset:
    `cua-engine 0.4.0 (c55c8e08d9cb)`, `ELF 64-bit LSB executable, ARM aarch64 … statically linked`, install.json build
    `pinned`.
  - `gate.mjs check --pinned` exited 0 with the attestation verified (linux-engine.yml runs 43637317960 on
    `release/linux-engine-v0.4.0` and 43608161213, GitHub-hosted, both naming the arm64 subject).
- **The host lock:** a copy of the x64 VM's `locked.sh` at the same path, with `CUA_LOCK_MAX` (holder `t96-arm64`).
  Every build, suite, step and sitting ran under it (`scripts/lock-lines.txt`).
- **The run's Node** (the controller's word): Node **24.22.1** linux-arm64 at `~/.local/share/cua-171/node24`, checked
  against nodejs.org's SHASUMS256 (Good signature on the SHASUMS file too; `scripts/install-node.sh`, `.log`).
  - It is first on PATH for every harness command, so the printed `:0` commands name it as `process.execPath`.
  - The image's `/usr/bin/node` 26.13.1 (NodeSource) is left untouched for devcloud's tooling.
  - x64's harness ran on `/usr/bin/node` 24.22.1.
- **Time zone:** the VM's is **America/Los_Angeles**, where the x64 VM's logs are UTC (the controller's note). Every
  launcher here writes UTC. No step's record was seen to read local time. The only local times in the records are
  `ls`-style mtimes in the install logs and gpgv's "Signature made … PST" lines.

## The install (pre-flight §7.2, as amended for GCE)

| item | what | record |
|---|---|---|
| 2 | Google Chrome **156.0.8078.73-1 arm64** from Google's pool (`…/pool/main/g/google-chrome-stable/google-chrome-stable_156.0.8078.73-1_arm64.deb`), installed before the template, so the template's own Chrome step found it, then `apt-mark hold` | `scripts/install-sys.sh`, `.log` |
| 1 | the template `deploy/cloud-vm/cua-provision.sh` at the checkout's head, with conf `CUA_USER=new CUA_REF=feat/171-m5 CUA_REPO=https://github.com/SSFSKIM/cua CUA_DEB=pin CUA_EXTENSION=hosted`: exit 0, `cua install 26.928.40906-linux-arm64` in the VM's default home, doctor exit 0, lightdm autologin to Openbox on `:0` with Xorg's **dummy** driver (no `/dev/dri`) | same |
| 3–5 | the matrix's applications, the harness's tools, the fonts: every package at **the same version as on the x64 VM** (21 compared, all equal: `scripts/package-versions.txt`) | same |
| 6 | Mozilla **Firefox 159.0~build1 arm64**: Mozilla's InRelease verified (gpgv, key 35BAA0B3…15A3), its arm64 Packages hash in it, the deb's sha256 `b95e877e…` equal to the index's. Unpacked to `task59/firefox-deb/root`, and `task59/bin/firefox` first on PATH, as on x64. Never the snap: no snap browser is installed | `scripts/install-user.sh`, `.log` |
| 7 | Rust **1.94.1** through rustup (minimal profile), for xprobe only, and the cargo-under-the-lock wrapper | same |
| 8 | the checkout's `npm ci`, Electron, xprobe | `scripts/setup.sh`, `.log` |
| 9 | the vendor builds (below) | `scripts/vendor-arm64.sh`, `vendor-arm64.log`, `vendor-one.sh`, `vendor-21308.log` |
| 10 | the plumbing: the ssh alias `cua-171-arm64` on the VM reaching itself (its own key in `authorized_keys2`), the parity clone `~/Developer/GitHub/cua-parity` with the tag `linux-engine-v0.4.0` → c55c8e08, and `gh` signed in (status checked, not printed) | `scripts/install-user.log` |

**The vendor builds.** Each was checked by signature against the vendor key `3BFA0E4AE8B8CC16A2D9BA684A3B4A566C4660E4`
("Codex Linux Repository"), fetched by fingerprint from keyserver.ubuntu.com into a throwaway keyring.

- **Pinned, 26.928.40906 arm64:** `cua install` checks it against the pin. `sky_linux_arm64` sha256 `a2ee3b61…`.
- **NEWEST, 26.1023.51421 arm64** (C12):
  - The deb is 494,741,274 bytes, sha256 `e7478d84…`.
  - Today's index no longer lists it, so the index chain can't reach it. The signed 2026-10-27 InRelease kept from the
    x64 fetch (gpgv Good) names that day's arm64 Packages hash `48049e78…`, but the repository serves no by-hash copy.
  - The deb's own `_gpgorigin` gives GOODSIG and VALIDSIG 3BFA0E4A…. Without `debian-binary` it is BADSIG.
  - Extracted to the gate's NEWEST path (`vendor/deb-26.1023/extracted`). `sky_linux_arm64` sha256 `b407257f…`.
- **The third build, 26.1111.21308 arm64** (F3):
  - **Today's signed index (2026-11-17T19:30Z) lists 26.1111.71025, no longer 26.1111.21308.**
  - 21308 was fetched from the pool by name (553,033,238 bytes, sha256 `c5c5aa09…`). Its `_gpgorigin` gives GOODSIG and
    VALIDSIG, BADSIG without `debian-binary`. It is extracted to `vendor/deb-26.1111/extracted`.
  - 71025 passes the index chain: InRelease gpgv Good, the Packages hash in it, the deb's hash in Packages, and its own
    `_gpgorigin`. It sits apart in `vendor/deb-26.1111.71025`.
  - Both builds' `sky_linux_arm64` are **byte-identical** (`99c69092…`), so F3's engine is the same either way.
- Copies of the 26.1023.51421 and 26.1111.21308 arm64 debs are kept off the VM, on the x64 VM's
  `~/.local/share/cua-171/vendor/arm64/` (C12).

## The checks before the pilot (`scripts/checks.sh`, `checks.log`)

- `uname -m` gives **aarch64**. The user is uid **501** (`new`), home **/Users/new**, the same in passwd.
- `:0` is lightdm's autologin session `c1` (x11, seat0). Xorg runs the **dummy** driver (`LoadModule: "dummy"`,
  `/etc/X11/xorg.conf.d/10-cua-dummy.conf`) at **1280x800**, 24 planes, 96 dpi. Openbox is the window manager.
- **The x64 VM's `:0` is also 1280x800**, on modesetting with `card0`. So no scene meets a different screen size, and
  none was seen to assume one.
- AT-SPI IsEnabled is true.
- The template's autostarted Chrome (Default profile, pid 9512) stands in as the person's Chrome for owner-check.sh.
  This VM's `:0` is nobody's.
- `cua doctor` in the pilot home (CUA_NATIVE_ENGINE=cua, DISPLAY=:0) exits 0. `engine` PASS gives 0.4.0, the pin's hash
  and service `cua`. Only the three `chrome.*` rows are BLOCKED, as in any run home.
- There is no snap browser, and neither firefox nor chromium is on the system PATH.
- Node is 24.22.1 for the run (`~/.local/share/cua-171/node24/bin/node`); the system's is 26.13.1.
- Chrome is `Google Chrome 156.0.8078.73` through `/usr/local/bin/google-chrome` (the template's wrapper), held.

## The steps

Every step ran once in the pilot form (`--pinned <home> --pilot 2`), each in its own hold of the host lock (holder
`t96-arm64`, no cap expiry), capped at 45 minutes (none reached it). Before each private step the driver checked
hold-sittings and stress-ng, and waited for the 1-minute load to fall below 1.0. "unjudged" is the pilot's own list: a
series too short for its rule, or a speed series a pilot takes no top-up for (ruling 722). It is never a pass. Each
step's record is `<out root>/<step>.development-run.pinned.pilot/`.

### The private idle steps (`out/`, 01:16–03:45Z)

| step | min | exit | result |
|---|---:|---:|---|
| D1 | 1.7 | 0 | no FAIL; Chrome dnd and canvas speed unjudged |
| D2 | 1.5 | 0 | PASS |
| D3 | 1.6 | 0 | no FAIL; Firefox canvas speed unjudged |
| D4, D5 | 5.3, 3.2 | 0 | PASS. GTK 4's select and scale4 are 0/2 for every engine, as on x64 |
| R1 | 25.7 | **1** | the cua lane passes **34/34**. The vendor lane fails 3 cases, and the diff exits 1: **arm64's vendor outcomes, not yet declared** (finding 1) |
| R2 | 18.3 | 0 | `VERDICT: PASS` by in-cell time; unproved empty. The vendor lane's typeText and paste ended gedit on every sample (`target: exited`); R2's better-outcome rule passes cua |
| R3 | 3.2 | 0 | linux-native passes; engine watch PASS: only the home's installed cua-engine, under the trusted worker, no sky_linux |
| R4 | 0.9 | 0 | linux-device-mode passes; engine watch PASS |
| FB | 0.4 | 0 | every step PASS |
| E1 | 2.3 | **1** | one scenario differs: "an interrupted drag under a held key, then a move" (finding 2). 17 desktop groups unjudged |
| S1–S4 | 8.6, 5.4, 6.6, 6.3 | 0 | unjudged 50, 30, 31, 37 (every one "a series of 2"). The misses are x64's pilot's, the same cells: S1 chrome-input and electron-input move desktop, 1 late each; S2 firefox-input right_click background, 1 refused |
| F1a, F1b | 4.0, 3.3 | 0 | unjudged 24, 9; audits clean |
| F2 | 3.9 | 0 | complete |
| ES | 2.5 | 0 | complete (engine-stop through `cua serve`) |
| P1–P4, P6 | 3.8–4.2 | 0 | PASS (the leave cases) |
| P5 | 18.3 | 0 | PASS |
| H1, H2 | 1.8, 2.1 | 0 | no false ok, no missing landing, no false error |
| C1 | 0.5 | 0 | every late take reported (2 of 2; take after the release 0.9 / 1.5 ms) |

S1–S4, F1a, F1b, F2, ES, L3a–L3e, F3a, F3b and F4 end "unclean" on the experiment display's own Openbox. That is the
record's race with the display's teardown, as on x64 (task 89's README), and never a verdict failure. Every step's end
check was clear.

### The `:0` sitting

arm64's `:0` is nobody's display (pre-flight §1.1): no GO and no announcement, but the same guards. Each step ran from
`gate.mjs print`'s command through `sitting.mjs` around run71.sh under M5's wrap71 copy, inside one lock hold per sitting
(`scripts/sitting*.sh`, `zero-commands*.txt`, `zero-precheck*.out`, `zero-<step>*.out`). Three sittings ran, because two
harness defects and one guard stop each wrote hold-sittings. The controller cleared each one, with its record in
`holds/`.

| sitting | out root | step | UTC | exit | all-clear | what happened |
|---|---|---|---|---:|---|---|
| 1 | `out-zero/` | V1 | 04:34:38–04:35:08 | 1 | **not clear** | **stopped by wrap71** at 11.7 s: `run-chrome-home-not-the-runs` and `run-chrome-profile-not-the-runs`. The run's Chrome lived under `/tmp/cua171-run-QDzJHO`, outside run71's TMPDIR, because the pilot run name `m5-pinned-dev-V1-pilot` is too long for scenes.mjs `scratchRoot` (finding 3). Nothing reached the person |
| 2 | `out-zero-r1/` | V1 | 04:37:52–04:43:22 | 1 | **not clear** | run as printed with only `--run pdev-V1` (the controller's ruling (a); `scripts/print-zero-r1.sh` checks scratchRoot). **The harness threw** in `restoreLaneScene`: "…-gedit-text_newest did not close for its scene's restore". This is X window-id reuse across the two vendor lanes (finding 4). V1 is **not shown** in this pilot |
| 2b | `out-zero-r1/` | V2 | 04:45:29–04:49:59 | 0 | clear | run valid, no verdict FAIL: 1 PASS, 14 unjudged |
| 2b | `out-zero-r1/` | V3 | 04:49:59–04:58:00 | 0 | clear | no verdict FAIL: 27 PASS, 11 unjudged. Listed apart: declared refusal chrome-input drag; declared unconfirmed right_click_fallback and secondary_action. #373's activate_window cold 2.62 ms against the bar's 2.43 (x64: 12.05 against 3.66), unjudged at n = 1 |
| 2b | `out-zero-r1/` | V4 | 04:58:00–05:09:00 | 0 | clear | no verdict FAIL: 19 PASS, 3 unjudged |
| 2b | `out-zero-r1/` | V5 | 05:09:00–05:10:01 | 1 | **not clear** | **stopped by wrap71** at 34.3 s: `outside-peer-connection` from the run's own Chrome launcher (pid 336134, `/bin/bash /usr/bin/google-chrome-stable … --user-data-dir=/tmp/c71-…/cua171-run-…`) to the abstract address `@011e2`, with no peer pid (finding 5) |
| 3 | `out-zero-z1/` | V5 | 05:13:15–05:30:46 | 1 | clear | run valid: 50 PASS, **FAIL** on `chrome_dnd_shared` (the audit pass) and `chrome_dnd_late_take_shared` (the witness span), the two cells that failed in x64's V5 (finding 6) |
| 3 | `out-zero-z1/` | Z0 | 05:30:46–05:32:46 | 0 | clear | the judges' verdict for cua: PASS (Firefox dnd and Writer select); the cua:0ms control FAILs as designed |

- **V1–V5 in `out-zero-r1/` ran without the session-bus decoy.** wrap71's decoy thread threw
  `OSError: AF_UNIX path too long` binding `<step dir>/decoy/session.sock`, a 108-byte path under that out root with
  the pilot's label, and wrap71 ran on without it. The first sitting's V1, under `out-zero/` (105 bytes), had both
  decoys. So their "0 decoy connections" does not cover the session bus. The
  a11y decoy bound. The third sitting ran under the short out root `m5/pa/z1` (91- and 88-byte decoy paths, checked
  first by `scripts/print-zero-z1.sh`), and no decoy failed (finding 7).
- **The guards, every step:** the pointer read 640,400 and was restored to 640,400. tmproot was left empty. No
  `/tmp/cua171-run-*` was left. The run's own side was clean. owner-diff's one difference, where there was one, is the
  owner-side Chrome's own profile mtime (pid 9512, never signalled), as in every x64 sitting.
- **Not on `:0` in this pilot:** V1's verdicts, and V5 under the session-bus decoy is shown only by its third sitting.
  `out-zero/V2…Z0` hold only the commands' printed READMEs; those steps never started there. A `:0` step's README
  names the printed run (`m5-pinned-dev-<step>-pilot`) where the rerun ran as `pdev-<step>`; `zero-commands-r1.txt` and
  `-z1.txt` are what ran.
- **The read-only observer beside sitting 3** (`scripts/ss-watch.sh`, summary `ss-watch-z1-summary.txt`): 24 distinct
  autobind-shaped (`@xxxxx`) addresses, every one held by `chrome` or `chrome_crashpad`. Nothing flagged in that
  sitting. The raw log (60 MB) stays on the VM.

### The block at twice the load (`out/`, 05:33–07:07Z)

| step | exit | result |
|---|---:|---|
| L1, L2a, L2b, L2c | 0 | PASS or no FAIL; unjudged speeds 0, 2, 0, 1 (the drag pilots drop the load) |
| L3a–L3e | 0 | unjudged 26, 24, 30, 31, 37 (series of 2). Misses, each followed by a 2-streak: L3b electron-input key_up desktop 1 late; L3c firefox-input right_click background 1 refused (as x64's pilot L3c); L3d writer activate_window background 1 late |
| L4a | **1** | **a false ok in the shipped handle lane**: "cua:handle left: answered ok with no drop and nothing pending on 1 of 2 (#0)" (finding 8) |
| L4b | 0 | every late take reported, no false ok, no missing landing |
| L4c | 0 | every late take reported (1 of 1, 0.5 ms after the release) |
| L5 | 0 | complete |
| F3a, F3b | 0 | unjudged 24, 9; audits clean |
| F4 | 0 | complete |

### Follow-ups the controller asked for

- **R1's three vendor outcomes, rerun 3 times** (ruling 810; `vendor-reruns/rerun-{1,2,3}`, `scripts/vendor-reruns.sh`,
  `vendor-outcomes.mjs`). Each rerun is R1's parity vendor lane whole, on its own private desktop and preparation
  (repl-parity selects no single case). The pinned check exits 0, on release 26.928.40906-linux-arm64. The first
  attempt failed before anything ran, on my launcher's long dbus socket path, and is kept as `vendor-reruns/attempt-1/`.
  The counts below are over 4 samples (R1 plus 3 reruns). The case order is the same each time: presskey #32 passes,
  then typetext #33, then paste #34; minimized is #22 of 34.
  - **typetext**: the outcome is stable at 4/4: an error, the marker unreadable (`null`), gedit ended (`true`). The error
    text is intermittent:
    - 3/4: `NATIVE:[{"error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.63 was not provided by any .service files"},null,true]` (about 795–799 ms);
    - 1/4 (R1, 2849.6 ms): `NATIVE:[{"error":"Resource temporarily unavailable (os error 11)"},null,true]`.
    - The assertion each time: "native text input must return without an error".
  - **paste**: stable at 4/4:
    `NATIVE:[{"error":"Linux paste supports only text format."},{"error":"Linux paste supports only text format."},{"error":"D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.ServiceUnknown: The name :1.66 was not provided by any .service files"},null,true]`.
    - **This is paste's own crash, not a consequence of typetext's.** Each native case has its own serve and its own
      fresh gedit (`nativeCommand` in scripts/repl-parity/native.mjs: a new `cua-m4-<uuid>.txt` per case).
    - paste's gedit had bus name :1.66 where typetext's had :1.63, and paste's last field `true` is its own window
      exiting.
    - R2's baseline shows `target: exited` on its own samples of each method.
  - **getaxstate/minimized**: stable at 4/4, byte-identical to x64's declared defect:
    `NATIVE:[{"listed":false,"others":true,"focusedFront":true},{"error":"Window <id> is unavailable."},{"error":"Window <id> is unavailable."},{"error":"Window <id> is unavailable."},{"error":"Window <id> is unavailable."},{"restored":false},{"error":"Window <id> is unavailable."}]`.
    The assertion: "the minimized window must be listed with minimized: true, no other window with the field, and the
    focus on the fixture's own window".
- **E1 repeated 3 times** (`out-E1-repeat-{1,2,3}`), exit 1 each, on the same one scenario. Across E1 and its repeats
  (4 runs), cua's drag answered `{"ok":true,"x_window_error":false,"child_pressed":true}` in 0.82, 0.91, 0.74 and
  0.83 ms. In each run the fragile child recorded the whole drag before it died: the press, 15 MotionNotify and one
  ButtonRelease. x64's cua answered `{"ok":false,"x_window_error":true,…}` in both runs on record (2.66 ms in T5,
  3.54 ms in the x64 pilot), its drag cut off after the press. The pinned and newest builds answer ok:false with the
  X Window error (TranslateCoordinates) on both architectures. E1's records hold no X request trace, so they cannot
  order cua's requests against the DestroyNotify.

### L4a false ok: the rate (the controller's word)

L4a's whole plan (`t17-fix3`, 560 drags) ran in the pilot form with `--pilot 100`, which caps none of its cells. It ran
at twice the load from 07:09 to 07:30Z (`l4a-rate/L4a/`), then as H1, the same plan at idle, from 07:33 to 07:51Z
(`l4a-rate/H1/`). Both are development runs on the pinned engine, with nothing changed. The analysis is
`scripts/l4a-analysis.mjs`, with its outputs `l4a-analysis-load2.txt` and `l4a-analysis-idle.txt`.

| | twice the load | idle |
|---|---|---|
| cua:handle left (off the zone) | **1 false ok of 30** (#20); 29 unconfirmed | 0 of 30; 30 unconfirmed |
| cua:handle plain | 99 of 100 landed; **1 missing landing** (#20, answered unconfirmed) | 100 of 100 landed |
| every other cell (cua, cua:desktop, the other cua:handle cells) | as expected: plain 100/100 landed, each off-zone cell 30/30 unconfirmed, #365's race 0/60 | the same |
| landed but answered unconfirmed | 5 (cold handle drops at load, #364) | 0 |
| the judge | fails on the two #20 lines | pass |

- **The failures are cold samples.**
  - With the pilot's drag, the left cell's false oks at twice the load are 2 of 4 cold samples and 0 of 28 warm. At
    idle they are 0 of 3 cold and 0 of 27 warm.
  - The plain cell's one missing landing was cold too: 1 of 10 cold at load, 0 of 10 at idle.
  - Both #20 failures came in the same cold block.
- **The false ok, left #20:**
  - It answered ok in 319.1 ms, the slowest of its cell; the correct ones took 126–268 ms.
  - `confirmed_by: Cursor(true)`. take_after_press 180.1 ms, take_after_release −132.8 ms. accept_shown true,
    accept_indeterminate true.
  - The cursor shown at the release, the accept image, was first seen 216.8 ms after the press, and the release came
    at 312.9 ms.
- **The pilot's false ok, left #0:** it answered in 226.9 ms. take_after_press 86.5 ms, take_after_release −128.8 ms.
  accept_shown and accept_indeterminate both true. The shown cursor was first seen at 127.6 ms, the release at 215.3 ms.
- **Can the engine see the condition?** Not through these signals.
  - accept_indeterminate is true on both false oks, but also on 71 correctly landed and 91 correctly unconfirmed handle
    drags at load.
  - Every ok answer came from `Cursor(true)`, and every correct off-zone answer had `Cursor(false)` at the release.
  - The false ok is a `Cursor(true)` at an off-zone release: Electron's accept cursor from the path's in-zone part still
    showing about 96 ms after it was first seen, on a cold engine block, under load.
  - What sets it apart is that the sample is cold and its press-to-release is long. The engine reads neither now.
- **The vendor lanes:** L4a's plan has none. Its lanes are cua, cua:desktop and cua:handle, so the vendor builds have
  no outcomes on these cells.

## Findings, for T4's arm64 part or the design session

Each was sent to the controller as it came. The controller's word on each is in brackets. Nothing was fixed here.

1. **arm64's vendor outcomes in R1, undeclared, so R1 fails closed** (T4's static round, as designed). Three cases fail
   on the pinned 26.928.40906-linux-arm64, with the texts and counts above. [Declared in T4's arm64 part: typetext with
   both error texts admitted; paste as a defect of its own (it crashes its own fresh gedit, which corrects 810's first
   reading); minimized as x64's.]
2. **E1's interrupted drag is a race the arm64 path wins.** cua's drag finishes inside the live child before its
   destroy-on-press lands, so it answers ok:true where the judge expects the X Window error (4 of 4 on arm64, 0 of 2 on
   x64). [Ruling 818: not a false ok. The judge changes: ok:true passes only when the fragile child's recorder shows
   the whole drag (press, every motion, release) before its DestroyNotify; ok:false only when the error names the
   destroyed window. No engine change.]
3. **A `:0` pilot's run name puts its scratch outside run71's TMPDIR.** `m5-pinned-dev-<step>-pilot` (T4's second round)
   is too long for scenes.mjs `scratchRoot`, which falls back to /tmp, and wrap71 then flags the run's Chrome. This
   holds on both architectures, for every `--pinned --pilot` `:0` step. [T4: shorter pilot run names, and a check that
   refuses a `:0` command whose scratch would leave the TMPDIR, before launch.]
4. **`restoreLaneScene` closes, and waits for, a window by its X id alone** (T4's static-round restart path, first
   exercised live here).
   - On arm64 both vendor lanes keep ending gedit, so freed client id ranges are reused across lanes.
   - The pinned lane's restore closed the newest lane's fresh window, which held the same id (25165924). The newest
     lane's restore then waited out its 10 s on an id the pinned lane's new window held, and threw.
   - That is a wrong-target action, on the run's own windows only.
   - [T4 keys the close and its wait on the pid as well.]
5. **wrap71's outside-peer rule stopped V5 on an abstract autobind address** (`@011e2`, no peer pid). The connection came
   from the run's own Chrome launcher 26 ms into its life. The observer in sitting 3 saw autobind addresses held only by
   `chrome` and `chrome_crashpad`. So this is most likely the run Chrome's crashpad connection caught before its peer
   showed a pid: the 773 race shape on a peer that rule doesn't cover. [T4's (e).]
6. **V5's two Chrome drag-and-drop cells fail as on x64.**
   - `chrome_dnd_shared` fails only on its audit pass. The audit's first request answered `{ok:true}` where the cancel
     sentence was expected; its second answered the sentence. late_error was null on both.
   - The audit row carries no engine take timing, and the runner records none there. The engine's dnd records exist
     only on the 3 timed samples, all `in_time`, started, not late. No late notice followed, so this may be a drag
     Chrome never took, rather than 756's late take. These records can't tell which.
   - [Ruling 762: it stays a FAIL on its judge.]
   - `chrome_dnd_late_take_shared` fails "a drop the witness did not record on 1 of 3 samples", 680's witness-span shape.
     Its samples answered ok in about 157 ms, with dnd outcome `no_start`, dropped true/true/false and witness
     true/false/true.
7. **wrap71 runs on when a decoy can't bind.** The session-bus decoy failed with `AF_UNIX path too long`, at a 108-byte
   path, in every step under `out-zero-r1/` (V1–V5). wrap71 kept going without it. [T4's (d): wrap71 fails
   closed before a step whose decoy can't bind, and checks the path length up front.]
8. **A false ok from the shipped engine at twice the load (L4a).**
   - In the pilot it was "cua:handle left: answered ok with no drop and nothing pending on 1 of 2". Its rate run is
     under "L4a false ok" below.
   - The handle lane confirmed the drop from Electron's accept cursor (`confirmed_by: Cursor(true)`), still showing at a
     release off the drop zone.
   - [The design session's call, possibly an engine cut under §8.2.]
9. **The arm64 vendor builds end gedit beyond C10's text input.** In V1's `:0` rerun, 7 samples a lane per op:
   - the pinned build ended gedit on every `type_text`, `type_text_selection` and `clipboard_write`;
   - the newest (26.1023.51421) ended it on every `clipboard_write`, while its `type_text` and `type_text_selection`
     answered 7/7 ok;
   - cua was 7/7 ok on every op.
   - So on arm64 **`clipboard_write` has no vendor bar**: neither arm64 vendor build succeeds at it. That puts it on
     "Not shown on arm64" (§7.3), and gedit's text bar falls to the newest build, as C10 planned. [Noted for the
     declarations.]
10. **Timing.** No gross miss. At idle the settle misses are x64's pilot's own cells. At twice the load, three single
    misses each sat in a series that ended on a 2-streak: L3b electron key_up desktop and L3d writer activate_window,
    both late, and L3c firefox right_click, refused as on x64. A series of 2 can't give a rate (§8.2's first cut). The
    newer Axion core shows mostly as speed: E1's race, and the low vendor bars, e.g. gedit's tree at 187 ms against
    x64's 565.
11. **The VM itself.** `:0` runs Xorg's dummy driver at 1280x800, the x64 VM's own size, and no scene showed a size
    assumption. No step read local time (the VM is America/Los_Angeles). The vendor's signed index now lists
    26.1111.71025 in place of F3's 26.1111.21308; their `sky_linux_arm64` is byte-identical.
12. **Environment friction** (not the harness). devcloud's reconcile rewrote `~/.ssh/authorized_keys` about 50 minutes
    in, which dropped the controller's key, and ssh was refused from about 01:57Z to 02:13Z. [Ruling 810: the design
    session put it in `authorized_keys2`, which devcloud leaves alone.]

### Chrome on arm64 (§7.3's checks)

- **The family, by X11 class:** `xprop WM_CLASS` on Chrome's window reads `"google-chrome", "Google-chrome"`
  (`scripts/checks.log`).
- **The AT-SPI tree:** V2's Chrome scene and V3's chrome-input read with no verdict FAIL.
- **Drag and drop:** V5's device-chrome-dnd timed samples show the take (`dnd.started` true), and C1 and L4c each report
  their late takes.
- **The context menu:** S1's Chrome cells ran, and V3 lists `secondary_action` and `right_click_fallback` as declared
  unconfirmed, as on x64.

### Not shown on arm64 (for `m5/arm64/README.md`)

- **V1 on `:0`:** its verdicts are not shown in this pilot (findings 3 and 4).
- **gedit `clipboard_write`:** no vendor bar, since neither arm64 build succeeds (finding 9). cua's effect is still
  judged absolutely.
- **gedit text against the pinned build:** it ends gedit on every sample. The bar is the newest build's, whose
  `type_text` succeeds.
- **`npm test` and `engine-linux` on arm64 hardware:** not run here (C8).

## Files

- `out/`: the private steps (idle and the twice-load block), each step's directory as the runner wrote it, and
  `driver.log`.
- `out-zero/`: the first sitting, V1 stopped by wrap71. The other steps there are printed only.
- `out-zero-r1/`: the second sitting: V1 (the harness's throw), V2–V4, and V5 (stopped by wrap71), all without the
  session-bus decoy.
- `out-zero-z1/`: the third sitting, V5 and Z0, under the short out root `m5/pa/z1`.
- `out-E1-repeat-{1,2,3}/`: E1's repeats.
- `vendor-reruns/`: R1's vendor lane, three times, and the failed first attempt.
- `l4a-rate/`: the L4a rate run (`L4a/`) and its idle control (`H1/`).
- `holds/`: the controller's three hold-sittings clearance records.
- `scripts/`: task 96's launchers and records as they ran, with the install logs, the checks, the vendor verification,
  the package comparison, the lock lines, and the analysis scripts with their outputs.
- Files over 1 MB are gzipped. The guard's decoy sockets are left out.
- The directory was scanned for token-shaped strings before the commit (`scripts/scan-evidence.sh`, file names only).
  No secret values were read: every run home's secret store was empty.
