//! The held record: what the engine holds down through XTEST, for the REPL host's launcher shim (`shim.rs`), which runs
//! outside the trusted worker's sandbox and releases it once nothing inside can (the design session's ruling, M4 T7b
//! fix 4). XTEST keys and buttons are the X server's own state, so a key the engine pressed stays down when the engine
//! dies without its exit (the sandbox's PID namespace ending under it is a SIGKILL); a window's synthetic key leaves
//! nothing at the server and is never recorded.
//!
//! The record is a FIFO the shim makes in a private directory under the worker's TMPDIR, the run's own temporary
//! directory (`<home>/run/<session>/tmp`), whose path it names to the engine in `CUA_ENGINE_HELD_RECORD`. Not a file:
//! under the default sandbox state the worker can write nothing (its whole filesystem is bound read-only), and a FIFO
//! opens for writing on a read-only mount; it is reached by the path the worker can already read, so no sandbox policy
//! changes for it. The engine writes the whole XTEST-held set, one fixed record per change, under the ledger's lock
//! (`pressed.rs`): a press's record before the press is sent, a release's once it went out, and an empty one once its
//! exit has released. One record is far under PIPE_BUF, so each write reaches the reader whole. The shim keeps the
//! latest record it read: a later engine's first record replaces what an earlier one left, so it never releases from a
//! state another engine has since replaced, and since the FIFO is made fresh by each shim and removed with it, nothing
//! of an earlier run is ever read.
//!
//! Once every writer has closed the FIFO the reader sees its end (POLLHUP): the engine has exited, so it can press
//! nothing more. The shim releases only then, or after a bound.

use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::{AsFd, BorrowedFd, OwnedFd};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use rustix::event::{PollFd, PollFlags, Timespec};
use rustix::fs::{FileType, Mode, OFlags};

/// The environment variable that names the record to the engine.
pub const RECORD_ENV: &str = "CUA_ENGINE_HELD_RECORD";

/// One record's length in bytes: a header of 8, then two bytes for each held key or button.
pub const RECORD_LEN: usize = 128;
const MAGIC: [u8; 4] = *b"cuaH";
const VERSION: u8 = 1;
/// How many held keys and buttons one record carries; beyond it the latest presses go unrecorded (XTEST holds that
/// many keys down at once nowhere in the engine).
pub const CAPACITY: usize = (RECORD_LEN - 8) / 2;
const KEY: u8 = 1;
const BUTTON: u8 = 2;

/// One key or button the engine holds down through XTEST.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Held {
    Key(u8),
    Button(u8),
}

/// The record of `held`, in press order.
pub fn encode(held: &[Held]) -> [u8; RECORD_LEN] {
    let mut record = [0u8; RECORD_LEN];
    record[..4].copy_from_slice(&MAGIC);
    record[4] = VERSION;
    let held = &held[..held.len().min(CAPACITY)];
    record[5] = held.len() as u8;
    for (i, h) in held.iter().enumerate() {
        let (kind, code) = match *h {
            Held::Key(code) => (KEY, code),
            Held::Button(code) => (BUTTON, code),
        };
        record[8 + 2 * i] = kind;
        record[8 + 2 * i + 1] = code;
    }
    record
}

/// The set a record carries, or None for bytes that are not one.
pub fn decode(record: &[u8]) -> Option<Vec<Held>> {
    if record.len() != RECORD_LEN || record[..4] != MAGIC || record[4] != VERSION {
        return None;
    }
    let n = usize::from(record[5]);
    if n > CAPACITY {
        return None;
    }
    (0..n)
        .map(|i| match (record[8 + 2 * i], record[8 + 2 * i + 1]) {
            (KEY, code) => Some(Held::Key(code)),
            (BUTTON, code) => Some(Held::Button(code)),
            _ => None,
        })
        .collect()
}

/// The engine's end of the record: the FIFO `CUA_ENGINE_HELD_RECORD` names ([`open`]), or None when it names none.
pub fn open_from_env() -> Option<File> {
    open(Path::new(&std::env::var_os(RECORD_ENV)?))
}

/// The FIFO at `path` opened for writing, or None when it is none or has no reader (an engine not started under the
/// shim, or a shim gone already: a FIFO with no reader refuses the open). Its first record, empty, replaces whatever an
/// engine before it left. Close-on-exec, so no application the engine launches holds it.
pub fn open(path: &Path) -> Option<File> {
    // the open does not wait for a reader; the writes then block, rather than drop a record, while the pipe is full
    let fd = rustix::fs::open(
        path,
        OFlags::WRONLY | OFlags::NONBLOCK | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    )
    .ok()?;
    let is_fifo = rustix::fs::fstat(&fd).is_ok_and(|s| FileType::from_raw_mode(s.st_mode) == FileType::Fifo);
    if !is_fifo || rustix::fs::fcntl_setfl(&fd, OFlags::empty()).is_err() {
        return None;
    }
    let record = File::from(fd);
    write(&record, &[]);
    Some(record)
}

