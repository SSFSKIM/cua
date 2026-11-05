//! `xprobe request-watch`: the requests around a drag and drop, from every client, as the server sees them, through the
//! RECORD extension (no proxy: the person's own Chrome stays on its display), each with the server time it was recorded
//! at and the wall clock it was printed at, until stdin closes (M3.1's drop-miss follow-up: whether a drag-and-drop
//! that starts in the page but never takes `XdndSelection` sent its request with a time the server ignores, had its
//! pointer grab refused, or never asked; and what input reached the window just before). One JSON line per element,
//! each with `client` (the client's resource-id base), `server_time` and `wall_ms`:
//! - `set_selection_owner` {owner, selection, time};
//! - `grab_pointer` {window, time}, `grab_keyboard` {window, time}, `xi_grab_device` {window, time, device}, each
//!   followed by its `*_reply` {status} (0 success, 1 already grabbed, 2 invalid time, 3 not viewable, 4 frozen);
//! - `ungrab_pointer`, `ungrab_keyboard` {time}, `xi_ungrab_device` {time, device};
//! - `send_event` {event, destination, detail, time?, x?, y?, state?, mode?} for key, button and focus events, and
//!   `fake_input` {event, detail, time, x, y} (XTEST) for key and button events;
//! - `motions` {via, n, first_time?, last_time?}: a client's motion events since its last other recorded element,
//!   counted rather than listed; with `XPROBE_EVERY_MOTION=1` each is listed as `motion` {via, time, x, y}, a synthetic
//!   one with its window and its button and modifier state.

use std::collections::{HashMap, VecDeque};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use x11rb::connection::Connection;
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;

use crate::Result;
use crate::collector::{COLLECTOR_END, Collector, print_lines, stdin_closed};

const SET_SELECTION_OWNER: u8 = 22;
const SEND_EVENT: u8 = 25;
const GRAB_POINTER: u8 = 26;
const UNGRAB_POINTER: u8 = 27;
const GRAB_KEYBOARD: u8 = 31;
const UNGRAB_KEYBOARD: u8 = 32;
const GRAB_SERVER: u8 = 36;
const UNGRAB_SERVER: u8 = 37;
/// XInput 2's `XIGrabDevice` and `XIUngrabDevice` minor opcodes.
const XI_GRAB_DEVICE: u8 = 51;
const XI_UNGRAB_DEVICE: u8 = 52;
/// XTEST's `FakeInput` minor opcode.
const FAKE_INPUT: u8 = 2;
const MOTION_NOTIFY: u8 = 6;
const CLIENT_MESSAGE: u8 = 33;
/// The XDND protocol's client messages, recorded by name.
const XDND: [&str; 6] = [
    "XdndEnter",
    "XdndPosition",
    "XdndStatus",
    "XdndLeave",
    "XdndDrop",
    "XdndFinished",
];

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn i16_at(b: &[u8], i: usize) -> i16 {
    i16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn event_name(code: u8) -> Option<&'static str> {
    Some(match code {
        2 => "key_press",
        3 => "key_release",
        4 => "button_press",
        5 => "button_release",
        9 => "focus_in",
        10 => "focus_out",
        _ => return None,
    })
}

/// A request whose reply the watch records: matched to its reply in the client's order.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Pending {
    GrabPointer,
    GrabKeyboard,
    XiGrabDevice,
}

#[derive(Default)]
struct Motions {
    n: u32,
    first: Option<u32>,
    last: Option<u32>,
}

/// The watch's parser: the extensions' major opcodes, and per client its pending replies and uncounted motions.
pub struct Parser {
    xi: Option<u8>,
    xtest: Option<u8>,
    /// The XDND atoms by value, so their client messages print by name.
    atoms: HashMap<u32, String>,
    /// Every motion printed with its times and position (`XPROBE_EVERY_MOTION=1`), not only counted.
    every_motion: bool,
    pending: HashMap<u32, VecDeque<Pending>>,
    motions: HashMap<(u32, &'static str), Motions>,
}

impl Parser {
    pub fn new(xi: Option<u8>, xtest: Option<u8>) -> Self {
        Self {
            xi,
            xtest,
            atoms: HashMap::new(),
            every_motion: false,
            pending: HashMap::new(),
            motions: HashMap::new(),
        }
    }

