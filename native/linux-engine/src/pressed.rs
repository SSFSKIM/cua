//! Every key (and XTEST button) the engine has pressed and not yet released, on either route, kept beside the input bookkeeping
//! (`route.rs`, `input.rs`) for the exits that cannot wait for it: the backstop, 1 s after a stop signal, and a second
//! SIGINT end the process whatever its main thread is doing, perhaps in the middle of a request (`serve.rs`), and a
//! panic aborts it. No exit but SIGKILL may leave a key down (the design session's ruling, M4 T7b), so each of those
//! releases what is recorded here first, over a connection of its own ([`release_all_within`], [`release_first_at_panic`]).
//!
//! A press is recorded before it is sent, under the ledger's lock, and a release struck once it went out, so at any
//! moment the ledger holds at least every key the X server, or a window, may still have down. A release that finds a
//! key already up changes nothing: the X server ignores the release of an XTEST key or button that is not down, and a
//! window's synthetic release of a key it saw go up is a stray release, which toolkits drop. Once the forced exit has
//! taken the lock it keeps it until the process ends, so no press can follow its releases.
//!
//! XTEST's buttons are recorded too and released like keys, a drag's as well as a wheel's (the design session's ruling,
//! M4 T7b): a button 1 still down is a drag in flight (a `drag` cut by a forced exit, a `drag_handle` between its start
//! and its end), and its release ends the drag where the pointer is, at the model's last point unless the person moved
//! the pointer since, while a button left down would break the person's mouse for good.
//!
//! A panic inside a send happens with the ledger's lock held by the panicking thread, which never gives it back (the
//! engine aborts once the hook has run). So each send runs with a copy of the ledger kept by its own thread
//! (`IN_SEND`), and the panic hook releases from that copy, touching no lock, before the diagnostics are written.

use std::cell::RefCell;
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
}

/// The keys and buttons down, in press order.
#[derive(Debug, Default)]
pub struct Ledger(Mutex<Vec<Pressed>>);

/// The engine's own.
static LEDGER: Ledger = Ledger(Mutex::new(Vec::new()));

thread_local! {
    /// While this thread sends an edge, the ledger's lock held: what was down as the send began, the key being pressed
    /// included. Only the thread itself reads it, in its panic hook, where the lock it holds can never be taken.
    static IN_SEND: RefCell<Option<Vec<Pressed>>> = const { RefCell::new(None) };
}

/// The send's copy of the ledger, kept for as long as the send runs ([`IN_SEND`]).
struct Sending;

impl Sending {
    fn begin(down: &[Pressed]) -> Sending {
        IN_SEND.with(|copy| *copy.borrow_mut() = Some(down.to_vec()));
        Sending
    }
}

impl Drop for Sending {
    fn drop(&mut self) {
        let _ = IN_SEND.try_with(|copy| copy.borrow_mut().take());
    }
}

impl Ledger {
    fn lock(&self) -> MutexGuard<'_, Vec<Pressed>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Sends one key edge through `send` under the lock: a press recorded first (its delivery is unknown if the send
    /// fails), a release struck only once it went out.
    pub fn edge<T, E>(&self, key: Pressed, press: bool, send: impl FnOnce() -> Result<T, E>) -> Result<T, E> {
        let mut down = self.lock();
        if press && !down.iter().any(|d| d.same_key(&key)) {
            down.push(key);
        }
        let sending = Sending::begin(&down);
        let sent = send();
        drop(sending);
        if !press && sent.is_ok() {
            down.retain(|d| !d.same_key(&key));
        }
        sent
    }

    /// What an exit releases, latest first, taken out of the ledger with the lock held: nothing can be pressed or
    /// released until the guard goes.
    fn take(&self) -> (MutexGuard<'_, Vec<Pressed>>, Vec<Pressed>) {
        let mut down = self.lock();
        let keys = latest_first(std::mem::take(&mut *down));
        (down, keys)
    }
}

