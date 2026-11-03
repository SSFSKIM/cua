//! `activate_window`, the one window request that changes desktop state, deliberately (behaviour §14), and
//! `launch_app` (§15).

use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::errors::ReplyError;
use x11rb::protocol::ErrorKind;
use x11rb::protocol::xproto::{
    ClientMessageEvent, ConfigureWindowAux, ConnectionExt as _, EventMask, InputFocus, MapState, StackMode, Window,
};

use super::Engine;
use crate::apps;
use crate::wire::{LaunchAppInput, WindowInput, parse_input};
use crate::x11::X11;

impl Engine {
    /// `_NET_ACTIVE_WINDOW` (source indication 1, the application), a raise, and the input focus, in that order;
    /// no prior validation, no wait (behaviour §14). The vendor checks each with a round trip of its own; here the
    /// three go out together and are checked in order, so the server sees the same requests in the same order and the
    /// first failure is the answer, at the cost of one round trip. The activation moves the real focus, so every
    /// pending `FocusOut` timer is flushed first (M4's T7), as before input to another window.
    pub(super) fn activate_window(&mut self, input: Option<Value>) -> Result<Value> {
        let input: WindowInput = parse_input(input)?;
        self.inputs.flush_all(&mut self.x);
        if let Some(waited) = activate(&self.x, input.window.id)? {
            self.extra.insert(
                "activation".into(),
                json!({ "map_wait_ms": waited.as_secs_f64() * 1000.0 }),
            );
        }
        Ok(Value::Null)
    }

    /// `launch_app`: a full rescan of the desktop entries, the first that names `app`, its program started
    /// detached (behaviour §15). cua's own wrapper launches through the supervisor instead; the command stays for
    /// the vendor JavaScript.
    pub(super) fn launch_app(&mut self, input: Option<Value>) -> Result<Value> {
        let input: LaunchAppInput = parse_input(input)?;
        if input.app.trim().is_empty() {
            return Err(anyhow!("app must be a non-empty string"));
        }
        let roots = apps::roots(|name| std::env::var_os(name));
        let path = std::env::var("PATH").ok();
        let entries = apps::discover(&roots, path.as_deref());
        let entry = apps::find_launchable(&entries, &input.app).map_err(anyhow::Error::msg)?;
        let child =
            apps::launch(entry).with_context(|| format!("failed to launch application {:?}", input.app.trim()))?;
        self.launched.add(child);
        Ok(Value::Null)
    }
}

/// How long an activated window that is not viewable (a minimized one) may take to be mapped by the window manager
/// before its input focus is set again (M4, C22).
pub(super) const MAP_WAIT: Duration = Duration::from_secs(1);
const MAP_POLL: Duration = Duration::from_millis(5);

/// Activates `window` as `activate_window` does (behaviour §14): the request, the raise and the input focus sent
/// together and checked in order. The paste's foreground route uses it too (Design, Device mode).
///
/// A minimized window is not viewable when the focus request arrives, so the server answers it `BadMatch` while the
/// window manager, acting on the activation request, maps it a few milliseconds later: every engine, the vendor's
/// two builds included, answered an error for an activation that happened (M4, C22). So a `BadMatch` is followed by
/// [`refocus`]: the focus is set again once the window is viewable, and a window still not viewable at [`MAP_WAIT`]
/// answers the first error, with nothing more sent. Returns how long the focus waited, when it was set again.
pub(super) fn activate(x: &X11, window: Window) -> Result<Option<Duration>> {
    let (conn, root) = (&x.conn, x.root);
    let message = ClientMessageEvent::new(32, window, x.atom("_NET_ACTIVE_WINDOW"), [1, 0, 0, 0, 0]);
    let mask = EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT;
    let above = ConfigureWindowAux::new().stack_mode(StackMode::ABOVE);
    let requested = conn.send_event(false, root, mask, message);
    let raised = conn.configure_window(window, &above);
    let focused = conn.set_input_focus(InputFocus::POINTER_ROOT, window, x11rb::CURRENT_TIME);
    (|| -> Result<()> { Ok(requested?.check()?) })()
        .with_context(|| format!("failed to request focus for X11 window {window}"))?;
    (|| -> Result<()> { Ok(raised?.check()?) })().with_context(|| format!("failed to raise X11 window {window}"))?;
    let focused = focused.map_err(ReplyError::from).and_then(|c| c.check());
    let waited = match focused {
        Err(ReplyError::X11Error(e)) if e.error_kind == ErrorKind::Match => {
            let retry = || -> Result<()> {
                Ok(conn
                    .set_input_focus(InputFocus::POINTER_ROOT, window, x11rb::CURRENT_TIME)?
                    .check()?)
            };
            let Some((waited, retried)) = refocus(|| viewable(x, window), retry, MAP_WAIT)? else {
                return Err(anyhow::Error::from(ReplyError::X11Error(e)))
                    .with_context(|| format!("failed to focus X11 window {window}"));
            };
            retried.with_context(|| format!("failed to focus X11 window {window}"))?;
            Some(waited)
        }
        other => {
            other.with_context(|| format!("failed to focus X11 window {window}"))?;
            None
        }
    };
    conn.flush()?;
    Ok(waited)
}

