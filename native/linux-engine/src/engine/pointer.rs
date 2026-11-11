//! Coordinate clicks, `move`, `move_relative`, `scroll` and `drag` (behaviour §10) on either route: the vendor's
//! arithmetic, its order of placing, pressing the chord and pressing the button, and its holds. `drag_handle` is
//! `handle.rs`'s.

use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use serde_json::{Value, json};
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{ConnectionExt as _, Window};

use super::way::{Way, target_of};
use super::{DesktopMode, Engine};
use crate::desktop::Desktop;
use crate::dnd::{Confirm, DndWatch, EscapeRoute, LateWatch, Outcome, Standing};
use crate::families::DragPacing;
use crate::families::Kind;
use crate::focus_ack::{PressAck, nothing_pressed, press_ack, refused_press};
use crate::input::chord_keycodes;
use crate::route::{Route, Target};
use crate::stray::{StrayWatch, Strays, Watching};
use crate::wire::{ClickInput, DragInput, MouseButton, MoveInput, MoveRelativeInput, ScrollInput, parse_input};
use crate::x11::X11;

/// The click hold when `duration` is absent (behaviour §10.1).
pub(super) const CLICK_HOLD: Duration = Duration::from_millis(12);
/// Each wheel step's hold (behaviour §10.3).
const WHEEL_HOLD: Duration = Duration::from_millis(36);
/// `scroll`'s pixels when absent.
const DEFAULT_PIXELS: u16 = 800;

/// Wheel steps for a pixel count: pixels / 100 rounded half away from zero, at least one (behaviour §10.3).
pub fn scroll_steps(pixels: u16) -> u32 {
    ((pixels as u32 + 50) / 100).max(1)
}

/// Every pointer sample a drag visits after its press (behaviour §10.4): for each consecutive pair a→b,
/// n = max(1, ⌊distance⌋) and the points a + (i·dx/n, i·dy/n) for i = 0…n, integer division truncating toward
/// zero, so the joint between two segments is visited twice.
pub fn drag_samples(points: &[(i16, i16)]) -> Vec<(i16, i16)> {
    let mut samples = Vec::new();
    for pair in points.windows(2) {
        let ((ax, ay), (bx, by)) = (pair[0], pair[1]);
        let (dx, dy) = (bx as i64 - ax as i64, by as i64 - ay as i64);
        let n = ((dx as f64).hypot(dy as f64) as i64).max(1);
        for i in 0..=n {
            samples.push(((ax as i64 + i * dx / n) as i16, (ay as i64 + i * dy / n) as i16));
        }
    }
    samples
}

/// How sharply a path must turn at a joint for a resting drag to rest there (`drag_plan`). A browser takes the pointer
/// once a frame, so a stroke drawn from what it took cuts a corner by up to half a frame's travel times the cosine of
/// half the corner's angle; at a turn below this the cut stays a few pixels even at a fast pace.
const CORNER_TURN_DEG: f64 = 30.0;

/// The samples a drag sends after its press, and where it rests.
#[derive(Debug, PartialEq, Eq)]
pub struct DragPlan {
    pub samples: Vec<(i16, i16)>,
    /// The indices of the samples that go out only after a rest at the point before them.
    pub rests: Vec<usize>,
}

/// A drag's motions (`families.rs` `DragPacing.rest`): the pinned build's samples ([`drag_samples`]) and, for a
/// family that rests, a rest at each joint that turns by [`CORNER_TURN_DEG`] or more ([`corner_at`]), between the
/// joint's first two visits, and a rest at the end, which is then visited once more. A browser takes pointer input
/// once a frame: Chromium and Gecko hand a page one move a frame (the latest), so a corner the pointer passes within a
/// frame is cut, and Chromium's scrollbar takes at most one move a frame and drops the rest, so a thumb stops where the
/// last frame's first move left it and the release, which carries no position for it, does not move it on (`cc/input/
/// scrollbar_controller.cc`, `drag_processed_for_current_frame_`; evidence `m4/drag-motion/`). A rest of a frame at a
/// point puts it in a frame of its own, and the second visit after it reaches a scrollbar that took nothing since.
pub fn drag_plan(points: &[(i16, i16)], rests: bool) -> DragPlan {
    let mut samples = Vec::new();
    let mut at = Vec::new();
    for (j, pair) in points.windows(2).enumerate() {
        if rests && corner_at(points, j) {
            at.push(samples.len());
        }
        samples.extend(drag_samples(pair));
    }
    if rests && let Some(&last) = samples.last() {
        at.push(samples.len());
        samples.push(last);
    }
    DragPlan { samples, rests: at }
}

/// Whether a path turns by [`CORNER_TURN_DEG`] or more at its point `j` on arriving there: the turn between the
/// position it came from and the next one it goes to, a point the path repeats counted once, so a repeat neither
/// hides the corner (each turn around it would have a zero-length side) nor puts a second rest there.
fn corner_at(points: &[(i16, i16)], j: usize) -> bool {
    let at = points[j];
    if j == 0 || points[j - 1] == at {
        return false;
    }
    points[j + 1..]
        .iter()
        .find(|&&p| p != at)
        .is_some_and(|&next| turn_deg(points[j - 1], at, next) >= CORNER_TURN_DEG)
}

/// The turn at `b` between a→b and b→c, in degrees (0 straight on, 180 straight back); a zero-length side has no
/// direction, so no turn.
fn turn_deg(a: (i16, i16), b: (i16, i16), c: (i16, i16)) -> f64 {
    let (ux, uy) = (b.0 as f64 - a.0 as f64, b.1 as f64 - a.1 as f64);
    let (vx, vy) = (c.0 as f64 - b.0 as f64, c.1 as f64 - b.1 as f64);
    let (nu, nv) = (ux.hypot(uy), vx.hypot(vy));
    if nu == 0.0 || nv == 0.0 {
        return 0.0;
    }
    ((ux * vx + uy * vy) / (nu * nv)).clamp(-1.0, 1.0).acos().to_degrees()
}

/// Whether a drag rests before its sample `next` ([`drag_plan`]): where its plan rests, unless it is on its floor after a
/// take (`dnd::RELEASE_AFTER_TAKE`), whose spacing brings the steps to the floor's end and whose keepalives then hold the
/// pointer at the end, so a rest there would only push the release past the floor.
fn rests_before(rests: &[usize], next: usize, floored: bool) -> bool {
    !floored && rests.contains(&next)
}

/// When a drag's next sample is due, the previous one having been due at `due` and sent at `sent`: after a rest
/// (`rest`), the rest after it was sent; by elapsed time ([`DragPacing::elapsed`]), a step after it was due, so a sample
/// sent late does not delay the ones after it; else a step after it was sent.
pub fn next_due(due: Instant, sent: Instant, pacing: &DragPacing, rest: bool) -> Instant {
    if rest {
        sent + pacing.rest
    } else if pacing.elapsed {
        due + pacing.step
    } else {
        sent + pacing.step
    }
}

/// Blink's drag threshold off the Mac (`mouse_event_manager.cc` `kDragThresholdX/Y`): a press starts a drag on a move
/// this far out in x or y.
const DRAG_THRESHOLD_PX: i32 = 4;

/// The most samples the atomic press sends under its server grab, which holds every other client, the window manager
/// included, until it ends. A straight path from the press crosses Blink's threshold by its seventh sample (the
/// diagonal), and a path given in 1 px steps, each joint visited twice, by its eighth. Task 20 measured the grab over
/// 480 Chromium drags whose press sent 5 to 7 samples: p50 0.742 ms, p99 1.688 ms, max 4.078 ms (both routes; the
/// background route's samples each take a few round trips), so eight bound it near what was measured. A path that
/// has not crossed by then goes on with the grab released, and the press watch (`stray.rs`) covers the rest.
pub const PRESS_SAMPLES_MAX: usize = 8;

/// Where a drag's samples first reach Blink's drag threshold from the first: that sample's index, None when none does.
fn threshold_at(samples: &[(i16, i16)]) -> Option<usize> {
    let &(x0, y0) = samples.first()?;
    samples.iter().position(|&(sx, sy)| {
        (sx as i32 - x0 as i32).abs() >= DRAG_THRESHOLD_PX || (sy as i32 - y0 as i32).abs() >= DRAG_THRESHOLD_PX
    })
}

