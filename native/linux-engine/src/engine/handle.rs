//! `drag_handle` (behaviour §10.5): start, move and end are the JavaScript's to order, desktop only, its press and every
//! motion XTEST on the real pointer in either device mode. The lifecycle is T17's (#250; the design session's ruling,
//! 2026-11-10, and its rulings on the build's review, 2026-11-11; evidence `m4/drag-handle/`). Xorg delivers events with
//! the master pointer's button state, which stays down while any of its devices holds the button, so every crossing and
//! motion that reaches a page during the hold carries the button and none resets the press: the atomic press and the
//! press watch of a Chromium `drag` protect nothing here. What loses a handle's press is another client's pointer grab,
//! held over the press or taken during the hold, and every such press answered ok before. So:
//!
//! - **The target** is the top-level window under the start point at `start` (as a desktop `drag` resolves its pacing
//!   window); it decides the handle's pacing (`families.rs`), whether it is a Chromium one, and the window its watches
//!   name. With no client there (an override-redirect window over the point), the handle has no watch.
//! - **The press** comes at `start`, as the vendor's does. Just before it, under a server grab, the engine tries a
//!   pointer grab on the deepest window under the pointer and gives it up in the same request batch
//!   ([`pointer_free`]): another client's grab answers `AlreadyGrabbed`, and `start` is refused with nothing pressed.
//!   Under the server grab no other client's request runs while the try holds the pointer, so a person's click sent then
//!   is handled after it, not swallowed by it.
//! - **The hold watch** (`stray::HoldWatch`) reads the target's crossings from just before the press to just before the
//!   release: a crossing in mode `Grab` or `Ungrab` is another client's grab cutting the hold, also one taken between the
//!   try and the press, and `end` answers so, after its release, unless the target's client took `XdndSelection` (a drag
//!   and drop, which takes the pointer itself). It never answers at a `move_to`, which would throw before the agent's
//!   `end` and leave the button down.
//! - **A Chromium handle's `end`** arms T14's after-release watch (`dnd::LateWatch`, started before the press): a late
//!   take cancelled by an Escape through XTEST and reported. A drag and drop under way at the release is confirmed, or
//!   reported unconfirmed and never left at ok ([`confirming`]): by Chrome's activation request for the window under the
//!   release, where the window manager supports it; for an Electron source, by its drag loop's accept cursor at the
//!   release (`drop_cursor.rs`); and a Chrome source's drop over a window that is not Chrome's is unconfirmed, since
//!   nothing can confirm it. The notice and the refusal in T14's words. Handles get no drop floor.
//! - **The real pointer moved**: if at the release the pointer is not where the last request put it (the person moved
//!   it), the release goes where it is and `end` reports it. The pointer is read for that, and for the window under the
//!   release, after the release dwell and the hold watch's round trip, so a motion during them counts. Motion a later
//!   `move_to` corrected raises nothing.
//! - **While a handle is held**, pointer input through XTEST (the desktop route, and the foreground route, which is the
//!   desktop route after an activation) is refused, since its button would end the hold ([`handle_held`]). Keys run.
//! - **A handle that gets no request** of its own (a move or its end) for the idle bound, [`HANDLE_IDLE`], is released
//!   by the engine where the pointer is, between requests (`Engine::release_idle_handle`): a cell that lost its handle,
//!   thrown between `start` and `end`, can never end it, and every desktop pointer request would be refused for good
//!   with the button down. What the release did is pending, as a watch's end is: the next reply carries it, and the next
//!   acting request, or the released handle's `end`, is refused with it, not run. Every later move or end of the
//!   released handle is refused too, with nothing sent, until a start presses again ([`handle_expired`]).
//! - `start` then `end` with no move is a press and a release in place, as the vendor's; the cleanup before a first move
//!   is the exit's (`Engine::shutdown`), which ends a held handle as its `end` does.

use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use serde_json::{Value, json};
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{ConnectionExt as _, EventMask, GrabMode, GrabStatus, QueryPointerReply, Window};

use super::Engine;
use super::way::Way;
use crate::desktop::Desktop;
use crate::dnd::{Confirm, EscapeRoute, LateWatch, WatchEnd};
use crate::drop_cursor::DropCursor;
use crate::families::DragPacing;
use crate::hold_ping::HoldPing;
use crate::input::chord_keycodes;
use crate::stray::{Held, HoldWatch, Holding};
use crate::wire::{DragHandleInput, parse_input};
use crate::x11::X11;

/// How long a held handle may go with no request of its own before the engine releases it where it is: the design
/// session's ruling on task 73's review (2026-11-11), the idle bound of the AXEnhancedUserInterface rule.
/// `--drag-handle-idle-ms` sets another (the live tests).
pub const HANDLE_IDLE: Duration = Duration::from_secs(30);

/// The refusal of pointer input through XTEST while a handle is held (the design session's ruling, 2026-11-10): its
/// button would end the hold, so the engine refuses the agent's own conflicting request, and says how a handle the agent
/// lost is let go: after `idle` with no request.
pub(super) fn handle_held(idle: Duration) -> String {
    format!(
        "a drag handle is held; end it before sending desktop pointer input (a handle that gets no request for {} s is \
         released where it is)",
        idle.as_secs_f64()
    )
}

/// The refusal of a move or an end of a handle the idle bound released (`idle` its bound, `at` where it was released,
/// None on another screen), once the timeout's own refusal was answered: it holds nothing, so a move would drag nothing
/// and an end release nothing (the whole-branch review of M4, P2: a retried move answered ok with the button up).
pub(super) fn handle_expired(app: &str, idle: Duration, at: Option<(i16, i16)>) -> String {
    let at = at.map_or_else(|| "on another screen".to_string(), |(x, y)| format!("at ({x}, {y})"));
    format!(
        "your drag handle in {app} is no longer held: it got no request for {} s, so it was released where the \
         pointer was, {at}; this drag_handle request was not run. Start a new handle to drag again",
        idle.as_secs_f64()
    )
}

/// The refusal of a `start` while another client holds the pointer: its grab would take the press.
pub(super) const POINTER_HELD_ELSEWHERE: &str = "another application holds the pointer (an open menu, or a drag in \
     progress); nothing was pressed. Close it or wait, then start the handle again";

/// The answer to an `end` whose pointer was not where the last request put it: `at` where it was released (None: on
/// another screen of the display), `asked` where it was asked to be.
pub(super) fn pointer_moved(app: &str, at: Option<(i16, i16)>, asked: (i16, i16)) -> String {
    let at = at.map_or_else(|| "on another screen".to_string(), |(x, y)| format!("at ({x}, {y})"));
    format!(
        "{app} may not have received your drag where you asked: the desktop pointer was moved while the handle was \
         held, so it was released {at} instead of at ({}, {}). Read the window to see what happened before dragging \
         again",
        asked.0, asked.1
    )
}

/// Where the real pointer goes for a motion to `(x, y)` on a screen `size` wide and high: the server keeps it on the
/// screen.
pub fn on_screen((x, y): (i16, i16), size: (u16, u16)) -> (i16, i16) {
    let last = |extent: u16| i16::try_from(extent.saturating_sub(1)).unwrap_or(i16::MAX);
    (x.clamp(0, last(size.0)), y.clamp(0, last(size.1)))
}

/// Where the pointer was at the end (its place on the engine's screen, None on another screen), when that is not
/// `asked`: the person moved it.
pub fn moved_from(asked: (i16, i16), pointer: &QueryPointerReply) -> Option<Option<(i16, i16)>> {
    let at = pointer.same_screen.then_some((pointer.root_x, pointer.root_y));
    (at != Some(asked)).then_some(at)
}

/// What confirms a handle's drag and drop under way at its release (its source took `XdndSelection` before it).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confirming {
    /// Chrome's activation request for this window, the managed top-level under the release, which the after-release
    /// watch looks for (T14's ruling on task 68).
    Activation(Window),
    /// An Electron source's drag loop cursor at the release: the accept shown, or not (another cursor, or one that
    /// could not be told).
    Cursor(bool),
    /// Nothing can: a Chrome source over a window that is not Chrome's, where the window manager supports the
    /// activation request (task 73's review: such a drop answered ok).
    Nothing,
    /// The drop is not judged, as before T17: a Chrome source under a window manager without `_NET_ACTIVE_WINDOW`.
    Unjudged,
    /// A drop [`Confirming::Unjudged`] would leave, whose take only the extended hold caught (past B,
    /// `adaptive_hold.rs`): before the extension that take came after the release, and the after-release watch
    /// cancelled and reported it, so it is reported unconfirmed, never a plain ok (the re-review of wave 3, I1).
    Extended,
    /// A drop [`Confirming::Activation`] would confirm, on #459's shape (the outlasted gate open, `release_sync::gate`)
    /// with option (c) on (`release_sync::UNCONFIRM_OUTLASTED`, ruling 995): Chrome asks for that activation as well
    /// when it completes a drop on a stale status the page never took, so it confirms nothing here, and the drop is
    /// reported unconfirmed with that reason (`dnd::WatchEnd::Outlasted`).
    Outlasted,
}

impl Confirming {
    /// Whether the drop is reported unconfirmed at once (an activation request is the watch's to wait for).
    pub(super) fn unconfirmed(self) -> bool {
        matches!(
            self,
            Confirming::Cursor(false) | Confirming::Nothing | Confirming::Extended | Confirming::Outlasted
        )
    }

    /// What confirms a drop the outlasted gate opened on (`outlasted`: the gate open and option (c) on): nothing, when
    /// Chrome's activation request would have been its only confirmation ([`Confirming::Outlasted`]); otherwise what
    /// confirms it already, a stronger confirmation or an answer that is unconfirmed or unjudged already.
    pub(super) fn after_outlasted(self, outlasted: bool) -> Confirming {
        match (self, outlasted) {
            (Confirming::Activation(_), true) => Confirming::Outlasted,
            (confirming, _) => confirming,
        }
    }

