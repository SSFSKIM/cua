//! The extended hold (the design session's rulings 897-899, as amended on task 117's finding; measured by task 116):
//! every drag of a Chromium-family source keeps its button down for the take until press + B
//! (`dnd::TAKE_HOLD_AFTER_PRESS`, 450 ms), and for a source positively identified as a Chrome or Chromium browser
//! (`browser.rs`) what the source's answers to the hold's pings (`hold_ping.rs`) say at B decides whether the hold
//! goes on. Chrome's browser answers `_NET_WM_PING` in a few milliseconds while nothing drags, and slowly (91 ms and
//! more at twice the load) while it sets up a drag its renderer started: so a slow ping at B marks a drag still on its
//! way to its take.
//!
//! - **At B**, every ping answered under [`FAST_PING`] releases. Only positive evidence counts: a ping still being sent,
//!   one whose send failed, one unanswered for [`FAST_PING`], or no ping answered at all (the sampler not ready, no time
//!   for one, a window that lists no `_NET_WM_PING`) all read slow, and any slow one extends the hold to press +
//!   [`EXTENDED_HOLD_AFTER_PRESS`], waiting for the take.
//! - **Notice:** an extended hold with no take by its end releases, and the drag answers ok with [`NOTICE`] beside it.
//! - A take ends the hold at once, and the drag goes on as any take's does.
//!
//! There is no early release (task 117): a page whose dragstart or press handler is busy starts its drag late while its
//! browser, idle, answers every ping fast, so a release before B on fast pings loses that drag behind a plain ok (24 of
//! 24 on Chrome 156 at idle, drop-signals' dragstart-150, press-150, dragstart-400 and press-400 cells, which B lands).
//! Electron and every other source, and any source while the hold's pings are off (`--drag-dnd-hold-ping off`,
//! measurement only), keep the fixed hold to B: no extension, no notice. `--stats` records which way each hold went and
//! why (`hold.adaptive`).

use std::time::{Duration, Instant};

use serde_json::{Value, json};

/// T, the round trip under which a ping is fast (ruling 897.2): twice below the slowest draggable press a release would
/// act on (40.9 ms at arm64 twice the load), above every plain drag's but one in 568 (26.8 ms), which errs toward the
/// hold.
pub const FAST_PING: Duration = Duration::from_millis(20);

/// How long after the press an identified browser's hold with a slow ping waits for the take (ruling 897): past the
/// latest renderer drag start measured at arm64 twice the load (+521 ms).
pub const EXTENDED_HOLD_AFTER_PRESS: Duration = Duration::from_millis(650);

/// The longest the whole identification may take before the press (rulings 899 and 912), counted from its start: one
/// that has not answered by then leaves the source unidentified, so its drag keeps the fixed hold, and the press never
/// waits on the bus longer. Sized from the idle lookups measured in the sandbox (task 117: 0.9 to 4.4 ms with the bus
/// asked), ten times the slowest and more.
pub const IDENTIFY_BOUND: Duration = Duration::from_millis(50);

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
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1000.0 * 10.0).round() / 10.0
}

/// The reading `now` of `pings`, `none` the reason when no ping was answered. A ping whose answer is still younger than
/// [`FAST_PING`] is not known fast, so it reads slow: at B none is (the sampler sends none in the hold's last
/// `hold_ping::PING_EVERY`).
pub fn read(pings: &[Ping], now: Instant, none: &str) -> Reading {
    let mut answered = 0;
    for &ping in pings {
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
            Ping::Sent { sent, answered: None } => {
                return Reading::Slow(format!(
                    "a ping was unanswered after {} ms",
                    ms(now.saturating_duration_since(sent))
                ));
            }
        }
    }
    match answered {
        0 => Reading::Slow(none.into()),
        _ => Reading::Fast,
    }
}

/// Which way a hold went (`--stats` `hold.adaptive.way`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Way {
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
            Way::Fixed => "fixed",
            Way::Extended => "extended",
            Way::Noticed => "noticed",
        }
    }
}

/// When a hold with no take ends: the fixed bound, or the extended one (`dnd::wait_for_take`).
pub trait HoldEnd {
    /// Whether a hold with no take seen by `now` ends now.
    fn ends(&mut self, now: Instant) -> bool;
    /// The latest the hold's next look may come.
    fn next(&self) -> Instant;
}

