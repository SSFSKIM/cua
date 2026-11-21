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
//! rest of the floor ([`Schedule::InFloor`], ruling 1001): its visits 16 and 8 ms before the floor's end, the release at
//! the end as the floor alone releases it. A visit that no longer fits is dropped; the release never moves. The 326 ms
//! boundary only schedules: the gate judges the path against the 350 ms floor, so a path whose last step comes between
//! the two keeps the gate shut and its tail inside the floor.
//!
//! The motion is one synthetic motion on the background route (SendEvent, never XTEST). On XTEST's routes a motion to
//! the pointer's own place produces no event (M4's T9), so each visit steps 1 px forward along the path's last segment
//! and back to its end ([`xtest_step`]).
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

/// When the `done`-th of the `left` steps a drag still had at its take (`taken`) is due on the floor, and when the gate
/// judges it against: the steps spread over `steps_floor` ([`steps_floor`]), and judged against the whole floor
/// `after_take` (ruling 1001): the tail's earlier boundary schedules steps, and is no evidence that a path outlasted the
/// 350 ms floor.
pub fn floor_dues(
    taken: Instant,
    steps_floor: Duration,
    after_take: Duration,
    done: usize,
    left: usize,
) -> (Instant, Instant) {
    (
        crate::dnd::step_due(taken, steps_floor, done, left),
        crate::dnd::step_due(taken, after_take, done, left),
    )
}

/// The wait after a sample on a drag's floor after a take: its own pacing's `paced`, or what is left of the floor's
/// spacing to `floor_due` at `now` when that is longer, no step longer than [`crate::dnd::KEEPALIVE`]. Answers the wait
/// and whether the floor spaced it out (its spacing longer than the pacing): a sample sent at or past its floor's due,
/// as on a path that outlasts the floor, is never spaced.
pub fn floor_spaces(paced: Duration, floor_due: Instant, now: Instant) -> (Duration, bool) {
    let spaced = floor_due.saturating_duration_since(now).min(crate::dnd::KEEPALIVE);
    (paced.max(spaced), spaced > paced)
}

/// When the tail's visits and the release come (ruling 1001).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Schedule {
    /// After a path that outlasted the floor (the gate open), or a drop with no floor: [`TAIL_REST`] before each visit
    /// and before the release, from the tail's start, as the measured form has it.
    AfterPath,
    /// Inside the floor (the gate shut): the release at the floor's end, this instant, as the floor alone releases it,
    /// the visits [`TAIL_REST`] apart before it. A visit whose time has passed when the tail reaches it is dropped, and
    /// the release never moves.
    InFloor(Instant),
}

impl Schedule {
    /// The schedule of a drop whose gate is `open`, its floor ending at `floor_end` (None: no floor ran).
    pub fn of(open: bool, floor_end: Option<Instant>) -> Schedule {
        match (open, floor_end) {
            (false, Some(end)) => Schedule::InFloor(end),
            _ => Schedule::AfterPath,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Schedule::AfterPath => "after_path",
            Schedule::InFloor(_) => "in_floor",
        }
    }
}

/// Where an XTEST route's visit steps to before it returns to the path's end (ruling 1001): an XTEST motion to where
/// the pointer already is generates no event (M4's T9), so each visit is a real motion 1 px forward along the path's
/// last segment, then one back to the end. `path` is the path's samples, its end last; the last segment's direction is
/// taken from the nearest earlier sample that differs from the end, so a repeated end still has one. Forward, the point
/// is on the side of the end the path was moving toward: a border the last segment crossed stays behind it, so an end
/// entered on the last sample is not left, and one left on it is not re-entered. It can lie across a border only when
/// the end is within 1 px of a border the path did not cross, which ruling 961's 3 px margin judges ambiguous already.
/// A step off the screen (`screen`, its width and height), which the server would clamp back onto the end, goes back
/// along the segment instead; a path that never moved steps 1 px in x.
pub fn xtest_step(path: &[(i16, i16)], screen: (u16, u16)) -> (i16, i16) {
    let end = *path.last().expect("a path has samples");
    let (dx, dy) = path
        .iter()
        .rev()
        .find(|&&p| p != end)
        .map_or((1, 0), |&(px, py)| ((end.0 - px).signum(), (end.1 - py).signum()));
    let on_screen = |(px, py): (i16, i16)| {
        px >= 0 && py >= 0 && i32::from(px) < i32::from(screen.0) && i32::from(py) < i32::from(screen.1)
    };
    let forward = (end.0.saturating_add(dx), end.1.saturating_add(dy));
    match on_screen(forward) {
        true => forward,
        false => (end.0.saturating_sub(dx), end.1.saturating_sub(dy)),
    }
}

