//! `cua-engine exec-under-parent <parent pid> <program> [args...]`: not the engine. It is the shim through which cua's
//! REPL host starts the trusted worker's sandbox launcher on Linux (src/repl-host/kernel-child.mjs): Node cannot call
//! prctl, so the shim does. It sets the parent-death signal to SIGKILL, then checks that its parent is still the process
//! named (if that parent died before the signal was set, nothing would ever send it, so the shim runs nothing), then
//! execs the program, which keeps the signal and the pid. The launcher then dies with the supervisor that started it,
//! even while the supervisor holds it stopped, however the supervisor ends, SIGKILL included (the design session's
//! ruling, M4 T7b fix 3). It runs before the engine's stop signals are blocked, so the program starts with the mask
//! the REPL host gave the shim.

use std::os::unix::process::CommandExt;

/// The subcommand's name on the command line.
pub const SUBCOMMAND: &str = "exec-under-parent";

/// Sets the parent-death signal, checks the parent, and execs `program` with `args`; returns only on a failure, with the
/// exit code and the sentence to print.
pub fn exec_under_parent(parent: i32, program: &str, args: &[String]) -> (i32, String) {
    if let Err(error) = rustix::process::set_parent_process_death_signal(Some(rustix::process::Signal::KILL)) {
        return (126, format!("Error the parent-death signal could not be set: {error}"));
    }
    let now = rustix::process::getppid().map_or(0, |p| p.as_raw_nonzero().get());
    if now != parent {
        return (
            125,
            format!("Error process {parent} is no longer the parent (now {now}); {program} was not run"),
        );
    }
    let error = std::process::Command::new(program).args(args).exec();
    (127, format!("Error {program} could not be run: {error}"))
}
