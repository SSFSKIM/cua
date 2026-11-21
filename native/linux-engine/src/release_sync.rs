//! #459's fix (linux-engine 0.4.3; #171 M5, the design session's rulings 962, 967, 974, 990, 993 and 995): what a Chrome
//! drop the engine lets drop does just before its release, when its path outlasted the floor.
//!
//! The fault. A drag whose path after the take outlasts the floor (`dnd::RELEASE_AFTER_TAKE`) is released straight after
//! its last motion, with no keepalive, and under load Chrome drops on a stale accept and position, and its activation
//! request confirms the drop: a false ok (task 122's `t14-long` at arm64 twice the load: 10 false oks and 5 drops into
//! the zone of 100, the path ending left of it). Chrome's own source says why (task 126; Chromium `main`, 2026-11-21):
//! - `XDragDropClient::HandleMouseReleased` (`ui/base/x/x11_drag_drop_client.cc`), with a status outstanding, makes the
//!   drop pending (`kPendingDrop`), and `OnXdndStatus` decides a pending drop before it sends the position it queued
//!   meanwhile (`next_position_message_`): the drop goes on the older position's status, one renderer round trip stale
//!   (`WebContentsViewAura::OnDragUpdated` answers it).
//! - `X11WholeScreenMoveLoop::DispatchEvent` (`ui/base/x/x11_whole_screen_move_loop.cc`) coalesces queued core motions
//!   into the first of them, and its release dispatches no motion first.
//! - Chrome is both the drag's source and its target, and `SendXClientEvent` keeps `XdndPosition` and `XdndStatus`
//!   inside the process: no other client can read a status, so the engine cannot wait for the one that answers the
//!   path's end.
//!
//! The form ([`Form::Tail`], ruling 995): the newest vendor build's end of a drag (26.1023.51421, read in
//! `Client::run_full_desktop_command` at 0xe7ea0-0xe7f10 and seen in its X trace, task 130), re-implemented: [`TAIL_REST`],
//! a motion at the path's last point, [`TAIL_REST`], the same motion again ([`TAIL_VISITS`] in all), [`TAIL_REST`], then
//! the release. A later motion at the same point refreshes Chrome's status, so whichever status decides the pending
//! drop answers the path's end. At arm64 twice the load it left 0 false oks, 0 stale drops and 0 activations in 100
//! long-left drags, for +25.6 ms p50 (task 130, `m5/p459/tail/`).
//!
//! The tail inside the floor (ruling 1000, on ruling 999): a drop whose gate stays shut, its path spread over the floor
//! to its end or filled with keepalives, still ended on steps far shorter than Chrome's status lag under load (task 130's
//! `t14-floor` `left` at arm64 twice the load: 241 steps spread over 350 ms, 1.45 ms apart, 0 keepalives, a false ok).
//! So with the tail, the floor's steps and keepalives end [`TAIL_SPAN`] early ([`steps_floor`]) and the tail fills the
//! rest of the floor, released at the floor's end ([`before_release`]'s `floor_end`): a release time unchanged, the
//! tail's rests and visits inside it. A path that outlasts that earlier end gets the tail after its last motion, as at
//! the open gate.
//!
//! The motion is one synthetic motion on the background route (SendEvent, never XTEST). On XTEST's routes a motion to
//! the pointer's own place produces no event (M4's T9), so each visit is the floor's pair, the path's second-to-last
//! sample and then its last.
//!
//! The gate ([`gate`], rulings 967, 974 and 993): the step runs only on #459's shape, a drop whose floor after the take
//! sent no keepalive and did not space out the path's last step, the path's steps having outlasted the floor at their
//! own pace, whatever the cell. And when it is open, Chrome's activation request cannot tell a drop the page took from
//! one Chrome completed on its stale status: with [`UNCONFIRM_OUTLASTED`] on (option (c), ruling 995; off as 0.4.3
//! ships, ruling 997) such a drop whose activation is its only confirmation is answered unconfirmed
//! (`handle::Confirming::Outlasted`), never a plain ok.
//!
//! Chrome sources only ([`applies`], ruling 962): Electron's drop is settled before its release already
//! (`drop_settle.rs`), and guarded drags and the release at the accept (measurement only) are left as 0.4.2 has them.
//! `--drag-dnd-release-sync`, `--drag-dnd-release-sync-when` and `--drag-dnd-unconfirm-outlasted` select another form,
//! gate or answer, for measurement only.

use std::time::{Duration, Instant};

use anyhow::Result;
use serde_json::{Value, json};

