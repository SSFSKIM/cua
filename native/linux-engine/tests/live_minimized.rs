//! Minimized windows, live (Design, Minimized windows; M4's T4; Acceptance 7): the engine binary over its wire, against
//! bare X windows of the test's own on a display with no window manager (the CI gate's Xvfb), where the test plays the
//! window manager's part: it minimizes a window as one does (unmapped, `WM_STATE` Iconic), restores it, and, for
//! `activate_window`, maps a minimized window a little after the activation request, as Openbox does. Each window records
//! the input events it receives, so "nothing was sent" is read from the window itself.
//!
//!   xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1

#![cfg(feature = "live")]

mod support;

use serde_json::{Value, json};
use std::thread::sleep;
use std::time::{Duration, Instant};
use support::Engine;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, InputFocus, MapState, PropMode, Window, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

/// How long a window may take to show an event the engine sent, and how long one shows that nothing arrives.
const SETTLE: Duration = Duration::from_millis(400);
/// How long the test's stand-in window manager takes to map a window it was asked to activate (Openbox: under 50 ms).
const WM_MAP_DELAY: Duration = Duration::from_millis(40);
/// The engine's bound on that wait (`engine/windows.rs` `MAP_WAIT`).
const MAP_WAIT: Duration = Duration::from_secs(1);
const NORMAL_STATE: u32 = 1;
const ICONIC_STATE: u32 = 3;

/// One input event a probe window received: whether it was a key or a button, and whether it came through `SendEvent`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Input {
    KeyPress { sent: bool },
    KeyRelease { sent: bool },
    ButtonPress { sent: bool },
    ButtonRelease { sent: bool },
    Motion,
}

/// A bare top-level window of the test's own, on its own X connection, with this `WM_CLASS`; destroyed on drop.
struct Probe {
    conn: RustConnection,
    id: Window,
    wm_state: u32,
}

impl Probe {
    fn open(class: &str, (x, y, width, height): (i16, i16, u16, u16)) -> Probe {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let screen = &conn.setup().roots[screen];
        let root = screen.root;
        let id = conn.generate_id().unwrap();
        let mask = EventMask::KEY_PRESS
            | EventMask::KEY_RELEASE
            | EventMask::BUTTON_PRESS
            | EventMask::BUTTON_RELEASE
            | EventMask::POINTER_MOTION
            | EventMask::STRUCTURE_NOTIFY;
        let aux = CreateWindowAux::new()
            .background_pixel(screen.white_pixel)
            .event_mask(mask);
        conn.create_window(0, id, root, x, y, width, height, 0, WindowClass::INPUT_OUTPUT, 0, &aux)
            .unwrap();
        let wm_class = format!("probe\0{class}\0");
        conn.change_property8(
            PropMode::REPLACE,
            id,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            wm_class.as_bytes(),
        )
        .unwrap();
        let title = format!("cua-engine-live-minimized-{class}-{}", std::process::id());
        conn.change_property8(
            PropMode::REPLACE,
            id,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            title.as_bytes(),
        )
        .unwrap();
        let wm_state = atom(&conn, "WM_STATE");
        let probe = Probe { conn, id, wm_state };
        probe.restore();
        probe
    }

    /// Minimized as a window manager minimizes a window: `WM_STATE` Iconic, then unmapped.
    fn minimize(&self) {
        self.set_wm_state(ICONIC_STATE);
        self.conn.unmap_window(self.id).unwrap();
        self.wait_map_state(false);
    }

    /// Restored: `WM_STATE` Normal, then mapped.
    fn restore(&self) {
        self.set_wm_state(NORMAL_STATE);
        self.conn.map_window(self.id).unwrap();
        self.wait_map_state(true);
    }

    /// Unmapped with no `WM_STATE` at all: withdrawn, which no window manager maps on an activation request.
    fn withdraw(&self) {
        self.conn.delete_property(self.id, self.wm_state).unwrap();
        self.conn.unmap_window(self.id).unwrap();
        self.wait_map_state(false);
    }

