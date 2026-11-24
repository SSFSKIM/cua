# linux-engine 0.4.5's counted reach on arm64 (task 163)

This is the reach list of rulings 1193 and 1194 (1193 R3), run on the arm64 VM (`dc-linux171arm-996d`) on private
displays only. Nothing ran on any `:0`.

## At H10 (0.4.5) (2026-11-24 06:35Z to 07:59Z; task 163)

**The head is H10 = `2c66966bdab7b29836779401019f43abc6cb9890`**, branch `engine-045-pin`. It is the 0.4.5 tag commit
77ed101d4 plus:
- the pin;
- `MIN_ENGINE_VERSION` 0.4.5;
- task 160's ×300 evidence;
- main at 0d4c59901.

**The engine is linux-engine-v0.4.5** (release run 45335176072). The arm64 `cua-engine` has sha256
`f81121552e77f50ec2d8dcf3135006a9245c411f2b67bc9cfbe408850e6e637c` and reads `cua-engine 0.4.5 (77ed101d43ea)`. This
is the first measurement of the shipped bytes.
- The lock holder is `h10-arm64`, with the lines in `scripts/lock-lines.txt`. The lock was released at 07:59:57Z.
- Every step passed. Nothing failed, and nothing was rerun.

**Setup** (`scripts/setup-all.sh`; logs `setup-all.log.txt`, `setup-h10.log.txt`, `install-home.log.txt`):
- **The checkout.** `t163-h10` is a fresh VM worktree, detached and clean at H10. It has a real `npm ci`, the Electron
  binary present (`node_modules/electron/dist/electron`) and xprobe built.
- **The home.** `home-arm64-045` is fresh. Its own `node bin/cua.mjs install --engine` placed linux-engine-v0.4.5, and
  the engine's sha256 equals H10's arm64 pin.
- **The pin check.** `gate.mjs check --pinned` **exited 0**, with `engine_tree`
  `{"path":"native/linux-engine","commit":"77ed101d43ea9b071bd9783dd9bb3387733f9f6d","equal":true}` and `clean: true`.
- **Before each set,** hold-sittings was absent and the disk had 93–95G free.