    /// How a drop reported unconfirmed at once ends its watch: with its own reason when the outlasted gate made it so,
    /// else as `drop_settle::unconfirmed_end` judges an Electron source's settle (`settle`).
    pub(super) fn unconfirmed_end(self, settle: Option<&crate::drop_settle::Settle>) -> crate::dnd::WatchEnd {
        match self {
            Confirming::Outlasted => crate::dnd::WatchEnd::Outlasted,
            _ => crate::drop_settle::unconfirmed_end(settle),
        }
    }

    /// What confirms a drop whose take came in the extended hold (`extended_take`): nothing can when nothing else
    /// would judge it ([`Confirming::Extended`]); otherwise what confirms any drop.
    pub(super) fn after_hold(self, extended_take: bool) -> Confirming {
        match (self, extended_take) {
            (Confirming::Unjudged, true) => Confirming::Extended,
            (confirming, _) => confirming,
        }
    }
}

/// A step of a handle's end between its rest and the release (`release_handle`): a motion of the real pointer, or a
/// rest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndStep {
    Motion((i16, i16)),
    Rest(Duration),
    /// The pointer read again before a visit after the first: one no longer at this place (a person moved it, or it is
    /// on another screen) ends the visits there, and the release's own read reports the move.
    Check((i16, i16)),
}

/// What a handle's hold for a take at its end saw (ruling 888.1): a take at its first read, which skips the wait, or
/// one in the wait.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct HoldTake {
    pub at_first_read: bool,
    pub in_wait: bool,
}

/// Whether a handle's end settles its Electron drop (`drop_settle::Settle`): the engine settles drops (`on`), the
/// button is down, the family rests at a held move's end (`held_rest`), and a take is seen, by the hold (`hold`, at its
/// first read or in its wait) or by the cursor's watch (`watch_seen`, asked only when the hold saw none). A take the
/// hold saw counts though the watch, on its own thread, may not have read it yet (#488: one the first read saw skipped
/// the settle).
pub fn settles(
    on: bool,
    pressed: bool,
    held_rest: Duration,
    hold: HoldTake,
    watch_seen: impl FnOnce() -> bool,
) -> bool {
    on && pressed && !held_rest.is_zero() && (hold.at_first_read || hold.in_wait || watch_seen())
}

/// Why a handle's end runs no tail (ruling 998, confirmed by 1026), or None when it runs one. The tail is the drag's
/// (`release_sync.rs`) for a Chrome source with a drag and drop under way at the agent's `end`: `form` its form (`off`
/// restores the end of f9d1f86b, for A/B runs), `agent_end` the agent's `end` (the exit's, the idle bound's and a lost
/// handle's releases go at once, as they did), `chrome` a source whose drop Chrome's activation request confirms
/// (`families::confirms_drop`; Electron's settle path is its own), `judging` a take by now on a handle whose
/// after-release watch runs (a Chromium source's).
pub fn tail_refused(
    form: crate::release_sync::Form,
    agent_end: bool,
    chrome: bool,
    judging: bool,
) -> Option<&'static str> {
    match () {
        _ if form == crate::release_sync::Form::Off => Some("the form is off"),
        _ if !agent_end => Some("not the agent's end"),
        _ if !chrome => Some("not a Chrome source"),
        _ if !judging => Some("no drag and drop under way"),
        _ => None,
    }
}

/// What a handle's end sends between its rest and the release, in order. `pointer` is where the real pointer is (None:
/// on another screen, whose place a motion on the engine's root would carry the held pointer back from); `revisit`
/// whether the family rests at a held move's end (`held_rest`), whose end then visits the pointer's place once more.
/// With `tail`, the step each visit takes first (`release_sync::xtest_step`), the end's rest standing in for the tail's
/// first [`crate::release_sync::TAIL_REST`]: [`crate::release_sync::TAIL_VISITS`] visits, each the pointer read again
/// (a person's motion since the place was read ends the tail there, the first visit's too, ruling 1034), then the step
/// and back to the pointer's place, then [`crate::release_sync::TAIL_REST`], in place of the revisit; a family that
/// does not rest takes the first rest first. Without it, f9d1f86b's end: the revisit alone. On another screen, neither.
pub fn end_steps(tail: Option<(i16, i16)>, pointer: Option<(i16, i16)>, revisit: bool) -> Vec<EndStep> {
    let Some(at) = pointer else {
        return Vec::new();
    };
    match tail {
        None if revisit => vec![EndStep::Motion(at)],
        None => Vec::new(),
        Some(step) => {
            let mut steps = Vec::new();
            if !revisit {
                steps.push(EndStep::Rest(crate::release_sync::TAIL_REST));
            }
            for _ in 0..crate::release_sync::TAIL_VISITS {
                steps.extend([
                    EndStep::Check(at),
                    EndStep::Motion(step),
                    EndStep::Motion(at),
                    EndStep::Rest(crate::release_sync::TAIL_REST),
                ]);
            }
            steps
        }
    }
}

/// The calls a handle's end makes at its last take read and its tail ([`read_take_then_tail`]): the hold watch's read,
/// the pointer's motions and place, and the rests. The engine's are [`EngineEnd`]'s; the tests record them.
pub trait EndIo {
    /// The hold watch's read just before the release (None: no hold watch).
    fn read_take(&mut self) -> Option<Result<Held>>;
    fn motion(&mut self, at: (i16, i16)) -> Result<()>;
    fn rest(&mut self, rest: Duration);
    /// The pointer's place (None: on another screen, or unread).
    fn place(&mut self) -> Option<(i16, i16)>;
}

/// The engine's [`EndIo`]: its X connection and the handle's hold watch.
struct EngineEnd<'a> {
    x: &'a X11,
    holding: Option<&'a mut (HoldWatch, Holding)>,
}

impl EndIo for EngineEnd<'_> {
    fn read_take(&mut self) -> Option<Result<Held>> {
        self.holding
            .as_deref_mut()
            .map(|(watch, holding)| watch.before_release(holding))
    }

    fn motion(&mut self, (mx, my): (i16, i16)) -> Result<()> {
        Desktop::motion(self.x, mx, my)
    }

    fn rest(&mut self, rest: Duration) {
        std::thread::sleep(rest);
    }

    fn place(&mut self) -> Option<(i16, i16)> {
        self.x
            .conn
            .query_pointer(self.x.root)
            .ok()
            .and_then(|c| c.reply().ok())
            .filter(|p| p.same_screen)
            .map(|p| (p.root_x, p.root_y))
    }
}

/// What decides a handle's tail ([`read_take_then_tail`]): `form` the release-sync form, `agent_end` the agent's `end`
/// of a pressed handle, `chrome` a Chrome source, `watched` its after-release watch runs, `previous` and `place` the
/// last segment's start and the pointer's place read after the rest (None: on another screen), `screen` its size.
#[derive(Debug, Clone, Copy)]
pub struct TailInputs {
    pub form: crate::release_sync::Form,
    pub agent_end: bool,
    pub chrome: bool,
    pub watched: bool,
    pub previous: Option<(i16, i16)>,
    pub place: Option<(i16, i16)>,
    pub screen: (u16, u16),
}

/// What [`read_take_then_tail`] read and did: the hold watch's read, why no tail ran (None: it ran), and the tail's run.
#[derive(Debug)]
pub struct EndedTail {
    pub held: Option<Result<Held>>,
    pub refused: Option<&'static str>,
    pub run: Result<EndRun>,
}

/// A handle's last take read, and the tail it decides (rulings 998 and 1030; the re-review of 9fb61c32, 1). The hold
/// watch is read once, just before the release, as f9d1f86b read it: that read is the one take sample, which the tail
/// and the release's judgement share, and a take it does not see is the after-release watch's to cancel or report, as
/// at any release with no take seen. With a take under way at a Chrome source's agent end, the tail follows: the pointer
/// read again, then unless it moved the step along the last segment and back to the pointer's place and
/// [`crate::release_sync::TAIL_REST`], and the same once more ([`run_end`]). Every other end makes no call past the read.
pub fn read_take_then_tail(io: &mut impl EndIo, t: TailInputs) -> EndedTail {
    let held = io.read_take();
    let taken = matches!(&held, Some(Ok(h)) if h.taken);
    let refused = match tail_refused(t.form, t.agent_end, t.chrome, taken && t.watched) {
        None if t.place.is_none() => Some("the pointer is on another screen"),
        refused => refused,
    };
    let run = match (refused, t.place) {
        (None, Some(at)) => {
            let plan = end_plan(None, t.previous, Some(at), t.screen, true);
            let io = std::cell::RefCell::new(io);
            run_end(
                plan,
                |p| io.borrow_mut().motion(p),
                |d| io.borrow_mut().rest(d),
                || io.borrow_mut().place(),
            )
        }
        _ => Ok(EndRun::default()),
    };
    EndedTail { held, refused, run }
}

/// What a handle's end's plan did ([`run_end`]): the motions it sent, and whether a check found the pointer moved and
/// ended it there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct EndRun {
    pub motions: u32,
    pub stopped: bool,
}

/// Runs a handle's end's plan: `motion` sends each motion, `rest` waits each rest, and `read` reads the pointer's place
/// for each check (None: on another screen, or unread). A check that finds the pointer elsewhere sends nothing more
/// (the review of f15e1f09, 2: a person's motion during a rest is never overwritten before the button goes up). A
/// motion that fails ends it with its error.
pub fn run_end(
    plan: Vec<EndStep>,
    mut motion: impl FnMut((i16, i16)) -> Result<()>,
    mut rest: impl FnMut(Duration),
    mut read: impl FnMut() -> Option<(i16, i16)>,
) -> Result<EndRun> {
    let mut run = EndRun::default();
    for step in plan {
        match step {
            EndStep::Motion(at) => {
                motion(at)?;
                run.motions += 1;
            }
            EndStep::Rest(d) => rest(d),
            EndStep::Check(at) if read() != Some(at) => {
                run.stopped = true;
                break;
            }
            EndStep::Check(_) => {}
        }
    }
    Ok(run)
}