    pub fn with_atoms(mut self, atoms: HashMap<u32, String>) -> Self {
        self.atoms = atoms;
        self
    }

    pub fn every_motion(mut self, on: bool) -> Self {
        self.every_motion = on;
        self
    }

    fn line(client: u32, server_time: u32, wall_ms: u128, kind: &str, fields: &str) -> String {
        let sep = if fields.is_empty() { "" } else { "," };
        format!(
            "{{\"kind\":\"{kind}\",\"client\":{client},\"server_time\":{server_time},\"wall_ms\":{wall_ms}{sep}{fields}}}"
        )
    }

    fn motion(&mut self, client: u32, via: &'static str, time: Option<u32>) {
        let m = self.motions.entry((client, via)).or_default();
        m.n += 1;
        if m.first.is_none() {
            m.first = time;
        }
        if time.is_some() {
            m.last = time;
        }
    }

    /// The client's counted motions, printed before anything else it does.
    fn flush(&mut self, client: u32, server_time: u32, wall_ms: u128, out: &mut Vec<String>) {
        for via in ["send_event", "fake_input"] {
            if let Some(m) = self.motions.remove(&(client, via)) {
                let times = match (m.first, m.last) {
                    (Some(a), Some(b)) => format!(",\"first_time\":{a},\"last_time\":{b}"),
                    _ => String::new(),
                };
                out.push(Self::line(
                    client,
                    server_time,
                    wall_ms,
                    "motions",
                    &format!("\"via\":\"{via}\",\"n\":{}{times}", m.n),
                ));
            }
        }
    }

    /// The requests of one recorded element, each preceded by its server time (`FromClientTime`).
    pub fn requests(&mut self, client: u32, data: &[u8], wall_ms: u128) -> Vec<String> {
        let mut out = Vec::new();
        let mut i = 0;
        while i + 8 <= data.len() {
            let time = u32_at(data, i);
            let request = &data[i + 4..];
            let words = u16_at(request, 2) as usize;
            let len = if words == 0 && request.len() >= 8 {
                u32_at(request, 4) as usize * 4
            } else {
                words * 4
            };
            if len < 4 || len > request.len() {
                break;
            }
            let r = &request[..len];
            self.request(client, time, wall_ms, r, &mut out);
            i += 4 + len;
        }
        out
    }

