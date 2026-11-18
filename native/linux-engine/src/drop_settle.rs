//! An Electron drop's settle before its release (M5, the design session's rulings 827 and 829 on task 98's note,
//! evidence `m5/l4a-fix/`), the rule [`crate::drop_cursor::DropCursor`]'s accept is held to.
//!
//! The accept shown at the release is the application's, not the pointer's (M5, task 98: `linux-engine-v0.4.0` answered
//! ok for a release outside the drop zone on arm64 at twice the load, evidence `m5/arm64/pilot/l4a-rate/`). Chromium's
//! drag loop puts the accept up when it handles a motion, with what the page last answered for an earlier one
//! (`XDragDropClient::ProcessMouseMove`, `WebContentsViewAura::OnDragUpdated`, which answers the operation it holds and
//! only then asks the page), and it acts on the release when it reads it, after every motion queued before it. A loop
//! that runs behind the pointer still shows, at the instant the release is sent, the accept of a place the pointer has
//! left. So the engine asks the application itself where it has got to (`DropCursor::sync`: a `_NET_WM_PING`, which
//! Chromium answers on the thread that runs its drag loop, in the order of its events), twice: once before the last
//! rest, so the loop has handled the pointer's arrival and the page has the rest to answer it (twice when its first
//! answer came late, [`SecondRest`]), and once after the last motion, so the cursor read then is what the loop holds
//! when the release reaches it. An accept counts only when both were answered with the pointer at rest between them
//! ([`settled`]); an application that does not answer in time leaves the drop unconfirmed, never ok, and says so
//! ([`unconfirmed_end`]).

use std::sync::atomic::Ordering;
use std::time::Duration;

use serde_json::{Value, json};

use crate::drop_cursor::Step;

/// How long the application may take to answer a sync (`DropCursor::sync`) and still have its accept count. The lag is
/// the application's own: task 98's cold handles at twice the load on arm64 ran up to about 100 ms behind the pointer
/// (the accept of the zone put up 5 ms after a release the pointer had reached 65 ms earlier), and 150 ms is the bound
/// Chrome's own confirmation has (`dnd::DROP_CONFIRM`). Past it the release goes out anyway and the drop is unconfirmed.
pub const SYNC_BOUND: Duration = Duration::from_millis(150);

/// What the application answered to a sync.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sync {
    /// It answered, this long after it was asked: it has handled every event the server sent it before the question.
    Answered { token: u32, waited: Duration },
    /// No answer inside the bound.
    Unanswered { token: u32 },
    /// It cannot be asked: the watch has no window of its, the window lists no `_NET_WM_PING`, or the send failed.
    Unasked,
}

impl Sync {
    pub fn token(self) -> Option<u32> {
        match self {
            Sync::Answered { token, .. } => Some(token),
            Sync::Unanswered { .. } | Sync::Unasked => None,
        }
    }

    /// The `--stats` record.
    pub fn record(self) -> Value {
        match self {
            Sync::Answered { waited, .. } => json!({ "answered": true, "ms": waited.as_secs_f64() * 1000.0 }),
            Sync::Unanswered { .. } => json!({ "answered": false }),
            Sync::Unasked => json!({ "asked": false }),
        }
    }
}

/// Whether the application's cursor at the release is its answer for where the pointer rests: `steps` what the watch
/// read, in the server's order; `before` the sync asked before the release's last rest, `after` the one asked after its
/// last motion. Both must have been answered, in that order; the pointer must have been at one place from the first
/// answer on, and visited again there before the second, on a route that moves the real pointer (`placed`: XTEST, whose
/// motions the watch reads): every motion after the first answer placed, and at the same place, at least one of them,
/// and none after the second answer. A person's motion, or one that cannot be placed, is not that. Then the application
/// had handled the pointer's arrival before the rest, the page had the rest to answer it, and the cursor shown after the
/// second answer is what the drag loop holds for that place when the release reaches it. On the background route the
/// drag's motions are synthetic and the watch reads none of them, so the two answers alone decide.
pub fn settled(steps: &[Step], before: Sync, after: Sync, placed: bool) -> bool {
    let (Some(before), Some(after)) = (before.token(), after.token()) else {
        return false;
    };
    let at = |token: u32| steps.iter().position(|&step| step == Step::Answer(token));
    let (Some(first), Some(second)) = (at(before), at(after)) else {
        return false;
    };
    if second <= first {
        return false;
    }
    if !placed {
        return true;
    }
    let mut rest = None;
    for (k, step) in steps.iter().enumerate().skip(first) {
        let Step::Motion(place) = *step else {
            continue;
        };
        let (Some(place), true) = (place, k < second) else {
            return false;
        };
        if *rest.get_or_insert(place) != place {
            return false;
        }
    }
    rest.is_some()
}

