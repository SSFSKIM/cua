//! `xprobe drop-watch [window]` (#171 M4, T13: Chromium drop signals): what an ordinary X client, with no RECORD and
//! no grab, can see of a drag and drop around its drop, on one connection, until stdin closes. The engine could watch
//! the same on a connection of its own, so each line is a candidate signal:
//! - `take`: an owner change of `XdndSelection` (XFixes), with the server's time; owner 0 when it was given up;
//! - `cursor`: a change of the displayed cursor (XFixes `DisplayCursorNotify`), with its server time, its name (Chrome
//!   names none of its own) and the image then displayed (`XFixesGetCursorImage`: its serial, size, hotspot and a hash
//!   of its pixels), so a drag's cursors can be told apart across Chrome processes;
//! - `activate`: a `_NET_ACTIVE_WINDOW` request a client sent to the root (`SubstructureNotify` on the root), with its
//!   source indication and the client's own time;
//! - `create`, `map`, `unmap`, `destroy`: a root child's, with `override_redirect` where the event carries it (a drag
//!   loop's input-only grab window is one);
//! - `enter`, `leave`: the core crossings of `window` (when named) with their mode (0 normal, 1 grab, 2 ungrab).
//!
//! Every line carries `wall_ms`, the wall clock when xprobe read it (milliseconds since the epoch, to the microsecond),
//! which the engine's `--stats` `wall` lines up with.

use std::io::Read;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask, SelectionEventMask};
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask};
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, atom};

fn wall_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

/// The atoms a line is judged by.
pub struct Atoms {
    pub xdnd_selection: u32,
    pub active_window: u32,
}

