//! Task 73's probe tool (evidence `m4/drag-handle/`), on a display the harness marked private only (or the scratch Xvfb
//! a script names in `T73_SCRATCH_DISPLAY`), never `:0`.
//! - `xgrab hold <ms>`: an active pointer grab of this client's own on the root, held `ms` milliseconds, then released:
//!   another application's grab (an open menu, a person's drag) over a drag_handle's press. Prints `{"grab":"<status>"}`
//!   once the grab is answered and `{"released":true}` after the release reached the server.
//! - `xgrab check`: the pre-press try as the engine makes it (engine/handle.rs `pointer_free`). Under a server grab, the
//!   deepest window under the pointer found and a pointer grab on it tried (owner_events false, no events) and given up
//!   in the same request batch; a second connection selects the crossings of that window and its ancestors first and
//!   reports every crossing the try caused. Prints `{"status":…,"window":…,"chain":…,"crossings":[…]}`.
//! - `xgrab cursors`: the displayed cursor's changes (XFixes cursor notify on the root), one line each, until stdin
//!   closes: `{"wall_ms":…,"serial":…,"name":…,"image":"<64-bit hash of its pixels>"}`; the drag loop's cursor status
//!   at a drop, read beside a sitting (the question of an Electron drop's signal).
use std::hash::{Hash, Hasher};
use std::io::Read;
use std::time::Duration;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ConnectionExt as _, EventMask, GrabMode, GrabStatus, Window,
};
use x11rb::rust_connection::RustConnection;

const PRIVATE_MARK: &str = "CUA171_PRIVATE_DISPLAY";

type R<T> = Result<T, Box<dyn std::error::Error>>;

fn connect() -> R<(RustConnection, Window)> {
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let mark = conn.intern_atom(true, PRIVATE_MARK.as_bytes())?.reply()?.atom;
    let marked = mark != x11rb::NONE
        && conn.get_property(false, root, mark, AtomEnum::ANY, 0, 1)?.reply()?.type_ != x11rb::NONE;
    // the probe's own scratch Xvfb, named by the script that started it, never :0
    let display = std::env::var("DISPLAY").unwrap_or_default();
    let scratch = std::env::var("T73_SCRATCH_DISPLAY")
        .is_ok_and(|d| d == display && !d.is_empty() && d != ":0" && !d.starts_with(":0."));
    if !marked && !scratch {
        return Err("xgrab runs only on a private display the harness marked".into());
    }
    Ok((conn, root))
}

fn status_name(status: GrabStatus) -> &'static str {
    match status {
        GrabStatus::SUCCESS => "success",
        GrabStatus::ALREADY_GRABBED => "already_grabbed",
        GrabStatus::FROZEN => "frozen",
        GrabStatus::NOT_VIEWABLE => "not_viewable",
        _ => "invalid_time",
    }
}

/// The windows from the root down to the deepest one under the pointer.
fn chain(conn: &RustConnection, root: Window) -> R<Vec<Window>> {
    let mut out = vec![root];
    loop {
        let p = conn.query_pointer(*out.last().unwrap())?.reply()?;
        if p.child == x11rb::NONE {
            return Ok(out);
        }
        out.push(p.child);
    }
}

fn hold(ms: u64) -> R<()> {
    let (conn, root) = connect()?;
    let status = conn
        .grab_pointer(false, root, EventMask::NO_EVENT, GrabMode::ASYNC, GrabMode::ASYNC, x11rb::NONE, x11rb::NONE, x11rb::CURRENT_TIME)?
        .reply()?
        .status;
    println!("{{\"grab\":\"{}\"}}", status_name(status));
    std::thread::sleep(Duration::from_millis(ms));
    conn.ungrab_pointer(x11rb::CURRENT_TIME)?;
    conn.get_input_focus()?.reply()?;
    println!("{{\"released\":true}}");
    Ok(())
}

fn check() -> R<()> {
    let (listener, root) = connect()?;
    let windows = chain(&listener, root)?;
    for &w in &windows {
        listener
            .change_window_attributes(w, &ChangeWindowAttributesAux::new().event_mask(EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW))?
            .check()?;
    }
    listener.get_input_focus()?.reply()?;
    while listener.poll_for_event()?.is_some() {}
    let (conn, root) = connect()?;
    conn.grab_server()?;
    let deepest = *chain(&conn, root)?.last().unwrap();
    let grab = conn.grab_pointer(false, deepest, EventMask::NO_EVENT, GrabMode::ASYNC, GrabMode::ASYNC, x11rb::NONE, x11rb::NONE, x11rb::CURRENT_TIME)?;
    conn.ungrab_pointer(x11rb::CURRENT_TIME)?;
    let status = grab.reply()?.status;
    conn.ungrab_server()?;
    conn.get_input_focus()?.reply()?;
    std::thread::sleep(Duration::from_millis(50));
    listener.get_input_focus()?.reply()?;
    let mut crossings = Vec::new();
    while let Some(event) = listener.poll_for_event()? {
        match event {
            Event::EnterNotify(e) => crossings.push(format!("\"enter {} mode {:?} detail {:?}\"", e.event, e.mode, e.detail)),
            Event::LeaveNotify(e) => crossings.push(format!("\"leave {} mode {:?} detail {:?}\"", e.event, e.mode, e.detail)),
            _ => {}
        }
    }
    println!(
        "{{\"status\":\"{}\",\"window\":{deepest},\"chain\":{},\"crossings\":[{}]}}",
        status_name(status),
        windows.len(),
        crossings.join(",")
    );
    Ok(())
}

fn wall_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

fn cursors() -> R<()> {
    let (conn, root) = connect()?;
    conn.xfixes_query_version(4, 0)?.reply()?;
    conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?.check()?;
    // stdin's end stops the watch
    let (done, stop) = std::sync::mpsc::channel::<()>();
    std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        let _ = done.send(());
    });
    while stop.try_recv().is_err() {
        while let Some(event) = conn.poll_for_event()? {
            if let Event::XfixesCursorNotify(e) = event {
                let wall = wall_ms();
                let image = conn.xfixes_get_cursor_image()?.reply()?;
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                (image.width, image.height, image.xhot, image.yhot, &image.cursor_image).hash(&mut hasher);
                let name = if e.name == x11rb::NONE {
                    String::new()
                } else {
                    String::from_utf8_lossy(&conn.get_atom_name(e.name)?.reply()?.name).into_owned()
                };
                println!(
                    "{{\"wall_ms\":{wall:.3},\"serial\":{},\"name\":\"{name}\",\"image\":\"{:016x}\"}}",
                    e.cursor_serial,
                    hasher.finish()
                );
            }
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    Ok(())
}

fn main() -> R<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.as_slice() {
        [cmd, ms] if cmd == "hold" => hold(ms.parse()?),
        [cmd] if cmd == "check" => check(),
        [cmd] if cmd == "cursors" => cursors(),
        _ => Err("usage: xgrab hold <ms> | xgrab check | xgrab cursors".into()),
    }
}
