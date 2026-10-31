//! `xprobe selection-watch <selection>...` (#171 M3.1, Chrome's HTML5 drag and drop): every change of the named
//! selections' owners, through XFixes, until stdin closes. It prints `{"ready":true}`, then one JSON line per change
//! (`{"selection":…,"owner":…,"subtype":…,"t_ms":…}`, the owner 0 when it gave the selection up or went away), so the
//! harness sees when a drag source takes `XdndSelection` and when it lets it go.

use std::io::BufRead;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, atom, json_str};

pub fn selection_watch(names: &[String]) -> Result<()> {
    if names.is_empty() {
        return Err("usage: xprobe selection-watch <selection>...".into());
    }
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    conn.xfixes_query_version(5, 0)?.reply()?;
    let mut atoms = Vec::new();
    for name in names {
        let selection = atom(&conn, name)?;
        let mask = SelectionEventMask::SET_SELECTION_OWNER
            | SelectionEventMask::SELECTION_WINDOW_DESTROY
            | SelectionEventMask::SELECTION_CLIENT_CLOSE;
        conn.xfixes_select_selection_input(root, selection, mask)?;
        atoms.push((selection, name.clone()));
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
    println!("{{\"ready\":true}}");
    let started = Instant::now();
    loop {
        while let Some(event) = conn.poll_for_event()? {
            if let Event::XfixesSelectionNotify(e) = event {
                let name = atoms
                    .iter()
                    .find(|(a, _)| *a == e.selection)
                    .map_or("?", |(_, n)| n.as_str());
                println!(
                    "{{\"selection\":{},\"owner\":{},\"subtype\":{},\"t_ms\":{:.1},\"timestamp\":{},\"selection_timestamp\":{}}}",
                    json_str(name),
                    e.owner,
                    u8::from(e.subtype),
                    started.elapsed().as_secs_f64() * 1000.0,
                    e.timestamp,
                    e.selection_timestamp
                );
            }
        }
        if closed.recv_timeout(Duration::from_millis(2)).is_ok() {
            return Ok(());
        }
    }
}
