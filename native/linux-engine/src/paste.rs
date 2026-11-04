//! The paste route's judgements (Design, Text and clipboard: one verified paste route, steps 4–6; Transfer bounds;
//! Decision Log, M2.1), kept apart from the X and AT-SPI calls so they are testable without a display: where the text
//! is expected, when a field read confirms it, when the paste's selection transfer to its target is over, and the
//! sentences the route answers with.

use std::time::{Duration, Instant};

use crate::clipboard::{Outcome, Seen};

/// The design's sentences (M2's Decisions; Decision Log, M2.1). `CHANGED` is said as `not_dispatched(CHANGED_CAUSE,
/// false)`, its cause apart so the same refusal after a focusing click can say so ([`not_dispatched`]).
#[cfg(test)]
pub const CHANGED: &str = "requested field or selection changed before dispatch; nothing was sent";
pub const CHANGED_CAUSE: &str = "requested field or selection changed before dispatch";
/// How a refusal before the chord ends once a focusing click has gone to the window: the click may have moved the
/// field's focus or caret, so a retry is not safe blind (the design session, M4's T5 round 3: "nothing was sent" only
/// when nothing was).
pub const AFTER_CLICK: &str =
    "no paste was dispatched, but a focusing click already reached the window, so read the window before retrying";
pub const UNCONFIRMED: &str = "Paste was sent once and could not be confirmed; read the field before retrying";
/// The vendor's, for text the clipboard cannot hold (behaviour §12.1 step 4); cua's limit is 64 MiB.
pub const TOO_LONG: &str = "clipboard text exceeds byte limit";
/// The largest text a paste serves: the snapshot's aggregate cap (Design, M2's Decisions).
pub const MAX_TEXT_BYTES: usize = crate::clipboard::MAX_SNAPSHOT_BYTES;

/// How often the field is read while confirming, and for how long after the Ctrl+V (Design, step 5).
pub const CONFIRM_POLL: Duration = Duration::from_millis(20);
pub const CONFIRM_WAIT: Duration = Duration::from_secs(2);

/// How long a paste waits at most, between taking CLIPBOARD and its revalidation before the chord, for a target whose
/// family asks for `TARGETS` at every owner change (`families.rs` `refreshes_targets`) to ask and be answered, and how
/// often it looks (task 56, fix 3). A target that has not asked by then gets the chord as before.
pub const TARGETS_REFRESH_WAIT: Duration = Duration::from_millis(200);
pub const TARGETS_POLL: Duration = Duration::from_millis(2);

/// While an earlier unconfirmed paste's `CurrentTime` refusal runs, `wait` long (Decision Log, M2.1); `clicked` when
/// the request's focusing click had already gone to the window.
pub fn previous_unconfirmed(wait: Duration, clicked: bool) -> String {
    let cause = "a previous paste could not be confirmed and may still be read";
    let seconds = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
    if clicked {
        format!("{cause}; {AFTER_CLICK} after {seconds} s")
    } else {
        format!("{cause}; nothing was sent; retry after {seconds} s")
    }
}

/// A refusal before dispatch whose cause is another sentence (a snapshot bound, the owner's take).
pub fn nothing_sent(cause: impl std::fmt::Display) -> String {
    format!("{cause}; nothing was sent")
}

/// A refusal before the chord: `cause`, then that nothing was sent, or, when the request's focusing click had already
/// gone to the window, [`AFTER_CLICK`].
pub fn not_dispatched(cause: impl std::fmt::Display, clicked: bool) -> String {
    if clicked {
        format!("{cause}; {AFTER_CLICK}")
    } else {
        nothing_sent(cause)
    }
}

/// For a family with no verified paste route.
pub fn no_paste_route(app: &str) -> String {
    format!("{app} has no verified paste route; nothing was sent")
}

/// A field's text state as its `Text` interface reports it: offsets in the field's own units.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextState {
    pub count: i32,
    pub caret: i32,
    /// The first selection, when the field reports any (`GetNSelections` > 0), and how many it reports.
    pub selection: Option<(i32, i32)>,
    pub selections: i32,
}

impl TextState {
    /// The selected range when one is not empty, ordered.
    pub fn selected(&self) -> Option<(i32, i32)> {
        let (a, b) = self.selection?;
        (a != b).then(|| (a.min(b), a.max(b)))
    }