/// What confirms a handle's drop whose tail a check stopped (`interrupted`; the re-review of 9fb61c32, 2): nothing
/// ([`Confirming::Nothing`], reported unconfirmed at once), whatever would have confirmed it, so a person who brings the
/// pointer back where the last request put it never leaves a plain ok; otherwise what confirms it already.
pub fn unconfirmed_when(confirmed: Option<Confirming>, interrupted: bool) -> Option<Confirming> {
    match interrupted {
        true => confirmed.map(|_| Confirming::Nothing),
        false => confirmed,
    }
}

/// The end's whole plan between the rest and the release: [`end_steps`] with the tail when [`tail_refused`] gave
/// `refused` None, its step along the last segment from `previous` (the handle's point before its end; None for a
/// handle that never moved) to the pointer's own `pointer` place, on a screen `screen` wide and high.
pub fn end_plan(
    refused: Option<&'static str>,
    previous: Option<(i16, i16)>,
    pointer: Option<(i16, i16)>,
    screen: (u16, u16),
    revisit: bool,
) -> Vec<EndStep> {
    let step = match (refused, pointer) {
        (None, Some(at)) => {
            let segment: Vec<(i16, i16)> = previous.into_iter().chain([at]).collect();
            Some(crate::release_sync::xtest_step(&segment, screen))
        }
        _ => None,
    };
    end_steps(step, pointer, revisit)
}

/// What confirms a handle's drop: `destination` the managed top-level under the release when its family confirms by
/// activation (Chrome's), `supported` whether the window manager lists that request, `cursor` an Electron source's
/// accept at the release (None for any other source; `Some(None)` when it could not be told).
pub fn confirming(destination: Option<Window>, supported: bool, cursor: Option<Option<bool>>) -> Confirming {
    match (destination, supported, cursor) {
        (Some(window), true, _) => Confirming::Activation(window),
        (_, _, Some(accepted)) => Confirming::Cursor(accepted == Some(true)),
        (_, true, None) => Confirming::Nothing,
        (_, false, None) => Confirming::Unjudged,
    }
}

/// Whether a drop handed to Chrome's activation is an Electron source's whose settle failed (`settled`: None with no
/// settle): ruling 835 keeps the activation's precedence, and 837 records the case in `--stats` alone.
pub fn activation_over_failed_settle(confirming: Confirming, settled: Option<bool>) -> bool {
    matches!(confirming, Confirming::Activation(_)) && settled == Some(false)
}

/// A `drag_handle` between its start (or a move with no start in this engine) and its end.
pub(super) struct Handle {
    /// The drag's waits, by the start's family.
    pacing: DragPacing,
    /// Button 1 went down at the start (false for a move with no start, which presses nothing).
    pressed: bool,
    /// When it went down: the hold for a Chromium source's take at the end counts from it (`dnd::TAKE_HOLD_AFTER_PRESS`).
    pressed_at: Option<Instant>,
    /// The top-level window under the start point.
    target: Option<Window>,
    /// Where the real pointer was last put: the start, then each move's end, on the screen.
    asked: (i16, i16),
    /// Where it was put before that, when a move took it elsewhere: the last segment's start, whose direction the end's
    /// tail steps along (`release_sync::xtest_step`, ruling 998). None for a handle that never moved off its start.
    previous: Option<(i16, i16)>,
    /// The screen's width and height, read at the start and each move (the tail's step never leaves it).
    screen: (u16, u16),
    /// The hold watch on the target, from just before the press.
    holding: Option<(HoldWatch, Holding)>,
    /// A Chromium target's after-release watch, subscribed before the press.
    after: Option<LateWatch>,
    /// An Electron target's displayed cursor, watched from before the press for its drop's confirmation
    /// (`drop_cursor.rs`), or why the watch could not start, which confirms nothing.
    cursor: Option<std::result::Result<DropCursor, String>>,
    /// Whether its Chromium source is a Chrome or Chromium browser (`browser.rs`), identified at the start, before the
    /// press: an identified one's hold at the end is adaptive (`adaptive_hold.rs`).
    browser: std::result::Result<String, String>,
    /// When its last request came, its start or a move: the engine releases it once it is [`HANDLE_IDLE`] past.
    last_request: Instant,
}

/// Why a handle's hold is not adaptive: its source is no Chromium-family window, so it holds for no take.
const NOT_CHROMIUM: &str = "not a Chromium-family source";

impl Handle {
    /// A move with no start: its family's pacing, nothing pressed and nothing watched.
    fn unpressed(pacing: DragPacing) -> Handle {
        Handle {
            pacing,
            pressed: false,
            pressed_at: None,
            target: None,
            asked: (0, 0),
            previous: None,
            screen: (u16::MAX, u16::MAX),
            holding: None,
            after: None,
            cursor: None,
            last_request: Instant::now(),
            browser: Err(NOT_CHROMIUM.into()),
        }
    }
}

/// What a handle's release did: the end's answer, where the button went up (None: on another screen, or the pointer
/// could not be read), and the application the answers name.
struct Released {
    answer: Result<()>,
    at: Option<(i16, i16)>,
    app: String,
}

/// The pre-press try: under a server grab, the deepest window under the pointer found, a pointer grab on it tried and
/// given up in the same request batch (nothing waits between the two), then the server let go; answers the grab's
/// status. `AlreadyGrabbed` (or `Frozen`) means another client holds the pointer. The grab is on the window the pointer
/// is in, so it crosses nothing (task 73's probe on xterm, Chrome and Electron: evidence `m4/drag-handle/`).
fn pointer_free(x: &X11) -> Result<GrabStatus> {
    let clicker = crate::desktop::handle_hooks::before_try();
    x.conn.grab_server()?;
    let tried = (|| -> Result<GrabStatus> {
        let mut window = x.root;
        for _ in 0..32 {
            let child = x.conn.query_pointer(window)?.reply()?.child;
            if child == x11rb::NONE {
                break;
            }
            window = child;
        }
        crate::desktop::handle_hooks::during_try(clicker.as_ref());
        let (none, now, mode) = (x11rb::NONE, x11rb::CURRENT_TIME, GrabMode::ASYNC);
        let grab = x
            .conn
            .grab_pointer(false, window, EventMask::NO_EVENT, mode, mode, none, none, now)?;
        // a grab this client does not hold (the try refused) is not let go: the request does nothing then
        x.conn.ungrab_pointer(now)?;
        Ok(grab.reply()?.status)
    })();
    let ungrabbed = x
        .conn
        .ungrab_server()
        .map_err(anyhow::Error::from)
        .and_then(|_| Ok(x.conn.flush()?));
    crate::desktop::handle_hooks::after_try(clicker);
    let status = tried?;
    ungrabbed?;
    Ok(status)
}

fn status_name(status: GrabStatus) -> &'static str {
    match status {
        GrabStatus::SUCCESS => "success",
        GrabStatus::ALREADY_GRABBED => "already_grabbed",
        GrabStatus::FROZEN => "frozen",
        GrabStatus::NOT_VIEWABLE => "not_viewable",
        _ => "invalid_time",
    }
}

impl Engine {
    /// `drag_handle`'s requests (module header): the vendor's events, with the drag's waits by the start's family
    /// (`held_step` between a held move's points, `held_rest` at its end), the press after the pre-press try, and the
    /// end's answers from its watches.
    pub(super) fn drag_handle(&mut self, input: Option<Value>) -> Result<Value> {
        let input: DragHandleInput = parse_input(input)?;
        // a handle the idle bound released: every later move or end of it is refused until a new start. The engine,
        // not cua's service, tells it from the wire's move with no start: only the engine saw the release, and its
        // handle has no id the service could name (`Engine::expired_handle`)
        if let (Some((app, at)), DragHandleInput::MoveTo { .. } | DragHandleInput::End) = (&self.expired_handle, &input)
        {
            bail!(handle_expired(app, self.cfg.handle_idle, *at));
        }
        match input {
            DragHandleInput::Start { x: px, y: py } => self.start_drag_handle(px, py)?,
            DragHandleInput::MoveTo { x: px, y: py } => {
                // a move with no start in this engine (the wire allows it): the window under the pointer decides
                if self.handle.is_none() {
                    let pointer = self.x.conn.query_pointer(self.x.root)?.reply()?;
                    let window = self.x.client_at(pointer.root_x, pointer.root_y);
                    self.handle = Some(Handle::unpressed(self.drag_pacing_for(window)));
                }
                let size = screen_size(&self.x);
                let handle = self.handle.as_mut().expect("set above");
                let asked = on_screen((px, py), size);
                if asked != handle.asked {
                    handle.previous = Some(handle.asked);
                }
                handle.asked = asked;
                handle.screen = size;
                handle.last_request = Instant::now();
                let pacing = handle.pacing;
                Desktop::move_path_paced(
                    &self.x,
                    px,
                    py,
                    pacing.held_step,
                    pacing.held_lead_pause,
                    pacing.held_rest,
                )?;
                // the bound counts from the move's end: a long held move is no idle time
                if let Some(handle) = self.handle.as_mut() {
                    handle.last_request = Instant::now();
                }
            }
            DragHandleInput::End => self.end_drag_handle(true)?,
        }
        Ok(Value::Null)
    }

    /// Whether a `drag_handle` holds button 1: begun with a press and not ended.
    pub(super) fn drag_handle_held(&self) -> bool {
        self.handle.as_ref().is_some_and(|h| h.pressed)
    }

