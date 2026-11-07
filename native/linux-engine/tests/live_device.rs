//! The device mode and the capability report, live (Design, Device mode and the foreground route; The capability
//! report; Acceptance 8): the engine binary over its wire, against bare X windows of the test's own whose `WM_CLASS`
//! names a listed family (`families.rs`: xterm ignores synthetic keys always, Gecko ignores synthetic clicks unless
//! its window is fully unobscured). Each window records the input events it receives and whether each was synthetic
//! (`SendEvent`, the background route) or real (XTEST, the desktop and foreground routes), so "nothing was sent" and
//! "the foreground route" are read from the window itself, on a display with no window manager (the CI gate's Xvfb).
//!
//!   xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1

#![cfg(feature = "live")]

mod support;

use serde_json::{Value, json};
use std::sync::mpsc;
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

/// Chromium (class `Google-chrome`) takes a background drag only along a path that is visible in its window: with
/// its bottom half covered, a drag across its top half takes the background route; one whose path runs under the
/// cover is refused in shared mode with nothing sent.
#[test]
fn a_chromium_drag_takes_the_background_route_only_along_a_visible_path() {
    let chrome = Probe::open("Google-chrome", (0, 0, 400, 300));
    let _cover = Probe::open("Cover", (0, 150, 400, 150));
    let mut shared = Engine::start();
    let refusal = format!("{}{SENTENCE}", app_of(&mut shared, chrome.id));
    shared
        .request(
            "drag",
            json!({"window": chrome.target(), "path": [{"x": 20, "y": 20}, {"x": 200, "y": 120}]}),
        )
        .unwrap();
    let dragged = chrome.inputs();
    assert_eq!(dragged.len(), 2, "a press and a release: {dragged:?}");
    assert!(sent(&dragged), "the background route: {dragged:?}");
    for path in [
        json!([{"x": 20, "y": 20}, {"x": 200, "y": 200}]),
        json!([{"x": 20, "y": 140}, {"x": 380, "y": 140}, {"x": 380, "y": 160}]),
    ] {
        assert_eq!(
            shared.request("drag", json!({"window": chrome.target(), "path": path})),
            Err(refusal.clone()),
            "a path ending under the cover"
        );
    }
    assert_eq!(chrome.inputs(), vec![], "nothing was sent");
}

/// A window of the test's own, classed `Google-chrome`, whose client takes `XdndSelection` once a drag's held motion
/// reaches it, as an XDND source does when its drag and drop begins, and, with `OnRelease::Focuses`, takes the X input
/// focus on the button's release unless an Escape came first, as Chrome's drop activates its window. With
/// `OnRelease::TakesLate` it takes nothing during the drag: shortly after the button's release it takes `XdndSelection`
/// and the input focus, a drag and drop that began after the drag's last motion. With `OnRelease::TakesAfter` it takes
/// `XdndSelection` that long after the press, while the button is still down, whatever motion came: a renderer that
/// starts the drag and drop after a short path has ended (task 22). It records the input events it receives until told
/// to stop, and the motions that came after its take (`AFTER_TAKE_MOTIONS`).
fn drag_source(on_release: OnRelease) -> (Window, mpsc::Sender<()>, std::thread::JoinHandle<Vec<Input>>) {
    let (ready, window) = mpsc::channel();
    let (stop, stopped) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let probe = Probe::open("Google-chrome", (0, 0, 400, 300));
        let mask = EventMask::KEY_PRESS
            | EventMask::KEY_RELEASE
            | EventMask::BUTTON_PRESS
            | EventMask::BUTTON_RELEASE
            | EventMask::BUTTON1_MOTION
            | EventMask::FOCUS_CHANGE;
        probe
            .conn
            .change_window_attributes(
                probe.id,
                &x11rb::protocol::xproto::ChangeWindowAttributesAux::new().event_mask(mask),
            )
            .unwrap();
        let selection = probe
            .conn
            .intern_atom(false, b"XdndSelection")
            .unwrap()
            .reply()
            .unwrap()
            .atom;
        probe.conn.sync().unwrap();
        ready.send(probe.id).unwrap();
        let take = |probe: &Probe| {
            probe
                .conn
                .set_selection_owner(probe.id, selection, x11rb::CURRENT_TIME)
                .unwrap();
            probe.conn.flush().unwrap();
        };
        let focus = |probe: &Probe| {
            probe
                .conn
                .set_input_focus(
                    x11rb::protocol::xproto::InputFocus::PARENT,
                    probe.id,
                    x11rb::CURRENT_TIME,
                )
                .unwrap();
            probe.conn.flush().unwrap();
        };
        let mut seen = Vec::new();
        let mut taken = matches!(
            on_release,
            OnRelease::TakesLate | OnRelease::TakesLateAfter(_) | OnRelease::NeverTakes | OnRelease::TakesAfter(_)
        );
        let mut late_take: Option<Instant> = None;
        let mut took_at: Option<Instant> = None;
        let mut pressed_at: Option<Instant> = None;
        *TAKE_TO_RELEASE.lock().unwrap() = None;
        *PRESS_TO_RELEASE.lock().unwrap() = None;
        AFTER_TAKE_MOTIONS.lock().unwrap().clear();
        ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clear();
        while stopped.try_recv().is_err() {
            if let (OnRelease::TakesAfter(after), Some(pressed), None) = (on_release, pressed_at, took_at)
                && pressed.elapsed() >= after
                && !seen.iter().any(|i| matches!(i, Input::ButtonRelease { .. }))
            {
                take(&probe);
                took_at = Some(Instant::now());
            }
            while let Some(event) = probe.conn.poll_for_event().unwrap() {
                let sent = event.sent_event();
                match event {
                    Event::MotionNotify(_) if !taken => {
                        take(&probe);
                        took_at = Some(Instant::now());
                        taken = true;
                    }
                    Event::MotionNotify(e) if took_at.is_some() => {
                        AFTER_TAKE_MOTIONS.lock().unwrap().push((e.event_x, e.event_y));
                    }
                    Event::FocusOut(_) if sent => {
                        ESCAPES_AND_FOCUS_OUTS
                            .lock()
                            .unwrap()
                            .push(("focus-out", Instant::now()));
                    }
                    Event::KeyPress(_) => {
                        if sent {
                            ESCAPES_AND_FOCUS_OUTS.lock().unwrap().push(("escape", Instant::now()));
                        }
                        if let Some(took) = late_take.take() {
                            *TAKE_TO_ESCAPE.lock().unwrap() = Some(took.elapsed());
                        }
                        seen.push(Input::KeyPress { sent })
                    }
                    Event::KeyRelease(_) => seen.push(Input::KeyRelease { sent }),
                    Event::ButtonPress(e) => {
                        pressed_at = Some(Instant::now());
                        seen.push(Input::ButtonPress { button: e.detail, sent })
                    }
                    Event::ButtonRelease(e) => {
                        seen.push(Input::ButtonRelease { button: e.detail, sent });
                        *TAKE_TO_RELEASE.lock().unwrap() = took_at.map(|t| t.elapsed());
                        *PRESS_TO_RELEASE.lock().unwrap() = pressed_at.map(|t| t.elapsed());
                        let escaped = seen.contains(&Input::KeyPress { sent: true });
                        match on_release {
                            OnRelease::Focuses if !escaped => focus(&probe),
                            OnRelease::TakesLate => {
                                sleep(LATE_TAKE);
                                take(&probe);
                                late_take = Some(Instant::now());
                                focus(&probe);
                            }
                            OnRelease::TakesLateAfter(after) => {
                                sleep(after);
                                take(&probe);
                                late_take = Some(Instant::now());
                            }
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }
            sleep(Duration::from_millis(1));
        }
        seen
    });
    (window.recv().unwrap(), stop, handle)
}

/// How long after the release a late drag and drop begins (`OnRelease::TakesLate`): well inside the engine's settle.
const LATE_TAKE: Duration = Duration::from_millis(30);

/// What the drag source does on the button's release.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OnRelease {
    Nothing,
    Focuses,
    TakesLate,
    /// `XdndSelection` taken this long after the release, the focus left alone: a drag and drop that begins after the
    /// drag, late enough that an exit straight after the drag's answer would have drained its FocusOut by then.
    TakesLateAfter(Duration),
    /// No take at all, during the drag or after it: an ordinary drag.
    NeverTakes,
    /// A take this long after the press, the button still down, whatever motion came.
    TakesAfter(Duration),
}

/// The window-relative places of the motions the last drag's source saw after its take.
static AFTER_TAKE_MOTIONS: std::sync::Mutex<Vec<(i16, i16)>> = std::sync::Mutex::new(Vec::new());

/// How long the last late take (`OnRelease::TakesLate`) waited for the engine's Escape, as its source saw it.
static TAKE_TO_ESCAPE: std::sync::Mutex<Option<Duration>> = std::sync::Mutex::new(None);