    /// Where pasted text lands: the start of the selection, else a valid caret.
    pub fn insertion_point(&self) -> Option<i32> {
        match self.selected() {
            Some((start, _)) => Some(start),
            None => (0..=self.count).contains(&self.caret).then_some(self.caret),
        }
    }
}

/// How many offsets `text` takes in a field: one per character, and for Gecko one more after each character beyond
/// the BMP, its U+FEFF.
pub fn offsets(text: &str, feff_after_astral: bool) -> i32 {
    let astral = if feff_after_astral {
        text.chars().filter(|c| u32::from(*c) > 0xFFFF).count()
    } else {
        0
    };
    (text.chars().count() + astral) as i32
}

/// Gecko's reading with each U+FEFF that follows a character beyond the BMP removed; any other U+FEFF is text.
pub fn strip_gecko_feff(read: &str) -> String {
    let mut out = String::with_capacity(read.len());
    let mut after_astral = false;
    for c in read.chars() {
        if c == '\u{FEFF}' && after_astral {
            after_astral = false;
            continue;
        }
        after_astral = u32::from(c) > 0xFFFF;
        out.push(c);
    }
    out
}

/// What a confirming read must show: `text` at `at`, `len` offsets long.
#[derive(Debug, Clone, PartialEq)]
pub struct Expected {
    pub text: String,
    pub at: i32,
    pub len: i32,
    pub feff_after_astral: bool,
    /// The field's character count before the paste, and what it read at the same offsets.
    pub count_before: i32,
    pub before: String,
    /// The whole field as observed, in a family whose text scrolls away at its start (`families.rs`), else None.
    pub whole: Option<Whole>,
}

/// The whole field as observed before the paste, in a family whose text scrolls its beginning away as text arrives (a
/// terminal whose screen is full: task 56, fix 2): its text, and the offsets where the toolkit's own lines start.
#[derive(Debug, Clone, PartialEq)]
pub struct Whole {
    pub text: String,
    pub line_starts: Vec<i32>,
}

impl Expected {
    /// Whether the whole field read after the paste (`after`) shows the paste in a field that scrolled (the design
    /// session's ruling, task 56 fix 2). Only a field observed whole can say, and only when both hold:
    ///
    /// - `after` is the expected text (the text observed whole, with the paste at the caret) less a prefix that ends
    ///   where one of the observed lines starts, the paste still whole after it;
    /// - nothing short of the whole paste reads the same: the observed text with none of the paste, or with only its
    ///   first characters, at the caret, less a prefix that ends where an observed line starts, is not `after`.
    ///
    /// The second is what makes a confirm safe. When the text just before the caret is the paste text itself, a
    /// field that scrolled by one line and took no paste reads exactly as the expected text less the next line, and a
    /// paste whose text repeats itself can read as its first characters alone with one line less scrolled. Copies of
    /// the paste text elsewhere on the screen, which every other reading leaves apart, do not make it ambiguous (task
    /// 56 fix 3: a screen full of an earlier run's text held the paste text 67 times, and the landed paste stayed
    /// unconfirmed under a count of its occurrences). Anything else stays unconfirmed: a wrong confirm is worse than a
    /// false "unconfirmed".
    pub fn confirmed_scrolled(&self, after: &str) -> bool {
        let Some(whole) = &self.whole else {
            return false;
        };
        let before: Vec<char> = whole.text.chars().collect();
        let paste: Vec<char> = self.text.chars().collect();
        let Ok(at) = usize::try_from(self.at) else {
            return false;
        };
        if self.feff_after_astral || paste.is_empty() || at > before.len() {
            return false;
        }
        let expected: Vec<char> = before[..at]
            .iter()
            .chain(&paste)
            .chain(&before[at..])
            .copied()
            .collect();
        let after: Vec<char> = after.chars().collect();
        let Some(prefix) = expected.len().checked_sub(after.len()).filter(|&k| k > 0 && k <= at) else {
            return false;
        };
        let starts: Vec<usize> = whole
            .line_starts
            .iter()
            .filter_map(|&start| usize::try_from(start).ok())
            .collect();
        starts.contains(&prefix)
            && expected[prefix..] == after[..]
            && !short_of_the_paste_reads_the_same(&before, at, &paste, &after, &starts)
    }

