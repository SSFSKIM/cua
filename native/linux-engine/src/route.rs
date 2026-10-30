//! Which route a request's input takes, and the input state that outlives a request (behaviour §8.1, §11.3): a
//! request naming a window goes through that window's background session, one without a window through the desktop
//! (XTEST). Keys held with `key_down` keep their target: a window's session stays open across requests (its
//! redirect, synthetic focus and time anchor reused with no X requests) until its last hold is released, and the
//! held keys' counts are shared with every later request to the same target.

use std::collections::HashMap;

use anyhow::Result;
use x11rb::protocol::xproto::Window;

use crate::desktop::Desktop;
use crate::input::{Pacing, Session};
use crate::x11::X11;

/// A request's input target: a window (the background route) or the desktop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Target {
    Desktop,
    Window(Window),
}

impl Target {
    pub fn of(window: Option<crate::wire::Target>) -> Target {
        window.map_or(Target::Desktop, |w| Target::Window(w.id))
    }
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

/// The input state of the engine's life: the open sessions of windows with held keys, the desktop's held keys and
/// the holds themselves.
pub struct Inputs {
    pub pacing: Pacing,
    pub sessions: HashMap<Window, Session>,
    pub desktop: Desktop,
    pub holds: Holds,
}

/// A request's route while it runs.
pub enum Route<'a> {
    Window(&'a mut Session),
    Desktop(&'a mut Desktop),
}

impl Inputs {
    pub fn new(pacing: Pacing) -> Inputs {
        Inputs {
            pacing,
            sessions: HashMap::new(),
            desktop: Desktop::new(pacing.key),
            holds: Holds::default(),
        }
    }

    /// Runs `body` on the target's route. A window's session is the held one if its keys are held, else opened for
    /// this request; afterwards it stays open while the window has holds, with any button still down released and
    /// its grab dropped, and is closed otherwise (whatever the body's outcome; the body's error wins).
    pub fn with_route<T>(
        &mut self,
        x: &mut X11,
        target: Target,
        body: impl FnOnce(&mut X11, &mut Route, &mut Holds) -> Result<T>,
    ) -> Result<T> {
        match target {
            Target::Desktop => body(x, &mut Route::Desktop(&mut self.desktop), &mut self.holds),
            Target::Window(window) => {
                let mut session = match self.sessions.remove(&window) {
                    Some(session) => session,
                    None => Session::open(x, window, self.pacing)?,
                };
                let result = body(x, &mut Route::Window(&mut session), &mut self.holds);
                if self.holds.any_for(target) {
                    // only key holds outlive a request: a button an interrupted request left down, and its grab, do not
                    session.release_buttons(x);
                    self.sessions.insert(window, session);
                } else {
                    session.close(x);
                }
                result
            }
        }
    }

    /// The engine's exit: every key still held is released in reverse press order, and every open session closed.
    pub fn release_everything(&mut self, x: &mut X11) {
        self.holds = Holds::default();
        for (_, session) in self.sessions.drain() {
            session.close(x);
        }
        self.desktop.release_all(x);
    }
}

impl Route<'_> {
    /// Presses each keycode not already held for this target (behaviour §11.3).
    pub fn acquire(&mut self, x: &X11, keycodes: &[u8]) -> Result<Vec<u8>> {
        match self {
            Route::Window(session) => session.acquire(x, keycodes),
            Route::Desktop(desktop) => desktop.acquire(x, keycodes),
        }
    }

    pub fn release(&mut self, x: &X11, keycodes: &[u8]) -> Result<()> {
        match self {
            Route::Window(session) => session.release(x, keycodes),
            Route::Desktop(desktop) => desktop.release(x, keycodes),
        }
    }

    /// [`Route::release`], also answering which of these references are still unreleased.
    pub fn release_tracked(&mut self, x: &X11, keycodes: &[u8]) -> (Result<()>, Vec<u8>) {
        match self {
            Route::Window(session) => session.release_tracked(x, keycodes),
            Route::Desktop(desktop) => desktop.release_tracked(x, keycodes),
        }
    }

    /// A request's point in root coordinates: window-relative on the background route, as given on the desktop.
    pub fn root_point(&self, x: &X11, px: i16, py: i16) -> Result<(i16, i16)> {
        match self {
            Route::Window(session) => x.desktop_position(session.target, px, py),
            Route::Desktop(_) => Ok((px, py)),
        }
    }

    /// Puts the pointer at a root point: the background `move_to`, or the desktop's interpolated path.
    pub fn place(&mut self, x: &X11, rx: i16, ry: i16) -> Result<()> {
        match self {
            Route::Window(session) => session.move_to(x, rx, ry),
            Route::Desktop(_) => Desktop::move_path(x, rx, ry),
        }
    }

    /// Puts the pointer there again right before a press: `move_to`, or one absolute motion.
    pub fn place_again(&mut self, x: &X11, rx: i16, ry: i16) -> Result<()> {
        match self {
            Route::Window(session) => session.move_to(x, rx, ry),
            Route::Desktop(_) => Desktop::motion(x, rx, ry),
        }
    }

    /// The background session, on the background route.
    pub fn session(&self) -> Option<&Session> {
        match self {
            Route::Window(session) => Some(session),
            Route::Desktop(_) => None,
        }
    }

    pub fn button(&mut self, x: &X11, button: u8, press: bool) -> Result<()> {
        match self {
            Route::Window(session) => session.button(x, button, press),
            Route::Desktop(_) => Desktop::button(x, button, press),
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