/// How many of a drag's samples its atomic press sends with the press: through the first sample at Blink's drag
/// threshold from the first (every sample when none reaches it), at most [`PRESS_SAMPLES_MAX`].
pub fn press_samples(samples: &[(i16, i16)]) -> usize {
    threshold_at(samples)
        .map_or(samples.len(), |k| k + 1)
        .min(PRESS_SAMPLES_MAX)
}

/// A Chromium-family drag's press (task 20, evidence `m3/drop-misses/task20/`; the design session's rulings of
/// 2026-11-01). Blink resets a press on any mouse move with no button (`stray.rs`), so another client's request that
/// crosses the window, or moves the real pointer, between the press and the first motion past the drag threshold
/// kills the drag. The press and the samples through that motion (at most [`PRESS_SAMPLES_MAX`]) go out under one
/// server grab, no other client's request between them, and the real pointer's place is read inside the same grab; the
/// watch (`stray.rs`) runs from just before the grab to just after the release, for what the grab cannot hold back (a
/// device's own motion, the target's capture grab crossing in from a pointer outside it, a path past the cap).
pub(super) struct ChromiumPress<'a> {
    pub watch: &'a mut StrayWatch,
    pub window: Window,
    pub parent: Window,
    /// The drag goes through XTEST (the foreground and desktop routes), whose pointer's motion is its own.
    pub xtest: bool,
    /// The watch while the drag runs; still set after the drag only when it ended before its release.
    pub watching: Option<Watching>,
    /// What the press did under its grab (None: the drag ended before the grab).
    pub grab: Option<PressGrab>,
    /// What the watch saw, ended at the release (None: the drag ended before it).
    pub strays: Option<Result<Strays>>,
}

/// What an atomic press did under its grab (`--stats` `press`).
#[derive(Debug, Clone, Copy)]
pub(super) struct PressGrab {
    /// How long the server was held.
    pub held: Duration,
    /// How many samples went out under it.
    pub samples: usize,
    /// Whether the real pointer was in the window.
    pub inside: bool,
    /// Whether the last of them reached Blink's drag threshold; when not ([`PRESS_SAMPLES_MAX`]), the rest of the path
    /// up to it went out unprotected, left to the press watch.
    pub crossed: bool,
}

/// The press and the samples through Blink's drag threshold, at most [`PRESS_SAMPLES_MAX`], under one server grab, the
/// real pointer's place read first inside it; answers how many samples went out. The grab is released whatever
/// happened. `pressed_at`: when the button's press went out, before the threshold's samples.
fn atomic_press(
    x: &X11,
    route: &mut Route,
    press: &mut ChromiumPress,
    samples: &[(i16, i16)],
    pressed: &mut bool,
    pressed_at: &mut Option<Instant>,
    pressing: PressAck,
) -> Result<usize> {
    let count = press_samples(samples);
    let started = Instant::now();
    x.conn.grab_server()?;
    let sent = (|| -> Result<bool> {
        let inside = x.pointer_in(press.window, press.parent)?;
        route.press(x, 1, pressing)?;
        *pressed = true;
        *pressed_at = Some(Instant::now());
        for &(sx, sy) in &samples[..count] {
            route.place_again(x, sx, sy)?;
        }
        Ok(inside)
    })();
    let ungrabbed = x
        .conn
        .ungrab_server()
        .map_err(anyhow::Error::from)
        .and_then(|_| Ok(x.conn.flush()?));
    let inside = sent?;
    ungrabbed?;
    press.grab = Some(PressGrab {
        held: started.elapsed(),
        samples: count,
        inside,
        crossed: threshold_at(samples).is_some_and(|k| k < count),
    });
    Ok(count)
}

fn chord(x: &X11, key: Option<&str>) -> Result<Vec<u8>> {
    key.map_or(Ok(Vec::new()), |key| chord_keycodes(x, key))
}

/// Press, hold, release of one button, inside a pressed chord that is released whatever happened; the first error
/// wins (behaviour §10.1). The press spends `pressing`, the acknowledgement taken for it.
fn click_once(
    x: &X11,
    route: &mut Route,
    keycodes: &[u8],
    at: Option<(i16, i16)>,
    button: u8,
    hold: Duration,
    pressing: PressAck,
) -> Result<()> {
    let held = route.acquire(x, keycodes)?;
    let pressed = match at {
        Some((rx, ry)) => route.place_again(x, rx, ry),
        None => Ok(()),
    }
    .and_then(|()| route.press(x, button, pressing));
    if pressed.is_ok() {
        std::thread::sleep(hold);
    }
    let released = pressed.and_then(|()| route.release_button(x, button));
    let keys_released = route.release(x, &held);
    released.and(keys_released)
}

/// A drag stopped because the target began a drag and drop (`dnd.rs`): its answer is the guard's [`Outcome`].
#[derive(Debug)]
pub(super) struct DropCancelled;

impl std::fmt::Display for DropCancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("drag and drop cancelled")
    }
}

impl std::error::Error for DropCancelled {}

/// A shared-mode drag's watch for a drag and drop (`dnd.rs`): the watch, the window's standing when the drag began,
/// whether the Escape is held until after the release (measurement only, `--dnd-cancel-after-release`), and the
/// outcome the order of events gave (None while nothing was decided: the drag's own error, if any, stands).
pub(super) struct DropGuard {
    watch: DndWatch,
    before: Standing,
    late: bool,
    /// Measurement only (`--dnd-defer-take`): a take during the drag is left unseen until after the release, so the
    /// after-release watch is what finds it.
    defer: bool,
    outcome: Option<Outcome>,
}

impl DropGuard {
    /// Whether a take during the drag is acted on before the release.
    fn looks(&self) -> bool {
        !self.late && !self.defer
    }
}

fn escape(x: &X11, route: &mut Route) -> Result<()> {
    let held = route.acquire(x, &chord_keycodes(x, "Escape")?)?;
    route.release(x, &held)
}

/// The cancel of a drag and drop seen before the release: Escape, then the release, so the drop never comes. Until both
/// went out the order cannot tell (`Undecided`); then it was in time.
fn cancel_in_time(x: &X11, route: &mut Route, guard: &mut DropGuard, pressed: &mut bool) -> Result<()> {
    guard.outcome = Some(Outcome::Undecided);
    escape(x, route)?;
    *pressed = false;
    route.release_button(x, 1)?;
    guard.outcome = Some(Outcome::InTime);
    Err(DropCancelled.into())
}

/// What a drag records for `--stats` alone: the press's and the release's wall clock, and what the release at the
/// accept decided (`accept.rs`).
pub(super) struct DragMeasure<'a> {
    pub(super) wall: &'a mut Option<(f64, f64)>,
    pub(super) accept_record: &'a mut Option<Value>,
    /// An Electron drop's cursor watch (`drop_cursor.rs`), read just before the release of a drag whose source took
    /// `XdndSelection`, and what it read there.
    pub(super) drop_cursor: Option<&'a mut crate::drop_cursor::DropCursor>,
    pub(super) at_release: &'a mut Option<crate::drop_cursor::AtRelease>,
}

/// The wall clock in milliseconds since the epoch (`--stats` only: the harness lines a drag up with its own watchers).
pub(super) fn wall_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

