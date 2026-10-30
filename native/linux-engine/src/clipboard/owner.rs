//! The persistent CLIPBOARD owner (Design, Text and clipboard steps 3 and 5, The cleanup, Serving generations,
//! Transfer bounds; behaviour §13.4–13.5): one X connection, one unmapped InputOnly window and one thread that
//! answers `SelectionRequest`s for as long as the engine lives or another client takes CLIPBOARD.
//!
//! The request thread takes CLIPBOARD for a paste with [`Owner::take`], which returns the [`Paste`]: its cleanup,
//! run on every exit path (an explicit [`Paste::confirmed`] or a drop), never calls `SetSelectionOwner`. While the
//! engine still owns CLIPBOARD it switches what is served to the snapshot taken before the paste, and keeps serving
//! that; after a `SelectionClear` it does nothing. Each paste is a serving generation: once its cleanup has run, a
//! conversion that carries its timestamps is refused (`serving.rs`), so a late requestor never receives the
//! restored snapshot as if it were the paste. An INCR transfer keeps the payload it started with, and one that
//! stops for 2 s between chunks or runs past 10 s is dropped.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::{JoinHandle, sleep};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, PropMode, Property,
    SELECTION_NOTIFY_EVENT, SelectionNotifyEvent, SelectionRequestEvent, Window,
};
use x11rb::rust_connection::RustConnection;

use super::serving::{Atom, CLOSED_KEPT, Closed, Format, Payload, chunk_size};
use super::{Atoms, TRANSFER_GAP, TRANSFER_WAIT, input_only};

/// How long the thread sleeps between polls while an INCR transfer is in flight (it blocks otherwise).
const POLL: Duration = Duration::from_millis(2);

/// What a paste's requestors have done so far (Design, Transfer bounds), for the paste route to judge.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Watch {
    /// `SelectionRequest`s for CLIPBOARD while the paste was served, `TARGETS` and refusals included.
    pub requests: u32,
    /// Conversions answered with one of the paste's formats, an INCR one once its last chunk was taken.
    pub served: u32,
    /// INCR transfers of the paste still in flight.
    pub active: u32,
    /// INCR transfers dropped at the transfer bounds, or whose requestor went away.
    pub stalled: u32,
    pub first_request: Option<Instant>,
    /// The last request, chunk or completion.
    pub last_progress: Option<Instant>,
}

struct Active {
    id: u64,
    owned_at: u32,
    dispatched: Option<u32>,
    /// When `owned_at` was read, for the cleanup's estimate of the server's time.
    taken: Instant,
    watch: Watch,
}

struct Shared {
    /// What is served now.
    content: Arc<Payload>,
    /// The paste being served, if one is.
    active: Option<Active>,
    /// The engine owns CLIPBOARD: it took it and has had no `SelectionClear` since.
    owned: bool,
    closed: VecDeque<Closed>,
    next_id: u64,
    /// The thread ends at its next event.
    stop: bool,
    /// The thread has ended (stopped, or its connection broke).
    ended: bool,
}

fn locked(shared: &Mutex<Shared>) -> MutexGuard<'_, Shared> {
    shared.lock().unwrap_or_else(|e| e.into_inner())
}

pub struct Owner {
    conn: Arc<RustConnection>,
    window: Window,
    atoms: Atoms,
    shared: Arc<Mutex<Shared>>,
    thread: Option<JoinHandle<()>>,
}

impl Owner {
    /// The owner's connection, window and thread; it owns nothing until [`Owner::take`].
    pub fn start(atoms: Atoms) -> Result<Owner> {
        let (conn, screen) = x11rb::connect(None).context("failed to connect to the X server")?;
        let conn = Arc::new(conn);
        let root = conn.setup().roots[screen].root;
        let window = input_only(&conn, root, EventMask::NO_EVENT)?;
        let chunk = chunk_size(conn.maximum_request_bytes())?;
        let shared = Arc::new(Mutex::new(Shared {
            content: Arc::new(Payload::default()),
            active: None,
            owned: false,
            closed: VecDeque::new(),
            next_id: 1,
            stop: false,
            ended: false,
        }));
        let serving = Serving {
            conn: conn.clone(),
            window,
            atoms,
            shared: shared.clone(),
            chunk,
            transfers: Vec::new(),
        };
        let thread = std::thread::Builder::new()
            .name("clipboard owner".into())
            .spawn(move || serving.run())
            .context("failed to start the clipboard owner")?;
        Ok(Owner {
            conn,
            window,
            atoms,
            shared,
            thread: Some(thread),
        })
    }

