//! The paste route under injected X faults (`fault.rs`), against a real GTK 3 text window (yad) on the test's own
//! display and accessibility bus: a press delivered whose acknowledgement is lost, a press the server rejects before
//! delivering it, and a release that fails. They need `--features live` (an X display, AT-SPI and yad), as the
//! engine-linux gate runs them.

use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::Engine;
use crate::fault::{self, Faults};
use crate::paste::UNCONFIRMED;
use crate::wire::Request;

const TEXT: &str = "start";

struct Yad {
    child: Child,
    file: std::path::PathBuf,
}

impl Drop for Yad {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.file);
    }
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

/// The first `text` node's value and focus.
fn text_node(node: &Value) -> Option<(String, bool)> {
    if node["role"] == json!("text") {
        let focused = node["states"].as_array().is_some_and(|s| s.contains(&json!("focused")));
        return Some((node["value"].as_str()?.to_string(), focused));
    }
    node["children"].as_array()?.iter().find_map(text_node)
}

fn read(engine: &mut Engine, id: u64) -> Option<(String, bool)> {
    let state = request(
        engine,
        "get_window_state",
        json!({"window": {"id": id}, "include_screenshot": false}),
    )
    .ok()?;
    text_node(&state["ax_tree"])
}

fn poll<T>(what: &str, mut probe: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(found) = probe() {
            return found;
        }
        assert!(Instant::now() < deadline, "{what}");
        sleep(Duration::from_millis(100));
    }
}

/// An engine and a focused yad text window holding `TEXT`, the caret at its end.
fn setup(tag: &str) -> (Engine, Yad, u64) {
    let title = format!("cua-engine-fault-{tag}-{}", std::process::id());
    let file = std::env::temp_dir().join(format!("{title}.txt"));
    std::fs::write(&file, TEXT).unwrap();
    let child = Command::new("yad")
        .args([
            "--text-info",
            "--editable",
            "--no-buttons",
            "--width=400",
            "--height=200",
        ])
        .arg(format!("--title={title}"))
        .arg(format!("--filename={}", file.display()))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("yad");
    let yad = Yad { child, file };
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let id = poll("the window is listed", || {
        let windows = request(&mut engine, "list_windows", json!({})).ok()?;
        windows
            .as_array()?
            .iter()
            .find(|w| w["title"] == json!(title))
            .and_then(|w| w["id"].as_u64())
    });
    poll("its text is on the bus", || {
        read(&mut engine, id).filter(|(t, _)| t == TEXT)
    });
    request(&mut engine, "activate_window", json!({"window": {"id": id}})).unwrap();
    poll("its text view has the focus", || {
        read(&mut engine, id).filter(|(_, f)| *f)
    });
    request(
        &mut engine,
        "press_key",
        json!({"window": {"id": id}, "key": "ctrl+End"}),
    )
    .unwrap();
    (engine, yad, id)
}

fn paste(engine: &mut Engine, id: u64, text: &str) -> Result<Value, String> {
    request(engine, "type_text", json!({"window": {"id": id}, "text": text}))
}

/// Every key pressed has been released, in the events delivered.
fn all_released(sent: &[(u8, bool)]) -> bool {
    let mut held: Vec<u8> = Vec::new();
    for &(keycode, press) in sent {
        if press {
            held.push(keycode);
        } else if let Some(i) = held.iter().position(|k| *k == keycode) {
            held.remove(i);
        }
    }
    held.is_empty()
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and yad (--features live)"
)]
fn a_lost_acknowledgement_of_the_delivered_v_is_not_answered_as_nothing_pasted() {
    let _serial = crate::clipboard::tests::serial();
    let (mut engine, _yad, id) = setup("ack-v");
    // Ctrl, then V: V is delivered and its acknowledgement lost.
    fault::arm(Faults {
        ack_lost_on_press: Some(2),
        ..Faults::default()
    });
    let answer = paste(&mut engine, id, "X");
    let sent = fault::sent();
    fault::arm(Faults::default());
    assert!(
        !answer.as_ref().is_err_and(|e| e.contains("nothing")),
        "a key that may have arrived is never answered as nothing sent: {answer:?}"
    );
    assert_eq!(answer, Ok(Value::Null), "the field shows the paste, so it is confirmed");
    assert_eq!(read(&mut engine, id).map(|(t, _)| t).as_deref(), Some("startX"));
    assert_eq!(sent.iter().filter(|(_, p)| *p).count(), 2, "no press sent again");
    assert!(
        all_released(&sent),
        "the V whose press went unacknowledged is released too: {sent:?}"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and yad (--features live)"
)]
fn a_lost_acknowledgement_before_the_v_keeps_the_unconfirmed_answer_and_its_window() {
    let _serial = crate::clipboard::tests::serial();
    let (mut engine, _yad, id) = setup("ack-ctrl");
    // Ctrl is delivered and its acknowledgement lost: V is never sent, but the engine cannot know that Ctrl alone
    // did nothing, or that nothing else arrived.
    fault::arm(Faults {
        ack_lost_on_press: Some(1),
        ..Faults::default()
    });
    let answer = paste(&mut engine, id, "X");
    let sent = fault::sent();
    fault::arm(Faults::default());
    assert_eq!(answer, Err(UNCONFIRMED.to_string()));
    assert!(all_released(&sent), "{sent:?}");
    assert_eq!(read(&mut engine, id).map(|(t, _)| t).as_deref(), Some(TEXT));
    let next = paste(&mut engine, id, "Y").unwrap_err();
    assert!(
        next.starts_with("a previous paste could not be confirmed and may still be read"),
        "the unconfirmed cleanup opened the CurrentTime window: {next}"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and yad (--features live)"
)]
fn a_v_the_server_rejects_before_delivery_is_not_applied_and_opens_no_window() {
    let _serial = crate::clipboard::tests::serial();
    let (mut engine, _yad, id) = setup("reject");
    fault::arm(Faults {
        reject_press: Some(2),
        ..Faults::default()
    });
    let answer = paste(&mut engine, id, "X");
    let sent = fault::sent();
    fault::arm(Faults::default());
    let error = answer.unwrap_err();
    assert!(
        error.starts_with("the X server refused the paste chord") && error.contains("nothing was pasted"),
        "{error}"
    );
    assert!(all_released(&sent), "the delivered Ctrl is released: {sent:?}");
    assert_eq!(read(&mut engine, id).map(|(t, _)| t).as_deref(), Some(TEXT));
    assert_eq!(
        paste(&mut engine, id, "Y"),
        Ok(Value::Null),
        "nothing pending: the next paste goes out"
    );
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and yad (--features live)"
)]
fn a_failed_release_is_retried_once_and_reported_even_when_the_paste_confirms() {
    let _serial = crate::clipboard::tests::serial();
    let (mut engine, _yad, id) = setup("release");
    fault::arm(Faults {
        fail_releases_of_press: Some(2),
        ..Faults::default()
    });
    let answer = paste(&mut engine, id, "X");
    let (sent, failed) = (fault::sent(), fault::failed_releases());
    fault::arm(Faults::default());
    assert!(
        failed >= 2,
        "the release was tried again ({failed} attempts; the session's close tries once more)"
    );
    assert_eq!(
        read(&mut engine, id).map(|(t, _)| t).as_deref(),
        Some("startX"),
        "pasted once"
    );
    let error = answer.unwrap_err();
    assert!(
        error.starts_with("Paste was applied, but a key of the paste chord could not be released"),
        "confirmation does not hide the failed release: {error}"
    );
    assert_eq!(sent.iter().filter(|(_, p)| *p).count(), 2, "no press sent again");
}