/// The drag after the pointer is placed at its first point: the chord, the press, every sample of its plan
/// ([`drag_plan`]), the release. `pacing.step` follows each sample, the last included (where the vendor waits 1 ms,
/// behaviour §10.4), by elapsed time where the family asks ([`next_due`]), `pacing.rest` precedes a corner's or the
/// end's second visit, `pacing.press` follows the press and `pacing.release` precedes the release (`families.rs`). With a guard (always on
/// the background route), `XdndSelection` is looked at after every sample and once more just before the release: a
/// take there stops the drag, Escape is pressed and released, then the button, so the drag and drop is cancelled before
/// anything drops ([`Outcome::InTime`]). After the release it is watched through `SETTLE`: a take then (or, with `late`,
/// measurement only, the take the drag went on past) is answered [`Outcome::Late`], Escape sent to end the drag and drop;
/// none is [`Outcome::NoStart`], an ordinary drag. A stopped drag answers [`DropCancelled`].
/// With `hold`, a drag the engine lets drop into Chromium (its watch and the hold's bound after the press,
/// `dnd::TAKE_HOLD_AFTER_PRESS`): once the target's client is seen taking `XdndSelection`, the release comes no sooner
/// than `after_take` after the take (`dnd::RELEASE_AFTER_TAKE`, task 18). The samples still to send are spaced over that
/// delay, no step shorter than `pacing.step` nor longer than `dnd::KEEPALIVE`, and what they leave of it is filled with
/// keepalive motions on the path's last two samples, ending on the last ([`crate::dnd::keepalive`]): Chrome's target
/// accepts only on a motion (task 22). With no take by the path's end, the button stays down until the bound after the
/// press for one (task 22), a take then, or one seen at that last look, getting the same floor; no take by then
/// releases the drag as before. `scheduled` records a take, `held_for_take` the hold. With `accept` (measurement only,
/// a Chrome drop the engine can confirm, `accept.rs`), the path after a take keeps its own pacing, and the floor's
/// motions end at Chrome's accept cursor when it comes first, the release then at once. With `press` (a
/// Chromium-family drag), the press and the samples through Blink's drag threshold, at most [`PRESS_SAMPLES_MAX`], go
/// out under one server grab ([`atomic_press`]), its watch begun just before the grab and ended just after the
/// release, what it saw kept in `press.strays`. `after`, the drag's after-release watch, is told the instant the
/// button went up and whether a take came before it.
#[allow(clippy::too_many_arguments)]
fn drag_along(
    x: &mut X11,
    route: &mut Route,
    keycodes: &[u8],
    points: &[(i16, i16)],
    pacing: &DragPacing,
    mut guard: Option<&mut DropGuard>,
    mut hold: Option<(&mut DndWatch, Duration)>,
    held_for_take: &mut Option<Value>,
    after_take: Duration,
    scheduled: &mut Option<Value>,
    mut press: Option<&mut ChromiumPress>,
    pressing: PressAck,
    mut accept: Option<&mut crate::accept::CursorWatch>,
    after: Option<&LateWatch>,
    measure: DragMeasure<'_>,
) -> Result<()> {
    let held = route.acquire(x, keycodes)?;
    let mut pressed = false;
    let dragged = (|| -> Result<()> {
        route.place_again(x, points[0].0, points[0].1)?;
        let DragPlan { samples, rests } = drag_plan(points, !pacing.rest.is_zero());
        let count = samples.len();
        // a Chromium-family press: the watch begun, then the press and the samples through the drag threshold under
        // one server grab (no take can come during it: the target's requests wait for the grab's end)
        // when the button's press went out: the hold's bound counts from it
        let mut pressed_at = None;
        let first = match press.as_deref_mut() {
            Some(press) => {
                press.watching = Some(press.watch.begin(press.window, press.xtest)?);
                atomic_press(x, route, press, &samples, &mut pressed, &mut pressed_at, pressing)?
            }
            None => {
                route.press(x, 1, pressing)?;
                pressed = true;
                pressed_at = Some(Instant::now());
                0
            }
        };
        let pressed_at = pressed_at.expect("the button was pressed");
        let press_wall = wall_ms() - pressed_at.elapsed().as_secs_f64() * 1000.0;
        // with the release at the accept, the path after a take keeps its own pacing (task 68's live lane): spread over
        // the floor, the steps would reach the zone, and the accept with them, only near the floor's end
        let spacing = !after_take.is_zero() && accept.is_none();
        std::thread::sleep(pacing.press);
        // the path's last two samples, which a floor after a take re-visits (the path's own: not the end's second
        // visit after its rest, which would make them one point)
        let path = if rests.last() == Some(&(count - 1)) {
            count - 1
        } else {
            count
        };
        let last = samples[path - 1];
        let before_last = path.checked_sub(2).map_or(last, |k| samples[k]);
        // the take, when it was seen, and how many samples were still to send then
        let mut taken: Option<(Instant, usize)> = None;
        let mut since_take = 0;
        // when the sample being sent was due
        let mut due = Instant::now();
        for (i, &(sx, sy)) in samples.iter().enumerate().skip(first) {
            route.place_again(x, sx, sy)?;
            let sent = Instant::now();
            // the cursors read as they come, so each one's image is fetched while it is shown (a read that fails leaves
            // the drag to its floor, `accept_shown`)
            if let Some(cursor) = accept.as_deref_mut() {
                let _ = cursor.poll();
            }
            // when the floor after a take spaces this step to, if it does
            let mut floor = None;
            if let Some((watch, _)) = hold.as_mut() {
                match taken {
                    Some((at, left)) if spacing => {
                        since_take += 1;
                        floor = Some(crate::dnd::step_due(at, after_take, since_take, left));
                    }
                    Some(_) => {}
                    None if watch.started(x) => taken = Some((Instant::now(), count - 1 - i)),
                    None => {}
                }
            }
            let floored = taken.is_some() && spacing;
            due = next_due(due, sent, pacing, rests_before(&rests, i + 1, floored));
            let mut wait = due.saturating_duration_since(Instant::now());
            if let Some(floor) = floor {
                wait = wait.max(
                    floor
                        .saturating_duration_since(Instant::now())
                        .min(crate::dnd::KEEPALIVE),
                );
            }
            std::thread::sleep(wait);
            if let Some(guard) = guard.as_deref_mut()
                && guard.looks()
                && guard.watch.started(x)
            {
                return cancel_in_time(x, route, guard, &mut pressed);
            }
        }
        if let Some((watch, bound)) = hold.as_mut() {
            let ms = |d: Duration| d.as_secs_f64() * 1000.0;
            let path = pressed_at.elapsed();
            // a drag that never took by its path's end keeps its button down for the take until the bound after the
            // press; a take seen at this last look counts as late too
            // whether the hold ran: no take by the path's end
            let held = taken.is_none();
            let mut waited = Duration::ZERO;
            if held {
                let since = Instant::now();
                let looked = crate::dnd::wait_for_take(
                    || {
                        if let Some(cursor) = accept.as_deref_mut() {
                            let _ = cursor.poll();
                        }
                        watch.started(x)
                    },
                    pressed_at + *bound,
                );
                if looked {
                    taken = Some((Instant::now(), 0));
                }
                waited = since.elapsed();
            }
            // the floor after a take: what the path's steps left of it filled with motions, ending on the last sample
            let mut keepalives = 0;
            if let Some((at, _)) = taken
                && !after_take.is_zero()
            {
                keepalives = match (accept, watch.taken_time()) {
                    // the floor ends at Chrome's accept cursor, if it comes first (`accept.rs`)
                    (Some(cursor), Some(take)) => {
                        let mut accepted = None;
                        let sent = crate::dnd::keepalive_until(
                            |(px, py)| route.place_again(x, px, py),
                            before_last,
                            last,
                            at + after_take,
                            || {
                                accepted = accepted.or_else(|| cursor.accepted(take).ok().flatten());
                                accepted.is_some()
                            },
                        )?;
                        *measure.accept_record = Some(json!({
                            "accepted": accepted.is_some(),
                            "accept_after_take_ms": accepted.map(|seen| ms(seen.saturating_duration_since(at))),
                        }));
                        sent
                    }
                    _ => crate::dnd::keepalive(
                        |(px, py)| route.place_again(x, px, py),
                        before_last,
                        last,
                        at + after_take,
                    )?,
                };
            }
            // one shape for every drag the hold watched (`--stats` `hold`)
            *held_for_take = Some(json!({
                "bound_ms": ms(*bound),
                "path_ms": ms(path),
                "held": held,
                "waited_ms": ms(waited),
                "taken": taken.is_some(),
                "take_after_press_ms": taken.map(|(at, _)| ms(at.saturating_duration_since(pressed_at))),
                "keepalives": keepalives,
            }));
        }
        std::thread::sleep(pacing.release);
        // the last look before the release
        if let Some(guard) = guard.as_deref_mut()
            && guard.looks()
            && guard.watch.started(x)
        {
            return cancel_in_time(x, route, guard, &mut pressed);
        }
        // what reached the window up to the release, read apart from what comes after it: a grab that ends before the
        // release is another client's, and crosses into the window as any crossing does
        if let Some(press) = press.as_deref_mut()
            && let Some(watching) = press.watching.as_mut()
            && let Err(error) = press.watch.before_release(watching)
        {
            press.watching = None;
            press.strays = Some(Err(error));
        }
        if let Some((at, left)) = taken {
            *scheduled =
                Some(json!({ "steps_after_take": left, "release_after_take_ms": at.elapsed().as_secs_f64() * 1000.0 }));
        }
        // an Electron drop under way: the drag loop's cursor shown at the release itself, which confirms it or not
        if taken.is_some()
            && let Some(cursor) = measure.drop_cursor
        {
            let take = hold.as_ref().and_then(|(watch, _)| watch.taken_time());
            *measure.at_release = Some(cursor.at_release(take));
        }
        pressed = false;
        // stamped as the release goes out, not once its round trip is back: Chrome's drop confirmation answers the
        // release itself, and the watch may read it before that reply (task 68 saw requests up to 2.7 ms before a stamp
        // taken after the release; 1 of 300 drops in task 69's idle counts was left unconfirmed so)
        let released_at = Instant::now();
        route.release_button(x, 1)?;
        *measure.wall = Some((press_wall, wall_ms()));
        // the watch ends at the release: what reached the window from the press on
        if let Some(press) = press
            && let Some(watching) = press.watching.take()
        {
            press.strays = Some(press.watch.finish(watching));
        }
        if let Some(guard) = guard {
            // measurement only: the take the drag went on past, its Escape after the release
            if guard.late && guard.watch.started(x) {
                guard.outcome = Some(Outcome::Late);
                escape(x, route)?;
                return Err(DropCancelled.into());
            }
            guard.outcome = Some(Outcome::NoStart);
        }
        // the after-release watch, told the instant the button went up: with no take seen by the release (a plain drag,
        // answered now) it cancels a late take at once from here on and ends 300 ms after it; after a take it looks for
        // the drop's confirmation (`dnd::LateWatch`, `drag`)
        if let Some(after) = after {
            after.released(released_at, taken.is_some());
        }
        Ok(())
    })();
    if pressed {
        // interrupted while the button is down: its release is attempted; the interruption stays the answer
        let _ = route.release_button(x, 1);
    }
    let keys_released = route.release(x, &held);
    dragged.and(keys_released)
}

