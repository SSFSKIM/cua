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
/// and the input focus, a drag and drop that began after the drag's last motion. It records the input events it
/// receives until told to stop.
fn drag_source(on_release: OnRelease) -> (Window, mpsc::Sender<()>, std::thread::JoinHandle<Vec<Input>>) {
    let (ready, window) = mpsc::channel();
    let (stop, stopped) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let probe = Probe::open("Google-chrome", (0, 0, 400, 300));
        let mask = EventMask::KEY_PRESS
            | EventMask::KEY_RELEASE
            | EventMask::BUTTON_PRESS
            | EventMask::BUTTON_RELEASE
            | EventMask::BUTTON1_MOTION;
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
        let mut taken = on_release == OnRelease::TakesLate;
        while stopped.try_recv().is_err() {
            while let Some(event) = probe.conn.poll_for_event().unwrap() {
                let sent = event.sent_event();
                match event {
                    Event::MotionNotify(_) if !taken => {
                        take(&probe);
                        taken = true;
                    }
                    Event::KeyPress(_) => seen.push(Input::KeyPress { sent }),
                    Event::KeyRelease(_) => seen.push(Input::KeyRelease { sent }),
                    Event::ButtonPress(e) => seen.push(Input::ButtonPress { button: e.detail, sent }),
                    Event::ButtonRelease(e) => {
                        seen.push(Input::ButtonRelease { button: e.detail, sent });
                        let escaped = seen.contains(&Input::KeyPress { sent: true });
                        match on_release {
                            OnRelease::Focuses if !escaped => focus(&probe),
                            OnRelease::TakesLate => {
                                sleep(LATE_TAKE);
                                take(&probe);
                                focus(&probe);
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
}

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

/// A drag and drop that begins only after the drag's release (the source takes `XdndSelection` and the focus shortly
/// after it, where no look during the drag could see it): the drag answers at its release as a plain drag, the watch
/// goes on off the request path and sends the cancel's Escape at once on the late take, and the next request on the
/// connection answers the notice, not run (the design session's ruling, 2026-10-31). The request after that runs.
#[test]
fn a_drag_and_drop_that_begins_after_the_release_is_reported_by_the_next_request() {
    let path = json!([{"x": 20, "y": 20}, {"x": 200, "y": 120}]);
    let (window, stop, recorder) = drag_source(OnRelease::TakesLate);
    focus_nothing();
    let mut shared = Engine::start();
    let app = app_of(&mut shared, window);
    let started = Instant::now();
    assert_eq!(
        shared.request("drag", json!({"window": {"id": window}, "path": path})),
        Ok(Value::Null),
        "no take by the release: a plain drag"
    );
    let answered = started.elapsed();
    sleep(SETTLE);
    assert_eq!(
        shared.request("list_windows", json!({})),
        Err(format!(
            "{app} started a drag and drop after your drag ended; it may have dropped and changed the desktop; this \
             request was not run, so read the window before sending it again"
        ))
    );
    assert!(
        shared.request("list_windows", json!({})).is_ok(),
        "the notice is given once"
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
        "the release, then the watch's Escape"
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

/// The measurement option that leaves a take during the drag unseen until after the release (Acceptance 8's forced
/// late-take case): the drop goes ahead, the drag answers success, and the next request carries the notice.
#[test]
fn a_take_left_unseen_until_the_release_is_reported_by_the_next_request() {
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
    let notice = deferred.request("capabilities", json!({}));
    assert_eq!(
        notice,
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
        "the drop went ahead at the release; the Escape came after"
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
