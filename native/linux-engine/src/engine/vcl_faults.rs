//! LibreOffice's positions, staged in GTK 3 (#171 M4, T16's fix wave; `vcl.rs`). The fixture (`tests/support/
//! vcl-shape.py`) is a window LibreOffice's `WM_CLASS` names, whose root pane sits where LibreOffice's does after a
//! ConfigureNotify (at the client's origin, the menu bar's height above its host panel), at its host's own place, or
//! in a shape LibreOffice never shows. A point-based action that names the root pane itself is aimed at the host's
//! rectangle, where VCL draws, or refused with nothing sent: the root pane's own ancestors (host, client, frame) hold no
//! root pane, so the element itself must be read too (task 72's review, finding 1).
//!
//! They need `--features live` (an X display, AT-SPI) and python3-gi with GTK 3. Without python3-gi each says so on
//! stderr and passes: the engine-linux gate's runner has none (`tech-debt-tracker.md`).

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::Engine;
use super::identity_faults::{Log, find, read, request, wait_for};
use crate::clipboard::tests::serial;

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/support/vcl-shape.py");
const PATIENCE: Duration = Duration::from_secs(20);

/// The fixture's process, what it has printed, its window, and the host panel's and the root pane's rectangles as GTK
/// allocated them (`[x, y, width, height]`, root coordinates).
struct Shape {
    child: Child,
    log: Log,
    window: u32,
    host: [i64; 4],
    root_pane: [i64; 4],
}

impl Drop for Shape {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// The fixture in a shape (`stale`, `agree` or `odd`) once its window is mapped, or None (said on stderr) where
/// python3-gi with GTK 3 is not installed.
fn shape(kind: &str) -> Option<Shape> {
    let gi = Command::new("python3")
        .args([
            "-c",
            "import gi; gi.require_version('Gtk', '3.0'); from gi.repository import Gtk",
        ])
        .stderr(Stdio::null())
        .status();
    if !gi.is_ok_and(|s| s.success()) {
        eprintln!("skipped: python3-gi with GTK 3 is not installed (tech-debt-tracker.md, the identity paths in CI)");
        return None;
    }
    let title = format!("cua-engine-vcl-{kind}-{}", std::process::id());
    let mut child = Command::new("python3")
        .args([FIXTURE, &title, kind])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("python3");
    let log: Log = Arc::default();
    let stdout = child.stdout.take().expect("piped");
    let into = log.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(record) = serde_json::from_str::<Value>(&line) {
                into.lock().unwrap().push(record);
            }
        }
    });
    wait_for(&log, "the window mapped", |l| l.iter().any(|r| r["marker"] == json!(1)));
    let mapped = log
        .lock()
        .unwrap()
        .iter()
        .find(|r| r["marker"] == json!(1))
        .cloned()
        .unwrap();
    let rect = |key: &str| -> [i64; 4] {
        let v: Vec<i64> = mapped[key]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n.as_i64().unwrap())
            .collect();
        v.try_into().unwrap()
    };
    Some(Shape {
        window: mapped["xid"].as_u64().unwrap() as u32,
        host: rect("host"),
        root_pane: rect("root_pane"),
        child,
        log,
    })
}

/// A fresh engine, once the window's tree reads, and the root pane's element id in it.
fn engine_and_root_pane(shape: &Shape) -> (Engine, Value) {
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let deadline = Instant::now() + PATIENCE;
    loop {
        if let Ok(state) = read(&mut engine, shape.window)
            && let Some(node) = find(&state["ax_tree"], &|n| n["role"] == json!("root pane"))
        {
            return (engine, node["id"].clone());
        }
        assert!(Instant::now() < deadline, "the window's root pane is on the bus");
        sleep(Duration::from_millis(100));
    }
}

/// The centre of a rectangle, floored, as the engine takes it.
fn centre([x, y, w, h]: [i64; 4]) -> (i64, i64) {
    (x + w / 2, y + h / 2)
}

