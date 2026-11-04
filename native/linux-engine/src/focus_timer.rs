//! The FocusOut timer (M4's T7; Surprises, M0.3; the design session's rulings, M4 pre-flight, "The timer and the
//! settle"). A background session's closing `FocusOut` follows its window's last input by the teardown delay (100 ms),
//! because Chromium cuts the last keys of a pipelined burst when `FocusOut` comes sooner (M0.4). The delay used to be
//! slept on the request path; here it is a timer, so a request answers as soon as its input is sent:
//!
//! - when a request's input to a window ends, the window's session waits on its timer, still open (its synthetic
//!   focus, redirect and time anchor kept), and its `FocusOut` is due the delay after that input;
//! - the next input to the same window takes the session back, which stops the timer, and starts it again when that
//!   input ends;
//! - a flush (input to another window, a paste's observation, an activation, the engine's exit) waits until each
//!   pending window's full delay since its last input has passed, then sends its `FocusOut`, then lets the request go
//!   on, so a flush never brings a `FocusOut` sooner than the delay; it always runs, like a release;
//! - input that reaches a window by another route while its timer is pending (the late-take watch's Escape, sent at
//!   once and never waiting for a flush) restarts that window's timer from when it went out.
//!
//! The timers are kept apart from the sessions they end (`S`) and from the clock (`Clock`), so the rules are testable
//! without an X server.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use serde_json::{Value, json};

/// Why a session's `FocusOut` went out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cause {
    /// Its timer came due between requests, or at the start or end of one.
    Timer,
    /// A flush before a request's input: to another window, a paste's observation, an activation.
    Flush,
    /// The engine's exit (SIGTERM, SIGINT or SIGHUP, stdin closing): drained, at most the delay.
    Exit,
}

impl Cause {
    pub fn name(self) -> &'static str {
        match self {
            Cause::Timer => "timer",
            Cause::Flush => "flush",
            Cause::Exit => "exit",
        }
    }
}

/// One `FocusOut` the timers sent: its window, why, how long after the window's last input it went out, and the request
/// whose input last started the window's timer (for the harness's audit of each deferred `FocusOut`).
#[derive(Debug, Clone, PartialEq)]
pub struct Sent {
    pub window: u32,
    pub cause: Cause,
    pub after_input: Duration,
    pub scheduled_by: Value,
}

impl Sent {
    /// The record on the `--stats` line.
    pub fn record(&self) -> Value {
        json!({
            "window": self.window,
            "cause": self.cause.name(),
            "after_input_ms": (self.after_input.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0,
            "scheduled_by": self.scheduled_by,
        })
    }
}

/// The exit's settle (the design session's ruling on T7's escalation, 2026-11-04): the engine's exit drops every
/// redirect it holds, since its X connection closes, and a covered Chromium window whose redirect goes while it still has
/// input queued cuts that input and delivers it only with its next `FocusIn` (task 56: 8 of 10 SIGTERMs straight after a
/// burst at twice the gate's load, with the 100 ms drain alone). So after the `FocusOut` drain the exit waits until this
/// long has passed since the last key input to a window whose redirect it still holds: the smallest value that held 30
/// consecutive independent SIGTERM runs at twice the load on Chrome and on Electron, in 50 ms steps (0: 24/30 and
/// 17/30; 200: 26/30 and 28/30; 250: 30/30 both in its step, then 29/30 on Chrome in a full sitting, one whole burst
/// cut; 300: 30/30 both, and in the full sitting; the evidence's exit-settle steps). The unredirect cut no click at any
/// step (10/10 each), so the settle follows keys only.
pub const EXIT_SETTLE: Duration = Duration::from_millis(300);

/// When the exit's settle ends: `settle` after the latest of `last_inputs` (the last input to each window whose redirect
/// the exit will drop), None when there is none.
pub fn exit_settle_until(last_inputs: impl IntoIterator<Item = Instant>, settle: Duration) -> Option<Instant> {
    last_inputs.into_iter().max().map(|at| at + settle)
}

/// Waits out the exit's settle, if any (at once when it has already passed).
pub fn settle_exit(clock: &mut impl Clock, until: Option<Instant>) {
    if let Some(at) = until {
        clock.sleep_until(at);
    }
}

/// The time the timers read and wait on: the real clock in the engine, a fake one in the tests.
pub trait Clock {
    fn now(&self) -> Instant;
    /// Returns once `at` has passed (at once if it already has).
    fn sleep_until(&mut self, at: Instant);
}

/// The real clock.
pub struct Wall;

impl Clock for Wall {
    fn now(&self) -> Instant {
        Instant::now()
    }

