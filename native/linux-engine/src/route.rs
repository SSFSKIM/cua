//! Which route a request's input takes, and the input state that outlives a request (behaviour §8.1, §11.3): a
//! request naming a window goes through that window's background session, one without a window through the desktop
//! (XTEST), and one whose window's family ignores the background route, in dedicated mode, through the desktop after
//! the window is activated (the foreground route; Design, Device mode). Keys held with `key_down` keep their target: a
//! window's session stays open across requests (its redirect, synthetic focus and time anchor reused with no X
//! requests) until its last hold is released, and the held keys' counts are shared with every later request to the
//! same target. The desktop's counts are one set, whichever window a foreground hold was made for: XTEST's keys are
//! the server's.
//!
//! A session no hold keeps ends with its request: its `FocusOut` goes as the request's input ends, before the answer,
//! and the window's redirect is kept (M4's T7, as the design session ruled on task 59's measurement, 2026-11-04: with
//! the redirect held, a `FocusOut` at once cut and reordered no key on any family, idle or at twice the load). Nothing
//! is left pending between requests, so input to another window, the desktop or the foreground route waits for nothing.
//! One session outlives its request without a hold: a watched drag's, kept focused until its late-take watch ends (300
//! ms after the release at most), so the watch's safety Escape lands inside the session it cancels, by construction
//! and not by what an application does with an Escape that comes unfocused (the design session's ruling on task 60,
//! 2026-11-05; `Watched`). What follows a window's input is time, kept here per window: the exit's settle and a
//! paste's (`settle.rs`).

use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::Result;
use serde_json::{Value, json};
use x11rb::protocol::xproto::Window;

use crate::cover::Reach;
use crate::desktop::Desktop;
use crate::input::{Pacing, Session};
use crate::settle;
use crate::x11::X11;

/// How long the foreground route's pointer input waits for its activated window to be on top at its points
/// (`Route::on_top_at`), and `activate_window` for its window to be on top over its visible area, and how often each
/// looks. Task 63 measured the window manager's raise at twice the gate's load: 17.2 ms at the most.
pub const ON_TOP_WAIT: Duration = Duration::from_millis(1000);
pub const ON_TOP_POLL: Duration = Duration::from_millis(2);

/// Reads `ready` until it holds or `bound` has passed: whether it held, the last reading's.
pub fn wait_until(mut ready: impl FnMut() -> Result<bool>, bound: Duration, poll: Duration) -> Result<bool> {
    let deadline = Instant::now() + bound;
    loop {
        if ready()? {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        std::thread::sleep(poll);
    }
}

/// A request's input target: a window (the background route), the desktop, or a window reached through the desktop
/// once activated (the foreground route).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Target {
    Desktop,
    Window(Window),
    Foreground(Window),
}

/// One `key_down` hold: named by its target and its normalized chord (the keysyms in order, duplicates kept, so
/// `ctrl+shift` and `shift+ctrl` are different holds), with the keycodes it acquired.
#[derive(Debug, Clone, PartialEq)]
pub struct Hold {
    pub target: Target,
    pub chord: Vec<u32>,
    pub keycodes: Vec<u8>,
}

/// The holds in the order they were made.
#[derive(Debug, Default)]
pub struct Holds(Vec<Hold>);

impl Holds {
    pub fn contains(&self, target: Target, chord: &[u32]) -> bool {
        self.0.iter().any(|h| h.target == target && h.chord == chord)
    }

    pub fn insert(&mut self, hold: Hold) {
        self.0.push(hold);
    }

    pub fn take(&mut self, target: Target, chord: &[u32]) -> Option<Hold> {
        let index = self.0.iter().position(|h| h.target == target && h.chord == chord)?;
        Some(self.0.remove(index))
    }

    pub fn any_for(&self, target: Target) -> bool {
        self.0.iter().any(|h| h.target == target)
    }
}

/// Why a session's `FocusOut` went out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cause {
    /// Its request's input ended.
    Request,
    /// The late-take watch of the drag whose session it was ended (`Watched`).
    Watch,
    /// The engine's exit ended a session a hold had kept open, once it had released the hold.
    Exit,
}

