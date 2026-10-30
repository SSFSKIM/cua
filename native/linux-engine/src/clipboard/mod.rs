//! The clipboard core (Design, Text and clipboard: one verified paste route; behaviour §13): the display's clipboard
//! lock, the snapshot of the current CLIPBOARD within its bounds, the persistent CLIPBOARD owner with its serving
//! generations and guarded cleanup, and `clipboard_read`'s handles.
//!
//! Three X connections, none of them the engine's main one: this module's own (the lock, the reader and the
//! server's time; only the request thread uses it), and the owner's, read by the owner's thread (`owner.rs`). A
//! paste (M2.2) runs as: [`Clipboard::lock`], [`Clipboard::snapshot`], [`Clipboard::take`] with the text and the
//! snapshot to restore, [`Paste::dispatched`] with the synthetic Ctrl+V's timestamp, [`Paste::watch`] while
//! confirming, then [`Paste::confirmed`] or a drop, which is the cleanup on every other exit path; the lock is
//! released when dropped after it.

// The paste side (`take`, `Paste`, `Watch`, the transfer bounds, `Handles::get`) is driven by this module's live
// tests until M2.2's paste route calls it; this allowance goes with M2.2.
#![allow(dead_code)]

pub mod handles;
mod lock;
mod owner;
mod reader;
pub mod serving;

#[cfg(test)]
mod tests;

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use x11rb::connection::Connection;
use x11rb::protocol::xfixes::ConnectionExt as _;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, Window, WindowClass};
use x11rb::rust_connection::RustConnection;

pub use handles::Handles;
pub use lock::Lock;
pub use owner::Paste;
pub use serving::{Payload, TextAtoms};

use serving::Atom;

/// How long acquiring both locks may take before `clipboard busy` (Design, The clipboard lock).
pub const LOCK_WAIT: Duration = Duration::from_secs(5);
/// How long a waiting engine leaves the server between two attempts, as the vendor does (behaviour §13.2).
pub const LOCK_RETRY: Duration = Duration::from_millis(5);

/// The snapshot bounds (Design, Snapshot bounds).
pub const TARGETS_WAIT: Duration = Duration::from_millis(500);
pub const FORMAT_WAIT: Duration = Duration::from_millis(500);
pub const CHUNK_GAP: Duration = Duration::from_secs(2);
pub const SNAPSHOT_WAIT: Duration = Duration::from_secs(5);

/// The transfer bounds (Design, Transfer bounds): the owner drops a transfer that stops for `TRANSFER_GAP` between
/// INCR chunks or runs past `TRANSFER_WAIT`; `TRANSFER_START` is the paste route's, read from [`Watch`].
pub const TRANSFER_START: Duration = Duration::from_millis(500);
pub const TRANSFER_GAP: Duration = Duration::from_secs(2);
pub const TRANSFER_WAIT: Duration = Duration::from_secs(10);

/// How long `clipboard_read` waits for the application's Copy to change CLIPBOARD's owner.
pub const COPY_WAIT: Duration = Duration::from_secs(2);

/// The snapshot's aggregate cap, the vendor's (behaviour §13.3).
pub const MAX_SNAPSHOT_BYTES: usize = 64 << 20;

/// The atoms the clipboard speaks, interned once per connection (atoms are the server's, so equal on each).
#[derive(Debug, Clone, Copy)]
pub struct Atoms {
    pub clipboard: Atom,
    pub targets: Atom,
    pub incr: Atom,
    pub utf8_string: Atom,
    pub text_plain: Atom,
    pub text_plain_utf8: Atom,
    /// The reader's property and the server-time probe's.
    pub property: Atom,
    pub cua_lock: Atom,
    pub sky_lock: Atom,
    /// The owner thread's wake-up message.
    pub wake: Atom,
}

const ATOM_NAMES: [&str; 10] = [
    "CLIPBOARD",
    "TARGETS",
    "INCR",
    "UTF8_STRING",
    "text/plain",
    "text/plain;charset=utf-8",
    "CUA_CLIPBOARD_PROPERTY",
    "CUA_CLIPBOARD_LOCK",
    "SKY_CLIPBOARD_LOCK",
    "CUA_CLIPBOARD_WAKE",
];

impl Atoms {
    pub fn intern(conn: &RustConnection) -> Result<Atoms> {
        let cookies = ATOM_NAMES
            .iter()
            .map(|name| conn.intern_atom(false, name.as_bytes()))
            .collect::<Result<Vec<_>, _>>()?;
        let mut atoms = [0; ATOM_NAMES.len()];
        for (atom, cookie) in atoms.iter_mut().zip(cookies) {
            *atom = cookie.reply()?.atom;
        }
        let [
            clipboard,
            targets,
            incr,
            utf8_string,
            text_plain,
            text_plain_utf8,
            property,
            cua_lock,
            sky_lock,
            wake,
        ] = atoms;
        Ok(Atoms {
            clipboard,
            targets,
            incr,
            utf8_string,
            text_plain,
            text_plain_utf8,
            property,
            cua_lock,
            sky_lock,
            wake,
        })
    }

