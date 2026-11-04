# Task 56 fix 4: the scrolled rule's cost

The design session accepted fix 3's scrolled rule (`paste.rs` `Expected::confirmed_scrolled`,
`short_of_the_paste_reads_the_same`) on one condition: bound its cost, measured on one maximal case, so that a paste
left unconfirmed past the deadline does not burn CPU. The rule already makes one candidate per line start.

## The worst input, at the route's limits (`cost-before.txt`, `cost-after.txt`, `cost-after-musl.txt`)

The measurement is the engine's ignored test `the_scrolled_rule_s_cost_at_the_route_s_limits`
(`cargo test --release --bin cua-engine -- --ignored --nocapture the_scrolled_rule_s_cost`). Its field is the largest
the route observes whole: `WHOLE_LIMIT` (65,536) characters in `WHOLE_LINES` (512) rows of 128, the caret before
VTE's closing newline. The paste is 65,536 characters, and the read after it is the field scrolled by all but its last
row, so every other row start is a reading short of the paste to compare (511 candidates). Two texts keep the
comparisons from ending early:

- **confirms**: field and paste all `a`, the paste's last character `b`. Every reading short of the paste reads as the
  field does until that last character, so all 511 comparisons run to within one character of the read's end.
- **stays unconfirmed**: paste all `a`, the field all `a` but one `b` just before the second-to-last row. That row's
  start is a reading short of the paste that reads the same, so the paste stays unconfirmed. Every earlier candidate
  runs until it meets the `b`, which takes longer the earlier it starts (about half of the first case's work).

Each look of the confirmation is counted, as the route makes them (`dispatch_and_confirm`): a look, then 20 ms, until
the 2 s deadline, every read the same.

| input | one check (CPU, median of 5) | the confirmation before the fix | after the fix (release, glibc) | after, musl |
|---|---|---|---|---|
| confirms | 20–21 ms (musl 24) | 1 look, confirmed: 22.0 ms CPU | 1 look, confirmed: 21.0 ms | 23.0 ms |
| stays unconfirmed | 11–12 ms | **60 looks, 827 ms CPU over 2,012 ms** | **100 looks, 1 check, 98 unchanged: 15.8 ms** | 28.3 ms |

Before the fix, a paste left unconfirmed on that input kept one core 41% busy for the whole 2 s, and judged the same
read 60 times. The rule's answer depends on the read's text alone, so the fix keeps the last whole read the rule
left unconfirmed and does not judge the same text again (`engine/paste.rs` `Scrolled`, in `confirmed_before`). What
confirms is unchanged. A read that differs is judged again, so the work is at most one check per distinct read. The
looks rose from 60 to 100 because each look no longer takes 11 ms beyond its pause. `--stats` reports the rule's part:
`paste.confirm_looks`, `paste.scrolled {checks, unchanged, check_ms}`.

The test that guards it, `a_whole_read_the_scrolled_rule_left_unconfirmed_is_judged_once_while_it_reads_the_same`
(maximal input, 10 looks at the same read, then one that differs), failed with the skip taken out:
`left: (10, 0)`, `right: (1, 9)`.

## Live: a 64 KiB paste into a full gnome-terminal screen (`big-paste-idle/`, `big-paste.mjs`)

This uses the never-taken probe's scene on a private Xvfb the harness creates (`startPrivateServer`; nothing on `:0`),
idle: Openbox, the front window covering gnome-terminal (VTE) running the recorder, and the screen filled by keys
(20 rows of 69). Each run is one `type_text` of 65,536 ASCII letters with no newline, from a fresh engine with
`--stats`. The musl builds of the fix (`cua-engine 0.3.0 (e56f15da9151)`) and of fix 3 (`391c63958ea8`) alternate,
3 runs each. The engine's CPU time over the request is utime + stime of `/proc/<pid>/stat` (10 ms ticks, every
thread, the exited ones included), read before the request and when its answer came.

| engine | runs | the recorder received | answer | request wall | engine CPU over the request | looks | scrolled checks / unchanged / ms |
|---|---:|---|---|---|---|---:|---|
| the fix (e56f15da) | 3 | all 65,536, 3/3 | unconfirmed, 3/3 | 2,329–2,341 ms | 30, 10, 20 ms | 96–97 | 2 / 94–95 / 0.7–1.2 ms |
| fix 3 (391c6395) | 3 | all 65,536, 3/3 | unconfirmed, 3/3 | 2,334–2,338 ms | 50, 50, 40 ms | – | – |

The transfer was served to the terminal in every run, and its TARGETS was answered before the chord (wait 2.4–2.7
ms). The paste lands, and the answer is `Paste was sent once and could not be confirmed; read the field before
retrying`, as the design requires for a paste the route cannot prove. There is no confirmation time: `confirm_ms` is
null for an unconfirmed paste, and the confirmation ran to its 2 s deadline.

## What the route does past the limits

- **A paste longer than the screen holds** (this sitting): the screen keeps 1,320 to 1,375 characters, and the paste
  alone is 65,536. A scrolled reading must remove a prefix ending at or before the caret (the paste still whole after
  it), so the rule answers no before comparing any candidate. Its only cost is building the expected text once per
  distinct read (0.35–0.6 ms here). The segment rule cannot confirm either, so the paste is unconfirmed.
- **A field over `WHOLE_LIMIT` characters or `WHOLE_LINES` lines**, or one that changed while it was observed: it
  is not observed whole (`field::read_lines` gives None), the scrolled rule never runs, and only the segment rule
  confirms.
- **A paste over 64 MiB** (`MAX_TEXT_BYTES`): refused before anything is sent (`clipboard text exceeds byte limit`).