    /// The refusal of pointer input on `way` while a handle is held: through XTEST (the desktop and foreground routes)
    /// its button would end the hold; on the background route it is synthetic and leaves the hold alone.
    pub(super) fn refuse_while_held(&self, way: Way) -> Result<()> {
        if way != Way::Background && self.drag_handle_held() {
            bail!(handle_held(self.cfg.handle_idle));
        }
        Ok(())
    }

    /// When a held handle is released for its idle bound (`serve.rs` waits for it between requests).
    pub(super) fn handle_due(&self) -> Option<Instant> {
        self.handle
            .as_ref()
            .filter(|h| h.pressed)
            .map(|h| h.last_request + self.cfg.handle_idle)
    }

    /// A held handle whose idle bound has passed with no request of its own released where the pointer is, as its end
    /// would release it: what that did is pending, as a watch's end is, every reply carrying it and the next acting
    /// request, or the handle's own `end`, refused with it (the design session's ruling on task 73's review). A
    /// Chromium handle's after-release watch is run out first, so a late take is still cancelled at once; the timeout's
    /// notice, which says the release may have dropped and changed the desktop, stands for what it saw. Its record goes
    /// on a `--stats` line of its own. Nothing happens before the bound.
    pub(super) fn release_idle_handle(&mut self) {
        if self.handle_due().is_none_or(|due| due > Instant::now()) {
            return;
        }
        let handle = self.handle.take().expect("a held handle is due");
        // the request's own record, if one is being built, is kept apart from the release's
        let request_extra = std::mem::take(&mut self.extra);
        let released = self.release_handle(handle, false);
        if let Some(watch) = &self.late_watch {
            watch.run_out();
        }
        self.collect_late_watch(true);
        let end = WatchEnd::IdleHandle {
            idle: self.cfg.handle_idle,
            at: released.at,
        };
        if self.cfg.stats {
            let mut record = serde_json::Map::new();
            record.insert("idle_handle".into(), super::late_stats(&released.app, &end));
            record.insert(
                "answer".into(),
                json!(released.answer.as_ref().err().map(|e| format!("{e:#}"))),
            );
            for (key, value) in std::mem::take(&mut self.extra) {
                record.insert(key, value);
            }
            eprintln!("{}", super::standalone_stats_line(record, &self.drop_settles));
        }
        self.extra = request_extra;
        self.expired_handle = Some((released.app.clone(), released.at));
        self.late_pending = Some((released.app, end));
        self.report_sent();
    }

    /// How the idle watchdog tells a held Chromium handle's after-release watch of its release (`idle_watchdog.rs`).
    pub(super) fn handle_release_teller(&self) -> Option<crate::dnd::ReleaseTeller> {
        self.handle
            .as_ref()
            .and_then(|h| h.after.as_ref())
            .map(LateWatch::release_teller)
    }

    /// A held handle the idle watchdog released while a request ran (`idle_watchdog.rs`), collected once that request
    /// is done, as [`Engine::release_idle_handle`] leaves its own release: the hold watch read and kept, the
    /// after-release watch (told of the release by the watchdog) run out and collected, and the timeout pending, so the
    /// request's own reply carries it and the next acting request, or the handle's `end`, is refused with it. A release
    /// that failed may have left the button down: the engine's own release goes then, the bound being past.
    pub(super) fn collect_watchdog_release(&mut self, fired: super::idle_watchdog::Fired) {
        if fired.error.is_some() {
            self.extra
                .insert("idle_watchdog".into(), json!({ "error": fired.error }));
            self.release_idle_handle();
            return;
        }
        let Some(mut handle) = self.handle.take() else {
            return;
        };
        let request_extra = std::mem::take(&mut self.extra);
        let taken = match handle.holding.as_mut() {
            Some((watch, holding)) => watch.before_release(holding).is_ok_and(|held| held.taken),
            None => false,
        };
        let app = self.app_of_handle(handle.target);
        if let Some((mut watch, holding)) = handle.holding.take() {
            watch.finish(holding);
            if self.hold_watch.is_none() {
                self.hold_watch = Some(watch).filter(HoldWatch::healthy);
            }
        }
        if let Some(after) = handle.after.take() {
            after.released_elsewhere(fired.at, taken);
            self.collect_late_watch(true);
            let watch = after.handed_over(app.clone());
            watch.run_out();
            self.late_watch = Some(watch);
            self.collect_late_watch(true);
        }
        let end = WatchEnd::IdleHandle {
            idle: self.cfg.handle_idle,
            at: fired.pointer,
        };
        if self.cfg.stats {
            let mut record = serde_json::Map::new();
            record.insert("idle_handle".into(), super::late_stats(&app, &end));
            record.insert("by".into(), json!("watchdog"));
            record.insert("taken".into(), json!(taken));
            for (key, value) in std::mem::take(&mut self.extra) {
                record.insert(key, value);
            }
            eprintln!("{}", super::standalone_stats_line(record, &self.drop_settles));
        }
        self.extra = request_extra;
        self.expired_handle = Some((app.clone(), fired.pointer));
        self.late_pending = Some((app, end));
    }

    /// The application a handle's answers name: its target's, or the window under the pointer's.
    fn app_of_handle(&mut self, target: Option<Window>) -> String {
        match target {
            Some(window) => self
                .x
                .get_window(window)
                .map_or_else(|_| format!("window {window}"), |w| w.app),
            None => "the window under the pointer".to_string(),
        }
    }

    /// cua's `release_handle`, which its service sends when the REPL state that held a handle is gone (a new kernel's
    /// setup, after `js_reset` or a cell's timeout; the design session's ruling on task 73's review): nothing will end
    /// that handle, so a held one is released at once, as its end would release it, and what that leaves pending (a
    /// Chromium drop's after-release watch) is reported as an end's is. The end's own answer goes on the `--stats` line
    /// alone: nobody is left to read it. A handle that holds nothing (a move with no start) is dropped; with none,
    /// nothing is sent, and a handle the idle bound already released keeps its notice.
    pub(super) fn release_lost_handle(&mut self) -> Value {
        // the kernel whose handle the idle bound released is gone too: a new kernel's handles start afresh
        self.expired_handle = None;
        let Some(handle) = self.handle.take() else {
            return Value::Null;
        };
        if !handle.pressed {
            self.drop_handle_watches(handle);
            return Value::Null;
        }
        let released = self.release_handle(handle, false);
        self.extra.insert(
            "released_handle".into(),
            json!({ "at": released.at, "answer": released.answer.err().map(|e| format!("{e:#}")) }),
        );
        Value::Null
    }

    /// `start`: the pointer moved to the point (the vendor's own move), the watches begun, the pre-press try, then the
    /// press and the family's wait after it. A refusal or a failure leaves nothing pressed and nothing watched.
    fn start_drag_handle(&mut self, px: i16, py: i16) -> Result<()> {
        if self.drag_handle_held() {
            bail!(handle_held(self.cfg.handle_idle));
        }
        let target = self.x.client_at(px, py);
        let pacing = self.drag_pacing_for(target);
        self.inputs.desktop.move_path(&self.x, px, py)?;
        let mut handle = Handle {
            pacing,
            pressed: false,
            pressed_at: None,
            target,
            asked: on_screen((px, py), screen_size(&self.x)),
            previous: None,
            screen: screen_size(&self.x),
            holding: None,
            after: None,
            cursor: None,
            last_request: Instant::now(),
            browser: Err(NOT_CHROMIUM.into()),
        };
        let started = (|| -> Result<()> {
            if let Some(window) = target {
                let mut watch = match self.hold_watch.take() {
                    Some(watch) => watch,
                    None => HoldWatch::connect()?,
                };
                match watch.begin(window) {
                    Ok(holding) => handle.holding = Some((watch, holding)),
                    Err(error) => {
                        self.hold_watch = Some(watch).filter(HoldWatch::healthy);
                        return Err(error);
                    }
                }
                if self.blink(window) {
                    handle.browser = self.browser_source(window);
                    let escape = chord_keycodes(&self.x, "Escape")?;
                    handle.after = Some(LateWatch::start(
                        window,
                        EscapeRoute::Xtest,
                        escape[0],
                        Confirm::AtRelease,
                    )?);
                    if self
                        .family_of(window)
                        .is_some_and(|f| crate::families::confirms_drop_by_cursor(f.name))
                    {
                        handle.cursor = Some(DropCursor::start_for(Some(window)).map_err(|e| format!("{e:#}")));
                    }
                }
            }
            let tried = Instant::now();
            let status = pointer_free(&self.x)?;
            self.extra.insert(
                "handle".into(),
                json!({
                    "target": target,
                    "try": status_name(status),
                    "try_ms": tried.elapsed().as_secs_f64() * 1000.0,
                    "watched": handle.holding.is_some(),
                    "after_release_watch": handle.after.is_some(),
                    "drop_cursor": handle.cursor.as_ref().map(|c| c.as_ref().err().cloned()),
                }),
            );
            if status != GrabStatus::SUCCESS {
                bail!(POINTER_HELD_ELSEWHERE);
            }
            Desktop::motion(&self.x, px, py)?;
            handle.pressed = true;
            handle.pressed_at = Some(Instant::now());
            Desktop::button(&self.x, 1, true)
        })();
        if let Err(error) = started {
            // a press that may have gone out is taken back, so a failed start holds nothing
            if handle.pressed {
                let _ = Desktop::button(&self.x, 1, false);
            }
            self.drop_handle_watches(handle);
            return Err(error);
        }
        std::thread::sleep(pacing.press);
        handle.last_request = Instant::now();
        self.handle = Some(handle);
        self.expired_handle = None;
        Ok(())
    }

