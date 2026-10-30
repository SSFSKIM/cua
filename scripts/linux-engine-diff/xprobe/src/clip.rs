//! The harness's clipboard and desktop checks for M2's text cases (#171, Verification system: "Clipboard preservation
//! is checked apart from the witness"; Decision Log, M2.2: the foreground route's witness allowance).
//!
//! - `xprobe clip-own <text>`: owns CLIPBOARD and serves `<text>` (`UTF8_STRING`, `text/plain;charset=utf-8`,
//!   `text/plain`, `STRING` when Latin-1, and `TARGETS`), small data only. It prints `{"owned":…,"time":…}`, then one
//!   JSON line per request it answers and `{"cleared":true}` when it loses CLIPBOARD. Stdin lines:
//!   - `arm`: the next `TARGETS` request is held until `go` (at most 450 ms, under the engine's 500 ms snapshot
//!     bound); holding it prints `{"held":"TARGETS",…}`, so the harness can change the desktop while an engine's
//!     snapshot is in progress;
//!   - `silence`: the next `TARGETS` request is never answered (a silent owner), printing `{"silenced":…}`;
//!   - `retake <ms> <text>`: when CLIPBOARD is next taken from it, it takes it back after `<ms>` and serves `<text>`
//!     (an external takeover of the engine's paste ownership);
//!   - `quit` (or EOF): exits.
//! - `xprobe clip-read`: reads CLIPBOARD as `UTF8_STRING` with a real timestamp, never `CurrentTime` (which an engine
//!   refuses for 10 s after an unconfirmed paste); prints `{"ok":…,"owner":…,"text":…}` or why not.
//! - `xprobe grabs`: whether a pointer or keyboard grab is in force (a grab of its own is refused as
//!   `AlreadyGrabbed`); a grab it obtains is released at once.
//! - `xprobe within <window> <ancestor>`: whether the window is the ancestor or lies inside it.

use std::io::{BufRead, Write};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, GrabMode, GrabStatus, PropMode, SelectionNotifyEvent,
    SelectionRequestEvent, Window, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use crate::{Result, atom, json_str};

const HOLD_MAX: Duration = Duration::from_millis(450);
const READ_WAIT: Duration = Duration::from_secs(2);

struct Atoms {
    clipboard: u32,
    targets: u32,
    utf8: u32,
    plain_utf8: u32,
    plain: u32,
    property: u32,
}

impl Atoms {
    fn new(conn: &RustConnection) -> Result<Self> {
        Ok(Self {
            clipboard: atom(conn, "CLIPBOARD")?,
            targets: atom(conn, "TARGETS")?,
            utf8: atom(conn, "UTF8_STRING")?,
            plain_utf8: atom(conn, "text/plain;charset=utf-8")?,
            plain: atom(conn, "text/plain")?,
            property: atom(conn, "XPROBE_CLIP")?,
        })
    }
}

/// An unmapped window that takes property events, for timestamps and conversions.
fn own_window(conn: &RustConnection, screen: usize) -> Result<Window> {
    let root = conn.setup().roots[screen].root;
    let window = conn.generate_id()?;
    conn.create_window(
        0,
        window,
        root,
        0,
        0,
        1,
        1,
        0,
        WindowClass::INPUT_ONLY,
        0,
        &CreateWindowAux::new().event_mask(EventMask::PROPERTY_CHANGE),
    )?;
    Ok(window)
}

/// The server's current time: a zero-length append to a property of our window, read from its `PropertyNotify`.
fn server_time(conn: &RustConnection, window: Window, property: u32) -> Result<u32> {
    conn.change_property8(PropMode::APPEND, window, property, AtomEnum::STRING, &[])?;
    conn.flush()?;
    let deadline = Instant::now() + READ_WAIT;
    while Instant::now() < deadline {
        if let Some(Event::PropertyNotify(e)) = conn.poll_for_event()?
            && e.window == window
        {
            return Ok(e.time);
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    Err("no PropertyNotify for the timestamp".into())
}

fn stdin_lines() -> mpsc::Receiver<Option<String>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            if tx.send(Some(line)).is_err() {
                return;
            }
        }
        let _ = tx.send(None);
    });
    rx
}

fn say(line: String) -> Result<()> {
    let mut out = std::io::stdout().lock();
    writeln!(out, "{line}")?;
    out.flush()?;
    Ok(())
}

struct Owner {
    conn: RustConnection,
    window: Window,
    atoms: Atoms,
    text: String,
    armed: bool,
    silent: bool,
    retake: Option<(Duration, String)>,
}

