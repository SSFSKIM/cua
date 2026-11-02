# M4 T3: truncation counts from the engine

Dev runs, not a release gate. The candidate is a musl build made as the release workflow makes it
(`cargo build --release --locked --target x86_64-unknown-linux-musl` on the #171 VM): `cua-engine 0.3.0 (7b2077e4bfd4)`,
sha256 `7ef21fb8ae19ea43d8151afad9bd91174385ef9e5e9ca532a2f6e47d96f1110d`, static-pie. The engine sources are
commit 7b2077e4's. The harness ran from the working tree that became the next commit (the harness change).

- `diff/` (`t3-truncation-dev2`): the wire run of `tree` and `tree_shot` on gedit, the Chrome scene page and the
  over-budget page, against the pinned (`7ac3c2ae…`) and newest (`88ce5e0a…`) vendor builds. Run valid, every verdict
  PASS, no witness change. Over-budget: retained native ids equal to the pinned build's; cua's bus calls 45,224 cold
  and 45,229 warm against the vendor's 45,042 (bound 45,298); every one of cua's 41 samples carries
  `truncated {nodes: 1263, depth: 2, failed: 0}`, set aside as the declared deviation (`deviations.mjs`). No cua sample
  of gedit or Chrome carries the field.
- `services/`: the two services on that build, through the real facade. Every step passes. On the over-budget page,
  `getAXState`, `getAXState` after a query and the combined observation each end with
  `Accessibility tree truncated: at least 1265 elements not shown (…)`, the sum of the `truncated` the read returned.
  gedit and Chrome have no field and no line. The vendor's service passes the engine's `truncated` through, so its
  lane renders the same line.
- `services-control-0.3.0/`: the negative control. The released 0.3.0 engine (`5f4a1600…`) reports no `truncated`.
  Its four over-budget truncation rows (`state`, `tree`, `state-after-query`, `screenshot`) fail, and every gedit and
  Chrome row passes. Exit 1, as it should.
- `diff-disturbed/` (`t3-truncation-dev`): superseded, kept as a record. It ran on an earlier build of the same engine sources
  (`88eb39e1…`, stamped 402be2ec, built before the engine commit). Another agent's harness check used `:0` from
  02:42:35Z to 02:42:46Z, during block 2 of the gedit scene. Four vendor samples there changed the witness (gedit
  `tree` newest block 2 i 5; `tree_shot` pinned i 0, newest i 3 and i 5; sample rows 261–285). The cua samples between
  them (gedit `tree_shot` cua block 2) kept the witness clean. Every verdict passed, but because a witness change fell
  in the interval the whole run was repeated undisturbed as `diff/`.