/// Writes one record of `held` to the engine's end, in one write; a failure is dropped (the shim is gone).
pub fn write(record: &File, held: &[Held]) {
    let _ = (&*record).write(&encode(held));
}

/// The shim's end of the record: the FIFO in its private directory, read without blocking, and the latest record read.
pub struct Reader {
    dir: PathBuf,
    path: PathBuf,
    fd: File,
    pending: Vec<u8>,
    latest: Vec<Held>,
    /// Whether a writer has written since the writers last all closed the FIFO.
    connected: bool,
}

impl Reader {
    /// A fresh FIFO (mode 0600) in a private directory (0700) under `tmpdir`, open for reading.
    pub fn make(tmpdir: &Path) -> std::io::Result<Reader> {
        let dir = private_dir(tmpdir)?;
        let path = dir.join("held");
        let made = rustix::fs::mknodat(rustix::fs::CWD, &path, FileType::Fifo, Mode::from_raw_mode(0o600), 0)
            .map_err(std::io::Error::from)
            .and_then(|()| open_reader(&path));
        match made {
            Ok(fd) => Ok(Reader {
                dir,
                path,
                fd,
                pending: Vec::new(),
                latest: Vec::new(),
                connected: false,
            }),
            Err(error) => {
                let _ = std::fs::remove_file(&path);
                let _ = std::fs::remove_dir(&dir);
                Err(error)
            }
        }
    }

    /// The FIFO's path, for the engine.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The descriptor to poll for records (readable) and for the writers' end (hung up).
    pub fn fd(&self) -> BorrowedFd<'_> {
        self.fd.as_fd()
    }

    /// The latest record's set, in press order.
    pub fn held(&self) -> &[Held] {
        &self.latest
    }

    /// Reads what the FIFO holds; once every writer has closed it, takes a new reader end (opened before the old one is
    /// closed, so an engine opening it meanwhile still finds a reader), which hangs up again only after another writer
    /// has come and gone, so the poll does not spin on the end.
    pub fn read(&mut self) -> std::io::Result<()> {
        let mut buf = [0u8; 4096];
        loop {
            match self.fd.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    self.connected = true;
                    self.pending.extend_from_slice(&buf[..n]);
                    let whole = self.pending.len() / RECORD_LEN * RECORD_LEN;
                    for record in self.pending[..whole].chunks(RECORD_LEN) {
                        if let Some(held) = decode(record) {
                            self.latest = held;
                        }
                    }
                    self.pending.drain(..whole);
                }
                Err(e) if e.kind() == ErrorKind::WouldBlock => return Ok(()),
                Err(e) if e.kind() == ErrorKind::Interrupted => {}
                Err(e) => return Err(e),
            }
        }
        // the end: no writer holds the FIFO
        self.connected = false;
        self.pending.clear();
        self.fd = open_reader(&self.path)?;
        Ok(())
    }

    /// Reads records until every writer has closed the FIFO, or `bound` has passed.
    pub fn wait_for_writers(&mut self, bound: Duration) {
        let deadline = Instant::now() + bound;
        while self.connected {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return;
            }
            let timeout = Timespec::try_from(left).ok();
            let mut fds = [PollFd::new(&self.fd, PollFlags::IN)];
            match rustix::event::poll(&mut fds, timeout.as_ref()) {
                Ok(0) => return,
                Ok(_) => {
                    if self.read().is_err() {
                        return;
                    }
                }
                Err(rustix::io::Errno::INTR) => {}
                Err(_) => return,
            }
        }
    }
}

impl Drop for Reader {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
        let _ = std::fs::remove_dir(&self.dir);
    }
}

fn open_reader(path: &Path) -> std::io::Result<File> {
    let fd: OwnedFd = rustix::fs::open(
        path,
        OFlags::RDONLY | OFlags::NONBLOCK | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    )?;
    Ok(File::from(fd))
}

