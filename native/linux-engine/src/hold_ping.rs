//! The ping predictor (the design session's ruling 888.2; measurement only, it changes no answer). While a Chromium
//! source's hold for its take runs with no take (`dnd::TAKE_HOLD_AFTER_PRESS`), the engine asks the source's window a
//! `_NET_WM_PING`, as the Electron settle does (`drop_settle.rs`, `drop_cursor.rs`), and records how long each took to
//! come back, per drag, in `--stats` (`hold.pings`). Chromium answers on its browser's UI thread, in the order of its
//! events, so a slow answer says the browser was behind; the design session decides from these whether a slow ping
//! marks the drags whose late drag and drop the hold cannot catch.
//!
//! The pings are bounded by the hold: one at a time, the next one [`PING_EVERY`] after the last went out once that one
//! was answered, none in the hold's last [`PING_EVERY`] (it could not come back inside the hold) and none after the hold
//! ends, which neither waits for an answer nor runs longer for one. A ping still unanswered then is recorded with how
//! long it had waited. The watch is opened when the hold starts, on an X
//! connection of its own (the answers come to the root, read with its `SubstructureNotify`), and closed with it.

use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, Window,
};
use x11rb::rust_connection::RustConnection;

/// How long after one ping went out the next goes, once the first was answered: a ping every 25 ms at most, a hold of
/// 450 ms some eighteen of them.
pub const PING_EVERY: Duration = Duration::from_millis(25);

/// One ping: when it went out, and when its answer was read (None: not by the hold's end).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct RoundTrip {
    sent: Instant,
    answered: Option<Instant>,
}

/// The pings of one hold, and the connection they are asked and answered on.
pub struct HoldPing {
    conn: RustConnection,
    window: Window,
    protocols: Atom,
    ping: Atom,
    /// The token of the ping waiting for its answer, if one is.
    outstanding: Option<u32>,
    trips: Vec<RoundTrip>,
    /// When the hold ends with no take: no ping is asked in its last [`PING_EVERY`].
    ends: Instant,
}

/// The hold's pings, or why none was asked: the window lists no `_NET_WM_PING`, or the watch could not start.
pub type Pings = std::result::Result<HoldPing, String>;

impl HoldPing {
    /// Connected and subscribed to the root's `SubstructureNotify`, where `window`'s answers come, and the first ping
    /// asked, for a hold that ends with no take at `ends`; an error when the window lists no `_NET_WM_PING` in its
    /// `WM_PROTOCOLS` or the connection fails.
    pub fn start(window: Window, ends: Instant) -> Pings {
        Self::connect(window, ends).map_err(|error| format!("{error:#}"))
    }

    fn connect(window: Window, ends: Instant) -> Result<HoldPing> {
        let (conn, screen) = x11rb::connect(None).context("the hold's ping could not connect")?;
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
        let mut pings = HoldPing {
            conn,
            window,
            protocols,
            ping,
            outstanding: None,
            trips: Vec::new(),
            ends,
        };
        pings.ask()?;
        Ok(pings)
    }

    fn ask(&mut self) -> Result<()> {
        let token = crate::drop_settle::next_token();
        let question = ClientMessageEvent::new(32, self.window, self.protocols, [self.ping, token, self.window, 0, 0]);
        self.conn
            .send_event(false, self.window, EventMask::NO_EVENT, question)?;
        self.conn.flush()?;
        self.outstanding = Some(token);
        self.trips.push(RoundTrip {
            sent: Instant::now(),
            answered: None,
        });
        Ok(())
    }

    /// The answers come so far read, and the next ping asked when it is due ([`due`]). A connection that fails ends the
    /// pings where they are: they are measurement only, so nothing else follows from it.
    pub fn poll(&mut self) {
        let Ok(()) = self.read() else {
            self.outstanding = None;
            return;
        };
        let last = self.trips.last().copied();
        if self.outstanding.is_none() && last.is_some_and(|trip| due(trip.sent, Instant::now(), self.ends)) {
            let _ = self.ask();
        }
    }

    fn read(&mut self) -> Result<()> {
        while let Some(event) = self.conn.poll_for_event()? {
            let Event::ClientMessage(e) = event else {
                continue;
            };
            let data = e.data.as_data32();
            if e.format == 32
                && e.type_ == self.protocols
                && data[0] == self.ping
                && data[2] == self.window
                && Some(data[1]) == self.outstanding
            {
                self.outstanding = None;
                if let Some(trip) = self.trips.last_mut() {
                    trip.answered = Some(Instant::now());
                }
            }
        }
        Ok(())
    }

    /// The `--stats` record of the hold's pings once it has ended (`ended`), counted from the drag's press.
    pub fn record(&self, pressed_at: Instant, ended: Instant) -> Value {
        record(&self.trips, pressed_at, ended)
    }
}

/// Whether the next ping is due, the last one having gone out at `sent` and been answered, in a hold that ends at
/// `ends`: [`PING_EVERY`] after the last, and not in the hold's last [`PING_EVERY`].
fn due(sent: Instant, now: Instant, ends: Instant) -> bool {
    now >= sent + PING_EVERY && now + PING_EVERY <= ends
}

