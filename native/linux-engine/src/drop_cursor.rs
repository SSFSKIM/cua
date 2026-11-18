//! Electron's drop confirmation: the drag loop's accept cursor at the release (the design session's ruling on task 73's
//! review, 2026-11-11). Electron sends no activation request when it drops (`m4/drop-signals/`: 0 of 116), and the
//! accept bit of its `XdndFinished` reaches only the source (`m4/drag-handle/`), so a drop of an Electron drag whose
//! drag and drop began, a `drag_handle`'s or a `drag`'s behind the floor, confirms only by what Chromium's drag loop
//! shows: the accept cursor its target's last status set on the drag's grab (`accept.rs` reads the same cursors).
//! Shown at the release, the drop is confirmed; any other cursor, or one that cannot be told, leaves it unconfirmed,
//! never ok.
//!
//! The cursor is read at the release itself, not sampled before it: just before the button goes up, the engine asks
//! the server which cursor is shown now, with its image and name ([`DropCursor::at_release`]). That cursor is the
//! accept when its own image is one of Chromium's accepting drag cursors, as the installed Xcursor themes draw them and
//! no theme draws a refusing one (`drag_cursors.rs`), and it carries no XFixes name and is not the image the watch
//! began on ([`judge`]). An image is never taken for the accept because it differs from the ones shown before it: the
//! fix wave's rule did that, and with no drag loop cursor seen and a first status that already accepted, it read a
//! path's later no-drop as the accept (the second review, P1; the design session's ruling, 2026-11-11). So the history
//! of the drag's cursors decides nothing; a thread of the watch's own, on its own connection, still keeps every change
//! from before the press with the images it fetches, for the `--stats` record. Whether an accept can be stale at the
//! release, as Chrome's was in task 69's press-inside control, is what the controls measure.
//!
//! An accept confirms only a release over a window that takes drag and drop ([`over_drop_target`]), and only one set
//! after the drag last came into that window ([`set_since_entry`]; the third review of task 73, P2). Chromium resets
//! its negotiated operation when its target changes but leaves the cursor as the last status set it, and updates it
//! only on the new target's own status (`XDragDropClient::ProcessMouseMove`, `OnXdndStatus`, which ignores a status from
//! any window but the current target): released over a drop target that has not answered yet, a slow or a hung one, it
//! drops nothing and still shows the accept of the window before. So the watch also reads the real pointer's motions
//! (XInput 2 raw motion, which reaches every client that selects it whoever holds the grab) on the same connection as
//! the cursor's changes, so the server orders the two, and the accept counts only when the change that put it up
//! follows the motion that brought the pointer into the top-level under the release, never on a guess.
//!
//! The accept shown at the release is the application's, not the pointer's (M5, task 98: `linux-engine-v0.4.0` answered
//! ok for a release outside the drop zone on arm64 at twice the load, evidence `m5/arm64/pilot/l4a-rate/`). Chromium's
//! drag loop puts the accept up when it handles a motion, with what the page last answered for an earlier one
//! (`XDragDropClient::ProcessMouseMove`, `WebContentsViewAura::OnDragUpdated`, which answers the operation it holds and
//! only then asks the page), and it acts on the release when it reads it, after every motion queued before it. A loop
//! that runs behind the pointer still shows, at the instant the release is sent, the accept of a place the pointer has
//! left. So the engine asks the application itself where it has got to ([`DropCursor::sync`]: a `_NET_WM_PING`, which
//! Chromium answers on the thread that runs its drag loop, in the order of its events), twice: once before the last
//! rest, so the loop has handled the pointer's arrival and the page has the rest to answer it, and once after the
//! last motion, so the cursor read then is what the loop holds when the release reaches it. An accept counts only when
//! both were answered with the pointer at rest between them ([`settled`]); an application that does not answer in
//! time leaves the drop unconfirmed, never ok.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask, SelectionEventMask};
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{
    Atom, AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, Window,
};
use x11rb::rust_connection::RustConnection;

use crate::accept::{CursorChange, Image, fingerprint};
use crate::drag_cursors::DragImages;

/// How often the watch's thread reads the changes that have come.
const POLL: Duration = Duration::from_millis(1);

/// How long the application may take to answer a [`DropCursor::sync`] and still have its accept count. The lag is the
/// application's own: task 98's cold handles at twice the load on arm64 ran up to about 100 ms behind the pointer
/// (the accept of the zone put up 5 ms after a release the pointer had reached 65 ms earlier), and 150 ms is the bound
/// Chrome's own confirmation has (`dnd::DROP_CONFIRM`). Past it the release goes out anyway and the drop is unconfirmed.
pub const SYNC_BOUND: Duration = Duration::from_millis(150);

/// How often a sync looks for its answer.
const SYNC_POLL: Duration = Duration::from_micros(200);

/// One thing the watch read, in the server's order: a motion of the real pointer, with where it went (None when that
/// cannot be told: a device whose motion is relative, such as a person's mouse, or a motion missing an axis), a
/// change of the displayed cursor, by its serial, or the application's answer to a sync, by its token.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Motion(Option<(i16, i16)>),
    Cursor(u32),
    Answer(u32),
}

/// What the application answered to a sync.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sync {
    /// It answered, this long after it was asked: it has handled every event the server sent it before the question.
    Answered { token: u32, waited: Duration },
    /// No answer inside the bound.
    Unanswered { token: u32 },
    /// It cannot be asked: the watch has no window of its, the window lists no `_NET_WM_PING`, or the send failed.
    Unasked,
}

impl Sync {
    pub fn token(self) -> Option<u32> {
        match self {
            Sync::Answered { token, .. } => Some(token),
            Sync::Unanswered { .. } | Sync::Unasked => None,
        }
    }

