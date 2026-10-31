//! A drag that becomes a drag and drop (#171 M3.1; Plan of Work, M3, "Open, decided on measurement"): an XDND source
//! takes the `XdndSelection` selection when its drag and drop starts, so a background-route drag into a window whose
//! family's drop changes the desktop (`families.rs`: Chrome activates, focuses and raises its window on a drop) watches
//! that selection through XFixes from the drag's start; a take by the target's own X client (its windows share the
//! resource-id base, as the paste route attributes its requests) means a drag and drop began. In shared mode the answer
//! follows the order of what the engine saw and sent ([`Outcome`], the design session's rulings of 2026-10-31): a take
//! seen before the release is cancelled before the drop (Escape on the background route, then the release), so nothing
//! was dropped; no take by the release is a plain drag, answered at once, while [`LateWatch`] goes on off the request
//! path through `SETTLE`, cancels a late take at once and has the next request report it ([`late_notice`]); anything the
//! order cannot tell gets the answer that the drop cannot be confirmed. The drop's signature (the window newly active, focused or on top) cross-checks an in-time cancel where it
//! can see a change. A window already active, focused and fully unobscured is not watched: its drop changes nothing the
//! person sees.

use std::time::{Duration, Instant};

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
use x11rb::protocol::xproto::Window;

use crate::x11::X11;

/// How long after an in-time cancel the drop's signature is looked for, and how long after a drag's release the
/// after-release watch still looks for a late take of `XdndSelection` (off the request path): Chrome's activation follows
/// its drop within milliseconds (M3.1's late-cancel runs measured it).
pub const SETTLE: Duration = Duration::from_millis(300);
const SETTLE_POLL: Duration = Duration::from_millis(10);

/// The refusal of a drag cancelled before its drop, naming the application (`list_windows`' `app`).
pub fn cancelled(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was \
         dropped. Use a dedicated desktop, or activate the window first"
    )
}

/// The answer when the cancel came too late: the take was seen only after the release, or the drop's signature showed.
pub fn may_have_dropped(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop may \
         have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
    )
}

/// The answer when a drag and drop began and the order of events cannot tell whether the cancel came in time.
pub fn cannot_confirm(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop; it was cancelled, but whether the drop landed cannot \
         be confirmed. Use a dedicated desktop, or activate the window first"
    )
}

/// What the order of a watched drag's events says about its drop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// The target's client took `XdndSelection` before the release, and Escape went out before the release: cancelled
    /// in time.
    InTime,
    /// The measurement option that holds the Escape (`--dnd-cancel-after-release`): the take was seen before the
    /// release and the Escape followed the release, so the drop may have happened.
    Late,
    /// No take seen by the release: a plain drag, answered at once; a late take is the after-release watch's to report.
    NoStart,
    /// A take was seen and the cancel's own sends failed before the release went out, so the order cannot tell.
    Undecided,
}

impl Outcome {
    pub fn name(self) -> &'static str {
        match self {
            Outcome::InTime => "in_time",
            Outcome::Late => "late",
            Outcome::NoStart => "no_start",
            Outcome::Undecided => "undecided",
        }
    }
}

/// The answer to a watched drag: None for success (no drag and drop began), else the sentence it is refused with.
/// `signature` is whether the drop's signature showed after an in-time cancel, the cross-check.
pub fn answer(outcome: Outcome, signature: bool, app: &str) -> Option<String> {
    match outcome {
        Outcome::NoStart => None,
        Outcome::InTime if !signature => Some(cancelled(app)),
        Outcome::InTime | Outcome::Late => Some(may_have_dropped(app)),
        Outcome::Undecided => Some(cannot_confirm(app)),
    }
}

/// What a drop changes in a window's standing on the desktop: whether it is the active window, holds the X input
/// focus, and is on top of the stacking order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Standing {
    pub active: bool,
    pub focused: bool,
    pub top: bool,
}

impl Standing {
    /// Whether `after` shows the drop's signature against `self`: the window became active, focused or on top.
    pub fn changed_to(self, after: Standing) -> bool {
        (after.active && !self.active) || (after.focused && !self.focused) || (after.top && !self.top)
    }

    /// Whether any part of the signature already holds, so a drop could not show it.
    pub fn any(self) -> bool {
        self.active || self.focused || self.top
    }
}

/// Whether the drop's signature shows within `SETTLE` after a cancel, read through `now`.
pub fn signature_within(before: Standing, mut now: impl FnMut() -> Standing) -> (bool, Duration) {
    let started = Instant::now();
    loop {
        if before.changed_to(now()) {
            return (true, started.elapsed());
        }
        if started.elapsed() >= SETTLE {
            return (false, started.elapsed());
        }
        std::thread::sleep(SETTLE_POLL);
    }
}