**How the steps ran** (`scripts/steps.sh`, task 147's runner re-pointed):
- Each step's line is `gate.mjs print <step> --pinned home-arm64-045 --holder h10-arm64`'s (`out/<step>.print.txt`).
  It ran once, as printed.
- The printed line's own `locked.sh h10-arm64` takes the hold. Inside it, step.sh's quiet wait runs first, and then the
  gate command, unchanged.
- Each print's record is kept apart (`<step>.print-record`).

| item | step | run (UTC, 11-24) | exit | load at the start (after the quiet wait) | result |
|---|---|---|---:|---|---|
| 1 | H1 | 06:36:11–06:53:41 | 0 | 0.65 0.22 0.08 | **PASS**: 560 of 560 settled drags rested 30 ms |
| 1 | H2 | 06:53:41–07:11:39 | 0 | 0.15 0.13 0.09 | **PASS**: 560 of 560 settled drags rested 30 ms |
| 1 | L4a | 07:11:39–07:33:11 | 0 | 0.14 0.17 0.18 | **PASS**: 560 of 560 settled drags rested 30 ms |
| 2 | L4d | 07:33:11–07:59:57 | 0 | 0.98 9.32 10.49 (a 170 s wait) | **PASS at 993's bar**: 0 false oks and 0 stale on every Chrome cell |

Every run was clean, and so was each private display's watchdog.

**Item 1: t17-fix3 and the settle's rest.**
- **The judge's line** is the same in all three steps: "The settle's rest (#487, engine 0.4.5): 560 of 560 settled drags
  rested 30 ms; 0 another rest, 0 without rest_ms, 0 without the settle record; 0 drops without the engine's settle
  count, 0 contradicting it, 0 with copies that disagree, 0 not labelled Electron's; 0 zero counts not shown their own;
  0 of 14 lanes and cells with no settle observed."
- **The rows agree** (`out/settle-rests.txt`): each step has 560 Electron rows, and every settle record holds `rest_ms`
  30. No other value was seen.
- **`settle-check`** (`out/settle-check.txt`) reads TAKEN, with 560 entered in each step. second_rest is 0 / 10 / 10
  and skipped 0 / 4 / 1 (H1 / H2 / L4a).
- **The verdict** of each step is "No false ok, no drop at a stale position, no missing landing, no false error, every
  notice refused once; every cell of the plan ran".
- **Findings, not fails:**
  - #365's hung sink: 0 of 60 (H1), 1 of 60 (H2, `cua:handle`) and 0 of 60 (L4a).
  - H2's root cells: every end unverified, as ruling 838 rules.
  - L4a's 827 3b residue: 0 of 100 on each lane.
  - L4a has one zone-truth mismatch (ruling 830): `left` 1 of 30, "not a fail and no false ok".

**Item 2: L4d** (`out/L4d.pinned-release/`; `out/l4d-parts.md`, `out/l4d-sync.md`). The verdict is `pinned-L4d
complete`, exit 0. Each Chrome part reads "Every late take reported, no false ok, no drop at a stale position, no
missing landing, every notice refused once; every cell of the plan ran".

| part / cell | drags | landed | stale | false ok | honest (a notice) | untaken |
|---|---:|---:|---:|---:|---:|---:|
| Chrome t14-long, long-left | 100 | 0 | 0 | 0 | 100 | 0 |
| Chrome t14-floor, plain-long | 300 | 300 | 0 | 0 | 0 | 0 |
| Chrome t14-floor, left | 30 | 0 | 0 | 0 | 30 | 0 |
| Chrome t14-floor, inzone-out | 30 | 0 | 0 | 0 | 30 | 0 |
| Electron t17-long, long-left | 30 | 0 | 0 | 0 | 30 | 0 |

The Electron part has 30 of 30 exercised (972): "a take, its motion after the take past the 350 ms floor, and the
expected end". It has no zone-truth mismatches, and settle-check reads its settle TAKEN, with 30 entered.

**The release_sync check, before counting:** 460 of 460 Chrome rows carry `release_sync` with `overran`,
`last_step_after_take_ms` and `unconfirmed`.

| part / cell | rows | overran | overran: last_step_after_take_ms min / p50 / max (floor_until) | schedule after_path / in_floor | after_path: gate open / overran with the gate shut | visits_dropped 0 / 1 / 2 | `unconfirmed` by cause |
|---|---:|---:|---|---|---|---|---|
| t14-long, long-left | 100 | 100 | 442.3 / 1163.7 / 2456.7 (326) | 100 / 0 | 100 / 0 | 100 / 0 / 0 | null 100 (honest) |
| t14-floor, plain-long | 300 | 216 | 326.0 / 595.8 / 1239.0 (326) | 216 / 84 | 188 / 28 | 300 / 0 / 0 | null 300 (landed) |
| t14-floor, left | 30 | 20 | 327.0 / 459.0 / 677.0 (326) | 20 / 10 | 15 / 5 | 30 / 0 / 0 | null 30 (honest) |
| t14-floor, inzone-out | 30 | 0 | – | 0 / 30 | 0 / 0 | 30 / 0 / 0 | null 30 (honest) |

What the table shows:
- **#512's first fix moved 33 rows**: 28 plain-long and 5 `left` overran floor_until with the gate shut and took the
  after-path tail.
- **No in-floor row overran.**
- **No visit was dropped**, so `unconfirmed` is null on every Chrome row and #512's second fix did not fire.
- **Every honest row carries the existing unconfirmed-drop notice.**

**Scans** of this directory (86 files; `scripts/scan-token.txt`, `privacy-scan.txt`, `scan-lsps.txt`):
- token-shaped strings: 0;
- key codes: 0 held-code rows and 0 raw minimized codes;
- raw U+2028 / U+2029: none, with `grep -rlP '\x{2028}|\x{2029}'` over the plain files and the same pattern over every
  gzipped file decompressed.
- No `:0` title list was read, since nothing connected to any `:0`.

## Files

- `out/`: every step as the runner wrote it, with the prints and their records, plus:
  - `steps.log.txt`;
  - `settle-check.txt` and `settle-rests.txt`;
  - `l4d-parts.md` and `l4d-sync.md`.

  Files over 1 MB are gzipped, and logs are kept as `.log.txt`. The route-audit traces are left out.
- `scripts/`: task 163's launchers (task 147's, re-pointed): the setup and install, the step runner, the analysis
  scripts (`l4d-parts.mjs`, `l4d-sync.mjs`), the copy, the scans and the lock lines.
