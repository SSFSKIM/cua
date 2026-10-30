//! The clipboard core against a real X server, with test clients playing the owners and requestors M2's Decisions
//! name: a silent owner, an owner stalling mid-INCR, a requestor stalling INCR acknowledgements, a requestor delaying
//! its `ConvertSelection`, an external takeover, and two engines contending for the lock. Each client is written
//! here, independently of the engine's reader and owner.
//!
//! They need an X display (`--features live`; the engine-linux gate runs them under `xvfb-run`). Never run them on a
//! display a person uses: they take CLIPBOARD.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{JoinHandle, sleep};
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::*;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use super::serving::Atom;
use super::*;

/// One clipboard test at a time: they share the display's CLIPBOARD.
/// Also keeps one connection open for the whole run: Xvfb resets when its last client goes, and a client connecting
/// during the reset is refused.
fn serial() -> MutexGuard<'static, ()> {
    static SERIAL: Mutex<()> = Mutex::new(());
    static KEEPER: std::sync::OnceLock<RustConnection> = std::sync::OnceLock::new();
    let guard = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    KEEPER.get_or_init(|| x11rb::connect(None).unwrap().0);
    guard
}

fn intern(conn: &RustConnection, name: &str) -> Atom {
    conn.intern_atom(false, name.as_bytes()).unwrap().reply().unwrap().atom
}

fn atom_name(conn: &RustConnection, atom: Atom) -> String {
    String::from_utf8_lossy(&conn.get_atom_name(atom).unwrap().reply().unwrap().name).into_owned()
}

fn input_only(conn: &RustConnection, mask: EventMask) -> Window {
    let root = conn.setup().roots[0].root;
    let window = conn.generate_id().unwrap();
    let aux = CreateWindowAux::new().event_mask(mask);
    conn.create_window(0, window, root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)
        .unwrap();
    conn.flush().unwrap();
    window
}

/// The server's time now, read from a property change.
fn server_time(conn: &RustConnection) -> u32 {
    let window = input_only(conn, EventMask::PROPERTY_CHANGE);
    conn.change_property8(PropMode::APPEND, window, AtomEnum::WM_NAME, AtomEnum::STRING, &[])
        .unwrap();
    conn.flush().unwrap();
    loop {
        if let Event::PropertyNotify(e) = conn.wait_for_event().unwrap()
            && e.window == window
        {
            conn.destroy_window(window).unwrap();
            conn.flush().unwrap();
            return e.time;
        }
    }
}

fn clipboard_owner(conn: &RustConnection) -> Window {
    let clipboard = intern(conn, "CLIPBOARD");
    conn.get_selection_owner(clipboard).unwrap().reply().unwrap().owner
}

/// Gives CLIPBOARD up if anyone holds it, so each test starts from an empty clipboard.
fn clear_clipboard() {
    let (conn, _) = x11rb::connect(None).unwrap();
    let clipboard = intern(&conn, "CLIPBOARD");
    conn.set_selection_owner(x11rb::NONE, clipboard, x11rb::CURRENT_TIME)
        .unwrap();
    conn.sync().unwrap();
}

// ---------------------------------------------------------------------------------------------------------------
// A requestor

#[derive(Default, Clone, Copy)]
struct Asking {
    /// The request's timestamp; 0 is `CurrentTime`.
    time: u32,
    /// Stop acknowledging INCR chunks after the first.
    stall_after_first_chunk: bool,
}

/// What a conversion came back with.
#[derive(Debug, PartialEq)]
enum Answer {
    Refused,
    Data {
        kind: String,
        format: u8,
        bytes: Vec<u8>,
        incr: bool,
    },
    /// The owner said nothing within the test's patience.
    Silent,
}

