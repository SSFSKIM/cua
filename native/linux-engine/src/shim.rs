//! `cua-engine launcher-shim <parent pid> <program> [args...]`: not the engine. It is the resident shim through which
//! cua's REPL host starts the trusted worker's sandbox launcher on Linux (src/repl-host/kernel-child.mjs), the
//! launcher's parent for its whole life (the design session's ruling, M4 T7b fix 4):
//!
//! - It watches the parent it names, the supervisor, through a pidfd taken before it checks that the supervisor is
//!   still its parent (if it died first, nothing runs). When the supervisor dies, however it dies, SIGKILL included, the
//!   shim SIGKILLs the launcher at once, so the launcher, held or not, never outlives it and no model code runs on; and
//!   the launcher's own parent-death signal, SIGKILL against the shim, takes it if the shim itself is killed.
//! - It never resumes anything. A launcher held stopped during a stop has the owned group's SIGTERM pending, which a
//!   SIGCONT would fire, ending the sandbox before the engine released.
//! - Once the launcher has exited, for whatever reason (the supervisor's death, the worker's own end, the stop), and
//!   the engine under it has closed its held record (`held.rs`) or a bound has passed, it releases exactly what the
//!   record still holds, and only what the XInput devices still show down on the XTEST slave, then exits as the
//!   launcher did. The sandbox's end SIGKILLs the engine with nothing released; after an orderly stop the engine has
//!   released already and its record is empty, so the shim sends nothing.
//! - The stop signals (SIGTERM, SIGINT, SIGHUP) never end it: blocked here, so the owned group's SIGTERM at upstream's
//!   by(0.4) waits on the supervisor's stop, as it did before; the launcher starts with no signal blocked.
//!
//! It runs before the engine blocks its stop signals or starts any thread.

use std::io::ErrorKind;
use std::os::fd::OwnedFd;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::path::Path;
use std::process::{Child, ExitStatus};
use std::time::Duration;

use rustix::event::{PollFd, PollFlags};
use rustix::process::{Pid, PidfdFlags, Signal};
use rustix::runtime::{How, KernelSigSet};

use crate::held::{self, Held, Reader};

/// The subcommand's name on the command line.
pub const SUBCOMMAND: &str = "launcher-shim";

/// How long the shim waits, once the launcher has exited, for the engine to close its record: the engine's own latest
/// exit after its stop signal, its backstop and its forced release, and 50 ms (the REPL host's `ENGINE_EXIT_WAIT_MS`).
/// Sandboxed, the namespace's end has SIGKILLed the engine and the close comes at once; with the sandbox disabled, the
/// engine outlives its worker and drains on its own.
pub const WRITER_WAIT: Duration = Duration::from_millis(
    crate::serve::EXIT_BACKSTOP.as_millis() as u64 + crate::pressed::FORCED_RELEASE_BOUND.as_millis() as u64 + 50,
);