    fn sleep_until(&mut self, at: Instant) {
        let now = Instant::now();
        if at > now {
            std::thread::sleep(at - now);
        }
    }
}

struct Pending<S> {
    session: S,
    last_input: Instant,
    scheduled_by: Value,
}

/// Input another thread sends to one window by another route: the late-take watch's Escape, on the watch's own X
/// connection (`dnd.rs`). The send is recorded under the gate's lock in the same critical section as the send itself,
/// and the timers hold the same lock whenever they end a session, taking the record first, so no `FocusOut` can fall
/// between that input and its window's timer restart (a `FocusOut` straight after the Escape is what makes Chromium cut
/// it). The lock is held only around a send, never across a timer's wait, so the Escape is never held back by one.
#[derive(Clone)]
pub struct Gate {
    window: u32,
    sent: Arc<Mutex<Option<Instant>>>,
}

impl Gate {
    pub fn new(window: u32) -> Gate {
        Gate {
            window,
            sent: Arc::new(Mutex::new(None)),
        }
    }

    /// Sends input by the other route now (`send` says whether it went out).
    pub fn send(&self, send: impl FnOnce() -> bool) -> bool {
        self.send_at(Instant::now, send)
    }

    /// Sends input by the other route, `at` giving its instant: recorded before `send` runs, under the lock, and
    /// cleared if it did not go out.
    pub fn send_at(&self, at: impl FnOnce() -> Instant, send: impl FnOnce() -> bool) -> bool {
        let mut sent = self.sent.lock().unwrap_or_else(PoisonError::into_inner);
        let previous = sent.replace(at());
        let went = send();
        if !went {
            *sent = previous;
        }
        went
    }
}

/// The windows whose sessions wait on their `FocusOut` timer.
pub struct Timers<S> {
    delay: Duration,
    pending: HashMap<u32, Pending<S>>,
    /// The other route's input to one window, while a late-take watch can send it (`Gate`).
    gate: Option<Gate>,
}

impl<S> Timers<S> {
    pub fn new(delay: Duration) -> Timers<S> {
        Timers {
            delay,
            pending: HashMap::new(),
            gate: None,
        }
    }

    /// The other route a late-take watch may send by, while it watches; None once it is collected.
    pub fn set_gate(&mut self, gate: Option<Gate>) {
        self.gate = gate;
    }

    #[cfg(test)]
    pub fn is_pending(&self, window: u32) -> bool {
        self.pending.contains_key(&window)
    }

    /// A window's session put on its timer: its input ended at `last_input`, sent by the request `scheduled_by`.
    pub fn start(&mut self, window: u32, session: S, last_input: Instant, scheduled_by: Value) {
        self.pending.insert(
            window,
            Pending {
                session,
                last_input,
                scheduled_by,
            },
        );
    }

    /// The session of a window whose timer is pending, taken back for more input to it: the timer stops, and the
    /// caller starts it again once that input ends.
    pub fn resume(&mut self, window: u32) -> Option<S> {
        self.pending.remove(&window).map(|p| p.session)
    }

    /// Input sent to `window` by another route at `at` (the late-take Escape): a pending timer restarts from then. A
    /// timer already counting from later is left as it is, and a window with no timer pending has nothing to restart.
    pub fn restart(&mut self, window: u32, at: Instant) {
        if let Some(pending) = self.pending.get_mut(&window)
            && at > pending.last_input
        {
            pending.last_input = at;
        }
    }

    /// When the next `FocusOut` is due, if any is pending.
    pub fn next_due(&self) -> Option<Instant> {
        self.pending.values().map(|p| p.last_input + self.delay).min()
    }

    /// Every timer due by now ended (`end` sends the `FocusOut`), the earliest first, under the gate (`Gate`).
    pub fn fire_due(&mut self, clock: &impl Clock, end: impl FnMut(u32, S)) -> Vec<Sent> {
        let gate = self.gate.clone();
        let _held = self.hold(gate.as_ref());
        let now = clock.now();
        let due: Vec<u32> = self.in_due_order(|_, p| p.last_input + self.delay <= now);
        self.end_each(&due, Cause::Timer, |_| now, end)
    }

