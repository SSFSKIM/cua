//! The device mode and the capability report, live (Design, Device mode and the foreground route; The capability
//! report; Acceptance 8): the engine binary over its wire, against bare X windows of the test's own whose `WM_CLASS`
//! names a listed family (`families.rs`: xterm ignores synthetic keys always, Gecko ignores synthetic clicks unless
//! its window is fully unobscured). Each window records the input events it receives and whether each was synthetic
//! (`SendEvent`, the background route) or real (XTEST, the desktop and foreground routes), so "nothing was sent" and
//! "the foreground route" are read from the window itself, on a display with no window manager (the CI gate's Xvfb).
//!
//!   xvfb-run -a dbus-run-session -- cargo test --features live -- --test-threads 1

#![cfg(feature = "live")]

mod support;

use serde_json::{Value, json};
use std::thread::sleep;
use std::time::{Duration, Instant};
use support::Engine;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ConfigureWindowAux, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, StackMode, Window,
    WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

/// How long a window may take to show an event the engine sent, and how long one shows that nothing arrives.
const SETTLE: Duration = Duration::from_millis(400);
const SENTENCE: &str = " does not accept background input; use a dedicated desktop or activate the window first";

/// One input event a probe window received: its kind and whether it came through `SendEvent`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Input {
    KeyPress { sent: bool },
    KeyRelease { sent: bool },
    ButtonPress { button: u8, sent: bool },
    ButtonRelease { button: u8, sent: bool },
}

/// A bare top-level window of the test's own, on its own X connection, with this `WM_CLASS`; destroyed on drop.
struct Probe {
    conn: RustConnection,
    root: Window,
    id: Window,
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
        let title = format!("cua-engine-live-device-{class}-{}", std::process::id());
        conn.change_property8(
            PropMode::REPLACE,
            id,
            AtomEnum::WM_NAME,
            AtomEnum::STRING,
            title.as_bytes(),
        )
        .unwrap();
        conn.map_window(id).unwrap();
        conn.flush().unwrap();
        let probe = Probe { conn, root, id };
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(Event::MapNotify(_)) = probe.conn.poll_for_event().unwrap() {
                break;
            }
            assert!(Instant::now() < deadline, "the probe window maps");
            sleep(Duration::from_millis(10));
        }
        probe
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
                Event::ButtonPress(e) => Input::ButtonPress { button: e.detail, sent },
                Event::ButtonRelease(e) => Input::ButtonRelease { button: e.detail, sent },
                _ => continue,
            });
        }
        seen
    }

    /// Whether the X input focus is this window.
    fn has_focus(&self) -> bool {
        self.conn.get_input_focus().unwrap().reply().unwrap().focus == self.id
    }

    /// Whether this window is stacked above `other` among the root's children.
    fn above(&self, other: &Probe) -> bool {
        let children = self.conn.query_tree(self.root).unwrap().reply().unwrap().children;
        let at = |w| children.iter().position(|&c| c == w).unwrap();
        at(self.id) > at(other.id)
    }

    /// The input focus put on the root, as no window manager leaves it, so an activation shows.
    fn unfocus(&self) {
        self.conn
            .set_input_focus(
                x11rb::protocol::xproto::InputFocus::POINTER_ROOT,
                x11rb::NONE,
                x11rb::CURRENT_TIME,
            )
            .unwrap();
        self.conn.sync().unwrap();
    }

    /// Raised above every other window.
    fn raise(&self) {
        self.conn
            .configure_window(self.id, &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE))
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

/// The application name the engine's sentence uses for a window: `list_windows`' `app`.
fn app_of(engine: &mut Engine, window: Window) -> String {
    let windows = engine.request("list_windows", json!({})).unwrap();
    windows
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == json!(window))
        .and_then(|w| w["app"].as_str())
        .map(str::to_string)
        .expect("the probe window is listed")
}

