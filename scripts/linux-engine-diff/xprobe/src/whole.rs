//! `xprobe record-run --ours <pid> [--exe <name>,...]`: every client's requests that can change a window, as the server
//! handled them, through RECORD, for the whole of a harness run, until stdin closes (#171 M4, T4b's audit round: the
//! harness never changes a window it did not open, judged on every request of the run, not only the sampled audit
//! passes). Each client is attributed when RECORD reports it, by the process X-Resource names for it: ours when that
//! process descends from `--ours` (the harness) and is one of the harness's X tools or engines (`--exe`, default
//! [`DEFAULT_EXE`]; a name ending in `*` is a prefix). The judge is `foreign.mjs` `auditRecord`; this only reads.
//!
//! One JSON line per element, each with `ms` (the wall clock when it was read):
//! - `ready` {root, xtest, composite, t0} once recording has begun (`t0` the server's time then, against which each
//!   request's server time `t` is read on the wall clock); `end` once it stopped cleanly; `failed` {error};
//! - `client` {client, pid, exe, ours} (`ours` null when no process could be found for it), `died` {client};
//! - `req` {client, seq, t, op, …}: from every client, `CreateWindow` {window, parent}, `ReparentWindow` {window,
//!   parent}, `DestroyWindow` and `DestroySubwindows` {window}; from ours and unattributed clients also
//!   `ChangeWindowAttributes` {window, mask}, the map, unmap, configure and circulate requests {window},
//!   `ChangeProperty` {window, property, name, type, type_name?, length}, `DeleteProperty` and `RotateProperties`
//!   {window, property?}, a deleting `GetProperty` {window, property, delete}, `SendEvent` {destination, event,
//!   cm_window?, cm_type?, requestor?, selection?, target?, property?}, `WarpPointer` {dst, pointer}, `SetInputFocus` {focus}, `KillClient`
//!   {resource}, Composite's redirects {window}, and XTEST `FakeInput` {type, detail, focus, pointer}: the input focus
//!   and the root child under the pointer read right after the server handled it (null when they could not be read);
//! - `error` {client, seq, major, minor, code, t} for a refused request of those kinds, `t` the server's time;
//! - `destroyed` {window}: a DestroyNotify any client received;
//! - `selreq` {client, requestor, selection, property, target}: a SelectionRequest one of our clients received.
//!
//! Two contexts (`contexts`): the requests, the clients and the delivered events on one, in the server's order; the
//! errors on their own, so an error may be read before or after its client's later requests (the judge finds its
//! request by the server's time).

use std::collections::{HashMap, HashSet};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::res::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

use crate::Result;
use crate::collector::{COLLECTOR_END, Collector, print_lines, stdin_closed};

/// The harness's own X tools and the engines it drives, by executable name.
pub const DEFAULT_EXE: &[&str] = &["xtrace", "xdotool", "xprobe", "cua-engine", "node", "sky_linux*"];

const CREATE_WINDOW: u8 = 1;
const CHANGE_WINDOW_ATTRIBUTES: u8 = 2;
const DESTROY_WINDOW: u8 = 4;
const DESTROY_SUBWINDOWS: u8 = 5;
const REPARENT_WINDOW: u8 = 7;
const CIRCULATE_WINDOW: u8 = 13;
const CHANGE_PROPERTY: u8 = 18;
const DELETE_PROPERTY: u8 = 19;
const GET_PROPERTY: u8 = 20;
const SEND_EVENT: u8 = 25;
const WARP_POINTER: u8 = 41;
const SET_INPUT_FOCUS: u8 = 42;
const KILL_CLIENT: u8 = 113;
const ROTATE_PROPERTIES: u8 = 114;
const FAKE_INPUT: u8 = 2;
const DESTROY_NOTIFY: u8 = 17;
const SELECTION_REQUEST: u8 = 30;

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn wall_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis())
}

/// A core request the watch reads: its name, and whether only its window's structure (creation, parentage, end) is
/// read from every client, the rest only from ours.
fn core_op(major: u8) -> Option<(&'static str, bool)> {
    Some(match major {
        CREATE_WINDOW => ("CreateWindow", true),
        CHANGE_WINDOW_ATTRIBUTES => ("ChangeWindowAttributes", false),
        DESTROY_WINDOW => ("DestroyWindow", true),
        DESTROY_SUBWINDOWS => ("DestroySubwindows", true),
        REPARENT_WINDOW => ("ReparentWindow", true),
        8 => ("MapWindow", false),
        9 => ("MapSubwindows", false),
        10 => ("UnmapWindow", false),
        11 => ("UnmapSubwindows", false),
        12 => ("ConfigureWindow", false),
        CIRCULATE_WINDOW => ("CirculateWindow", false),
        CHANGE_PROPERTY => ("ChangeProperty", false),
        DELETE_PROPERTY => ("DeleteProperty", false),
        GET_PROPERTY => ("GetProperty", false),
        SEND_EVENT => ("SendEvent", false),
        WARP_POINTER => ("WarpPointer", false),
        SET_INPUT_FOCUS => ("SetInputFocus", false),
        KILL_CLIENT => ("KillClient", false),
        ROTATE_PROPERTIES => ("RotateProperties", false),
        _ => return None,
    })
}