impl Engine {
    /// A click at coordinates (window-relative, or the desktop's), or on the desktop at the pointer; element clicks
    /// are `elements.rs`'s. The chord is parsed before anything else, as the vendor's errors come first; a window whose
    /// family ignores synthetic clicks is refused in shared mode, and in dedicated mode activated and clicked through
    /// the desktop at the same window-relative point.
    pub(super) fn click(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ClickInput = parse_input(input)?;
        let keycodes = chord(&self.x, input.key.as_deref())?;
        if let Some(element) = &input.element_id {
            let Some(window) = input.window else {
                bail!("element click requires window")
            };
            if input.x.is_some() || input.y.is_some() {
                bail!("provide element_id or x/y, not both");
            }
            let button = input.mouse_button.unwrap_or(MouseButton::Left);
            if button == MouseButton::Middle
                || input.click_count.is_some_and(|c| c != 1)
                || input.key.is_some()
                || input.duration.is_some()
            {
                bail!(
                    "element click supports one left or right click without key or duration; use coordinates for other mouse options"
                );
            }
            return self.element_click(window.id, element, button);
        }
        let position = match (input.x, input.y) {
            (Some(x), Some(y)) => Some((x, y)),
            (None, None) if input.window.is_some() => bail!("window click requires coordinates or an element"),
            (None, None) => None,
            _ => bail!("coordinate click requires both x and y"),
        };
        let button = input.mouse_button.unwrap_or(MouseButton::Left).button();
        let count = input.click_count.unwrap_or(1);
        let hold = input.duration.map(Duration::from_millis).unwrap_or(CLICK_HOLD);
        // a family that ignores synthetic clicks (families.rs): refused in shared mode, the foreground route in
        // dedicated mode; one that takes them only with the real pointer in its window, watched for it leaving
        let window = input.window.map(|w| w.id);
        let way = self.route_for(window, Kind::Clicks)?;
        let (way, within) = self.watch_within(window, Kind::Clicks, way)?;
        if let (Way::Foreground, Some(window)) = (way, window) {
            self.enter(window)?;
        }
        let target = target_of(way, window);
        // a family whose press activates a window it has not focused: the session's focus reported taken first
        let mut ack = self.focus_ack_for(target, None)?;
        let Engine { x, inputs, bus, .. } = self;
        let clicked = inputs.with_route(x, target, |x, route, _| {
            let at = match position {
                Some((px, py)) => Some(route.root_point(x, px, py)?),
                None => None,
            };
            // the foreground route's window on top at the point before anything is sent (task 63)
            if let Some(point) = at {
                route
                    .on_top_at(x, &[point])?
                    .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
            }
            // the press's checks before every press, not once per request: the person may move the focus during an
            // earlier click's hold (the bounded re-review's P1); a count of 0 still checks and places, pressing nothing
            for sent in 0..count.max(1) {
                // each press its own acknowledgement, read just before it (task 61's fix 3)
                let pressing = press_ack(ack.as_mut(), bus.as_mut(), x, route, at)?
                    .map_err(|cause| anyhow!(refused_press(cause, sent, count)))?;
                if sent == 0
                    && let Some((rx, ry)) = at
                {
                    route.place(x, rx, ry)?;
                }
                if count > 0 {
                    click_once(x, route, &keycodes, at, button, hold, pressing)?;
                }
            }
            Ok(())
        });
        self.record_focus_ack(ack.as_ref());
        let left = self.within_answer(within, "click");
        clicked?;
        left.map_or(Ok(Value::Null), Err)
    }

    /// `move`: the chord pressed, the pointer placed (the background `move_to`, or the desktop's path), the chord
    /// released (behaviour §10.2). The chord is parsed inside the target, as the vendor's (a bad one still costs a
    /// window its FocusIn and FocusOut pair, traced); on the foreground route it is checked before the window is
    /// activated, so a request refused for its input activates nothing.
    pub(super) fn move_pointer(&mut self, input: Option<Value>) -> Result<Value> {
        let input: MoveInput = parse_input(input)?;
        let window = input.window.map(|w| w.id);
        let way = self.route_for(window, Kind::Move)?;
        let (way, within) = self.watch_within(window, Kind::Move, way)?;
        // the foreground route activates only once the chord is known good
        self.enter_checked(way, window, |x| chord(x, input.key.as_deref()).map(drop))?;
        let target = target_of(way, window);
        let Engine { x, inputs, .. } = self;
        let moved = inputs.with_route(x, target, |x, route, _| {
            let (rx, ry) = route.root_point(x, input.x, input.y)?;
            let keycodes = chord(x, input.key.as_deref())?;
            route
                .on_top_at(x, &[(rx, ry)])?
                .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
            let held = route.acquire(x, &keycodes)?;
            let moved = route.place(x, rx, ry);
            moved.and(route.release(x, &held))
        });
        let left = self.within_answer(within, "move");
        moved?;
        left.map_or(Ok(Value::Null), Err)
    }