/// What the step before the release did (`--stats` `release_sync`).
#[derive(Debug, Clone, PartialEq)]
pub struct Synced {
    pub form: Form,
    /// When its visits and the release came.
    pub schedule: Schedule,
    /// The motions it sent.
    pub motions: u32,
    /// The visits it dropped, their time passed before it reached them (inside the floor only).
    pub visits_dropped: u32,
    /// How long the step took, from its start to the release.
    pub added: Duration,
    /// How long after the floor's end it released (None: no floor ran): about 0 inside the floor, the tail's span past
    /// the path's end when the path outlasted it.
    pub past_floor: Option<Duration>,
}

impl Synced {
    pub fn record(&self, when: When) -> Value {
        json!({
            "form": self.form.name(),
            "when": when.name(),
            "schedule": self.schedule.name(),
            "motions": self.motions,
            "visits_dropped": self.visits_dropped,
            "skipped": self.visits_dropped == TAIL_VISITS,
            "added_ms": self.added.as_secs_f64() * 1000.0,
            "past_floor_ms": self.past_floor.map(|d| d.as_secs_f64() * 1000.0),
        })
    }
}

/// The step before the release of a Chrome drop the engine lets drop, by `form`, on `schedule`: [`TAIL_VISITS`] visits
/// to the path's end `last`, then the release. `place` sends a motion. On XTEST's routes `step` is where each visit
/// steps to first ([`xtest_step`]); on the background route (None) a visit is one synthetic motion to the end, which
/// SendEvent delivers wherever the pointer is. `floor_end` is the floor's end after the take, for the record (None: no
/// floor ran). A motion that fails ends it with its error, as the floor's do. None for [`Form::Off`].
pub fn before_release(
    form: Form,
    step: Option<(i16, i16)>,
    last: (i16, i16),
    schedule: Schedule,
    floor_end: Option<Instant>,
    mut place: impl FnMut((i16, i16)) -> Result<()>,
) -> Result<Option<Synced>> {
    let started = Instant::now();
    let until = |at: Instant| std::thread::sleep(at.saturating_duration_since(Instant::now()));
    let mut motions = 0;
    let mut visits_dropped = 0;
    let mut visit = |motions: &mut u32| -> Result<()> {
        if let Some(step) = step {
            place(step)?;
            *motions += 1;
        }
        place(last)?;
        *motions += 1;
        Ok(())
    };
    match (form, schedule) {
        (Form::Off, _) => return Ok(None),
        (Form::Tail, Schedule::AfterPath) => {
            for _ in 0..TAIL_VISITS {
                std::thread::sleep(TAIL_REST);
                visit(&mut motions)?;
            }
            std::thread::sleep(TAIL_REST);
        }
        (Form::Tail, Schedule::InFloor(release_at)) => {
            for k in 0..TAIL_VISITS {
                let due = release_at
                    .checked_sub(TAIL_REST.saturating_mul(TAIL_VISITS - k))
                    .unwrap_or(started);
                if Instant::now() > due {
                    visits_dropped += 1;
                    continue;
                }
                until(due);
                visit(&mut motions)?;
            }
            until(release_at);
        }
    }
    let released = Instant::now();
    Ok(Some(Synced {
        form,
        schedule,
        motions,
        visits_dropped,
        added: released - started,
        past_floor: floor_end.map(|end| released.saturating_duration_since(end)),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every motion the step sent, with when it went.
    type Sent = Vec<((i16, i16), Instant)>;

    /// The step run against a recorder after a path, its visits on the background route (`step` None) or XTEST's:
    /// what it sent, and when it returned.
    fn run(form: Form, step: Option<(i16, i16)>) -> (Option<Synced>, Sent, Instant) {
        run_on(form, step, Schedule::AfterPath, None)
    }

    /// [`run`] on `schedule`, the floor ending at `floor_end`.
    fn run_on(
        form: Form,
        step: Option<(i16, i16)>,
        schedule: Schedule,
        floor_end: Option<Instant>,
    ) -> (Option<Synced>, Sent, Instant) {
        let log = std::cell::RefCell::new(Vec::new());
        let synced = before_release(form, step, (10, 10), schedule, floor_end, |p| {
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
        let (synced, log, _) = run(Form::Off, None);
        assert_eq!(synced, None);
        assert!(log.is_empty());
        assert!(started.elapsed() < Duration::from_millis(2));
    }

    #[test]
    fn tail_rests_then_revisits_the_last_point_twice_a_rest_apart_and_rests_again_before_the_release() {
        assert_eq!((TAIL_REST, TAIL_VISITS), (Duration::from_millis(8), 2));
        let started = Instant::now();
        let (synced, log, ended) = run(Form::Tail, None);
        assert_eq!(
            log.iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(10, 10), (10, 10)]
        );
        // a rest before each motion and one before the release, none short
        assert!(log[0].1 - started >= TAIL_REST, "{:?}", log[0].1 - started);
        assert!(log[1].1 - log[0].1 >= TAIL_REST, "{:?}", log[1].1 - log[0].1);
        assert!(ended - log[1].1 >= TAIL_REST, "{:?}", ended - log[1].1);
        let synced = synced.expect("a record");
        assert_eq!((synced.motions, synced.visits_dropped), (2, 0));
        assert!(synced.added >= 3 * TAIL_REST && synced.added < 3 * TAIL_REST + Duration::from_millis(10));
        assert_eq!(
            synced.record(When::Outlasted),
            json!({"form": "tail", "when": "outlasted", "schedule": "after_path", "motions": 2, "visits_dropped": 0,
                   "skipped": false, "added_ms": synced.added.as_secs_f64() * 1000.0, "past_floor_ms": null})
        );
        // on XTEST each visit is a real motion: a step, then back to the end
        let (synced, log, _) = run(Form::Tail, Some((11, 10)));
        assert_eq!(
            log.iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(11, 10), (10, 10), (11, 10), (10, 10)]
        );
        assert_eq!(synced.unwrap().motions, 4);
    }

    /// Ruling 1001 (3): an XTEST motion to where the pointer already is generates no event, so each visit steps 1 px
    /// forward along the last segment and back. Every motion of a visit is to a place the pointer is not at.
    #[test]
    fn an_xtest_visit_steps_forward_along_the_last_segment_so_every_motion_moves_the_pointer() {
        let screen = (640, 480);
        // forward along the last segment, in each direction
        assert_eq!(xtest_step(&[(5, 5), (9, 10), (10, 10)], screen), (11, 10));
        assert_eq!(xtest_step(&[(20, 20), (10, 10)], screen), (9, 9));
        assert_eq!(xtest_step(&[(10, 30), (10, 29)], screen), (10, 28));
        // a repeated end (the path's last two samples one point): the direction from the nearest sample that differs,
        // never the end itself
        assert_eq!(xtest_step(&[(4, 10), (9, 10), (10, 10), (10, 10)], screen), (11, 10));
        assert_ne!(xtest_step(&[(10, 10), (10, 10)], screen), (10, 10));
        // an end entered on the last sample: the zone from x = 560 on, the path crossing into it on its last step; the
        // step stays inside it, so no point outside the zone is shown after the path's end
        let entered = [(557, 300), (558, 300), (559, 300), (560, 300)];
        assert_eq!(xtest_step(&entered, screen), (561, 300));
        assert!(xtest_step(&entered, screen).0 >= 560);
        // and an end left on the last sample stays outside: the step goes further out, not back into the zone
        let left = [(561, 300), (560, 300), (559, 300)];
        assert!(xtest_step(&left, screen).0 < 559);
        // a step off the screen, which the server would clamp onto the end, goes back along the segment
        assert_eq!(xtest_step(&[(637, 5), (638, 5), (639, 5)], screen), (638, 5));
        assert_eq!(xtest_step(&[(1, 0), (0, 0)], screen), (1, 0));
    }

    /// Ruling 1000: with the tail, the floor's steps and keepalives end its span early; with no tail, they fill the
    /// whole floor, as 0.4.2's.
    #[test]
    fn with_the_tail_the_floor_s_steps_end_its_span_early() {
        let ms = Duration::from_millis;
        assert_eq!(TAIL_SPAN, ms(24));
        assert_eq!(steps_floor(Form::Tail, crate::dnd::RELEASE_AFTER_TAKE), ms(326));
        assert_eq!(steps_floor(Form::Off, crate::dnd::RELEASE_AFTER_TAKE), ms(350));
        assert_eq!(steps_floor(Form::Tail, ms(10)), Duration::ZERO);
    }

    /// Rulings 1000 and 1001 (1): a drop whose gate stays shut releases at its floor's end, as the floor alone
    /// releases it: the floor's keepalives fill to [`steps_floor`], the tail's visits come 16 and 8 ms before the end,
    /// and the button goes up at the end. With no tail the keepalives fill the whole floor and release at its end. The
    /// two releases are pinned to the floor's end and to each other.
    #[test]
    fn the_tail_inside_the_floor_leaves_the_release_time_unchanged() {
        let ms = Duration::from_millis;
        let after_take = ms(70);
        let release = |form: Form| {
            let taken = Instant::now();
            let floor_end = taken + after_take;
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
            let synced = before_release(
                form,
                None,
                (10, 10),
                Schedule::of(false, Some(floor_end)),
                Some(floor_end),
                |p| {
                    motions.push((p, Instant::now()));
                    Ok(())
                },
            )
            .unwrap();
            let released = Instant::now();
            (released - floor_end, keepalives, synced, motions, floor_end)
        };
        let (off, off_keepalives, synced, _, _) = release(Form::Off);
        assert_eq!(synced, None);
        assert!(off_keepalives > 0);
        let (tail, keepalives, synced, motions, floor_end) = release(Form::Tail);
        // both at the floor's end, within a wakeup's lateness, and within one of each other
        for late in [off, tail] {
            assert!(late < ms(1), "released {late:?} past the floor's end");
        }
        assert!(tail.abs_diff(off) < ms(1), "the tail {tail:?} against off {off:?}");
        assert!(keepalives > 0, "the keepalives still fill the floor up to the tail");
        let synced = synced.expect("the tail ran");
        assert_eq!(
            (synced.schedule, synced.motions, synced.visits_dropped),
            (Schedule::InFloor(floor_end), 2, 0)
        );
        assert!(synced.past_floor.unwrap() < ms(1), "{synced:?}");
        // the tail's two visits at the last point, 16 and 8 ms before the floor's end, after the floor's last pair
        let tail_motions = &motions[motions.len() - 2..];
        assert_eq!(
            tail_motions.iter().map(|(p, _)| *p).collect::<Vec<_>>(),
            vec![(10, 10), (10, 10)]
        );
        for ((_, at), before) in tail_motions.iter().zip([ms(16), ms(8)]) {
            let due = floor_end - before;
            assert!(
                *at >= due && *at - due < ms(1),
                "a visit {:?} after its time",
                *at - due
            );
        }
        let last_keepalive = motions[motions.len() - 3].1;
        assert!(
            tail_motions[0].1 - last_keepalive >= TAIL_REST,
            "a rest after the fill: {:?}",
            tail_motions[0].1 - last_keepalive
        );
    }

    /// Ruling 1001 (1): inside the floor, a visit whose time has passed when the tail reaches it is dropped and the
    /// release stays at the floor's end; with no time for either visit the tail is skipped, and the button goes up at
    /// the end, or at once when the end has passed.
    #[test]
    fn inside_the_floor_a_visit_that_does_not_fit_is_dropped_and_the_release_never_moves() {
        let ms = Duration::from_millis;
        // 12 ms left: the first visit's time (16 ms before) has passed, the second's (8 ms before) has not
        let floor_end = Instant::now() + ms(12);
        let (synced, log, ended) = run_on(Form::Tail, None, Schedule::InFloor(floor_end), Some(floor_end));
        let synced = synced.unwrap();
        assert_eq!((synced.motions, synced.visits_dropped), (1, 1));
        assert_eq!(synced.record(When::Outlasted)["skipped"], json!(false));
        assert!(
            log[0].1 >= floor_end - ms(8) && log[0].1 - (floor_end - ms(8)) < ms(1),
            "{log:?}"
        );
        assert!(ended >= floor_end && ended - floor_end < ms(1));
        // 4 ms left: both dropped, the tail skipped, the release at the end
        let floor_end = Instant::now() + ms(4);
        let (synced, log, ended) = run_on(Form::Tail, None, Schedule::InFloor(floor_end), Some(floor_end));
        let synced = synced.unwrap();
        assert!(log.is_empty());
        assert_eq!((synced.motions, synced.visits_dropped), (0, 2));
        assert_eq!(synced.record(When::Outlasted)["skipped"], json!(true));
        assert!(ended >= floor_end && ended - floor_end < ms(1));
        // the end already past: released at once
        let started = Instant::now();
        let floor_end = started - ms(2);
        let (synced, _, ended) = run_on(
            Form::Tail,
            Some((11, 10)),
            Schedule::InFloor(floor_end),
            Some(floor_end),
        );
        assert_eq!(synced.unwrap().visits_dropped, 2);
        assert!(ended - started < ms(1));
    }

    /// Ruling 1001 (2): the tail's 326 ms scheduling boundary is not the gate's: the gate judges the path against the
    /// 350 ms floor. A path whose last sample goes out 338 ms after the take, past 326 and short of 350, is spaced by
    /// the 350 ms floor, so the gate stays shut (no outlasted answer under option (c)), and its tail runs inside the
    /// floor: the first visit's time (334 ms) has passed and is dropped, the second comes at 342, and the release at 350.
    #[test]
    fn a_last_sample_between_the_tail_s_boundary_and_the_floor_keeps_the_gate_shut_and_the_release_at_the_floor() {
        let ms = Duration::from_millis;
        let paced = Duration::from_micros(500);
        let after_take = crate::dnd::RELEASE_AFTER_TAKE;
        let now = Instant::now();
        let taken = now - ms(338);
        // the path's last step: its scheduled due and the one the gate judges it by
        let (schedule_end, floor_end) = floor_dues(taken, steps_floor(Form::Tail, after_take), after_take, 100, 100);
        assert_eq!(schedule_end, taken + ms(326));
        assert_eq!(floor_end, taken + after_take);
        // the schedule's boundary has passed: it spaces nothing
        assert_eq!(floor_spaces(paced, schedule_end, now), (paced, false));
        // the floor's has not: the last step is spaced, and the gate stays shut
        let (_, last_spaced) = floor_spaces(paced, floor_end, now);
        assert!(last_spaced);
        assert!(!gate(When::Outlasted, 0, last_spaced));
        let schedule = Schedule::of(false, Some(floor_end));
        assert_eq!(schedule, Schedule::InFloor(floor_end));
        let (synced, log, ended) = run_on(Form::Tail, None, schedule, Some(floor_end));
        let synced = synced.unwrap();
        assert_eq!((synced.motions, synced.visits_dropped), (1, 1));
        assert!(
            log[0].1 >= taken + ms(342) && log[0].1 - (taken + ms(342)) < ms(1),
            "{log:?}"
        );
        assert!(ended >= floor_end && ended - floor_end < ms(1));
    }

    /// The gate open (or no floor) schedules the tail after the path; shut with a floor, inside it.
    #[test]
    fn the_schedule_follows_the_gate() {
        let end = Instant::now();
        assert_eq!(Schedule::of(true, Some(end)), Schedule::AfterPath);
        assert_eq!(Schedule::of(true, None), Schedule::AfterPath);
        assert_eq!(Schedule::of(false, None), Schedule::AfterPath);
        assert_eq!(Schedule::of(false, Some(end)), Schedule::InFloor(end));
    }

    #[test]
    fn a_motion_that_fails_ends_the_step_with_its_error() {
        for schedule in [
            Schedule::AfterPath,
            Schedule::InFloor(Instant::now() + Duration::from_millis(30)),
        ] {
            let failed = before_release(Form::Tail, None, (10, 10), schedule, None, |_| anyhow::bail!("gone"));
            assert!(failed.is_err(), "{schedule:?}");
        }
    }
}