/// The synthetic Escape presses and synthetic `FocusOut`s the last drag's source received, in order, each with when it
/// arrived.
static ESCAPES_AND_FOCUS_OUTS: std::sync::Mutex<Vec<(&'static str, Instant)>> = std::sync::Mutex::new(Vec::new());

/// How long after its take of `XdndSelection` the last drag's source saw the button's release (None: no take), and how
/// long after the press: what the release schedule after a take is measured by.
static TAKE_TO_RELEASE: std::sync::Mutex<Option<Duration>> = std::sync::Mutex::new(None);
static PRESS_TO_RELEASE: std::sync::Mutex<Option<Duration>> = std::sync::Mutex::new(None);

/// The input focus on no window, so a drop's activation shows.
fn focus_nothing() {
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    conn.set_input_focus(
        x11rb::protocol::xproto::InputFocus::NONE,
        x11rb::NONE,
        x11rb::CURRENT_TIME,
    )
    .unwrap();
    conn.sync().unwrap();
}

/// The root's `_NET_ACTIVE_WINDOW` set to `window`, as a window manager would, or deleted with `None`.
fn set_active_window(window: Option<Window>) {
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    let atom = conn
        .intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .unwrap()
        .reply()
        .unwrap()
        .atom;
    match window {
        Some(window) => {
            conn.change_property32(PropMode::REPLACE, root, atom, AtomEnum::WINDOW, &[window])
                .unwrap();
        }
        None => {
            conn.delete_property(root, atom).unwrap();
        }
    }
    conn.sync().unwrap();
}

/// The drag-and-drop candidate: in shared mode a background drag into Chromium whose target takes `XdndSelection`
/// mid-drag is cancelled before the drop, Escape and then the release, and refused; in dedicated mode it is not watched
/// and ends with its release as any drag does.
#[test]
fn a_drag_that_becomes_a_drag_and_drop_is_cancelled_before_the_drop_when_shared() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::Focuses);
    focus_nothing();
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Err(format!(
            "{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was \
             dropped. Use a dedicated desktop, or activate the window first"
        ))
    );
    let answered = Instant::now();
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "Escape before the release"
    );
    // a drag cancelled in time arms no late-take watch: its session ends at once, before the drop signature's look
    // (300 ms with no signature here), not held back as a watched drag's is
    let order = ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clone();
    assert_eq!(
        order.iter().map(|(what, _)| *what).collect::<Vec<_>>(),
        ["escape", "focus-out"]
    );
    assert!(
        answered.saturating_duration_since(order[1].1) > Duration::from_millis(150),
        "the FocusOut {:?} before the answer",
        answered.saturating_duration_since(order[1].1)
    );
    drop(shared);
    let (window, stop, recorder) = drag_source(OnRelease::Nothing);
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    dedicated
        .request("drag", json!({"window": {"id": window}, "path": path}))
        .unwrap();
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "dedicated: the drop goes ahead"
    );
}

/// The answer stays honest when the cancel comes too late (Acceptance 8's forced-late case, through the measurement
/// option that holds the Escape until after the release): the drop took the focus, so the answer says the drop may
/// have happened and never that nothing was dropped.
#[test]
fn a_cancel_too_late_answers_that_the_drop_may_have_happened() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::Focuses);
    focus_nothing();
    let mut late = Engine::start_with(&["--dnd-cancel-after-release"]);
    let app = app_of(&mut late, window);
    assert_eq!(
        late.request("drag", json!({"window": {"id": window}, "path": path})),
        Err(format!(
            "{app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop \
             may have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
        ))
    );
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
        ],
        "the release, then the Escape"
    );
}

/// A drag into Chrome already in front (the active window, holding the focus, fully unobscured) is not watched in
/// shared mode: its drop changes nothing the person sees, so it goes ahead.
#[test]
fn a_drag_into_chrome_already_in_front_drops_when_shared() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::Nothing);
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    conn.set_input_focus(x11rb::protocol::xproto::InputFocus::PARENT, window, x11rb::CURRENT_TIME)
        .unwrap();
    conn.sync().unwrap();
    set_active_window(Some(window));
    let mut shared = Engine::start();
    let dragged = shared.request("drag", json!({"window": {"id": window}, "path": path}));
    set_active_window(None);
    dragged.unwrap();
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "the drop goes ahead, no Escape"
    );
}

/// A drag and drop the engine lets drop (Chrome already in front in shared mode, or a dedicated desktop) holds its
/// release until 350 ms after the source's take, spacing the path's remaining steps (task 18: Chrome sends XdndDrop only
/// once its target has accepted, and a source that stalls after its drag starts accepts up to about 200 ms after the
/// take); a drag whose source takes nothing keeps its own pace.
#[test]
fn a_drag_and_drop_the_engine_lets_drop_is_released_no_sooner_than_350_ms_after_the_take() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    for args in [&[][..], &["--desktop", "dedicated"][..]] {
        let (window, stop, recorder) = drag_source(OnRelease::Nothing);
        in_front(window);
        let mut engine = Engine::start_with(args);
        let dragged = engine.request("drag", json!({"window": {"id": window}, "path": path}));
        set_active_window(None);
        dragged.unwrap();
        sleep(SETTLE);
        stop.send(()).unwrap();
        recorder.join().unwrap();
        let after_take = TAKE_TO_RELEASE.lock().unwrap().expect("the source took XdndSelection");
        assert!(
            after_take >= Duration::from_millis(345),
            "{args:?}: released {after_take:?} after the take"
        );
        assert!(
            after_take < Duration::from_millis(600),
            "{args:?}: released {after_take:?} after the take"
        );
    }
    // no take: the drag keeps its pace, then holds its button for a take until 250 ms after the press (task 22), well
    // under the 350 ms after a take
    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    in_front(window);
    let mut engine = Engine::start();
    let dragged = engine.request("drag", json!({"window": {"id": window}, "path": path}));
    set_active_window(None);
    dragged.unwrap();
    sleep(SETTLE);
    stop.send(()).unwrap();
    recorder.join().unwrap();
    let whole = PRESS_TO_RELEASE.lock().unwrap().expect("a press and a release");
    assert!(whole < Duration::from_millis(300), "a plain drag took {whole:?}");
}

/// A short drag whose source takes `XdndSelection` only after the path has ended, as Chrome's renderer does when it gets
/// the drag's first moves late (task 22, `m3-gate-final`'s cold misses): the button stays down for the take, and the
/// release comes no sooner than 350 ms after it, the floor filled with motions on the path's last two samples that end
/// on the last; with no take at all, the drag holds until 250 ms after the press, is released, answers success, and
/// sends no motion past its path.
#[test]
fn a_take_after_a_short_path_s_end_is_held_for_and_its_floor_filled_with_motions_ending_on_the_last_sample() {
    // 40 px: the path ends about 20 ms after the press
    let path = json!([{"x": 20, "y": 20}, {"x": 60, "y": 20}]);
    for args in [&[][..], &["--desktop", "dedicated"][..]] {
        let (window, stop, recorder) = drag_source(OnRelease::TakesAfter(Duration::from_millis(80)));
        in_front(window);
        let mut engine = Engine::start_with(args);
        let dragged = engine.request("drag", json!({"window": {"id": window}, "path": path}));
        set_active_window(None);
        dragged.unwrap();
        sleep(SETTLE);
        stop.send(()).unwrap();
        recorder.join().unwrap();
        let after_take = TAKE_TO_RELEASE
            .lock()
            .unwrap()
            .expect("the source took XdndSelection before the release");
        assert!(
            after_take >= Duration::from_millis(345) && after_take < Duration::from_millis(600),
            "{args:?}: released {after_take:?} after the take"
        );
        let motions = AFTER_TAKE_MOTIONS.lock().unwrap().clone();
        assert!(
            motions.len() >= 20,
            "{args:?}: the floor filled with motions: {motions:?}"
        );
        assert_eq!(motions.last(), Some(&(60, 20)), "{args:?}: ending on the last sample");
        assert!(
            motions.iter().all(|m| *m == (59, 20) || *m == (60, 20)),
            "{args:?}: on the path's last two samples: {motions:?}"
        );
    }
    // no take at all: held to 250 ms after the press, released, answered success, and no keepalive
    for args in [&[][..], &["--desktop", "dedicated"][..]] {
        let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
        in_front(window);
        let mut engine = Engine::start_with(args);
        let started = Instant::now();
        let dragged = engine.request("drag", json!({"window": {"id": window}, "path": path}));
        let answered = started.elapsed();
        set_active_window(None);
        assert_eq!(
            dragged.unwrap(),
            Value::Null,
            "{args:?}: an ordinary drag answers success"
        );
        sleep(SETTLE);
        stop.send(()).unwrap();
        recorder.join().unwrap();
        let whole = PRESS_TO_RELEASE.lock().unwrap().expect("a press and a release");
        assert!(
            whole >= Duration::from_millis(245) && whole < Duration::from_millis(330),
            "{args:?}: released {whole:?} after the press"
        );
        assert!(
            answered >= Duration::from_millis(245),
            "{args:?}: answered after {answered:?}"
        );
        assert!(TAKE_TO_RELEASE.lock().unwrap().is_none());
        assert!(
            AFTER_TAKE_MOTIONS.lock().unwrap().is_empty(),
            "{args:?}: keepalives only after a take"
        );
    }
}

