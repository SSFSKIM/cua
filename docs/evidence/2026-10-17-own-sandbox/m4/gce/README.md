# #115 M4: the Linux acceptance on cua-gce

Spec `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`, acceptance 1, 2 to 5, 7, 10 and 11 (Linux rows), at
`7b87873` (feat/115-own-sandbox-m4, PR #161). Linux acceptance 12 (parity) rests on M3's full run at `bf7739f`
(`../../m3/gce-cua-bf7739f/`); the merge of main changed no Linux launch code, so it was not rerun.

**Session.** cua-gce (t2a arm64 spot, europe-west4-a) started 2026-10-18 15:03:07Z and stopped 15:34:10Z; no other
instance was touched. The box's checkout `~/cua-m3` was at `7b87873`; a detached worktree at `90cbfe0` (M0's merge,
whose Linux pin still lists `codex`) served the pre-M3 installs and was removed afterwards. Every scratch home was
created under `/tmp` and removed before the stop. lightdm's autologin session failed at this boot as at M3's
(`Exited with return value 1`, the X-authority race); `sudo systemctl restart lightdm` brought the desktop up before
anything ran.

## Item 1: no Codex CLI installed or running (`install/`)

`node bin/cua.mjs install --archive /var/cache/cua/chatgpt_26.928.40906_arm64.deb --json` into a fresh scratch home:
the release tree holds `cua_node` and `install.json` only (`find` for `codex` / `CodexCLI.app`: 0), the helper
was fetched from the release and verified, Node 24.22.0 placed. `doctor.json` (trimmed to the runtime, sandbox and
repl rows): `sandbox.launcher` pass (the pinned helper), `runtime.leftovers` pass, `repl.host` cua, no row naming the
Codex CLI. During items 2 to 7 a sampler read `ps -eo comm=` every 0.2 s (`ps-sampler.txt`: 883 samples): no process
named `codex` ever; up to 4 processes of the helper (`codex-linux-sandbox`, comm `codex-linux-san…`) at once.

## Items 2 to 5: own-sandbox (`own-sandbox/report.json`)

`scripts/accept/own-sandbox.mjs --home <the item-1 home>`: `ok: true`, 82/82 checks under scoped, default and
disabled, the four bwrap creation cases included; under default another session's run directory is denied and the
kernel works in `$CUA_HOME/kernel/<id>`.

## Item 7: linux-native (`linux-native/report.json`)

