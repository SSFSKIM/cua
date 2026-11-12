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

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

use crate::accept::{CursorChange, Image, fingerprint};
use crate::drag_cursors::DragImages;

/// How often the watch's thread reads the changes that have come.
const POLL: Duration = Duration::from_millis(1);

/// One thing the watch read, in the server's order: a motion of the real pointer, with where it went (None when that
/// cannot be told: a device whose motion is relative, such as a person's mouse, or a motion missing an axis), or a
/// change of the displayed cursor, by its serial.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    Motion(Option<(i16, i16)>),
    Cursor(u32),
}

/// What the thread has seen: every change, every step in order, and the image of each cursor it fetched while shown,
/// by serial.
#[derive(Default)]
struct Seen {
    changes: Vec<CursorChange>,
    steps: Vec<Step>,
    images: HashMap<u32, Image>,
    failed: Option<String>,
    /// The XTEST pointer device, whose raw motions place the pointer.
    xtest: Option<u16>,
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
    /// Every motion and cursor change the watch read, in the server's order ([`set_since_entry`]).
    pub steps: Vec<Step>,
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
                Step::Cursor(_) => None,
            })
            .collect();
        json!({
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
    /// Connected and subscribed to the root's displayed-cursor changes and to the real pointer's raw motion (XInput 2.1
    /// or later, so a grab does not hide it), the image shown now and the pointer's place kept, and the thread begun.
    pub fn start() -> Result<DropCursor> {
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
        let pointer = conn.query_pointer(root)?.reply()?;
        let start = pointer.same_screen.then_some((pointer.root_x, pointer.root_y));
        let now = conn.xfixes_get_cursor_image()?.reply()?;
        let initial = fingerprint(now.width, now.height, now.xhot, now.yhot, &now.cursor_image);
        let conn = Arc::new(conn);
        let seen = Arc::new(Mutex::new(Seen {
            xtest,
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
    let xtest = seen.lock().expect("the engine never panics holding it").xtest;
    while let Some(event) = conn.poll_for_event()? {
        match event {
            Event::XfixesCursorNotify(e) => {
                steps.push(Step::Cursor(e.cursor_serial));
                changes.push(CursorChange {
                    serial: e.cursor_serial,
                    time: e.timestamp,
                    named: e.name != x11rb::NONE,
                    seen: Instant::now(),
                });
            }
            Event::XinputRawMotion(e) => steps.push(Step::Motion(raw_place(&e, xtest))),
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