    /// The `--stats` record.
    pub fn record(self) -> Value {
        match self {
            Sync::Answered { waited, .. } => json!({ "answered": true, "ms": waited.as_secs_f64() * 1000.0 }),
            Sync::Unanswered { .. } => json!({ "answered": false }),
            Sync::Unasked => json!({ "asked": false }),
        }
    }
}

/// Whether the application's cursor at the release is its answer for where the pointer rests: `steps` what the watch
/// read, in the server's order; `before` the sync asked before the release's last rest, `after` the one asked after its
/// last motion. Both must have been answered, in that order; the pointer must have been at one place from the first
/// answer on, and visited again there before the second, on a route that moves the real pointer (`placed`: XTEST, whose
/// motions the watch reads): every motion after the first answer placed, and at the same place, at least one of them,
/// and none after the second answer. A person's motion, or one that cannot be placed, is not that. Then the application
/// had handled the pointer's arrival before the rest, the page had the rest to answer it, and the cursor shown after the
/// second answer is what the drag loop holds for that place when the release reaches it. On the background route the
/// drag's motions are synthetic and the watch reads none of them, so the two answers alone decide.
pub fn settled(steps: &[Step], before: Sync, after: Sync, placed: bool) -> bool {
    let (Some(before), Some(after)) = (before.token(), after.token()) else {
        return false;
    };
    let at = |token: u32| steps.iter().position(|&step| step == Step::Answer(token));
    let (Some(first), Some(second)) = (at(before), at(after)) else {
        return false;
    };
    if second <= first {
        return false;
    }
    if !placed {
        return true;
    }
    let mut rest = None;
    for (k, step) in steps.iter().enumerate().skip(first) {
        let Step::Motion(place) = *step else {
            continue;
        };
        let (Some(place), true) = (place, k < second) else {
            return false;
        };
        if *rest.get_or_insert(place) != place {
            return false;
        }
    }
    rest.is_some()
}

/// A sync's token, its own among this engine's syncs ([`token`]).
fn next_token() -> u32 {
    use std::sync::atomic::AtomicU32;
    static NEXT: AtomicU32 = AtomicU32::new(0);
    token(std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed))
}

/// The token of an engine process's `count`-th sync. The answers go to the root, where the window manager reads its
/// own pings' and every watch reads them all, so a token must not be one the window manager is waiting for, nor
/// another engine's. Its top bit is set: Openbox numbers its pings from 1 (`openbox/ping.c`, `ping_next_id`), and a
/// window manager that sends the server's time (mutter, KWin, xfwm4) reaches that half of the range only on a server up
/// for more than 24 days, and then matches one token in 2^31 by chance. Below it the process id's low 15 bits, then
/// the count's low 16. Were a token ever a window manager's, the worst it reads is that an application which has just
/// answered a ping is alive.
pub fn token(pid: u32, count: u32) -> u32 {
    0x8000_0000 | (pid & 0x7fff) << 16 | (count & 0xffff)
}

/// What the thread has seen: every change, every step in order, and the image of each cursor it fetched while shown,
/// by serial.
#[derive(Default)]
struct Seen {
    changes: Vec<CursorChange>,
    steps: Vec<Step>,
    /// Each step's time on the server's clock, beside it (an answer carries none: zero).
    times: Vec<u32>,
    images: HashMap<u32, Image>,
    failed: Option<String>,
    /// The XTEST pointer device, whose raw motions place the pointer.
    xtest: Option<u16>,
    /// The application's window a sync asks, with the atoms of its question (`WM_PROTOCOLS`, `_NET_WM_PING`).
    ping: Option<(Window, Atom, Atom)>,
    /// Whether any client took `XdndSelection` since the watch began: a drag and drop began.
    taken: bool,
}

/// The displayed cursor, and the real pointer's motions, watched from before a drag's press to its release, for its
/// drop's confirmation.
pub struct DropCursor {
    conn: Arc<RustConnection>,
    seen: Arc<Mutex<Seen>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    /// The image shown when the watch began.
    initial: Image,
    /// Where the real pointer was when the watch began (None: on another screen).
    start: Option<(i16, i16)>,
    /// Chromium's drag cursors as the installed themes draw them, read once for the engine's life.
    images: &'static DragImages,
    /// The last sync's token: each has its own.
    token: u32,
}

/// The cursor at a release, and what it says of the drop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtRelease {
    /// Whether the accept was shown: None when it cannot be told (no installed theme tells an accept apart, no take, or
    /// the read failed), which confirms nothing.
    pub accepted: Option<bool>,
    /// The cursor shown at the release: its serial, its image, and whether it carries an XFixes name.
    pub shown: Option<(u32, Image, bool)>,
    /// Every change the watch saw, in order: serial, server time, named, and its image when fetched.
    pub history: Vec<(u32, u32, bool, Option<Image>)>,
    /// The image shown when the watch began.
    pub initial: Image,
    /// How long the read at the release took, the thread's stop included.
    pub read: Duration,
    pub error: Option<String>,
    /// The take the accept was judged against, the server's time.
    pub take: Option<u32>,
    /// Every motion, cursor change and answer the watch read, in the server's order ([`set_since_entry`], [`settled`]).
    pub steps: Vec<Step>,
    /// Each step's time on the server's clock (zero for an answer, which carries none).
    pub times: Vec<u32>,
    /// Where the real pointer was when the watch began.
    pub start: Option<(i16, i16)>,
}

