//! Capture readiness (Design, Retention and the fixed waits): when a redirected window's offscreen pixmap holds
//! its real contents.
//!
//! After `RedirectWindow` (and whenever the pixmap is recreated: a resize, an unmap and remap) the pixmap holds
//! interim contents until the application repaints. A capture waits for the window's first damage on the new
//! pixmap followed by 10 ms with no further damage, capped at 150 ms (`--capture-wait damage`, the default), or
//! for a fixed 100 ms once per pixmap (`--capture-wait fixed`, the fallback the harness can select). A window fully
//! unobscured at the redirect needs no first damage: the server's copy of it is already complete and only an
//! application repaint can follow, so it waits for 10 ms with no damage (still capped at 150 ms). So does a window the
//! server already keeps offscreen: one that is, or lies inside, a window of another depth than its parent (an ARGB
//! window, or GTK 4's ARGB frame, on the 24-bit root), which the server shows only through a pixmap of its own
//! (Composite's implicit redirection). Its new pixmap is filled from those complete contents whatever covers it, and
//! no repaint follows: GTK 4's covered windows sent no damage after the redirect in any trial, and every such capture
//! was right (M4's T9, evidence `m4/waits/`). `--capture-wait quiet` takes every pixmap as complete, a control lane
//! that shows the first damage is needed elsewhere.
//!
//! Events are read on a connection of their own by a thread of their own, so they are consumed as they arrive
//! (the server never queues them for an engine waiting on stdin) and their times are when they happened: each
//! watched window's structure events, which renew its pixmap, and its DAMAGE reports. The Damage object is created
//! before the redirect, so no damage is missed; damage generated before the redirect took effect (an application
//! drawing on screen, the server's own copy into the new pixmap) is told apart by its sequence number against a
//! request sent on this connection after the redirect. Without the DAMAGE extension every fresh pixmap takes the
//! fixed wait; without the connection, the engine's own connection reports the structure events ([`Readiness::note`]).

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
    /// Every pixmap taken as complete: 10 ms quiet, no first damage (a measurement control only).
    QuietOnly,
}

pub const QUIET: Duration = Duration::from_millis(10);
pub const CAP: Duration = Duration::from_millis(150);
pub const FIXED: Duration = Duration::from_millis(100);

/// One pixmap's readiness: when it was created, whether the window was fully unobscured then, whether the server
/// already kept its contents offscreen ([`depth_changes`]), the last damage drawn into it, and whether a capture
/// already found it ready.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pixmap {
    pub since: Instant,
    pub unobscured: bool,
    pub offscreen: bool,
    pub last_damage: Option<Instant>,
    pub ready: bool,
}

impl Pixmap {
    pub fn fresh(since: Instant, unobscured: bool) -> Pixmap {
        Pixmap {
            since,
            unobscured,
            offscreen: false,
            last_damage: None,
            ready: false,
        }
    }
}

/// Whether the depths from a window up to the root (`[window, parent, …, root]`) change anywhere: a window of another
/// depth than its parent can be shown only from a pixmap of its own, so the server keeps it, and everything inside it,
/// offscreen and complete. A chain with no parent read is doubt: false.
pub fn depth_changes(depths: &[u8]) -> bool {
    depths.windows(2).any(|pair| pair[0] != pair[1])
}

/// [`depth_changes`] for `window`, read on `conn`; any error is doubt: false.
fn kept_offscreen(conn: &impl Connection, window: Window) -> bool {
    let mut depths = Vec::new();
    let mut current = window;
    // a window's ancestry is a handful of levels; the bound only stops a tree that changes under the walk
    for _ in 0..16 {
        let Ok(Ok(geometry)) = conn.get_geometry(current).map(|c| c.reply()) else {
            return false;
        };
        depths.push(geometry.depth);
        if current == geometry.root {
            return depth_changes(&depths);
        }
        let Ok(Ok(tree)) = conn.query_tree(current).map(|c| c.reply()) else {
            return false;
        };
        current = tree.parent;
    }
    false
}