    fn set_wm_state(&self, state: u32) {
        self.conn
            .change_property32(
                PropMode::REPLACE,
                self.id,
                self.wm_state,
                self.wm_state,
                &[state, x11rb::NONE],
            )
            .unwrap();
        self.conn.flush().unwrap();
    }

    fn viewable(&self) -> bool {
        self.conn
            .get_window_attributes(self.id)
            .unwrap()
            .reply()
            .unwrap()
            .map_state
            == MapState::VIEWABLE
    }

    fn wait_map_state(&self, viewable: bool) {
        self.conn.flush().unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while self.viewable() != viewable {
            assert!(Instant::now() < deadline, "the probe window's map state settles");
            sleep(Duration::from_millis(5));
        }
    }

    /// The input events received since the last call, waiting `SETTLE` for any still on their way.
    fn inputs(&self) -> Vec<Input> {
        sleep(SETTLE);
        let mut seen = Vec::new();
        while let Some(event) = self.conn.poll_for_event().unwrap() {
            let sent = event.sent_event();
            seen.push(match event {
                Event::KeyPress(_) => Input::KeyPress { sent },
                Event::KeyRelease(_) => Input::KeyRelease { sent },
                Event::ButtonPress(_) => Input::ButtonPress { sent },
                Event::ButtonRelease(_) => Input::ButtonRelease { sent },
                Event::MotionNotify(_) => Input::Motion,
                _ => continue,
            });
        }
        seen
    }

    fn has_focus(&self) -> bool {
        self.conn.get_input_focus().unwrap().reply().unwrap().focus == self.id
    }

    /// The input focus put on the root, as no window manager leaves it, so an activation shows.
    fn unfocus(&self) {
        self.conn
            .set_input_focus(InputFocus::POINTER_ROOT, x11rb::NONE, x11rb::CURRENT_TIME)
            .unwrap();
        self.conn.sync().unwrap();
    }

    fn target(&self) -> Value {
        json!({"id": self.id})
    }
}

impl Drop for Probe {
    fn drop(&mut self) {
        let _ = self.conn.destroy_window(self.id);
        let _ = self.conn.flush();
    }
}

/// The window manager's client list (`_NET_CLIENT_LIST` on the root) naming these windows, as a window manager keeps
/// its minimized clients listed there while they are unmapped; removed on drop, so later tests see a display with no
/// window manager again.
struct ClientList {
    conn: RustConnection,
    root: Window,
    property: u32,
}

impl ClientList {
    fn publish(windows: &[&Probe]) -> ClientList {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let root = conn.setup().roots[screen].root;
        let property = atom(&conn, "_NET_CLIENT_LIST");
        let ids: Vec<u32> = windows.iter().map(|p| p.id).collect();
        conn.change_property32(PropMode::REPLACE, root, property, AtomEnum::WINDOW, &ids)
            .unwrap();
        conn.sync().unwrap();
        ClientList { conn, root, property }
    }
}

impl Drop for ClientList {
    fn drop(&mut self) {
        let _ = self.conn.delete_property(self.root, self.property);
        let _ = self.conn.sync();
    }
}

fn atom(conn: &RustConnection, name: &str) -> u32 {
    conn.intern_atom(false, name.as_bytes()).unwrap().reply().unwrap().atom
}

fn minimized_sentence(window: Window) -> String {
    format!("Window {window} is minimized; activate it first")
}

/// The window's `list_windows` entry, if it is listed.
fn listed(engine: &mut Engine, window: Window) -> Option<Value> {
    let windows = engine.request("list_windows", json!({})).unwrap();
    windows
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == json!(window))
        .cloned()
}