/// Whether a new owner of `XdndSelection` is the target's X client: the same resource-id base.
pub fn taken_by_target(owner: Window, target: Window, resource_id_mask: u32) -> bool {
    owner != x11rb::NONE && (owner & !resource_id_mask) == (target & !resource_id_mask)
}

/// The watch on `XdndSelection` for one drag. It owns the selection's reports while it runs: whatever else reads the
/// connection's events meanwhile (the server-time probe, the input session) keeps them for it
/// (`X11::take_selection_reports`).
pub struct DndWatch {
    selection: u32,
    target: Window,
    mask: u32,
    started: bool,
}

impl DndWatch {
    pub fn start(x: &mut X11, target: Window) -> Result<DndWatch> {
        x.ensure_xfixes()?;
        let selection = x.atom("XdndSelection");
        x.keep_selection_reports();
        x.conn
            .xfixes_select_selection_input(x.root, selection, SelectionEventMask::SET_SELECTION_OWNER)?
            .check()?;
        Ok(DndWatch {
            selection,
            target,
            mask: x.conn.setup().resource_id_mask,
            started: false,
        })
    }

    /// Whether the target has begun a drag and drop, from the reports that have arrived so far.
    pub fn started(&mut self, x: &mut X11) -> bool {
        for report in x.take_selection_reports() {
            if report.selection == self.selection {
                self.started |= taken_by_target(report.owner, self.target, self.mask);
            }
        }
        self.started
    }

    /// Whether a drag and drop was seen to start.
    pub fn is_started(&self) -> bool {
        self.started
    }

    /// The watch ended: the selection no longer watched, its reports no longer kept.
    pub fn stop(self, x: &mut X11) {
        let _ = x
            .conn
            .xfixes_select_selection_input(x.root, self.selection, SelectionEventMask::default());
        let _ = x.conn.flush();
        x.stop_selection_reports();
    }
}

/// The notice an acting request answers when a drag and drop began after a drag's release (the design session's
/// rulings, 2026-10-31): the request is not run, as a paste refused for an earlier unconfirmed one is not
/// (`paste::previous_unconfirmed`), so the agent reads the desktop before it acts again.
pub fn late_notice(app: &str) -> String {
    format!(
        "{app} started a drag and drop after your drag ended; it may have dropped and changed the desktop; this request \
         was not run, so read the window before sending it again"
    )
}

/// The notice an acting request answers when the after-release watch itself failed: nothing says whether a drag and
/// drop began, so it may have dropped unseen.
pub fn watch_failed_notice(app: &str, why: &str) -> String {
    format!(
        "the drag-and-drop watch after your drag into {app} failed ({why}), so a drop may have happened unseen and \
         changed the desktop; this request was not run, so read the window before sending it again"
    )
}

/// A drag and drop that began after the drag's release, as the after-release watch saw it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LateDrop {
    /// How long after the release the watch saw the take (zero for a take it held from before the release).
    pub after_release: Duration,
    /// How long after the release the cancel's Escape went out.
    pub escape_after_release: Duration,
    /// Whether the cancel's Escape went out.
    pub escaped: bool,
}

/// How the after-release watch ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEnd {
    /// No take by the target's client while it watched: nothing to report.
    Quiet,
    /// A take after the release: cancelled at once, to be reported.
    Late(LateDrop),
    /// The watch could not keep watching (its connection failed, a round trip failed, the thread panicked): whether a
    /// drag and drop began cannot be told.
    Failed(String),
}

enum Note {
    /// The drag's button was released, at `at`, with no take seen by the engine: watch on, off the request path,
    /// through `SETTLE` from `at`, and cancel a take at once.
    Released { at: Instant },
    /// The drag ended otherwise (a take seen before the release, an error): nothing more to watch.
    Done,
    /// An acting request has come, or the engine ends: look one last time and end.
    Stop,
}

/// The after-release watch of one guarded drag: its own X connection, subscribed to `XdndSelection` before the drag
/// begins, so no take between the drag's last look and the watch can go unseen. While the drag runs it only records;
/// once told of the release (the instant the button went up), a take by the target's client is cancelled at once
/// (Escape, synthetic, to the target window: the background route, never XTEST), and the watch ends at `SETTLE` after
/// the release, at an acting request, or at the engine's end. Its end ([`WatchEnd`]) is the engine's to report.
pub struct LateWatch {
    notes: std::sync::mpsc::Sender<Note>,
    thread: Option<std::thread::JoinHandle<WatchEnd>>,
    /// The application the reports name, set once the drag hands the watch over.
    pub app: String,
}

