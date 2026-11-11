//! Electron's drop confirmation: the drag loop's accept cursor at the release (the design session's ruling on task 73's
//! review, 2026-11-11). Electron sends no activation request when it drops (`m4/drop-signals/`: 0 of 116), and the
//! accept bit of its `XdndFinished` reaches only the source (`m4/drag-handle/`), so a drop of an Electron drag whose
//! drag and drop began, a `drag_handle`'s or a `drag`'s behind the floor, confirms only by what Chromium's drag loop
//! shows: the accept cursor its target's last status set on the drag's grab (`accept.rs` reads the same cursors).
//! Shown at the release, the drop is confirmed; any other cursor, or one that cannot be told, leaves it unconfirmed,
//! never ok.
//!
//! The cursor is read at the release itself, not sampled before it: a thread of the watch's own, on its own connection,
//! keeps every displayed-cursor change from before the press with each image it can fetch while that cursor is shown,
//! so the drag loop's own image (Chromium's no-drop status's too) is known from around the take; just before the
//! button goes up, the engine stops the thread and asks the server which cursor is shown now, with its image and name
//! ([`DropCursor::at_release`]). That cursor is the accept when it carries no XFixes name and its image is none of
//! those excluded: the image shown when the watch began, and every unnamed cursor's shown up to the take ([`judge`]),
//! as `accept.rs`'s [`crate::accept::accept_shown`] tells them apart.

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

use crate::accept::{CursorChange, Image, after, fingerprint};

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
}

/// The cursor at a release, and what it says of the drop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtRelease {
    /// Whether the accept was shown: None when it cannot be told (an excluded image unknown, no cursor shown up to the
    /// take, or the read failed), which confirms nothing.
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
        })
    }

    /// Just before the release, for a drag and drop whose source took `XdndSelection` at server time `take`: the
    /// thread stopped, the cursor shown now read with its image and name, the changes before it read in, and the
    /// accept judged ([`judge`]).
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
            (Some((_, image, named)), Some(take), None) => {
                judge(&seen.changes, &seen.images, self.initial, take, (image, named))
            }
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
/// loop's accept for a take at server time `take`: None when that cannot be told, since the image of an unnamed cursor
/// shown up to the take is unknown, or none was shown then (the drag loop's own cursor, which is also the no-drop
/// status's image, comes around the take). Excluded are the image shown when the watch began (`initial`) and every
/// unnamed cursor's up to the take; a named cursor is another client's theme cursor, never the accept.
pub fn judge(
    changes: &[CursorChange],
    images: &HashMap<u32, Image>,
    initial: Image,
    take: u32,
    shown: (Image, bool),
) -> Option<bool> {
    let mut excluded = vec![initial];
    for change in changes.iter().filter(|c| !c.named && !after(c.time, take)) {
        excluded.push(*images.get(&change.serial)?);
    }
    if excluded.len() < 2 {
        return None;
    }
    let (image, named) = shown;
    Some(!named && !excluded.contains(&image))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change(serial: u32, time: u32) -> CursorChange {
        CursorChange {
            serial,
            time,
            named: false,
            seen: Instant::now(),
        }
    }

    /// The images of task 73's sittings, as `accept.rs`'s tests name them: the arrow before the press, the drag loop's
    /// and the no-drop status's (one image), the accept's.
    const ARROW: Image = 0xb46b;
    const NONE: Image = 0xbd1d;
    const ACCEPT: Image = 0x1dc3;

    fn images() -> HashMap<u32, Image> {
        [(80, ARROW), (81, NONE), (82, NONE), (83, ACCEPT)]
            .into_iter()
            .collect()
    }

    #[test]
    fn the_accept_shown_at_the_release_confirms_and_any_other_cursor_does_not() {
        // the loop's cursor around the take (100), then no drop, then the accept
        let seq = [change(81, 99), change(82, 101), change(83, 105)];
        assert_eq!(judge(&seq, &images(), ARROW, 100, (ACCEPT, false)), Some(true));
        assert_eq!(
            judge(&seq, &images(), ARROW, 100, (NONE, false)),
            Some(false),
            "no drop at the release: the path left the zone"
        );
        assert_eq!(
            judge(&seq, &images(), ARROW, 100, (ARROW, false)),
            Some(false),
            "the image the watch began on"
        );
        assert_eq!(
            judge(&seq, &images(), ARROW, 100, (ACCEPT, true)),
            Some(false),
            "another client's named cursor"
        );
    }

    #[test]
    fn what_cannot_be_told_confirms_nothing() {
        let seq = [change(81, 99), change(83, 105)];
        let mut unknown = images();
        unknown.remove(&81);
        assert_eq!(
            judge(&seq, &unknown, ARROW, 100, (ACCEPT, false)),
            None,
            "the loop's image was never fetched"
        );
        assert_eq!(
            judge(&seq[1..], &images(), ARROW, 100, (ACCEPT, false)),
            None,
            "no cursor shown up to the take"
        );
        // an accept in the take's own millisecond (a press inside the zone) is excluded with the loop's
        let inside = [change(81, 99), change(83, 100)];
        assert_eq!(judge(&inside, &images(), ARROW, 100, (ACCEPT, false)), Some(false));
    }
}
