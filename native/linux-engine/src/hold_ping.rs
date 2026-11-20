//! The ping predictor (the design session's ruling 888.2; measurement only, it changes no answer). While a Chromium
//! source's hold for its take runs with no take (`dnd::TAKE_HOLD_AFTER_PRESS`), the engine asks the source's window a
//! `_NET_WM_PING`, as the Electron settle does (`drop_settle.rs`, `drop_cursor.rs`), and records how long each took to
//! come back, per drag, in `--stats` (`hold.pings`). Chromium answers on its browser's UI thread, in the order of its
//! events, so a slow answer says the browser was behind; the design session decides from these whether a slow ping
//! marks the drags whose late drag and drop the hold cannot catch.
//!
//! The sampler is best effort and never holds the drag up: it runs on a thread of its own, on an X connection of its
//! own (the answers come to the root, read with its `SubstructureNotify`), and everything it does on X (the connect, the
//! atoms, the window's `WM_PROTOCOLS`, the subscription, each ping and each read) happens there. The hold only starts it
//! and, when it ends, takes what it has recorded so far ([`HoldPing::finish`]): no X request, no wait on the thread. A
//! sampler slow to set up is still setting up when the hold ends, and records nothing (the task 115 review: a setup on
//! the drag's thread could push its first look for the take past B).
//!
//! The pings are bounded by the hold: one at a time, the next one [`PING_EVERY`] after the last went out once that one
//! was answered, and none, the first included, in the hold's last [`PING_EVERY`] (it could not come back inside the
//! hold), so none goes out after the hold's end, however late the setup finished. A hold with less than that left when
//! it starts starts no sampler. A ping is admitted, recorded as in flight, and then checked again at its submission:
//! a hold that ended meanwhile (a take) or a deadline the worker crossed sends nothing (the re-review of fdaff715, P2).
//! A ping still unanswered when the hold ends is recorded with how long it had waited; one whose submission was under
//! way then, or failed, is recorded as such, never as unanswered. At most [`MAX_SETTING_UP`] samplers set up at once
//! in an engine: a connect that never returns leaves its thread behind, and no more than that many.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

use crate::adaptive_hold::{Ping, Reading};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, Window,
};
use x11rb::rust_connection::RustConnection;

/// How long after one ping went out the next goes, once the first was answered: a ping every 25 ms at most, a hold of
/// 450 ms some eighteen of them. No ping goes in a hold's last `PING_EVERY`.
pub const PING_EVERY: Duration = Duration::from_millis(25);

/// How often the sampler reads its answers: the round trips' resolution.
const READ_EVERY: Duration = Duration::from_millis(1);

/// How long past its hold's end a sampler nobody stopped ends by itself.
const OVERRUN: Duration = Duration::from_millis(100);

/// Why a hold's record asks nothing: no ping fitted in what was left of the hold when it started, or when the sampler
/// was ready.
const NO_TIME: &str = "no ping fitted in what was left of the hold";

/// Why a hold's record asks nothing: the sampler was still setting up when the hold ended.
const NOT_READY: &str = "the ping's connection was not ready by the hold's end";

/// How many samplers may be setting up at once in an engine (connecting, reading the window's protocols): a connect
/// that never returns keeps its slot, so a stuck X server costs this many threads, not one per hold.
const MAX_SETTING_UP: usize = 2;

/// The samplers setting up now, in this engine.
static SETTING_UP: AtomicUsize = AtomicUsize::new(0);

/// Why a hold's record asks nothing: [`MAX_SETTING_UP`] earlier samplers are still setting up.
const BUSY: &str = "earlier holds' ping connections were still being set up";

/// Why a hold's record asks nothing: the engine runs with the hold's pings off (`--drag-dnd-hold-ping off`, measurement
/// only: the design session's ruling 892, task 116's control that the sampler leaves the release where it was).
const DISABLED: &str = "disabled";

/// One ping: when it went out (or its submission began), how its submission went, and when its answer was read (None:
/// not yet).
#[derive(Debug, Clone, PartialEq, Eq)]
struct RoundTrip {
    sent: Instant,
    sending: Sending,
    answered: Option<Instant>,
}

/// A ping's submission.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Sending {
    /// Admitted and recorded, not yet sent: it may go out, or be dropped at its submission's check.
    InFlight,
    /// Sent and flushed.
    Sent,
    /// The send failed: nothing was asked.
    Failed(String),
}

/// Where the sampler is.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Phase {
    /// Connecting, reading the window's protocols, subscribing.
    Starting,
    /// Asking and reading.
    Ready,
    /// The setup failed, or the window lists no `_NET_WM_PING`: nothing was asked.
    Failed(String),
}

/// What the sampler has recorded, shared with the hold.
struct Sampled {
    phase: Phase,
    trips: Vec<RoundTrip>,
}