/// Whether `window` is viewable now.
fn viewable(x: &X11, window: Window) -> Result<bool> {
    Ok(x.conn.get_window_attributes(window)?.reply()?.map_state == MapState::VIEWABLE)
}

/// What follows a focus request the server refused with `BadMatch` (M4, C22): `viewable` polled until the window is
/// viewable, at most `bound`, then the focus set once more with `retry`. The retry follows any `BadMatch`, not only one
/// for a window seen unmapped, since the window manager can map the window between the refusal and the first look at
/// it (the race 7ea7cd8c fixed). A window viewable at the first look gets the one retry at once, so a `BadMatch` with
/// another cause is answered by the retry's own result without waiting out the bound (the design session's
/// condition). Returns `None` when the window was still not viewable at the bound and nothing more was sent, else how
/// long it waited and the retry's result.
fn refocus<R>(
    mut viewable: impl FnMut() -> Result<bool>,
    retry: impl FnOnce() -> R,
    bound: Duration,
) -> Result<Option<(Duration, R)>> {
    let started = Instant::now();
    let deadline = started + bound;
    loop {
        if viewable()? {
            let waited = started.elapsed();
            return Ok(Some((waited, retry())));
        }
        if Instant::now() >= deadline {
            return Ok(None);
        }
        std::thread::sleep(MAP_POLL);
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    use anyhow::anyhow;

    use super::{MAP_WAIT, refocus};

    /// The design session's condition on C22's retry (M4): it follows any `BadMatch`, but a window that is viewable
    /// already, whose `BadMatch` had another cause, gets the one retry at once and its answer, never the bound's wait.
    #[test]
    fn a_bad_match_on_a_window_already_viewable_answers_after_the_one_retry_without_waiting_out_the_bound() {
        let (looks, retries) = (Cell::new(0), Cell::new(0));
        let started = Instant::now();
        let refocused = refocus(
            || {
                looks.set(looks.get() + 1);
                Ok(true)
            },
            || {
                retries.set(retries.get() + 1);
                Err::<(), _>(anyhow!("X11 error X11Error {{ error_kind: Match }}"))
            },
            MAP_WAIT,
        )
        .unwrap();
        let elapsed = started.elapsed();
        let (waited, answer) = refocused.expect("a viewable window is retried");
        assert_eq!((looks.get(), retries.get()), (1, 1), "one look, one retry");
        assert!(answer.is_err(), "the retry's own error is the answer");
        assert!(waited < Duration::from_millis(50), "no wait: {waited:?}");
        assert!(
            elapsed < Duration::from_millis(100),
            "answered at once, not at the {MAP_WAIT:?} bound: {elapsed:?}"
        );
    }

    #[test]
    fn a_window_the_window_manager_maps_during_the_wait_gets_the_focus_once() {
        let (looks, retries) = (Cell::new(0), Cell::new(0));
        let refocused = refocus(
            || {
                looks.set(looks.get() + 1);
                Ok(looks.get() > 3)
            },
            || {
                retries.set(retries.get() + 1);
                Ok::<(), anyhow::Error>(())
            },
            MAP_WAIT,
        )
        .unwrap();
        let (_, answer) = refocused.expect("a mapped window is retried");
        assert!(answer.is_ok());
        assert_eq!((looks.get(), retries.get()), (4, 1));
    }

    #[test]
    fn a_window_nothing_maps_is_not_retried_and_answers_at_the_bound() {
        let retries = Cell::new(0);
        let bound = Duration::from_millis(30);
        let started = Instant::now();
        let refocused = refocus(
            || Ok(false),
            || {
                retries.set(retries.get() + 1);
                Ok::<(), anyhow::Error>(())
            },
            bound,
        )
        .unwrap();
        assert!(
            refocused.is_none(),
            "still unmapped at the bound: the first error is the answer"
        );
        assert_eq!(retries.get(), 0, "nothing more is sent");
        assert!(started.elapsed() >= bound);
    }

    #[test]
    fn a_failed_look_at_the_window_is_the_answer() {
        let retries = Cell::new(0);
        let refocused = refocus(
            || Err(anyhow!("BadWindow")),
            || {
                retries.set(retries.get() + 1);
                Ok::<(), anyhow::Error>(())
            },
            MAP_WAIT,
        );
        assert!(refocused.is_err());
        assert_eq!(retries.get(), 0);
    }
}
