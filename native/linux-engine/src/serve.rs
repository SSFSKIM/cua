//! The server loop (behaviour §1): one line in, one line out, strictly in order. Between requests the engine waits for
//! whichever comes first: the next request line, the next `FocusOut` due (M4's T7, `focus_timer.rs`), or a stop.
//!
//! A stop is SIGTERM, SIGINT or SIGHUP, or stdin closing. Each ends the loop through the engine's orderly exit
//! (`Engine::shutdown`), which waits out every pending `FocusOut` (at most its 100 ms) before the engine exits, so a burst
//! typed just before the signal still arrives in order and its `FocusOut` follows (the design session, M4 pre-flight).
//! A request already running when the signal comes finishes first; requests still queued behind it are not run. A
//! second signal, or an exit that has not happened `EXIT_BACKSTOP` after the first, ends the process at once, as the
//! signal's default action would have. SIGKILL cannot be caught: it cuts the drain, and the window keeps the synthetic
//! focus of its last burst until it next gets a `FocusOut` (the engine README).
//!
//! The signals are blocked in every thread (`block_stop_signals`, before the first thread starts) and taken by one
//! thread of their own with `sigwait`, so no handler runs at an arbitrary point. A child keeps its parent's mask, so a
//! program the engine launches unblocks them before it runs (apps.rs `launch`).
//!
//! The stop never depends on the engine's reader: responses go out through a writer thread of their own (`Outbox`), and
//! a response still waiting there when the stop comes is abandoned, so the exit's drain runs even with the reader frozen
//! and the pipe full, as cua's REPL host leaves it when it stops the engine (`src/repl-host/kernel-child.mjs`).

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::time::{Duration, Instant};

use rustix::runtime::{How, KernelSigSet, Signal};

/// How long after a stop signal the process may still be running before it ends at once.
pub const EXIT_BACKSTOP: Duration = Duration::from_secs(2);

/// The signals that stop the engine through its orderly exit.
const STOP_SIGNALS: [Signal; 3] = [Signal::TERM, Signal::INT, Signal::HUP];

/// What the loop receives: a request line, the end of stdin, a failed read, or a stop signal (its number).
#[derive(Debug, PartialEq, Eq)]
pub enum Next {
    Line(String),
    End,
    Failed(String),
    Stop(i32),
}

/// What the loop drives: the engine, or a test's stand-in.
pub trait Server {
    /// One request line's response line.
    fn respond(&mut self, line: &str) -> Option<String>;
    /// Work after a response has gone out.
    fn after_response(&mut self);
    /// When the server must next act with no request (a `FocusOut` due).
    fn next_due(&self) -> Option<Instant>;
    /// That work, done when it is due.
    fn tick(&mut self);
}

/// The signal a stop came with, 0 before any: set by the signal thread before it tells the loop, so a request line
/// queued behind the signal is not run.
static STOPPED_BY: AtomicI32 = AtomicI32::new(0);

/// The loop. Returns the exit code: 0 when stdin closes, 1 when it cannot be read or a response cannot be written, and
/// 128 plus the signal's number for a stop signal.
pub fn serve(server: &mut impl Server, inbox: &Receiver<Next>, out: impl Write + Send + 'static) -> i32 {
    serve_with(server, inbox, &Outbox::spawn(out), &STOPPED_BY)
}

/// How often the loop, waiting for a response to go out, looks whether a stop has come: only while a write is held up.
const STOP_POLL: Duration = Duration::from_millis(10);

/// What became of a response the loop handed to the [`Outbox`].
#[derive(Debug, PartialEq, Eq)]
enum Sent {
    Written,
    Failed(String),
    /// A stop came while the response was still going out (its signal's number).
    Stopped(i32),
}

/// Writes the responses on a thread of its own, one at a time and in order, and says when each has gone out. The loop
/// still waits for each before it reads the next request (one line in, one line out), but it waits for a stop as well:
/// a reader that has stopped reading cannot hold the orderly exit back. The REPL host freezes the trusted worker, the
/// engine's reader, before it tells the engine to stop (src/repl-host/kernel-child.mjs `stopProcessTree`), so a response
/// in flight can sit in a full pipe for good; the stop then ends the loop and the drain runs (the response is
/// abandoned; nobody is left to read it).
struct Outbox {
    lines: Sender<String>,
    written: Receiver<std::io::Result<()>>,
}

impl Outbox {
    fn spawn(mut out: impl Write + Send + 'static) -> Outbox {
        let (lines, queue) = channel::<String>();
        let (done, written) = channel();
        std::thread::spawn(move || {
            for line in queue {
                let result = writeln!(out, "{line}").and_then(|()| out.flush());
                let failed = result.is_err();
                if done.send(result).is_err() || failed {
                    return;
                }
            }
        });
        Outbox { lines, written }
    }