/// The window given `WM_STATE` (normal), as a window manager marks the clients it manages, so the engine finds it as
/// the client under a desktop point (`X11::client_at`); the test's display has no window manager to do it.
fn managed(window: Window) {
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let state = conn.intern_atom(false, b"WM_STATE").unwrap().reply().unwrap().atom;
    conn.change_property32(PropMode::REPLACE, window, state, state, &[1, x11rb::NONE])
        .unwrap();
    conn.sync().unwrap();
}

/// The same release schedule on a drag that names no window (the desktop route, XTEST): the engine resolves the window
/// under the path's start for the drag's pacing, and a Chromium drop there is as much the engine's to let land, in
/// either mode, as one into a named window in front (task 18 review).
#[test]
fn a_windowless_drag_and_drop_over_chromium_is_released_no_sooner_than_350_ms_after_the_take() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    for args in [&[][..], &["--desktop", "dedicated"][..]] {
        let (window, stop, recorder) = drag_source(OnRelease::Nothing);
        managed(window);
        let mut engine = Engine::start_with(args);
        engine.request("drag", json!({"path": path})).unwrap();
        sleep(SETTLE);
        stop.send(()).unwrap();
        let seen = recorder.join().unwrap();
        assert_eq!(
            seen,
            vec![
                Input::ButtonPress { button: 1, sent: false },
                Input::ButtonRelease { button: 1, sent: false },
            ],
            "{args:?}: the desktop route's press and release, nothing else"
        );
        let after_take = TAKE_TO_RELEASE.lock().unwrap().expect("the source took XdndSelection");
        assert!(
            after_take >= Duration::from_millis(345),
            "{args:?}: released {after_take:?} after the take"
        );
        assert!(
            after_take < Duration::from_millis(600),
            "{args:?}: released {after_take:?} after the take"
        );
    }
}

/// A drag and drop that begins only after the drag's release (the source takes `XdndSelection` and the focus 30 ms
/// after it, where no look during the drag could see it): the drag answers at its release as a plain drag; the watch,
/// told the instant the button went up, sends the cancel's Escape within a few milliseconds of the take, not after any
/// wait of the drag's own; a read runs, and the first acting request answers the notice, not run, with
/// nothing sent (the design session's rulings, 2026-10-31).
#[test]
fn a_drag_and_drop_that_begins_after_the_release_is_reported_by_the_next_acting_request() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::TakesLate);
    focus_nothing();
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    *TAKE_TO_ESCAPE.lock().unwrap() = None;
    let started = Instant::now();
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null),
        "no take by the release: a plain drag"
    );
    let answered = started.elapsed();
    sleep(SETTLE);
    let waited = TAKE_TO_ESCAPE
        .lock()
        .unwrap()
        .expect("the watch's Escape reached the source");
    assert!(
        waited < Duration::from_millis(50),
        "the Escape {waited:?} after the take: at once"
    );
    assert!(shared.request("list_windows", json!({})).is_ok(), "a read runs");
    assert_eq!(
        shared.request("click", json!({"window": {"id": window}, "x": 50, "y": 50})),
        Err(format!(
            "{app} started a drag and drop after your drag ended; it may have dropped and changed the desktop; this \
             request was not run, so read the window before sending it again"
        ))
    );
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
        ],
        "the release, the watch's Escape, and nothing of the refused click"
    );
    // the same drag unwatched (dedicated mode: the same route and pacing) takes about as long: no settle on the
    // request path
    let (window, stop, recorder) = drag_source(OnRelease::Nothing);
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    let started = Instant::now();
    dedicated
        .request("drag", json!({"window": {"id": window}, "path": path}))
        .unwrap();
    let unwatched = started.elapsed();
    stop.send(()).unwrap();
    let _ = recorder.join();
    assert!(
        answered < unwatched + Duration::from_millis(150),
        "no settle on the request path: {answered:?} against {unwatched:?} unwatched"
    );
}

/// How long after the release the exit test's late drag and drop begins: well after the drag answered, inside the
/// watch's 300 ms.
const EXIT_LATE_TAKE: Duration = Duration::from_millis(200);

/// The exit's settle after the last key to a window it holds redirected (`settle::EXIT_SETTLE`).
const EXIT_SETTLE: Duration = Duration::from_millis(300);

/// An engine stopped straight after a watched drag's answer, with the after-release watch still armed: a drag and drop
/// that begins well after the drag answered is still cancelled. The drag's session is still open, kept focused while
/// its watch is armed (the design session's ruling on task 60); the watch runs out its lifetime, its Escape reaches the
/// source inside that session, the session's `FocusOut` follows, and the engine exits only once the exit's settle has
/// passed since that Escape, so the redirect it would drop cannot cut it (the re-review of T7's first fix: a safety
/// Escape cut at exit lets a late drop land).
#[test]
fn an_exit_inside_the_watch_s_lifetime_still_cancels_a_late_drag_and_drop_and_settles_after_its_escape() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::TakesLateAfter(EXIT_LATE_TAKE));
    focus_nothing();
    let mut shared = Engine::start();
    *TAKE_TO_ESCAPE.lock().unwrap() = None;
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null),
        "no take by the release: a plain drag"
    );
    let answered = Instant::now();
    shared.signal(rustix::process::Signal::TERM);
    let (status, exited) = shared.exit_within(Duration::from_secs(5)).expect("the engine exits");
    assert_eq!(status.code(), Some(143), "an orderly exit");
    // the source reads on, so a late event would still be seen
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
        ],
        "the drag, then the watch's Escape"
    );
    let waited = TAKE_TO_ESCAPE
        .lock()
        .unwrap()
        .expect("the watch's Escape reached the source");
    assert!(
        waited < Duration::from_millis(50),
        "the Escape {waited:?} after the take"
    );
    let order = ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clone();
    assert_eq!(
        order.iter().map(|(what, _)| *what).collect::<Vec<_>>(),
        vec!["escape", "focus-out"],
        "the watch's Escape inside the drag's session, then its FocusOut, after the watch ran out"
    );
    // the source reads the Escape at most a poll after it arrived (it reads the FocusOut only after its own wait for the
    // late take, so that read's time says nothing)
    assert!(
        exited >= order[0].1 + EXIT_SETTLE - Duration::from_millis(20),
        "the exit settled after the Escape: {:?}",
        exited.saturating_duration_since(order[0].1)
    );
    assert!(
        exited - answered >= EXIT_LATE_TAKE,
        "the exit waited for the watch: {:?}",
        exited - answered
    );
    // the take, then the exit's settle after the Escape (300 ms), and no more: not the 1 s backstop
    assert!(
        exited - answered < EXIT_LATE_TAKE + Duration::from_millis(300 + 250),
        "{:?}",
        exited - answered
    );
}

/// The after-release watch's lifetime after the release (`dnd::SETTLE`).
const WATCH: Duration = Duration::from_millis(300);

/// A watched drag's session stays focused until its late-take watch ends, with no request to end it (the design
/// session's ruling on task 60): a take well after the drag answered gets its Escape inside the session, and the
/// session's `FocusOut` follows only then, by the watch's end 300 ms after the release, whether a take came or not.
#[test]
fn a_watched_drag_s_focus_out_waits_for_its_watch_to_end_so_a_late_take_s_escape_comes_inside_the_session() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    for take in [Some(EXIT_LATE_TAKE), None] {
        let (window, stop, recorder) = drag_source(match take {
            Some(after) => OnRelease::TakesLateAfter(after),
            None => OnRelease::NeverTakes,
        });
        focus_nothing();
        let mut shared = Engine::start();
        assert_eq!(
            shared.request("drag", json!({"window": {"id": window}, "path": path})),
            Ok(Value::Null),
            "no take by the release: a plain drag"
        );
        let answered = Instant::now();
        // no request comes: the watch's end alone ends the session
        sleep(WATCH + Duration::from_millis(300));
        stop.send(()).unwrap();
        recorder.join().unwrap();
        let order = ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clone();
        let what: Vec<_> = order.iter().map(|(what, _)| *what).collect();
        match take {
            Some(_) => assert_eq!(
                what,
                ["escape", "focus-out"],
                "the Escape inside the session, then its FocusOut"
            ),
            None => assert_eq!(what, ["focus-out"], "a quiet watch: the FocusOut alone"),
        }
        let focus_out = order.last().expect("the drag's FocusOut").1 - answered;
        // the source reads the FocusOut after its own wait for the late take at most, so only the quiet watch's time
        // is read to the millisecond
        if take.is_none() {
            assert!(
                focus_out >= WATCH - Duration::from_millis(30),
                "held back until the watch's end: {focus_out:?} after the answer"
            );
        }
        assert!(
            focus_out < WATCH + Duration::from_millis(100),
            "no later than the watch's end: {focus_out:?} after the answer"
        );
        drop(shared);
    }
}