const COMPOSITE_OPS: [&str; 4] = [
    "RedirectWindow",
    "RedirectSubwindows",
    "UnredirectWindow",
    "UnredirectSubwindows",
];

fn event_name(code: u8) -> &'static str {
    match code {
        2 => "KeyPress",
        3 => "KeyRelease",
        4 => "ButtonPress",
        5 => "ButtonRelease",
        6 => "MotionNotify",
        7 => "EnterNotify",
        8 => "LeaveNotify",
        9 => "FocusIn",
        10 => "FocusOut",
        12 => "Expose",
        22 => "ConfigureNotify",
        28 => "PropertyNotify",
        31 => "SelectionNotify",
        33 => "ClientMessage",
        _ => "event",
    }
}

/// The override-redirect value a window request's value list sets (`CWOverrideRedirect`, bit 9), or None: the mask at
/// `mask_at`, the values from `values_at`, one word for each bit set, in bit order.
fn override_redirect(r: &[u8], mask_at: usize, values_at: usize) -> Option<bool> {
    if r.len() < mask_at + 4 {
        return None;
    }
    let mask = u32_at(r, mask_at);
    if mask & (1 << 9) == 0 {
        return None;
    }
    let at = values_at + 4 * (mask & ((1 << 9) - 1)).count_ones() as usize;
    (r.len() >= at + 4).then(|| u32_at(r, at) != 0)
}

/// A request's bytes with a BIG-REQUESTS extended length taken out, so its fields sit where the core protocol puts
/// them; and its length in bytes.
fn normalized(request: &[u8]) -> Option<(Vec<u8>, usize)> {
    if request.len() < 4 {
        return None;
    }
    let words = u16_at(request, 2) as usize;
    if words != 0 {
        let len = words * 4;
        return (len <= request.len()).then(|| (request[..len].to_vec(), len));
    }
    if request.len() < 8 {
        return None;
    }
    let len = u32_at(request, 4) as usize * 4;
    if len < 8 || len > request.len() {
        return None;
    }
    let mut out = request[..4].to_vec();
    out.extend_from_slice(&request[8..len]);
    Some((out, len))
}

/// Whose a client is: its process and executable, and whether it is ours.
#[derive(Clone, Debug, PartialEq)]
pub struct Owner {
    pub pid: Option<u32>,
    pub exe: Option<String>,
    pub ours: Option<bool>,
}

/// Whether a process is ours: it descends from the harness's process (`ancestors` includes it) and its executable is
/// one of `allowed` (a name ending in `*` a prefix).
pub fn classify(exe: Option<&str>, ancestors: &[u32], harness: u32, allowed: &[String]) -> bool {
    let Some(exe) = exe else { return false };
    if !ancestors.contains(&harness) {
        return false;
    }
    allowed.iter().any(|a| match a.strip_suffix('*') {
        Some(prefix) => exe.starts_with(prefix),
        None => exe == a,
    })
}

/// The process's parent, from `/proc/<pid>/stat` (its command name may hold spaces and parentheses).
fn parent_of(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after = &stat[stat.rfind(')')? + 1..];
    after.split_whitespace().nth(1)?.parse().ok()
}

/// The process and its ancestors up to init, the process first.
fn lineage(pid: u32) -> Vec<u32> {
    let mut out = vec![pid];
    let mut at = pid;
    while out.len() < 64 {
        match parent_of(at) {
            Some(p) if p > 0 && p != at => {
                out.push(p);
                at = p;
            }
            _ => break,
        }
    }
    out
}

fn executable(pid: u32) -> Option<String> {
    let path = std::fs::read_link(format!("/proc/{pid}/exe")).ok()?;
    Some(path.file_name()?.to_string_lossy().into_owned())
}

/// The watch's reader of the recorded data: who each client is, which requests to print, and where XTEST input lands.
pub struct Watch {
    pub root: u32,
    pub xtest: Option<u8>,
    pub composite: Option<u8>,
    pub incr: u32,
    pub harness: u32,
    pub allowed: Vec<String>,
    pub owners: HashMap<u32, Owner>,
    announced: HashSet<u32>,
    atoms: HashMap<u32, String>,
}

impl Watch {
    pub fn new(
        root: u32,
        xtest: Option<u8>,
        composite: Option<u8>,
        incr: u32,
        harness: u32,
        allowed: Vec<String>,
    ) -> Self {
        Watch {
            root,
            xtest,
            composite,
            incr,
            harness,
            allowed,
            owners: HashMap::new(),
            announced: HashSet::new(),
            atoms: HashMap::new(),
        }
    }

    fn line(kind: &str, fields: &str) -> String {
        let sep = if fields.is_empty() { "" } else { "," };
        format!("{{\"kind\":\"{kind}\",\"ms\":{}{sep}{fields}}}", wall_ms())
    }

