//! `activate_window`, the one window request that changes desktop state, deliberately (behaviour §14), and
//! `launch_app` (§15).

use anyhow::{Context, Result, anyhow};
use serde_json::Value;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    ClientMessageEvent, ConfigureWindowAux, ConnectionExt as _, EventMask, InputFocus, StackMode, Window,
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

/// Activates `window` as `activate_window` does (behaviour §14): the request, the raise and the input focus sent
/// together and checked in order. The paste's foreground route uses it too (Design, Device mode).
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
    (|| -> Result<()> { Ok(focused?.check()?) })().with_context(|| format!("failed to focus X11 window {window}"))?;
    conn.flush()?;
    Ok(())
}
