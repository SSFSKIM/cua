//! The persistent CLIPBOARD owner (Design, Text and clipboard steps 3 and 5, The cleanup, Serving generations,
//! Transfer bounds; behaviour §13.4–13.5): one X connection, one unmapped InputOnly window and one thread that
//! answers `SelectionRequest`s for as long as the engine lives or another client takes CLIPBOARD.
//!
//! The request thread asks for CLIPBOARD for a paste with [`Owner::take`], and the owner thread takes it, so taking
//! CLIPBOARD and handling a `SelectionClear` never interleave. `take` returns the [`Paste`]: its cleanup, run on
//! every exit path (an explicit [`Paste::confirmed`] or a drop), never calls `SetSelectionOwner`. While the engine
//! still owns CLIPBOARD it switches what is served to the snapshot taken before the paste, and keeps serving that;
//! after a `SelectionClear` it does nothing. Each paste is a serving generation: once its cleanup has run, a
//! conversion that carries its timestamps is refused (`serving.rs`), so a late requestor never receives the
//! restored snapshot as if it were the paste. An INCR transfer keeps the payload it started with, and one that
//! stops for 2 s between chunks or runs past 10 s is dropped.

use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{JoinHandle, sleep};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use x11rb::connection::{Connection, RequestConnection};
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, PropMode, Property,
    SELECTION_NOTIFY_EVENT, SelectionNotifyEvent, SelectionRequestEvent, Window,
};
use x11rb::rust_connection::RustConnection;

use super::serving::{Atom, Closed, Format, Payload, Refusals, chunk_size};
use super::{Atoms, TRANSFER_GAP, TRANSFER_WAIT, input_only};

/// The tests' interleavings: a pause in the `SelectionClear` handling between its check and its conclusion, a pause
/// after a take is dequeued and before CLIPBOARD is taken, and the signal that a pause has begun.
#[cfg(test)]
pub static CLEAR_PAUSE_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(test)]
pub static TAKE_PAUSE_MS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
#[cfg(test)]
pub static PAUSED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Holds the thread for a test's pause, signalling it.
#[cfg(test)]
fn test_pause(pause: &std::sync::atomic::AtomicU64) {
    use std::sync::atomic::Ordering::SeqCst;
    let ms = pause.load(SeqCst);
    if ms > 0 {
        PAUSED.store(true, SeqCst);
        sleep(Duration::from_millis(ms));
    }
}

/// How long the thread sleeps between polls while an INCR transfer is in flight (it blocks otherwise).
const POLL: Duration = Duration::from_millis(2);
/// How long the request thread waits for the owner thread to take CLIPBOARD (shorter in tests, which wait it out).
pub(super) const TAKE_WAIT: Duration = Duration::from_secs(if cfg!(test) { 1 } else { 5 });
/// How many requests one paste's [`Watch`] lists; its counts go on.
const WATCH_LOG: usize = 256;

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
    /// Each request, in arrival order (the first [`WATCH_LOG`]), with its requestor window, so the paste route can
    /// tell the target's X client's requests from another client's (by `resource_id_mask`).
    pub log: Vec<Seen>,
}

/// One request a paste's owner saw.
#[derive(Debug, Clone, PartialEq)]
pub struct Seen {
    pub requestor: Window,
    pub target: Atom,
    /// The request's timestamp; 0 is `CurrentTime`.
    pub time: u32,
    pub at: Instant,
    pub outcome: Outcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// Refused: a closed paste's timestamp, the engine no longer the owner, or a target not served.
    Refused,
    /// Answered with the `TARGETS` list.
    Targets,
    /// One of the paste's formats served in full.
    Served,
    /// An INCR transfer of one of the paste's formats, still in flight.
    Transferring,
    /// An INCR transfer dropped at the bounds or by its requestor's going.
    Stalled,
}

impl Watch {
    fn log(&mut self, seen: Seen) -> Option<usize> {
        (self.log.len() < WATCH_LOG).then(|| {
            self.log.push(seen);
            self.log.len() - 1
        })
    }

    fn mark(&mut self, entry: Option<usize>, outcome: Outcome) {
        if let Some(seen) = entry.and_then(|i| self.log.get_mut(i)) {
            seen.outcome = outcome;
        }
    }
}

