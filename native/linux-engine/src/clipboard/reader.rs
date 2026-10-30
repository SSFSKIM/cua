//! Reading CLIPBOARD (behaviour §13.3) within the snapshot bounds (Design, Snapshot bounds): 500 ms for the
//! `TARGETS` reply, 500 ms for each format's first response, 2 s between INCR chunks, 5 s overall, and the vendor's
//! 64 MiB across all formats. The owner must not change while its contents are captured.
//!
//! The reader watches CLIPBOARD's owner through XFIXES on its own window, which also serves the server-time probe;
//! each conversion gets a fresh requestor window, so an answer to an earlier, abandoned one cannot be mistaken for
//! its own.

use std::collections::HashMap;
use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, EventMask, PropMode, Property, Window};
use x11rb::rust_connection::RustConnection;

use super::serving::{Atom, Format, Payload};
use super::{Atoms, CHUNK_GAP, FORMAT_WAIT, MAX_SNAPSHOT_BYTES, SNAPSHOT_WAIT, TARGETS_WAIT, input_only};

/// The most `TARGETS` may hold, as the vendor reads it.
const TARGETS_BYTES: usize = 1024;
/// How long the reader sleeps when no event is queued.
const POLL: Duration = Duration::from_millis(1);

/// Targets never captured, by name (behaviour §13.3).
const SKIPPED_TARGETS: &[&str] = &[
    "BITMAP",
    "DELETE",
    "PIXMAP",
    "WINDOW",
    "TARGETS",
    "COLORMAP",
    "DRAWABLE",
    "MULTIPLE",
    "TIMESTAMP",
    "TARGET_SIZES",
    "SAVE_TARGETS",
    "INSERT_PROPERTY",
    "INSERT_SELECTION",
];
/// Reply types dropped: they name server resources, not data.
const SKIPPED_TYPES: &[&str] = &["COLORMAP", "DRAWABLE", "WINDOW", "PIXMAP", "BITMAP"];

pub struct Reader {
    conn: Arc<RustConnection>,
    root: Window,
    atoms: Atoms,
    /// Watches CLIPBOARD through XFIXES and takes the server-time probe's property changes.
    window: Window,
    /// Owner changes seen so far.
    generation: u64,
    names: HashMap<Atom, String>,
}

/// Why a conversion stopped waiting, worded for the sentence.
#[derive(Clone, Copy)]
enum Waiting<'a> {
    Targets,
    Format(&'a str),
}

impl Reader {
    pub fn new(conn: Arc<RustConnection>, root: Window, atoms: Atoms) -> Result<Reader> {
        let window = input_only(&conn, root, EventMask::PROPERTY_CHANGE)?;
        let mask = SelectionEventMask::SET_SELECTION_OWNER
            | SelectionEventMask::SELECTION_WINDOW_DESTROY
            | SelectionEventMask::SELECTION_CLIENT_CLOSE;
        conn.xfixes_select_selection_input(window, atoms.clipboard, mask)?
            .check()?;
        Ok(Reader {
            conn,
            root,
            atoms,
            window,
            generation: 0,
            names: HashMap::new(),
        })
    }

    /// Notes what every event tells the reader (an owner change bumps the generation) and hands it back.
    fn note(&mut self, event: Event) -> Event {
        if let Event::XfixesSelectionNotify(e) = &event
            && e.selection == self.atoms.clipboard
        {
            self.generation += 1;
        }
        event
    }

    /// The next event before `until`, or None.
    fn next_event(&mut self, until: Instant) -> Result<Option<Event>> {
        loop {
            if let Some(event) = self.conn.poll_for_event()? {
                return Ok(Some(self.note(event)));
            }
            let now = Instant::now();
            if now >= until {
                return Ok(None);
            }
            sleep(POLL.min(until - now));
        }
    }

    /// Every event queued after a round trip, noted.
    fn drain(&mut self) -> Result<()> {
        self.conn.get_input_focus()?.reply()?;
        while let Some(event) = self.conn.poll_for_event()? {
            self.note(event);
        }
        Ok(())
    }

    pub fn generation(&mut self) -> Result<u64> {
        self.drain()?;
        Ok(self.generation)
    }

