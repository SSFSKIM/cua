//! A drag that becomes a drag and drop (#171 M3.1; Plan of Work, M3, "Open, decided on measurement"): an XDND source
//! takes the `XdndSelection` selection when its drag and drop starts, so a background-route drag into a window whose
//! family's drop changes the desktop (`families.rs`: Chrome activates, focuses and raises its window on a drop) watches
//! that selection through XFixes from the drag's start; a take by the target's own X client (its windows share the
//! resource-id base, as the paste route attributes its requests) means a drag and drop began. In shared mode the answer
//! follows the order of what the engine saw and sent ([`Outcome`], the design session's rulings of 2026-10-31): a take
//! seen before the release is cancelled before the drop (Escape on the background route, then the release), so nothing
//! was dropped; no take by the release is a plain drag, answered at once, while [`LateWatch`] goes on off the request
//! path through `SETTLE`, cancels a late take at once and has the next replies report it ([`pending_notice`] on every
//! reply, then [`pending_refusal`] for the first acting request, not run); anything the order cannot tell gets the
//! answer that the drop cannot be confirmed. The drop's signature (the window newly active, focused or on top)
//! cross-checks an in-time cancel where it can see a change. A window already active, focused and fully unobscured is
//! not guarded: its drop changes nothing the person sees.
//!
//! Every Chromium drag the engine lets drop (in front, on a dedicated desktop, on the desktop route over Chromium) has
//! the same after-release watch (M4's T14, #264; the design session's rulings, 2026-11-02): a take after a release that
//! had none is cancelled at once on the route the drag used and reported. A Chrome drop that was under way at its
//! release is confirmed by Chrome's own `_NET_ACTIVE_WINDOW` request for its window within [`DROP_CONFIRM`] (the
//! ruling on task 68, 2026-11-09), where the window manager supports that request; with none, it is reported as
//! unconfirmed, never ok.

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

/// How long after a Chromium drag source takes `XdndSelection` a drag the engine lets drop is released at the soonest
/// (task 18, evidence `m3/drop-misses/task18/`). Chromium sends XdndDrop at the release only once its target has
/// accepted (`XDragDropClient::HandleMouseReleased`), and the target accepts a position only after the renderer has
/// answered an earlier one. When the browser stalls just after its drag starts (16 and 21 stalls in two full verdict
/// runs), it accepts 148-275 ms after the take, and a short drop released within about 50 ms of the take misses even
/// without a stall; a release before the accept drops nothing. 350 ms is the landed drops' own pace. An accept later
/// than this delay still misses, unseen (README, known limits).
pub const RELEASE_AFTER_TAKE: Duration = Duration::from_millis(350);

/// When the `done`-th of the `left` steps a drag still had at its source's take ends at the soonest: those steps
/// spread evenly over `after_take`, so the last of them, and the release after it, comes `after_take` after the take.
/// No step waits longer than [`KEEPALIVE`] (the drag's own pacing aside): what the steps leave of the delay is filled
/// by [`keepalive`].
pub fn step_due(taken: Instant, after_take: Duration, done: usize, left: usize) -> Instant {
    taken + after_take.mul_f64(done as f64 / left.max(1) as f64)
}

/// How long after the press a Chromium drag the engine lets drop keeps its button down for its source's take when none
/// came by the path's end (task 22, evidence `m3/drop-misses/task22/`): a renderer that gets the drag's first moves
/// late (a frame or a stall behind, under the gate's load of Chrome windows) starts the drag and drop after a short
/// path has ended, and a release before its take drops nothing while the drag answers success (`m3-gate-final`). Takes
/// came 4-93 ms after the press over 195 drags of the gate's sequence, the gate's own misses' within about 134 ms; 250
/// leaves about one more stall of the size task 18 saw. A drag whose path already lasts this long waits for nothing;
/// a shorter one that never takes (a text selection, a range) pays the rest of it. A take after it still misses, unseen.
pub const TAKE_HOLD_AFTER_PRESS: Duration = Duration::from_millis(250);

/// The longest the pointer rests between a take and the release (task 22): Chrome's drag loop sends its target a
/// position only on a motion, and its target accepts only a position the renderer has answered, so a floor waited out
/// without motion still drops nothing (a take on the path's last sample, or after it: 2 misses of 7 such drags).
pub const KEEPALIVE: Duration = Duration::from_millis(12);

const TAKE_POLL: Duration = Duration::from_millis(2);

/// The hold: whether the source's take was seen (through `started`, looked at once at least) by `deadline`.
pub fn wait_for_take(mut started: impl FnMut() -> bool, deadline: Instant) -> bool {
    loop {
        if started() {
            return true;
        }
        let now = Instant::now();
        if now >= deadline {
            return false;
        }
        std::thread::sleep(TAKE_POLL.min(deadline - now));
    }
}

/// The floor's motions after a take (only then, and only on a drag the engine lets drop into a Chromium window): until
/// `due`, the path's second-to-last sample and then its last, [`KEEPALIVE`] apart, so the drag ends on its last
/// sample. Answers how many pairs went out; a motion that fails ends it with its error.
pub fn keepalive(
    place: impl FnMut((i16, i16)) -> anyhow::Result<()>,
    before: (i16, i16),
    last: (i16, i16),
    due: Instant,
) -> anyhow::Result<u32> {
    keepalive_until(place, before, last, due, || false)
}

/// [`keepalive`] that ends sooner, before the first pair at which `done` answers true (measurement only: T13's release
/// at the accept, `accept.rs`).
pub fn keepalive_until(
    mut place: impl FnMut((i16, i16)) -> anyhow::Result<()>,
    before: (i16, i16),
    last: (i16, i16),
    due: Instant,
    mut done: impl FnMut() -> bool,
) -> anyhow::Result<u32> {
    let mut sent = 0;
    while Instant::now() < due && !done() {
        place(before)?;
        place(last)?;
        sent += 1;
        std::thread::sleep(KEEPALIVE.min(due.saturating_duration_since(Instant::now())));
    }
    Ok(sent)
}

