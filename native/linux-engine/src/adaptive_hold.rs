//! The adaptive hold (the design session's rulings 897, 898 and 899; measured by task 116): for a drag whose source is
//! positively identified as a Chrome or Chromium browser (`browser.rs`), the hold for its take (`dnd::TAKE_HOLD_AFTER_PRESS`,
//! B) ends by what the source's answers to the hold's pings (`hold_ping.rs`) say. Chrome's browser answers `_NET_WM_PING`
//! in a few milliseconds on a plain drag, and slowly (91 ms and more) after a press on a draggable element, whether or
//! not its renderer starts a drag; and only that renderer's drag start can come late.
//!
//! - **Early release** at press + [`EARLY_RELEASE_AFTER_PRESS`] when every ping answered by then came back under
//!   [`FAST_PING`]. Only positive evidence counts: a ping still being sent, one whose send failed, one unanswered for
//!   [`FAST_PING`], no ping answered at all (the sampler not ready, no time for one, a window that lists no
//!   `_NET_WM_PING`) all read slow. A ping sent by then whose answer is younger than [`FAST_PING`] is undecided, and the
//!   release waits for it, at most [`FAST_PING`] more: it is never counted either way before it is known.
//! - **Otherwise the hold runs to B.** There, every ping answered under [`FAST_PING`] releases; any slow one, or no
//!   answer at all, extends it to press + [`EXTENDED_HOLD_AFTER_PRESS`], waiting for the take.
//! - **Notice:** an extended hold with no take by its end releases, and the drag answers ok with [`NOTICE`] beside it.
//! - A take ends any of them at once, and the drag goes on as any take's does.
//!
//! Every other source, and any source while the hold's pings are off (`--drag-dnd-hold-ping off`, measurement only),
//! keeps the fixed hold to B: no early release, no extension, no notice. `--stats` records which way each hold went
//! and why (`hold.adaptive`).

use std::time::{Duration, Instant};

use serde_json::{Value, json};

/// When, after the press, an identified browser's hold whose pings all came back fast releases (ruling 897).
pub const EARLY_RELEASE_AFTER_PRESS: Duration = Duration::from_millis(150);

/// T, the round trip under which a ping is fast (ruling 897.2): twice below the slowest draggable press an early release
/// would act on (40.9 ms at arm64 twice the load), above every plain drag's but one in 568 (26.8 ms), which errs toward
/// the hold.
pub const FAST_PING: Duration = Duration::from_millis(20);

/// How long after the press an identified browser's hold with a slow ping waits for the take (ruling 897): past the
/// latest renderer drag start measured at arm64 twice the load (+521 ms).
pub const EXTENDED_HOLD_AFTER_PRESS: Duration = Duration::from_millis(650);

/// The longest the identification's accessibility-bus lookup may take before the press (ruling 899): one that has not
/// answered by then leaves the source unidentified, so its drag keeps the fixed hold.
pub const IDENTIFY_BOUND: Duration = Duration::from_millis(200);

/// What an extended hold with no take answers beside its ok (ruling 897), word for word: the page may have started a
/// drag and drop that its browser refused once the button was up.
pub const NOTICE: &str = "the page may have started a drag that did not complete";

/// One of the hold's pings, as the reading sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ping {
    /// Admitted, not yet sent (or its send under way).
    Sending,
    /// Its send failed: nothing was asked.
    Failed,
    /// Sent at `sent`, answered at `answered` (None: not yet).
    Sent { sent: Instant, answered: Option<Instant> },
}

/// What the pings say.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reading {
    /// At least one ping answered, every one under [`FAST_PING`].
    Fast,
    /// Not fast, and why.
    Slow(String),
    /// A ping's answer is not yet known either way.
    Undecided,
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1000.0 * 10.0).round() / 10.0
}

