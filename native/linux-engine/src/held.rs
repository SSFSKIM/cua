//! The held record: what the engine holds down through XTEST, for the REPL host's launcher shim (`shim.rs`), which runs
//! outside the trusted worker's sandbox and releases it once nothing inside can (the design session's ruling, M4 T7b
//! fix 4). XTEST keys and buttons are the X server's own state, so a key the engine pressed stays down when the engine
//! dies without its exit (the sandbox's PID namespace ending under it is a SIGKILL); a window's synthetic key leaves
//! nothing at the server and is never recorded.
//!
//! The record travels on an anonymous pipe, never a path (fix 5): the shim makes it and its launcher inherits the write
//! end, named in `CUA_ENGINE_HELD_FD`, through `codex-linux-sandbox` and bwrap into the trusted worker, which keeps it
//! close-on-exec and gives it to each engine it starts, and to nothing else (`src/services/engine/linux/
//! held-record.mjs`). Model code runs in the kernel, a tree of its own the descriptor never enters, so it can neither
//! read the record nor write one: the XTEST devices are shared by every client, so a key down there is not proof that
//! the engine pressed it, and only the engine may say what it holds. The engine writes the whole XTEST-held set, one
//! fixed record per change, under the ledger's lock (`pressed.rs`): a press's record before the press is sent, a
//! release's once it went out, and an empty one once its exit has released. A record is a bitmap of keycodes and one of
//! buttons, so it carries every key and button the engine can hold, in one write far under PIPE_BUF, which reaches the
//! reader whole. The shim keeps the latest record it read: a later engine's first record, empty, replaces what an
//! earlier one left.
//!
//! Once every writer has closed the pipe, the reader sees its end (POLLHUP) for good: the engines and the worker have
//! exited, so nothing can press any more.

use std::fs::File;
use std::io::{ErrorKind, Read, Write};
use std::os::fd::{AsFd, AsRawFd, BorrowedFd, FromRawFd, OwnedFd, RawFd};
use std::time::{Duration, Instant};

use rustix::event::{PollFd, PollFlags, Timespec};
use rustix::fs::{FileType, OFlags};
use rustix::io::FdFlags;

/// The environment variable that names the record's descriptor to the launcher, the worker and the engine.
pub const RECORD_ENV: &str = "CUA_ENGINE_HELD_FD";

/// One record's length in bytes: a header of 8, a bitmap of the 256 keycodes, a bitmap of the 256 button numbers.
pub const RECORD_LEN: usize = 8 + 32 + 32;
// one write under the smallest PIPE_BUF POSIX allows, so a record reaches the reader whole
const _: () = assert!(RECORD_LEN <= 512);
const MAGIC: [u8; 4] = *b"cuaH";
/// Fix 4's record (128 bytes, at most 60 listed) was version 1.
const VERSION: u8 = 2;

/// One key or button the engine holds down through XTEST.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Held {
    Key(u8),
    Button(u8),
}

/// The record of `held`: every key and button in it, whatever their number.
pub fn encode(held: &[Held]) -> [u8; RECORD_LEN] {
    let mut record = [0u8; RECORD_LEN];
    record[..4].copy_from_slice(&MAGIC);
    record[4] = VERSION;
    for h in held {
        let (base, code) = match *h {
            Held::Key(code) => (8, code),
            Held::Button(code) => (8 + 32, code),
        };
        record[base + usize::from(code / 8)] |= 1 << (code % 8);
    }
    record
}

/// The set a record carries, keys then buttons, each in ascending order; None for bytes that are not one.
pub fn decode(record: &[u8]) -> Option<Vec<Held>> {
    if record.len() != RECORD_LEN || record[..4] != MAGIC || record[4] != VERSION || record[5..8] != [0, 0, 0] {
        return None;
    }
    let set = |base: usize, held: fn(u8) -> Held| {
        (0..=255u8)
            .filter(move |&c| record[base + usize::from(c / 8)] & (1 << (c % 8)) != 0)
            .map(held)
    };
    Some(set(8, Held::Key).chain(set(8 + 32, Held::Button)).collect())
}

