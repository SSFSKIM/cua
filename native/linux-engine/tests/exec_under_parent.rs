//! `cua-engine exec-under-parent <parent pid> <program> [args...]`: the REPL host's shim for the trusted worker's
//! launcher (src/repl-host/kernel-child.mjs). It sets the parent-death signal to SIGKILL, checks that its parent is still
//! the one named, then execs the program, so the program dies with the process that started it, even stopped (the
//! design session's ruling, M4 T7b fix 3). No display needed.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

const ENGINE: &str = env!("CARGO_BIN_EXE_cua-engine");

fn state(pid: u32) -> Option<char> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    stat[stat.rfind(')')? + 2..].chars().next()
}

/// Gone, or a zombie nobody has reaped yet.
fn exited(pid: u32) -> bool {
    matches!(state(pid), None | Some('Z') | Some('X'))
}

fn wait_exited(pid: u32, within: Duration) -> bool {
    let until = Instant::now() + within;
    while Instant::now() < until {
        if exited(pid) {
            return true;
        }
        sleep(Duration::from_millis(10));
    }
    exited(pid)
}

/// A shell that starts `child` in the background, prints its pid, and waits; returns the shell and that pid.
fn parent_of(child: &str) -> (std::process::Child, u32) {
    let mut shell = Command::new("sh")
        .args(["-c", &format!("{child} & echo $!; wait"), ENGINE])
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(shell.stdout.as_mut().unwrap())
        .read_line(&mut line)
        .unwrap();
    (shell, line.trim().parse().unwrap())
}

#[test]
fn the_program_dies_with_its_parent_even_stopped() {
    let (mut shell, pid) = parent_of(r#""$0" exec-under-parent $$ sleep 60"#);
    sleep(Duration::from_millis(200));
    assert_eq!(
        std::fs::read_to_string(format!("/proc/{pid}/comm")).unwrap().trim(),
        "sleep",
        "the shim became the program, under the same pid"
    );
    rustix::process::kill_process(
        rustix::process::Pid::from_raw(pid as i32).unwrap(),
        rustix::process::Signal::STOP,
    )
    .unwrap();
    shell.kill().unwrap();
    let _ = shell.wait();
    assert!(
        wait_exited(pid, Duration::from_secs(2)),
        "SIGKILLed with its parent: state {:?}",
        state(pid)
    );
}

#[test]
fn without_the_shim_the_program_outlives_its_parent() {
    // the control: what the launcher did before
    let (mut shell, pid) = parent_of("sleep 60");
    sleep(Duration::from_millis(200));
    shell.kill().unwrap();
    let _ = shell.wait();
    sleep(Duration::from_millis(300));
    let alive = !exited(pid);
    let _ = rustix::process::kill_process(
        rustix::process::Pid::from_raw(pid as i32).unwrap(),
        rustix::process::Signal::KILL,
    );
    assert!(alive, "an orphan, reparented");
}

#[test]
fn a_parent_already_gone_runs_nothing() {
    // the fork race: the parent named is not the shim's parent (it died before the signal was set), so nothing runs
    let out = Command::new(ENGINE)
        .args(["exec-under-parent", "1", "sh", "-c", "echo ran"])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout), "");
    assert_ne!(out.status.code(), Some(0));
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("is no longer the parent"),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn the_program_gets_its_arguments_and_stdio_as_given() {
    let parent = std::process::id();
    let out = Command::new(ENGINE)
        .args([
            "exec-under-parent",
            &parent.to_string(),
            "sh",
            "-c",
            "printf '%s|' \"$@\"",
            "sh",
            "a b",
            "--version",
            "",
        ])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout), "a b|--version||");
    assert_eq!(out.status.code(), Some(0));
    let missing = Command::new(ENGINE)
        .args(["exec-under-parent", &parent.to_string()])
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(2), "a program is required");
}