    /// Whether a read of the field's `count` and of its offsets `at..at + len` (`read`) shows the paste: the
    /// inserted segment is there, and the field changed (its count, or what those offsets held). Text around the
    /// segment (autocompletion, suggestions) is not judged.
    pub fn confirmed_by(&self, count: i32, read: &str) -> bool {
        let normalize = |s: &str| {
            if self.feff_after_astral {
                strip_gecko_feff(s)
            } else {
                s.to_string()
            }
        };
        normalize(read) == self.text && (count != self.count_before || normalize(&self.before) != self.text)
    }
}

/// Whether `after` is also the field observed (`before`) with only the first `i` characters of `paste` at the caret
/// `at`, none at all included, less a prefix that ends where one of the observed lines (`starts`) starts: a reading a
/// paste that did not land whole explains as well. The prefix's length fixes `i`, so each line start is one candidate.
fn short_of_the_paste_reads_the_same(
    before: &[char],
    at: usize,
    paste: &[char],
    after: &[char],
    starts: &[usize],
) -> bool {
    starts.iter().any(|&prefix| {
        let Some(landed) = (after.len() + prefix).checked_sub(before.len()) else {
            return false;
        };
        landed < paste.len()
            && before[..at]
                .iter()
                .chain(&paste[..landed])
                .chain(&before[at..])
                .skip(prefix)
                .eq(after.iter())
    })
}

/// Whether X window `requestor` belongs to the X client that created `client` (Decision Log, M2.1: a request counts
/// toward the paste only when it is the target's client's).
pub fn same_client(requestor: u32, client: u32, resource_id_mask: u32) -> bool {
    (requestor & !resource_id_mask) == (client & !resource_id_mask)
}

/// Where the paste's selection transfer to its target stands (Design, Transfer bounds).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transfer {
    /// Not over yet: the target may still convert, or a transfer to it is in flight (the owner bounds that).
    Open,
    /// One of the paste's data formats was served in full to the target's client.
    Served,
    /// Over without the target served: it never asked within the start bound, went quiet after asking, its transfer
    /// was dropped at the bounds, or another client took CLIPBOARD.
    Ended,
}

/// How long the target may take to ask after the Ctrl+V, or to ask again after an answer (Design, Transfer bounds).
pub const TRANSFER_QUIET: Duration = crate::clipboard::TRANSFER_START;

