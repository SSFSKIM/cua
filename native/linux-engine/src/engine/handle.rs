//! `drag_handle` (behaviour §10.5): start, move and end are the JavaScript's to order, desktop only, its press and every
//! motion XTEST on the real pointer in either device mode. The lifecycle is T17's (#250; the design session's ruling,
//! 2026-11-10; evidence `m4/drag-handle/`). Xorg delivers events with the master pointer's button state, which stays
//! down while any of its devices holds the button, so every crossing and motion that reaches a page during the hold
//! carries the button and none resets the press: the atomic press and the press watch of a Chromium `drag` protect
//! nothing here. What loses a handle's press is another client's pointer grab, held over the press or taken during the
//! hold, and every such press answered ok before. So:
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
//!   take cancelled by an Escape through XTEST and reported, and Chrome's drop confirmed by its activation request for
//!   the window under the release, where the window manager supports it; the notice and the refusal in T14's words.
//!   Handles get no drop floor.
//! - **The real pointer moved**: if at `end` the pointer is not where the last request put it (the person moved it), the
//!   release goes where it is and `end` reports it. Motion a later `move_to` corrected raises nothing.
//! - **While a handle is held**, pointer input through XTEST (the desktop route, and the foreground route, which is the
//!   desktop route after an activation) is refused, since its button would end the hold: [`HANDLE_HELD`]. Keys run.
//! - `start` then `end` with no move is a press and a release in place, as the vendor's; the cleanup before a first move
//!   is the exit's (`Engine::shutdown`), which ends a held handle as its `end` does.

use std::time::Instant;

use anyhow::{Result, bail};
use serde_json::{Value, json};
use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{ConnectionExt as _, EventMask, GrabMode, GrabStatus, QueryPointerReply, Window};

use super::Engine;
use super::way::Way;
use crate::desktop::Desktop;
use crate::dnd::{Confirm, EscapeRoute, LateWatch};
use crate::families::DragPacing;
use crate::input::chord_keycodes;
use crate::stray::{Held, HoldWatch, Holding};
use crate::wire::{DragHandleInput, parse_input};
use crate::x11::X11;

/// The refusal of pointer input through XTEST while a handle is held (the design session's ruling, 2026-11-10): its
/// button would end the hold, so the engine refuses the agent's own conflicting request.
pub(super) const HANDLE_HELD: &str = "a drag handle is held; end it before sending desktop pointer input";

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
        }
    }
}

