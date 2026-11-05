//! A background press to a Qt window waits for Qt to take the session's synthetic focus (M4, task 61; `src/focus_ack.rs`),
//! live: the engine binary over its wire against a Qt window whose main thread is kept late on purpose
//! (`tests/support/qt-late.py`, Qt 5 and Qt 6), on a display with no window manager, where Qt's activation request is
//! its own `SetInputFocus`. A window of the test's own holds the X input focus; after each background click it must
//! still hold it, and the click must have reached the editor. With the wait off (`--focus-ack-ms 0`, the engine before
//! it) the same clicks take the focus: the late window reproduces what twice the gate's load did to kate and qtcreator.
//!
//! They need python3 with PyQt5 and PyQt6 and the session's accessibility bus; without PyQt each says so on stderr and
//! passes, as the identity fixture's tests do without python3-gi (the engine-linux gate's runner has neither).
//!
//!   xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1

#![cfg(feature = "live")]

mod support;

use serde_json::{Value, json};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};
use support::Engine;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt as _, CreateWindowAux, InputFocus, Window, WindowClass};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/support/qt-late.py");
/// The fixture's main thread blocked this long in every `EVERY`: late most of the time, as a loaded one is.
const BLOCK_MS: u32 = 35;
const EVERY_MS: u32 = 40;
/// Clicks per lane: the control takes the focus in most of them.
const CLICKS: usize = 10;
/// Between clicks: past Qt's 100 ms focusInTimer and a blocked turn, so each click starts with no focus window in Qt.
const BETWEEN: Duration = Duration::from_millis(400);
const PATIENCE: Duration = Duration::from_secs(30);
/// The wait's bound these tests set (`--focus-ack-ms`): the late window answers the bus only between its blocked turns,
/// later than kate and qtcreator did at twice the load (the shipped bound, 25 ms, is that measurement's), so the tests
/// prove what the wait waits for, not its bound; the bound's own refusal has a test of its own.
const LATE_BOUND: &str = "200";

type Log = Arc<Mutex<Vec<Value>>>;

/// The late Qt window, killed on drop.
struct Late {
    child: Child,
    log: Log,
    window: u32,
    /// Its modal dialog, in the `modal` mode.
    dialog: Option<u32>,
}

