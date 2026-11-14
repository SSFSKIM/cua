//! Refusals that follow a request's own preparation input (M4's T5, round 3; the design session's ruling: "nothing was
//! sent" only when nothing was). A paste into a named field that lacks the focus clicks it first, so every refusal
//! after that click says the click reached the window and no paste was dispatched; and the Copy's context menu, once
//! opened, is closed with an Escape that is said to have been sent, never to have closed it. Each refusal site the
//! paste route reaches after its click is brought about here at the step just before it, on one GTK 3 window of the
//! identity fixture (`tests/support/gtk3-twins.py`) whose title is its own, so its association is the vendor's.
//!
//! They need `--features live` (an X display, AT-SPI) and python3-gi with GTK 3. Without python3-gi each says so on
//! stderr and passes, except under `CUA171_GTK_TESTS=required` (the engine-linux gate), where it fails.

use std::cell::RefCell;
use std::rc::Rc;
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, InputFocus, PropMode, WindowClass};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use super::Engine;
use super::identity_faults::{Fixture, active, clipboard_text, find, fixture, read, request, wait_for};
use crate::clipboard::tests::{Behaviour, TestOwner, clear_clipboard, intern, serial, server_time};
use crate::fault::{self, Faults, Identity};

const PATIENCE: Duration = Duration::from_secs(20);

/// What every refusal after a focusing click ends with.
fn after_click(cause: &str) -> String {
    format!(
        "{cause}; no paste was dispatched, but a focusing click already reached the window, so read the window before \
         retrying"
    )
}

/// One window of the fixture, active and focused, read by a fresh engine, the clipboard holding the fixture's `before`.
pub(super) fn single(tag: &str, args: &[&str]) -> Option<(Engine, Fixture, u32)> {
    let fixture = fixture(tag, 1, args)?;
    let window = fixture.windows[0];
    x_focus(window);
    wait_for(&fixture.log, "GTK marks the window active", |l| {
        active(l, 1) == Some(true)
    });
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let deadline = Instant::now() + PATIENCE;
    while read(&mut engine, window).is_err() {
        assert!(Instant::now() < deadline, "the window's tree is on the bus");
        sleep(Duration::from_millis(100));
    }
    assert_eq!(clipboard_text(), "before");
    Some((engine, fixture, window))
}

/// The X input focus to `window` (the root for none of the fixture's).
fn x_focus(window: u32) {
    let (conn, _) = x11rb::connect(None).unwrap();
    conn.set_input_focus(InputFocus::PARENT, window, x11rb::CURRENT_TIME)
        .unwrap();
    conn.sync().unwrap();
}

fn root() -> u32 {
    let (conn, screen) = x11rb::connect(None).unwrap();
    conn.setup().roots[screen].root
}

/// The id of the window's node whose value is `value`.
fn node(engine: &mut Engine, window: u32, value: &str) -> Value {
    let state = read(engine, window).unwrap();
    find(&state["ax_tree"], &|n| n["value"] == json!(value)).unwrap_or_else(|| panic!("{value}"))["id"].clone()
}

/// A paste of `PASTED` into the field whose value is `value`, which lacks the focus, so the paste clicks it first.
fn paste_into(engine: &mut Engine, window: u32, value: &str) -> Result<Value, String> {
    let field = node(engine, window, value);
    request(
        engine,
        "type_text",
        json!({"window": {"id": window}, "element_id": field, "text": "PASTED"}),
    )
}

/// The fixture's records with `key`.
pub(super) fn records(fixture: &Fixture, key: &str) -> Vec<Value> {
    sleep(Duration::from_millis(200));
    fixture
        .log
        .lock()
        .unwrap()
        .iter()
        .filter(|r| r.get(key).is_some())
        .cloned()
        .collect()
}

/// What each case checks once refused: the answer, the one focusing press on the second entry, no key sent.
fn refused_after_the_click(fixture: &Fixture, answer: Result<Value, String>, cause: &str) {
    let sent = fault::sent();
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(answer, Err(after_click(cause)));
    assert_eq!(
        records(fixture, "button"),
        [json!({"button": 1, "window": 1})],
        "the one focusing press"
    );
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
}

