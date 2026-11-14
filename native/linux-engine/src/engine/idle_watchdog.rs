//! A held `drag_handle`'s idle bound kept while another request blocks the engine (the second review of task 73, P3).
//! The engine releases a handle past its bound between requests and at a request's entry (`handle.rs`), on its own
//! thread, so a request allowed during the hold that runs long (a key held for a minute, which the wire allows) kept
//! button 1 down past the bound. While such a request runs, this thread of the engine's own waits for the bound and
//! releases button 1 then, through XTEST on a connection of its own, where the pointer is; a Chromium handle's
//! after-release watch is told of the release at once, so a late take is still cancelled
//! ([`crate::dnd::ReleaseTeller`]). It sends nothing else: the rest, the revisit and the dwell, and the drop's
//! confirmation, which the timeout's notice stands for anyway, belong to the engine's own release. Once the request is
//! done the engine collects what the release did and leaves it pending, through T14's path, as its own idle release
//! does ([`super::Engine::collect_watchdog_release`]).
//!
//! It never acts while the engine is between requests (the engine's own release runs then) or during the handle's own
//! requests (its moves, its end, `release_handle`), which keep or end the hold themselves: the engine arms it for each
//! other request and disarms it when that request is done.

use std::sync::{Arc, Condvar, Mutex};
use std::time::Instant;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::ConnectionExt as _;

use crate::dnd::ReleaseTeller;

/// What the thread's release did: when the button went up, where the pointer was (None: on another screen, or not
/// read), and what failed. With an error, the button may still be down, and the engine releases it itself.
#[derive(Debug)]
pub struct Fired {
    pub at: Instant,
    pub pointer: Option<(i16, i16)>,
    pub error: Option<String>,
}

#[derive(Default)]
struct State {
    /// The held handle's due time, while a request other than the handle's own runs.
    due: Option<Instant>,
    /// A Chromium handle's after-release watch, told of the release.
    teller: Option<ReleaseTeller>,
    fired: Option<Fired>,
    quit: bool,
}

/// The thread, started with the engine's first armed request.
pub struct IdleWatchdog {
    shared: Arc<(Mutex<State>, Condvar)>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl IdleWatchdog {
    pub fn start() -> IdleWatchdog {
        let shared = Arc::new((Mutex::new(State::default()), Condvar::new()));
        let thread = {
            let shared = shared.clone();
            std::thread::spawn(move || watch(&shared))
        };
        IdleWatchdog {
            shared,
            thread: Some(thread),
        }
    }

    /// A request other than the handle's own begins: the held handle is released at `due` unless the request is done
    /// first.
    pub fn arm(&self, due: Instant, teller: Option<ReleaseTeller>) {
        let (lock, wake) = &*self.shared;
        let mut state = lock.lock().expect("the watchdog never panics holding it");
        state.due = Some(due);
        state.teller = teller;
        wake.notify_all();
    }

    /// The request is done: nothing more is released, and what was is answered. A release under way is waited for.
    pub fn disarm(&self) -> Option<Fired> {
        let (lock, _) = &*self.shared;
        let mut state = lock.lock().expect("the watchdog never panics holding it");
        state.due = None;
        state.teller = None;
        state.fired.take()
    }
}

impl Drop for IdleWatchdog {
    fn drop(&mut self) {
        let (lock, wake) = &*self.shared;
        if let Ok(mut state) = lock.lock() {
            state.quit = true;
        }
        wake.notify_all();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// The thread: asleep until armed, then until the due time or a disarm; at the due time, the release, made while the
/// lock is held so a disarm waits for it and finds it.
fn watch(shared: &(Mutex<State>, Condvar)) {
    let (lock, wake) = shared;
    let mut state = lock.lock().expect("the engine never panics holding it");
    loop {
        if state.quit {
            return;
        }
        state = match state.due {
            None => wake.wait(state).expect("the engine never panics holding it"),
            Some(due) if Instant::now() < due => {
                wake.wait_timeout(state, due - Instant::now())
                    .expect("the engine never panics holding it")
                    .0
            }
            Some(_) => {
                state.due = None;
                let teller = state.teller.take();
                state.fired = Some(release(teller));
                state
            }
        };
    }
}

/// Button 1 up where the pointer is, stamped as it goes out, on a connection of this thread's own; the after-release
/// watch told.
fn release(teller: Option<ReleaseTeller>) -> Fired {
    let mut pointer = None;
    let mut at = Instant::now();
    let sent = (|| -> anyhow::Result<()> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        let reply = conn.query_pointer(root)?.reply()?;
        pointer = reply.same_screen.then_some((reply.root_x, reply.root_y));
        at = Instant::now();
        crate::desktop::Desktop::release_on(&conn, root, 1)?;
        conn.flush()?;
        Ok(())
    })();
    if sent.is_ok()
        && let Some(teller) = teller
    {
        teller.released(at);
    }
    Fired {
        at,
        pointer,
        error: sent.err().map(|e| format!("{e:#}")),
    }
}