`scripts/accept/linux-native.mjs` in the X session's environment with the item-1 home: PASS, every step (gedit bound
by X11 id, typed and read back through AT-SPI, the kernel confined, a screenshot, `launch_app` outside the sandbox,
`end_task`, clean exit, no run entry left). `CUA_REPL_HOST=vendor` is refused with the sentence: "cua:
CUA_REPL_HOST=vendor is not supported on Linux: the vendor host there is retired (#115), because its node_repl ran
JavaScript cells unconfined when its sandbox launcher failed (#135), and cua's own sandbox does not serve it. Unset
CUA_REPL_HOST (or use CUA_REPL_HOST=cua) for cua's own host [repl_host_refused]" (`cua serve` exits 1).

## Item 10: the prune on Linux (`prune/`)

Each home: `install --archive <deb> --no-node` from the `90cbfe0` worktree (the tree's `codex`, 247,524,632 bytes),
then `plant.sh` wrote synthetic files (content `synthetic`, no credential) by the prune's names and node_repl's three
keepers into `state/codex`, and the same set into a second directory the shell's `CODEX_HOME` named. `prune-seq.sh`
then ran, at `7b87873`: doctor, a plain install, `--prune-leftovers`, doctor.

- **No session (`prune-no-session.txt`):** doctor `runtime.leftovers` warn naming every leftover and
  `cua install --prune-leftovers`; the plain install removed nothing and said so (`codex` still there, 15 files in
  `state/codex`); the prune printed each removal (the twelve `state/codex` names, then the release's `codex`); left
  were `config.toml`, `computer-use/sessions/s.toml`, `node_repl/active_execs/x`; the environment's `CODEX_HOME`
  kept its 15 files; the runtimes tree went from 452,595,987 to 205,071,355 bytes; doctor then passed the row.
- **A live session record (`prune-live.txt`):** with `run/m4-live-session.pid` naming a live harness-owned `sleep`,
  doctor's warn added "the release's codex once no session runs from this home (now: session m4-live-session (pid
  …))"; the prune removed the `state/codex` names and "left the Codex CLI's unused … codex in place, since a session
  may be running from this home"; after the `sleep` ended, the next prune swept the dead session and removed `codex`.

## Item 11: the own host's computer session, cold rows (`gce-cua-computer/`)

As M0 ran `m0/gce-cua-computer/`: `node scripts/native-baseline.mjs prepare --device cua-gce --commit 7b87873`, then
three times `node scripts/native-baseline.mjs run --device cua-gce --experiment 115-m4 --host cua --display :0 --out
…/run-N`, each after the box's 1-minute load was at or below 0.30 (`sitting-load.log`: 0.28, 0.02, 0.12), then
`summary` and `compare --same-host ../../m0/gce-cua-computer gce-cua-computer --out comparison.md`. Same box image,
kernel 7.0.0-1014-gcp, box Node v22.23.3, managed Node v24.22.0, release 26.928.40906-linux-arm64, display 1280 × 800,
controller this MacBook (Darwin 25.6.0, Node v22.23.2) as M0; the controller's 1-minute load ranged 31 to 97 (M0: 58
to 127). Every run complete, attested `cua-repl-host 0.5.0`, launcher `cua`, TMPDIR `session`, sandbox `scoped`.

`compare --same-host` reads **NO VERDICT** for one problem: "hardware environment differs" — `meta.hardware.memoryBytes`
is 16,722,034,688 against M0's 16,722,038,784 (4 KiB less MemTotal, the same t2a-standard-4); model and chip are equal.
By the rule's own limits both judged rows would pass (`cold.miss.first_js` 735.1 ms against a limit of 1166.5;
`cold.hit.first_js` 825.8 against 1273.6). Against M0's run-to-run spread, though, they are slower:

| Row | M0 per-run medians (ms) | M0 pooled median | M4 per-run medians (ms) | M4 pooled median |
|---|---|---|---|---|
| cold.miss.first_js | 661.1, 678.1, 591.1 (samples 505.8–689.3) | 666.5 | 744.6, 729.0, 728.3 (samples 685.4–772.5) | 735.1 (+68.6, +10.3%) |
| cold.hit.first_js | 771.4, 818.8, 749.2 (samples 735.8–992.4) | 773.6 | 825.8, 810.8, 899.9 (samples 808.1–901.7) | 825.8 (+52.2, +6.7%) |

Every M4 per-run median of `cold.miss.first_js` lies above M0's highest (678.1), and two of three for
`cold.hit.first_js` (above 818.8). The first cell of a connection now starts the kernel through the helper
(bubblewrap's namespaces and seccomp) where M0's ran it unconfined, so a launch cost of this size is the expected
shape; it is reported to the dispatching session, not recorded as debt. The warm rows and the tasks are equal or
faster (`comparison.md`).

## Privacy

Retained JSON and text scanned for `/Users/` paths, token-shaped strings (`ghp_`, `gho_`, `ghs_`, `github_pat_`,
`PLAYWRIGHT_MCP_EXTENSION_TOKEN`, private-key headers, `Bearer`), secret-store paths and the extension key, over all
22 retained files besides this README: 0 `/Users/` paths, 0 token-shaped strings, 0 extension-key paths, and one
store path: `own-sandbox/report.json`'s fourth creation case quotes its refusal sentence naming the synthetic, absent
scratch store `/tmp/cua-own-sandbox-…/absent-home/.config/claude-secrets` (by design; no store was read). The doctor
report was trimmed of its Chrome, secrets and agent rows.