/// A new directory of this process's own under `tmpdir`, mode 0700.
fn private_dir(tmpdir: &Path) -> std::io::Result<PathBuf> {
    let pid = std::process::id();
    let mut error = None;
    for attempt in 0..16u32 {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.subsec_nanos());
        let dir = tmpdir.join(format!("cua-held-{pid}-{nanos:08x}{attempt}"));
        match rustix::fs::mkdir(&dir, Mode::from_raw_mode(0o700)) {
            Ok(()) => return Ok(dir),
            Err(e) => error = Some(std::io::Error::from(e)),
        }
    }
    Err(error.unwrap_or_else(|| std::io::Error::other("no private directory")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "cua-held-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir(&dir).unwrap();
        dir
    }

    fn writer(path: &Path) -> File {
        std::fs::OpenOptions::new().write(true).open(path).unwrap()
    }

    fn ready(reader: &Reader) -> PollFlags {
        let mut fds = [PollFd::new(&reader.fd, PollFlags::IN)];
        let zero = Timespec { tv_sec: 0, tv_nsec: 0 };
        rustix::event::poll(&mut fds, Some(&zero)).unwrap();
        fds[0].revents()
    }

    #[test]
    fn a_record_carries_the_set_in_press_order_and_anything_else_is_refused() {
        let held = [Held::Key(50), Held::Button(1), Held::Key(38)];
        let record = encode(&held);
        assert_eq!(record.len(), RECORD_LEN);
        assert_eq!(decode(&record), Some(held.to_vec()));
        assert_eq!(decode(&encode(&[])), Some(vec![]));
        let mut other = record;
        other[0] = b'x';
        assert_eq!(decode(&other), None, "not a record");
        let mut later = record;
        later[4] = 2;
        assert_eq!(decode(&later), None, "a version this reader does not know");
        let mut kind = record;
        kind[8] = 9;
        assert_eq!(decode(&kind), None);
        assert_eq!(decode(&record[..64]), None);
        let many: Vec<Held> = (0..200).map(|k| Held::Key(k as u8)).collect();
        assert_eq!(decode(&encode(&many)).unwrap(), many[..CAPACITY].to_vec());
    }

    #[test]
    fn the_reader_keeps_the_latest_record_and_sees_its_writers_end_without_spinning() {
        let tmp = scratch();
        let mut reader = Reader::make(&tmp).unwrap();
        assert!(reader.path().starts_with(&tmp));
        assert!(ready(&reader).is_empty(), "no writer yet: nothing to read, no end");
        let engine = writer(reader.path());
        write(&engine, &[Held::Key(50)]);
        write(&engine, &[Held::Key(50), Held::Button(1)]);
        reader.read().unwrap();
        assert_eq!(reader.held(), [Held::Key(50), Held::Button(1)]);
        assert!(reader.connected);
        drop(engine);
        assert!(ready(&reader).contains(PollFlags::HUP), "every writer gone");
        reader.read().unwrap();
        assert!(!reader.connected);
        assert_eq!(
            reader.held(),
            [Held::Key(50), Held::Button(1)],
            "what the dead engine left stays"
        );
        assert!(
            ready(&reader).is_empty(),
            "the new reader end does not hang up until another writer has come and gone"
        );
        // a later engine's first record replaces what the earlier one left
        let later = writer(reader.path());
        write(&later, &[]);
        reader.read().unwrap();
        assert_eq!(reader.held(), []);
        drop(later);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn waiting_for_the_writers_ends_at_their_close_or_at_the_bound() {
        let tmp = scratch();
        let mut reader = Reader::make(&tmp).unwrap();
        let engine = writer(reader.path());
        write(&engine, &[Held::Key(50)]);
        reader.read().unwrap();
        let started = Instant::now();
        reader.wait_for_writers(Duration::from_millis(100));
        assert!(
            started.elapsed() >= Duration::from_millis(100),
            "a writer still holds it"
        );
        let path = reader.path().to_path_buf();
        let closer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            write(&engine, &[]);
            drop(engine);
        });
        let started = Instant::now();
        reader.wait_for_writers(Duration::from_secs(5));
        assert!(started.elapsed() < Duration::from_secs(2), "ended at the close");
        assert_eq!(reader.held(), [], "the records written before the close are read");
        closer.join().unwrap();
        drop(reader);
        assert!(
            !path.exists() && !path.parent().unwrap().exists(),
            "the record goes with its reader"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn the_engine_s_end_opens_only_a_fifo_with_a_reader_and_starts_with_an_empty_record() {
        let tmp = scratch();
        assert!(open(&tmp.join("missing")).is_none());
        std::fs::write(tmp.join("file"), b"").unwrap();
        assert!(open(&tmp.join("file")).is_none(), "not a FIFO");
        let mut reader = Reader::make(&tmp).unwrap();
        let engine = open(reader.path()).expect("a FIFO with its reader");
        reader.read().unwrap();
        assert!(reader.connected, "its first record");
        assert_eq!(reader.held(), []);
        let path = reader.path().to_path_buf();
        drop(engine);
        drop(reader);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        rustix::fs::mknodat(rustix::fs::CWD, &path, FileType::Fifo, Mode::from_raw_mode(0o600), 0).unwrap();
        assert!(open(&path).is_none(), "no reader: the shim is gone");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
