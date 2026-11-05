//! A background session's `FocusOut` and the paste's settle, live (M4's T7 as the design session ruled on task 59's
//! measurement, 2026-11-04; `src/route.rs`, `src/settle.rs`): the engine binary over its wire, against bare windows of
//! the test's own that record every key and focus event they receive and when, on a display with no window manager (the
//! CI gate's Xvfb). Each background request's `FocusOut` goes as its input ends, before its answer, the window's
//! redirect kept; a paste after keys to its window waits until its settle has passed since the last of them; the exit
//! releases what it holds and settles before its redirects go. The release workflow runs these on the shipped asset
//! (`CUA_ENGINE_BIN`), so the exit is proven on the bytes that ship.
//!
//!   xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1

#![cfg(feature = "live")]

mod support;

use rustix::process::Signal;
use serde_json::{Value, json};
use std::thread::sleep;
use std::time::{Duration, Instant};
use support::Engine;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, Window, WindowClass,
};
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

/// The exit's settle after the last key to a window whose redirect it drops (`--exit-settle-ms`'s default).
const EXIT_SETTLE: Duration = Duration::from_millis(300);
/// The paste's settle these tests set (`--paste-settle-ms`), well above a failing paste's own work on a bare window, so
/// a wait shows apart from that work whatever the shipped value (`settle::PASTE_SETTLE`).
const PASTE_SETTLE: Duration = Duration::from_millis(150);
/// The slack a time measured at the probe may show: an event's own trip to the probe, and the probe's poll.
const SLACK: Duration = Duration::from_millis(10);
/// What a request answered with no wait takes here at most, its own X and bus round trips: far under every wait the
/// tests tell apart (the settles, a teardown set for measurement, 0.3.0's 100 ms).
const PROMPT: Duration = Duration::from_millis(50);
/// How long the probes wait for events still on their way.
const QUIET: Duration = Duration::from_millis(400);

/// One event a probe received (all of them synthetic here), and when.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    FocusIn,
    FocusOut,
    KeyPress,
    KeyRelease,
}

#[derive(Debug, Clone, Copy)]
struct Seen {
    window: Window,
    kind: Kind,
    at: Instant,
}

/// Bare top-level windows of the test's own, mapped, all on one X connection of their own, so the events the engine
/// sends them arrive in one queue in the order the server delivered them; destroyed on drop.
struct Probe {
    conn: RustConnection,
    ids: Vec<Window>,
}

/// An X connection of the probe's own. xvfb-run's server resets once its last client leaves (no `-noreset`), and a
/// connection made while it resets is refused (ECONNRESET, 1 of 11 suite runs here): such a refusal is retried.
fn connect() -> (RustConnection, usize) {
    for _ in 0..20 {
        match x11rb::connect(None) {
            Ok(connected) => return connected,
            Err(x11rb::errors::ConnectError::IoError(e)) if e.kind() == std::io::ErrorKind::ConnectionReset => {
                sleep(Duration::from_millis(50));
            }
            Err(error) => panic!("an X connection: {error:?}"),
        }
    }
    panic!("an X connection: still reset after 1 s");
}

impl Probe {
    fn open(name: &str, x: i16) -> Probe {
        Probe::open_all(&[(name, x)])
    }

    fn open_all(windows: &[(&str, i16)]) -> Probe {
        let (conn, screen) = connect();
        let screen = &conn.setup().roots[screen];
        let mut ids = Vec::new();
        for (name, x) in windows {
            let id = conn.generate_id().unwrap();
            let aux = CreateWindowAux::new()
                .background_pixel(screen.white_pixel)
                .event_mask(EventMask::KEY_PRESS | EventMask::KEY_RELEASE | EventMask::FOCUS_CHANGE);
            conn.create_window(
                0,
                id,
                screen.root,
                *x,
                0,
                300,
                200,
                0,
                WindowClass::INPUT_OUTPUT,
                0,
                &aux,
            )
            .unwrap();
            let wm_class = format!("probe\0cua-focus-out-{name}\0");
            conn.change_property8(
                PropMode::REPLACE,
                id,
                AtomEnum::WM_CLASS,
                AtomEnum::STRING,
                wm_class.as_bytes(),
            )
            .unwrap();
            conn.map_window(id).unwrap();
            ids.push(id);
        }
        conn.sync().unwrap();
        let probe = Probe { conn, ids };
        // what mapping caused is not the engine's
        while probe.conn.poll_for_event().unwrap().is_some() {}
        probe
    }

