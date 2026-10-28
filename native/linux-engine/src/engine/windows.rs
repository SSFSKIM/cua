//! `activate_window`, the one window request that changes desktop state, deliberately (behaviour §14), and
//! `launch_app` (§15).

use anyhow::{Context, Result, anyhow};
use serde_json::Value;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    ClientMessageEvent, ConfigureWindowAux, ConnectionExt as _, EventMask, InputFocus, StackMode,
};

use super::Engine;
use crate::apps;
use crate::wire::{LaunchAppInput, WindowInput, parse_input};

impl Engine {
    /// `_NET_ACTIVE_WINDOW` (source indication 1, the application), a raise, and the input focus, each checked with
    /// a round trip; no prior validation, no wait (behaviour §14).
    pub(super) fn activate_window(&mut self, input: Option<Value>) -> Result<Value> {
        let input: WindowInput = parse_input(input)?;
        let (window, conn, root) = (input.window.id, &self.x.conn, self.x.root);
        let message = ClientMessageEvent::new(32, window, self.x.atom("_NET_ACTIVE_WINDOW"), [1, 0, 0, 0, 0]);
        let mask = EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT;
        (|| -> Result<()> { Ok(conn.send_event(false, root, mask, message)?.check()?) })()
            .with_context(|| format!("failed to request focus for X11 window {window}"))?;
        let above = ConfigureWindowAux::new().stack_mode(StackMode::ABOVE);
        (|| -> Result<()> { Ok(conn.configure_window(window, &above)?.check()?) })()
            .with_context(|| format!("failed to raise X11 window {window}"))?;
        (|| -> Result<()> {
            Ok(conn
                .set_input_focus(InputFocus::POINTER_ROOT, window, x11rb::CURRENT_TIME)?
                .check()?)
        })()
        .with_context(|| format!("failed to focus X11 window {window}"))?;
        conn.flush()?;
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
        apps::launch(entry).with_context(|| format!("failed to launch application {:?}", input.app.trim()))?;
        Ok(Value::Null)
    }
}
