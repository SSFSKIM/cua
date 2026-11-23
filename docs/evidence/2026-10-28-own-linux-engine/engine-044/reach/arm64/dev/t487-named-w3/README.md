# #487's own case on arm64: `t487-named` ×100 at twice the load (development, gating by ruling 1143 (c); task 147)

This set is a development run, but ruling 1143 (c) makes it gate the 0.4.4 PR. It supersedes this directory's earlier
`../t487-named/` (×30, 0 of 30 exercised). That run, like task 142's first pilots, aimed the press from xdotool's
origin, which counts Openbox's decoration twice. Its presses landed above the source.

**The checkout** is `t147-w3`, a fresh VM worktree detached and clean at origin/engine-044-pr **5f59e5bc**: H9 plus
the reach evidence, main and harness fix wave 3.
- It has a real `npm ci`, the Electron binary present (v44.9.0) and xprobe built (`scripts/setup.sh`,
  `setup-w3.log.txt`).
- `native/linux-engine` is as at H9 (`git diff --quiet cd03a47b HEAD -- native/linux-engine`). Main's merge brings only
  macOS Swift files under `native/`.
- Setup and the home checks are in `scripts/w3-setup.sh` and `w3-setup.log.txt`.

**The homes**, checked first:
- `home-arm64-044`: the engine's sha256 f54b2aeb…da3e equals the pin, and it reads `cua-engine 0.4.4 (23f342178d94)`.
  `check --pinned` exited 0, with `engine_tree` 23f34217 and `equal: true` (`w3-check-044.txt`).
- `home-arm64-043` (task 136's): the engine's sha256 dd74e19b…cf1e equals 0.4.3's pin, and it reads `cua-engine 0.4.3
  (ba5b043834ce)`.

**The runs** (`scripts/w3-run.sh`):
- Each is task 142's `private-run.mjs` from t147-w3: the gate's `runOnPrivateDisplay`, Xvfb, Openbox, the `person`
  xterm, never `:0`.
- The arguments are `--experiment drop-signals --family electron --plan t487-named --trials 100 --load-factor 2`.
  `CUA_HOME` is the run's own home, and the engine is that home's pinned build.
- Each run holds the VM's lock once (holder `h9-arm64`; `scripts/lock-lines.txt`). hold-sittings was absent and the disk
  had 97G free.
- Each run's meta row records commit 5f59e5bc, `load_factor` 2 and `trials` 100.
- Neither run waited for a quiet machine. The 0.4.3 run started at load 13.98, the tail of the 0.4.4 run's own load.

| engine | run (UTC, 11-23) | exit, clean |
|---|---|---|
| 0.4.4 (`044/`) | 13:02:54–13:07:31 | 0, clean |
| 0.4.3, the control (`043/`) | 13:07:43–13:12:16 | 0, clean |

**The judge's tables** are in each `run/summary.md`, with the per-drop rows in `pilot-table.md` (wave 3's
`pilot-table.mjs`).

0.4.4:

| drops | drags | landed | false ok | stale drops | honest unconfirmed | ambiguous | error |
|---|---:|---:|---:|---:|---:|---:|---:|
| exercised | 100 | 100 | 0 | 0 | 0 | 0 | 0 |
| not exercised | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- No drop lacks a proof: aim, electron, pacing, route, press, start and settle are each missing on 0.
- `rest_ms` is 30 on 100 of 100.

0.4.3:

| drops | drags | landed | false ok | stale drops | honest unconfirmed | ambiguous | error |
|---|---:|---:|---:|---:|---:|---:|---:|
| exercised | 100 | 100 | 0 | 0 | 0 | 0 | 0 |
| not exercised | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- Likewise no drop lacks a proof.
- `rest_ms` is absent on 100 of 100, since 0.4.3 predates it.

**The bar is met.** Among the 100 exercised drops on 0.4.4 there are 0 #487 false oks and 0 stale-position drops.
Every drop landed.

**What the control does not show.** On this setup, arm64 at twice the load, 0.4.3 also landed every exercised drop:
it gave 0 #487 false oks in 100. So this set confirms that 0.4.4 lands #487's case, but not that 0.4.3 failed it here.

**Scans** of this directory (`scripts/scan-w3.sh`): 41 files, with 0 token-shaped strings, 0 held-code rows and 0 raw
minimized codes. No `:0` title list was read, since nothing connected to any `:0`.