impl LateWatch {
    /// Started and subscribed, or the reason it could not be.
    pub fn start(target: Window, escape: u8) -> Result<LateWatch> {
        let (notes, inbox) = std::sync::mpsc::channel();
        let (ready, subscribed) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || watch_after_release(target, escape, inbox, ready));
        match subscribed.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => Ok(LateWatch {
                notes,
                thread: Some(thread),
                app: String::new(),
            }),
            Ok(Err(error)) => Err(anyhow::anyhow!("the drag-and-drop watch could not start: {error}")),
            Err(_) => Err(anyhow::anyhow!("the drag-and-drop watch did not start")),
        }
    }

    /// The drag's button went up at `at` with no take seen: from now a take is cancelled at once.
    pub fn released(&self, at: Instant) {
        let _ = self.notes.send(Note::Released { at });
    }

    /// Handed over to the engine once the drag's route is cleaned up, naming the application for its reports.
    pub fn handed_over(mut self, app: String) -> LateWatch {
        self.app = app;
        self
    }

    /// Nothing more to watch.
    pub fn done(mut self) {
        let _ = self.notes.send(Note::Done);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }

    /// Whether the watch has ended by itself (its settle over, a take cancelled, a failure).
    pub fn finished(&self) -> bool {
        self.thread.as_ref().is_none_or(|t| t.is_finished())
    }

    /// One last look (a round trip, so every take before now is counted), then how the watch ended; a thread that
    /// panicked is a failed watch.
    pub fn stop(mut self) -> WatchEnd {
        let _ = self.notes.send(Note::Stop);
        match self.thread.take().map(|t| t.join()) {
            Some(Ok(end)) => end,
            Some(Err(_)) => WatchEnd::Failed("the watch's thread panicked".into()),
            None => WatchEnd::Quiet,
        }
    }

    /// A watch around a thread of the caller's (unit tests of the join).
    #[cfg(test)]
    fn around(thread: std::thread::JoinHandle<WatchEnd>) -> LateWatch {
        LateWatch {
            notes: std::sync::mpsc::channel().0,
            thread: Some(thread),
            app: "app".into(),
        }
    }
}

impl Drop for LateWatch {
    fn drop(&mut self) {
        if let Some(thread) = self.thread.take() {
            let _ = self.notes.send(Note::Stop);
            let _ = thread.join();
        }
    }
}

const LATE_POLL: Duration = Duration::from_millis(2);