/// Every window-targeted input the engine answers, each shaped well enough that only the window could refuse it.
fn inputs_to(window: &Value) -> Vec<(&'static str, Value)> {
    vec![
        ("press_key", json!({"window": window, "key": "a"})),
        ("key_down", json!({"window": window, "key": "b"})),
        ("click", json!({"window": window, "x": 20, "y": 20})),
        (
            "click",
            json!({"window": window, "x": 20, "y": 20, "mouse_button": "right"}),
        ),
        ("click", json!({"window": window, "element_id": "1"})),
        ("move", json!({"window": window, "x": 30, "y": 30})),
        (
            "scroll",
            json!({"window": window, "x": 20, "y": 20, "direction": "down"}),
        ),
        (
            "scroll",
            json!({"window": window, "element_id": "1", "direction": "down"}),
        ),
        (
            "drag",
            json!({"window": window, "path": [{"x": 10, "y": 10}, {"x": 60, "y": 60}]}),
        ),
        (
            "perform_secondary_action",
            json!({"window": window, "element_id": "1", "action": "press"}),
        ),
        ("type_text", json!({"window": window, "text": "abc"})),
        ("type_characters", json!({"window": window, "text": "abc"})),
        ("clipboard_write", json!({"window": window, "handle": "clipboard-1"})),
        ("clipboard_read", json!({"window": window})),
    ]
}

/// Whether the X server holds this keycode down (the desktop's own key state, which XTEST changes).
fn key_is_down(conn: &RustConnection, keycode: u8) -> bool {
    let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
    keys[keycode as usize / 8] & (1 << (keycode % 8)) != 0
}

fn keycode_of(conn: &RustConnection, keysym: u32) -> u8 {
    let setup = conn.setup();
    let (min, max) = (setup.min_keycode, setup.max_keycode);
    let map = conn.get_keyboard_mapping(min, max - min + 1).unwrap().reply().unwrap();
    let per = map.keysyms_per_keycode as usize;
    let index = map
        .keysyms
        .iter()
        .position(|&k| k == keysym)
        .expect("the keysym is on the layout");
    min + (index / per) as u8
}

fn button1_is_down(conn: &RustConnection) -> bool {
    let root = conn.setup().roots[0].root;
    let mask = u16::from(conn.query_pointer(root).unwrap().reply().unwrap().mask);
    mask & u16::from(x11rb::protocol::xproto::KeyButMask::BUTTON1) != 0
}

#[test]
fn a_minimized_window_is_listed_and_read_and_once_restored_is_captured_again() {
    let probe = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    let other = Probe::open("OtherProbe", (400, 0, 320, 200));
    let _clients = ClientList::publish(&[&probe, &other]);
    let mut engine = Engine::start();
    assert_eq!(
        listed(&mut engine, probe.id).expect("listed")["minimized"],
        Value::Null,
        "a mapped window"
    );

    probe.minimize();
    let entry = listed(&mut engine, probe.id).expect("a minimized window is listed");
    assert_eq!(entry["minimized"], json!(true));
    assert_eq!(
        (entry["width"].clone(), entry["height"].clone()),
        (json!(320), json!(200))
    );
    assert_eq!(
        listed(&mut engine, other.id).expect("listed")["minimized"],
        Value::Null,
        "no other window carries the field"
    );
    let state = engine
        .request(
            "get_window_state",
            json!({"window": probe.target(), "include_screenshot": true}),
        )
        .expect("a minimized window's state is read");
    assert_eq!(state["screenshots"], json!([]), "no screenshot of a minimized window");
    assert_eq!(state["window"]["minimized"], json!(true));
    assert!(state["ax_tree"].is_object(), "its tree is read: {state}");
    assert!(!probe.viewable(), "reading it leaves it minimized");

    probe.restore();
    assert_eq!(
        listed(&mut engine, probe.id).expect("listed")["minimized"],
        Value::Null,
        "the field goes"
    );
    let state = engine
        .request(
            "get_window_state",
            json!({"window": probe.target(), "include_screenshot": true}),
        )
        .unwrap();
    assert_eq!(
        state["screenshots"].as_array().map(Vec::len),
        Some(1),
        "the restored window is captured"
    );
    assert_eq!(state["window"]["minimized"], Value::Null);
}