/// One hold's sampler. Dropped without [`HoldPing::finish`], it stops all the same.
pub struct HoldPing {
    /// The sampler's record; or, when no sampler runs, why: the hold had no time for a ping when it started, or the
    /// pings are off.
    sampled: std::result::Result<Arc<Mutex<Sampled>>, &'static str>,
    stop: Arc<AtomicBool>,
}

impl HoldPing {
    /// No sampler, the hold's pings being off (`--drag-dnd-hold-ping off`): its record says so.
    pub fn off() -> HoldPing {
        HoldPing {
            sampled: Err(DISABLED),
            stop: Arc::new(AtomicBool::new(true)),
        }
    }

    /// The sampler for a hold that ends with no take at `ends`, started on a thread of its own, which asks `window`;
    /// none when no ping fits in what is left of the hold. Returns at once.
    pub fn start(window: Window, ends: Instant) -> HoldPing {
        Self::start_with(window, ends, || {
            x11rb::connect(None).context("the hold's ping could not connect")
        })
    }

    /// [`HoldPing::start`] with the connection made by `connect`, on the sampler's thread.
    fn start_with(
        window: Window,
        ends: Instant,
        connect: impl FnOnce() -> Result<(RustConnection, usize)> + Send + 'static,
    ) -> HoldPing {
        Self::spawn(window, ends, connect, || {}, &SETTING_UP)
    }

    /// [`HoldPing::start_with`], `gap` run between each ping's admission and its submission (the tests' window into
    /// it), the setups counted in `setting_up`.
    fn spawn(
        window: Window,
        ends: Instant,
        connect: impl FnOnce() -> Result<(RustConnection, usize)> + Send + 'static,
        gap: impl FnMut() + Send + 'static,
        setting_up: &'static AtomicUsize,
    ) -> HoldPing {
        let stop = Arc::new(AtomicBool::new(false));
        if !admitted(None, Instant::now(), ends) {
            return HoldPing {
                sampled: Err(NO_TIME),
                stop,
            };
        }
        if setting_up.fetch_add(1, Ordering::SeqCst) >= MAX_SETTING_UP {
            setting_up.fetch_sub(1, Ordering::SeqCst);
            return HoldPing {
                sampled: Err(BUSY),
                stop,
            };
        }
        let sampled = Arc::new(Mutex::new(Sampled {
            phase: Phase::Starting,
            trips: Vec::new(),
        }));
        let (shared, stopped) = (sampled.clone(), stop.clone());
        let spawned = std::thread::Builder::new().name("hold-ping".into()).spawn(move || {
            let connect = move || {
                let connected = connect();
                setting_up.fetch_sub(1, Ordering::SeqCst);
                connected
            };
            sample(window, ends, connect, gap, &shared, &stopped)
        });
        if let Err(error) = spawned {
            setting_up.fetch_sub(1, Ordering::SeqCst);
            locked(&sampled).phase = Phase::Failed(format!("the ping's thread could not start: {error}"));
        }
        HoldPing {
            sampled: Ok(sampled),
            stop,
        }
    }

    /// The hold has ended (`ended`): the sampler told to stop, and `hold.pings` from what it recorded by now, counted
    /// from the drag's press. Takes a lock the sampler holds only to record; asks X nothing and waits for nothing.
    pub fn finish(self, pressed_at: Instant, ended: Instant) -> Value {
        self.stop.store(true, Ordering::SeqCst);
        let sampled = match &self.sampled {
            Ok(sampled) => locked(sampled),
            Err(why) => return not_asked(why),
        };
        match &sampled.phase {
            Phase::Starting => not_asked(NOT_READY),
            Phase::Failed(why) => not_asked(why),
            Phase::Ready if sampled.trips.is_empty() => not_asked(NO_TIME),
            Phase::Ready => record(&sampled.trips, pressed_at, ended),
        }
    }
}

impl HoldPing {
    /// What the pings begun by `by` say `now` (`adaptive_hold::read`), read under the lock the sampler holds only to
    /// record: no X request, no wait. A sampler that never ran, is still setting up, or could not ask reads slow, with
    /// why: only an answer counts as evidence.
    pub fn reading(&self, by: Instant, now: Instant) -> Reading {
        let sampled = match &self.sampled {
            Ok(sampled) => locked(sampled),
            Err(why) => return Reading::Slow((*why).into()),
        };
        match &sampled.phase {
            Phase::Starting => Reading::Slow(NOT_READY_YET.into()),
            Phase::Failed(why) => Reading::Slow(why.clone()),
            Phase::Ready => {
                let pings: Vec<(Instant, Ping)> = sampled
                    .trips
                    .iter()
                    .map(|trip| {
                        let ping = match trip.sending {
                            Sending::InFlight => Ping::Sending,
                            Sending::Failed(_) => Ping::Failed,
                            Sending::Sent => Ping::Sent {
                                sent: trip.sent,
                                answered: trip.answered,
                            },
                        };
                        (trip.sent, ping)
                    })
                    .collect();
                crate::adaptive_hold::read(&pings, by, now, NO_ANSWER)
            }
        }
    }
}

