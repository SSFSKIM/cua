//! What the CLIPBOARD owner serves, and to whom (Design, Text and clipboard; behaviour §13.4): payloads and their
//! targets, INCR chunking, and the serving generations that keep a late conversion from receiving the restored
//! snapshot as if it were the paste. Pure logic; the owner's thread (`owner.rs`) applies it to X events.

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Result, bail};

pub type Atom = u32;

/// One format of a payload: the target a requestor asks for, the property type and format it is written with, and
/// its bytes, shared so an INCR transfer keeps the payload it started with.
#[derive(Debug, Clone, PartialEq)]
pub struct Format {
    pub target: Atom,
    pub kind: Atom,
    pub format: u8,
    pub data: Arc<[u8]>,
}

/// What the owner serves: formats in the order `TARGETS` lists them after `TARGETS` itself.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Payload {
    pub formats: Vec<Format>,
}

/// The atoms text is served under (behaviour §13.4, plus `STRING` for Latin-1-only text, Design step 3).
#[derive(Debug, Clone, Copy)]
pub struct TextAtoms {
    pub utf8_string: Atom,
    pub text_plain: Atom,
    pub text_plain_utf8: Atom,
    pub string: Atom,
}

/// The text's Latin-1 bytes, when every character is in U+0000..U+00FF.
pub fn latin1(text: &str) -> Option<Vec<u8>> {
    text.chars().map(|c| u8::try_from(u32::from(c)).ok()).collect()
}

impl Payload {
    /// Text as the vendor serves it (`UTF8_STRING`, `text/plain`, `text/plain;charset=utf-8`, each typed as itself,
    /// format 8), with `STRING` after them when the text is Latin-1 only.
    pub fn text(text: &str, atoms: &TextAtoms) -> Payload {
        let utf8: Arc<[u8]> = Arc::from(text.as_bytes());
        let mut formats: Vec<Format> = [atoms.utf8_string, atoms.text_plain, atoms.text_plain_utf8]
            .into_iter()
            .map(|target| Format {
                target,
                kind: target,
                format: 8,
                data: utf8.clone(),
            })
            .collect();
        if let Some(bytes) = latin1(text) {
            formats.push(Format {
                target: atoms.string,
                kind: atoms.string,
                format: 8,
                data: Arc::from(bytes),
            });
        }
        Payload { formats }
    }

    /// A captured clipboard: its formats in ascending atom order, as the vendor stores them (behaviour §13.3).
    pub fn snapshot(mut formats: Vec<Format>) -> Payload {
        formats.sort_by_key(|f| f.target);
        Payload { formats }
    }

    pub fn is_empty(&self) -> bool {
        self.formats.is_empty()
    }

    /// The bytes it holds, for the handle storage limit.
    pub fn bytes(&self) -> usize {
        self.formats.iter().map(|f| f.data.len()).sum()
    }

    pub fn get(&self, target: Atom) -> Option<&Format> {
        self.formats.iter().find(|f| f.target == target)
    }

    /// The `TARGETS` answer: `TARGETS`, then each format's target.
    pub fn targets(&self, targets: Atom) -> Vec<Atom> {
        std::iter::once(targets)
            .chain(self.formats.iter().map(|f| f.target))
            .collect()
    }
}

/// The largest INCR chunk (behaviour §13.4): the server's maximum request less the `ChangeProperty` header, at most
/// 64 KiB, a whole number of 32-bit units so every format's items stay whole.
pub fn chunk_size(maximum_request_bytes: usize) -> Result<usize> {
    let size = maximum_request_bytes.saturating_sub(24).min(65_536) & !3;
    if size < 4 {
        bail!("X11 maximum request size is too small");
    }
    Ok(size)
}

/// Whether X timestamp `time` lies in `[from, to]`, the server's 32-bit millisecond clock wrapping.
pub fn within(time: u32, from: u32, to: u32) -> bool {
    time.wrapping_sub(from) <= to.wrapping_sub(from)
}

/// How long after an unconfirmed paste a `CurrentTime` request is refused (Design, Serving generations).
pub const CURRENT_TIME_REFUSAL: Duration = Duration::from_secs(10);

/// A paste whose cleanup has run: from when the engine took CLIPBOARD for it to the cleanup, the Ctrl+V's own
/// timestamp, and, when it did not confirm, until when a `CurrentTime` request is refused.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Closed {
    pub owned_at: u32,
    pub dispatched: Option<u32>,
    pub cleaned_at: u32,
    pub current_time_until: Option<Instant>,
}

impl Closed {
    pub fn new(owned_at: u32, dispatched: Option<u32>, cleaned_at: u32, confirmed: bool, now: Instant) -> Closed {
        Closed {
            owned_at,
            dispatched,
            cleaned_at,
            current_time_until: (!confirmed).then(|| now + CURRENT_TIME_REFUSAL),
        }
    }

