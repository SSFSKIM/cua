//! The witness's protocol-level record of the top-level stacking (M2.3 review): with `SubstructureNotify` selected on
//! the root, the server reports every restack, map and unmap of a root child as its own event, in order. Unlike
//! `_NET_CLIENT_LIST_STACKING`, which is read after its notify and so can show only the latest of several quick
//! changes, these events are never coalesced: a window raised and restored under one server grab still arrives as two
//! `ConfigureNotify`s. The witness snapshots the root's children (bottom first, each with its map state and
//! override-redirect flag) when a span begins and records each event; `witness.mjs` replays them.
//!
//! - `xprobe toplevel <window>`: the root child the window lies in (a managed client's window manager frame).
//! - `xprobe restack-grabbed <window>...`: under one server grab, raises each window in turn (`ConfigureWindow`
//!   stack mode `Above`), the harness's coalesced negative check.

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{ConfigureWindowAux, ConnectionExt as _, MapState, Place, StackMode, Window};
use x11rb::rust_connection::RustConnection;

use crate::Result;

/// The root's children, bottom first, as `[[id, mapped, override_redirect], ...]` (flags 0 or 1).
pub fn tree(conn: &RustConnection, root: Window) -> Result<String> {
    let children = conn.query_tree(root)?.reply()?.children;
    let cookies = children
        .iter()
        .map(|&w| conn.get_window_attributes(w))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let mut items = Vec::with_capacity(children.len());
    for (w, cookie) in children.iter().zip(cookies) {
        // a window destroyed since the tree was read is left out
        if let Ok(a) = cookie.reply() {
            items.push(format!(
                "[{w},{},{}]",
                u8::from(a.map_state != MapState::UNMAPPED),
                u8::from(a.override_redirect)
            ));
        }
    }
    Ok(format!("[{}]", items.join(",")))
}

/// One root-substructure event as the witness records it, or None for any other event.
pub fn record(event: &Event, root: Window, t: f64) -> Option<String> {
    let line = match event {
        Event::ConfigureNotify(e) if e.event == root && e.window != root => format!(
            "{{\"kind\":\"configure\",\"t_ms\":{t:.1},\"window\":{},\"above\":{},\"or\":{}}}",
            e.window,
            e.above_sibling,
            u8::from(e.override_redirect)
        ),
        Event::CirculateNotify(e) if e.event == root => format!(
            "{{\"kind\":\"circulate\",\"t_ms\":{t:.1},\"window\":{},\"place\":\"{}\"}}",
            e.window,
            if e.place == Place::ON_TOP { "top" } else { "bottom" }
        ),
        Event::MapNotify(e) if e.event == root => format!(
            "{{\"kind\":\"map\",\"t_ms\":{t:.1},\"window\":{},\"or\":{}}}",
            e.window,
            u8::from(e.override_redirect)
        ),
        Event::UnmapNotify(e) if e.event == root => {
            format!("{{\"kind\":\"unmap\",\"t_ms\":{t:.1},\"window\":{}}}", e.window)
        }
        Event::CreateNotify(e) if e.parent == root => format!(
            "{{\"kind\":\"create\",\"t_ms\":{t:.1},\"window\":{},\"or\":{}}}",
            e.window,
            u8::from(e.override_redirect)
        ),
        Event::DestroyNotify(e) if e.event == root => {
            format!("{{\"kind\":\"destroy\",\"t_ms\":{t:.1},\"window\":{}}}", e.window)
        }
        Event::ReparentNotify(e) if e.event == root => format!(
            "{{\"kind\":\"reparent\",\"t_ms\":{t:.1},\"window\":{},\"to_root\":{},\"or\":{}}}",
            e.window,
            e.parent == root,
            u8::from(e.override_redirect)
        ),
        _ => return None,
    };
    Some(line)
}

/// The root child `window` lies in, or `window` itself when it is one.
pub fn toplevel_of(conn: &RustConnection, root: Window, window: Window) -> Result<Window> {
    let mut at = window;
    loop {
        let parent = conn.query_tree(at)?.reply()?.parent;
        if parent == root || parent == x11rb::NONE {
            return Ok(at);
        }
        at = parent;
    }
}

pub fn toplevel(args: &[String]) -> Result<()> {
    let [window] = args else {
        return Err("toplevel <window>".into());
    };
    let window = crate::parse_window(window)?;
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    println!("{{\"toplevel\":{}}}", toplevel_of(&conn, root, window)?);
    Ok(())
}

/// Raises each window in turn under one server grab: the window manager sees the requests only after the grab, and
/// processes them together, so `_NET_CLIENT_LIST_STACKING` may show only the last order.
pub fn restack_grabbed(args: &[String]) -> Result<()> {
    if args.is_empty() {
        return Err("restack-grabbed <window>...".into());
    }
    let windows = args
        .iter()
        .map(|a| crate::parse_window(a))
        .collect::<Result<Vec<_>>>()?;
    let (conn, _) = x11rb::connect(None)?;
    conn.grab_server()?;
    for &w in &windows {
        conn.configure_window(w, &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE))?;
    }
    conn.ungrab_server()?;
    // a round trip: the grab and the raises have reached the server
    conn.get_input_focus()?.reply()?;
    println!("{{\"raised\":{}}}", windows.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use x11rb::protocol::xproto::{ConfigureNotifyEvent, MapNotifyEvent, PropertyNotifyEvent};

    const ROOT: Window = 0x100;

    #[test]
    fn each_restack_of_a_root_child_is_recorded_with_its_sibling() {
        let raise = Event::ConfigureNotify(ConfigureNotifyEvent {
            event: ROOT,
            window: 7,
            above_sibling: 5,
            ..Default::default()
        });
        let line = record(&raise, ROOT, 1.0).expect("a root child's configure");
        assert!(
            line.contains("\"kind\":\"configure\"") && line.contains("\"window\":7") && line.contains("\"above\":5"),
            "{line}"
        );
        // a configure reported to another window's substructure is not a root child's
        let elsewhere = Event::ConfigureNotify(ConfigureNotifyEvent {
            event: 9,
            window: 7,
            ..Default::default()
        });
        assert_eq!(record(&elsewhere, ROOT, 1.0), None);
        let map = Event::MapNotify(MapNotifyEvent {
            event: ROOT,
            window: 8,
            override_redirect: true,
            ..Default::default()
        });
        assert!(
            record(&map, ROOT, 2.0)
                .unwrap()
                .contains("\"kind\":\"map\",\"t_ms\":2.0,\"window\":8,\"or\":1")
        );
        assert_eq!(
            record(&Event::PropertyNotify(PropertyNotifyEvent::default()), ROOT, 0.0),
            None
        );
    }
}