/// How long the settle's whole wait before its second sync may run, from the first ping, for a second rest to be taken
/// (ruling 3a; the design session's 827 and 829): the first sync's wait and both rests inside it. With Electron's 30 ms
/// rest a second rest is taken for a first sync that waited 31 to 90 ms. Moving the cutoff on the first sync's wait
/// moves this constant: a cutoff of 120 ms is 180 here.
pub const SETTLE_WITHIN: Duration = SYNC_BOUND;

/// Whether the end rested twice before its second sync (ruling 3a). A first sync that waited past the rest says the
/// application's drag loop ran behind the pointer, and its page, on the same loaded renderer, may answer the pointer's
/// last place later than the rest too (task 98's one missed landing in L4a's plain cell: the loop caught up 88 ms after
/// the first ping, and after the 30 ms rest the page had still not answered). So a second rest is taken then, when it
/// fits; it only narrows the settle's residue and never changes what the settle answers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecondRest {
    /// The first sync was answered inside the rest, or the application could not be asked, or the family has no rest.
    Needless,
    /// Taken: the first sync waited past the rest, and both rests ended inside [`SETTLE_WITHIN`].
    Taken,
    /// Needed but skipped, since the rests would end past [`SETTLE_WITHIN`] (a first sync that got no answer reached
    /// the bound already): the drop is judged as the settle alone judges it.
    Skipped,
}

impl SecondRest {
    /// How long the end rests after its first sync.
    pub fn rests(self, rest: Duration) -> Duration {
        match self {
            SecondRest::Taken => rest * 2,
            SecondRest::Needless | SecondRest::Skipped => rest,
        }
    }

    fn name(self) -> &'static str {
        match self {
            SecondRest::Needless => "needless",
            SecondRest::Taken => "taken",
            SecondRest::Skipped => "skipped",
        }
    }
}

/// Whether the end rests a second time after the first sync `before`, its family resting `rest` (ruling 3a).
pub fn second_rest(before: Sync, rest: Duration) -> SecondRest {
    let waited = match before {
        _ if rest.is_zero() => return SecondRest::Needless,
        Sync::Answered { waited, .. } => waited,
        Sync::Unanswered { .. } => SYNC_BOUND,
        Sync::Unasked => return SecondRest::Needless,
    };
    match waited {
        waited if waited <= rest => SecondRest::Needless,
        waited if waited + rest * 2 <= SETTLE_WITHIN => SecondRest::Taken,
        _ => SecondRest::Skipped,
    }
}

/// An Electron drop's settle before its release: the application's answer to the sync before the last rest, whether
/// it rested twice, and its answer to the sync after the last motion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Settle {
    pub before: Sync,
    pub second_rest: SecondRest,
    pub after: Sync,
}

impl Settle {
    /// Whether the application answered both syncs inside the bound. When it did not, an unconfirmed drop says so.
    pub fn answered(&self) -> bool {
        matches!(
            (self.before, self.after),
            (Sync::Answered { .. }, Sync::Answered { .. })
        )
    }

    /// Whether the cursor at the release is the application's answer for where the pointer rests ([`settled`]).
    pub fn settled(&self, steps: &[Step], placed: bool) -> bool {
        settled(steps, self.before, self.after, placed)
    }

    /// The `--stats` record, beside the cursor's (`drop_cursor.settle`).
    pub fn record(&self, steps: &[Step], placed: bool) -> Value {
        json!({
            "before_rest": self.before.record(),
            "second_rest": self.second_rest.name(),
            "after_motion": self.after.record(),
            "settled": self.settled(steps, placed),
        })
    }
}

