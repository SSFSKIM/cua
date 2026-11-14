//! A requested context menu, confirmed or answered `menuUnconfirmed` (Decision Log, 2026-11-14, candidate 3), and a
//! context-menu Copy served late, against a real GTK 3 process: one window of the identity fixture
//! (`tests/support/gtk3-twins.py`) whose `menu-1` offers one action, `showContextMenu`, that opens a real GTK menu (or,
//! told to, opens nothing, as an application that ignores the request does). Each request goes through the engine's
//! own dispatcher, so the answer is the wire's.
//!
//! They need `--features live` (an X display, AT-SPI) and python3-gi with GTK 3. Without python3-gi each says so on
//! stderr and passes: the engine-linux gate's runner has none (`tech-debt-tracker.md`).

use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::Engine;
use super::elements::menu_unconfirmed;
use super::identity_faults::{Fixture, clipboard_text, find, read, request, wait_for};
use super::refusal_faults::{records, single};
use crate::clipboard::tests::{clear_clipboard, serial};
use crate::copy::{CopyRoute, timed_out};

/// The id of the fixture's `menu-1`, the element whose one action is `showContextMenu`.
fn menu_element(engine: &mut Engine, window: u32) -> Value {
    let state = read(engine, window).unwrap();
    find(&state["ax_tree"], &|n| n["name"] == json!("menu-1")).expect("menu-1")["id"].clone()
}

fn secondary(engine: &mut Engine, window: u32, element: &Value) -> Result<Value, String> {
    request(
        engine,
        "perform_secondary_action",
        json!({"window": {"id": window}, "element_id": element, "action": "showContextMenu"}),
    )
}

fn right_click(engine: &mut Engine, window: u32, element: &Value) -> Result<Value, String> {
    request(
        engine,
        "click",
        json!({"window": {"id": window}, "element_id": element, "mouse_button": "right"}),
    )
}

/// How many context menus the fixture has said it opened.
fn opened(fixture: &Fixture) -> usize {
    records(fixture, "menu")
        .iter()
        .filter(|r| r["menu"] == json!("open"))
        .count()
}

/// The open menu closed, and GTK seen to have closed and destroyed it (one more `{"menu": "closed"}`). GTK shows one
/// menu at a time: a second one popped up closes the first.
fn popdown(fixture: &Fixture) {
    let closed = |l: &[Value]| l.iter().filter(|r| r["menu"] == json!("closed")).count();
    let before = closed(&fixture.log.lock().unwrap());
    fixture.commands()("popdown");
    wait_for(&fixture.log, "the open menu closed and gone", |l| closed(l) > before);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_requested_context_menu_answers_ok_once_its_menu_appears_and_unconfirmed_when_none_does() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-confirm", &["menu"]) else {
        return;
    };
    let element = menu_element(&mut engine, window);
    let started = Instant::now();
    assert_eq!(secondary(&mut engine, window, &element), Ok(Value::Null));
    assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    assert_eq!(opened(&fixture), 1, "the menu opened");
    // the menu is still open after the answer: the request's own session did not close it
    assert!(records(&fixture, "menu").iter().all(|r| r["menu"] != json!("closed")));
    popdown(&fixture);
    // an application that takes the action and opens nothing: sent, and answered menuUnconfirmed after the wait
    fixture.commands()("ignore");
    let started = Instant::now();
    assert_eq!(secondary(&mut engine, window, &element), Err(menu_unconfirmed()));
    assert!(started.elapsed() >= Duration::from_secs(1), "{:?}", started.elapsed());
    assert_eq!(opened(&fixture), 1, "no menu opened");
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_menu_already_open_confirms_a_new_one_but_not_itself() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-open", &["menu"]) else {
        return;
    };
    let element = menu_element(&mut engine, window);
    fixture.commands()("popup 1");
    wait_for(&fixture.log, "the first menu open", |l| {
        l.contains(&json!({"menu": "open", "window": 1}))
    });
    // the action opens another menu, a new child of the application beside (or instead of) the open one: confirmed
    assert_eq!(secondary(&mut engine, window, &element), Ok(Value::Null));
    assert_eq!(opened(&fixture), 2);
    // the action ignored with a menu open: the open menu, there before the request, confirms nothing
    fixture.commands()("ignore");
    assert_eq!(secondary(&mut engine, window, &element), Err(menu_unconfirmed()));
    assert_eq!(opened(&fixture), 2);
    popdown(&fixture);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn the_right_click_s_context_menu_fallback_confirms_its_menu_or_is_unconfirmed() {
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-fallback", &["menu"]) else {
        return;
    };
    let element = menu_element(&mut engine, window);
    // no visible point: the right click falls back to showContextMenu (behaviour §7.2)
    fixture.commands()("unshow 1");
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let state = read(&mut engine, window).unwrap();
        let menu = find(&state["ax_tree"], &|n| n["name"] == json!("menu-1"))
            .expect("menu-1")
            .clone();
        if !menu["states"].as_array().is_some_and(|s| s.contains(&json!("showing"))) {
            break;
        }
        assert!(Instant::now() < deadline, "menu-1 still showing: {menu}");
        sleep(Duration::from_millis(50));
    }
    assert_eq!(right_click(&mut engine, window, &element), Ok(Value::Null));
    assert_eq!(opened(&fixture), 1, "the fallback opened the menu");
    assert!(
        records(&fixture, "button").is_empty(),
        "no button was pressed: the fallback ran the action"
    );
    popdown(&fixture);
    fixture.commands()("ignore");
    assert_eq!(right_click(&mut engine, window, &element), Err(menu_unconfirmed()));
    assert_eq!(opened(&fixture), 1);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_context_menu_copy_served_late_is_answered_timed_out_and_the_next_copy_works() {
    // Task 77's forced stall, made deterministic: the menu's Copy is activated, and the application changes the
    // clipboard only after COPY_WAIT. The answer names both risks; the Copy lands later; nothing is sent to recover;
    // and the next Copy, served at once, works.
    let _serial = serial();
    let Some((mut engine, fixture, window)) = single("menu-late", &["menu"]) else {
        return;
    };
    fixture.commands()("late 2600");
    let answer = request(&mut engine, "clipboard_read", json!({"window": {"id": window}}));
    assert_eq!(answer, Err(timed_out(CopyRoute::Menu).to_string()));
    assert!(records(&fixture, "copied").is_empty(), "not served within the wait");
    wait_for(&fixture.log, "the Copy served late", |l| {
        l.contains(&json!({"copied": 1}))
    });
    assert_eq!(
        clipboard_text(),
        "menu-copy-1",
        "the late Copy changed the clipboard after the answer"
    );
    fixture.commands()("late 0");
    clear_clipboard();
    let next = request(&mut engine, "clipboard_read", json!({"window": {"id": window}}));
    assert!(matches!(next, Ok(Value::String(_))), "{next:?}");
    assert_eq!(clipboard_text(), "menu-copy-1");
    assert_eq!(records(&fixture, "copied").len(), 2);
}