/// The records of one kind (`button` or `scroll`), once one has come or `wait` has passed.
fn records(shape: &Shape, key: &str, wait: Duration) -> Vec<Value> {
    let deadline = Instant::now() + wait;
    loop {
        let got: Vec<Value> = shape
            .log
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.get(key).is_some())
            .cloned()
            .collect();
        if !got.is_empty() || Instant::now() >= deadline {
            return got;
        }
        sleep(Duration::from_millis(20));
    }
}

fn landed(record: &Value) -> (i64, i64) {
    (record["x"].as_i64().unwrap(), record["y"].as_i64().unwrap())
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_right_click_on_the_stale_root_pane_itself_lands_where_its_host_is() {
    let _serial = serial();
    let Some(shape) = shape("stale") else {
        return;
    };
    // the staging holds: the root pane at the client's origin, the menu bar's height above its host, the host's size
    assert_eq!(
        shape.root_pane[1] + 27,
        shape.host[1],
        "{:?} {:?}",
        shape.root_pane,
        shape.host
    );
    assert_eq!((shape.root_pane[2], shape.root_pane[3]), (shape.host[2], shape.host[3]));
    let (mut engine, root_pane) = engine_and_root_pane(&shape);
    let answer = request(
        &mut engine,
        "click",
        json!({"window": {"id": shape.window}, "element_id": root_pane, "mouse_button": "right"}),
    );
    assert_eq!(answer, Ok(Value::Null));
    // at the host's centre, where VCL draws, not at the root pane's reported one
    assert_right_pressed_at(&shape, centre(shape.host));
}

/// The right click reached the window, and every press record of it is button 3 at `at` (the fixture's handler hears
/// each press twice, a real XTEST click's too).
fn assert_right_pressed_at(shape: &Shape, at: (i64, i64)) {
    let presses = records(shape, "button", Duration::from_secs(2));
    assert!(!presses.is_empty(), "the press reached the window");
    for press in &presses {
        assert_eq!((press["button"].clone(), landed(press)), (json!(3), at), "{presses:?}");
    }
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn an_element_scroll_on_the_stale_root_pane_itself_lands_where_its_host_is() {
    let _serial = serial();
    let Some(shape) = shape("stale") else {
        return;
    };
    let (mut engine, root_pane) = engine_and_root_pane(&shape);
    let answer = request(
        &mut engine,
        "scroll",
        json!({"window": {"id": shape.window}, "element_id": root_pane, "direction": "down"}),
    );
    assert_eq!(answer, Ok(Value::Null));
    let steps = records(&shape, "scroll", Duration::from_secs(2));
    assert!(!steps.is_empty(), "the wheel reached the window");
    for step in &steps {
        assert_eq!(
            landed(step),
            centre(shape.host),
            "every step at the host's centre: {steps:?}"
        );
    }
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_root_pane_whose_host_agrees_is_clicked_where_it_is() {
    let _serial = serial();
    let Some(shape) = shape("agree") else {
        return;
    };
    assert_eq!(shape.root_pane, shape.host);
    let (mut engine, root_pane) = engine_and_root_pane(&shape);
    let answer = request(
        &mut engine,
        "click",
        json!({"window": {"id": shape.window}, "element_id": root_pane, "mouse_button": "right"}),
    );
    assert_eq!(answer, Ok(Value::Null));
    assert_right_pressed_at(&shape, centre(shape.host));
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_root_pane_in_an_unknown_shape_refuses_its_right_click_and_its_scroll_with_nothing_sent() {
    let _serial = serial();
    let Some(shape) = shape("odd") else {
        return;
    };
    let (mut engine, root_pane) = engine_and_root_pane(&shape);
    let click = request(
        &mut engine,
        "click",
        json!({"window": {"id": shape.window}, "element_id": root_pane, "mouse_button": "right"}),
    );
    assert_eq!(click, Err(crate::vcl::UNTRUSTED.to_string()));
    let scroll = request(
        &mut engine,
        "scroll",
        json!({"window": {"id": shape.window}, "element_id": root_pane, "direction": "down"}),
    );
    assert_eq!(scroll, Err(crate::vcl::UNTRUSTED.to_string()));
    let sent = [
        records(&shape, "button", Duration::from_millis(500)),
        records(&shape, "scroll", Duration::ZERO),
    ]
    .concat();
    assert!(sent.is_empty(), "nothing reached the window: {sent:?}");
}
