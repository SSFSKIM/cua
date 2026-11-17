# M4 T3, fix round: `truncated` declared once

Development runs, not a release gate (`--dev`). The design session ruled on T3's open concern: `truncated` is declared
once, for any read that was cut, not per scene. The check (`deviations.mjs` `truncationAsDeclared`) holds the field
present exactly when the tree was cut, judged from what the tree shows of the vendor's limits:
- a `nodes` count needs 5,000 admitted nodes, counting the tree's nodes and the failed ones;
- a `depth` count needs a node at depth 63;
- a read with no field must be under the element limit.

Each count is a u32. The over-budget page's both-causes check stays as a fixture fact. The two-services instrument now
judges every read a step makes, the query's included.

The candidate is a musl build made as the release workflow makes it
(`cargo build --release --locked --target x86_64-unknown-linux-musl` on the #171 VM): `cua-engine 0.3.0 (e112f4f37f6b)`,
sha256 `76ab258416ca09c97d06c379ed3e2c19748aef19f29497986ce248965b2cf3a9`, static-pie. Its engine sources are T3's
(7b2077e4); only an engine test file changed since. The harness is commit d4a8ba7e's, and the checkout was clean.

- `diff/` (`t3-fix1-generic`, exit 0): the wire run of every scene with a state read. The scenes: gedit, the Chrome
  scene page, over-budget, big-text, gtk-table, Calc, and the retention cases on the Chrome scene page. The operations:
  `tree`, `tree_shot`, `after_resize`, `after_remap` and `after_covered_change`. They ran against the pinned
  (`7ac3c2ae…`) and newest (`88ce5e0a…`) builds.
  - The verdict line: "run valid; development run, not a release gate: every verdict PASS".
  - Only the over-budget page is cut. All 41 of cua's samples there carry `{nodes 1263, depth 2, failed 0}`, listed as
    `declared: tree`. Retained ids are equal to the pinned build's. Bus calls are 45,240 cold and 45,246 warm against
    the vendor's 45,059 (bound 45,315). cua read in 996.5 ms cold and 981.4 ms warm, against a 7,274.5 / 7,324.9 ms bar.
  - Every other scene is read whole, and none of cua's samples carries the field there: gedit 498 nodes, Chrome 243,
    big-text 222, gtk-table 41 (its table over 5,000 children is sampled, not cut), Calc 2,431, and the retention
    reads 243.
- `services/` (exit 0): the two services on the same build, through the real facade.
  - Every step passes.
  - On over-budget, `state`, `tree`, `query`, `state-after-query` and `screenshot` each carry the field. The rendered
    states end with "at least 1265 elements not shown".
  - gedit and Chrome have neither the field nor the line.
- `services-control-0.3.0/` (exit 1, as it should): the released 0.3.0 engine (`5f4a1600…`) reports no field.
  - Its five over-budget reading steps fail, `query` among them. Under T3's judge `query` was not judged, so it passed.
  - Every gedit and Chrome step passes.
- `diff-control-0.3.0/` (`t3-fix1-control-030`, exit 1, as it should): the same wire run on the released 0.3.0
  engine (`5f4a1600…`).
  - The verdict line: "run valid; development run, not a release gate: FAIL: over-budget tree cua".
  - The one failure is "truncated not as declared on 41 of 41 samples".
  - Every other verdict passes, on every scene. The field is required only where the read was cut.
  - Its "checkout not clean" names this README and the evidence directory, which were uncommitted then. The harness
    code was d4a8ba7e's.
- The applications' stderr logs are under `diff*/apps/`, as T2 keeps them.