    /// A handle's watches ended with nothing to report: the hold watch's connection kept for the next handle, the
    /// after-release watch done.
    fn drop_handle_watches(&mut self, handle: Handle) {
        if let Some((mut watch, holding)) = handle.holding {
            watch.finish(holding);
            if self.hold_watch.is_none() {
                self.hold_watch = Some(watch).filter(HoldWatch::healthy);
            }
        }
        if let Some(after) = handle.after {
            after.done();
        }
    }

    /// `drag_handle`'s end (module header): the release, then its answer. An end with no start releases where the
    /// pointer is, as the vendor's does. The engine's exit ends a handle still held the same way (`Engine::shutdown`),
    /// with no hold for a Chromium source's take (`hold` false; [`Engine::release_handle`]).
    pub(super) fn end_drag_handle(&mut self, hold: bool) -> Result<()> {
        let Some(handle) = self.handle.take() else {
            return Desktop::button(&self.x, 1, false);
        };
        self.release_handle(handle, hold).answer
    }

    /// A handle's release: for a family that rests at a held move's end (`held_rest`), a rest and the pointer's place
    /// visited once more, so the last position before the release comes after the target answered the ones before it
    /// (a drop target accepts only such a position, and a cold window's drag can start after the last move; evidence
    /// `m4/drag-motion/`), unless the pointer is on another screen of the display, which the visit would carry it back
    /// from; then the release dwell its start found; the hold watch read; then the pointer read again, which says where
    /// the release goes and whether the person moved it, and what confirms a drag and drop under way ([`confirming`]);
    /// then button 1 up where the pointer is, sent whatever came before. A Chromium handle's after-release watch is told
    /// of the release and handed over as a `drag`'s is, or the drop is pending unconfirmed at once. The answer: the
    /// release's error, else the hold's (a cut, or a watch that failed), else the pointer found away from where the last
    /// request put it, else success. With `hold` (the agent's `end`), a Chromium source's handle whose source has not
    /// taken `XdndSelection` first keeps its button down for the take until the bound after its press
    /// (`dnd::TAKE_HOLD_AFTER_PRESS`, ruling 888.1), its source pinged meanwhile (`hold_ping.rs`, measurement only). A
    /// take then gets the rest after it, as any take; with none, the hold's motionless wait is the rest, so the visit and
    /// the release follow it at the bound.
    fn release_handle(&mut self, mut handle: Handle, hold: bool) -> Released {
        let pacing = handle.pacing;
        let bound = self.cfg.dnd_hold;
        // the hold for a Chromium source's take at the end (ruling 888.1): with no take yet, the button stays down until
        // the bound after the press for one, with no motion; a take then is a drag and drop under way, settled and
        // judged below as a take before the end is. Only at the agent's `end`: the exit's, the idle bound's and a lost
        // handle's releases go at once, as they did, so the exit stays inside its backstop and nobody's drop begins then
        let mut held_take = false;
        // what the hold saw of a take, at its first read or in its wait: the settle below counts either
        let mut hold_take = HoldTake::default();
        // whether that take came only in the extended hold, past B (`Confirming::Extended`)
        let mut extended_take = false;
        let mut hold_record = Value::Null;
        // how long a hold with no take kept the pointer still up to its end: the rest before the release, which it
        // serves, so a release with no take comes at the bound and not a rest after it (the review of task 115, P3)
        let mut still = Duration::ZERO;
        if hold
            && handle.pressed
            && handle.after.is_some()
            && let (Some(pressed_at), Some(target)) = (handle.pressed_at, handle.target)
            && let Some((watch, holding)) = handle.holding.as_mut()
        {
            let ms = |d: Duration| d.as_secs_f64() * 1000.0;
            let since = Instant::now();
            let deadline = pressed_at + bound;
            let taken_by_now = watch.before_release(holding).is_ok_and(|held| held.taken);
            let held = since < deadline && !taken_by_now;
            let ping = self.cfg.dnd_hold_ping;
            let pings = held.then(|| match ping {
                true => HoldPing::start(target, deadline),
                false => HoldPing::off(),
            });
            let mut adaptive_record = Value::Null;
            if held {
                let take_hold = super::pointer::TakeHold {
                    bound,
                    source: target,
                    ping,
                    browser: handle.browser.clone(),
                };
                let mut end = take_hold.end(pressed_at, pings.as_ref());
                held_take =
                    crate::dnd::wait_for_take(|| watch.before_release(holding).is_ok_and(|held| held.taken), &mut end);
                if held_take {
                    end.taken(Instant::now());
                }
                if end.way() == crate::adaptive_hold::Way::Noticed {
                    self.hold_notice = Some(crate::adaptive_hold::NOTICE);
                }
                extended_take = end.way() == crate::adaptive_hold::Way::Extended;
                adaptive_record = end.record();
            }
            let ended = Instant::now();
            if held && !held_take {
                still = ended - since;
            }
            hold_take = HoldTake {
                at_first_read: taken_by_now,
                in_wait: held_take,
            };
            hold_record = json!({
                "bound_ms": ms(bound),
                "start_after_press_ms": ms(since.saturating_duration_since(pressed_at)),
                "held": held,
                "waited_ms": ms(if held { ended - since } else { Duration::ZERO }),
                "taken": held_take || taken_by_now,
                "take_after_press_ms": held_take.then(|| ms(ended.saturating_duration_since(pressed_at))),
                "pings": crate::hold_ping::hold_record(pings, pressed_at, ended),
                "adaptive": adaptive_record,
            });
        }
        // an Electron source whose drag and drop has begun: its application asked where it has got to before the rest,
        // and again after the visit that follows it (`drop_settle::Settle`), each waited for at most
        // `drop_settle::SYNC_BOUND`, with a second rest when the first answer came late (ruling 3a). A drag loop that
        // runs behind the pointer is waited for here, so the rest is the page's to answer the pointer's last place, and
        // the release reaches a loop that holds that answer. A take the hold above saw counts though the cursor's
        // watch, on its own thread, may not have read it yet
        let settling = matches!(&handle.cursor, Some(Ok(cursor))
            if settles(self.cfg.drop_settle, handle.pressed, pacing.held_rest, hold_take, || cursor.take_seen()));
        let before_rest = match handle.cursor.as_mut() {
            Some(Ok(cursor)) if settling => Some(cursor.sync_and_rest(pacing.held_rest)),
            _ => {
                std::thread::sleep(pacing.held_rest.saturating_sub(still));
                None
            }
        };
        let pointer = self.query_pointer();
        // with the pointer on another screen the reply's place is on that screen's root: a motion to it on the engine's
        // own root would carry the held pointer back across before the release
        let revisited = match (&pointer, pacing.held_rest.is_zero()) {
            (_, true) => Ok(()),
            (Ok(p), false) if p.same_screen => Desktop::motion(&self.x, p.root_x, p.root_y),
            (Ok(_), false) => Ok(()),
            (Err(error), false) => Err(anyhow::anyhow!("{error:#}")),
        };
        crate::desktop::handle_hooks::during_dwell();
        std::thread::sleep(pacing.release);
        let settle = match (before_rest, handle.cursor.as_mut()) {
            (Some((before, second_rest)), Some(Ok(cursor))) => Some(crate::drop_settle::Settle {
                before,
                second_rest,
                after: cursor.sync(crate::drop_settle::SYNC_BOUND),
            }),
            _ => None,
        };
        // the hold watch's read just before the release, the one take sample (ruling 1030), and the tail at the end of a
        // Chrome source's drop under way it decides (ruling 998): a take it does not see is the after-release watch's,
        // as at any release with no take, so every end makes f9d1f86b's calls up to the release but for the tail's own
        let chrome = handle.target.is_some_and(|window| {
            self.family_of(window)
                .is_some_and(|f| crate::families::confirms_drop(f.name))
        });
        let place = match &pointer {
            Ok(p) if p.same_screen => Some((p.root_x, p.root_y)),
            _ => None,
        };
        let tail_started = Instant::now();
        let ended = read_take_then_tail(
            &mut EngineEnd {
                x: &self.x,
                holding: handle.holding.as_mut(),
            },
            TailInputs {
                form: self.cfg.dnd_release_sync,
                agent_end: hold && handle.pressed,
                chrome,
                watched: handle.after.is_some(),
                previous: handle.previous,
                place,
                screen: handle.screen,
            },
        );
        let tail_added = tail_started.elapsed();
        let held = ended.held;
        let (taken, take_time) = match &held {
            Some(Ok(Held { taken, take_time, .. })) => (*taken, *take_time),
            _ => (false, None),
        };
        let tailing = ended.refused.is_none();
        let tail_run = ended.run.as_ref().copied().unwrap_or_default();
        // a tail motion that failed is the end's error, as a revisit's was
        let revisited = revisited.and(ended.run.map(|_| ()));
        let mut tail_record = json!({
            "form": self.cfg.dnd_release_sync.name(),
            "schedule": "handle_end",
            "ran": tailing,
            "why_not": ended.refused,
            "motions": tail_run.motions,
            // a person moved the pointer during a rest: the visits ended there (the review of f15e1f09, 2)
            "stopped_for_motion": tail_run.stopped,
            "added_ms": tailing.then_some(tail_added.as_secs_f64() * 1000.0),
            "one_point": tailing && handle.previous.is_none(),
            "xtest_proof": "live test only, no counted rate",
        });
        // a drag and drop under way: whether the window manager takes Chrome's activation request, read before the
        // pointer, and an Electron source's cursor watch stopped, so only the lookups the place needs come between the
        // pointer's reading and the release
        let judging = taken && handle.after.is_some();
        let supported = judging && crate::dnd::active_window_supported(&self.x).unwrap_or(false);
        if judging && let Some(Ok(cursor)) = handle.cursor.as_mut() {
            cursor.stop();
        }
        // the pointer at the release, read after the dwell and the hold watch's round trip (the review of task 73: a
        // motion during them went unseen): where the button goes up, whether the person moved it, the drop's window
        let at_release = self.query_pointer();
        let at = match &at_release {
            Ok(p) if p.same_screen => Some((p.root_x, p.root_y)),
            _ => None,
        };
        let moved = match &at_release {
            Ok(p) if handle.pressed => moved_from(handle.asked, p),
            _ => None,
        };
        let mut cursor_record = None;
        let mut cursor_read = None;
        // the managed top-level under the release, past the drag image: where the drop goes, if anywhere
        let under = match (judging, at) {
            (true, Some((rx, ry))) => self.x.managed_client_at(rx, ry),
            _ => None,
        };
        let mut confirmed = judging.then(|| {
            let destination = under.filter(|&window| self.confirms_by_activation(window));
            let cursor = handle.cursor.as_mut().map(|watch| match watch {
                Ok(watch) => {
                    let read = watch.at_release(take_time);
                    cursor_record = Some(read.record());
                    let accepted = read.accepted;
                    cursor_read = Some(read);
                    accepted
                }
                Err(error) => {
                    cursor_record = Some(json!({ "accepted": null, "error": error }));
                    None
                }
            });
            confirming(destination, supported, cursor).after_hold(extended_take)
        });
        // a tail the pointer check stopped answers unconfirmed whenever the position check below would pass (the
        // re-review of 9fb61c32, 2)
        let interrupted = tail_run.stopped && moved.is_none();
        confirmed = unconfirmed_when(confirmed, interrupted);
        tail_record["interrupted_unconfirmed"] = json!(interrupted);
        if let Some(after) = &handle.after {
            after.confirm_drop_of(match confirmed {
                Some(Confirming::Activation(window)) => Some(window),
                _ => None,
            });
        }
        // stamped as the release goes out: Chrome's confirmation answers the release itself (as a `drag`'s)
        let released_at = Instant::now();
        let release_wall = super::pointer::wall_ms();
        let released = Desktop::button(&self.x, 1, false);
        if released.is_ok()
            && let Some(after) = &handle.after
        {
            after.released(released_at, taken, handle.pressed_at.map(|at| at + bound));
        }
        // an Electron accept confirms only a release over a window that takes drag and drop, and only one put up after
        // the pointer came into it: Chromium keeps its last status's accept when the path leaves for one that does not
        // (the bare root, an xterm), or for one that has not answered yet, and drops nowhere (the design session's
        // ruling, 2026-11-11; the third review, P2)
        // and only one the application had settled on: it answered before the rest and after the last motion, the
        // pointer at rest between (M5's ruling 827: an accept read while the drag loop ran behind the pointer answered
        // ok for a release outside the zone)
        let settled = settle.map(|settle| {
            let steps = cursor_read.as_ref().map_or(&[][..], |read| &read.steps[..]);
            let settled = settle.settled(steps, true);
            self.drop_settles.count(&settle, settled);
            if let Some(Value::Object(record)) = cursor_record.as_mut() {
                record.insert("settle".into(), settle.record(steps, true));
            }
            settled
        });
        if let (Some(Confirming::Cursor(true)), Some(read)) = (confirmed, &cursor_read) {
            let (held, over) = self.accept_held_to_release(read, at);
            let counted = held && (settled == Some(true) || !self.cfg.drop_settle);
            confirmed = Some(Confirming::Cursor(counted));
            if let Some(Value::Object(record)) = cursor_record.as_mut() {
                record.insert("release_over".into(), over);
                // what `linux-engine-v0.4.0` answered on this read, beside what the settle left of it
                record.insert("accept_unsettled".into(), json!(held));
            }
        }
        let app = self.app_of_handle(handle.target);
        if let Some((mut watch, holding)) = handle.holding.take() {
            watch.finish(holding);
            if self.hold_watch.is_none() {
                self.hold_watch = Some(watch).filter(HoldWatch::healthy);
            }
        }
        self.extra.insert(
            "handle".into(),
            json!({
                "target": handle.target,
                "pressed": handle.pressed,
                "held": match &held {
                    None => Value::Null,
                    Some(Ok(h)) => json!({ "cut": h.cut, "taken": h.taken, "take_time": h.take_time }),
                    Some(Err(error)) => json!({ "failed": format!("{error:#}") }),
                },
                "moved": moved.is_some(),
                "confirming": matches!(confirmed, Some(Confirming::Activation(_))),
                "confirmed_by": confirmed.map(|c| format!("{c:?}")),
                // ruling 837, placed by 838: true once Chrome's activation confirmed a drop whose Electron source's
                // settle failed (set when its watch is collected, which the line waits for under `--stats`), and
                // counted in `drop_settles`
                "settle_failed_activation_confirmed": false,
                "drop_cursor": cursor_record,
                // the harness lines the release up with its own watchers (`--stats` only)
                "release_wall_ms": release_wall,
                // the hold for the take at the end (ruling 888.1), null when none was due: an `end` request's alone
                "hold": hold_record,
                // the tail at the end of a Chrome source's drop under way (ruling 998), and why none ran
                "release_sync": tail_record,
            }),
        );
        // the after-release watch, handed over as a `drag`'s: after a release with no take (the late take is the
        // watch's to cancel and report), or after a take on a drop Chrome's activation request confirms; a drop under
        // way that the cursor did not confirm, or that nothing can, is pending unconfirmed at once
        if let Some(after) = handle.after.take() {
            match (after.released_with_take(), confirmed) {
                (Some(false), _) | (Some(true), Some(Confirming::Activation(_))) => {
                    // an earlier drag's watch, armed during the hold, is collected first
                    self.collect_late_watch(true);
                    let mut after = after.handed_over(app.clone());
                    after.settle_failed = confirmed.is_some_and(|c| activation_over_failed_settle(c, settled));
                    self.late_watch = Some(after);
                }
                (Some(true), Some(confirming)) if confirming.unconfirmed() => {
                    after.done();
                    self.collect_late_watch(true);
                    self.late_pending = Some((app.clone(), crate::drop_settle::unconfirmed_end(settle.as_ref())));
                }
                _ => after.done(),
            }
        }
        let answer = (|| -> Result<()> {
            released?;
            revisited?;
            at_release.map_err(|error| anyhow::anyhow!("{error:#}"))?;
            match held {
                Some(Err(error)) => bail!(crate::stray::hold_watch_failed(&app, &format!("{error:#}"))),
                Some(Ok(held)) => {
                    if let Some(sentence) = held.answer(&app) {
                        bail!(sentence);
                    }
                }
                None => {}
            }
            if let Some(at) = moved {
                bail!(pointer_moved(&app, at, handle.asked));
            }
            Ok(())
        })();
        Released { answer, at, app }
    }