/// One `FocusOut` a session's end sent, for the `--stats` line and the harness's audit: its window, why, how long
/// after the session's input ended it went out (0 but for a teardown set for measurement, and a watched drag's), and the
/// request whose input it ends (`scheduled_by`, the name the audit reads; the exit's names the last request handled).
#[derive(Debug, Clone, PartialEq)]
pub struct Sent {
    pub window: u32,
    pub cause: Cause,
    pub after_input: Duration,
    pub scheduled_by: Value,
}

impl Sent {
    /// The record on the `--stats` line.
    pub fn record(&self) -> Value {
        json!({
            "window": self.window,
            "cause": match self.cause {
                Cause::Request => "request",
                Cause::Watch => "watch",
                Cause::Exit => "exit",
            },
            "after_input_ms": (self.after_input.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0,
            "scheduled_by": self.scheduled_by,
        })
    }
}

/// A drag whose late-take watch may be armed (`Inputs::with_route_kept`): its window, its request's id, which its
/// session's `FocusOut` names, and its session once its input has ended with no hold to keep it, the `FocusOut` held
/// back until the watch ends (`end_watched`), with when that input ended.
struct Watched {
    window: Window,
    request: Value,
    session: Option<(Session, Instant)>,
}

/// What a paste's settle saw and did (`Inputs::settle_paste`): how long ago its window's last key and last click were
/// when the paste came (None: none yet), and the time it waited.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PasteSettle {
    pub after_key: Option<Duration>,
    pub after_click: Option<Duration>,
    pub waited: Duration,
}

/// The input state of the engine's life: the open sessions of windows with held keys, a watched drag's session, the
/// desktop's held keys, the holds themselves, and when each window last took input.
pub struct Inputs {
    pub pacing: Pacing,
    pub sessions: HashMap<Window, Session>,
    pub desktop: Desktop,
    pub holds: Holds,
    /// The id of the request being handled, which the `FocusOut` its input's end sends names (`Sent::scheduled_by`).
    pub request: Value,
    /// The `FocusOut`s sent and not yet reported (`take_sent`).
    sent: Vec<Sent>,
    /// When each window's background key input last ended, the late-take Escape included (`note_key`): what a paste's
    /// settle follows (`settle.rs`), since its observation raced keys sent just before it (task 59).
    last_key: HashMap<Window, Instant>,
    /// When each window's background input that pressed a button (1 to 3: a click, a drag) last ended: what a paste's
    /// settle follows as well, since a click that moves the focus or the caret can land after the paste's observation
    /// (the design session's ruling on task 60, 2026-11-05).
    last_click: HashMap<Window, Instant>,
    /// When each window's background input of any kind last ended, the Escape included: what the exit's settle follows.
    /// The exit's unredirect cuts keys and clicks alike once no wait comes before it (task 60).
    last_input: HashMap<Window, Instant>,
    /// The drag whose late-take watch is armed, and its session, kept until the watch ends (`end_watched`).
    watched: Option<Watched>,
    /// Sessions a hold kept open, their keys released by the exit's first act and their `FocusOut` not yet sent: the
    /// exit sends it once an armed late-take watch has run out (`end_released`).
    released: Vec<(Window, Session)>,
}