/// The reading `now` of `pings` (each with the instant its record began, the ones begun by `by` read), `none` the
/// reason when there is no ping to read.
pub fn read(pings: &[(Instant, Ping)], by: Instant, now: Instant, none: &str) -> Reading {
    let mut answered = 0;
    let mut undecided = false;
    for &(_, ping) in pings.iter().filter(|(begun, _)| *begun <= by) {
        match ping {
            Ping::Sending => return Reading::Slow("a ping was still being sent".into()),
            Ping::Failed => return Reading::Slow("a ping's send failed".into()),
            Ping::Sent {
                sent,
                answered: Some(at),
            } => {
                let rtt = at.saturating_duration_since(sent);
                if rtt >= FAST_PING {
                    return Reading::Slow(format!("a ping came back in {} ms", ms(rtt)));
                }
                answered += 1;
            }
            Ping::Sent { sent, answered: None } => match now.saturating_duration_since(sent) >= FAST_PING {
                true => return Reading::Slow(format!("a ping went unanswered for {} ms", ms(FAST_PING))),
                false => undecided = true,
            },
        }
    }
    match (undecided, answered) {
        (true, _) => Reading::Undecided,
        (false, 0) => Reading::Slow(none.into()),
        (false, _) => Reading::Fast,
    }
}

/// Which way a hold went (`--stats` `hold.adaptive.way`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Way {
    /// Released at press + [`EARLY_RELEASE_AFTER_PRESS`] on fast pings.
    Early,
    /// Ended by B, or by a take before it.
    Fixed,
    /// Run past B for a slow source, and ended by a take.
    Extended,
    /// Run past B for a slow source, with no take by its end: the drag answers with [`NOTICE`].
    Noticed,
}

impl Way {
    pub fn name(self) -> &'static str {
        match self {
            Way::Early => "early",
            Way::Fixed => "fixed",
            Way::Extended => "extended",
            Way::Noticed => "noticed",
        }
    }
}

/// When a hold with no take ends: the fixed bound, or the adaptive one (`dnd::wait_for_take`).
pub trait HoldEnd {
    /// Whether a hold with no take seen by `now` ends now.
    fn ends(&mut self, now: Instant) -> bool;
    /// The latest the hold's next look may come.
    fn next(&self, now: Instant) -> Instant;
    /// From when the pointer must be still on the path's end, if before the hold's refreshes would end: an early
    /// release still possible wants its browser's rest before it.
    fn still_from(&self) -> Option<Instant> {
        None
    }
}

/// The fixed hold: until the instant.
impl HoldEnd for Instant {
    fn ends(&mut self, now: Instant) -> bool {
        now >= *self
    }
    fn next(&self, _now: Instant) -> Instant {
        *self
    }
}

impl<T: HoldEnd + ?Sized> HoldEnd for &mut T {
    fn ends(&mut self, now: Instant) -> bool {
        (**self).ends(now)
    }
    fn next(&self, now: Instant) -> Instant {
        (**self).next(now)
    }
    fn still_from(&self) -> Option<Instant> {
        (**self).still_from()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Early,
    Bound,
    Extended,
    Over,
}

/// One drag's hold, fixed or adaptive, with what it decided. `R` reads the pings: `(by, now)` -> [`Reading`].
pub struct Hold<R> {
    pressed: Instant,
    bound: Instant,
    /// The adaptive hold's early release and extension; None for the fixed one.
    adaptive: Option<(Option<Instant>, Instant)>,
    rest: Duration,
    read: R,
    phase: Phase,
    way: Way,
    why: String,
    /// What the pings read slow for, once they did.
    slow: Option<String>,
    /// What identified the source, or why it was not (the record's `source`).
    source: Result<String, String>,
}

impl<R: FnMut(Instant, Instant) -> Reading> Hold<R> {
    /// The fixed hold to `pressed + bound`, `why` it is not adaptive: `read` is never asked.
    pub fn fixed(pressed: Instant, bound: Duration, why: String, source: Result<String, String>, read: R) -> Hold<R> {
        Hold {
            pressed,
            bound: pressed + bound,
            adaptive: None,
            rest: Duration::ZERO,
            read,
            phase: Phase::Bound,
            way: Way::Fixed,
            why,
            slow: None,
            source,
        }
    }