    /// Hands `line` to the writer and waits until it has gone out, its write has failed, or a stop has come.
    fn send(&self, line: String, stopped: &AtomicI32) -> Sent {
        if self.lines.send(line).is_err() {
            return Sent::Failed("the response writer has ended".into());
        }
        loop {
            match self.written.recv_timeout(STOP_POLL) {
                Ok(Ok(())) => return Sent::Written,
                Ok(Err(error)) => return Sent::Failed(error.to_string()),
                Err(RecvTimeoutError::Disconnected) => return Sent::Failed("the response writer has ended".into()),
                Err(RecvTimeoutError::Timeout) => match stopped.load(Ordering::SeqCst) {
                    0 => {}
                    signal => return Sent::Stopped(signal),
                },
            }
        }
    }
}

fn serve_with(server: &mut impl Server, inbox: &Receiver<Next>, out: &Outbox, stopped: &AtomicI32) -> i32 {
    loop {
        let next = match server.next_due() {
            Some(due) => match inbox.recv_timeout(due.saturating_duration_since(Instant::now())) {
                Ok(next) => next,
                Err(RecvTimeoutError::Timeout) => {
                    server.tick();
                    continue;
                }
                Err(RecvTimeoutError::Disconnected) => Next::End,
            },
            None => inbox.recv().unwrap_or(Next::End),
        };
        let signal = stopped.load(Ordering::SeqCst);
        if signal != 0 {
            return 128 + signal;
        }
        let line = match next {
            Next::Line(line) => line,
            Next::End => return 0,
            Next::Failed(error) => {
                eprintln!("Error failed to read server request: {error}");
                return 1;
            }
            Next::Stop(signal) => return 128 + signal,
        };
        let Some(response) = server.respond(&line) else {
            continue;
        };
        match out.send(response, stopped) {
            Sent::Written => {}
            Sent::Failed(error) => {
                eprintln!("Error failed to write server response: {error}");
                return 1;
            }
            Sent::Stopped(signal) => return 128 + signal,
        }
        server.after_response();
        server.tick();
    }
}

/// Reads stdin's lines on a thread of their own into the loop's inbox, in order, then its end or its failure.
pub fn read_stdin(inbox: Sender<Next>) {
    std::thread::spawn(move || {
        let stdin = std::io::stdin();
        let mut stdin = stdin.lock();
        loop {
            let mut line = String::new();
            let next = match stdin.read_line(&mut line) {
                Ok(0) => Next::End,
                Ok(_) => Next::Line(line),
                Err(error) => Next::Failed(error.to_string()),
            };
            let last = !matches!(next, Next::Line(_));
            if inbox.send(next).is_err() || last {
                return;
            }
        }
    });
}

pub(crate) fn stop_set() -> KernelSigSet {
    let mut set = KernelSigSet::empty();
    for signal in STOP_SIGNALS {
        set.insert(signal);
    }
    set
}

/// Blocks the stop signals in the calling thread, and so in every thread it starts after: called first in `main`,
/// before any thread exists, so only `sigwait` takes them.
pub fn block_stop_signals() -> rustix::io::Result<()> {
    // SAFETY: blocking SIGTERM, SIGINT and SIGHUP takes nothing from the C library or the standard library, neither of
    // which relies on them; the engine installs no handler for them, and its one consumer is `watch_stop_signals`.
    unsafe { rustix::runtime::kernel_sigprocmask(How::BLOCK, Some(&stop_set())) }.map(drop)
}

/// Unblocks the stop signals in the calling thread: run in a program's child between fork and exec (apps.rs `launch`),
/// where only async-signal-safe work may run. One system call (rt_sigprocmask) on a set already built; nothing
/// allocated.
pub(crate) fn unblock_stop_signals(set: &KernelSigSet) -> std::io::Result<()> {
    // SAFETY: unblocking signals the engine blocked itself takes nothing from anyone; in the child nothing relies on them
    // being blocked
    unsafe { rustix::runtime::kernel_sigprocmask(How::UNBLOCK, Some(set)) }
        .map(drop)
        .map_err(std::io::Error::from)
}

