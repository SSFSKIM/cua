//! `xprobe record <x> <y> <width> <height> [focus] [fragile] [fragile-key]`: a harness-owned recorder window that prints every input event
//! it receives, for comparing the X events two engines send (Design, Input, Keys: "the same `press_key`, `key_down`
//! and `key_up` sequences produce the same X key events in both engines").
//!
//! It creates an override-redirect top-level window (so no window manager manages, focuses or stacks it) with a child
//! covering its lower-right quarter (so pointer events show which window was the deepest under the point), maps both,
//! and with `focus` gives the top-level the input focus (for the desktop route on a private X server, where XTEST
//! input goes to the focus). With `fragile` the child destroys itself on its first ButtonPress (an application window
//! that goes away under a drag); with `fragile-key` the top-level destroys itself, child and all, on its first
//! KeyPress (an application window that closes while a key is held). A background-route event (`SendEvent` with mask 0) reaches the client that created the
//! window, which is this one; a desktop-route event reaches it as the selected real event.
//!
//! It prints `{"ready":…,"window":…,"child":…}`, then one JSON line per event. A stdin line `mark <tag>` makes a
//! round trip (so every event the server queued before it is read), drains, and prints `{"mark":"<tag>"}`; EOF
//! destroys the windows and exits.

use std::io::{BufRead, Write};
use std::sync::mpsc;
use std::time::Duration;

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    ConnectionExt as _, CreateWindowAux, EventMask, InputFocus, Window, WindowClass,
};
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, json_str};