/// The engine's end of the record: the descriptor `CUA_ENGINE_HELD_FD` names, or None when it names none or not a
/// pipe's write end (an engine not started under the shim, or a stray value; a socket, the bus's kind, is refused).
/// It is made close-on-exec, so no application the engine launches holds it, and blocking, so a record is never
/// dropped while the pipe is full. Its first record, empty, replaces whatever an engine before it left. Called once,
/// at the engine's start, before it opens anything.
pub fn open_from_env() -> Option<File> {
    let raw: RawFd = std::env::var(RECORD_ENV).ok()?.parse().ok().filter(|&fd| fd > 2)?;
    // SAFETY: the engine has opened nothing yet, so nothing in it owns that descriptor
    unsafe { adopt(raw) }
}

/// The descriptor `raw` as the record's write end ([`open_from_env`]), or None, leaving it as it was, when it is not a
/// pipe's write end.
///
/// # Safety
/// `raw` is owned by nothing else in this process; once adopted, the returned File owns it.
unsafe fn adopt(raw: RawFd) -> Option<File> {
    // SAFETY: only looked at until it proves to be a pipe's write end
    let fd = unsafe { BorrowedFd::borrow_raw(raw) };
    let is_pipe = rustix::fs::fstat(fd).is_ok_and(|s| FileType::from_raw_mode(s.st_mode) == FileType::Fifo);
    let write_only = rustix::fs::fcntl_getfl(fd).is_ok_and(|f| f & OFlags::ACCMODE == OFlags::WRONLY);
    if !is_pipe || !write_only {
        return None;
    }
    rustix::io::fcntl_setfd(fd, FdFlags::CLOEXEC).ok()?;
    rustix::fs::fcntl_setfl(fd, OFlags::empty()).ok()?;
    // SAFETY: a valid descriptor (fstat succeeded), a pipe's write end, owned by nothing else (the caller's promise)
    let record = File::from(unsafe { OwnedFd::from_raw_fd(raw) });
    write(&record, &[]);
    Some(record)
}

/// Writes one record of `held` to the engine's end, in one write; a failure is dropped (the shim is gone).
pub fn write(record: &File, held: &[Held]) {
    let _ = (&*record).write(&encode(held));
}

/// What the wait for the record's writers found.
#[derive(Debug, PartialEq, Eq)]
pub enum Writers {
    /// Every writer has closed the pipe: the processes holding it have exited.
    Gone,
    /// The bound passed with a writer still holding it.
    Remain,
    /// The pipe could not be watched or read: whether a writer remains is not known.
    Unknown,
}

/// The shim's end of the record: the pipe's read end, read without blocking, and the latest record read.
pub struct Reader {
    fd: File,
    pending: Vec<u8>,
    latest: Vec<Held>,
    /// Whether every writer has closed the pipe, which no new writer can open (it has no path).
    ended: bool,
}

impl Reader {
    /// A fresh pipe -> its reader, and the write end for the shim's child (close-on-exec, as the reader is).
    pub fn make() -> std::io::Result<(Reader, OwnedFd)> {
        let (read, write) = std::io::pipe()?;
        let fd = File::from(OwnedFd::from(read));
        rustix::fs::fcntl_setfl(&fd, OFlags::NONBLOCK)?;
        let reader = Reader {
            fd,
            pending: Vec::new(),
            latest: Vec::new(),
            ended: false,
        };
        Ok((reader, OwnedFd::from(write)))
    }