/// The transfer's state from the owner's log of the paste's requests: only the target's client's requests from the
/// chord's sending on count (one before it, such as a toolkit's look at a new owner's `TARGETS`, is not the paste's).
pub fn transfer(
    log: &[Seen],
    is_target: impl Fn(u32) -> bool,
    dispatched: Instant,
    lost: bool,
    now: Instant,
) -> Transfer {
    let ours: Vec<&Seen> = log
        .iter()
        .filter(|s| is_target(s.requestor) && s.at >= dispatched)
        .collect();
    if ours.iter().any(|s| s.outcome == Outcome::Served) {
        return Transfer::Served;
    }
    if lost {
        return Transfer::Ended;
    }
    if ours.iter().any(|s| s.outcome == Outcome::Transferring) {
        return Transfer::Open;
    }
    let last = ours.iter().map(|s| s.at).max().unwrap_or(dispatched).max(dispatched);
    if now.saturating_duration_since(last) >= TRANSFER_QUIET {
        Transfer::Ended
    } else {
        Transfer::Open
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(count: i32, caret: i32, selection: Option<(i32, i32)>) -> TextState {
        TextState {
            count,
            caret,
            selection,
            selections: i32::from(selection.is_some()),
        }
    }

    #[test]
    fn text_lands_at_the_selection_s_start_else_at_a_valid_caret() {
        assert_eq!(state(10, 4, None).insertion_point(), Some(4));
        assert_eq!(state(10, 10, None).insertion_point(), Some(10), "the end is a place");
        assert_eq!(
            state(10, 9, Some((7, 2))).insertion_point(),
            Some(2),
            "a backwards selection"
        );
        assert_eq!(
            state(10, 3, Some((3, 3))).insertion_point(),
            Some(3),
            "an empty selection is the caret"
        );
        assert_eq!(state(10, -1, None).insertion_point(), None);
        assert_eq!(state(10, 11, None).insertion_point(), None);
    }

    #[test]
    fn gecko_counts_one_more_offset_per_character_beyond_the_bmp() {
        let text = "cua171 안녕 e\u{301} 🙂\nline2";
        assert_eq!(offsets(text, false), text.chars().count() as i32);
        assert_eq!(offsets(text, true), text.chars().count() as i32 + 1);
        assert_eq!(offsets("🙂🙂", true), 4);
    }

    #[test]
    fn only_a_feff_right_after_a_character_beyond_the_bmp_is_stripped() {
        assert_eq!(strip_gecko_feff("a🙂\u{FEFF}b"), "a🙂b");
        assert_eq!(strip_gecko_feff("🙂\u{FEFF}🙂\u{FEFF}"), "🙂🙂");
        assert_eq!(strip_gecko_feff("a\u{FEFF}b"), "a\u{FEFF}b", "a real U+FEFF counts");
        assert_eq!(
            strip_gecko_feff("🙂\u{FEFF}\u{FEFF}"),
            "🙂\u{FEFF}",
            "only the one Gecko adds"
        );
        assert_eq!(strip_gecko_feff("\u{FEFF}"), "\u{FEFF}");
    }

    fn expected(text: &str, before: &str, count_before: i32, feff: bool) -> Expected {
        Expected {
            text: text.into(),
            at: 3,
            len: offsets(text, feff),
            feff_after_astral: feff,
            count_before,
            before: before.into(),
            whole: None,
        }
    }

    #[test]
    fn the_inserted_segment_confirms_whatever_surrounds_it() {
        let e = expected("cua171 🙂", "xyzw", 10, false);
        assert!(e.confirmed_by(18, "cua171 🙂"));
        assert!(
            e.confirmed_by(25, "cua171 🙂"),
            "an autocompletion after it lengthens the field"
        );
        assert!(!e.confirmed_by(10, "xyzwvutsr"), "not yet");
        assert!(!e.confirmed_by(18, "cua171 🙃"));
        assert!(!e.confirmed_by(17, "cua171 "), "a short read");
    }

    /// A terminal's screen as its accessible text reads: rows of `width` characters, the last one partial, then the
    /// newline VTE ends its text with; the caret before that newline. Observed whole, its lines starting at each row.
    fn screen(rows: &[&str], paste: &str) -> Expected {
        let before: String = rows.concat() + "\n";
        let mut starts = Vec::new();
        let mut at = 0;
        for row in rows {
            starts.push(at);
            at += row.chars().count() as i32;
        }
        Expected {
            text: paste.into(),
            at,
            len: offsets(paste, false),
            feff_after_astral: false,
            count_before: at + 1,
            before: "\n".into(),
            whole: Some(Whole {
                text: before,
                line_starts: starts,
            }),
        }
    }

    #[test]
    fn a_scrolled_field_whose_paste_landed_confirms() {
        // the trace's case: the paste wraps the last row of a full screen, the first row scrolls out, and every offset
        // the observation took is one row off
        let e = screen(&["0123456789", "abcdefghij", "KLMNOP"], "Pasted");
        assert!(
            !e.confirmed_by(16, ""),
            "the inserted segment's offsets read past the end"
        );
        assert!(e.confirmed_scrolled("abcdefghijKLMNOPPasted\n"), "one row out");
        assert!(e.confirmed_scrolled("KLMNOPPasted\n"), "two rows out");
        assert!(
            !e.confirmed_scrolled("0123456789abcdefghijKLMNOPPasted\n"),
            "no scroll: the inserted segment's rule decides"
        );
        assert!(
            !e.confirmed_scrolled("asted\n"),
            "the paste itself partly scrolled out: not shown whole"
        );
        assert!(!e.confirmed_scrolled("abcdefghijKLMNOPPastex\n"));
        assert!(!e.confirmed_scrolled("abcdefghijKLMNOP\n"), "nothing pasted");
        let unobserved = Expected { whole: None, ..e };
        assert!(
            !unobserved.confirmed_scrolled("abcdefghijKLMNOPPasted\n"),
            "a field not observed whole"
        );
    }

    #[test]
    fn a_scrolled_field_with_the_paste_text_already_in_it_and_no_paste_does_not_confirm() {
        // the negative control: the paste never landed, the screen scrolled by one row, and what is left reads exactly
        // as the paste would have, one row further: the text before the caret was the paste text already
        let e = screen(&["r1\n", "ab\n", "ab\n"], "ab\n");
        let after = "ab\nab\n\n";
        let expected: String = "r1\nab\nab\nab\n\n".chars().skip(6).collect();
        assert_eq!(
            after, expected,
            "the scrolled text equals the expected text less two rows"
        );
        assert!(!e.confirmed_scrolled(after));
    }

    #[test]
    fn a_scroll_whose_prefix_does_not_end_where_a_line_starts_stays_unconfirmed() {
        let mut e = screen(&["0123456789", "abcdefghij", "KLMNOP"], "Pasted");
        e.whole.as_mut().unwrap().line_starts = vec![0, 20];
        assert!(!e.confirmed_scrolled("abcdefghijKLMNOPPasted\n"));
        assert!(
            !e.confirmed_scrolled("123456789abcdefghijKLMNOPPasted\n"),
            "one character out, within a row"
        );
        assert!(e.confirmed_scrolled("KLMNOPPasted\n"));
    }

    #[test]
    fn a_scrolled_field_whose_paste_text_shows_elsewhere_confirms_when_nothing_short_of_the_paste_reads_the_same() {
        // the paste landed, and an earlier copy of its text is still on the screen
        let e = screen(&["0123456789", "PastedXXXX", "KLMNOP"], "Pasted");
        assert!(e.confirmed_scrolled("PastedXXXXKLMNOPPasted\n"));
        // or one in the rows that scrolled out
        let e = screen(&["Pasted6789", "abcdefghij", "KLMNOP"], "Pasted");
        assert!(e.confirmed_scrolled("abcdefghijKLMNOPPasted\n"));
        // or one that overlaps the paste
        let e = screen(&["0123456789", "abcdefghia", "KLMNOa"], "aa");
        assert!(e.confirmed_scrolled("abcdefghiaKLMNOaaa\n"));
    }

    #[test]
    fn a_screen_full_of_the_paste_text_confirms_the_paste_that_landed() {
        // task 56 fix 3, the probe's trial 28: an earlier fill (`abcDefgHPasted` again and again) left the paste's own
        // text (`Pastedabc`) all over a screen of rows of 69; the paste wrapped the last row, and one row scrolled out
        let stream: Vec<char> = ("abcDefgHPasted".repeat(97) + "abcDefgHabcDefgH").chars().collect();
        let rows: Vec<String> = stream.chunks(69).map(|row| row.iter().collect()).collect();
        let rows: Vec<&str> = rows.iter().map(String::as_str).collect();
        assert_eq!(
            (rows.len(), rows[19].len()),
            (20, 63),
            "nineteen full rows and one the paste wraps"
        );
        let e = screen(&rows, "Pastedabc");
        let mut after: String = stream[69..].iter().collect();
        after.push_str("Pastedabc\n");
        assert!(e.confirmed_scrolled(&after));
        let nothing: String = stream[69..].iter().collect::<String>() + "\n";
        assert!(!e.confirmed_scrolled(&nothing), "one row out and nothing pasted");
    }

    #[test]
    fn a_reading_the_paste_s_first_characters_alone_explain_stays_unconfirmed() {
        // the paste `aba` landed whole and one row scrolled out, or only its first `a` landed and nothing scrolled:
        // both read `ababa`
        let e = screen(&["ab", "ab"], "aba");
        assert!(!e.confirmed_scrolled("ababa\n"));
        // with the first row a line of its own, only the whole paste reads so
        let e = screen(&["xy", "ab"], "aba");
        assert!(e.confirmed_scrolled("ababa\n"));
    }

    #[test]
    fn text_already_there_confirms_only_once_the_field_changes() {
        // The field held the same text at those offsets: an unchanged count is no proof the paste landed.
        let e = expected("abc", "abc", 10, false);
        assert!(!e.confirmed_by(10, "abc"));
        assert!(e.confirmed_by(13, "abc"));
    }

    #[test]
    fn gecko_s_reading_is_compared_without_its_feffs() {
        let e = expected("a🙂", "", 0, true);
        assert_eq!(e.len, 3);
        assert!(e.confirmed_by(3, "a🙂\u{FEFF}"));
        assert!(
            !expected("a🙂", "", 0, false).confirmed_by(3, "a🙂\u{FEFF}"),
            "only for Gecko"
        );
        let real = expected("a\u{FEFF}", "", 0, true);
        assert!(
            real.confirmed_by(2, "a\u{FEFF}"),
            "a real U+FEFF in the text still counts"
        );
        assert!(!real.confirmed_by(1, "a"));
    }

    #[test]
    fn a_request_is_the_target_s_when_its_window_is_the_target_client_s() {
        let mask = 0x001f_ffff;
        assert!(same_client(0x0240_0007, 0x0240_0001, mask));
        assert!(!same_client(0x0260_0007, 0x0240_0001, mask), "another client's window");
    }

    fn seen(requestor: u32, at: Instant, outcome: Outcome) -> Seen {
        Seen {
            requestor,
            target: 1,
            time: 0,
            at,
            outcome,
        }
    }

    #[test]
    fn the_transfer_is_served_only_by_a_data_format_to_the_target() {
        let t0 = Instant::now();
        let ms = |n| t0 + Duration::from_millis(n);
        let target = |w: u32| w == 7;
        let log = [seen(7, ms(5), Outcome::Targets), seen(9, ms(6), Outcome::Served)];
        assert_eq!(
            transfer(&log, target, t0, false, ms(10)),
            Transfer::Open,
            "TARGETS alone; another client's"
        );
        assert_eq!(
            transfer(&log, target, t0, false, ms(505)),
            Transfer::Ended,
            "quiet for 500 ms after the target's last request"
        );
        let served = [seen(7, ms(5), Outcome::Targets), seen(7, ms(7), Outcome::Served)];
        assert_eq!(transfer(&served, target, t0, false, ms(8)), Transfer::Served);
        assert_eq!(
            transfer(&served, target, t0, true, ms(8)),
            Transfer::Served,
            "served before the loss"
        );
    }

    #[test]
    fn the_target_s_requests_before_the_chord_are_not_the_paste_s() {
        let t0 = Instant::now();
        let ms = |n| t0 + Duration::from_millis(n);
        let target = |w: u32| w == 7;
        // A read of the new owner's contents before the Ctrl+V went out: not the paste's transfer.
        let early = [seen(7, t0, Outcome::Served)];
        assert_eq!(transfer(&early, target, ms(1), false, ms(2)), Transfer::Open);
        assert_eq!(transfer(&early, target, ms(1), false, ms(501)), Transfer::Ended);
    }

    #[test]
    fn a_target_that_never_asks_ends_the_transfer_at_the_start_bound() {
        let t0 = Instant::now();
        let ms = |n| t0 + Duration::from_millis(n);
        let third = [seen(9, ms(3), Outcome::Served)];
        let target = |w: u32| w == 7;
        assert_eq!(transfer(&third, target, t0, false, ms(499)), Transfer::Open);
        assert_eq!(transfer(&third, target, t0, false, ms(500)), Transfer::Ended);
        assert_eq!(
            transfer(&[], target, t0, true, ms(1)),
            Transfer::Ended,
            "CLIPBOARD lost"
        );
    }

    #[test]
    fn a_transfer_in_flight_stays_open_until_the_owner_ends_it() {
        let t0 = Instant::now();
        let ms = |n| t0 + Duration::from_millis(n);
        let target = |w: u32| w == 7;
        let flight = [seen(7, ms(5), Outcome::Transferring)];
        assert_eq!(transfer(&flight, target, t0, false, ms(9_000)), Transfer::Open);
        let stalled = [seen(7, ms(5), Outcome::Stalled)];
        assert_eq!(transfer(&stalled, target, t0, false, ms(2_600)), Transfer::Ended);
    }

    #[test]
    fn the_sentences() {
        assert_eq!(
            previous_unconfirmed(Duration::from_millis(7_200), false),
            "a previous paste could not be confirmed and may still be read; nothing was sent; retry after 8 s"
        );
        assert_eq!(
            previous_unconfirmed(Duration::from_secs(3), false),
            "a previous paste could not be confirmed and may still be read; nothing was sent; retry after 3 s"
        );
        assert_eq!(
            nothing_sent("clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms"),
            "clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; nothing was sent"
        );
    }

    #[test]
    fn a_refusal_says_nothing_was_sent_only_before_any_focusing_click() {
        assert_eq!(not_dispatched(CHANGED_CAUSE, false), CHANGED);
        assert_eq!(
            not_dispatched("clipboard busy", true),
            "clipboard busy; no paste was dispatched, but a focusing click already reached the window, so read the \
             window before retrying"
        );
        assert_eq!(
            previous_unconfirmed(Duration::from_millis(4_100), true),
            "a previous paste could not be confirmed and may still be read; no paste was dispatched, but a focusing \
             click already reached the window, so read the window before retrying after 5 s"
        );
    }
}