/// Whether a drop on the gate's shape whose only confirmation is Chrome's activation request is answered unconfirmed
/// (option (c), ruling 995), as the engine ships: off, by the owner's ruling 997 (0.4.3 ships the tail alone). This
/// line is the one switch (`--drag-dnd-unconfirm-outlasted` overrides it, measurement only).
pub const UNCONFIRM_OUTLASTED: bool = false;

/// The tail's rest before each of its visits to the path's last point and before the release (the newest vendor
/// build's `thread::sleep(8 ms)`, three of them).
pub const TAIL_REST: Duration = Duration::from_millis(8);

/// How many times the tail visits the path's last point (the newest vendor build's two `send_event_at_position`).
pub const TAIL_VISITS: u32 = 2;

/// The tail's span: its rests, one before each visit and one before the release. A tail inside the floor takes it out
/// of the floor ([`steps_floor`]).
pub const TAIL_SPAN: Duration = TAIL_REST.saturating_mul(TAIL_VISITS + 1);

/// What a Chrome drop the engine lets drop does before its release, at the gate (`--drag-dnd-release-sync`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Form {
    /// Nothing beyond the floor: 0.4.2's release (measurement only).
    Off,
    /// The newest vendor build's end of a drag, as the engine ships.
    Tail,
}

impl Form {
    pub fn name(self) -> &'static str {
        match self {
            Form::Off => "off",
            Form::Tail => "tail",
        }
    }
}

/// When the gate opens (`--drag-dnd-release-sync-when`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    /// On #459's shape alone, as the engine ships.
    Outlasted,
    /// On every drop the engine lets drop after a take (measurement only).
    Always,
}

impl When {
    pub fn name(self) -> &'static str {
        match self {
            When::Outlasted => "outlasted",
            When::Always => "always",
        }
    }
}

/// Whether a drag whose source is of `family` (`families.rs`) gets the step and the gate's answer: Chrome's alone
/// (ruling 962). Electron's drop already rests, revisits its last point and asks its application twice before its
/// release (`drop_settle.rs`, ruling 827).
pub fn applies(family: &str) -> bool {
    crate::families::confirms_drop(family)
}

/// Whether the gate opens on a drop the engine lets drop after a take (`when`; rulings 967, 974 and 993): always, or
/// with [`When::Outlasted`] only when the floor after the take sent no keepalive and did not space out the path's last
/// step (`keepalives`, `last_spaced`, from [`floor_spaces`]), the path's steps having outlasted the floor at their own
/// pace: #459's shape. A path that outlasts the floor by any margin opens it, since its last step then comes past the
/// floor's end and the floor has nothing left to space it by (993: `t14-floor`'s `left` #24 ran 4.6 ms past it). Once
/// the floor sent a keepalive the gate stays shut: every keepalive is on the path's last two samples, so whatever
/// motion the browser has read last is at most one sample from where the drag ends, and the floor has rested there
/// since. Likewise when the floor spaced out the last step, the pointer rested on the path's last point until the
/// floor's end. A step spaced earlier in the path does not count: under load the floor can space a step early in a path
/// that then outlasts it (11 of 95 long-left drags at arm64 twice the load, task 126).
pub fn gate(when: When, keepalives: u32, last_spaced: bool) -> bool {
    when == When::Always || (keepalives == 0 && !last_spaced)
}

/// How much of the floor after a take (`after_take`) the path's steps and the floor's keepalives fill under `form`: the
/// whole of it with no tail (0.4.2's floor), and with the tail all but its span, which the tail fills before the
/// release at the floor's end (ruling 1000).
pub fn steps_floor(form: Form, after_take: Duration) -> Duration {
    match form {
        Form::Off => after_take,
        Form::Tail => after_take.saturating_sub(TAIL_SPAN),
    }
}

/// The wait after a sample on a drag's floor after a take: its own pacing's `paced`, or what is left of the floor's
/// spacing to `floor_due` at `now` when that is longer, no step longer than [`crate::dnd::KEEPALIVE`]. Answers the wait
/// and whether the floor spaced it out (its spacing longer than the pacing): a sample sent at or past its floor's due,
/// as on a path that outlasts the floor, is never spaced.
pub fn floor_spaces(paced: Duration, floor_due: Instant, now: Instant) -> (Duration, bool) {
    let spaced = floor_due.saturating_duration_since(now).min(crate::dnd::KEEPALIVE);
    (paced.max(spaced), spaced > paced)
}