/// A request's route while it runs: a window's session, or the desktop, with the window a foreground request's
/// window-relative points are relative to.
pub enum Route<'a> {
    Window(&'a mut Session),
    Desktop(&'a mut Desktop, Option<Window>),
}

impl Inputs {
    pub fn new(pacing: Pacing) -> Inputs {
        Inputs {
            pacing,
            sessions: HashMap::new(),
            desktop: Desktop::new(pacing.key),
            holds: Holds::default(),
            request: Value::Null,
            sent: Vec::new(),
            last_key: HashMap::new(),
            last_click: HashMap::new(),
            last_input: HashMap::new(),
            watched: None,
            released: Vec::new(),
        }
    }

    /// Runs `body` on the target's route. A window's session is the held one if its keys are held, else the watched
    /// drag's if it is that window's, else opened for this request; afterwards it stays open while the window has
    /// holds, with any button still down released and its grab dropped, and otherwise ends, its `FocusOut` sent before
    /// the request answers (whatever the body's outcome; the body's error wins), unless it is the watched drag's.
    pub fn with_route<T>(
        &mut self,
        x: &mut X11,
        target: Target,
        body: impl FnOnce(&mut X11, &mut Route, &mut Holds) -> Result<T>,
    ) -> Result<T> {
        self.with_route_kept(x, target, false, body)
    }

    /// [`Inputs::with_route`] for a drag that may arm a late-take watch (`watch`, a background drag only): from then on
    /// the window's session, once no hold keeps it, is kept as the watched one instead of ended, its `FocusOut` held
    /// back. The drag either leaves it to its watch, which `end_watched` ends once the watch has ended, or ends it at
    /// once (`end_watched`) when it arms none.
    pub fn with_route_kept<T>(
        &mut self,
        x: &mut X11,
        target: Target,
        watch: bool,
        body: impl FnOnce(&mut X11, &mut Route, &mut Holds) -> Result<T>,
    ) -> Result<T> {
        match target {
            Target::Desktop => body(x, &mut Route::Desktop(&mut self.desktop, None), &mut self.holds),
            Target::Foreground(window) => {
                body(x, &mut Route::Desktop(&mut self.desktop, Some(window)), &mut self.holds)
            }
            Target::Window(window) => {
                if watch {
                    // an acting request collects an earlier drag's watch before it runs, so normally there is none
                    self.end_watched(x);
                    self.watched = Some(Watched {
                        window,
                        request: self.request.clone(),
                        session: None,
                    });
                }
                let kept = self
                    .watched
                    .as_mut()
                    .filter(|w| w.window == window)
                    .and_then(|w| w.session.take());
                let mut session = match (self.sessions.remove(&window), kept) {
                    (Some(session), _) => session,
                    (None, Some((session, _))) => session,
                    (None, None) => Session::open(x, window, self.pacing)?,
                };
                let result = body(x, &mut Route::Window(&mut session), &mut self.holds);
                if self.holds.any_for(target) {
                    // only key holds outlive a request: a button an interrupted request left down, and its grab, do not
                    session.release_buttons(x);
                    self.sessions.insert(window, session);
                } else {
                    session.finish(x);
                    let ended = self.note_input(window, &session);
                    match self.watched.as_mut().filter(|w| w.window == window) {
                        // the window's drag's watch is armed: its FocusOut waits for the watch's end
                        Some(watched) => watched.session = Some((session, ended)),
                        None => self.end(x, window, session, Cause::Request, ended, self.request.clone()),
                    }
                }
                result
            }
        }
    }

    /// Whether a session is open for `window` past its request: a hold's, or the watched drag's kept one.
    pub fn open_for(&self, window: Window) -> bool {
        self.sessions.contains_key(&window)
            || self
                .watched
                .as_ref()
                .is_some_and(|w| w.window == window && w.session.is_some())
    }

    /// A session's input ended now: noted as the window's last input, and as its last key or click if it took any.
    fn note_input(&mut self, window: Window, session: &Session) -> Instant {
        let ended = Instant::now();
        self.last_input.insert(window, ended);
        if session.took_keys() {
            self.last_key.insert(window, ended);
        }
        if session.took_clicks() {
            self.last_click.insert(window, ended);
        }
        ended
    }

    /// A session whose input ended at `ended`: its `FocusOut` sent (after the teardown a measurement sets, 0 by default)
    /// and its redirect kept or dropped as the retention says.
    fn end(&mut self, x: &mut X11, window: Window, session: Session, cause: Cause, ended: Instant, request: Value) {
        if !self.pacing.teardown.is_zero() {
            std::thread::sleep(self.pacing.teardown);
        }
        let after_input = ended.elapsed();
        session.end(x);
        self.sent.push(Sent {
            window,
            cause,
            after_input,
            scheduled_by: request,
        });
    }

    /// The watched drag's session ended, its `FocusOut` sent now: once its late-take watch has ended (collected, so its
    /// Escape, if one went, came first), or at once for a drag that armed no watch. Nothing when there is none, or when
    /// a hold still keeps the drag's session (its own end, or the exit's, sends that `FocusOut`).
    pub fn end_watched(&mut self, x: &mut X11) {
        if let Some(Watched {
            window,
            request,
            session: Some((session, ended)),
        }) = self.watched.take()
        {
            self.end(x, window, session, Cause::Watch, ended, request);
        }
    }

    /// A key that reached `window` by another route at `at` (the late-take Escape): the settles follow it as they follow
    /// the engine's own keys, since the exit's unredirect could cut it.
    pub fn note_key(&mut self, window: Window, at: Instant) {
        for record in [&mut self.last_key, &mut self.last_input] {
            let last = record.entry(window).or_insert(at);
            if at > *last {
                *last = at;
            }
        }
    }

    /// A paste's settle (`settle.rs`), before its observation: if `window` took a key or a click within its settle,
    /// waits until that settle has passed since it (`Pacing::paste_settle` after a key, `paste_click_settle` after a
    /// click).
    pub fn settle_paste(&self, window: Window) -> PasteSettle {
        let (key, click) = (
            self.last_key.get(&window).copied(),
            self.last_click.get(&window).copied(),
        );
        let now = Instant::now();
        let wait = settle::paste_wait(key, self.pacing.paste_settle, now).max(settle::paste_wait(
            click,
            self.pacing.paste_click_settle,
            now,
        ));
        let waited = settle::wait((!wait.is_zero()).then(|| now + wait));
        let ago = |at: Option<Instant>| at.map(|at| now.saturating_duration_since(at));
        PasteSettle {
            after_key: ago(key),
            after_click: ago(click),
            waited,
        }
    }

    /// The `FocusOut`s sent since the last call, for the `--stats` line.
    pub fn take_sent(&mut self) -> Vec<Sent> {
        std::mem::take(&mut self.sent)
    }

    /// The engine's exit, its first act: every key still held released in reverse press order (the desktop's first, so
    /// nothing real stays down a moment longer than it must), each released hold's session kept for its `FocusOut`,
    /// which `end_released` sends once an armed late-take watch has run out, so that watch's Escape still goes inside
    /// the session it was sent for.
    pub fn release_held(&mut self, x: &mut X11) {
        self.holds = Holds::default();
        self.desktop.release_all(x);
        let held: Vec<(Window, Session)> = self.sessions.drain().collect();
        for (window, mut session) in held {
            session.finish(x);
            self.released.push((window, session));
        }
    }

    /// The exit's sessions ended: each one `release_held` kept gets its `FocusOut` now, with no wait.
    pub fn end_released(&mut self, x: &mut X11) {
        for (window, session) in std::mem::take(&mut self.released) {
            let ended = self.note_input(window, &session);
            self.end(x, window, session, Cause::Exit, ended, self.request.clone());
        }
    }

    /// When the exit's settle ends (`settle::EXIT_SETTLE`): the settle after the last background input to a window whose
    /// redirect the exit drops, None when no such window took input.
    pub fn exit_settle_until(&self, x: &X11) -> Option<Instant> {
        let held = self.last_input.iter().filter(|(window, _)| x.holds_redirect(**window));
        settle::until(held.map(|(_, at)| *at), self.pacing.exit_settle)
    }
}

impl Route<'_> {
    /// The time field an event sent now on this route carries: the background session's, or None through XTEST, whose
    /// events the server stamps itself.
    pub fn event_time(&self) -> Option<u32> {
        match self {
            Route::Window(session) => Some(session.now()),
            Route::Desktop(..) => None,
        }
    }

    /// Presses each keycode not already held for this target (behaviour §11.3).
    pub fn acquire(&mut self, x: &X11, keycodes: &[u8]) -> Result<Vec<u8>> {
        match self {
            Route::Window(session) => session.acquire(x, keycodes),
            Route::Desktop(desktop, _) => desktop.acquire(x, keycodes),
        }
    }

    pub fn release(&mut self, x: &X11, keycodes: &[u8]) -> Result<()> {
        match self {
            Route::Window(session) => session.release(x, keycodes),
            Route::Desktop(desktop, _) => desktop.release(x, keycodes),
        }
    }

    /// [`Route::release`], also answering which of these references are still unreleased.
    pub fn release_tracked(&mut self, x: &X11, keycodes: &[u8]) -> (Result<()>, Vec<u8>) {
        match self {
            Route::Window(session) => session.release_tracked(x, keycodes),
            Route::Desktop(desktop, _) => desktop.release_tracked(x, keycodes),
        }
    }

    /// A request's point in root coordinates: window-relative on the background and foreground routes, as given on
    /// the desktop.
    pub fn root_point(&self, x: &X11, px: i16, py: i16) -> Result<(i16, i16)> {
        match self {
            Route::Window(session) => x.desktop_position(session.target, px, py),
            Route::Desktop(_, Some(window)) => x.desktop_position(*window, px, py),
            Route::Desktop(_, None) => Ok((px, py)),
        }
    }

    /// Before the foreground route's pointer input: waits until the activated window is on top at every root point the
    /// input will use (a click's or a wheel's point, a move's end, every sample of a drag's path), as the server's
    /// stacking says (`cover.rs` `reach`), at most [`ON_TOP_WAIT`]. XTEST pointer events go to the topmost window under
    /// the point, and the window manager raises an activated window after the engine's own focus request has already
    /// given it the focus, so a press sent once the focus is in can reach the window still covering it (task 63). Only
    /// the points inside the window are waited for; the rest go where they would go, as a drag into another window does.
    /// The refusal's cause, with nothing sent, when the window is still covered at the bound. Every other route sends
    /// to the window itself, or to the desktop as it is: nothing to wait for.
    pub fn on_top_at(&mut self, x: &X11, points: &[(i16, i16)]) -> Result<std::result::Result<(), String>> {
        let Route::Desktop(desktop, Some(window)) = self else {
            return Ok(Ok(()));
        };
        let started = Instant::now();
        let reached = wait_until(
            || Ok(x.reach(*window, points)? == Reach::Window),
            ON_TOP_WAIT,
            ON_TOP_POLL,
        )?;
        desktop.on_top_waited = Some(started.elapsed());
        Ok(if reached {
            Ok(())
        } else {
            Err(format!(
                "window {window} was still covered at the input's point {} ms after it was activated",
                ON_TOP_WAIT.as_millis()
            ))
        })
    }

    /// Puts the pointer at a root point: the background `move_to`, or the desktop's interpolated path.
    pub fn place(&mut self, x: &X11, rx: i16, ry: i16) -> Result<()> {
        match self {
            Route::Window(session) => session.move_to(x, rx, ry),
            Route::Desktop(..) => Desktop::move_path(x, rx, ry),
        }
    }

    /// Puts the pointer there again right before a press: `move_to`, or one absolute motion.
    pub fn place_again(&mut self, x: &X11, rx: i16, ry: i16) -> Result<()> {
        match self {
            Route::Window(session) => session.move_to(x, rx, ry),
            Route::Desktop(..) => Desktop::motion(x, rx, ry),
        }
    }

    /// Releases a key the bookkeeping does not hold (its press's delivery unknown), sending no press.
    pub fn release_unheld(&mut self, x: &X11, keycode: u8) -> Result<()> {
        match self {
            Route::Window(session) => session.release_unheld(x, keycode),
            Route::Desktop(..) => Desktop::release_unheld(x, keycode),
        }
    }

    /// The background session, on the background route.
    pub fn session(&self) -> Option<&Session> {
        match self {
            Route::Window(session) => Some(session),
            Route::Desktop(..) => None,
        }
    }

    /// [`Route::session`], to change: a press that takes a fresh synthetic focus (`focus_ack.rs`).
    pub fn session_mut(&mut self) -> Option<&mut Session> {
        match self {
            Route::Window(session) => Some(session),
            Route::Desktop(..) => None,
        }
    }

    /// A button press, spending the acknowledgement [`crate::focus_ack::press_ack`] gave for it (task 61's fix 3): every
    /// press on a route has its own, read just before it; on the desktop route it asks nothing.
    pub fn press(&mut self, x: &X11, button: u8, ack: crate::focus_ack::PressAck) -> Result<()> {
        match self {
            Route::Window(session) => session.press(x, button, ack),
            Route::Desktop(..) => {
                if ack.issued_for().is_some() {
                    anyhow::bail!("a background press's acknowledgement cannot press on the desktop route");
                }
                Desktop::button(x, button, true)
            }
        }
    }

    pub fn release_button(&mut self, x: &X11, button: u8) -> Result<()> {
        match self {
            Route::Window(session) => session.release_button(x, button),
            Route::Desktop(..) => Desktop::button(x, button, false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_wait_for_the_raise_ends_once_it_holds_or_at_its_bound() {
        let readings = std::cell::Cell::new(0);
        let held = wait_until(
            || {
                readings.set(readings.get() + 1);
                Ok(readings.get() >= 4)
            },
            Duration::from_secs(5),
            Duration::from_millis(1),
        )
        .unwrap();
        assert_eq!((held, readings.get()), (true, 4));
        let bound = Duration::from_millis(40);
        let started = Instant::now();
        assert!(!wait_until(|| Ok(false), bound, Duration::from_millis(1)).unwrap());
        assert!(started.elapsed() >= bound);
        assert!(wait_until(|| Err(anyhow::anyhow!("BadWindow")), bound, Duration::from_millis(1)).is_err());
    }

    fn hold(target: Target, chord: &[u32]) -> Hold {
        Hold {
            target,
            chord: chord.to_vec(),
            keycodes: vec![37],
        }
    }

    #[test]
    fn a_hold_is_named_by_its_target_and_its_chord_in_order() {
        let mut holds = Holds::default();
        holds.insert(hold(Target::Window(7), &[0xffe3, 0xffe1]));
        assert!(holds.contains(Target::Window(7), &[0xffe3, 0xffe1]));
        assert!(
            !holds.contains(Target::Window(7), &[0xffe1, 0xffe3]),
            "shift+ctrl is another hold"
        );
        assert!(!holds.contains(Target::Window(8), &[0xffe3, 0xffe1]), "another window");
        assert!(!holds.contains(Target::Desktop, &[0xffe3, 0xffe1]), "the desktop");
        assert!(holds.take(Target::Desktop, &[0xffe3, 0xffe1]).is_none());
        assert!(holds.any_for(Target::Window(7)));
    }

    #[test]
    fn a_foreground_hold_is_its_window_s_and_not_the_background_route_s_nor_the_desktop_s() {
        let mut holds = Holds::default();
        holds.insert(hold(Target::Foreground(7), &[0xffe3]));
        assert!(holds.contains(Target::Foreground(7), &[0xffe3]));
        assert!(!holds.contains(Target::Window(7), &[0xffe3]));
        assert!(!holds.contains(Target::Desktop, &[0xffe3]));
        assert!(
            !holds.any_for(Target::Window(7)),
            "no background session is kept open for it"
        );
    }

    #[test]
    fn a_target_keeps_its_session_while_any_hold_names_it() {
        let mut holds = Holds::default();
        holds.insert(hold(Target::Window(7), &[0xffe3, 0x41]));
        holds.insert(hold(Target::Window(7), &[0xffe3, 0x42]));
        holds.insert(hold(Target::Desktop, &[0xffe3]));
        assert_eq!(
            holds.take(Target::Window(7), &[0xffe3, 0x41]).map(|h| h.chord),
            Some(vec![0xffe3, 0x41])
        );
        assert!(holds.any_for(Target::Window(7)), "ctrl+b still holds window 7");
        holds.take(Target::Window(7), &[0xffe3, 0x42]);
        assert!(!holds.any_for(Target::Window(7)));
        assert!(holds.any_for(Target::Desktop));
    }
}