impl AtRelease {
    /// The `--stats` record (#364's tallies read it).
    pub fn record(&self) -> Value {
        let hex = |image: Image| format!("{image:016x}");
        let motions: Vec<_> = self
            .steps
            .iter()
            .filter_map(|step| match step {
                Step::Motion(place) => Some(place),
                Step::Cursor(_) | Step::Answer(_) => None,
            })
            .collect();
        // the whole of what the watch read, in the server's order with its clock: a motion `["m", time, x, y]` (no
        // place: nulls), a cursor change `["c", time, serial]`, an answer `["a", token]`
        let steps: Vec<_> = self
            .steps
            .iter()
            .zip(&self.times)
            .map(|(step, &time)| match *step {
                Step::Motion(place) => json!(["m", time, place.map(|p| p.0), place.map(|p| p.1)]),
                Step::Cursor(serial) => json!(["c", time, serial]),
                Step::Answer(token) => json!(["a", token]),
            })
            .collect();
        json!({
            "steps": steps,
            "accepted": self.accepted,
            "shown": self.shown.map(|(serial, image, named)| json!({ "serial": serial, "image": hex(image), "named": named })),
            "initial": hex(self.initial),
            "history": self.history.iter().map(|&(serial, time, named, image)| json!([serial, time, named, image.map(hex)])).collect::<Vec<_>>(),
            "take_time": self.take,
            "read_ms": self.read.as_secs_f64() * 1000.0,
            "error": self.error,
            "start": self.start,
            "motions": motions.len(),
            "last_motions": motions[motions.len().saturating_sub(4)..],
        })
    }

    /// Whether the cursor shown at the release was put up after the real pointer last came into the window under the
    /// release, `inside` telling the places in that window ([`set_since_entry`]); false when nothing was shown.
    pub fn set_since_entry(&self, inside: impl Fn((i16, i16)) -> bool) -> bool {
        self.shown
            .is_some_and(|(serial, _, _)| set_since_entry(&self.steps, self.start, serial, inside))
    }
}

/// Whether the cursor `serial` was put up after the real pointer last came into a window: `steps` the motions and
/// cursor changes the watch read, in the server's order; `start` where the pointer was when the watch began, before
/// every step; `inside` whether a place is in the window. A place that cannot be told counts as outside it. The entry is
/// the first motion after the last place outside the window; with none outside, the pointer was in the window from the
/// watch's start, and any change the watch read counts. The cursor's last change must come after the entry in the
/// server's order: a change before it (another window's status, kept on display by a target that has not answered), or
/// none the watch read (the cursor it began on), never counts; nor does any change when the pointer last left the window
/// with no motion back into it.
pub fn set_since_entry(
    steps: &[Step],
    start: Option<(i16, i16)>,
    serial: u32,
    inside: impl Fn((i16, i16)) -> bool,
) -> bool {
    let Some(set) = steps.iter().rposition(|&step| step == Step::Cursor(serial)) else {
        return false;
    };
    let outside = |place: Option<(i16, i16)>| !place.is_some_and(&inside);
    let motion_after = |from: usize| {
        steps[from..]
            .iter()
            .position(|step| matches!(step, Step::Motion(_)))
            .map(|k| from + k)
    };
    let last_outside = steps
        .iter()
        .rposition(|&step| matches!(step, Step::Motion(place) if outside(place)));
    let entry = match last_outside {
        Some(left) => motion_after(left + 1),
        None if outside(start) => motion_after(0),
        // in the window from the watch's start on
        None => return true,
    };
    entry.is_some_and(|entry| set > entry)
}

impl DropCursor {
    /// [`DropCursor::start_for`] with no application to ask.
    #[cfg(test)]
    pub fn start() -> Result<DropCursor> {
        Self::start_for(None)
    }

    /// Whether any client took `XdndSelection` since the watch began, from what has been read so far: a drag and drop
    /// began, so the release is worth a sync.
    pub fn take_seen(&self) -> bool {
        self.seen.lock().expect("the engine never panics holding it").taken
    }

    /// The application asked where it has got to, and its answer waited for, at most `bound`: a `_NET_WM_PING` to its
    /// window with a token of this sync's own, which a client that lists the protocol sends on to the root unchanged
    /// (EWMH; Chromium does it in `X11Window::HandleEvent`, on the thread that runs its drag loop). The server gives a
    /// client its events in order, so the answer says that the application has handled every event sent to it before
    /// the question: every motion the engine's requests had made by then, and what its drag loop did for them, whose
    /// cursor changes reach this watch before the answer does (its requests run in the order it made them). The answer
    /// is a step of the watch, in the server's order with the motions and the cursor's changes ([`settled`]).
    pub fn sync(&mut self, bound: Duration) -> Sync {
        let Some((window, protocols, ping)) = self.seen.lock().expect("the engine never panics holding it").ping else {
            return Sync::Unasked;
        };
        self.token = next_token();
        let token = self.token;
        let asked = Instant::now();
        let question = ClientMessageEvent::new(32, window, protocols, [ping, token, window, 0, 0]);
        let sent = self
            .conn
            .send_event(false, window, EventMask::NO_EVENT, question)
            .map_err(anyhow::Error::from)
            .and_then(|_| Ok(self.conn.flush()?));
        if sent.is_err() {
            return Sync::Unasked;
        }
        loop {
            // once the thread is stopped the caller reads the connection itself
            if self.thread.is_none() && read_changes(&self.conn, &self.seen).is_err() {
                return Sync::Unanswered { token };
            }
            let answered = {
                let seen = self.seen.lock().expect("the engine never panics holding it");
                seen.failed.is_none() && seen.steps.contains(&Step::Answer(token))
            };
            if answered {
                return Sync::Answered {
                    token,
                    waited: asked.elapsed(),
                };
            }
            if asked.elapsed() >= bound {
                return Sync::Unanswered { token };
            }
            std::thread::sleep(SYNC_POLL);
        }
    }

