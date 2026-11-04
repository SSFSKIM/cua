//! Which route a request's input takes, and the input state that outlives a request (behaviour §8.1, §11.3): a
//! request naming a window goes through that window's background session, one without a window through the desktop
//! (XTEST), and one whose window's family ignores the background route, in dedicated mode, through the desktop after
//! the window is activated (the foreground route; Design, Device mode). Keys held with `key_down` keep their target: a
//! window's session stays open across requests (its redirect, synthetic focus and time anchor reused with no X
//! requests) until its last hold is released, and the held keys' counts are shared with every later request to the
//! same target. The desktop's counts are one set, whichever window a foreground hold was made for: XTEST's keys are
//! the server's.
//!
//! A session no hold keeps waits on its `FocusOut` timer once its request's input ends (`focus_timer.rs`; M4's T7):
//! the next background input to the same window takes it back with no `FocusOut` between, and any other input (to
//! another window, through the desktop or the foreground route) first flushes every pending timer, waiting out the rest
//! of each window's delay.

use std::collections::HashMap;
use std::time::Instant;

use anyhow::Result;
use serde_json::Value;
use x11rb::protocol::xproto::Window;

use crate::desktop::Desktop;
use crate::focus_timer::{self, Cause, Sent, Timers, Wall};
use crate::input::{Pacing, Session};
use crate::x11::X11;

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

/// The input state of the engine's life: the open sessions of windows with held keys, the sessions waiting on their
/// `FocusOut` timer, the desktop's held keys and the holds themselves.
pub struct Inputs {
    pub pacing: Pacing,
    pub sessions: HashMap<Window, Session>,
    timers: Timers<Session>,
    pub desktop: Desktop,
    pub holds: Holds,
    /// The id of the request being handled, which a timer its input starts names (`Sent::scheduled_by`).
    pub request: Value,
    /// The `FocusOut`s sent and not yet reported (`take_sent`).
    sent: Vec<Sent>,
    /// When each window's background input last ended, for the exit's settle (`exit_settle_until`).
    last_input: HashMap<Window, Instant>,
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
            timers: Timers::new(pacing.teardown),
            desktop: Desktop::new(pacing.key),
            holds: Holds::default(),
            request: Value::Null,
            sent: Vec::new(),
            last_input: HashMap::new(),
        }
    }

    /// Runs `body` on the target's route. Every other window's pending `FocusOut` timer is flushed first (a window's
    /// own is kept for more background input to it). A window's session is the held one if its keys are held, else the
    /// one waiting on its timer, else opened for this request; afterwards it stays open while the window has holds,
    /// with any button still down released and its grab dropped, and otherwise ends its input and waits on its timer
    /// (whatever the body's outcome; the body's error wins).
    pub fn with_route<T>(
        &mut self,
        x: &mut X11,
        target: Target,
        body: impl FnOnce(&mut X11, &mut Route, &mut Holds) -> Result<T>,
    ) -> Result<T> {
        match target {
            Target::Desktop => {
                self.flush(x, None, Cause::Flush);
                body(x, &mut Route::Desktop(&mut self.desktop, None), &mut self.holds)
            }
            Target::Foreground(window) => {
                self.flush(x, None, Cause::Flush);
                body(x, &mut Route::Desktop(&mut self.desktop, Some(window)), &mut self.holds)
            }
            Target::Window(window) => {
                self.flush(x, Some(window), Cause::Flush);
                let mut session = match self.sessions.remove(&window) {
                    Some(session) => session,
                    None => match self.timers.resume(window) {
                        Some(session) => session.resume(x)?,
                        None => Session::open(x, window, self.pacing)?,
                    },
                };
                let result = body(x, &mut Route::Window(&mut session), &mut self.holds);
                if self.holds.any_for(target) {
                    // only key holds outlive a request: a button an interrupted request left down, and its grab, do not
                    session.release_buttons(x);
                    self.sessions.insert(window, session);
                } else {
                    session.finish(x);
                    self.defer(x, window, session);
                }
                result
            }
        }
    }

    /// A session whose input has ended put on its `FocusOut` timer; with no delay (`--teardown-ms 0`) it ends at once.
    fn defer(&mut self, x: &mut X11, window: Window, session: Session) {
        let now = Instant::now();
        self.last_input.insert(window, now);
        self.timers.start(window, session, now, self.request.clone());
        if self.pacing.teardown.is_zero() {
            self.fire_due(x);
        }
    }

    /// Every pending timer but `keep`'s waited out and its session ended (`focus_timer.rs`), recorded as `cause`.
    fn flush(&mut self, x: &mut X11, keep: Option<Window>, cause: Cause) {
        let sent = self.timers.flush(keep, cause, &mut Wall, |_, session| session.end(x));
        self.sent.extend(sent);
    }

    /// The ordinary flush before input that goes to no background session (a paste's observation, an activation):
    /// every pending timer waited out, its window's own included.
    pub fn flush_all(&mut self, x: &mut X11) {
        self.flush(x, None, Cause::Flush);
    }

    /// Every timer due by now fired.
    pub fn fire_due(&mut self, x: &mut X11) {
        let sent = self.timers.fire_due(&Wall, |_, session| session.end(x));
        self.sent.extend(sent);
    }

    /// The late-take watch's route to a window past the timers while it watches (`focus_timer::Gate`), None after.
    pub fn set_gate(&mut self, gate: Option<crate::focus_timer::Gate>) {
        self.timers.set_gate(gate);
    }

    /// When the next pending `FocusOut` is due.
    pub fn next_due(&self) -> Option<Instant> {
        self.timers.next_due()
    }

    /// Input that reached `window` by another route at `at` (the late-take Escape): its pending timer restarts.
    pub fn restart(&mut self, window: Window, at: Instant) {
        self.timers.restart(window, at);
    }

    /// The `FocusOut`s sent since the last call, for the `--stats` line.
    pub fn take_sent(&mut self) -> Vec<Sent> {
        std::mem::take(&mut self.sent)
    }

    /// The engine's exit: every key still held released in reverse press order (the desktop's first, so nothing real
    /// stays down while the background drains), then every pending `FocusOut` timer drained: waited out, at most the
    /// delay, the released holds' windows' timers starting at their release.
    pub fn release_everything(&mut self, x: &mut X11) {
        self.holds = Holds::default();
        self.desktop.release_all(x);
        let held: Vec<(Window, Session)> = self.sessions.drain().collect();
        for (window, mut session) in held {
            session.finish(x);
            let now = Instant::now();
            self.last_input.insert(window, now);
            self.timers.start(window, session, now, self.request.clone());
        }
        self.flush(x, None, Cause::Exit);
    }

    /// When the exit's settle ends (`focus_timer::EXIT_SETTLE`): the settle after the last input to a window whose
    /// redirect the exit drops, None when no such window took input.
    pub fn exit_settle_until(&self, x: &X11) -> Option<Instant> {
        let held = self.last_input.iter().filter(|(window, _)| x.holds_redirect(**window));
        focus_timer::exit_settle_until(held.map(|(_, at)| *at), self.pacing.exit_settle)
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

    pub fn button(&mut self, x: &X11, button: u8, press: bool) -> Result<()> {
        match self {
            Route::Window(session) => session.button(x, button, press),
            Route::Desktop(..) => Desktop::button(x, button, press),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
