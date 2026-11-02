//! Identity on a desktop that changes during a request (M4's T5; F5: a wrong association is worse than the sentence),
//! against a real GTK 3 process showing two windows of one title and size at one place (`tests/support/gtk3-twins.py`)
//! on the test's own display and accessibility bus. There is no window manager: the test plays its part, naming the
//! active window in `_NET_ACTIVE_WINDOW` and moving the X input focus, which GTK follows when it marks a frame
//! `active`. The stale state a toolkit passes through after an activation is built on purpose: `_NET_ACTIVE_WINDOW`
//! names window B while the X focus, and so GTK's `active` frame, is still window A's, so B's association takes A's
//! frame. A hook (`fault::arm_identity`) lets GTK catch up at one exact step of the engine's, and the request must then
//! refuse, having sent nothing.
//!
//! They need `--features live` (an X display, AT-SPI) and python3-gi with GTK 3. Without python3-gi each says so on
//! stderr and passes: the engine-linux gate's runner has none (`tech-debt-tracker.md`).

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConfigureWindowAux, ConnectionExt as _, InputFocus, PropMode};
use x11rb::wrapper::ConnectionExt as _;

use super::Engine;
use crate::atspi::{changed_before_acting, identity_changed};
use crate::clipboard::tests::{Asking, convert, serial, text_of};
use crate::fault::{self, Faults, Identity};
use crate::wire::Request;

type Log = Arc<Mutex<Vec<Value>>>;

/// The fixture's process, what it has printed, and its two windows' X11 ids.
struct Twins {
    child: Child,
    log: Log,
    a: u32,
    b: u32,
}

impl Drop for Twins {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        // the window manager's part ends with the test: no later test may read a stale active window
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        conn.delete_property(root, net_active(&conn)).unwrap();
        conn.sync().unwrap();
    }
}

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/support/gtk3-twins.py");
const PATIENCE: Duration = Duration::from_secs(20);

/// Waits until the fixture's records satisfy `ready`.
fn wait_for(log: &Log, what: &str, ready: impl Fn(&[Value]) -> bool) {
    let deadline = Instant::now() + PATIENCE;
    while !ready(&log.lock().unwrap()) {
        assert!(Instant::now() < deadline, "{what}: {:?}", log.lock().unwrap());
        sleep(Duration::from_millis(10));
    }
}

/// Window `n`'s active state, as GTK last reported it.
fn active(log: &[Value], n: u64) -> Option<bool> {
    log.iter()
        .rev()
        .find(|r| r["active"] == json!(n))
        .and_then(|r| r["is"].as_bool())
}

/// The fixture's two windows, or None (said on stderr) where python3-gi with GTK 3 is not installed.
fn twins(tag: &str) -> Option<Twins> {
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
    let title = format!("cua-engine-twins-{tag}-{}", std::process::id());
    let mut child = Command::new("python3")
        .args([FIXTURE, &title, "2", "400", "200"])
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
    let xid = |log: &[Value], n: u64| {
        log.iter()
            .find(|r| r["marker"] == json!(n))
            .and_then(|r| r["xid"].as_u64())
            .map(|x| x as u32)
    };
    wait_for(&log, "both windows mapped", |l| {
        xid(l, 1).is_some() && xid(l, 2).is_some()
    });
    let (a, b) = {
        let l = log.lock().unwrap();
        (xid(&l, 1).unwrap(), xid(&l, 2).unwrap())
    };
    Some(Twins { child, log, a, b })
}

fn net_active(conn: &impl Connection) -> u32 {
    conn.intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .unwrap()
        .reply()
        .unwrap()
        .atom
}

/// The window manager's part: the X input focus to `focus`, and `_NET_ACTIVE_WINDOW` naming `named`.
fn desktop(focus: Option<u32>, named: u32) {
    let (conn, screen) = x11rb::connect(None).unwrap();
    let root = conn.setup().roots[screen].root;
    if let Some(focus) = focus {
        conn.set_input_focus(InputFocus::PARENT, focus, x11rb::CURRENT_TIME)
            .unwrap();
    }
    conn.change_property32(PropMode::REPLACE, root, net_active(&conn), AtomEnum::WINDOW, &[named])
        .unwrap();
    conn.sync().unwrap();
}

/// Window `n` (1 for A, 2 for B) active as GTK reports it, the other not.
fn settled_on(log: &Log, n: u64) {
    let other = 3 - n;
    wait_for(log, &format!("GTK marks window {n} active and {other} not"), |l| {
        active(l, n) == Some(true) && active(l, other) != Some(true)
    });
}

/// Window A active and focused, as a window manager leaves it.
fn on_a(twins: &Twins) {
    desktop(Some(twins.a), twins.a);
    settled_on(&twins.log, 1);
}

