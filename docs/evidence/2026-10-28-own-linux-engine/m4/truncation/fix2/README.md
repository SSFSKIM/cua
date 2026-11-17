# M4 T3, fix round 2: `truncated` judged against the engine's own record

Development runs, not a release gate (`--dev`). The re-review of fix round 1 found the generic check inexact: it
inferred a cut from the retained tree's extent (5,000 nodes, or a node at depth 63). Four counterexamples followed:
- a depth-only cut keeping a 64-node chain to depth 63 passed with the field missing;
- an element-limited read keeping 4,999 nodes, one of its 5,000 admissions a failed `GetRoleName`, passed with no field;
- an uncut tree carrying an invented `{nodes: 0, depth: 0, failed: 1}` passed, the field set aside before equality;
- a complete, uncut tree of exactly 5,000 nodes failed.

The design session ruled that publication is judged against the engine's own record of each read's cut points: the
`--stats` line's `tree` record of that very request. Over the wire, `deviations.mjs` `truncationMismatch` holds every
candidate state read to these rules:
- a cut point on an accessibility read requires the field, with the record's counts;
- no cut point requires no field;
- the X11 fallback publishes nothing, whatever its record counts;
- the record's source must be the answer's;
- a missing, unparseable or malformed record fails.

The over-budget page's both-causes fact applies to the record. The two-services path has no record, because cua's
service spawns its engines. It keeps fixture facts (`fixtureTruncationMismatch`):
- over-budget counts both causes on every read;
- the other pages carry no field and read at most 2,500 nodes and depth 31, half of each limit.

The candidate is a musl build made as the release workflow makes it
(`cargo build --release --locked --target x86_64-unknown-linux-musl` on the #171 VM): `cua-engine 0.3.0 (eb1cb69ab645)`,
sha256 `93f47c56fdf13f28bbd1d9c24036d1edb92df75df9d925dd21c2e008fb1ce9d5`, static-pie. Its engine sources are T3's;
since then only tests have changed. The harness is commit eb1cb69a's. "Checkout not clean" in the runs' meta names
another session's uncommitted engine test files (`native/linux-engine/tests/`), which are not part of the harness or
the binary's sources.

## The runs

- `diff/` (`t3-fix2-record`, exit 0): the wire run of every scene with a state read, against the pinned (`7ac3c2ae…`)
  and newest (`88ce5e0a…`) builds.
  - Scenes: gedit, the Chrome scene page, over-budget, big-text, gtk-table, Calc, and the retention cases on the Chrome
    scene page.
  - The verdict line: "run valid; development run, not a release gate: every verdict PASS".
  - Each of cua's 448 state reads carries `truncation: "as recorded"`.
  - Over-budget:
    - all 41 of cua's records and fields are `{nodes 1263, depth 2, failed 0}`;
    - retained ids are equal to the pinned build's;
    - bus calls are 45,240 cold and 45,244 warm against the vendor's 45,059;
    - the read takes 977.6 ms cold and 966.4 ms warm, against a 6,938.2 / 7,045.3 ms bar.
  - Every other read's record has no cut point, and its answer has no field: gedit 498 nodes, Chrome 243, big-text
    222, gtk-table 41, Calc 2,431, and the retention reads 243.
- `services/` (exit 0): the two services through the real facade.
  - Every step passes.
  - On over-budget, `state`, `tree`, `query`, `state-after-query` and `screenshot` each carry the field, and the
    rendered states end with "at least 1265 elements not shown".
  - gedit and Chrome have neither the field nor the line.
- `diff-control-0.3.0/` (`t3-fix2-control-030`, exit 1, as it should): the same wire run on the released 0.3.0
  (`5f4a1600…`, the installed engine at the pin).
  - 0.3.0's `--stats` tree record has no cut points, so every one of cua's state-read verdicts fails, all 11.
  - Each fails on that reason alone: "its --stats tree record is malformed". A record without cut points is not a
    record of none.
  - The run itself is valid, and no other reason appears in any verdict.
- `services-control-0.3.0/` (exit 1, as it should): its five over-budget reading steps fail, and every gedit and
  Chrome step passes.
- The applications' stderr logs are under `diff*/apps/`.

## The record is the shipped artifact's own output

The gate's candidate is spawned the same way in a gate sitting and in a development run. `run.mjs` passes the
candidate's checked copy (`candidate.path`) with `stats: via === 'wire'`, and `engine.mjs` adds `--stats` to its
`server` command line.
- `--stats` is parsed in `main.rs` with no cargo feature, and `cfg(feature` appears in neither `main.rs` nor
  `engine.rs`. The record is built in `engine.rs` `get_window_state` from the same `read_stats.truncated` that
  `reported_truncation` publishes.
- The pinned, attested 0.3.0 asset (the installed engine, sha256 equal to the pin's `5f4a1600…`) prints a `--stats`
  line for a request, as does this round's musl build. The script and its output are kept locally (task 32's
  `stats-flag.{sh,txt}`).
- So the record that a gate sitting judges comes from the attested artifact itself.

## Calc's stderr

Calc's log holds one line on every launch, the same in fix round 1:
`Warning: failed to launch javaldx - java may not function correctly`.
- LibreOffice's `oosplash` runs `javaldx` before `soffice.bin` unless the command line is `--help` or `--version`.
- The VM has no `javaldx`: LibreOffice's Java support (`libreoffice-java-common`, a JRE) is not installed.
- No environment setting turns the attempt off. `oosplash` reads only `DISPLAY`, `LD_LIBRARY_PATH`,
  `SAL_USE_VCLPLUGIN` and `LIBO_FLATPAK`, and the last changes how LibreOffice locates itself.
- So the warning stays, stated here. It is harmless to the scene, which uses no Java. Every genuine diagnostic Calc
  prints still reaches the log.
