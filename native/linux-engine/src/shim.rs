//! `cua-engine launcher-shim <parent pid> <program> [args...]`: not the engine. It is the resident shim through which
//! cua's REPL host starts the trusted worker's sandbox launcher on Linux (src/repl-host/kernel-child.mjs), the
//! launcher's parent for its whole life (the design session's ruling, M4 T7b fix 4):
//!
//! - It watches the parent it names, the supervisor, through a pidfd taken before it checks that the supervisor is
//!   still its parent (if it died first, nothing runs). When the supervisor dies, however it dies, SIGKILL included, the
//!   shim SIGKILLs the launcher at once, so the launcher, held or not, never outlives it and no model code runs on; and
//!   the launcher's own parent-death signal, SIGKILL against the shim, takes it if the shim itself is killed. Should the
//!   watch itself fail (no pidfd on the launcher, a poll error), the shim cannot tell when the supervisor dies, so it
//!   fails closed: it SIGKILLs the launcher then too (fix 5).
//! - It never resumes anything. A launcher held stopped during a stop has the owned group's SIGTERM pending, which a
//!   SIGCONT would fire, ending the sandbox before the engine released.
//! - Once the launcher has exited and been reaped, for whatever reason (the supervisor's death, the worker's own end,
//!   the stop), it waits for every writer of the engine's held record (`held.rs`) to be gone: the pipe's end means the
//!   engines and the worker have exited. Should a writer outlive the bound, or the wait fail, it ends every process
//!   that holds the record's pipe first (with the sandbox disabled the launcher's death does not end the engine, nor
//!   does its stdin's end cut the request it runs), so no press can follow the release (fix 5), and reads the pipe to
//!   its end, so the release set is the last record written; a holder it cannot stop leaves nothing released, since
//!   a release then could be followed by that holder's press (fix 6). Then it releases
//!   exactly what the latest record holds, and only what the XInput devices still show down on the XTEST slave, and
//!   exits as the launcher did. The sandbox's end SIGKILLs the engine with nothing released; after an orderly stop the
//!   engine has released already and its record is empty, so the shim sends nothing.
//! - The stop signals (SIGTERM, SIGINT, SIGHUP) never end it: blocked here, so the owned group's SIGTERM at upstream's
//!   by(0.4) waits on the supervisor's stop, as it did before; the launcher starts with no signal blocked.
//!
//! It runs before the engine blocks its stop signals or starts any thread.

use std::io::{ErrorKind, Write as _};
use std::os::fd::{AsFd, AsRawFd, BorrowedFd, OwnedFd, RawFd};
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::{Child, ExitStatus};
use std::time::Duration;

use rustix::event::{PollFd, PollFlags, Timespec};
use rustix::io::FdFlags;
use rustix::process::{Pid, PidfdFlags, Signal};
use rustix::runtime::{How, KernelSigSet};

use crate::held::{self, Held, Reader, Writers};

/// The subcommand's name on the command line.
pub const SUBCOMMAND: &str = "launcher-shim";

/// How long the shim waits, once the launcher has exited, for the engine to close its held record: the engine's own
/// latest exit after its stop signal, its backstop and its forced release, and 50 ms (the REPL host's
/// `ENGINE_EXIT_WAIT_MS`). Sandboxed, the namespace's end has SIGKILLed the engine and the close comes at once.
pub const WRITER_WAIT: Duration = Duration::from_millis(
    crate::serve::EXIT_BACKSTOP.as_millis() as u64 + crate::pressed::FORCED_RELEASE_BOUND.as_millis() as u64 + 50,
);

/// How long the shim waits for the record's writers it SIGKILLed to have exited, before it releases regardless.
pub const ENDED_WAIT: Duration = crate::pressed::FORCED_RELEASE_BOUND;

/// What ended the watch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Ended {
    /// The supervisor exited: the launcher is SIGKILLed.
    Supervisor,
    /// The launcher exited first.
    Launcher,
    /// The watch failed (no pidfd on the launcher, a poll error): the supervisor's death could no longer be seen, so
    /// the launcher is SIGKILLed, as for that death.
    Unwatchable,
}