/// The stale state: `_NET_ACTIVE_WINDOW` already names B, while the X focus and GTK's `active` frame are still A's.
fn stale(twins: &Twins) {
    on_a(twins);
    desktop(None, twins.b);
}

/// The hook that lets GTK catch up: the X focus moves to B, and the test waits until GTK marks B's frame active and
/// A's not, so the engine's next step sees the corrected state.
fn catch_up(twins: &Twins) -> impl FnOnce() + 'static {
    let (b, log) = (twins.b, twins.log.clone());
    move || {
        desktop(Some(b), b);
        settled_on(&log, 2);
    }
}

/// The window manager's part: window `n` (its X11 id `window`) moved to `at`, once GTK has seen it there.
fn moved(window: u32, log: &Log, n: u64, (x, y): (i32, i32)) {
    let (conn, _) = x11rb::connect(None).unwrap();
    conn.configure_window(window, &ConfigureWindowAux::new().x(x).y(y))
        .unwrap();
    conn.sync().unwrap();
    wait_for(log, &format!("window {n} at ({x}, {y})"), |l| {
        l.iter()
            .rev()
            .find(|r| r["configured"] == json!(n))
            .is_some_and(|r| r["x"] == json!(x) && r["y"] == json!(y))
    });
}

fn place(twins: &Twins, n: u64, at: (i32, i32)) {
    moved(if n == 1 { twins.a } else { twins.b }, &twins.log, n, at);
}

fn request(engine: &mut Engine, command: &str, input: Value) -> Result<Value, String> {
    let response = engine.handle(Request {
        id: json!(1),
        command: command.into(),
        input: Some(input),
    });
    engine.after_response();
    if response.ok {
        Ok(response.output)
    } else {
        Err(response.error.unwrap_or_default())
    }
}

fn read(engine: &mut Engine, window: u32) -> Result<Value, String> {
    request(
        engine,
        "get_window_state",
        json!({"window": {"id": window}, "include_screenshot": false}),
    )
}

/// The first node `matches` accepts, depth first.
fn find<'a>(node: &'a Value, matches: &impl Fn(&Value) -> bool) -> Option<&'a Value> {
    if matches(node) {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|c| find(c, matches))
}

/// The value of the first text node, which is the entry `twin-<n>`: whose window a tree is.
fn marker(state: &Value) -> Option<String> {
    find(&state["ax_tree"], &|n| n["role"] == json!("text"))?["value"]
        .as_str()
        .map(str::to_string)
}

/// The clipboard's text, as another client reads it now.
fn clipboard_text() -> String {
    text_of(convert("UTF8_STRING", Asking::default()))
}