impl Drop for Late {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Late {
    /// The editor's presses so far.
    fn presses(&self) -> usize {
        self.log.lock().unwrap().iter().filter(|r| r["press"].is_u64()).count()
    }
}

/// The fixture on `binding` (`qt5`, `qt6`), its window mapped and its tree on the bus; None, said on stderr, without
/// that PyQt.
fn late(binding: &str, engine: &mut Engine) -> Option<Late> {
    late_as(binding, engine, BLOCK_MS, None, true)
}

/// [`late`], its main thread blocked `block` ms in every `EVERY_MS`, in a fixture mode (`native`, `modal`), and with its
/// accessibility on or off. Off, it starts with no way to reach an accessibility bus (no session bus, and the root
/// window's `AT_SPI_BUS` taken away while it starts, then put back for the engine), so it never registers a tree: a Qt
/// window the engine can find only by its process's map.
fn late_as(binding: &str, engine: &mut Engine, block: u32, mode: Option<&str>, accessible: bool) -> Option<Late> {
    let module = if binding == "qt5" {
        "PyQt5.QtWidgets"
    } else {
        "PyQt6.QtWidgets"
    };
    let present = Command::new("python3")
        .args(["-c", &format!("import {module}")])
        .stderr(Stdio::null())
        .status();
    if !present.is_ok_and(|s| s.success()) {
        eprintln!("skipped: python3 with {module} is not installed");
        return None;
    }
    let title = format!("cua-engine-qt-late-{binding}-{}", std::process::id());
    let mut command = Command::new("python3");
    command.args([FIXTURE, &title, binding, &block.to_string(), &EVERY_MS.to_string()]);
    command.args(mode);
    let hidden = if accessible {
        command
            .env("QT_LINUX_ACCESSIBILITY_ALWAYS_ON", "1")
            .env("QT_ACCESSIBILITY", "1");
        None
    } else {
        command
            .env("DBUS_SESSION_BUS_ADDRESS", "unix:path=/nonexistent/cua-engine-test-bus")
            .env_remove("AT_SPI_BUS_ADDRESS")
            .env_remove("QT_LINUX_ACCESSIBILITY_ALWAYS_ON");
        Some(RootBusProperty::hide())
    };
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("python3");
    let log: Log = Arc::default();
    let into = log.clone();
    let stdout = child.stdout.take().expect("piped");
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(record) = serde_json::from_str::<Value>(&line) {
                into.lock().unwrap().push(record);
            }
        }
    });
    let deadline = Instant::now() + PATIENCE;
    let window = loop {
        if let Some(xid) = log.lock().unwrap().iter().find_map(|r| r["xid"].as_u64()) {
            break xid as u32;
        }
        assert!(Instant::now() < deadline, "the Qt window is shown");
        sleep(Duration::from_millis(50));
    };
    let dialog = (mode == Some("modal")).then(|| {
        loop {
            if let Some(xid) = log.lock().unwrap().iter().find_map(|r| r["dialog"].as_u64()) {
                break xid as u32;
            }
            assert!(Instant::now() < deadline, "the Qt window's modal dialog is shown");
            sleep(Duration::from_millis(50));
        }
    });
    let late = Late {
        child,
        log,
        window,
        dialog,
    };
    let source = |engine: &mut Engine| {
        engine
            .request(
                "get_window_state",
                json!({"window": {"id": window}, "include_screenshot": false}),
            )
            .map(|s| s["ax_tree_source"].clone())
    };
    if let Some(hidden) = hidden {
        // past Qt's start, where its bridge looks for the bus once
        sleep(Duration::from_secs(2));
        drop(hidden);
        let found = source(engine);
        assert_eq!(
            found,
            Ok(json!("x11")),
            "{binding}: the window is read as an X11 tree: its process has no tree on the bus"
        );
        return Some(late);
    }
    // its frame on the bus: the engine reads the window's tree from AT-SPI
    loop {
        if source(engine).is_ok_and(|s| s == json!("at_spi")) {
            break;
        }
        assert!(Instant::now() < deadline, "the Qt window's tree is on the bus");
        sleep(Duration::from_millis(200));
    }
    Some(late)
}

/// The root window's `AT_SPI_BUS` (the accessibility bus's address, which Qt's bridge reads first) taken away until
/// dropped, then put back as it was.
struct RootBusProperty {
    conn: RustConnection,
    root: Window,
    atom: u32,
    saved: Option<(u32, u8, Vec<u8>)>,
}

impl RootBusProperty {
    fn hide() -> RootBusProperty {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let root = conn.setup().roots[screen].root;
        let atom = conn.intern_atom(false, b"AT_SPI_BUS").unwrap().reply().unwrap().atom;
        let reply = conn
            .get_property(false, root, atom, x11rb::protocol::xproto::AtomEnum::ANY, 0, 4096)
            .unwrap()
            .reply()
            .unwrap();
        let saved = (reply.type_ != x11rb::NONE).then(|| (reply.type_, reply.format, reply.value.clone()));
        conn.delete_property(root, atom).unwrap();
        conn.sync().unwrap();
        RootBusProperty {
            conn,
            root,
            atom,
            saved,
        }
    }
}

impl Drop for RootBusProperty {
    fn drop(&mut self) {
        if let Some((type_, format, value)) = &self.saved {
            let len = value.len() as u32 / (u32::from(*format) / 8).max(1);
            let _ = self.conn.change_property(
                x11rb::protocol::xproto::PropMode::REPLACE,
                self.root,
                self.atom,
                *type_,
                *format,
                len,
                value,
            );
            let _ = self.conn.sync();
        }
    }
}

/// A window of the test's own, mapped, that holds the X input focus between clicks: the person's front window.
struct Front {
    conn: RustConnection,
    window: Window,
}

impl Front {
    fn open() -> Front {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let root = conn.setup().roots[screen].root;
        let window = conn.generate_id().unwrap();
        conn.create_window(
            0,
            window,
            root,
            600,
            400,
            100,
            100,
            0,
            WindowClass::INPUT_OUTPUT,
            0,
            &CreateWindowAux::new(),
        )
        .unwrap();
        conn.map_window(window).unwrap();
        conn.sync().unwrap();
        let front = Front { conn, window };
        front.focus();
        front
    }

