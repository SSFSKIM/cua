//! Task 75 (experiment only, never merged): the Gecko drag control's race, measured. Every probe read appends a JSON
//! line to `$TASK75_LOG`: what the window had at the test's 400 ms read, what came after it (a further read, then a
//! round trip on the probe's own connection, which every event queued to it before must precede), the bytes waiting
//! on the probe's socket at the read, and the server's button state. An XRecord context records, beside it, what was
//! sent: every SendEvent and XTEST FakeInput request, and every ButtonPress and ButtonRelease the server queued to a
//! client, each with the server's time.

#![allow(dead_code)]

use serde_json::{Value, json};
use std::io::Write;
use std::sync::OnceLock;
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Instant;
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::record::{self, ConnectionExt as _};
use x11rb::protocol::xproto::Window;
use x11rb::rust_connection::RustConnection;

/// The process's clock origin, so the probe's reads and the recorder's receipts share one timeline.
pub fn ms() -> f64 {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    EPOCH.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
}

pub fn enabled() -> bool {
    std::env::var_os("TASK75_LOG").is_some()
}

/// The test the current thread runs (libtest names each test's thread after it).
pub fn test_name() -> String {
    std::thread::current().name().unwrap_or("?").to_string()
}

/// Whether this test reads long after its settle: the drag control's test alone, so the suite's time is unchanged.
pub fn long_read() -> bool {
    test_name().contains("a_gecko_drag_the_real_pointer_leaves")
}

pub fn log(line: Value) {
    let Some(path) = std::env::var_os("TASK75_LOG") else {
        return;
    };
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .expect("the task 75 log");
    let mut line = line;
    line["run"] = json!(std::env::var("TASK75_RUN").unwrap_or_default());
    line["test"] = json!(test_name());
    writeln!(file, "{line}").unwrap();
}

/// An XRecord context over every client, from `start` to `stop`.
pub struct Recorder {
    ctrl: RustConnection,
    context: u32,
    thread: JoinHandle<Vec<Value>>,
}

fn u16_at(b: &[u8], at: usize, swapped: bool) -> u16 {
    let v = [b[at], b[at + 1]];
    if swapped { u16::from_be_bytes(v) } else { u16::from_le_bytes(v) }
}
fn u32_at(b: &[u8], at: usize, swapped: bool) -> u32 {
    let v = [b[at], b[at + 1], b[at + 2], b[at + 3]];
    if swapped { u32::from_be_bytes(v) } else { u32::from_le_bytes(v) }
}
fn i16_at(b: &[u8], at: usize, swapped: bool) -> i16 {
    u16_at(b, at, swapped) as i16
}

fn kind(code: u8) -> &'static str {
    match code & 0x7f {
        4 => "ButtonPress",
        5 => "ButtonRelease",
        6 => "MotionNotify",
        7 => "EnterNotify",
        8 => "LeaveNotify",
        9 => "FocusIn",
        10 => "FocusOut",
        _ => "other",
    }
}

impl Recorder {
    /// Recording from the moment this returns (the server's StartOfData reply), keeping what concerns `window`:
    /// SendEvent requests to it, button events queued for it, and every XTEST FakeInput.
    pub fn start(window: Window) -> Recorder {
        let (ctrl, _) = x11rb::connect(None).expect("the recorder's control connection");
        let (data, _) = x11rb::connect(None).expect("the recorder's data connection");
        let xtest = ctrl
            .extension_information(x11rb::protocol::xtest::X11_EXTENSION_NAME)
            .unwrap()
            .expect("XTEST")
            .major_opcode;
        let context = ctrl.generate_id().unwrap();
        let range = record::Range {
            core_requests: record::Range8 { first: 25, last: 25 },
            core_replies: record::Range8 { first: 0, last: 0 },
            ext_requests: record::ExtRange {
                major: record::Range8 { first: xtest, last: xtest },
                minor: record::Range16 { first: 2, last: 2 },
            },
            ext_replies: record::ExtRange {
                major: record::Range8 { first: 0, last: 0 },
                minor: record::Range16 { first: 0, last: 0 },
            },
            delivered_events: record::Range8 { first: 4, last: 5 },
            device_events: record::Range8 { first: 0, last: 0 },
            errors: record::Range8 { first: 0, last: 0 },
            client_started: false,
            client_died: false,
        };
        ctrl.record_create_context(
            context,
            (record::HType::FROM_SERVER_TIME | record::HType::FROM_CLIENT_TIME).into(),
            &[record::CS::ALL_CLIENTS.into()],
            &[range],
        )
        .unwrap()
        .check()
        .expect("RECORD");
        let (ready, started) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            let mut records = Vec::new();
            let mut motions_to_window = 0u64;
            for reply in data.record_enable_context(context).unwrap() {
                let reply = reply.expect("a RECORD reply");
                let at = ms();
                match reply.category {
                    4 => {
                        let _ = ready.send(());
                        continue;
                    }
                    5 => break,
                    0 | 1 => {}
                    _ => continue,
                }
                let swapped = reply.client_swapped;
                let b = &reply.data;
                let mut i = 0;
                while i + 4 <= b.len() {
                    let time = u32_at(b, i, swapped);
                    i += 4;
                    if reply.category == 0 {
                        // an event the server queued to the client `xid_base`
                        if i + 32 > b.len() {
                            break;
                        }
                        let e = &b[i..i + 32];
                        i += 32;
                        if u32_at(e, 12, swapped) == window {
                            records.push(json!({
                                "rec_ms": at, "server_time": time, "what": "delivered", "client": reply.xid_base,
                                "event": kind(e[0]), "sent": e[0] & 0x80 != 0, "detail": e[1],
                                "event_time": u32_at(e, 4, swapped),
                            }));
                        }
                    } else {
                        let len = u16_at(b, i + 2, swapped) as usize * 4;
                        if len == 0 || i + len > b.len() {
                            break;
                        }
                        let r = &b[i..i + len];
                        i += len;
                        if r[0] == 25 && len >= 44 {
                            let destination = u32_at(r, 4, swapped);
                            let e = &r[12..44];
                            if destination == window {
                                if e[0] & 0x7f == 6 {
                                    motions_to_window += 1;
                                } else {
                                    records.push(json!({
                                        "rec_ms": at, "server_time": time, "what": "SendEvent",
                                        "client": reply.xid_base, "event": kind(e[0]), "detail": e[1],
                                        "event_time": u32_at(e, 4, swapped), "motions_before": motions_to_window,
                                    }));
                                }
                            }
                        } else if r[0] == xtest && r[1] == 2 && len >= 28 {
                            records.push(json!({
                                "rec_ms": at, "server_time": time, "what": "XTEST", "client": reply.xid_base,
                                "event": kind(r[4]), "detail": r[5],
                                "x": i16_at(r, 24, swapped), "y": i16_at(r, 26, swapped),
                            }));
                        }
                    }
                }
            }
            records.push(json!({"what": "motions_sent_to_window", "count": motions_to_window}));
            records
        });
        started.recv().expect("RECORD's StartOfData");
        Recorder { ctrl, context, thread }
    }

    /// Everything recorded, once the context is disabled and its data drained.
    pub fn stop(self) -> Vec<Value> {
        self.ctrl
            .record_disable_context(self.context)
            .unwrap()
            .check()
            .unwrap();
        let records = self.thread.join().unwrap();
        let _ = self.ctrl.record_free_context(self.context);
        let _ = self.ctrl.flush();
        records
    }
}