/// The watch's loop, apart from its connection: `on_release` runs when the release is known (the live tests' fault
/// injection), `look` reads the reports so far (a take's server time, or an error),
/// `sync` makes a round trip, `cancel` sends the Escape stamped with the take's time and says whether it went out.
fn watch_loop(
    inbox: &std::sync::mpsc::Receiver<Note>,
    mut on_release: impl FnMut(),
    mut look: impl FnMut() -> Result<Option<u32>>,
    mut sync: impl FnMut() -> Result<()>,
    mut cancel: impl FnMut(u32) -> bool,
) -> WatchEnd {
    let mut taken: Option<(u32, Instant)> = None;
    let mut released: Option<Instant> = None;
    loop {
        let stopping = match inbox.try_recv() {
            Ok(Note::Released { at }) => {
                released = Some(at);
                on_release();
                false
            }
            Ok(Note::Done) | Err(std::sync::mpsc::TryRecvError::Disconnected) => return WatchEnd::Quiet,
            Ok(Note::Stop) => {
                // every take the server made before now has been reported once this round trip is back
                if let Err(error) = sync() {
                    return WatchEnd::Failed(format!("{error:#}"));
                }
                true
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => false,
        };
        match look() {
            Ok(Some(time)) => {
                taken.get_or_insert((time, Instant::now()));
            }
            Ok(None) => {}
            Err(error) => return WatchEnd::Failed(format!("{error:#}")),
        }
        if let Some(at) = released {
            if let Some((time, seen)) = taken {
                let escaped = cancel(time);
                return WatchEnd::Late(LateDrop {
                    after_release: seen.saturating_duration_since(at),
                    escape_after_release: at.elapsed(),
                    escaped,
                });
            }
            if at.elapsed() >= SETTLE {
                return WatchEnd::Quiet;
            }
        }
        if stopping {
            return WatchEnd::Quiet;
        }
        std::thread::sleep(LATE_POLL);
    }
}

fn watch_after_release(
    target: Window,
    escape: u8,
    inbox: std::sync::mpsc::Receiver<Note>,
    ready: std::sync::mpsc::Sender<std::result::Result<(), String>>,
) -> WatchEnd {
    use x11rb::protocol::Event;
    use x11rb::protocol::xproto::{ConnectionExt as _, EventMask, KEY_PRESS_EVENT, KEY_RELEASE_EVENT, KeyPressEvent};
    let subscribe = || -> Result<(x11rb::rust_connection::RustConnection, Window, u32)> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(4, 0)?.reply()?;
        let selection = conn.intern_atom(false, b"XdndSelection")?.reply()?.atom;
        conn.xfixes_select_selection_input(root, selection, SelectionEventMask::SET_SELECTION_OWNER)?
            .check()?;
        Ok((conn, root, selection))
    };
    let (conn, root, selection) = match subscribe() {
        Ok(subscribed) => {
            let _ = ready.send(Ok(()));
            subscribed
        }
        Err(error) => {
            let message = format!("{error:#}");
            let _ = ready.send(Err(message.clone()));
            return WatchEnd::Failed(message);
        }
    };
    let mask = conn.setup().resource_id_mask;
    let look = || -> Result<Option<u32>> {
        let mut take = None;
        while let Some(event) = conn.poll_for_event()? {
            if let Event::XfixesSelectionNotify(e) = event
                && e.selection == selection
                && taken_by_target(e.owner, target, mask)
            {
                take.get_or_insert(e.timestamp);
            }
        }
        Ok(take)
    };
    let sync = || -> Result<()> {
        conn.get_input_focus()?.reply()?;
        Ok(())
    };
    let cancel = |time: u32| -> bool {
        [KEY_PRESS_EVENT, KEY_RELEASE_EVENT].into_iter().all(|response_type| {
            let event = KeyPressEvent {
                response_type,
                detail: escape,
                sequence: 0,
                time,
                root,
                event: target,
                child: x11rb::NONE,
                root_x: 0,
                root_y: 0,
                event_x: 0,
                event_y: 0,
                state: 0u16.into(),
                same_screen: true,
            };
            conn.send_event(false, target, EventMask::NO_EVENT, event)
                .is_ok_and(|c| c.check().is_ok())
        })
    };
    watch_loop(&inbox, || inject_fault(&conn, root), look, sync, cancel)
}

/// The live tests' faults in the after-release watch (`CUA_ENGINE_FAULT`, only in a build with the `live` feature,
/// never a release asset): `late-watch-disconnect` has the server close the watch's connection, as a lost connection
/// does; `late-watch-panic` panics the watch's thread.
#[cfg(feature = "live")]
fn inject_fault(conn: &x11rb::rust_connection::RustConnection, root: Window) {
    use x11rb::protocol::xproto::ConnectionExt as _;
    match std::env::var("CUA_ENGINE_FAULT").as_deref() {
        Ok("late-watch-disconnect") => {
            // a resource of the watch's own, then the client that owns it killed
            if let Ok(pixmap) = conn.generate_id() {
                let depth = conn.setup().roots[0].root_depth;
                let _ = conn.create_pixmap(depth, pixmap, root, 1, 1);
                let _ = conn.kill_client(pixmap);
                let _ = conn.flush();
            }
        }
        Ok("late-watch-panic") => panic!("injected: late-watch-panic"),
        _ => {}
    }
}

