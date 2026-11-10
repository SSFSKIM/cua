//! The release at Chrome's accept cursor (#171 M4: T13 measured it, T14 ships it; the design session's rulings on task
//! 68, 2026-11-09 and 2026-11-10). A Chrome drop on a drag the engine lets land, once its source took `XdndSelection`,
//! is released as soon as Chrome shows that its target accepts, instead of at the 350 ms floor after the take
//! (`dnd::RELEASE_AFTER_TAKE`, which stays the ceiling), and only on a drag whose drop Chrome's own activation request
//! confirms (`dnd::DROP_CONFIRM`), so that a false release is still reported, never answered ok.
//!
//! Chrome shows its target's answer as its drag grab's cursor: `XDragDropClient::OnXdndStatus` sets the negotiated
//! operation and then `UpdateCursor` changes the active grab's cursor (`X11WholeScreenMoveLoop::UpdateCursor`), which
//! any client sees as an XFixes `DisplayCursorNotify` on the root, on the background route too, since the grab decides
//! the displayed cursor. Chrome makes its cursors itself, so they carry no XFixes name; a named one is another
//! client's, and neither counts nor withdraws. Around the take the drag loop shows its own cursor, on the server's
//! clock in the take's millisecond or just before it (task 68: 1-2 ms before), then the first status's, then the
//! accept's. The drag loop's cursor and the "no drop" status's are the same image (task 68's records: every drag), and
//! the accept's is another, so the cursors are told apart by their image, not their order ([`accept_shown`]): the
//! accept is the cursor shown now when its image is none of those shown up to the take (the drag loop's, the page's
//! own, the one shown when the watch began) and not the first status's, which is never read as the accept. So a path
//! that leaves the zone after its accept withdraws it, and a press inside the zone, whose first status already accepts,
//! is left to the floor.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::time::Instant;

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, CursorNotifyMask};
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

/// A cursor image's fingerprint: its size, hotspot and pixels, hashed.
pub type Image = u64;

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

/// The index in `changes` (in arrival order) of the change read as Chrome's accept, while it is the cursor shown, for a
/// take at server time `take`: the last change to an unnamed cursor, strictly after the take and not its first status,
/// whose image is none of those excluded. Excluded are the image shown when the watch began (`initial`), every unnamed
/// cursor's at or before the take (the drag loop's, which is also "no drop"'s, and any the page showed), and the first
/// status's after it. None when any of those images, or the last change's, is unknown (`images`, by serial), when no
/// change came at or before the take, or when the last change is the first status: the floor then decides.
pub fn accept_shown(
    changes: &[CursorChange],
    images: &HashMap<u32, Image>,
    initial: Image,
    take: u32,
) -> Option<usize> {
    let unnamed: Vec<(usize, &CursorChange)> = changes.iter().enumerate().filter(|(_, c)| !c.named).collect();
    let image = |c: &CursorChange| images.get(&c.serial).copied();
    let mut excluded = vec![initial];
    let mut loop_seen = false;
    let mut first_status: Option<usize> = None;
    for &(i, c) in &unnamed {
        if !after(c.time, take) {
            excluded.push(image(c)?);
            loop_seen = true;
        } else if first_status.is_none() {
            excluded.push(image(c)?);
            first_status = Some(i);
        }
    }
    let &(last, change) = unnamed.last()?;
    if !loop_seen || first_status.is_none_or(|first| last <= first) {
        return None;
    }
    let shown = image(change)?;
    (!excluded.contains(&shown)).then_some(last)
}

/// The displayed cursor watched on a connection of its own, subscribed before the drag's press, read by polling: each
/// change, and the image of each cursor it could fetch while that cursor was shown.
pub struct CursorWatch {
    conn: RustConnection,
    changes: Vec<CursorChange>,
    images: HashMap<u32, Image>,
    initial: Image,
}