/// An acting request inside a watched drag's watch stops the watch and ends the drag's session before its own input:
/// the drag's `FocusOut` goes with that request, not at the watch's end.
#[test]
fn an_acting_request_inside_the_watch_ends_the_watched_drag_s_session_first() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    focus_nothing();
    let mut shared = Engine::start();
    shared
        .request("drag", json!({"window": {"id": window}, "path": path}))
        .unwrap();
    let answered = Instant::now();
    shared
        .request("click", json!({"window": {"id": window}, "x": 50, "y": 50}))
        .unwrap();
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "the drag, then the click"
    );
    let order = ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clone();
    assert_eq!(
        order.iter().map(|(what, _)| *what).collect::<Vec<_>>(),
        ["focus-out", "focus-out"],
        "the drag's session, then the click's"
    );
    let drag_s = order[0].1 - answered;
    assert!(
        drag_s < WATCH / 2,
        "the drag's FocusOut with the click, not at the watch's end: {drag_s:?} after the drag's answer"
    );
}

/// The exit's first act is the release of what the engine holds (the design session's ruling, M4 T7b): a key held at
/// the server is up at once after the stop, before the watch's wait (the take comes `EXIT_LATE_TAKE` after the answer),
/// and the watch still runs out and cancels its late take.
#[test]
fn the_exit_releases_a_held_key_before_it_waits_out_the_late_take_watch() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::TakesLateAfter(EXIT_LATE_TAKE));
    focus_nothing();
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let shift = keycode_of(&conn, 0xffe1);
    let held = |conn: &RustConnection| {
        let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
        keys[usize::from(shift / 8)] & (1 << (shift % 8)) != 0
    };
    let mut shared = Engine::start();
    *TAKE_TO_ESCAPE.lock().unwrap() = None;
    shared.request("key_down", json!({"key": "shift"})).unwrap();
    assert!(held(&conn), "Shift down at the server");
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null)
    );
    let answered = Instant::now();
    shared.signal(rustix::process::Signal::TERM);
    let mut up = None;
    while up.is_none() && answered.elapsed() < Duration::from_secs(3) {
        if !held(&conn) {
            up = Some(answered.elapsed());
        }
        sleep(Duration::from_millis(2));
    }
    let (status, exited) = shared.exit_within(Duration::from_secs(5)).expect("the engine exits");
    assert_eq!(status.code(), Some(143), "an orderly exit");
    sleep(SETTLE);
    stop.send(()).unwrap();
    recorder.join().unwrap();
    let up = up.expect("Shift released at the server");
    assert!(
        up < EXIT_LATE_TAKE / 2,
        "released at once, before the watch's wait: {up:?}"
    );
    assert!(
        TAKE_TO_ESCAPE.lock().unwrap().is_some(),
        "the watch still ran out and cancelled its late take"
    );
    let order = ESCAPES_AND_FOCUS_OUTS.lock().unwrap().clone();
    assert_eq!(
        order.iter().map(|(what, _)| *what).collect::<Vec<_>>(),
        vec!["escape", "focus-out"],
        "the watch's Escape after the release, inside the drag's session, then its FocusOut"
    );
    assert!(
        exited >= order[0].1 + EXIT_SETTLE - Duration::from_millis(20),
        "the exit settled after the Escape: {:?}",
        exited.saturating_duration_since(order[0].1)
    );
    assert!(exited - answered >= EXIT_LATE_TAKE, "{:?}", exited - answered);
}

/// The forced late take (`--dnd-defer-take`) with a key held at the server: the release of the held key runs and the
/// key is up at the server, a read runs, the first acting request (a click) answers the notice, not run, and the one
/// after it runs.
#[test]
fn a_late_drag_and_drop_lets_releases_and_reads_run_and_refuses_the_next_acting_request() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::Focuses);
    focus_nothing();
    let mut deferred = Engine::start_with(&["--dnd-defer-take"]);
    let app = app_of(&mut deferred, window);
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let shift = keycode_of(&conn, 0xffe1);
    let held = |conn: &RustConnection| {
        let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
        keys[usize::from(shift / 8)] & (1 << (shift % 8)) != 0
    };
    deferred.request("key_down", json!({"key": "shift"})).unwrap();
    assert!(held(&conn), "Shift down at the server");
    assert_eq!(
        deferred.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null)
    );
    sleep(SETTLE);
    assert_eq!(
        deferred.request("key_up", json!({"key": "shift"})),
        Ok(Value::Null),
        "a release runs"
    );
    assert!(!held(&conn), "Shift up at the server");
    assert!(deferred.request("list_windows", json!({})).is_ok(), "a read runs");
    assert_eq!(
        deferred.request("click", json!({"window": {"id": window}, "x": 50, "y": 50})),
        Err(format!(
            "{app} started a drag and drop after your drag ended; it may have dropped and changed the desktop; this \
             request was not run, so read the window before sending it again"
        ))
    );
    deferred
        .request("click", json!({"window": {"id": window}, "x": 50, "y": 50}))
        .unwrap();
    // the click answers as soon as its release and its FocusOut are sent: the recorder
    // reads on until the release has arrived
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
            Input::KeyRelease { sent: false },
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "the drop went ahead at the release, the Escape came after, Shift's release through XTEST (the source has the \
         focus since its drop), the refused click sent nothing, the next one ran"
    );
}

/// `preflight`, the request a caller sends before changing the desktop by another route (cua's wrapper launching an
/// application through the supervisor, after a `list_apps` read): it acts, so after a late take it answers the notice
/// and the one after it runs; after a failed watch it answers the watch-failure sentence. It sends nothing either way.
#[test]
fn preflight_answers_a_pending_late_drag_and_drop_or_watch_failure_as_an_acting_request_and_sends_nothing() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::Focuses);
    focus_nothing();
    let mut deferred = Engine::start_with(&["--dnd-defer-take"]);
    let app = app_of(&mut deferred, window);
    assert_eq!(
        deferred.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null)
    );
    sleep(SETTLE);
    assert!(
        deferred.request("list_apps", json!({})).is_ok(),
        "the launch's read runs"
    );
    assert_eq!(
        deferred.request("preflight", json!({})),
        Err(format!(
            "{app} started a drag and drop after your drag ended; it may have dropped and changed the desktop; this \
             request was not run, so read the window before sending it again"
        ))
    );
    assert_eq!(
        deferred.request("preflight", json!({})),
        Ok(Value::Null),
        "reported once"
    );
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
        ],
        "the drag, the watch's Escape, and nothing from either preflight"
    );

    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    focus_nothing();
    let mut lost = Engine::start_with_fault(&[], "late-watch-disconnect");
    let app = app_of(&mut lost, window);
    assert_eq!(
        lost.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null)
    );
    sleep(SETTLE);
    let sentence = lost
        .request("preflight", json!({}))
        .expect_err("the failed watch is the answer");
    assert!(
        sentence.starts_with(&format!("the drag-and-drop watch after your drag into {app} failed (")),
        "{sentence}"
    );
    assert_eq!(
        lost.request("preflight", json!({"x": 1})),
        Err("failed to parse command input: unknown field `x`, there are no fields".into()),
        "it takes no input"
    );
    stop.send(()).unwrap();
    assert_eq!(recorder.join().unwrap().len(), 2, "the drag's press and release alone");
}

/// The keycode of a keysym on the server's keyboard mapping.
fn keycode_of(conn: &RustConnection, keysym: u32) -> u8 {
    let setup = conn.setup();
    let (min, max) = (setup.min_keycode, setup.max_keycode);
    let map = conn.get_keyboard_mapping(min, max - min + 1).unwrap().reply().unwrap();
    let per = usize::from(map.keysyms_per_keycode);
    let at = map
        .keysyms
        .iter()
        .position(|&k| k == keysym)
        .expect("the keysym is mapped");
    min + (at / per) as u8
}