/// The watch on `XdndSelection` for one drag. It owns the selection's reports while it runs: whatever else reads the
/// connection's events meanwhile (the server-time probe, the input session) keeps them for it
/// (`X11::take_selection_reports`).
pub struct DndWatch {
    selection: u32,
    target: Window,
    mask: u32,
    started: bool,
    /// The server's time of the first take seen (measurement: `accept.rs` counts the cursor's changes from it).
    taken_time: Option<u32>,
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
            taken_time: None,
        })
    }

    /// Whether the target has begun a drag and drop, from the reports that have arrived so far.
    pub fn started(&mut self, x: &mut X11) -> bool {
        for report in x.take_selection_reports() {
            if report.selection == self.selection && taken_by_target(report.owner, self.target, self.mask) {
                self.taken_time.get_or_insert(report.timestamp);
                self.started = true;
            }
        }
        self.started
    }

    /// Whether a drag and drop was seen to start.
    pub fn is_started(&self) -> bool {
        self.started
    }

    /// The server's time of the take, once one was seen.
    pub fn taken_time(&self) -> Option<u32> {
        self.taken_time
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

/// What an ended after-release watch left pending, in the words a reply carries: a late drag and drop, a drop its
/// target never confirmed, or the watch's own failure. `app` names the drag's target (`list_windows`' `app`). Every
/// reply carries it as its `notice` ([`pending_notice`]) until the first acting request, which is refused with it and
/// not run ([`pending_refusal`]; the design session's rulings, 2026-10-31, 2026-11-02 and 2026-11-10).
fn pending_cause(app: &str, end: &WatchEnd) -> String {
    match end {
        WatchEnd::Late(_) | WatchEnd::Quiet => format!(
            "a late drag and drop: {app} started a drag and drop after your drag into it ended, so the drag did not \
             end as it answered; it may have dropped and changed the desktop"
        ),
        WatchEnd::Unconfirmed => format!(
            "an unconfirmed drop: your drag into {app} began a drag and drop, and {app} did not confirm a drop after \
             the release, so the drop may not have landed as the drag answered"
        ),
        WatchEnd::Failed(why) => format!(
            "a failed watch: the drag-and-drop watch after your drag into {app} failed ({why}), so a drop may have \
             happened unseen and changed the desktop"
        ),
    }
}

/// The `notice` every reply carries while a watch's end is pending: the cause, and that the next acting request is not
/// run.
pub fn pending_notice(app: &str, end: &WatchEnd) -> String {
    format!(
        "Pending from your last drag, {}. Read the window before sending input again: your next input request will \
         not be run",
        pending_cause(app, end)
    )
}

/// The refusal of the first acting request (`command`, its wire name) while a watch's end is pending: what is pending,
/// and that this request was not run, as a paste refused for an earlier unconfirmed one is not
/// (`paste::previous_unconfirmed`), so the agent reads the desktop before it acts again.
pub fn pending_refusal(app: &str, end: &WatchEnd, command: &str) -> String {
    format!(
        "Pending from your last drag, {}; this {command} request was not run, so read the window before sending it \
         again",
        pending_cause(app, end)
    )
}

/// How long after a drag's release Chrome's own activation request for the drop target's window may come and still
/// confirm that the drop landed (the design session's ruling on task 68, 2026-11-09). Chrome's drop asks the window
/// manager to activate its window (`WebContentsViewAura::CompleteDrop` calls `WebContents::Focus`) and a leave never
/// does: task 68 saw the request on 1,861 of 1,861 drops and on none of 354 drags that did not land, at most 7.4, 52.9
/// and 34.7 ms after the release, idle, at the gate's window load and at twice the load (evidence
/// `m4/drop-signals/`). 150 ms is about three times the largest, and inside the after-release watch's [`SETTLE`]. A drag
/// whose drop sends no request inside it is unconfirmed, never ok.
pub const DROP_CONFIRM: Duration = Duration::from_millis(150);

/// Whether the window manager lists `_NET_ACTIVE_WINDOW` in the root's `_NET_SUPPORTED`, read now: Chrome's drop
/// confirmation is a request to it, so with no window manager that supports it there is none to read and drops are
/// not confirmed (the design session's ruling on task 68: the signal applies only where it is supported, read at
/// runtime). A property that cannot be read is no support (the caller records why).
pub fn active_window_supported(x: &X11) -> Result<bool> {
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _};
    let supported = x.conn.intern_atom(false, b"_NET_SUPPORTED")?.reply()?.atom;
    let active = x.atom("_NET_ACTIVE_WINDOW");
    let reply = x
        .conn
        .get_property(false, x.root, supported, AtomEnum::ATOM, 0, 4096)?
        .reply()?;
    Ok(reply
        .value32()
        .is_some_and(|mut atoms| atoms.any(|atom| atom == active)))
}

/// Which window's activation request confirms a drop the after-release watch finds under way at its release (the
/// design session's ruling on task 68: only the drop target's own top-level window's request counts).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Confirm {
    /// No drop is confirmed: the watch looks only for a late take.
    Never,
    /// This window's, known when the drag begins (a `drag`'s drop window).
    Window(Window),
    /// The window [`LateWatch::confirm_drop_of`] names before the release, or none: a `drag_handle`, whose drop window
    /// is the one under the pointer at its end (T17).
    AtRelease,
}

/// The route a late take's Escape goes on: the route the drag used (the design session's rulings, 2026-11-02).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EscapeRoute {
    /// A synthetic key event to the drag's window: the background route.
    Synthetic(Window),
    /// XTEST: the foreground and desktop routes.
    Xtest,
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
    /// When the Escape went out, if it did: a key to the target, which the exit's settle follows (`settle.rs`).
    pub escaped_at: Option<Instant>,
}