    /// Connected and subscribed to the root's displayed-cursor changes and to the real pointer's raw motion (XInput 2.1
    /// or later, so a grab does not hide it), the image shown now and the pointer's place kept, and the thread begun.
    /// `app` is the window of the application whose drag loop shows the cursor, the one a [`DropCursor::sync`] asks: it
    /// is asked only when it lists `_NET_WM_PING` in its `WM_PROTOCOLS`, and its answers, sent to the root, are read
    /// with the cursor's changes (the root's `SubstructureNotify`). Takes of `XdndSelection` are read too.
    pub fn start_for(app: Option<Window>) -> Result<DropCursor> {
        let (conn, screen) = x11rb::connect(None).context("the drop's cursor watch could not connect")?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(5, 0)?
            .reply()
            .context("the drop's cursor watch needs the XFixes extension")?;
        let version = conn
            .xinput_xi_query_version(2, 2)
            .map_err(anyhow::Error::from)
            .and_then(|c| Ok(c.reply()?))
            .context("the drop's cursor watch needs the XInput 2 extension")?;
        anyhow::ensure!(
            (version.major_version, version.minor_version) >= (2, 1),
            "the drop's cursor watch needs XInput 2.1 or later; the server has {}.{}",
            version.major_version,
            version.minor_version
        );
        // the XTEST pointer's motions are absolute, so they say where the pointer went; another device's may not
        let xtest = conn
            .xinput_xi_query_device(u16::from(xinput::Device::ALL))?
            .reply()?
            .infos
            .iter()
            .find(|d| d.type_ == xinput::DeviceType::SLAVE_POINTER && d.name.ends_with(b"XTEST pointer"))
            .map(|d| d.deviceid);
        conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?
            .check()?;
        conn.xinput_xi_select_events(
            root,
            &[xinput::EventMask {
                deviceid: u16::from(xinput::Device::ALL_MASTER),
                mask: vec![xinput::XIEventMask::RAW_MOTION],
            }],
        )?
        .check()?;
        // a drag and drop's start, for whether the release is worth a sync
        let selection = conn.intern_atom(false, b"XdndSelection")?.reply()?.atom;
        conn.xfixes_select_selection_input(root, selection, SelectionEventMask::SET_SELECTION_OWNER)?
            .check()?;
        // the application's window to ask, when it answers pings: its answers come to the root
        let ping = match app {
            Some(window) => {
                let protocols = conn.intern_atom(false, b"WM_PROTOCOLS")?.reply()?.atom;
                let ping = conn.intern_atom(false, b"_NET_WM_PING")?.reply()?.atom;
                let listed = conn
                    .get_property(false, window, protocols, AtomEnum::ATOM, 0, 64)?
                    .reply()
                    .ok()
                    .and_then(|reply| reply.value32().map(|mut atoms| atoms.any(|atom| atom == ping)))
                    .unwrap_or(false);
                if listed {
                    conn.change_window_attributes(
                        root,
                        &ChangeWindowAttributesAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
                    )?
                    .check()?;
                }
                listed.then_some((window, protocols, ping))
            }
            None => None,
        };
        let pointer = conn.query_pointer(root)?.reply()?;
        let start = pointer.same_screen.then_some((pointer.root_x, pointer.root_y));
        let now = conn.xfixes_get_cursor_image()?.reply()?;
        let initial = fingerprint(now.width, now.height, now.xhot, now.yhot, &now.cursor_image);
        let conn = Arc::new(conn);
        let seen = Arc::new(Mutex::new(Seen {
            xtest,
            ping,
            ..Seen::default()
        }));
        seen.lock()
            .expect("not shared yet")
            .images
            .insert(now.cursor_serial, initial);
        let stop = Arc::new(AtomicBool::new(false));
        let thread = {
            let (conn, seen, stop) = (conn.clone(), seen.clone(), stop.clone());
            std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    if let Err(error) = read_changes(&conn, &seen) {
                        seen.lock().expect("the engine never panics holding it").failed = Some(format!("{error:#}"));
                        return;
                    }
                    std::thread::sleep(POLL);
                }
            })
        };
        Ok(DropCursor {
            conn,
            seen,
            stop,
            thread: Some(thread),
            initial,
            start,
            images: DragImages::installed(),
            token: 0,
        })
    }

    /// Just before the release, for a drag and drop whose source took `XdndSelection` (at server time `take`, which
    /// the record keeps): the thread stopped, the cursor shown now read with its image and name, the changes before it
    /// read in, and the accept judged by that image ([`judge`]).
    pub fn at_release(&mut self, take: Option<u32>) -> AtRelease {
        let started = Instant::now();
        self.stop();
        let shown = self
            .conn
            .xfixes_get_cursor_image_and_name()
            .map_err(anyhow::Error::from)
            .and_then(|c| {
                let reply = c.reply()?;
                let image = fingerprint(reply.width, reply.height, reply.xhot, reply.yhot, &reply.cursor_image);
                Ok((reply.cursor_serial, image, reply.cursor_atom != x11rb::NONE))
            });
        // every change the server made before that reply has arrived by now
        let read = shown.and_then(|shown| read_changes(&self.conn, &self.seen).map(|()| shown));
        let mut seen = self.seen.lock().expect("the thread has ended");
        if let Ok((serial, image, _)) = read {
            seen.images.insert(serial, image);
        }
        let error = match (&read, &seen.failed) {
            (Err(error), _) => Some(format!("{error:#}")),
            (Ok(_), Some(failed)) => Some(failed.clone()),
            (Ok(_), None) => None,
        };
        let shown = read.ok();
        let accepted = match (shown, take, &error) {
            (Some((_, image, named)), Some(_), None) => judge(self.images, self.initial, (image, named)),
            _ => None,
        };
        AtRelease {
            accepted,
            shown,
            history: seen
                .changes
                .iter()
                .map(|c| (c.serial, c.time, c.named, seen.images.get(&c.serial).copied()))
                .collect(),
            initial: self.initial,
            read: started.elapsed(),
            error,
            take,
            steps: std::mem::take(&mut seen.steps),
            times: std::mem::take(&mut seen.times),
            start: self.start,
        }
    }
}