/// The fixture's focus moved to its first entry, and GTK seen to have moved it.
fn focus_first_entry(fixture: &Fixture) -> impl FnOnce() + 'static {
    let (send, log) = (fixture.commands(), fixture.log.clone());
    move || {
        let before = log.lock().unwrap().len();
        send("focus entry 1");
        wait_for(&log, "the first entry focused", |l| {
            l[before..].contains(&json!({"entry_focus": 1}))
        });
    }
}

/// `hook`'s value kept alive until the test drops the holder: a lock, a clipboard owner.
fn kept<T: 'static>(holder: &Rc<RefCell<Option<T>>>, make: impl FnOnce() -> T + 'static) -> impl FnOnce() + 'static {
    let holder = holder.clone();
    move || *holder.borrow_mut() = Some(make())
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_field_that_never_takes_the_focus_says_its_clicks_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("nofocus", &[]) else {
        return;
    };
    fault::arm(Faults::default());
    let answer = paste_into(&mut engine, window, "nofocus-1");
    let sent = fault::sent();
    assert_eq!(answer, Err(after_click("element did not take the focus when clicked")));
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    assert_eq!(clipboard_text(), "before");
    drop(fixture);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_field_that_loses_the_focus_at_its_restore_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("restore-focus", &[]) else {
        return;
    };
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Restore, 1, focus_first_entry(&fixture));
    let answer = paste_into(&mut engine, window, "other-1");
    refused_after_the_click(&fixture, answer, "requested field or selection changed before dispatch");
    assert_eq!(clipboard_text(), "before");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_desktop_focus_change_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("desktop-focus", &[]) else {
        return;
    };
    // the real focus elsewhere when the paste starts (its session's synthetic focus stands in), then into the window
    x_focus(root());
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Restore, 1, move || x_focus(window));
    let answer = paste_into(&mut engine, window, "other-1");
    refused_after_the_click(&fixture, answer, "requested field or selection changed before dispatch");
    assert_eq!(clipboard_text(), "before");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_clipboard_lock_held_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("busy", &[]) else {
        return;
    };
    // another engine's lock, taken once the field is focused and held until the request has ended
    let holder: Rc<RefCell<Option<RustConnection>>> = Rc::default();
    fault::arm(Faults::default());
    fault::arm_identity(
        Identity::Restore,
        1,
        kept(&holder, || {
            let (conn, screen) = x11rb::connect(None).unwrap();
            let lock = conn.generate_id().unwrap();
            conn.create_window(
                0,
                lock,
                conn.setup().roots[screen].root,
                0,
                0,
                1,
                1,
                0,
                WindowClass::INPUT_ONLY,
                0,
                &CreateWindowAux::new(),
            )
            .unwrap();
            conn.set_selection_owner(lock, intern(&conn, "CUA_CLIPBOARD_LOCK"), x11rb::CURRENT_TIME)
                .unwrap();
            conn.sync().unwrap();
            conn
        }),
    );
    let answer = paste_into(&mut engine, window, "other-1");
    drop(holder);
    refused_after_the_click(&fixture, answer, "clipboard busy");
    assert_eq!(clipboard_text(), "before");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn an_unconfirmed_paste_s_window_opened_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("quarantine", &[]) else {
        return;
    };
    // another engine's unconfirmed paste, its display-wide window opened once the field is focused
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Restore, 1, || {
        let (conn, screen) = x11rb::connect(None).unwrap();
        let end = server_time(&conn).wrapping_add(5_000);
        conn.change_property32(
            PropMode::REPLACE,
            conn.setup().roots[screen].root,
            intern(&conn, "CUA_CLIPBOARD_QUARANTINE"),
            AtomEnum::CARDINAL,
            &[end, 0],
        )
        .unwrap();
        conn.sync().unwrap();
    });
    let answer = paste_into(&mut engine, window, "other-1");
    let said = answer.clone().unwrap_err();
    clear_clipboard();
    let retry = said
        .strip_prefix(
            "a previous paste could not be confirmed and may still be read; no paste was dispatched, but a focusing \
             click already reached the window, so read the window before retrying after ",
        )
        .and_then(|rest| rest.strip_suffix(" s"))
        .and_then(|n| n.parse::<u64>().ok());
    assert!(retry.is_some_and(|n| (1..=5).contains(&n)), "{said}");
    assert!(fault::identity_hook_ran());
    assert_eq!(
        records(&fixture, "button"),
        [json!({"button": 1, "window": 1})],
        "the one focusing press"
    );
    assert!(fault::sent().is_empty(), "no key was sent");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_silent_clipboard_owner_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("silent", &[]) else {
        return;
    };
    let holder: Rc<RefCell<Option<TestOwner>>> = Rc::default();
    fault::arm(Faults::default());
    fault::arm_identity(
        Identity::Restore,
        1,
        kept(&holder, || TestOwner::start(Behaviour::Silent)),
    );
    let answer = paste_into(&mut engine, window, "other-1");
    drop(holder);
    refused_after_the_click(
        &fixture,
        answer,
        "clipboard capture timed out: the clipboard owner did not answer TARGETS within 500 ms",
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_copy_between_the_snapshot_and_the_take_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("generation", &[]) else {
        return;
    };
    let holder: Rc<RefCell<Option<TestOwner>>> = Rc::default();
    fault::arm(Faults::default());
    fault::arm_identity(
        Identity::Snapshot,
        1,
        kept(&holder, || {
            TestOwner::start(Behaviour::Serve(vec![("UTF8_STRING", b"newer".to_vec())]))
        }),
    );
    let answer = paste_into(&mut engine, window, "other-1");
    refused_after_the_click(&fixture, answer, "the clipboard changed after it was read");
    assert_eq!(clipboard_text(), "newer", "the newer copy is left alone");
    drop(holder);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_field_changed_at_the_revalidation_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("revalidate", &[]) else {
        return;
    };
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Taken, 1, focus_first_entry(&fixture));
    let answer = paste_into(&mut engine, window, "other-1");
    refused_after_the_click(&fixture, answer, "requested field or selection changed before dispatch");
    assert_eq!(clipboard_text(), "before", "the clipboard holds what it held");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_clipboard_taken_from_the_paste_after_the_click_says_the_click_reached_the_window() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("lost", &[]) else {
        return;
    };
    let holder: Rc<RefCell<Option<TestOwner>>> = Rc::default();
    fault::arm(Faults::default());
    let take = kept(&holder, || {
        TestOwner::start(Behaviour::Serve(vec![("UTF8_STRING", b"taken".to_vec())]))
    });
    fault::arm_identity(Identity::Taken, 1, move || {
        take();
        // the engine's owner thread handles its SelectionClear before the paste looks
        sleep(Duration::from_millis(100));
    });
    let answer = paste_into(&mut engine, window, "other-1");
    refused_after_the_click(
        &fixture,
        answer,
        "another program took the clipboard before the paste was sent",
    );
    assert_eq!(clipboard_text(), "taken", "the new owner's contents are left alone");
    drop(holder);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_context_menu_copy_on_the_vendor_s_own_match_still_copies() {
    // The control for the identity routes' refusal: a window whose title is its own copies through its menu.
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-title", &["menu"]) else {
        return;
    };
    assert!(request(&mut engine, "clipboard_read", json!({"window": {"id": window}})).is_ok());
    assert_eq!(clipboard_text(), "menu-copy-1");
    assert_eq!(records(&fixture, "copied"), [json!({"copied": 1})]);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_context_menu_with_no_copy_says_an_escape_was_sent_to_close_it_not_that_it_closed() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-nocopy", &["menu", "Paste"]) else {
        return;
    };
    let answer = request(&mut engine, "clipboard_read", json!({"window": {"id": window}}));
    assert_eq!(
        answer,
        Err(
            "native menu opened without an available Copy; no clipboard action was sent; an Escape was sent to \
             close the menu the Copy opened"
                .to_string()
        )
    );
    assert_eq!(clipboard_text(), "before");
    assert_eq!(
        records(&fixture, "menu")[0],
        json!({"menu": "open", "window": 1}),
        "the menu had opened"
    );
}
