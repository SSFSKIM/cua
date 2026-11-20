# linux-engine 0.4.2: ruling 898.3's residue check on arm64 at twice the load (task 118)

**Development runs, never counted as a release gate.** The design session ruled that the f10946bf block counts for
the tag's numbers (rulings 912.3 and 913). The 80b98959 and f8bd6949 blocks are previews.

Everything ran on the arm64 VM (`cua-171-arm64`, 8 cores) under the host lock with holder `m5-tail042`. Before each
run the chain checked that hold-sittings was absent. Every run used a private display, never `:0`.

## The heads and their binaries

Each binary is static musl for aarch64, built on the VM under the lock (`scripts/build.sh`: cargo `--release --locked`,
then strip). The full lines are in `logs/builds.txt`.

| head | what it is | sha256 | role here |
|---|---|---|---|
| 80b98959 | wave 3, the extended hold to 650 and its notice | `f5f435aba72caf307567dbc295140d306064b2660ba8b90b4a534c90950e13e2` | preview: 3 V5 runs per Chrome version, 20 K1 and 20 K2 |
| f8bd6949 | wave 4 | `962f9f4ec8234a3057fb716a928611608c3832b16e6a062e9815f9c855263ac5` | preview: 1 V5 run per Chrome version (ruling 908) |
| f10946bf | wave 5 | `9d5cf2fc686803f641bdc79099a6d7e49e29918f222192c2e7a918abe2a1c93e` | **counted block**: 1 V5 run per Chrome version, 20 K1 and 20 K2 (ruling 912) |

Each head ran its own checkout's harness and judge: `t116-measure042`, `t118-wave4` and `t118-wave5` on the VM. The
only exceptions are the offline re-judgements below.

## How it ran

- **V5 at twice the load**, as task 116 ran it.
  - The cells are `chrome_dnd_short_in_front_shared` (in front) and `chrome_dnd_shared` (cancel), in the same runs.
  - The candidate ran alone on the default lane, with `--ballast gate --dev --no-audit`, 25 blocks a run.
  - The load was `stress-ng` with 2 workers per core, through `scripts/private-run.mjs`.
  - Each run gives 75 in-front and 75 cancel samples.
  - The engine ran unsandboxed, as in task 116.
- **The canary series in gate form.**
  - Each run was `gate.mjs run K1|K2 --candidate <bin> --dev --holder m5-tail042`: idle, on a private display, under
    the gate's ballast, 3 blocks.
  - The engine ran inside the pinned codex-linux-sandbox, as in service. The helper came from a run-owned
    `CUA_HOME` (`task118/home`, holding only the helper, sha256 807448d0…6088 as pinned).
  - K1 drives the installed Chrome 156.0.8078.73. K2 drives the current stable Chrome 158.0.8127.36, T7's extracted
    copy, which gate.mjs puts first on PATH.
- **Chrome 158 for V5.** T7's copy went first on PATH, with the held 156 left alone.
- **Which Chrome ran (ruling 907).**
  - On private displays no wrap71 runs, so `scripts/procrec.sh` kept the process record. Every 2 s it wrote each
    `chrome` process's pid and `exe` link, and whether its command line named a harness scratch (`cua171-run-`). It
    wrote no command lines.
  - Every run drove only the Chrome it meant (`procs/summary-*.md`, raw lines in `procs/`):

    | runs | the harness's Chrome executable, in every run |
    |---|---|
    | all 156 runs (V5 and K1) | `/opt/google/chrome/chrome` |
    | all 158 runs (V5 and K2) | `…/chrome-stable/158.0.8127.36-1/root/opt/google/chrome/chrome` |

  - Twelve other `/opt/google/chrome/chrome` processes appear in every record. They are the same pids, running since
    2026-11-17 17:10, so they are not the harness's. They were left alone.

## 1. V5 at twice the load, per head and Chrome version

The columns:
- **false oks:** an ok with no drop and neither the hold's exact notice nor the pending unconfirmed-drop notice
  (898.2). In the cancel cell, a plain ok.
- **false alarms:** hold notices on a drag the page shows dropped.
- **unconfirmed-drop notices:** T14's pending notice. Chrome took the drag but confirmed no drop at twice the load.
  The judge counts these as honest.