/// The fixed hold: until the instant.
impl HoldEnd for Instant {
    fn ends(&mut self, now: Instant) -> bool {
        now >= *self
    }
    fn next(&self) -> Instant {
        *self
    }
}

impl<T: HoldEnd + ?Sized> HoldEnd for &mut T {
    fn ends(&mut self, now: Instant) -> bool {
        (**self).ends(now)
    }
    fn next(&self) -> Instant {
        (**self).next()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Bound,
    Extended,
    Over,
}

/// One drag's hold, fixed or extensible, with what it decided. `R` reads the pings `now` ([`Reading`]).
pub struct Hold<R> {
    pressed: Instant,
    bound: Instant,
    /// The extended hold's end, for an identified browser; None for the fixed one.
    extended: Option<Instant>,
    read: R,
    phase: Phase,
    way: Way,
    why: String,
    /// What the pings read slow for at B, once they did.
    slow: Option<String>,
    /// What identified the source, or why it was not (the record's `source`).
    source: Result<String, String>,
}

impl<R: FnMut(Instant) -> Reading> Hold<R> {
    /// The fixed hold to `pressed + bound`, `why` it does not extend: `read` is never asked.
    pub fn fixed(pressed: Instant, bound: Duration, why: String, source: Result<String, String>, read: R) -> Hold<R> {
        Hold {
            pressed,
            bound: pressed + bound,
            extended: None,
            read,
            phase: Phase::Bound,
            way: Way::Fixed,
            why,
            slow: None,
            source,
        }
    }

