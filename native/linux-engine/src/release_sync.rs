//! #459's prototype, measurement only (`--drag-dnd-release-sync`; #171 M5, task 126, the design session's rulings 957
//! and 958; never released): what a Chromium drop the engine lets drop does just before its release, beyond the floor.
//! Off by default, so the engine as it ships is unchanged until a form is chosen.
//!
//! The fault. A drag whose path outlasts the floor after the take (`dnd::RELEASE_AFTER_TAKE`) is released 0-4 ms after
//! its last motion, and under load Chrome drops on a stale accept and position (task 122's `t14-long` at arm64 twice the
//! load: 7 false oks and 5 drops into the zone of 100, the path ending left of it). Chrome's own source (156; the
//! `main` branch reads the same) says why:
//! - `X11WholeScreenMoveLoop::DispatchEvent` (`ui/base/x/x11_whole_screen_move_loop.cc`) runs
//!   `CoalescePendingMotionEvents` on a core motion, whose core branch never counts what it coalesces (V5's
//!   observation, 2026-11-13): of motions queued together only the first is dispatched, so a last motion queued behind a
//!   backlog is lost. Its release case dispatches no motion first.
//! - `XDragDropClient::HandleMouseReleased` (`ui/base/x/x11_drag_drop_client.cc`), with a status outstanding, makes the
//!   drop pending (`kPendingDrop`), and `OnXdndStatus` decides a pending drop before it sends the position it queued
//!   meanwhile (`next_position_message_`): the drop goes on the older position's status.
//! - Chrome is both the drag's source and its target here, and `SendXClientEvent` short-circuits `XdndPosition` and
//!   `XdndStatus` inside the process: no status ever reaches the X server, so no other client can read one. The form
//!   that waited for the status answering the last motion (957's (b)) cannot be built; 958 put (b') in its place.
//!
//! The forms ([`Form`]):
//! - `keepalive` (a): one more motion at the path's last point, whatever the floor left, then [`dnd::KEEPALIVE`]
//!   before the release.
//! - `ping` (b'): the source's browser asked a `_NET_WM_PING`, which it answers in the order of its X events, and its
//!   answer waited for, so it has read the path's backlog; then the motion at the last point, read alone; then a second
//!   ping and its answer, so it has read that motion; then the release. Both answers share one bound, [`BOUND`]; a
//!   bound that expires releases at once, and the drop is reported unconfirmed (`handle::Confirming::Unsynced`), since
//!   the browser did not show it had read where the drag ended. There is no refusal: no status can be read. With a dwell
//!   (`--drag-dnd-release-sync-dwell-ms`, b''), the release waits that long after the second answer, for the status the
//!   pending drop would otherwise decide on.
//!
//! The motion at the last point is one motion on the background route: SendEvent delivers a motion to where the
//! pointer already is, and a second one queued with it would be coalesced into the first. On XTEST's routes a motion to
//! the pointer's own place produces no event (M4's T9), so it is the floor's pair, the path's second-to-last sample and
//! then its last.

use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, Window,
};
use x11rb::rust_connection::RustConnection;

use crate::dnd;

/// What a Chromium drop the engine lets drop does before its release (`--drag-dnd-release-sync`, measurement only).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Form {
    /// Nothing beyond the floor: the engine as it ships.
    Off,
    /// (a) One motion at the path's last point, then [`dnd::KEEPALIVE`].
    Keepalive,
    /// (b') A ping and its answer, the motion, a second ping and its answer, inside [`BOUND`]; then `dwell` (b'').
    Ping { dwell: Duration },
}

impl Form {
    pub fn name(self) -> &'static str {
        match self {
            Form::Off => "off",
            Form::Keepalive => "keepalive",
            Form::Ping { .. } => "ping",
        }
    }
}

/// Whether a drag whose source is of `family` (`families.rs`) gets the step: Chrome's alone, provisionally (task 127's
/// reach draft for 0.4.3, before the design session rules on scope). Electron's drop already rests, revisits its last
/// point and asks its application twice before its release (`drop_settle.rs`, ruling 827), with no false ok at H6.
pub fn applies(family: &str) -> bool {
    crate::families::confirms_drop(family)
}

/// The bound both of (b')'s answers share, from the first ping's send.
pub const BOUND: Duration = Duration::from_millis(100);