    /// A client found: its process through X-Resource, its executable and lineage through /proc.
    pub fn attribute(&mut self, query: &RustConnection, base: u32, at: &str) -> String {
        let pid = query
            .res_query_client_ids(&[res::ClientIdSpec {
                client: base,
                mask: res::ClientIdMask::LOCAL_CLIENT_PID,
            }])
            .ok()
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.ids.into_iter().find_map(|v| v.value.first().copied()));
        let owner = match pid {
            None => Owner {
                pid: None,
                exe: None,
                ours: None,
            },
            Some(pid) => {
                let exe = executable(pid);
                let ours = classify(exe.as_deref(), &lineage(pid), self.harness, &self.allowed);
                Owner {
                    pid: Some(pid),
                    exe,
                    ours: Some(ours),
                }
            }
        };
        let line = Self::line(
            "client",
            &format!(
                "\"client\":{base},\"pid\":{},\"exe\":{},\"ours\":{},\"at\":\"{at}\"",
                owner.pid.map_or("null".into(), |p| p.to_string()),
                owner.exe.as_deref().map_or("null".into(), crate::json_str),
                owner.ours.map_or("null".into(), |o| o.to_string())
            ),
        );
        self.owners.insert(base, owner);
        line
    }

    fn ours(&self, base: u32) -> Option<bool> {
        self.owners.get(&base).and_then(|o| o.ours)
    }

    fn atom_name(&mut self, query: Option<&RustConnection>, atom: u32) -> String {
        if atom == 0 {
            return "None".into();
        }
        if let Some(name) = self.atoms.get(&atom) {
            return name.clone();
        }
        let name = query
            .and_then(|q| q.get_atom_name(atom).ok())
            .and_then(|c| c.reply().ok())
            .map(|r| String::from_utf8_lossy(&r.name).into_owned())
            .unwrap_or_else(|| format!("atom {atom}"));
        self.atoms.insert(atom, name.clone());
        name
    }

    /// Where XTEST input landed: the input focus and the root child under the pointer, read now.
    fn placement(&self, query: Option<&RustConnection>) -> (String, String) {
        let Some(q) = query else {
            return ("null".into(), "null".into());
        };
        let focus = q.get_input_focus().ok().and_then(|c| c.reply().ok()).map(|r| r.focus);
        let pointer = q
            .query_pointer(self.root)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| r.child);
        let show = |v: Option<u32>| v.map_or("null".into(), |w| w.to_string());
        (show(focus), show(pointer))
    }

    /// The requests of one `FromClient` element (each preceded by its server time and its sequence number).
    pub fn requests(&mut self, base: u32, data: &[u8], query: Option<&RustConnection>) -> Vec<String> {
        let mut out = Vec::new();
        let mut i = 0;
        while i + 12 <= data.len() {
            let time = u32_at(data, i);
            let seq = u32_at(data, i + 4);
            let Some((r, len)) = normalized(&data[i + 8..]) else {
                break;
            };
            if let Some(line) = self.request(base, time, seq, &r, query) {
                out.push(line);
            }
            i += 8 + len;
        }
        out
    }

    fn request(&mut self, base: u32, time: u32, seq: u32, r: &[u8], query: Option<&RustConnection>) -> Option<String> {
        let major = r[0];
        let ours = self.ours(base);
        let judged = ours != Some(false);
        let head = format!("\"client\":{base},\"seq\":{seq},\"t\":{time}");
        let window = |at: usize| if r.len() >= at + 4 { u32_at(r, at) } else { 0 };
        if let Some((op, structural)) = core_op(major) {
            // every client's override-redirect changes too: whether a window is a popup
            let sets_or = major == CHANGE_WINDOW_ATTRIBUTES && override_redirect(r, 8, 12).is_some();
            if !structural && !judged && !sets_or {
                return None;
            }
            let or = |mask_at: usize, values_at: usize| match override_redirect(r, mask_at, values_at) {
                Some(v) => format!(",\"or\":{v}"),
                None => String::new(),
            };
            let fields = match major {
                CREATE_WINDOW => {
                    self.announced.remove(&window(4));
                    format!("\"window\":{},\"parent\":{}{}", window(4), window(8), or(28, 32))
                }
                REPARENT_WINDOW => format!("\"window\":{},\"parent\":{}", window(4), window(8)),
                CHANGE_WINDOW_ATTRIBUTES => format!("\"window\":{},\"mask\":{}{}", window(4), window(8), or(8, 12)),
                CHANGE_PROPERTY if r.len() >= 24 => {
                    let (property, kind) = (u32_at(r, 8), u32_at(r, 12));
                    let name = self.atom_name(query, property);
                    let incr = if kind == self.incr {
                        ",\"type_name\":\"INCR\""
                    } else {
                        ""
                    };
                    format!(
                        "\"window\":{},\"property\":{property},\"name\":{},\"type\":{kind}{incr},\"length\":{}",
                        window(4),
                        crate::json_str(&name),
                        u32_at(r, 20)
                    )
                }
                DELETE_PROPERTY | ROTATE_PROPERTIES => format!("\"window\":{},\"property\":{}", window(4), window(8)),
                GET_PROPERTY => {
                    if r[1] == 0 {
                        return None;
                    }
                    format!("\"window\":{},\"property\":{},\"delete\":true", window(4), window(8))
                }
                SEND_EVENT if r.len() >= 44 => {
                    let e = &r[12..44];
                    let code = e[0] & 0x7f;
                    let mut f = format!("\"destination\":{},\"event\":\"{}\"", window(4), event_name(code));
                    if code == 33 {
                        let kind = u32_at(e, 8);
                        let name = self.atom_name(query, kind);
                        f.push_str(&format!(
                            ",\"cm_window\":{},\"cm_type\":{}",
                            u32_at(e, 4),
                            crate::json_str(&name)
                        ));
                    } else if code == 31 {
                        f.push_str(&format!(
                            ",\"requestor\":{},\"selection\":{},\"target\":{},\"property\":{}",
                            u32_at(e, 8),
                            u32_at(e, 12),
                            u32_at(e, 16),
                            u32_at(e, 20)
                        ));
                    }
                    f
                }
                WARP_POINTER => {
                    let (_, pointer) = self.placement(query);
                    format!("\"dst\":{},\"pointer\":{pointer}", window(8))
                }
                SET_INPUT_FOCUS => format!("\"focus\":{}", window(4)),
                KILL_CLIENT => format!("\"resource\":{}", window(4)),
                _ => format!("\"window\":{}", window(4)),
            };
            return Some(Self::line("req", &format!("{head},\"op\":\"{op}\",{fields}")));
        }
        if !judged {
            return None;
        }
        if Some(major) == self.composite && (1..=4).contains(&r[1]) {
            let op = COMPOSITE_OPS[r[1] as usize - 1];
            return Some(Self::line(
                "req",
                &format!("{head},\"op\":\"{op}\",\"window\":{}", window(4)),
            ));
        }
        if Some(major) == self.xtest && r[1] == FAKE_INPUT && r.len() >= 8 {
            let (focus, pointer) = self.placement(query);
            return Some(Self::line(
                "req",
                &format!(
                    "{head},\"op\":\"FakeInput\",\"type\":\"{}\",\"detail\":{},\"focus\":{focus},\"pointer\":{pointer}",
                    event_name(r[4]),
                    r[5]
                ),
            ));
        }
        None
    }

    /// The delivered events of one `FromServer` element (each preceded by its server time): a DestroyNotify any
    /// client received, a SelectionRequest one of ours received. Errors come on their own context (`error_lines`).
    pub fn served(&mut self, base: u32, data: &[u8]) -> Vec<String> {
        let mut out = Vec::new();
        let mut i = 0;
        while i + 4 + 32 <= data.len() {
            let p = &data[i + 4..i + 36];
            match p[0] {
                code if code & 0x7f == DESTROY_NOTIFY => {
                    let w = u32_at(p, 8);
                    if self.announced.insert(w) {
                        out.push(Self::line("destroyed", &format!("\"window\":{w}")));
                    }
                }
                code if code & 0x7f == SELECTION_REQUEST && self.ours(base) != Some(false) => out.push(Self::line(
                    "selreq",
                    &format!(
                        "\"client\":{base},\"requestor\":{},\"selection\":{},\"property\":{},\"target\":{}",
                        u32_at(p, 12),
                        u32_at(p, 16),
                        u32_at(p, 24),
                        u32_at(p, 20)
                    ),
                )),
                _ => {}
            }
            i += 36;
        }
        out
    }
}