fn latest_first(mut down: Vec<Pressed>) -> Vec<Pressed> {
    down.reverse();
    down
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

/// Where a forced exit's releases go: [`over_own_connection`] in the engine, a record in the tests.
pub type Sender = fn(&[Pressed]);

/// Sends `keys`' releases over an X connection of the exit's own, since the main thread may be inside a request on the
/// engine's.
pub fn over_own_connection(keys: &[Pressed]) {
    if let Ok((conn, screen)) = x11rb::connect(None) {
        let root = conn.setup().roots[screen].root;
        send_releases(&conn, root, keys);
    }
}

/// The forced exit's release, before the process ends, through `send`; waited for at most `bound`, so an X server that
/// does not answer cannot hold the exit. The ledger's lock is taken on a thread of the release's own (another thread
/// holds it only for one send) and never given back.
pub fn release_all_within(bound: Duration, send: Sender) {
    within(bound, move || {
        let (held, keys) = LEDGER.take();
        send(&keys);
        std::mem::forget(held);
    });
}

/// Runs `release` on a thread of its own and waits for it at most `bound`.
fn within(bound: Duration, release: impl FnOnce() + Send + 'static) {
    let (done, finished) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        release();
        let _ = done.send(());
    });
    let _ = finished.recv_timeout(bound);
}

/// The panic's release: from the send's own copy when this thread panicked inside a send, its lock held for good
/// ([`IN_SEND`]); otherwise as the other forced exits release ([`release_all_within`]).
fn release_at_panic(bound: Duration, send: Sender) {
    let copy = IN_SEND
        .try_with(|copy| copy.try_borrow_mut().ok().and_then(|mut copy| copy.take()))
        .ok()
        .flatten();
    match copy {
        Some(down) => {
            let keys = latest_first(down);
            within(bound, move || send(&keys));
        }
        None => release_all_within(bound, send),
    }
}

/// Installs the panic hook. A panic aborts the engine (`panic = "abort"`) once the hook has run, so the hook releases
/// what is held first, then writes the diagnostics, so that a stderr nobody reads cannot hold the release back.
pub fn release_first_at_panic(send: Sender) {
    let diagnostics = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        release_at_panic(FORCED_RELEASE_BOUND, send);
        diagnostics(info);
    }));
}

/// How long a forced exit waits for its release.
pub const FORCED_RELEASE_BOUND: Duration = Duration::from_millis(200);

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
    fn every_button_is_released_with_the_keys_a_drag_s_too() {
        // a drag's button up ends the drag where the pointer is; one left down breaks the person's mouse for good (the
        // design session's ruling, M4 T7b)
        let ledger = Ledger::default();
        for key in [Pressed::Button(1), Pressed::Button(4), Pressed::Desktop(50)] {
            let _ = ledger.edge(key, true, || Ok::<_, ()>(()));
        }
        let (held, keys) = ledger.take();
        assert_eq!(keys, [Pressed::Desktop(50), Pressed::Button(4), Pressed::Button(1)]);
        assert!(held.is_empty());
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

    /// The child half of [`a_panic_inside_a_send_releases_every_key_before_its_diagnostics`]: it runs only in the
    /// child process that test starts, with the engine's own ledger and hook.
    #[test]
    fn panic_inside_a_send_child() {
        if std::env::var_os(PANIC_CHILD).is_none() {
            return;
        }
        fn record(keys: &[Pressed]) {
            eprintln!("released {keys:?}");
        }
        release_first_at_panic(record);
        // the engine aborts once its hook has run (`panic = "abort"`); the test profile unwinds, so the process ends here,
        // the send's lock never given back (an exit rather than an abort: no core dump)
        let engine_s = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            engine_s(info);
            eprintln!("the hook returned");
            std::process::exit(134);
        }));
        let _ = desktop_key(38, true, || Ok::<_, ()>(()));
        let _ = desktop_key(50, true, || -> Result<(), ()> { panic!("inside the send") });
    }

    const PANIC_CHILD: &str = "CUA_ENGINE_PANIC_CHILD";

    #[test]
    fn a_panic_inside_a_send_releases_every_key_before_its_diagnostics() {
        // the panicking thread holds the ledger's lock inside the send: the release must not wait for it, and must not
        // wait for the diagnostics either (the re-review of M4 T7b's fix)
        let out = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "pressed::tests::panic_inside_a_send_child",
                "--nocapture",
                "--test-threads",
                "1",
            ])
            .env(PANIC_CHILD, "1")
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&out.stderr);
        let released = stderr.find("released [Desktop(50), Desktop(38)]");
        let diagnostics = stderr.find("panicked at");
        let aborted = stderr.find("the hook returned");
        assert!(
            released.is_some(),
            "both keys released, the one being pressed too:\n{stderr}"
        );
        assert!(diagnostics.is_some() && aborted.is_some(), "{stderr}");
        assert!(released < diagnostics, "the release before the diagnostics:\n{stderr}");
    }
}
