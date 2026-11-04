//! Every key (and XTEST button) the engine has pressed and not yet released, on either route, kept beside the input bookkeeping
//! (`route.rs`, `input.rs`) for the exits that cannot wait for it: the backstop, 2 s after a stop signal, and a second
//! SIGINT end the process whatever its main thread is doing, perhaps in the middle of a request (`serve.rs`), and a
//! panic aborts it. No exit but SIGKILL may leave a key down (the design session's ruling, M4 T7b), so each of those
//! releases what is recorded here first, over a connection of its own ([`release_all_within`]).
//!
//! A press is recorded before it is sent, under the ledger's lock, and a release struck once it went out, so at any
//! moment the ledger holds at least every key the X server, or a window, may still have down. A release that finds a
//! key already up changes nothing: the X server ignores the release of an XTEST key that is not down, and a window's
//! synthetic release of a key it saw go up is a stray release, which toolkits drop. Once the forced exit has taken the
//! lock it keeps it until the process ends, so no press can follow its releases.
//!
//! XTEST's buttons are recorded too, and a wheel button (4 and up, down for one scroll step's hold) is released like a
//! key. Buttons 1 to 3 are not: one still down is a drag in flight (a `drag` cut at the backstop, a `drag_handle`
//! between its start and its end), and its release would drop it wherever the pointer happens to be, so whether an exit
//! releases it is the design session's to rule (task 57's report); until then it stays as it was.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    BUTTON_RELEASE_EVENT, ConnectionExt as _, EventMask, KEY_RELEASE_EVENT, KeyPressEvent, Window,
};
use x11rb::protocol::xtest::ConnectionExt as _;

/// One key or button down.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Pressed {
    /// Through XTEST: the X server's own key state, the desktop's and the foreground route's.
    Desktop(u8),
    /// An XTEST button.
    Button(u8),
    /// A synthetic key event to one window (the background route), with the state and the event time its press
    /// carried and when it was sent, so its release carries the same state and a later time.
    Window {
        window: Window,
        keycode: u8,
        state: u16,
        time: u32,
        at: Instant,
    },
}

impl Pressed {
    /// Whether `other` is a press or release of the same key on the same target.
    fn same_key(&self, other: &Pressed) -> bool {
        match (self, other) {
            (Pressed::Desktop(a), Pressed::Desktop(b)) | (Pressed::Button(a), Pressed::Button(b)) => a == b,
            (
                Pressed::Window {
                    window: a, keycode: x, ..
                },
                Pressed::Window {
                    window: b, keycode: y, ..
                },
            ) => a == b && x == y,
            _ => false,
        }
    }

    /// A pointer button a drag holds (1 to 3), as against a wheel's.
    fn is_drag_button(&self) -> bool {
        matches!(self, Pressed::Button(1..=3))
    }
}

/// The keys and buttons down, in press order.
#[derive(Debug, Default)]
pub struct Ledger(Mutex<Vec<Pressed>>);

/// The engine's own.
static LEDGER: Ledger = Ledger(Mutex::new(Vec::new()));

impl Ledger {
    fn lock(&self) -> MutexGuard<'_, Vec<Pressed>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Sends one key edge through `send` under the lock: a press recorded first (its delivery is unknown if the send
    /// fails), a release struck only once it went out.
    pub fn edge<T, E>(&self, key: Pressed, press: bool, send: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
        let mut down = self.lock();
        if press {
            if !down.iter().any(|d| d.same_key(&key)) {
                down.push(key);
            }
            return send();
        }
        let sent = send();
        if sent.is_ok() {
            down.retain(|d| !d.same_key(&key));
        }
        sent
    }

    /// What an exit releases, latest first, taken out of the ledger with the lock held: nothing can be pressed or
    /// released until the guard goes. A drag's button stays recorded and down (the module's comment).
    fn take(&self) -> (MutexGuard<'_, Vec<Pressed>>, Vec<Pressed>) {
        let mut down = self.lock();
        let (drags, releasable): (Vec<Pressed>, Vec<Pressed>) = std::mem::take(&mut *down)
            .into_iter()
            .partition(Pressed::is_drag_button);
        *down = drags;
        (down, releasable.into_iter().rev().collect())
    }
}

/// An XTEST key edge, recorded ([`Ledger::edge`]).
pub fn desktop_key<T, E>(keycode: u8, press: bool, send: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    LEDGER.edge(Pressed::Desktop(keycode), press, send)
}

/// An XTEST button edge, recorded ([`Ledger::edge`]).
pub fn desktop_button<T, E>(button: u8, press: bool, send: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
    LEDGER.edge(Pressed::Button(button), press, send)
}

/// A window's synthetic key edge, recorded ([`Ledger::edge`]).
pub fn window_key<T, E>(
    window: Window,
    keycode: u8,
    state: u16,
    time: u32,
    press: bool,
    send: impl FnOnce() -> Result<T, E>,
) -> Result<T, E> {
    let key = Pressed::Window {
        window,
        keycode,
        state,
        time,
        at: Instant::now(),
    };
    LEDGER.edge(key, press, send)
}