/// The thread that takes the stop signals: the first is put where the loop sees it and sent to the inbox; a second, or
/// `EXIT_BACKSTOP` passing with the process still running, ends the process at once with 128 plus the signal.
pub fn watch_stop_signals(inbox: Sender<Next>) {
    std::thread::spawn(move || {
        let set = stop_set();
        let mut first = true;
        loop {
            // SAFETY: the set is blocked in every thread (`block_stop_signals`), so this is the one place they arrive.
            let Ok(signal) = (unsafe { rustix::runtime::kernel_sigwait(&set) }) else {
                continue;
            };
            let code = 128 + signal.as_raw();
            if !first {
                std::process::exit(code);
            }
            first = false;
            STOPPED_BY.store(signal.as_raw(), Ordering::SeqCst);
            let _ = inbox.send(Next::Stop(signal.as_raw()));
            std::thread::spawn(move || {
                std::thread::sleep(EXIT_BACKSTOP);
                std::process::exit(code);
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::channel;

    /// Answers each line with its own text, records what it was asked, and has work due when a test says so.
    #[derive(Default)]
    struct Echo {
        seen: Vec<String>,
        due: Option<Instant>,
        ticks: Vec<Instant>,
        after: usize,
        /// Told of each tick as it happens (the timed test's sender waits for it).
        ticked: Option<std::sync::mpsc::Sender<()>>,
        /// How many ticks had happened when each line was answered.
        ticks_at_line: Vec<usize>,
    }

    impl Server for Echo {
        fn respond(&mut self, line: &str) -> Option<String> {
            let line = line.trim();
            self.seen.push(line.to_string());
            self.ticks_at_line.push(self.ticks.len());
            (!line.is_empty()).then(|| format!("ok {line}"))
        }
        fn after_response(&mut self) {
            self.after += 1;
        }
        fn next_due(&self) -> Option<Instant> {
            self.due
        }
        fn tick(&mut self) {
            if self.due.is_some_and(|d| d <= Instant::now()) {
                self.ticks.push(Instant::now());
                self.due = None;
                if let Some(ticked) = &self.ticked {
                    let _ = ticked.send(());
                }
            }
        }
    }

    /// A writer whose bytes the test reads afterwards.
    #[derive(Clone, Default)]
    struct Shared(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

    impl Write for Shared {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    impl Shared {
        fn text(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    /// A reader that never reads: every write blocks, as on a full pipe whose reader is frozen.
    struct Stuck(std::sync::mpsc::Receiver<()>);

    impl Write for Stuck {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            let _ = self.0.recv();
            Err(std::io::Error::other("unblocked"))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    /// A reader that has gone: every write fails.
    struct Gone;

    impl Write for Gone {
        fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
            Err(std::io::Error::from(std::io::ErrorKind::BrokenPipe))
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn run(server: &mut Echo, messages: Vec<Next>) -> (i32, String) {
        let (tx, rx) = channel();
        for m in messages {
            tx.send(m).unwrap();
        }
        drop(tx);
        let out = Shared::default();
        let code = serve_with(server, &rx, &Outbox::spawn(out.clone()), &AtomicI32::new(0));
        (code, out.text())
    }

    #[test]
    fn every_line_is_answered_in_order_and_the_end_of_stdin_exits_zero() {
        let mut echo = Echo::default();
        let (code, out) = run(
            &mut echo,
            vec![
                Next::Line("a\n".into()),
                Next::Line("\n".into()),
                Next::Line("b\n".into()),
                Next::End,
            ],
        );
        assert_eq!((code, out.as_str()), (0, "ok a\nok b\n"), "a blank line has no answer");
        assert_eq!(echo.after, 2);
    }

    #[test]
    fn a_read_failure_exits_one() {
        assert_eq!(run(&mut Echo::default(), vec![Next::Failed("bad UTF-8".into())]).0, 1);
    }

    #[test]
    fn a_stop_signal_exits_with_128_plus_its_number_and_runs_nothing_after_it() {
        let mut echo = Echo::default();
        let (code, out) = run(
            &mut echo,
            vec![Next::Line("a\n".into()), Next::Stop(15), Next::Line("b\n".into())],
        );
        assert_eq!((code, out.as_str()), (143, "ok a\n"));
        assert_eq!(echo.seen, ["a"]);
    }

    #[test]
    fn lines_queued_behind_a_signal_are_not_run() {
        let (tx, rx) = channel();
        tx.send(Next::Line("queued\n".into())).unwrap();
        let mut echo = Echo::default();
        let stopped = AtomicI32::new(15);
        assert_eq!(
            serve_with(&mut echo, &rx, &Outbox::spawn(Shared::default()), &stopped),
            143
        );
        assert!(echo.seen.is_empty());
    }

    #[test]
    fn a_response_that_cannot_be_written_exits_one_and_runs_nothing_after_it() {
        let (tx, rx) = channel();
        for line in ["a\n", "b\n"] {
            tx.send(Next::Line(line.into())).unwrap();
        }
        let mut echo = Echo::default();
        assert_eq!(serve_with(&mut echo, &rx, &Outbox::spawn(Gone), &AtomicI32::new(0)), 1);
        assert_eq!(echo.seen, ["a"]);
        assert_eq!(echo.after, 0, "no work after a response that did not go out");
    }

    #[test]
    fn the_next_line_waits_until_the_response_before_it_has_gone_out() {
        // one line in, one line out: the loop never runs a request while the one before it is still being written
        struct Slow(Shared, std::sync::Arc<std::sync::atomic::AtomicBool>);
        impl Write for Slow {
            fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
                std::thread::sleep(Duration::from_millis(30));
                self.1.store(true, Ordering::SeqCst);
                self.0.write(bytes)
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        struct Checks(std::sync::Arc<std::sync::atomic::AtomicBool>, Vec<bool>);
        impl Server for Checks {
            fn respond(&mut self, line: &str) -> Option<String> {
                self.1.push(self.0.swap(false, Ordering::SeqCst));
                Some(line.trim().to_string())
            }
            fn after_response(&mut self) {}
            fn next_due(&self) -> Option<Instant> {
                None
            }
            fn tick(&mut self) {}
        }
        let written = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
        let out = Shared::default();
        let (tx, rx) = channel();
        for line in ["a\n", "b\n", "c\n"] {
            tx.send(Next::Line(line.into())).unwrap();
        }
        tx.send(Next::End).unwrap();
        let mut checks = Checks(written.clone(), Vec::new());
        let code = serve_with(
            &mut checks,
            &rx,
            &Outbox::spawn(Slow(out.clone(), written)),
            &AtomicI32::new(0),
        );
        assert_eq!((code, out.text().as_str()), (0, "a\nb\nc\n"));
        assert_eq!(
            checks.1,
            [true, true, true],
            "each request after the previous answer was written"
        );
    }

    #[test]
    fn a_stop_while_a_response_cannot_go_out_ends_the_loop_at_once() {
        // a frozen reader (the REPL host freezes the worker before it stops the engine) leaves a response stuck in a
        // full pipe: the stop still reaches the loop, so the engine's orderly exit (its drain) runs
        let (_unblock, blocked) = channel();
        let (tx, rx) = channel();
        tx.send(Next::Line("a\n".into())).unwrap();
        tx.send(Next::Line("queued\n".into())).unwrap();
        let stopped = std::sync::Arc::new(AtomicI32::new(0));
        let (done, finished) = channel();
        let flag = stopped.clone();
        std::thread::spawn(move || {
            let mut echo = Echo::default();
            let code = serve_with(&mut echo, &rx, &Outbox::spawn(Stuck(blocked)), &flag);
            let _ = done.send((code, echo.seen, echo.after));
        });
        std::thread::sleep(Duration::from_millis(50));
        let signalled = Instant::now();
        stopped.store(15, Ordering::SeqCst);
        let (code, seen, after) = finished
            .recv_timeout(Duration::from_secs(2))
            .expect("the loop ends while the response is still stuck");
        assert!(
            signalled.elapsed() < Duration::from_millis(500),
            "{:?}",
            signalled.elapsed()
        );
        assert_eq!(code, 143);
        assert_eq!(seen, ["a"], "nothing queued behind it runs");
        assert_eq!(after, 0);
    }

    #[test]
    fn work_due_while_waiting_for_a_line_is_done_on_time() {
        // ordered, not timed: the line is sent only once the tick has happened (or after 5 s, which fails), so a
        // loaded machine cannot make a tick that waited for the line look on time
        let (tx, rx) = channel();
        let (ticked, tick) = channel();
        let started = Instant::now();
        let mut echo = Echo {
            due: Some(started + Duration::from_millis(40)),
            ticked: Some(ticked),
            ..Echo::default()
        };
        let sender = std::thread::spawn(move || {
            let _ = tick.recv_timeout(Duration::from_secs(5));
            tx.send(Next::Line("late\n".into())).unwrap();
            tx.send(Next::End).unwrap();
        });
        let code = serve_with(&mut echo, &rx, &Outbox::spawn(Shared::default()), &AtomicI32::new(0));
        sender.join().unwrap();
        assert_eq!(code, 0);
        assert_eq!(echo.ticks.len(), 1, "fired once, while idle");
        assert!(
            echo.ticks[0] - started >= Duration::from_millis(40),
            "not before it was due"
        );
        assert_eq!(echo.ticks_at_line, [1], "before the next line, not at it");
        assert_eq!(echo.seen, ["late"]);
    }
}
