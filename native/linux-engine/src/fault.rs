//! Test builds only: faults injected into the key events the engine sends, on either route, to prove how the paste
//! route answers when the X server's acknowledgement of a delivered key is lost, when the server rejects a key before
//! delivering it, and when a release fails. Armed per thread (the engine's requests run on the test's thread), and
//! every key event sent is logged.

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