struct Active {
    id: u64,
    owned_at: u32,
    dispatched: Option<u32>,
    /// A moment no later than when `owned_at` was read, for the cleanup's conservative estimate of the server's time.
    anchor: Instant,
    /// What the cleanup serves in the paste's place.
    restore: Arc<Payload>,
    watch: Watch,
}

/// A paste's request for CLIPBOARD, carried out by the owner thread: it carries what its cleanup restores, so a take
/// its caller has given up on can still end in the cleanup.
struct Take {
    /// Matches the take's outcome to the take.
    token: u64,
    payload: Payload,
    restore: Arc<Payload>,
    time: u32,
    anchor: Instant,
}

struct Shared {
    /// What is served now.
    content: Arc<Payload>,
    /// The paste being served, if one is.
    active: Option<Active>,
    /// The engine owns CLIPBOARD: it took it and has had no `SelectionClear` since. Only the owner thread sets it.
    owned: bool,
    refusals: Refusals,
    next_id: u64,
    /// A take waiting for the owner thread, and its outcome by token: the paste's id, or the sentence.
    take: Option<Take>,
    taken: Option<(u64, std::result::Result<u64, String>)>,
    next_token: u64,
    /// Takes whose caller stopped waiting after the owner thread had started them: cleaned up when they complete.
    abandoned: Vec<u64>,
    /// The thread ends at its next event.
    stop: bool,
    /// The thread has ended (stopped, or its connection broke).
    ended: bool,
}

/// The state both threads share, and the signal for a finished take.
struct State {
    shared: Mutex<Shared>,
    taken: Condvar,
}

impl State {
    fn locked(&self) -> MutexGuard<'_, Shared> {
        self.shared.lock().unwrap_or_else(|e| e.into_inner())
    }
}

/// Wakes the owner thread: a message to its own window reaches its own connection.
fn wake(conn: &RustConnection, window: Window, atoms: &Atoms) {
    let message = ClientMessageEvent::new(32, window, atoms.wake, [0u32; 5]);
    let _ = conn.send_event(false, window, EventMask::NO_EVENT, message);
    let _ = conn.flush();
}

pub struct Owner {
    conn: Arc<RustConnection>,
    window: Window,
    atoms: Atoms,
    state: Arc<State>,
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
        let state = Arc::new(State {
            shared: Mutex::new(Shared {
                content: Arc::new(Payload::default()),
                active: None,
                owned: false,
                refusals: Refusals::default(),
                next_id: 1,
                take: None,
                taken: None,
                next_token: 1,
                abandoned: Vec::new(),
                stop: false,
                ended: false,
            }),
            taken: Condvar::new(),
        });
        let serving = Serving {
            conn: conn.clone(),
            window,
            atoms,
            state: state.clone(),
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
            state,
            thread: Some(thread),
        })
    }

    pub fn alive(&self) -> bool {
        !self.state.locked().ended
    }

    /// The owner's window and what it serves, while it owns CLIPBOARD.
    pub fn serving(&self) -> Option<(Window, Arc<Payload>)> {
        let shared = self.state.locked();
        (shared.owned && !shared.ended).then(|| (self.window, shared.content.clone()))
    }

    /// Takes CLIPBOARD at server time `time` to serve `payload` for one paste, whose cleanup restores `restore`.
    /// `anchor` is a moment no later than when `time` was read. The owner thread takes it and verifies it.
    pub fn take(&self, payload: Payload, restore: Payload, time: u32, anchor: Instant) -> Result<Paste> {
        let token = {
            let mut shared = self.state.locked();
            if shared.ended {
                bail!("clipboard owner stopped during paste");
            }
            let token = shared.next_token;
            shared.next_token += 1;
            shared.take = Some(Take {
                token,
                payload,
                restore: Arc::new(restore),
                time,
                anchor,
            });
            shared.taken = None;
            token
        };
        wake(&self.conn, self.window, &self.atoms);
        let deadline = Instant::now() + TAKE_WAIT;
        let mut shared = self.state.locked();
        let taken = loop {
            // An outcome for another token is a stale one, and dropped.
            if let Some((for_token, taken)) = shared.taken.take()
                && for_token == token
            {
                break taken;
            }
            if shared.ended {
                bail!("clipboard owner stopped during paste");
            }
            let now = Instant::now();
            if now >= deadline {
                // Not started: withdrawn. Started: the owner thread cleans it up when it completes.
                if shared.take.as_ref().is_some_and(|t| t.token == token) {
                    shared.take = None;
                } else {
                    shared.abandoned.push(token);
                }
                bail!("clipboard owner did not take CLIPBOARD");
            }
            shared = self
                .state
                .taken
                .wait_timeout(shared, deadline - now)
                .unwrap_or_else(|e| e.into_inner())
                .0;
        };
        let id = taken.map_err(|e| anyhow!(e))?;
        Ok(Paste {
            state: self.state.clone(),
            id,
            done: false,
        })
    }
}