#[test]
fn input_to_a_minimized_window_is_refused_in_both_modes_with_nothing_sent_and_nothing_activated() {
    // an unlisted family, and two listed ones whose device refusal the minimized refusal comes before
    let plain = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    let xterm = Probe::open("XTerm", (400, 0, 320, 200));
    let gecko = Probe::open("firefox", (0, 300, 320, 200));
    for probe in [&plain, &xterm, &gecko] {
        probe.minimize();
        probe.inputs();
    }
    for mode in ["shared", "dedicated"] {
        let mut engine = Engine::start_with(&["--desktop", mode]);
        for probe in [&plain, &xterm, &gecko] {
            probe.unfocus();
            for (command, input) in inputs_to(&probe.target()) {
                assert_eq!(
                    engine.request(command, input.clone()),
                    Err(minimized_sentence(probe.id)),
                    "{mode} {command} {input}"
                );
            }
            assert_eq!(probe.inputs(), vec![], "{mode}: nothing was sent");
            assert!(
                !probe.viewable() && !probe.has_focus(),
                "{mode}: nothing activated the window"
            );
        }
        // the refusal is the window's, not the engine's: the same request to a restored window runs
        plain.restore();
        engine
            .request("press_key", json!({"window": plain.target(), "key": "a"}))
            .unwrap();
        assert_eq!(
            plain.inputs(),
            vec![Input::KeyPress { sent: true }, Input::KeyRelease { sent: true }],
            "{mode}: the control"
        );
        plain.minimize();
        plain.inputs();
    }
}

#[test]
fn held_keys_and_buttons_are_released_on_a_minimized_window_and_nothing_activates_it() {
    // the background route: a key held through SendEvent, released through SendEvent
    let plain = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    let mut shared = Engine::start();
    shared
        .request("key_down", json!({"window": plain.target(), "key": "a"}))
        .unwrap();
    assert_eq!(plain.inputs(), vec![Input::KeyPress { sent: true }]);
    plain.minimize();
    plain.unfocus();
    shared
        .request("key_up", json!({"window": plain.target(), "key": "a"}))
        .expect("a release runs on a minimized window");
    assert_eq!(
        plain.inputs(),
        vec![Input::KeyRelease { sent: true }],
        "the release, and only it"
    );
    assert!(!plain.viewable() && !plain.has_focus(), "nothing activated the window");
    drop(shared);

    // the foreground route: xterm ignores synthetic keys, so in dedicated mode its key is held through XTEST
    let xterm = Probe::open("XTerm", (400, 0, 320, 200));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    xterm.unfocus();
    dedicated
        .request("key_down", json!({"window": xterm.target(), "key": "c"}))
        .unwrap();
    let c = keycode_of(&xterm.conn, 0x63);
    assert!(key_is_down(&xterm.conn, c), "held at the server");
    assert_eq!(xterm.inputs(), vec![Input::KeyPress { sent: false }]);
    xterm.minimize();
    xterm.unfocus();
    dedicated
        .request("key_up", json!({"window": xterm.target(), "key": "c"}))
        .expect("a foreground release runs on a minimized window");
    assert!(!key_is_down(&xterm.conn, c), "the key is up afterwards");
    assert!(!xterm.viewable() && !xterm.has_focus(), "the release activated nothing");
    drop(dedicated);

    // the desktop route: a drag_handle's button held over a window that is then minimized
    let under = Probe::open("MinimizedProbe", (0, 300, 320, 200));
    let mut engine = Engine::start();
    engine
        .request("drag_handle", json!({"action": "start", "x": 40, "y": 340}))
        .unwrap();
    assert!(button1_is_down(&under.conn), "held");
    under.minimize();
    engine
        .request("drag_handle", json!({"action": "end"}))
        .expect("the end runs");
    assert!(!button1_is_down(&under.conn), "the button is up afterwards");
    assert!(!under.viewable(), "nothing activated the window");
}