/// A watch that fails after the release (the live build's fault injection) never lets the next acting request run
/// as though nothing happened. Its connection killed by the server: a read runs, the click is refused with the
/// watch-failure sentence and sends nothing. Its thread panicked: the engine's release profile aborts on a panic, so
/// the engine ends and nothing more is sent. The panic comes when the watch hears of the release, off the request path,
/// so the drag's own answer, which goes as soon as its release is sent, may
/// or may not be out first; the next request is never answered.
#[test]
fn a_failed_after_release_watch_never_lets_the_next_acting_request_run() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    focus_nothing();
    let mut lost = Engine::start_with_fault(&[], "late-watch-disconnect");
    let app = app_of(&mut lost, window);
    assert_eq!(
        lost.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null)
    );
    sleep(SETTLE);
    assert!(lost.request("list_windows", json!({})).is_ok(), "a read runs");
    let sentence = lost
        .request("click", json!({"window": {"id": window}, "x": 50, "y": 50}))
        .expect_err("the click is refused");
    assert!(
        sentence.starts_with(&format!("the drag-and-drop watch after your drag into {app} failed ("))
            && sentence.ends_with(
                "), so a drop may have happened unseen and changed the desktop; this request was not run, so read the \
                 window before sending it again"
            ),
        "{sentence}"
    );
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "the refused click sent nothing"
    );
    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    let mut panicked = Engine::start_with_fault(&[], "late-watch-panic");
    let dragged = panicked.try_request("drag", json!({"window": {"id": window}, "path": path}));
    assert!(
        matches!(dragged, None | Some(Ok(Value::Null))),
        "the drag answered as a drag, or the engine ended first: {dragged:?}"
    );
    assert_eq!(
        panicked.try_request("click", json!({"window": {"id": window}, "x": 50, "y": 50})),
        None,
        "the engine ended instead of answering"
    );
    sleep(SETTLE);
    stop.send(()).unwrap();
    let seen = recorder.join().unwrap();
    assert!(
        !seen.iter().skip(2).any(|i| matches!(i, Input::ButtonPress { .. })),
        "nothing after the drag: {seen:?}"
    );
}

/// The X clients a process holds open, by their resource-id base, as the server reports them (X-Resource
/// `QueryClientIds`, by local process id): read from outside, so it finds a shipped binary's connections as they are.
fn clients_of(conn: &RustConnection, pid: u32) -> Vec<u32> {
    use x11rb::protocol::res::{ClientIdMask, ClientIdSpec, ConnectionExt as _};
    let all = ClientIdSpec {
        client: 0,
        mask: ClientIdMask::LOCAL_CLIENT_PID,
    };
    let ids = conn.res_query_client_ids(&[all]).unwrap().reply().unwrap().ids;
    ids.into_iter()
        .filter(|id| id.value == [pid])
        .map(|id| id.spec.client)
        .collect()
}

/// The sockets a process holds open (`/proc/<pid>/fd`): each descriptor with its link (`socket:[<inode>]`), the inode
/// telling a new socket from an old one whose number was reused.
fn sockets_of(pid: u32) -> Vec<(i32, String)> {
    std::fs::read_dir(format!("/proc/{pid}/fd"))
        .unwrap()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let link = std::fs::read_link(entry.path()).ok()?.to_str()?.to_string();
            let fd = entry.file_name().to_str()?.parse().ok()?;
            link.starts_with("socket:").then_some((fd, link))
        })
        .collect()
}

/// A child process's connection lost from outside it: a duplicate of its descriptor taken with `pidfd_getfd` (allowed
/// to a parent) and the socket shut down both ways, so the process reads end of file, as when the server closes a
/// connection, and the server closes its client.
fn cut_connection(pid: u32, fd: i32) {
    use rustix::process::{Pid, PidfdFlags, PidfdGetfdFlags, pidfd_getfd, pidfd_open};
    let pid = Pid::from_raw(pid as i32).expect("a process id");
    let pidfd = pidfd_open(pid, PidfdFlags::empty()).expect("a pidfd for the engine");
    let socket = pidfd_getfd(&pidfd, fd, PidfdGetfdFlags::empty()).expect("the engine's socket, duplicated");
    rustix::net::shutdown(&socket, rustix::net::Shutdown::Both).expect("the socket shut down");
}

/// The rule that a failed after-release watch refuses the next acting request, proved on the binary under test with
/// nothing injected, so the release workflow proves it on each shipped asset: the watch's X connection is lost, and the
/// next acting request, a click and then a `preflight`, is refused with the watch-failure sentence and sends nothing,
/// while a read runs. The watch's connection is found from outside, as the one socket and the one X client a drag
/// adds to the engine; a first drag has already opened the drag's own pointer watch (`stray.rs`), which the engine
/// keeps between drags. The X client gone once the socket is cut shows the socket was that client's connection.
#[test]
fn a_watch_whose_x_connection_is_lost_refuses_the_next_acting_request_and_sends_nothing() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::NeverTakes);
    focus_nothing();
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let mut engine = Engine::start();
    let app = app_of(&mut engine, window);
    let drag = |engine: &mut Engine| {
        let drag = engine.request("drag", json!({"window": {"id": window}, "path": path}));
        assert_eq!(drag, Ok(Value::Null), "a plain drag, its watch handed over");
    };
    drag(&mut engine);
    sleep(SETTLE);
    for (command, input) in [
        ("click", json!({"window": {"id": window}, "x": 50, "y": 50})),
        ("preflight", json!({})),
    ] {
        let pid = engine.pid();
        let (sockets, clients) = (sockets_of(pid), clients_of(&conn, pid));
        drag(&mut engine);
        let added_sockets: Vec<(i32, String)> = sockets_of(pid)
            .into_iter()
            .filter(|s| !sockets.iter().any(|(_, link)| *link == s.1))
            .collect();
        let added_clients: Vec<u32> = clients_of(&conn, pid)
            .into_iter()
            .filter(|c| !clients.contains(c))
            .collect();
        let ([(fd, _)], [watch]) = (&added_sockets[..], &added_clients[..]) else {
            panic!("the drag opened one connection, its after-release watch's: {added_sockets:?} {added_clients:?}")
        };
        cut_connection(pid, *fd);
        sleep(SETTLE);
        assert!(
            !clients_of(&conn, pid).contains(watch),
            "the server closed the watch's client"
        );
        assert!(engine.request("list_windows", json!({})).is_ok(), "a read runs");
        let sentence = engine
            .request(command, input)
            .expect_err("the failed watch is the answer");
        assert!(
            sentence.starts_with(&format!("the drag-and-drop watch after your drag into {app} failed ("))
                && sentence.ends_with(
                    "), so a drop may have happened unseen and changed the desktop; this request was not run, so \
                     read the window before sending it again"
                ),
            "{command}: {sentence}"
        );
        assert_eq!(engine.request("preflight", json!({})), Ok(Value::Null), "reported once");
    }
    stop.send(()).unwrap();
    let drag = [
        Input::ButtonPress { button: 1, sent: true },
        Input::ButtonRelease { button: 1, sent: true },
    ];
    assert_eq!(
        recorder.join().unwrap(),
        drag.repeat(3),
        "the three drags alone: the refused click and the preflights sent nothing"
    );
}

/// An override-redirect window of the test's own over `rect`, as a notification or a menu covers part of a window.
fn override_redirect(conn: &RustConnection, (x, y, width, height): (i16, i16, u16, u16)) -> Window {
    let root = conn.setup().roots[0].root;
    let id = conn.generate_id().unwrap();
    let aux = CreateWindowAux::new().override_redirect(1);
    conn.create_window(0, id, root, x, y, width, height, 0, WindowClass::INPUT_OUTPUT, 0, &aux)
        .unwrap();
    conn.map_window(id).unwrap();
    conn.sync().unwrap();
    id
}

/// The window put in front as a window manager leaves its active window: the input focus, `_NET_ACTIVE_WINDOW`, and
/// the top of `_NET_CLIENT_LIST_STACKING`.
fn in_front(window: Window) {
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    conn.set_input_focus(x11rb::protocol::xproto::InputFocus::PARENT, window, x11rb::CURRENT_TIME)
        .unwrap();
    let stacking = conn
        .intern_atom(false, b"_NET_CLIENT_LIST_STACKING")
        .unwrap()
        .reply()
        .unwrap()
        .atom;
    conn.change_property32(PropMode::REPLACE, root, stacking, AtomEnum::WINDOW, &[window])
        .unwrap();
    conn.sync().unwrap();
    set_active_window(Some(window));
}

/// The drop's signature already holds when the drag begins (Chrome active, focused and on top of the managed windows)
/// while an override-redirect window over a corner, away from the path, keeps it from counting as in front, so the
/// drag is watched: a take seen during the drag is cancelled in time (Escape, then the release) and said so; with the
/// Escape held past the release, the answer says the drop may have happened, though no part of the signature can show
/// a change (Acceptance 8; the design session's ruling of 2026-10-31).
#[test]
fn with_the_signature_already_held_the_answer_follows_the_order_of_the_take_and_the_release() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let corner = override_redirect(&conn, (360, 260, 40, 40));
    let in_time = || {
        let (window, stop, recorder) = drag_source(OnRelease::Focuses);
        in_front(window);
        // the corner above the source's window, which opened after it
        conn.configure_window(corner, &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE))
            .unwrap();
        conn.sync().unwrap();
        (window, stop, recorder)
    };
    let (window, stop, recorder) = in_time();
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    let answer = shared.request("drag", json!({"window": {"id": window}, "path": path}));
    set_active_window(None);
    assert_eq!(
        answer,
        Err(format!(
            "{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was \
             dropped. Use a dedicated desktop, or activate the window first"
        )),
        "the take came before the release: cancelled in time"
    );
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ],
        "Escape before the release"
    );
    drop(shared);
    let (window, stop, recorder) = in_time();
    let mut late = Engine::start_with(&["--dnd-cancel-after-release"]);
    let answer = late.request("drag", json!({"window": {"id": window}, "path": path}));
    set_active_window(None);
    assert_eq!(
        answer,
        Err(format!(
            "{app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop \
             may have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
        )),
        "the Escape after the release: never that nothing was dropped"
    );
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
            Input::KeyPress { sent: true },
            Input::KeyRelease { sent: true },
        ]
    );
    conn.destroy_window(corner).unwrap();
    conn.sync().unwrap();
}

