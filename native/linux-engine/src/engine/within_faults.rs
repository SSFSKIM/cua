//! The real pointer leaving a Gecko window after the route has read it (T19; the design session's ruling, 2026-11-10):
//! a background click, scroll and move into a window classed `firefox` find the pointer in it, and a hook moves the
//! pointer out at one exact step, once their events went out and before the watch is read (`Identity::PointerSent`).
//! Each must answer that Firefox may not have taken it, never success; with the pointer staying in, each succeeds.
//!
//! They need `--features live` (an X display with XTEST and XInput 2).

use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, WindowClass};
use x11rb::protocol::xtest::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use super::Engine;
use super::identity_faults::request;
use crate::fault::{self, Identity};

/// A bare top-level window classed `firefox`, at (0, 0) and 320 by 200, on a connection of the test's own.
struct Gecko {
    conn: RustConnection,
    id: u32,
}

impl Gecko {
    fn open() -> Gecko {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
        let screen = &conn.setup().roots[screen];
        let id = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new()
            .background_pixel(screen.white_pixel)
            .event_mask(EventMask::BUTTON_PRESS | EventMask::BUTTON_RELEASE);
        conn.create_window(
            0,
            id,
            screen.root,
            0,
            0,
            320,
            200,
            0,
            WindowClass::INPUT_OUTPUT,
            0,
            &aux,
        )
        .unwrap();
        conn.change_property8(
            PropMode::REPLACE,
            id,
            AtomEnum::WM_CLASS,
            AtomEnum::STRING,
            b"firefox\0firefox\0",
        )
        .unwrap();
        conn.map_window(id).unwrap();
        conn.sync().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));
        Gecko { conn, id }
    }
}

impl Drop for Gecko {
    fn drop(&mut self) {
        let _ = self.conn.destroy_window(self.id);
        let _ = self.conn.flush();
    }
}

/// The real pointer moved to a root point through XTEST.
fn pointer_to(x: i16, y: i16) {
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    conn.xtest_fake_input(x11rb::protocol::xproto::MOTION_NOTIFY_EVENT, 0, 0, root, x, y, 0)
        .unwrap();
    conn.sync().unwrap();
}

fn requests(window: u32) -> [(&'static str, &'static str, Value); 3] {
    [
        ("click", "click", json!({"window": {"id": window}, "x": 40, "y": 40})),
        (
            "scroll",
            "scroll",
            json!({"window": {"id": window}, "x": 40, "y": 40, "direction": "down", "pixels": 100}),
        ),
        ("move", "move", json!({"window": {"id": window}, "x": 60, "y": 60})),
    ]
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display with XTEST and XInput 2 (--features live)"
)]
fn a_gecko_click_scroll_or_move_the_real_pointer_leaves_after_its_events_went_out_is_never_answered_success() {
    let gecko = Gecko::open();
    let mut engine = Engine::new(crate::default_config()).unwrap();
    for (command, what, input) in requests(gecko.id) {
        // the control: the pointer stays in the window
        pointer_to(100, 60);
        assert_eq!(
            request(&mut engine, command, input.clone()),
            Ok(Value::Null),
            "{command}: the pointer stayed in"
        );
        for back in [false, true] {
            pointer_to(100, 60);
            fault::arm_identity(Identity::PointerSent, 1, move || {
                pointer_to(600, 500);
                if back {
                    pointer_to(100, 60);
                }
            });
            let answer = request(&mut engine, command, input.clone());
            assert!(fault::identity_hook_ran(), "{command}: the hook ran");
            let error = answer.expect_err(command);
            assert!(
                error.starts_with(&format!(
                    "firefox may not have taken the {what}: the desktop pointer left its window"
                )),
                "{command}, back in {back}: {error}"
            );
        }
    }
}

/// The button presses the window was sent since the last call.
fn presses(gecko: &Gecko) -> usize {
    gecko.conn.sync().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(100));
    let mut n = 0;
    while let Some(event) = gecko.conn.poll_for_event().unwrap() {
        n += usize::from(matches!(event, x11rb::protocol::Event::ButtonPress(_)));
    }
    n
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display with XTEST and XInput 2 (--features live)"
)]
fn a_gecko_request_whose_pointer_left_before_the_watch_s_read_is_refused_though_the_pointer_comes_back() {
    // the route's read finds the pointer in; it is out at the watch's read (the second), back in by any later read,
    // and out again once the request's events went out: refused in shared mode with nothing sent, never success
    let gecko = Gecko::open();
    let mut engine = Engine::new(crate::default_config()).unwrap();
    for (command, _, input) in requests(gecko.id) {
        pointer_to(100, 60);
        presses(&gecko);
        fault::arm_identity(Identity::PointerRead, 2, || {
            pointer_to(600, 500);
            fault::arm_identity(Identity::PointerRead, 1, || {
                pointer_to(100, 60);
                fault::arm_identity(Identity::PointerSent, 1, || pointer_to(600, 500));
            });
        });
        let answer = request(&mut engine, command, input.clone());
        fault::identity_hook_ran();
        let error = answer.expect_err(&format!("{command}: answered success"));
        assert!(
            error.starts_with("firefox does not accept background input"),
            "{command}: {error}"
        );
        assert_eq!(presses(&gecko), 0, "{command}: nothing sent");
    }
}