impl Owner {
    fn take(&mut self) -> Result<u32> {
        let time = server_time(&self.conn, self.window, self.atoms.property)?;
        self.conn.set_selection_owner(self.window, self.atoms.clipboard, time)?;
        let owner = self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner;
        if owner != self.window {
            return Err("CLIPBOARD was not taken".into());
        }
        Ok(time)
    }

    fn targets(&self) -> Vec<u32> {
        let mut out = vec![
            self.atoms.targets,
            self.atoms.utf8,
            self.atoms.plain_utf8,
            self.atoms.plain,
        ];
        if self.text.chars().all(|c| (c as u32) < 0x100) {
            out.push(AtomEnum::STRING.into());
        }
        out
    }

    fn answer(&mut self, e: &SelectionRequestEvent, rx: &mpsc::Receiver<Option<String>>) -> Result<bool> {
        let property = if e.property == x11rb::NONE {
            e.target
        } else {
            e.property
        };
        if self.silent && e.target == self.atoms.targets {
            // a silent owner: this request is never answered
            self.silent = false;
            say(format!("{{\"silenced\":\"TARGETS\",\"requestor\":{}}}", e.requestor))?;
            return Ok(true);
        }
        let mut served = true;
        if e.target == self.atoms.targets {
            if self.armed {
                self.armed = false;
                say(format!("{{\"held\":\"TARGETS\",\"requestor\":{}}}", e.requestor))?;
                let until = Instant::now() + HOLD_MAX;
                loop {
                    let left = until.saturating_duration_since(Instant::now());
                    match rx.recv_timeout(left) {
                        Ok(Some(line)) if line.trim() == "go" => break,
                        Ok(Some(line)) => self.command(&line)?,
                        Ok(None) => return Ok(false),
                        Err(_) => break,
                    }
                }
            }
            let targets = self.targets();
            self.conn
                .change_property32(PropMode::REPLACE, e.requestor, property, AtomEnum::ATOM, &targets)?;
        } else if [self.atoms.utf8, self.atoms.plain_utf8, self.atoms.plain].contains(&e.target) {
            self.conn
                .change_property8(PropMode::REPLACE, e.requestor, property, e.target, self.text.as_bytes())?;
        } else if e.target == u32::from(AtomEnum::STRING) && self.text.chars().all(|c| (c as u32) < 0x100) {
            let latin1: Vec<u8> = self.text.chars().map(|c| c as u8).collect();
            self.conn
                .change_property8(PropMode::REPLACE, e.requestor, property, AtomEnum::STRING, &latin1)?;
        } else {
            served = false;
        }
        let notify = SelectionNotifyEvent {
            response_type: x11rb::protocol::xproto::SELECTION_NOTIFY_EVENT,
            sequence: 0,
            time: e.time,
            requestor: e.requestor,
            selection: e.selection,
            target: e.target,
            property: if served { property } else { x11rb::NONE },
        };
        self.conn.send_event(false, e.requestor, EventMask::NO_EVENT, notify)?;
        self.conn.flush()?;
        say(format!(
            "{{\"request\":{},\"requestor\":{},\"time\":{},\"served\":{served}}}",
            json_str(&String::from_utf8_lossy(
                &self.conn.get_atom_name(e.target)?.reply()?.name
            )),
            e.requestor,
            e.time
        ))?;
        Ok(true)
    }

    fn command(&mut self, line: &str) -> Result<()> {
        let line = line.trim();
        if line == "arm" {
            self.armed = true;
            say("{\"armed\":true}".into())?;
        } else if line == "silence" {
            self.silent = true;
            say("{\"silent\":true}".into())?;
        } else if let Some(rest) = line.strip_prefix("retake ") {
            let (ms, text) = rest.split_once(' ').ok_or("retake <ms> <text>")?;
            self.retake = Some((Duration::from_millis(ms.parse()?), text.to_string()));
            say("{\"retake_armed\":true}".into())?;
        }
        Ok(())
    }
}