/// How the after-release watch ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatchEnd {
    /// Nothing to report: no take after a release that had none, or a drop its target confirmed.
    Quiet,
    /// A take after the release: cancelled at once, to be reported.
    Late(LateDrop),
    /// A drag and drop under way at the release whose target sent no activation request for its window within
    /// [`DROP_CONFIRM`] after it: the drop may not have landed, though the drag answered as if it had.
    Unconfirmed,
    /// The watch could not keep watching (its connection failed, a round trip failed, the thread panicked): whether a
    /// drag and drop began cannot be told.
    Failed(String),
}

enum Note {
    /// The drag's button was released, at `at`. With no take seen by the engine (`taken` false): watch on, off the
    /// request path, through `SETTLE` from `at`, and cancel a take at once. With a take before it: look, through
    /// [`DROP_CONFIRM`], for the target's confirmation of its drop, when the watch confirms drops.
    Released { at: Instant, taken: bool },
    /// The drag ended otherwise (cancelled in time, an error): nothing more to watch.
    Done,
    /// An acting request has come, or the engine ends: look one last time and end. A drop still waiting for its
    /// confirmation is waited for, at most [`DROP_CONFIRM`] after its release.
    Stop,
}

/// What the watch's look found since the last one.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Seen {
    /// The server's time of a take of `XdndSelection` by the target's client.
    take: Option<u32>,
    /// Whether the target's client asked the window manager to activate the drop target's window (source 1, the
    /// application): Chrome's drop.
    activated: bool,
}

/// The after-release watch of one drag the engine watches for a drag and drop (the shared-mode guard's, and every
/// Chromium drag whose drop the engine lets land: in front, on a dedicated desktop, on the desktop route; the design
/// session's rulings, 2026-11-02): its own X connection, subscribed to `XdndSelection` (and, when it confirms drops, to
/// the root's client messages) before the drag begins, so no take between the drag's last look and the watch can go
/// unseen. While the drag runs it only records. Once told of the release (the instant the button went up): after a
/// release with no take, a take by the target's client is cancelled at once (Escape, on the route the drag used), and
/// the watch ends at `SETTLE` after the release, at an acting request, or at the engine's end; after a release with a
/// take, a watch that confirms drops looks for the target's activation request for the drop window through
/// [`DROP_CONFIRM`]. Its end ([`WatchEnd`]) is the engine's to report.
pub struct LateWatch {
    notes: std::sync::mpsc::Sender<Note>,
    thread: Option<std::thread::JoinHandle<WatchEnd>>,
    /// The application the reports name, set once the drag hands the watch over.
    pub app: String,
    /// The window a late take's synthetic Escape goes to (None: the Escape goes through XTEST).
    pub target: Option<Window>,
    /// When the drag's button went up (`released`), and whether a take came before it: the watch ends by itself
    /// `SETTLE` after a release with no take, `DROP_CONFIRM` after one with a take.
    released_at: std::cell::Cell<Option<(Instant, bool)>>,
    /// The window whose activation request confirms the drop (`NONE`: none yet), read by the watch's thread.
    confirm: std::sync::Arc<std::sync::atomic::AtomicU32>,
}

impl LateWatch {
    /// Started and subscribed, or the reason it could not be: a take by `target`'s client is watched for, a late one
    /// cancelled by `escape` (a keycode) on `route`; unless `confirm` is [`Confirm::Never`], the drop window's
    /// activation request is watched for too.
    pub fn start(target: Window, route: EscapeRoute, escape: u8, confirm: Confirm) -> Result<LateWatch> {
        let (notes, inbox) = std::sync::mpsc::channel();
        let (ready, subscribed) = std::sync::mpsc::channel();
        let window = match confirm {
            Confirm::Window(window) => window,
            Confirm::Never | Confirm::AtRelease => x11rb::NONE,
        };
        let cell = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(window));
        let confirming = (confirm != Confirm::Never).then(|| cell.clone());
        let thread = std::thread::spawn(move || watch_after_release(target, route, escape, confirming, inbox, ready));
        match subscribed.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => Ok(LateWatch {
                notes,
                thread: Some(thread),
                app: String::new(),
                target: match route {
                    EscapeRoute::Synthetic(window) => Some(window),
                    EscapeRoute::Xtest => None,
                },
                released_at: std::cell::Cell::new(None),
                confirm: cell,
            }),
            Ok(Err(error)) => Err(anyhow::anyhow!("the drag-and-drop watch could not start: {error}")),
            Err(_) => Err(anyhow::anyhow!("the drag-and-drop watch did not start")),
        }
    }

    /// The window whose activation request confirms the drop, for a watch started with [`Confirm::AtRelease`]: named
    /// before the release, so every request read after it is judged against it; None confirms nothing (and the watch
    /// is then not handed over after a take: there is nothing to confirm by).
    pub fn confirm_drop_of(&self, window: Option<Window>) {
        self.confirm
            .store(window.unwrap_or(x11rb::NONE), std::sync::atomic::Ordering::SeqCst);
    }

    /// The drag's button went up at `at`, after a take (`taken`) or with none.
    pub fn released(&self, at: Instant, taken: bool) {
        self.released_at.set(Some((at, taken)));
        let _ = self.notes.send(Note::Released { at, taken });
    }

    /// Whether the drag reached its release after a take (None: it never reached its release).
    pub fn released_with_take(&self) -> Option<bool> {
        self.released_at.get().map(|(_, taken)| taken)
    }

    /// When the watch's time is up: `SETTLE` after a release with no take, `DROP_CONFIRM` after one with a take; None for
    /// a watch never told of one.
    pub fn ends_at(&self) -> Option<Instant> {
        self.released_at
            .get()
            .map(|(released, taken)| released + if taken { DROP_CONFIRM } else { SETTLE })
    }

    /// At the engine's exit: the watch left to run out its own lifetime, so a take inside it is still cancelled (its
    /// Escape sent before the exit's settle and before the connection closes). It returns once the watch has ended by
    /// itself, and at the latest a poll past `SETTLE` after the release; at once for a watch never told of one.
    pub fn run_out(&self) {
        let Some((released, _)) = self.released_at.get() else {
            return;
        };
        let until = released + SETTLE + LATE_POLL * 2;
        while !self.finished() && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(1));
        }
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

    /// Whether the watch has ended by itself (its settle over, a take cancelled, a drop confirmed or not, a failure).
    pub fn finished(&self) -> bool {
        self.thread.as_ref().is_none_or(|t| t.is_finished())
    }

    /// One last look (a round trip, so every take before now is counted), then how the watch ended; a drop still
    /// waiting for its confirmation is waited for first, at most [`DROP_CONFIRM`] after its release. A thread that
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
            target: Some(0),
            released_at: std::cell::Cell::new(None),
            confirm: Default::default(),
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

