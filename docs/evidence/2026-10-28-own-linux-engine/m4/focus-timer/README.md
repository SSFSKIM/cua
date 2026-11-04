# M4 T7: the FocusOut timer

Development runs on the #171 VM (`dc-linux171-1e68`, 8 vCPU), 2026-11-03, not a release gate. Every run is on a
private Xvfb the harness starts itself (`startPrivateServer`, under its watchdog), with Openbox and the run's own
applications, homes and session bus; the harness withdraws its live-run declaration first, so nothing reaches `:0`.
The harness is exported from the commit named per run (the export has no `.git`, so the `meta` rows say
`commit: null`). The candidate is a musl build made as the release workflow makes it (`build-musl.sh`: a hermetic
Cargo home, the remapped paths, `cargo build --release --locked --target x86_64-unknown-linux-musl`, stripped,
static-pie): `cua-engine 0.3.0 (24a86030038a)`, sha256
`a9362c71300642af52cb6bffaa2c4161e0bcba72394d69ac7f1db236e5f73612`. Its engine sources are those of fd581052 (no
engine change since). The released engine is `cua-engine 0.3.0 (cd4c929758ca)`. "Twice the load" is 16 `stress-ng`
CPU workers on the 8 cores (`--load-factor 2`).

The experiment (`scripts/linux-engine-diff/focus-timer.mjs`, its README section "M4 T7's addition"): per family, three
lanes, `timer` (the engine as it ships), `unredirect` (the delay, each request's redirect dropped with its FocusOut,
`--retention per-request`) and `control` (`--teardown-ms 0 --retention per-request`); scenarios `burst`, `aba`,
`paste`, each read back as the exact text at the caret; 30 consecutive passes for a timed lane (at most 60 runs), 10
control runs; an audit pass per family on the timer and control lanes; on Chromium 10 SIGTERM runs straight after a
burst's last answer and 3 SIGKILL controls.

| Directory | Harness | Engine | Load | Verdict |
|---|---|---|---|---|
| `idle/` (`t56-final-idle-b`) | 24a86030 | candidate | idle | **pass** (exit 0) |
| `load2/` (`t56-final-load2-b`) | 24a86030 | candidate | 2x | fails: see below |
| `delay-200-load2/`, `delay-400-load2/` | 24a86030, the delay set to 200 / 400 ms (a probe copy) | candidate | 2x | Chromium only |
| `terminal-030-load2/` | 24a86030 | released 0.3.0 | 2x | gnome-terminal only |
| `control-probe/` (`t56-probe-perreq`) | 78053e2b, the control given `--retention per-request` | candidate (78053e2b) | idle | Chromium, `--trials 3` |
| `qt-030/` | fd581052 | released 0.3.0 | idle | kate, qtcreator |
| `events/` (`t56-events`) | fd581052 | candidate (fd581052) | idle | events experiment: pass |

## Idle (`idle/`)

Every family (chrome, electron, gedit, kate, qtcreator, firefox, writer, gnome-terminal) reached 30 consecutive on
both timed lanes in every scenario (48 series). Every audit is clean: on the timer lane 6 FocusOuts per family, all 6
attributed to the request whose input scheduled them and reported on a later line (deferred); on the control lane
53, none deferred. The control fails on Chromium in every scenario, the text wrong (Chrome bursts 3/10, A-B-A 10/10;
Electron 9/10 and 10/10). SIGTERM 10/10 on Chrome and Electron, exit 101 ms after the last answer (median); SIGKILL
3/3 leaves the session unclosed. Writer on `gen` is not among the families (no text field).

## The control on the private display

On Xvfb a 0 ms FocusOut with the window still redirected cuts nothing in Chromium: `--teardown-ms 0` alone showed 0 of
10 wrong texts in bursts and A-B-A, idle (two sittings, the later at harness 78053e2b) and at twice the load (a
development sitting of 3-run series); those sittings are not kept. A
FocusOut followed by the unredirect cuts keys and delivers them with the next FocusIn, the reorder M0.4 saw on `:0`
after a FocusOut alone (`control-probe/`: a run reads `abcDef`, the next `gHijkLmnoPqrsTabcDefgH`).

## Twice the load (`load2/`, `delay-*`, `terminal-030-load2/`)

- The timer lane: every family's burst and A-B-A, and every family's paste but gnome-terminal's, reached 30
  consecutive. gnome-terminal's paste missed 9 of 60 (its paste answered "could not be confirmed" after about 2.1 s,
  and the next request then refused with the engine's retry guard); the released 0.3.0, which spends 100 ms per key
  request, reached 30 consecutive there (`terminal-030-load2/`).
- The unredirect that follows the delay cuts Chromium keys at twice the load: the `unredirect` lane's bursts missed
  31/60 (Chrome) and 39/60 (Electron), and SIGTERM, whose exit drops the engine's redirects 100 ms after the last key,
  failed 8/10 (Chrome) and 4/10 (Electron), each a cut and its tail delivered with the next FocusIn.
- With the delay at 200 ms the unredirect lane's bursts still missed (12/60, 21/60) and Electron's SIGTERM failed
  5/10; at 400 ms every Chromium series reached 30 consecutive and SIGTERM was 10/10 on both.

An earlier sitting at 2x (`t56-final-load2`, harness f6c2c91a, not kept) failed the timer lane's Chromium bursts with
no text at all: two reads 150 ms apart had agreed before the loaded renderer took the first key. The read now also
waits, at most 5 s, for the text to reach the run's length (24a86030); keys cut until a later FocusIn still leave it
short.