    /// The gate's lock, held while a session ends, its record of the other route's input applied first: that window's
    /// pending timer restarts from it.
    fn hold<'g>(&mut self, gate: Option<&'g Gate>) -> Option<std::sync::MutexGuard<'g, Option<Instant>>> {
        let gate = gate?;
        let mut sent = gate.sent.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(at) = sent.take() {
            self.restart(gate.window, at);
        }
        Some(sent)
    }

    /// The flush: every pending timer but `keep`'s waited out to its due time, then ended, in due order, so each
    /// `FocusOut` goes no sooner than the delay after its window's last input. Takes at most the delay.
    pub fn flush(
        &mut self,
        keep: Option<u32>,
        cause: Cause,
        clock: &mut impl Clock,
        end: impl FnMut(u32, S),
    ) -> Vec<Sent> {
        let delay = self.delay;
        let gate = self.gate.clone();
        let mut end = end;
        let mut sent = Vec::new();
        // the earliest due first; each waited out without the gate's lock, then ended under it, so an Escape the
        // other route sends meanwhile restarts its window's timer and that window is waited out again
        while let Some(&window) = self.in_due_order(|w, _| Some(w) != keep).first() {
            clock.sleep_until(self.pending[&window].last_input + delay);
            let _held = self.hold(gate.as_ref());
            let now = clock.now();
            if self.pending[&window].last_input + delay > now {
                continue;
            }
            sent.extend(self.end_each(&[window], cause, |_| now, &mut end));
        }
        sent
    }

    /// The pending windows that `pick` keeps, the earliest due first (by window to break ties, so the order is fixed).
    fn in_due_order(&self, pick: impl Fn(u32, &Pending<S>) -> bool) -> Vec<u32> {
        let mut windows: Vec<(Instant, u32)> = self
            .pending
            .iter()
            .filter(|(w, p)| pick(**w, p))
            .map(|(w, p)| (p.last_input, *w))
            .collect();
        windows.sort();
        windows.into_iter().map(|(_, w)| w).collect()
    }

    /// Ends each window's session in turn, `at` giving the time its `FocusOut` goes (after any wait).
    fn end_each(
        &mut self,
        windows: &[u32],
        cause: Cause,
        mut at: impl FnMut(u32) -> Instant,
        mut end: impl FnMut(u32, S),
    ) -> Vec<Sent> {
        let mut sent = Vec::with_capacity(windows.len());
        for &window in windows {
            let when = at(window);
            let Some(pending) = self.pending.remove(&window) else {
                continue;
            };
            end(window, pending.session);
            sent.push(Sent {
                window,
                cause,
                after_input: when.saturating_duration_since(pending.last_input),
                scheduled_by: pending.scheduled_by,
            });
        }
        sent
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DELAY: Duration = Duration::from_millis(100);
    const MS: Duration = Duration::from_millis(1);

    /// A clock that moves only when a test or a wait moves it, recording each wait.
    struct Fake {
        now: Instant,
        waits: Vec<Duration>,
    }

    impl Fake {
        fn new() -> Fake {
            Fake {
                now: Instant::now(),
                waits: Vec::new(),
            }
        }
        fn advance(&mut self, by: Duration) {
            self.now += by;
        }
    }

    impl Clock for Fake {
        fn now(&self) -> Instant {
            self.now
        }
        fn sleep_until(&mut self, at: Instant) {
            if at > self.now {
                self.waits.push(at - self.now);
                self.now = at;
            }
        }
    }

    /// Records the sessions ended, in order.
    fn ender<'a>(ended: &'a mut Vec<(u32, &'static str)>) -> impl FnMut(u32, &'static str) + 'a {
        move |window, session| ended.push((window, session))
    }

    #[test]
    fn a_window_s_focus_out_is_due_the_delay_after_its_last_input_and_only_then_fires() {
        let mut clock = Fake::new();
        let mut timers = Timers::new(DELAY);
        timers.start(7, "a", clock.now(), json!(1));
        assert_eq!(timers.next_due(), Some(clock.now() + DELAY));
        clock.advance(99 * MS);
        let mut ended = Vec::new();
        assert!(timers.fire_due(&clock, ender(&mut ended)).is_empty(), "not yet due");
        assert!(ended.is_empty() && timers.is_pending(7));
        clock.advance(MS);
        let sent = timers.fire_due(&clock, ender(&mut ended));
        assert_eq!(ended, vec![(7, "a")]);
        assert_eq!(
            sent,
            vec![Sent {
                window: 7,
                cause: Cause::Timer,
                after_input: DELAY,
                scheduled_by: json!(1)
            }]
        );
        assert_eq!(timers.next_due(), None);
    }

    #[test]
    fn more_input_to_the_same_window_takes_its_session_back_and_restarts_the_timer() {
        let mut clock = Fake::new();
        let mut timers = Timers::new(DELAY);
        timers.start(7, "a", clock.now(), json!(1));
        clock.advance(60 * MS);
        // the next request to window 7: the same session, no FocusOut between
        assert_eq!(timers.resume(7), Some("a"));
        assert_eq!(timers.next_due(), None, "stopped while the input runs");
        clock.advance(5 * MS);
        timers.start(7, "a", clock.now(), json!(2));
        clock.advance(60 * MS);
        let mut ended = Vec::new();
        assert!(
            timers.fire_due(&clock, ender(&mut ended)).is_empty(),
            "125 ms after the first input but 60 after the last: not due"
        );
        clock.advance(40 * MS);
        let sent = timers.fire_due(&clock, ender(&mut ended));
        assert_eq!(
            (sent[0].after_input, &sent[0].scheduled_by),
            (DELAY, &json!(2)),
            "the request whose input restarted it"
        );
        assert_eq!(timers.resume(7), None);
    }

    #[test]
    fn a_flush_waits_out_the_rest_of_each_interval_then_ends_them_in_due_order_and_keeps_the_window_named() {
        let mut clock = Fake::new();
        let mut timers = Timers::new(DELAY);
        timers.start(9, "b", clock.now(), json!(1));
        clock.advance(30 * MS);
        timers.start(7, "a", clock.now(), json!(2));
        clock.advance(10 * MS);
        timers.start(5, "kept", clock.now(), json!(3));
        clock.advance(20 * MS);
        let mut ended = Vec::new();
        let sent = timers.flush(Some(5), Cause::Flush, &mut clock, ender(&mut ended));
        assert_eq!(ended, vec![(9, "b"), (7, "a")], "the earliest due first");
        assert_eq!(
            clock.waits,
            vec![40 * MS, 30 * MS],
            "until 9's full delay (60 ms had passed), then 7's"
        );
        assert!(
            sent.iter().all(|s| s.after_input == DELAY && s.cause == Cause::Flush),
            "no FocusOut sooner than the delay: {sent:?}"
        );
        assert!(timers.is_pending(5), "the window the input goes to keeps its session");
        assert!(!timers.is_pending(7) && !timers.is_pending(9));
    }

    #[test]
    fn a_flush_past_a_window_s_due_time_waits_for_nothing() {
        let mut clock = Fake::new();
        let mut timers = Timers::new(DELAY);
        timers.start(7, "a", clock.now(), json!(1));
        clock.advance(130 * MS);
        let mut ended = Vec::new();
        let sent = timers.flush(None, Cause::Flush, &mut clock, ender(&mut ended));
        assert!(clock.waits.is_empty());
        assert_eq!(ended, vec![(7, "a")]);
        assert_eq!(sent[0].after_input, 130 * MS);
    }

    #[test]
    fn the_exit_drains_every_timer_at_most_the_delay() {
        let mut clock = Fake::new();
        let started = clock.now();
        let mut timers = Timers::new(DELAY);
        for (i, window) in [3u32, 4, 5].into_iter().enumerate() {
            timers.start(window, "s", clock.now(), json!(i));
            clock.advance(10 * MS);
        }
        let mut ended = Vec::new();
        let sent = timers.flush(None, Cause::Exit, &mut clock, ender(&mut ended));
        assert_eq!(ended.iter().map(|e| e.0).collect::<Vec<_>>(), vec![3, 4, 5]);
        assert!(sent.iter().all(|s| s.cause == Cause::Exit && s.after_input == DELAY));
        assert_eq!(
            clock.now() - started,
            120 * MS,
            "the last input 20 ms before the exit: 80 ms more"
        );
        assert!(clock.now() - (started + 20 * MS) <= DELAY);
    }

    #[test]
    fn input_by_another_route_restarts_a_pending_timer_from_when_it_went_out() {
        let mut clock = Fake::new();
        let mut timers = Timers::new(DELAY);
        let input = clock.now();
        timers.start(7, "a", input, json!(1));
        timers.start(8, "b", input, json!(2));
        clock.advance(50 * MS);
        // the late-take Escape to window 7, sent at once by its watch
        timers.restart(7, clock.now());
        timers.restart(7, input + 10 * MS);
        // a window with no timer has nothing to restart
        timers.restart(99, clock.now());
        assert!(!timers.is_pending(99));
        clock.advance(50 * MS);
        let mut ended = Vec::new();
        timers.fire_due(&clock, ender(&mut ended));
        assert_eq!(
            ended,
            vec![(8, "b")],
            "the other window's timer fires on its schedule; 7's restarted"
        );
        assert_eq!(timers.next_due(), Some(input + 50 * MS + DELAY));
    }

    #[test]
    fn a_zero_delay_is_due_at_once() {
        let clock = Fake::new();
        let mut timers = Timers::new(Duration::ZERO);
        timers.start(7, "a", clock.now(), json!(1));
        let mut ended = Vec::new();
        timers.fire_due(&clock, ender(&mut ended));
        assert_eq!(ended, vec![(7, "a")]);
    }

    #[test]
    fn the_record_names_the_cause_the_wait_and_the_request() {
        let sent = Sent {
            window: 0x1200007,
            cause: Cause::Flush,
            after_input: Duration::from_micros(100_250),
            scheduled_by: json!(12),
        };
        assert_eq!(
            sent.record(),
            json!({"window": 0x1200007, "cause": "flush", "after_input_ms": 100.25, "scheduled_by": 12})
        );
    }

    #[test]
    fn the_exit_settles_from_the_last_input_to_a_window_it_still_holds_redirected() {
        let mut clock = Fake::new();
        let start = clock.now();
        let settle = Duration::from_millis(300);
        // the latest input decides; the earlier window's settle has long passed
        let until = exit_settle_until([start, start + 50 * MS], settle).expect("input to a redirected window");
        assert_eq!(until, start + 50 * MS + settle);
        clock.advance(120 * MS);
        settle_exit(&mut clock, Some(until));
        assert_eq!(clock.waits, vec![230 * MS], "only the rest of the settle is waited");
        // no input to a window it holds redirected: the exit waits for nothing
        assert_eq!(exit_settle_until(std::iter::empty(), settle), None);
        let mut idle = Fake::new();
        settle_exit(&mut idle, None);
        assert!(idle.waits.is_empty());
        // a settle long past waits for nothing either
        let mut late = Fake::new();
        let at = late.now();
        late.advance(settle * 2);
        settle_exit(&mut late, exit_settle_until([at], settle));
        assert!(late.waits.is_empty());
    }

    #[test]
    fn no_focus_out_falls_between_the_other_route_s_input_and_its_timer_s_restart() {
        // the watch's Escape goes out 1 ms before the window's FocusOut is due, and the timer fires 1 ms after it was
        // due, before the engine has collected the watch: the Escape restarted the timer, so nothing is due yet
        let mut clock = Fake::new();
        let mut timers: Timers<&str> = Timers::new(DELAY);
        let gate = Gate::new(1);
        timers.set_gate(Some(gate.clone()));
        timers.start(1, "w1", clock.now(), json!(1));
        timers.start(2, "w2", clock.now(), json!(2));
        clock.advance(DELAY - MS);
        let escaped = clock.now();
        assert!(gate.send_at(|| escaped, || true));
        clock.advance(2 * MS);
        let mut ended = Vec::new();
        let sent = timers.fire_due(&clock, |w, s| ended.push((w, s)));
        assert_eq!(ended, vec![(2, "w2")], "the other window's timer keeps its schedule");
        assert!(
            timers.is_pending(1),
            "the Escape's window waits the full delay from the Escape"
        );
        assert_eq!(sent.len(), 1);
        // a flush waits it out from the Escape, not from the keys
        let flushed = timers.flush(None, Cause::Flush, &mut clock, |_, _| {});
        assert_eq!(flushed[0].after_input, DELAY);
        assert_eq!(clock.now(), escaped + DELAY);
        // an Escape that did not go out restarts nothing
        let mut timers: Timers<&str> = Timers::new(DELAY);
        let gate = Gate::new(1);
        timers.set_gate(Some(gate.clone()));
        let start = clock.now();
        timers.start(1, "w1", start, json!(1));
        clock.advance(DELAY - MS);
        assert!(!gate.send_at(|| start + DELAY - MS, || false));
        clock.advance(2 * MS);
        let mut ended = Vec::new();
        timers.fire_due(&clock, |w, _| ended.push(w));
        assert_eq!(ended, vec![1]);
    }
}