/// On the foreground route a request is refused for its own input before the window is activated, as `press_key` is:
/// a move with a bad chord, a scroll of no pixels and one with a bad chord, a drag of one point and one with a bad
/// chord, and characters the layout cannot type each answer their error and leave the window unfocused, nothing sent.
#[test]
fn a_foreground_request_refused_for_its_input_activates_nothing() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let chrome = Probe::open("Google-chrome", (400, 0, 320, 200));
    let xterm = Probe::open("XTerm", (0, 300, 320, 200));
    let _cover = Probe::open("Cover", (0, 0, 800, 220));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    let cases = [
        (
            &firefox,
            "move",
            json!({"window": firefox.target(), "x": 40, "y": 40, "key": "nosuchkey"}),
        ),
        (
            &firefox,
            "scroll",
            json!({"window": firefox.target(), "x": 40, "y": 40, "direction": "down", "pixels": 0}),
        ),
        (
            &firefox,
            "scroll",
            json!({"window": firefox.target(), "x": 40, "y": 40, "direction": "down", "key": "nosuchkey"}),
        ),
        (
            &chrome,
            "drag",
            json!({"window": chrome.target(), "path": [{"x": 20, "y": 20}]}),
        ),
        (
            &chrome,
            "drag",
            json!({"window": chrome.target(), "path": [{"x": 20, "y": 20}, {"x": 60, "y": 60}], "key": "nosuchkey"}),
        ),
        (
            &xterm,
            "type_characters",
            json!({"window": xterm.target(), "text": "a\u{7}"}),
        ),
    ];
    for (probe, command, input) in cases {
        probe.unfocus();
        assert!(dedicated.request(command, input.clone()).is_err(), "{command} {input}");
        assert!(
            !probe.has_focus(),
            "{command} {input}: a refused request activates nothing"
        );
    }
    for probe in [&firefox, &chrome, &xterm] {
        assert_eq!(probe.inputs(), vec![], "nothing was sent");
    }
    // the same move well formed takes the foreground route
    firefox.unfocus();
    dedicated
        .request("move", json!({"window": firefox.target(), "x": 40, "y": 40}))
        .unwrap();
    assert!(firefox.has_focus(), "activated");
}

/// The real pointer put at a desktop point, through XTEST, as a person's mouse would leave it.
fn pointer_to(x: i16, y: i16) {
    use x11rb::protocol::xtest::ConnectionExt as _;
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    conn.xtest_fake_input(x11rb::protocol::xproto::MOTION_NOTIFY_EVENT, 0, 0, root, x, y, 0)
        .unwrap();
    conn.sync().unwrap();
}

/// A window of the test's own, classed `Google-chrome`, that takes the pointer when a button is pressed in it, as
/// Chrome's capture does (an active pointer grab on its window, so a real pointer outside it crosses in with no button
/// held), and gives it back on the release. With `nudge`, it also moves the real pointer a pixel and back on the press,
/// as a person's mouse would in the press window. It takes no drag and drop, and records the input events it receives
/// until told to stop.
fn capturing_window(nudge: bool) -> (Window, mpsc::Sender<()>, std::thread::JoinHandle<Vec<Input>>) {
    use x11rb::protocol::xproto::{GrabMode, MOTION_NOTIFY_EVENT};
    use x11rb::protocol::xtest::ConnectionExt as _;
    let (ready, window) = mpsc::channel();
    let (stop, stopped) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let probe = Probe::open("Google-chrome", (0, 0, 400, 300));
        probe.conn.sync().unwrap();
        ready.send(probe.id).unwrap();
        let mut seen = Vec::new();
        while stopped.try_recv().is_err() {
            while let Some(event) = probe.conn.poll_for_event().unwrap() {
                let sent = event.sent_event();
                match event {
                    Event::ButtonPress(e) => {
                        seen.push(Input::ButtonPress { button: e.detail, sent });
                        if let Some(cue) = PRESS_SEEN.lock().unwrap().take() {
                            let _ = cue.send(());
                        }
                        let mask = EventMask::BUTTON_RELEASE | EventMask::POINTER_MOTION;
                        let (none, now, mode) = (x11rb::NONE, x11rb::CURRENT_TIME, GrabMode::ASYNC);
                        probe
                            .conn
                            .grab_pointer(false, probe.id, mask, mode, mode, none, none, now)
                            .unwrap();
                        if nudge {
                            for dx in [1, -1] {
                                probe
                                    .conn
                                    .xtest_fake_input(MOTION_NOTIFY_EVENT, 1, 0, x11rb::NONE, dx, 0, 0)
                                    .unwrap();
                            }
                        }
                        probe.conn.flush().unwrap();
                    }
                    Event::ButtonRelease(e) => {
                        seen.push(Input::ButtonRelease { button: e.detail, sent });
                        probe.conn.ungrab_pointer(x11rb::CURRENT_TIME).unwrap();
                        probe.conn.flush().unwrap();
                    }
                    _ => {}
                }
            }
            sleep(Duration::from_millis(1));
        }
        seen
    });
    (window.recv().unwrap(), stop, handle)
}

/// The sentence a Chromium drag answers when a pointer event that is not the drag's reached its window in the press
/// window and no drag and drop began (`stray.rs`; the design session's ruling, 2026-11-01).
fn may_not_have_started(app: &str) -> String {
    format!(
        "{app} may not have started the drag, and the page may have taken the press as a click: the desktop pointer \
         was outside the window, or entered or moved in it during the press. Read the window to see what happened \
         before dragging again"
    )
}

/// A Chromium drag needs the real pointer in its window (task 20): its capture grab crosses in from a pointer outside
/// with no button, which resets Blink's press. In shared mode the drag is sent and answers that it may not have started,
/// in front (the hold's path) and not (the drag-and-drop guard's); with the pointer in the window, away from the path,
/// it succeeds; in dedicated mode a pointer outside takes the foreground route, which puts the pointer there (the
/// design session's rulings, 2026-11-01).
#[test]
fn a_chromium_drag_with_the_real_pointer_outside_its_window_answers_that_it_may_not_have_started() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    for front in [false, true] {
        let (window, stop, recorder) = capturing_window(false);
        if front {
            in_front(window);
        } else {
            focus_nothing();
        }
        let mut shared = Engine::start();
        let app = app_of(&mut shared, window);
        pointer_to(600, 400);
        let outside = shared.request("drag", json!({"window": {"id": window}, "path": path}));
        pointer_to(300, 250);
        let inside = shared.request("drag", json!({"window": {"id": window}, "path": path}));
        set_active_window(None);
        assert_eq!(outside, Err(may_not_have_started(&app)), "in front: {front}");
        assert_eq!(inside, Ok(Value::Null), "in front: {front}: the pointer in the window");
        sleep(SETTLE);
        stop.send(()).unwrap();
        assert_eq!(
            recorder.join().unwrap(),
            [
                Input::ButtonPress { button: 1, sent: true },
                Input::ButtonRelease { button: 1, sent: true },
            ]
            .repeat(2),
            "in front: {front}: both drags were sent on the background route"
        );
    }
    let (window, stop, recorder) = capturing_window(false);
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    pointer_to(600, 400);
    dedicated
        .request("drag", json!({"window": {"id": window}, "path": path}))
        .unwrap();
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: false },
            Input::ButtonRelease { button: 1, sent: false },
        ],
        "dedicated: the foreground route"
    );
}