/// Sends the release of each key, latest first, then waits for the server to have handled them; a failure is
/// dropped (the window may be gone), and the rest still go.
fn send_releases(conn: &impl Connection, root: Window, keys: &[Pressed]) {
    for key in keys {
        let _ = match *key {
            Pressed::Desktop(keycode) => conn
                .xtest_fake_input(KEY_RELEASE_EVENT, keycode, 0, root, 0, 0, 0)
                .map(|c| c.ignore_error()),
            Pressed::Button(button) => conn
                .xtest_fake_input(BUTTON_RELEASE_EVENT, button, 0, root, 0, 0, 0)
                .map(|c| c.ignore_error()),
            Pressed::Window {
                window,
                keycode,
                state,
                time,
                at,
            } => {
                let event = KeyPressEvent {
                    response_type: KEY_RELEASE_EVENT,
                    detail: keycode,
                    sequence: 0,
                    time: time.wrapping_add(at.elapsed().as_millis() as u32),
                    root,
                    event: window,
                    child: x11rb::NONE,
                    root_x: 0,
                    root_y: 0,
                    event_x: 0,
                    event_y: 0,
                    state: state.into(),
                    same_screen: true,
                };
                conn.send_event(false, window, EventMask::NO_EVENT, event)
                    .map(|c| c.ignore_error())
            }
        };
    }
    if let Ok(cookie) = conn.get_input_focus() {
        let _ = cookie.reply();
    }
}

/// The orderly exit's release of what the input bookkeeping no longer holds (`Engine::shutdown`), on the engine's own
/// connection: after it has released its holds, normally nothing.
pub fn release_rest(conn: &impl Connection, root: Window) {
    let (_held, keys) = LEDGER.take();
    send_releases(conn, root, &keys);
}

/// The forced exit's release, before the process ends: over a connection of its own, since the main thread may be
/// inside a request on the engine's; waited for at most `bound`, so an X server that does not answer cannot hold the
/// exit. The ledger's lock is never given back.
pub fn release_all_within(bound: Duration) {
    let (done, finished) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if let Ok((conn, screen)) = x11rb::connect(None) {
            let root = conn.setup().roots[screen].root;
            let (held, keys) = LEDGER.take();
            send_releases(&conn, root, &keys);
            std::mem::forget(held);
        }
        let _ = done.send(());
    });
    let _ = finished.recv_timeout(bound);
}

/// How long a forced exit waits for its release.
pub const FORCED_RELEASE_BOUND: Duration = Duration::from_millis(500);

#[cfg(test)]
mod tests {
    use super::*;

    fn window(window: Window, keycode: u8) -> Pressed {
        Pressed::Window {
            window,
            keycode,
            state: 1,
            time: 7,
            at: Instant::now(),
        }
    }

    #[test]
    fn a_press_is_recorded_and_a_release_struck_only_once_it_went_out() {
        let ledger = Ledger::default();
        assert_eq!(ledger.edge(Pressed::Desktop(50), true, || Ok::<_, ()>(())), Ok(()));
        assert_eq!(ledger.lock().len(), 1);
        assert_eq!(
            ledger.edge(Pressed::Desktop(50), false, || Err::<(), _>("lost")),
            Err("lost")
        );
        assert_eq!(ledger.lock().len(), 1, "a failed release leaves the key down");
        assert_eq!(ledger.edge(Pressed::Desktop(50), false, || Ok::<_, ()>(())), Ok(()));
        assert_eq!(ledger.lock().len(), 0);
    }

    #[test]
    fn a_failed_press_stays_recorded_since_its_delivery_is_unknown() {
        let ledger = Ledger::default();
        let _ = ledger.edge(Pressed::Desktop(37), true, || Err::<(), _>("ack lost"));
        let (_held, keys) = ledger.take();
        assert_eq!(keys, [Pressed::Desktop(37)]);
    }

    #[test]
    fn keys_are_told_apart_by_target_and_released_latest_first() {
        let ledger = Ledger::default();
        for key in [
            Pressed::Desktop(50),
            window(7, 50),
            window(8, 50),
            Pressed::Desktop(38),
            Pressed::Desktop(50),
        ] {
            let _ = ledger.edge(key, true, || Ok::<_, ()>(()));
        }
        let _ = ledger.edge(window(8, 50), false, || Ok::<_, ()>(()));
        let (_held, keys) = ledger.take();
        let named: Vec<String> = keys
            .iter()
            .map(|k| match k {
                Pressed::Desktop(c) => format!("desktop {c}"),
                Pressed::Button(b) => format!("button {b}"),
                Pressed::Window { window, keycode, .. } => format!("window {window} {keycode}"),
            })
            .collect();
        assert_eq!(
            named,
            ["desktop 38", "window 7 50", "desktop 50"],
            "a key pressed twice is down once; another window's key is its own"
        );
    }

    #[test]
    fn a_wheel_button_is_released_with_the_keys_and_a_drag_s_button_stays_down() {
        let ledger = Ledger::default();
        for key in [Pressed::Button(1), Pressed::Button(4), Pressed::Desktop(50)] {
            let _ = ledger.edge(key, true, || Ok::<_, ()>(()));
        }
        let (held, keys) = ledger.take();
        assert_eq!(keys, [Pressed::Desktop(50), Pressed::Button(4)]);
        assert_eq!(*held, [Pressed::Button(1)], "still recorded: still down");
    }

    #[test]
    fn nothing_is_pressed_while_the_forced_exit_holds_the_ledger() {
        let ledger = std::sync::Arc::new(Ledger::default());
        let _ = ledger.edge(Pressed::Desktop(50), true, || Ok::<_, ()>(()));
        let (held, keys) = ledger.take();
        assert_eq!(keys, [Pressed::Desktop(50)]);
        let (pressed, presses) = std::sync::mpsc::channel();
        let other = ledger.clone();
        std::thread::spawn(move || {
            let _ = other.edge(Pressed::Desktop(38), true, || pressed.send(()));
        });
        assert!(
            presses.recv_timeout(Duration::from_millis(100)).is_err(),
            "the press waits for the lock"
        );
        std::mem::forget(held);
    }
}