    /// The adaptive hold of an identified browser's drag pressed at `pressed`, B `bound` (an early release only when it
    /// falls before B, an extension to the later of press + [`EXTENDED_HOLD_AFTER_PRESS`] and B), `rest` its browser's
    /// rest before a release, `read` its pings.
    pub fn adaptive(pressed: Instant, bound: Duration, rest: Duration, read: R, source: String) -> Hold<R> {
        let early = (EARLY_RELEASE_AFTER_PRESS < bound).then(|| pressed + EARLY_RELEASE_AFTER_PRESS);
        Hold {
            pressed,
            bound: pressed + bound,
            adaptive: Some((early, pressed + bound.max(EXTENDED_HOLD_AFTER_PRESS))),
            rest,
            read,
            phase: if early.is_some() { Phase::Early } else { Phase::Bound },
            way: Way::Fixed,
            why: String::new(),
            slow: None,
            source: Ok(source),
        }
    }

    /// Which way the hold went.
    pub fn way(&self) -> Way {
        self.way
    }

    /// The hold ended by a take at `at`: the way it was going then.
    pub fn taken(&mut self, at: Instant) {
        let after = ms(at.saturating_duration_since(self.pressed));
        (self.way, self.why) = match (self.phase, &self.slow) {
            (Phase::Extended, Some(slow)) => (
                Way::Extended,
                format!("{slow}; the take came {after} ms after the press"),
            ),
            (Phase::Over, _) => (self.way, std::mem::take(&mut self.why)),
            (_, Some(slow)) => (
                Way::Fixed,
                format!("{slow}; the take came {after} ms after the press, inside B"),
            ),
            (_, None) if self.adaptive.is_none() => (Way::Fixed, std::mem::take(&mut self.why)),
            (_, None) => (
                Way::Fixed,
                format!("the take came {after} ms after the press, before the pings decided"),
            ),
        };
        self.phase = Phase::Over;
    }

    /// `--stats` `hold.adaptive`: the way, why, and what identified the source (or why it was not).
    pub fn record(&self) -> Value {
        json!({
            "way": self.way.name(),
            "why": self.why,
            "source": match &self.source {
                Ok(by) => json!({ "identified": true, "by": by }),
                Err(why) => json!({ "identified": false, "why": why }),
            },
        })
    }