/// Why a capture went ahead.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    /// An earlier capture already found this pixmap ready.
    Ready,
    /// Damage, then the quiet period.
    Quiet,
    /// Fully unobscured at the redirect, and the quiet period without damage, or after the last.
    Unobscured,
    /// Kept offscreen by the server before the redirect, and the quiet period without damage, or after the last.
    Offscreen,
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
            Reason::Unobscured => "unobscured",
            Reason::Offscreen => "offscreen",
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
        CaptureWait::Damage | CaptureWait::QuietOnly => {
            let cap = pixmap.since + CAP;
            // Quiet is counted from the last damage; a complete pixmap's from the pixmap itself.
            let complete = pixmap.unobscured || pixmap.offscreen || rule == CaptureWait::QuietOnly;
            let quiet_from = match (pixmap.last_damage, complete) {
                (Some(damage), _) => Some(damage),
                (None, true) => Some(pixmap.since),
                (None, false) => None,
            };
            if let Some(from) = quiet_from
                && now >= from + QUIET
            {
                return Ok(if pixmap.unobscured {
                    Reason::Unobscured
                } else if pixmap.offscreen {
                    Reason::Offscreen
                } else {
                    Reason::Quiet
                });
            }
            if now >= cap {
                return Ok(Reason::Cap);
            }
            Err(match quiet_from {
                Some(from) => (from + QUIET).min(cap),
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
    pub unobscured: bool,
    pub offscreen: bool,
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
    /// None without the DAMAGE extension.
    damage: Option<Damage>,
    size: (u16, u16),
    /// The server kept the window offscreen when its watch began ([`kept_offscreen`]).
    offscreen: bool,
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
    fn renew(&mut self, now: Instant, unobscured: bool, offscreen: bool) {
        self.pixmap = Pixmap {
            offscreen,
            ..Pixmap::fresh(now, unobscured)
        };
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
    /// The event thread is reading the event connection.
    alive: bool,
}

/// A structure event of a watched window: a resize or a remap makes its pixmap new (whatever covered it then
/// counts as doubt: the first damage is needed again); a destroyed window is dropped.
fn on_structure(state: &mut State, event: &Event, now: Instant) {
    match event {
        Event::ConfigureNotify(e) => {
            if let Some(watched) = state.windows.get_mut(&e.window)
                && (e.width, e.height) != watched.size
            {
                watched.size = (e.width, e.height);
                watched.renew(now, false, false);
                watched.passed = true;
            }
        }
        Event::MapNotify(e) => {
            if let Some(watched) = state.windows.get_mut(&e.window) {
                watched.renew(now, false, false);
                watched.passed = true;
            }
        }
        Event::DestroyNotify(e) => {
            state.windows.remove(&e.window);
        }
        _ => {}
    }
}

struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}

pub struct Readiness {
    /// The event connection; None when it is unavailable.
    conn: Option<Arc<RustConnection>>,
    /// The DAMAGE extension answered on it.
    damage: bool,
    shared: Arc<Shared>,
    pub rule: CaptureWait,
}

impl Readiness {
    pub fn connect(rule: CaptureWait) -> Readiness {
        match x11rb::connect(None) {
            Ok((conn, _)) => {
                let damage = conn
                    .damage_query_version(1, 1)
                    .map_err(anyhow::Error::from)
                    .and_then(|c| Ok(c.reply()?))
                    .context("capture readiness requires the X DAMAGE extension")
                    .is_ok();
                Readiness::over(Some(Arc::new(conn)), damage, rule)
            }
            Err(_) => Readiness::over(None, false, rule),
        }
    }

    /// Readiness over `conn` (its event thread started), with or without the DAMAGE extension.
    fn over(conn: Option<Arc<RustConnection>>, damage: bool, rule: CaptureWait) -> Readiness {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                windows: HashMap::new(),
                alive: false,
            }),
            changed: Condvar::new(),
        });
        let conn = conn.filter(|conn| {
            let (thread_conn, thread_shared) = (conn.clone(), shared.clone());
            std::thread::Builder::new()
                .name("readiness".into())
                .spawn(move || watch_events(&thread_conn, &thread_shared))
                .is_ok()
        });
        let damage = damage && conn.is_some();
        shared.state.lock().unwrap().alive = conn.is_some();
        Readiness {
            conn,
            damage,
            shared,
            rule,
        }
    }

    /// Whether the event thread reports the watched windows' structure events; when not, the engine's own
    /// connection reports them through [`Readiness::note`].
    pub fn watches_structure(&self) -> bool {
        self.conn.is_some() && self.shared.state.lock().unwrap().alive
    }

    /// Starts tracking `window` (of `size`) before it is redirected: its structure events and a Damage object.
    pub fn watch(&self, window: Window, size: (u16, u16)) -> Result<()> {
        if self.shared.state.lock().unwrap().windows.contains_key(&window) {
            return Ok(());
        }
        let mut watched = Watched {
            damage: None,
            size,
            offscreen: false,
            pixmap: Pixmap::fresh(Instant::now(), false),
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
        let aux = ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY);
        conn.change_window_attributes(window, &aux)?.check()?;
        watched.offscreen = kept_offscreen(conn.as_ref(), window);
        if !self.damage {
            self.shared.state.lock().unwrap().windows.insert(window, watched);
            return Ok(());
        }
        let damage = conn.generate_id()?;
        watched.damage = Some(damage);
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
    /// generates after a request sent now counts. `unobscured`: the window was fully unobscured at the redirect; a
    /// window the server kept offscreen when its watch began counts as complete too.
    pub fn redirected(&self, window: Window, unobscured: bool) -> Result<()> {
        let barrier = match (&self.conn, self.damage) {
            (Some(conn), true) => {
                let cookie = conn.get_input_focus()?;
                let barrier = cookie.sequence_number() as u16;
                cookie.reply()?;
                Some(barrier)
            }
            _ => None,
        };
        let now = Instant::now();
        let mut state = self.shared.state.lock().unwrap();
        if let Some(watched) = state.windows.get_mut(&window) {
            let offscreen = watched.offscreen;
            watched.renew(now, unobscured, offscreen);
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

    /// A structure event read on the engine's own connection, for when the event thread does not report them.
    pub fn note(&self, event: &Event) {
        if self.watches_structure() {
            return;
        }
        on_structure(&mut self.shared.state.lock().unwrap(), event, Instant::now());
        self.shared.changed.notify_all();
    }

    /// Stops tracking `window` (its redirection ended with the request).
    pub fn forget(&self, window: Window) {
        let removed = self.shared.state.lock().unwrap().windows.remove(&window);
        if let (
            Some(Watched {
                damage: Some(damage), ..
            }),
            Some(conn),
        ) = (removed, &self.conn)
        {
            let _ = conn.damage_destroy(damage);
            let _ = conn.flush();
        }
    }

    /// Waits until a capture of `window` may go ahead, and says how long that took and why.
    pub fn wait(&self, window: Window) -> Waited {
        let started = Instant::now();
        let mut state = self.shared.state.lock().unwrap();
        loop {
            // Without damage reports the fixed wait is all that is left.
            let rule = if self.damage && state.alive {
                self.rule
            } else {
                CaptureWait::Fixed
            };
            let Some(watched) = state.windows.get_mut(&window) else {
                return Waited {
                    waited: started.elapsed(),
                    reason: Reason::Unwatched,
                    unobscured: false,
                    offscreen: false,
                    ignored: 0,
                    counted: 0,
                    first: None,
                };
            };
            let now = Instant::now();
            match verdict(rule, &watched.pixmap, now) {
                Ok(reason) => {
                    watched.pixmap.ready = true;
                    return Waited {
                        waited: started.elapsed(),
                        reason,
                        unobscured: watched.pixmap.unobscured,
                        offscreen: watched.pixmap.offscreen,
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
/// stamps the window's pixmap; structure events go to [`on_structure`].
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
        match &event {
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
            other => on_structure(&mut state, other, now),
        }
        drop(state);
        shared.changed.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use x11rb::protocol::xproto::{ConfigureNotifyEvent, MapNotifyEvent};

    const MS: Duration = Duration::from_millis(1);

    #[test]
    fn a_pixmap_is_ready_after_damage_and_ten_quiet_milliseconds() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0, false);
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
    fn an_unobscured_window_needs_no_first_damage() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0, true);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 5 * MS), Err(t0 + QUIET));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 10 * MS), Ok(Reason::Unobscured));
        // a repaint after the redirect restarts the quiet period, still capped
        p.last_damage = Some(t0 + 8 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 10 * MS), Err(t0 + 18 * MS));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 18 * MS), Ok(Reason::Unobscured));
        p.last_damage = Some(t0 + 149 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 150 * MS), Ok(Reason::Cap));
        // the fixed fallback ignores it
        p.last_damage = None;
        assert_eq!(verdict(CaptureWait::Fixed, &p, t0 + 10 * MS), Err(t0 + FIXED));
    }

    #[test]
    fn a_window_the_server_kept_offscreen_needs_no_first_damage() {
        let t0 = Instant::now();
        let mut p = Pixmap {
            offscreen: true,
            ..Pixmap::fresh(t0, false)
        };
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 5 * MS), Err(t0 + QUIET));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 10 * MS), Ok(Reason::Offscreen));
        // a repaint after the redirect restarts the quiet period, still capped
        p.last_damage = Some(t0 + 8 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 10 * MS), Err(t0 + 18 * MS));
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 18 * MS), Ok(Reason::Offscreen));
        p.last_damage = Some(t0 + 149 * MS);
        assert_eq!(verdict(CaptureWait::Damage, &p, t0 + 150 * MS), Ok(Reason::Cap));
    }

    #[test]
    fn a_depth_change_on_the_way_to_the_root_is_a_window_the_server_keeps_offscreen() {
        assert!(
            depth_changes(&[32, 32, 24]),
            "GTK 4 under Openbox: its ARGB frame on the 24-bit root"
        );
        assert!(depth_changes(&[32, 24]), "an ARGB top-level");
        assert!(depth_changes(&[24, 32, 24]), "a 24-bit window inside an ARGB frame");
        assert!(
            !depth_changes(&[24, 24, 24]),
            "one depth all the way: the screen shows it"
        );
        assert!(!depth_changes(&[24]), "no ancestry read: doubt");
        assert!(!depth_changes(&[]));
    }

    #[test]
    fn the_quiet_only_control_takes_every_pixmap_as_complete() {
        let t0 = Instant::now();
        let p = Pixmap::fresh(t0, false);
        assert_eq!(verdict(CaptureWait::QuietOnly, &p, t0 + 5 * MS), Err(t0 + QUIET));
        assert_eq!(verdict(CaptureWait::QuietOnly, &p, t0 + 10 * MS), Ok(Reason::Quiet));
        assert_eq!(
            verdict(CaptureWait::Damage, &p, t0 + 10 * MS),
            Err(t0 + CAP),
            "the shipped rule still waits for a first damage"
        );
    }

    #[test]
    fn the_wait_is_capped_at_150_ms() {
        let t0 = Instant::now();
        let mut p = Pixmap::fresh(t0, false);
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
        let mut p = Pixmap::fresh(t0, false);
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

    fn configure(window: Window, width: u16, height: u16) -> Event {
        Event::ConfigureNotify(ConfigureNotifyEvent {
            window,
            event: window,
            width,
            height,
            ..Default::default()
        })
    }

    /// Without an event connection, the engine's own connection's structure events renew the pixmap: each new
    /// pixmap takes the fixed wait again (review round 1).
    #[test]
    fn without_the_event_connection_a_resize_or_remap_renews_the_fallback_wait() {
        let readiness = Readiness::over(None, false, CaptureWait::Damage);
        assert!(!readiness.watches_structure());
        readiness.watch(7, (40, 40)).unwrap();
        readiness.redirected(7, true).unwrap();
        let first = readiness.wait(7);
        assert_eq!(
            first.reason,
            Reason::Fixed,
            "no damage reports: the fixed wait, unobscured or not"
        );
        assert!(first.waited >= FIXED - MS);
        assert_eq!(readiness.wait(7).reason, Reason::Ready);
        // a move is no new pixmap; a resize is
        readiness.note(&configure(7, 40, 40));
        assert_eq!(readiness.wait(7).reason, Reason::Ready);
        readiness.note(&configure(7, 60, 60));
        let resized = readiness.wait(7);
        assert_eq!(resized.reason, Reason::Fixed);
        assert!(resized.waited >= FIXED - MS);
        readiness.note(&Event::MapNotify(MapNotifyEvent {
            window: 7,
            event: 7,
            ..Default::default()
        }));
        assert_eq!(readiness.wait(7).reason, Reason::Fixed);
        readiness.forget(7);
        assert_eq!(readiness.wait(7).reason, Reason::Unwatched);
    }

    /// The reviewer's live case: an event connection without DAMAGE still renews per pixmap. Needs an X display
    /// with Composite (`--features live`, on the VM or under `xvfb-run`).
    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn without_damage_the_event_connection_renews_after_resize_and_remap() {
        use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
        use x11rb::protocol::xproto::{ConfigureWindowAux, CreateWindowAux, WindowClass};
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        let window = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new().override_redirect(1).background_pixel(0);
        conn.create_window(0, window, root, 0, 0, 40, 40, 0, WindowClass::INPUT_OUTPUT, 0, &aux)
            .unwrap()
            .check()
            .unwrap();
        conn.map_window(window).unwrap().check().unwrap();
        conn.composite_query_version(0, 4).unwrap().reply().unwrap();
        let (events, _) = x11rb::connect(None).unwrap();
        let readiness = Readiness::over(Some(Arc::new(events)), false, CaptureWait::Damage);
        assert!(readiness.watches_structure());
        readiness.watch(window, (40, 40)).unwrap();
        conn.composite_redirect_window(window, Redirect::AUTOMATIC)
            .unwrap()
            .check()
            .unwrap();
        readiness.redirected(window, false).unwrap();
        let first = readiness.wait(window);
        let settle = || std::thread::sleep(Duration::from_millis(50));
        conn.configure_window(window, &ConfigureWindowAux::new().width(60).height(60))
            .unwrap()
            .check()
            .unwrap();
        settle();
        let resized = readiness.wait(window);
        conn.unmap_window(window).unwrap().check().unwrap();
        conn.map_window(window).unwrap().check().unwrap();
        settle();
        let remapped = readiness.wait(window);
        conn.destroy_window(window).unwrap().check().unwrap();
        assert_eq!(first.reason, Reason::Fixed);
        assert_eq!(
            resized.reason,
            Reason::Fixed,
            "a new pixmap takes the fallback wait again"
        );
        assert_eq!(
            remapped.reason,
            Reason::Fixed,
            "a remapped pixmap takes the fallback wait again"
        );
    }

    /// GTK 4's case without GTK 4 (task 64): a window the server keeps offscreen (ARGB, so of another depth than the
    /// 24-bit root) under a window that covers it is captured as itself after 10 ms of quiet, with no first damage,
    /// while a 24-bit window covered the same way still waits for its own. Needs an X display with Composite and a
    /// 32-bit visual (`--features live`; Xvfb has both).
    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_covered_window_the_server_keeps_offscreen_is_captured_as_itself_without_a_first_damage() {
        use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
        use x11rb::protocol::xproto::{ColormapAlloc, CreateWindowAux, ImageFormat, VisualClass, WindowClass};
        use x11rb::wrapper::ConnectionExt as _;
        let (conn, screen) = x11rb::connect(None).unwrap();
        let setup = conn.setup();
        let (root, root_depth, root_visual) = {
            let s = &setup.roots[screen];
            (s.root, s.root_depth, s.root_visual)
        };
        assert_eq!(root_depth, 24, "a 24-bit screen, as the VM's and the gate's");
        let argb = setup.roots[screen]
            .allowed_depths
            .iter()
            .find(|d| d.depth == 32)
            .and_then(|d| d.visuals.iter().find(|v| v.class == VisualClass::TRUE_COLOR))
            .expect("a 32-bit TrueColor visual (Composite's)")
            .visual_id;
        conn.composite_query_version(0, 4).unwrap().reply().unwrap();
        let window = |depth: u8, visual: u32, pixel: u32| {
            let id = conn.generate_id().unwrap();
            let mut aux = CreateWindowAux::new()
                .override_redirect(1)
                .background_pixel(pixel)
                .border_pixel(0);
            if depth == 32 {
                let colormap = conn.generate_id().unwrap();
                conn.create_colormap(ColormapAlloc::NONE, colormap, root, visual)
                    .unwrap();
                aux = aux.colormap(colormap);
            }
            conn.create_window(
                depth,
                id,
                root,
                0,
                0,
                60,
                40,
                0,
                WindowClass::INPUT_OUTPUT,
                visual,
                &aux,
            )
            .unwrap()
            .check()
            .unwrap();
            conn.map_window(id).unwrap().check().unwrap();
            id
        };
        let green = window(32, argb, 0xff00_ff00);
        let plain = window(root_depth, root_visual, 0x0000_00ff);
        let cover = window(root_depth, root_visual, 0x00ff_0000);
        conn.sync().unwrap();
        std::thread::sleep(Duration::from_millis(50));
        let readiness = Readiness::connect(CaptureWait::Damage);
        let capture = |w: Window| {
            readiness.watch(w, (60, 40)).unwrap();
            conn.composite_redirect_window(w, Redirect::AUTOMATIC)
                .unwrap()
                .check()
                .unwrap();
            readiness.redirected(w, false).unwrap();
            let waited = readiness.wait(w);
            let image = conn
                .get_image(ImageFormat::Z_PIXMAP, w, 0, 0, 60, 40, !0)
                .unwrap()
                .reply()
                .unwrap();
            (waited, image.data)
        };
        let (offscreen, pixels) = capture(green);
        let (covered, _) = capture(plain);
        for id in [green, plain, cover] {
            conn.destroy_window(id).unwrap();
        }
        conn.sync().unwrap();
        assert_eq!(offscreen.reason, Reason::Offscreen, "{offscreen:?}");
        assert!(offscreen.waited < Duration::from_millis(100), "{offscreen:?}");
        // B, G, R, A in each 32-bit pixel: green, not the red window over it
        assert!(pixels.chunks(4).all(|p| p[..3] == [0, 0xff, 0]), "captured as itself");
        assert_ne!(covered.reason, Reason::Offscreen, "{covered:?}");
    }
}
