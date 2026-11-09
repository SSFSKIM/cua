//! Measurement only (#171 M4, T13: Chromium drop signals; `--drag-dnd-release-at-accept`): a release at Chrome's
//! accept cursor instead of the 350 ms floor after a take (`dnd::RELEASE_AFTER_TAKE`). Chrome shows its target's
//! answer as its drag grab's cursor: `XDragDropClient::OnXdndStatus` sets the negotiated operation and then
//! `UpdateCursor` changes the active grab's cursor (`X11WholeScreenMoveLoop::UpdateCursor`), which any client sees as an
//! XFixes `DisplayCursorNotify` on the root, on the background route too, since the grab decides the displayed cursor.
//! Around the take the drag loop shows its own cursor, on the server's clock in the take's millisecond or just before
//! it (task 68's pilot: 1-2 ms before, every drag), then the first status's (none, on a press outside a drop zone),
//! then the accept's: the accept is read as the second change to an unnamed cursor strictly after the take's server
//! time ([`accept_index`]). A first status in the take's own millisecond is not counted, so the accept after it is not
//! read and the ceiling decides. Chrome makes its cursors itself, so they carry no XFixes name; a named one is another
//! client's.
//! This module only measures: the shipped engine never builds a [`CursorWatch`], and the flag that does is off by
//! default (`main.rs`).

use std::time::Instant;

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

/// Which change strictly after the take the accept is: the first status's, then the accept's.
pub const ACCEPT_CHANGE: usize = 2;

/// A change of the displayed cursor, as XFixes reported it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CursorChange {
    pub serial: u32,
    /// The server's time of the change.
    pub time: u32,
    /// Whether the cursor carries an XFixes name (a theme cursor some other client loaded by name).
    pub named: bool,
    /// When the engine read it.
    pub seen: Instant,
}

/// Whether server time `t` is strictly after `since`, across the 32-bit wrap.
fn after(t: u32, since: u32) -> bool {
    let d = t.wrapping_sub(since);
    d != 0 && d < 1 << 31
}

/// The index in `changes` (in arrival order) of the change read as the accept: the [`ACCEPT_CHANGE`]-th change to an
/// unnamed cursor strictly after the take's server time `take`, a serial repeated back to back counted once. None until
/// then: a drag whose first status already accepts shows one change fewer and is never read as accepted.
pub fn accept_index(changes: &[CursorChange], take: u32) -> Option<usize> {
    let mut counted = 0;
    let mut last = None;
    for (i, c) in changes.iter().enumerate() {
        if c.named || !after(c.time, take) || last == Some(c.serial) {
            continue;
        }
        last = Some(c.serial);
        counted += 1;
        if counted == ACCEPT_CHANGE {
            return Some(i);
        }
    }
    None
}

/// The displayed cursor watched on a connection of its own, subscribed before the drag's press, read by polling.
pub struct CursorWatch {
    conn: RustConnection,
    changes: Vec<CursorChange>,
}

impl CursorWatch {
    pub fn start() -> Result<CursorWatch> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(5, 0)?.reply()?;
        conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?
            .check()?;
        Ok(CursorWatch {
            conn,
            changes: Vec::new(),
        })
    }

    /// The changes that have arrived so far, read in.
    pub fn poll(&mut self) -> Result<&[CursorChange]> {
        while let Some(event) = self.conn.poll_for_event()? {
            if let Event::XfixesCursorNotify(e) = event {
                self.changes.push(CursorChange {
                    serial: e.cursor_serial,
                    time: e.timestamp,
                    named: e.name != x11rb::NONE,
                    seen: Instant::now(),
                });
            }
        }
        Ok(&self.changes)
    }

    /// Every change read so far, after one round trip, so every change the server made before now is among them.
    pub fn finish(&mut self) -> Result<&[CursorChange]> {
        self.conn.get_input_focus()?.reply()?;
        self.poll()
    }
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

    fn named(serial: u32, time: u32) -> CursorChange {
        CursorChange {
            named: true,
            ..change(serial, time)
        }
    }

    #[test]
    fn the_accept_is_the_second_unnamed_change_after_the_take() {
        // the pilot's sequences (task 68), server times against a take at 100: the drag loop's cursor at or before the
        // take, then the first status (none), then the accept
        let seq = [change(81, 99), change(82, 101), change(83, 105)];
        assert_eq!(accept_index(&seq, 100), Some(2));
        assert_eq!(accept_index(&seq[..2], 100), None, "no accept before the second change");
    }

    #[test]
    fn a_change_in_the_take_s_millisecond_a_named_cursor_and_a_repeat_do_not_count() {
        // the first status in the take's own millisecond: not counted, so the accept after it is not read either
        let same_ms = [change(81, 99), change(82, 100), change(83, 103)];
        assert_eq!(accept_index(&same_ms, 100), None, "the ceiling decides");
        // a Chrome process's first drag: theme cursors between, the loop's cursor in the take's millisecond
        let first = [
            change(80, 79),
            change(81, 100),
            named(2, 114),
            change(82, 115),
            change(82, 115),
            named(2, 116),
            change(83, 116),
        ];
        assert_eq!(accept_index(&first, 100), Some(6));
    }

    #[test]
    fn a_first_status_that_accepts_is_never_read_as_the_accept() {
        // a press inside a drop zone, or a stall whose first status already accepts: one change after the take
        assert_eq!(accept_index(&[change(81, 99), change(83, 102)], 100), None);
    }

    #[test]
    fn server_time_compares_across_its_wrap() {
        let take = u32::MAX - 1;
        let seq = [change(81, take), change(82, u32::MAX), change(83, 3)];
        assert_eq!(accept_index(&seq, take), Some(2));
        assert_eq!(accept_index(&seq, 2), None, "only the last is after a take at 2");
    }
}