/// How often the answer to a ping is looked for.
const POLL: Duration = Duration::from_micros(500);

/// What the step before the release did (`--stats` `release_sync`).
#[derive(Debug, Clone, PartialEq)]
pub struct Synced {
    pub form: Form,
    /// The motions it sent.
    pub motions: u32,
    /// Each ping's round trip, in order (None: unanswered by the bound).
    pub pings: Vec<Option<Duration>>,
    /// Whether the bound expired, or the pings could not be asked: the drop is then reported unconfirmed.
    pub expired: bool,
    /// Why no ping could be asked, when none could.
    pub error: Option<String>,
    /// How long the step held the release up, the dwell included.
    pub added: Duration,
    /// The dwell after the second answer, when it came (its nominal length: the release follows the step at once).
    pub answer_to_release: Option<Duration>,
    /// The wall clock, in milliseconds since the epoch, when the second answer was read (`--stats` only: the harness
    /// holds it against the release's own wall time).
    pub answered_wall_ms: Option<f64>,
}

impl Synced {
    pub fn record(&self) -> Value {
        let ms = |d: Duration| d.as_secs_f64() * 1000.0;
        json!({
            "form": self.form.name(),
            "dwell_ms": match self.form { Form::Ping { dwell } => Some(ms(dwell)), _ => None },
            "motions": self.motions,
            "pings_ms": self.pings.iter().map(|p| p.map(ms)).collect::<Vec<_>>(),
            "expired": self.expired,
            "error": self.error,
            "added_ms": ms(self.added),
            "answer_to_release_ms": self.answer_to_release.map(ms),
            "answered_wall_ms": self.answered_wall_ms,
        })
    }
}

/// The step before the release of a Chromium drop the engine lets drop, by `form`: `place` sends a motion, `ask(by)`
/// sends a ping and answers its round trip once its answer is read, or None at `by`. `xtest` is whether the drag's
/// input is XTEST's; `before` and `last` are the path's last two samples. A motion that fails ends it with its error,
/// as the floor's do; a ping that cannot be asked expires the step. None for [`Form::Off`].
pub fn before_release(
    form: Form,
    xtest: bool,
    before: (i16, i16),
    last: (i16, i16),
    mut place: impl FnMut((i16, i16)) -> Result<()>,
    mut ask: impl FnMut(Instant) -> Result<Option<Duration>>,
) -> Result<Option<Synced>> {
    let started = Instant::now();
    let mut synced = Synced {
        form,
        motions: 0,
        pings: Vec::new(),
        expired: false,
        error: None,
        added: Duration::ZERO,
        answer_to_release: None,
        answered_wall_ms: None,
    };
    let mut motion = |synced: &mut Synced| -> Result<()> {
        if xtest {
            place(before)?;
            synced.motions += 1;
        }
        place(last)?;
        synced.motions += 1;
        Ok(())
    };
    match form {
        Form::Off => return Ok(None),
        Form::Keepalive => {
            motion(&mut synced)?;
            std::thread::sleep(dnd::KEEPALIVE);
        }
        Form::Ping { dwell } => {
            let by = started + BOUND;
            // each answer, or the step expired: its reason when the ping could not be asked
            let mut answered = |synced: &mut Synced| match ask(by) {
                Ok(trip) => {
                    synced.pings.push(trip);
                    synced.expired |= trip.is_none();
                    trip.is_some()
                }
                Err(error) => {
                    synced.error = Some(format!("{error:#}"));
                    synced.expired = true;
                    false
                }
            };
            if answered(&mut synced) {
                motion(&mut synced)?;
                if answered(&mut synced) {
                    synced.answered_wall_ms = Some(wall_ms());
                    std::thread::sleep(dwell);
                    synced.answer_to_release = Some(dwell);
                }
            }
        }
    }
    synced.added = started.elapsed();
    Ok(Some(synced))
}

/// The wall clock in milliseconds since the epoch.
fn wall_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0.0, |d| d.as_secs_f64() * 1000.0)
}

/// The pinger of (b'): an X connection of its own, subscribed to the root's `SubstructureNotify`, where the source's
/// answers come, made before the press so its setup costs the release nothing.
pub struct Pinger {
    conn: RustConnection,
    window: Window,
    protocols: Atom,
    ping: Atom,
}