    fn request(&mut self, client: u32, time: u32, wall: u128, r: &[u8], out: &mut Vec<String>) {
        let len = r.len();
        let major = r[0];
        // motions are counted, everything else flushes the count first
        if major == SEND_EVENT && len >= 44 && r[12] & 0x7f == MOTION_NOTIFY {
            if self.every_motion {
                let e = &r[12..44];
                out.push(Self::line(
                    client,
                    time,
                    wall,
                    "motion",
                    &format!(
                        "\"via\":\"send_event\",\"time\":{},\"x\":{},\"y\":{},\"window\":{},\"state\":{}",
                        u32_at(e, 4),
                        i16_at(e, 20),
                        i16_at(e, 22),
                        u32_at(e, 12),
                        u16::from_le_bytes([e[28], e[29]])
                    ),
                ));
            } else {
                self.motion(client, "send_event", Some(u32_at(r, 16)));
            }
            return;
        }
        if Some(major) == self.xtest && r[1] == FAKE_INPUT && len >= 36 && r[4] == MOTION_NOTIFY {
            let t = u32_at(r, 8);
            if self.every_motion {
                out.push(Self::line(
                    client,
                    time,
                    wall,
                    "motion",
                    &format!(
                        "\"via\":\"fake_input\",\"time\":{t},\"x\":{},\"y\":{}",
                        i16_at(r, 24),
                        i16_at(r, 26)
                    ),
                ));
            } else {
                self.motion(client, "fake_input", (t != 0).then_some(t));
            }
            return;
        }
        let push = |s: &mut Self, out: &mut Vec<String>, kind: &str, fields: String| {
            s.flush(client, time, wall, out);
            out.push(Self::line(client, time, wall, kind, &fields));
        };
        match major {
            SET_SELECTION_OWNER if len >= 16 => push(
                self,
                out,
                "set_selection_owner",
                format!(
                    "\"owner\":{},\"selection\":{},\"time\":{}",
                    u32_at(r, 4),
                    u32_at(r, 8),
                    u32_at(r, 12)
                ),
            ),
            GRAB_POINTER if len >= 24 => {
                push(
                    self,
                    out,
                    "grab_pointer",
                    format!("\"window\":{},\"time\":{}", u32_at(r, 4), u32_at(r, 20)),
                );
                self.pending.entry(client).or_default().push_back(Pending::GrabPointer);
            }
            GRAB_KEYBOARD if len >= 16 => {
                push(
                    self,
                    out,
                    "grab_keyboard",
                    format!("\"window\":{},\"time\":{}", u32_at(r, 4), u32_at(r, 8)),
                );
                self.pending.entry(client).or_default().push_back(Pending::GrabKeyboard);
            }
            UNGRAB_POINTER if len >= 8 => push(self, out, "ungrab_pointer", format!("\"time\":{}", u32_at(r, 4))),
            UNGRAB_KEYBOARD if len >= 8 => push(self, out, "ungrab_keyboard", format!("\"time\":{}", u32_at(r, 4))),
            GRAB_SERVER => push(self, out, "grab_server", String::new()),
            UNGRAB_SERVER => push(self, out, "ungrab_server", String::new()),
            SEND_EVENT if len >= 44 => {
                let e = &r[12..44];
                if e[0] & 0x7f == CLIENT_MESSAGE {
                    // XDND's protocol messages only: {type, window, data[5]}
                    let Some(name) = self.atoms.get(&u32_at(e, 8)).cloned() else {
                        return;
                    };
                    let data: Vec<String> = (0..5).map(|k| u32_at(e, 12 + 4 * k).to_string()).collect();
                    push(
                        self,
                        out,
                        "client_message",
                        format!(
                            "\"type\":\"{name}\",\"destination\":{},\"window\":{},\"data\":[{}]",
                            u32_at(r, 4),
                            u32_at(e, 4),
                            data.join(",")
                        ),
                    );
                    return;
                }
                let Some(name) = event_name(e[0] & 0x7f) else { return };
                let fields = if matches!(e[0] & 0x7f, 9 | 10) {
                    format!(
                        "\"event\":\"{name}\",\"destination\":{},\"detail\":{},\"window\":{},\"mode\":{}",
                        u32_at(r, 4),
                        e[1],
                        u32_at(e, 4),
                        e[8]
                    )
                } else {
                    format!(
                        "\"event\":\"{name}\",\"destination\":{},\"detail\":{},\"time\":{},\"x\":{},\"y\":{},\"state\":{}",
                        u32_at(r, 4),
                        e[1],
                        u32_at(e, 4),
                        i16_at(e, 24),
                        i16_at(e, 26),
                        u16_at(e, 28)
                    )
                };
                push(self, out, "send_event", fields);
            }
            m if Some(m) == self.xtest && r[1] == FAKE_INPUT && len >= 36 => {
                let Some(name) = event_name(r[4]) else { return };
                push(
                    self,
                    out,
                    "fake_input",
                    format!(
                        "\"event\":\"{name}\",\"detail\":{},\"time\":{},\"x\":{},\"y\":{}",
                        r[5],
                        u32_at(r, 8),
                        i16_at(r, 24),
                        i16_at(r, 26)
                    ),
                );
            }
            m if Some(m) == self.xi && r[1] == XI_GRAB_DEVICE && len >= 24 => {
                push(
                    self,
                    out,
                    "xi_grab_device",
                    format!(
                        "\"window\":{},\"time\":{},\"device\":{}",
                        u32_at(r, 4),
                        u32_at(r, 8),
                        u16_at(r, 16)
                    ),
                );
                self.pending.entry(client).or_default().push_back(Pending::XiGrabDevice);
            }
            m if Some(m) == self.xi && r[1] == XI_UNGRAB_DEVICE && len >= 12 => {
                push(
                    self,
                    out,
                    "xi_ungrab_device",
                    format!("\"time\":{},\"device\":{}", u32_at(r, 4), u16_at(r, 8)),
                );
            }
            _ => {}
        }
    }

