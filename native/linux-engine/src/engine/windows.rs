//! `activate_window`, the one window request that changes desktop state, deliberately (behaviour §14), and
//! `launch_app` (§15).

use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow};
use serde_json::Value;
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
    /// first failure is the answer, at the cost of one round trip.
    pub(super) fn activate_window(&mut self, input: Option<Value>) -> Result<Value> {
        let input: WindowInput = parse_input(input)?;
        activate(&self.x, input.window.id)?;
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
/// two builds included, answered an error for an activation that happened (M4, C22). So on `BadMatch` for a window
/// not viewable, the focus waits for the window to be mapped, at most [`MAP_WAIT`], and is set again; a window still
/// not viewable then answers the first error, and nothing more is sent.
pub(super) fn activate(x: &X11, window: Window) -> Result<()> {
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
    match focused {
        Err(ReplyError::X11Error(e)) if e.error_kind == ErrorKind::Match && !viewable(x, window)? => {
            let first = ReplyError::X11Error(e);
            if !wait_viewable(x, window, MAP_WAIT)? {
                return Err(anyhow::Error::from(first)).with_context(|| format!("failed to focus X11 window {window}"));
            }
            conn.set_input_focus(InputFocus::POINTER_ROOT, window, x11rb::CURRENT_TIME)?
                .check()
                .with_context(|| format!("failed to focus X11 window {window}"))?;
        }
        other => other.with_context(|| format!("failed to focus X11 window {window}"))?,
    }
    conn.flush()?;
    Ok(())
}

/// Whether `window` is viewable now.
fn viewable(x: &X11, window: Window) -> Result<bool> {
    Ok(x.conn.get_window_attributes(window)?.reply()?.map_state == MapState::VIEWABLE)
}

/// Polls until `window` is viewable, at most `wait`; whether it became so.
fn wait_viewable(x: &X11, window: Window, wait: Duration) -> Result<bool> {
    let deadline = Instant::now() + wait;
    loop {
        if viewable(x, window)? {
            return Ok(true);
        }
        if Instant::now() >= deadline {
            return Ok(false);
        }
        std::thread::sleep(MAP_POLL);
    }
}