    /// `move_relative`: desktop only, one relative XTEST motion inside the chord; refused while a drag handle is held
    /// (`handle.rs`), as all desktop pointer input is.
    pub(super) fn move_relative(&mut self, input: Option<Value>) -> Result<Value> {
        let input: MoveRelativeInput = parse_input(input)?;
        let keycodes = chord(&self.x, input.key.as_deref())?;
        self.refuse_while_held(Way::Desktop)?;
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::Desktop, |x, route, _| {
            let held = route.acquire(x, &keycodes)?;
            let moved = Desktop::relative(x, input.dx, input.dy);
            moved.and(route.release(x, &held))
        })?;
        Ok(Value::Null)
    }

    /// `scroll`: wheel steps at an element, a point, the window's centre, or (on the desktop) the pointer. Element
    /// and mixed-input refusals come before the target is opened, the others inside it, as the vendor's (traced); on
    /// the foreground route all of them come before the window is activated.
    pub(super) fn scroll(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ScrollInput = parse_input(input)?;
        if let Some(element) = &input.element_id {
            let Some(window) = input.window else {
                bail!("element scroll requires window")
            };
            if input.x.is_some() || input.y.is_some() {
                bail!("provide element_id or x/y, not both");
            }
            return self.element_scroll(window.id, element, &input);
        }
        let window = input.window.map(|w| w.id);
        let way = self.route_for(window, Kind::Scroll)?;
        let (way, within) = self.watch_within(window, Kind::Scroll, way)?;
        self.enter_checked(way, window, |x| {
            if input.x.is_some() != input.y.is_some() {
                bail!("x and y must be provided together");
            }
            check_wheel(x, &input)
        })?;
        let target = target_of(way, window);
        let Engine { x, inputs, .. } = self;
        let scrolled = inputs.with_route(x, target, |x, route, _| {
            let at = match (input.x, input.y, input.window) {
                (Some(px), Some(py), _) => Some(route.root_point(x, px, py)?),
                (None, None, Some(window)) => {
                    let info = x.get_window(window.id)?;
                    Some((
                        info.x.saturating_add((info.width >> 1) as i16),
                        info.y.saturating_add((info.height >> 1) as i16),
                    ))
                }
                (None, None, None) => None,
                _ => bail!("x and y must be provided together"),
            };
            wheel(x, route, at, &input)
        });
        let left = self.within_answer(within, "scroll");
        scrolled?;
        left.map_or(Ok(Value::Null), Err)
    }

    /// `drag`: the path translated to the root (inside the window's session, which is opened first), checked, the
    /// pointer placed at its start, then the chord parsed and pressed, the button pressed, the path walked and
    /// everything released (behaviour §10.4; the chord's place traced). On the foreground route the path's length and
    /// the chord are checked before the window is activated, so a request refused for its input activates nothing.
    pub(super) fn drag(&mut self, input: Option<Value>) -> Result<Value> {
        let input: DragInput = parse_input(input)?;
        // the target's family decides the waits: the window named, or on the desktop the window under the start
        let window = match input.window {
            Some(target) => Some(target.id),
            None => input.path.first().and_then(|p| self.x.client_at(p.x, p.y)),
        };
        let pacing = self.drag_pacing_for(window);
        // the path's every sample in root coordinates, for a family that takes a drag only along a visible path; a
        // path that cannot be translated is judged as none (doubt), and its own error comes inside the route
        let samples = match input.window {
            Some(target) => input
                .path
                .iter()
                .map(|p| self.x.desktop_position(target.id, p.x, p.y))
                .collect::<Result<Vec<_>>>()
                .map(|points| drag_samples(&points))
                .unwrap_or_default(),
            None => Vec::new(),
        };
        let named = input.window.map(|w| w.id);
        let mut way = self.route_along(named, Kind::Drag, &samples)?;
        // a Chromium-family window takes a background drag only with the real pointer in it: its own capture grab
        // crosses in from a pointer outside with no button, which kills the drag (task 20). In dedicated mode such a
        // drag takes the foreground route, which puts the pointer there; in shared mode it goes ahead, and the watch
        // answers what the crossing did (the design session's rulings, 2026-11-01)
        if let (Way::Background, DesktopMode::Dedicated, Some(window)) = (way, self.cfg.desktop, named)
            && self.blink(window)
            && !self
                .x
                .parent(window)
                .and_then(|p| self.x.pointer_in(window, p))
                .unwrap_or(false)
        {
            way = Way::Foreground;
            self.record_route(way);
            self.extra.insert("pointer_outside".into(), json!(true));
        }
        // a family that takes pointer input only while the real pointer is in its window (Gecko): watched for the pointer
        // leaving it, from a second read of the pointer to the drag's end (`within.rs`)
        let (way, within) = self.watch_within(named, Kind::Drag, way)?;
        self.enter_checked(way, named, |x| {
            if input.path.len() < 2 {
                bail!("drag path must contain at least two points");
            }
            chord(x, input.key.as_deref()).map(drop)
        })?;
        let target = target_of(way, named);
        // a family whose press activates a window it has not focused: the session's focus reported taken first
        let mut ack = self.focus_ack_for(target, None)?;
        // in shared mode, a background drag into a family whose drop changes the desktop watches for a drag and drop,
        // unless the window is already in front (active, focused, fully unobscured), where the drop changes nothing
        let mut guard = match target {
            Target::Window(window)
                if self.cfg.desktop == DesktopMode::Shared
                    && self.family_of(window).is_some_and(|f| f.drop_changes_desktop) =>
            {
                let standing = self.x.standing(window);
                let in_front = standing.active && standing.focused && self.x.unobscured(window);
                self.extra.insert("dnd".into(), json!({ "in_front": in_front }));
                if in_front {
                    None
                } else {
                    Some(DropGuard {
                        watch: DndWatch::start(&mut self.x, window)?,
                        before: standing,
                        late: self.cfg.dnd_cancel_late,
                        defer: self.cfg.dnd_defer_take,
                        outcome: None,
                    })
                }
            }
            _ => None,
        };
        // a Chromium drag the engine lets drop (no guard: in front, a dedicated desktop, or the desktop route into the
        // window under the start) is watched for its take, so its release comes no sooner than the take's delay after
        // it (`dnd::RELEASE_AFTER_TAKE`), so a take late for its path is held for (`dnd::TAKE_HOLD_AFTER_PRESS`), and so
        // the press watch knows whether the drag started
        let dropping_into = match target {
            Target::Window(window) | Target::Foreground(window) => Some(window),
            Target::Desktop => window,
        };
        let pressing_into = dropping_into.filter(|&w| self.blink(w));
        // a Chromium-family drag's press: atomic, and watched from just before it to its release; the watch's connection
        // is the engine's from the first such drag on
        let (mut watch, parent) = match pressing_into {
            Some(window) => {
                let parent = self.x.parent(window)?;
                let watch = match self.stray_watch.take() {
                    Some(watch) => watch,
                    None => StrayWatch::connect()?,
                };
                (Some(watch), parent)
            }
            None => (None, x11rb::NONE),
        };
        let mut hold = match pressing_into {
            Some(window) if guard.is_none() => Some(DndWatch::start(&mut self.x, window)?),
            _ => None,
        };
        let mut press = match (pressing_into, watch.as_mut()) {
            (Some(window), Some(watch)) => Some(ChromiumPress {
                watch,
                window,
                parent,
                xtest: !matches!(target, Target::Window(_)),
                watching: None,
                grab: None,
                strays: None,
            }),
            _ => None,
        };
        // the drop's window, where Chrome's drop asks for activation: the named window, or on the desktop route the
        // top-level under the path's end. Its confirmation is live on a drag the engine lets drop into Chrome, under a
        // window manager that lists `_NET_ACTIVE_WINDOW` as supported (the design session's ruling on task 68,
        // 2026-11-09); Electron's by its drag loop's cursor at the release (below); every other window keeps the floor
        // with nothing to confirm
        let drop_window = match (hold.is_some(), target) {
            (false, _) => None,
            (true, Target::Window(window) | Target::Foreground(window)) => Some(window),
            (true, Target::Desktop) => input.path.last().and_then(|p| self.x.client_at(p.x, p.y)),
        };
        let confirm = match drop_window {
            Some(window)
                if self
                    .family_of(window)
                    .is_some_and(|f| crate::families::confirms_drop(f.name)) =>
            {
                let supported = crate::dnd::active_window_supported(&self.x);
                self.extra.insert(
                    "confirm".into(),
                    match &supported {
                        Ok(supported) => json!({ "window": window, "supported": supported }),
                        Err(error) => json!({ "window": window, "supported": false, "error": format!("{error:#}") }),
                    },
                );
                supported.unwrap_or(false).then_some(window)
            }
            _ => None,
        };
        // the after-release watch, subscribed before the drag begins so no take can fall between: the guard's, and that
        // of every Chromium drag the engine lets drop (#264; the design session's rulings, 2026-11-02), its late take's
        // Escape on the route the drag used
        let watched = match &guard {
            Some(_) => named,
            None => hold.as_ref().and(pressing_into),
        };
        let after = match watched {
            Some(window) => {
                let escape = chord_keycodes(&self.x, "Escape")?;
                let route = match target {
                    Target::Window(window) => EscapeRoute::Synthetic(window),
                    Target::Foreground(_) | Target::Desktop => EscapeRoute::Xtest,
                };
                Some(LateWatch::start(
                    window,
                    route,
                    escape[0],
                    confirm.map_or(Confirm::Never, Confirm::Window),
                )?)
            }
            None => None,
        };
        // an Electron drop the engine lets land, watched: its drag loop's accept cursor at the release confirms it, the
        // cursor watched from before the press (`drop_cursor.rs`; the design session's ruling on task 73's review,
        // 2026-11-11); a watch that cannot start confirms nothing
        let mut drop_cursor = match (&guard, &after, confirm, drop_window) {
            (None, Some(_), None, Some(window))
                if self
                    .family_of(window)
                    .is_some_and(|f| crate::families::confirms_drop_by_cursor(f.name)) =>
            {
                Some(crate::drop_cursor::DropCursor::start().map_err(|e| format!("{e:#}")))
            }
            _ => None,
        };
        let mut at_release = None;
        let after_take = self.cfg.dnd_after_take;
        let mut scheduled = None;
        let bound = self.cfg.dnd_hold;
        let mut held_for_take = None;
        // measurement only (`--drag-dnd-release-at-accept`, reverted from shipping by the design session's ruling on
        // task 69's counts): a drop the engine can confirm released at Chrome's accept cursor, read from before the
        // press (`accept.rs`); a watch that cannot start leaves the drag to its floor
        let mut cursor = match (confirm, self.cfg.dnd_release_at_accept) {
            (Some(_), true) => match crate::accept::CursorWatch::start() {
                Ok(cursor) => Some(cursor),
                Err(error) => {
                    self.extra
                        .insert("accept".into(), json!({ "error": format!("{error:#}") }));
                    None
                }
            },
            _ => None,
        };
        let mut wall = None;
        let mut accept_record = None;
        // the time field the drag's events carried at its end, beside the server's time read just after (M3.1: whether
        // a background event's time can run ahead of the server's)
        let mut times = None;
        // a watched drag's session is kept focused past its answer while its late-take watch is armed, so the watch's
        // Escape lands inside it (the design session's ruling on task 60); a drag that arms no watch ends it below
        let may_arm_watch = after.is_some();
        let Engine { x, inputs, bus, .. } = self;
        let dragged = inputs.with_route_kept(x, target, may_arm_watch, |x, route, _| {
            let points = input
                .path
                .iter()
                .map(|p| route.root_point(x, p.x, p.y))
                .collect::<Result<Vec<_>>>()?;
            if points.len() < 2 {
                bail!("drag path must contain at least two points");
            }
            // the foreground route's window on top along the whole path before anything is sent (task 63)
            route
                .on_top_at(x, &drag_samples(&points))?
                .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
            // the drag's press goes at the path's start, with its own acknowledgement
            let pressing = press_ack(ack.as_mut(), bus.as_mut(), x, route, Some(points[0]))?
                .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
            route.place(x, points[0].0, points[0].1)?;
            let keycodes = chord(x, input.key.as_deref())?;
            let dragged = drag_along(
                x,
                route,
                &keycodes,
                &points,
                &pacing,
                guard.as_mut(),
                hold.as_mut().map(|w| (w, bound)),
                &mut held_for_take,
                after_take,
                &mut scheduled,
                press.as_mut(),
                pressing,
                cursor.as_mut(),
                after.as_ref(),
                DragMeasure {
                    wall: &mut wall,
                    accept_record: &mut accept_record,
                    drop_cursor: drop_cursor.as_mut().and_then(|c| c.as_mut().ok()),
                    at_release: &mut at_release,
                },
            );
            if let Some(event) = route.event_time()
                && let Ok(server) = crate::input::server_time(x)
            {
                times = Some((event, server));
            }
            dragged
        });
        self.record_focus_ack(ack.as_ref());
        // the pointer watch's word on a drag that otherwise succeeded (`within.rs`)
        let left = self.within_answer(within, "drag");
        if let Some((event, server)) = times {
            self.extra.insert(
                "event_time".into(),
                json!({ "event": event, "server": server, "ahead_ms": i64::from(event) - i64::from(server) }),
            );
        }
        if let Some(scheduled) = scheduled {
            self.extra.insert("after_take".into(), scheduled);
        }
        if let Some((press, release)) = wall {
            self.extra
                .insert("wall".into(), json!({ "press_ms": press, "release_ms": release }));
        }
        // what the release at the accept saw (`--stats`): every change of the displayed cursor, with its image when known
        if let Some(mut cursor) = cursor {
            let mut record = accept_record.unwrap_or_else(|| json!({ "accepted": false }));
            match cursor.finish().map(<[_]>::to_vec) {
                Ok(changes) => {
                    record["changes"] = json!(
                        changes
                            .iter()
                            .map(|c| json!([
                                c.serial,
                                c.time,
                                c.named,
                                cursor.image_of(c.serial).map(|i| format!("{i:016x}"))
                            ]))
                            .collect::<Vec<_>>()
                    );
                }
                Err(error) => record["error"] = json!(format!("{error:#}")),
            }
            if let Some(take) = hold.as_ref().and_then(|h| h.taken_time()) {
                record["take_time"] = json!(take);
            }
            self.extra.insert("accept".into(), record);
        }
        // whether the target's client took `XdndSelection` by now: a drag and drop started, so no stray reset the press
        let mut taken = false;
        if let Some(mut hold) = hold {
            taken = hold.started(&mut self.x);
            hold.stop(&mut self.x);
            if let Some(record) = held_for_take {
                self.extra.insert("hold".into(), record);
            }
        }
        if let Some(guard) = guard.as_mut() {
            taken = guard.watch.started(&mut self.x);
        }
        let strays = press.take().map(|mut press| {
            // a drag that ended before its release: the watch's selections dropped
            if let Some(watching) = press.watching.take() {
                let _ = press.watch.finish(watching);
            }
            (press.grab, press.strays)
        });
        // what the press watch says about a drag that otherwise succeeded: None, or its refusal
        let watched_answer = match strays {
            Some((grab, strays)) => self.press_answer(pressing_into, grab, strays, taken, watch),
            None => left,
        };
        let Some(guard) = guard else {
            // a Chromium drag the engine lets drop: its watch is handed over once the button went up with no take (the
            // late take is the watch's to cancel and report), or after a take on a drop the watch confirms; an Electron
            // drop under way whose drag loop did not show the accept at the release is pending unconfirmed at once;
            // otherwise (no release, or a take with nothing to confirm) there is nothing more to watch
            if let Some(after) = after {
                let released = after.released_with_take();
                // an Electron drop's cursor at the release: the accept shown, or not (a watch that never started, a read
                // that failed, or one that could not tell all confirm nothing)
                let by_cursor = drop_cursor.as_ref().map(|watch| match (watch, &at_release) {
                    (Ok(_), Some(read)) => read.accepted == Some(true),
                    _ => false,
                });
                if let Some(watch) = &drop_cursor {
                    self.extra.insert(
                        "drop_cursor".into(),
                        match (watch, &at_release) {
                            (Ok(_), Some(read)) => read.record(),
                            (Ok(_), None) => json!({ "read": false }),
                            (Err(error), _) => json!({ "accepted": null, "error": error }),
                        },
                    );
                }
                self.extra.insert(
                    "after_release".into(),
                    json!({ "released_with_take": released, "confirming": confirm.is_some(), "by_cursor": by_cursor }),
                );
                let window = watched.expect("a watched drag has its window");
                let app = |x: &mut crate::x11::X11| {
                    x.get_window(window)
                        .map_or_else(|_| format!("window {window}"), |w| w.app)
                };
                match (released, confirm, by_cursor) {
                    (Some(false), _, _) | (Some(true), Some(_), _) => {
                        self.late_watch = Some(after.handed_over(app(&mut self.x)));
                    }
                    (Some(true), None, Some(false)) => {
                        after.done();
                        self.inputs.end_watched(&mut self.x);
                        self.late_pending = Some((app(&mut self.x), crate::dnd::WatchEnd::Unconfirmed));
                    }
                    _ => {
                        after.done();
                        self.inputs.end_watched(&mut self.x);
                    }
                }
            }
            return match watched_answer {
                Some(refusal) if dragged.is_ok() => Err(refusal),
                _ => dragged.map(|()| Value::Null),
            };
        };
        let started = guard.watch.is_started();
        guard.watch.stop(&mut self.x);
        let after = after.expect("a guard starts its after-release watch");
        let Some(outcome) = guard.outcome else {
            // the drag failed before anything was decided: its own error is the answer
            after.done();
            self.inputs.end_watched(&mut self.x);
            self.extra
                .insert("dnd".into(), json!({ "in_front": false, "started": started }));
            return dragged.map(|()| Value::Null);
        };
        // no take by the release: answered now as a plain drag, the watch handed over until the next request, the drag's
        // session left to it (`Engine::collect_late_watch` ends it); otherwise the session ends now, before the
        // signature's look
        if outcome == Outcome::NoStart {
            let window = named.expect("a watched drag named its window");
            // the watch is handed over whatever the window's name reads as: a late take must still be reported
            let app = self
                .x
                .get_window(window)
                .map_or_else(|_| format!("window {window}"), |w| w.app);
            self.late_watch = Some(after.handed_over(app));
        } else {
            after.done();
            self.inputs.end_watched(&mut self.x);
        }
        // the cross-check of an in-time cancel: the drop's signature, where a change can show
        let window = named.expect("a watched drag named its window");
        let (signature, settled) = match outcome {
            Outcome::InTime => crate::dnd::signature_within(guard.before, || self.x.standing(window)),
            _ => (false, Duration::ZERO),
        };
        self.extra.insert(
            "dnd".into(),
            json!({
                "in_front": false,
                "started": started,
                "late": guard.late,
                "outcome": outcome.name(),
                "held_at_start": guard.before.any(),
                "signature": signature,
                "settle_ms": settled.as_secs_f64() * 1000.0,
            }),
        );
        match crate::dnd::answer(outcome, signature, &self.x.get_window(window)?.app) {
            Some(sentence) => bail!(sentence),
            // no drag and drop began: what the press watch saw decides
            None => match watched_answer {
                Some(refusal) if dragged.is_ok() => Err(refusal),
                _ => dragged.map(|()| Value::Null),
            },
        }
    }

    /// Whether a window is of a Chromium family (`families::blink`).
    pub(super) fn blink(&mut self, window: x11rb::protocol::xproto::Window) -> bool {
        self.family_of(window).is_some_and(|f| crate::families::blink(f.name))
    }

    /// A Chromium-family press's record on the `--stats` line (`press`), and what its watch says: None, or the refusal
    /// of a drag a stray event may have reset, with no take by the release (`stray::answer`), or of one whose watch
    /// failed. The watch's connection goes back to the engine unless it failed, so the next drag opens a new one.
    fn press_answer(
        &mut self,
        window: Option<x11rb::protocol::xproto::Window>,
        grab: Option<PressGrab>,
        strays: Option<Result<Strays>>,
        taken: bool,
        watch: Option<StrayWatch>,
    ) -> Option<anyhow::Error> {
        let mut record = json!({ "taken": taken });
        if let Some(grab) = grab {
            record["grab_ms"] = json!(grab.held.as_secs_f64() * 1000.0);
            record["samples"] = json!(grab.samples);
            record["pointer_inside"] = json!(grab.inside);
            record["crossed"] = json!(grab.crossed);
        }
        // the application the refusal names, read only when there is one
        let app = |x: &mut X11| {
            window.map_or_else(String::new, |w| {
                x.get_window(w).map_or_else(|_| format!("window {w}"), |i| i.app)
            })
        };
        let refusal = match strays {
            // the drag ended before its release: its own error answers
            None => None,
            Some(Ok(strays)) => {
                record["strays"] = strays.stats();
                (strays.count() > 0 && !taken)
                    .then(|| crate::stray::answer(strays.count(), taken, &app(&mut self.x)))
                    .flatten()
                    .map(anyhow::Error::msg)
            }
            Some(Err(error)) => {
                let why = format!("{error:#}");
                record["strays"] = json!({ "failed": why });
                (!taken).then(|| anyhow::Error::msg(crate::stray::watch_failed(&app(&mut self.x), &why)))
            }
        };
        self.stray_watch = watch.filter(StrayWatch::healthy);
        self.extra.insert("press".into(), record);
        refusal
    }
}

