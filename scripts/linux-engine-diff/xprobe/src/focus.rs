//! The witness's protocol-level record of the input focus and of activation (M2 branch review): the focus was only
//! sampled every 5 ms and `_NET_ACTIVE_WINDOW` read after its notify, so a focus or activation switched to another
//! window and back between two samples, or under one server grab, left no trace. Here every transition is its own
//! event, queued in order and never coalesced:
//!
//! - `FocusIn` and `FocusOut`, selected on the root and on every root child (each window manager frame and
//!   override-redirect window, followed as they are created or reparented to the root). A frame's `FocusIn` names the
//!   top-level the focus entered; the root's, with detail `PointerRoot` or `None`, that it went to neither.
//! - `_NET_ACTIVE_WINDOW` activation requests: a client asks the window manager to activate a window with a
//!   `ClientMessage` sent to the root with `SubstructureNotify` and `SubstructureRedirect`, which every client that
//!   selects `SubstructureNotify` on the root receives too.
//!
//! `xprobe focus-grabbed <other> <target>`: under one server grab, the focus and `_NET_ACTIVE_WINDOW` set to `other`,
//! then back to `target`: the harness's coalesced negative check of the activation evidence.

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ConnectionExt as _, EventMask, InputFocus, PropMode, Window,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use crate::Result;

fn select(conn: &RustConnection, window: Window) -> Result<()> {
    // unchecked: a window already destroyed answers an error event, which the witness ignores
    conn.change_window_attributes(
        window,
        &ChangeWindowAttributesAux::new().event_mask(EventMask::FOCUS_CHANGE),
    )?;
    Ok(())
}

/// Selects the focus events on every child of the root (the root's own mask is the witness's).
pub fn watch(conn: &RustConnection, root: Window) -> Result<()> {
    for child in conn.query_tree(root)?.reply()?.children {
        select(conn, child)?;
    }
    conn.flush()?;
    Ok(())
}

/// Follows a new root child: one created on the root, or reparented to it, gets the focus events selected too.
pub fn follow(conn: &RustConnection, root: Window, event: &Event) -> Result<()> {
    let window = match event {
        Event::CreateNotify(e) if e.parent == root => e.window,
        Event::ReparentNotify(e) if e.event == root && e.parent == root => e.window,
        _ => return Ok(()),
    };
    select(conn, window)?;
    conn.flush()?;
    Ok(())
}

/// One focus or activation event as the witness records it, or None for any other event. `detail` and `mode` are the
/// protocol's numbers (detail 5 `Pointer`, 6 `PointerRoot`, 7 `None`; mode 0 `Normal`, 1 `Grab`, 2 `Ungrab`,
/// 3 `WhileGrabbed`).
pub fn record(event: &Event, active_atom: u32, t: f64) -> Option<String> {
    let line = match event {
        Event::FocusIn(e) => format!(
            "{{\"kind\":\"focus_in\",\"t_ms\":{t:.1},\"window\":{},\"detail\":{},\"mode\":{}}}",
            e.event,
            u8::from(e.detail),
            u8::from(e.mode)
        ),
        Event::FocusOut(e) => format!(
            "{{\"kind\":\"focus_out\",\"t_ms\":{t:.1},\"window\":{},\"detail\":{},\"mode\":{}}}",
            e.event,
            u8::from(e.detail),
            u8::from(e.mode)
        ),
        Event::ClientMessage(e) if e.type_ == active_atom => format!(
            "{{\"kind\":\"activate\",\"t_ms\":{t:.1},\"window\":{},\"source\":{}}}",
            e.window,
            e.data.as_data32()[0]
        ),
        _ => return None,
    };
    Some(line)
}

/// Sets the focus and `_NET_ACTIVE_WINDOW` to each window in turn under one server grab, as a foreground request that
/// switched to another window and back between two samples would: the property, read after its notifies, shows only
/// the last value; the focus events show each switch.
pub fn focus_grabbed(args: &[String]) -> Result<()> {
    if args.is_empty() {
        return Err("focus-grabbed <window>...".into());
    }
    let windows = args
        .iter()
        .map(|a| crate::parse_window(a))
        .collect::<Result<Vec<_>>>()?;
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let active = crate::atom(&conn, "_NET_ACTIVE_WINDOW")?;
    conn.grab_server()?;
    for &w in &windows {
        conn.set_input_focus(InputFocus::PARENT, w, x11rb::CURRENT_TIME)?;
        conn.change_property32(PropMode::REPLACE, root, active, AtomEnum::WINDOW, &[w])?;
    }
    conn.ungrab_server()?;
    // a round trip: the grab, the focus changes and the property writes have reached the server
    conn.get_input_focus()?.reply()?;
    println!("{{\"focused\":{}}}", windows.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use x11rb::protocol::xproto::{ClientMessageEvent, FocusInEvent, NotifyDetail, NotifyMode};

    #[test]
    fn each_focus_and_activation_transition_is_recorded() {
        let focus = Event::FocusIn(FocusInEvent {
            event: 7,
            detail: NotifyDetail::NONLINEAR_VIRTUAL,
            mode: NotifyMode::NORMAL,
            ..Default::default()
        });
        assert_eq!(
            record(&focus, 300, 1.0).unwrap(),
            "{\"kind\":\"focus_in\",\"t_ms\":1.0,\"window\":7,\"detail\":4,\"mode\":0}"
        );
        let activate = Event::ClientMessage(ClientMessageEvent::new(32, 9, 300u32, [2, 0, 0, 0, 0]));
        assert_eq!(
            record(&activate, 300, 2.0).unwrap(),
            "{\"kind\":\"activate\",\"t_ms\":2.0,\"window\":9,\"source\":2}"
        );
        let other = Event::ClientMessage(ClientMessageEvent::new(32, 9, 301u32, [2, 0, 0, 0, 0]));
        assert_eq!(record(&other, 300, 2.0), None, "another message type");
    }
}