    fn focus(&self) {
        self.conn
            .set_input_focus(InputFocus::PARENT, self.window, x11rb::CURRENT_TIME)
            .unwrap();
        self.conn.sync().unwrap();
    }

    fn holds_focus(&self) -> bool {
        self.focused() == self.window
    }

    /// The window holding the X input focus now.
    fn focused(&self) -> Window {
        self.conn.get_input_focus().unwrap().reply().unwrap().focus
    }

    /// The X input focus given to another window, as the person clicking into it would.
    fn give(&self, window: Window) {
        self.conn
            .set_input_focus(InputFocus::PARENT, window, x11rb::CURRENT_TIME)
            .unwrap();
        self.conn.sync().unwrap();
    }
}

/// `CLICKS` background clicks into the late window's editor, each after the front window took the focus back: how many
/// took the X focus from it, the answers, and how many presses reached the editor.
fn clicks(engine: &mut Engine, late: &Late, front: &Front, requests: &[(&str, Value)]) -> (usize, Vec<Value>, usize) {
    let before = late.presses();
    let mut taken = 0;
    let mut answers = Vec::new();
    for _ in 0..CLICKS {
        front.focus();
        sleep(BETWEEN);
        engine.pipeline(requests);
        answers.extend(engine.answers(requests.len()).into_iter().map(|(a, _)| a));
        // Qt asks for the activation when its main thread handles the press, a blocked turn after the answer at most
        sleep(Duration::from_millis(200));
        if !front.holds_focus() {
            taken += 1;
        }
    }
    sleep(Duration::from_millis(300));
    (taken, answers, late.presses() - before)
}

fn click(window: u32) -> (&'static str, Value) {
    ("click", json!({"window": {"id": window}, "x": 40, "y": 12}))
}

#[test]
fn a_background_click_to_a_late_qt_window_waits_for_its_focus_and_leaves_the_x_focus_where_it_was() {
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", LATE_BOUND]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        assert!(
            answers.iter().all(|a| a["ok"] == json!(true)),
            "{binding}: every click answered: {answers:?}"
        );
        assert_eq!(taken, 0, "{binding}: no click took the X focus from the front window");
        assert_eq!(presses, CLICKS, "{binding}: every press reached the editor");
    }
}

#[test]
fn with_no_focus_wait_the_late_qt_window_takes_the_x_focus_on_a_background_click() {
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", "0"]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let (taken, _, _) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        assert!(
            taken > 0,
            "{binding}: the control: with no wait, a click takes the focus ({taken} of {CLICKS})"
        );
    }
}

#[test]
fn a_click_right_after_a_key_to_a_late_qt_window_leaves_the_x_focus_where_it_was() {
    // the click's session opens while Qt still counts the key's FocusOut down: the wait first sees that focus let go
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", LATE_BOUND]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let key = ("press_key", json!({"window": {"id": late.window}, "key": "shift"}));
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[key, click(late.window)]);
        assert!(
            answers.iter().all(|a| a["ok"] == json!(true)),
            "{binding}: every request answered: {answers:?}"
        );
        assert_eq!(taken, 0, "{binding}: no click took the X focus from the front window");
        assert_eq!(presses, CLICKS, "{binding}: every press reached the editor");
    }
}

#[test]
fn a_background_drag_to_a_late_qt_window_leaves_the_x_focus_where_it_was() {
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", LATE_BOUND]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let drag = (
            "drag",
            json!({"window": {"id": late.window}, "path": [{"x": 10, "y": 12}, {"x": 60, "y": 12}]}),
        );
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[drag]);
        assert!(
            answers.iter().all(|a| a["ok"] == json!(true)),
            "{binding}: every drag answered: {answers:?}"
        );
        assert_eq!(taken, 0, "{binding}: no drag took the X focus from the front window");
        assert_eq!(presses, CLICKS, "{binding}: every drag's press reached the editor");
    }
}