/// Another client's pointer grab, held when the drag begins and released during it (as the drag's press arrives at the
/// window), crosses back into the window with no button held, in mode `Ungrab`, and resets Blink's press as any crossing
/// does (task 20 review): the drag answers that it may not have started, never success. Only a grab's end after the
/// release is the target's cleanup of its own capture.
#[test]
fn a_foreign_grab_released_during_the_drag_answers_that_the_drag_may_not_have_started() {
    use x11rb::protocol::xproto::GrabMode;
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = capturing_window(false);
    focus_nothing();
    pointer_to(300, 250);
    // the foreign client: a pointer grab on the root, held until the window has the press
    let (pressed, released) = mpsc::channel::<()>();
    let (grabbed, held) = mpsc::channel();
    let foreign = std::thread::spawn(move || {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let root = conn.setup().roots[screen].root;
        let (none, now, mode) = (x11rb::NONE, x11rb::CURRENT_TIME, GrabMode::ASYNC);
        let status = conn
            .grab_pointer(false, root, EventMask::BUTTON_PRESS, mode, mode, none, none, now)
            .unwrap()
            .reply()
            .unwrap()
            .status;
        grabbed.send(status).unwrap();
        let _ = released.recv_timeout(Duration::from_secs(10));
        conn.ungrab_pointer(x11rb::CURRENT_TIME).unwrap();
        conn.sync().unwrap();
    });
    assert_eq!(
        held.recv().unwrap(),
        x11rb::protocol::xproto::GrabStatus::SUCCESS,
        "the foreign grab is held"
    );
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    *PRESS_SEEN.lock().unwrap() = Some(pressed);
    let answer = shared.request("drag", json!({"window": {"id": window}, "path": path}));
    foreign.join().unwrap();
    assert_eq!(answer, Err(may_not_have_started(&app)));
    sleep(SETTLE);
    stop.send(()).unwrap();
    recorder.join().unwrap();
}

/// Told when a `capturing_window` receives a press (the foreign grab's cue to end).
static PRESS_SEEN: std::sync::Mutex<Option<mpsc::Sender<()>>> = std::sync::Mutex::new(None);

/// The real pointer moved in the press window (the window's client nudges it a pixel and back as the press arrives,
/// after the atomic press's grab): the watch sees the motion, no drag and drop began, and the drag answers that it may
/// not have started, never success.
#[test]
fn a_real_pointer_motion_in_the_press_window_answers_that_the_drag_may_not_have_started() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = capturing_window(true);
    focus_nothing();
    pointer_to(300, 250);
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Err(may_not_have_started(&app))
    );
    sleep(SETTLE);
    stop.send(()).unwrap();
    assert_eq!(
        recorder.join().unwrap(),
        vec![
            Input::ButtonPress { button: 1, sent: true },
            Input::ButtonRelease { button: 1, sent: true },
        ]
    );
}

/// A window manager's stand-in, on its own connection (task 63): it takes `SubstructureRedirect` on the root, so a
/// client's restack of a top-level window comes to it as a `ConfigureRequest`. It carries out `slow`'s only `delay`
/// later (never, with None), as a window manager under load raises an activated window after the engine's own focus
/// request has already given it the focus, and every other request at once. The engine's activation request reaches
/// it too, and asks nothing more of it. `keeping` windows it keeps on top as a window manager keeps its ABOVE, dock and
/// notification layers: each is raised again after every restack it carries out. Dropped, it lets the redirect go.
struct SlowRaises {
    stop: mpsc::Sender<()>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl SlowRaises {
    fn start(slow: Window, delay: Option<Duration>) -> SlowRaises {
        SlowRaises::keeping(slow, delay, Vec::new())
    }

    fn keeping(slow: Window, delay: Option<Duration>, keep: Vec<Window>) -> SlowRaises {
        use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConfigureRequestEvent};
        let (stop, stopped) = mpsc::channel();
        let (ready, started) = mpsc::channel();
        let thread = std::thread::spawn(move || {
            let (conn, screen) = x11rb::connect(None).expect("an X connection");
            let root = conn.setup().roots[screen].root;
            conn.change_window_attributes(
                root,
                &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_REDIRECT),
            )
            .unwrap()
            .check()
            .expect("no window manager on the test's display");
            ready.send(()).unwrap();
            let carry_out = |e: &ConfigureRequestEvent| {
                let aux = ConfigureWindowAux::from_configure_request(e);
                let _ = conn.configure_window(e.window, &aux);
                for &w in &keep {
                    let _ = conn.configure_window(w, &ConfigureWindowAux::new().stack_mode(StackMode::ABOVE));
                }
                let _ = conn.flush();
            };
            let mut pending: Vec<(Instant, ConfigureRequestEvent)> = Vec::new();
            while stopped.try_recv().is_err() {
                while let Some(event) = conn.poll_for_event().unwrap() {
                    match event {
                        Event::ConfigureRequest(e) if e.window == slow => {
                            if let Some(delay) = delay {
                                pending.push((Instant::now() + delay, e));
                            }
                        }
                        Event::ConfigureRequest(e) => carry_out(&e),
                        Event::MapRequest(e) => {
                            let _ = conn.map_window(e.window);
                            let _ = conn.flush();
                        }
                        _ => {}
                    }
                }
                let now = Instant::now();
                for (_, e) in pending.iter().filter(|(due, _)| *due <= now) {
                    carry_out(e);
                }
                pending.retain(|(due, _)| *due > now);
                sleep(Duration::from_millis(1));
            }
        });
        started.recv().unwrap();
        SlowRaises {
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for SlowRaises {
    fn drop(&mut self) {
        let _ = self.stop.send(());
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// The foreground route's pointer input waits until its activated window is on top at the input's points, not only
/// until it holds the focus (task 63): with the window manager's raise 150 ms behind the engine's focus request, the
/// click, the wheel step and the drag each still land in the window and none reaches the window that covered it,
/// which received every one of them while the route waited for the focus alone.
#[test]
fn foreground_pointer_input_waits_for_the_window_manager_to_raise_its_window() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let cover = Probe::open("Cover", (0, 0, 400, 300));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    let cases = [
        ("click", json!({"window": firefox.target(), "x": 100, "y": 100}), 1),
        (
            "scroll",
            json!({"window": firefox.target(), "x": 100, "y": 100, "direction": "down", "pixels": 100}),
            5,
        ),
        (
            "drag",
            json!({"window": firefox.target(), "path": [{"x": 60, "y": 60}, {"x": 160, "y": 120}]}),
            1,
        ),
    ];
    for (command, input, button) in cases {
        firefox.unfocus();
        cover.raise();
        assert!(cover.above(&firefox), "{command}: covered before the request");
        let raises = SlowRaises::start(firefox.id, Some(Duration::from_millis(150)));
        let started = Instant::now();
        dedicated.request(command, input).unwrap();
        let took = started.elapsed();
        drop(raises);
        assert_eq!(
            cover.inputs(),
            vec![],
            "{command}: nothing reached the window that covered it"
        );
        assert!(firefox.above(&cover), "{command}: raised");
        assert_eq!(
            firefox.inputs(),
            vec![
                Input::ButtonPress { button, sent: false },
                Input::ButtonRelease { button, sent: false }
            ],
            "{command}: its real button events, in the window"
        );
        assert!(
            took >= Duration::from_millis(150),
            "{command}: it waited for the raise ({took:?})"
        );
    }
}

/// A window the window manager never raises over the point is refused at the wait's bound, with nothing sent: no event
/// reaches the window or the window covering it.
#[test]
fn foreground_pointer_input_is_refused_with_nothing_sent_when_its_window_is_not_on_top_at_its_points() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let cover = Probe::open("Cover", (0, 0, 400, 300));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    firefox.unfocus();
    cover.raise();
    let raises = SlowRaises::start(firefox.id, None);
    let started = Instant::now();
    let refused = dedicated.request("click", json!({"window": firefox.target(), "x": 100, "y": 100}));
    let took = started.elapsed();
    drop(raises);
    let refusal = refused.expect_err("never raised: refused");
    assert!(
        refusal.starts_with(&format!("window {} was still covered at the input's point", firefox.id))
            && refusal.ends_with("; nothing was sent, so it is safe to retry"),
        "{refusal}"
    );
    assert!(took >= Duration::from_millis(1000), "refused at the bound ({took:?})");
    assert_eq!(firefox.inputs(), vec![], "nothing reached the window");
    assert_eq!(cover.inputs(), vec![], "nor the window covering it");
}

/// Only the points inside the window wait for its raise; the rest go as before the wait (the design session's ruling
/// on task 63, 2026-11-06): a dedicated-mode drag from the covered window into another window beside it is sent, its
/// press in the window (which holds the implicit grab to the release), and a move to a point beyond the window too.
#[test]
fn a_foreground_drag_from_its_window_into_another_window_is_sent_not_refused() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let other = Probe::open("Other", (330, 0, 300, 200));
    let cover = Probe::open("Cover", (0, 0, 320, 200));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    firefox.unfocus();
    cover.raise();
    dedicated
        .request(
            "drag",
            json!({"window": firefox.target(), "path": [{"x": 60, "y": 60}, {"x": 400, "y": 60}]}),
        )
        .expect("a drag into another window is sent");
    assert_eq!(
        firefox.inputs(),
        vec![
            Input::ButtonPress { button: 1, sent: false },
            Input::ButtonRelease { button: 1, sent: false }
        ],
        "pressed in the window, released to its grab"
    );
    assert_eq!(cover.inputs(), vec![], "nothing reached the window that covered it");
    firefox.unfocus();
    cover.raise();
    dedicated
        .request("move", json!({"window": firefox.target(), "x": 400, "y": 60}))
        .expect("a move beyond the window is sent");
    assert_eq!(other.inputs(), vec![], "a move presses nothing");
}

/// `activate_window` answers once the window manager has raised the window over its visible area, so pointer input
/// pipelined on its answer (a windowless click at once, no observation between) lands in it and not in the window that
/// covered it, which on a shared desktop is the person's; a window never raised answers an error at the bound, with
/// nothing else sent (the design session's ruling on task 63, 2026-11-06).
#[test]
fn activate_window_answers_once_its_window_is_on_top_so_a_pipelined_click_lands_in_it() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let cover = Probe::open("Cover", (0, 0, 400, 300));
    for mode in ["shared", "dedicated"] {
        let mut engine = Engine::start_with(&["--desktop", mode]);
        firefox.unfocus();
        cover.raise();
        let raises = SlowRaises::start(firefox.id, Some(Duration::from_millis(150)));
        let started = Instant::now();
        engine
            .request("activate_window", json!({"window": firefox.target()}))
            .unwrap();
        let took = started.elapsed();
        engine.request("click", json!({"x": 100, "y": 100})).unwrap();
        drop(raises);
        assert_eq!(
            cover.inputs(),
            vec![],
            "{mode}: nothing reached the window that covered it"
        );
        assert_eq!(
            firefox.inputs(),
            vec![
                Input::ButtonPress { button: 1, sent: false },
                Input::ButtonRelease { button: 1, sent: false }
            ],
            "{mode}: the pipelined click, in the activated window"
        );
        assert!(
            took >= Duration::from_millis(150),
            "{mode}: it waited for the raise ({took:?})"
        );

        firefox.unfocus();
        cover.raise();
        let raises = SlowRaises::start(firefox.id, None);
        let started = Instant::now();
        let refused = engine.request("activate_window", json!({"window": firefox.target()}));
        let took = started.elapsed();
        drop(raises);
        assert_eq!(
            refused,
            Err(format!(
                "the activation of window {} was requested, but a normal window still covered it after 1000 ms; \
                 nothing else was sent",
                firefox.id
            )),
            "{mode}"
        );
        assert!(took >= Duration::from_millis(1000), "{mode}: at the bound ({took:?})");
        assert_eq!(firefox.inputs(), vec![], "{mode}: nothing else was sent");
        assert_eq!(cover.inputs(), vec![], "{mode}");
    }
}

