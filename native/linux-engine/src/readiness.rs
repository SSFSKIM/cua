//! Capture readiness (Design, Retention and the fixed waits): when a redirected window's offscreen pixmap holds
//! its real contents.
//!
//! After `RedirectWindow` (and whenever the pixmap is recreated: a resize, an unmap and remap) the pixmap holds
//! interim contents until the application repaints. A capture waits for the window's first damage on the new
//! pixmap followed by 10 ms with no further damage, capped at 150 ms (`--capture-wait damage`, the default), or
//! for a fixed 100 ms once per pixmap (`--capture-wait fixed`, the fallback the harness can select).
//!
//! The DAMAGE events are read on a connection of their own by a thread of their own, so they are consumed as
//! they arrive (the server never queues them for an engine waiting on stdin) and their times are when they
//! happened. The Damage object is created before the redirect, so no damage is missed; damage generated before
//! the redirect took effect (an application drawing on screen, the server's own copy into the new pixmap) is told
//! apart by its sequence number against a request sent on this connection after the redirect. Without that
//! connection or the DAMAGE extension, every capture of a fresh pixmap takes the fixed wait.

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::damage::{ConnectionExt as _, Damage, ReportLevel};
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask, Window};
use x11rb::rust_connection::RustConnection;

/// How a capture waits for a fresh pixmap.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureWait {
    /// The first damage, then 10 ms quiet, capped at 150 ms.
    Damage,
    /// 100 ms once per pixmap.
    Fixed,
}

pub const QUIET: Duration = Duration::from_millis(10);
pub const CAP: Duration = Duration::from_millis(150);
pub const FIXED: Duration = Duration::from_millis(100);

/// One pixmap's readiness: when it was created, the last damage drawn into it, and whether a capture already
/// found it ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pixmap {
    pub since: Instant,
    pub last_damage: Option<Instant>,
    pub ready: bool,
}

impl Pixmap {
    pub fn fresh(since: Instant) -> Pixmap {
        Pixmap {
            since,
            last_damage: None,
            ready: false,
        }
    }
}

/// Why a capture went ahead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    /// An earlier capture already found this pixmap ready.
    Ready,
    /// Damage, then the quiet period.
    Quiet,
    /// No quiet period within the cap.
    Cap,
    /// The fixed wait.
    Fixed,
    /// The window is not redirected by this engine: nothing to wait for.
    Unwatched,
}

impl Reason {
    pub fn name(self) -> &'static str {
        match self {
            Reason::Ready => "ready",
            Reason::Quiet => "quiet",
            Reason::Cap => "cap",
            Reason::Fixed => "fixed",
            Reason::Unwatched => "unwatched",
        }
    }
}

/// Whether a capture of `pixmap` may go ahead at `now`, or the moment to look again.
pub fn verdict(rule: CaptureWait, pixmap: &Pixmap, now: Instant) -> Result<Reason, Instant> {
    if pixmap.ready {
        return Ok(Reason::Ready);
    }
    match rule {
        CaptureWait::Fixed => {
            let until = pixmap.since + FIXED;
            if now >= until { Ok(Reason::Fixed) } else { Err(until) }
        }
        CaptureWait::Damage => {
            let cap = pixmap.since + CAP;
            if let Some(damage) = pixmap.last_damage
                && now >= damage + QUIET
            {
                return Ok(Reason::Quiet);
            }
            if now >= cap {
                return Ok(Reason::Cap);
            }
            Err(match pixmap.last_damage {
                Some(damage) => (damage + QUIET).min(cap),
                None => cap,
            })
        }
    }
}

/// What a capture's wait saw, for `--stats`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Waited {
    pub waited: Duration,
    pub reason: Reason,
    /// Damage reports from before the redirect took effect, which did not count.
    pub ignored: u32,
    /// Damage reports on the new pixmap, and the first one's time after the pixmap was made.
    pub counted: u32,
    pub first: Option<Duration>,
}

/// Whether wire sequence `seq` comes at or after `barrier` (16-bit sequence numbers, compared near each other).
pub fn at_or_after(seq: u16, barrier: u16) -> bool {
    (seq.wrapping_sub(barrier) as i16) >= 0
}

struct Watched {
    damage: Damage,
    size: (u16, u16),
    pixmap: Pixmap,
    /// Damage counts toward readiness only from this request's sequence on; None until the redirect is known to
    /// have taken effect, with the damage seen meanwhile kept by sequence.
    barrier: Option<u16>,
    passed: bool,
    early: Vec<(u16, Instant)>,
    ignored: u32,
    counted: u32,
    first: Option<Instant>,
}