fn ms(d: Duration) -> f64 {
    (d.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0
}

/// `hold.pings`: each ping's time after the press and its round trip, or, unanswered by the hold's end, how long it had
/// waited by then.
fn record(trips: &[RoundTrip], pressed_at: Instant, ended: Instant) -> Value {
    json!({
        "asked": true,
        "round_trips": trips
            .iter()
            .map(|trip| {
                let sent_after_press_ms = ms(trip.sent.saturating_duration_since(pressed_at));
                match trip.answered {
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

/// `hold.pings` for a hold, whether its pings were asked or not (`pings`: None when the hold did not run).
pub fn hold_record(pings: Option<&Pings>, pressed_at: Instant, ended: Instant) -> Value {
    match pings {
        None => Value::Null,
        Some(Ok(pings)) => pings.record(pressed_at, ended),
        Some(Err(why)) => json!({ "asked": false, "why": why }),
    }
}

/// The hold's look, with its pings polled first: what a hold's wait calls each time it looks for the take.
pub fn polled(pings: &mut Option<Pings>) {
    if let Some(Ok(pings)) = pings.as_mut() {
        pings.poll();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_next_ping_waits_for_the_last_one_s_answer_and_its_interval() {
        let sent = Instant::now();
        let ends = sent + Duration::from_secs(1);
        assert!(!due(sent, sent, ends));
        assert!(!due(sent, sent + PING_EVERY - Duration::from_millis(1), ends));
        assert!(due(sent, sent + PING_EVERY, ends));
        // none in the hold's last PING_EVERY: its answer could not come inside the hold
        let late = ends - PING_EVERY + Duration::from_millis(1);
        assert!(!due(sent, late, ends));
        assert!(due(sent, ends - PING_EVERY, ends));
    }

    #[test]
    fn the_record_has_each_ping_s_round_trip_or_how_long_it_waited_unanswered() {
        let pressed = Instant::now();
        let at = |ms: u64| pressed + Duration::from_millis(ms);
        let trips = [
            RoundTrip {
                sent: at(250),
                answered: Some(at(251)),
            },
            RoundTrip {
                sent: at(276),
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
                ],
            })
        );
        assert_eq!(hold_record(None, pressed, at(450)), Value::Null, "no hold ran");
        assert_eq!(
            hold_record(Some(&Err("the window lists no _NET_WM_PING".into())), pressed, at(450)),
            json!({"asked": false, "why": "the window lists no _NET_WM_PING"})
        );
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
    /// application answers the window manager's: the message sent on to the root. Ends at a ping whose token is 0.
    fn answering_window(delay: Option<Duration>) -> (Window, std::thread::JoinHandle<()>) {
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
        let answerer = std::thread::spawn(move || {
            let mask = EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT;
            loop {
                match app.wait_for_event() {
                    Ok(Event::ClientMessage(e)) if e.type_ == protocols && e.data.as_data32()[0] == ping => {
                        if e.data.as_data32()[1] == 0 {
                            return;
                        }
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
        (window, answerer)
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

    /// The hold's wait as the engine runs it: a look every 2 ms until `hold` has passed, the pings polled at each.
    fn hold(pings: &mut Option<Pings>, hold: Duration) -> Instant {
        let started = Instant::now();
        while started.elapsed() < hold {
            polled(pings);
            std::thread::sleep(Duration::from_millis(2));
        }
        Instant::now()
    }

    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_hold_records_each_ping_s_round_trip_one_at_a_time_and_none_after_it_ends() {
        let _held = display_held();
        let pressed = Instant::now();
        // an application that answers at once: a ping every PING_EVERY or so through a 200 ms hold
        let (window, answerer) = answering_window(Some(Duration::ZERO));
        let mut pings = Some(HoldPing::start(window, pressed + Duration::from_millis(200)));
        let ended = hold(&mut pings, Duration::from_millis(200));
        let record = hold_record(pings.as_ref(), pressed, ended);
        let trips = record["round_trips"].as_array().unwrap().clone();
        assert!((5..=8).contains(&trips.len()), "{record}");
        assert!(
            trips
                .iter()
                .all(|t| t["sent_after_press_ms"].as_f64().unwrap() <= 176.0),
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
        drop(pings);
        end(window, answerer);

        // an application that answers 120 ms late: one ping outstanding at a time, the slow round trip recorded
        let pressed = Instant::now();
        let (window, answerer) = answering_window(Some(Duration::from_millis(120)));
        let mut pings = Some(HoldPing::start(window, pressed + Duration::from_millis(200)));
        let ended = hold(&mut pings, Duration::from_millis(200));
        let record = hold_record(pings.as_ref(), pressed, ended);
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
        drop(pings);
        end(window, answerer);

        // an application that never answers: one ping, unanswered, the hold no longer for it
        let pressed = Instant::now();
        let (window, answerer) = answering_window(None);
        let mut pings = Some(HoldPing::start(window, pressed + Duration::from_millis(100)));
        let ended = hold(&mut pings, Duration::from_millis(100));
        assert!(
            ended - pressed < Duration::from_millis(130),
            "the hold ran its own length"
        );
        let record = hold_record(pings.as_ref(), pressed, ended);
        assert_eq!(record["round_trips"].as_array().unwrap().len(), 1, "{record}");
        assert_eq!(record["round_trips"][0]["rtt_ms"], Value::Null, "{record}");
        drop(pings);
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
        let Err(why) = HoldPing::start(window, Instant::now() + Duration::from_millis(100)) else {
            panic!("asked a window that lists no ping")
        };
        assert_eq!(why, "the window lists no _NET_WM_PING");
    }
}