/// The watch's loop, apart from its connection: `confirming` whether it looks for a drop's confirmation, `on_release`
/// runs when the release is known (the live tests' fault injection), `look` reads the reports so far (a take's server
/// time, an activation request, or an error), `sync` makes a round trip, `cancel` sends the Escape stamped with the
/// take's time and says whether it went out.
fn watch_loop(
    inbox: &std::sync::mpsc::Receiver<Note>,
    confirming: bool,
    mut on_release: impl FnMut(),
    mut look: impl FnMut() -> Result<Seen>,
    mut sync: impl FnMut() -> Result<()>,
    mut cancel: impl FnMut(u32) -> bool,
) -> WatchEnd {
    let mut taken: Option<(u32, Instant)> = None;
    // every activation request as it was read: one during the drag predates the release and must not hide the drop's
    // own, so each is judged against the window once the release is known
    let mut activations: Vec<Instant> = Vec::new();
    let mut released: Option<(Instant, bool)> = None;
    let mut stopping = false;
    loop {
        match inbox.try_recv() {
            Ok(Note::Released { at, taken }) => {
                released = Some((at, taken));
                on_release();
            }
            Ok(Note::Done) | Err(std::sync::mpsc::TryRecvError::Disconnected) => return WatchEnd::Quiet,
            Ok(Note::Stop) => {
                // every take and request the server handled before now has been reported once this round trip is back
                if let Err(error) = sync() {
                    return WatchEnd::Failed(format!("{error:#}"));
                }
                stopping = true;
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
        }
        match look() {
            Ok(seen) => {
                if let Some(time) = seen.take {
                    taken.get_or_insert((time, Instant::now()));
                }
                if seen.activated {
                    activations.push(Instant::now());
                }
            }
            Err(error) => return WatchEnd::Failed(format!("{error:#}")),
        }
        match released {
            // a drag and drop under way at the release: its drop is confirmed by the target's activation request read
            // inside the window, from the release to `DROP_CONFIRM` after it (the design session's ruling on task 68),
            // or not at all (an acting request meanwhile waits for the window's rest). One read after the window's
            // end, however it came to be read late, does not confirm
            Some((at, true)) => {
                if !confirming || activations.iter().any(|&seen| seen >= at && seen - at <= DROP_CONFIRM) {
                    return WatchEnd::Quiet;
                }
                if at.elapsed() >= DROP_CONFIRM {
                    return WatchEnd::Unconfirmed;
                }
            }
            Some((at, false)) => {
                if let Some((time, seen)) = taken {
                    let escaped = cancel(time);
                    let now = Instant::now();
                    return WatchEnd::Late(LateDrop {
                        after_release: seen.saturating_duration_since(at),
                        escape_after_release: now.saturating_duration_since(at),
                        escaped,
                        escaped_at: escaped.then_some(now),
                    });
                }
                if stopping || at.elapsed() >= SETTLE {
                    return WatchEnd::Quiet;
                }
            }
            None if stopping => return WatchEnd::Quiet,
            None => {}
        }
        std::thread::sleep(LATE_POLL);
    }
}

fn watch_after_release(
    target: Window,
    route: EscapeRoute,
    escape: u8,
    confirm: Option<std::sync::Arc<std::sync::atomic::AtomicU32>>,
    inbox: std::sync::mpsc::Receiver<Note>,
    ready: std::sync::mpsc::Sender<std::result::Result<(), String>>,
) -> WatchEnd {
    use x11rb::protocol::Event;
    use x11rb::protocol::xproto::{
        ChangeWindowAttributesAux, ConnectionExt as _, EventMask, KEY_PRESS_EVENT, KEY_RELEASE_EVENT, KeyPressEvent,
    };
    use x11rb::protocol::xtest::ConnectionExt as _;
    let subscribe = || -> Result<(x11rb::rust_connection::RustConnection, Window, u32, u32)> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(4, 0)?.reply()?;
        if route == EscapeRoute::Xtest {
            conn.xtest_get_version(2, 2)?.reply()?;
        }
        let selection = conn.intern_atom(false, b"XdndSelection")?.reply()?.atom;
        let active = conn.intern_atom(false, b"_NET_ACTIVE_WINDOW")?.reply()?.atom;
        conn.xfixes_select_selection_input(root, selection, SelectionEventMask::SET_SELECTION_OWNER)?
            .check()?;
        if confirm.is_some() {
            // a client's `_NET_ACTIVE_WINDOW` request goes to the root with SubstructureRedirect and SubstructureNotify:
            // the window manager holds the redirect, and any client may share the notify
            conn.change_window_attributes(
                root,
                &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
            )?
            .check()?;
        }
        Ok((conn, root, selection, active))
    };
    let (conn, root, selection, active) = match subscribe() {
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
    // the drop window as it stands now: a handle names its own just before its release (`LateWatch::confirm_drop_of`)
    let drop_window = || {
        confirm
            .as_ref()
            .map(|cell| cell.load(std::sync::atomic::Ordering::SeqCst))
            .filter(|&window| window != x11rb::NONE)
    };
    let look = || -> Result<Seen> {
        let mut seen = Seen::default();
        while let Some(event) = conn.poll_for_event()? {
            match event {
                Event::XfixesSelectionNotify(e)
                    if e.selection == selection && taken_by_target(e.owner, target, mask) =>
                {
                    seen.take.get_or_insert(e.timestamp);
                }
                Event::ClientMessage(e) if confirms_drop(&e, active, drop_window()) => seen.activated = true,
                _ => {}
            }
        }
        Ok(seen)
    };
    let sync = || -> Result<()> {
        conn.get_input_focus()?.reply()?;
        Ok(())
    };
    let cancel = |time: u32| -> bool {
        match route {
            EscapeRoute::Synthetic(window) => [KEY_PRESS_EVENT, KEY_RELEASE_EVENT].into_iter().all(|response_type| {
                let event = KeyPressEvent {
                    response_type,
                    detail: escape,
                    sequence: 0,
                    time,
                    root,
                    event: window,
                    child: x11rb::NONE,
                    root_x: 0,
                    root_y: 0,
                    event_x: 0,
                    event_y: 0,
                    state: 0u16.into(),
                    same_screen: true,
                };
                conn.send_event(false, window, EventMask::NO_EVENT, event)
                    .is_ok_and(|c| c.check().is_ok())
            }),
            EscapeRoute::Xtest => [KEY_PRESS_EVENT, KEY_RELEASE_EVENT].into_iter().all(|kind| {
                conn.xtest_fake_input(kind, escape, x11rb::CURRENT_TIME, root, 0, 0, 0)
                    .is_ok_and(|c| c.check().is_ok())
            }),
        }
    };
    watch_loop(
        &inbox,
        confirm.is_some(),
        || inject_fault(&conn, root),
        look,
        sync,
        cancel,
    )
}

/// Whether a client message is the drop's confirmation: a `_NET_ACTIVE_WINDOW` request from an application (source 1)
/// for the drop target's own top-level window `confirm` (the design session's ruling on task 68: only that window's
/// request counts). The engine's own activations come before a drag's watch subscribes, never after its release.
fn confirms_drop(e: &x11rb::protocol::xproto::ClientMessageEvent, active: u32, confirm: Option<Window>) -> bool {
    e.format == 32 && e.type_ == active && Some(e.window) == confirm && e.data.as_data32()[0] == 1
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
    fn the_steps_after_a_take_spread_over_the_release_s_delay() {
        let taken = Instant::now();
        let after = RELEASE_AFTER_TAKE;
        assert_eq!(after, Duration::from_millis(350));
        assert_eq!(step_due(taken, after, 0, 200), taken);
        assert_eq!(
            step_due(taken, after, 200, 200),
            taken + after,
            "the last step ends the delay after the take"
        );
        assert_eq!(step_due(taken, after, 100, 200), taken + after / 2);
        assert_eq!(
            step_due(taken, after, 1, 1),
            taken + after,
            "one step left carries the whole delay"
        );
        let dues: Vec<Instant> = (0..=40).map(|done| step_due(taken, after, done, 40)).collect();
        assert!(dues.windows(2).all(|w| w[0] <= w[1]), "never earlier for a later step");
    }

    #[test]
    fn the_hold_waits_for_a_take_until_its_deadline_and_no_longer() {
        assert_eq!(TAKE_HOLD_AFTER_PRESS, Duration::from_millis(250));
        // no take: the button stays down until the deadline, then the drag is released as before
        let deadline = Instant::now() + Duration::from_millis(40);
        let mut looks = 0;
        assert!(!wait_for_take(
            || {
                looks += 1;
                false
            },
            deadline
        ));
        assert!(Instant::now() >= deadline, "held to the deadline");
        assert!(Instant::now() < deadline + Duration::from_millis(20), "and no longer");
        assert!(looks > 2, "looked again while it waited");
        // a take inside the hold ends the wait at once
        let started = Instant::now();
        let mut looks = 0;
        assert!(wait_for_take(
            || {
                looks += 1;
                looks == 3
            },
            started + Duration::from_secs(5)
        ));
        assert!(started.elapsed() < Duration::from_millis(50));
        // a take seen at the path's last look (the deadline already past) still counts: the floor follows
        assert!(wait_for_take(|| true, Instant::now() - Duration::from_millis(1)));
        assert!(!wait_for_take(|| false, Instant::now() - Duration::from_millis(1)));
    }

    #[test]
    fn the_floor_after_a_take_is_filled_with_motions_that_end_on_the_last_sample() {
        let due = Instant::now() + Duration::from_millis(60);
        let mut placed = Vec::new();
        let sent = keepalive(|p| (placed.push((p, Instant::now())), Ok(())).1, (9, 5), (10, 5), due).unwrap();
        assert!(Instant::now() >= due, "the release waits for the floor");
        assert!(sent >= 4, "a motion every {KEEPALIVE:?} or so: {sent}");
        assert_eq!(placed.len(), 2 * sent as usize);
        assert_eq!(placed.last().unwrap().0, (10, 5), "ending on the last sample");
        assert!(
            placed.chunks(2).all(|pair| pair[0].0 == (9, 5) && pair[1].0 == (10, 5)),
            "the path's second-to-last sample, then its last"
        );
        let gaps: Vec<Duration> = placed.windows(3).step_by(2).map(|w| w[2].1 - w[0].1).collect();
        assert!(
            gaps.iter().all(|g| *g < KEEPALIVE + Duration::from_millis(8)),
            "{gaps:?}"
        );
        // a floor already over: no motion at all
        let mut none = 0;
        let sent = keepalive(|_| (none += 1, Ok(())).1, (9, 5), (10, 5), Instant::now()).unwrap();
        assert_eq!((sent, none), (0, 0));
        // a motion that fails ends the floor with its error
        let due = Instant::now() + Duration::from_millis(60);
        assert!(keepalive(|_| Err(anyhow::anyhow!("BadWindow")), (9, 5), (10, 5), due).is_err());
    }

    #[test]
    fn the_floor_s_motions_end_early_once_done_says_so_and_never_before_the_first_look() {
        let due = Instant::now() + Duration::from_millis(500);
        let mut looks = 0;
        let mut placed = 0;
        let sent = keepalive_until(
            |_| (placed += 1, Ok(())).1,
            (9, 5),
            (10, 5),
            due,
            || {
                looks += 1;
                looks > 3
            },
        )
        .unwrap();
        assert_eq!(sent, 3, "three pairs, then done");
        assert_eq!(placed, 6);
        assert!(Instant::now() < due, "ended before the floor");
        let mut placed = 0;
        assert_eq!(
            keepalive_until(|_| (placed += 1, Ok(())).1, (9, 5), (10, 5), due, || true).unwrap(),
            0
        );
        assert_eq!(placed, 0, "done at once: no motion");
    }

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

    fn took(time: u32) -> Seen {
        Seen {
            take: Some(time),
            activated: false,
        }
    }

    const ACTIVATED: Seen = Seen {
        take: None,
        activated: true,
    };

    /// A watch loop on a thread of its own, its look answering `seen(elapsed since the release)`, with what it cancelled.
    fn confirming_loop(
        taken: bool,
        confirming: bool,
        seen: impl Fn(Duration) -> Seen + Send + 'static,
    ) -> (
        std::sync::mpsc::Sender<Note>,
        Instant,
        std::thread::JoinHandle<(WatchEnd, u32)>,
    ) {
        let (notes, inbox) = std::sync::mpsc::channel();
        let released = Instant::now();
        notes.send(Note::Released { at: released, taken }).unwrap();
        let thread = std::thread::spawn(move || {
            let mut escapes = 0;
            let end = watch_loop(
                &inbox,
                confirming,
                || {},
                || Ok(seen(released.elapsed())),
                || Ok(()),
                |_| {
                    escapes += 1;
                    true
                },
            );
            (end, escapes)
        });
        (notes, released, thread)
    }

    #[test]
    fn a_drop_under_way_at_the_release_is_confirmed_by_its_target_s_activation_request_within_the_window() {
        // the request 20 ms after the release: confirmed, at once, nothing to report and no Escape
        let (_notes, released, thread) = confirming_loop(true, true, |since| {
            if since >= Duration::from_millis(20) {
                ACTIVATED
            } else {
                Seen::default()
            }
        });
        let (end, escapes) = thread.join().unwrap();
        assert_eq!((end, escapes), (WatchEnd::Quiet, 0));
        assert!(
            released.elapsed() < Duration::from_millis(60),
            "{:?}",
            released.elapsed()
        );
    }

    #[test]
    fn a_drop_under_way_at_the_release_with_no_activation_request_within_the_window_is_unconfirmed() {
        let (_notes, released, thread) = confirming_loop(true, true, |_| Seen::default());
        let (end, escapes) = thread.join().unwrap();
        assert_eq!(
            (end, escapes),
            (WatchEnd::Unconfirmed, 0),
            "never ok, and nothing to cancel"
        );
        let waited = released.elapsed();
        assert!(
            waited >= DROP_CONFIRM && waited < DROP_CONFIRM + Duration::from_millis(40),
            "{waited:?}"
        );
        // a request after the window is too late to confirm
        let (_notes, _, thread) = confirming_loop(true, true, |since| {
            if since >= DROP_CONFIRM + Duration::from_millis(20) {
                ACTIVATED
            } else {
                Seen::default()
            }
        });
        assert_eq!(thread.join().unwrap().0, WatchEnd::Unconfirmed);
        assert_eq!(DROP_CONFIRM, Duration::from_millis(150));
        assert!(DROP_CONFIRM < SETTLE, "inside the after-release watch's lifetime");
    }

    #[test]
    fn a_take_after_a_release_that_had_one_is_its_own_drag_and_drop_never_cancelled() {
        // the drag's own take, still reported after its release, starts no cancel
        let (_notes, _, thread) = confirming_loop(true, true, |since| Seen {
            take: Some(7),
            activated: since >= Duration::from_millis(5),
        });
        assert_eq!(thread.join().unwrap(), (WatchEnd::Quiet, 0));
    }

    #[test]
    fn a_watch_that_does_not_confirm_drops_ends_quiet_at_a_release_that_had_a_take() {
        // Electron, or a window manager without `_NET_ACTIVE_WINDOW`: the floor stands as before, nothing to report
        let (_notes, released, thread) = confirming_loop(true, false, |_| Seen::default());
        assert_eq!(thread.join().unwrap(), (WatchEnd::Quiet, 0));
        assert!(released.elapsed() < Duration::from_millis(20));
    }

    #[test]
    fn an_activation_request_before_the_release_confirms_nothing() {
        let (notes, inbox) = std::sync::mpsc::channel();
        let mut looks = 0;
        let thread = std::thread::spawn(move || {
            watch_loop(
                &inbox,
                true,
                || {},
                || {
                    looks += 1;
                    Ok(if looks == 1 { ACTIVATED } else { Seen::default() })
                },
                || Ok(()),
                |_| true,
            )
        });
        // the first look, before the release, read a request
        std::thread::sleep(Duration::from_millis(10));
        notes
            .send(Note::Released {
                at: Instant::now(),
                taken: true,
            })
            .unwrap();
        assert_eq!(thread.join().unwrap(), WatchEnd::Unconfirmed);
    }

    #[test]
    fn a_request_first_read_after_the_window_s_end_confirms_nothing() {
        // the watch read nothing until 200 ms after the release (descheduled across the deadline, or the request came
        // late): a request read then is outside the window, so the drop stays unconfirmed (the fix wave of task 69)
        let (notes, inbox) = std::sync::mpsc::channel();
        notes
            .send(Note::Released {
                at: Instant::now() - Duration::from_millis(200),
                taken: true,
            })
            .unwrap();
        let end = watch_loop(&inbox, true, || {}, || Ok(ACTIVATED), || Ok(()), |_| true);
        assert_eq!(end, WatchEnd::Unconfirmed);
    }

    #[test]
    fn a_request_during_the_drag_does_not_hide_the_drop_s_own_after_the_release() {
        // a request read before the release, then the release, then the drop's request inside the window: confirmed
        // (the fix wave of task 69: the first request read used to stand for every later one)
        let (notes, inbox) = std::sync::mpsc::channel();
        let mut looks = 0;
        let end = watch_loop(
            &inbox,
            true,
            || {},
            || {
                looks += 1;
                if looks == 2 {
                    notes
                        .send(Note::Released {
                            at: Instant::now(),
                            taken: true,
                        })
                        .unwrap();
                }
                Ok(if looks == 1 || looks == 3 {
                    ACTIVATED
                } else {
                    Seen::default()
                })
            },
            || Ok(()),
            |_| true,
        );
        assert_eq!(end, WatchEnd::Quiet);
    }

    #[test]
    fn an_acting_request_waits_for_a_pending_drop_s_window_and_no_longer() {
        // a stop 30 ms after the release: the watch looks on until the request comes, at 60 ms
        let (notes, released, thread) = confirming_loop(true, true, |since| {
            if since >= Duration::from_millis(60) {
                ACTIVATED
            } else {
                Seen::default()
            }
        });
        std::thread::sleep(Duration::from_millis(30));
        notes.send(Note::Stop).unwrap();
        assert_eq!(thread.join().unwrap(), (WatchEnd::Quiet, 0));
        let waited = released.elapsed();
        assert!(
            waited >= Duration::from_millis(60) && waited < Duration::from_millis(100),
            "{waited:?}"
        );
        // none comes: the stop answers unconfirmed at the window's end
        let (notes, released, thread) = confirming_loop(true, true, |_| Seen::default());
        std::thread::sleep(Duration::from_millis(30));
        notes.send(Note::Stop).unwrap();
        assert_eq!(thread.join().unwrap(), (WatchEnd::Unconfirmed, 0));
        let waited = released.elapsed();
        assert!(
            waited >= DROP_CONFIRM && waited < DROP_CONFIRM + Duration::from_millis(40),
            "{waited:?}"
        );
        // a release with no take: the stop ends the watch at once, as M3's did
        let (notes, released, thread) = confirming_loop(false, true, |_| Seen::default());
        std::thread::sleep(Duration::from_millis(30));
        notes.send(Note::Stop).unwrap();
        assert_eq!(thread.join().unwrap(), (WatchEnd::Quiet, 0));
        assert!(released.elapsed() < Duration::from_millis(60));
    }

    #[test]
    fn a_late_take_is_cancelled_at_once_on_a_watch_that_confirms_drops_too() {
        let (_notes, released, thread) = confirming_loop(false, true, |since| Seen {
            take: (since >= Duration::from_millis(10)).then_some(7),
            activated: false,
        });
        let (end, escapes) = thread.join().unwrap();
        assert!(matches!(end, WatchEnd::Late(LateDrop { escaped: true, .. })), "{end:?}");
        assert_eq!(escapes, 1);
        assert!(
            released.elapsed() < Duration::from_millis(40),
            "not held for the drop's window"
        );
    }

    #[test]
    fn a_watch_s_time_is_up_at_the_settle_without_a_take_and_at_the_drop_s_window_with_one() {
        let never = || LateWatch::around(std::thread::spawn(|| WatchEnd::Quiet));
        let watch = never();
        assert_eq!(watch.ends_at(), None);
        let at = Instant::now();
        watch.released_at.set(Some((at, false)));
        assert_eq!(watch.ends_at(), Some(at + SETTLE));
        watch.released_at.set(Some((at, true)));
        assert_eq!(watch.ends_at(), Some(at + DROP_CONFIRM));
    }

    #[test]
    fn only_an_application_s_activation_request_for_the_drop_window_confirms_the_drop() {
        use x11rb::protocol::xproto::ClientMessageEvent;
        let (active, window) = (300, 0x0120_0002);
        let request =
            |type_: u32, at: Window, source: u32| ClientMessageEvent::new(32, at, type_, [source, 77, 0, 0, 0]);
        assert!(confirms_drop(&request(active, window, 1), active, Some(window)));
        assert!(
            !confirms_drop(&request(active, window + 1, 1), active, Some(window)),
            "another window, its client's too"
        );
        assert!(
            !confirms_drop(&request(active, window, 2), active, Some(window)),
            "a pager's request"
        );
        assert!(
            !confirms_drop(&request(301, window, 1), active, Some(window)),
            "another message"
        );
        assert!(
            !confirms_drop(&request(active, window, 1), active, None),
            "a watch that does not confirm"
        );
    }

    #[test]
    fn what_is_pending_names_its_cause_and_the_refused_request() {
        let app = "Google-chrome";
        let late = WatchEnd::Late(LateDrop {
            after_release: Duration::ZERO,
            escape_after_release: Duration::ZERO,
            escaped: true,
            escaped_at: None,
        });
        assert_eq!(
            pending_refusal(app, &late, "click"),
            "Pending from your last drag, a late drag and drop: Google-chrome started a drag and drop after your drag \
             into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop; this \
             click request was not run, so read the window before sending it again"
        );
        assert_eq!(
            pending_notice(app, &WatchEnd::Unconfirmed),
            "Pending from your last drag, an unconfirmed drop: your drag into Google-chrome began a drag and drop, and \
             Google-chrome did not confirm a drop after the release, so the drop may not have landed as the drag \
             answered. Read the window before sending input again: your next input request will not be run"
        );
        assert_eq!(
            pending_refusal(app, &WatchEnd::Failed("connection lost".into()), "drag"),
            "Pending from your last drag, a failed watch: the drag-and-drop watch after your drag into Google-chrome \
             failed (connection lost), so a drop may have happened unseen and changed the desktop; this drag request \
             was not run, so read the window before sending it again"
        );
    }

    #[test]
    fn a_watch_whose_connection_fails_or_whose_round_trip_fails_ends_failed_never_quiet() {
        let (notes, inbox) = std::sync::mpsc::channel();
        notes
            .send(Note::Released {
                at: Instant::now(),
                taken: false,
            })
            .unwrap();
        let end = watch_loop(
            &inbox,
            false,
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
            false,
            || {},
            || Ok(Seen::default()),
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
        notes
            .send(Note::Released {
                at: released,
                taken: false,
            })
            .unwrap();
        let mut looks = 0;
        let mut escaped_at = None;
        let end = watch_loop(
            &inbox,
            false,
            || {},
            || {
                looks += 1;
                Ok(Seen {
                    take: (released.elapsed() >= Duration::from_millis(30)).then_some(7),
                    ..Seen::default()
                })
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
        // when it went out: a key to the target, which the exit's settle follows (settle.rs)
        let escaped_at = late.escaped_at.expect("an Escape that went out has its instant");
        assert!(escaped_at >= released + late.after_release && escaped_at <= Instant::now());
    }

    #[test]
    fn a_cancel_whose_escape_did_not_go_out_records_no_key() {
        let (notes, inbox) = std::sync::mpsc::channel();
        notes
            .send(Note::Released {
                at: Instant::now(),
                taken: false,
            })
            .unwrap();
        let end = watch_loop(&inbox, false, || {}, || Ok(took(7)), || Ok(()), |_| false);
        let WatchEnd::Late(late) = end else { panic!("{end:?}") };
        assert!(!late.escaped && late.escaped_at.is_none());
    }

    #[test]
    fn at_the_exit_a_watch_runs_out_its_lifetime_so_a_late_take_is_still_cancelled() {
        // a take 200 ms after the release, past when the drag answered: still cancelled
        let (notes, inbox) = std::sync::mpsc::channel();
        let released = Instant::now();
        notes
            .send(Note::Released {
                at: released,
                taken: false,
            })
            .unwrap();
        let thread = std::thread::spawn(move || {
            watch_loop(
                &inbox,
                false,
                || {},
                || {
                    Ok(Seen {
                        take: (released.elapsed() >= Duration::from_millis(200)).then_some(7),
                        ..Seen::default()
                    })
                },
                || Ok(()),
                |_| true,
            )
        });
        let watch = LateWatch::around(thread);
        watch.released_at.set(Some((released, false)));
        watch.run_out();
        assert!(watch.finished(), "returned only once the watch had ended");
        let WatchEnd::Late(late) = watch.stop() else {
            panic!("the late take was not cancelled")
        };
        assert!(
            late.escaped && late.after_release >= Duration::from_millis(200),
            "{late:?}"
        );
        // no take: the watch ends by itself at the settle, and the exit waits no longer
        let (notes, inbox) = std::sync::mpsc::channel();
        let released = Instant::now();
        notes
            .send(Note::Released {
                at: released,
                taken: false,
            })
            .unwrap();
        let thread =
            std::thread::spawn(move || watch_loop(&inbox, false, || {}, || Ok(Seen::default()), || Ok(()), |_| true));
        let watch = LateWatch::around(thread);
        watch.released_at.set(Some((released, false)));
        watch.run_out();
        assert!(watch.finished() && released.elapsed() >= SETTLE);
        assert!(
            released.elapsed() < SETTLE + Duration::from_millis(50),
            "{:?}",
            released.elapsed()
        );
        assert_eq!(watch.stop(), WatchEnd::Quiet);
    }

    #[test]
    fn at_the_exit_a_watch_that_does_not_end_is_waited_for_no_longer_than_its_lifetime() {
        let (wake, wedged) = std::sync::mpsc::channel::<()>();
        let thread = std::thread::spawn(move || {
            let _ = wedged.recv();
            WatchEnd::Quiet
        });
        let watch = LateWatch::around(thread);
        // released 200 ms ago: 100 ms of the settle remain
        let released = Instant::now() - Duration::from_millis(200);
        watch.released_at.set(Some((released, false)));
        let started = Instant::now();
        watch.run_out();
        assert!(!watch.finished());
        assert!(released.elapsed() >= SETTLE, "{:?}", released.elapsed());
        assert!(
            started.elapsed() < Duration::from_millis(150),
            "{:?}",
            started.elapsed()
        );
        // never told of a release: no wait at all
        let never = LateWatch::around(std::thread::spawn(|| WatchEnd::Quiet));
        let started = Instant::now();
        never.run_out();
        assert!(started.elapsed() < Duration::from_millis(5));
        wake.send(()).unwrap();
    }

    #[test]
    fn the_watch_ends_at_the_settle_counted_from_the_release() {
        let (notes, inbox) = std::sync::mpsc::channel();
        // the release 250 ms before the watch hears of it: 50 ms of the settle remain
        notes
            .send(Note::Released {
                at: Instant::now() - Duration::from_millis(250),
                taken: false,
            })
            .unwrap();
        let started = Instant::now();
        assert_eq!(
            watch_loop(&inbox, false, || {}, || Ok(Seen::default()), || Ok(()), |_| true),
            WatchEnd::Quiet
        );
        assert!(
            started.elapsed() < Duration::from_millis(120),
            "{:?}",
            started.elapsed()
        );
    }
}