/// What a drop left pending when nothing confirmed it: with the reason when its settle's application did not answer in
/// time (M5's ruling 827), else the unconfirmed drop as before.
pub fn unconfirmed_end(settle: Option<&Settle>) -> crate::dnd::WatchEnd {
    match settle {
        Some(settle) if !settle.answered() => crate::dnd::WatchEnd::Unanswered,
        _ => crate::dnd::WatchEnd::Unconfirmed,
    }
}

/// The engine's settles over its life, on every `--stats` line (`drop_settles`, ruling 827's condition): how many drags
/// and handles entered the settle, took its second rest, skipped one that did not fit, and ended unsettled. A run whose
/// counts stay at zero never ran the settle's code.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SettleCounts {
    entered: u64,
    second_rest: u64,
    skipped: u64,
    unsettled: u64,
}

impl SettleCounts {
    pub fn count(&mut self, settle: &Settle, settled: bool) {
        self.entered += 1;
        match settle.second_rest {
            SecondRest::Taken => self.second_rest += 1,
            SecondRest::Skipped => self.skipped += 1,
            SecondRest::Needless => {}
        }
        if !settled {
            self.unsettled += 1;
        }
    }

    pub fn record(&self) -> Value {
        json!({
            "entered": self.entered,
            "second_rest": self.second_rest,
            "skipped": self.skipped,
            "unsettled": self.unsettled,
        })
    }
}