/// The errors of one `FromServer` element of the errors' context (each preceded by its server time), for the requests
/// the watch reads: each with its request's sequence number's 16 bits, its major and minor opcodes, and the server's
/// time, by which the judge finds the request it refused (the requests come on the other context).
pub fn error_lines(base: u32, data: &[u8], xtest: Option<u8>, composite: Option<u8>) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + 4 + 32 <= data.len() {
        let t = u32_at(data, i);
        let p = &data[i + 4..i + 36];
        let major = p[10];
        if p[0] == 0 && (core_op(major).is_some() || Some(major) == composite || Some(major) == xtest) {
            out.push(Watch::line(
                "error",
                &format!(
                    "\"client\":{base},\"seq\":{},\"major\":{major},\"minor\":{},\"code\":{},\"t\":{t}",
                    u16_at(p, 2),
                    u16_at(p, 8),
                    p[1]
                ),
            ));
        }
        i += 36;
    }
    out
}

/// The record's two contexts' ranges: the requests the watch reads, the clients' starts and ends and the delivered
/// events (DestroyNotify, SelectionRequest) on one, so each event stays in order with the requests; the errors on
/// the other. X.Org's RECORD tests every delivered event of a client whose ranges include errors as an error, by its
/// second byte (record.c `RecordADeliveredEventOrError`), so with both on one context no event ever arrived.
pub fn contexts(xtest: Option<u8>, composite: Option<u8>) -> (Vec<record::Range>, Vec<record::Range>) {
    let none8 = record::Range8 { first: 0, last: 0 };
    let no_ext = record::ExtRange {
        major: none8,
        minor: record::Range16 { first: 0, last: 0 },
    };
    let empty = record::Range {
        core_requests: none8,
        core_replies: none8,
        ext_requests: no_ext,
        ext_replies: no_ext,
        delivered_events: none8,
        device_events: none8,
        errors: none8,
        client_started: false,
        client_died: false,
    };
    let core = |first: u8, last: u8| record::Range {
        core_requests: record::Range8 { first, last },
        ..empty
    };
    let delivered = |code: u8| record::Range {
        delivered_events: record::Range8 { first: code, last: code },
        ..empty
    };
    let mut events = vec![
        core(CREATE_WINDOW, CHANGE_WINDOW_ATTRIBUTES),
        core(DESTROY_WINDOW, DESTROY_SUBWINDOWS),
        core(REPARENT_WINDOW, CIRCULATE_WINDOW),
        core(CHANGE_PROPERTY, GET_PROPERTY),
        core(SEND_EVENT, SEND_EVENT),
        core(WARP_POINTER, SET_INPUT_FOCUS),
        core(KILL_CLIENT, ROTATE_PROPERTIES),
        delivered(DESTROY_NOTIFY),
        delivered(SELECTION_REQUEST),
        record::Range {
            client_started: true,
            client_died: true,
            ..empty
        },
    ];
    let ext = |m: u8, a: u16, b: u16| record::Range {
        ext_requests: record::ExtRange {
            major: record::Range8 { first: m, last: m },
            minor: record::Range16 { first: a, last: b },
        },
        ..empty
    };
    if let Some(m) = xtest {
        events.push(ext(m, u16::from(FAKE_INPUT), u16::from(FAKE_INPUT)));
    }
    if let Some(m) = composite {
        events.push(ext(m, 1, 4));
    }
    let errors = vec![record::Range {
        errors: record::Range8 { first: 1, last: 255 },
        ..empty
    }];
    (events, errors)
}

