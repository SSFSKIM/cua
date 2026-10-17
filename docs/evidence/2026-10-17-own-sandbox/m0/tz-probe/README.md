# #115 M0: the time-zone probe's baseline under the signed Codex CLI (#138)

Acceptance 13 (spec `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`): `scripts/sandbox-probe/tz-probe.mjs`, 80 fresh children per configuration, each a plain Node script that makes 200 `vm.createContext` calls and then its first host-local-time use about 2.5 s in, bounded at 15 s. M0's configuration is the signed CLI's scoped profile (`codex sandbox` with the own host's scoped policy as rendered today); M4 runs cua's final profiles without and with the `notification_center` line.

## Result: 0 hung in 160 runs

| File | Role | Runs | Completed | Hung | Launcher failures | Leftovers | Sitting (UTC) |
|---|---|---|---|---|---|---|---|
| `kernel.json` | kernel | 80 | 80 | **0** | 0 | 0 | 09:59:14 to 10:02:44 |
| `worker.json` | worker | 80 | 80 | **0** | 0 | 0 | 10:22:50 to 10:26:20 |

The CLI renders one profile for both roles; the role is recorded. Every child reported its local-time use at about 2,501 ms and exited; run times 2,585 to 4,502 ms (worker 2,588 to 4,492). `kernel.log` and `worker.log` are the probe's own progress lines.

**This does not reproduce the rate the history-hang README recorded** (`docs/evidence/2026-10-14-own-repl-host-parity/m2/history-hang/`: 10 of 40, then 5 of 40, with the same late-lookup trigger). The conditions that differ from that sitting:

- **HOME.** That probe (`sandbox-tz-probe.sh`) ran with the account's real HOME; this one ran with a scratch HOME (`mktemp -d`), as the mini rules require for anything that is not a planned native run (`../mini-rules/README.md`).
- **Node.** That sitting used the user Node 24.18 and the vendor's Node 24.21; this one used the managed Node 24.22.0 that cua's own host runs its children on (`~/cua-115/home/node/24.22.0/bin/node`).
- **The Codex CLI copy.** That sitting used the resident runtime's CodexCLI.app; this one the approved scratch copy `~/cua-115/home/runtimes/26.928.40906-darwin-arm64/CodexCLI.app` (same release and signature).
- **Time and machine state.** Eight days of uptime later, with the mini shared by other sessions.

**What it means for M4.** Acceptance 13 keeps the `notification_center` line only if M4's denying control hangs at least once in 80. If M4's control behaves as this baseline did, the verdict is **inconclusive** and the line is left out, with #138 open and these numbers. M4 should run its control under the same conditions as this baseline (scratch HOME, managed Node) so the two compare, and the dispatching session decides whether a real-HOME control is worth the mini rules' exception. (Superseded by the spec's Surprises & Discoveries: the dispatching session approved a real-HOME baseline, and M4's control runs under the HOME class that reproduces; see the next section.)

## What these files record, and how M4 treats them

`kernel.json` and `worker.json` are schema 1. They record the launcher, role, runs, bound, platform, architecture and Node (path and version), but neither the HOME their children ran under nor the launcher's identity beyond its path: the scratch HOME is known only from the command below (`HOME=$S/home`, which that command does not create, so the children's HOME was most likely a path that did not exist). Since the review fix of 2026-10-17 the probe owns HOME (`--home scratch`, a fresh empty directory it makes and removes, or `--home real`), records its class (and its path only for its own scratch), records the launcher's identity (for `codex`, the executable's SHA-256), and writes schema 2. `tz-probe.mjs verdict` compares a control and a grant only when both record these conditions and they differ only in `--notification-center`, so it refuses these two files.

M4 therefore treats them as a recorded control only: the scratch-HOME rate (0 of 160) beside the history-hang README's real-HOME rate, never one side of acceptance 13's pair. M4's pair is two schema 2 runs of `--launcher cua` per role, under the HOME class that reproduces the hang (spec, Surprises & Discoveries).

## Commands

On the mini, from the harness clone `~/Developer/GitHub/cua-parity` at `8afd143`, each item after the mini rules' idle check (`../mini-rules/sitting.log`; the mini's 1-minute load was 1.80 and 1.97 at the two starts):

```sh
S=$(mktemp -d /tmp/cua-115-tz.XXXXXX)
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=$S/home LANG=C.UTF-8 CUA_HOME=~/cua-115/home \
  ~/cua-115/home/node/24.22.0/bin/node scripts/sandbox-probe/tz-probe.mjs --launcher codex --role kernel --runs 80 --bound-ms 15000 \
  --codex ~/cua-115/home/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex \
  --node ~/cua-115/home/node/24.22.0/bin/node --out $S/kernel.json      # and --role worker
```

No GUI, no native helper, nothing under the account's HOME; the scratch directories were removed. The frontmost application was Terminal after each item.
