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
    /// Its `--stats` lines as they come ([`Engine::start_with_stats`]), and those read so far.
    stats: Option<Receiver<Value>>,
    stats_read: Vec<Value>,
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

/// The root properties a test of these binaries sets as a window manager would, and the engine's paste record: what
/// [`fresh_display`] clears.
const TEST_ROOT_PROPERTIES: [&[u8]; 4] = [
    b"_NET_ACTIVE_WINDOW",
    b"_NET_CLIENT_LIST_STACKING",
    b"_NET_SUPPORTED",
    b"CUA_CLIPBOARD_QUARANTINE",
];

/// The connection that keeps the test's X server from resetting while this test binary runs ([`fresh_display`]).
static HELD: std::sync::OnceLock<x11rb::rust_connection::RustConnection> = std::sync::OnceLock::new();

/// The display as a test starts on it, the same every time (#171 M5, task 115's root cause of `live_device`'s flaky
/// runs). Xvfb, as `xvfb-run` starts it, resets once its last client disconnects: it closes every connection, drops the
/// root's properties, puts the focus back on the pointer's root and the pointer in the screen's middle, and compiles its
/// keymap again. Between two tests every connection may close (the engine exits, the probes drop), so whether a test
/// started on a reset display depended on timing, and a test whose first connect came while the server was resetting
/// had it closed under it (`ConnectionReset` at the connect, 4 of 4 runs of the prototype's `live_device` and 1 of 2 of
/// its base on the x64 host, about 100 resets a run in Xvfb's audit log). So the binary holds one connection for its
/// whole run, opened through any reset already under way, and the server never resets under it; and each test starts by
/// clearing what a reset would have cleared that these tests change: the root properties they set (window-manager
/// state such as a stacking list naming a window long gone, whose resource id a later client is handed again), the
/// focus, and where the pointer is.
pub fn fresh_display() {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{ConnectionExt, InputFocus};
    let conn = HELD.get_or_init(connect_through_reset);
    let screen = &conn.setup().roots[0];
    let root = screen.root;
    for name in TEST_ROOT_PROPERTIES {
        let atom = conn.intern_atom(false, name).unwrap().reply().unwrap().atom;
        conn.delete_property(root, atom).unwrap();
    }
    conn.set_input_focus(
        InputFocus::POINTER_ROOT,
        u32::from(InputFocus::POINTER_ROOT),
        x11rb::CURRENT_TIME,
    )
    .unwrap();
    let middle = |size: u16| (size / 2) as i16;
    conn.warp_pointer(
        x11rb::NONE,
        root,
        0,
        0,
        0,
        0,
        middle(screen.width_in_pixels),
        middle(screen.height_in_pixels),
    )
    .unwrap();
    conn.get_input_focus().unwrap().reply().unwrap();
}

/// A connection to the display that has made a round trip, waiting out a reset under way: a connect while the server
/// resets is closed (`ConnectionReset`), and one it accepted just before the reset is closed by it.
fn connect_through_reset() -> x11rb::rust_connection::RustConnection {
    use x11rb::protocol::xproto::ConnectionExt;
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let attempt = x11rb::connect(None).map_err(|e| e.to_string()).and_then(|(conn, _)| {
            conn.get_input_focus()
                .map_err(|e| e.to_string())?
                .reply()
                .map_err(|e| e.to_string())?;
            Ok(conn)
        });
        match attempt {
            Ok(conn) => return conn,
            Err(error) if Instant::now() < deadline => {
                eprintln!("the display is resetting ({error}); connecting again");
                sleep(Duration::from_millis(50));
            }
            Err(error) => panic!("no X connection within 10 s: {error}"),
        }
    }
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

    /// [`Engine::start_with`] with `--stats`, its lines read off its stderr ([`Engine::stats_of`]); anything else it
    /// writes there goes to the test's stderr.
    pub fn start_with_stats(options: &[&str]) -> Engine {
        clear_display_record();
        let mut command = Command::new(engine_bin());
        command.arg("server").arg("--stats").args(options);
        Engine::spawn_with_stats(command)
    }

    /// [`Engine::start_with_stats`] inside a PID namespace of its own, as [`Engine::start_sandboxed`] makes: no process
    /// of the display's applications is visible to it. None, said on stderr, where this host refuses such namespaces.
    pub fn start_sandboxed_with_stats(options: &[&str]) -> Option<Engine> {
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
        command
            .args(SANDBOX)
            .arg(engine_bin())
            .arg("server")
            .arg("--stats")
            .args(options);
        Some(Engine::spawn_with_stats(command))
    }

    fn spawn_with_stats(mut command: Command) -> Engine {
        let mut child = command
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap_or_else(|e| panic!("cannot start {}: {e}", engine_bin().display()));
        let stderr = child.stderr.take().unwrap();
        let (tx, stats) = channel();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                match serde_json::from_str::<Value>(&line) {
                    Ok(value) if value.get("stats").is_some() => {
                        let _ = tx.send(value["stats"].clone());
                    }
                    _ => eprintln!("{line}"),
                }
            }
        });
        let mut engine = Engine::spawn_child(child);
        engine.stats = Some(stats);
        engine
    }

    /// The `--stats` line of request `id` ([`Engine::last_id`]), waited for at most 5 s: the engine writes it once the
    /// answer is out.
    pub fn stats_of(&mut self, id: u64) -> Value {
        self.stats_where(|line| line["id"] == json!(id))
            .unwrap_or_else(|| panic!("no --stats line for request {id}"))
    }

    /// The first `--stats` line `matches` takes, waited for at most 5 s: None if none came (the exit's line is the one
    /// with `settle_final`, written once the orderly exit has settled).
    pub fn stats_where(&mut self, matches: impl Fn(&Value) -> bool) -> Option<Value> {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(line) = self.stats_read.iter().find(|line| matches(line)) {
                return Some(line.clone());
            }
            let left = deadline.saturating_duration_since(Instant::now());
            let receiver = self.stats.as_ref().expect("an engine started with --stats");
            match receiver.recv_timeout(left) {
                Ok(line) => self.stats_read.push(line),
                Err(_) => return None,
            }
        }
    }

    /// The id of the request last sent.
    pub fn last_id(&self) -> u64 {
        self.next_id - 1
    }

    /// [`Engine::start_with`] with this fault injected (`CUA_ENGINE_FAULT`), always on cargo's live build: a shipped
    /// binary has no fault injection, so under `CUA_ENGINE_BIN` the fault would silently not happen.
    pub fn start_with_fault(options: &[&str], fault: &str) -> Engine {
        clear_display_record();
        Engine::spawn_with(&live_build(), options, &[("CUA_ENGINE_FAULT", fault)])
    }

    /// An engine on this X display (`DISPLAY`) in place of the test's own.
    pub fn start_on_display(display: &str) -> Engine {
        let mut command = Command::new(engine_bin());
        command.arg("server").env("DISPLAY", display);
        Engine::spawn_command(command, &engine_bin().display().to_string(), false)
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
        let child = command
            .stderr(if quiet { Stdio::null() } else { Stdio::inherit() })
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap_or_else(|e| panic!("cannot start {what}: {e}"));
        Engine::spawn_child(child)
    }

    fn spawn_child(mut child: Child) -> Engine {
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
            stats: None,
            stats_read: Vec::new(),
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
            stats: None,
            stats_read: Vec::new(),
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

    /// One request's whole answer line, `notice` included when the engine sent one.
    pub fn exchange(&mut self, command: &str, input: Value) -> Value {
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
        answer
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