pub fn record(args: &[String]) -> Result<()> {
    let number = |i: usize| -> Result<i32> {
        Ok(args
            .get(i)
            .ok_or("record needs <x> <y> <width> <height> [focus] [fragile] [fragile-key]")?
            .parse()?)
    };
    let (x, y, width, height) = (number(0)?, number(1)?, number(2)?, number(3)?);
    let flag = |name: &str| args.iter().skip(4).any(|a| a == name);
    let (focus, fragile, fragile_key) = (flag("focus"), flag("fragile"), flag("fragile-key"));
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let mask = EventMask::KEY_PRESS
        | EventMask::KEY_RELEASE
        | EventMask::BUTTON_PRESS
        | EventMask::BUTTON_RELEASE
        | EventMask::POINTER_MOTION
        | EventMask::ENTER_WINDOW
        | EventMask::LEAVE_WINDOW
        | EventMask::FOCUS_CHANGE;
    let window = conn.generate_id()?;
    let aux = CreateWindowAux::new()
        .override_redirect(1)
        .background_pixel(0x00ffffff)
        .event_mask(mask);
    conn.create_window(0, window, root, x as i16, y as i16, width as u16, height as u16, 0, WindowClass::INPUT_OUTPUT, 0, &aux)?;
    let child = conn.generate_id()?;
    let aux = CreateWindowAux::new().background_pixel(0x00c0c0c0).event_mask(mask);
    let (cw, ch) = ((width / 2).max(1), (height / 2).max(1));
    conn.create_window(0, child, window, (width - cw) as i16, (height - ch) as i16, cw as u16, ch as u16, 0, WindowClass::INPUT_OUTPUT, 0, &aux)?;
    conn.map_window(child)?;
    conn.map_window(window)?;
    conn.sync()?;
    if focus {
        conn.set_input_focus(InputFocus::POINTER_ROOT, window, x11rb::CURRENT_TIME)?.check()?;
    }
    conn.sync()?;
    // Drop what mapping and focusing caused before the first mark.
    while conn.poll_for_event()?.is_some() {}
    let name = |w: Window| -> String {
        if w == window {
            "\"top\"".into()
        } else if w == child {
            "\"child\"".into()
        } else {
            w.to_string()
        }
    };
    let mut out = std::io::stdout().lock();
    writeln!(out, "{{\"ready\":true,\"window\":{window},\"child\":{child}}}")?;
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
    let print = |out: &mut std::io::StdoutLock, event: Event| -> Result<()> {
        let line = match event {
            Event::KeyPress(e) | Event::KeyRelease(e) => format!(
                "{{\"type\":\"{}\",\"send\":{},\"detail\":{},\"state\":{},\"window\":{},\"x\":{},\"y\":{},\"root_x\":{},\"root_y\":{},\"time\":{}}}",
                if e.response_type & 0x7f == x11rb::protocol::xproto::KEY_PRESS_EVENT { "KeyPress" } else { "KeyRelease" },
                e.response_type & 0x80 != 0,
                e.detail,
                u16::from(e.state),
                name(e.event),
                e.event_x,
                e.event_y,
                e.root_x,
                e.root_y,
                e.time
            ),
            Event::ButtonPress(e) | Event::ButtonRelease(e) => format!(
                "{{\"type\":\"{}\",\"send\":{},\"detail\":{},\"state\":{},\"window\":{},\"x\":{},\"y\":{},\"root_x\":{},\"root_y\":{},\"time\":{}}}",
                if e.response_type & 0x7f == x11rb::protocol::xproto::BUTTON_PRESS_EVENT { "ButtonPress" } else { "ButtonRelease" },
                e.response_type & 0x80 != 0,
                e.detail,
                u16::from(e.state),
                name(e.event),
                e.event_x,
                e.event_y,
                e.root_x,
                e.root_y,
                e.time
            ),
            Event::MotionNotify(e) => format!(
                "{{\"type\":\"MotionNotify\",\"send\":{},\"detail\":{},\"state\":{},\"window\":{},\"x\":{},\"y\":{},\"root_x\":{},\"root_y\":{},\"time\":{}}}",
                e.response_type & 0x80 != 0,
                u8::from(e.detail),
                u16::from(e.state),
                name(e.event),
                e.event_x,
                e.event_y,
                e.root_x,
                e.root_y,
                e.time
            ),
            Event::EnterNotify(e) | Event::LeaveNotify(e) => format!(
                "{{\"type\":\"{}\",\"send\":{},\"detail\":{},\"mode\":{},\"state\":{},\"window\":{},\"x\":{},\"y\":{},\"root_x\":{},\"root_y\":{},\"time\":{}}}",
                if e.response_type & 0x7f == x11rb::protocol::xproto::ENTER_NOTIFY_EVENT { "EnterNotify" } else { "LeaveNotify" },
                e.response_type & 0x80 != 0,
                u8::from(e.detail),
                u8::from(e.mode),
                u16::from(e.state),
                name(e.event),
                e.event_x,
                e.event_y,
                e.root_x,
                e.root_y,
                e.time
            ),
            Event::FocusIn(e) | Event::FocusOut(e) => format!(
                "{{\"type\":\"{}\",\"send\":{},\"detail\":{},\"mode\":{},\"window\":{}}}",
                if e.response_type & 0x7f == x11rb::protocol::xproto::FOCUS_IN_EVENT { "FocusIn" } else { "FocusOut" },
                e.response_type & 0x80 != 0,
                u8::from(e.detail),
                u8::from(e.mode),
                name(e.event)
            ),
            _ => return Ok(()),
        };
        writeln!(out, "{line}")?;
        Ok(())
    };
    let mut child_alive = true;
    let mut window_alive = true;
    loop {
        while let Some(event) = conn.poll_for_event()? {
            let pressed_child = matches!(&event, Event::ButtonPress(e) if e.event == child);
            let key_on_window = matches!(&event, Event::KeyPress(e) if e.event == window);
            print(&mut out, event)?;
            if fragile && child_alive && pressed_child {
                conn.destroy_window(child)?;
                conn.flush()?;
                child_alive = false;
            }
            if fragile_key && window_alive && key_on_window {
                conn.destroy_window(window)?;
                conn.flush()?;
                window_alive = false;
                child_alive = false;
            }
        }
        out.flush()?;
        match rx.recv_timeout(Duration::from_millis(1)) {
            Ok(line) => {
                let Some(tag) = line.strip_prefix("mark ") else { continue };
                conn.sync()?;
                while let Some(event) = conn.poll_for_event()? {
                    print(&mut out, event)?;
                }
                writeln!(out, "{{\"mark\":{}}}", json_str(tag))?;
                out.flush()?;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    if window_alive {
        let _ = conn.destroy_window(window);
    }
    let _ = conn.flush();
    Ok(())
}
