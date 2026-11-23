# Task 142: harness pieces for linux-engine 0.4.4's reach (#487, ruling 1102)

## The settle-rest check (item 1, plan t17-fix3)

`rejudge-settle-rest.mjs` judges every stored drop-signals run under `m4/` and `m5/` twice: with the base judge
(origin/main's `drop-signals-judge.mjs` at da7585c3) and with this branch's. Both go through the dispatcher, with the
run's meta row. The output is `rejudge-settle-rest.jsonl`, one line per run and a summary line.

- **179 runs, 144 of them judged.** Of the judged runs, 40 are t17-fix3, including H8's H1 on x64 and on arm64.
- **No fail list moved from base** (`moved_from_base: []`).
- **Both H8 H1 runs** are on `cua-engine 0.4.3 (ba5b043834ce)`. Each stored a pass and still passes, with
  `settle_rest: {applies: false, version: "0.4.3"}`.
- **Every t17-fix3 run's version parses**, from 0.3.0 through 0.4.3, so none applies the check.
- **16 runs differ between their stored verdict and today's**, all of them t14-late or t14-long from H4 to H6. The base
  judge gives the same result for each, so the difference comes from earlier judge changes, not from this one.

## #487's case: `t487-named` (development, not gated)

`private-run.mjs` runs one sitting on a private display: Xvfb, Openbox and a `person` xterm, through the gate's
`runOnPrivateDisplay`. The command is:

    CUA_HOME=/Users/new/.local/share/cua-171/m5/home-x64-043 locked.sh harness-487 timeout -s TERM -k 60 45m \
      node private-run.mjs <out> <label> --experiment drop-signals --family electron --plan t487-named --trials 5 \
      --cua <engine> --run <label>

The two engines:
- 0.4.3: the pinned `home-x64-043/engine/linux/cua-engine`.
- 0.4.4: the candidate `cua-engine-0.4.4-linux-x64` from build run 45129424625, sha256 9bd2e584…d075d078b.

### The pilot (x64, idle)

| engine | drops | route | `drag_pacing` | press on Electron | source started | settle | exercised | T17 counts (unexercised) |
|---|---:|---|---|---|---:|---:|---:|---|
| 0.4.3 (`pilot-043`) | 5 | foreground 5 | GTK 4, rest 0, 5 | 5 | 0 | 0 | 0 | false ok 5, landed 0, stale 0, honest unconfirmed 0 |
| 0.4.4 (`pilot-044`) | 5 | foreground 5 | GTK 4, rest 0, 5 | 5 | 0 | 0 | 0 | false ok 5, landed 0, stale 0, honest unconfirmed 0 |

- **"Press on Electron"** counts two pieces of evidence: the page's press counter moved on every drop, and the engine
  started its Electron drop-cursor watch (`drop_cursor: {"read": false}`).
- **Electron never started its drag**, so there was no take and no settle, and #487's settle was not reached.
- **The false oks are untaken plain drags.** The engine answered ok on a drag that started no drag and drop.

### Diagnostics

These ran on 0.4.3 only. Each used a temporary lane that was never committed, 5 drops each. The column "asked for
activation" counts drops where Electron sent `_NET_ACTIVE_WINDOW` on the press.

| run | lane | route | started | asked for activation |
|---|---|---|---:|---:|
| `diag-043` | named GTK 4, `--drag-step-us 500` | foreground | 0 | 5 |
| `diag2-043` | named GTK 4, `--drag-step-us 500 --drag-rest-ms 30` | foreground | 0 | 5 |
| `diag3-043` | no window named (desktop route), the GTK 4 window activated by the harness first | desktop | 5 (settled 5) | 0 |
| `diag4-043` | named GTK 4 at zero pacing, the GTK 4 window activated first | foreground | 0 | 5 |
| `diag5-043` | as diag4, with `--drag-step-us 500 --drag-rest-ms 30` | foreground | 0 | 5 |

Neither the motion's pacing nor when the named window was activated decides the take. On every foreground-route drop
Electron asked for activation at the press and never started its drag (25 of 25). On every desktop-route drop it did
not ask, and it started every drag (5 of 5).