fn parse_args(args: &[String]) -> Result<(u32, Vec<String>)> {
    let mut harness = None;
    let mut allowed: Vec<String> = DEFAULT_EXE.iter().map(|s| s.to_string()).collect();
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--ours" => harness = Some(it.next().ok_or("--ours <pid>")?.parse()?),
            "--exe" => {
                allowed = it
                    .next()
                    .ok_or("--exe <name>,...")?
                    .split(',')
                    .map(str::to_string)
                    .collect()
            }
            _ => return Err("record-run --ours <pid> [--exe <name>,...]".into()),
        }
    }
    Ok((harness.ok_or("record-run needs --ours <pid>")?, allowed))
}

pub fn record_run(args: &[String]) -> Result<()> {
    let result = run(args);
    if let Err(e) = &result {
        // the record's own last line says it failed, so a file of it never reads as complete
        let _ = print_lines(&[Watch::line(
            "failed",
            &format!("\"error\":{}", crate::json_str(&e.to_string())),
        )]);
    }
    result
}

fn run(args: &[String]) -> Result<()> {
    let (harness, allowed) = parse_args(args)?;
    let (control, screen) = x11rb::connect(None)?;
    let (data, _) = x11rb::connect(None)?;
    let (error_data, _) = x11rb::connect(None)?;
    let (query, _) = x11rb::connect(None)?;
    let root = control.setup().roots[screen].root;
    control.record_query_version(1, 13)?.reply()?;
    query.res_query_version(1, 2)?.reply()?;
    let major = |name: &[u8]| -> Result<Option<u8>> {
        let r = control.query_extension(name)?.reply()?;
        Ok(r.present.then_some(r.major_opcode))
    };
    let xtest = major(b"XTEST")?;
    let composite = major(b"Composite")?;
    let incr = control.intern_atom(false, b"INCR")?.reply()?.atom;
    let mut watch = Watch::new(root, xtest, composite, incr, harness, allowed);

    let (ranges, error_ranges) = contexts(xtest, composite);
    let header = u8::from(record::HType::FROM_SERVER_TIME)
        | u8::from(record::HType::FROM_CLIENT_TIME)
        | u8::from(record::HType::FROM_CLIENT_SEQUENCE);
    let context = control.generate_id()?;
    control
        .record_create_context(context, header, &[u32::from(record::CS::ALL_CLIENTS)], &ranges)?
        .check()?;
    let error_context = control.generate_id()?;
    control
        .record_create_context(error_context, header, &[u32::from(record::CS::ALL_CLIENTS)], &error_ranges)?
        .check()?;
    // the errors' context recording before the requests' begins, so no request's refusal goes unread
    let (started_tx, started) = std::sync::mpsc::channel();
    let mut error_collector = Collector::spawn(move || {
        for reply in error_data.record_enable_context(error_context).map_err(|e| e.to_string())? {
            let reply = reply.map_err(|e| e.to_string())?;
            if reply.client_swapped {
                return Err("a recorded client's byte order differs from ours".into());
            }
            let lines = match reply.category {
                0 => error_lines(reply.xid_base, &reply.data, xtest, composite),
                4 => {
                    let _ = started_tx.send(());
                    Vec::new()
                }
                _ => Vec::new(),
            };
            print_lines(&lines).map_err(|e| e.to_string())?;
        }
        Ok(())
    });
    if started.recv_timeout(Duration::from_secs(10)).is_err() {
        error_collector.check_running()?;
        return Err("the record's errors context did not begin".into());
    }
    // the clients already connected, attributed before recording begins
    let existing = query.res_query_clients()?.reply()?.clients;
    let mut lines = Vec::new();
    for c in existing {
        lines.push(watch.attribute(&query, c.resource_base, "existing"));
    }
    print_lines(&lines)?;
    let raw = std::env::var_os("XPROBE_RECORD_RAW").is_some_and(|v| v == "1");
    let mut collector = Collector::spawn(move || {
        for reply in data.record_enable_context(context).map_err(|e| e.to_string())? {
            let reply = reply.map_err(|e| e.to_string())?;
            if reply.client_swapped {
                return Err("a recorded client's byte order differs from ours".into());
            }
            if raw {
                let hex: Vec<String> = reply.data.iter().take(48).map(|b| format!("{b:02x}")).collect();
                eprintln!(
                    "raw category={} base={:#x} {}",
                    reply.category,
                    reply.xid_base,
                    hex.join("")
                );
            }
            let lines = match reply.category {
                0 => watch.served(reply.xid_base, &reply.data),
                1 => watch.requests(reply.xid_base, &reply.data, Some(&query)),
                2 => vec![watch.attribute(&query, reply.xid_base, "started")],
                3 => {
                    watch.owners.remove(&reply.xid_base);
                    vec![Watch::line("died", &format!("\"client\":{}", reply.xid_base))]
                }
                // with the server's time then (`t0`), against which each request's time is read on the wall clock
                4 => vec![Watch::line(
                    "ready",
                    &format!(
                        "\"root\":{root},\"xtest\":{},\"composite\":{},\"t0\":{}",
                        xtest.unwrap_or(0),
                        composite.unwrap_or(0),
                        reply.server_time
                    ),
                )],
                _ => Vec::new(),
            };
            print_lines(&lines).map_err(|e| e.to_string())?;
        }
        Ok(())
    });
    let closed = stdin_closed();
    loop {
        collector.check_running()?;
        error_collector.check_running()?;
        if closed.recv_timeout(Duration::from_millis(10)).is_ok() {
            break;
        }
    }
    collector.check_running()?;
    error_collector.check_running()?;
    control.record_disable_context(context)?;
    control.record_disable_context(error_context)?;
    control.get_input_focus()?.reply()?;
    collector.finish(COLLECTOR_END)?;
    error_collector.finish(COLLECTOR_END)?;
    control.record_free_context(context)?;
    control.record_free_context(error_context)?;
    control.flush()?;
    print_lines(&[Watch::line("end", "")])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn watch() -> Watch {
        let mut w = Watch::new(
            0x1ff,
            Some(132),
            Some(142),
            0xed,
            100,
            DEFAULT_EXE.iter().map(|s| s.to_string()).collect(),
        );
        w.owners.insert(
            0x400000,
            Owner {
                pid: Some(1),
                exe: Some("cua-engine".into()),
                ours: Some(true),
            },
        );
        w.owners.insert(
            0x600000,
            Owner {
                pid: Some(2),
                exe: Some("chrome".into()),
                ours: Some(false),
            },
        );
        w
    }

    /// One recorded request: its time, its sequence number and its bytes.
    fn element(time: u32, seq: u32, request: &[u8]) -> Vec<u8> {
        let mut v = time.to_le_bytes().to_vec();
        v.extend_from_slice(&seq.to_le_bytes());
        v.extend_from_slice(request);
        v
    }

    fn request(major: u8, minor: u8, words: &[u32]) -> Vec<u8> {
        let mut v = vec![major, minor];
        v.extend_from_slice(&((1 + words.len()) as u16).to_le_bytes());
        for w in words {
            v.extend_from_slice(&w.to_le_bytes());
        }
        v
    }

    fn json(line: &str) -> String {
        // the wall clock aside
        let at = line.find(",\"ms\":").unwrap();
        let end = line[at + 6..].find([',', '}']).unwrap() + at + 6;
        format!("{}{}", &line[..at], &line[end..])
    }

    #[test]
    fn a_client_is_ours_only_when_it_descends_from_the_harness_and_is_one_of_its_tools() {
        let allowed: Vec<String> = DEFAULT_EXE.iter().map(|s| s.to_string()).collect();
        assert!(classify(Some("xtrace"), &[50, 10, 1], 10, &allowed));
        assert!(classify(Some("sky_linux_x64"), &[50, 10, 1], 10, &allowed));
        assert!(
            !classify(Some("gedit"), &[50, 10, 1], 10, &allowed),
            "a scene application"
        );
        assert!(
            !classify(Some("xdotool"), &[50, 9, 1], 10, &allowed),
            "not under the harness"
        );
        assert!(!classify(None, &[50, 10, 1], 10, &allowed));
    }

    #[test]
    fn our_requests_that_change_a_window_are_read_with_their_sequence_numbers() {
        let mut w = watch();
        let mut data = element(7, 41, &request(12, 0, &[0x600002, 0x40, 5]));
        data.extend(element(8, 42, &request(2, 0, &[0x600002, 0x200, 1])));
        let lines: Vec<String> = w.requests(0x400000, &data, None).iter().map(|l| json(l)).collect();
        assert_eq!(
            lines,
            [
                "{\"kind\":\"req\",\"client\":4194304,\"seq\":41,\"t\":7,\"op\":\"ConfigureWindow\",\"window\":6291458}",
                "{\"kind\":\"req\",\"client\":4194304,\"seq\":42,\"t\":8,\"op\":\"ChangeWindowAttributes\",\"window\":6291458,\"mask\":512,\"or\":true}",
            ]
        );
    }

    #[test]
    fn a_windows_override_redirect_flag_is_read_from_its_creation_and_any_later_change_by_any_client() {
        let mut w = watch();
        // CreateWindow: the fixed part, then value-mask = background-pixel (bit 1) | override-redirect (bit 9)
        let mut create = request(1, 24, &[0x600009, 0x1ff, 0, 0, 0, 0, 0x202, 0, 1]);
        create[2..4].copy_from_slice(&10u16.to_le_bytes());
        let mut data = element(1, 5, &create);
        // ChangeWindowAttributes by the person's client: override-redirect off; another of its own, event-mask only
        data.extend(element(1, 6, &request(2, 0, &[0x600009, 0x200, 0])));
        data.extend(element(1, 7, &request(2, 0, &[0x600009, 0x800, 1])));
        let lines: Vec<String> = w.requests(0x600000, &data, None).iter().map(|l| json(l)).collect();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(
            lines[0].ends_with("\"op\":\"CreateWindow\",\"window\":6291465,\"parent\":511,\"or\":true}"),
            "{}",
            lines[0]
        );
        assert!(
            lines[1].ends_with("\"op\":\"ChangeWindowAttributes\",\"window\":6291465,\"mask\":512,\"or\":false}"),
            "{}",
            lines[1]
        );
    }

    #[test]
    fn the_persons_clients_only_say_where_their_windows_are() {
        let mut w = watch();
        let mut data = element(1, 3, &request(12, 0, &[0x600002, 0x40, 5]));
        data.extend(element(1, 4, &request(1, 24, &[0x600005, 0x1ff, 0, 0, 0, 0, 0])));
        let lines = w.requests(0x600000, &data, None);
        assert_eq!(lines.len(), 1);
        assert!(
            lines[0].contains("\"op\":\"CreateWindow\",\"window\":6291461,\"parent\":511"),
            "{}",
            lines[0]
        );
    }

    #[test]
    fn a_big_request_is_read_at_its_fields_and_a_reading_get_property_is_left_out() {
        let mut w = watch();
        // ChangeProperty through BIG-REQUESTS: length 0, then the extended length, then the fields
        let mut big = vec![18, 0, 0, 0];
        big.extend_from_slice(&9u32.to_le_bytes());
        for v in [0x600002u32, 0x1f0, 0xed, 8, 0] {
            big.extend_from_slice(&v.to_le_bytes());
        }
        big.extend_from_slice(&[0; 8]);
        let mut data = element(2, 9, &big);
        data.extend(element(2, 10, &request(20, 0, &[0x600002, 0x27, 0, 0, 100])));
        data.extend(element(2, 11, &request(20, 1, &[0x600002, 0x27, 0, 0, 100])));
        let lines: Vec<String> = w.requests(0x400000, &data, None).iter().map(|l| json(l)).collect();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[0].contains("\"op\":\"ChangeProperty\",\"window\":6291458,\"property\":496,\"name\":\"atom 496\",\"type\":237,\"type_name\":\"INCR\",\"length\":0"), "{}", lines[0]);
        assert!(
            lines[1].contains("\"op\":\"GetProperty\",\"window\":6291458,\"property\":39,\"delete\":true"),
            "{}",
            lines[1]
        );
    }

    #[test]
    fn a_send_event_names_its_destination_and_a_client_message_its_window() {
        let mut w = watch();
        let mut ev = vec![0u32; 11];
        ev[0] = 0x1ff;
        ev[1] = 0x180000;
        let mut r = request(25, 0, &ev);
        // the event: ClientMessage(33), format 32, window, type
        r[12] = 33;
        r[13] = 32;
        r[16..20].copy_from_slice(&0x600002u32.to_le_bytes());
        r[20..24].copy_from_slice(&0x150u32.to_le_bytes());
        let lines = w.requests(0x400000, &element(3, 5, &r), None);
        assert!(lines[0].contains("\"op\":\"SendEvent\",\"destination\":511,\"event\":\"ClientMessage\",\"cm_window\":6291458,\"cm_type\":\"atom 336\""), "{}", lines[0]);
    }

    #[test]
    fn xtest_input_and_composite_redirects_are_read_from_ours() {
        let mut w = watch();
        let mut fake = request(132, 2, &[0, 0, 0, 0, 0, 0, 0, 0]);
        fake[4] = 2;
        fake[5] = 38;
        let mut data = element(4, 6, &fake);
        data.extend(element(4, 7, &request(142, 1, &[0x600002, 0])));
        let lines: Vec<String> = w.requests(0x400000, &data, None).iter().map(|l| json(l)).collect();
        assert_eq!(
            lines,
            [
                "{\"kind\":\"req\",\"client\":4194304,\"seq\":6,\"t\":4,\"op\":\"FakeInput\",\"type\":\"KeyPress\",\"detail\":38,\"focus\":null,\"pointer\":null}",
                "{\"kind\":\"req\",\"client\":4194304,\"seq\":7,\"t\":4,\"op\":\"RedirectWindow\",\"window\":6291458}",
            ]
        );
    }

    #[test]
    fn delivered_events_have_a_context_without_errors_which_have_their_own() {
        // X.Org's RECORD tests every delivered event of a client whose ranges include errors as an error, by its second
        // byte, and drops it (record.c `RecordADeliveredEventOrError`): a SelectionRequest or a DestroyNotify never
        // arrived (T4c's probe on Xvfb, 2026-11-02)
        let (events, errors) = contexts(Some(132), Some(142));
        assert!(events.iter().all(|r| r.errors.first == 0 && r.errors.last == 0), "no errors beside the delivered events");
        let delivered: Vec<(u8, u8)> = events.iter().map(|r| (r.delivered_events.first, r.delivered_events.last)).filter(|&(a, _)| a != 0).collect();
        assert_eq!(delivered, [(DESTROY_NOTIFY, DESTROY_NOTIFY), (SELECTION_REQUEST, SELECTION_REQUEST)]);
        assert!(events.iter().any(|r| r.client_started && r.client_died));
        assert!(events.iter().any(|r| r.core_requests.first == SEND_EVENT));
        assert_eq!(errors.len(), 1);
        assert_eq!((errors[0].errors.first, errors[0].errors.last), (1, 255));
        assert_eq!(errors[0].delivered_events.first, 0);
        assert!(errors[0].core_requests.first == 0 && !errors[0].client_started);
    }

    #[test]
    fn a_selection_notify_sent_names_its_requestor_selection_target_and_property() {
        let mut w = watch();
        // SendEvent: destination, event-mask, then the event: code 31, time, requestor, selection, target, property
        let words = [0x600002u32, 0, 31, 0, 0x600002, 0x1e9, 0x1f1, 0x1f0, 0, 0, 0];
        let data = element(3, 50, &request(25, 0, &words));
        let lines: Vec<String> = w.requests(0x400000, &data, None).iter().map(|l| json(l)).collect();
        assert_eq!(
            lines,
            ["{\"kind\":\"req\",\"client\":4194304,\"seq\":50,\"t\":3,\"op\":\"SendEvent\",\"destination\":6291458,\"event\":\"SelectionNotify\",\"requestor\":6291458,\"selection\":489,\"target\":497,\"property\":496}"]
        );
    }

    #[test]
    fn a_destroy_notify_is_read_once_an_error_with_its_request_and_a_selection_request_to_ours() {
        let mut w = watch();
        let packet = |p: [u8; 32]| {
            let mut v = 9u32.to_le_bytes().to_vec();
            v.extend_from_slice(&p);
            v
        };
        let mut destroy = [0u8; 32];
        destroy[0] = 17;
        destroy[8..12].copy_from_slice(&0x600002u32.to_le_bytes());
        let mut error = [0u8; 32];
        error[1] = 14;
        error[2..4].copy_from_slice(&7u16.to_le_bytes());
        error[10] = 1;
        let mut select = [0u8; 32];
        select[0] = 30;
        select[12..16].copy_from_slice(&0x600010u32.to_le_bytes());
        select[16..20].copy_from_slice(&0x1e9u32.to_le_bytes());
        select[20..24].copy_from_slice(&0x1f1u32.to_le_bytes());
        select[24..28].copy_from_slice(&0x1f0u32.to_le_bytes());
        let mut data = packet(destroy);
        data.extend(packet(destroy));
        data.extend(packet(error));
        data.extend(packet(select));
        let lines: Vec<String> = w.served(0x400000, &data).iter().map(|l| json(l)).collect();
        assert_eq!(
            lines,
            [
                "{\"kind\":\"destroyed\",\"window\":6291458}",
                "{\"kind\":\"selreq\",\"client\":4194304,\"requestor\":6291472,\"selection\":489,\"property\":496,\"target\":497}",
            ]
        );
        // the errors' own context: each error with its request's opcodes and the server's time
        let lines: Vec<String> = error_lines(0x400000, &packet(error), Some(132), Some(142)).iter().map(|l| json(l)).collect();
        assert_eq!(
            lines,
            ["{\"kind\":\"error\",\"client\":4194304,\"seq\":7,\"major\":1,\"minor\":0,\"code\":14,\"t\":9}"]
        );
        let mut unread = error;
        unread[10] = 14;
        assert!(error_lines(0x400000, &packet(unread), Some(132), Some(142)).is_empty(), "GetGeometry's error: a request the record does not read");
        // a selection request to the person's own client is theirs
        assert!(w.served(0x600000, &packet(select)).is_empty());
    }
}