    pub fn alive(&self) -> bool {
        !locked(&self.shared).ended
    }

    /// The owner's window and what it serves, while it owns CLIPBOARD.
    pub fn serving(&self) -> Option<(Window, Arc<Payload>)> {
        let shared = locked(&self.shared);
        (shared.owned && !shared.ended).then(|| (self.window, shared.content.clone()))
    }

    /// Takes CLIPBOARD at server time `time` to serve `payload` for one paste, whose cleanup restores `restore`.
    pub fn take(&self, payload: Payload, restore: Payload, time: u32) -> Result<Paste> {
        let id = {
            let mut shared = locked(&self.shared);
            if shared.ended {
                bail!("clipboard owner stopped during paste");
            }
            let id = shared.next_id;
            shared.next_id += 1;
            shared.content = Arc::new(payload);
            shared.active = Some(Active {
                id,
                owned_at: time,
                dispatched: None,
                taken: Instant::now(),
                watch: Watch::default(),
            });
            shared.owned = true;
            id
        };
        let paste = Paste {
            shared: self.shared.clone(),
            id,
            restore: Some(Arc::new(restore)),
        };
        self.conn.set_selection_owner(self.window, self.atoms.clipboard, time)?;
        let owner = self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner;
        if owner != self.window {
            locked(&self.shared).owned = false;
            bail!("failed to acquire X11 selection");
        }
        Ok(paste)
    }
}