    /// The hold of an identified browser's drag pressed at `pressed`, B `bound`, extended to the later of press +
    /// [`EXTENDED_HOLD_AFTER_PRESS`] and B when `read` reads slow at B.
    pub fn extensible(pressed: Instant, bound: Duration, read: R, source: String) -> Hold<R> {
        Hold {
            pressed,
            bound: pressed + bound,
            extended: Some(pressed + bound.max(EXTENDED_HOLD_AFTER_PRESS)),
            read,
            phase: Phase::Bound,
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
            (_, _) if self.extended.is_none() => (Way::Fixed, std::mem::take(&mut self.why)),
            (_, _) => (
                Way::Fixed,
                format!("the take came {after} ms after the press, inside B"),
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

impl<R: FnMut(Instant) -> Reading> HoldEnd for Hold<R> {
    fn ends(&mut self, now: Instant) -> bool {
        loop {
            match (self.phase, self.extended) {
                (Phase::Over, _) => return true,
                (Phase::Bound, _) if now < self.bound => return false,
                (Phase::Bound, None) => {
                    let why = std::mem::take(&mut self.why);
                    return self.end(Way::Fixed, why);
                }
                (Phase::Bound, Some(_)) => match (self.read)(now) {
                    Reading::Fast => {
                        let why = format!("every ping answered by B came back under {} ms", ms(FAST_PING));
                        return self.end(Way::Fixed, why);
                    }
                    Reading::Slow(why) => {
                        self.slow = Some(why);
                        self.phase = Phase::Extended;
                    }
                },
                (Phase::Extended, Some(extended)) => {
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
                (Phase::Extended, None) => unreachable!("only an identified browser's hold extends"),
            }
        }
    }

    fn next(&self) -> Instant {
        match (self.phase, self.extended) {
            (Phase::Extended, Some(extended)) => extended,
            _ => self.bound,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms_(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    fn sent(at: Instant, after: u64, rtt: Option<u64>) -> Ping {
        Ping::Sent {
            sent: at + ms_(after),
            answered: rtt.map(|r| at + ms_(after + r)),
        }
    }

    #[test]
    fn only_answers_under_t_read_fast_and_anything_else_reads_slow() {
        let p = Instant::now();
        let now = p + ms_(450);
        assert_eq!(
            read(&[sent(p, 30, Some(1)), sent(p, 56, Some(2))], now, "none"),
            Reading::Fast
        );
        assert!(
            matches!(
                read(&[sent(p, 30, Some(1)), sent(p, 56, Some(20))], now, "none"),
                Reading::Slow(_)
            ),
            "20 ms is not under T"
        );
        assert_eq!(read(&[sent(p, 30, Some(19))], now, "none"), Reading::Fast);
        assert_eq!(
            read(&[sent(p, 400, None)], now, "none"),
            Reading::Slow("a ping was unanswered after 50 ms".into())
        );
        assert_eq!(
            read(&[Ping::Sending], now, "none"),
            Reading::Slow("a ping was still being sent".into())
        );
        assert_eq!(
            read(&[Ping::Failed], now, "none"),
            Reading::Slow("a ping's send failed".into())
        );
        assert_eq!(
            read(&[], now, "not ready"),
            Reading::Slow("not ready".into()),
            "no ping answered"
        );
    }

    /// A hold run look by look on a fake clock, a take at `take` ms: when it ended, and whether by the take.
    fn run(mut hold: impl HoldEnd, pressed: Instant, take: Option<u64>) -> (Option<u64>, bool) {
        for t in 0..1000u64 {
            if take == Some(t) {
                return (Some(t), true);
            }
            if hold.ends(pressed + ms_(t)) {
                return (Some(t), false);
            }
        }
        (None, false)
    }

    #[test]
    fn fast_pings_release_at_b_slow_ones_extend_to_650_and_there_is_no_release_before_b() {
        let p = Instant::now();
        let fast = |_: Instant| Reading::Fast;
        let mut at_b = Hold::extensible(p, ms_(450), fast, "chrome".into());
        assert_eq!(
            run(&mut at_b, p, None),
            (Some(450), false),
            "fast pings release at B, never sooner"
        );
        assert_eq!(at_b.way(), Way::Fixed);
        assert_eq!(at_b.record()["why"], "every ping answered by B came back under 20 ms");
        let slow = |_: Instant| Reading::Slow("a ping came back in 91 ms".into());
        let mut noticed = Hold::extensible(p, ms_(450), slow, "chrome".into());
        assert_eq!(run(&mut noticed, p, None), (Some(650), false));
        assert_eq!(noticed.way(), Way::Noticed);
        assert!(
            noticed.record()["why"]
                .as_str()
                .unwrap()
                .starts_with("a ping came back in 91 ms; no take by 650")
        );
        let mut extended = Hold::extensible(p, ms_(450), slow, "chrome".into());
        assert_eq!(run(&mut extended, p, Some(520)), (Some(520), true));
        extended.taken(p + ms_(520));
        assert_eq!(extended.way(), Way::Extended);
        // a take inside B: fixed, whatever the pings
        let mut inside = Hold::extensible(p, ms_(450), slow, "chrome".into());
        assert_eq!(run(&mut inside, p, Some(170)), (Some(170), true));
        inside.taken(p + ms_(170));
        assert_eq!(inside.way(), Way::Fixed);
        assert!(inside.record()["why"].as_str().unwrap().contains("inside B"));
    }

    #[test]
    fn b_reads_every_ping_so_one_slow_early_still_extends() {
        let p = Instant::now();
        let pings = [
            sent(p, 30, Some(1)),
            sent(p, 56, Some(91)),
            sent(p, 172, Some(1)),
            sent(p, 198, Some(1)),
        ];
        let reader = |now: Instant| read(&pings, now, "no ping answered");
        let mut hold = Hold::extensible(p, ms_(450), reader, "chrome".into());
        assert_eq!(run(&mut hold, p, None), (Some(650), false));
        assert!(
            hold.record()["why"]
                .as_str()
                .unwrap()
                .starts_with("a ping came back in 91 ms")
        );
    }

    #[test]
    fn the_fixed_hold_ends_at_b_whatever_and_another_b_moves_the_extension() {
        let p = Instant::now();
        let slow = |_: Instant| Reading::Slow("s".into());
        let mut fixed = Hold::fixed(p, ms_(450), "the hold's pings are off".into(), Err("x".into()), slow);
        assert_eq!(run(&mut fixed, p, None), (Some(450), false));
        assert_eq!(fixed.record()["way"], "fixed");
        assert_eq!(fixed.record()["why"], "the hold's pings are off");
        assert_eq!(fixed.record()["source"], json!({"identified": false, "why": "x"}));
        // B overridden (measurement only): the extension is to the later of 650 and B
        assert_eq!(
            run(Hold::extensible(p, ms_(300), slow, "c".into()), p, None),
            (Some(650), false)
        );
        assert_eq!(
            run(Hold::extensible(p, ms_(700), slow, "c".into()), p, None),
            (Some(700), false)
        );
        assert_eq!(NOTICE, "the page may have started a drag that did not complete");
    }
}