impl Drop for Owner {
    fn drop(&mut self) {
        self.state.locked().stop = true;
        wake(&self.conn, self.window, &self.atoms);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// One paste's serving generation. Dropping it without [`Paste::confirmed`] is the unconfirmed cleanup.
pub struct Paste {
    state: Arc<State>,
    id: u64,
    /// The cleanup has run; it runs once.
    done: bool,
}

impl Paste {
    /// Records the synthetic Ctrl+V's timestamp, the generation's key.
    pub fn dispatched(&self, time: u32) {
        if let Some(active) = self.state.locked().active.as_mut().filter(|a| a.id == self.id) {
            active.dispatched = Some(time);
        }
    }

    pub fn watch(&self) -> Watch {
        let shared = self.state.locked();
        shared
            .active
            .as_ref()
            .filter(|a| a.id == self.id)
            .map(|a| a.watch.clone())
            .unwrap_or_default()
    }

    /// Whether another client has taken CLIPBOARD since the paste took it.
    pub fn lost(&self) -> bool {
        let shared = self.state.locked();
        !shared.owned || shared.ended
    }

    /// The cleanup after a confirmed paste.
    pub fn confirmed(mut self) {
        self.cleanup(true);
    }

    /// The guarded cleanup (Design, The cleanup): the generation closed, and the snapshot served in its place while
    /// the engine still owns CLIPBOARD; nothing else after a `SelectionClear`.
    fn cleanup(&mut self, confirmed: bool) {
        if !std::mem::replace(&mut self.done, true) {
            close(&mut self.state.locked(), self.id, confirmed);
        }
    }
}

/// Closes paste `id`, if it is the one being served: its generation's refusal recorded, and its snapshot served in its
/// place while the engine still owns CLIPBOARD.
fn close(shared: &mut Shared, id: u64, confirmed: bool) {
    let Some(active) = shared.active.take_if(|a| a.id == id) else {
        return;
    };
    // The server's time now, estimated never earlier than it is: the anchor was taken no later than the ownership
    // timestamp was read, so the time elapsed since it is at least the server's. One millisecond more covers a request
    // stamped in the cleanup's own millisecond, and one per thousand the clocks' drift.
    let elapsed = active.anchor.elapsed().as_millis() as u32;
    let cleaned_at = active.owned_at.wrapping_add(elapsed).wrapping_add(1 + elapsed / 1000);
    let closed = Closed::new(
        active.owned_at,
        active.dispatched,
        cleaned_at,
        confirmed,
        Instant::now(),
    );
    shared.refusals.push(closed);
    if shared.owned {
        shared.content = active.restore;
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
    /// The paste it belongs to, if one was being served, and its entry in that paste's log.
    paste: Option<u64>,
    seen: Option<usize>,
}

/// The owner thread's side.
struct Serving {
    conn: Arc<RustConnection>,
    window: Window,
    atoms: Atoms,
    state: Arc<State>,
    chunk: usize,
    transfers: Vec<Transfer>,
}

impl Serving {
    fn run(mut self) {
        let _ = self.serve();
        self.state.locked().ended = true;
        self.state.taken.notify_all();
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
            if self.state.locked().stop {
                return Ok(());
            }
            match event {
                Some(event) => self.handle(event)?,
                None => sleep(POLL),
            }
            self.take()?;
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
                #[cfg(test)]
                test_pause(&CLEAR_PAUSE_MS);
                if owner != self.window {
                    self.state.locked().owned = false;
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

    /// A waiting take: the generation set up, CLIPBOARD taken at the paste's timestamp and the owner read back. On
    /// this thread, so no `SelectionClear` is handled in between.
    fn take(&mut self) -> Result<()> {
        let Some(take) = self.state.locked().take.take() else {
            return Ok(());
        };
        #[cfg(test)]
        test_pause(&TAKE_PAUSE_MS);
        let id = {
            let mut shared = self.state.locked();
            let id = shared.next_id;
            shared.next_id += 1;
            shared.content = Arc::new(take.payload);
            shared.active = Some(Active {
                id,
                owned_at: take.time,
                dispatched: None,
                anchor: take.anchor,
                restore: take.restore,
                watch: Watch::default(),
            });
            id
        };
        self.conn
            .set_selection_owner(self.window, self.atoms.clipboard, take.time)?;
        let owner = self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner;
        let mut shared = self.state.locked();
        shared.owned = owner == self.window;
        if let Some(i) = shared.abandoned.iter().position(|t| *t == take.token) {
            // Its caller has gone: no `Paste` will clean it up, so its cleanup runs now. Nothing was dispatched, so no
            // conversion can be pending for it and it opens no `CurrentTime` refusal.
            shared.abandoned.swap_remove(i);
            close(&mut shared, id, true);
            return Ok(());
        }
        let result = if shared.owned {
            Ok(id)
        } else {
            shared.active = None;
            Err("failed to acquire X11 selection".into())
        };
        shared.taken = Some((take.token, result));
        drop(shared);
        self.state.taken.notify_all();
        Ok(())
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
            let mut shared = self.state.locked();
            let refused = !shared.owned || shared.refusals.refuses(e.time, now);
            let content = shared.content.clone();
            let paste = shared.active.as_mut().map(|active| {
                let watch = &mut active.watch;
                watch.requests += 1;
                watch.first_request.get_or_insert(now);
                watch.last_progress = Some(now);
                let seen = watch.log(Seen {
                    requestor: e.requestor,
                    target: e.target,
                    time: e.time,
                    at: now,
                    outcome: Outcome::Refused,
                });
                (active.id, seen)
            });
            (content, paste, refused)
        };
        let seen = paste.and_then(|(_, seen)| seen);
        let paste = paste.map(|(id, _)| id);
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
            self.mark(paste, seen, Outcome::Targets);
            return self.notify(e, property);
        }
        let Some(format) = content.get(e.target).cloned() else {
            // `MULTIPLE`, `TIMESTAMP` and any target not served are refused, as the vendor refuses them.
            return self.notify(e, x11rb::NONE);
        };
        if format.data.len() <= self.chunk {
            self.write(e.requestor, property, &format, &format.data)?;
            self.notify(e, property)?;
            self.served(paste, seen);
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
            seen,
        });
        self.mark(paste, seen, Outcome::Transferring);
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
            self.served(done.paste, done.seen);
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
            let mut shared = self.state.locked();
            if let Some(active) = shared.active.as_mut() {
                for t in gone.iter().filter(|t| t.paste == Some(active.id)) {
                    active.watch.stalled += 1;
                    active.watch.mark(t.seen, Outcome::Stalled);
                }
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

    fn served(&self, paste: Option<u64>, seen: Option<usize>) {
        let mut shared = self.state.locked();
        if let Some(active) = shared.active.as_mut().filter(|a| Some(a.id) == paste) {
            active.watch.served += 1;
            active.watch.last_progress = Some(Instant::now());
            active.watch.mark(seen, Outcome::Served);
        }
    }

    fn mark(&self, paste: Option<u64>, seen: Option<usize>, outcome: Outcome) {
        let mut shared = self.state.locked();
        if let Some(active) = shared.active.as_mut().filter(|a| Some(a.id) == paste) {
            active.watch.mark(seen, outcome);
        }
    }

    fn progressed(&self, paste: Option<u64>, now: Instant) {
        let mut shared = self.state.locked();
        if let Some(active) = shared.active.as_mut().filter(|a| Some(a.id) == paste) {
            active.watch.last_progress = Some(now);
        }
    }

    fn recount(&self) {
        let mut shared = self.state.locked();
        if let Some(active) = shared.active.as_mut() {
            active.watch.active = self.transfers.iter().filter(|t| t.paste == Some(active.id)).count() as u32;
        }
    }
}