#[test]
fn at_a_bound_shorter_than_qt_s_turn_a_press_is_refused_with_nothing_sent_or_sent_with_the_focus_taken() {
    // a 1 ms bound: whether a click sees the focus taken in time depends on when Qt answers the bus (the first read
    // waits for Qt's main thread), so either outcome may come; each must leave the X focus where it was, and a refused
    // click must press nothing (the bound's expiry itself: `focus_ack.rs`'s unit tests)
    for binding in ["qt5"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", "1"]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        let refused: Vec<&Value> = answers.iter().filter(|a| a["ok"] != json!(true)).collect();
        eprintln!(
            "{binding}: {} of {CLICKS} clicks refused at a 1 ms bound",
            refused.len()
        );
        for answer in &refused {
            let error = answer["error"].as_str().unwrap_or("");
            assert!(
                error.ends_with(
                    "did not take the background focus within 1 ms, so a press could have activated its window; \
                     nothing was sent, so it is safe to retry"
                ),
                "{error}"
            );
        }
        assert_eq!(taken, 0, "no click took the X focus, refused or sent");
        assert_eq!(presses, CLICKS - refused.len(), "a refused click pressed nothing");
    }
}

#[test]
fn in_dedicated_mode_a_background_click_is_as_before_and_waits_for_nothing() {
    // the wait is shared mode's: a dedicated desktop is the agent's, and its route is unchanged
    for binding in ["qt5"] {
        let mut engine = Engine::start_with(&["--desktop", "dedicated"]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, _) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        assert!(answers.iter().all(|a| a["ok"] == json!(true)), "{answers:?}");
        assert!(
            taken > 0,
            "dedicated mode is the engine before the wait: {taken} of {CLICKS}"
        );
    }
}

fn key(window: u32) -> (&'static str, Value) {
    ("press_key", json!({"window": {"id": window}, "key": "a"}))
}

#[test]
fn a_background_press_onto_a_native_child_of_a_qt_window_is_refused_with_nothing_sent() {
    // the review's reproducer (task 61's review, P1): the editor's viewport is a native child window, which is never
    // Qt's focus window, so Qt asks to focus it on every press however long the top-level's focus was waited for; the
    // engine before the fix waited, answered success and lost the X focus. The control: the same window with the
    // gate off takes the X focus.
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&[]);
        let Some(late) = late_as(binding, &mut engine, 0, Some("native"), true) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        assert_eq!(
            taken, 0,
            "{binding}: no click took the X focus from the front window: {answers:?}"
        );
        for answer in &answers {
            let error = answer["error"].as_str().unwrap_or("");
            assert!(
                error.contains("gives a native child window of its own the input focus on a press at that point")
                    && error.ends_with("nothing was sent, so it is safe to retry"),
                "{binding}: refused, nothing sent: {answer}"
            );
        }
        assert_eq!(presses, 0, "{binding}: a refused click pressed nothing");
        let mut control = Engine::start_with(&["--focus-ack-ms", "0"]);
        let (taken, answers, _) = clicks(&mut control, &late, &front, &[click(late.window)]);
        assert!(answers.iter().all(|a| a["ok"] == json!(true)), "{binding}: {answers:?}");
        assert!(
            taken > 0,
            "{binding}: the control: a press onto the native child takes the focus ({taken} of {CLICKS})"
        );
    }
}

#[test]
fn a_click_on_a_held_session_the_real_focus_has_left_takes_a_fresh_focus_first() {
    // the review's sequence (task 61's review, P1): the Qt window holds the real focus, so key_down("shift") opens a
    // session that synthesizes no FocusIn; the hold keeps that session while the person focuses another window; a
    // background click then reuses it. Before the fix it skipped the wait on that stale snapshot and took the X focus.
    const RUNS: usize = 5;
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", LATE_BOUND]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let shift = json!({"window": {"id": late.window}, "key": "shift"});
        let before = late.presses();
        let mut taken = 0;
        for _ in 0..RUNS {
            front.give(late.window);
            sleep(BETWEEN);
            engine.request("key_down", shift.clone()).expect("key_down");
            front.focus();
            sleep(BETWEEN);
            let answer = engine.request("click", click(late.window).1);
            sleep(Duration::from_millis(200));
            if !front.holds_focus() {
                taken += 1;
            }
            engine.request("key_up", shift.clone()).expect("key_up");
            assert!(answer.is_ok(), "{binding}: the click answered: {answer:?}");
        }
        sleep(Duration::from_millis(300));
        assert_eq!(taken, 0, "{binding}: no click took the X focus from the front window");
        assert_eq!(
            late.presses() - before,
            RUNS,
            "{binding}: every press reached the editor"
        );
    }
}