/// FNV-1a over a cursor image's pixels: the same image hashes the same in any process.
pub fn image_hash(pixels: &[u32]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for p in pixels {
        for b in p.to_le_bytes() {
            h ^= u64::from(b);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    h
}

/// The line for an event that is not a cursor change (those need a request: `cursor_line`), or None for one of no
/// interest.
pub fn event_line(event: &Event, atoms: &Atoms, wall: f64) -> Option<String> {
    match event {
        Event::XfixesSelectionNotify(e) if e.selection == atoms.xdnd_selection => Some(format!(
            "{{\"kind\":\"take\",\"owner\":{},\"subtype\":{},\"server_time\":{},\"wall_ms\":{wall:.3}}}",
            e.owner,
            u8::from(e.subtype),
            e.timestamp
        )),
        Event::ClientMessage(e) if e.type_ == atoms.active_window && e.format == 32 => {
            let d = e.data.as_data32();
            Some(format!(
                "{{\"kind\":\"activate\",\"window\":{},\"source\":{},\"user_time\":{},\"wall_ms\":{wall:.3}}}",
                e.window, d[0], d[1]
            ))
        }
        Event::CreateNotify(e) => Some(format!(
            "{{\"kind\":\"create\",\"window\":{},\"override_redirect\":{},\"x\":{},\"y\":{},\"w\":{},\"h\":{},\"wall_ms\":{wall:.3}}}",
            e.window, e.override_redirect, e.x, e.y, e.width, e.height
        )),
        Event::MapNotify(e) => Some(format!(
            "{{\"kind\":\"map\",\"window\":{},\"override_redirect\":{},\"wall_ms\":{wall:.3}}}",
            e.window, e.override_redirect
        )),
        Event::UnmapNotify(e) => Some(format!(
            "{{\"kind\":\"unmap\",\"window\":{},\"wall_ms\":{wall:.3}}}",
            e.window
        )),
        Event::DestroyNotify(e) => Some(format!(
            "{{\"kind\":\"destroy\",\"window\":{},\"wall_ms\":{wall:.3}}}",
            e.window
        )),
        Event::EnterNotify(e) | Event::LeaveNotify(e) => Some(format!(
            "{{\"kind\":\"{}\",\"window\":{},\"mode\":{},\"detail\":{},\"server_time\":{},\"wall_ms\":{wall:.3}}}",
            if matches!(event, Event::EnterNotify(_)) {
                "enter"
            } else {
                "leave"
            },
            e.event,
            u8::from(e.mode),
            u8::from(e.detail),
            e.time
        )),
        _ => None,
    }
}

pub fn drop_watch(args: &[String]) -> Result<()> {
    let window: Option<u32> = match args {
        [] => None,
        [w] => Some(w.parse().map_err(|_| "usage: xprobe drop-watch [window]")?),
        _ => return Err("usage: xprobe drop-watch [window]".into()),
    };
    let (conn, screen) = crate::xconnect(None)?;
    let root = conn.setup().roots[screen].root;
    conn.xfixes_query_version(5, 0)?.reply()?;
    let atoms = Atoms {
        xdnd_selection: atom(&conn, "XdndSelection")?,
        active_window: atom(&conn, "_NET_ACTIVE_WINDOW")?,
    };
    conn.xfixes_select_selection_input(
        root,
        atoms.xdnd_selection,
        SelectionEventMask::SET_SELECTION_OWNER
            | SelectionEventMask::SELECTION_WINDOW_DESTROY
            | SelectionEventMask::SELECTION_CLIENT_CLOSE,
    )?;
    conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?;
    // SubstructureNotify on the root is shared by any number of clients (only the redirect is the window manager's)
    let root_mask = conn.get_window_attributes(root)?.reply()?.your_event_mask | EventMask::SUBSTRUCTURE_NOTIFY;
    conn.change_window_attributes(root, &ChangeWindowAttributesAux::new().event_mask(root_mask))?;
    if let Some(w) = window {
        conn.change_window_attributes(
            w,
            &ChangeWindowAttributesAux::new().event_mask(EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW),
        )?;
    }
    conn.sync()?;
    let (tx, closed) = mpsc::channel();
    std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        let _ = tx.send(());
    });
    println!("{{\"ready\":true,\"wall_ms\":{:.3}}}", wall_ms());
    loop {
        while let Some(event) = conn.poll_for_event()? {
            let wall = wall_ms();
            let line = match &event {
                Event::XfixesCursorNotify(e) => {
                    let image = conn.xfixes_get_cursor_image()?.reply()?;
                    Some(format!(
                        "{{\"kind\":\"cursor\",\"serial\":{},\"named\":{},\"server_time\":{},\"image_serial\":{},\"w\":{},\"h\":{},\"xhot\":{},\"yhot\":{},\"image\":\"{:016x}\",\"wall_ms\":{wall:.3}}}",
                        e.cursor_serial,
                        e.name != x11rb::NONE,
                        e.timestamp,
                        image.cursor_serial,
                        image.width,
                        image.height,
                        image.xhot,
                        image.yhot,
                        image_hash(&image.cursor_image)
                    ))
                }
                other => event_line(other, &atoms, wall),
            };
            if let Some(line) = line {
                println!("{line}");
            }
        }
        if closed.recv_timeout(Duration::from_millis(1)).is_ok() {
            return Ok(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use x11rb::protocol::xproto::{ClientMessageEvent, DestroyNotifyEvent, MapNotifyEvent};

    const ATOMS: Atoms = Atoms {
        xdnd_selection: 500,
        active_window: 300,
    };

    #[test]
    fn an_activation_request_names_its_window_and_source() {
        let e = Event::ClientMessage(ClientMessageEvent::new(32, 9, 300u32, [1, 77, 0, 0, 0]));
        assert_eq!(
            event_line(&e, &ATOMS, 2.0).unwrap(),
            "{\"kind\":\"activate\",\"window\":9,\"source\":1,\"user_time\":77,\"wall_ms\":2.000}"
        );
        let other = Event::ClientMessage(ClientMessageEvent::new(32, 9, 301u32, [1, 77, 0, 0, 0]));
        assert_eq!(event_line(&other, &ATOMS, 2.0), None, "another message type");
    }

    #[test]
    fn root_children_s_maps_and_ends_are_lines_and_other_events_are_not() {
        let map = Event::MapNotify(MapNotifyEvent {
            response_type: 19,
            sequence: 0,
            event: 1,
            window: 42,
            override_redirect: true,
        });
        assert_eq!(
            event_line(&map, &ATOMS, 1.5).unwrap(),
            "{\"kind\":\"map\",\"window\":42,\"override_redirect\":true,\"wall_ms\":1.500}"
        );
        let destroy = Event::DestroyNotify(DestroyNotifyEvent {
            response_type: 17,
            sequence: 0,
            event: 1,
            window: 42,
        });
        assert!(
            event_line(&destroy, &ATOMS, 1.5)
                .unwrap()
                .starts_with("{\"kind\":\"destroy\",\"window\":42")
        );
        assert_eq!(event_line(&Event::Unknown(vec![0; 32]), &ATOMS, 1.5), None);
    }

    #[test]
    fn the_image_hash_tells_images_apart_and_repeats_for_the_same() {
        assert_eq!(image_hash(&[1, 2, 3]), image_hash(&[1, 2, 3]));
        assert_ne!(image_hash(&[1, 2, 3]), image_hash(&[1, 2, 4]));
        assert_ne!(image_hash(&[]), image_hash(&[0]));
    }
}
