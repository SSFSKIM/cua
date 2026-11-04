//! The `FocusOut` timer, live (M4's T7; `src/focus_timer.rs`): the engine binary over its wire, against bare windows of
//! the test's own that record every key and focus event they receive and when, on a display with no window manager (the
//! CI gate's Xvfb). The release workflow runs these on the shipped asset (`CUA_ENGINE_BIN`), so the exit drain after
//! SIGTERM is proven on the bytes that ship.
//!
//!   xvfb-run -a dbus-run-session -- cargo test --features live -- --test-threads 1

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

/// The engine's delay from a window's last input to its `FocusOut` (`--teardown-ms`'s default).
const DELAY: Duration = Duration::from_millis(100);
/// The exit's settle after the last input to a window whose redirect it drops (`--exit-settle-ms`'s default).
const EXIT_SETTLE: Duration = Duration::from_millis(400);
/// The slack a `FocusOut` measured at the probe may show below the delay: the last key's own trip to the probe.
const SLACK: Duration = Duration::from_millis(10);
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

impl Probe {
    fn open(name: &str, x: i16) -> Probe {
        Probe::open_all(&[(name, x)])
    }

    fn open_all(windows: &[(&str, i16)]) -> Probe {
        let (conn, screen) = x11rb::connect(None).expect("an X connection");
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
            let wm_class = format!("probe\0cua-focus-timer-{name}\0");
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
        let result = act();
        sleep(QUIET);
        done.store(true, std::sync::atomic::Ordering::SeqCst);
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
fn a_burst_answers_before_its_one_focus_out_which_follows_its_last_key_by_the_delay() {
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
        burst(10),
        "one FocusIn and one FocusOut around the whole burst"
    );
    let focus_out = seen.len() - 1;
    let waited = after_last_key(&seen, focus_out);
    assert!(waited >= DELAY - SLACK && waited < DELAY * 3, "{waited:?}");
    assert!(
        answers[9].1 < seen[focus_out].at,
        "the last answer came before the FocusOut"
    );
}

#[test]
fn input_to_another_window_waits_out_the_first_window_s_delay_then_its_focus_out_goes_first() {
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
    let mut twice = burst(3);
    twice.extend(burst(3));
    assert_eq!(at(ab.ids[0]), twice, "a, then a again: two sessions");
    assert_eq!(at(ab.ids[1]), burst(3));
    // never two windows under a synthetic focus at once, and each FocusOut the delay after its window's last key
    let mut open: Option<Window> = None;
    for (i, s) in seen.iter().enumerate() {
        match s.kind {
            Kind::FocusIn => {
                assert_eq!(open, None, "a FocusIn while another window held the focus: {seen:?}");
                open = Some(s.window);
            }
            Kind::FocusOut => {
                assert_eq!(open, Some(s.window));
                open = None;
                let waited = after_last_key(&seen, i);
                assert!(waited >= DELAY - SLACK, "flushed before the delay: {waited:?}");
            }
            _ => assert_eq!(open, Some(s.window), "a key outside its window's session"),
        }
    }
}

#[test]
fn a_paste_waits_out_its_own_window_s_delay_and_ends_its_session_before_it_observes() {
    let probe = Probe::open("paste", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    let (answers, seen) = record(&probe, || {
        engine.pipeline(&[
            ("press_key", json!({"window": target, "key": "a"})),
            ("type_text", json!({"window": target, "text": "x"})),
        ]);
        engine.answers(2)
    });
    assert_eq!(answers[0].0["ok"], json!(true));
    let focus_out = seen
        .iter()
        .position(|s| s.kind == Kind::FocusOut)
        .expect("the key's FocusOut");
    assert_eq!(kinds(&seen[..=focus_out]), burst(1));
    assert!(after_last_key(&seen, focus_out) >= DELAY - SLACK);
    // the bare window has no accessible field, so the paste itself fails; its flush came first: the paste's answer waited
    // out the key's delay (the probe's own read times lag arrival by up to a poll, so they cannot order it against an
    // answer read on another thread)
    let waited = answers[1].1 - answers[0].1;
    assert!(
        waited >= DELAY - SLACK,
        "the paste answered {waited:?} after the key: it did not wait for the key's FocusOut"
    );
}

#[test]
fn a_held_key_keeps_its_session_open_and_its_release_starts_the_timer() {
    let probe = Probe::open("hold", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    let (held, mut seen) = record(&probe, || {
        let held = engine.request("key_down", json!({"window": target, "key": "shift"}));
        sleep(DELAY * 2);
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
    assert!(after_last_key(&seen, 3) >= DELAY - SLACK);
}

#[test]
fn with_no_delay_each_request_s_focus_out_follows_its_own_keys() {
    let probe = Probe::open("no-delay", 0);
    let mut engine = Engine::start_with(&["--teardown-ms", "0"]);
    let target = probe.target();
    let (answers, seen) = record(&probe, || {
        engine.pipeline(&keys(&target, 3));
        engine.answers(3)
    });
    all_ok(&answers);
    assert_eq!(kinds(&seen), [burst(1), burst(1), burst(1)].concat());
}

/// What a stopped engine left: what the probe received, the exit (with when it was seen) and when it was stopped.
type Stopped = (Vec<Seen>, Option<(std::process::ExitStatus, Instant)>, Instant);

/// A burst, then `stop` straight after its last answer, inside the delay.
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
    assert!(stopped - answers[9].1 < DELAY / 2, "stopped inside the delay");
    (seen, exited, stopped)
}

#[test]
fn sigterm_inside_the_delay_drains_the_focus_out_then_exits() {
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| engine.signal(Signal::TERM));
    let (status, at) = exited.expect("the engine exits");
    use std::os::unix::process::ExitStatusExt;
    assert_eq!(
        (status.code(), status.signal()),
        (Some(143), None),
        "an orderly exit: 128 + SIGTERM"
    );
    assert_eq!(kinds(&seen), burst(10), "every key, in order, then the FocusOut");
    let focus_out = seen.len() - 1;
    assert!(after_last_key(&seen, focus_out) >= DELAY - SLACK);
    // the engine's exit waits for the server to handle its FocusOut; the probe's read time lags arrival by up to a poll
    assert!(seen[focus_out].at <= at + SLACK, "the FocusOut before the exit");
    assert!(
        at - stopped < EXIT_SETTLE + DELAY,
        "the drain is bounded by the exit's settle: {:?}",
        at - stopped
    );
}

#[test]
fn the_exit_waits_the_settle_after_the_last_input_to_a_window_it_holds_redirected() {
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| engine.signal(Signal::TERM));
    let (_, at) = exited.expect("the engine exits");
    let last_key = seen[seen.len() - 2].at;
    // the probe reads the last key at most a poll after it arrived, so the exit is measured from the stop as well
    assert!(
        at - last_key >= EXIT_SETTLE - SLACK * 2,
        "the redirect stays until the settle has passed: {:?}",
        at - last_key
    );
    assert!(at - stopped >= EXIT_SETTLE - DELAY / 2, "{:?}", at - stopped);
}

#[test]
fn input_older_than_the_settle_holds_the_exit_back_for_nothing() {
    let probe = Probe::open("settled", 0);
    let mut engine = Engine::start();
    let target = probe.target();
    engine
        .request("press_key", json!({"window": target, "key": "a"}))
        .unwrap();
    sleep(EXIT_SETTLE + DELAY);
    let stopped = Instant::now();
    engine.signal(Signal::TERM);
    let (status, at) = engine.exit_within(Duration::from_secs(5)).expect("the engine exits");
    assert_eq!(status.code(), Some(143));
    assert!(at - stopped < DELAY, "at once: {:?}", at - stopped);
}

#[test]
fn stdin_closing_inside_the_delay_drains_the_focus_out_too() {
    let (seen, exited, _) = stopped_after_a_burst(Engine::close_stdin);
    assert_eq!(exited.expect("the engine exits").0.code(), Some(0));
    assert_eq!(kinds(&seen), burst(10));
    assert!(after_last_key(&seen, seen.len() - 1) >= DELAY - SLACK);
}

#[test]
fn a_second_signal_ends_the_drain_at_once() {
    let (seen, exited, stopped) = stopped_after_a_burst(|engine| {
        engine.signal(Signal::TERM);
        sleep(Duration::from_millis(5));
        engine.signal(Signal::TERM);
    });
    let (status, at) = exited.expect("the engine exits");
    assert_eq!(status.code(), Some(143));
    assert!(at - stopped < DELAY / 2, "at once: {:?}", at - stopped);
    assert_eq!(kinds(&seen), &burst(10)[..21], "cut before the FocusOut");
}

#[test]
fn sigkill_cuts_the_drain_and_no_focus_out_follows() {
    // the documented limit, and the control that shows the FocusOut checks above can fail
    let (seen, exited, _) = stopped_after_a_burst(|engine| engine.signal(Signal::KILL));
    use std::os::unix::process::ExitStatusExt;
    assert_eq!(exited.expect("the engine exits").0.signal(), Some(9));
    assert_eq!(kinds(&seen), &burst(10)[..21]);
}