/// Runs `program` with `args` under the shim, for the supervisor `parent`; returns only to exit, with the exit code (a
/// signal it ends by is raised before) and the sentence to print, if any.
pub fn launcher_shim(parent: i32, program: &str, args: &[String]) -> (i32, Option<String>) {
    let Some(parent_pid) = Pid::from_raw(parent) else {
        return (2, Some(format!("Error {SUBCOMMAND} needs the parent's pid")));
    };
    let supervisor = match rustix::process::pidfd_open(parent_pid, PidfdFlags::empty()) {
        Ok(fd) => fd,
        Err(error) => {
            return (
                126,
                Some(format!("Error the parent {parent} cannot be watched: {error}")),
            );
        }
    };
    let now = rustix::process::getppid().map_or(0, |p| p.as_raw_nonzero().get());
    if now != parent {
        return (
            125,
            Some(format!(
                "Error process {parent} is no longer the parent (now {now}); {program} was not run"
            )),
        );
    }
    let stops = stop_set();
    // SAFETY: one rt_sigprocmask on a set built already, with no other thread running
    let given = match unsafe { rustix::runtime::kernel_sigprocmask(How::BLOCK, Some(&stops)) } {
        Ok(given) => given,
        Err(error) => {
            return (
                126,
                Some(format!("Error the stop signals could not be blocked: {error}")),
            );
        }
    };
    // the record's pipe; should none be made, the kill alone
    let (mut record, write_end) = match Reader::make() {
        Ok((reader, write_end)) => (Some(reader), Some(write_end)),
        Err(_) => (None, None),
    };
    let spawned = spawn(program, args, write_end.as_ref().map(AsFd::as_fd), given);
    // the launcher holds its own copy: the shim's would keep the pipe from ever ending
    drop(write_end);
    let mut child = match spawned {
        Ok(child) => child,
        Err(error) => return (127, Some(format!("Error {program} could not be run: {error}"))),
    };
    let (_, status) = supervise(
        &mut child,
        supervisor.as_fd(),
        record.as_mut(),
        |pid| rustix::process::pidfd_open(pid, PidfdFlags::empty()),
        |fds| rustix::event::poll(fds, None),
    );
    let sentence = record.as_mut().and_then(released_after_writers);
    drop(record);
    // a supervisor gone has closed the other end of stderr: the write fails, and the shim exits as it would have
    if let Some(sentence) = &sentence {
        let _ = writeln!(std::io::stderr(), "{sentence}");
    }
    (exit_as(status, &stops), None)
}

/// SIGTERM, SIGINT and SIGHUP.
fn stop_set() -> KernelSigSet {
    let mut set = KernelSigSet::empty();
    for signal in [Signal::TERM, Signal::INT, Signal::HUP] {
        set.insert(signal);
    }
    set
}

/// Starts `program` as this shim's child, with the shim's stdio and environment and the record's write end, which the
/// child inherits (named in `CUA_ENGINE_HELD_FD`): its parent-death signal is SIGKILL, set in the child, which checks
/// then that the shim is still its parent, and it gets back the signal mask the shim was `given` (a child inherits the
/// shim's blocked stop signals, and Rust's spawn resets only SIGPIPE's action).
fn spawn(
    program: &str,
    args: &[String],
    record: Option<BorrowedFd<'_>>,
    given: KernelSigSet,
) -> std::io::Result<Child> {
    let mut command = std::process::Command::new(program);
    command.args(args).env_remove(held::RECORD_ENV);
    let record: Option<RawFd> = record.map(|fd| fd.as_raw_fd());
    if let Some(raw) = record {
        command.env(held::RECORD_ENV, raw.to_string());
    }
    let shim = rustix::process::getpid();
    // SAFETY: the closure runs in the forked child before its exec and only makes system calls; `raw` is the shim's
    // write end, open until the spawn has returned
    unsafe {
        command.pre_exec(move || {
            rustix::process::set_parent_process_death_signal(Some(Signal::KILL))?;
            if rustix::process::getppid() != Some(shim) {
                return Err(std::io::Error::other("the launcher's shim is gone"));
            }
            if let Some(raw) = record {
                rustix::io::fcntl_setfd(BorrowedFd::borrow_raw(raw), FdFlags::empty())?;
            }
            rustix::runtime::kernel_sigprocmask(How::SETMASK, Some(&given))?;
            Ok(())
        });
    }
    command.spawn()
}