/// Why the pings read slow while the sampler is still setting up.
const NOT_READY_YET: &str = "the ping's connection was not ready";

/// Why the pings read slow when the sampler is ready but no ping was answered by then.
const NO_ANSWER: &str = "no ping was answered by then";

impl Drop for HoldPing {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn locked(sampled: &Mutex<Sampled>) -> std::sync::MutexGuard<'_, Sampled> {
    sampled.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The sampler's connection, subscribed, and what its pings are asked with.
struct Asking {
    conn: RustConnection,
    window: Window,
    protocols: Atom,
    ping: Atom,
}

impl Asking {
    /// Connected and subscribed to the root's `SubstructureNotify`, where `window`'s answers come; an error when the
    /// window lists no `_NET_WM_PING` in its `WM_PROTOCOLS` or the connection fails.
    fn set_up(window: Window, connect: impl FnOnce() -> Result<(RustConnection, usize)>) -> Result<Asking> {
        let (conn, screen) = connect()?;
        let root = conn.setup().roots[screen].root;
        let protocols = conn.intern_atom(false, b"WM_PROTOCOLS")?.reply()?.atom;
        let ping = conn.intern_atom(false, b"_NET_WM_PING")?.reply()?.atom;
        let listed = conn
            .get_property(false, window, protocols, AtomEnum::ATOM, 0, 64)?
            .reply()
            .ok()
            .and_then(|reply| reply.value32().map(|mut atoms| atoms.any(|atom| atom == ping)))
            .unwrap_or(false);
        anyhow::ensure!(listed, "the window lists no _NET_WM_PING");
        conn.change_window_attributes(
            root,
            &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
        )?
        .check()?;
        Ok(Asking {
            conn,
            window,
            protocols,
            ping,
        })
    }

    fn ask(&self, token: u32) -> Result<()> {
        let question = ClientMessageEvent::new(32, self.window, self.protocols, [self.ping, token, self.window, 0, 0]);
        self.conn
            .send_event(false, self.window, EventMask::NO_EVENT, question)?;
        self.conn.flush()?;
        Ok(())
    }