impl CursorWatch {
    pub fn start() -> Result<CursorWatch> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(5, 0)?.reply()?;
        conn.xfixes_select_cursor_input(root, CursorNotifyMask::DISPLAY_CURSOR)?
            .check()?;
        let mut watch = CursorWatch {
            conn,
            changes: Vec::new(),
            images: HashMap::new(),
            initial: 0,
        };
        watch.initial = watch.fetch_image()?;
        Ok(watch)
    }

    /// The image shown now, kept under its cursor's serial.
    fn fetch_image(&mut self) -> Result<Image> {
        let reply = self.conn.xfixes_get_cursor_image()?.reply()?;
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        (reply.width, reply.height, reply.xhot, reply.yhot, &reply.cursor_image).hash(&mut hasher);
        let image = hasher.finish();
        self.images.insert(reply.cursor_serial, image);
        Ok(image)
    }

    /// The changes that have arrived so far, read in, and the image shown now fetched when a cursor's is not known yet.
    pub fn poll(&mut self) -> Result<&[CursorChange]> {
        let mut unknown = false;
        while let Some(event) = self.conn.poll_for_event()? {
            if let Event::XfixesCursorNotify(e) = event {
                unknown |= !self.images.contains_key(&e.cursor_serial);
                self.changes.push(CursorChange {
                    serial: e.cursor_serial,
                    time: e.timestamp,
                    named: e.name != x11rb::NONE,
                    seen: Instant::now(),
                });
            }
        }
        if unknown {
            self.fetch_image()?;
        }
        Ok(&self.changes)
    }

    /// When the accept now shown was read, for a take at server time `take` ([`accept_shown`]), after a poll.
    pub fn accepted(&mut self, take: u32) -> Result<Option<Instant>> {
        self.poll()?;
        Ok(accept_shown(&self.changes, &self.images, self.initial, take).map(|i| self.changes[i].seen))
    }

    /// Every change read so far, after one round trip, so every change the server made before now is among them.
    pub fn finish(&mut self) -> Result<&[CursorChange]> {
        self.conn.get_input_focus()?.reply()?;
        self.poll()
    }

    /// The image known for a cursor's serial (`--stats`).
    pub fn image_of(&self, serial: u32) -> Option<Image> {
        self.images.get(&serial).copied()
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

    /// The images of task 68's records: the arrow shown before the press, the drag loop's cursor and the no-drop
    /// status's (one image, two cursors), the accept's, and a page's link hand.
    const ARROW: Image = 0xb46b;
    const NONE: Image = 0xbd1d;
    const ACCEPT: Image = 0x1dc3;
    const HAND: Image = 0x2091;

    fn images(pairs: &[(u32, Image)]) -> HashMap<u32, Image> {
        pairs.iter().copied().collect()
    }

    /// The serials of task 68's drags: 80 the arrow, 81 the drag loop's cursor, 82 no drop, 83 the accept.
    fn chrome() -> HashMap<u32, Image> {
        images(&[(80, ARROW), (81, NONE), (82, NONE), (83, ACCEPT), (79, HAND)])
    }

    #[test]
    fn the_accept_is_the_image_shown_after_the_take_that_no_cursor_up_to_its_first_status_showed() {
        // the plain drop (task 68): the loop's cursor before the take, then no drop, then the accept
        let seq = [change(81, 99), change(82, 101), change(83, 105)];
        assert_eq!(accept_shown(&seq, &chrome(), ARROW, 100), Some(2));
        assert_eq!(
            accept_shown(&seq[..2], &chrome(), ARROW, 100),
            None,
            "no drop is the loop's image"
        );
        // a page's own cursor before the take (a link's hand) is excluded too, not mistaken for the loop
        let link = [change(79, 90), change(81, 99), change(82, 101), change(83, 105)];
        assert_eq!(accept_shown(&link, &chrome(), ARROW, 100), Some(3));
        // a theme cursor of another client's between counts for nothing either way
        let theme = [
            change(81, 99),
            named(2, 100),
            change(82, 101),
            named(2, 104),
            change(83, 105),
            named(2, 106),
        ];
        assert_eq!(accept_shown(&theme, &chrome(), ARROW, 100), Some(4));
    }

    #[test]
    fn a_path_that_leaves_an_accepting_zone_withdraws_the_accept_by_its_no_drop_image() {
        // none, accept, none: the cursor the path ends on is no drop's image (the review of task 68)
        let left = [change(81, 99), change(82, 101), change(83, 105), change(82, 110)];
        assert_eq!(accept_shown(&left, &chrome(), ARROW, 100), None);
        // shown again, it counts again
        let back = [
            change(81, 99),
            change(82, 101),
            change(83, 105),
            change(82, 110),
            change(83, 120),
        ];
        assert_eq!(accept_shown(&back, &chrome(), ARROW, 100), Some(4));
        // no drop as a cursor of its own (a new serial, the same image) withdraws it as well
        let mut fresh = chrome();
        fresh.insert(84, NONE);
        let left_new = [change(81, 99), change(82, 101), change(83, 105), change(84, 110)];
        assert_eq!(accept_shown(&left_new, &fresh, ARROW, 100), None);
        // another accepting operation's image (copy after move) is still an accept
        fresh.insert(85, 0x7777);
        let other = [change(81, 99), change(82, 101), change(83, 105), change(85, 110)];
        assert_eq!(accept_shown(&other, &fresh, ARROW, 100), Some(3));
    }

    #[test]
    fn a_press_inside_the_zone_whose_first_status_accepts_is_never_released_early_even_after_it_leaves() {
        // the first status already accepts: by order, the second change (no drop, after the path left) would read as
        // the accept (the fix wave's gap); by image it is no drop's, and the first status is never the accept
        let inside = [change(81, 99), change(83, 102)];
        assert_eq!(accept_shown(&inside, &chrome(), ARROW, 100), None, "the floor decides");
        let inside_left = [change(81, 99), change(83, 102), change(82, 110)];
        assert_eq!(accept_shown(&inside_left, &chrome(), ARROW, 100), None);
        // left and back in: the accept's image stays excluded as the first status's, so the floor still decides
        let inside_back = [change(81, 99), change(83, 102), change(82, 110), change(83, 118)];
        assert_eq!(
            accept_shown(&inside_back, &chrome(), ARROW, 100),
            None,
            "the first status's image stays excluded"
        );
    }

    #[test]
    fn a_first_status_in_the_take_s_millisecond_leaves_the_drag_to_the_floor() {
        // no drop in the take's millisecond: it counts as shown before the take, so the accept after it is the first
        // status strictly after it, never read
        let same_ms = [change(81, 99), change(82, 100), change(83, 103)];
        assert_eq!(accept_shown(&same_ms, &chrome(), ARROW, 100), None);
        // the loop's cursor in the take's millisecond, the first status after: as the plain drop
        let loop_same_ms = [change(81, 100), change(82, 115), change(83, 116)];
        assert_eq!(accept_shown(&loop_same_ms, &chrome(), ARROW, 100), Some(2));
    }

    #[test]
    fn an_unknown_image_or_no_cursor_up_to_the_take_leaves_the_drag_to_the_floor() {
        let seq = [change(81, 99), change(82, 101), change(83, 105)];
        let no_loop_image = images(&[(82, NONE), (83, ACCEPT)]);
        assert_eq!(
            accept_shown(&seq, &no_loop_image, ARROW, 100),
            None,
            "the loop's image was not fetched"
        );
        let no_accept_image = images(&[(81, NONE), (82, NONE)]);
        assert_eq!(accept_shown(&seq, &no_accept_image, ARROW, 100), None);
        assert_eq!(
            accept_shown(&seq[1..], &chrome(), ARROW, 100),
            None,
            "no cursor shown up to the take"
        );
        assert_eq!(accept_shown(&[], &chrome(), ARROW, 100), None);
        // the image the watch began on is excluded: a source styled with the accept's own image never releases early
        assert_eq!(accept_shown(&seq, &chrome(), ACCEPT, 100), None);
    }

    #[test]
    fn server_time_compares_across_its_wrap() {
        let take = u32::MAX - 1;
        let seq = [change(81, take), change(82, u32::MAX), change(83, 3)];
        assert_eq!(accept_shown(&seq, &chrome(), ARROW, take), Some(2));
        assert_eq!(
            accept_shown(&seq, &chrome(), ARROW, 2),
            None,
            "only the last is after a take at 2"
        );
    }
}