    fn end(&mut self, way: Way, why: String) -> bool {
        (self.way, self.why) = (way, why);
        self.phase = Phase::Over;
        true
    }
}

impl<R: FnMut(Instant, Instant) -> Reading> HoldEnd for Hold<R> {
    fn ends(&mut self, now: Instant) -> bool {
        loop {
            match (self.phase, self.adaptive) {
                (Phase::Over, _) => return true,
                (Phase::Early, Some((Some(early), _))) => {
                    if now < early {
                        return false;
                    }
                    match (self.read)(early, now) {
                        Reading::Fast => {
                            let why = format!(
                                "every ping answered by {} ms came back under {} ms",
                                ms(EARLY_RELEASE_AFTER_PRESS),
                                ms(FAST_PING)
                            );
                            return self.end(Way::Early, why);
                        }
                        // a ping sent by 150 is known within T of it; one still unknown past that is not fast
                        Reading::Undecided if now < early + FAST_PING => return false,
                        Reading::Undecided => {
                            self.slow = Some("a ping's answer was still unknown".into());
                            self.phase = Phase::Bound;
                        }
                        Reading::Slow(why) => {
                            self.slow = Some(why);
                            self.phase = Phase::Bound;
                        }
                    }
                }
                (Phase::Early, _) => self.phase = Phase::Bound,
                (Phase::Bound, None) => {
                    if now < self.bound {
                        return false;
                    }
                    let why = std::mem::take(&mut self.why);
                    return self.end(Way::Fixed, why);
                }
                (Phase::Bound, Some(_)) => {
                    if now < self.bound {
                        return false;
                    }
                    // B's reading reads every ping sent by B, those by the early release's look included, so a ping
                    // slow then is slow now; and every ping the hold sent is known by B (none goes in its last
                    // `hold_ping::PING_EVERY`), so a reading still undecided is not fast: it extends
                    self.slow = Some(match (self.read)(self.bound, now) {
                        Reading::Fast => {
                            let why = format!("every ping answered by B came back under {} ms", ms(FAST_PING));
                            return self.end(Way::Fixed, why);
                        }
                        Reading::Undecided => "a ping was not answered by B".into(),
                        Reading::Slow(why) => why,
                    });
                    self.phase = Phase::Extended;
                }
                (Phase::Extended, Some((_, extended))) => {
                    if now < extended {
                        return false;
                    }
                    let why = format!(
                        "{}; no take by {} ms after the press",
                        self.slow.as_deref().unwrap_or("a ping was slow"),
                        ms(extended.saturating_duration_since(self.pressed))
                    );
                    return self.end(Way::Noticed, why);
                }
                (Phase::Extended, None) => unreachable!("only an adaptive hold extends"),
            }
        }
    }

    fn next(&self, now: Instant) -> Instant {
        match (self.phase, self.adaptive) {
            (Phase::Early, Some((Some(early), _))) if now < early => early,
            // an undecided reading: looked at again within a ping's read resolution
            (Phase::Early, _) => now + Duration::from_millis(1),
            (Phase::Bound, _) => self.bound,
            (Phase::Extended, Some((_, extended))) => extended,
            _ => now,
        }
    }

