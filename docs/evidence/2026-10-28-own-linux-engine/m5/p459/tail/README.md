# The form `tail`: the newest vendor build's end of a drag (task 130, ruling 988; asks 990, 994)

This is a development build on m5-p459 (6d56774d), never released. Every run here is a development run, never counted,
on private displays under the host locks.

## The facts

- **The route.** Both vendor builds drive Chrome's long-left drag as cua does: core `SendEvent`s to Chrome's window, each
  motion followed by a `GetInputFocus` round trip, with no XTEST and the real pointer untouched (`x64-trace/`).
- **Pinned** sends 1 px a sample at round-trip pace and releases 1 ms after the last.
- **Newest** sends 4 px a sample and ends with 8 ms, the last point, 8 ms, the last point, 8 ms, then the release. That
  is `run_full_desktop_command` at 0xe7ea0-0xe7f10, newest x86-64.
- **cua 0.4.2** sends 1 px every 0.5 ms and releases 1 ms after the last.
- **Chromium** answers each XdndPosition with the renderer's previous operation (`WebContentsViewAura::OnDragUpdated`
  returns `current_drag_data_->operation`, updated asynchronously). So a release straight after the last new position
  drops on an older in-zone accept. Only a later position after the renderer answered refreshes it, and the tail's
  two same-point motions are exactly that.

## Results (arm64, twice the load)

| set | lane | n | false ok | stale | activated after the release | added ms p50 / p95 / max |
|---|---|---:|---:|---:|---:|---|
| long-a | 0.4.2 | 100 | 18 | 4 | 22 | – |
| long-a | (b') | 100 | 4 | 0 | 4 | 5.2 / 10.7 / 20.5 |
| long-a | tail | 100 | 0 | 0 | 0 | 25.6 / 29.8 / 32.1 |
| long-b | (b') | 100 | 11 | 0 | 11 | 5.7 / 10.1 / 13.4 |
| long-b | tail | 100 | 0 | 0 | 0 | 26.0 / 32.1 / 32.1 |

- **floor-tail** (t14-floor, tail gated):
  - plain-long: 300/300 landed, gate 215/300, +28.1 / 32.1 / 33.9 ms.
  - left: 1 false ok in 30, through the **shut** gate (`last_step_spaced`), so on 0.4.2's own floor path.
  - inzone-out: 30/30 honest.
- **x64 D1** (`x64/d1-a`): tail gated [30.5, 36.2], skipped 30/30; ungated it fails [53, 57.8] (+24.6 ms). Off is
  [26.3, 35.4].
- **Repro without cua** (`repro/`, synthetic SendEvents at 0.4.2's pacing, arm64 twice the load):
  - 4 stale drops and 6 dropped with nothing taken, of 100;
  - with the tail (`SYNTH_TAIL_US=8000`), 0 of 100.

The scripts are in `scripts/`. The raw X traces and the full rows stay on the hosts; `arm64/*/runs.tar.gz` holds each
run's rows and engine stats.
