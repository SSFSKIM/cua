//! The display-wide window after an unconfirmed paste (Decision Log, M2.1 and the M2 branch review): while it runs,
//! no cua engine on the display changes what CLIPBOARD serves, because the unconfirmed paste's target may still make
//! its late `CurrentTime` conversion, and it must not receive another engine's text.
//!
//! The record is a property on the root window, `CUA_CLIPBOARD_QUARANTINE`, two CARDINALs: the window's end in server
//! time and the target's X client (its resource-id base). It lives in the X server, not in an engine, so it outlives
//! the engine that wrote it, even one that crashed, and it needs no cleanup: it expires by its own end, compared on the
//! wrapping server clock. It is written by a paste's cleanup and read before a paste or a Copy, both under
//! `CUA_CLIPBOARD_LOCK`, so no engine reads it while another is about to write it. A vendor engine does not read it.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, PropMode, Window};
use x11rb::rust_connection::RustConnection;

use super::serving::{Atom, CURRENT_TIME_REFUSAL};

/// How far past a window's full length a record's end may lie and still be read as one: a record further ahead is not
/// a window this code wrote (or the server's clock has jumped), and is ignored rather than refusing for ever.
const SLACK_MS: u32 = 1_000;

/// How long the window whose record ends at `end` still runs at server time `now`, if it does.
pub fn remaining(end: u32, now: u32) -> Option<Duration> {
    let left = end.wrapping_sub(now);
    let limit = CURRENT_TIME_REFUSAL.as_millis() as u32 + SLACK_MS;
    (left != 0 && left <= limit).then(|| Duration::from_millis(u64::from(left)))
}

/// A window's record: its end in server time and the target's X client.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Record {
    pub end: u32,
    pub client: u32,
}

/// The record's place on the display.
pub struct Quarantine {
    conn: Arc<RustConnection>,
    root: Window,
    atom: Atom,
}

impl Quarantine {
    pub fn new(conn: Arc<RustConnection>, root: Window, atom: Atom) -> Quarantine {
        Quarantine { conn, root, atom }
    }

    /// Opens (or extends) the display's window. Best effort: a failure leaves the writing engine's own refusal.
    pub fn open(&self, record: Record) {
        let _ = self.conn.change_property(
            PropMode::REPLACE,
            self.root,
            self.atom,
            AtomEnum::CARDINAL,
            32,
            2,
            &[record.end.to_ne_bytes(), record.client.to_ne_bytes()].concat(),
        );
        let _ = self.conn.flush();
    }

    /// The display's record, if there is a well-formed one.
    pub fn read(&self) -> Result<Option<Record>> {
        let reply = self
            .conn
            .get_property(false, self.root, self.atom, AtomEnum::CARDINAL, 0, 2)?
            .reply()?;
        let values: Vec<u32> = reply.value32().map(|v| v.collect()).unwrap_or_default();
        Ok(match values.as_slice() {
            [end, client] => Some(Record {
                end: *end,
                client: *client,
            }),
            _ => None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_runs_until_its_end_on_the_wrapping_clock() {
        assert_eq!(remaining(10_500, 500), Some(Duration::from_secs(10)));
        assert_eq!(remaining(10_500, 10_499), Some(Duration::from_millis(1)));
        assert_eq!(remaining(10_500, 10_500), None, "ended");
        assert_eq!(remaining(10_500, 20_000), None, "long past");
        assert_eq!(
            remaining(4_000, u32::MAX - 999),
            Some(Duration::from_millis(5_000)),
            "across the wrap"
        );
    }

    #[test]
    fn a_record_further_ahead_than_a_window_runs_is_ignored() {
        assert_eq!(remaining(11_000, 0), Some(Duration::from_secs(11)));
        assert_eq!(
            remaining(11_001, 0),
            None,
            "not a window this code wrote: never a refusal for ever"
        );
    }
}
