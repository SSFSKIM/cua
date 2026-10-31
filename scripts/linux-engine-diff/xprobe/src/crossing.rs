//! `xprobe crossing-watch`: the real pointer and the crossing events clients receive, until stdin closes (the Chrome
//! drop-miss follow-up: a drag that starts in the page is refused by the browser when its own record of the mouse says
//! the press is not on the page, and the real pointer's crossings are what can move that record under synthetic
//! input). Through RECORD, every delivered `EnterNotify`/`LeaveNotify` and XInput 2 `XI_Enter`/`XI_Leave`, and every
//! 10 ms the real pointer, printed when it moves or changes window. One JSON line each, with `wall_ms`:
//! `{"kind":"enter"|"leave","xi":bool,"client":…,"server_time":…,"time":…,"window":…,"x":…,"y":…,"mode":…,"detail":…}`
//! (root coordinates, mode 0 normal, 1 grab, 2 ungrab) and `{"kind":"pointer","x":…,"y":…,"child":…}`.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;

use crate::Result;
use crate::collector::{COLLECTOR_END, Collector, print_lines, stdin_closed};

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn i16_at(b: &[u8], i: usize) -> i16 {
    i16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn wall_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis())
}

/// The crossing events of one recorded element (`FromServer`, each preceded by its server time).
pub fn crossings(client: u32, data: &[u8], wall: u128) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 + 32 <= data.len() {
        let time = u32_at(data, i);
        let e = &data[i + 4..];
        let code = e[0] & 0x7f;
        let len = if code == 35 { 32 + u32_at(e, 4) as usize * 4 } else { 32 };
        if len > e.len() {
            break;
        }
        match code {
            7 | 8 => out.push(format!(
                "{{\"kind\":\"{}\",\"xi\":false,\"client\":{client},\"server_time\":{time},\"wall_ms\":{wall},\"time\":{},\"window\":{},\"x\":{},\"y\":{},\"mode\":{},\"detail\":{}}}",
                if code == 7 { "enter" } else { "leave" },
                u32_at(e, 4),
                u32_at(e, 12),
                i16_at(e, 20),
                i16_at(e, 22),
                e[30],
                e[1]
            )),
            35 if len >= 48 && matches!(u16_at(e, 8), 7 | 8) => out.push(format!(
                "{{\"kind\":\"{}\",\"xi\":true,\"client\":{client},\"server_time\":{time},\"wall_ms\":{wall},\"time\":{},\"window\":{},\"x\":{},\"y\":{},\"mode\":{},\"detail\":{}}}",
                if u16_at(e, 8) == 7 { "enter" } else { "leave" },
                u32_at(e, 12),
                u32_at(e, 24),
                (u32_at(e, 32) as i32) >> 16,
                (u32_at(e, 36) as i32) >> 16,
                e[18],
                e[19]
            )),
            _ => {}
        }
        i += 4 + len;
    }
    out
}

pub fn crossing_watch() -> Result<()> {
    let (control, screen) = x11rb::connect(None)?;
    let (data, _) = x11rb::connect(None)?;
    let (poll, _) = x11rb::connect(None)?;
    let root = poll.setup().roots[screen].root;
    control.record_query_version(1, 13)?.reply()?;
    let context = control.generate_id()?;
    let none8 = record::Range8 { first: 0, last: 0 };
    let no_ext = record::ExtRange {
        major: none8,
        minor: record::Range16 { first: 0, last: 0 },
    };
    let delivered = |first: u8, last: u8| record::Range {
        core_requests: none8,
        core_replies: none8,
        ext_requests: no_ext,
        ext_replies: no_ext,
        delivered_events: record::Range8 { first, last },
        device_events: none8,
        errors: none8,
        client_started: false,
        client_died: false,
    };
    control
        .record_create_context(
            context,
            u8::from(record::HType::FROM_SERVER_TIME),
            &[u32::from(record::CS::ALL_CLIENTS)],
            &[delivered(7, 8), delivered(35, 35)],
        )?
        .check()?;
    // the collector's error or early end fails the watch, so a record cut short never reads as complete
    let mut collector = Collector::spawn(move || {
        for reply in data.record_enable_context(context).map_err(|e| e.to_string())? {
            let reply = reply.map_err(|e| e.to_string())?;
            let wall = wall_ms();
            let lines = match reply.category {
                0 => crossings(reply.xid_base, &reply.data, wall),
                4 => vec![format!("{{\"ready\":true,\"wall_ms\":{wall}}}")],
                _ => Vec::new(),
            };
            print_lines(&lines).map_err(|e| e.to_string())?;
        }
        Ok(())
    });
    // the real pointer, every 10 ms, until stdin closes
    let closed = stdin_closed();
    let mut last = None;
    loop {
        collector.check_running()?;
        let p = poll.query_pointer(root)?.reply()?;
        let now = (p.root_x, p.root_y, p.child);
        if last != Some(now) {
            last = Some(now);
            print_lines(&[format!(
                "{{\"kind\":\"pointer\",\"wall_ms\":{},\"x\":{},\"y\":{},\"child\":{}}}",
                wall_ms(),
                p.root_x,
                p.root_y,
                p.child
            )])?;
        }
        if closed.recv_timeout(Duration::from_millis(10)).is_ok() {
            break;
        }
    }
    collector.check_running()?;
    control.record_disable_context(context)?;
    // a round trip, so the disable has been processed and the collector's data ends
    control.get_input_focus()?.reply()?;
    collector.finish(COLLECTOR_END)?;
    control.record_free_context(context)?;
    control.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_and_xi2_crossings_are_read() {
        let mut data = 5u32.to_le_bytes().to_vec();
        let mut e = [0u8; 32];
        e[0] = 7;
        e[1] = 3;
        e[4..8].copy_from_slice(&99u32.to_le_bytes());
        e[12..16].copy_from_slice(&42u32.to_le_bytes());
        e[20..22].copy_from_slice(&100i16.to_le_bytes());
        e[22..24].copy_from_slice(&200i16.to_le_bytes());
        e[30] = 1;
        data.extend_from_slice(&e);
        data.extend_from_slice(&6u32.to_le_bytes());
        let mut g = vec![0u8; 32 + 4 * 6];
        g[0] = 35;
        g[1] = 131;
        g[4..8].copy_from_slice(&6u32.to_le_bytes());
        g[8..10].copy_from_slice(&8u16.to_le_bytes());
        g[12..16].copy_from_slice(&77u32.to_le_bytes());
        g[18] = 1;
        g[24..28].copy_from_slice(&43u32.to_le_bytes());
        g[32..36].copy_from_slice(&(300i32 << 16).to_le_bytes());
        g[36..40].copy_from_slice(&(400i32 << 16).to_le_bytes());
        data.extend_from_slice(&g);
        let lines = crossings(1, &data, 0);
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(
            lines[0].contains("\"kind\":\"enter\",\"xi\":false")
                && lines[0].contains("\"window\":42,\"x\":100,\"y\":200,\"mode\":1,\"detail\":3")
        );
        assert!(
            lines[1].contains("\"kind\":\"leave\",\"xi\":true")
                && lines[1].contains("\"time\":77,\"window\":43,\"x\":300,\"y\":400,\"mode\":1")
        );
    }
}