/// A point under the window's own popup (an override-redirect window of its own X client, as a menu it opened) is the
/// application's: the foreground click goes to it at once, as it did before the wait, and is not refused.
#[test]
fn a_foreground_click_into_the_window_s_own_popup_is_not_held_back() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let menu = override_redirect(&firefox.conn, (80, 80, 60, 60));
    let mut dedicated = Engine::start_with(&["--desktop", "dedicated"]);
    firefox.unfocus();
    let started = Instant::now();
    dedicated
        .request("click", json!({"window": firefox.target(), "x": 100, "y": 100}))
        .expect("its own popup's point is the application's");
    assert!(started.elapsed() < Duration::from_millis(500), "not held to the bound");
    assert!(firefox.has_focus(), "the foreground route: its own popup over it");
    let _ = firefox.conn.destroy_window(menu);
    let _ = firefox.conn.flush();
}

/// The window's `_NET_WM_STATE` or `_NET_WM_WINDOW_TYPE` set to these atoms, as its client would set them.
fn set_atoms(probe: &Probe, property: &str, values: &[&str]) {
    let atom = |name: &str| {
        probe
            .conn
            .intern_atom(false, name.as_bytes())
            .unwrap()
            .reply()
            .unwrap()
            .atom
    };
    let values: Vec<u32> = values.iter().map(|v| atom(v)).collect();
    probe
        .conn
        .change_property32(PropMode::REPLACE, probe.id, atom(property), AtomEnum::ATOM, &values)
        .unwrap();
    probe.conn.sync().unwrap();
}

/// `activate_window` waits only for windows of the window manager's normal layer (the design session's ruling on task
/// 63, 2026-11-06): with an ABOVE window and a dock strip kept over part of the window, it answers once the normal
/// window covering it is lowered, in both modes. Its success says nothing of what they cover: a click at a point under
/// the strip is decided by the click's own rules, refused in shared mode (Gecko takes no click while covered) and in
/// dedicated mode held to the foreground route's bound and refused, never sent to the strip or the window.
#[test]
fn activation_waits_for_no_window_kept_above_the_normal_layer_and_a_click_under_one_is_not_sent() {
    let firefox = Probe::open("firefox", (0, 0, 320, 200));
    let cover = Probe::open("Cover", (0, 0, 400, 300));
    let above = Probe::open("Above", (250, 40, 120, 60));
    set_atoms(&above, "_NET_WM_STATE", &["_NET_WM_STATE_ABOVE"]);
    let dock = Probe::open("Dock", (0, 170, 640, 40));
    set_atoms(&dock, "_NET_WM_WINDOW_TYPE", &["_NET_WM_WINDOW_TYPE_DOCK"]);
    for mode in ["shared", "dedicated"] {
        let mut engine = Engine::start_with(&["--desktop", mode]);
        let refusal = format!("{}{SENTENCE}", app_of(&mut engine, firefox.id));
        firefox.unfocus();
        cover.raise();
        above.raise();
        dock.raise();
        let raises = SlowRaises::keeping(firefox.id, Some(Duration::from_millis(50)), vec![above.id, dock.id]);
        let started = Instant::now();
        engine
            .request("activate_window", json!({"window": firefox.target()}))
            .expect("the ABOVE window and the dock neither hold nor fail the activation");
        let took = started.elapsed();
        assert!(
            took < Duration::from_millis(500),
            "{mode}: answered at the raise ({took:?})"
        );
        assert!(firefox.above(&cover), "{mode}: raised over the normal window");
        assert!(
            dock.above(&firefox) && above.above(&firefox),
            "{mode}: the layers kept above it"
        );
        let clicked = engine.request("click", json!({"window": firefox.target(), "x": 100, "y": 185}));
        drop(raises);
        match mode {
            "shared" => assert_eq!(clicked, Err(refusal), "shared: covered, so refused"),
            _ => assert!(
                clicked.as_ref().is_err_and(
                    |e| e.starts_with(&format!("window {} was still covered at the input's point", firefox.id))
                ),
                "dedicated: held to the bound and refused: {clicked:?}"
            ),
        }
        assert_eq!(dock.inputs(), vec![], "{mode}: nothing sent to the strip");
        assert_eq!(firefox.inputs(), vec![], "{mode}: nor to the window under it");
        assert_eq!(cover.inputs(), vec![], "{mode}");
    }
}

/// The motions a window of the test's own receives (core `MotionNotify`, root positions) until told to stop: an
/// override-redirect window over `rect`, selecting pointer motion only.
fn motion_listener(rect: (i16, i16, u16, u16)) -> (mpsc::Sender<()>, std::thread::JoinHandle<Vec<(i16, i16)>>) {
    let (conn, _) = x11rb::connect(None).expect("an X connection");
    let window = override_redirect(&conn, rect);
    conn.change_window_attributes(
        window,
        &x11rb::protocol::xproto::ChangeWindowAttributesAux::new().event_mask(EventMask::POINTER_MOTION),
    )
    .unwrap();
    conn.sync().unwrap();
    let (stop, stopped) = mpsc::channel::<()>();
    let listening = std::thread::spawn(move || {
        let mut motions = Vec::new();
        loop {
            let done = stopped.try_recv().is_ok();
            conn.sync().unwrap();
            while let Some(event) = conn.poll_for_event().unwrap() {
                if let Event::MotionNotify(e) = event {
                    motions.push((e.root_x, e.root_y));
                }
            }
            if done {
                let _ = conn.destroy_window(window);
                let _ = conn.flush();
                return motions;
            }
            sleep(Duration::from_millis(2));
        }
    });
    (stop, listening)
}

/// A desktop `move` visits the pinned build's points, its leading motion at the pointer's own position included (the
/// server delivers a motion there, task 64's listener), with no pause between them: the vendor's 8 ms a point is gone
/// (M4's T9), so a ten-step path answers in a few milliseconds where it took at least 80.
#[test]
fn a_desktop_move_visits_the_pinned_build_s_points_with_no_pause_between_them() {
    let mut engine = Engine::start();
    engine.request("move", json!({"x": 10, "y": 10})).unwrap();
    let (stop, listening) = motion_listener((0, 0, 400, 300));
    let started = Instant::now();
    engine.request("move", json!({"x": 330, "y": 250})).unwrap();
    let took = started.elapsed();
    stop.send(()).unwrap();
    let motions = listening.join().unwrap();
    // (10, 10) → (330, 250): 400 px, ten steps of (32, 24), the start included (behaviour §10.2)
    let expected: Vec<(i16, i16)> = (0..=10).map(|i| (10 + 32 * i, 10 + 24 * i)).collect();
    assert_eq!(motions, expected, "the pinned build's points, in order");
    assert!(
        took < Duration::from_millis(40),
        "no pause between the points ({took:?})"
    );
}