/// What ended the watch.
enum Ended {
    /// The supervisor exited: the launcher is SIGKILLed.
    Supervisor,
    /// The launcher exited first.
    Launcher,
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
    // the record lives under the run's own TMPDIR, which the sandboxed worker reads; with none, the kill alone
    let mut record = std::env::var_os("TMPDIR")
        .map(std::path::PathBuf::from)
        .filter(|dir| dir.is_absolute())
        .and_then(|dir| Reader::make(&dir).ok());
    let mut child = match spawn(program, args, record.as_ref().map(Reader::path), given) {
        Ok(child) => child,
        Err(error) => return (127, Some(format!("Error {program} could not be run: {error}"))),
    };
    let launcher = Pid::from_raw(child.id() as i32).expect("a child's pid");
    let ended = match rustix::process::pidfd_open(launcher, PidfdFlags::empty()) {
        Ok(pidfd) => watch(&supervisor, &pidfd, record.as_mut()),
        // cannot happen for a child not yet reaped; its exit is then waited for in place
        Err(_) => Ended::Launcher,
    };
    if let Ended::Supervisor = ended {
        let _ = rustix::process::kill_process(launcher, Signal::KILL);
    }
    let status = wait(&mut child);
    let sentence = record.as_mut().and_then(|record| {
        record.wait_for_writers(WRITER_WAIT);
        let held = record.held().to_vec();
        (!held.is_empty()).then(|| released_within(crate::pressed::FORCED_RELEASE_BOUND, held))
    });
    drop(record);
    if let Some(sentence) = &sentence {
        eprintln!("{sentence}");
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

/// Starts `program` as this shim's child, with the shim's stdio and environment and the record's path: its
/// parent-death signal is SIGKILL, set in the child, which checks then that the shim is still its parent, and it gets
/// back the signal mask the shim was `given` (a child inherits the shim's blocked stop signals, and Rust's spawn resets
/// only SIGPIPE's action).
fn spawn(program: &str, args: &[String], record: Option<&Path>, given: KernelSigSet) -> std::io::Result<Child> {
    let mut command = std::process::Command::new(program);
    command.args(args);
    if let Some(path) = record {
        command.env(held::RECORD_ENV, path);
    }
    let shim = rustix::process::getpid();
    // SAFETY: the closure runs in the forked child before its exec and only makes system calls
    unsafe {
        command.pre_exec(move || {
            rustix::process::set_parent_process_death_signal(Some(Signal::KILL))?;
            if rustix::process::getppid() != Some(shim) {
                return Err(std::io::Error::other("the launcher's shim is gone"));
            }
            rustix::runtime::kernel_sigprocmask(How::SETMASK, Some(&given))?;
            Ok(())
        });
    }
    command.spawn()
}

/// Polls the supervisor, the launcher and the record until one of the two processes has exited, reading records as
/// they come.
fn watch(supervisor: &OwnedFd, launcher: &OwnedFd, mut record: Option<&mut Reader>) -> Ended {
    loop {
        let (supervisor_gone, launcher_gone, record_ready) = {
            let mut fds = vec![
                PollFd::new(supervisor, PollFlags::IN),
                PollFd::new(launcher, PollFlags::IN),
            ];
            if let Some(record) = record.as_deref() {
                fds.push(PollFd::from_borrowed_fd(record.fd(), PollFlags::IN));
            }
            match rustix::event::poll(&mut fds, None) {
                Ok(_) => {}
                Err(rustix::io::Errno::INTR) => continue,
                // nothing can be watched: the launcher's exit is waited for in place
                Err(_) => return Ended::Launcher,
            }
            (
                !fds[0].revents().is_empty(),
                !fds[1].revents().is_empty(),
                fds.get(2).is_some_and(|fd| !fd.revents().is_empty()),
            )
        };
        // a record that cannot be read any more is watched no longer (its end would keep the poll ready); what it held
        // is still released
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

/// The keys and buttons of `held` to release, latest first: those `keys` and `buttons` (the XTEST slave devices' state,
/// one bit per keycode and per button) still show down.
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
                "cua-engine {SUBCOMMAND}: released {} of the {recorded} its engine held [{}]",
                released.len(),
                named.join(", ")
            )
        }
        Ok(Err(error)) => format!("cua-engine {SUBCOMMAND}: the {recorded} its engine held were not released: {error}"),
        Err(_) => format!("cua-engine {SUBCOMMAND}: the {recorded} its engine held were not released within {bound:?}"),
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

    fn bits(codes: &[u8]) -> [u8; 32] {
        let mut bits = [0u8; 32];
        for &c in codes {
            bits[usize::from(c / 8)] |= 1 << (c % 8);
        }
        bits
    }

    #[test]
    fn only_what_the_xtest_devices_still_show_down_is_released_latest_first() {
        let held = [Held::Key(50), Held::Button(1), Held::Key(38), Held::Button(4)];
        assert_eq!(
            still_down(&held, &bits(&[50, 38, 64]), &bits(&[1, 4])),
            [Held::Button(4), Held::Key(38), Held::Button(1), Held::Key(50)]
        );
        assert_eq!(
            still_down(&held, &bits(&[38]), &bits(&[4, 1])),
            [Held::Button(4), Held::Key(38), Held::Button(1)],
            "a key already up is left alone; a key down that the engine did not record is never touched"
        );
        assert!(still_down(&held, &bits(&[]), &bits(&[])).is_empty());
        assert!(still_down(&[], &bits(&[50]), &bits(&[1])).is_empty());
    }

    #[test]
    fn the_wait_for_the_engine_is_its_own_latest_exit_and_50_ms() {
        assert_eq!(WRITER_WAIT, Duration::from_millis(1250));
    }
}