impl Drop for Owner {
    fn drop(&mut self) {
        locked(&self.shared).stop = true;
        let wake = ClientMessageEvent::new(32, self.window, self.atoms.wake, [0u32; 5]);
        let _ = self.conn.send_event(false, self.window, EventMask::NO_EVENT, wake);
        let _ = self.conn.flush();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// One paste's serving generation. Dropping it without [`Paste::confirmed`] is the unconfirmed cleanup.
pub struct Paste {
    shared: Arc<Mutex<Shared>>,
    id: u64,
    /// Taken by the cleanup, which runs once.
    restore: Option<Arc<Payload>>,
}

impl Paste {
    /// Records the synthetic Ctrl+V's timestamp, the generation's key.
    pub fn dispatched(&self, time: u32) {
        if let Some(active) = locked(&self.shared).active.as_mut().filter(|a| a.id == self.id) {
            active.dispatched = Some(time);
        }
    }

    pub fn watch(&self) -> Watch {
        let shared = locked(&self.shared);
        shared
            .active
            .as_ref()
            .filter(|a| a.id == self.id)
            .map(|a| a.watch.clone())
            .unwrap_or_default()
    }

    /// Whether another client has taken CLIPBOARD since the paste took it.
    pub fn lost(&self) -> bool {
        let shared = locked(&self.shared);
        !shared.owned || shared.ended
    }

    /// The cleanup after a confirmed paste.
    pub fn confirmed(mut self) {
        self.cleanup(true);
    }

    /// The guarded cleanup (Design, The cleanup): the generation closed, and the snapshot served in its place while
    /// the engine still owns CLIPBOARD; nothing else after a `SelectionClear`.
    fn cleanup(&mut self, confirmed: bool) {
        let Some(restore) = self.restore.take() else { return };
        let mut shared = locked(&self.shared);
        let Some(active) = shared.active.take_if(|a| a.id == self.id) else {
            return;
        };
        let elapsed = active.taken.elapsed().as_millis() as u32;
        // The server's time now, estimated from the moment ownership was taken; one more millisecond so the window
        // covers a request stamped in the cleanup's own millisecond.
        let cleaned_at = active.owned_at.wrapping_add(elapsed).wrapping_add(1);
        shared.closed.push_back(Closed::new(
            active.owned_at,
            active.dispatched,
            cleaned_at,
            confirmed,
            Instant::now(),
        ));
        while shared.closed.len() > CLOSED_KEPT {
            shared.closed.pop_front();
        }
        if shared.owned {
            shared.content = restore;
        }
    }
}

impl Drop for Paste {
    fn drop(&mut self) {
        self.cleanup(false);
    }
}

/// An INCR transfer in flight: pinned to the payload it started with.
struct Transfer {
    requestor: Window,
    property: Atom,
    format: Format,
    offset: usize,
    /// The zero-length chunk that ends it has been written.
    ending: bool,
    started: Instant,
    progress: Instant,
    /// The paste it belongs to, if one was being served.
    paste: Option<u64>,
}

/// The owner thread's side.
struct Serving {
    conn: Arc<RustConnection>,
    window: Window,
    atoms: Atoms,
    shared: Arc<Mutex<Shared>>,
    chunk: usize,
    transfers: Vec<Transfer>,
}

impl Serving {
    fn run(mut self) {
        let _ = self.serve();
        locked(&self.shared).ended = true;
        let _ = self.conn.destroy_window(self.window);
        let _ = self.conn.flush();
    }

    fn serve(&mut self) -> Result<()> {
        loop {
            let event = if self.transfers.is_empty() {
                Some(self.conn.wait_for_event()?)
            } else {
                self.conn.poll_for_event()?
            };
            if locked(&self.shared).stop {
                return Ok(());
            }
            match event {
                Some(event) => self.handle(event)?,
                None => sleep(POLL),
            }
            self.expire(Instant::now());
            self.conn.flush()?;
        }
    }

    fn handle(&mut self, event: Event) -> Result<()> {
        match event {
            Event::SelectionRequest(e) => self.request(&e),
            Event::SelectionClear(e) if e.selection == self.atoms.clipboard && e.owner == self.window => {
                // A clear can be stale: the request thread may have taken CLIPBOARD again since. The server knows.
                let owner = self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner;
                if owner != self.window {
                    locked(&self.shared).owned = false;
                }
                Ok(())
            }
            Event::PropertyNotify(e) if e.state == Property::DELETE => self.acknowledged(e.window, e.atom),
            Event::DestroyNotify(e) => {
                self.drop_where(|t| t.requestor == e.window);
                Ok(())
            }
            _ => Ok(()),
        }
    }

    /// Notifies the requestor; `property` None refuses.
    fn notify(&self, e: &SelectionRequestEvent, property: Atom) -> Result<()> {
        let event = SelectionNotifyEvent {
            response_type: SELECTION_NOTIFY_EVENT,
            sequence: 0,
            time: e.time,
            requestor: e.requestor,
            selection: e.selection,
            target: e.target,
            property,
        };
        self.conn.send_event(false, e.requestor, EventMask::NO_EVENT, event)?;
        Ok(())
    }

    fn request(&mut self, e: &SelectionRequestEvent) -> Result<()> {
        if e.selection != self.atoms.clipboard || e.owner != self.window {
            return self.notify(e, x11rb::NONE);
        }
        let now = Instant::now();
        let (content, paste, refused) = {
            let mut shared = locked(&self.shared);
            let refused = !shared.owned || shared.closed.iter().any(|c| c.refuses(e.time, now));
            let content = shared.content.clone();
            let paste = shared.active.as_mut().map(|active| {
                let watch = &mut active.watch;
                watch.requests += 1;
                watch.first_request.get_or_insert(now);
                watch.last_progress = Some(now);
                active.id
            });
            (content, paste, refused)
        };
        // An obsolete requestor names no property: the target is the property (ICCCM).
        let property = if e.property == x11rb::NONE {
            e.target
        } else {
            e.property
        };
        if refused {
            return self.notify(e, x11rb::NONE);
        }
        if e.target == self.atoms.targets {
            let targets = content.targets(self.atoms.targets);
            self.conn.change_property(
                PropMode::REPLACE,
                e.requestor,
                property,
                AtomEnum::ATOM,
                32,
                targets.len() as u32,
                &targets.iter().flat_map(|a| a.to_ne_bytes()).collect::<Vec<u8>>(),
            )?;
            return self.notify(e, property);
        }
        let Some(format) = content.get(e.target).cloned() else {
            // `MULTIPLE`, `TIMESTAMP` and any target not served are refused, as the vendor refuses them.
            return self.notify(e, x11rb::NONE);
        };
        if format.data.len() <= self.chunk {
            self.write(e.requestor, property, &format, &format.data)?;
            self.notify(e, property)?;
            self.served(paste);
            return Ok(());
        }
        // INCR: watch the requestor's deletions first, so none is missed.
        let mask = EventMask::PROPERTY_CHANGE | EventMask::STRUCTURE_NOTIFY;
        self.conn
            .change_window_attributes(e.requestor, &ChangeWindowAttributesAux::new().event_mask(mask))?;
        let size = (format.data.len() as u32).to_ne_bytes();
        self.conn
            .change_property(PropMode::REPLACE, e.requestor, property, self.atoms.incr, 32, 1, &size)?;
        self.notify(e, property)?;
        // A new request on the same property supersedes a transfer still in flight there.
        self.transfers
            .retain(|t| (t.requestor, t.property) != (e.requestor, property));
        self.transfers.push(Transfer {
            requestor: e.requestor,
            property,
            format,
            offset: 0,
            ending: false,
            started: now,
            progress: now,
            paste,
        });
        self.recount();
        Ok(())
    }

    fn write(&self, requestor: Window, property: Atom, format: &Format, bytes: &[u8]) -> Result<()> {
        let unit = usize::from(format.format / 8).max(1);
        self.conn.change_property(
            PropMode::REPLACE,
            requestor,
            property,
            format.kind,
            format.format,
            (bytes.len() / unit) as u32,
            bytes,
        )?;
        Ok(())
    }

    /// The requestor deleted the property: the next chunk, the zero-length end, or the transfer done.
    fn acknowledged(&mut self, requestor: Window, property: Atom) -> Result<()> {
        let Some(i) = self
            .transfers
            .iter()
            .position(|t| t.requestor == requestor && t.property == property)
        else {
            return Ok(());
        };
        let now = Instant::now();
        let chunk = self.chunk;
        let t = &mut self.transfers[i];
        t.progress = now;
        if t.ending {
            let done = self.transfers.remove(i);
            self.release_requestor(done.requestor);
            self.served(done.paste);
            self.recount();
            return Ok(());
        }
        let end = (t.offset + chunk).min(t.format.data.len());
        let (offset, format) = (t.offset, t.format.clone());
        t.ending = offset == end;
        t.offset = end;
        let paste = t.paste;
        self.write(requestor, property, &format, &format.data[offset..end])?;
        self.progressed(paste, now);
        Ok(())
    }

    /// Drops transfers past the transfer bounds: no progress for 2 s, or running past 10 s.
    fn expire(&mut self, now: Instant) {
        self.drop_where(|t| now - t.progress >= TRANSFER_GAP || now - t.started >= TRANSFER_WAIT);
    }

    fn drop_where(&mut self, stale: impl Fn(&Transfer) -> bool) {
        let (gone, kept): (Vec<Transfer>, Vec<Transfer>) = self.transfers.drain(..).partition(|t| stale(t));
        self.transfers = kept;
        if gone.is_empty() {
            return;
        }
        for t in &gone {
            self.release_requestor(t.requestor);
        }
        {
            let mut shared = locked(&self.shared);
            if let Some(active) = shared.active.as_mut() {
                active.watch.stalled += gone.iter().filter(|t| t.paste == Some(active.id)).count() as u32;
            }
        }
        self.recount();
    }

    /// Stops watching a requestor no transfer needs any more.
    fn release_requestor(&self, requestor: Window) {
        if self.transfers.iter().all(|t| t.requestor != requestor) {
            let aux = ChangeWindowAttributesAux::new().event_mask(EventMask::NO_EVENT);
            let _ = self.conn.change_window_attributes(requestor, &aux);
        }
    }

    fn served(&self, paste: Option<u64>) {
        let mut shared = locked(&self.shared);
        if let Some(active) = shared.active.as_mut().filter(|a| Some(a.id) == paste) {
            active.watch.served += 1;
            active.watch.last_progress = Some(Instant::now());
        }
    }

    fn progressed(&self, paste: Option<u64>, now: Instant) {
        let mut shared = locked(&self.shared);
        if let Some(active) = shared.active.as_mut().filter(|a| Some(a.id) == paste) {
            active.watch.last_progress = Some(now);
        }
    }

    fn recount(&self) {
        let mut shared = locked(&self.shared);
        if let Some(active) = shared.active.as_mut() {
            active.watch.active = self.transfers.iter().filter(|t| t.paste == Some(active.id)).count() as u32;
        }
    }
}
