//! `xprobe order-watch`: the order in which the server processes a foreground request's parts (task 63): the focus
//! transitions and activation requests (`focus.rs`), every restack, map and unmap of a root child with its geometry,
//! every change of the root's `_NET_ACTIVE_WINDOW` (`active`: the window manager's answer to an activation), and every
//! pointer button press and release from any device (XInput 2 raw events on the root, which every client selecting
//! them receives whoever the event is delivered to). One connection receives its events in the order the server
//! generated them, so the lines are in server order. The first line is the root's children, bottom first, with their
//! outer rectangles, so the stacking under a press's point can be replayed from the lines; after each press the real
//! pointer is read too (`pointer`, a round trip later, so it may already show a raise that came after the press).
//! Until stdin closes. Never sends input and changes no window.

use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask, MapState, Window};
use x11rb::rust_connection::RustConnection;

use crate::Result;
use crate::collector::{print_lines, stdin_closed};

fn wall_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// The root's children, bottom first, as `[[id, mapped, override_redirect, x, y, w, h], ...]`, each rectangle its
/// outer one (border included).
fn tree(conn: &RustConnection, root: Window) -> Result<String> {
    let children = conn.query_tree(root)?.reply()?.children;
    let mut items = Vec::with_capacity(children.len());
    for w in children {
        let (Ok(a), Ok(g)) = (conn.get_window_attributes(w)?.reply(), conn.get_geometry(w)?.reply()) else {
            continue; // destroyed since the tree was read
        };
        let border = 2 * g.border_width as i32;
        items.push(format!(
            "[{w},{},{},{},{},{},{}]",
            u8::from(a.map_state != MapState::UNMAPPED),
            u8::from(a.override_redirect),
            g.x,
            g.y,
            g.width as i32 + border,
            g.height as i32 + border
        ));
    }
    Ok(format!("[{}]", items.join(",")))
}

pub fn order_watch() -> Result<()> {
    let (conn, screen) = crate::xconnect(None)?;
    let root = conn.setup().roots[screen].root;
    let active = crate::atom(&conn, "_NET_ACTIVE_WINDOW")?;
    conn.xinput_xi_query_version(2, 2)?.reply()?;
    conn.change_window_attributes(
        root,
        &ChangeWindowAttributesAux::new().event_mask(
            EventMask::SUBSTRUCTURE_NOTIFY
                | EventMask::STRUCTURE_NOTIFY
                | EventMask::FOCUS_CHANGE
                | EventMask::PROPERTY_CHANGE,
        ),
    )?;
    crate::focus::watch(&conn, root)?;
    conn.xinput_xi_select_events(
        root,
        &[xinput::EventMask {
            deviceid: u16::from(xinput::Device::ALL_MASTER),
            mask: vec![xinput::XIEventMask::RAW_BUTTON_PRESS | xinput::XIEventMask::RAW_BUTTON_RELEASE],
        }],
    )?;
    conn.flush()?;
    let started = Instant::now();
    let t = || started.elapsed().as_secs_f64() * 1000.0;
    print_lines(&[format!(
        "{{\"kind\":\"tree\",\"t_ms\":0.0,\"wall_ms\":{:.1},\"children\":{}}}",
        wall_ms(),
        tree(&conn, root)?
    )])?;
    let closed = stdin_closed();
    loop {
        if closed.try_recv().is_ok() {
            return Ok(());
        }
        let mut lines = Vec::new();
        while let Some(event) = conn.poll_for_event()? {
            crate::focus::follow(&conn, root, &event)?;
            let (now, wall) = (t(), wall_ms());
            let line = match &event {
                Event::ConfigureNotify(e) if e.event == root && e.window != root => {
                    let border = 2 * e.border_width as i32;
                    Some(format!(
                        "{{\"kind\":\"configure\",\"t_ms\":{now:.1},\"window\":{},\"above\":{},\"or\":{},\"x\":{},\"y\":{},\"w\":{},\"h\":{}}}",
                        e.window,
                        e.above_sibling,
                        u8::from(e.override_redirect),
                        e.x,
                        e.y,
                        e.width as i32 + border,
                        e.height as i32 + border
                    ))
                }
                Event::PropertyNotify(e) if e.window == root && e.atom == active => {
                    Some(format!("{{\"kind\":\"active\",\"t_ms\":{now:.1},\"time\":{}}}", e.time))
                }
                Event::CreateNotify(e) if e.parent == root => {
                    let border = 2 * e.border_width as i32;
                    Some(format!(
                        "{{\"kind\":\"create\",\"t_ms\":{now:.1},\"window\":{},\"or\":{},\"x\":{},\"y\":{},\"w\":{},\"h\":{}}}",
                        e.window,
                        u8::from(e.override_redirect),
                        e.x,
                        e.y,
                        e.width as i32 + border,
                        e.height as i32 + border
                    ))
                }
                Event::XinputRawButtonPress(e) | Event::XinputRawButtonRelease(e) => {
                    let kind = if matches!(event, Event::XinputRawButtonPress(_)) {
                        "press"
                    } else {
                        "release"
                    };
                    let pointer = conn.query_pointer(root)?.reply()?;
                    Some(format!(
                        "{{\"kind\":\"{kind}\",\"t_ms\":{now:.1},\"time\":{},\"button\":{},\"source\":{},\"pointer\":{{\"x\":{},\"y\":{},\"child\":{}}}}}",
                        e.time, e.detail, e.sourceid, pointer.root_x, pointer.root_y, pointer.child
                    ))
                }
                _ => crate::restack::record(&event, root, now).or_else(|| crate::focus::record(&event, active, now)),
            };
            if let Some(line) = line {
                // wall time beside the monotonic one, to match a line with a harness row
                lines.push(line.replacen("{", &format!("{{\"wall_ms\":{wall:.1},"), 1));
            }
        }
        print_lines(&lines)?;
        std::thread::sleep(Duration::from_millis(1));
    }
}