impl Watched {
    fn renew(&mut self, now: Instant) {
        self.pixmap = Pixmap::fresh(now);
        self.ignored = 0;
        self.counted = 0;
        self.first = None;
    }

    fn count(&mut self, at: Instant) {
        self.pixmap.last_damage = Some(at);
        self.counted += 1;
        self.first.get_or_insert(at);
    }
}

struct State {
    windows: HashMap<Window, Watched>,
    alive: bool,
}

struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}

pub struct Readiness {
    /// The event connection; None when it or the DAMAGE extension is unavailable.
    conn: Option<Arc<RustConnection>>,
    shared: Arc<Shared>,
    pub rule: CaptureWait,
}

/// The event connection, with the DAMAGE extension initialized.
fn damage_connection() -> Result<RustConnection> {
    let (conn, _) = x11rb::connect(None).context("failed to connect to the X server")?;
    conn.damage_query_version(1, 1)
        .map_err(anyhow::Error::from)
        .and_then(|c| Ok(c.reply()?))
        .context("capture readiness requires the X DAMAGE extension")?;
    Ok(conn)
}

impl Readiness {
    pub fn connect(rule: CaptureWait) -> Readiness {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                windows: HashMap::new(),
                alive: false,
            }),
            changed: Condvar::new(),
        });
        let conn = damage_connection().ok().map(Arc::new).filter(|conn| {
            let (thread_conn, thread_shared) = (conn.clone(), shared.clone());
            std::thread::Builder::new()
                .name("readiness".into())
                .spawn(move || watch_events(&thread_conn, &thread_shared))
                .is_ok()
        });
        shared.state.lock().unwrap().alive = conn.is_some();
        Readiness { conn, shared, rule }
    }

    /// Starts tracking `window` before it is redirected: its structure events and a Damage object.
    pub fn watch(&self, window: Window) -> Result<()> {
        if self.shared.state.lock().unwrap().windows.contains_key(&window) {
            return Ok(());
        }
        let mut watched = Watched {
            damage: x11rb::NONE,
            size: (0, 0),
            pixmap: Pixmap::fresh(Instant::now()),
            barrier: None,
            passed: false,
            early: Vec::new(),
            ignored: 0,
            counted: 0,
            first: None,
        };
        let Some(conn) = &self.conn else {
            self.shared.state.lock().unwrap().windows.insert(window, watched);
            return Ok(());
        };
        let geometry = conn.get_geometry(window)?.reply()?;
        let aux = ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY);
        conn.change_window_attributes(window, &aux)?.check()?;
        let damage = conn.generate_id()?;
        watched.damage = damage;
        watched.size = (geometry.width, geometry.height);
        self.shared.state.lock().unwrap().windows.insert(window, watched);
        let created = conn
            .damage_create(damage, window, ReportLevel::NON_EMPTY)
            .map_err(anyhow::Error::from)
            .and_then(|c| Ok(c.check()?));
        if let Err(error) = created {
            self.shared.state.lock().unwrap().windows.remove(&window);
            return Err(error);
        }
        Ok(())
    }

    /// The redirect of `window` has taken effect: its pixmap is new from here, and only damage the server
    /// generates after a request sent now counts.
    pub fn redirected(&self, window: Window) -> Result<()> {
        let barrier = match &self.conn {
            Some(conn) => {
                let cookie = conn.get_input_focus()?;
                let barrier = cookie.sequence_number() as u16;
                cookie.reply()?;
                Some(barrier)
            }
            None => None,
        };
        let now = Instant::now();
        let mut state = self.shared.state.lock().unwrap();
        if let Some(watched) = state.windows.get_mut(&window) {
            watched.renew(now);
            watched.barrier = barrier;
            watched.passed = false;
            for (seq, at) in std::mem::take(&mut watched.early) {
                if barrier.is_some_and(|b| at_or_after(seq, b)) {
                    watched.passed = true;
                    watched.count(at);
                } else {
                    watched.ignored += 1;
                }
            }
        }
        self.shared.changed.notify_all();
        Ok(())
    }

    /// Stops tracking `window` (its redirection ended with the request).
    pub fn forget(&self, window: Window) {
        let removed = self.shared.state.lock().unwrap().windows.remove(&window);
        if let (Some(watched), Some(conn)) = (removed, &self.conn) {
            let _ = conn.damage_destroy(watched.damage);
            let _ = conn.flush();
        }
    }

    /// Waits until a capture of `window` may go ahead, and says how long that took and why.
    pub fn wait(&self, window: Window) -> Waited {
        let started = Instant::now();
        let mut state = self.shared.state.lock().unwrap();
        loop {
            let alive = state.alive;
            let Some(watched) = state.windows.get_mut(&window) else {
                return Waited {
                    waited: started.elapsed(),
                    reason: Reason::Unwatched,
                    ignored: 0,
                    counted: 0,
                    first: None,
                };
            };
            // Without the event thread, nothing reports damage: the fixed wait is all that is left.
            let rule = if alive { self.rule } else { CaptureWait::Fixed };
            let now = Instant::now();
            match verdict(rule, &watched.pixmap, now) {
                Ok(reason) => {
                    watched.pixmap.ready = true;
                    return Waited {
                        waited: started.elapsed(),
                        reason,
                        ignored: watched.ignored,
                        counted: watched.counted,
                        first: watched.first.map(|f| f.saturating_duration_since(watched.pixmap.since)),
                    };
                }
                Err(until) => {
                    state = self.shared.changed.wait_timeout(state, until - now).unwrap().0;
                }
            }
        }
    }
}

