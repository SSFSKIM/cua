//! `xprobe ancestry <window>` (#171 M4, task 53): a window's ancestry put into the trace of the connection it runs
//! through, and kept there. Run through a route audit's xtrace proxy, it makes the trace itself say where the audited
//! window lies and when that changes, which the engine's own requests may never say (a GTK 4 window's foreground
//! input reads no parent: its window manager frame, under the pointer, had no parentage in the trace, task 50).
//!
//! It selects `StructureNotify` on the window, then reads its parent with `QueryTree`, and so on up to the root: each
//! window's selection comes before the read of its parent, so a reparent after the read reaches the trace as a
//! `ReparentNotify`, and each window's end as a `DestroyNotify`. It prints `{"ready":true,"chain":[…]}` (the window
//! first, the root's child last), then reads and drops its events until stdin closes. It only reads and selects
//! events: it changes no window.

use std::io::BufRead;
use std::sync::mpsc;
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask};
use x11rb::wrapper::ConnectionExt as _;

use crate::Result;

/// Deeper than any window manager nests a client: a loop in a reply is not followed for ever.
const MAX_DEPTH: usize = 64;

pub fn ancestry(args: &[String]) -> Result<()> {
    let [window] = args else {
        return Err("usage: xprobe ancestry <window>".into());
    };
    let window = crate::parse_window(window)?;
    let (conn, screen) = crate::xconnect(None)?;
    let root = conn.setup().roots[screen].root;
    let structure = ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY);
    let mut chain = Vec::new();
    let mut at = window;
    while at != root && at != x11rb::NONE && chain.len() < MAX_DEPTH {
        // unchecked: a window already gone fails the read that follows, which is answered after this request's error
        conn.change_window_attributes(at, &structure)?;
        chain.push(at);
        at = conn.query_tree(at)?.reply()?.parent;
    }
    conn.sync()?;
    let (tx, closed) = mpsc::channel();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            if line.is_err() {
                break;
            }
        }
        let _ = tx.send(());
    });
    let ids: Vec<String> = chain.iter().map(u32::to_string).collect();
    println!("{{\"ready\":true,\"chain\":[{}]}}", ids.join(","));
    loop {
        while conn.poll_for_event()?.is_some() {}
        if closed.recv_timeout(Duration::from_millis(20)).is_ok() {
            return Ok(());
        }
    }
}
