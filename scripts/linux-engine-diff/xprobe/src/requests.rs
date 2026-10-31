//! `xprobe request-watch`: every client's `SetSelectionOwner` and `GrabPointer` requests, and the `GrabPointer`
//! replies, as the server sees them, through the RECORD extension (no proxy: the person's own Chrome stays on its
//! display), each with the server time it was recorded at, until stdin closes (M3.1: whether a drag-and-drop that
//! starts in the page but never takes `XdndSelection` sent its request with a time the server ignores, or had its
//! pointer grab refused). One JSON line per element:
//! `{"kind":"set_selection_owner","client":<xid base>,"server_time":…,"owner":…,"selection":…,"time":…}`,
//! `{"kind":"grab_pointer","client":…,"server_time":…,"window":…,"time":…}`,
//! `{"kind":"grab_pointer_reply","client":…,"server_time":…,"status":…}` (0 success, 1 already grabbed, 2 invalid
//! time, 3 not viewable, 4 frozen).

use std::io::{Read, Write};

use x11rb::connection::Connection;
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;

use crate::Result;

const SET_SELECTION_OWNER: u8 = 22;
const GRAB_POINTER: u8 = 26;

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// The requests of one recorded element, each preceded by its server time (`FromClientTime`).
pub fn requests(client: u32, data: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 8 <= data.len() {
        let time = u32_at(data, i);
        let request = &data[i + 4..];
        let words = u16_at(request, 2) as usize;
        let len = if words == 0 && request.len() >= 8 {
            u32_at(request, 4) as usize * 4
        } else {
            words * 4
        };
        if len < 4 || len > request.len() {
            break;
        }
        match request[0] {
            SET_SELECTION_OWNER if len >= 16 => out.push(format!(
                "{{\"kind\":\"set_selection_owner\",\"client\":{client},\"server_time\":{time},\"owner\":{},\"selection\":{},\"time\":{}}}",
                u32_at(request, 4),
                u32_at(request, 8),
                u32_at(request, 12)
            )),
            GRAB_POINTER if len >= 24 => out.push(format!(
                "{{\"kind\":\"grab_pointer\",\"client\":{client},\"server_time\":{time},\"window\":{},\"time\":{}}}",
                u32_at(request, 4),
                u32_at(request, 20)
            )),
            _ => {}
        }
        i += 4 + len;
    }
    out
}

/// The replies of one recorded element, each preceded by its server time (`FromServerTime`): only `GrabPointer`'s are
/// recorded, so each reply's second byte is its status.
pub fn replies(client: u32, data: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 + 32 <= data.len() {
        let time = u32_at(data, i);
        let reply = &data[i + 4..];
        let len = 32 + u32_at(reply, 4) as usize * 4;
        if reply[0] == 1 {
            out.push(format!(
                "{{\"kind\":\"grab_pointer_reply\",\"client\":{client},\"server_time\":{time},\"status\":{}}}",
                reply[1]
            ));
        }
        i += 4 + len.max(32);
    }
    out
}

pub fn request_watch() -> Result<()> {
    let (control, _) = x11rb::connect(None)?;
    let (data, _) = x11rb::connect(None)?;
    control.record_query_version(1, 13)?.reply()?;
    let context = control.generate_id()?;
    let range = |first: u8, replies: bool| record::Range {
        core_requests: record::Range8 { first, last: first },
        core_replies: if replies {
            record::Range8 { first, last: first }
        } else {
            record::Range8 { first: 0, last: 0 }
        },
        ext_requests: record::ExtRange {
            major: record::Range8 { first: 0, last: 0 },
            minor: record::Range16 { first: 0, last: 0 },
        },
        ext_replies: record::ExtRange {
            major: record::Range8 { first: 0, last: 0 },
            minor: record::Range16 { first: 0, last: 0 },
        },
        delivered_events: record::Range8 { first: 0, last: 0 },
        device_events: record::Range8 { first: 0, last: 0 },
        errors: record::Range8 { first: 0, last: 0 },
        client_started: false,
        client_died: false,
    };
    let header = u8::from(record::HType::FROM_SERVER_TIME) | u8::from(record::HType::FROM_CLIENT_TIME);
    control
        .record_create_context(
            context,
            header,
            &[u32::from(record::CS::ALL_CLIENTS)],
            &[range(SET_SELECTION_OWNER, false), range(GRAB_POINTER, true)],
        )?
        .check()?;
    let watcher = std::thread::spawn(move || -> std::result::Result<(), String> {
        for reply in data.record_enable_context(context).map_err(|e| e.to_string())? {
            let reply = reply.map_err(|e| e.to_string())?;
            let lines = match reply.category {
                0 => replies(reply.xid_base, &reply.data),
                1 => requests(reply.xid_base, &reply.data),
                4 => vec!["{\"ready\":true}".to_string()],
                _ => Vec::new(),
            };
            let mut stdout = std::io::stdout().lock();
            for line in lines {
                let _ = writeln!(stdout, "{line}");
            }
            let _ = stdout.flush();
        }
        Ok(())
    });
    // until stdin closes
    let mut sink = Vec::new();
    let _ = std::io::stdin().read_to_end(&mut sink);
    control.record_disable_context(context)?;
    control.get_input_focus()?.reply()?;
    let _ = watcher.join();
    control.record_free_context(context)?;
    control.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_set_selection_owner_and_a_grab_are_read_with_their_times() {
        let mut data = Vec::new();
        data.extend_from_slice(&1000u32.to_le_bytes());
        data.extend_from_slice(&[22, 0, 4, 0]);
        for word in [7u32, 300, 999] {
            data.extend_from_slice(&word.to_le_bytes());
        }
        data.extend_from_slice(&1001u32.to_le_bytes());
        data.extend_from_slice(&[26, 0, 6, 0]);
        data.extend_from_slice(&9u32.to_le_bytes());
        data.extend_from_slice(&[0; 12]);
        data.extend_from_slice(&1002u32.to_le_bytes());
        assert_eq!(
            requests(0x600000, &data),
            vec![
                "{\"kind\":\"set_selection_owner\",\"client\":6291456,\"server_time\":1000,\"owner\":7,\"selection\":300,\"time\":999}",
                "{\"kind\":\"grab_pointer\",\"client\":6291456,\"server_time\":1001,\"window\":9,\"time\":1002}",
            ]
        );
        let mut reply = 2000u32.to_le_bytes().to_vec();
        reply.extend_from_slice(&[1, 2]);
        reply.extend_from_slice(&[0; 30]);
        assert_eq!(
            replies(1, &reply),
            vec!["{\"kind\":\"grab_pointer_reply\",\"client\":1,\"server_time\":2000,\"status\":2}"]
        );
    }
}
