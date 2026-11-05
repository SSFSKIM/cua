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
    let mut child = Command::new("python3")
        .args([FIXTURE, &title, binding, &BLOCK_MS.to_string(), &EVERY_MS.to_string()])
        .env("QT_LINUX_ACCESSIBILITY_ALWAYS_ON", "1")
        .env("QT_ACCESSIBILITY", "1")
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
    let late = Late { child, log, window };
    // its frame on the bus: the engine reads the window's tree from AT-SPI
    loop {
        let state = engine.request(
            "get_window_state",
            json!({"window": {"id": window}, "include_screenshot": false}),
        );
        if state.is_ok_and(|s| s["ax_tree_source"] == json!("at_spi")) {
            break;
        }
        assert!(Instant::now() < deadline, "the Qt window's tree is on the bus");
        sleep(Duration::from_millis(200));
    }
    Some(late)
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
        self.conn.get_input_focus().unwrap().reply().unwrap().focus == self.window
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
fn a_press_whose_focus_is_not_reported_within_the_bound_is_refused_with_nothing_sent() {
    // a bound shorter than the late window's blocked turn: most clicks cannot see the focus taken in time
    for binding in ["qt5"] {
        let mut engine = Engine::start_with(&["--focus-ack-ms", "1"]);
        let Some(late) = late(binding, &mut engine) else {
            continue;
        };
        let front = Front::open();
        let (taken, answers, presses) = clicks(&mut engine, &late, &front, &[click(late.window)]);
        let refused: Vec<&Value> = answers.iter().filter(|a| a["ok"] != json!(true)).collect();
        assert!(!refused.is_empty(), "a 1 ms bound refuses some clicks: {answers:?}");
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
