//! Test builds only: faults injected into the key events the engine sends, on either route, to prove how the paste
//! route answers when the X server's acknowledgement of a delivered key is lost, when the server rejects a key before
//! delivering it, and when a release fails; and hooks at the steps of a window's association and of a request's
//! effects, where a test changes the desktop between two of the engine's own steps. Armed per thread (the engine's requests run on the test's thread),
//! and every key event sent is logged.

use std::cell::RefCell;

use anyhow::Result;
use x11rb::errors::{ConnectionError, ReplyError};
use x11rb::x11_utils::X11Error;

/// The faults armed: the press counted from 1 since arming, and what happens to it or to its key's releases.
#[derive(Debug, Default, Clone)]
pub struct Faults {
    /// This press is delivered, and its acknowledgement then lost (the connection's error).
    pub ack_lost_on_press: Option<usize>,
    /// This press is rejected by the server (a `BadWindow` naming it) and not delivered.
    pub reject_press: Option<usize>,
    /// Every release of this press's key fails, unsent.
    pub fail_releases_of_press: Option<usize>,
}

#[derive(Default)]
struct State {
    faults: Faults,
    presses: usize,
    failing_release: Option<u8>,
    /// Each key event delivered: (keycode, press).
    sent: Vec<(u8, bool)>,
    /// How many times a failing release was attempted.
    failed_releases: usize,
}

thread_local! {
    static STATE: RefCell<State> = RefCell::new(State::default());
}

pub fn arm(faults: Faults) {
    STATE.with(|s| {
        *s.borrow_mut() = State {
            faults,
            ..State::default()
        }
    });
}

/// How many releases failed by the armed fault since arming.
pub fn failed_releases() -> usize {
    STATE.with(|s| s.borrow().failed_releases)
}

/// The key events delivered since arming.
pub fn sent() -> Vec<(u8, bool)> {
    STATE.with(|s| s.borrow().sent.clone())
}

fn rejected() -> anyhow::Error {
    ReplyError::X11Error(X11Error {
        error_kind: x11rb::protocol::ErrorKind::Window,
        error_code: 3,
        sequence: 0,
        bad_value: 0,
        minor_opcode: 0,
        major_opcode: 25,
        extension_name: None,
        request_name: Some("SendEvent"),
    })
    .into()
}

/// Around one key event: `send` sends it and waits for its acknowledgement, unless a fault replaces either.
pub fn key(keycode: u8, press: bool, send: impl FnOnce() -> Result<()>) -> Result<()> {
    let (reject, ack_lost, fail) = STATE.with(|s| {
        let mut s = s.borrow_mut();
        if press {
            s.presses += 1;
            let n = s.presses;
            if s.faults.fail_releases_of_press == Some(n) {
                s.failing_release = Some(keycode);
            }
            (
                s.faults.reject_press == Some(n),
                s.faults.ack_lost_on_press == Some(n),
                false,
            )
        } else {
            (false, false, s.failing_release == Some(keycode))
        }
    });
    if reject {
        return Err(rejected());
    }
    if fail {
        STATE.with(|s| s.borrow_mut().failed_releases += 1);
        return Err(ReplyError::from(ConnectionError::UnknownError).into());
    }
    send()?;
    STATE.with(|s| s.borrow_mut().sent.push((keycode, press)));
    if ack_lost {
        return Err(ReplyError::from(ConnectionError::UnknownError).into());
    }
    Ok(())
}

/// Where an identity hook runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Identity {
    /// As an association's re-verification begins, between choosing the frame and accepting it (`atspi.rs`).
    Verify,
    /// As an accepted association is confirmed again, just before an effect or after a read (`atspi.rs`).
    Confirm,
    /// The Copy's editable route, once it has read the selection and just before `CopyText` (`copy.rs`).
    CopyText,
    /// A paste's selection restore, once the focusing click has focused the field (`engine/paste.rs`).
    Restore,
    /// A paste's clipboard snapshot taken, just before it takes CLIPBOARD (`engine/paste.rs`).
    Snapshot,
    /// A paste's CLIPBOARD taken, just before it asks about the target's `TARGETS` request (`engine/paste.rs`).
    Taken,
    /// A paste waiting for its target's `TARGETS` request, before each pause of the wait (`engine/paste.rs`).
    TargetsWait,
    /// The Copy's context menu asked to open, just before the menu is looked for (`copy.rs`).
    MenuLookup,
    /// A watched pointer request's events sent, just before its pointer watch is read (`engine/within.rs`).
    PointerSent,
    /// Just before each read of whether the real pointer is in a window (`Engine::pointer_within`, `engine/way.rs`).
    PointerRead,
}

/// A hook armed for the `nth` time (from 1) its point is reached since arming.
struct Hook {
    point: Identity,
    nth: usize,
    reached: usize,
    run: Box<dyn FnOnce()>,
}

thread_local! {
    static HOOK: RefCell<Option<Hook>> = const { RefCell::new(None) };
}

/// Arms `run` to happen once, the `nth` time the engine reaches `point`: the test changes the desktop there, between
/// two of the engine's own steps. Arming again replaces it.
pub fn arm_identity(point: Identity, nth: usize, run: impl FnOnce() + 'static) {
    HOOK.with(|h| {
        *h.borrow_mut() = Some(Hook {
            point,
            nth,
            reached: 0,
            run: Box::new(run),
        })
    });
}

/// Whether no hook is left armed: it ran, or none was armed. A hook left armed disarms here.
pub fn identity_hook_ran() -> bool {
    HOOK.with(|h| h.borrow_mut().take().is_none())
}

/// The engine reaches `point`: the armed hook runs if this is its time.
pub fn identity(point: Identity) {
    let due = HOOK.with(|h| {
        let mut slot = h.borrow_mut();
        let hook = slot.as_mut().filter(|hook| hook.point == point)?;
        hook.reached += 1;
        let due = hook.reached == hook.nth;
        due.then(|| slot.take().expect("armed").run)
    });
    if let Some(run) = due {
        run();
    }
}
