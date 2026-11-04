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

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
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
pub fn serve(server: &mut impl Server, inbox: &Receiver<Next>, out: &mut impl Write) -> i32 {
    serve_with(server, inbox, out, &STOPPED_BY)
}

fn serve_with(server: &mut impl Server, inbox: &Receiver<Next>, out: &mut impl Write, stopped: &AtomicI32) -> i32 {
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
        if let Err(error) = writeln!(out, "{response}").and_then(|()| out.flush()) {
            eprintln!("Error failed to write server response: {error}");
            return 1;
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

    fn run(server: &mut Echo, messages: Vec<Next>) -> (i32, String) {
        let (tx, rx) = channel();
        for m in messages {
            tx.send(m).unwrap();
        }
        drop(tx);
        let mut out = Vec::new();
        let code = serve_with(server, &rx, &mut out, &AtomicI32::new(0));
        (code, String::from_utf8(out).unwrap())
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
        assert_eq!(serve_with(&mut echo, &rx, &mut Vec::new(), &stopped), 143);
        assert!(echo.seen.is_empty());
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
        let code = serve_with(&mut echo, &rx, &mut Vec::new(), &AtomicI32::new(0));
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
