//! The paste route's judgements (Design, Text and clipboard: one verified paste route, steps 4–6; Transfer bounds;
//! Decision Log, M2.1), kept apart from the X and AT-SPI calls so they are testable without a display: where the text
//! is expected, when a field read confirms it, when the paste's selection transfer to its target is over, and the
//! sentences the route answers with.

use std::time::{Duration, Instant};

use crate::clipboard::{Outcome, Seen};

/// The design's sentences (M2's Decisions; Decision Log, M2.1).
pub const CHANGED: &str = "requested field or selection changed before dispatch; nothing was sent";
pub const UNCONFIRMED: &str = "Paste was sent once and could not be confirmed; read the field before retrying";
/// The vendor's, for text the clipboard cannot hold (behaviour §12.1 step 4); cua's limit is 64 MiB.
pub const TOO_LONG: &str = "clipboard text exceeds byte limit";
/// The largest text a paste serves: the snapshot's aggregate cap (Design, M2's Decisions).
pub const MAX_TEXT_BYTES: usize = crate::clipboard::MAX_SNAPSHOT_BYTES;

/// How often the field is read while confirming, and for how long after the Ctrl+V (Design, step 5).
pub const CONFIRM_POLL: Duration = Duration::from_millis(20);
pub const CONFIRM_WAIT: Duration = Duration::from_secs(2);

/// While an earlier unconfirmed paste's `CurrentTime` refusal runs, `wait` long (Decision Log, M2.1).
pub fn previous_unconfirmed(wait: Duration) -> String {
    format!(
        "a previous paste could not be confirmed and may still be read; nothing was sent; retry after {} s",
        wait.as_secs() + u64::from(wait.subsec_nanos() > 0)
    )
}

/// A refusal before dispatch whose cause is another sentence (a snapshot bound, the owner's take).
pub fn nothing_sent(cause: impl std::fmt::Display) -> String {
    format!("{cause}; nothing was sent")
}

/// The Device mode sentence for a family that ignores the paste chord on the background route, in shared mode.
pub fn no_background_input(app: &str) -> String {
    format!("{app} does not accept background input; use a dedicated desktop or activate the window first")
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
}

impl Expected {
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
            previous_unconfirmed(Duration::from_millis(7_200)),
            "a previous paste could not be confirmed and may still be read; nothing was sent; retry after 8 s"
        );
        assert_eq!(
            previous_unconfirmed(Duration::from_secs(3)),
            "a previous paste could not be confirmed and may still be read; nothing was sent; retry after 3 s"
        );
        assert_eq!(
            no_background_input("org.gnome.TextEditor"),
            "org.gnome.TextEditor does not accept background input; use a dedicated desktop or activate the window first"
        );
        assert_eq!(
            nothing_sent("clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms"),
            "clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms; nothing was sent"
        );
    }
}
