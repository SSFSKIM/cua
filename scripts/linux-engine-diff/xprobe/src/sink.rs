//! `xprobe xdnd-sink <title> [x y width height]`: a drop target that never answers (the third review of task 73, P2).
//! It creates an ordinary top-level window, titled (`WM_NAME`, `_NET_WM_NAME`) and classed (`cua171-xdnd-sink`), so the
//! window manager manages it and the harness finds it by its run-unique title, and marks it `XdndAware` (version 5), so
//! a drag's source sends it `XdndEnter` and `XdndPosition`. It reads nothing and sends nothing: no `XdndStatus` ever
//! comes, as from an application that hangs or is slow to answer. A Chromium source then ends its drag with no drop
//! (`HandleMouseReleased`: still waiting on the first status since the enter), and its drag loop still shows the cursor
//! of the last status it had, from the window before. It prints `{"sink":<window>}` once mapped, and stays until it is
//! killed.

use std::io::Write;

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, PropMode, WindowClass};
use x11rb::wrapper::ConnectionExt as _;

use crate::Result;

/// The XDND protocol version the sink claims.
const XDND_VERSION: u32 = 5;

pub fn xdnd_sink(args: &[String]) -> Result<()> {
    let usage = "xdnd-sink <title> [<x> <y> <width> <height>]";
    let title = args.first().ok_or(usage)?;
    let rect: Vec<i32> = args[1..]
        .iter()
        .map(|a| a.parse())
        .collect::<std::result::Result<_, _>>()?;
    let (x, y, width, height) = match rect[..] {
        [] => (0, 0, 200, 200),
        [x, y, w, h] => (x, y, w, h),
        _ => return Err(usage.into()),
    };
    let (conn, screen) = crate::xconnect(None)?;
    let screen = &conn.setup().roots[screen];
    let window = conn.generate_id()?;
    conn.create_window(
        0,
        window,
        screen.root,
        i16::try_from(x)?,
        i16::try_from(y)?,
        u16::try_from(width)?,
        u16::try_from(height)?,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &CreateWindowAux::new().background_pixel(0x00a0c0e0),
    )?;
    let atom = |name: &[u8]| -> Result<u32> { Ok(conn.intern_atom(false, name)?.reply()?.atom) };
    let (utf8, net_name, aware) = (atom(b"UTF8_STRING")?, atom(b"_NET_WM_NAME")?, atom(b"XdndAware")?);
    conn.change_property8(
        PropMode::REPLACE,
        window,
        AtomEnum::WM_NAME,
        AtomEnum::STRING,
        title.as_bytes(),
    )?;
    conn.change_property8(PropMode::REPLACE, window, net_name, utf8, title.as_bytes())?;
    conn.change_property8(
        PropMode::REPLACE,
        window,
        AtomEnum::WM_CLASS,
        AtomEnum::STRING,
        b"cua171-xdnd-sink\0Cua171-xdnd-sink\0",
    )?;
    conn.change_property32(PropMode::REPLACE, window, aware, AtomEnum::ATOM, &[XDND_VERSION])?;
    conn.map_window(window)?;
    conn.sync()?;
    println!("{{\"sink\":{window}}}");
    std::io::stdout().flush()?;
    // the window lives while this connection does, until the harness kills the process (scenes.mjs `close`, as a scene
    // application's: its stdin is not ours to read); it selected no events, so nothing wakes this but the server's end
    loop {
        conn.wait_for_event()?;
    }
}