#[test]
fn background_input_to_a_qt_window_its_modal_dialog_blocks_is_refused_in_shared_mode() {
    // the design session's ruling A: Qt hands a synthetic FocusIn on a window its modal dialog blocks to the dialog,
    // which takes the X focus (with no window manager, Qt's own SetInputFocus), for keys as for clicks; the engine
    // before the fix sent them. Input to the dialog itself goes; dedicated mode is unchanged, and there the same key
    // hands the focus to the dialog (the control).
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&[]);
        let Some(late) = late_as(binding, &mut engine, 0, Some("modal"), true) else {
            continue;
        };
        let dialog = late.dialog.expect("the modal mode's dialog");
        let front = Front::open();
        let sentence = format!(
            "window {} is blocked by its modal dialog, window {dialog}, which takes the desktop's focus on background \
             input to the window; nothing was sent: send the input to the dialog, or use a dedicated desktop",
            late.window
        );
        let before = late.presses();
        for (command, input) in [key(late.window), click(late.window)] {
            for _ in 0..3 {
                front.focus();
                sleep(BETWEEN);
                let answer = engine.request(command, input.clone());
                sleep(Duration::from_millis(300));
                assert!(
                    front.holds_focus(),
                    "{binding} {command}: the X focus stayed with the front window, not {}: {answer:?}",
                    front.focused()
                );
                assert!(
                    answer.as_ref().is_err_and(|e| e.ends_with(&sentence)),
                    "{binding} {command}: {answer:?}"
                );
            }
        }
        assert_eq!(
            late.presses() - before,
            0,
            "{binding}: nothing reached the blocked window"
        );
        front.focus();
        sleep(BETWEEN);
        let to_dialog = engine.request("press_key", key(dialog).1);
        sleep(Duration::from_millis(300));
        assert!(
            to_dialog.is_ok(),
            "{binding}: input to the dialog itself goes: {to_dialog:?}"
        );
        assert!(
            front.holds_focus(),
            "{binding}: and the X focus stays with the front window"
        );
        let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
        front.focus();
        sleep(BETWEEN);
        let answer = dedicated.request("press_key", key(late.window).1);
        sleep(Duration::from_millis(300));
        assert!(answer.is_ok(), "{binding}: dedicated mode sends it: {answer:?}");
        assert_eq!(
            front.focused(),
            dialog,
            "{binding}: the control: the key's FocusIn handed the X focus to the dialog"
        );
    }
}

#[test]
fn a_background_press_to_a_qt_window_with_no_accessibility_tree_is_refused_in_shared_mode() {
    // the design session's ruling B: a Qt window whose application put no tree on the bus has no frame to wait on;
    // found by its process's map, its presses are refused, while keys, which Qt never activates on, still go. The
    // engine before the fix knew no family for it and pressed without waiting.
    for binding in ["qt5", "qt6"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", LATE_BOUND]);
        let Some(late) = late_as(binding, &mut engine, BLOCK_MS, None, false) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        assert_eq!(
            taken, 0,
            "{binding}: no click took the X focus from the front window: {answers:?}"
        );
        for answer in &answers {
            let error = answer["error"].as_str().unwrap_or("");
            assert!(
                error.contains("is a Qt application with no accessibility tree on the bus")
                    && error.ends_with("nothing was sent, so it is safe to retry"),
                "{binding}: refused, nothing sent: {answer}"
            );
        }
        assert_eq!(presses, 0, "{binding}: a refused click pressed nothing");
        front.focus();
        sleep(BETWEEN);
        let typed = engine.request("press_key", key(late.window).1);
        assert!(typed.is_ok(), "{binding}: a key still goes: {typed:?}");
    }
}