    /// Whether a `ConvertSelection` at `time` (0 is `CurrentTime`) arriving `now` belongs to this paste, and so must
    /// not receive what is served after it.
    pub fn refuses(&self, time: u32, now: Instant) -> bool {
        if time == 0 {
            return self.current_time_until.is_some_and(|until| now < until);
        }
        Some(time) == self.dispatched || within(time, self.owned_at, self.cleaned_at)
    }
}

/// How many closed pastes are kept one by one; older ones are merged into one span (`Refusals`).
pub const CLOSED_KEPT: usize = 32;

/// The longest span the merged older pastes cover: half the server clock's range, so "within" stays meaningful.
/// A conversion stamped more than 24 days before the newest merged paste is no longer refused for it.
const SPAN_LIMIT: u32 = 1 << 31;

/// Every closed paste's refusal, bounded in memory without expiry (Design, Serving generations): the newest
/// `CLOSED_KEPT` exactly, and the older ones merged into one span from the oldest merged ownership to the newest merged
/// cleanup, which refuses a little more than they did (the gaps between them), never less.
#[derive(Debug, Default)]
pub struct Refusals {
    kept: std::collections::VecDeque<Closed>,
    merged: Option<Merged>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct Merged {
    from: u32,
    through: u32,
    current_time_until: Option<Instant>,
}

impl Refusals {
    pub fn push(&mut self, closed: Closed) {
        self.kept.push_back(closed);
        while self.kept.len() > CLOSED_KEPT {
            let old = self.kept.pop_front().expect("over the limit");
            self.merge(old);
        }
    }

    fn merge(&mut self, old: Closed) {
        let merged = match self.merged {
            None => Merged {
                from: old.owned_at,
                through: old.cleaned_at,
                current_time_until: old.current_time_until,
            },
            Some(m) => {
                let through = old.cleaned_at;
                let from = if through.wrapping_sub(m.from) > SPAN_LIMIT {
                    through.wrapping_sub(SPAN_LIMIT)
                } else {
                    m.from
                };
                Merged {
                    from,
                    through,
                    current_time_until: m.current_time_until.max(old.current_time_until),
                }
            }
        };
        self.merged = Some(merged);
    }