    /// The first window, as a request names it.
    fn target(&self) -> Value {
        self.target_of(0)
    }

    fn target_of(&self, i: usize) -> Value {
        json!({"id": self.ids[i]})
    }

    fn poll(&self, into: &mut Vec<Seen>) {
        while let Some(event) = self.conn.poll_for_event().unwrap() {
            let (kind, window) = match event {
                Event::FocusIn(e) => (Kind::FocusIn, e.event),
                Event::FocusOut(e) => (Kind::FocusOut, e.event),
                Event::KeyPress(e) => (Kind::KeyPress, e.event),
                Event::KeyRelease(e) => (Kind::KeyRelease, e.event),
                _ => continue,
            };
            into.push(Seen {
                window,
                kind,
                at: Instant::now(),
            });
        }
    }
}

impl Drop for Probe {
    fn drop(&mut self) {
        for id in &self.ids {
            let _ = self.conn.destroy_window(*id);
        }
        let _ = self.conn.flush();
    }
}

/// Runs `act` while one thread records what the probe's windows receive, in the order the server delivered it, each
/// event with when it was read (a millisecond apart at most), then `QUIET` more for events still on their way: `act`'s
/// result and the events.
fn record<T>(probe: &Probe, act: impl FnOnce() -> T) -> (T, Vec<Seen>) {
    let done = std::sync::atomic::AtomicBool::new(false);
    std::thread::scope(|scope| {
        let watcher = scope.spawn(|| {
            let mut seen = Vec::new();
            while !done.load(std::sync::atomic::Ordering::SeqCst) {
                probe.poll(&mut seen);
                sleep(Duration::from_millis(1));
            }
            probe.poll(&mut seen);
            seen
        });
        // the watcher told to end however `act` ends, a panic included, so a failing test fails instead of hanging
        struct Ends<'a>(&'a std::sync::atomic::AtomicBool);
        impl Drop for Ends<'_> {
            fn drop(&mut self) {
                self.0.store(true, std::sync::atomic::Ordering::SeqCst);
            }
        }
        let ends = Ends(&done);
        let result = act();
        sleep(QUIET);
        drop(ends);
        (result, watcher.join().unwrap())
    })
}

fn kinds(seen: &[Seen]) -> Vec<Kind> {
    seen.iter().map(|s| s.kind).collect()
}

fn keys(window: &Value, n: usize) -> Vec<(&'static str, Value)> {
    (0..n)
        .map(|_| ("press_key", json!({"window": window, "key": "a"})))
        .collect()
}

fn burst(n: usize) -> Vec<Kind> {
    let mut kinds = vec![Kind::FocusIn];
    for _ in 0..n {
        kinds.extend([Kind::KeyPress, Kind::KeyRelease]);
    }
    kinds.push(Kind::FocusOut);
    kinds
}

fn all_ok(answers: &[(Value, Instant)]) {
    for (answer, _) in answers {
        assert_eq!(answer["ok"], json!(true), "{answer}");
    }
}

/// A duration as a flag's milliseconds.
fn ms(d: Duration) -> String {
    d.as_millis().to_string()
}

/// One session per request: each request's `FocusIn`, its keys, then its `FocusOut`, `n` times.
fn per_request(keys_each: usize, n: usize) -> Vec<Kind> {
    burst(keys_each).repeat(n)
}

/// When each `FocusOut` was read.
fn focus_outs(seen: &[Seen]) -> Vec<Instant> {
    seen.iter().filter(|s| s.kind == Kind::FocusOut).map(|s| s.at).collect()
}

