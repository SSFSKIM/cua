# M5 T4's second round, x64: the live pilots of the harness fixes (task 88)

**Development runs on the pinned release, not acceptance, never counted.** Every step below ran as a pilot
(`gate.mjs run <step> --pinned <home> --pilot 1`, no `--dev`): the gate value `pinned-dev`, its engine taken by the
pinned rule inside the step, every record labelled "development run on the pinned release, not acceptance, never
counted". They show T4's second-round fixes working live before H is frozen. None is a verdict of the gate's.

- **Where:** the #171 x64 VM (`dc-linux171-1e68`), private displays only (each step's own Xvfb, or gate.mjs's private
  display); nothing ran on `:0`. hold-sittings absent and no stress-ng before each step; each under `locked.sh m5-t4r2`,
  capped at 45 minutes (`timeout -s TERM -k 120 45m`).
- **Engine:** a run-owned home (`scripts/install-home.sh`: its own `cua install` under a HOME and XDG directories of
  its own, an empty secret store), linux-engine-v0.4.0, sha256 `751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca`,
  `cua-engine 0.4.0 (c55c8e08d9cb)`, install.json build `pinned`. `gate.mjs check --pinned <home>` passed at 2807b4ee.
- **Checkout:** branch `m5-t4r2` (from feat/171-m5 at 75cd93a7), clean at each step's commit.

## The steps

| step | commit | UTC | min | exit | what it showed (task 87's x64 pilot, for comparison) |
|---|---|---|---:|---:|---|
| ES | 2807b4ee | 11:03:49–11:05:23 | 1.6 | 0 | the new gate step (ruling 728): engine-stop's drain lane through `cua serve`, all 17 cells (5 paths, 4 cases) 1 of 1, every run one engine under its session at the installed path; the candidate line attested inside the step (the pinned rule run by a pilot, task 87's finding 1) |
| D5 | 2807b4ee | 11:05:23–11:08:16 | 2.9 | 0 | gnome-terminal opened and closed with its pidfile's pid verified first (ruling 725): the end row's `skipped` empty, so the identity was recorded and matched (3.4) |
| D3 | 2807b4ee | 11:08:16–11:09:22 | 1.1 | 0 | no top-up (ruling 722): 0 drag top-ups; Firefox's canvas speed listed unjudged (6.3) |
| E1 | 2807b4ee | 11:09:22–11:11:29 | 2.1 | 0 | no top-up: 0 events top-ups; the 17 required desktop groups listed unjudged (8.0) |
| V3, on a private display | 2807b4ee | 11:11:29–11:20:12 | 8.7 | 0 | the verdict run's own pinned preparation, live: `gate` pinned-dev, attested, engine tree c55c8e08; 0 top-ups, 28 speed decisions "unjudged: a pilot takes no top-up"; verdicts 27 pass, 11 unjudged, 2 declared unconfirmed, 1 declared refusal; "no verdict FAIL"; the display's watchdog clean (35.4 on `:0`, with its top-ups) |
| D3 (rerun) | 09d8ad8f | 11:22:08–11:23:15 | 1.1 | 0 | the drag summary's wording fixed after the first D3: "no FAIL; unjudged in this pilot (not a pass): 1 speed", never PASS |
| ES (fix wave 1) | a2bb0f8a | 12:17:31–12:19:05 | 1.6 | 0 | the start check clearing a leftover live (ruling 730 (a)): a scratch this task planted with the harness's marker, its run gone, mode 700, no process naming it, was removed before the step started (`cleared` in its record); end check clear; end clean |
| R4 (fix wave 1) | a2bb0f8a | 12:19:05–12:20:16 | 1.2 | 0 | a pinned pilot through a suite's own home (review finding 1): `PINNED_RULE=enforce` with LABEL pilot; the fixture home's pinned check exit 0, linux-device-mode passed, the engine watch passed (only the home's installed engine, no sky_linux) |

V3 is a `:0` step, which gate.mjs never runs. It ran here through `scripts/verdict-private.mjs`, which feeds
steps.mjs's own V3 arguments (a development run on the pinned release, one block) to gate.mjs's private display. So
the verdict run's pinned preparation has now been seen live, on a private display.

Every step's end check (`end_check` in its `step.json`) was clear: no `cua171-run-*` directory and no session bus of
one, before or after. Nothing was left on any run's own side (`records/out3/summary.md`, the gate's summary of the fix
wave's steps).

## Not shown live, and why

- **The `:0` sitting launcher** (`sitting.mjs`, review finding 3) reads `:0` after a sitting. It is tested headlessly
  only, each kind of person-side leftover with faked records and reads, because this round runs nothing on `:0`.
- **A run that throws, meets an uncaught error, or is stopped by its watchdog,** and the cleanup behind it: tests only.
- **#373's bound:** re-judged on stored rows (M4's candidates 1 and 3, and task 87's V3): every one is within 15 ms.
- **A reused pid:** test only.

## Files

- `records/out/` (2807b4ee), `records/out2/` (D3's rerun), `records/out3/` (fix wave 1): each step's `step.json` and
  README as the runner wrote them, and each set's `pilot.log`. The harness's own logs and results stay outside the
  repository (`~/.local/share/cua-171/m5-t4r2/`).
- `scripts/`: the launchers as they ran (`install-home.sh`, `pilot.sh`, `live.sh`, `verdict-private.mjs`,
  `live-fix1.sh`) and `copy-evidence.sh`, which copied these records. They were scanned for token-shaped strings: none.
