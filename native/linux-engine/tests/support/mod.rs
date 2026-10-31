//! What the live tests share: the engine binary as a child speaking the wire, and the display's clean slate.

#![allow(dead_code)]

use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, channel};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// How long one wire request may take before the test gives up on the engine.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub fn engine_bin() -> PathBuf {
    std::env::var_os("CUA_ENGINE_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_BIN_EXE_cua-engine")))
}

/// The engine as a child speaking the wire, killed on drop.
pub struct Engine {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    next_id: u64,
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
        Engine::spawn_with(&[], &[])
    }

    /// An engine started with these options after `server` (`--desktop dedicated`), on a display with no unconfirmed
    /// paste's window open.
    pub fn start_with(options: &[&str]) -> Engine {
        Engine::start_with_env(options, &[])
    }

    /// [`Engine::start_with`] with these variables in the engine's environment (the live build's fault injection).
    pub fn start_with_env(options: &[&str], env: &[(&str, &str)]) -> Engine {
        clear_display_record();
        Engine::spawn_with(options, env)
    }

    fn spawn_with(options: &[&str], env: &[(&str, &str)]) -> Engine {
        let bin = engine_bin();
        let mut child = Command::new(&bin)
            .arg("server")
            .args(options)
            .envs(env.iter().copied())
            // an engine given an injected fault says so on stderr; the test reads its effect, not the message
            .stderr(if env.is_empty() {
                Stdio::inherit()
            } else {
                Stdio::null()
            })
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap_or_else(|e| panic!("cannot start {}: {e}", bin.display()));
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