fn sent(inputs: &[Input]) -> bool {
    inputs.iter().all(|i| match i {
        Input::KeyPress { sent } | Input::KeyRelease { sent } => *sent,
        Input::ButtonPress { sent, .. } | Input::ButtonRelease { sent, .. } => *sent,
    })
}

#[test]
fn capabilities_reports_the_x11_backend_and_the_device_mode_it_was_started_with() {
    let version = std::process::Command::new(support::engine_bin())
        .arg("--version")
        .output()
        .unwrap();
    let version = String::from_utf8(version.stdout).unwrap();
    let (semver, build) = version
        .trim()
        .strip_prefix("cua-engine ")
        .and_then(|rest| rest.split_once(' '))
        .expect("cua-engine <version> (<build>)");
    let build = build.trim_matches(|c| c == '(' || c == ')');
    for (options, mode) in [(&[][..], "shared"), (&["--desktop", "dedicated"][..], "dedicated")] {
        let mut engine = Engine::start_with(options);
        assert_eq!(
            engine.request("capabilities", json!({})),
            Ok(json!({
                "backend": "x11",
                "tree": "at_spi",
                "input": {"background": true, "desktop": true},
                "capture": {"window": "retained", "desktop": true},
                "text": {"paste": "verified", "literal": true},
                "desktop": mode,
                "version": semver,
                "build": build,
            }))
        );
    }
    let mut engine = Engine::start();
    assert!(
        engine
            .request("capabilities", json!({"extra": 1}))
            .unwrap_err()
            .contains("unknown field"),
        "capabilities takes no input"
    );
}

/// xterm (class `XTerm`) ignores synthetic keys always: in shared mode `press_key`, `key_down` and `key_up` are refused
/// with nothing sent; in dedicated mode the window is activated and the keys arrive through XTEST, a hold released on
/// the route it was made on. Its clicks are not listed and stay on the background route in either mode.
#[test]
fn keys_to_a_family_that_ignores_them_are_refused_when_shared_and_sent_to_the_activated_window_when_dedicated() {
    let xterm = Probe::open("XTerm", (0, 0, 320, 200));
    let mut shared = Engine::start();
    let refusal = format!("{}{SENTENCE}", app_of(&mut shared, xterm.id));
    for (command, input) in [
        ("press_key", json!({"window": xterm.target(), "key": "a"})),
        ("key_down", json!({"window": xterm.target(), "key": "shift"})),
        ("key_up", json!({"window": xterm.target(), "key": "shift"})),
        ("type_characters", json!({"window": xterm.target(), "text": "a"})),
    ] {
        assert_eq!(shared.request(command, input), Err(refusal.clone()), "{command}");
    }
    assert_eq!(xterm.inputs(), vec![], "nothing was sent");
    // a click is not a listed kind for xterm: the background route, synthetic events
    shared
        .request("click", json!({"window": xterm.target(), "x": 20, "y": 20}))
        .unwrap();
    let clicked = xterm.inputs();
    assert_eq!(clicked.len(), 2, "{clicked:?}");
    assert!(
        sent(&clicked),
        "the background route's events are synthetic: {clicked:?}"
    );
    drop(shared);

    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    xterm.unfocus();
    dedicated
        .request("press_key", json!({"window": xterm.target(), "key": "a"}))
        .unwrap();
    assert!(xterm.has_focus(), "the foreground route activated the window");
    let typed = xterm.inputs();
    assert_eq!(
        typed,
        vec![Input::KeyPress { sent: false }, Input::KeyRelease { sent: false }],
        "real key events, through XTEST"
    );
    // a bad key is refused before the window is activated
    xterm.unfocus();
    assert!(
        dedicated
            .request("press_key", json!({"window": xterm.target(), "key": "nosuchkey"}))
            .is_err()
    );
    assert!(!xterm.has_focus(), "a refused key activates nothing");
    // a hold made on the foreground route is released on it, the window activated again
    dedicated
        .request("key_down", json!({"window": xterm.target(), "key": "shift"}))
        .unwrap();
    assert_eq!(xterm.inputs(), vec![Input::KeyPress { sent: false }]);
    xterm.unfocus();
    dedicated
        .request("key_up", json!({"window": xterm.target(), "key": "shift"}))
        .unwrap();
    assert!(xterm.has_focus(), "activated again for the release");
    assert_eq!(xterm.inputs(), vec![Input::KeyRelease { sent: false }]);
    // no hold left: a second key_up is a no-op
    dedicated
        .request("key_up", json!({"window": xterm.target(), "key": "shift"}))
        .unwrap();
    assert_eq!(xterm.inputs(), vec![]);
}

