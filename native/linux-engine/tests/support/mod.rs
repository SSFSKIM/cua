//! What the live tests share: the engine binary as a child speaking the wire, and the display's clean slate.

#![allow(dead_code)]

use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, channel};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// `unshare`'s options for [`Engine::start_sandboxed`]: a user namespace mapping the test's user, a PID namespace with
/// its own `/proc`, the engine its first child, killed with `unshare`.
const SANDBOX: [&str; 6] = [
    "--user",
    "--map-current-user",
    "--pid",
    "--fork",
    "--kill-child",
    "--mount-proc",
];

/// Whether process `pid` of the test's namespace can be read from inside a namespace as [`Engine::start_sandboxed`]
/// makes: its map, as the engine would read it.
pub fn sandbox_reads_maps_of(pid: u32) -> bool {
    Command::new("unshare")
        .args(SANDBOX)
        .args(["sh", "-c", &format!("head -c 1 /proc/{pid}/maps >/dev/null 2>&1")])
        .status()
        .is_ok_and(|s| s.success())
}

/// How long one wire request may take before the test gives up on the engine.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// The engine under test: the binary `CUA_ENGINE_BIN` names (the release workflow's shipped asset), or cargo's build.
pub fn engine_bin() -> PathBuf {
    std::env::var_os("CUA_ENGINE_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(live_build)
}

/// Cargo's build of the engine for these tests, whatever `CUA_ENGINE_BIN` names: built with the `live` feature, so it
/// carries the fault injection (`CUA_ENGINE_FAULT`) that a shipped binary never does.
fn live_build() -> PathBuf {
    PathBuf::from(env!("CARGO_BIN_EXE_cua-engine"))
}

/// The engine as a child speaking the wire, killed on drop.
pub struct Engine {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    next_id: u64,
    /// The engine's stdout, held open and never read ([`Engine::start_unread`]).
    unread: Option<std::process::ChildStdout>,
}

/// Removes the display's record of an unconfirmed paste's window (the root window's `CUA_CLIPBOARD_QUARANTINE`), which
/// outlives the engine that wrote it, so a test starts with no window open from an earlier test.
pub fn clear_display_record() {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::ConnectionExt;
    let (conn, screen) = x11rb::connect(None).expect("an X connection");
    let root = conn.setup().roots[screen].root;
    let atom = conn
        .intern_atom(false, b"CUA_CLIPBOARD_QUARANTINE")
        .unwrap()
        .reply()
        .unwrap()
        .atom;
    conn.delete_property(root, atom).unwrap();
    conn.flush().unwrap();
    conn.get_input_focus().unwrap().reply().unwrap();
}

impl Engine {
    /// An engine, on a display with no unconfirmed paste's window open.
    pub fn start() -> Engine {
        clear_display_record();
        Engine::spawn()
    }

    /// An engine, leaving any window on the display open.
    pub fn spawn() -> Engine {
        Engine::spawn_with(&engine_bin(), &[], &[])
    }

    /// An engine started with these options after `server` (`--desktop dedicated`), on a display with no unconfirmed
    /// paste's window open.
    pub fn start_with(options: &[&str]) -> Engine {
        clear_display_record();
        Engine::spawn_with(&engine_bin(), options, &[])
    }

    /// [`Engine::start_with`] with this fault injected (`CUA_ENGINE_FAULT`), always on cargo's live build: a shipped
    /// binary has no fault injection, so under `CUA_ENGINE_BIN` the fault would silently not happen.
    pub fn start_with_fault(options: &[&str], fault: &str) -> Engine {
        clear_display_record();
        Engine::spawn_with(&live_build(), options, &[("CUA_ENGINE_FAULT", fault)])
    }

    /// The engine's process id.
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// [`Engine::start_with`] inside a PID namespace of its own with its own `/proc`, as cua's worker sandbox runs it
    /// (`codex-linux-sandbox`'s bwrap: `--unshare-pid` and a fresh proc), so no process of the display's applications
    /// is visible to it and their `/proc/<pid>/maps` cannot be read. `unshare` makes a user namespace that maps the
    /// test's own user, so the X server and the accessibility bus see the same peer. None, said on stderr, where this
    /// host refuses such namespaces.
    pub fn start_sandboxed(options: &[&str]) -> Option<Engine> {
        if !Command::new("unshare")
            .args(SANDBOX)
            .arg("true")
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
        {
            eprintln!("skipped: unshare cannot make a user and PID namespace here");
            return None;
        }
        clear_display_record();
        let mut command = Command::new("unshare");
        command.args(SANDBOX).arg(engine_bin()).arg("server").args(options);
        Some(Engine::spawn_command(command, "the sandboxed engine", false))
    }

    fn spawn_with(bin: &std::path::Path, options: &[&str], env: &[(&str, &str)]) -> Engine {
        let mut command = Command::new(bin);
        command.arg("server").args(options).envs(env.iter().copied());
        // an engine given an injected fault says so on stderr; the test reads its effect, not the message
        Engine::spawn_command(command, &bin.display().to_string(), !env.is_empty())
    }

    fn spawn_command(mut command: Command, what: &str, quiet: bool) -> Engine {
        let mut child = command
            .stderr(if quiet { Stdio::null() } else { Stdio::inherit() })
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap_or_else(|e| panic!("cannot start {what}: {e}"));
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().unwrap();
        let (tx, lines) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if tx.send(line).is_err() {
                    break;
                }
            }
        });
        Engine {
            child,
            stdin,
            lines,
            next_id: 1,
            unread: None,
        }
    }

    /// An engine whose answers nobody reads: its stdout is held open and never read, as when the REPL host has frozen
    /// the trusted worker that reads it, so once the pipe is full the engine's next answer cannot go out. Only
    /// `pipeline`, `signal` and `exit_within` apply.
    pub fn start_unread() -> Engine {
        clear_display_record();
        let mut child = Command::new(engine_bin())
            .arg("server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap_or_else(|e| panic!("cannot start {}: {e}", engine_bin().display()));
        let stdin = child.stdin.take();
        let unread = child.stdout.take();
        Engine {
            child,
            stdin,
            lines: channel().1,
            next_id: 1,
            unread,
        }
    }

    /// One request, or None when the engine exits instead of answering (its stdout closed).
    pub fn try_request(&mut self, command: &str, input: Value) -> Option<Result<Value, String>> {
        let id = self.next_id;
        self.next_id += 1;
        let line = json!({"id": id, "command": command, "input": input}).to_string();
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{line}").ok()?;
        stdin.flush().ok()?;
        let answer = match self.lines.recv_timeout(REQUEST_TIMEOUT) {
            Ok(answer) => answer,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return None,
            Err(_) => panic!("no answer to {command} within {REQUEST_TIMEOUT:?}"),
        };
        let answer: Value = serde_json::from_str(&answer).unwrap_or_else(|e| panic!("not JSON ({e}): {answer}"));
        assert_eq!(answer["id"], json!(id), "answers come in request order");
        Some(if answer["ok"] == json!(true) {
            Ok(answer["output"].clone())
        } else {
            Err(answer["error"].as_str().unwrap_or("").to_string())
        })
    }

    /// Writes requests without waiting for their answers (pipelined, as a service may): `pipeline` then `answers`.
    pub fn pipeline(&mut self, requests: &[(&str, Value)]) {
        let stdin = self.stdin.as_mut().unwrap();
        for (command, input) in requests {
            let line = json!({"id": self.next_id, "command": command, "input": input}).to_string();
            self.next_id += 1;
            writeln!(stdin, "{line}").unwrap();
        }
        stdin.flush().unwrap();
    }

    /// The next `n` answers, in order, each with when it arrived.
    pub fn answers(&mut self, n: usize) -> Vec<(Value, Instant)> {
        (0..n)
            .map(|_| {
                let line = self
                    .lines
                    .recv_timeout(REQUEST_TIMEOUT)
                    .unwrap_or_else(|_| panic!("no answer within {REQUEST_TIMEOUT:?}"));
                let at = Instant::now();
                (
                    serde_json::from_str(&line).unwrap_or_else(|e| panic!("not JSON ({e}): {line}")),
                    at,
                )
            })
            .collect()
    }

    /// Sends the engine a signal (`rustix::process::Signal::TERM`, `KILL`).
    pub fn signal(&self, signal: rustix::process::Signal) {
        let pid = rustix::process::Pid::from_raw(self.child.id() as i32).expect("a process id");
        rustix::process::kill_process(pid, signal).expect("the engine is signalled");
    }

    /// Closes the engine's stdin, its orderly exit.
    pub fn close_stdin(&mut self) {
        drop(self.stdin.take());
    }

    /// The engine's exit, waited for at most `bound`, with when it was seen: None if it is still running.
    pub fn exit_within(&mut self, bound: Duration) -> Option<(std::process::ExitStatus, Instant)> {
        let deadline = Instant::now() + bound;
        loop {
            if let Ok(Some(status)) = self.child.try_wait() {
                return Some((status, Instant::now()));
            }
            if Instant::now() >= deadline {
                return None;
            }
            sleep(Duration::from_millis(1));
        }
    }

    /// One request; the output on success, the error sentence otherwise.
    pub fn request(&mut self, command: &str, input: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let line = json!({"id": id, "command": command, "input": input}).to_string();
        let stdin = self.stdin.as_mut().unwrap();
        writeln!(stdin, "{line}").unwrap();
        stdin.flush().unwrap();
        let answer = self
            .lines
            .recv_timeout(REQUEST_TIMEOUT)
            .unwrap_or_else(|_| panic!("no answer to {command} within {REQUEST_TIMEOUT:?}"));
        let answer: Value = serde_json::from_str(&answer).unwrap_or_else(|e| panic!("not JSON ({e}): {answer}"));
        assert_eq!(answer["id"], json!(id), "answers come in request order");
        if answer["ok"] == json!(true) {
            Ok(answer["output"].clone())
        } else {
            Err(answer["error"].as_str().unwrap_or("").to_string())
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        // Closing stdin is the orderly exit; the kill covers an engine that does not take it.
        drop(self.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return;
            }
            sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