impl DropCursor {
    /// The thread stopped (at most a poll's wait), so the caller reads the connection's events itself from here on.
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for DropCursor {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The changes and motions that have arrived, read in, in order, and the image shown now fetched when a change's cursor
/// is not known yet.
fn read_changes(conn: &RustConnection, seen: &Mutex<Seen>) -> Result<()> {
    let mut unknown = false;
    let mut changes = Vec::new();
    let mut steps = Vec::new();
    let mut times = Vec::new();
    let mut taken = false;
    let (xtest, ping) = {
        let seen = seen.lock().expect("the engine never panics holding it");
        (seen.xtest, seen.ping)
    };
    while let Some(event) = conn.poll_for_event()? {
        match event {
            Event::XfixesCursorNotify(e) => {
                steps.push(Step::Cursor(e.cursor_serial));
                times.push(e.timestamp);
                changes.push(CursorChange {
                    serial: e.cursor_serial,
                    time: e.timestamp,
                    named: e.name != x11rb::NONE,
                    seen: Instant::now(),
                });
            }
            Event::XinputRawMotion(e) => {
                steps.push(Step::Motion(raw_place(&e, xtest)));
                times.push(e.time);
            }
            Event::XfixesSelectionNotify(e) => taken |= e.owner != x11rb::NONE,
            // the application's answer to a sync: the question itself, sent on to the root
            Event::ClientMessage(e) => {
                if let Some((window, protocols, question)) = ping
                    && e.format == 32
                    && e.type_ == protocols
                {
                    let data = e.data.as_data32();
                    if data[0] == question && data[2] == window {
                        steps.push(Step::Answer(data[1]));
                        times.push(0);
                    }
                }
            }
            _ => {}
        }
    }
    {
        let mut seen = seen.lock().expect("the engine never panics holding it");
        for change in &changes {
            unknown |= !seen.images.contains_key(&change.serial);
        }
        seen.changes.extend(changes);
        seen.steps.extend(steps);
        seen.times.extend(times);
        seen.taken |= taken;
    }
    if unknown {
        let reply = conn.xfixes_get_cursor_image()?.reply()?;
        let image = fingerprint(reply.width, reply.height, reply.xhot, reply.yhot, &reply.cursor_image);
        seen.lock()
            .expect("the engine never panics holding it")
            .images
            .insert(reply.cursor_serial, image);
    }
    Ok(())
}

/// Where a raw motion put the pointer: only the XTEST pointer's (`xtest`) are placed, whose valuators are the absolute
/// root position the motion asked for (the server keeps the asked values as the raw ones); a person's mouse moves
/// relatively, so its raw values are no place. A motion missing an axis is no place either.
fn raw_place(e: &xinput::RawMotionEvent, xtest: Option<u16>) -> Option<(i16, i16)> {
    if xtest != Some(e.sourceid) || e.valuator_mask.first().is_none_or(|mask| mask & 0b11 != 0b11) {
        return None;
    }
    let axis = |k: usize| i16::try_from(e.axisvalues_raw.get(k)?.integral).ok();
    Some((axis(0)?, axis(1)?))
}

/// What the cursor's judgment (`accepted`, [`judge`]'s) says of a drop released over a top-level that takes drag and
/// drop (`aware`: the managed top-level under the release, past the drag image, carries `XdndAware`) or not. Chromium
/// keeps its last status's accept when the path leaves for a window that takes none, the bare root or an xterm, and
/// ends with that operation though nothing received the drop (the second fix wave's pilot: 3 of 3 desktop drags to the
/// bare root showed the accept and answered ok). So an accept confirms only over such a window (the design session's
/// ruling, 2026-11-11), and only one put up after the pointer came into it (`since_entry`, [`set_since_entry`]): a
/// target that has not answered yet leaves the window before's accept on display (the third review, P2). This can turn
/// a confirmation into unconfirmed, never the reverse.
pub fn over_drop_target(accepted: Option<bool>, aware: bool, since_entry: bool) -> Option<bool> {
    match accepted {
        Some(true) => Some(aware && since_entry),
        other => other,
    }
}

/// Whether the cursor shown at the release, `shown` (its image, and whether it carries an XFixes name), is the drag
/// loop's accept, by its own image: one `images` knows as an accepting drag cursor (`drag_cursors.rs`), not the image
/// shown when the watch began (`initial`), and unnamed, since a named cursor is another client's theme cursor. None when
/// no installed theme tells an accept apart at all. What was shown before the release decides nothing (module header).
pub fn judge(images: &DragImages, initial: Image, shown: (Image, bool)) -> Option<bool> {
    if !images.any_accept() {
        return None;
    }
    let (image, named) = shown;
    Some(!named && image != initial && images.accepts(image))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The images of task 73's sittings: the arrow before the press, the no-drop status's (breeze_cursors' `dnd-none`,
    /// also its `dnd-move` and its grabbing hand, the drag loop's), and the accept's (its `dnd-copy`).
    const ARROW: Image = 0xb46b;
    const NONE: Image = 0xbd1d;
    const ACCEPT: Image = 0x1dc3;

    fn breeze() -> DragImages {
        DragImages::of(&[ACCEPT, NONE], &[NONE, ARROW])
    }

    #[test]
    fn the_accept_shown_at_the_release_confirms_and_any_other_cursor_does_not() {
        assert_eq!(judge(&breeze(), ARROW, (ACCEPT, false)), Some(true));
        assert_eq!(
            judge(&breeze(), ARROW, (NONE, false)),
            Some(false),
            "no drop at the release: the path left the zone"
        );
        assert_eq!(judge(&breeze(), ARROW, (ARROW, false)), Some(false), "the arrow");
        assert_eq!(
            judge(&breeze(), ARROW, (ACCEPT, true)),
            Some(false),
            "another client's named cursor"
        );
        assert_eq!(
            judge(&breeze(), ACCEPT, (ACCEPT, false)),
            Some(false),
            "the image the watch began on"
        );
        assert_eq!(
            judge(&breeze(), ARROW, (0x7777, false)),
            Some(false),
            "an image no theme draws as an accept, however it differs from the others"
        );
    }

    #[test]
    fn a_no_drop_shown_at_the_release_never_confirms_whatever_came_first() {
        // the review of the fix wave (P1): no loop cursor seen, the first status already accepting, then the path
        // leaves; the fix wave's rule took the accept for the loop's and the no-drop at the release for the accept
        assert_eq!(judge(&breeze(), ARROW, (NONE, false)), Some(false));
    }

    #[test]
    fn the_accept_shown_at_the_release_confirms_whatever_came_first() {
        // the same start, then the path comes back to the zone: the fix wave's rule excluded the accept as the loop's
        assert_eq!(judge(&breeze(), ARROW, (ACCEPT, false)), Some(true));
    }

    #[test]
    fn a_move_drawn_as_no_drop_never_confirms() {
        // breeze_cursors' dnd-move is its dnd-none: an accepting cursor's image, but a refusing one's too
        assert!(!breeze().accepts(NONE));
        assert_eq!(judge(&breeze(), ARROW, (NONE, false)), Some(false));
    }

    #[test]
    fn an_accept_confirms_only_over_a_window_that_takes_drops() {
        // the second fix wave's pilot: a drag that left for the bare root kept Chromium's last accept to the release
        assert_eq!(over_drop_target(Some(true), true, true), Some(true));
        assert_eq!(
            over_drop_target(Some(true), false, true),
            Some(false),
            "no XdndAware top-level under the release: the bare root, an xterm"
        );
        // the third review (P2): an accept put up before the pointer came into the window under the release is the
        // window before's, kept on display by a target that has not answered
        assert_eq!(over_drop_target(Some(true), true, false), Some(false));
        assert_eq!(over_drop_target(Some(false), true, true), Some(false));
        assert_eq!(over_drop_target(Some(false), false, false), Some(false));
        assert_eq!(over_drop_target(None, true, true), None, "not told stays not told");
        assert_eq!(over_drop_target(None, false, false), None);
    }

    /// The window of these steps: x from 100 on (the sink right of the zone's window, as in the `slow` cell).
    fn in_sink((x, _): (i16, i16)) -> bool {
        x >= 100
    }

    const ACCEPTED: u32 = 7;

    #[test]
    fn an_accept_put_up_before_the_pointer_came_into_the_window_under_the_release_never_counts() {
        use Step::{Cursor, Motion};
        // the third review's P2: accepted in the zone, then into a drop target that never answers; the accept on
        // display is the zone's
        let slow = [
            Motion(Some((40, 10))),
            Cursor(ACCEPTED),
            Motion(Some((60, 10))),
            Motion(Some((120, 10))),
            Motion(Some((130, 10))),
        ];
        assert!(!set_since_entry(&slow, Some((30, 10)), ACCEPTED, in_sink));
        // the same accept put up again, but before the motion that came in: still the zone's (the server's order)
        let raced = [Motion(Some((60, 10))), Cursor(ACCEPTED), Motion(Some((120, 10)))];
        assert!(!set_since_entry(&raced, Some((30, 10)), ACCEPTED, in_sink));
    }

    #[test]
    fn an_accept_put_up_after_the_pointer_came_into_the_window_counts() {
        use Step::{Cursor, Motion};
        // the window under the release answered: its status put up the accept after the motion that came in
        let answered = [
            Motion(Some((60, 10))),
            Motion(Some((120, 10))),
            Cursor(ACCEPTED),
            Motion(Some((130, 10))),
        ];
        assert!(set_since_entry(&answered, Some((30, 10)), ACCEPTED, in_sink));
        // a path that went into it, out again and back: only the last entry counts
        let back = [
            Motion(Some((120, 10))),
            Cursor(ACCEPTED),
            Motion(Some((60, 10))),
            Motion(Some((120, 10))),
        ];
        assert!(!set_since_entry(&back, Some((30, 10)), ACCEPTED, in_sink));
        let back_and_answered = [
            Motion(Some((60, 10))),
            Motion(Some((120, 10))),
            Cursor(9),
            Cursor(ACCEPTED),
        ];
        assert!(set_since_entry(&back_and_answered, Some((150, 10)), ACCEPTED, in_sink));
    }

    #[test]
    fn a_drag_inside_one_window_from_the_watch_s_start_counts_any_change_the_watch_read() {
        use Step::{Cursor, Motion};
        // every drop of the earlier waves: the source's own window is the one under the release
        let within = [Motion(Some((140, 10))), Cursor(ACCEPTED), Motion(Some((150, 10)))];
        assert!(set_since_entry(&within, Some((130, 10)), ACCEPTED, in_sink));
        assert!(
            set_since_entry(&[Cursor(ACCEPTED)], Some((130, 10)), ACCEPTED, in_sink),
            "no motion at all"
        );
        // but never a cursor the watch did not see put up: the one it began on
        assert!(!set_since_entry(&within, Some((130, 10)), 9, in_sink));
        assert!(!set_since_entry(&[], Some((130, 10)), ACCEPTED, in_sink));
    }

    #[test]
    fn a_place_that_cannot_be_told_counts_as_outside_the_window() {
        use Step::{Cursor, Motion};
        // a person's mouse (relative, no place) after the accept: the pointer may have left and come back
        let person = [Motion(Some((120, 10))), Cursor(ACCEPTED), Motion(None)];
        assert!(!set_since_entry(&person, Some((30, 10)), ACCEPTED, in_sink));
        // a start that cannot be told, and no motion after it into the window
        assert!(!set_since_entry(&[Cursor(ACCEPTED)], None, ACCEPTED, in_sink));
        // the pointer left the window last, with no motion back: what is under the release came some other way
        let left = [Cursor(ACCEPTED), Motion(Some((60, 10)))];
        assert!(!set_since_entry(&left, Some((120, 10)), ACCEPTED, in_sink));
    }

    #[test]
    fn with_no_accept_told_apart_nothing_is_judged() {
        assert_eq!(judge(&DragImages::of(&[], &[]), ARROW, (ACCEPT, false)), None);
        assert_eq!(
            judge(&DragImages::of(&[NONE], &[NONE]), ARROW, (NONE, false)),
            None,
            "every accepting image drawn as no drop"
        );
    }

    const BEFORE: Sync = Sync::Answered {
        token: 41,
        waited: Duration::from_millis(1),
    };
    const AFTER: Sync = Sync::Answered {
        token: 42,
        waited: Duration::from_millis(1),
    };

    #[test]
    fn an_accept_counts_only_when_the_application_answered_before_the_rest_and_after_the_last_motion() {
        use Step::{Answer, Cursor, Motion};
        // a handle's end: the arrival, the first answer, the rest, the revisit (its status the accept), the second
        let rest = [
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
        ];
        assert!(settled(&rest, BEFORE, AFTER, true));
        // task 98's false ok: the accept of the zone on display, the application not yet at the pointer's last motion
        let behind = [
            Motion(Some((640, 128))),
            Cursor(ACCEPTED),
            Motion(Some((500, 128))),
            Answer(41),
            Motion(Some((500, 128))),
        ];
        assert!(
            !settled(&behind, BEFORE, Sync::Unanswered { token: 42 }, true),
            "no answer after the last motion"
        );
        assert!(
            !settled(&behind, BEFORE, AFTER, true),
            "an answer the watch never read is none"
        );
        // no answer before the rest: the application may have handled the arrival and the revisit as one motion,
        // with nothing from the page between
        let late = [Motion(Some((500, 128))), Motion(Some((500, 128))), Answer(42)];
        assert!(!settled(&late, Sync::Unanswered { token: 41 }, AFTER, true));
        assert!(
            !settled(&late, Sync::Unasked, AFTER, true),
            "an application that cannot be asked"
        );
        assert!(!settled(&rest, BEFORE, Sync::Unasked, true));
        // the answers in the wrong order, or one answer given for both
        assert!(!settled(&rest, AFTER, BEFORE, true));
        assert!(!settled(&rest, BEFORE, BEFORE, true));
    }

    #[test]
    fn the_pointer_must_rest_at_one_place_between_the_answers_and_be_visited_again_there() {
        use Step::{Answer, Cursor, Motion};
        // the pointer still on its way after the first answer: the page has not had the rest for where it ends
        let moving = [
            Answer(41),
            Motion(Some((516, 128))),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
        ];
        assert!(!settled(&moving, BEFORE, AFTER, true));
        // a person's mouse during the rest: a motion with no place
        let person = [Answer(41), Motion(None), Motion(Some((500, 128))), Answer(42)];
        assert!(!settled(&person, BEFORE, AFTER, true));
        // a motion after the second answer: the cursor read may not be the application's answer to it
        let after = [
            Answer(41),
            Motion(Some((500, 128))),
            Answer(42),
            Motion(Some((500, 128))),
        ];
        assert!(!settled(&after, BEFORE, AFTER, true));
        // no revisit between the answers: no status the page's answer could have changed
        assert!(!settled(
            &[Motion(Some((500, 128))), Answer(41), Answer(42)],
            BEFORE,
            AFTER,
            true
        ));
        // cursor changes anywhere do not unsettle it
        let changes = [
            Answer(41),
            Cursor(9),
            Motion(Some((500, 128))),
            Motion(Some((500, 128))),
            Cursor(ACCEPTED),
            Answer(42),
            Cursor(9),
        ];
        assert!(settled(&changes, BEFORE, AFTER, true));
    }

    #[test]
    fn a_sync_s_token_is_never_a_small_number_a_window_manager_counts_its_pings_by() {
        // Openbox numbers its pings from 1; the engine's tokens keep to the top half of the range, whatever the
        // process id and however many syncs came before
        for (pid, count) in [(0, 0), (1, 1), (0x8000, 0), (0xffff_ffff, 0xffff_ffff), (65536, 70000)] {
            assert!(token(pid, count) >= 0x8000_0000, "{pid} {count}");
        }
        assert_ne!(token(7, 1), token(7, 2), "each sync its own");
        assert_ne!(token(7, 1), token(8, 1), "each engine its own");
    }

    #[test]
    fn on_the_background_route_the_two_answers_alone_decide() {
        use Step::{Answer, Motion};
        // the drag's motions are synthetic there, and the watch reads none of them
        assert!(settled(&[Answer(41), Answer(42)], BEFORE, AFTER, false));
        assert!(settled(&[Answer(41), Motion(None), Answer(42)], BEFORE, AFTER, false));
        assert!(!settled(&[Answer(42), Answer(41)], BEFORE, AFTER, false));
        assert!(!settled(&[Answer(41)], BEFORE, AFTER, false));
    }

    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn a_sync_is_answered_by_a_window_that_answers_pings_and_not_by_one_that_does_not() {
        use x11rb::protocol::xproto::{CreateWindowAux, PropMode, WindowClass};
        use x11rb::wrapper::ConnectionExt as _;
        // an application's window that answers `_NET_WM_PING` as the window managers' protocol asks: the same message
        // sent on to the root
        let (app, screen) = x11rb::connect(None).unwrap();
        let root = app.setup().roots[screen].root;
        let make = || {
            let window = app.generate_id().unwrap();
            let (class, parent) = (WindowClass::INPUT_OUTPUT, x11rb::COPY_FROM_PARENT);
            app.create_window(0, window, root, 0, 0, 10, 10, 0, class, parent, &CreateWindowAux::new())
                .unwrap();
            window
        };
        let window = make();
        let protocols = app.intern_atom(false, b"WM_PROTOCOLS").unwrap().reply().unwrap().atom;
        let ping = app.intern_atom(false, b"_NET_WM_PING").unwrap().reply().unwrap().atom;
        app.change_property32(PropMode::REPLACE, window, protocols, AtomEnum::ATOM, &[ping])
            .unwrap();
        // and one that lists no ping
        let mute = make();
        app.get_input_focus().unwrap().reply().unwrap();
        let answering = Arc::new(AtomicBool::new(true));
        let answerer = {
            let answering = answering.clone();
            std::thread::spawn(move || {
                let mask = EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT;
                loop {
                    match app.wait_for_event() {
                        Ok(Event::ClientMessage(e)) if e.type_ == protocols && e.data.as_data32()[0] == ping => {
                            // the test's own end: a ping with no token
                            if e.data.as_data32()[1] == 0 {
                                return;
                            }
                            if answering.load(Ordering::SeqCst) {
                                let answer = ClientMessageEvent::new(32, root, protocols, e.data.as_data32());
                                app.send_event(false, root, mask, answer).unwrap();
                                app.flush().unwrap();
                            }
                        }
                        Ok(_) => {}
                        Err(_) => return,
                    }
                }
            })
        };
        let mut watch = DropCursor::start_for(Some(window)).unwrap();
        let first = watch.sync(Duration::from_secs(2));
        let second = watch.sync(Duration::from_secs(2));
        let (Sync::Answered { token: a, .. }, Sync::Answered { token: b, .. }) = (first, second) else {
            panic!("both answered: {first:?} {second:?}");
        };
        assert_ne!(a, b, "each sync has a token of its own");
        // an application that stops answering: no answer inside the bound
        answering.store(false, Ordering::SeqCst);
        assert!(matches!(
            watch.sync(Duration::from_millis(100)),
            Sync::Unanswered { .. }
        ));
        let read = watch.at_release(None);
        let answers: Vec<_> = read
            .steps
            .iter()
            .filter(|step| matches!(step, Step::Answer(_)))
            .copied()
            .collect();
        assert_eq!(
            answers,
            vec![Step::Answer(a), Step::Answer(b)],
            "the answers the watch read, in order"
        );
        // a window that lists no ping is not asked, and a watch with no window asks nobody
        let mut unlisted = DropCursor::start_for(Some(mute)).unwrap();
        assert_eq!(unlisted.sync(Duration::from_millis(100)), Sync::Unasked);
        assert_eq!(
            DropCursor::start().unwrap().sync(Duration::from_millis(100)),
            Sync::Unasked
        );
        let (conn, _) = x11rb::connect(None).unwrap();
        let stop = ClientMessageEvent::new(32, window, protocols, [ping, 0, window, 0, 0]);
        conn.send_event(false, window, EventMask::NO_EVENT, stop).unwrap();
        conn.flush().unwrap();
        answerer.join().unwrap();
    }

    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn the_watch_reads_the_xtest_pointer_s_motions_where_they_went_in_order_with_the_cursor_s_changes() {
        use x11rb::protocol::xproto::{ChangeWindowAttributesAux, MOTION_NOTIFY_EVENT};
        use x11rb::protocol::xtest::ConnectionExt as _;
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        conn.xtest_get_version(2, 2).unwrap().reply().unwrap();
        let motion = |x: i16, y: i16| {
            conn.xtest_fake_input(MOTION_NOTIFY_EVENT, 0, x11rb::CURRENT_TIME, root, x, y, 0)
                .unwrap();
            conn.get_input_focus().unwrap().reply().unwrap();
        };
        motion(5, 5);
        let mut watch = DropCursor::start().unwrap();
        assert_eq!(watch.start, Some((5, 5)), "where the pointer was when the watch began");
        motion(11, 22);
        // the root's cursor changed with the pointer over the root: the displayed cursor changes, between two motions
        let font = conn.generate_id().unwrap();
        conn.open_font(font, b"cursor").unwrap();
        let cursor = conn.generate_id().unwrap();
        conn.create_glyph_cursor(cursor, font, font, 68, 69, 0, 0, 0, 0xffff, 0xffff, 0xffff)
            .unwrap();
        conn.change_window_attributes(root, &ChangeWindowAttributesAux::new().cursor(cursor))
            .unwrap();
        conn.get_input_focus().unwrap().reply().unwrap();
        motion(333, 44);
        motion(55, 666);
        let read = watch.at_release(None);
        conn.change_window_attributes(root, &ChangeWindowAttributesAux::new().cursor(x11rb::NONE))
            .unwrap();
        conn.free_cursor(cursor).unwrap();
        conn.close_font(font).unwrap();
        conn.get_input_focus().unwrap().reply().unwrap();
        let shown = read.shown.expect("the cursor at the release").0;
        assert_eq!(
            read.steps,
            vec![
                Step::Motion(Some((11, 22))),
                Step::Cursor(shown),
                Step::Motion(Some((333, 44))),
                Step::Motion(Some((55, 666))),
            ],
            "the XTEST pointer's raw motions placed where they asked, in the server's order with the change"
        );
        assert!(
            read.set_since_entry(|(x, _)| x < 400),
            "put up after the watch began in the window"
        );
        assert!(
            !read.set_since_entry(|(_, y)| y > 100),
            "put up before the motion into the lower half"
        );
    }
}