    /// The replies of one recorded element, each preceded by its server time (`FromServerTime`), matched in order to
    /// the client's recorded grabs (replies carry no opcode).
    pub fn replies(&mut self, client: u32, data: &[u8], wall_ms: u128) -> Vec<String> {
        let mut out = Vec::new();
        let mut i = 0;
        while i + 4 + 32 <= data.len() {
            let time = u32_at(data, i);
            let reply = &data[i + 4..];
            let len = 32 + u32_at(reply, 4) as usize * 4;
            if reply[0] == 1 {
                let pending = self.pending.get_mut(&client).and_then(VecDeque::pop_front);
                let (kind, status) = match pending {
                    Some(Pending::GrabPointer) => ("grab_pointer_reply", reply[1]),
                    Some(Pending::GrabKeyboard) => ("grab_keyboard_reply", reply[1]),
                    Some(Pending::XiGrabDevice) => ("xi_grab_device_reply", reply[8]),
                    None => ("unmatched_reply", reply[1]),
                };
                out.push(Self::line(client, time, wall_ms, kind, &format!("\"status\":{status}")));
            }
            i += 4 + len.max(32);
        }
        out
    }
}

fn wall_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis())
}

pub fn request_watch() -> Result<()> {
    let (control, _) = x11rb::connect(None)?;
    let (data, _) = x11rb::connect(None)?;
    control.record_query_version(1, 13)?.reply()?;
    let major = |name: &[u8]| -> Result<Option<u8>> {
        let r = control.query_extension(name)?.reply()?;
        Ok(r.present.then_some(r.major_opcode))
    };
    let xi = major(b"XInputExtension")?;
    let xtest = major(b"XTEST")?;
    let mut atoms = HashMap::new();
    for name in XDND {
        atoms.insert(
            control.intern_atom(false, name.as_bytes())?.reply()?.atom,
            name.to_string(),
        );
    }
    let context = control.generate_id()?;
    let none8 = record::Range8 { first: 0, last: 0 };
    let no_ext = record::ExtRange {
        major: none8,
        minor: record::Range16 { first: 0, last: 0 },
    };
    let range = |core: (u8, u8), core_replies: bool, ext: Option<(u8, u16, u16)>, ext_replies: bool| {
        let ext_range = ext.map_or(no_ext, |(m, a, b)| record::ExtRange {
            major: record::Range8 { first: m, last: m },
            minor: record::Range16 { first: a, last: b },
        });
        record::Range {
            core_requests: record::Range8 {
                first: core.0,
                last: core.1,
            },
            core_replies: if core_replies {
                record::Range8 {
                    first: core.0,
                    last: core.1,
                }
            } else {
                none8
            },
            ext_requests: ext_range,
            ext_replies: if ext_replies { ext_range } else { no_ext },
            delivered_events: none8,
            device_events: none8,
            errors: none8,
            client_started: false,
            client_died: false,
        }
    };
    let mut ranges = vec![
        range((SET_SELECTION_OWNER, SET_SELECTION_OWNER), false, None, false),
        range((SEND_EVENT, SEND_EVENT), false, None, false),
        range((GRAB_POINTER, GRAB_POINTER), true, None, false),
        range((UNGRAB_POINTER, UNGRAB_POINTER), false, None, false),
        range((GRAB_KEYBOARD, GRAB_KEYBOARD), true, None, false),
        range((UNGRAB_KEYBOARD, UNGRAB_KEYBOARD), false, None, false),
        range((GRAB_SERVER, UNGRAB_SERVER), false, None, false),
    ];
    if let Some(m) = xi {
        ranges.push(range(
            (0, 0),
            false,
            Some((m, u16::from(XI_GRAB_DEVICE), u16::from(XI_GRAB_DEVICE))),
            true,
        ));
        ranges.push(range(
            (0, 0),
            false,
            Some((m, u16::from(XI_UNGRAB_DEVICE), u16::from(XI_UNGRAB_DEVICE))),
            false,
        ));
    }
    if let Some(m) = xtest {
        ranges.push(range(
            (0, 0),
            false,
            Some((m, u16::from(FAKE_INPUT), u16::from(FAKE_INPUT))),
            false,
        ));
    }
    let header = u8::from(record::HType::FROM_SERVER_TIME) | u8::from(record::HType::FROM_CLIENT_TIME);
    control
        .record_create_context(context, header, &[u32::from(record::CS::ALL_CLIENTS)], &ranges)?
        .check()?;
    // the collector's error or early end fails the watch, so a record cut short never reads as complete
    let mut collector = Collector::spawn(move || {
        let mut parser = Parser::new(xi, xtest)
            .with_atoms(atoms)
            .every_motion(std::env::var_os("XPROBE_EVERY_MOTION").is_some_and(|v| v == "1"));
        for reply in data.record_enable_context(context).map_err(|e| e.to_string())? {
            let reply = reply.map_err(|e| e.to_string())?;
            let wall = wall_ms();
            let lines = match reply.category {
                0 => parser.replies(reply.xid_base, &reply.data, wall),
                1 => parser.requests(reply.xid_base, &reply.data, wall),
                4 => vec![format!(
                    "{{\"ready\":true,\"xi\":{},\"xtest\":{},\"wall_ms\":{wall}}}",
                    xi.unwrap_or(0),
                    xtest.unwrap_or(0)
                )],
                _ => Vec::new(),
            };
            print_lines(&lines).map_err(|e| e.to_string())?;
        }
        Ok(())
    });
    // until stdin closes, the collector watched meanwhile
    let closed = stdin_closed();
    loop {
        collector.check_running()?;
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

    fn element(time: u32, request: &[u8]) -> Vec<u8> {
        let mut v = time.to_le_bytes().to_vec();
        v.extend_from_slice(request);
        v
    }

    #[test]
    fn a_set_selection_owner_and_a_grab_are_read_with_their_times_and_the_reply_matched() {
        let mut p = Parser::new(Some(131), Some(132));
        let mut data = element(1000, &[22, 0, 4, 0]);
        for word in [7u32, 300, 999] {
            data.extend_from_slice(&word.to_le_bytes());
        }
        data.extend(element(1001, &[26, 0, 6, 0]));
        data.extend_from_slice(&9u32.to_le_bytes());
        data.extend_from_slice(&[0; 12]);
        data.extend_from_slice(&1002u32.to_le_bytes());
        assert_eq!(
            p.requests(0x600000, &data, 5),
            vec![
                "{\"kind\":\"set_selection_owner\",\"client\":6291456,\"server_time\":1000,\"wall_ms\":5,\"owner\":7,\"selection\":300,\"time\":999}",
                "{\"kind\":\"grab_pointer\",\"client\":6291456,\"server_time\":1001,\"wall_ms\":5,\"window\":9,\"time\":1002}",
            ]
        );
        let mut reply = 2000u32.to_le_bytes().to_vec();
        reply.extend_from_slice(&[1, 2]);
        reply.extend_from_slice(&[0; 30]);
        assert_eq!(
            p.replies(0x600000, &reply, 6),
            vec![
                "{\"kind\":\"grab_pointer_reply\",\"client\":6291456,\"server_time\":2000,\"wall_ms\":6,\"status\":2}"
            ]
        );
    }

    #[test]
    fn motions_are_counted_and_flushed_before_the_release() {
        let mut p = Parser::new(None, None);
        let send = |code: u8, time: u32, x: i16| {
            let mut r = vec![25, 0, 11, 0];
            r.extend_from_slice(&42u32.to_le_bytes());
            r.extend_from_slice(&0u32.to_le_bytes());
            let mut e = [0u8; 32];
            e[0] = code;
            e[1] = 1;
            e[4..8].copy_from_slice(&time.to_le_bytes());
            e[24..26].copy_from_slice(&x.to_le_bytes());
            r.extend_from_slice(&e);
            r
        };
        let mut data = element(10, &send(4, 100, 1));
        data.extend(element(11, &send(6, 101, 2)));
        data.extend(element(12, &send(6, 103, 3)));
        data.extend(element(13, &send(5, 104, 4)));
        let lines = p.requests(1, &data, 0);
        assert_eq!(lines.len(), 3, "{lines:?}");
        assert!(lines[0].contains("\"event\":\"button_press\"") && lines[0].contains("\"time\":100"));
        assert!(
            lines[1].contains("\"kind\":\"motions\"")
                && lines[1].contains("\"n\":2,\"first_time\":101,\"last_time\":103")
        );
        assert!(lines[2].contains("\"event\":\"button_release\"") && lines[2].contains("\"x\":4"));
    }

    #[test]
    fn every_motion_lists_each_synthetic_motion_with_its_window_and_button_state() {
        let mut p = Parser::new(None, None).every_motion(true);
        let mut r = vec![25, 0, 11, 0];
        r.extend_from_slice(&42u32.to_le_bytes());
        r.extend_from_slice(&0u32.to_le_bytes());
        let mut e = [0u8; 32];
        e[0] = 6;
        e[4..8].copy_from_slice(&101u32.to_le_bytes());
        e[12..16].copy_from_slice(&43u32.to_le_bytes());
        e[20..22].copy_from_slice(&530i16.to_le_bytes());
        e[22..24].copy_from_slice(&185i16.to_le_bytes());
        e[28..30].copy_from_slice(&0x100u16.to_le_bytes());
        r.extend_from_slice(&e);
        assert_eq!(
            p.requests(1, &element(7, &r), 0),
            vec![
                "{\"kind\":\"motion\",\"client\":1,\"server_time\":7,\"wall_ms\":0,\"via\":\"send_event\",\"time\":101,\"x\":530,\"y\":185,\"window\":43,\"state\":256}"
            ]
        );
    }

    #[test]
    fn an_xdnd_client_message_is_read_by_name_with_its_data() {
        let mut p = Parser::new(None, None).with_atoms(HashMap::from([(400, "XdndStatus".to_string())]));
        let mut r = vec![25, 0, 11, 0];
        r.extend_from_slice(&9u32.to_le_bytes());
        r.extend_from_slice(&0u32.to_le_bytes());
        let mut e = [0u8; 32];
        e[0] = 33;
        e[1] = 32;
        e[4..8].copy_from_slice(&9u32.to_le_bytes());
        e[8..12].copy_from_slice(&400u32.to_le_bytes());
        e[12..16].copy_from_slice(&7u32.to_le_bytes());
        e[16..20].copy_from_slice(&3u32.to_le_bytes());
        r.extend_from_slice(&e);
        let lines = p.requests(1, &element(5, &r), 0);
        assert_eq!(
            lines,
            vec![
                "{\"kind\":\"client_message\",\"client\":1,\"server_time\":5,\"wall_ms\":0,\"type\":\"XdndStatus\",\"destination\":9,\"window\":9,\"data\":[7,3,0,0,0]}"
            ]
        );
        e[8..12].copy_from_slice(&401u32.to_le_bytes());
        let mut other = r[..12].to_vec();
        other.extend_from_slice(&e);
        assert!(
            p.requests(1, &element(6, &other), 0).is_empty(),
            "another client message is not recorded"
        );
    }

    #[test]
    fn an_xi_grab_reply_reads_its_status_at_its_own_offset() {
        let mut p = Parser::new(Some(131), None);
        let mut r = vec![131, 51, 6, 0];
        r.extend_from_slice(&5u32.to_le_bytes());
        r.extend_from_slice(&77u32.to_le_bytes());
        r.extend_from_slice(&0u32.to_le_bytes());
        r.extend_from_slice(&2u16.to_le_bytes());
        r.extend_from_slice(&[0; 6]);
        let lines = p.requests(3, &element(1, &r), 0);
        assert!(
            lines[0].contains("\"kind\":\"xi_grab_device\"") && lines[0].contains("\"time\":77,\"device\":2"),
            "{lines:?}"
        );
        let mut reply = 2u32.to_le_bytes().to_vec();
        let mut body = [0u8; 32];
        body[0] = 1;
        body[8] = 1;
        reply.extend_from_slice(&body);
        assert_eq!(
            p.replies(3, &reply, 0),
            vec!["{\"kind\":\"xi_grab_device_reply\",\"client\":3,\"server_time\":2,\"wall_ms\":0,\"status\":1}"]
        );
    }
}
