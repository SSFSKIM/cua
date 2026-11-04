# Task 56 fix 5: the scrolled rule's cost along the paste's size

Fix 4 measured the scrolled rule (`paste.rs` `Expected::confirmed_scrolled`) at the field's limits with a 64 KiB
paste. The route serves pastes up to `MAX_TEXT_BYTES` (64 MiB), and the rule built the paste and the expected text as
vectors of characters before its length check. On a long transfer into a terminal the read can change at every look,
which fix 4's memo cannot skip. Fix 5 does two things:

- It finds where the scroll would end from the lengths alone, before building anything. A read too short to hold the
  paste whole is refused at once.
- It compares the readings in place, as UTF-8 bytes. Two texts are the same characters exactly when they are the
  same bytes.

The comparison runs a 64-byte block at a time, with no early exit inside a block, which the compiler vectorizes.
A slice's `==` calls `memcmp`, and musl's (the shipped build's) compares one byte at a time.

## At the limits (`cost-before.txt` at fix 4's rule; `cost-after.txt`; `cost-after-musl.txt`)

The measurement is the engine's ignored test `the_scrolled_rule_s_cost_at_the_route_s_limits`
(`cargo test --release --bin cua-engine -- --ignored --nocapture the_scrolled_rule_s_cost`). Every input uses the
largest field observed whole: 65,536 characters in 512 rows of 128 (`fix4/README.md` describes the inputs). The
largest allocation is the largest single allocation the check made, recorded by a test build's allocator watch
(`alloc_watch.rs`).

| input | before (fix 4, glibc) | after, glibc | after, musl (shipped) |
|---|---|---|---|
| 64 KiB, confirms (511 candidates nearly to the end) | 17.0 ms (musl at fix 4: 23–24) | 3.1 ms | 2.6 ms |
| 64 KiB, stays unconfirmed | 8.7 ms | 1.7 ms | 1.5 ms |
| 4 MiB, confirms, the read holding it whole | 1,135 ms, 17 MB at once | 166 ms, 524,352 B | 156 ms |
| 64 MiB, confirms, the read holding it whole | 18,563 ms, 268 MB at once | 3,561 ms, 524,352 B | 3,266 ms |
| 64 MiB, the read a field again (cannot hold it) | **260 ms, 268 MB at once** | **0.1 ms, 524,352 B** | 0.3 ms |

Every row after the fix allocates at most 524,352 bytes (512 KiB and 64 bytes) at once: the observed field's character
offsets and the paste's last characters' offsets, both bounded by the field, never by the paste. Each look of a
confirmation whose read changes is now judged in about 3 ms at the field limit, against 17 to 24 ms before, so a read
that changes at all 100 looks costs about 0.3 s of CPU over the 2 s confirmation, where before it kept a core busy for
most of them (judging took 17 to 24 ms of each 20 ms pause and look).

The rows whose read holds a 4 or 64 MiB paste whole are a field showing the whole paste: 4 or 64 million characters
in one `GetText` reply, from a field that held at most 65,536 when the paste was observed. No terminal does that.
They are listed for the bound and keep their cost, one comparison of the paste per candidate.

## The proof that the meaning is unchanged

- The rule's tests and fix 4's guarding test pass unchanged.
- `the_scrolled_rule_answers_as_it_did_over_characters_on_every_screen_tried` compares the rule with fix 3's
  character-vector rule (kept in the tests) over 20,000 small screens. Their characters are `a`, `b`, `é` (two bytes)
  and `🙂` (four bytes, beyond the BMP), so repeats, ambiguity and every scroll are common. The reads are the expected
  text less a prefix, some with one character changed. The two rules agree on every screen: 2,314 confirmed, 17,686
  refused.
- `a_paste_longer_than_the_read_is_judged_without_an_allocation_of_its_size`: a 64 MiB paste into the harness's
  20 × 69 screen, the read a screen again. At fix 4's rule it failed: `the check allocated 268440980 bytes at once`.
  Now the largest allocation is under 64 KiB.

## Live: a 4 MiB paste into a full gnome-terminal screen (`paste-4mib-idle/`, `big-paste.mjs`)

This is fix 4's live sitting, with the paste size as an argument (`node big-paste.mjs <harness 391c6395> <out> 2
4194304 fix5=<musl 18198077> fix4=<musl e56f15da>`). It ran on a private Xvfb the harness creates, idle, with the
engines alternating.

| engine | runs | the recorder received | answer | request wall | engine CPU over the request | looks | scrolled checks / unchanged / check_ms |
|---|---:|---|---|---|---|---:|---|
| fix 5 (`cua-engine 0.3.0 (181980771de2)`) | 2 | 4,194,304, 2/2 | unconfirmed, 2/2 | 2,367–2,397 ms | 40, 40 ms | 95, 95 | 7 / 88, 6 / 89; 0.27, 0.28 ms |
| fix 4 (`e56f15da9151`) | 2 | 4,194,304, 2/2 | unconfirmed, 2/2 | 2,377–2,382 ms | 120, 150 ms | 92, 91 | 4 / 88, 5 / 86; 70.0, 91.3 ms |

VTE showed the paste's end within the first few looks, so only 4 to 7 distinct reads were judged. The paste lands
whole and is answered unconfirmed, because a 20-row screen cannot show it whole: the same answer as fix 4's 64 KiB
rows. The rule's time per judged read fell from 17–18 ms to 0.04 ms.
