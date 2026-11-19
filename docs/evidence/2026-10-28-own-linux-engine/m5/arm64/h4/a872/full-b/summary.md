# linux-engine-diff summary

## full-b (experiment activation-872b; development run on the pinned release, not acceptance, never counted)

candidate: sha256 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0, aarch64-unknown-linux-musl static, cua-engine 0.4.1 (7522dcb8fb8c); the pin's arm64 asset of linux-engine-v0.4.1; native/linux-engine as at 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5, the checkout at 3b5c0441b41e67ab87dd1265d2ca74325f93dec3; attestation verified: .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44380699966/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/release/linux-engine-v0.4.1) on a github-hosted runner; .github/workflows/linux-engine.yml run https://github.com/SSFSKIM/cua/actions/runs/44372589299/attempts/1, built from 7522dcb8fb8ca8ec443c6da3493acd6b0d7362d5 (refs/heads/m5-engine-041) on a github-hosted runner

# ruling 872: the activation experiment, the precise rerun (development run, never counted)

Per family, 40 runs at load factor 2: activate_window from the front window, then press_key "x" on the desktop route at the answer, the focus watched 500 ms past the answer.

| family | runs | answered ok | X focus on the target at the answer (read at the answer) | _NET_ACTIVE_WINDOW the target at the answer (read) | focus left the target in the 500 ms | key recorded by the target | the read's round trip median / max ms | answer median / max ms | (b)-consistent |
|---|---:|---:|---:|---:|---:|---:|---|---|---:|
| gedit | 40 | 40 | 40 | 39 | 0 | 40 | 1 / 2.9 | 9 / 14 | 40 |
| kate | 40 | 40 | 40 | 38 | 0 | 40 | 0.9 / 3 | 8.9 / 25.9 | 40 |
| qtcreator | 40 | 40 | 40 | 40 | 0 | 40 | 0.9 / 5.9 | 8.6 / 30.8 | 40 |
| writer | 40 | 40 | 40 | 37 | 0 | 40 | 1 / 7 | 12 / 36 | 40 |
| gnome-terminal | 40 | 40 | 40 | 37 | 0 | 40 | 1 / 3.9 | 7.5 / 19.8 | 40 |

Ruling 872's reading: (b): every run had the X focus on the target at the answer, kept it for 500 ms, and the key landed in the target.

desktop: started with no window active, ended with 0x00a0000c active (harness), neither acted on; holder none; the harness's own trace: 9498 requests, 834 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it); **its end unclean** (its own side, not a verdict failure): a process it spawned still runs: pid 1967591 openbox