    /// Whether the answer to the ping with `token` is among the events read now.
    fn answered(&self, token: u32) -> Result<bool> {
        let mut answered = false;
        while let Some(event) = self.conn.poll_for_event()? {
            let Event::ClientMessage(e) = event else {
                continue;
            };
            let data = e.data.as_data32();
            answered |= e.format == 32
                && e.type_ == self.protocols
                && data[0] == self.ping
                && data[1] == token
                && data[2] == self.window;
        }
        Ok(answered)
    }
}

/// The sampler's thread: set up, then a ping whenever one is [`admitted`] and the last was answered, until the hold
/// stops it. A connection that fails ends it where it is: the pings are measurement only, so nothing else follows.
fn sample(
    window: Window,
    ends: Instant,
    connect: impl FnOnce() -> Result<(RustConnection, usize)>,
    mut gap: impl FnMut(),
    sampled: &Mutex<Sampled>,
    stop: &AtomicBool,
) {
    let asking = match Asking::set_up(window, connect) {
        Ok(asking) => asking,
        Err(error) => {
            locked(sampled).phase = Phase::Failed(format!("{error:#}"));
            return;
        }
    };
    locked(sampled).phase = Phase::Ready;
    let mut outstanding: Option<u32> = None;
    let mut last_sent: Option<Instant> = None;
    while !stop.load(Ordering::SeqCst) && Instant::now() < ends + OVERRUN {
        if let Some(token) = outstanding {
            match asking.answered(token) {
                Ok(true) => {
                    let now = Instant::now();
                    if let Some(trip) = locked(sampled).trips.last_mut() {
                        trip.answered = Some(now);
                    }
                    outstanding = None;
                }
                Ok(false) => {}
                Err(_) => return,
            }
        }
        if outstanding.is_none() && admitted(last_sent, Instant::now(), ends) {
            // recorded in flight before it goes out, under the lock the hold's end takes after it says stop, so the
            // record never misses a ping that went out; the lock is never held through the send
            let index = {
                let mut sampled = locked(sampled);
                if stop.load(Ordering::SeqCst) {
                    return;
                }
                sampled.trips.push(RoundTrip {
                    sent: Instant::now(),
                    sending: Sending::InFlight,
                    answered: None,
                });
                sampled.trips.len() - 1
            };
            gap();
            // checked again at the submission: a hold that has ended meanwhile (a take ends it at once), or a worker
            // late past the hold's last PING_EVERY, sends nothing, and the ping leaves the record
            if stop.load(Ordering::SeqCst) || !admitted(last_sent, Instant::now(), ends) {
                locked(sampled).trips.truncate(index);
                continue;
            }
            let token = crate::drop_settle::next_token();
            let sent = Instant::now();
            let asked = asking.ask(token);
            {
                let mut sampled = locked(sampled);
                let trip = &mut sampled.trips[index];
                trip.sent = sent;
                trip.sending = match &asked {
                    Ok(()) => Sending::Sent,
                    Err(error) => Sending::Failed(format!("{error:#}")),
                };
            }
            if asked.is_err() {
                return;
            }
            outstanding = Some(token);
            last_sent = Some(sent);
        }
        std::thread::sleep(READ_EVERY);
    }
}

/// Whether a ping may go out `now` in a hold that ends at `ends`, the last one (answered) having gone out at
/// `last_sent`, None for the first: not in the hold's last [`PING_EVERY`], where its answer could not come inside the
/// hold, and [`PING_EVERY`] after the last.
fn admitted(last_sent: Option<Instant>, now: Instant, ends: Instant) -> bool {
    now + PING_EVERY <= ends && last_sent.is_none_or(|sent| now >= sent + PING_EVERY)
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0
}

fn not_asked(why: &str) -> Value {
    json!({ "asked": false, "why": why })
}

/// `hold.pings`: each ping's time after the press and its round trip, or, unanswered by the hold's end (`ended`), how
/// long it had waited by then; a ping whose submission was still under way at the hold's end (`in_flight`), or failed
/// (`send_failed`, nothing asked), is no round trip and no unanswered ping.
fn record(trips: &[RoundTrip], pressed_at: Instant, ended: Instant) -> Value {
    json!({
        "asked": true,
        "round_trips": trips
            .iter()
            .map(|trip| {
                let sent_after_press_ms = ms(trip.sent.saturating_duration_since(pressed_at));
                match &trip.sending {
                    Sending::InFlight => {
                        return json!({ "sent_after_press_ms": sent_after_press_ms, "rtt_ms": null, "in_flight": true });
                    }
                    Sending::Failed(error) => {
                        return json!({ "sent_after_press_ms": sent_after_press_ms, "rtt_ms": null, "send_failed": error });
                    }
                    Sending::Sent => {}
                }
                match trip.answered.filter(|&at| at <= ended) {
                    Some(at) => json!({
                        "sent_after_press_ms": sent_after_press_ms,
                        "rtt_ms": ms(at.saturating_duration_since(trip.sent)),
                    }),
                    None => json!({
                        "sent_after_press_ms": sent_after_press_ms,
                        "rtt_ms": null,
                        "unanswered_ms": ms(ended.saturating_duration_since(trip.sent)),
                    }),
                }
            })
            .collect::<Vec<_>>(),
    })
}

/// `hold.pings` for a hold that ended at `ended`, whether it pinged or not (`pings`: None when the hold did not run).
pub fn hold_record(pings: Option<HoldPing>, pressed_at: Instant, ended: Instant) -> Value {
    pings.map_or(Value::Null, |pings| pings.finish(pressed_at, ended))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: Duration = Duration::from_millis(1);

    #[test]
    fn a_ping_goes_only_with_a_ping_s_time_left_in_the_hold_and_its_interval_after_the_last() {
        let now = Instant::now();
        let ends = now + Duration::from_secs(1);
        // the first: whenever the hold has PING_EVERY left, and not in its last PING_EVERY
        assert!(admitted(None, now, ends));
        assert!(admitted(None, ends - PING_EVERY, ends));
        assert!(!admitted(None, ends - PING_EVERY + MS, ends));
        assert!(!admitted(None, ends, ends));
        assert!(!admitted(None, ends + MS, ends), "never after the hold's end");
        // the next: PING_EVERY after the last, and not in the hold's last PING_EVERY
        let sent = now;
        assert!(!admitted(Some(sent), sent, ends));
        assert!(!admitted(Some(sent), sent + PING_EVERY - MS, ends));
        assert!(admitted(Some(sent), sent + PING_EVERY, ends));
        assert!(!admitted(Some(sent), ends - PING_EVERY + MS, ends));
        assert!(admitted(Some(sent), ends - PING_EVERY, ends));
    }

    #[test]
    fn the_record_has_each_ping_s_round_trip_or_how_long_it_waited_unanswered() {
        let pressed = Instant::now();
        let at = |ms: u64| pressed + Duration::from_millis(ms);
        let sent = |ms: u64, answered: Option<u64>| RoundTrip {
            sent: at(ms),
            sending: Sending::Sent,
            answered: answered.map(at),
        };
        let trips = [
            sent(250, Some(251)),
            sent(276, None),
            // read only after the hold had ended: unanswered by then
            sent(300, Some(451)),
            // a submission still under way at the hold's end, and one that failed: neither is an unanswered ping
            RoundTrip {
                sent: at(426),
                sending: Sending::InFlight,
                answered: None,
            },
            RoundTrip {
                sent: at(426),
                sending: Sending::Failed("broken pipe".into()),
                answered: None,
            },
        ];
        assert_eq!(
            record(&trips, pressed, at(450)),
            json!({
                "asked": true,
                "round_trips": [
                    {"sent_after_press_ms": 250.0, "rtt_ms": 1.0},
                    {"sent_after_press_ms": 276.0, "rtt_ms": null, "unanswered_ms": 174.0},
                    {"sent_after_press_ms": 300.0, "rtt_ms": null, "unanswered_ms": 150.0},
                    {"sent_after_press_ms": 426.0, "rtt_ms": null, "in_flight": true},
                    {"sent_after_press_ms": 426.0, "rtt_ms": null, "send_failed": "broken pipe"},
                ],
            })
        );
        assert_eq!(hold_record(None, pressed, at(450)), Value::Null, "no hold ran");
    }

    /// A hold that starts with less than [`PING_EVERY`] left starts no sampler at all (nothing connects), and its record
    /// says why.
    #[test]
    fn a_hold_with_no_time_left_for_a_ping_starts_no_sampler() {
        let connected = Arc::new(AtomicBool::new(false));
        let flag = connected.clone();
        let started = Instant::now();
        let pings = HoldPing::start_with(0, started + PING_EVERY - MS, move || {
            flag.store(true, Ordering::SeqCst);
            anyhow::bail!("not connected")
        });
        std::thread::sleep(Duration::from_millis(30));
        assert_eq!(
            pings.finish(started, Instant::now()),
            json!({"asked": false, "why": NO_TIME})
        );
        assert!(!connected.load(Ordering::SeqCst), "nothing connected");
    }

    /// With the hold's pings off, no sampler starts, and the record says they are off.
    #[test]
    fn a_hold_with_its_pings_off_asks_nothing_and_says_so() {
        let pressed = Instant::now();
        let pings = HoldPing::off();
        assert_eq!(
            hold_record(Some(pings), pressed, pressed + Duration::from_millis(450)),
            json!({"asked": false, "why": "disabled"})
        );
    }

    /// The hold neither waits for a sampler still setting up (a connect stuck, here until the test lets it go) nor
    /// asks X anything itself: starting it and taking its record both return at once, and the record says it was not
    /// ready.
    #[test]
    fn a_sampler_still_setting_up_at_the_hold_s_end_holds_nothing_up() {
        static SETTING_UP: AtomicUsize = AtomicUsize::new(0);
        let (release, stuck) = std::sync::mpsc::channel::<()>();
        let pressed = Instant::now();
        let ends = pressed + Duration::from_millis(50);
        let started = Instant::now();
        let connect = move || {
            let _ = stuck.recv();
            anyhow::bail!("let go")
        };
        let pings = HoldPing::spawn(0, ends, connect, || {}, &SETTING_UP);
        assert!(
            started.elapsed() < Duration::from_millis(5),
            "started at once: {:?}",
            started.elapsed()
        );
        std::thread::sleep(ends.saturating_duration_since(Instant::now()));
        let ended = Instant::now();
        let record = pings.finish(pressed, ended);
        assert!(
            ended.elapsed() < Duration::from_millis(5),
            "finished at once: {:?}",
            ended.elapsed()
        );
        assert_eq!(record, json!({"asked": false, "why": NOT_READY}));
        release.send(()).unwrap();
    }

    /// Connects that never return hold at most [`MAX_SETTING_UP`] threads: a hold past that starts no sampler, and its
    /// record says why; once a setup returns, the next hold samples again.
    #[test]
    fn stuck_setups_hold_at_most_their_cap_of_threads() {
        static SETTING_UP: AtomicUsize = AtomicUsize::new(0);
        let ends = Instant::now() + Duration::from_secs(5);
        let stuck = |release: std::sync::mpsc::Receiver<()>| {
            move || {
                let _ = release.recv();
                anyhow::bail!("let go")
            }
        };
        let releases: Vec<_> = (0..MAX_SETTING_UP)
            .map(|_| {
                let (release, waits) = std::sync::mpsc::channel::<()>();
                let pings = HoldPing::spawn(0, ends, stuck(waits), || {}, &SETTING_UP);
                (release, pings)
            })
            .collect();
        let connected = Arc::new(AtomicBool::new(false));
        let flag = connected.clone();
        let started = Instant::now();
        let busy = HoldPing::spawn(
            0,
            ends,
            move || {
                flag.store(true, Ordering::SeqCst);
                anyhow::bail!("not connected")
            },
            || {},
            &SETTING_UP,
        );
        assert_eq!(
            busy.finish(started, Instant::now()),
            json!({"asked": false, "why": BUSY})
        );
        assert!(!connected.load(Ordering::SeqCst), "no thread started past the cap");
        for (release, _) in &releases {
            release.send(()).unwrap();
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        while SETTING_UP.load(Ordering::SeqCst) > 0 && Instant::now() < deadline {
            std::thread::sleep(MS);
        }
        let flag = connected.clone();
        let pings = HoldPing::spawn(
            0,
            ends,
            move || {
                flag.store(true, Ordering::SeqCst);
                anyhow::bail!("not connected")
            },
            || {},
            &SETTING_UP,
        );
        let deadline = Instant::now() + Duration::from_secs(2);
        while !connected.load(Ordering::SeqCst) && Instant::now() < deadline {
            std::thread::sleep(MS);
        }
        assert!(
            connected.load(Ordering::SeqCst),
            "sampling again once the setups returned"
        );
        drop(pings);
        drop(releases);
    }

    /// A connection held through the test, so the display does not reset between its cases (Xvfb resets once its last
    /// client leaves, and a connect then is closed: `tests/support/mod.rs` `fresh_display`), opened through a reset under
    /// way.
    fn display_held() -> RustConnection {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            match x11rb::connect(None).map(|(conn, _)| conn) {
                Ok(conn) if conn.get_input_focus().is_ok_and(|c| c.reply().is_ok()) => return conn,
                _ if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
                _ => panic!("no X connection within 10 s"),
            }
        }
    }

    /// A window of the test's own that lists `_NET_WM_PING` and answers each ping after `delay` (None: never), as an
    /// application answers the window manager's: the message sent on to the root. Ends at a ping whose token is 0. The
    /// list is when each ping arrived.
    fn answering_window(delay: Option<Duration>) -> (Window, std::thread::JoinHandle<()>, Arc<Mutex<Vec<Instant>>>) {
        use x11rb::protocol::xproto::{CreateWindowAux, PropMode, WindowClass};
        use x11rb::wrapper::ConnectionExt as _;
        let (app, screen) = x11rb::connect(None).unwrap();
        let root = app.setup().roots[screen].root;
        let window = app.generate_id().unwrap();
        let (class, parent) = (WindowClass::INPUT_OUTPUT, x11rb::COPY_FROM_PARENT);
        app.create_window(0, window, root, 0, 0, 10, 10, 0, class, parent, &CreateWindowAux::new())
            .unwrap();
        let protocols = app.intern_atom(false, b"WM_PROTOCOLS").unwrap().reply().unwrap().atom;
        let ping = app.intern_atom(false, b"_NET_WM_PING").unwrap().reply().unwrap().atom;
        app.change_property32(PropMode::REPLACE, window, protocols, AtomEnum::ATOM, &[ping])
            .unwrap();
        app.get_input_focus().unwrap().reply().unwrap();
        let arrivals = Arc::new(Mutex::new(Vec::new()));
        let arrived = arrivals.clone();
        let answerer = std::thread::spawn(move || {
            let mask = EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT;
            loop {
                match app.wait_for_event() {
                    Ok(Event::ClientMessage(e)) if e.type_ == protocols && e.data.as_data32()[0] == ping => {
                        if e.data.as_data32()[1] == 0 {
                            return;
                        }
                        arrived.lock().unwrap().push(Instant::now());
                        let Some(delay) = delay else {
                            continue;
                        };
                        std::thread::sleep(delay);
                        let answer = ClientMessageEvent::new(32, root, protocols, e.data.as_data32());
                        app.send_event(false, root, mask, answer).unwrap();
                        app.flush().unwrap();
                    }
                    Ok(_) => {}
                    Err(_) => return,
                }
            }
        });
        (window, answerer, arrivals)
    }

    fn end(window: Window, answerer: std::thread::JoinHandle<()>) {
        let (conn, _) = x11rb::connect(None).unwrap();
        let protocols = conn.intern_atom(false, b"WM_PROTOCOLS").unwrap().reply().unwrap().atom;
        let ping = conn.intern_atom(false, b"_NET_WM_PING").unwrap().reply().unwrap().atom;
        let stop = ClientMessageEvent::new(32, window, protocols, [ping, 0, window, 0, 0]);
        conn.send_event(false, window, EventMask::NO_EVENT, stop).unwrap();
        conn.flush().unwrap();
        answerer.join().unwrap();
    }

    /// A hold of `hold` from `pressed` as the engine runs one: the sampler started, the hold waited out, its record
    /// taken; and when the hold ended.
    fn hold(window: Window, pressed: Instant, hold: Duration) -> (Value, Instant) {
        let pings = HoldPing::start(window, pressed + hold);
        std::thread::sleep((pressed + hold).saturating_duration_since(Instant::now()));
        let ended = Instant::now();
        (pings.finish(pressed, ended), ended)
    }

    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_hold_records_each_ping_s_round_trip_one_at_a_time_and_none_after_it_ends() {
        let _held = display_held();
        let pressed = Instant::now();
        // an application that answers at once: a ping every PING_EVERY or so through a 200 ms hold
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let (record, ended) = hold(window, pressed, Duration::from_millis(200));
        let trips = record["round_trips"].as_array().unwrap().clone();
        assert!((5..=8).contains(&trips.len()), "{record}");
        assert!(
            trips
                .iter()
                .all(|t| t["sent_after_press_ms"].as_f64().unwrap() <= 175.0),
            "none in the hold's last 25 ms: {record}"
        );
        for pair in trips.windows(2) {
            let gap =
                pair[1]["sent_after_press_ms"].as_f64().unwrap() - pair[0]["sent_after_press_ms"].as_f64().unwrap();
            assert!(gap >= PING_EVERY.as_secs_f64() * 1000.0, "{record}");
        }
        assert!(
            trips[..trips.len() - 1]
                .iter()
                .all(|t| t["rtt_ms"].as_f64().is_some_and(|ms| ms < 20.0)),
            "{record}"
        );
        std::thread::sleep(Duration::from_millis(100));
        assert!(
            arrivals.lock().unwrap().iter().all(|&at| at < ended),
            "none after the hold"
        );
        end(window, answerer);

        // an application that answers 120 ms late: one ping outstanding at a time, the slow round trip recorded
        let pressed = Instant::now();
        let (window, answerer, _) = answering_window(Some(Duration::from_millis(120)));
        let (record, _) = hold(window, pressed, Duration::from_millis(200));
        let trips = record["round_trips"].as_array().unwrap().clone();
        assert_eq!(trips.len(), 2, "{record}");
        assert!(
            trips[0]["rtt_ms"]
                .as_f64()
                .is_some_and(|ms| (120.0..160.0).contains(&ms)),
            "{record}"
        );
        assert_eq!(
            trips[1]["rtt_ms"],
            Value::Null,
            "the second still out at the hold's end: {record}"
        );
        assert!(
            trips[1]["unanswered_ms"]
                .as_f64()
                .is_some_and(|ms| (30.0..110.0).contains(&ms)),
            "{record}"
        );
        end(window, answerer);

        // an application that never answers: one ping, unanswered, the hold no longer for it
        let pressed = Instant::now();
        let (window, answerer, _) = answering_window(None);
        let (record, ended) = hold(window, pressed, Duration::from_millis(100));
        assert!(
            ended - pressed < Duration::from_millis(130),
            "the hold ran its own length"
        );
        assert_eq!(record["round_trips"].as_array().unwrap().len(), 1, "{record}");
        assert_eq!(record["round_trips"][0]["rtt_ms"], Value::Null, "{record}");
        end(window, answerer);
    }

    /// A hold that starts with almost no time left asks nothing; a sampler whose setup takes most of the hold asks no
    /// ping after the hold's last [`PING_EVERY`], so none reaches the window after the hold's end, and one whose setup
    /// leaves time pings from then on, inside the hold.
    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_hold_with_little_time_left_or_a_slow_setup_asks_no_ping_after_its_end() {
        let _held = display_held();
        let slow = |delay: Duration| {
            move || {
                std::thread::sleep(delay);
                x11rb::connect(None).context("connect")
            }
        };
        // 10 ms left: no sampler, nothing asked
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let pressed = Instant::now();
        let pings = HoldPing::start(window, pressed + Duration::from_millis(10));
        std::thread::sleep(Duration::from_millis(10));
        let record = pings.finish(pressed, Instant::now());
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(record, json!({"asked": false, "why": NO_TIME}));
        assert!(arrivals.lock().unwrap().is_empty(), "no ping asked");
        end(window, answerer);

        // a setup of 90 ms in a hold of 100: ready after the last ping could go, so none goes, though the hold's end
        // lets it run past it
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let pressed = Instant::now();
        let pings = HoldPing::start_with(
            window,
            pressed + Duration::from_millis(100),
            slow(Duration::from_millis(90)),
        );
        std::thread::sleep(Duration::from_millis(120));
        let record = pings.finish(pressed, Instant::now());
        std::thread::sleep(Duration::from_millis(100));
        // ready with no time left, or still connecting on a loaded machine: nothing asked either way
        assert_eq!(record["asked"], json!(false), "{record}");
        assert!(arrivals.lock().unwrap().is_empty(), "no ping asked");
        end(window, answerer);

        // a setup of 40 ms in a hold of 200: pings from then on, every one inside the hold
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let pressed = Instant::now();
        let ends = pressed + Duration::from_millis(200);
        let pings = HoldPing::start_with(window, ends, slow(Duration::from_millis(40)));
        std::thread::sleep(ends.saturating_duration_since(Instant::now()));
        let ended = Instant::now();
        let record = pings.finish(pressed, ended);
        std::thread::sleep(Duration::from_millis(100));
        let trips = record["round_trips"].as_array().expect("asked").clone();
        assert!(!trips.is_empty(), "{record}");
        assert!(
            trips.iter().all(|t| {
                let at = t["sent_after_press_ms"].as_f64().unwrap();
                (40.0..=175.0).contains(&at)
            }),
            "after the setup and not in the hold's last 25 ms: {record}"
        );
        let arrivals = arrivals.lock().unwrap().clone();
        assert_eq!(arrivals.len(), trips.len(), "{record}");
        assert!(arrivals.iter().all(|&at| at < ended), "none after the hold");
        end(window, answerer);
    }

    /// The gap between a ping's admission and its submission (the re-review of fdaff715, P2). A hold that ends in it,
    /// as a take ends one at once, records the ping as in flight, never as unanswered, and the ping is not sent; a
    /// worker that crosses the hold's last [`PING_EVERY`] in it sends nothing either.
    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_ping_admitted_but_not_yet_submitted_when_the_hold_ends_or_its_time_runs_out_is_not_sent() {
        static SETTING_UP: AtomicUsize = AtomicUsize::new(0);
        let _held = display_held();
        let connect = || x11rb::connect(None).context("connect");
        // the hold ends (an early take) while the first ping waits in the gap
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let (in_gap, at_gap) = std::sync::mpsc::channel::<()>();
        let (go_on, held_in_gap) = std::sync::mpsc::channel::<()>();
        let gap = move || {
            let _ = in_gap.send(());
            let _ = held_in_gap.recv();
        };
        let pressed = Instant::now();
        let pings = HoldPing::spawn(window, pressed + Duration::from_millis(400), connect, gap, &SETTING_UP);
        at_gap
            .recv_timeout(Duration::from_secs(5))
            .expect("the first ping admitted");
        let ended = Instant::now();
        let record = pings.finish(pressed, ended);
        assert!(
            ended.elapsed() < Duration::from_millis(5),
            "the hold's end waits for nothing"
        );
        go_on.send(()).unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let trips = record["round_trips"].as_array().expect("a record").clone();
        assert_eq!(trips.len(), 1, "{record}");
        assert_eq!(
            trips[0]["in_flight"],
            json!(true),
            "in flight, not unanswered: {record}"
        );
        assert!(trips[0].get("unanswered_ms").is_none(), "{record}");
        assert!(
            arrivals.lock().unwrap().is_empty(),
            "the ping was not sent after the hold had ended"
        );
        end(window, answerer);

        // the worker late in the gap, past the hold's last PING_EVERY: nothing sent
        let (window, answerer, arrivals) = answering_window(Some(Duration::ZERO));
        let pressed = Instant::now();
        let ends = pressed + Duration::from_millis(100);
        let late =
            move || std::thread::sleep((ends - Duration::from_millis(10)).saturating_duration_since(Instant::now()));
        let pings = HoldPing::spawn(window, ends, connect, late, &SETTING_UP);
        std::thread::sleep(Duration::from_millis(150));
        let record = pings.finish(pressed, ends);
        std::thread::sleep(Duration::from_millis(50));
        assert_eq!(record, json!({"asked": false, "why": NO_TIME}), "nothing went out");
        assert!(
            arrivals.lock().unwrap().is_empty(),
            "no ping past the hold's last 25 ms"
        );
        end(window, answerer);
    }

    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_window_that_lists_no_ping_is_not_asked() {
        use x11rb::protocol::xproto::{CreateWindowAux, WindowClass};
        let conn = display_held();
        let root = conn.setup().roots[0].root;
        let window = conn.generate_id().unwrap();
        let (class, parent) = (WindowClass::INPUT_OUTPUT, x11rb::COPY_FROM_PARENT);
        conn.create_window(0, window, root, 0, 0, 10, 10, 0, class, parent, &CreateWindowAux::new())
            .unwrap();
        conn.get_input_focus().unwrap().reply().unwrap();
        let (record, _) = hold(window, Instant::now(), Duration::from_millis(100));
        assert_eq!(
            record,
            json!({"asked": false, "why": "the window lists no _NET_WM_PING"})
        );
    }
}
