# linux-engine-diff summary

## full (experiment activation-872; development run on the pinned release, not acceptance, never counted)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

# ruling 872: the activation experiment (development run, never counted)

Per family, 40 runs at load factor 2: activate_window from the front window, then press_key "x" on the desktop route at the answer, the focus watched 500 ms past the answer.

| family | runs | answered ok | X focus on the target at the answer | focus left the target in the 500 ms | key recorded by the target | _NET_ACTIVE_WINDOW named the target, ms from the answer (median / max; never) | answer median / max ms | (b)-consistent |
|---|---:|---:|---:|---:|---:|---|---|---:|
| gedit | 40 | 40 | 37 | 0 | 40 | -3.1 / 2.9; never 0 | 9.6 / 28.7 | 37 |
| kate | 40 | 40 | 37 | 0 | 40 | -2.8 / 2.6; never 0 | 8.7 / 24.8 | 37 |
| qtcreator | 40 | 40 | 38 | 0 | 40 | -2.7 / 6; never 0 | 9 / 25.6 | 38 |
| writer | 40 | 40 | 37 | 0 | 40 | -3.8 / 17.6; never 0 | 13 / 30 | 37 |
| gnome-terminal | 40 | 40 | 39 | 0 | 40 | -3.8 / 6.1; never 0 | 8.6 / 17 | 39 |

Ruling 872's reading: (a): at least one run missed (see the table and the rows).

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 9357 requests, 834 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1907658 openbox

