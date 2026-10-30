//! The display's clipboard lock (Design, The clipboard lock; behaviour §13.2): the private selections
//! `CUA_CLIPBOARD_LOCK`, then the vendor's `SKY_CLIPBOARD_LOCK`, each owned by the lock window. Every engine on the
//! display shares them, so two sessions never paste or snapshot at once.
//!
//! Acquiring one is a compare-and-set under a server grab: `GrabServer`, `GetSelectionOwner` (it must answer
//! None), `SetSelectionOwner` to the lock window, `GetSelectionOwner` again (it must name the lock window),
//! `UngrabServer`. The grab is released before any wait; a lock found owned is tried again 5 ms later, until the
//! deadline. Releasing is the same compare-and-set to None: given up only while still ours.

use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt as _, Window};
use x11rb::rust_connection::RustConnection;

use super::LOCK_RETRY;
use super::serving::Atom;

/// Both locks, held until dropped.
pub struct Lock {
    conn: Arc<RustConnection>,
    window: Window,
    held: Vec<Atom>,
}

impl std::fmt::Debug for Lock {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Lock").field("held", &self.held).finish()
    }
}

/// Runs `inside` under a server grab, ungrabbing on every path.
fn grabbed<T>(conn: &RustConnection, inside: impl FnOnce() -> Result<T>) -> Result<T> {
    conn.grab_server()?;
    let result = inside();
    let ungrab = conn
        .ungrab_server()
        .map_err(anyhow::Error::from)
        .and_then(|_| Ok(conn.flush()?));
    let value = result?;
    ungrab?;
    Ok(value)
}

/// The compare-and-set: `selection` becomes `window`'s if its owner is `expected`; whether it now is `window`'s.
fn set_if(conn: &RustConnection, selection: Atom, expected: Window, window: Window) -> Result<bool> {
    grabbed(conn, || {
        if conn.get_selection_owner(selection)?.reply()?.owner != expected {
            return Ok(false);
        }
        conn.set_selection_owner(window, selection, x11rb::CURRENT_TIME)?;
        Ok(conn.get_selection_owner(selection)?.reply()?.owner == window)
    })
}

impl Lock {
    /// Takes each selection in order before `wait` runs out, else `clipboard busy` with whatever was taken given
    /// back.
    pub fn acquire(conn: Arc<RustConnection>, window: Window, selections: [Atom; 2], wait: Duration) -> Result<Lock> {
        let deadline = Instant::now() + wait;
        let mut lock = Lock {
            conn,
            window,
            held: Vec::new(),
        };
        for selection in selections {
            loop {
                if set_if(&lock.conn, selection, x11rb::NONE, window)? {
                    lock.held.push(selection);
                    break;
                }
                let now = Instant::now();
                if now >= deadline {
                    // `lock` drops here, giving back what it holds.
                    bail!("clipboard busy");
                }
                sleep(LOCK_RETRY.min(deadline - now));
            }
        }
        Ok(lock)
    }
}

impl Drop for Lock {
    /// Gives each selection up, the last taken first, only while it is still the lock window's; errors are ignored
    /// (a connection that is gone has released them already).
    fn drop(&mut self) {
        for selection in self.held.drain(..).rev() {
            let _ = set_if(&self.conn, selection, self.window, x11rb::NONE);
        }
    }
}