/// The event thread: damage re-arms its Damage object at once (a NonEmpty report comes once per subtract) and
/// stamps the window's pixmap; a resize or a remap makes the pixmap new; a destroyed window is dropped.
fn watch_events(conn: &RustConnection, shared: &Shared) {
    loop {
        let event = match conn.wait_for_event() {
            Ok(event) => event,
            Err(_) => {
                shared.state.lock().unwrap().alive = false;
                shared.changed.notify_all();
                return;
            }
        };
        let now = Instant::now();
        let mut state = shared.state.lock().unwrap();
        match event {
            Event::DamageNotify(e) => {
                let _ = conn.damage_subtract(e.damage, x11rb::NONE, x11rb::NONE);
                let _ = conn.flush();
                if let Some(watched) = state.windows.get_mut(&e.drawable) {
                    match watched.barrier {
                        None => {
                            if watched.early.len() == 64 {
                                watched.early.remove(0);
                            }
                            watched.early.push((e.sequence, now));
                        }
                        Some(barrier) => {
                            if watched.passed || at_or_after(e.sequence, barrier) {
                                watched.passed = true;
                                watched.count(now);
                            } else {
                                watched.ignored += 1;
                            }
                        }
                    }
                }
            }
            Event::ConfigureNotify(e) => {
                if let Some(watched) = state.windows.get_mut(&e.window)
                    && (e.width, e.height) != watched.size
                {
                    watched.size = (e.width, e.height);
                    watched.renew(now);
                    watched.passed = true;
                }
            }
            Event::MapNotify(e) => {
                if let Some(watched) = state.windows.get_mut(&e.window) {
                    watched.renew(now);
                    watched.passed = true;
                }
            }
            Event::DestroyNotify(e) => {
                state.windows.remove(&e.window);
            }
            _ => {}
        }
        drop(state);
        shared.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: Duration = Duration::from_millis(1);

    #[test]
    fn a_pixmap_is_ready_after_damage_and_ten_quiet_milliseconds() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0);
        assert_eq!(
            verdict(CaptureWait::Damage, &p, t0),
            Err(t0 + CAP),
            "no damage yet: wait for the cap"
        );
        p.last_damage = Some(t0 + 12 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 15 * MS), Err(t0 + 22 * MS));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 22 * MS), Ok(Reason::Quiet));
        // more damage restarts the quiet period
        p.last_damage = Some(t0 + 21 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 22 * MS), Err(t0 + 31 * MS));
    }

    #[test]
    fn the_wait_is_capped_at_150_ms() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 150 * MS), Ok(Reason::Cap));
        // a window that keeps drawing never goes quiet
        p.last_damage = Some(t0 + 145 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 146 * MS), Err(t0 + CAP));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 150 * MS), Ok(Reason::Cap));
        // a pixmap made long ago and quiet since is ready at once
        p.last_damage = Some(t0 + 3 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 2000 * MS), Ok(Reason::Quiet));
    }

    #[test]
    fn the_fixed_fallback_waits_100_ms_once_per_pixmap() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0);
        p.last_damage = Some(t0 + MS);
        assert_eq!(
            verdict(CaptureWait::Fixed, &p, t0 + 50 * MS),
            Err(t0 + FIXED),
            "damage does not matter"
        );
        assert_eq!(verdict(CaptureWait::Fixed, &p, t0 + 100 * MS), Ok(Reason::Fixed));
        p.ready = true;
        assert_eq!(verdict(CaptureWait::Fixed, &p, t0), Ok(Reason::Ready));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0), Ok(Reason::Ready));
    }

    #[test]
    fn sequence_numbers_compare_across_the_wrap() {
        assert!(at_or_after(10, 10));
        assert!(at_or_after(11, 10));
        assert!(!at_or_after(9, 10));
        assert!(at_or_after(3, 65530), "after the wrap");
        assert!(!at_or_after(65530, 3), "before the wrap");
    }
}