/// Watches the supervisor and the launcher `child` (its pidfd taken by `pidfd`, the poll made by `poll`: the tests
/// inject their failures) until one of them has exited, reading records as they come; SIGKILLs the launcher unless it
/// exited first; reaps it. -> what ended the watch, and the launcher's exit status.
fn supervise(
    child: &mut Child,
    supervisor: BorrowedFd<'_>,
    record: Option<&mut Reader>,
    pidfd: impl FnOnce(Pid) -> rustix::io::Result<OwnedFd>,
    poll: impl FnMut(&mut [PollFd<'_>]) -> rustix::io::Result<usize>,
) -> (Ended, ExitStatus) {
    let launcher = Pid::from_raw(child.id() as i32).expect("a child's pid");
    let ended = match pidfd(launcher) {
        Ok(launcher) => watch(supervisor, launcher.as_fd(), record, poll),
        // a child not yet reaped always has one; should it fail anyway, nothing could see the supervisor's death
        Err(_) => Ended::Unwatchable,
    };
    if ended != Ended::Launcher {
        let _ = rustix::process::kill_process(launcher, Signal::KILL);
    }
    (ended, wait(child))
}

/// Polls the supervisor, the launcher and the record until one of the two processes has exited, reading records as
/// they come.
fn watch(
    supervisor: BorrowedFd<'_>,
    launcher: BorrowedFd<'_>,
    mut record: Option<&mut Reader>,
    mut poll: impl FnMut(&mut [PollFd<'_>]) -> rustix::io::Result<usize>,
) -> Ended {
    loop {
        let (supervisor_gone, launcher_gone, record_ready) = {
            let mut fds = vec![
                PollFd::from_borrowed_fd(supervisor, PollFlags::IN),
                PollFd::from_borrowed_fd(launcher, PollFlags::IN),
            ];
            if let Some(fd) = record.as_deref().and_then(Reader::fd) {
                fds.push(PollFd::from_borrowed_fd(fd, PollFlags::IN));
            }
            match poll(&mut fds) {
                Ok(_) => {}
                Err(rustix::io::Errno::INTR) => continue,
                Err(_) => return Ended::Unwatchable,
            }
            (
                !fds[0].revents().is_empty(),
                !fds[1].revents().is_empty(),
                fds.get(2).is_some_and(|fd| !fd.revents().is_empty()),
            )
        };
        // a record that cannot be read any more is watched no longer (its end would keep the poll ready); what it held
        // is still released, after its writers are ended (released_after_writers)
        if record_ready && record.as_deref_mut().is_some_and(|record| record.read().is_err()) {
            record = None;
        }
        if supervisor_gone {
            return Ended::Supervisor;
        }
        if launcher_gone {
            return Ended::Launcher;
        }
    }
}

/// The launcher's exit status, once reaped.
fn wait(child: &mut Child) -> ExitStatus {
    loop {
        match child.wait() {
            Ok(status) => return status,
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            Err(_) => return ExitStatus::from_raw(9),
        }
    }
}

/// Exits as the launcher did: its code, or its signal raised here (unblocked, since the shim blocks the stop signals),
/// with 128 plus the signal should the signal not end the shim. -> the code to exit with.
fn exit_as(status: ExitStatus, stops: &KernelSigSet) -> i32 {
    if let Some(code) = status.code() {
        return code;
    }
    let raw = status.signal().unwrap_or(9);
    if let Some(signal) = Signal::from_named_raw(raw) {
        let _ = rustix::process::kill_process(rustix::process::getpid(), signal);
        // SAFETY: one rt_sigprocmask on a set built already; the release's thread, if any, has ended or never will
        let _ = unsafe { rustix::runtime::kernel_sigprocmask(How::UNBLOCK, Some(stops)) };
    }
    128 + raw
}

/// Once the launcher is reaped: the wait for the record's writers; then, should any outlive it or the wait fail, the
/// end of every process that holds the record's pipe, and the pipe read to its end; then the release of what the
/// latest record holds. -> the sentence that says what was done, if anything was.
fn released_after_writers(record: &mut Reader) -> Option<String> {
    let (held, said) = after_the_launcher(record, &KILLS, &mut |_| {});
    let released = held
        .filter(|held| !held.is_empty())
        .map(|held| released_within(crate::pressed::FORCED_RELEASE_BOUND, held));
    match (said, released) {
        (None, None) => None,
        (said, released) => Some(format!(
            "cua-engine {SUBCOMMAND}: {}",
            [said, released].into_iter().flatten().collect::<Vec<_>>().join("; ")
        )),
    }
}

/// The decision [`released_after_writers`] acts on, its process calls given (`kills`, and `found`, called with each
/// holder before it is signalled: the tests change the record there). -> the set to release (None: nothing may be
/// released, since a writer that may still press was never stopped), and what to say about the writers' end, if
/// anything happened to them.
///
/// The release set is chosen only once the record is known to be complete (fix 6): once the pipe has ended, every
/// writer is gone and every record it wrote has been read, the one written while it was being ended included. Should
/// the pipe not end within [`ENDED_WAIT`] of the SIGKILLs, the release still goes ahead when a SIGKILL was delivered to
/// a holder whose exit is not yet seen (a process sent SIGKILL runs no more of its own code, so it can press nothing
/// more), and only then: a holder that could not be signalled, or holders that could not be listed, leave the pipe's
/// remaining writer unknown or running, and a release then could be followed by its press.
fn after_the_launcher(
    record: &mut Reader,
    kills: &Kills,
    found: &mut dyn FnMut(u32),
) -> (Option<Vec<Held>>, Option<String>) {
    let why = match record.wait_for_writers(WRITER_WAIT) {
        Writers::Gone => return (Some(record.held().to_vec()), None),
        Writers::Remain => format!("its record's writers outlived the launcher by {WRITER_WAIT:?}"),
        Writers::Unknown => "its record's writers could not be watched".to_string(),
    };
    let ending = match record.link() {
        Ok(link) => end_holders(&link, kills, found),
        Err(error) => Ending {
            unlisted: Some(format!("the record's pipe could not be named: {error}")),
            ..Ending::default()
        },
    };
    // every record a writer wrote before it died, read to the pipe's end; a dying process closes its descriptors
    // before its pidfd reports the exit, so the exits are looked for until the same deadline
    let deadline = std::time::Instant::now() + ENDED_WAIT;
    let complete = record.wait_for_writers(ENDED_WAIT) == Writers::Gone;
    let exited = ending
        .signalled
        .iter()
        .filter(|pidfd| exited_by(pidfd, deadline))
        .count();
    let unseen = ending.signalled.len() - exited;
    let stopped = ending.unstopped.is_empty() && ending.unlisted.is_none();
    let release = complete || (stopped && unseen > 0);
    let mut said = format!("{why}: ended {} holding it, {exited} gone", ending.signalled.len());
    if ending.vanished > 0 {
        said += &format!(", {} gone before the signal", ending.vanished);
    }
    for unstopped in &ending.unstopped {
        said += &format!("; could not stop {unstopped}");
    }
    if let Some(unlisted) = &ending.unlisted {
        said += &format!("; {unlisted}");
    }
    if !release {
        said += "; nothing released: a writer of its record may still be pressing";
    }
    (release.then(|| record.held().to_vec()), Some(said))
}

/// The process calls [`end_holders`] makes, so the tests can make them fail.
struct Kills {
    /// A pidfd on the process.
    open: fn(Pid) -> rustix::io::Result<OwnedFd>,
    /// SIGKILL through a pidfd.
    signal: fn(BorrowedFd<'_>) -> rustix::io::Result<()>,
}

/// The real ones.
const KILLS: Kills = Kills {
    open: |pid| rustix::process::pidfd_open(pid, PidfdFlags::empty()),
    signal: |pidfd| rustix::process::pidfd_send_signal(pidfd, Signal::KILL),
};

/// What [`end_holders`] came to.
#[derive(Default)]
struct Ending {
    /// The holders sent SIGKILL, each through its pidfd, kept to see its exit.
    signalled: Vec<OwnedFd>,
    /// Holders found that were gone, or held the pipe no more, before they could be signalled.
    vanished: usize,
    /// Holders that could not be signalled, each with its pid and why: writers the shim cannot stop.
    unstopped: Vec<String>,
    /// Why the holders could not be listed, if they could not.
    unlisted: Option<String>,
}

/// SIGKILLs every process but this one that holds a descriptor of the pipe `/proc` names `link`. Only the trusted chain
/// the record's write end was handed down can hold it (the launcher, bwrap, the worker and its engines; the worker and
/// the engine keep it close-on-exec), so nothing else is ever signalled. Each holder is signalled through a pidfd taken
/// before its descriptors are read again, so a pid reused meanwhile is never signalled. There is no kill by pid (fix 7):
/// a holder whose pidfd or its signal fails is one the shim cannot stop. What could not be listed or signalled is said,
/// never skipped.
fn end_holders(link: &str, kills: &Kills, found: &mut dyn FnMut(u32)) -> Ending {
    let mut ending = Ending::default();
    let me = std::process::id();
    let pids = match std::fs::read_dir("/proc") {
        Ok(pids) => pids,
        Err(error) => {
            ending.unlisted = Some(format!("the processes could not be listed: {error}"));
            return ending;
        }
    };
    for entry in pids {
        let pid = match entry {
            Ok(entry) => entry.file_name().to_str().and_then(|p| p.parse::<u32>().ok()),
            Err(error) => {
                ending.unlisted = Some(format!("the processes could not be listed: {error}"));
                continue;
            }
        };
        let Some(pid) = pid.filter(|&pid| pid != me) else {
            continue;
        };
        if !holds(pid, link) {
            continue;
        }
        let Some(raw) = Pid::from_raw(pid as i32) else {
            continue;
        };
        found(pid);
        match (kills.open)(raw) {
            Ok(_) if !holds(pid, link) => ending.vanished += 1,
            Ok(pidfd) => match (kills.signal)(pidfd.as_fd()) {
                Ok(()) => ending.signalled.push(pidfd),
                Err(rustix::io::Errno::SRCH) => ending.vanished += 1,
                Err(error) => ending
                    .unstopped
                    .push(format!("{pid} (SIGKILL through its pidfd: {error})")),
            },
            Err(rustix::io::Errno::SRCH) => ending.vanished += 1,
            Err(error) => ending.unstopped.push(format!("{pid} (no pidfd: {error})")),
        }
    }
    ending
}

/// Whether the process a pidfd refers to has exited by `deadline`.
fn exited_by(pidfd: &OwnedFd, deadline: std::time::Instant) -> bool {
    let mut fds = [PollFd::new(pidfd, PollFlags::IN)];
    loop {
        let left = Timespec::try_from(deadline.saturating_duration_since(std::time::Instant::now())).ok();
        match rustix::event::poll(&mut fds, left.as_ref()) {
            Err(rustix::io::Errno::INTR) => continue,
            Ok(n) => return n > 0,
            Err(_) => return false,
        }
    }
}

/// Whether process `pid` holds a descriptor `/proc` names `link`.
fn holds(pid: u32, link: &str) -> bool {
    std::fs::read_dir(format!("/proc/{pid}/fd"))
        .into_iter()
        .flatten()
        .flatten()
        .any(|fd| std::fs::read_link(fd.path()).is_ok_and(|to| to.as_os_str() == link))
}

/// The keys and buttons of `held` to release, buttons first (the record lists keys, then buttons): those `keys` and
/// `buttons` (the XTEST slave devices' state, one bit per keycode and per button) still show down.
fn still_down(held: &[Held], keys: &[u8; 32], buttons: &[u8; 32]) -> Vec<Held> {
    let down = |bits: &[u8; 32], code: u8| bits[usize::from(code / 8)] & (1 << (code % 8)) != 0;
    held.iter()
        .rev()
        .copied()
        .filter(|h| match *h {
            Held::Key(code) => down(keys, code),
            Held::Button(code) => down(buttons, code),
        })
        .collect()
}

/// Releases `held` over an X connection of the shim's own, waited for at most `bound`, so an X server that does not
/// answer cannot hold the shim. -> the sentence that says what was released.
fn released_within(bound: Duration, held: Vec<Held>) -> String {
    let (done, finished) = std::sync::mpsc::channel();
    let recorded = held.len();
    std::thread::spawn(move || {
        let _ = done.send(release(&held));
    });
    match finished.recv_timeout(bound) {
        Ok(Ok(released)) => {
            let named: Vec<String> = released
                .iter()
                .map(|h| match h {
                    Held::Key(code) => format!("key {code}"),
                    Held::Button(code) => format!("button {code}"),
                })
                .collect();
            format!(
                "released {} of the {recorded} its engine held [{}]",
                released.len(),
                named.join(", ")
            )
        }
        Ok(Err(error)) => format!("the {recorded} its engine held were not released: {error}"),
        Err(_) => format!("the {recorded} its engine held were not released within {bound:?}"),
    }
}

/// Reads the XTEST slave devices' state (XInput's QueryDeviceState: XI2's XIQueryPointer answers only master and
/// floating devices, and XI2 has no key state) and releases what of `held` they still show down. -> what was released.
fn release(held: &[Held]) -> anyhow::Result<Vec<Held>> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xinput::{self, ConnectionExt as _};
    use x11rb::protocol::xproto::{BUTTON_RELEASE_EVENT, ConnectionExt as _, KEY_RELEASE_EVENT};
    use x11rb::protocol::xtest::ConnectionExt as _;

    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    conn.xinput_xi_query_version(2, 0)?.reply()?;
    let devices = conn.xinput_xi_query_device(u16::from(xinput::Device::ALL))?.reply()?;
    let slave = |kind: xinput::DeviceType, name: &[u8]| {
        devices
            .infos
            .iter()
            .find(|d| d.type_ == kind && d.name.ends_with(name))
            .map(|d| d.deviceid)
            .ok_or_else(|| anyhow::anyhow!("no XTEST slave device"))
    };
    let state = |device: u16| -> anyhow::Result<([u8; 32], [u8; 32])> {
        let mut keys = [0u8; 32];
        let mut buttons = [0u8; 32];
        for class in conn.xinput_query_device_state(device as u8)?.reply()?.classes {
            match class.data {
                xinput::InputStateData::Key(k) => keys = k.keys,
                xinput::InputStateData::Button(b) => buttons = b.buttons,
                _ => {}
            }
        }
        Ok((keys, buttons))
    };
    let (keys, _) = state(slave(xinput::DeviceType::SLAVE_KEYBOARD, b"XTEST keyboard")?)?;
    let (_, buttons) = state(slave(xinput::DeviceType::SLAVE_POINTER, b"XTEST pointer")?)?;
    let releases = still_down(held, &keys, &buttons);
    for h in &releases {
        let (kind, code) = match *h {
            Held::Key(code) => (KEY_RELEASE_EVENT, code),
            Held::Button(code) => (BUTTON_RELEASE_EVENT, code),
        };
        conn.xtest_fake_input(kind, code, 0, root, 0, 0, 0)?;
    }
    conn.get_input_focus()?.reply()?;
    Ok(releases)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn bits(codes: &[u8]) -> [u8; 32] {
        let mut bits = [0u8; 32];
        for &c in codes {
            bits[usize::from(c / 8)] |= 1 << (c % 8);
        }
        bits
    }

    #[test]
    fn only_what_the_xtest_devices_still_show_down_is_released_buttons_first() {
        let held = [Held::Key(38), Held::Key(50), Held::Button(1), Held::Button(4)];
        assert_eq!(
            still_down(&held, &bits(&[50, 38, 64]), &bits(&[1, 4])),
            [Held::Button(4), Held::Button(1), Held::Key(50), Held::Key(38)]
        );
        assert_eq!(
            still_down(&held, &bits(&[38]), &bits(&[4, 1])),
            [Held::Button(4), Held::Button(1), Held::Key(38)],
            "a key already up is left alone; a key down that the engine did not record is never touched"
        );
        assert!(still_down(&held, &bits(&[]), &bits(&[])).is_empty());
        assert!(still_down(&[], &bits(&[50]), &bits(&[1])).is_empty());
    }

    #[test]
    fn the_wait_for_the_engine_is_its_own_latest_exit_and_50_ms() {
        assert_eq!(WRITER_WAIT, Duration::from_millis(1250));
        assert_eq!(ENDED_WAIT, Duration::from_millis(200));
    }

    /// The test process itself, standing for a supervisor that lives on.
    fn living_supervisor() -> OwnedFd {
        rustix::process::pidfd_open(rustix::process::getpid(), PidfdFlags::empty()).unwrap()
    }

    fn launcher(program: &str, args: &[&str], record: Option<BorrowedFd<'_>>) -> Child {
        let args: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        spawn(program, &args, record, KernelSigSet::empty()).unwrap()
    }

    #[test]
    fn a_watch_that_fails_kills_the_launcher_as_the_supervisor_s_death_would() {
        // the supervisor lives, so only the failure can end the watch; the old classification waited the launcher out
        let supervisor = living_supervisor();
        let cases: [(&str, bool); 3] = [("no pidfd", false), ("EBADF", true), ("ENOMEM", true)];
        for (fault, polls) in cases {
            let mut child = launcher("sleep", &["3"], None);
            let started = Instant::now();
            let (ended, status) = if polls {
                let errno = if fault == "EBADF" {
                    rustix::io::Errno::BADF
                } else {
                    rustix::io::Errno::NOMEM
                };
                supervise(
                    &mut child,
                    supervisor.as_fd(),
                    None,
                    |pid| rustix::process::pidfd_open(pid, PidfdFlags::empty()),
                    |_| Err(errno),
                )
            } else {
                supervise(
                    &mut child,
                    supervisor.as_fd(),
                    None,
                    |_| Err(rustix::io::Errno::NOMEM),
                    |fds| rustix::event::poll(fds, None),
                )
            };
            assert_eq!(ended, Ended::Unwatchable, "{fault}");
            assert_eq!(status.signal(), Some(9), "{fault}: SIGKILLed, then reaped");
            assert!(started.elapsed() < Duration::from_secs(1), "{fault}: at once");
        }
    }

    #[test]
    fn an_interrupted_poll_goes_on_watching_and_the_launcher_s_own_end_is_waited_for() {
        let supervisor = living_supervisor();
        let mut child = launcher("sh", &["-c", "sleep 0.2; exit 4"], None);
        let mut interrupted = 0;
        let (ended, status) = supervise(
            &mut child,
            supervisor.as_fd(),
            None,
            |pid| rustix::process::pidfd_open(pid, PidfdFlags::empty()),
            |fds| {
                if interrupted < 3 {
                    interrupted += 1;
                    return Err(rustix::io::Errno::INTR);
                }
                rustix::event::poll(fds, None)
            },
        );
        assert_eq!((ended, status.code()), (Ended::Launcher, Some(4)));
    }

    #[test]
    fn a_writer_that_outlives_the_wait_is_ended_and_nothing_that_does_not_hold_the_record() {
        // the launcher, a shell, leaves the engine (a sleep holding the record's write end) behind it, and a sleep of
        // its own that does not hold it
        let (mut record, write_end) = Reader::make().unwrap();
        let scratch = Scratch::make("writer");
        let pids = scratch.0.join("pid");
        // the path is the script's argument, never its source; the descriptor's number is the test's own
        let script = format!(
            "sleep 30 & echo $! > \"$1.engine\"; sleep 30 {}>&- & echo $! > \"$1.other\"",
            write_end.as_raw_fd()
        );
        // bash, whose redirections take a descriptor of any number (dash takes one digit)
        let pids_arg = pids.to_str().unwrap();
        let mut child = launcher("bash", &["-c", &script, "bash", pids_arg], Some(write_end.as_fd()));
        drop(write_end);
        assert!(wait(&mut child).success());
        let read = |what: &str| -> u32 {
            let path = format!("{}.{what}", pids.display());
            let pid = std::fs::read_to_string(&path).unwrap().trim().parse().unwrap();
            std::fs::remove_file(path).unwrap();
            pid
        };
        let (engine, other) = (read("engine"), read("other"));
        assert!(alive(engine) && alive(other));
        let started = Instant::now();
        let said = released_after_writers(&mut record).expect("a sentence");
        assert!(started.elapsed() >= WRITER_WAIT, "the writer had its wait");
        assert!(
            said.contains("outlived the launcher by 1.25s: ended 1 holding it, 1 gone"),
            "{said}"
        );
        assert!(ends(engine), "the record's writer is ended");
        assert!(alive(other), "what does not hold the record is left alone");
        let _ = rustix::process::kill_process(Pid::from_raw(other as i32).unwrap(), Signal::KILL);
        assert_eq!(record.wait_for_writers(Duration::from_secs(1)), Writers::Gone);
    }

    /// A scratch directory of the test's own, removed on drop, whose name a shell would split and expand were it pasted
    /// into a script's source (the whole-branch review of M4, P2: the temporary directory, which TMPDIR names, went
    /// into the source): the scripts take their paths as arguments.
    struct Scratch(std::path::PathBuf);

    impl Scratch {
        fn make(tag: &str) -> Scratch {
            let name = format!("cua-shim-unit {tag};$(exit 7) '\"{}", std::process::id());
            let dir = std::env::temp_dir().join(name);
            std::fs::create_dir_all(&dir).unwrap();
            Scratch(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn alive(pid: u32) -> bool {
        std::fs::read_to_string(format!("/proc/{pid}/stat"))
            .is_ok_and(|s| !matches!(s[s.rfind(')').unwrap() + 2..].chars().next(), Some('Z' | 'X')))
    }

    /// Whether `pid` has exited within a second: a process sent SIGKILL closes its descriptors, which ends the pipe,
    /// before its exit is complete.
    fn ends(pid: u32) -> bool {
        let until = Instant::now() + Duration::from_secs(1);
        while alive(pid) && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(5));
        }
        !alive(pid)
    }

    /// The record, the engine's stand-in (a sleep holding its write end, left behind by its launcher, a shell), and a
    /// copy of the write end of the test's own, to write records as the engine does; the stand-in killed on drop.
    struct Lingering {
        record: Reader,
        ours: Option<std::fs::File>,
        engine: u32,
    }

    impl Lingering {
        fn start(tag: &str) -> Lingering {
            let (record, write_end) = Reader::make().unwrap();
            let ours = std::fs::File::from(write_end.try_clone().unwrap());
            let scratch = Scratch::make(tag);
            let pidfile = scratch.0.join("pid");
            let script = "sleep 30 & echo $! > \"$1\"";
            let mut child = launcher(
                "sh",
                &["-c", script, "sh", pidfile.to_str().unwrap()],
                Some(write_end.as_fd()),
            );
            drop(write_end);
            assert!(wait(&mut child).success());
            let engine = std::fs::read_to_string(&pidfile).unwrap().trim().parse().unwrap();
            std::fs::remove_file(pidfile).unwrap();
            Lingering {
                record,
                ours: Some(ours),
                engine,
            }
        }

        /// Writes a record of `held` through the test's copy, then closes the copy.
        fn last(&mut self, held: &[Held]) {
            if let Some(ours) = self.ours.take() {
                held::write(&ours, held);
            }
        }
    }

    impl Drop for Lingering {
        fn drop(&mut self) {
            let _ = rustix::process::kill_process(Pid::from_raw(self.engine as i32).unwrap(), Signal::KILL);
        }
    }

    #[test]
    fn a_record_written_while_its_writers_are_ended_is_read_before_the_release_set_is_chosen() {
        // the engine's held set changes during its end: it records Shift (and presses it) after the wait has run out,
        // between the shim's finding it and its SIGKILL
        let mut run = Lingering::start("final");
        let engine = run.engine;
        if let Some(ours) = &run.ours {
            held::write(ours, &[]);
        }
        let mut ours = run.ours.take();
        let (held, said) = after_the_launcher(&mut run.record, &KILLS, &mut |pid| {
            if pid == engine
                && let Some(ours) = ours.take()
            {
                held::write(&ours, &[Held::Key(50)]);
            }
        });
        assert_eq!(
            held,
            Some(vec![Held::Key(50)]),
            "the last record is in the release: {said:?}"
        );
        assert!(ends(engine));
        assert!(said.unwrap().contains("ended 1 holding it, 1 gone"));
    }

    #[test]
    fn a_holder_whose_pidfd_or_its_signal_fails_is_not_stopped_and_nothing_is_released() {
        // no kill by pid (fix 7): a pid can be reused, so the shim signals only through a pidfd. A holder whose pidfd
        // or its signal fails is a writer it cannot stop, which may go on pressing, so a release now could be
        // followed by its press
        let no_pidfd = Kills {
            open: |_| Err(rustix::io::Errno::MFILE),
            ..KILLS
        };
        let no_signal = Kills {
            signal: |_| Err(rustix::io::Errno::PERM),
            ..KILLS
        };
        for (fault, kills) in [("EMFILE", no_pidfd), ("EPERM", no_signal)] {
            let mut run = Lingering::start(fault);
            run.last(&[Held::Key(50)]);
            let (held, said) = after_the_launcher(&mut run.record, &kills, &mut |_| {});
            let said = said.unwrap();
            assert_eq!(held, None, "{fault}: nothing released: {said}");
            assert!(alive(run.engine), "{fault}: no kill by pid: {said}");
            assert!(
                said.contains(&format!("could not stop {}", run.engine)),
                "{fault}: {said}"
            );
            assert!(
                said.contains("nothing released: a writer of its record may still be pressing"),
                "{fault}: {said}"
            );
        }
    }

    #[test]
    fn writers_gone_and_nothing_held_leave_nothing_to_say() {
        let (mut record, write_end) = Reader::make().unwrap();
        let mut child = launcher("true", &[], Some(write_end.as_fd()));
        drop(write_end);
        assert!(wait(&mut child).success());
        assert_eq!(released_after_writers(&mut record), None);
    }
}