pub fn own(args: &[String]) -> Result<()> {
    let text = args.first().ok_or("clip-own <text>")?.clone();
    let (conn, screen) = x11rb::connect(None)?;
    let window = own_window(&conn, screen)?;
    let atoms = Atoms::new(&conn)?;
    let mut owner = Owner {
        conn,
        window,
        atoms,
        text,
        armed: false,
        silent: false,
        retake: None,
    };
    let time = owner.take()?;
    say(format!("{{\"owned\":{window},\"time\":{time}}}"))?;
    let rx = stdin_lines();
    loop {
        match rx.try_recv() {
            Ok(None) | Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
            Ok(Some(line)) if line.trim() == "quit" => return Ok(()),
            Ok(Some(line)) => owner.command(&line)?,
            Err(mpsc::TryRecvError::Empty) => {}
        }
        match owner.conn.poll_for_event()? {
            Some(Event::SelectionRequest(e)) => {
                if !owner.answer(&e, &rx)? {
                    return Ok(());
                }
            }
            Some(Event::SelectionClear(e)) if e.selection == owner.atoms.clipboard => {
                say("{\"cleared\":true}".into())?;
                if let Some((delay, text)) = owner.retake.take() {
                    std::thread::sleep(delay);
                    owner.text = text;
                    let time = owner.take()?;
                    say(format!("{{\"retaken\":true,\"time\":{time}}}"))?;
                }
            }
            Some(_) => {}
            None => std::thread::sleep(Duration::from_millis(1)),
        }
    }
}

pub fn read() -> Result<()> {
    let (conn, screen) = x11rb::connect(None)?;
    let window = own_window(&conn, screen)?;
    let atoms = Atoms::new(&conn)?;
    let owner = conn.get_selection_owner(atoms.clipboard)?.reply()?.owner;
    if owner == x11rb::NONE {
        return say("{\"ok\":false,\"owner\":0,\"why\":\"no owner\"}".into());
    }
    let time = server_time(&conn, window, atoms.property)?;
    conn.convert_selection(window, atoms.clipboard, atoms.utf8, atoms.property, time)?;
    conn.flush()?;
    let deadline = Instant::now() + READ_WAIT;
    while Instant::now() < deadline {
        match conn.poll_for_event()? {
            Some(Event::SelectionNotify(e)) if e.requestor == window => {
                if e.property == x11rb::NONE {
                    return say(format!("{{\"ok\":false,\"owner\":{owner},\"why\":\"refused\"}}"));
                }
                let reply = conn
                    .get_property(true, window, atoms.property, AtomEnum::ANY, 0, u32::MAX / 4)?
                    .reply()?;
                if reply.type_ != atoms.utf8 {
                    let name = conn.get_atom_name(reply.type_)?.reply()?.name;
                    return say(format!(
                        "{{\"ok\":false,\"owner\":{owner},\"why\":{}}}",
                        json_str(&format!("answered as {}", String::from_utf8_lossy(&name)))
                    ));
                }
                let text = String::from_utf8_lossy(&reply.value);
                return say(format!(
                    "{{\"ok\":true,\"owner\":{owner},\"text\":{}}}",
                    json_str(&text)
                ));
            }
            Some(_) => {}
            None => std::thread::sleep(Duration::from_millis(1)),
        }
    }
    say(format!("{{\"ok\":false,\"owner\":{owner},\"why\":\"no answer\"}}"))
}

fn status(s: GrabStatus) -> &'static str {
    match s {
        GrabStatus::SUCCESS => "free",
        GrabStatus::ALREADY_GRABBED => "grabbed",
        GrabStatus::FROZEN => "frozen",
        GrabStatus::NOT_VIEWABLE => "not viewable",
        _ => "invalid time",
    }
}

pub fn grabs() -> Result<()> {
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let pointer = conn
        .grab_pointer(
            false,
            root,
            EventMask::NO_EVENT,
            GrabMode::ASYNC,
            GrabMode::ASYNC,
            x11rb::NONE,
            x11rb::NONE,
            x11rb::CURRENT_TIME,
        )?
        .reply()?
        .status;
    if pointer == GrabStatus::SUCCESS {
        conn.ungrab_pointer(x11rb::CURRENT_TIME)?;
    }
    let keyboard = conn
        .grab_keyboard(false, root, x11rb::CURRENT_TIME, GrabMode::ASYNC, GrabMode::ASYNC)?
        .reply()?
        .status;
    if keyboard == GrabStatus::SUCCESS {
        conn.ungrab_keyboard(x11rb::CURRENT_TIME)?;
    }
    conn.sync()?;
    say(format!(
        "{{\"pointer\":\"{}\",\"keyboard\":\"{}\"}}",
        status(pointer),
        status(keyboard)
    ))
}

pub fn within(args: &[String]) -> Result<()> {
    let [window, ancestor] = args else {
        return Err("within <window> <ancestor>".into());
    };
    let (window, ancestor) = (crate::parse_window(window)?, crate::parse_window(ancestor)?);
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let mut at = window;
    let mut inside = false;
    while at != x11rb::NONE && at != root {
        if at == ancestor {
            inside = true;
            break;
        }
        at = conn.query_tree(at)?.reply()?.parent;
    }
    say(format!("{{\"within\":{inside}}}"))
}
