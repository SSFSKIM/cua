# The linux-engine 0.4.3 candidate measured (task 132)

The candidate is `origin/m5-engine-043` at f9d1f86b, built as a static musl release binary on each host (development
builds, never released):
- arm64 `cua-engine-043-arm64-f9d1f86b`, sha256 `b6e906df2435c6daa9326cfd4713512f9a8798f67015d4d88cc4d8c7a457a5f3`;
- x64 `cua-engine-043-x64-f9d1f86b`, sha256 `e65b74d6b618b84e4845db37e0cd762406ddd5ad890f5ffc0ccdb14cc01afa26`.

Both read `cua-engine 0.4.3 (f9d1f86b55ff)`, and each sits in a run-owned home (`task132/home-<arch>-043/engine/linux/`).

Every run here is a development run, never counted. Each ran on a private display (never `:0`) under its host's lock
(`task132-arm64`, `task132-x64`), and each lock was released between sets.
- **The harness is H7.1's.** On arm64 it is the checkout `t132-h71` at f9d1f86b, whose `scripts/` equal 96fa1fd3's.
  One VM-local commit (d38b027f, never pushed) adds two development plans (`scripts/add-plans.py`):
  - `t132-floor-q`: a quarter of t14-floor at the brief's counts;
  - `t132-handle-long`: Chrome's long-left as `drag_handle` steps.
- On x64 the harness is task 129's H7.1 checkout `t129-x64` (96fa1fd3, clean).
- **Rows are classed by H7.1's own judge.** `t132-tables.mjs` runs `chromeDropVerdict`, with ruling 957's stale-position
  judge and 961's 3 px margin, on each row alone.
- **The control lane** is the pinned 0.4.2 (`25035ca1…092f`), interleaved round by round where a set has one.

The results so far are in each set's `tables.md` (arm64) and `summary.md` / `step-table.md` (x64).