    fn still_from(&self) -> Option<Instant> {
        match (self.phase, self.adaptive) {
            (Phase::Early, Some((Some(early), _))) => Some(early.checked_sub(self.rest).unwrap_or(early)),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sent(at: Instant, after: u64, rtt: Option<u64>) -> (Instant, Ping) {
        let s = at + Duration::from_millis(after);
        (
            s,
            Ping::Sent {
                sent: s,
                answered: rtt.map(|r| s + Duration::from_millis(r)),
            },
        )
    }

    #[test]
    fn only_answers_under_t_read_fast_and_anything_else_reads_slow() {
        let p = Instant::now();
        let by = p + Duration::from_millis(150);
        let now = by;
        assert_eq!(
            read(&[sent(p, 30, Some(1)), sent(p, 56, Some(2))], by, now, "none"),
            Reading::Fast
        );
        assert!(
            matches!(
                read(&[sent(p, 30, Some(1)), sent(p, 56, Some(20))], by, now, "none"),
                Reading::Slow(_)
            ),
            "20 ms is not under T"
        );
        assert!(matches!(read(&[sent(p, 30, Some(19))], by, now, "none"), Reading::Fast));
        assert!(
            matches!(read(&[sent(p, 100, None)], by, now, "none"), Reading::Slow(_)),
            "unanswered for T"
        );
        assert_eq!(
            read(&[sent(p, 30, Some(1)), sent(p, 140, None)], by, now, "none"),
            Reading::Undecided,
            "an answer younger than T is not yet known"
        );
        assert_eq!(
            read(&[(p + Duration::from_millis(140), Ping::Sending)], by, now, "none"),
            Reading::Slow("a ping was still being sent".into())
        );
        assert_eq!(
            read(&[(p + Duration::from_millis(140), Ping::Failed)], by, now, "none"),
            Reading::Slow("a ping's send failed".into())
        );
        assert_eq!(
            read(&[], by, now, "not ready"),
            Reading::Slow("not ready".into()),
            "no ping answered"
        );
        // pings begun after `by` are not read
        assert_eq!(
            read(&[sent(p, 30, Some(1)), sent(p, 151, Some(90))], by, now, "none"),
            Reading::Fast
        );
    }

    /// A hold run look by look on a fake clock: `reading(by, now)` the pings, the hold's end instant returned.
    fn run(mut hold: impl HoldEnd, pressed: Instant, take: Option<u64>) -> (Option<u64>, bool) {
        for t in 0..1000u64 {
            let now = pressed + Duration::from_millis(t);
            if take == Some(t) {
                return (Some(t), true);
            }
            if hold.ends(now) {
                return (Some(t), false);
            }
        }
        (None, false)
    }

    #[test]
    fn fast_pings_release_at_150_slow_ones_extend_to_650_and_otherwise_the_hold_ends_at_b() {
        let p = Instant::now();
        let b = Duration::from_millis(450);
        let fast = |_: Instant, _: Instant| Reading::Fast;
        let mut early = Hold::adaptive(p, b, Duration::from_millis(30), fast, "chrome".into());
        assert_eq!(run(&mut early, p, None), (Some(150), false));
        assert_eq!(early.way(), Way::Early);
        assert_eq!(early.record()["way"], "early");
        // slow at 150 and at B: extended, then noticed at 650
        let slow = |_: Instant, _: Instant| Reading::Slow("a ping came back in 91 ms".into());
        let mut noticed = Hold::adaptive(p, b, Duration::from_millis(30), slow, "chrome".into());
        assert_eq!(run(&mut noticed, p, None), (Some(650), false));
        assert_eq!(noticed.way(), Way::Noticed);
        assert!(
            noticed.record()["why"]
                .as_str()
                .unwrap()
                .starts_with("a ping came back in 91 ms; no take by 650")
        );
        // slow, with a take in the extension: extended
        let mut extended = Hold::adaptive(p, b, Duration::from_millis(30), slow, "chrome".into());
        assert_eq!(run(&mut extended, p, Some(520)), (Some(520), true));
        extended.taken(p + Duration::from_millis(520));
        assert_eq!(extended.way(), Way::Extended);
        // slow at 150 (no answer yet), every ping fast by B: released at B
        let later = move |by: Instant, _: Instant| match by < p + Duration::from_millis(450) {
            true => Reading::Slow("no ping answered".into()),
            false => Reading::Fast,
        };
        let mut fixed = Hold::adaptive(p, b, Duration::from_millis(30), later, "chrome".into());
        assert_eq!(run(&mut fixed, p, None), (Some(450), false));
        assert_eq!(fixed.way(), Way::Fixed);
    }

    #[test]
    fn b_reads_every_ping_so_one_slow_by_150_still_extends() {
        // the readings of the real pings: fast at 30, slow (91 ms) for the one sent at 56, fast after
        let p = Instant::now();
        let pings = [
            sent(p, 30, Some(1)),
            sent(p, 56, Some(91)),
            sent(p, 172, Some(1)),
            sent(p, 198, Some(1)),
        ];
        let reader = |by: Instant, now: Instant| read(&pings, by, now, "no ping answered");
        let mut hold = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            reader,
            "chrome".into(),
        );
        assert_eq!(run(&mut hold, p, None), (Some(650), false));
        assert_eq!(hold.way(), Way::Noticed);
        assert!(
            hold.record()["why"]
                .as_str()
                .unwrap()
                .starts_with("a ping came back in 91 ms")
        );
    }

    #[test]
    fn an_undecided_ping_at_150_is_waited_for_and_never_counted_before_it_is_known() {
        let p = Instant::now();
        // the ping answers fast at 153: released then
        let late_fast = move |_: Instant, now: Instant| match now < p + Duration::from_millis(153) {
            true => Reading::Undecided,
            false => Reading::Fast,
        };
        let mut hold = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            late_fast,
            "chrome".into(),
        );
        assert_eq!(run(&mut hold, p, None), (Some(153), false));
        assert_eq!(hold.way(), Way::Early);
        // it turns slow at 165: no early release
        let late_slow = move |_: Instant, now: Instant| match now < p + Duration::from_millis(165) {
            true => Reading::Undecided,
            false => Reading::Slow("a ping went unanswered for 20 ms".into()),
        };
        let mut hold = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            late_slow,
            "chrome".into(),
        );
        assert_eq!(run(&mut hold, p, None), (Some(650), false));
        // undecided at B (none goes in B's last 25 ms, so this is a fault): extended, never released as fast
        let never = |_: Instant, _: Instant| Reading::Undecided;
        let mut hold = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            never,
            "chrome".into(),
        );
        assert_eq!(run(&mut hold, p, None), (Some(650), false));
        assert_eq!(hold.way(), Way::Noticed);
    }

    #[test]
    fn the_fixed_hold_ends_at_b_whatever_and_a_shorter_or_longer_b_moves_the_points() {
        let p = Instant::now();
        let mut fixed = Hold::fixed(
            p,
            Duration::from_millis(450),
            "the hold's pings are off".into(),
            Err("x".into()),
            |_, _| Reading::Fast,
        );
        assert_eq!(run(&mut fixed, p, None), (Some(450), false));
        assert_eq!(fixed.record()["way"], "fixed");
        assert_eq!(fixed.record()["why"], "the hold's pings are off");
        assert_eq!(fixed.record()["source"], json!({"identified": false, "why": "x"}));
        // B under 150 (measurement only): no early release; the extension to 650 stays
        let fast = |_: Instant, _: Instant| Reading::Fast;
        assert_eq!(
            run(
                Hold::adaptive(
                    p,
                    Duration::from_millis(100),
                    Duration::from_millis(30),
                    fast,
                    "c".into()
                ),
                p,
                None
            ),
            (Some(100), false)
        );
        let slow = |_: Instant, _: Instant| Reading::Slow("s".into());
        assert_eq!(
            run(
                Hold::adaptive(
                    p,
                    Duration::from_millis(100),
                    Duration::from_millis(30),
                    slow,
                    "c".into()
                ),
                p,
                None
            ),
            (Some(650), false)
        );
        // B past 650: the extension is B itself
        assert_eq!(
            run(
                Hold::adaptive(
                    p,
                    Duration::from_millis(700),
                    Duration::from_millis(30),
                    slow,
                    "c".into()
                ),
                p,
                None
            ),
            (Some(700), false)
        );
    }

    #[test]
    fn a_take_records_the_way_the_hold_was_going_and_the_pointer_rests_before_an_early_release() {
        let p = Instant::now();
        let slow = |_: Instant, _: Instant| Reading::Slow("a ping came back in 91 ms".into());
        let mut hold = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            slow,
            "chrome".into(),
        );
        assert_eq!(
            hold.still_from(),
            Some(p + Duration::from_millis(120)),
            "still from a browser's rest before 150"
        );
        assert!(!hold.ends(p + Duration::from_millis(150)));
        assert_eq!(hold.still_from(), None, "no early release: the refreshes may go on");
        hold.taken(p + Duration::from_millis(300));
        assert_eq!(hold.way(), Way::Fixed);
        assert!(hold.record()["why"].as_str().unwrap().contains("inside B"));
        let fast = |_: Instant, _: Instant| Reading::Fast;
        let mut quick = Hold::adaptive(
            p,
            Duration::from_millis(450),
            Duration::from_millis(30),
            fast,
            "chrome".into(),
        );
        quick.taken(p + Duration::from_millis(80));
        assert_eq!(quick.way(), Way::Fixed);
        assert!(
            quick.record()["why"]
                .as_str()
                .unwrap()
                .contains("before the pings decided")
        );
        assert_eq!(NOTICE, "the page may have started a drag that did not complete");
    }
}
