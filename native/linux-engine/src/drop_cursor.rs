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

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::rust_connection::RustConnection;

use crate::accept::{CursorChange, Image, fingerprint};
use crate::drag_cursors::DragImages;

/// How often the watch's thread reads the changes that have come.
const POLL: Duration = Duration::from_millis(1);

/// What the thread has seen: every change, and the image of each cursor it fetched while shown, by serial.
#[derive(Default)]
struct Seen {
    changes: Vec<CursorChange>,
    images: HashMap<u32, Image>,
    failed: Option<String>,
}

/// The displayed cursor watched from before a drag's press to its release, for its drop's confirmation.
pub struct DropCursor {
    conn: Arc<RustConnection>,
    seen: Arc<Mutex<Seen>>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    /// The image shown when the watch began.
    initial: Image,
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
}

impl AtRelease {
    /// The `--stats` record (#364's tallies read it).
    pub fn record(&self) -> Value {
        let hex = |image: Image| format!("{image:016x}");
        json!({
            "accepted": self.accepted,
            "shown": self.shown.map(|(serial, image, named)| json!({ "serial": serial, "image": hex(image), "named": named })),
            "initial": hex(self.initial),
            "history": self.history.iter().map(|&(serial, time, named, image)| json!([serial, time, named, image.map(hex)])).collect::<Vec<_>>(),
            "take_time": self.take,
            "read_ms": self.read.as_secs_f64() * 1000.0,
            "error": self.error,
        })
    }
}

impl DropCursor {
    /// Connected and subscribed to the root's displayed-cursor changes, the image shown now kept, and the thread begun.
    pub fn start() -> Result<DropCursor> {
        let (conn, screen) = x11rb::connect(None).context("the drop's cursor watch could not connect")?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(5, 0)?
            .reply()
            .context("the drop's cursor watch needs the XFixes extension")?;
        conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?
            .check()?;
        let now = conn.xfixes_get_cursor_image()?.reply()?;
        let initial = fingerprint(now.width, now.height, now.xhot, now.yhot, &now.cursor_image);
        let conn = Arc::new(conn);
        let seen = Arc::new(Mutex::new(Seen::default()));
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

/// The changes that have arrived, read in, and the image shown now fetched when a change's cursor is not known yet.
fn read_changes(conn: &RustConnection, seen: &Mutex<Seen>) -> Result<()> {
    let mut unknown = false;
    let mut changes = Vec::new();
    while let Some(event) = conn.poll_for_event()? {
        if let Event::XfixesCursorNotify(e) = event {
            changes.push(CursorChange {
                serial: e.cursor_serial,
                time: e.timestamp,
                named: e.name != x11rb::NONE,
                seen: Instant::now(),
            });
        }
    }
    {
        let mut seen = seen.lock().expect("the engine never panics holding it");
        for change in &changes {
            unknown |= !seen.images.contains_key(&change.serial);
        }
        seen.changes.extend(changes);
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
    fn with_no_accept_told_apart_nothing_is_judged() {
        assert_eq!(judge(&DragImages::of(&[], &[]), ARROW, (ACCEPT, false)), None);
        assert_eq!(
            judge(&DragImages::of(&[NONE], &[NONE]), ARROW, (NONE, false)),
            None,
            "every accepting image drawn as no drop"
        );
    }
}