impl Pinger {
    /// Connected and subscribed; an error when `window` lists no `_NET_WM_PING` or the connection fails.
    pub fn connect(window: Window) -> Result<Pinger> {
        let (conn, screen) = x11rb::connect(None).context("the release's ping could not connect")?;
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
        Ok(Pinger {
            conn,
            window,
            protocols,
            ping,
        })
    }

    /// One ping, its round trip once its answer is read, or None at `by`.
    pub fn ask(&mut self, by: Instant) -> Result<Option<Duration>> {
        // answers to earlier pings left unread are not this one's
        while self.conn.poll_for_event()?.is_some() {}
        let token = crate::drop_settle::next_token();
        let question = ClientMessageEvent::new(32, self.window, self.protocols, [self.ping, token, self.window, 0, 0]);
        let sent = Instant::now();
        self.conn
            .send_event(false, self.window, EventMask::NO_EVENT, question)?;
        self.conn.flush()?;
        loop {
            while let Some(event) = self.conn.poll_for_event()? {
                if let Event::ClientMessage(e) = event {
                    let data = e.data.as_data32();
                    if e.format == 32
                        && e.type_ == self.protocols
                        && data[0] == self.ping
                        && data[1] == token
                        && data[2] == self.window
                    {
                        return Ok(Some(sent.elapsed()));
                    }
                }
            }
            let now = Instant::now();
            if now >= by {
                return Ok(None);
            }
            std::thread::sleep(POLL.min(by - now));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// What the step sent, in order.
    #[derive(Debug, Clone, PartialEq)]
    enum Sent {
        Motion((i16, i16)),
        Ping,
    }

    /// The step run against a recorder: every motion and ping with when it went, each ping answered after its entry
    /// of `answers` (None, or none left: never), and when the step returned.
    fn run(form: Form, xtest: bool, answers: &[Option<Duration>]) -> (Option<Synced>, Vec<(Sent, Instant)>, Instant) {
        let log = std::cell::RefCell::new(Vec::new());
        let mut answers = answers.iter().copied();
        let synced = before_release(
            form,
            xtest,
            (9, 10),
            (10, 10),
            |p| {
                log.borrow_mut().push((Sent::Motion(p), Instant::now()));
                Ok(())
            },
            |by| {
                log.borrow_mut().push((Sent::Ping, Instant::now()));
                match answers.next().flatten() {
                    Some(after) if Instant::now() + after < by => {
                        std::thread::sleep(after);
                        Ok(Some(after))
                    }
                    _ => {
                        std::thread::sleep(by.saturating_duration_since(Instant::now()));
                        Ok(None)
                    }
                }
            },
        )
        .unwrap();
        (synced, log.into_inner(), Instant::now())
    }

    fn kinds(log: &[(Sent, Instant)]) -> Vec<Sent> {
        log.iter().map(|(s, _)| s.clone()).collect()
    }

    #[test]
    fn only_a_chrome_source_s_drop_gets_the_step() {
        assert!(applies("Chrome"));
        // Electron's drop is settled before its release already (`drop_settle.rs`)
        assert!(!applies("Chromium"));
        assert!(!applies("Gecko"));
    }

    #[test]
    fn off_sends_nothing_and_holds_nothing_up() {
        let started = Instant::now();
        let (synced, log, _) = run(Form::Off, false, &[]);
        assert_eq!(synced, None);
        assert!(log.is_empty());
        assert!(started.elapsed() < Duration::from_millis(2));
    }

    #[test]
    fn keepalive_sends_one_motion_at_the_last_point_on_the_background_route_and_the_pair_on_xtest() {
        let (synced, log, _) = run(Form::Keepalive, false, &[]);
        assert_eq!(kinds(&log), vec![Sent::Motion((10, 10))]);
        let synced = synced.expect("a record");
        assert_eq!((synced.motions, synced.expired, synced.pings.len()), (1, false, 0));
        let (synced, log, _) = run(Form::Keepalive, true, &[]);
        assert_eq!(kinds(&log), vec![Sent::Motion((9, 10)), Sent::Motion((10, 10))]);
        assert_eq!(synced.unwrap().motions, 2);
    }

    #[test]
    fn keepalive_leaves_its_keepalive_s_spacing_before_the_release() {
        let (synced, log, ended) = run(Form::Keepalive, false, &[]);
        let last = log.last().unwrap().1;
        assert!(
            ended - last >= dnd::KEEPALIVE,
            "{:?} from the motion to the release",
            ended - last
        );
        assert!(synced.unwrap().added >= dnd::KEEPALIVE);
    }

    #[test]
    fn ping_asks_answered_then_moves_then_asks_again_and_releases_on_the_second_answer() {
        let ms = Duration::from_millis;
        let (synced, log, ended) = run(Form::Ping { dwell: Duration::ZERO }, false, &[Some(ms(3)), Some(ms(4))]);
        assert_eq!(kinds(&log), vec![Sent::Ping, Sent::Motion((10, 10)), Sent::Ping]);
        let synced = synced.unwrap();
        assert!(!synced.expired);
        assert_eq!(synced.pings, vec![Some(ms(3)), Some(ms(4))]);
        // the motion only once the first answer is in
        assert!(log[1].1 - log[0].1 >= ms(3));
        // released straight after the second answer, with no dwell
        assert!(ended - log[2].1 < ms(4) + ms(3), "{:?}", ended - log[2].1);
        assert_eq!(synced.answer_to_release, Some(Duration::ZERO));
        // on XTEST the motion is the pair
        let (_, log, _) = run(Form::Ping { dwell: Duration::ZERO }, true, &[Some(ms(1)), Some(ms(1))]);
        assert_eq!(
            kinds(&log),
            vec![Sent::Ping, Sent::Motion((9, 10)), Sent::Motion((10, 10)), Sent::Ping]
        );
    }

    #[test]
    fn ping_s_dwell_follows_the_second_answer() {
        let ms = Duration::from_millis;
        let (synced, log, ended) = run(Form::Ping { dwell: ms(30) }, false, &[Some(ms(1)), Some(ms(1))]);
        assert!(ended - log[2].1 >= ms(31), "{:?}", ended - log[2].1);
        let synced = synced.unwrap();
        assert_eq!(synced.answer_to_release, Some(ms(30)));
        assert!(synced.added >= ms(32));
    }

    #[test]
    fn both_answers_share_one_bound_and_an_expired_bound_releases_at_once_unconfirmed() {
        let ms = Duration::from_millis;
        // the first answer never comes: no motion, released at the bound, the dwell skipped
        let started = Instant::now();
        let (synced, log, _) = run(Form::Ping { dwell: ms(30) }, false, &[None]);
        let took = started.elapsed();
        assert_eq!(kinds(&log), vec![Sent::Ping]);
        let synced = synced.unwrap();
        assert!(synced.expired && synced.pings == vec![None] && synced.answer_to_release.is_none());
        assert!(took >= BOUND && took < BOUND + ms(15), "{took:?}");
        // the first at 70 ms; the second's 40 ms passes the 30 the first left of the bound: expired, no dwell
        let started = Instant::now();
        let (synced, log, _) = run(Form::Ping { dwell: ms(30) }, false, &[Some(ms(70)), Some(ms(40))]);
        let took = started.elapsed();
        assert_eq!(kinds(&log), vec![Sent::Ping, Sent::Motion((10, 10)), Sent::Ping]);
        let synced = synced.unwrap();
        assert!(synced.expired && synced.pings[1].is_none(), "{synced:?}");
        assert!(took >= BOUND && took < BOUND + ms(15), "{took:?}");
    }

    #[test]
    fn a_ping_that_cannot_be_asked_expires_the_step_with_its_reason() {
        let synced = before_release(
            Form::Ping { dwell: Duration::ZERO },
            false,
            (9, 10),
            (10, 10),
            |_| Ok(()),
            |_| anyhow::bail!("the window lists no _NET_WM_PING"),
        )
        .unwrap()
        .unwrap();
        assert!(synced.expired);
        assert_eq!(synced.motions, 0);
        assert_eq!(synced.error.as_deref(), Some("the window lists no _NET_WM_PING"));
    }

    #[test]
    fn a_motion_that_fails_ends_the_step_with_its_error() {
        for form in [Form::Keepalive, Form::Ping { dwell: Duration::ZERO }] {
            let failed = before_release(
                form,
                false,
                (9, 10),
                (10, 10),
                |_| anyhow::bail!("gone"),
                |_| Ok(Some(Duration::ZERO)),
            );
            assert!(failed.is_err(), "{form:?}");
        }
    }
}