/// The time from the last key event before `focus_out` to `focus_out`.
fn after_last_key(seen: &[Seen], focus_out: usize) -> Duration {
    let last = seen[..focus_out]
        .iter()
        .rev()
        .find(|s| s.window == seen[focus_out].window && matches!(s.kind, Kind::KeyPress | Kind::KeyRelease))
        .expect("a key before the FocusOut");
    seen[focus_out].at - last.at
}

#[test]
fn each_request_s_focus_out_follows_its_own_keys_before_its_answer() {
    let probe = Probe::open("burst", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    let (answers, seen) = record(&probe, || {
        engine.pipeline(&keys(&target, 10));
        engine.answers(10)
    });
    all_ok(&answers);
    assert_eq!(
        kinds(&seen),
        per_request(1, 10),
        "one session per request: its FocusIn, its key, its FocusOut"
    );
    // the probe reads each event at most a poll after it arrived, on a thread apart from the answers'
    for (i, (out, (_, answered))) in focus_outs(&seen).iter().zip(&answers).enumerate() {
        assert!(
            *out <= *answered + SLACK,
            "request {i}'s FocusOut came {:?} after its answer",
            out.saturating_duration_since(*answered)
        );
    }
}

#[test]
fn input_to_another_window_waits_for_nothing_and_never_finds_two_windows_focused() {
    let ab = Probe::open_all(&[("a", 0), ("b", 400)]);
    let mut engine = Engine::start();
    let (ta, tb) = (ab.target_of(0), ab.target_of(1));
    let mut requests = keys(&ta, 3);
    requests.extend(keys(&tb, 3));
    requests.extend(keys(&ta, 3));
    let (answers, seen) = record(&ab, || {
        engine.pipeline(&requests);
        engine.answers(9)
    });
    all_ok(&answers);
    let at = |window: Window| -> Vec<Kind> {
        kinds(&seen.iter().copied().filter(|s| s.window == window).collect::<Vec<_>>())
    };
    assert_eq!(
        at(ab.ids[0]),
        per_request(1, 6),
        "a, then a again: a session per request"
    );
    assert_eq!(at(ab.ids[1]), per_request(1, 3));
    let mut open: Option<Window> = None;
    for s in &seen {
        match s.kind {
            Kind::FocusIn => {
                assert_eq!(open, None, "a FocusIn while another window held the focus: {seen:?}");
                open = Some(s.window);
            }
            Kind::FocusOut => {
                assert_eq!(open, Some(s.window));
                open = None;
            }
            _ => assert_eq!(open, Some(s.window), "a key outside its window's session"),
        }
    }
    // the switch from a to b and back waits for nothing: no FocusOut is left to wait out
    for i in [3, 6] {
        let gap = answers[i].1 - answers[i - 1].1;
        assert!(
            gap < PROMPT,
            "request {i}, to the other window, answered {gap:?} after the one before it"
        );
    }
}

/// A paste right after a key to its own window waits until its settle has passed since that key, before it observes.
/// The bare window has no accessible field, so the paste then fails, sending nothing: its answer marks the wait's end.
#[test]
fn a_paste_after_a_key_to_its_window_waits_out_the_settle_since_that_key() {
    let probe = Probe::open("paste", 0);
    let mut engine = Engine::start_with(&["--paste-settle-ms", &ms(PASTE_SETTLE)]);
    let target = probe.target();
    let (answers, seen) = record(&probe, || {
        engine.pipeline(&[
            ("press_key", json!({"window": target, "key": "a"})),
            ("type_text", json!({"window": target, "text": "x"})),
        ]);
        engine.answers(2)
    });
    assert_eq!(answers[0].0["ok"], json!(true));
    assert_eq!(
        answers[1].0["ok"],
        json!(false),
        "no field to paste into: {}",
        answers[1].0
    );
    assert_eq!(
        kinds(&seen),
        burst(1),
        "the key's session, ended before the paste; the paste sent nothing"
    );
    let waited = answers[1].1 - answers[0].1;
    assert!(
        waited >= PASTE_SETTLE - SLACK,
        "the paste answered {waited:?} after the key: it did not wait out the settle"
    );
    assert!(waited < PASTE_SETTLE + PROMPT * 2, "{waited:?}");
}

/// A paste right after a click to its own window waits until the click settle has passed since that click, before it
/// observes: a click that moves the focus or the caret can land after an observation made at once, which then reads the
/// field the click left (the review of task 60: Chrome observed the textarea a click had just left, pasted into the one
/// clicked, and answered unconfirmed). The bare window has no accessible field, so the paste then fails, sending
/// nothing: its answer marks the wait's end.
#[test]
fn a_paste_after_a_click_to_its_window_waits_out_the_click_settle_since_that_click() {
    let probe = Probe::open("click-paste", 0);
    let mut engine = Engine::start_with(&["--paste-click-settle-ms", &ms(PASTE_SETTLE)]);
    let target = probe.target();
    let (answers, _) = record(&probe, || {
        engine.pipeline(&[
            ("click", json!({"window": target, "x": 20, "y": 20})),
            ("type_text", json!({"window": target, "text": "x"})),
        ]);
        engine.answers(2)
    });
    assert_eq!(answers[0].0["ok"], json!(true), "{}", answers[0].0);
    assert_eq!(
        answers[1].0["ok"],
        json!(false),
        "no field to paste into: {}",
        answers[1].0
    );
    let waited = answers[1].1 - answers[0].1;
    assert!(
        waited >= PASTE_SETTLE - SLACK,
        "the paste answered {waited:?} after the click: it did not wait out the settle"
    );
    assert!(waited < PASTE_SETTLE + PROMPT * 2, "{waited:?}");
}

/// The click settle follows the paste's own window's clicks: a click to another window, or one whose settle has passed,
/// holds the paste back for nothing.
#[test]
fn a_paste_waits_for_nothing_after_a_click_to_another_window_or_once_its_click_settle_has_passed() {
    let ab = Probe::open_all(&[("a", 0), ("b", 400)]);
    let mut engine = Engine::start_with(&["--paste-click-settle-ms", &ms(PASTE_SETTLE)]);
    let (ta, tb) = (ab.target_of(0), ab.target_of(1));
    let paste_after = |engine: &mut Engine, click_to: &Value, pause: Duration| {
        engine
            .request("click", json!({"window": click_to, "x": 20, "y": 20}))
            .unwrap();
        sleep(pause);
        let started = Instant::now();
        let answer = engine.request("type_text", json!({"window": ta, "text": "x"}));
        assert!(answer.is_err(), "no field to paste into: {answer:?}");
        started.elapsed()
    };
    let other = paste_after(&mut engine, &tb, Duration::ZERO);
    assert!(other < PROMPT, "after a click to the other window: {other:?}");
    let settled = paste_after(&mut engine, &ta, PASTE_SETTLE);
    assert!(settled < PROMPT, "after its own window's click settle: {settled:?}");
    let recent = paste_after(&mut engine, &ta, Duration::ZERO);
    assert!(
        recent >= PASTE_SETTLE - SLACK,
        "the control, a click just before: {recent:?}"
    );
}

/// The settle follows the paste's own window's keys, and only while they are recent: a paste after keys to another
/// window, or after its own window's settle has passed, waits for nothing.
#[test]
fn a_paste_waits_for_nothing_after_keys_to_another_window_or_once_its_settle_has_passed() {
    let ab = Probe::open_all(&[("a", 0), ("b", 400)]);
    let mut engine = Engine::start_with(&["--paste-settle-ms", &ms(PASTE_SETTLE)]);
    let (ta, tb) = (ab.target_of(0), ab.target_of(1));
    let paste_after = |engine: &mut Engine, key_to: &Value, pause: Duration| {
        engine
            .request("press_key", json!({"window": key_to, "key": "a"}))
            .unwrap();
        sleep(pause);
        let started = Instant::now();
        let answer = engine.request("type_text", json!({"window": ta, "text": "x"}));
        assert!(answer.is_err(), "no field to paste into: {answer:?}");
        started.elapsed()
    };
    let other = paste_after(&mut engine, &tb, Duration::ZERO);
    assert!(other < PROMPT, "after a key to the other window: {other:?}");
    let settled = paste_after(&mut engine, &ta, PASTE_SETTLE);
    assert!(settled < PROMPT, "after its own window's settle: {settled:?}");
    let recent = paste_after(&mut engine, &ta, Duration::ZERO);
    assert!(
        recent >= PASTE_SETTLE - SLACK,
        "the control, a key just before: {recent:?}"
    );
}

#[test]
fn a_held_key_keeps_its_session_open_and_its_release_ends_it_at_once() {
    let probe = Probe::open("hold", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    let (held, mut seen) = record(&probe, || {
        let held = engine.request("key_down", json!({"window": target, "key": "shift"}));
        sleep(PROMPT * 4);
        held
    });
    held.unwrap();
    assert_eq!(
        kinds(&seen),
        [Kind::FocusIn, Kind::KeyPress],
        "no FocusOut while it is held"
    );
    let (released, after) = record(&probe, || {
        engine.request("key_up", json!({"window": target, "key": "shift"}))
    });
    released.unwrap();
    seen.extend(after);
    assert_eq!(
        kinds(&seen),
        [Kind::FocusIn, Kind::KeyPress, Kind::KeyRelease, Kind::FocusOut]
    );
    assert!(after_last_key(&seen, 3) < PROMPT, "{:?}", after_last_key(&seen, 3));
}

/// `--teardown-ms`, a measurement setting (0.3.0's wait before each `FocusOut`, the vendor's 100 ms there): each
/// request waits it out on the request path, so its `FocusOut` still comes before its answer.
#[test]
fn a_teardown_set_for_measurement_is_waited_out_before_each_focus_out_and_its_answer() {
    let teardown = Duration::from_millis(80);
    let probe = Probe::open("teardown", 0);
    let mut engine = Engine::start_with(&["--teardown-ms", &ms(teardown)]);
    let target = probe.target();
    let (answers, seen) = record(&probe, || {
        engine.pipeline(&keys(&target, 3));
        engine.answers(3)
    });
    all_ok(&answers);
    assert_eq!(kinds(&seen), per_request(1, 3));
    for (i, _) in seen.iter().enumerate().filter(|(_, s)| s.kind == Kind::FocusOut) {
        let waited = after_last_key(&seen, i);
        assert!(waited >= teardown - SLACK, "{waited:?}");
    }
    for (out, (_, answered)) in focus_outs(&seen).iter().zip(&answers) {
        assert!(*out <= *answered + SLACK, "a FocusOut after its answer");
    }
    assert!(answers[2].1 - answers[1].1 >= teardown - SLACK);
}

/// What a stopped engine left: what the probe received, the exit (with when it was seen) and when it was stopped.
type Stopped = (Vec<Seen>, Option<(std::process::ExitStatus, Instant)>, Instant);

/// A burst, then `stop` straight after its last answer, inside the exit's settle.
fn stopped_after_a_burst(stop: impl FnOnce(&mut Engine)) -> Stopped {
    let probe = Probe::open("stop", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    let ((answers, stopped, exited), seen) = record(&probe, || {
        engine.pipeline(&keys(&target, 10));
        let answers = engine.answers(10);
        stop(&mut engine);
        let stopped = Instant::now();
        (answers, stopped, engine.exit_within(Duration::from_secs(5)))
    });
    all_ok(&answers);
    assert!(stopped - answers[9].1 < EXIT_SETTLE / 4, "stopped inside the settle");
    (seen, exited, stopped)
}

#[test]
fn sigterm_straight_after_a_burst_waits_the_settle_after_its_last_key_then_exits() {
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| engine.signal(Signal::TERM));
    let (status, at) = exited.expect("the engine exits");
    use std::os::unix::process::ExitStatusExt;
    assert_eq!(
        (status.code(), status.signal()),
        (Some(143), None),
        "an orderly exit: 128 + SIGTERM"
    );
    assert_eq!(
        kinds(&seen),
        per_request(1, 10),
        "every key, in order, each with its FocusOut"
    );
    let last_key = seen[seen.len() - 2].at;
    // the probe reads the last key at most a poll after it arrived, so the exit is bounded from the stop as well
    assert!(
        at - last_key >= EXIT_SETTLE - SLACK * 2,
        "the redirect stays until the settle has passed: {:?}",
        at - last_key
    );
    assert!(
        at - stopped < EXIT_SETTLE + PROMPT,
        "the settle alone: {:?}",
        at - stopped
    );
}

#[test]
fn clicks_alone_hold_the_exit_back_for_the_settle_too() {
    // with no FocusOut left to drain, the exit's unredirect cut clicks on Chrome and Electron straight after their
    // answers (task 60: 7 of 10 each, idle); task 56 had seen none cut only because its drain waited out 100 ms first
    let probe = Probe::open("clicks", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    for _ in 0..3 {
        engine
            .request("click", json!({"window": target, "x": 20, "y": 20}))
            .unwrap();
    }
    let stopped = Instant::now();
    engine.signal(Signal::TERM);
    let (status, at) = engine.exit_within(Duration::from_secs(5)).expect("the engine exits");
    assert_eq!(status.code(), Some(143));
    assert!(
        at - stopped >= EXIT_SETTLE - PROMPT,
        "the settle after the last click: {:?}",
        at - stopped
    );
    assert!(at - stopped < EXIT_SETTLE + PROMPT, "{:?}", at - stopped);
}

#[test]
fn input_older_than_the_settle_holds_the_exit_back_for_nothing() {
    let probe = Probe::open("settled", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    engine
        .request("press_key", json!({"window": target, "key": "a"}))
        .unwrap();
    sleep(EXIT_SETTLE + PROMPT);
    let stopped = Instant::now();
    engine.signal(Signal::TERM);
    let (status, at) = engine.exit_within(Duration::from_secs(5)).expect("the engine exits");
    assert_eq!(status.code(), Some(143));
    assert!(at - stopped < PROMPT, "at once: {:?}", at - stopped);
}

#[test]
fn an_answer_stuck_in_a_full_pipe_does_not_hold_the_exit_back() {
    // the REPL host freezes the trusted worker, the engine's reader, before it tells the engine to stop
    // (src/repl-host/kernel-child.mjs stopProcessTree): answers it can no longer read fill the pipe, and the exit must
    // still come from the settle, not from the backstop that ends a wedged exit 1 s after the signal
    let probe = Probe::open("stuck", 0);
    let mut engine = Engine::start_unread();
    let target = probe.target();
    let mut requests = keys(&target, 10);
    // each answer about 300 bytes, together far beyond what a pipe holds
    requests.extend(std::iter::repeat_n(("capabilities", json!({})), 4000));
    let ((stopped, exited), seen) = record(&probe, || {
        engine.pipeline(&requests);
        sleep(PROMPT);
        engine.signal(Signal::TERM);
        let stopped = Instant::now();
        (stopped, engine.exit_within(Duration::from_secs(5)))
    });
    let (status, at) = exited.expect("the engine exits");
    assert_eq!(status.code(), Some(143), "an orderly exit: 128 + SIGTERM");
    assert_eq!(kinds(&seen), per_request(1, 10), "every key, each with its FocusOut");
    assert!(
        at - stopped < EXIT_SETTLE + Duration::from_millis(400),
        "ended by its settle, not by the backstop: {:?}",
        at - stopped
    );
}

#[test]
fn stdin_closing_straight_after_a_burst_exits_in_order_too() {
    let (seen, exited, _) = stopped_after_a_burst(Engine::close_stdin);
    assert_eq!(exited.expect("the engine exits").0.code(), Some(0));
    assert_eq!(kinds(&seen), per_request(1, 10));
}

#[test]
fn a_second_sigterm_carries_the_settle_on() {
    // the REPL host's SIGTERM may follow the owned group's (the design session's ruling, M4 T7b)
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| {
        engine.signal(Signal::TERM);
        sleep(Duration::from_millis(5));
        engine.signal(Signal::TERM);
    });
    let (status, at) = exited.expect("the engine exits");
    assert_eq!(status.code(), Some(143));
    assert_eq!(kinds(&seen), per_request(1, 10));
    assert!(
        at - stopped >= EXIT_SETTLE * 2 / 3,
        "the settle ran on: {:?}",
        at - stopped
    );
}

#[test]
fn a_second_sigint_ends_the_settle_at_once() {
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| {
        engine.signal(Signal::INT);
        sleep(Duration::from_millis(5));
        engine.signal(Signal::INT);
    });
    let (status, at) = exited.expect("the engine exits");
    assert_eq!(status.code(), Some(130));
    assert!(at - stopped < PROMPT, "at once: {:?}", at - stopped);
    assert_eq!(
        kinds(&seen),
        per_request(1, 10),
        "each request's FocusOut had gone with it"
    );
}

/// Inside a hold, where a session spans requests: SIGTERM releases the key and ends the session with its `FocusOut`;
/// SIGKILL, the documented limit, cuts both, the control that shows the first check can fail.
#[test]
fn inside_a_hold_sigterm_ends_the_session_and_sigkill_cuts_it() {
    for (signal, expected) in [
        (
            Signal::TERM,
            vec![Kind::FocusIn, Kind::KeyPress, Kind::KeyRelease, Kind::FocusOut],
        ),
        (Signal::KILL, vec![Kind::FocusIn, Kind::KeyPress]),
    ] {
        let probe = Probe::open("held-stop", 0);
        let mut engine = Engine::start();
        let target = probe.target();
        let (exited, seen) = record(&probe, || {
            engine
                .request("key_down", json!({"window": target, "key": "shift"}))
                .unwrap();
            engine.signal(signal);
            engine.exit_within(Duration::from_secs(5))
        });
        assert!(exited.is_some(), "{signal:?}: the engine exits");
        assert_eq!(kinds(&seen), expected, "{signal:?}");
    }
}

fn keycode_of(conn: &RustConnection, keysym: u32) -> u8 {
    let setup = conn.setup();
    let (min, max) = (setup.min_keycode, setup.max_keycode);
    let map = conn.get_keyboard_mapping(min, max - min + 1).unwrap().reply().unwrap();
    let at = map
        .keysyms
        .iter()
        .position(|&k| k == keysym)
        .expect("the keysym is mapped");
    min + (at / usize::from(map.keysyms_per_keycode)) as u8
}

/// Whether the X server holds the key with `keysym` down, and whether it holds any pointer button down.
fn held_at_the_server(conn: &RustConnection, keysym: u32) -> (bool, bool) {
    let keycode = keycode_of(conn, keysym);
    let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
    let root = conn.setup().roots[0].root;
    let mask = u16::from(conn.query_pointer(root).unwrap().reply().unwrap().mask);
    (
        keys[usize::from(keycode / 8)] & (1 << (keycode % 8)) != 0,
        mask & 0x1f00 != 0,
    )
}

const SHIFT_L: u32 = 0xffe1;

/// A `drag_handle` begun (its button 1 held at the server) and Shift held (`key_down` on the desktop route, XTEST),
/// then a desktop scroll that runs far longer than the backstop (655 wheel steps of 36 ms, each holding its button),
/// stopped by `stop` inside it: the exit that ends the engine before its request does still releases what it holds,
/// the key, the drag's button and the wheel's.
fn forced_inside_a_request(stop: impl FnOnce(&Engine)) -> (std::process::ExitStatus, Duration, (bool, bool)) {
    // the test's own connection, held through the test: xvfb-run's server resets its state once its last client leaves
    let (conn, _) = connect();
    let mut engine = Engine::start();
    engine
        .request("drag_handle", json!({"action": "start", "x": 200, "y": 200}))
        .unwrap();
    engine.request("key_down", json!({"key": "shift"})).unwrap();
    assert_eq!(
        held_at_the_server(&conn, SHIFT_L),
        (true, true),
        "Shift and the drag's button down at the server"
    );
    engine.pipeline(&[("scroll", json!({"direction": "down", "pixels": 65535}))]);
    sleep(Duration::from_millis(300));
    let stopped = Instant::now();
    stop(&engine);
    let (status, at) = engine.exit_within(Duration::from_secs(10)).expect("the engine exits");
    let held = held_at_the_server(&conn, SHIFT_L);
    // whatever an engine left down released here, so the tests after this one start clean
    use x11rb::protocol::xtest::ConnectionExt as _;
    let root = conn.setup().roots[0].root;
    let shift = keycode_of(&conn, SHIFT_L);
    let _ = conn.xtest_fake_input(x11rb::protocol::xproto::KEY_RELEASE_EVENT, shift, 0, root, 0, 0, 0);
    for button in [1, 4, 5] {
        let _ = conn.xtest_fake_input(x11rb::protocol::xproto::BUTTON_RELEASE_EVENT, button, 0, root, 0, 0, 0);
    }
    conn.get_input_focus().unwrap().reply().unwrap();
    (status, at - stopped, held)
}

#[test]
fn the_backstop_releases_what_the_engine_holds_before_it_ends_a_request_still_running() {
    let (status, took, (key, button)) = forced_inside_a_request(|engine| engine.signal(Signal::TERM));
    assert_eq!(status.code(), Some(143));
    // the backstop (1 s), then the release, bounded at 200 ms
    assert!(
        took >= Duration::from_millis(950) && took < Duration::from_millis(1200 + 150),
        "ended by the backstop: {took:?}"
    );
    assert!(!key, "Shift released at the server");
    assert!(!button, "the drag's and the wheel's buttons released");
}

#[test]
fn a_second_sigint_releases_what_the_engine_holds_before_it_ends_a_request_still_running() {
    let (status, took, (key, button)) = forced_inside_a_request(|engine| {
        engine.signal(Signal::INT);
        sleep(Duration::from_millis(5));
        engine.signal(Signal::INT);
    });
    assert_eq!(status.code(), Some(130));
    assert!(took < Duration::from_millis(500), "at once: {took:?}");
    assert!(!key, "Shift released at the server");
    assert!(!button, "the drag's and the wheel's buttons released");
}

#[test]
fn an_exit_ends_a_drag_handle_as_its_end_would_where_the_model_left_the_pointer() {
    // a drag_handle between its start and its end: the orderly exit's first act is its end, button 1 up, the drop at
    // the model's last point (the design session's ruling, M4 T7b)
    let (conn, _) = connect();
    let mut engine = Engine::start();
    engine
        .request("drag_handle", json!({"action": "start", "x": 200, "y": 200}))
        .unwrap();
    engine
        .request("drag_handle", json!({"action": "move_to", "x": 320, "y": 260}))
        .unwrap();
    let root = conn.setup().roots[0].root;
    let pointer = |conn: &RustConnection| conn.query_pointer(root).unwrap().reply().unwrap();
    assert_ne!(u16::from(pointer(&conn).mask) & 0x100, 0, "button 1 down at the server");
    let stopped = Instant::now();
    engine.signal(Signal::TERM);
    let (status, at) = engine.exit_within(Duration::from_secs(5)).expect("the engine exits");
    let after = pointer(&conn);
    // whatever an engine left down released here, so the tests after this one start clean
    use x11rb::protocol::xtest::ConnectionExt as _;
    let _ = conn.xtest_fake_input(x11rb::protocol::xproto::BUTTON_RELEASE_EVENT, 1, 0, root, 0, 0, 0);
    conn.get_input_focus().unwrap().reply().unwrap();
    assert_eq!(status.code(), Some(143));
    assert_eq!(u16::from(after.mask) & 0x1f00, 0, "every button up at the server");
    assert_eq!(
        (after.root_x, after.root_y),
        (320, 260),
        "released where the model left the pointer"
    );
    assert!(at - stopped < Duration::from_millis(500), "at once: {:?}", at - stopped);
}
