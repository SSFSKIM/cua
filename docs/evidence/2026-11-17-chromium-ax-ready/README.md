# #366: Chromium's first background action waits for accessibility readiness (hosted, 2026-11-17)

The unmodified fix `22f4d3050b085e6392a8fec12984a28b5b83022a` delivered every executed qualification action exactly once. Its first observation pays the readiness window before recording element tokens; ordinary subsequent actions have near-zero readiness-gate waits. Main `c7eee72403d64c420231ce59baa445524032102f` delivered none of the 60 cold button controls: Electron returned 40 false successes, and Chrome for Testing (CfT) explicitly refused 20 clicks.

The full run has one retained setup-invalid attempt, not a product failure or a clean pass. The matched supplement shows that default Electron's guarded transient window raises occur on main too, with the same counts, routes and kind. The short smoke at the later five-minute-grace head verifies 36-second ownership retention and task-end release/re-enablement; it does not wait five minutes.

## Runs and reproducibility

All runs use workflow `probe-366` (420885758), kit branch `probe/366-measure`, disposable GitHub-hosted `macos-latest` runners, and fresh owned fixture processes/profiles. Main and fix engines are built at exact pins in separate runner worktrees; the workflow checks that neither engine source tree was modified. No native probe gate, forced route, named carrier or engine source patch is used.