#[cfg(not(feature = "live"))]
fn inject_fault(_: &x11rb::rust_connection::RustConnection, _: Window) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_take_counts_only_from_the_target_s_own_client() {
        let mask = 0x1f_ffff;
        assert!(taken_by_target(0x0640_0012, 0x0640_0003, mask));
        assert!(!taken_by_target(0x0820_0012, 0x0640_0003, mask), "another client");
        assert!(
            !taken_by_target(x11rb::NONE, 0x0640_0003, mask),
            "the selection given up"
        );
    }

    #[test]
    fn the_refusal_names_the_application_and_says_nothing_was_dropped_only_when_cancelled_in_time() {
        assert_eq!(
            cancelled("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop; it was cancelled before the drop, so \
             nothing was dropped. Use a dedicated desktop, or activate the window first"
        );
        assert_eq!(
            may_have_dropped("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop, and it could not be cancelled in time: \
             the drop may have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
        );
        assert_eq!(
            cannot_confirm("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop; it was cancelled, but whether the drop \
             landed cannot be confirmed. Use a dedicated desktop, or activate the window first"
        );
    }

    #[test]
    fn the_answer_follows_the_order_of_the_take_the_escape_and_the_release() {
        let app = "Google-chrome";
        assert_eq!(answer(Outcome::NoStart, false, app), None, "no drag and drop: a drag");
        assert_eq!(answer(Outcome::InTime, false, app), Some(cancelled(app)));
        assert_eq!(
            answer(Outcome::InTime, true, app),
            Some(may_have_dropped(app)),
            "the signature contradicts an in-time cancel"
        );
        assert_eq!(answer(Outcome::Late, false, app), Some(may_have_dropped(app)));
        assert_eq!(answer(Outcome::Undecided, false, app), Some(cannot_confirm(app)));
    }

    const BACK: Standing = Standing {
        active: false,
        focused: false,
        top: false,
    };

    #[test]
    fn a_window_newly_active_focused_or_on_top_is_the_drop_s_signature() {
        assert!(!BACK.changed_to(BACK));
        assert!(BACK.changed_to(Standing { active: true, ..BACK }));
        assert!(BACK.changed_to(Standing { focused: true, ..BACK }));
        assert!(BACK.changed_to(Standing { top: true, ..BACK }), "raised alone");
        let front = Standing {
            active: true,
            focused: true,
            top: true,
        };
        assert!(!front.changed_to(front), "already in front: nothing to see");
        assert!(!front.changed_to(BACK), "losing the front is not a drop's doing");
        assert!(!BACK.any() && front.any() && Standing { top: true, ..BACK }.any());
    }

    #[test]
    fn the_signature_is_looked_for_until_it_shows_or_the_settle_ends() {
        let (seen, waited) = signature_within(BACK, || BACK);
        assert!(!seen && waited >= SETTLE);
        let mut reads = 0;
        let (seen, waited) = signature_within(BACK, || {
            reads += 1;
            Standing {
                active: reads >= 3,
                ..BACK
            }
        });
        assert!(seen && waited < SETTLE, "the third read shows it");
    }

    #[test]
    fn a_watch_whose_connection_fails_or_whose_round_trip_fails_ends_failed_never_quiet() {
        let (notes, inbox) = std::sync::mpsc::channel();
        notes.send(Note::Released { at: Instant::now() }).unwrap();
        let end = watch_loop(
            &inbox,
            || {},
            || Err(anyhow::anyhow!("connection lost")),
            || Ok(()),
            |_| true,
        );
        assert_eq!(end, WatchEnd::Failed("connection lost".into()));
        let (notes, inbox) = std::sync::mpsc::channel();
        notes.send(Note::Stop).unwrap();
        let end = watch_loop(
            &inbox,
            || {},
            || Ok(None),
            || Err(anyhow::anyhow!("no reply")),
            |_| true,
        );
        assert_eq!(end, WatchEnd::Failed("no reply".into()));
    }

    #[test]
    fn a_watch_whose_thread_panicked_ends_failed() {
        let thread = std::thread::spawn(|| -> WatchEnd { std::panic::resume_unwind(Box::new("injected")) });
        while !thread.is_finished() {
            std::thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(
            LateWatch::around(thread).stop(),
            WatchEnd::Failed("the watch's thread panicked".into())
        );
    }

    #[test]
    fn a_take_after_the_release_is_cancelled_at_once_and_timed_from_the_release() {
        let (notes, inbox) = std::sync::mpsc::channel();
        let released = Instant::now();
        notes.send(Note::Released { at: released }).unwrap();
        let mut looks = 0;
        let mut escaped_at = None;
        let end = watch_loop(
            &inbox,
            || {},
            || {
                looks += 1;
                Ok((released.elapsed() >= Duration::from_millis(30)).then_some(7))
            },
            || Ok(()),
            |time| {
                escaped_at = Some((time, released.elapsed()));
                true
            },
        );
        let WatchEnd::Late(late) = end else { panic!("{end:?}") };
        let (time, at) = escaped_at.expect("the Escape went out");
        assert_eq!(time, 7, "stamped with the take's time");
        assert!(late.escaped && looks > 1);
        assert!(late.after_release >= Duration::from_millis(30), "{late:?}");
        assert!(
            at - late.after_release < Duration::from_millis(10),
            "the Escape within a poll of the take: {late:?}, Escape at {at:?}"
        );
    }

    #[test]
    fn the_watch_ends_at_the_settle_counted_from_the_release() {
        let (notes, inbox) = std::sync::mpsc::channel();
        // the release 250 ms before the watch hears of it: 50 ms of the settle remain
        notes
            .send(Note::Released {
                at: Instant::now() - Duration::from_millis(250),
            })
            .unwrap();
        let started = Instant::now();
        assert_eq!(
            watch_loop(&inbox, || {}, || Ok(None), || Ok(()), |_| true),
            WatchEnd::Quiet
        );
        assert!(
            started.elapsed() < Duration::from_millis(120),
            "{:?}",
            started.elapsed()
        );
    }
}
