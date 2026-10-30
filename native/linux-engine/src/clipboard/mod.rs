//! The clipboard core (Design, Text and clipboard: one verified paste route; behaviour §13): the display's clipboard
//! lock, the snapshot of the current CLIPBOARD within its bounds, the persistent CLIPBOARD owner with its serving
//! generations and guarded cleanup, and `clipboard_read`'s handles.
//!
//! Three X connections, none of them the engine's main one: this module's own (the lock, the reader and the
//! server's time; only the request thread uses it), and the owner's, read by the owner's thread (`owner.rs`). A
//! paste (`engine/paste.rs`) runs as: [`Clipboard::lock`], [`Clipboard::snapshot`], [`Clipboard::take`] with the text
//! and the snapshot to restore, [`Paste::dispatched`] with the synthetic Ctrl+V's timestamp, [`Paste::watch`] while
//! confirming, then [`Paste::confirmed`], [`Paste::settled`] (nothing of it can still be pending) or a drop, which is
//! the cleanup on every other exit path; the lock is released when dropped after it.

pub mod handles;
mod lock;
mod owner;
mod quarantine;
mod reader;
pub mod serving;

#[cfg(test)]
pub(crate) mod tests;

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use x11rb::connection::Connection;
use x11rb::protocol::xfixes::ConnectionExt as _;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, Window, WindowClass};
use x11rb::rust_connection::RustConnection;

pub use handles::Handles;
pub use lock::Lock;
pub use owner::{Outcome, Paste, Seen};
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
    /// The root window's record of an open unconfirmed-paste window (`quarantine.rs`).
    pub quarantine: Atom,
}

const ATOM_NAMES: [&str; 11] = [
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
    "CUA_CLIPBOARD_QUARANTINE",
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
            quarantine,
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
            quarantine,
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

/// CLIPBOARD's contents as a snapshot read them, with the owner generation they were read at: a take that restores
/// them refuses if CLIPBOARD's owner has been set since (`Owner::take`).
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    pub payload: Payload,
    generation: u64,
}

pub struct Clipboard {
    conn: Arc<RustConnection>,
    atoms: Atoms,
    reader: reader::Reader,
    lock_window: Window,
    /// Started on the first snapshot or paste.
    owner: Option<owner::Owner>,
    quarantine: Arc<quarantine::Quarantine>,
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
        let quarantine = Arc::new(quarantine::Quarantine::new(conn.clone(), root, atoms.quarantine));
        Ok(Clipboard {
            conn,
            atoms,
            reader,
            lock_window,
            owner: None,
            quarantine,
        })
    }

    pub fn text_atoms(&self) -> TextAtoms {
        self.atoms.text()
    }

    #[cfg(test)]
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
    /// owner serves when that is the owner. With the owner generation they were read at, unchanged through the read.
    pub fn snapshot(&mut self) -> Result<Snapshot> {
        self.snapshot_within(MAX_SNAPSHOT_BYTES)
    }

    fn snapshot_within(&mut self, cap: usize) -> Result<Snapshot> {
        let generation = self.owner()?.generation()?;
        // A take still settling (one its caller gave up on) is waited for as long as an owner may take to answer
        // TARGETS; the X conversion is the fallback, and it waits on the same thread.
        let ours = self.owner()?.settled(TARGETS_WAIT);
        let payload = match ours {
            Some((window, payload)) if self.owner_window()? == window => (*payload).clone(),
            _ => self.reader.snapshot(cap)?,
        };
        if self.owner()?.generation()? != generation {
            bail!("clipboard changed while its contents were being captured");
        }
        Ok(Snapshot { payload, generation })
    }

    /// The owner, started on first use (and again if its thread has ended).
    fn owner(&mut self) -> Result<&owner::Owner> {
        if self.owner.as_ref().is_none_or(|owner| !owner.alive()) {
            self.owner = Some(owner::Owner::start(self.atoms, self.quarantine.clone())?);
        }
        Ok(self.owner.as_ref().expect("started above"))
    }

    /// The server's time now.
    pub fn server_time(&mut self) -> Result<u32> {
        self.reader.server_time()
    }

    /// Becomes CLIPBOARD's owner serving `payload` for one paste; the returned paste's cleanup switches what is
    /// served to `restore`'s contents while the engine still owns CLIPBOARD. Refused, with CLIPBOARD untouched, when
    /// its owner has been set since `restore` was read.
    pub fn take(&mut self, payload: Payload, restore: Snapshot) -> Result<Paste> {
        // Taken before the server's time is read, so the cleanup's estimate of the server's time is never early.
        let anchor = std::time::Instant::now();
        let time = self.reader.server_time()?;
        self.take_from(payload, restore, time, anchor)
    }

    /// [`Clipboard::take`] with the server's `time` already read, no earlier than `anchor`.
    fn take_from(
        &mut self,
        payload: Payload,
        restore: Snapshot,
        time: u32,
        anchor: std::time::Instant,
    ) -> Result<Paste> {
        self.owner()?
            .take(payload, restore.payload, restore.generation, time, anchor)
    }

    /// How long an unconfirmed paste's window still runs, if one does: this engine's own, or any cua engine's on the
    /// display, from the root window's record (`quarantine.rs`). Read under the clipboard lock. While it runs, nothing
    /// may change what CLIPBOARD serves: a paste, a `clipboard_write` and a `clipboard_read`'s Copy are refused.
    pub fn quarantine(&mut self) -> Result<Option<Duration>> {
        let own = self.owner.as_ref().and_then(|owner| owner.current_time_refusal());
        let display = match self.quarantine.read()? {
            Some(record) => quarantine::remaining(record.end, self.reader.server_time()?),
            None => None,
        };
        Ok(own.max(display))
    }

    /// [`Clipboard::take`] restoring `restore`, read as of now: for tests whose restore is of their choosing.
    #[cfg(test)]
    pub fn take_restoring(&mut self, payload: Payload, restore: Payload) -> Result<Paste> {
        let restore = self.as_of_now(restore);
        self.take(payload, restore)
    }

    /// A snapshot of `payload` at the owner generation now, for tests that take CLIPBOARD with a restore of their
    /// choosing.
    #[cfg(test)]
    pub fn as_of_now(&mut self, payload: Payload) -> Snapshot {
        let generation = self.owner().unwrap().generation().unwrap();
        Snapshot { payload, generation }
    }

    /// Whether the engine owns CLIPBOARD now (it has received no `SelectionClear`).
    #[cfg(test)]
    pub fn owns(&self) -> bool {
        self.owner.as_ref().is_some_and(|owner| owner.owns())
    }
}