    pub fn text(&self) -> TextAtoms {
        TextAtoms {
            utf8_string: self.utf8_string,
            text_plain: self.text_plain,
            text_plain_utf8: self.text_plain_utf8,
            string: AtomEnum::STRING.into(),
        }
    }
}

/// An InputOnly 1×1 window at 0,0 under the root, never mapped.
fn input_only(conn: &RustConnection, root: Window, mask: EventMask) -> Result<Window> {
    let window = conn.generate_id()?;
    let aux = CreateWindowAux::new().event_mask(mask);
    conn.create_window(0, window, root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)?
        .check()?;
    Ok(window)
}

pub struct Clipboard {
    conn: Arc<RustConnection>,
    atoms: Atoms,
    reader: reader::Reader,
    lock_window: Window,
    /// Started on the first paste.
    owner: Option<owner::Owner>,
}

impl Clipboard {
    /// Opens the clipboard's own X connection with its windows: the lock's and the reader's, which watches
    /// CLIPBOARD's owner through XFIXES.
    pub fn connect() -> Result<Clipboard> {
        let (conn, screen) = x11rb::connect(None).context("failed to connect to the X server")?;
        let conn = Arc::new(conn);
        let root = conn.setup().roots[screen].root;
        let atoms = Atoms::intern(&conn)?;
        conn.xfixes_query_version(1, 0)?
            .reply()
            .context("clipboard requires the X XFIXES extension")?;
        let lock_window = input_only(&conn, root, EventMask::NO_EVENT)?;
        let reader = reader::Reader::new(conn.clone(), root, atoms)?;
        Ok(Clipboard {
            conn,
            atoms,
            reader,
            lock_window,
            owner: None,
        })
    }

    pub fn text_atoms(&self) -> TextAtoms {
        self.atoms.text()
    }

    pub fn lock_window(&self) -> Window {
        self.lock_window
    }

    /// Takes `CUA_CLIPBOARD_LOCK`, then `SKY_CLIPBOARD_LOCK`, within [`LOCK_WAIT`], else `clipboard busy`.
    pub fn lock(&mut self) -> Result<Lock> {
        self.lock_within(LOCK_WAIT)
    }

    pub fn lock_within(&mut self, wait: Duration) -> Result<Lock> {
        Lock::acquire(
            self.conn.clone(),
            self.lock_window,
            [self.atoms.cua_lock, self.atoms.sky_lock],
            wait,
        )
    }

    /// How many times CLIPBOARD's owner has been set since this connection started watching, up to now.
    pub fn generation(&mut self) -> Result<u64> {
        self.reader.generation()
    }

    /// CLIPBOARD's owner now, `NONE` when it has none.
    pub fn owner_window(&self) -> Result<Window> {
        Ok(self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner)
    }

    /// Waits up to `wait` for CLIPBOARD's owner to be set after generation `since`; whether it was.
    pub fn wait_for_change(&mut self, since: u64, wait: Duration) -> Result<bool> {
        self.reader.wait_for_change(since, wait)
    }

    /// The current CLIPBOARD contents within the snapshot bounds: empty when it has no owner; what the engine's own
    /// owner serves when that is the owner.
    pub fn snapshot(&mut self) -> Result<Payload> {
        self.snapshot_within(MAX_SNAPSHOT_BYTES)
    }

    fn snapshot_within(&mut self, cap: usize) -> Result<Payload> {
        let ours = self.owner.as_ref().and_then(|owner| owner.serving());
        if let Some((window, payload)) = ours
            && self.owner_window()? == window
        {
            return Ok((*payload).clone());
        }
        self.reader.snapshot(cap)
    }

    /// The server's time now.
    pub fn server_time(&mut self) -> Result<u32> {
        self.reader.server_time()
    }

    /// Becomes CLIPBOARD's owner serving `payload` for one paste; the returned paste's cleanup switches what is
    /// served to `restore` while the engine still owns CLIPBOARD.
    pub fn take(&mut self, payload: Payload, restore: Payload) -> Result<Paste> {
        // Taken before the server's time is read, so the cleanup's estimate of the server's time is never early.
        let anchor = std::time::Instant::now();
        let time = self.reader.server_time()?;
        self.take_from(payload, restore, time, anchor)
    }

    /// [`Clipboard::take`] with the server's `time` already read, no earlier than `anchor`.
    fn take_from(
        &mut self,
        payload: Payload,
        restore: Payload,
        time: u32,
        anchor: std::time::Instant,
    ) -> Result<Paste> {
        if self.owner.as_ref().is_none_or(|owner| !owner.alive()) {
            self.owner = Some(owner::Owner::start(self.atoms)?);
        }
        self.owner
            .as_ref()
            .expect("started above")
            .take(payload, restore, time, anchor)
    }

    /// Whether the engine owns CLIPBOARD now (it has received no `SelectionClear`).
    pub fn owns(&self) -> bool {
        self.owner.as_ref().is_some_and(|owner| owner.serving().is_some())
    }
}