/// A requestor converting CLIPBOARD to `target` on its own connection, reading INCR when offered.
fn convert(target: &str, asking: Asking) -> Answer {
    let (conn, _) = x11rb::connect(None).unwrap();
    let clipboard = intern(&conn, "CLIPBOARD");
    let target = intern(&conn, target);
    let property = intern(&conn, "CUA_TEST_PROPERTY");
    let incr = intern(&conn, "INCR");
    let window = input_only(&conn, EventMask::PROPERTY_CHANGE);
    conn.convert_selection(window, clipboard, target, property, asking.time)
        .unwrap();
    conn.flush().unwrap();
    let patience = Instant::now() + Duration::from_secs(4);
    let notify = loop {
        if Instant::now() > patience {
            return Answer::Silent;
        }
        match conn.poll_for_event().unwrap() {
            Some(Event::SelectionNotify(e)) if e.requestor == window => break e,
            Some(_) => {}
            None => sleep(Duration::from_millis(1)),
        }
    };
    if notify.property == x11rb::NONE {
        return Answer::Refused;
    }
    let reply = conn
        .get_property(true, window, property, AtomEnum::ANY, 0, u32::MAX / 4)
        .unwrap()
        .reply()
        .unwrap();
    if reply.type_ != incr {
        return Answer::Data {
            kind: atom_name(&conn, reply.type_),
            format: reply.format,
            bytes: reply.value,
            incr: false,
        };
    }
    let mut bytes = Vec::new();
    let mut kind = None;
    let mut format = 0;
    let mut chunks = 0;
    loop {
        let event = loop {
            if Instant::now() > patience + Duration::from_secs(6) {
                return Answer::Silent;
            }
            match conn.poll_for_event().unwrap() {
                Some(Event::PropertyNotify(e))
                    if e.window == window && e.atom == property && e.state == Property::NEW_VALUE =>
                {
                    break e;
                }
                Some(_) => {}
                None => sleep(Duration::from_millis(1)),
            }
        };
        let _ = event;
        if asking.stall_after_first_chunk && chunks == 1 {
            // Never delete it: the owner waits for an acknowledgement that does not come.
            sleep(Duration::from_secs(3));
            return Answer::Silent;
        }
        let chunk = conn
            .get_property(true, window, property, AtomEnum::ANY, 0, u32::MAX / 4)
            .unwrap()
            .reply()
            .unwrap();
        chunks += 1;
        if chunk.value.is_empty() {
            return Answer::Data {
                kind: kind.unwrap_or_default(),
                format,
                bytes,
                incr: true,
            };
        }
        kind.get_or_insert_with(|| atom_name(&conn, chunk.type_));
        format = chunk.format;
        bytes.extend_from_slice(&chunk.value);
    }
}