| Run | Kit | Engine(s) | Evidence and status |
|---|---|---|---|
| [Updated smoke 44077494158](https://github.com/SSFSKIM/cua/actions/runs/44077494158) | `11b52026` | fix `22f4d305`, main `c7eee724` | 42 launches, 54 actions, 48 observations; complete and green |
| [Full qualification 44080159451](https://github.com/SSFSKIM/cua/actions/runs/44080159451) | `11b52026` | fix `22f4d305`, main `c7eee724` | 300 launch records; 299 valid launches, 389 actions, 329 observations; red solely for one startup-invalid launch |
| [Matched supplement 44085341355](https://github.com/SSFSKIM/cua/actions/runs/44085341355) | `f2d5fbb7` | fix `22f4d305`, main `c7eee724` | 80/80 launches, 160 actions, 120 observations; complete and green |
| [Lifecycle smoke 44086986242](https://github.com/SSFSKIM/cua/actions/runs/44086986242) | `8cda5b90` | fix only, `3bb77a9c2e6b360d35ddadecf996a1cc2abbc01e` | 9 launches, 27 actions, 27 observations; all product stages pass; original workflow red on an auxiliary timestamp-resolution reader bug; retained data replays complete with reader `9632bef9` |
| [One-cell recovery 44087018258](https://github.com/SSFSKIM/cua/actions/runs/44087018258) | `8cda5b90` | fix `22f4d305` | 1/1 fresh launch, observation and action complete; value delivered exactly once with success, no valueUnconfirmed; green |

Artifact names are `probe-366-qualification-<browser>-<mode>`, with browsers `electron`, `electron-parity`, `cft` and modes `qualification`, `qualification-supplement`, `qualification-lifecycle`, or `qualification-repair`. Artifacts retain `rows.jsonl`, `config.json`, native signposts and fixture/transport logs, never browser profiles. Read each mode's artifacts separately: combining full and supplement rows would mix their statistical groups.

Run the trusted kit reader against downloaded artifacts as data, not from inside an artifact directory:

```sh
node scripts/probe-366/qualification-read.mjs summary /absolute/path/to/artifacts
node scripts/probe-366/qualification-read.mjs coverage /absolute/path/to/artifacts
```

Use reader `9632bef9` or later for the lifecycle artifact. The original workflow conclusions and original invalid records remain unchanged.

## What is judged

The fixture is a controlled React/Radix dialog with an ordinary button and search field. A click passes only when the page's own handler count increments exactly once, with a successful engine reply. A set_value passes only when DOM value, React value and the matching search handler event all contain the distinct requested value. An unchanged page, a surviving dialog, or AXError 0 never confirms delivery. Page id, time origin and trial ownership are checked.

Every measured action checks that the owned cover app is still frontmost immediately before dispatch; it refuses rather than reactivating the cover. Native effects are persisted before renderer reads, and finalized even if later reads fail. Native/renderer samples run at 0, 50, 250, 1000 and 3000 ms after each RPC. The field is focused in fixture setup before backgrounding for set_value: these cells isolate readiness from the separately scoped background focus-refusal issue.

Cold cells use one real get_app_state followed immediately by the ordinary-token action, apart from the oracle/cover precondition reads. Warm second clicks reuse the first observation's token; there is no second warm observation to price. Post-hold cells send no engine observation/input until at least 36 seconds after the first action RPC ends, then require the next observation's actual prior to be non-owned before acting. That waits past the 30-second grace plus dispatch leeway on `22f4d305`; time alone is not proof of release.

Waits below are actual native intervals, not RPC time minus assumed overhead. The reader pairs `observation.chromiumReady` or `prologue.chromiumReady` inside native request intervals, then associates requests to sequential RPCs by method and order. It does not join OS-log timestamps to JS wall-clock request windows. Main has no readiness gate: its deliberate zero is structural, not inferred from missing signposts. Missing or ambiguous evidence stays unknown and fails coverage.

**All triples below are p50 / p95 / max, in milliseconds.** Every delivery fraction has its own denominator; `not run` is not zero delivery.

## Full qualification: cold, load, value and early tokens

These are the original full-run numbers, before the separately labelled recovery.

| App | Cell | Fix n | Observation wait | Action gate wait | Fix delivery | Main delivery | Largest observation interval excess above 2500 ms |
|---|---|---:|---|---|---|---|---:|
| Default Electron | cold click | 20 | 2524.492 / 2573.830 / 2578.471 | 0.003 / 0.017 / 0.021 | 20/20 | 0/20 | 78.471 |
| Default Electron | cpu:2 click | 20 | 2554.505 / 2573.612 / 2573.841 | 0.003 / 0.007 / 0.010 | 20/20 | not run | 73.841 |
| Default Electron | set_value | 9 valid + 1 setup invalid | 2516.477 / 2560.690 / 2560.690 | 0.003 / 0.042 / 0.042 | 9/9 executed | 10/10 | 60.690 |
| Default Electron | early token | 10 | 0.167 / 0.496 / 0.496 | 2286.363 / 2339.654 / 2339.654 | 10/10 same target | not run | not comparable; remaining window |
| Parity Electron | cold click | 20 | 2517.890 / 2572.012 / 2572.087 | 0.004 / 0.012 / 0.019 | 20/20 | 0/20 | 72.087 |
| Parity Electron | cpu:2 click | 20 | 2529.933 / 2574.456 / 2574.459 | 0.004 / 0.009 / 0.011 | 20/20 | not run | 74.459 |
| Parity Electron | set_value | 10 | 2519.837 / 2575.700 / 2575.700 | 0.005 / 0.010 / 0.010 | 10/10 | 10/10 | 75.700 |
| Parity Electron | early token | 10 | 0.231 / 0.446 / 0.446 | 2262.050 / 2314.565 / 2314.565 | 10/10 same target | not run | not comparable; remaining window |
| CfT | cold click | 20 | 2529.793 / 2573.288 / 2647.726 | 0.003 / 0.010 / 0.022 | 20/20 | 0/20 | 147.726 |
| CfT | cpu:2 click | 20 | 2528.774 / 2574.124 / 2577.340 | 0.003 / 0.007 / 0.020 | 20/20 | not run | 77.340 |
| CfT | set_value | 10 | 2514.571 / 2571.865 / 2571.865 | 0.004 / 0.018 / 0.018 | 10/10 | 10/10 | 71.865 |
| CfT | early token | 10 | 0.347 / 0.683 / 0.683 | 2161.008 / 2293.685 / 2293.685 | 10/10 same target | not run | not comparable; remaining window |

The excess column prices the measured observation interval's excess over the nominal 2.5-second window; it is not RPC overhead or an exact accepted-write-to-action measurement. The largest is CfT cold, 147.726 ms. No action-gate interval exceeded 2.5 seconds. Early-token observations deliberately use a 1250 ms deadline and are marked `chromiumReady: deadline`; their actions wait only the remaining readiness window. Neither interval is a standalone 2.5-second target, and these qualification records do not expose the exact accepted-write epoch needed to price end-to-end early-cell overshoot.

All 30 early-token actions used the original early token unchanged. All delivered exactly once to the intended button; allowed elementNoLongerValid refusals 0, wrong-target hits 0, unsafe outcomes 0. Every answered set_value succeeded and delivered, with **valueUnconfirmed 0** on both heads. The missing value attempt dispatched no RPC or action.

### RPC cost, separate from the gate

| App | Cell | Fix observation RPC | Fix action RPC | Main observation RPC | Main action RPC |
|---|---|---|---|---|---|
| Default Electron | cold | 2766 / 2823 / 2904 | 113 / 163 / 173 | 234 / 326 / 376 | 140 / 168 / 207 |
| Default Electron | cpu:2 | 2752 / 2814 / 2839 | 142 / 169 / 170 | not run | not run |
| Default Electron | set_value, executed n=9 | 2772 / 2926 / 2926 | 133 / 153 / 153 | 254 / 477 / 477 | 143 / 176 / 176 |
| Default Electron | early token | 238 / 271 / 271 | 2424 / 2487 / 2487 | not run | not run |
| Parity Electron | cold | 2802 / 2944 / 2985 | 153 / 263 / 278 | 269 / 332 / 534 | 141 / 251 / 251 |
| Parity Electron | cpu:2 | 2766 / 3075 / 3097 | 152 / 189 / 236 | not run | not run |
| Parity Electron | set_value | 2844 / 2969 / 2969 | 174 / 276 / 276 | 263 / 566 / 566 | 161 / 230 / 230 |
| Parity Electron | early token | 238 / 348 / 348 | 2407 / 2526 / 2526 | not run | not run |
| CfT | cold | 2899 / 2981 / 3170 | 135 / 162 / 208 | 349 / 415 / 705 | 13 / 19 / 36 |
| CfT | cpu:2 | 2886 / 3207 / 3614 | 144 / 174 / 204 | not run | not run |
| CfT | set_value | 2956 / 3111 / 3111 | 139 / 175 / 175 | 381 / 1090 / 1090 | 119 / 207 / 207 |
| CfT | early token | 309 / 478 / 478 | 2295 / 2472 / 2472 | not run | not run |

Main's observation and action readiness-gate costs are zero by construction, not measured missing values. Its cold Electron replies are false successes, while its cold CfT replies are explicit backgroundClickRefused errors. All 30 main set_value controls succeed and deliver.

### Warm and genuinely released post-hold cells

Warm has no additional observation: it reuses the cold observation and its token. At `22f4d305`, all 30 genuine post-hold observations read `enablementPrior: false`, attempted a successful enablement write, and waited again. None re-read true and skipped the write. Thus every measured post-release observation paid roughly 2.5 seconds again, while its following action had no substantial readiness wait.

| App | Step | n | Observation prior / write | Observation wait | Observation RPC | Action gate wait | Action RPC | Delivery |
|---|---|---:|---|---|---|---|---|---|
| Default Electron | warm second click | 20 | no new observation | not applicable | not applicable | 0.005 / 0.017 / 0.021 | 173 / 187 / 192 | 20/20 |
| Default Electron | post-hold | 10 | false / success | 2550.288 / 2571.098 / 2571.098 | 3061 / 3163 / 3163 | 0.003 / 0.005 / 0.005 | 170 / 180 / 180 | 10/10 |
| Parity Electron | warm second click | 20 | no new observation | not applicable | not applicable | 0.009 / 0.089 / 0.111 | 23 / 28 / 31 | 20/20 |
| Parity Electron | post-hold | 10 | false / success | 2525.699 / 2581.646 / 2581.646 | 3095 / 3160 / 3160 | 0.003 / 0.011 / 0.011 | 18 / 26 / 26 | 10/10 |
| CfT | warm second click | 20 | no new observation | not applicable | not applicable | 0.007 / 0.018 / 0.021 | 21 / 28 / 28 | 20/20 |
| CfT | post-hold | 10 | false / success | 2532.826 / 2577.425 / 2577.425 | 3112 / 3294 / 3294 | 0.003 / 0.013 / 0.013 | 16 / 36 / 36 | 10/10 |

For completeness, the post-hold groups' initial cold primers are separate from the 20-repetition cold group above. Each has n=10 and exact delivery 10/10:

| App | Primer observation wait | Primer observation RPC | Primer action gate wait | Primer action RPC | Post-hold idle from primer RPC end |
|---|---|---|---|---|---|
| Default Electron | 2540.748 / 2576.928 / 2576.928 | 2759 / 2988 / 2988 | 0.003 / 0.020 / 0.020 | 149 / 185 / 185 | 36003 / 36011 / 36011 |
| Parity Electron | 2535.089 / 2570.069 / 2570.069 | 2820 / 3019 / 3019 | 0.003 / 0.040 / 0.040 | 136 / 269 / 269 | 36006 / 36011 / 36011 |
| CfT | 2534.576 / 2582.353 / 2582.353 | 2936 / 3127 / 3127 | 0.004 / 0.019 / 0.019 | 139 / 186 / 186 | 36009 / 36019 / 36019 |

### The load actually delivered

The load is the hosted parity `cpu:2` recipe: two normal-priority `/usr/bin/yes` burners per logical core, not two workers total. All runners exposed three logical cores: six owned burners, represented in both before/after process samples in all 60 loaded calls. CPU below is aggregate percent, calculated from cumulative CPU-time deltas divided by wall time; 300% corresponds to three fully occupied cores.

| App | n | Measured CPU %, min | CPU % p50 / p95 / max | Delivered |
|---|---:|---:|---|---|
| Default Electron | 20 | 252.963 | 276.623 / 286.967 / 287.457 | 20/20 |
| Parity Electron | 20 | 164.545 | 243.832 / 280.763 / 281.407 | 20/20 |
| CfT | 20 | 192.771 | 279.254 / 283.592 / 286.389 | 20/20 |

### Every raise in the full run

The engine reported **30 transient window-order raises**, all default Electron fix, all at route 3's synthesized click (`elementClick.plan: synthesized`, `reason: descendant`, `activationJoin: shared`). They are not frontmost app activations. Every one read the original order back inside its screen-update hold: outlivedHold 0, raiseLeft 0, frontmostRestored 0, repairedAfterRelease 0. Clean post-RPC samples do not erase these in-hold events.

| Full-run cell | Raises / calls | Duration min | Duration p50 / p95 / max |
|---|---|---:|---|
| Default Electron fix, warm | 20/20 | 10.769 | 16.266 / 26.320 / 35.414 |
| Default Electron fix, post-hold | 10/10 | 14.367 | 20.410 / 39.766 / 39.766 |
| All other measured full-run cells | 0 | not applicable | not applicable |

Every individual duration follows in repetition order, starting at rep 0. Route and kind are the same for each: **route 3, synthesized/descendant/shared; contained window-order transient**.

- Warm, reps 0–19: `22.144, 10.769, 16.641, 35.414, 23.220, 11.653, 14.957, 13.799, 24.815, 16.266, 11.906, 13.150, 13.103, 23.134, 11.232, 23.171, 26.320, 14.258, 21.143, 21.181` ms.
- Post-hold, reps 0–9: `26.857, 34.861, 26.215, 39.766, 30.701, 20.410, 17.664, 15.250, 16.094, 14.367` ms.

The full plan has no main warm/post-hold denominator. The matched supplement below supplies it; absent main cells are not counted as zero raises.

## Matched supplement: raises are already on main

The supplement holds the engine pins fixed at `22f4d305` and `c7eee724`: 10 repetitions per head and cell in default Electron, five in parity Electron and CfT. Each launch measures its cold primer and either a warm second click or a genuinely released 36-second post-hold click. All 80 launch records and native waits are complete.

| App | Measured step | Main delivery | Fix delivery | Main raises | Fix raises | Main raise duration min; p50 / p95 / max | Fix raise duration min; p50 / p95 / max |
|---|---|---|---|---|---|---|---|
| Default Electron | warm | 10/10 | 10/10 | 10/10 | 10/10 | 13.056; 18.104 / 37.723 / 37.723 | 8.052; 19.016 / 34.958 / 34.958 |
| Default Electron | post-hold | 10/10 | 10/10 | 10/10 | 10/10 | 12.269; 20.503 / 35.758 / 35.758 | 14.695; 26.970 / 33.317 / 33.317 |
| Parity Electron | warm | 5/5 | 5/5 | 0/5 | 0/5 | not applicable | not applicable |
| Parity Electron | post-hold | 0/5 | 5/5 | 0/5 | 0/5 | not applicable | not applicable |
| CfT | warm | 5/5 | 5/5 | 0/5 | 0/5 | not applicable | not applicable |
| CfT | post-hold | 5/5 | 5/5 | 0/5 | 0/5 | not applicable | not applicable |

There is no observed increase in raise incidence or new raise kind on the fix. The 40 supplement raises all use the same default-Electron route 3 synthesized/descendant/shared path and are contained window-order transients; none becomes a frontmost activation, outlives its hold, remains raised or needs an after-release repair. These small cells do not establish identical duration distributions.

Every supplement raise duration, reps 0–9, in ms:

- Main warm: `17.809, 18.104, 15.978, 20.469, 20.410, 13.056, 26.938, 13.982, 34.980, 37.723`.
- Fix warm: `13.801, 30.229, 21.862, 34.958, 14.310, 22.263, 25.068, 15.183, 8.052, 19.016`.
- Main post-hold: `26.666, 35.758, 20.503, 17.943, 29.512, 19.507, 12.269, 29.772, 28.782, 19.694`.
- Fix post-hold: `31.117, 27.569, 18.598, 30.670, 26.970, 19.074, 17.226, 14.695, 33.317, 28.415`.

All cold primers report zero raises. The supplement's cold primers reproduce main's failure to deliver and fix's delivery. Parity/CfT warm and post-hold paths use AXPress rather than default Electron's synthesized descendant click. The parity main post-hold calls are false successes. CfT main post-hold delivers but costs an action RPC of 2028 / 2090 / 2090 ms, versus fix's 18 / 20 / 20 ms after the fix observation has already paid its readiness wait. Normal-route differences are retained, not forced to manufacture equal paths.

## Five-minute-grace lifecycle smoke

Ruling 775's later head `3bb77a9c` changes the enablement idle grace from 30 seconds to five minutes. Three fresh fix-only launches per app kind each measure: a cold observation and click; 36 seconds of no engine activity, then an owned observation and click; endTask, release evidence, a new connection/task, and its first observation and click. **The five-minute timeout itself is not waited out.**

All nine launches have every product stage passing: 27/27 exact deliveries and success replies, 27/27 native observation waits, no wrong target, no unknown oracle. Each 36-second observation reads owned, writes nothing, and waits essentially nothing. Each new task reads false, writes successfully, waits again, then delivers.

| App | Stage (n=3 each) | Prior / write | Observation wait | Observation RPC | Action gate wait | Action RPC | Delivery |
|---|---|---|---|---|---|---|---|
| Default Electron | cold | false / success | 2547.435 / 2644.985 / 2644.985 | 2761 / 3010 / 3010 | 0.005 / 0.006 / 0.006 | 144 / 229 / 229 | 3/3 |
| Default Electron | after 36 s | owned / absent | 0.006 / 0.006 / 0.006 | 361 / 379 / 379 | 0.003 / 0.003 / 0.003 | 174 / 175 / 175 | 3/3 |
| Default Electron | new task after endTask | false / success | 2561.587 / 2570.786 / 2570.786 | 2759 / 2784 / 2784 | 0.005 / 0.011 / 0.011 | 215 / 218 / 218 | 3/3 |
| Parity Electron | cold | false / success | 2572.775 / 2610.766 / 2610.766 | 2886 / 2970 / 2970 | 0.005 / 0.006 / 0.006 | 163 / 227 / 227 | 3/3 |
| Parity Electron | after 36 s | owned / absent | 0.007 / 0.027 / 0.027 | 377 / 416 / 416 | 0.004 / 0.005 / 0.005 | 15 / 27 / 27 | 3/3 |
| Parity Electron | new task after endTask | false / success | 2512.208 / 2567.544 / 2567.544 | 2710 / 2887 / 2887 | 0.003 / 0.004 / 0.004 | 132 / 138 / 138 | 3/3 |
| CfT | cold | false / success | 2522.484 / 2574.963 / 2574.963 | 2786 / 2899 / 2899 | 0.003 / 0.003 / 0.003 | 131 / 191 / 191 | 3/3 |
| CfT | after 36 s | owned / absent | 0.006 / 0.028 / 0.028 | 425 / 433 / 433 | 0.003 / 0.003 / 0.003 | 11 / 14 / 14 | 3/3 |
| CfT | new task after endTask | false / success | 2549.970 / 2550.546 / 2550.546 | 2800 / 2819 / 2819 | 0.003 / 0.004 / 0.004 | 137 / 163 / 163 | 3/3 |

Release evidence is deliberately layered:

- All nine post-endTask native enablement reads are false. A getter alone is not proof: Electron's Manual getter is computed, and Chromium getters/actions are not a universal mode contract.
- Both Electron variants emit the independent false setter event after endTask and before the next observation in 6/6 launches.
- CfT's same cached button reference loses AXPress in 1/3 launches and retains it in 2/3. This is a recorded release signal, not a claim that every release immediately destroys its complete-mode action metadata.
- All nine new tasks report a non-owned false prior, a successful write, the actual readiness wait, and exact delivered action. The endTask reply's released count is one in every launch, but that count denotes processes no longer observed and is not counted alone as proof of a successful native write-back.

Default Electron reports three contained raises at the held step (`22.496, 17.940, 23.382` ms), on route 3 synthesized/descendant with shared activation, and three at the new-task step (`19.275, 19.702, 12.700` ms), on route 3 synthesized/descendant with fresh activation and a posted activation click. They are window-order transients; none outlives the hold, remains raised, becomes a frontmost activation or needs an after-release repair. Parity and CfT report no raises. Sampled dialog, foreground, window geometry, pointer and ownership effects are clean in all 27 actions; this does not erase the six engine-reported in-hold raises.

### Why the original lifecycle workflow is red

The original reader compared Swift fractional epoch-ms auxiliary timestamps directly to JS Date.now integer-ms request boundaries. Four rows were falsely labelled lifecycle-cache or lifecycle-release when a native end exceeded the next JS integer start by only 0.15–0.54 ms in the same millisecond. No observation, action, gate or release record was missing.

Reader `9632bef9` compares these auxiliary boundaries at the common integer-millisecond resolution, retaining raw native start/end ordering and all original durations. A regression reproduces the measured fractions, rejects inversions of at least 1 ms, and rejects an internally inverted native interval. Independent review is clean. Replaying the original artifacts gives 9/9 complete launches and 9/9 product-pass launches. The workflow's original red conclusion and raw timestamps are not changed or hidden. This is unrelated to the native-signpost/JS clock-offset problem; signpost association still uses native request intervals.

## Retained invalid attempt and one-cell recovery

The full run's `qualification/electron/value/fix/1` failed at setup with ECONNREFUSED after the socket inode appeared but before the direct kit connection succeeded. It has no observation or action and is not a failed value write, a false success or a passing cell. Its row, launch id and original red workflow remain retained. The full run is therefore 299 valid launches out of 300 attempts, not 300/300.

Kit `8cda5b90` bounds Wire.connect startup to five seconds, retrying only ENOENT and ECONNREFUSED while cleaning up each failed socket. It never retries an RPC or an action. The fix was tested against real stale socket inodes and delayed listeners, bounded permanent failures and immediate non-retriable errors. The test helper awaits child close, including stdio closure, before taking its leak baseline; the strict leak assertion is unchanged.

The production client already has a bounded connect-and-ping retry loop in `src/services/engine/client.mjs` (`attempt`, then the post-launch five-second attempt in `establish`). The CLI/doctor launcher also polls status after launch. This observed one-shot failure is in the direct probe path, not a newly found production startup bug. No production source was changed by the kit.

Recovery run 44087018258 measures only a fresh `qualification-repair/electron/value/fix/1`, with `recoveryOf: qualification/electron/value/fix/1`, against the original `22f4d305` pin. It is complete and green: the value is delivered exactly once with a success reply, valueUnconfirmed 0, no observed side effects, and complete native wait evidence.

| Recovery n | Observation wait | Observation RPC | Action gate wait | Action RPC | Delivery |
|---:|---|---|---|---|---|
| 1 | 2573.534 / 2573.534 / 2573.534 | 3046 / 3046 / 3046 | 0.008 / 0.008 / 0.008 | 193 / 193 / 193 | 1/1 |

The recovery observation's interval exceeds 2500 ms by 73.534 ms. The original full-run tables are not recomputed or silently pooled with this later sample. Across the original full run plus this labelled recovery, there are 301 launch attempts, 300 valid launches, 390 measured actions and 330 observations. Fix delivery is 300/300 executed actions, including 30/30 set_value writes across both runs; the one original setup-invalid attempt is still present. This neither replaces that invalid attempt nor turns the original red workflow green.

## Environment and limits

- Electron 44.4.5, React 19.1.1 and Radix Dialog 1.1.15 are pinned by the owned fixture. Parity Electron uses MAWS-like hiddenInset title chrome and renderer drag toolbar; default Electron uses its normal native title bar. CfT is the harness browser on the hosted image; these qualification configs do not pin a separate CfT binary version.
- The full run uses image `20261102.0473.1` for all three app kinds. The supplement uses that image for default Electron and CfT and `20261112.0504.1` for parity Electron. Head comparisons in the supplement are within each browser job, not a cross-image contrast.
- This is one controlled dialog/page with a stable intended button. The early-token test exercises pre-readiness metadata refresh on that target, not every possible DOM replacement/reordering. The set_value field is deliberately pre-focused before backgrounding.
- All executed original-full calls have known page-side outcomes and native wait evidence; the one setup-invalid launch stays separate. The full and supplement have no observed persistent dialog close, foreground change, geometry move, pointer side effect or ownership loss. Sampling cannot exclude every shorter-lived effect; engine-reported in-hold raises are reported separately above.
- The default-Electron raises are already present on main in the matched cells. The supplement bounds observed incidence/kind, not equality of all future raise-duration distributions or absence of an unobserved flash.
- The lifecycle smoke verifies ownership after 36 seconds and task-end release/re-enablement on `3bb77a9c`. It is not a full rerun of the `22f4d305` matrix, does not wait five minutes, and does not live-test engine-stop release. The five-minute expiry is left to the product's unit tests.
- Every live action ran on disposable GitHub-hosted runners, with no human at the console. Neither the Mac mini nor the owner's local GUI, Chrome profiles, secrets, credentials or apps was used.