| head | Chrome | cell | samples | dropped | false oks (page read) | false oks (the head's own judge) | hold notices | false alarms | unconfirmed-drop notices | the shape | plain ok, no dragstart |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **f10946bf** | **156** | in front | 75 | 68 | **0** | **0** | 0 | 0 | 9 | 0 | 0 |
| **f10946bf** | **156** | cancel | 75 | 0 | **0** | **0** | 1 (honest) | 0 | 0 | 0 | 0 |
| **f10946bf** | **158** | in front | 75 | 64 | **0** | **0** | 1 (honest) | 0 | 11 | 0 | 0 |
| **f10946bf** | **158** | cancel | 75 | 0 | **0** | **0** | 2 (honest) | 0 | 0 | 0 | 0 |
| f8bd6949 | 156 | in front | 75 | 66 | 0 | 0 | 0 | 0 | 9 | 0 | 0 |
| f8bd6949 | 156 | cancel | 75 | 0 | 0 | 0 | 2 (honest) | 0 | 0 | 0 | 0 |
| f8bd6949 | 158 | in front | 75 | 66 | 0 | 0 | 0 | 0 | 9 | 0 | 0 |
| f8bd6949 | 158 | cancel | 75 | 0 | 0 | 0 | 2 (honest) | 0 | 0 | 0 | 0 |
| 80b98959 | 156 | in front | 225 | 197 | 0 | 0 | 0 | 0 | 30 | 0 | 0 |
| 80b98959 | 156 | cancel | 225 | 0 | 0 | 0 | 5 (honest) | 0 | 0 | 0 | 0 |
| 80b98959 | 158 | in front | 225 | 202 | 0 | **1 (a judge defect: see below)** | 1 (honest) | 0 | 23 | 0 | 0 |
| 80b98959 | 158 | cancel | 225 | 0 | 0 | 0 | 2 (honest) | 0 | 0 | 0 | 0 |

**Over all heads: 0 false oks in 525 in-front samples on each Chrome version, 0 false alarms, and 0 of task 112's
shape.** By 898.3, 888.3 has no residue to take to the owner.

**80b98959's one judged false ok is the judge's defect, fixed in wave 5.** The sample is v5-158-3, block 1/0, cold.
- What happened: Chrome began no drag (the page's dragstarts unchanged, drops 3 to 3). A ping of 177.8 ms extended
  the hold to 650 ms, and the engine answered ok with the hold's exact notice. That notice is honest under 898.2.
- Why 80b98959's and f8bd6949's judges counted it: `honestNotice` needs the runner's `dropped === false`, and the
  in-front drop case never set `dropped`. It is absent on all of its rows.
- Wave 5's judge reads the page's no-drop evidence (f10946bf, "an in-front hold notice judged honest on the page's
  read evidence"). Replayed under it (`f10946bf/v5-earlier-runs-rejudged.txt`), the sample is no false ok, and no
  other in-front verdict gains or loses one.
- f10946bf's own in-front notice on 158 (block 21/0, cold, no dragstart) is judged honest in its own run.

**The judge's verdicts.**
- The cancel cell passes in every run.
- The in-front cell fails in every run at twice the load, and never on a false ok under wave 5's judge. It fails on
  "the effect was not verified": the samples with unconfirmed-drop notices, 5 to 13 a run. It also fails on "the
  witness changed": 2 to 11 a run.
- These two reasons are twice-load conditions of the arm VM (task 116 saw them too), not the residue.
- The verdict rows per run are at the end of each `v5.md`.

### The hold's path, the identification and the take against the press (per sample: `*/samples.tsv`)

| head | Chrome | cell | `path` (took before the hold) | fixed (took inside B) | extended (took 450 to 650) | noticed (no take by 650) | no hold record | identified (of samples that held) | take after press, p50 / p90 / max, fixed (ms) | extended takes (ms) |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|
| **f10946bf** | **156** | in front | 8 | 67 | 0 | 0 | 0 | 67 / 67 | 165.8 / 268.1 / 442.1 | – |
| **f10946bf** | **156** | cancel | 0 | 38 | 0 | 1 | 36 | 39 / 39 | 208.1 / 269.2 / 357.9 | – |
| **f10946bf** | **158** | in front | 4 | 69 | 1 | 1 | 0 | 71 / 71 | 157.1 / 262.0 / 402.0 | 495.4 |
| **f10946bf** | **158** | cancel | 0 | 39 | 0 | 2 | 34 | 41 / 41 | 193.6 / 339.3 / 388.4 | – |
| f8bd6949 | 156 | in front | 9 | 66 | 0 | 0 | 0 | 66 / 66 | 158.4 / 257.5 / 399.5 | – |
| f8bd6949 | 156 | cancel | 0 | 35 | 1 | 2 | 37 | 38 / 38 | 199.2 / 255.0 / 336.9 | 452.1 |
| f8bd6949 | 158 | in front | 6 | 68 | 1 | 0 | 0 | 69 / 69 | 155.9 / 250.2 / 414.7 | 511.9 |
| f8bd6949 | 158 | cancel | 0 | 43 | 0 | 2 | 30 | 45 / 45 | 191.1 / 259.2 / 355.7 | – |
| 80b98959 | 156 | in front | 24 | 199 | 2 | 0 | 0 | 201 / 201 | 154.7 / 244.3 / 449.4 | 511.9, 573.6 |
| 80b98959 | 156 | cancel | 0 | 119 | 2 | 5 | 99 | 126 / 126 | 205.9 / 271.1 / 445.4 | 458.3, 507.9 |
| 80b98959 | 158 | in front | 27 | 192 | 5 | 1 | 0 | 198 / 198 | 142.6 / 243.2 / 438.3 | 456.3, 466.6, 485.3, 497.5, 532.5 |
| 80b98959 | 158 | cancel | 0 | 99 | 1 | 2 | 123 | 102 / 102 | 187.0 / 341.4 / 434.0 | 553.0 |

- **Identification.** The engine identified Chrome as the source on every sample whose hold ran, on both versions and
  every head. No held sample was unidentified.
- **The tail is caught.** Every in-front dragstart past 450 ms after the press took inside the extension and dropped:
  - 80b98959: 2 on 156 and 4 on 158 (457.1 to 555.6 ms);
  - f8bd6949 and f10946bf: 1 each, on 158 (501.8 and 486.6 ms).

  No dragstart came past 650 ms.
- **Cancel-cell samples with no hold record:** the engine's dnd route took on its path, so it recorded no hold.

## 2. The canary series: 20 K1 and 20 K2 per harness (ruling 907)

Each run's row is in `*/canary.md`. Each run's re-judgement under every rule, with every held press's largest ping
wait, is in `*/canary-rejudged.md`.

| series (harness) | step | Chrome | runs | both cells pass, as run | busy / held (≥ 5 ms), lowest run | busy / held, pooled | slow presses (≥ 20 ms) per run, fewest | slow and started per run, fewest | select control fast on every warm held drag |
|---|---|---|---:|---:|---|---|---:|---:|---:|
| **f10946bf** | **K1** | **156** | 20 | **20/20** | 5 / 9 | 134 / 177 | 5 | 5 | 20/20 |
| **f10946bf** | **K2** | **158** | 20 | **20/20** | 5 / 8 | 120 / 151 | 5 | 5 | 20/20 |
| 80b98959 | K1 | 156 | 20 | 20/20 | 5 / 9 | 125 / 170 | 5 | 5 | 20/20 |
| 80b98959 | K2 | 158 | 20 | 20/20 | 6 / 8 | 123 / 147 | 5 | 5 | 20/20 |

**Pass rate under each rule.** `scripts/canary_rejudge.mjs` replays each stored run through each checkout's
`holdCanary` (the canary only, not the cells' other rules).

| series | 80b98959's rule (busy ≥ half, ≥ 3 held) | wave 4's rule (also ≥ 1 held press at ≥ 20 ms; the plain control must have evidence) | wave 5's rule (also: a slow press must have started a drag) |
|---|---|---|---|
| 80b98959's runs, K1 | 20/20 | 20/20 | 20/20 |
| 80b98959's runs, K2 | 20/20 | 20/20 | 20/20 |
| f10946bf's runs, K1 | 20/20 | (not replayed; wave 5's rule includes wave 4's) | 20/20 |
| f10946bf's runs, K2 | 20/20 | (not replayed; wave 5's rule includes wave 4's) | 20/20 |

**It does not flake near its floor on arm64.** The pings are bimodal on arm at idle:
- a held draggable press reads about 77 to 100 ms when Chrome is setting up its drag, or under 10 ms when it is not;
- the select control reads 0 slow on every warm held drag.

The fewest slow presses in any of the 80 runs is 5, against wave 4's floor of 1. The lowest busy share is 5 of 9,
against the floor of half. x64's thin margin on Chrome 158 (2 of 8 presses at 20 ms) does not appear here.

## Files

- `80b98959/`, `f8bd6949/`, `f10946bf/`: each has `v5.md` (the cells, the paths, the dragstarts, every notice in
  full, the judge's verdicts) and `samples.tsv` (one line per sample). 80b98959 and f10946bf also have `canary.md`
  and `canary-rejudged.md`.
- `f10946bf/v5-earlier-runs-rejudged.txt`: the 80b98959 and f8bd6949 V5 runs replayed under wave 5's judge
  (`rejudge-device.mjs --diagnostic`, the in-front verdicts). The replay also adds "the audit did not run", since
  these runs had `--no-audit`.
- `procs/`: the process records and their summaries.
- `logs/chain.log`: every run's start and end, the load, and the PATH's Chrome. `logs/host-lock-m5-tail042.txt`:
  every acquire and release. `logs/builds.txt`: the three builds.
- `scripts/`: the plans and chains (`plan.sh`, `w4-plan.sh`, `w5-plan.sh`; `chain.sh`, `chain2.sh`, `chain3.sh`),
  `procrec.sh`, `private-run.mjs` (task 113's), `tail_tables.py`, `canary_tables.py`, `canary_rejudge.mjs` and
  `procs_summary.sh`. `w6-plan.sh` ran ruling 913's wave-6 smoke (below).


## The final review's check: identification time in the counted f10946bf block (ruling 921)

`f10946bf/identify-times.md`, from `scripts/identify_times.py`. The field read is `engine_stats.browser_identity.ms`
on every cua sample.

| Chrome | runs | samples with a record | max ms | max ms, held samples | over 50 ms |
|---|---|---:|---:|---:|---:|
| 156 | V5 at twice the load (1 run) | 150 | 27.0 | 19.6 | **0** |
| 158 | V5 at twice the load (1 run) | 150 | 25.0 | 25.0 | **0** |
| 156 | K1, 20 runs | 360 | 0.9 | 0.9 | **0** |
| 158 | K2, 20 runs | 360 | 1.7 | 1.7 | **0** |

**No identification in the counted block took more than 50 ms, so the block carries over unchanged.** Wave 6's rule,
that an identification past 50 ms counts as none, would have changed no sample. Ruling 921's extra run was therefore
not needed and was not made.

## Wave 6's smoke at 9371d234 (ruling 913.2)

- **Binary:** arm64 static musl, built on the VM under `m5-tail042`. sha256
  `d0e2f2b265865b74df7ecb9f18a03ea41bc387dcc9781bff6d24b8aa76fde280`, `cua-engine 0.4.2 (9371d2348cf8)`.
- **Harness:** the `t118-wave6` checkout at 9371d234.
- **V5:** one 7-block run per Chrome version at twice the load (21 in-front and 21 cancel samples each), as the
  counted block ran.
- **Canary:** 5 K1 and 5 K2 runs in gate form, sandboxed, as the counted block ran.
- **Process records:** every 156 run drove only `/opt/google/chrome/chrome`, and every 158 run drove only T7's 158
  tree.

| Chrome | V5 in front: n / landed | false oks | hold notices (in front / cancel), false alarms | unconfirmed-drop notices | in-front verdict | cancel verdict | K step: runs passed | canary busy / held, lowest | identification max (held), over 50 ms |
|---|---|---:|---|---:|---|---|---|---|---|
| 156 | 21 / 21 | **0** | 0 / 2, 0 | 0 | pass | pass | K1 5/5 | 5 / 9 | 13.7 ms, 0 |
| 158 | 21 / 18 | **0** | 0 / 1, 0 | 3 | fail: effect not verified 3, witness changed 2 | pass | K2 5/5 | 5 / 8 | 16.9 ms, 0 |

- **Target met: 0 false oks.** The healthy path did not move.
- **The tail behaved as before.** One 156 in-front dragstart came at +475.6 ms. It took inside the extension at
  +481.0 ms and dropped.
- **Every hold notice was honest.**
- **158's in-front fail has the twice-load reasons seen throughout,** not a false ok: 3 honest unconfirmed-drop
  notices and 2 stacking-notify witness spans.
- **Every canary run passed both cells,** with at least 5 slow presses per run.
- Evidence: `9371d234/` (`v5.md`, `samples.tsv`, `canary.md`, `canary-rejudged.md`, `identify-times.md`) and
  `procs/9371d234/`.
