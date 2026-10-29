//! The `engine-linux` gate's live test (Verification system, CI): the engine binary over its wire, against a GTK 3
//! text window on a real X server and accessibility bus. It reads the window's tree, sends a background `press_key`
//! and reads its effect back through the tree, and captures a window screenshot whose pixels it checks.
//!
//!   xvfb-run -a dbus-run-session -- cargo test --features live -- --test-threads 1
//!
//! The window is `yad --text-info --editable` (GTK 3). The spec names `zenity --text-info --editable`, but the
//! zenity of Ubuntu 24.04 is 4.x, on GTK 4, which ignores background input (Design, Device mode). `CUA_ENGINE_BIN`
//! names the binary to drive (the release workflow drives the asset it built), else the one Cargo built.

#![cfg(feature = "live")]

use serde_json::{Value, json};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{Receiver, channel};
use std::thread::sleep;
use std::time::{Duration, Instant};

/// How long one wire request may take before the test gives up on the engine.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// How long the window may take to appear, and its tree to reach the accessibility bus.
const APPEAR_TIMEOUT: Duration = Duration::from_secs(20);
/// The text the window opens with: no `q` in it, so the key's effect is exactly one more `q`.
const INITIAL_TEXT: &str = "cua live text";

fn engine_bin() -> PathBuf {
    std::env::var_os("CUA_ENGINE_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_BIN_EXE_cua-engine")))
}

/// The engine as a child speaking the wire, killed on drop.
struct Engine {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: Receiver<String>,
    next_id: u64,
}

impl Engine {
    fn start() -> Engine {
        let bin = engine_bin();
        let mut child = Command::new(&bin)
            .arg("server")
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

    /// One request; the output on success, the error sentence otherwise.
    fn request(&mut self, command: &str, input: Value) -> Result<Value, String> {
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

/// The test's own window and its text file, both gone on drop.
struct Window {
    child: Child,
    file: PathBuf,
    title: String,
}

impl Window {
    fn open() -> Window {
        let title = format!("cua-engine-live-{}", std::process::id());
        let file = std::env::temp_dir().join(format!("{title}.txt"));
        std::fs::write(&file, INITIAL_TEXT).unwrap();
        let child = Command::new("yad")
            .args([
                "--text-info",
                "--editable",
                "--no-buttons",
                "--width=480",
                "--height=320",
            ])
            .arg(format!("--title={title}"))
            .arg(format!("--filename={}", file.display()))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("cannot start yad (apt install yad)");
        Window { child, file, title }
    }
}

impl Drop for Window {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.file);
    }
}

/// Polls `probe` until it returns something or `APPEAR_TIMEOUT` passes.
fn poll<T>(what: &str, mut probe: impl FnMut() -> Option<T>) -> T {
    let deadline = Instant::now() + APPEAR_TIMEOUT;
    loop {
        if let Some(found) = probe() {
            return found;
        }
        assert!(Instant::now() < deadline, "{what} within {APPEAR_TIMEOUT:?}");
        sleep(Duration::from_millis(100));
    }
}

/// The value of the first `text` node, depth first.
fn text_value(node: &Value) -> Option<String> {
    if node["role"] == json!("text")
        && let Some(value) = node["value"].as_str()
    {
        return Some(value.to_string());
    }
    node["children"].as_array()?.iter().find_map(text_value)
}

/// The window's text as its tree reads it, with the tree source checked.
fn read_text(engine: &mut Engine, window: u64) -> Option<String> {
    let state = engine
        .request(
            "get_window_state",
            json!({"window": {"id": window}, "include_screenshot": false}),
        )
        .ok()?;
    if state["ax_tree_source"] != json!("at_spi") {
        return None;
    }
    text_value(&state["ax_tree"])
}

#[test]
fn reads_the_tree_types_in_the_background_and_captures_the_window() {
    let mut engine = Engine::start();
    let window = Window::open();

    // The window, found by its title.
    let listed = poll("the window is listed", || {
        let windows = engine.request("list_windows", json!({})).unwrap();
        windows
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["title"] == json!(window.title))
            .cloned()
    });
    let id = listed["id"].as_u64().unwrap();
    let (width, height) = (listed["width"].as_u64().unwrap(), listed["height"].as_u64().unwrap());

    // The tree read: the text view's contents through AT-SPI.
    let before = poll("the window's text is on the accessibility bus", || {
        read_text(&mut engine, id).filter(|t| t == INITIAL_TEXT)
    });
    assert_eq!(before, INITIAL_TEXT);

    // A background key, its effect read back through the tree: exactly one `q` more, the rest unchanged.
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "q"}))
        .unwrap();
    let after = poll("the key's effect is in the tree", || {
        read_text(&mut engine, id).filter(|t| t != INITIAL_TEXT)
    });
    assert_eq!(after.matches('q').count(), 1, "one q typed: {after:?}");
    assert_eq!(
        after.replacen('q', "", 1),
        INITIAL_TEXT,
        "nothing else changed: {after:?}"
    );

    // A window screenshot: a JPEG of the window's size whose pixels are the window's, not a blank capture.
    let state = engine
        .request(
            "get_window_state",
            json!({"window": {"id": id}, "include_screenshot": true}),
        )
        .unwrap();
    let path = state["screenshots"][0]["filepath"]
        .as_str()
        .expect("a screenshot path")
        .to_string();
    let bytes = std::fs::read(&path).unwrap();
    assert_eq!(&bytes[..2], &[0xFF, 0xD8], "a JPEG");
    let image = image::load_from_memory(&bytes).unwrap().to_luma8();
    assert_eq!((u64::from(image.width()), u64::from(image.height())), (width, height));
    let light = image.pixels().filter(|p| p.0[0] > 128).count();
    let total = (image.width() * image.height()) as usize;
    assert!(
        light * 2 > total,
        "mostly light (a text view), not blank: {light} of {total} pixels light"
    );
}