/// A sync's token, its own among this engine's syncs ([`token`]).
pub fn next_token() -> u32 {
    use std::sync::atomic::AtomicU32;
    static NEXT: AtomicU32 = AtomicU32::new(0);
    token(std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
}

/// The token of an engine process's `count`-th sync. The answers go to the root, where the window manager reads its
/// own pings' and every watch reads them all, so a token must not be one the window manager is waiting for, nor
/// another engine's. Its top bit is set: Openbox numbers its pings from 1 (`openbox/ping.c`, `ping_next_id`), and a
/// window manager that sends the server's time (mutter, KWin, xfwm4) reaches that half of the range only on a server up
/// for more than 24 days, and then matches one token in 2^31 by chance. Below it the process id's low 15 bits, then
/// the count's low 16. Were a token ever a window manager's, the worst it reads is that an application which has just
/// answered a ping is alive.
pub fn token(pid: u32, count: u32) -> u32 {
    0x8000_0000 | (pid & 0x7fff) << 16 | (count & 0xffff)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A cursor change's serial: the accept the drag loop put up.
    const ACCEPTED: u32 = 7;

    const BEFORE: Sync = Sync::Answered {
        token: 41,
        waited: Duration::from_millis(1),
    };
    const AFTER: Sync = Sync::Answered {
        token: 42,
        waited: Duration::from_millis(1),
    };

    #[test]
    fn an_accept_counts_only_when_the_application_answered_before_the_rest_and_after_the_last_motion() {
        use Step::{Answer, Cursor, Motion};
        // a handle's end: the arrival, the first answer, the rest, the revisit (its status the accept), the second
        let rest = [
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
        ];
        assert!(settled(&rest, BEFORE, AFTER, true));
        // task 98's false ok: the accept of the zone on display, the application not yet at the pointer's last motion
        let behind = [
            Motion(Some((640, 128))),
            Cursor(ACCEPTED),
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
        ];
        assert!(
            !settled(&behind, BEFORE, Sync::Unanswered { token: 42 }, true),
            "no answer after the last motion"
        );
        assert!(
            !settled(&behind, BEFORE, AFTER, true),
            "an answer the watch never read is none"
        );
        // no answer before the rest: the application may have handled the arrival and the revisit as one motion,
        // with nothing from the page between
        let late = [Motion(Some((500, 128))), Motion(Some((500, 128))), Answer(42)];
        assert!(!settled(&late, Sync::Unanswered { token: 41 }, AFTER, true));
        assert!(
            !settled(&late, Sync::Unasked, AFTER, true),
            "an application that cannot be asked"
        );
        assert!(!settled(&rest, BEFORE, Sync::Unasked, true));
        // the answers in the wrong order, or one answer given for both
        assert!(!settled(&rest, AFTER, BEFORE, true));
        assert!(!settled(&rest, BEFORE, BEFORE, true));
    }

    #[test]
    fn the_pointer_must_rest_at_one_place_between_the_answers_and_be_visited_again_there() {
        use Step::{Answer, Cursor, Motion};
        // the pointer still on its way after the first answer: the page has not had the rest for where it ends
        let moving = [
            Answer(41),
            Motion(Some((516, 128))),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
        ];
        assert!(!settled(&moving, BEFORE, AFTER, true));
        // a person's mouse during the rest: a motion with no place
        let person = [Answer(41), Motion(None), Motion(Some((500, 128))), Answer(42)];
        assert!(!settled(&person, BEFORE, AFTER, true));
        // a motion after the second answer: the cursor read may not be the application's answer to it
        let after = [
            Answer(41),
            Motion(Some((500, 128))),
            Answer(42),
            Motion(Some((500, 128))),
        ];
        assert!(!settled(&after, BEFORE, AFTER, true));
        // no revisit between the answers: no status the page's answer could have changed
        assert!(!settled(
            &[Motion(Some((500, 128))), Answer(41), Answer(42)],
            BEFORE,
            AFTER,
            true
        ));
        // cursor changes anywhere do not unsettle it
        let changes = [
            Answer(41),
            Cursor(9),
            Motion(Some((500, 128))),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
            Cursor(9),
        ];
        assert!(settled(&changes, BEFORE, AFTER, true));
    }

    const REST: Duration = Duration::from_millis(30);

    fn answered(ms: u64) -> Sync {
        Sync::Answered {
            token: 41,
            waited: Duration::from_millis(ms),
        }
    }

    #[test]
    fn a_second_rest_is_taken_only_when_the_first_sync_ran_past_the_rest_and_it_fits_inside_the_bound() {
        // ruling 3a, the design session's 829: the whole wait runs from the first ping, both rests inside the bound
        assert_eq!(SETTLE_WITHIN, SYNC_BOUND, "the bound is the sync's own");
        // a first sync inside the rest: the page has had the rest after the loop caught up
        assert_eq!(second_rest(answered(1), REST), SecondRest::Needless);
        assert_eq!(
            second_rest(answered(30), REST),
            SecondRest::Needless,
            "at the rest itself"
        );
        // one past it: the loop was behind, and the page may be too
        assert_eq!(second_rest(answered(31), REST), SecondRest::Taken);
        assert_eq!(
            second_rest(answered(90), REST),
            SecondRest::Taken,
            "90 + 30 + 30 ends at the bound itself"
        );
        // one where the second rest would end past the bound: skipped, never cut short
        assert_eq!(second_rest(answered(91), REST), SecondRest::Skipped);
        assert_eq!(second_rest(answered(149), REST), SecondRest::Skipped);
        // no answer: the wait already reached the bound; an application that cannot be asked has nothing to rest for
        assert_eq!(second_rest(Sync::Unanswered { token: 41 }, REST), SecondRest::Skipped);
        assert_eq!(second_rest(Sync::Unasked, REST), SecondRest::Needless);
        // a family with no rest takes none
        assert_eq!(second_rest(answered(40), Duration::ZERO), SecondRest::Needless);
        // the rest the end sleeps after its first sync
        assert_eq!(SecondRest::Needless.rests(REST), REST);
        assert_eq!(SecondRest::Skipped.rests(REST), REST);
        assert_eq!(SecondRest::Taken.rests(REST), REST * 2);
    }

    #[test]
    fn a_skipped_second_rest_answers_exactly_as_the_settle_alone_would() {
        use Step::{Answer, Cursor, Motion};
        let steps = [
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
        ];
        let before = answered(120);
        for second_rest in [SecondRest::Skipped, SecondRest::Needless, SecondRest::Taken] {
            let settle = Settle {
                before,
                second_rest,
                after: AFTER,
            };
            assert_eq!(
                settle.settled(&steps, true),
                settled(&steps, before, AFTER, true),
                "{second_rest:?}"
            );
            assert!(settle.settled(&steps, true));
            assert!(settle.answered(), "both answered: a skip is no reason of its own");
        }
        let unsettled = [Motion(Some((500, 128))), Answer(41), Answer(42)];
        let skipped = Settle {
            before,
            second_rest: SecondRest::Skipped,
            after: AFTER,
        };
        assert_eq!(
            skipped.settled(&unsettled, true),
            settled(&unsettled, before, AFTER, true)
        );
    }

    #[test]
    fn the_settle_s_reason_is_an_application_that_did_not_answer_both_syncs() {
        let settle = |before, after| Settle {
            before,
            second_rest: SecondRest::Needless,
            after,
        };
        assert!(settle(BEFORE, AFTER).answered());
        assert!(!settle(Sync::Unanswered { token: 41 }, AFTER).answered());
        assert!(!settle(BEFORE, Sync::Unanswered { token: 42 }).answered());
        assert!(!settle(Sync::Unasked, Sync::Unasked).answered());
        // the end it leaves pending when the drop goes unconfirmed: the reason only when the application did not answer
        assert_eq!(
            unconfirmed_end(Some(&settle(BEFORE, Sync::Unanswered { token: 42 }))),
            crate::dnd::WatchEnd::Unanswered
        );
        assert_eq!(
            unconfirmed_end(Some(&settle(Sync::Unasked, Sync::Unasked))),
            crate::dnd::WatchEnd::Unanswered
        );
        assert_eq!(
            unconfirmed_end(Some(&settle(BEFORE, AFTER))),
            crate::dnd::WatchEnd::Unconfirmed
        );
        assert_eq!(unconfirmed_end(None), crate::dnd::WatchEnd::Unconfirmed);
    }

    #[test]
    fn the_settle_s_record_and_the_engine_s_counts_say_whether_the_branch_ran() {
        use Step::{Answer, Motion};
        let steps = [
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
            Answer(42),
        ];
        let taken = Settle {
            before: answered(40),
            second_rest: SecondRest::Taken,
            after: AFTER,
        };
        assert_eq!(
            taken.record(&steps, true),
            json!({
                "before_rest": { "answered": true, "ms": 40.0 },
                "second_rest": "taken",
                "after_motion": { "answered": true, "ms": 1.0 },
                "settled": true,
            })
        );
        let mut counts = SettleCounts::default();
        assert_eq!(
            counts.record(),
            json!({ "entered": 0, "second_rest": 0, "skipped": 0, "unsettled": 0 }),
            "a run whose drags never entered the branch says so"
        );
        counts.count(&taken, true);
        let skipped = Settle {
            before: answered(100),
            second_rest: SecondRest::Skipped,
            after: Sync::Unanswered { token: 42 },
        };
        assert_eq!(skipped.record(&steps, true)["second_rest"], json!("skipped"));
        assert_eq!(skipped.record(&steps, true)["settled"], json!(false));
        counts.count(&skipped, skipped.settled(&steps, true));
        counts.count(
            &Settle {
                before: BEFORE,
                second_rest: SecondRest::Needless,
                after: AFTER,
            },
            true,
        );
        assert_eq!(
            counts.record(),
            json!({ "entered": 3, "second_rest": 1, "skipped": 1, "unsettled": 1 })
        );
    }

    #[test]
    fn a_sync_s_token_is_never_a_small_number_a_window_manager_counts_its_pings_by() {
        // Openbox numbers its pings from 1; the engine's tokens keep to the top half of the range, whatever the
        // process id and however many syncs came before
        for (pid, count) in [(0, 0), (1, 1), (0x8000, 0), (0xffff_ffff, 0xffff_ffff), (65536, 70000)] {
            assert!(token(pid, count) >= 0x8000_0000, "{pid} {count}");
        }
        assert_ne!(token(7, 1), token(7, 2), "each sync its own");
        assert_ne!(token(7, 1), token(8, 1), "each engine its own");
    }

    #[test]
    fn on_the_background_route_the_two_answers_alone_decide() {
        use Step::{Answer, Motion};
        // the drag's motions are synthetic there, and the watch reads none of them
        assert!(settled(&[Answer(41), Answer(42)], BEFORE, AFTER, false));
        assert!(settled(&[Answer(41), Motion(None), Answer(42)], BEFORE, AFTER, false));
        assert!(!settled(&[Answer(42), Answer(41)], BEFORE, AFTER, false));
        assert!(!settled(&[Answer(41)], BEFORE, AFTER, false));
    }
}