    /// An Electron source's accept shown at the release (`read`), held to the window under the release (`release`, a
    /// root point; None when it is not known): it confirms only when the managed top-level there, past the drag image,
    /// takes drag and drop (`XdndAware`), and only when the accept was put up after the real pointer last came into
    /// that top-level ([`crate::drop_cursor::set_since_entry`]): a target that has not answered yet leaves the window
    /// before's accept on display (the third review of task 73, P2). Read after the release, which it does not need to
    /// precede. What it read goes on the `--stats` record.
    pub(super) fn accept_held_to_release(
        &self,
        read: &crate::drop_cursor::AtRelease,
        release: Option<(i16, i16)>,
    ) -> (bool, Value) {
        let levels = self.x.top_levels();
        let top_at = |place: (i16, i16)| levels.as_ref().and_then(|levels| levels.at(place));
        let top = release.and_then(top_at);
        let under = top.and_then(|top| self.x.client_of(top));
        let aware = under.is_some_and(|window| self.x.xdnd_aware(window));
        let since_entry = top.is_some() && read.set_since_entry(|place| top_at(place) == top);
        let held = crate::drop_cursor::over_drop_target(read.accepted, aware, since_entry) == Some(true);
        let record = json!({ "at": release, "under": under, "xdnd_aware": aware, "since_entry": since_entry });
        (held, record)
    }

    /// The real pointer, on the engine's root.
    fn query_pointer(&self) -> Result<QueryPointerReply> {
        Ok(self.x.conn.query_pointer(self.x.root)?.reply()?)
    }

    /// Whether a drop on `window` (the managed top-level under the release, past the drag image the drag and drop holds
    /// under the pointer) is confirmed by its activation request: its family's drop sends one (Chrome).
    fn confirms_by_activation(&mut self, window: Window) -> bool {
        self.family_of(window)
            .is_some_and(|f| crate::families::confirms_drop(f.name))
    }
}