    pub fn refuses(&self, time: u32, now: Instant) -> bool {
        self.kept.iter().any(|c| c.refuses(time, now))
            || self.merged.is_some_and(|m| {
                if time == 0 {
                    m.current_time_until.is_some_and(|until| now < until)
                } else {
                    within(time, m.from, m.through)
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ATOMS: TextAtoms = TextAtoms {
        utf8_string: 300,
        text_plain: 301,
        text_plain_utf8: 302,
        string: 31,
    };

    fn targets_of(p: &Payload) -> Vec<Atom> {
        p.formats.iter().map(|f| f.target).collect()
    }

    #[test]
    fn text_is_served_as_the_vendor_serves_it_with_string_only_for_latin1() {
        let unicode = Payload::text("안녕 🙂", &ATOMS);
        assert_eq!(
            targets_of(&unicode),
            [300, 301, 302],
            "no STRING for text beyond Latin-1"
        );
        for f in &unicode.formats {
            assert_eq!((f.kind, f.format), (f.target, 8), "each typed as itself, format 8");
            assert_eq!(&*f.data, "안녕 🙂".as_bytes());
        }
        let latin = Payload::text("café\tx\n", &ATOMS);
        assert_eq!(targets_of(&latin), [300, 301, 302, 31]);
        let string = latin.get(31).unwrap();
        assert_eq!(&*string.data, b"caf\xe9\tx\n", "Latin-1 bytes, not UTF-8");
        assert_eq!(latin.get(300).unwrap().data.len(), 8, "UTF-8 keeps é as two bytes");
        assert_eq!(latin.targets(5), [5, 300, 301, 302, 31], "TARGETS first");
    }

    #[test]
    fn a_snapshot_is_stored_in_ascending_atom_order() {
        let f = |target| Format {
            target,
            kind: target,
            format: 8,
            data: Arc::from(&b"x"[..]),
        };
        let p = Payload::snapshot(vec![f(400), f(31), f(302)]);
        assert_eq!(targets_of(&p), [31, 302, 400]);
        assert_eq!(p.bytes(), 3);
        assert!(Payload::default().is_empty());
    }

    #[test]
    fn chunks_are_at_most_64_kib_whole_32_bit_units_and_fit_the_request() {
        assert_eq!(chunk_size(4 << 20).unwrap(), 65_536);
        assert_eq!(chunk_size(262_140).unwrap(), 65_536);
        assert_eq!(chunk_size(1_000).unwrap(), 976);
        assert_eq!(chunk_size(1_003).unwrap(), 976, "rounded down to whole units");
        assert_eq!(
            chunk_size(27).unwrap_err().to_string(),
            "X11 maximum request size is too small"
        );
    }

    #[test]
    fn timestamps_are_compared_on_the_wrapping_clock() {
        assert!(within(10, 10, 20));
        assert!(within(20, 10, 20));
        assert!(!within(21, 10, 20));
        assert!(!within(9, 10, 20));
        assert!(within(2, u32::MAX - 5, 5), "across the wrap");
        assert!(!within(6, u32::MAX - 5, 5));
    }

    #[test]
    fn a_closed_paste_refuses_its_own_conversions_and_nothing_later() {
        let now = Instant::now();
        let closed = Closed::new(1_000, Some(1_040), 1_900, true, now);
        assert!(closed.refuses(1_040, now), "the Ctrl+V's own timestamp");
        assert!(closed.refuses(1_000, now), "from ownership");
        assert!(closed.refuses(1_500, now));
        assert!(closed.refuses(1_900, now), "up to the cleanup");
        assert!(!closed.refuses(1_901, now), "a later request gets the snapshot");
        assert!(!closed.refuses(999, now), "an earlier one too");
        assert!(!closed.refuses(0, now), "a confirmed paste does not refuse CurrentTime");
    }

    #[test]
    fn an_unconfirmed_paste_refuses_current_time_for_ten_seconds() {
        let now = Instant::now();
        let closed = Closed::new(1_000, Some(1_040), 1_900, false, now);
        assert!(closed.refuses(0, now));
        assert!(closed.refuses(0, now + Duration::from_millis(9_999)));
        assert!(!closed.refuses(0, now + CURRENT_TIME_REFUSAL));
        assert!(
            closed.refuses(1_040, now + Duration::from_secs(60)),
            "its timestamps stay refused"
        );
    }

    #[test]
    fn pastes_beyond_the_kept_ones_still_refuse_their_timestamps() {
        let now = Instant::now();
        let mut refusals = Refusals::default();
        // Paste i owns from 1000 + 100 i to 1000 + 100 i + 50, its Ctrl+V at + 10.
        for i in 0..(CLOSED_KEPT as u32 + 5) {
            let at = 1_000 + 100 * i;
            refusals.push(Closed::new(at, Some(at + 10), at + 50, true, now));
        }
        assert!(refusals.refuses(1_010, now), "the first paste's Ctrl+V, long evicted");
        assert!(refusals.refuses(1_000, now) && refusals.refuses(1_050, now));
        assert!(
            refusals.refuses(1_075, now),
            "a gap between merged pastes is refused too, conservatively"
        );
        let last = 1_000 + 100 * (CLOSED_KEPT as u32 + 4);
        assert!(refusals.refuses(last + 50, now));
        assert!(!refusals.refuses(last + 51, now), "a later request is served");
        assert!(!refusals.refuses(999, now), "before every paste");
        assert!(!refusals.refuses(0, now), "confirmed pastes refuse no CurrentTime");
    }

    #[test]
    fn a_merged_unconfirmed_paste_keeps_its_current_time_refusal() {
        let now = Instant::now();
        let mut refusals = Refusals::default();
        refusals.push(Closed::new(10, None, 20, false, now));
        for i in 0..CLOSED_KEPT as u32 {
            refusals.push(Closed::new(100 + i, None, 100 + i, true, now));
        }
        assert!(refusals.refuses(0, now + Duration::from_secs(5)));
        assert!(!refusals.refuses(0, now + CURRENT_TIME_REFUSAL));
    }

    #[test]
    fn the_merged_span_stays_within_half_the_clock() {
        let now = Instant::now();
        let mut refusals = Refusals::default();
        refusals.push(Closed::new(0x10, None, 0x20, true, now));
        for i in 0..CLOSED_KEPT as u32 + 1 {
            let at = 0x9000_0000 + i;
            refusals.push(Closed::new(at, None, at, true, now));
        }
        assert!(
            !refusals.refuses(0x15, now),
            "more than 2^31 ms before the newest merged paste"
        );
        assert!(refusals.refuses(0x9000_0000, now));
    }

    #[test]
    fn a_paste_never_dispatched_still_refuses_its_window() {
        let now = Instant::now();
        let closed = Closed::new(u32::MAX - 10, None, 30, false, now);
        assert!(closed.refuses(u32::MAX, now));
        assert!(closed.refuses(5, now), "across the wrap");
        assert!(!closed.refuses(31, now));
    }
}
