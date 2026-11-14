//! `xprobe cursor-watch`: every change of the displayed cursor, through XFixes `DisplayCursorNotify`, until stdin
//! closes (the Chrome drop-miss follow-up: a drag source's grab cursor changes with the negotiated operation, so a
//! client such as the engine may see the drop accepted). One JSON line per change, with `wall_ms`:
//! `{"kind":"cursor","server_time":…,"serial":…,"name":"…"}` (the name the theme gave the cursor, or "").

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, json_str};

pub fn cursor_watch() -> Result<()> {
    let (conn, screen) = crate::xconnect(None)?;
    let root = conn.setup().roots[screen].root;
    conn.xfixes_query_version(5, 0)?.reply()?;
    conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?;
    conn.sync()?;
    let (tx, closed) = mpsc::channel();
    std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        let _ = tx.send(());
    });
    println!("{{\"ready\":true}}");
    let mut names: HashMap<u32, String> = HashMap::new();
    loop {
        while let Some(event) = conn.poll_for_event()? {
            if let Event::XfixesCursorNotify(e) = event {
                let wall = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |d| d.as_millis());
                let name = if e.name == 0 {
                    String::new()
                } else if let Some(n) = names.get(&e.name) {
                    n.clone()
                } else {
                    let n = String::from_utf8_lossy(&conn.get_atom_name(e.name)?.reply()?.name).into_owned();
                    names.insert(e.name, n.clone());
                    n
                };
                let mut out = std::io::stdout().lock();
                let _ = writeln!(
                    out,
                    "{{\"kind\":\"cursor\",\"server_time\":{},\"wall_ms\":{wall},\"serial\":{},\"name\":{}}}",
                    e.timestamp,
                    e.cursor_serial,
                    json_str(&name)
                );
                let _ = out.flush();
            }
        }
        if closed.recv_timeout(Duration::from_millis(2)).is_ok() {
            return Ok(());
        }
    }
}