/// Gecko (class `firefox`) ignores synthetic coordinate clicks unless its window is fully unobscured: fully visible,
/// the click takes the background route in shared mode; with another window over part of it, the click and an
/// element's right click are refused in shared mode with nothing sent, and in dedicated mode the window is activated,
/// raised and clicked through XTEST at the same window-relative point. Its keys are not listed.
#[test]
fn clicks_to_a_window_that_ignores_them_while_covered_are_refused_when_shared_and_sent_through_the_desktop_when_dedicated()
 {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let mut shared = Engine::start();
    let refusal = format!("{}{SENTENCE}", app_of(&mut shared, firefox.id));
    shared
        .request("click", json!({"window": firefox.target(), "x": 40, "y": 40}))
        .unwrap();
    let clicked = firefox.inputs();
    assert_eq!(clicked.len(), 2, "{clicked:?}");
    assert!(sent(&clicked), "fully unobscured: the background route: {clicked:?}");

    let cover = Probe::open("Cover", (200, 120, 200, 200));
    assert_eq!(
        shared.request("click", json!({"window": firefox.target(), "x": 40, "y": 40})),
        Err(refusal.clone()),
        "partly covered (the click point itself visible)"
    );
    assert_eq!(
        shared.request(
            "click",
            json!({"window": firefox.target(), "x": 40, "y": 40, "mouse_button": "right", "click_count": 2})
        ),
        Err(refusal.clone()),
    );
    shared
        .request("press_key", json!({"window": firefox.target(), "key": "a"}))
        .unwrap();
    let keyed = firefox.inputs();
    assert_eq!(keyed.len(), 2, "keys are not listed for Gecko: {keyed:?}");
    assert!(sent(&keyed));
    // its scrolls and pointer moves follow the clicks' rule
    for (command, input) in [
        (
            "scroll",
            json!({"window": firefox.target(), "x": 40, "y": 40, "direction": "down", "pixels": 100}),
        ),
        ("move", json!({"window": firefox.target(), "x": 60, "y": 60})),
    ] {
        assert_eq!(shared.request(command, input), Err(refusal.clone()), "{command}");
    }
    assert_eq!(firefox.inputs(), vec![], "nothing was sent");
    drop(shared);

    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    firefox.unfocus();
    cover.raise();
    assert!(cover.above(&firefox));
    // a point under the cover: the foreground route raises the window first, so the click lands in it
    dedicated
        .request("click", json!({"window": firefox.target(), "x": 300, "y": 180}))
        .unwrap();
    assert!(firefox.has_focus() && firefox.above(&cover), "activated and raised");
    assert_eq!(
        firefox.inputs(),
        vec![
            Input::ButtonPress { button: 1, sent: false },
            Input::ButtonRelease { button: 1, sent: false }
        ],
        "real button events, through XTEST"
    );
    assert_eq!(cover.inputs(), vec![], "nothing reached the window that covered it");
    // covered again: a scroll through the foreground route, one wheel step as real button 5 events
    firefox.unfocus();
    cover.raise();
    dedicated
        .request(
            "scroll",
            json!({"window": firefox.target(), "x": 300, "y": 180, "direction": "down", "pixels": 100}),
        )
        .unwrap();
    assert!(firefox.has_focus() && firefox.above(&cover));
    assert_eq!(
        firefox.inputs(),
        vec![
            Input::ButtonPress { button: 5, sent: false },
            Input::ButtonRelease { button: 5, sent: false }
        ]
    );
}