/// The pre-press try: under a server grab, the deepest window under the pointer found, a pointer grab on it tried and
/// given up in the same request batch (nothing waits between the two), then the server let go; answers the grab's
/// status. `AlreadyGrabbed` (or `Frozen`) means another client holds the pointer. The grab is on the window the pointer
/// is in, so it crosses nothing (task 73's probe on xterm, Chrome and Electron: evidence `m4/drag-handle/`).
fn pointer_free(x: &X11) -> Result<GrabStatus> {
    let clicker = live::before_try();
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
        live::during_try(clicker.as_ref());
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
    live::after_try(clicker);
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
                let pacing = handle.pacing;
                Desktop::move_path_paced(
                    &self.x,
                    px,
                    py,
                    pacing.held_step,
                    pacing.held_lead_pause,
                    pacing.held_rest,
                )?;
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
            bail!(HANDLE_HELD);
        }
        Ok(())
    }

    /// `start`: the pointer moved to the point (the vendor's own move), the watches begun, the pre-press try, then the
    /// press and the family's wait after it. A refusal or a failure leaves nothing pressed and nothing watched.
    fn start_drag_handle(&mut self, px: i16, py: i16) -> Result<()> {
        if self.drag_handle_held() {
            bail!(HANDLE_HELD);
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
        self.handle = Some(handle);
        std::thread::sleep(pacing.press);
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

    /// `drag_handle`'s end: for a family that rests at a held move's end (`held_rest`), a rest and the pointer's place
    /// visited once more, so the last position before the release comes after the target answered the ones before it
    /// (a drop target accepts only such a position, and a cold window's drag can start after the last move; evidence
    /// `m4/drag-motion/`), unless the pointer is on another screen of the display, which the visit would carry it back
    /// from; then the release dwell its start found; the hold watch read; then button 1 up where the pointer is, sent
    /// whatever came before. A Chromium handle's after-release watch is told of the release and handed over as a
    /// `drag`'s is. The answer: the release's error, else the hold's (a cut, or a watch that failed), else the pointer
    /// found away from where the last request put it, else success. The engine's exit ends a handle still held the
    /// same way (`Engine::shutdown`); an end with no start releases where the pointer is, as the vendor's does.
    pub(super) fn end_drag_handle(&mut self) -> Result<()> {
        let Some(mut handle) = self.handle.take() else {
            return Desktop::button(&self.x, 1, false);
        };
        let pacing = handle.pacing;
        if !pacing.held_rest.is_zero() {
            std::thread::sleep(pacing.held_rest);
        }
        let pointer = self
            .x
            .conn
            .query_pointer(self.x.root)
            .map_err(anyhow::Error::from)
            .and_then(|cookie| Ok(cookie.reply()?));
        // with the pointer on another screen the reply's place is on that screen's root: a motion to it on the engine's
        // own root would carry the held pointer back across before the release
        let revisited = match (&pointer, pacing.held_rest.is_zero()) {
            (_, true) => Ok(()),
            (Ok(p), false) if p.same_screen => Desktop::motion(&self.x, p.root_x, p.root_y),
            (Ok(_), false) => Ok(()),
            (Err(error), false) => Err(anyhow::anyhow!("{error:#}")),
        };
        let moved = match &pointer {
            Ok(p) if handle.pressed => moved_from(handle.asked, p),
            _ => None,
        };
        std::thread::sleep(pacing.release);
        let held = handle
            .holding
            .as_mut()
            .map(|(watch, holding)| watch.before_release(holding));
        let taken = matches!(held, Some(Ok(Held { taken: true, .. })));
        // Chrome's drop is confirmed by its activation request for the window under the release, where the window
        // manager supports that request (the design session's ruling on task 68)
        let confirm = match (&handle.after, &pointer) {
            (Some(_), Ok(p)) if p.same_screen => self.drop_confirmed_by(p.root_x, p.root_y),
            _ => None,
        };
        if let Some(after) = &handle.after {
            after.confirm_drop_of(confirm);
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
                    Some(Ok(h)) => json!({ "cut": h.cut, "taken": h.taken }),
                    Some(Err(error)) => json!({ "failed": format!("{error:#}") }),
                },
                "moved": moved.is_some(),
                "confirming": confirm.is_some(),
                // the harness lines the release up with its own watchers (`--stats` only)
                "release_wall_ms": release_wall,
            }),
        );
        // the after-release watch, handed over as a `drag`'s: after a release with no take (the late take is the
        // watch's to cancel and report), or after a take on a drop it confirms; otherwise there is nothing to watch
        if let Some(after) = handle.after.take() {
            match (after.released_with_take(), confirm) {
                (Some(false), _) | (Some(true), Some(_)) => {
                    // an earlier drag's watch, armed during the hold, is collected first
                    self.collect_late_watch(true);
                    self.late_watch = Some(after.handed_over(app.clone()));
                }
                _ => after.done(),
            }
        }
        released?;
        revisited?;
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
    }

    /// The window whose activation request confirms a handle's drop released at a root point: the top-level there,
    /// when its family's drop sends one (Chrome) and the window manager lists `_NET_ACTIVE_WINDOW` as supported.
    fn drop_confirmed_by(&mut self, rx: i16, ry: i16) -> Option<Window> {
        let window = self.x.client_at(rx, ry)?;
        if !self
            .family_of(window)
            .is_some_and(|f| crate::families::confirms_drop(f.name))
        {
            return None;
        }
        crate::dnd::active_window_supported(&self.x)
            .unwrap_or(false)
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

/// The live tests' hook in the pre-press try (`CUA_ENGINE_FAULT=handle-try-click`, only in a build with the `live`
/// feature, never a release asset): a second X client's click of button 3, sent while the try holds the server, as a
/// person's click arriving at that moment. Its requests wait for the server's release, which comes after the try has
/// given its grab up, so the click must land where the pointer is.
#[cfg(feature = "live")]
mod live {
    use x11rb::connection::Connection as _;
    use x11rb::protocol::xproto::{BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT, ConnectionExt as _};
    use x11rb::protocol::xtest::ConnectionExt as _;
    use x11rb::rust_connection::RustConnection;

    /// The second client, connected before the server is held (a connection's setup waits for it otherwise).
    pub fn before_try() -> Option<RustConnection> {
        if std::env::var("CUA_ENGINE_FAULT").as_deref() != Ok("handle-try-click") {
            return None;
        }
        let (conn, _) = x11rb::connect(None).ok()?;
        conn.xtest_get_version(2, 2).ok()?.reply().ok()?;
        Some(conn)
    }

    /// Its click sent, not waited for: the server handles it once it is let go.
    pub fn during_try(clicker: Option<&RustConnection>) {
        if let Some(conn) = clicker {
            for kind in [BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT] {
                let _ = conn.xtest_fake_input(kind, 3, x11rb::CURRENT_TIME, x11rb::NONE, 0, 0, 0);
            }
            let _ = conn.flush();
        }
    }

    /// Once the server is let go: the click handled before the second client goes.
    pub fn after_try(clicker: Option<RustConnection>) {
        if let Some(conn) = clicker {
            let _ = conn.get_input_focus().map(|c| c.reply());
        }
    }
}

#[cfg(not(feature = "live"))]
mod live {
    pub fn before_try() -> Option<()> {
        None
    }
    pub fn during_try(_: Option<&()>) {}
    pub fn after_try(_: Option<()>) {}
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
    }
}