fn text_of(answer: Answer) -> String {
    match answer {
        Answer::Data { bytes, .. } => String::from_utf8(bytes).unwrap(),
        other => panic!("expected data, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------------------------------------------
// An owner

#[derive(Clone)]
enum Behaviour {
    /// Owns CLIPBOARD and never answers.
    Silent,
    /// Serves these targets, INCR above 64 KiB.
    Serve(Vec<(&'static str, Vec<u8>)>),
    /// Serves `UTF8_STRING` by INCR and stops after the first chunk.
    StallIncr(Vec<u8>),
}

struct TestOwner {
    window: Window,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl TestOwner {
    fn start(behaviour: Behaviour) -> TestOwner {
        let (conn, _) = x11rb::connect(None).unwrap();
        let window = input_only(&conn, EventMask::NO_EVENT);
        let clipboard = intern(&conn, "CLIPBOARD");
        let targets = intern(&conn, "TARGETS");
        let incr = intern(&conn, "INCR");
        let served: Vec<(Atom, Vec<u8>)> = match &behaviour {
            Behaviour::Serve(list) => list.iter().map(|(n, b)| (intern(&conn, n), b.clone())).collect(),
            Behaviour::StallIncr(bytes) => vec![(intern(&conn, "UTF8_STRING"), bytes.clone())],
            Behaviour::Silent => vec![],
        };
        conn.set_selection_owner(window, clipboard, x11rb::CURRENT_TIME)
            .unwrap();
        assert_eq!(
            conn.get_selection_owner(clipboard).unwrap().reply().unwrap().owner,
            window
        );
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let thread = std::thread::spawn(move || {
            // (requestor, property, data, offset, chunks sent)
            let mut transfers: Vec<(Window, Atom, Atom, Vec<u8>, usize, usize)> = Vec::new();
            while !stopping.load(Ordering::SeqCst) {
                let Some(event) = conn.poll_for_event().unwrap() else {
                    sleep(Duration::from_millis(1));
                    continue;
                };
                match event {
                    Event::SelectionRequest(e) => {
                        if matches!(behaviour, Behaviour::Silent) {
                            continue;
                        }
                        let notify = |property| {
                            let ev = SelectionNotifyEvent {
                                response_type: SELECTION_NOTIFY_EVENT,
                                sequence: 0,
                                time: e.time,
                                requestor: e.requestor,
                                selection: e.selection,
                                target: e.target,
                                property,
                            };
                            conn.send_event(false, e.requestor, EventMask::NO_EVENT, ev).unwrap();
                            conn.flush().unwrap();
                        };
                        if e.target == targets {
                            let mut list = vec![targets];
                            list.extend(served.iter().map(|(a, _)| *a));
                            conn.change_property32(PropMode::REPLACE, e.requestor, e.property, AtomEnum::ATOM, &list)
                                .unwrap();
                            notify(e.property);
                        } else if let Some((target, data)) = served.iter().find(|(a, _)| *a == e.target) {
                            let incremental = data.len() > 65_536 || matches!(behaviour, Behaviour::StallIncr(_));
                            if incremental {
                                let aux = ChangeWindowAttributesAux::new().event_mask(EventMask::PROPERTY_CHANGE);
                                conn.change_window_attributes(e.requestor, &aux).unwrap();
                                conn.change_property32(
                                    PropMode::REPLACE,
                                    e.requestor,
                                    e.property,
                                    incr,
                                    &[data.len() as u32],
                                )
                                .unwrap();
                                transfers.push((e.requestor, e.property, *target, data.clone(), 0, 0));
                            } else {
                                conn.change_property8(PropMode::REPLACE, e.requestor, e.property, *target, data)
                                    .unwrap();
                            }
                            notify(e.property);
                        } else {
                            notify(x11rb::NONE);
                        }
                    }
                    Event::PropertyNotify(e) if e.state == Property::DELETE => {
                        let Some(i) = transfers.iter().position(|t| t.0 == e.window && t.1 == e.atom) else {
                            continue;
                        };
                        let (requestor, property, kind, data, offset, chunks) = &mut transfers[i];
                        if matches!(behaviour, Behaviour::StallIncr(_)) && *chunks == 1 {
                            continue;
                        }
                        let end = (*offset + 4096).min(data.len());
                        conn.change_property8(PropMode::REPLACE, *requestor, *property, *kind, &data[*offset..end])
                            .unwrap();
                        conn.flush().unwrap();
                        *chunks += 1;
                        if *offset == end {
                            transfers.remove(i);
                        } else {
                            *offset = end;
                        }
                    }
                    _ => {}
                }
            }
        });
        TestOwner {
            window,
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for TestOwner {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn clipboard() -> Clipboard {
    Clipboard::connect().unwrap()
}

fn text(c: &Clipboard, s: &str) -> Payload {
    Payload::text(s, &c.text_atoms())
}

// ---------------------------------------------------------------------------------------------------------------
// The owner

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn the_owner_serves_text_in_every_format_and_targets() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let paste = c.take(text(&c, "cua171 안녕 e\u{301} 🙂"), Payload::default()).unwrap();
    assert!(c.owns());
    for target in ["UTF8_STRING", "text/plain", "text/plain;charset=utf-8"] {
        match convert(target, Asking::default()) {
            Answer::Data {
                kind,
                format,
                bytes,
                incr,
            } => {
                assert_eq!((kind.as_str(), format, incr), (target, 8, false));
                assert_eq!(String::from_utf8(bytes).unwrap(), "cua171 안녕 e\u{301} 🙂");
            }
            other => panic!("{target}: {other:?}"),
        }
    }
    assert_eq!(convert("STRING", Asking::default()), Answer::Refused, "not Latin-1");
    assert_eq!(convert("MULTIPLE", Asking::default()), Answer::Refused);
    let (conn, _) = x11rb::connect(None).unwrap();
    match convert("TARGETS", Asking::default()) {
        Answer::Data {
            kind, format, bytes, ..
        } => {
            assert_eq!((kind.as_str(), format), ("ATOM", 32));
            let names: Vec<String> = bytes
                .chunks(4)
                .map(|b| atom_name(&conn, u32::from_ne_bytes(b.try_into().unwrap())))
                .collect();
            assert_eq!(
                names,
                ["TARGETS", "UTF8_STRING", "text/plain", "text/plain;charset=utf-8"]
            );
        }
        other => panic!("{other:?}"),
    }
    let watch = paste.watch();
    assert_eq!(
        (watch.requests, watch.served),
        (6, 3),
        "TARGETS and refusals are not served: {watch:?}"
    );
    paste.confirmed();
    let later = c.take(text(&c, "café"), Payload::default()).unwrap();
    match convert("STRING", Asking::default()) {
        Answer::Data { kind, bytes, .. } => assert_eq!((kind.as_str(), bytes.as_slice()), ("STRING", &b"caf\xe9"[..])),
        other => panic!("{other:?}"),
    }
    later.confirmed();
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn the_owner_serves_a_large_payload_through_incr() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let big: String = (0..300_000).map(|i| char::from(b'a' + (i % 26) as u8)).collect();
    let paste = c.take(text(&c, &big), Payload::default()).unwrap();
    match convert("UTF8_STRING", Asking::default()) {
        Answer::Data {
            kind,
            format,
            bytes,
            incr,
        } => {
            assert!(incr, "300 kB goes by INCR");
            assert_eq!((kind.as_str(), format), ("UTF8_STRING", 8));
            assert!(bytes == big.as_bytes(), "the bytes arrive whole and in order");
        }
        other => panic!("{other:?}"),
    }
    // The transfer ends when the owner sees the zero-length chunk taken, just after the requestor has its bytes.
    let deadline = Instant::now() + Duration::from_secs(1);
    while paste.watch().served == 0 && Instant::now() < deadline {
        sleep(Duration::from_millis(5));
    }
    let watch = paste.watch();
    assert_eq!((watch.served, watch.active, watch.stalled), (1, 0, 0), "{watch:?}");
    paste.confirmed();
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_requestor_that_stops_acknowledging_incr_chunks_is_dropped_within_the_bounds() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let big = "x".repeat(200_000);
    let paste = c.take(text(&c, &big), Payload::default()).unwrap();
    let started = Instant::now();
    let stalled = std::thread::spawn(|| {
        convert(
            "UTF8_STRING",
            Asking {
                stall_after_first_chunk: true,
                ..Default::default()
            },
        )
    });
    let mut dropped_at = None;
    while started.elapsed() < Duration::from_secs(4) {
        let watch = paste.watch();
        if watch.stalled == 1 && watch.active == 0 {
            dropped_at = Some(started.elapsed());
            break;
        }
        sleep(Duration::from_millis(20));
    }
    let dropped_at = dropped_at.unwrap_or_else(|| panic!("never dropped: {:?}", paste.watch()));
    assert!(
        dropped_at >= Duration::from_millis(1_900) && dropped_at < Duration::from_millis(3_000),
        "dropped {dropped_at:?} after the conversion, at the 2 s bound"
    );
    assert_eq!(stalled.join().unwrap(), Answer::Silent);
    assert_eq!(
        text_of(convert("UTF8_STRING", Asking::default())),
        big,
        "the owner still serves the next requestor"
    );
    paste.confirmed();
}

// ---------------------------------------------------------------------------------------------------------------
// Serving generations and the cleanup

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_late_conversion_never_receives_the_restored_snapshot_as_the_paste() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let (conn, _) = x11rb::connect(None).unwrap();
    let restore = text(&c, "the person's clipboard");
    let paste = c.take(text(&c, "the pasted text"), restore).unwrap();
    let ctrl_v = server_time(&conn);
    paste.dispatched(ctrl_v);
    // The requestor delays its ConvertSelection past the 500 ms start bound; the paste ends unconfirmed meanwhile.
    sleep(Duration::from_millis(600));
    assert_eq!(paste.watch().requests, 0);
    drop(paste);
    let at_paste = |time| {
        convert(
            "UTF8_STRING",
            Asking {
                time,
                ..Default::default()
            },
        )
    };
    assert_eq!(at_paste(ctrl_v), Answer::Refused, "the paste's own timestamp");
    assert_eq!(at_paste(ctrl_v.wrapping_sub(1)), Answer::Refused, "from ownership on");
    assert_eq!(
        at_paste(0),
        Answer::Refused,
        "CurrentTime within 10 s of an unconfirmed paste"
    );
    let later = server_time(&conn);
    assert_eq!(
        text_of(at_paste(later)),
        "the person's clipboard",
        "a later request gets the snapshot"
    );
    assert!(c.owns(), "the engine keeps serving the snapshot");
}

/// The refusal holds whatever is served next, a later paste's text included: a late `CurrentTime` conversion of
/// the unconfirmed paste must not receive the next paste's text either. Chrome converts with `CurrentTime`, so for
/// 10 s after an unconfirmed paste it receives nothing (Decision, M2.1).
#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn an_unconfirmed_paste_s_current_time_refusal_covers_the_next_paste_too() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let (conn, _) = x11rb::connect(None).unwrap();
    drop(c.take(text(&c, "first"), text(&c, "before")).unwrap());
    let next = c.take(text(&c, "second"), text(&c, "before")).unwrap();
    assert_eq!(convert("UTF8_STRING", Asking::default()), Answer::Refused);
    let ctrl_v = server_time(&conn);
    next.dispatched(ctrl_v);
    assert_eq!(
        text_of(convert(
            "UTF8_STRING",
            Asking {
                time: ctrl_v,
                ..Default::default()
            }
        )),
        "second",
        "a requestor stamping the Ctrl+V's time is served"
    );
    next.confirmed();
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn after_a_confirmed_paste_current_time_gets_the_snapshot() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let paste = c.take(text(&c, "pasted"), text(&c, "before")).unwrap();
    assert_eq!(text_of(convert("UTF8_STRING", Asking::default())), "pasted");
    paste.confirmed();
    assert_eq!(text_of(convert("UTF8_STRING", Asking::default())), "before");
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn the_cleanup_leaves_a_newer_owner_alone() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let paste = c.take(text(&c, "pasted"), text(&c, "before")).unwrap();
    let external = TestOwner::start(Behaviour::Serve(vec![("UTF8_STRING", b"someone else's".to_vec())]));
    let deadline = Instant::now() + Duration::from_secs(1);
    while !paste.lost() && Instant::now() < deadline {
        sleep(Duration::from_millis(5));
    }
    assert!(paste.lost(), "SelectionClear reached the owner");
    drop(paste);
    let (conn, _) = x11rb::connect(None).unwrap();
    assert_eq!(clipboard_owner(&conn), external.window, "never taken back");
    assert!(!c.owns());
    assert_eq!(text_of(convert("UTF8_STRING", Asking::default())), "someone else's");
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn an_empty_prior_clipboard_is_restored_as_an_owner_with_no_formats() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let lock = c.lock().unwrap();
    let before = c.snapshot().unwrap();
    assert!(before.is_empty(), "no owner: an empty snapshot");
    let paste = c.take(text(&c, "pasted"), before).unwrap();
    paste.confirmed();
    drop(lock);
    assert_eq!(convert("UTF8_STRING", Asking::default()), Answer::Refused);
    let (conn, _) = x11rb::connect(None).unwrap();
    match convert("TARGETS", Asking::default()) {
        Answer::Data { bytes, .. } => assert_eq!(
            bytes
                .chunks(4)
                .map(|b| atom_name(&conn, u32::from_ne_bytes(b.try_into().unwrap())))
                .collect::<Vec<_>>(),
            ["TARGETS"]
        ),
        other => panic!("{other:?}"),
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The snapshot and its bounds

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_snapshot_captures_every_format_another_owner_offers_incr_included() {
    let _serial = serial();
    clear_clipboard();
    let big: Vec<u8> = (0..200_000u32).map(|i| (i % 251) as u8).collect();
    let _owner = TestOwner::start(Behaviour::Serve(vec![
        ("UTF8_STRING", "plain 🙂".as_bytes().to_vec()),
        ("image/x-test", big.clone()),
        ("TIMESTAMP", vec![1, 2, 3, 4]),
    ]));
    let mut c = clipboard();
    let lock = c.lock().unwrap();
    let snapshot = c.snapshot().unwrap();
    drop(lock);
    let (conn, _) = x11rb::connect(None).unwrap();
    let names: Vec<String> = snapshot.formats.iter().map(|f| atom_name(&conn, f.target)).collect();
    let mut expected = vec!["UTF8_STRING".to_string(), "image/x-test".to_string()];
    expected.sort_by_key(|n| intern(&conn, n));
    assert_eq!(names, expected, "TIMESTAMP skipped by name; ascending atom order");
    let image = snapshot.get(intern(&conn, "image/x-test")).unwrap();
    assert!(&*image.data == big.as_slice(), "the INCR format arrives whole");
    assert_eq!(
        &*snapshot.get(intern(&conn, "UTF8_STRING")).unwrap().data,
        "plain 🙂".as_bytes()
    );
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_silent_owner_ends_the_snapshot_at_its_bound_and_the_locks_are_released() {
    let _serial = serial();
    clear_clipboard();
    let _owner = TestOwner::start(Behaviour::Silent);
    let mut c = clipboard();
    let lock = c.lock().unwrap();
    let started = Instant::now();
    let error = c.snapshot().unwrap_err().to_string();
    let took = started.elapsed();
    drop(lock);
    assert_eq!(
        error,
        "clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms"
    );
    assert!(
        took >= Duration::from_millis(500) && took < Duration::from_millis(900),
        "{took:?}"
    );
    let mut other = clipboard();
    let started = Instant::now();
    drop(other.lock_within(Duration::from_millis(100)).unwrap());
    assert!(
        started.elapsed() < Duration::from_millis(50),
        "both locks were free again"
    );
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn an_owner_stalling_mid_incr_ends_the_snapshot_at_the_chunk_bound() {
    let _serial = serial();
    clear_clipboard();
    let _owner = TestOwner::start(Behaviour::StallIncr(vec![b'y'; 100_000]));
    let mut c = clipboard();
    let lock = c.lock().unwrap();
    let started = Instant::now();
    let error = c.snapshot().unwrap_err().to_string();
    let took = started.elapsed();
    drop(lock);
    assert_eq!(
        error,
        "clipboard capture timed out: the clipboard owner sent no INCR chunk of UTF8_STRING for 2 s"
    );
    assert!(
        took >= Duration::from_secs(2) && took < Duration::from_millis(2_600),
        "{took:?}"
    );
    drop(clipboard().lock_within(Duration::from_millis(100)).unwrap());
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn the_engine_s_own_clipboard_is_snapshotted_as_it_serves_it() {
    let _serial = serial();
    clear_clipboard();
    let mut c = clipboard();
    let restored = text(&c, "restored");
    let paste = c.take(text(&c, "ours"), restored.clone()).unwrap();
    paste.confirmed();
    assert_eq!(c.snapshot().unwrap(), restored);
}

// ---------------------------------------------------------------------------------------------------------------
// The lock

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_held_lock_makes_the_next_engine_wait_then_refuse_with_clipboard_busy() {
    let _serial = serial();
    let mut first = clipboard();
    let mut second = clipboard();
    let held = first.lock().unwrap();
    let started = Instant::now();
    let error = second.lock_within(Duration::from_millis(200)).unwrap_err().to_string();
    assert_eq!(error, "clipboard busy");
    assert!(
        started.elapsed() >= Duration::from_millis(200),
        "{:?}",
        started.elapsed()
    );
    drop(held);
    drop(second.lock_within(Duration::from_millis(100)).unwrap());
}

#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn a_vendor_holding_its_lock_keeps_cua_out_and_cua_s_own_lock_is_given_back() {
    let _serial = serial();
    let (vendor, _) = x11rb::connect(None).unwrap();
    let sky = intern(&vendor, "SKY_CLIPBOARD_LOCK");
    let cua = intern(&vendor, "CUA_CLIPBOARD_LOCK");
    let window = input_only(&vendor, EventMask::NO_EVENT);
    vendor.set_selection_owner(window, sky, x11rb::CURRENT_TIME).unwrap();
    vendor.sync().unwrap();
    let mut c = clipboard();
    assert_eq!(
        c.lock_within(Duration::from_millis(100)).unwrap_err().to_string(),
        "clipboard busy"
    );
    assert_eq!(
        vendor.get_selection_owner(cua).unwrap().reply().unwrap().owner,
        x11rb::NONE,
        "CUA_CLIPBOARD_LOCK released when SKY_CLIPBOARD_LOCK could not be had"
    );
    vendor
        .set_selection_owner(x11rb::NONE, sky, x11rb::CURRENT_TIME)
        .unwrap();
    vendor.sync().unwrap();
    let lock = c.lock_within(Duration::from_millis(100)).unwrap();
    assert_eq!(
        vendor.get_selection_owner(sky).unwrap().reply().unwrap().owner,
        c.lock_window()
    );
    assert_eq!(
        vendor.get_selection_owner(cua).unwrap().reply().unwrap().owner,
        c.lock_window()
    );
    drop(lock);
    assert_eq!(
        vendor.get_selection_owner(sky).unwrap().reply().unwrap().owner,
        x11rb::NONE
    );
    assert_eq!(
        vendor.get_selection_owner(cua).unwrap().reply().unwrap().owner,
        x11rb::NONE
    );
}

/// Two engines paste distinct markers under the lock in a tight loop while a third grabs and drops the lock with no
/// hold at all: never two holders, and each engine's requestor always reads its own marker.
#[test]
#[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
fn engines_contending_for_the_lock_never_hold_it_together_nor_cross_deliver() {
    let _serial = serial();
    clear_clipboard();
    let holders = Arc::new(AtomicUsize::new(0));
    let done = Arc::new(AtomicBool::new(false));
    let pasters: Vec<_> = ["marker-A", "marker-B"]
        .into_iter()
        .map(|marker| {
            let holders = holders.clone();
            std::thread::spawn(move || {
                let mut c = clipboard();
                for round in 0..40 {
                    let lock = c.lock().unwrap();
                    assert_eq!(holders.fetch_add(1, Ordering::SeqCst), 0, "two holders at once");
                    let restore = c.snapshot().unwrap();
                    let mine = format!("{marker}-{round}");
                    let paste = c.take(Payload::text(&mine, &c.text_atoms()), restore).unwrap();
                    assert_eq!(text_of(convert("UTF8_STRING", Asking::default())), mine);
                    paste.confirmed();
                    holders.fetch_sub(1, Ordering::SeqCst);
                    drop(lock);
                }
            })
        })
        .collect();
    let grabber = {
        let (holders, done) = (holders.clone(), done.clone());
        std::thread::spawn(move || {
            let mut c = clipboard();
            let mut taken = 0;
            while !done.load(Ordering::SeqCst) {
                let lock = c.lock().unwrap();
                assert_eq!(holders.fetch_add(1, Ordering::SeqCst), 0, "two holders at once");
                holders.fetch_sub(1, Ordering::SeqCst);
                drop(lock);
                taken += 1;
            }
            taken
        })
    };
    for paster in pasters {
        paster.join().unwrap();
    }
    done.store(true, Ordering::SeqCst);
    assert!(grabber.join().unwrap() > 0, "the grabber got the lock in between");
}