    pub fn wait_for_change(&mut self, since: u64, wait: Duration) -> Result<bool> {
        let until = Instant::now() + wait;
        self.drain()?;
        while self.generation == since {
            if self.next_event(until)?.is_none() {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// The server's time now: a zero-length append to the reader's window, whose `PropertyNotify` carries it.
    pub fn server_time(&mut self) -> Result<u32> {
        self.conn.change_property(
            PropMode::APPEND,
            self.window,
            self.atoms.property,
            AtomEnum::STRING,
            8,
            0,
            &[],
        )?;
        self.conn.flush()?;
        let until = Instant::now() + Duration::from_secs(1);
        while let Some(event) = self.next_event(until)? {
            if let Event::PropertyNotify(e) = event
                && e.window == self.window
            {
                return Ok(e.time);
            }
        }
        bail!("X11 did not return a timestamp for the clipboard")
    }

    fn name(&mut self, atom: Atom) -> Result<String> {
        if let Some(name) = self.names.get(&atom) {
            return Ok(name.clone());
        }
        let name = String::from_utf8_lossy(&self.conn.get_atom_name(atom)?.reply()?.name).into_owned();
        self.names.insert(atom, name.clone());
        Ok(name)
    }

    /// The snapshot (behaviour §13.3): empty without an owner; else `TARGETS`, then each target not skipped, in
    /// offered order, stored in ascending atom order.
    pub fn snapshot(&mut self) -> Result<Payload> {
        let deadline = Instant::now() + SNAPSHOT_WAIT;
        self.drain()?;
        let start = self.generation;
        let owner = self.conn.get_selection_owner(self.atoms.clipboard)?.reply()?.owner;
        if owner == x11rb::NONE {
            return Ok(Payload::default());
        }
        let mut budget = MAX_SNAPSHOT_BYTES;
        let targets = match self.convert(self.atoms.targets, Waiting::Targets, TARGETS_BYTES, deadline)? {
            Some(reply) => reply,
            None => bail!("clipboard owner did not provide its formats"),
        };
        if targets.kind != u32::from(AtomEnum::ATOM) || targets.format != 32 || targets.data.len() % 4 != 0 {
            bail!("clipboard owner returned invalid TARGETS");
        }
        self.check_unchanged(start)?;
        let mut seen = Vec::new();
        let mut formats = Vec::new();
        for chunk in targets.data.chunks_exact(4) {
            let atom = u32::from_ne_bytes(chunk.try_into().expect("four bytes"));
            if atom == x11rb::NONE || seen.contains(&atom) {
                continue;
            }
            seen.push(atom);
            let name = self.name(atom)?;
            if SKIPPED_TARGETS.contains(&name.as_str()) {
                continue;
            }
            let reply = self
                .convert(atom, Waiting::Format(&name), budget, deadline)
                .map_err(|e| failed_format(&name, e))?;
            self.check_unchanged(start)?;
            let Some(reply) = reply else { continue };
            if SKIPPED_TYPES.contains(&self.name(reply.kind)?.as_str()) {
                continue;
            }
            budget -= reply.data.len();
            formats.push(Format {
                target: atom,
                kind: reply.kind,
                format: reply.format,
                data: Arc::from(reply.data),
            });
        }
        Ok(Payload::snapshot(formats))
    }

    fn check_unchanged(&mut self, start: u64) -> Result<()> {
        self.drain()?;
        if self.generation != start {
            bail!("clipboard changed while its contents were being captured");
        }
        Ok(())
    }

    /// One conversion of CLIPBOARD to `target` on a fresh requestor window: None when the owner refuses it.
    fn convert(&mut self, target: Atom, waiting: Waiting, cap: usize, deadline: Instant) -> Result<Option<Reply>> {
        let window = input_only(&self.conn, self.root, EventMask::PROPERTY_CHANGE)?;
        let result = self.convert_on(window, target, waiting, cap, deadline);
        let _ = self.conn.destroy_window(window);
        let _ = self.conn.flush();
        result
    }

    fn convert_on(
        &mut self,
        window: Window,
        target: Atom,
        waiting: Waiting,
        cap: usize,
        deadline: Instant,
    ) -> Result<Option<Reply>> {
        let property = self.atoms.property;
        self.conn
            .convert_selection(window, self.atoms.clipboard, target, property, x11rb::CURRENT_TIME)?;
        self.conn.flush()?;
        let first = Instant::now()
            + match waiting {
                Waiting::Targets => TARGETS_WAIT,
                Waiting::Format(_) => FORMAT_WAIT,
            };
        let notify = loop {
            match self.next_event(first.min(deadline))? {
                Some(Event::SelectionNotify(e)) if e.requestor == window => break e,
                Some(_) => {}
                None => return Err(timed_out(waiting, first, deadline)),
            }
        };
        if notify.property == x11rb::NONE {
            return Ok(None);
        }
        if notify.property != property {
            bail!("unexpected selection property");
        }
        let head = self
            .conn
            .get_property(false, window, property, AtomEnum::ANY, 0, 0)?
            .reply()?;
        if head.type_ == self.atoms.incr {
            return self.read_incr(window, &head, waiting, cap, deadline).map(Some);
        }
        if head.bytes_after as usize > cap {
            bail!("X11 selection exceeds byte limit");
        }
        let whole = self
            .conn
            .get_property(true, window, property, AtomEnum::ANY, 0, head.bytes_after.div_ceil(4))?
            .reply()?;
        if whole.bytes_after != 0 {
            bail!("incomplete X11 selection property");
        }
        let reply = Reply {
            kind: whole.type_,
            format: whole.format,
            data: whole.value,
        };
        reply.check()?;
        Ok(Some(reply))
    }

    /// An INCR transfer: the size checked, the INCR property deleted to start it, then each new chunk read and
    /// deleted until a zero-length one, each within 2 s of the last and all before the deadline.
    fn read_incr(
        &mut self,
        window: Window,
        head: &x11rb::protocol::xproto::GetPropertyReply,
        waiting: Waiting,
        cap: usize,
        deadline: Instant,
    ) -> Result<Reply> {
        let property = self.atoms.property;
        if head.format != 32 {
            bail!("invalid INCR property format");
        }
        let incr = self
            .conn
            .get_property(true, window, property, AtomEnum::ANY, 0, 1)?
            .reply()?;
        let size = incr.value32().and_then(|mut v| v.next()).unwrap_or(0) as usize;
        if size > cap {
            bail!("X11 selection exceeds byte limit");
        }
        self.conn.flush()?;
        let mut reply: Option<Reply> = None;
        loop {
            let gap = Instant::now() + CHUNK_GAP;
            loop {
                match self.next_event(gap.min(deadline))? {
                    Some(Event::PropertyNotify(e))
                        if e.window == window && e.atom == property && e.state == Property::NEW_VALUE =>
                    {
                        break;
                    }
                    Some(_) => {}
                    None if Instant::now() >= deadline => bail!(overall()),
                    None => bail!(match waiting {
                        Waiting::Targets =>
                            "clipboard capture timed out: the clipboard owner sent no INCR chunk of TARGETS for 2 s"
                                .to_string(),
                        Waiting::Format(name) => format!(
                            "clipboard capture timed out: the clipboard owner sent no INCR chunk of {name} for 2 s"
                        ),
                    }),
                }
            }
            let left = cap - reply.as_ref().map_or(0, |r| r.data.len());
            let chunk = self
                .conn
                .get_property(
                    true,
                    window,
                    property,
                    AtomEnum::ANY,
                    0,
                    (left as u32).div_ceil(4).max(1),
                )?
                .reply()?;
            if chunk.bytes_after != 0 {
                bail!("X11 selection exceeds byte limit");
            }
            if chunk.value.is_empty() {
                let reply = reply.unwrap_or(Reply {
                    kind: chunk.type_,
                    format: chunk.format,
                    data: Vec::new(),
                });
                reply.check()?;
                return Ok(reply);
            }
            match &mut reply {
                None => {
                    reply = Some(Reply {
                        kind: chunk.type_,
                        format: chunk.format,
                        data: chunk.value,
                    })
                }
                Some(r) if (r.kind, r.format) != (chunk.type_, chunk.format) => {
                    bail!("X11 selection changed type during INCR transfer")
                }
                Some(r) => r.data.extend_from_slice(&chunk.value),
            }
        }
    }
}

struct Reply {
    kind: Atom,
    format: u8,
    data: Vec<u8>,
}

impl Reply {
    fn check(&self) -> Result<()> {
        match self.format {
            8 | 16 | 32 => {}
            other => bail!("invalid X11 property format {other}"),
        }
        if !self.data.len().is_multiple_of(self.format as usize / 8) {
            bail!("misaligned X11 selection data");
        }
        Ok(())
    }
}

fn overall() -> String {
    format!(
        "clipboard capture timed out: the clipboard did not finish within {} s",
        SNAPSHOT_WAIT.as_secs()
    )
}

/// The sentence for a conversion with no first answer: the overall bound when it was the deadline that ran out.
fn timed_out(waiting: Waiting, first: Instant, deadline: Instant) -> anyhow::Error {
    if deadline < first {
        return anyhow!(overall());
    }
    let ms = match waiting {
        Waiting::Targets => TARGETS_WAIT,
        Waiting::Format(_) => FORMAT_WAIT,
    }
    .as_millis();
    match waiting {
        Waiting::Targets => {
            anyhow!("clipboard capture timed out: the clipboard owner did not answer TARGETS within {ms} ms")
        }
        Waiting::Format(name) => {
            anyhow!("clipboard capture timed out: the clipboard owner did not answer {name} within {ms} ms")
        }
    }
}

/// A format's failure in the vendor's context, except the bounds' own sentences, which already name the format.
fn failed_format(name: &str, error: anyhow::Error) -> anyhow::Error {
    if error.to_string().starts_with("clipboard capture timed out") {
        return error;
    }
    error.context(format!("failed to capture clipboard format {name:?}"))
}