/// Plays the window manager's part for one activation: on the `_NET_ACTIVE_WINDOW` request naming `window`, waits
/// `delay`, then restores it, as Openbox deiconifies a window it is asked to activate.
fn map_on_activation(window: Window, delay: Duration) -> std::thread::JoinHandle<bool> {
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    let active = atom(&conn, "_NET_ACTIVE_WINDOW");
    let wm_state = atom(&conn, "WM_STATE");
    conn.change_window_attributes(
        root,
        &x11rb::protocol::xproto::ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
    )
    .unwrap();
    conn.sync().unwrap();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            match conn.poll_for_event().unwrap() {
                Some(Event::ClientMessage(m)) if m.type_ == active && m.window == window => {
                    sleep(delay);
                    conn.change_property32(PropMode::REPLACE, window, wm_state, wm_state, &[NORMAL_STATE, 0])
                        .unwrap();
                    conn.map_window(window).unwrap();
                    conn.sync().unwrap();
                    return true;
                }
                Some(_) => {}
                None => sleep(Duration::from_millis(2)),
            }
        }
        false
    })
}

#[test]
fn activating_a_minimized_window_waits_for_the_window_manager_to_map_it_then_focuses_it() {
    let probe = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    probe.minimize();
    probe.unfocus();
    let wm = map_on_activation(probe.id, WM_MAP_DELAY);
    let mut engine = Engine::start();
    let started = Instant::now();
    engine
        .request("activate_window", json!({"window": probe.target()}))
        .expect("the activation succeeds once the window is mapped");
    let took = started.elapsed();
    assert!(wm.join().unwrap(), "the stand-in window manager saw the request");
    assert!(probe.viewable() && probe.has_focus(), "restored and focused");
    assert!(
        took >= WM_MAP_DELAY && took < MAP_WAIT,
        "it waited for the map, and no longer: {took:?}"
    );
    eprintln!("activate_window on a minimized window: answered after {took:?}");
}

/// The window manager maps the window at once: its map can land between the engine's refused focus and its look at
/// the window, which must still set the focus again (the trial run's one failed activation in 18, M4's T4).
#[test]
fn activating_a_minimized_window_the_window_manager_maps_at_once_succeeds_every_time() {
    let probe = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    let mut engine = Engine::start();
    for round in 0..20 {
        probe.minimize();
        probe.unfocus();
        let wm = map_on_activation(probe.id, Duration::ZERO);
        engine
            .request("activate_window", json!({"window": probe.target()}))
            .unwrap_or_else(|e| panic!("round {round}: {e}"));
        assert!(
            wm.join().unwrap(),
            "round {round}: the stand-in window manager saw the request"
        );
        assert!(
            probe.viewable() && probe.has_focus(),
            "round {round}: restored and focused"
        );
    }
}

#[test]
fn activating_a_window_no_window_manager_maps_answers_the_focus_error_after_the_bound() {
    // both opened first: the last client leaving would reset the CI gate's Xvfb under the next one
    let withdrawn = Probe::open("MinimizedProbe", (0, 0, 320, 200));
    let minimized = Probe::open("MinimizedProbe", (400, 0, 320, 200));
    for (case, probe, unmap) in [
        ("withdrawn", &withdrawn, Probe::withdraw as fn(&Probe)),
        (
            "minimized, with no window manager to restore it",
            &minimized,
            Probe::minimize,
        ),
    ] {
        unmap(probe);
        probe.unfocus();
        let mut engine = Engine::start();
        let started = Instant::now();
        let error = engine
            .request("activate_window", json!({"window": probe.target()}))
            .expect_err("a window still unmapped at the bound cannot take the focus");
        let took = started.elapsed();
        assert!(
            error.starts_with(&format!("failed to focus X11 window {}: ", probe.id)) && error.contains("Match"),
            "{case}: the first error, as before: {error}"
        );
        assert!(
            took >= MAP_WAIT && took < MAP_WAIT * 2,
            "{case}: answered at the bound: {took:?}"
        );
        assert!(!probe.viewable() && !probe.has_focus(), "{case}");
        eprintln!("activate_window on a {case} window: answered after {took:?}");
    }
}
