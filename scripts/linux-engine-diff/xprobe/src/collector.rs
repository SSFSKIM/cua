//! A RECORD watcher's collector: the thread that reads the recorded data and prints it, supervised by the thread that
//! controls the context. The controller hears at once when the collector ends (an error, a panic, or the data simply
//! ending), so a record cut short fails the watcher instead of reading as complete; at shutdown it waits for the
//! collector's end and joins it, and an error there fails the watcher too (task 18 review).

use std::io::{Read, Write};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::Duration;

use crate::Result;

/// How long after the context is disabled the collector may take to see its data end.
pub const COLLECTOR_END: Duration = Duration::from_secs(5);

/// Signalled once stdin closes (a watcher's end), read on its own thread so the controller keeps supervising.
pub fn stdin_closed() -> mpsc::Receiver<()> {
    let (tx, closed) = mpsc::channel();
    std::thread::spawn(move || {
        let mut sink = Vec::new();
        let _ = std::io::stdin().read_to_end(&mut sink);
        let _ = tx.send(());
    });
    closed
}

/// The lines written to stdout together and flushed; a write that fails (the reader gone) is an error, not a lost line.
pub fn print_lines(lines: &[String]) -> std::io::Result<()> {
    if lines.is_empty() {
        return Ok(());
    }
    let mut stdout = std::io::stdout().lock();
    for line in lines {
        writeln!(stdout, "{line}")?;
    }
    stdout.flush()
}

/// The collector's own outcome: `Err` with what went wrong.
pub type Outcome = std::result::Result<(), String>;

pub struct Collector {
    ended: mpsc::Receiver<()>,
    handle: Option<JoinHandle<Outcome>>,
}

/// Sends the collector's end when its thread finishes, however it finishes (dropped while unwinding too).
struct Ended(mpsc::Sender<()>);

impl Drop for Ended {
    fn drop(&mut self) {
        let _ = self.0.send(());
    }
}

impl Collector {
    /// `collect` run on its own thread; its end, a panic included, is reported to the controller.
    pub fn spawn(collect: impl FnOnce() -> Outcome + Send + 'static) -> Collector {
        let (ended, heard) = mpsc::channel();
        let handle = std::thread::spawn(move || {
            let _ended = Ended(ended);
            collect()
        });
        Collector {
            ended: heard,
            handle: Some(handle),
        }
    }

    /// While the context should still be recording: `Err` when the collector has ended already, with its error, its
    /// panic, or that the record ended before the watch did.
    pub fn check_running(&mut self) -> Result<()> {
        if let Err(mpsc::TryRecvError::Empty) = self.ended.try_recv() {
            return Ok(());
        }
        match self.join() {
            Ok(()) => Err("the record collector ended before the watch did, so the record is incomplete".into()),
            Err(e) => Err(format!("the record collector failed, so the record is incomplete: {e}").into()),
        }
    }

    /// After the context was disabled: the collector's end, waited for up to `within`, and its outcome.
    pub fn finish(mut self, within: Duration) -> Result<()> {
        if let Err(mpsc::RecvTimeoutError::Timeout) = self.ended.recv_timeout(within) {
            return Err(format!("the record collector did not end within {within:?} of the watch's end").into());
        }
        self.join()
            .map_err(|e| format!("the record collector failed: {e}").into())
    }

    /// The finished thread's outcome, a panic as an error.
    fn join(&mut self) -> Outcome {
        let Some(handle) = self.handle.take() else {
            return Err("it had already ended".into());
        };
        handle.join().unwrap_or_else(|panic| {
            let text = panic
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| panic.downcast_ref::<String>().cloned())
                .unwrap_or_default();
            Err(format!("it panicked: {text}"))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    /// `check_running` until it fails, at most a second.
    fn until_failed(collector: &mut Collector) -> String {
        let deadline = Instant::now() + Duration::from_secs(1);
        loop {
            if let Err(e) = collector.check_running() {
                return e.to_string();
            }
            assert!(Instant::now() < deadline, "the collector's end was never heard");
            std::thread::sleep(Duration::from_millis(2));
        }
    }

    #[test]
    fn a_running_collector_passes_the_check_and_finishes_cleanly_once_stopped() {
        let (stop, stopped) = mpsc::channel::<()>();
        let mut collector = Collector::spawn(move || {
            let _ = stopped.recv();
            Ok(())
        });
        std::thread::sleep(Duration::from_millis(20));
        collector.check_running().unwrap();
        stop.send(()).unwrap();
        collector.finish(Duration::from_secs(1)).unwrap();
    }

    #[test]
    fn a_collector_that_fails_mid_watch_fails_the_check_with_its_error() {
        let mut collector = Collector::spawn(|| Err("the record connection broke".into()));
        let error = until_failed(&mut collector);
        assert!(error.contains("the record connection broke"), "{error}");
    }

    #[test]
    fn a_collector_whose_record_ends_early_fails_the_check() {
        let mut collector = Collector::spawn(|| Ok(()));
        let error = until_failed(&mut collector);
        assert!(error.contains("ended before the watch"), "{error}");
    }

    #[test]
    fn a_collector_that_panics_fails_the_check() {
        let mut collector = Collector::spawn(|| panic!("a bad record"));
        let error = until_failed(&mut collector);
        assert!(error.contains("panicked") && error.contains("a bad record"), "{error}");
    }

    #[test]
    fn an_error_at_shutdown_fails_the_finish() {
        let (stop, stopped) = mpsc::channel::<()>();
        let collector = Collector::spawn(move || {
            let _ = stopped.recv();
            Err("a reply after the disable was malformed".into())
        });
        stop.send(()).unwrap();
        let error = collector.finish(Duration::from_secs(1)).unwrap_err().to_string();
        assert!(error.contains("malformed"), "{error}");
    }

    #[test]
    fn a_collector_that_never_ends_fails_the_finish_in_time() {
        let (_keep, stopped) = mpsc::channel::<()>();
        let collector = Collector::spawn(move || {
            let _ = stopped.recv();
            Ok(())
        });
        let started = Instant::now();
        let error = collector.finish(Duration::from_millis(50)).unwrap_err().to_string();
        assert!(error.contains("did not end"), "{error}");
        assert!(started.elapsed() < Duration::from_millis(500));
    }
}