/// The wheel's own input checked as [`wheel`] checks it (`pixels`, then the chord), for the foreground route to check
/// before it activates the window.
pub(super) fn check_wheel(x: &X11, input: &ScrollInput) -> Result<()> {
    if input.pixels.unwrap_or(DEFAULT_PIXELS) == 0 {
        bail!("pixels must be non-zero");
    }
    chord(x, input.key.as_deref()).map(drop)
}

/// The wheel once its point is known: `pixels` checked, the chord parsed, the pointer placed, then the chord
/// pressed, each step pressed, held and released, and the chord released (behaviour §10.3).
pub(super) fn wheel(x: &X11, route: &mut Route, at: Option<(i16, i16)>, input: &ScrollInput) -> Result<()> {
    let pixels = input.pixels.unwrap_or(DEFAULT_PIXELS);
    if pixels == 0 {
        bail!("pixels must be non-zero");
    }
    let keycodes = chord(x, input.key.as_deref())?;
    if let Some((rx, ry)) = at {
        route
            .on_top_at(x, &[(rx, ry)])?
            .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
        route.place(x, rx, ry)?;
    }
    let button = input.direction.button();
    let held = route.acquire(x, &keycodes)?;
    let mut scrolled = Ok(());
    for _ in 0..scroll_steps(pixels) {
        // a wheel step asks no toolkit (Qt never activates on one, and its scrolls are refused in shared mode), but
        // it is a press like any other, with its own acknowledgement
        scrolled = press_ack(None, None, x, route, at)
            .and_then(|ack| ack.map_err(anyhow::Error::msg))
            .and_then(|pressing| route.press(x, button, pressing))
            .and_then(|()| {
                std::thread::sleep(WHEEL_HOLD);
                route.release_button(x, button)
            });
        if scrolled.is_err() {
            break;
        }
    }
    let keys_released = route.release(x, &held);
    scrolled.and(keys_released)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wheel_steps_round_half_away_from_zero_with_one_at_least() {
        for (pixels, steps) in [
            (50, 1),
            (150, 2),
            (120, 1),
            (240, 2),
            (800, 8),
            (1, 1),
            (149, 1),
            (65535, 655),
        ] {
            assert_eq!(scroll_steps(pixels), steps, "{pixels} px");
        }
    }

    /// T9's review kept Gecko's pause after a held move's leading motion until Firefox's held moves were measured; T11
    /// measured them, and Chromium's as their controls (evidence `m4/drag-motion/`): a browser's held move rests at its
    /// end and visits it again, with no pause after the leading motion; an unlisted family pauses nowhere.
    #[test]
    fn a_browser_s_held_move_rests_at_its_end_with_no_lead_pause() {
        use crate::desktop::{held_points, path_points, paused_before};
        use crate::families::{FAMILIES, Toolkit, family};
        let drag = |class: &str, toolkit: &str| {
            let toolkit = Toolkit {
                name: toolkit.into(),
                version: None,
            };
            family(FAMILIES, Some(class), Some(&toolkit)).expect(class).drag
        };
        let start = (300, 300);
        let points = path_points(start, (700, 500));
        let pauses = |pacing: DragPacing| -> Vec<bool> {
            (1..points.len())
                .map(|i| paused_before(&points, start, i, pacing.held_lead_pause))
                .collect()
        };
        for (class, toolkit) in [
            ("firefox", "Gecko"),
            ("Google-chrome", "Chromium"),
            ("Electron", "Chromium"),
        ] {
            let pacing = drag(class, toolkit);
            assert!(!pauses(pacing)[0], "{class}: no pause after the leading motion");
            let rested = held_points(start, (700, 500), !pacing.held_rest.is_zero());
            assert_eq!(rested.len(), points.len() + 1, "{class}");
            assert_eq!(
                rested[rested.len() - 2..],
                [(700, 500), (700, 500)],
                "{class}: the end, then the end again after the rest"
            );
        }
        assert!(
            !pauses(DragPacing::NONE)[0],
            "an unlisted family pauses nowhere after it (nor does the desktop path)"
        );
        assert!(DragPacing::NONE.held_rest.is_zero(), "nor rests");
    }

    #[test]
    fn a_forty_pixel_drag_visits_forty_one_points() {
        // traced: a 40 px drag gave 41 MotionNotify, x 200…240 (behaviour §10.4)
        let samples = drag_samples(&[(200, 300), (240, 300)]);
        assert_eq!(samples.len(), 41);
        assert_eq!(samples.first(), Some(&(200, 300)));
        assert_eq!(samples.last(), Some(&(240, 300)));
    }

    #[test]
    fn the_atomic_press_ends_with_the_first_sample_past_blink_s_drag_threshold() {
        // a 40 px drag: samples 0…4 px, the fifth (4 px out) is Blink's first move that can start the drag
        assert_eq!(press_samples(&drag_samples(&[(200, 300), (240, 300)])), 5);
        // up and left (n = 14: x 0, 0, -1, -2, -2, -3, -4), and in y alone: 4 px in either axis
        assert_eq!(press_samples(&drag_samples(&[(200, 300), (190, 290)])), 7);
        assert_eq!(press_samples(&drag_samples(&[(200, 300), (200, 260)])), 5);
        // the joint repeated: (0,0) twice, then 1, 2, 3, 4
        assert_eq!(press_samples(&drag_samples(&[(0, 0), (0, 0), (10, 0)])), 7);
        // a short path that never reaches the threshold: every sample, under the cap
        assert_eq!(press_samples(&drag_samples(&[(0, 0), (3, 3)])), 5);
        assert_eq!(press_samples(&[(5, 5)]), 1);
        // a path given in 1 px steps visits each joint twice and reaches 4 px at its eighth sample: still covered
        let steps: Vec<(i16, i16)> = (0..=10).map(|x| (x, 0)).collect();
        assert_eq!(press_samples(&drag_samples(&steps)), 8);
    }

    #[test]
    fn the_atomic_press_sends_at_most_its_cap_under_the_grab_whatever_the_path() {
        // a long path that never reaches the threshold: 3 px out and back, hundreds of times
        let mut wander = vec![(0, 0)];
        for _ in 0..500 {
            wander.extend([(3, 3), (0, 0)]);
        }
        let samples = drag_samples(&wander);
        assert!(samples.len() > 2000);
        assert_eq!(press_samples(&samples), PRESS_SAMPLES_MAX, "a path that never crosses");
        // a jitter around the press point (±1 px) for a while, then out past the threshold: the crossing comes late,
        // so only the cap goes under the grab
        let mut jitter = vec![(100, 100)];
        for i in 0..200 {
            jitter.push(if i % 2 == 0 { (101, 99) } else { (99, 101) });
        }
        jitter.push((160, 100));
        let samples = drag_samples(&jitter);
        assert!(samples.len() > 400);
        assert_eq!(press_samples(&samples), PRESS_SAMPLES_MAX, "a jittering path");
        // a long straight path crosses early: the threshold, not the length, decides
        assert_eq!(press_samples(&drag_samples(&[(0, 0), (3000, 0)])), 5);
        assert_eq!(press_samples(&drag_samples(&[(0, 0), (2000, 2000)])), 7);
    }

    #[test]
    fn a_resting_drag_rests_before_its_end_s_second_visit_and_at_each_sharp_corner() {
        // a straight drag: the pinned build's samples, then the end once more after a rest
        let straight = drag_plan(&[(200, 300), (240, 300)], true);
        let mut samples = drag_samples(&[(200, 300), (240, 300)]);
        samples.push((240, 300));
        assert_eq!(straight.samples, samples);
        assert_eq!(straight.rests, vec![41], "only before the end's second visit");
        // the canvas path (drag.mjs CORNERS): the joints turn 139° and 65°, so the pointer rests at both, between the
        // joint's two visits (the second visit is the next segment's first sample), and at the end
        let corners = [(20, 20), (380, 40), (200, 180), (40, 100)];
        let plan = drag_plan(&corners, true);
        let first = drag_samples(&corners[..2]).len();
        let second = drag_samples(&corners[1..3]).len();
        assert_eq!(plan.samples.len(), drag_samples(&corners).len() + 1);
        assert_eq!(plan.rests, vec![first, first + second, plan.samples.len() - 1]);
        for &k in &plan.rests {
            assert_eq!(
                plan.samples[k],
                plan.samples[k - 1],
                "a rest is between two visits of one point"
            );
        }
        // the drop's path turns 7° at its joint: a shallow joint is passed without a rest
        let dnd = drag_plan(&[(410, 155), (440, 160), (660, 170)], true);
        assert_eq!(dnd.rests, vec![dnd.samples.len() - 1]);
        // a zero-length segment has no direction: no corner there
        let still = drag_plan(&[(0, 0), (0, 0), (10, 0)], true);
        assert_eq!(still.rests, vec![still.samples.len() - 1]);
    }

    #[test]
    fn a_point_repeated_inside_a_resting_drag_s_path_neither_hides_its_corner_nor_rests_there_twice() {
        // the bend at (200, 0) turns 90° whether or not the path names it twice: the turn is read between the distinct
        // positions around it, and the rest comes once, after the bend's first visit, as without the repeat
        let bend = [(0, 0), (200, 0), (200, 200)];
        for repeated in [
            vec![(0, 0), (200, 0), (200, 0), (200, 200)],
            vec![(0, 0), (200, 0), (200, 0), (200, 0), (200, 200)],
        ] {
            let plan = drag_plan(&repeated, true);
            let mut samples = drag_samples(&repeated);
            samples.push((200, 200));
            assert_eq!(
                plan.samples, samples,
                "the samples the path's own points give, the end's second visit last"
            );
            let first = drag_samples(&bend[..2]).len();
            assert_eq!(plan.rests, vec![first, plan.samples.len() - 1], "{repeated:?}");
            assert_eq!(plan.samples[first], (200, 0), "between two visits of the bend");
            assert_eq!(plan.samples[first - 1], (200, 0));
        }
        // a straight path with a point repeated in it has no corner there
        let straight = drag_plan(&[(0, 0), (100, 0), (100, 0), (200, 0)], true);
        assert_eq!(straight.rests, vec![straight.samples.len() - 1]);
        // a repeated end is no corner: the bend before it rests, and the end once, before its last visit
        let end = drag_plan(&[(0, 0), (100, 0), (100, 100), (100, 100)], true);
        assert_eq!(end.rests, vec![101, end.samples.len() - 1]);
    }

    #[test]
    fn a_drag_on_its_floor_after_a_take_does_not_rest_again() {
        let rests = [41];
        assert!(rests_before(&rests, 41, false), "a planned rest");
        assert!(!rests_before(&rests, 40, false), "no rest where none is planned");
        assert!(
            !rests_before(&rests, 41, true),
            "the floor after a take spaces the steps to its end and holds the pointer there with keepalives"
        );
    }

    #[test]
    fn a_drag_that_does_not_rest_sends_the_pinned_build_s_samples() {
        let corners = [(20, 20), (380, 40), (200, 180), (40, 100)];
        let plan = drag_plan(&corners, false);
        assert_eq!(plan.samples, drag_samples(&corners));
        assert!(plan.rests.is_empty());
    }

    #[test]
    fn by_elapsed_time_a_sample_is_due_a_step_after_the_last_was_due_and_a_rest_counts_from_the_last_sent() {
        let t0 = Instant::now();
        let ms = Duration::from_millis;
        let paced = |elapsed| DragPacing {
            step: Duration::from_micros(500),
            elapsed,
            rest: ms(20),
            ..DragPacing::NONE
        };
        // the previous sample was due at t0 and went out 300 µs late
        let sent = t0 + Duration::from_micros(300);
        assert_eq!(next_due(t0, sent, &paced(true), false), t0 + Duration::from_micros(500));
        assert_eq!(
            next_due(t0, sent, &paced(false), false),
            sent + Duration::from_micros(500),
            "per sample: a step after it went out"
        );
        // late by more than a step: due at once, so the motions catch up rather than add their own time
        let late = t0 + ms(3);
        assert!(next_due(t0, late, &paced(true), false) < late);
        // a rest is a rest whatever the lateness: from when the point went out
        assert_eq!(next_due(t0, late, &paced(true), true), late + ms(20));
        assert_eq!(next_due(t0, late, &paced(false), true), late + ms(20));
    }

    #[test]
    fn drag_samples_truncate_toward_zero_and_repeat_the_joint() {
        // 3,4 → n = 5; x = 3i/5 → 0,0,1,1,2,3; y = 4i/5 → 0,0,1,2,3,4
        let samples = drag_samples(&[(0, 0), (3, 4), (3, 2)]);
        assert_eq!(
            samples,
            vec![(0, 0), (0, 0), (1, 1), (1, 2), (2, 3), (3, 4), (3, 4), (3, 3), (3, 2)]
        );
        // a negative step truncates toward zero, not down: y = −i/3 is 0, 0, 0, −1
        assert_eq!(
            drag_samples(&[(0, 0), (-3, -1)]),
            vec![(0, 0), (-1, 0), (-2, 0), (-3, -1)]
        );
        assert_eq!(drag_samples(&[(0, 0), (-1, -1)]), vec![(0, 0), (-1, -1)]);
        assert_eq!(
            drag_samples(&[(5, 5), (5, 5)]),
            vec![(5, 5), (5, 5)],
            "a zero-length segment: n = 1"
        );
    }
}
