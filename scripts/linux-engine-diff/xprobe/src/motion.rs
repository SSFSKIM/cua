//! `xprobe motion-watch <x> <y> <width> <height> core|xi2`: a motion listener (M4's T9). Whether an XTEST motion to
//! the pointer's own position delivers anything decides whether a desktop path may leave that motion out, as the newest
//! vendor build does: the pinned build's every path starts with one.
//!
//! It creates an override-redirect window over the given rectangle (no window manager touches it) and listens on it as
//! an application does, one way at a time, since the server delivers a device event to a window's XInput 2 clients
//! and then to no core client of that window:
//! - `core`: `MotionNotify` (PointerMotion, which also carries motions with a button held);
//! - `xi2`: XInput 2 `XI_Motion` from every master device.
//!
//! In both modes, on a connection of its own, XInput 2 `XI_RawMotion` from every device on the root, as a client
//! watching all pointer input does (the engine's own stray watch among them), and `XI_DeviceChanged`, which a change
//! of the slave device behind the master raises.
//!
//! It prints `{"ready":true,"window":…}`, then one JSON line per event (`MotionNotify` with its root position and
//! state; `XI_Motion` with its device, source and root position; `XI_RawMotion` with its device and source;
//! `XI_DeviceChanged` with its device, source and reason). A stdin line `mark <tag>` makes a round trip on every
//! connection (so every event the server queued before it is read), drains, and prints `{"mark":"<tag>"}`; EOF
//! destroys the window and exits. It never sends input.

use std::io::{BufRead, Write};
use std::sync::mpsc;
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{ConnectionExt as _, CreateWindowAux, EventMask, WindowClass};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, json_str};

/// An XInput 2 fixed-point coordinate (16.16) as the integer pixel it falls in.
fn fp(v: i32) -> i32 {
    v >> 16
}

/// One event's line, or None for an event the listener does not report.
fn line(event: &Event) -> Option<String> {
    Some(match event {
        Event::MotionNotify(e) => format!(
            "{{\"type\":\"MotionNotify\",\"send\":{},\"state\":{},\"root_x\":{},\"root_y\":{}}}",
            e.response_type & 0x80 != 0,
            u16::from(e.state),
            e.root_x,
            e.root_y
        ),
        Event::XinputMotion(e) => format!(
            "{{\"type\":\"XI_Motion\",\"device\":{},\"source\":{},\"root_x\":{},\"root_y\":{}}}",
            e.deviceid,
            e.sourceid,
            fp(e.root_x),
            fp(e.root_y)
        ),
        Event::XinputRawMotion(e) => format!(
            "{{\"type\":\"XI_RawMotion\",\"device\":{},\"source\":{}}}",
            e.deviceid, e.sourceid
        ),
        Event::XinputDeviceChanged(e) => format!(
            "{{\"type\":\"XI_DeviceChanged\",\"device\":{},\"source\":{},\"reason\":{}}}",
            e.deviceid,
            e.sourceid,
            u8::from(e.reason)
        ),
        _ => return None,
    })
}

fn drain(conn: &RustConnection, out: &mut impl Write) -> Result<()> {
    while let Some(event) = conn.poll_for_event()? {
        if let Some(l) = line(&event) {
            writeln!(out, "{l}")?;
        }
    }
    Ok(())
}

pub fn motion_watch(args: &[String]) -> Result<()> {
    let number = |i: usize| -> Result<i32> {
        Ok(args
            .get(i)
            .ok_or("motion-watch needs <x> <y> <width> <height> core|xi2")?
            .parse()?)
    };
    let (x, y, width, height) = (number(0)?, number(1)?, number(2)?, number(3)?);
    let xi2 = match args.get(4).map(String::as_str) {
        Some("core") => false,
        Some("xi2") => true,
        _ => return Err("motion-watch needs core or xi2 after its rectangle".into()),
    };
    let (core, screen) = crate::xconnect(None)?;
    let (xi, _) = crate::xconnect(None)?;
    let root = core.setup().roots[screen].root;
    xi.xinput_xi_query_version(2, 2)?.reply()?;
    let window = core.generate_id()?;
    let aux = CreateWindowAux::new()
        .override_redirect(1)
        .background_pixel(0x00ffffff)
        .event_mask(if xi2 {
            EventMask::NO_EVENT
        } else {
            EventMask::POINTER_MOTION
        });
    core.create_window(
        0,
        window,
        root,
        x as i16,
        y as i16,
        width as u16,
        height as u16,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &aux,
    )?;
    core.map_window(window)?;
    core.sync()?;
    if xi2 {
        xi.xinput_xi_select_events(
            window,
            &[xinput::EventMask {
                deviceid: u16::from(xinput::Device::ALL_MASTER),
                mask: vec![xinput::XIEventMask::MOTION],
            }],
        )?;
    }
    xi.xinput_xi_select_events(
        root,
        &[xinput::EventMask {
            deviceid: u16::from(xinput::Device::ALL),
            mask: vec![xinput::XIEventMask::RAW_MOTION | xinput::XIEventMask::DEVICE_CHANGED],
        }],
    )?;
    xi.sync()?;
    // what mapping caused, before the first mark
    while core.poll_for_event()?.is_some() {}
    while xi.poll_for_event()?.is_some() {}
    let mut out = std::io::stdout().lock();
    writeln!(out, "{{\"ready\":true,\"window\":{window}}}")?;
    out.flush()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    loop {
        drain(&core, &mut out)?;
        drain(&xi, &mut out)?;
        out.flush()?;
        match rx.recv_timeout(Duration::from_millis(1)) {
            Ok(text) => {
                let Some(tag) = text.strip_prefix("mark ") else {
                    continue;
                };
                core.sync()?;
                xi.sync()?;
                drain(&core, &mut out)?;
                drain(&xi, &mut out)?;
                writeln!(out, "{{\"mark\":{}}}", json_str(tag))?;
                out.flush()?;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = core.destroy_window(window);
    let _ = core.flush();
    Ok(())
}