    /// The descriptor to poll for records (readable) and for the writers' end (hung up); None once they have ended.
    pub fn fd(&self) -> Option<BorrowedFd<'_>> {
        (!self.ended).then(|| self.fd.as_fd())
    }

    /// The latest record's set.
    pub fn held(&self) -> &[Held] {
        &self.latest
    }

    /// The pipe's identity, its inode (on Linux's pipe filesystem), as `/proc/<pid>/fd/<n>` names it: `pipe:[<inode>]`.
    pub fn link(&self) -> std::io::Result<String> {
        Ok(format!("pipe:[{}]", rustix::fs::fstat(&self.fd)?.st_ino))
    }

    /// Reads what the pipe holds; at its end (every writer gone) marks it ended.
    pub fn read(&mut self) -> std::io::Result<()> {
        let mut buf = [0u8; 4096];
        loop {
            match self.fd.read(&mut buf) {
                Ok(0) => {
                    self.ended = true;
                    self.pending.clear();
                    return Ok(());
                }
                Ok(n) => {
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
    }

    /// Reads records until every writer has closed the pipe, or `bound` has passed, or the pipe fails.
    pub fn wait_for_writers(&mut self, bound: Duration) -> Writers {
        self.wait_with(bound, rustix::event::poll)
    }

    /// [`Reader::wait_for_writers`] with the poll given (the tests inject its failure).
    fn wait_with(
        &mut self,
        bound: Duration,
        mut poll: impl FnMut(&mut [PollFd<'_>], Option<&Timespec>) -> rustix::io::Result<usize>,
    ) -> Writers {
        let deadline = Instant::now() + bound;
        while !self.ended {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Writers::Remain;
            }
            let timeout = Timespec::try_from(left).ok();
            let mut fds = [PollFd::new(&self.fd, PollFlags::IN)];
            match poll(&mut fds, timeout.as_ref()) {
                Ok(0) => return Writers::Remain,
                Ok(_) => {
                    if self.read().is_err() {
                        return Writers::Unknown;
                    }
                }
                Err(rustix::io::Errno::INTR) => {}
                Err(_) => return Writers::Unknown,
            }
        }
        Writers::Gone
    }
}

impl AsRawFd for Reader {
    fn as_raw_fd(&self) -> RawFd {
        self.fd.as_raw_fd()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready(reader: &Reader) -> PollFlags {
        let mut fds = [PollFd::new(&reader.fd, PollFlags::IN)];
        let zero = Timespec { tv_sec: 0, tv_nsec: 0 };
        rustix::event::poll(&mut fds, Some(&zero)).unwrap();
        fds[0].revents()
    }

    #[test]
    fn a_record_carries_every_key_and_button_the_engine_can_hold_and_anything_else_is_refused() {
        let held = [Held::Key(50), Held::Button(1), Held::Key(38)];
        let record = encode(&held);
        assert_eq!(record.len(), RECORD_LEN);
        assert_eq!(
            decode(&record),
            Some(vec![Held::Key(38), Held::Key(50), Held::Button(1)])
        );
        assert_eq!(decode(&encode(&[])), Some(vec![]));
        let every: Vec<Held> = (0..=255u8)
            .map(Held::Key)
            .chain((0..=255u8).map(Held::Button))
            .collect();
        assert_eq!(
            decode(&encode(&every)),
            Some(every.clone()),
            "no limit below the keycodes and buttons"
        );
        let many: Vec<Held> = (8..8 + 61).map(Held::Key).collect();
        assert_eq!(decode(&encode(&many)).unwrap().len(), 61, "past fix 4's 60");
        let mut other = record;
        other[0] = b'x';
        assert_eq!(decode(&other), None, "not a record");
        let mut earlier = record;
        earlier[4] = 1;
        assert_eq!(
            decode(&earlier),
            None,
            "fix 4's layout, or a version this reader does not know"
        );
        let mut padded = record;
        padded[6] = 1;
        assert_eq!(decode(&padded), None);
        assert_eq!(decode(&record[..64]), None);
    }

    #[test]
    fn the_reader_keeps_the_latest_record_and_sees_its_writers_end_for_good() {
        let (mut reader, write_end) = Reader::make().unwrap();
        assert!(ready(&reader).is_empty(), "nothing to read, no end");
        let engine = File::from(write_end);
        let later = engine.try_clone().unwrap();
        write(&engine, &[Held::Key(50)]);
        write(&engine, &[Held::Key(50), Held::Button(1)]);
        reader.read().unwrap();
        assert_eq!(reader.held(), [Held::Key(50), Held::Button(1)]);
        drop(engine);
        assert!(ready(&reader).is_empty(), "one writer still holds it");
        // a later engine's first record replaces what the earlier one left
        write(&later, &[]);
        reader.read().unwrap();
        assert_eq!(reader.held(), []);
        drop(later);
        assert!(ready(&reader).contains(PollFlags::HUP), "every writer gone");
        reader.read().unwrap();
        assert!(reader.fd().is_none(), "ended, and watched no more");
        assert_eq!(reader.wait_for_writers(Duration::from_secs(5)), Writers::Gone);
    }

    #[test]
    fn the_wait_for_the_writers_tells_their_end_from_the_bound_and_from_a_failure() {
        let (mut reader, write_end) = Reader::make().unwrap();
        let engine = File::from(write_end);
        write(&engine, &[Held::Key(50)]);
        let started = Instant::now();
        assert_eq!(reader.wait_for_writers(Duration::from_millis(100)), Writers::Remain);
        assert!(
            started.elapsed() >= Duration::from_millis(100),
            "a writer still holds it"
        );
        assert_eq!(reader.held(), [Held::Key(50)], "what came before the bound is read");
        assert_eq!(
            reader.wait_with(Duration::from_secs(5), |_, _| Err(rustix::io::Errno::BADF)),
            Writers::Unknown,
            "a poll that fails is no writers' end"
        );
        let mut first = true;
        let interrupted = |fds: &mut [PollFd<'_>], t: Option<&Timespec>| {
            if std::mem::take(&mut first) {
                return Err(rustix::io::Errno::INTR);
            }
            rustix::event::poll(fds, t)
        };
        let closer = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            write(&engine, &[]);
            drop(engine);
        });
        let started = Instant::now();
        assert_eq!(reader.wait_with(Duration::from_secs(5), interrupted), Writers::Gone);
        assert!(started.elapsed() < Duration::from_secs(2), "ended at the close");
        assert_eq!(reader.held(), [], "the records written before the close are read");
        closer.join().unwrap();
    }

    #[test]
    fn the_engine_adopts_only_a_pipe_s_write_end_close_on_exec_and_starts_with_an_empty_record() {
        use std::os::fd::IntoRawFd;
        let (mut reader, write_end) = Reader::make().unwrap();
        rustix::io::fcntl_setfd(&write_end, FdFlags::empty()).unwrap();
        let raw = write_end.into_raw_fd();
        // SAFETY: the test gives its own descriptor up
        let engine = unsafe { adopt(raw) }.expect("a pipe's write end");
        assert_eq!(engine.as_raw_fd(), raw, "the descriptor named, adopted");
        assert!(rustix::io::fcntl_getfd(&engine).unwrap().contains(FdFlags::CLOEXEC));
        reader.read().unwrap();
        assert!(reader.pending.is_empty(), "one whole record");
        write(&engine, &[Held::Key(50)]);
        reader.read().unwrap();
        assert_eq!(reader.held(), [Held::Key(50)]);
        let (other, _write) = Reader::make().unwrap();
        // SAFETY: refused, so never adopted: the reader keeps it
        assert!(unsafe { adopt(other.as_raw_fd()) }.is_none(), "a read end");
        assert!(rustix::fs::fstat(&other.fd).is_ok(), "left open");
        let file = File::open("/proc/self/exe").unwrap();
        // SAFETY: refused, so never adopted
        assert!(unsafe { adopt(file.as_raw_fd()) }.is_none(), "not a pipe");
    }

    #[test]
    fn the_pipe_is_named_as_proc_names_it() {
        let (reader, write_end) = Reader::make().unwrap();
        let link = std::fs::read_link(format!("/proc/self/fd/{}", write_end.as_raw_fd())).unwrap();
        assert_eq!(link.to_str(), Some(reader.link().unwrap().as_str()));
    }
}
