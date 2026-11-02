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

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
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

pub(super) type Log = Arc<Mutex<Vec<Value>>>;

/// The fixture's process, what it has printed, its windows' X11 ids in order, and its stdin, for its commands.
pub(super) struct Fixture {
    child: Child,
    pub(super) log: Log,
    pub(super) windows: Vec<u32>,
    stdin: Arc<Mutex<ChildStdin>>,
}

impl Fixture {
    /// A sender of the fixture's commands (`popup <n>`, `popdown`, `focus <entry|other> <n>`), for a hook to use.
    pub(super) fn commands(&self) -> impl Fn(&str) + Clone + 'static {
        let stdin = self.stdin.clone();
        move |command: &str| {
            let mut stdin = stdin.lock().unwrap();
            writeln!(stdin, "{command}").unwrap();
            stdin.flush().unwrap();
        }
    }
}

impl Drop for Fixture {
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

/// The fixture's two windows, A and B.
struct Twins {
    fixture: Fixture,
    a: u32,
    b: u32,
}

impl std::ops::Deref for Twins {
    type Target = Fixture;

    fn deref(&self) -> &Fixture {
        &self.fixture
    }
}

const FIXTURE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/support/gtk3-twins.py");
const PATIENCE: Duration = Duration::from_secs(20);

/// Waits until the fixture's records satisfy `ready`.
pub(super) fn wait_for(log: &Log, what: &str, ready: impl Fn(&[Value]) -> bool) {
    let deadline = Instant::now() + PATIENCE;
    while !ready(&log.lock().unwrap()) {
        assert!(Instant::now() < deadline, "{what}: {:?}", log.lock().unwrap());
        sleep(Duration::from_millis(10));
    }
}

/// Window `n`'s active state, as GTK last reported it.
pub(super) fn active(log: &[Value], n: u64) -> Option<bool> {
    log.iter()
        .rev()
        .find(|r| r["active"] == json!(n))
        .and_then(|r| r["is"].as_bool())
}

/// The fixture with `count` windows of one title and `args` its optional arguments (`tests/support/gtk3-twins.py`),
/// once every window is mapped; or None (said on stderr) where python3-gi with GTK 3 is not installed.
pub(super) fn fixture(tag: &str, count: u64, args: &[&str]) -> Option<Fixture> {
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
        .args([FIXTURE, &title, &count.to_string(), "400", "200"])
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("python3");
    let log: Log = Arc::default();
    let stdout = child.stdout.take().expect("piped");
    let stdin = Arc::new(Mutex::new(child.stdin.take().expect("piped")));
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
    wait_for(&log, "every window mapped", |l| {
        (1..=count).all(|n| xid(l, n).is_some())
    });
    let windows = {
        let l = log.lock().unwrap();
        (1..=count).map(|n| xid(&l, n).unwrap()).collect()
    };
    Some(Fixture {
        child,
        log,
        windows,
        stdin,
    })
}

/// The fixture's two windows, or None where python3-gi with GTK 3 is not installed.
fn twins(tag: &str, args: &[&str]) -> Option<Twins> {
    let fixture = fixture(tag, 2, args)?;
    let (a, b) = (fixture.windows[0], fixture.windows[1]);
    Some(Twins { fixture, a, b })
}

pub(super) fn net_active(conn: &impl Connection) -> u32 {
    conn.intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .unwrap()
        .reply()
        .unwrap()
        .atom
}

/// The window manager's part: the X input focus to `focus`, and `_NET_ACTIVE_WINDOW` naming `named`.
pub(super) fn desktop(focus: Option<u32>, named: u32) {
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
pub(super) fn settled_on(log: &Log, n: u64) {
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

/// The stale state the other way round, for the Copy: `_NET_ACTIVE_WINDOW` names A while the X focus and GTK's
/// `active` frame are B's. Only B's entry holds a selection (GTK clears an entry's selection when another takes
/// PRIMARY, and B's took it last), so a Copy through the stale association has something to copy.
fn stale_towards_b(twins: &Twins) {
    desktop(Some(twins.b), twins.b);
    settled_on(&twins.log, 2);
    desktop(None, twins.a);
}

/// `catch_up` the other way round: the X focus moves to A.
fn catch_up_to_a(twins: &Twins) -> impl FnOnce() + 'static {
    let (a, log) = (twins.a, twins.log.clone());
    move || {
        desktop(Some(a), a);
        settled_on(&log, 1);
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

pub(super) fn request(engine: &mut Engine, command: &str, input: Value) -> Result<Value, String> {
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

pub(super) fn read(engine: &mut Engine, window: u32) -> Result<Value, String> {
    request(
        engine,
        "get_window_state",
        json!({"window": {"id": window}, "include_screenshot": false}),
    )
}

/// The first node `matches` accepts, depth first.
pub(super) fn find<'a>(node: &'a Value, matches: &impl Fn(&Value) -> bool) -> Option<&'a Value> {
    if matches(node) {
        return Some(node);
    }
    node["children"].as_array()?.iter().find_map(|c| find(c, matches))
}

/// The value of the first text node, which is the entry `twin-<n>`: whose window a tree is.
pub(super) fn marker(state: &Value) -> Option<String> {
    find(&state["ax_tree"], &|n| n["role"] == json!("text"))?["value"]
        .as_str()
        .map(str::to_string)
}

/// The clipboard's text, as another client reads it now.
pub(super) fn clipboard_text() -> String {
    text_of(convert("UTF8_STRING", Asking::default()))
}

fn setup(tag: &str) -> Option<(Engine, Twins)> {
    setup_with(tag, &[])
}

/// `setup`, the fixture given `args`.
fn setup_with(tag: &str, args: &[&str]) -> Option<(Engine, Twins)> {
    let twins = twins(tag, args)?;
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

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_copy_whose_active_frame_is_corrected_after_its_selection_is_read_copies_nothing() {
    // The Copy's editable route reads the selection over several calls before CopyText: GTK catches up in between, so
    // only a confirmation at CopyText itself refuses
    let _serial = serial();
    let Some((mut engine, twins)) = setup("copy-late") else {
        return;
    };
    stale_towards_b(&twins);
    fault::arm_identity(Identity::CopyText, 1, catch_up_to_a(&twins));
    let answer = request(&mut engine, "clipboard_read", json!({"window": {"id": twins.a}}));
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(changed_before_acting(twins.a)));
    assert_eq!(clipboard_text(), "before", "B's selection never reached the clipboard");
    // the control: B active and focused, its own Copy is confirmed at CopyText and goes out
    desktop(Some(twins.b), twins.b);
    settled_on(&twins.log, 2);
    assert!(request(&mut engine, "clipboard_read", json!({"window": {"id": twins.b}})).is_ok());
    assert_eq!(clipboard_text(), "twin-2");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_paste_whose_frame_changes_after_its_focusing_click_says_the_click_was_sent_and_restores_nothing() {
    let _serial = serial();
    let Some((mut engine, twins)) = setup("restore") else {
        return;
    };
    // B apart from A, told apart by its position; its second entry has no focus, so the paste clicks it first
    place(&twins, 2, (450, 0));
    let state = read(&mut engine, twins.b).unwrap();
    let field = find(&state["ax_tree"], &|n| n["value"] == json!("other-2")).expect("B's second entry")["id"].clone();
    // the click lands and focuses the field; at the selection restore B is back on A's place, inactive
    let (b, log) = (twins.b, twins.log.clone());
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Restore, 1, move || moved(b, &log, 2, (0, 0)));
    let answer = request(
        &mut engine,
        "type_text",
        json!({"window": {"id": twins.b}, "element_id": field, "text": "PASTED"}),
    );
    let sent = fault::sent();
    assert!(fault::identity_hook_ran(), "the hook ran at the restore: {answer:?}");
    assert_eq!(
        answer,
        Err(format!(
            "window identity changed during the request for X11 window {}; no paste was dispatched, but a focusing \
             click already reached the window, so read the window before retrying",
            twins.b
        ))
    );
    sleep(Duration::from_millis(300));
    let of = |key: &str| -> Vec<Value> {
        twins
            .log
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.get(key).is_some())
            .cloned()
            .collect()
    };
    assert_eq!(
        of("button"),
        [json!({"button": 1, "window": 2})],
        "the one focusing press, and nothing after"
    );
    assert_eq!(
        of("focus"),
        [json!({"focus": "other", "window": 2})],
        "it focused B's field"
    );
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    assert_eq!(clipboard_text(), "before", "the clipboard holds what it held");
    place(&twins, 2, (450, 0));
    let state = read(&mut engine, twins.b).unwrap();
    assert!(
        find(&state["ax_tree"], &|n| n["value"] == json!("other-2")).is_some(),
        "the field's text is as it was"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_context_menu_copy_on_a_window_told_apart_by_position_opens_no_menu_and_copies_nothing() {
    // The counterexample: B's Copy opens B's context menu, which closes, and A opens one before the lookup. The menu
    // hangs from the application, not from either window, so a lookup of the application's new children finds A's
    // Copy, B's association still confirms (it is still apart), and A's selection would be copied as B's. Nothing on
    // the bus binds a menu to its window, so on cua's own routes the context-menu Copy is refused before it opens one.
    let _serial = serial();
    let Some((mut engine, twins)) = setup_with("menu-swap", &["menu"]) else {
        return;
    };
    // B apart from A, told apart by its position, and focused, so its focused element is its menu widget
    place(&twins, 2, (450, 0));
    desktop(Some(twins.b), twins.b);
    settled_on(&twins.log, 2);
    let (send, log) = (twins.commands(), twins.log.clone());
    fault::arm_identity(Identity::MenuLookup, 1, move || {
        wait_for(&log, "B's menu open", |l| {
            l.contains(&json!({"menu": "open", "window": 2}))
        });
        send("popdown");
        wait_for(&log, "B's menu closed and gone", |l| {
            l.contains(&json!({"menu": "closed", "window": 2}))
        });
        send("popup 1");
        wait_for(&log, "A's menu open", |l| {
            l.contains(&json!({"menu": "open", "window": 1}))
        });
    });
    let answer = request(&mut engine, "clipboard_read", json!({"window": {"id": twins.b}}));
    let replaced = fault::identity_hook_ran();
    assert_eq!(
        answer,
        Err(format!(
            "the focused element of X11 window {} copies only through a context menu, and a context menu cannot be \
             shown to belong to this window, whose accessibility frame was found by its position among same-title \
             duplicates; nothing was sent",
            twins.b
        )),
        "the clipboard now holds {:?}",
        clipboard_text()
    );
    assert!(!replaced, "no menu was opened, so there was none to replace");
    sleep(Duration::from_millis(300));
    let menus: Vec<Value> = twins
        .log
        .lock()
        .unwrap()
        .iter()
        .filter(|r| r.get("menu").is_some() || r.get("copied").is_some())
        .cloned()
        .collect();
    assert!(menus.is_empty(), "no menu opened and nothing was copied: {menus:?}");
    assert_eq!(clipboard_text(), "before");
}