/// What the step before the release did (`--stats` `release_sync`).
#[derive(Debug, Clone, PartialEq)]
pub struct Synced {
    pub form: Form,
    /// The motions it sent.
    pub motions: u32,
    /// How long the step took, from its start to the release.
    pub added: Duration,
    /// How long after the floor's end it released (None: no floor ran): 0 when it ran inside the floor, its span past
    /// the path's end when the path outlasted it.
    pub past_floor: Option<Duration>,
}

impl Synced {
    pub fn record(&self, when: When) -> Value {
        json!({
            "form": self.form.name(),
            "when": when.name(),
            "motions": self.motions,
            "added_ms": self.added.as_secs_f64() * 1000.0,
            "past_floor_ms": self.past_floor.map(|d| d.as_secs_f64() * 1000.0),
        })
    }
}

/// The step before the release of a Chrome drop the engine lets drop, by `form`: `place` sends a motion; `xtest` is
/// whether the drag's input is XTEST's; `before` and `last` are the path's last two samples; `floor_end` is the floor's
/// end after the take (None: no floor ran). The tail releases at the later of the floor's end and [`TAIL_SPAN`] after it
/// starts, its visits [`TAIL_REST`] and [`TAIL_REST`] before that release: inside the floor, whose steps ended its span
/// early ([`steps_floor`]), the release comes when the floor alone would have released; past a path that outlasted the
/// floor, [`TAIL_SPAN`] after its last motion. No rest is shorter than [`TAIL_REST`], the measured form's: a wait that
/// overran delays what follows it, as the floor's own waits do. A motion that fails ends it with its error, as the
/// floor's do. None for [`Form::Off`].
pub fn before_release(
    form: Form,
    xtest: bool,
    before: (i16, i16),
    last: (i16, i16),
    floor_end: Option<Instant>,
    mut place: impl FnMut((i16, i16)) -> Result<()>,
) -> Result<Option<Synced>> {
    let started = Instant::now();
    let until = |at: Instant| std::thread::sleep(at.saturating_duration_since(Instant::now()));
    let mut motions = 0;
    let release_at = match form {
        Form::Off => return Ok(None),
        Form::Tail => {
            // the later of the floor's end and the tail's whole span from now
            let release_at = floor_end
                .map_or(started, |end| end.max(started))
                .max(started + TAIL_SPAN);
            let mut visited = started;
            for visit in 0..TAIL_VISITS {
                until((release_at - TAIL_REST.saturating_mul(TAIL_VISITS - visit)).max(visited + TAIL_REST));
                if xtest {
                    place(before)?;
                    motions += 1;
                }
                place(last)?;
                motions += 1;
                visited = Instant::now();
            }
            until(release_at.max(visited + TAIL_REST));
            Instant::now()
        }
    };
    Ok(Some(Synced {
        form,
        motions,
        added: release_at - started,
        past_floor: floor_end.map(|end| release_at.saturating_duration_since(end)),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every motion the step sent, with when it went.
    type Sent = Vec<((i16, i16), Instant)>;

    /// The step run against a recorder with no floor (or one already past): what it sent, and when it returned.
    fn run(form: Form, xtest: bool) -> (Option<Synced>, Sent, Instant) {
        run_by(form, xtest, None)
    }

    /// [`run`] with the floor ending at `floor_end`.
    fn run_by(form: Form, xtest: bool, floor_end: Option<Instant>) -> (Option<Synced>, Sent, Instant) {
        let log = std::cell::RefCell::new(Vec::new());
        let synced = before_release(form, xtest, (9, 10), (10, 10), floor_end, |p| {
            log.borrow_mut().push((p, Instant::now()));
            Ok(())
        })
        .unwrap();
        (synced, log.into_inner(), Instant::now())
    }

    #[test]
    fn only_a_chrome_source_s_drop_gets_the_step() {
        assert!(applies("Chrome"));
        // Electron's drop is settled before its release already (`drop_settle.rs`)
        assert!(!applies("Chromium"));
        assert!(!applies("Gecko"));
    }

    #[test]
    fn the_outlasted_gate_opens_only_on_a_path_the_floor_never_slowed_nor_filled() {
        // measurement only: every drop the engine lets drop
        assert!(gate(When::Always, 0, false) && gate(When::Always, 30, false) && gate(When::Always, 0, true));
        // #459's shape: the steps outlasted the floor at their own pace, whatever the floor spaced before the end
        assert!(gate(When::Outlasted, 0, false));
        // a short path whose steps the floor spread out, then filled with keepalives
        assert!(!gate(When::Outlasted, 12, true));
        // the floor's keepalives ran, its last pair just before the release: shut, every keepalive resting on the
        // path's last two samples
        assert!(!gate(When::Outlasted, 1, false));
        // the floor spaced the path's last step and left nothing for a keepalive: shut, the end came slowly
        assert!(!gate(When::Outlasted, 0, true));
    }

    /// Ruling 993: a path whose steps after the take ran a few milliseconds past the floor (arm64's counted L4d,
    /// `t14-floor`'s `left` #24: 354.6 ms after the take, 0 keepalives, a stale drop) opens the gate, through the floor's
    /// own spacing and fill as `drag_along` runs them.
    #[test]
    fn a_path_that_outlasts_the_floor_by_a_few_ms_with_no_keepalive_opens_the_gate() {
        let ms = Duration::from_millis;
        let paced = Duration::from_micros(500);
        let now = Instant::now();
        let taken = now - ms(354) - Duration::from_micros(600);
        let floor_end = crate::dnd::step_due(taken, crate::dnd::RELEASE_AFTER_TAKE, 242, 242);
        // the path's last sample, sent 4.6 ms past the floor's end: its pacing alone after it
        let (wait, last_spaced) = floor_spaces(paced, floor_end, now);
        assert_eq!((wait, last_spaced), (paced, false));
        // and the floor's fill, its due already past, sends nothing
        let mut sent = Vec::new();
        let keepalives = crate::dnd::keepalive(
            |p| {
                sent.push(p);
                Ok(())
            },
            (9, 10),
            (10, 10),
            floor_end,
        )
        .unwrap();
        assert_eq!((keepalives, sent.len()), (0, 0));
        assert!(gate(When::Outlasted, keepalives, last_spaced));
        // a last sample sent 5 ms before the floor's end is spaced to it, and the gate stays shut
        let (wait, last_spaced) = floor_spaces(paced, now + ms(5), now);
        assert_eq!((wait, last_spaced), (ms(5), true));
        assert!(!gate(When::Outlasted, 0, last_spaced));
        // no step waits past the keepalive's spacing, and a pacing longer than the floor's spacing is no spacing
        assert_eq!(floor_spaces(paced, now + ms(200), now), (crate::dnd::KEEPALIVE, true));
        assert_eq!(floor_spaces(ms(20), now + ms(5), now), (ms(20), false));
    }

    #[test]
    fn off_sends_nothing_and_holds_nothing_up() {
        let started = Instant::now();
        let (synced, log, _) = run(Form::Off, false);
        assert_eq!(synced, None);
        assert!(log.is_empty());
        assert!(started.elapsed() < Duration::from_millis(2));
    }

    #[test]
    fn tail_rests_then_revisits_the_last_point_twice_a_rest_apart_and_rests_again_before_the_release() {
        assert_eq!((TAIL_REST, TAIL_VISITS), (Duration::from_millis(8), 2));
        let started = Instant::now();
        let (synced, log, ended) = run(Form::Tail, false);
        assert_eq!(
            log.iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(10, 10), (10, 10)]
        );
        // a rest before each motion and one before the release, none short
        assert!(log[0].1 - started >= TAIL_REST, "{:?}", log[0].1 - started);
        assert!(log[1].1 - log[0].1 >= TAIL_REST, "{:?}", log[1].1 - log[0].1);
        assert!(ended - log[1].1 >= TAIL_REST, "{:?}", ended - log[1].1);
        let synced = synced.expect("a record");
        assert_eq!(synced.motions, 2);
        assert!(synced.added >= 3 * TAIL_REST && synced.added < 3 * TAIL_REST + Duration::from_millis(10));
        assert_eq!(
            synced.record(When::Outlasted),
            json!({"form": "tail", "when": "outlasted", "motions": 2, "added_ms": synced.added.as_secs_f64() * 1000.0,
                   "past_floor_ms": null})
        );
        // on XTEST each visit is the pair, a motion to the pointer's own place being no event there
        let (synced, log, _) = run(Form::Tail, true);
        assert_eq!(
            log.iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(9, 10), (10, 10), (9, 10), (10, 10)]
        );
        assert_eq!(synced.unwrap().motions, 4);
    }

    /// Ruling 1000: with the tail, the floor's steps and keepalives end its span early, and no floor's fill is longer
    /// than the floor; with no tail, they fill the whole floor, as 0.4.2's.
    #[test]
    fn with_the_tail_the_floor_s_steps_end_its_span_early() {
        let ms = Duration::from_millis;
        assert_eq!(TAIL_SPAN, ms(24));
        assert_eq!(steps_floor(Form::Tail, crate::dnd::RELEASE_AFTER_TAKE), ms(326));
        assert_eq!(steps_floor(Form::Off, crate::dnd::RELEASE_AFTER_TAKE), ms(350));
        assert_eq!(steps_floor(Form::Tail, ms(10)), Duration::ZERO);
    }

    /// Ruling 1000: a drop whose gate stays shut releases when its floor alone would have, the tail inside the floor.
    /// The floor's keepalives fill to [`steps_floor`], the tail its last [`TAIL_SPAN`]; with no tail they fill the whole
    /// floor and release at its end. Both releases come at the floor's end.
    #[test]
    fn the_tail_inside_the_floor_leaves_the_release_time_unchanged() {
        let ms = Duration::from_millis;
        let after_take = ms(70);
        let release = |form: Form| {
            let taken = Instant::now();
            let mut motions = Vec::new();
            let keepalives = crate::dnd::keepalive(
                |p| {
                    motions.push((p, Instant::now()));
                    Ok(())
                },
                (9, 10),
                (10, 10),
                taken + steps_floor(form, after_take),
            )
            .unwrap();
            let synced = before_release(form, false, (9, 10), (10, 10), Some(taken + after_take), |p| {
                motions.push((p, Instant::now()));
                Ok(())
            })
            .unwrap();
            let released = Instant::now();
            (released - taken, keepalives, synced, motions, taken)
        };
        let (off, off_keepalives, synced, _, _) = release(Form::Off);
        assert_eq!(synced, None);
        assert!(off_keepalives > 0);
        let (tail, keepalives, synced, motions, taken) = release(Form::Tail);
        // the floor's end, within a scheduler's wakeup, either way
        for at in [off, tail] {
            assert!(
                at >= after_take && at < after_take + ms(4),
                "released {at:?} after the take"
            );
        }
        assert!(keepalives > 0, "the keepalives still fill the floor up to the tail");
        let synced = synced.expect("the tail ran");
        assert_eq!(synced.motions, 2);
        assert!(synced.past_floor.unwrap() < ms(4), "{synced:?}");
        // the tail's two visits at the last point, 16 and 8 ms before the floor's end, after the floor's last pair
        let visits: Vec<Duration> = motions[motions.len() - 2..].iter().map(|(_, at)| *at - taken).collect();
        assert_eq!(
            motions[motions.len() - 2..].iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(10, 10), (10, 10)]
        );
        assert!(
            visits[0] >= after_take - ms(16) && visits[0] < after_take - ms(16) + ms(4),
            "{visits:?}"
        );
        assert!(visits[1] - visits[0] >= TAIL_REST, "{visits:?}");
        assert!(tail - visits[1] >= TAIL_REST, "{tail:?} {visits:?}");
        let last_keepalive = motions[motions.len() - 3].1 - taken;
        assert!(
            visits[0] - last_keepalive >= TAIL_REST,
            "a rest after the fill: {last_keepalive:?} {visits:?}"
        );
    }

    /// A floor that still has more than the tail's span left when the tail starts (a fill cut short) is waited out:
    /// the visits come 16 and 8 ms before its end; and one already past (a path that outlasted it) releases the span
    /// after the tail's start, past the floor by that much.
    #[test]
    fn the_tail_releases_at_the_later_of_the_floor_s_end_and_its_span() {
        let ms = Duration::from_millis;
        let started = Instant::now();
        let (synced, log, ended) = run_by(Form::Tail, false, Some(started + ms(40)));
        let synced = synced.unwrap();
        assert!(
            ended - started >= ms(40) && ended - started < ms(44),
            "{:?}",
            ended - started
        );
        assert!(
            log[0].1 - started >= ms(24) && log[1].1 - log[0].1 >= TAIL_REST,
            "{log:?}"
        );
        assert!(synced.past_floor.unwrap() < ms(4));
        let started = Instant::now();
        let (synced, _, ended) = run_by(Form::Tail, false, Some(started - ms(5)));
        let synced = synced.unwrap();
        assert!(ended - started >= TAIL_SPAN && ended - started < TAIL_SPAN + ms(4));
        let past = synced.past_floor.unwrap();
        assert!(past >= TAIL_SPAN + ms(5) && past < TAIL_SPAN + ms(9), "{past:?}");
    }

    #[test]
    fn a_motion_that_fails_ends_the_step_with_its_error() {
        let failed = before_release(Form::Tail, false, (9, 10), (10, 10), None, |_| anyhow::bail!("gone"));
        assert!(failed.is_err());
    }
}
