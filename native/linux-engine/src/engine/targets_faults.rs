//! A paste into a target that keeps CLIPBOARD's targets, as gnome-terminal does (task 56, fix 3), on the test's own
//! display and accessibility bus: a GTK 3 window (`tests/support/targets-refresh.py`) that asks for `TARGETS` at every
//! owner change and drops a paste chord that comes before the answer. The chord must reach it after its answer: in
//! every family when its request has already come (the owner thread held back from answering), and, in a family that
//! asks at every owner change (VTE's class), when it asks late too. A focus change during that wait refuses the paste,
//! nothing sent.
//!
//! They need `--features live` (an X display, AT-SPI) and python3-gi with GTK 3. Without python3-gi each says so on
//! stderr and passes: the engine-linux gate's runner has none (`tech-debt-tracker.md`).

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use x11rb::protocol::xproto::{ConnectionExt as _, InputFocus};
use x11rb::wrapper::ConnectionExt as _;

use super::Engine;
use super::identity_faults::{find, read, request};
use crate::clipboard::REQUEST_PAUSE_MS;
use crate::clipboard::tests::{clear_clipboard, serial};
use crate::fault::{self, Faults, Identity};
use crate::paste::TARGETS_REFRESH_WAIT;

const SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/support/targets-refresh.py");
const PATIENCE: Duration = Duration::from_secs(20);
/// VTE's X11 class (`families.rs`): a family that asks for `TARGETS` at every owner change.
const TERMINAL: &str = "gnome-terminal";
/// A class no family lists: one that waits for no request.
const UNLISTED: &str = "cua-targets-fixture";

type Log = Arc<Mutex<Vec<Value>>>;

struct Target {
    child: Child,
    log: Log,
    stdin: Arc<Mutex<ChildStdin>>,
    window: u32,
}

impl Drop for Target {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Target {
    fn send(&self) -> impl Fn(&str) + 'static {
        let stdin = self.stdin.clone();
        move |command: &str| {
            let mut stdin = stdin.lock().unwrap();
            writeln!(stdin, "{command}").unwrap();
            stdin.flush().unwrap();
        }
    }

    /// What the target printed, without its markers.
    fn events(&self) -> Vec<Value> {
        self.log
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.get("marker").is_none())
            .cloned()
            .collect()
    }
}

fn wait_for(log: &Log, what: &str, ready: impl Fn(&[Value]) -> bool) {
    let deadline = Instant::now() + PATIENCE;
    while !ready(&log.lock().unwrap()) {
        assert!(Instant::now() < deadline, "{what}: {:?}", log.lock().unwrap());
        sleep(Duration::from_millis(10));
    }
}

/// The target with program name `prgname`, asking `delay` after each owner change, focused and read by a fresh
/// engine; or None where python3-gi with GTK 3 is not installed.
fn target(tag: &str, prgname: &str, delay: &str) -> Option<(Engine, Target)> {
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
    clear_clipboard();
    let title = format!("cua-engine-targets-{tag}-{}", std::process::id());
    let mut child = Command::new("python3")
        .args([SCRIPT, &title, prgname, delay])
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
    wait_for(&log, "the window mapped", |l| l.iter().any(|r| r["xid"].is_u64()));
    let window = log.lock().unwrap().iter().find_map(|r| r["xid"].as_u64()).unwrap() as u32;
    let (conn, _) = x11rb::connect(None).unwrap();
    conn.set_input_focus(InputFocus::PARENT, window, x11rb::CURRENT_TIME)
        .unwrap();
    conn.sync().unwrap();
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let deadline = Instant::now() + PATIENCE;
    while read(&mut engine, window)
        .ok()
        .and_then(|s| find(&s["ax_tree"], &|n| n["value"] == json!("start")).cloned())
        .is_none()
    {
        assert!(Instant::now() < deadline, "the window's tree is on the bus");
        sleep(Duration::from_millis(100));
    }
    let target = Target {
        child,
        log,
        stdin,
        window,
    };
    Some((engine, target))
}

fn paste(engine: &mut Engine, target: &Target) -> Result<Value, String> {
    request(
        engine,
        "type_text",
        json!({"window": {"id": target.window}, "text": "PASTED"}),
    )
}

/// The target's events from the last owner change on: its TARGETS answer before the chord, and the paste inserted.
fn answered_before_the_chord(target: &Target) {
    wait_for(&target.log, "the chord", |l| l.iter().any(|r| r.get("chord").is_some()));
    let events = target.events();
    let from = events
        .iter()
        .rposition(|r| r.get("owner_change").is_some())
        .expect("an owner change");
    let order: Vec<&str> = events[from..]
        .iter()
        .filter_map(|r| {
            if r.get("targets").is_some() {
                Some("targets")
            } else if r.get("chord").is_some() {
                Some("chord")
            } else {
                None
            }
        })
        .collect();
    assert_eq!(order[..2], ["targets", "chord"], "{events:?}");
    wait_for(&target.log, "the paste inserted", |l| {
        l.iter().any(|r| r["pasted"] == json!("PASTED"))
    });
}

/// Holds the owner thread before each request it handles, for as long as it lives.
struct RequestPause;

impl Drop for RequestPause {
    fn drop(&mut self) {
        REQUEST_PAUSE_MS.store(0, Ordering::SeqCst);
    }
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_terminal_that_asks_for_targets_late_still_has_its_answer_before_the_chord() {
    let _serial = serial();
    let delay = (TARGETS_REFRESH_WAIT.as_millis() / 2).to_string();
    let Some((mut engine, target)) = target("late", TERMINAL, &delay) else {
        return;
    };
    let answer = paste(&mut engine, &target);
    assert_eq!(answer, Ok(Value::Null));
    answered_before_the_chord(&target);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_request_the_owner_has_not_yet_answered_is_answered_before_the_chord_in_any_family() {
    let _serial = serial();
    let Some((mut engine, target)) = target("held", UNLISTED, "0") else {
        return;
    };
    let _held = RequestPause;
    let log = target.log.clone();
    fault::arm(Faults::default());
    fault::arm_identity(Identity::Taken, 1, move || {
        // the target asks at once; the owner thread is slow to answer
        REQUEST_PAUSE_MS.store(300, Ordering::SeqCst);
        wait_for(&log, "the owner change", |l| {
            l.iter().any(|r| r.get("owner_change").is_some())
        });
        sleep(Duration::from_millis(100));
    });
    let answer = paste(&mut engine, &target);
    assert!(fault::identity_hook_ran());
    assert_eq!(answer, Ok(Value::Null));
    answered_before_the_chord(&target);
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_focus_change_during_the_wait_for_targets_refuses_with_nothing_sent() {
    let _serial = serial();
    let Some((mut engine, target)) = target("focus", TERMINAL, "never") else {
        return;
    };
    let (send, log) = (target.send(), target.log.clone());
    fault::arm(Faults::default());
    fault::arm_identity(Identity::TargetsWait, 1, move || {
        send("focus other");
        wait_for(&log, "the other entry focused", |l| {
            l.iter().any(|r| r["focus"] == json!("other"))
        });
    });
    let answer = paste(&mut engine, &target);
    let sent = fault::sent();
    assert!(fault::identity_hook_ran(), "the hook ran: {answer:?}");
    assert_eq!(
        answer,
        Err("requested field or selection changed before dispatch; nothing was sent".to_string())
    );
    assert!(sent.is_empty(), "no key was sent: {sent:?}");
    assert!(
        !target.events().iter().any(|r| r.get("chord").is_some()),
        "no chord reached the target"
    );
}
