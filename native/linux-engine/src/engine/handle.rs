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
//!   acting request, or the released handle's `end`, is refused with it, not run.
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
}

impl Confirming {
    /// Whether the drop is reported unconfirmed at once (an activation request is the watch's to wait for).
    fn unconfirmed(self) -> bool {
        matches!(self, Confirming::Cursor(false) | Confirming::Nothing)
    }
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

/// A `drag_handle` between its start (or a move with no start in this engine) and its end.
pub(super) struct Handle {
    /// The drag's waits, by the start's family.
    pacing: DragPacing,
    /// Button 1 went down at the start (false for a move with no start, which presses nothing).
    pressed: bool,
    /// The top-level window under the start point.
    target: Option<Window>,
    /// Where the real pointer was last put: the start, then each move's end, on the screen.
    asked: (i16, i16),
    /// The hold watch on the target, from just before the press.
    holding: Option<(HoldWatch, Holding)>,
    /// A Chromium target's after-release watch, subscribed before the press.
    after: Option<LateWatch>,
    /// An Electron target's displayed cursor, watched from before the press for its drop's confirmation
    /// (`drop_cursor.rs`), or why the watch could not start, which confirms nothing.
    cursor: Option<std::result::Result<DropCursor, String>>,
    /// When its last request came, its start or a move: the engine releases it once it is [`HANDLE_IDLE`] past.
    last_request: Instant,
}

impl Handle {
    /// A move with no start: its family's pacing, nothing pressed and nothing watched.
    fn unpressed(pacing: DragPacing) -> Handle {
        Handle {
            pacing,
            pressed: false,
            target: None,
            asked: (0, 0),
            holding: None,
            after: None,
            cursor: None,
            last_request: Instant::now(),
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
                handle.asked = on_screen((px, py), size);
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
            DragHandleInput::End => self.end_drag_handle()?,
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
        let released = self.release_handle(handle);
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
            record.insert("id".into(), Value::Null);
            record.insert("idle_handle".into(), super::late_stats(&released.app, &end));
            record.insert(
                "answer".into(),
                json!(released.answer.as_ref().err().map(|e| format!("{e:#}"))),
            );
            for (key, value) in std::mem::take(&mut self.extra) {
                record.insert(key, value);
            }
            eprintln!("{}", json!({ "stats": record }));
        }
        self.extra = request_extra;
        self.late_pending = Some((released.app, end));
        self.report_sent();
    }

    /// cua's `release_handle`, which its service sends when the REPL state that held a handle is gone (a new kernel's
    /// setup, after `js_reset` or a cell's timeout; the design session's ruling on task 73's review): nothing will end
    /// that handle, so a held one is released at once, as its end would release it, and what that leaves pending (a
    /// Chromium drop's after-release watch) is reported as an end's is. The end's own answer goes on the `--stats` line
    /// alone: nobody is left to read it. A handle that holds nothing (a move with no start) is dropped; with none,
    /// nothing is sent, and a handle the idle bound already released keeps its notice.
    pub(super) fn release_lost_handle(&mut self) -> Value {
        let Some(handle) = self.handle.take() else {
            return Value::Null;
        };
        if !handle.pressed {
            self.drop_handle_watches(handle);
            return Value::Null;
        }
        let released = self.release_handle(handle);
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
            target,
            asked: on_screen((px, py), screen_size(&self.x)),
            holding: None,
            after: None,
            cursor: None,
            last_request: Instant::now(),
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
                        handle.cursor = Some(DropCursor::start().map_err(|e| format!("{e:#}")));
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
    /// pointer is, as the vendor's does. The engine's exit ends a handle still held the same way (`Engine::shutdown`).
    pub(super) fn end_drag_handle(&mut self) -> Result<()> {
        let Some(handle) = self.handle.take() else {
            return Desktop::button(&self.x, 1, false);
        };
        self.release_handle(handle).answer
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
    /// request put it, else success.
    fn release_handle(&mut self, mut handle: Handle) -> Released {
        let pacing = handle.pacing;
        if !pacing.held_rest.is_zero() {
            std::thread::sleep(pacing.held_rest);
        }
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
        let held = handle
            .holding
            .as_mut()
            .map(|(watch, holding)| watch.before_release(holding));
        let (taken, take_time) = match &held {
            Some(Ok(Held { taken, take_time, .. })) => (*taken, *take_time),
            _ => (false, None),
        };
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
        let confirmed = judging.then(|| {
            let destination = at.and_then(|(rx, ry)| self.activation_window_at(rx, ry));
            let cursor = handle.cursor.as_mut().map(|watch| match watch {
                Ok(watch) => {
                    let read = watch.at_release(take_time);
                    cursor_record = Some(read.record());
                    read.accepted
                }
                Err(error) => {
                    cursor_record = Some(json!({ "accepted": null, "error": error }));
                    None
                }
            });
            confirming(destination, supported, cursor)
        });
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
            after.released(released_at, taken);
        }
        let app = match handle.target {
            Some(window) => self
                .x
                .get_window(window)
                .map_or_else(|_| format!("window {window}"), |w| w.app),
            None => "the window under the pointer".to_string(),
        };
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
                "drop_cursor": cursor_record,
                // the harness lines the release up with its own watchers (`--stats` only)
                "release_wall_ms": release_wall,
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
                    self.late_watch = Some(after.handed_over(app.clone()));
                }
                (Some(true), Some(confirming)) if confirming.unconfirmed() => {
                    after.done();
                    self.collect_late_watch(true);
                    self.late_pending = Some((app.clone(), WatchEnd::Unconfirmed));
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

    /// The real pointer, on the engine's root.
    fn query_pointer(&self) -> Result<QueryPointerReply> {
        Ok(self.x.conn.query_pointer(self.x.root)?.reply()?)
    }

    /// The window whose activation request confirms a handle's drop released at a root point: the managed top-level
    /// there (past the drag image the drag and drop holds under the pointer), when its family's drop sends one (Chrome).
    fn activation_window_at(&mut self, rx: i16, ry: i16) -> Option<Window> {
        let window = self.x.managed_client_at(rx, ry)?;
        self.family_of(window)
            .is_some_and(|f| crate::families::confirms_drop(f.name))
            .then_some(window)
    }
}

/// The engine's screen's size, for where the server keeps the pointer.
fn screen_size(x: &X11) -> (u16, u16) {
    x.conn
        .setup()
        .roots
        .iter()
        .find(|s| s.root == x.root)
        .map_or((u16::MAX, u16::MAX), |s| (s.width_in_pixels, s.height_in_pixels))
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
    }
}