/// The engine's screen's size now, for where the server keeps the pointer: the root's geometry, which RandR changes, not
/// the connection's setup, which gives its size when the engine connected (the whole-branch review of M4, P2: a handle
/// moved into area the screen gained after the engine started recorded a point the pointer was never at, and its end
/// reported the person's motion). A root that cannot be read keeps nothing off the screen.
pub(super) fn screen_size(x: &X11) -> (u16, u16) {
    x.conn
        .get_geometry(x.root)
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .map_or((u16::MAX, u16::MAX), |g| (g.width, g.height))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_asked_point_is_where_the_server_keeps_the_pointer() {
        assert_eq!(on_screen((300, 260), (1280, 800)), (300, 260));
        assert_eq!(on_screen((-5, 900), (1280, 800)), (0, 799));
        assert_eq!(on_screen((1280, 0), (1280, 800)), (1279, 0));
    }

    fn pointer(x: i16, y: i16, same_screen: bool) -> QueryPointerReply {
        QueryPointerReply {
            same_screen,
            root_x: x,
            root_y: y,
            ..Default::default()
        }
    }

    #[test]
    fn the_pointer_moved_only_when_it_is_not_where_the_last_request_put_it() {
        assert_eq!(moved_from((300, 260), &pointer(300, 260, true)), None);
        assert_eq!(moved_from((300, 260), &pointer(301, 260, true)), Some(Some((301, 260))));
        assert_eq!(
            moved_from((300, 260), &pointer(300, 260, false)),
            Some(None),
            "on another screen"
        );
    }

    #[test]
    fn the_handle_s_sentences_say_what_was_sent_and_what_to_do() {
        assert_eq!(
            pointer_moved("Google-chrome", Some((10, 20)), (300, 260)),
            "Google-chrome may not have received your drag where you asked: the desktop pointer was moved while the \
             handle was held, so it was released at (10, 20) instead of at (300, 260). Read the window to see what \
             happened before dragging again"
        );
        assert!(pointer_moved("firefox", None, (1, 2)).contains("released on another screen instead of at (1, 2)"));
        assert!(POINTER_HELD_ELSEWHERE.contains("nothing was pressed"));
        assert_eq!(
            handle_held(HANDLE_IDLE),
            "a drag handle is held; end it before sending desktop pointer input (a handle that gets no request for 30 \
             s is released where it is)"
        );
        assert!(handle_held(Duration::from_millis(300)).contains("no request for 0.3 s"));
    }

    /// Option (c) (ruling 995): with the outlasted gate open and (c) on, a drop whose only confirmation is Chrome's
    /// activation request is answered unconfirmed at once, with its own reason; with the gate shut, or (c) off, it is
    /// confirmed by that request as in 0.4.2.
    #[test]
    fn the_outlasted_gate_makes_an_activation_only_drop_unconfirmed_with_its_own_reason() {
        let activation = confirming(Some(7), true, None);
        assert_eq!(activation, Confirming::Activation(7));
        // the gate open, (c) on: the activation alone confirms nothing
        let outlasted = activation.after_hold(false).after_outlasted(true);
        assert_eq!(outlasted, Confirming::Outlasted);
        assert!(outlasted.unconfirmed(), "reported unconfirmed at once, not waited for");
        assert_eq!(outlasted.unconfirmed_end(None), crate::dnd::WatchEnd::Outlasted);
        // the gate shut, or (c) off (both are `false` here): the activation confirms, as in 0.4.2
        let confirmed = activation.after_hold(false).after_outlasted(false);
        assert_eq!(confirmed, Confirming::Activation(7));
        assert!(
            !confirmed.unconfirmed(),
            "handed to the watch, which waits for the request"
        );
    }

    #[test]
    fn the_outlasted_gate_leaves_every_other_confirmation_as_it_is() {
        // a stronger confirmation: an accept cursor at the release, the drag loop's own word (an Electron source's,
        // which never reaches the gate; no Chrome source has one)
        assert_eq!(
            confirming(None, true, Some(Some(true))).after_outlasted(true),
            Confirming::Cursor(true)
        );
        // answers that are unconfirmed already keep their own reasons
        assert_eq!(
            confirming(None, true, Some(Some(false))).after_outlasted(true),
            Confirming::Cursor(false)
        );
        assert_eq!(confirming(None, true, None).after_outlasted(true), Confirming::Nothing);
        assert_eq!(
            confirming(None, false, None).after_hold(true).after_outlasted(true),
            Confirming::Extended
        );
        // a drop not judged (no window manager that takes the request) is not judged still
        assert_eq!(
            confirming(None, false, None).after_outlasted(true),
            Confirming::Unjudged
        );
        // and the generic unconfirmed end stays the settle's
        assert_eq!(
            Confirming::Nothing.unconfirmed_end(None),
            crate::dnd::WatchEnd::Unconfirmed
        );
    }

    /// Ruling 998 (confirmed by 1026): a handle's end runs the tail only for a Chrome source with a drag and drop under
    /// way at the agent's `end`, the form on; every other end says why not.
    #[test]
    fn a_handle_s_tail_runs_only_at_a_chrome_source_s_end_with_a_drop_under_way() {
        use crate::release_sync::Form;
        assert_eq!(tail_refused(Form::Tail, true, true, true), None);
        assert_eq!(tail_refused(Form::Off, true, true, true), Some("the form is off"));
        assert_eq!(tail_refused(Form::Tail, false, true, true), Some("not the agent's end"));
        assert_eq!(tail_refused(Form::Tail, true, false, true), Some("not a Chrome source"));
        assert_eq!(
            tail_refused(Form::Tail, true, true, false),
            Some("no drag and drop under way")
        );
    }

    /// Ruling 998: the tail's sequence at a Chrome handle's end, the end's rest standing in for its first 8 ms: the
    /// step and back, 8 ms, the step and back, 8 ms, then the release; the pointer read before each visit.
    #[test]
    fn a_chrome_handle_s_end_visits_twice_8_ms_apart_and_rests_8_ms_before_the_release() {
        let rest = Duration::from_millis(8);
        assert_eq!(
            end_steps(Some((301, 260)), Some((300, 260)), true),
            vec![
                // and before the first, after the take read (ruling 1034)
                EndStep::Check((300, 260)),
                EndStep::Motion((301, 260)),
                EndStep::Motion((300, 260)),
                EndStep::Rest(rest),
                // the pointer read again before the second visit (the review of f15e1f09, 2)
                EndStep::Check((300, 260)),
                EndStep::Motion((301, 260)),
                EndStep::Motion((300, 260)),
                EndStep::Rest(rest),
            ]
        );
        // a family with no rest at a held move's end takes the tail's first rest first, then the read
        assert_eq!(
            end_steps(Some((301, 260)), Some((300, 260)), false)[..2],
            [EndStep::Rest(rest), EndStep::Check((300, 260))]
        );
        // on another screen nothing is sent, as before
        assert_eq!(end_steps(Some((301, 260)), None, true), vec![]);
    }

    /// One call of a handle's end at its last take read and its tail, as [`EndIo`] makes it.
    #[derive(Debug, Clone, PartialEq)]
    enum Call {
        ReadTake,
        Motion((i16, i16)),
        Rest(Duration),
        Place,
    }

    /// An [`EndIo`] that records its calls: the take `taken` at the read (None: no hold watch), the pointer `at` each
    /// place read.
    struct Recorder {
        calls: Vec<Call>,
        taken: Option<bool>,
        at: Option<(i16, i16)>,
    }

    impl EndIo for Recorder {
        fn read_take(&mut self) -> Option<Result<Held>> {
            self.calls.push(Call::ReadTake);
            self.taken.map(|taken| {
                Ok(Held {
                    taken,
                    ..Held::default()
                })
            })
        }

        fn motion(&mut self, at: (i16, i16)) -> Result<()> {
            self.calls.push(Call::Motion(at));
            Ok(())
        }

        fn rest(&mut self, rest: Duration) {
            self.calls.push(Call::Rest(rest));
        }

        fn place(&mut self) -> Option<(i16, i16)> {
            self.calls.push(Call::Place);
            self.at
        }
    }

    fn inputs(form: crate::release_sync::Form, agent_end: bool, chrome: bool, watched: bool) -> TailInputs {
        TailInputs {
            form,
            agent_end,
            chrome,
            watched,
            previous: Some((200, 260)),
            place: Some((300, 260)),
            screen: (640, 480),
        }
    }

    /// The re-review of 9fb61c32 (1) and ruling 1030: the hold watch is read once before the release, as f9d1f86b read
    /// it, and that read is the one take sample. Every end with no take under way, Chrome's included, makes that one
    /// call and nothing more, so its calls up to the release are f9d1f86b's; as do Electron's, the form off and every
    /// end but the agent's, whatever their take. A Chrome take at that read gets the tail after it.
    #[test]
    fn the_end_reads_its_take_once_and_only_a_chrome_take_then_runs_the_tail() {
        use crate::release_sync::Form;
        for (case, form, agent_end, chrome, watched, taken) in [
            ("Chrome, no take", Form::Tail, true, true, true, Some(false)),
            ("Electron, a take", Form::Tail, true, false, true, Some(true)),
            ("the form off", Form::Off, true, true, true, Some(true)),
            ("not the agent's end", Form::Tail, false, true, true, Some(true)),
            ("no after-release watch", Form::Tail, true, false, false, Some(true)),
            ("no hold watch", Form::Tail, true, true, true, None),
        ] {
            let mut io = Recorder {
                calls: Vec::new(),
                taken,
                at: Some((300, 260)),
            };
            let ended = read_take_then_tail(&mut io, inputs(form, agent_end, chrome, watched));
            assert_eq!(io.calls, vec![Call::ReadTake], "{case}: one read, as f9d1f86b's");
            assert!(ended.refused.is_some(), "{case}");
            assert_eq!(ended.run.unwrap(), EndRun::default(), "{case}");
        }
        // a Chrome take at the read: the tail after it, the pointer read again before each visit
        let mut io = Recorder {
            calls: Vec::new(),
            taken: Some(true),
            at: Some((300, 260)),
        };
        let ended = read_take_then_tail(&mut io, inputs(Form::Tail, true, true, true));
        let rest = Duration::from_millis(8);
        assert_eq!(
            io.calls,
            vec![
                Call::ReadTake,
                Call::Place,
                Call::Motion((301, 260)),
                Call::Motion((300, 260)),
                Call::Rest(rest),
                Call::Place,
                Call::Motion((301, 260)),
                Call::Motion((300, 260)),
                Call::Rest(rest),
            ]
        );
        assert_eq!(ended.refused, None);
        assert_eq!(
            ended.run.unwrap(),
            EndRun {
                motions: 4,
                stopped: false
            }
        );
        // and on another screen after the rest: the read alone, the tail refused for it
        let mut io = Recorder {
            calls: Vec::new(),
            taken: Some(true),
            at: None,
        };
        let ended = read_take_then_tail(
            &mut io,
            TailInputs {
                place: None,
                ..inputs(Form::Tail, true, true, true)
            },
        );
        assert_eq!(io.calls, vec![Call::ReadTake]);
        assert_eq!(ended.refused, Some("the pointer is on another screen"));
    }

    /// The re-review of 9fb61c32 (2): a tail the pointer check stopped answers unconfirmed whenever the release's
    /// position check would otherwise pass (the person brought the pointer back where the last request put it), never a
    /// plain ok on Chrome's activation; an uninterrupted tail is judged as any. Ruling 1034: a pointer moved between the
    /// end's read and the take read stops the tail before its first visit, nothing sent, and interrupts it the same.
    #[test]
    fn an_interrupted_tail_answers_unconfirmed() {
        let mut io = Recorder {
            calls: Vec::new(),
            taken: Some(true),
            at: Some((340, 262)),
        };
        let ended = read_take_then_tail(&mut io, inputs(crate::release_sync::Form::Tail, true, true, true));
        assert_eq!(
            io.calls,
            vec![Call::ReadTake, Call::Place],
            "no motion undoes the person's"
        );
        let run = ended.run.unwrap();
        assert_eq!(
            run,
            EndRun {
                motions: 0,
                stopped: true
            }
        );
        let activation = Some(Confirming::Activation(7));
        let interrupted = unconfirmed_when(activation, run.stopped);
        assert_eq!(interrupted, Some(Confirming::Nothing));
        assert!(interrupted.unwrap().unconfirmed(), "reported unconfirmed at once");
        assert_eq!(
            interrupted.unwrap().unconfirmed_end(None),
            crate::dnd::WatchEnd::Unconfirmed
        );
        assert_eq!(
            unconfirmed_when(Some(Confirming::Unjudged), true),
            Some(Confirming::Nothing)
        );
        assert_eq!(unconfirmed_when(activation, false), activation);
        assert_eq!(unconfirmed_when(None, true), None);
    }

    /// The review of f15e1f09 (2): a person who moves the pointer during the tail's rest keeps their motion. The check
    /// before the second visit reads the pointer elsewhere (or on another screen), nothing more is sent, and the release
    /// reads the move as before. A pointer still in place gets both visits.
    #[test]
    fn a_pointer_moved_during_the_tail_s_rest_ends_the_visits_there() {
        let plan = || end_plan(None, Some((200, 260)), Some((300, 260)), (640, 480), true);
        for (now_at, motions, stopped) in [
            (Some((300, 260)), 4, false),
            (Some((340, 262)), 2, true),
            (None, 2, true),
        ] {
            let sent = std::cell::RefCell::new(Vec::new());
            // the read before the first visit finds it in place (ruling 1034); the one after the rest, `now_at`
            let mut reads = 0;
            let run = run_end(
                plan(),
                |p| {
                    sent.borrow_mut().push(EndStep::Motion(p));
                    Ok(())
                },
                |d| sent.borrow_mut().push(EndStep::Rest(d)),
                || {
                    reads += 1;
                    if reads == 1 { Some((300, 260)) } else { now_at }
                },
            )
            .unwrap();
            assert_eq!(run, EndRun { motions, stopped }, "{now_at:?}");
            let sent = sent.into_inner();
            let first = [
                EndStep::Motion((301, 260)),
                EndStep::Motion((300, 260)),
                EndStep::Rest(Duration::from_millis(8)),
            ];
            match stopped {
                // nothing after the check: no motion takes the pointer back from where the person put it
                true => assert_eq!(sent, first.to_vec(), "{now_at:?}"),
                false => assert_eq!(sent.len(), 6, "{sent:?}"),
            }
        }
        // the ends with no tail have no check, so their run is the revisit alone, as f9d1f86b's
        let sent = std::cell::RefCell::new(Vec::new());
        let run = run_end(
            end_plan(
                Some("not a Chrome source"),
                Some((200, 260)),
                Some((300, 260)),
                (640, 480),
                true,
            ),
            |p| {
                sent.borrow_mut().push(p);
                Ok(())
            },
            |_| {},
            || panic!("no read on an end with no tail"),
        )
        .unwrap();
        assert_eq!(
            (run, sent.into_inner()),
            (
                EndRun {
                    motions: 1,
                    stopped: false
                },
                vec![(300, 260)]
            )
        );
    }

    /// The last segment of a handle: from the point before its end to the pointer's own place; a handle that never
    /// moved off its start (one point) steps 1 px in x, as the drag tail's path that never moved does, and at the
    /// screen's edge back.
    #[test]
    fn a_handle_s_step_follows_its_last_segment_and_a_one_point_handle_steps_in_x() {
        let screen = (640, 480);
        // the first visit's step, after the pointer read before it
        let first = |previous, at| end_plan(None, previous, Some(at), screen, true)[1];
        assert_eq!(first(Some((200, 260)), (300, 260)), EndStep::Motion((301, 260)));
        assert_eq!(first(Some((300, 300)), (300, 260)), EndStep::Motion((300, 259)));
        // a person moved the pointer since the last request: the visits go to where it is, along the segment to there
        assert_eq!(
            end_plan(None, Some((200, 260)), Some((310, 260)), screen, true)[..3],
            [
                EndStep::Check((310, 260)),
                EndStep::Motion((311, 260)),
                EndStep::Motion((310, 260))
            ]
        );
        assert_eq!(first(None, (300, 260)), EndStep::Motion((301, 260)));
        assert_eq!(first(None, (639, 260)), EndStep::Motion((638, 260)));
    }

    /// #488: a take the hold's first read already saw skips the hold's wait, and the cursor's watch, on its own thread,
    /// may not have read it by the settle: the end settles all the same, as for a take seen in the wait or by the
    /// watch. No take, settles off, nothing pressed or a family that does not rest: no settle.
    #[test]
    fn a_take_the_hold_s_first_read_saw_settles_though_the_cursor_s_watch_lags() {
        let rest = Duration::from_millis(30);
        let first = HoldTake {
            at_first_read: true,
            in_wait: false,
        };
        let waited = HoldTake {
            at_first_read: false,
            in_wait: true,
        };
        let lagging = || false;
        assert!(settles(true, true, rest, first, lagging), "the first read's take");
        assert!(settles(true, true, rest, waited, lagging), "the wait's take");
        assert!(
            settles(true, true, rest, HoldTake::default(), || true),
            "the watch's take"
        );
        assert!(!settles(true, true, rest, HoldTake::default(), lagging), "no take");
        assert!(!settles(false, true, rest, first, || true), "settles off");
        assert!(!settles(true, false, rest, first, || true), "nothing pressed");
        assert!(
            !settles(true, true, Duration::ZERO, first, || true),
            "a family that does not rest"
        );
    }

    #[test]
    fn a_chrome_destination_s_activation_outranks_an_electron_source_s_failed_settle() {
        // ruling 835 (A): Chrome's activation is the destination's own word that it took the drop, so it outranks a
        // timing check on the source. An Electron source whose settle failed shows no counted accept
        // (`Some(Some(false))`), and over a Chrome window that takes the request the activation still decides
        assert_eq!(confirming(Some(7), true, Some(Some(false))), Confirming::Activation(7));
        // the case is told apart for `--stats` (ruling 837: `settle_failed_activation_confirmed`, the reply unchanged)
        assert!(activation_over_failed_settle(Confirming::Activation(7), Some(false)));
        assert!(
            !activation_over_failed_settle(Confirming::Activation(7), Some(true)),
            "a settled drop"
        );
        assert!(
            !activation_over_failed_settle(Confirming::Activation(7), None),
            "no settle: not an Electron source"
        );
        assert!(
            !activation_over_failed_settle(Confirming::Cursor(false), Some(false)),
            "unconfirmed: the notice"
        );
    }

    #[test]
    fn a_drop_under_way_is_confirmed_by_its_destination_s_activation_else_an_electron_source_s_cursor() {
        // a Chrome window under the release, the request supported: its activation, whatever the source
        assert_eq!(confirming(Some(7), true, None), Confirming::Activation(7));
        assert_eq!(confirming(Some(7), true, Some(Some(false))), Confirming::Activation(7));
        // an Electron source elsewhere: its cursor at the release, shown or not; one not told confirms nothing
        assert_eq!(confirming(None, true, Some(Some(true))), Confirming::Cursor(true));
        assert_eq!(confirming(None, false, Some(Some(false))), Confirming::Cursor(false));
        assert_eq!(confirming(None, true, Some(None)), Confirming::Cursor(false));
        assert_eq!(
            confirming(Some(7), false, Some(Some(true))),
            Confirming::Cursor(true),
            "no activation to ask for"
        );
        // a Chrome source over a window that is not Chrome's (or none): nothing can confirm it (task 73's review, P2)
        assert_eq!(confirming(None, true, None), Confirming::Nothing);
        // no window manager to ask: not judged, as before
        assert_eq!(confirming(None, false, None), Confirming::Unjudged);
        assert!(Confirming::Nothing.unconfirmed() && Confirming::Cursor(false).unconfirmed());
        assert!(!Confirming::Cursor(true).unconfirmed() && !Confirming::Unjudged.unconfirmed());
        assert!(!Confirming::Activation(7).unconfirmed(), "the watch waits for it");
        // a take only the extended hold caught: unjudged becomes unconfirmed, whatever else confirms stays as it was
        assert_eq!(Confirming::Unjudged.after_hold(true), Confirming::Extended);
        assert!(Confirming::Extended.unconfirmed());
        assert_eq!(Confirming::Unjudged.after_hold(false), Confirming::Unjudged);
        for confirming in [
            Confirming::Activation(7),
            Confirming::Cursor(true),
            Confirming::Cursor(false),
            Confirming::Nothing,
        ] {
            assert_eq!(confirming.after_hold(true), confirming);
        }
    }
}