fn setup(tag: &str) -> Option<(Engine, Twins)> {
    let twins = twins(tag)?;
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let deadline = Instant::now() + PATIENCE;
    // both frames are on the bus once a read of the active window answers its own tree
    on_a(&twins);
    while read(&mut engine, twins.a).ok().and_then(|s| marker(&s)).as_deref() != Some("twin-1") {
        assert!(Instant::now() < deadline, "window A's tree is on the bus");
        sleep(Duration::from_millis(100));
    }
    assert_eq!(clipboard_text(), "before");
    Some((engine, twins))
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn the_stale_state_is_real_and_a_corrected_one_reads_the_right_window() {
    // The control for the cases below: in the stale state B's association takes A's frame, which nothing at the
    // association can tell (the limit left is a toolkit still stale at the effect); corrected, B reads its own tree.
    let _serial = serial();
    let Some((mut engine, twins)) = setup("control") else {
        return;
    };
    stale(&twins);
    assert_eq!(
        read(&mut engine, twins.b).ok().and_then(|s| marker(&s)).as_deref(),
        Some("twin-1")
    );
    catch_up(&twins)();
    assert_eq!(
        read(&mut engine, twins.b).ok().and_then(|s| marker(&s)).as_deref(),
        Some("twin-2")
    );
    assert_eq!(
        read(&mut engine, twins.a),
        Err(crate::identity::duplicates_sentence(twins.a)),
        "the inactive duplicate refuses"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_focus_change_between_choosing_the_frame_and_verifying_it_is_the_retry_sentence_never_the_x11_tree() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("verify") else {
        return;
    };
    // A is active and focused, so the tie-break chooses A's frame by its active state; B becomes active before the
    // choice is verified
    fault::arm_identity(Identity::Verify, 1, catch_up(&twins));
    let answer = read(&mut engine, twins.a);
    assert!(fault::identity_hook_ran(), "the hook ran at the verification");
    assert_eq!(answer, Err(identity_changed(twins.a)), "not the X11 tree: {answer:?}");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_read_whose_active_frame_is_corrected_once_read_is_the_retry_sentence() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("read") else {
        return;
    };
    stale(&twins);
    fault::arm_identity(Identity::Confirm, 1, catch_up(&twins));
    let answer = read(&mut engine, twins.b);
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(
        answer,
        Err(identity_changed(twins.b)),
        "not A's tree under B's id: {answer:?}"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_copy_whose_active_frame_is_corrected_before_it_copies_nothing() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("copy") else {
        return;
    };
    stale(&twins);
    fault::arm_identity(Identity::Confirm, 1, catch_up(&twins));
    let answer = request(&mut engine, "clipboard_read", json!({"window": {"id": twins.b}}));
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(changed_before_acting(twins.b)));
    assert_eq!(clipboard_text(), "before", "no Copy reached the clipboard");
    // the control: the same request now copies B's own selection
    assert!(request(&mut engine, "clipboard_read", json!({"window": {"id": twins.b}})).is_ok());
    assert_eq!(clipboard_text(), "twin-2");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn an_action_whose_active_frame_is_corrected_before_it_presses_nothing() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("action") else {
        return;
    };
    stale(&twins);
    // B's stale read is A's tree: its button is the one the action would press
    let state = read(&mut engine, twins.b).unwrap();
    let button = find(&state["ax_tree"], &|n| n["name"] == json!("press-1")).expect("A's button")["id"].clone();
    fault::arm_identity(Identity::Confirm, 1, catch_up(&twins));
    let answer = request(
        &mut engine,
        "click",
        json!({"window": {"id": twins.b}, "element_id": button}),
    );
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(changed_before_acting(twins.b)));
    sleep(Duration::from_millis(300));
    let pressed: Vec<Value> = twins
        .log
        .lock()
        .unwrap()
        .iter()
        .filter(|r| r.get("pressed").is_some())
        .cloned()
        .collect();
    assert!(pressed.is_empty(), "no button was pressed: {pressed:?}");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_stale_paste_into_the_focused_field_sends_nothing() {
    // The paste's own background session sends B a synthetic FocusIn, which GTK takes as B's focus, so the walk of
    // A's frame finds no focused field and refuses before anything is sent.
    let _serial = serial();
    let Some((mut engine, twins)) = setup("stale-paste") else {
        return;
    };
    stale(&twins);
    fault::arm(Faults::default());
    let answer = request(
        &mut engine,
        "type_text",
        json!({"window": {"id": twins.b}, "text": "PASTED"}),
    );
    let sent = fault::sent();
    assert!(
        answer.as_ref().is_err_and(|e| e.ends_with("nothing was sent")),
        "{answer:?}"
    );
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    assert_eq!(clipboard_text(), "before");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_paste_whose_frame_is_no_longer_told_apart_before_its_chord_sends_nothing() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("chord") else {
        return;
    };
    // B apart from A, told apart by its position; A stays the active window
    place(&twins, 2, (450, 0));
    let (b, log) = (twins.b, twins.log.clone());
    // just before the chord B goes back onto A's place, where only the active state could tell it, and it is not
    // active
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Confirm, 1, move || moved(b, &log, 2, (0, 0)));
    let answer = request(
        &mut engine,
        "type_text",
        json!({"window": {"id": twins.b}, "text": "PASTED"}),
    );
    let sent = fault::sent();
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(changed_before_acting(twins.b)));
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    assert_eq!(clipboard_text(), "before", "the clipboard holds what it held");
    assert_eq!(
        read(&mut engine, twins.b),
        Err(crate::identity::duplicates_sentence(twins.b))
    );
    // the control: apart again, the same paste goes out once and lands in B's own field
    place(&twins, 2, (450, 0));
    assert_eq!(
        request(
            &mut engine,
            "type_text",
            json!({"window": {"id": twins.b}, "text": "PASTED"})
        ),
        Ok(Value::Null)
    );
    assert_eq!(
        read(&mut engine, twins.b).ok().and_then(|s| marker(&s)).as_deref(),
        Some("PASTED")
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_paste_whose_active_frame_is_corrected_before_its_focusing_click_clicks_nothing() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("click") else {
        return;
    };
    stale(&twins);
    // the named field is A's second entry, which has no focus: the paste would click it first
    let state = read(&mut engine, twins.b).unwrap();
    let field = find(&state["ax_tree"], &|n| n["value"] == json!("other-1")).expect("A's second entry")["id"].clone();
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Confirm, 1, catch_up(&twins));
    let answer = request(
        &mut engine,
        "type_text",
        json!({"window": {"id": twins.b}, "element_id": field, "text": "PASTED"}),
    );
    let sent = fault::sent();
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(changed_before_acting(twins.b)));
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    sleep(Duration::from_millis(300));
    let focused: Vec<Value> = twins
        .log
        .lock()
        .unwrap()
        .iter()
        .filter(|r| r.get("focus").is_some())
        .cloned()
        .collect();
    assert!(focused.is_empty(), "no click focused a second entry: {focused:?}");
    assert_eq!(clipboard_text(), "before");
}
