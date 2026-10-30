//! The `engine-linux` gate's live test (Verification system, CI): the engine binary over its wire, against a GTK 3
//! text window on a real X server and accessibility bus. It reads the window's tree, sends a background `press_key`
//! and reads its effect back through the tree, and captures a window screenshot, which it judges against the window as
//! a second X client reads it (`judge_screenshot`).
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

/// The test's own window, its text file and its GTK settings, all gone on drop.
struct Window {
    child: Child,
    file: PathBuf,
    config: PathBuf,
    title: String,
}

impl Window {
    /// A window opened with `text`; `tag` keeps the titles of the test's windows apart.
    fn open(text: &str, tag: &str) -> Window {
        Window::open_with(text, tag, &["--text-info", "--editable", "--no-buttons"])
    }

    /// A yad window of this dialog and options; a `--text-info` one shows `text`.
    fn open_with(text: &str, tag: &str, dialog: &[&str]) -> Window {
        let title = format!("cua-engine-live-{tag}-{}", std::process::id());
        let file = std::env::temp_dir().join(format!("{title}.txt"));
        std::fs::write(&file, text).unwrap();
        // A steady caret: a blinking one would be drawn in one read of the window and not in the next, a caret's
        // height of pixels (about 17) differing that no text produced, and the reference would never settle.
        let config = std::env::temp_dir().join(format!("{title}-config"));
        std::fs::create_dir_all(config.join("gtk-3.0")).unwrap();
        std::fs::write(
            config.join("gtk-3.0/settings.ini"),
            "[Settings]\ngtk-cursor-blink=false\n",
        )
        .unwrap();
        let child = Command::new("yad")
            .env("XDG_CONFIG_HOME", &config)
            .args(dialog)
            .args(["--width=480", "--height=320"])
            .arg(format!("--title={title}"))
            .args(
                dialog
                    .contains(&"--text-info")
                    .then(|| format!("--filename={}", file.display())),
            )
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("cannot start yad (apt install yad)");
        Window {
            child,
            file,
            config,
            title,
        }
    }
}

impl Drop for Window {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.file);
        let _ = std::fs::remove_dir_all(&self.config);
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

/// A pixel is light above this luma and dark at or below it: every pixel is one or the other.
const LUMA_SPLIT: u8 = 128;
/// The fewest dark pixels the text window's capture may have. The live window (480x320, `INITIAL_TEXT` and one typed
/// `q` in yad's default font) renders 238 of 153600, the same on every run; 100 is under half of that, above a bare
/// caret's few dozen, and far from the 0 of a window drawn without its text.
const MIN_DARK_PIXELS: usize = 100;
/// A pixel differs when its luma is off by more than this (the differential harness's, xprobe's, per-channel 32).
const DIFFERS_BY: u8 = 32;
/// The most pixels, of the whole image, that may differ from the reference. A count over the whole image, not a share
/// of the ink: a share lets a glyph through and cannot see the background. A correct capture differs in 0 pixels on the
/// VM and 1 on the CI runner (nine captures over three gate runs), once the reference is read after the window has
/// stopped drawing. A window with one glyph changed ("qcua live test" for "qcua live text") differs in 32 on the VM
/// and 79 on the runner, and one with its final glyph missing (the stale frame of a capture taken before the key's
/// effect rendered) in 26 and 24 to 40. 8 is eight times the noise and under a third of the smallest change.
const MAX_DIFFERING_PIXELS: usize = 8;

/// How many pixels differ by more than `DIFFERS_BY`, over the whole image: the background is judged as the text is.
fn differing_pixels(a: &image::GrayImage, b: &image::GrayImage) -> usize {
    a.pixels()
        .zip(b.pixels())
        .filter(|(x, y)| x.0[0].abs_diff(y.0[0]) > DIFFERS_BY)
        .count()
}

/// Whether the engine's capture is the window: the size of the reference (the window read by another X client), mostly
/// light (a text view's background, which a black capture is not) with dark glyphs on it (which a uniformly white
/// capture has none of), and the reference's own pixels all over, JPEG's loss aside (which a capture of other text,
/// or of a stale frame, or with a changed background, is not).
fn judge_screenshot(shot: &image::GrayImage, reference: &image::GrayImage) -> Result<(), String> {
    if shot.dimensions() != reference.dimensions() {
        return Err(format!(
            "size {:?}, the window's is {:?}",
            shot.dimensions(),
            reference.dimensions()
        ));
    }
    let total = shot.pixels().len();
    let light = shot.pixels().filter(|p| p.0[0] > LUMA_SPLIT).count();
    let dark = total - light;
    if light * 2 <= total {
        return Err(format!("not mostly light: {light} of {total} pixels light"));
    }
    if dark < MIN_DARK_PIXELS {
        return Err(format!(
            "no text on it: {dark} dark pixels of {total}, at least {MIN_DARK_PIXELS} wanted"
        ));
    }
    let differing = differing_pixels(shot, reference);
    if differing > MAX_DIFFERING_PIXELS {
        return Err(format!(
            "{differing} pixels differ from the window, at most {MAX_DIFFERING_PIXELS} allowed"
        ));
    }
    Ok(())
}

/// The window's pixels as a second X client reads them: its own connection and `GetImage`, nothing of the engine's.
fn read_window_luma(window: u32) -> image::GrayImage {
    use x11rb::protocol::xproto::{ConnectionExt, ImageFormat};
    let (conn, _) = x11rb::connect(None).expect("an X connection for the reference");
    let geometry = conn.get_geometry(window).unwrap().reply().unwrap();
    let (width, height) = (u32::from(geometry.width), u32::from(geometry.height));
    let reply = conn
        .get_image(ImageFormat::Z_PIXMAP, window, 0, 0, geometry.width, geometry.height, !0)
        .unwrap()
        .reply()
        .unwrap();
    // B, G, R, X per pixel, as the 24-bit visual lays them out; Rec. 601 luma, as `image` converts.
    let luma = reply
        .data
        .chunks_exact(4)
        .map(|px| ((u32::from(px[2]) * 299 + u32::from(px[1]) * 587 + u32::from(px[0]) * 114) / 1000) as u8)
        .collect();
    image::GrayImage::from_raw(width, height, luma).expect("a full image")
}

/// The window's pixels once they have stopped changing: two reads 100 ms apart agree exactly. The window goes on
/// drawing for a moment after its text changes (its caret comes up: 17 pixels, seen on the VM), and a reference read in
/// that moment is out of date, which is not the engine's error.
fn settled_window_luma(window: u32) -> image::GrayImage {
    let mut last = read_window_luma(window);
    poll("the window stops changing", || {
        sleep(Duration::from_millis(100));
        let now = read_window_luma(window);
        if now == last {
            return Some(now);
        }
        last = now;
        None
    })
}

/// A light view with a line of text-like glyphs (thin strokes, as small text is) of about the live window's weight.
fn text_view(top: u32, left: u32) -> image::GrayImage {
    let mut view = image::GrayImage::from_pixel(480, 320, image::Luma([255]));
    for glyph in 0..14 {
        let x = left + glyph * 8;
        for y in top..top + 10 {
            view.put_pixel(x, y, image::Luma([30]));
            view.put_pixel(x + 4, y, image::Luma([30]));
        }
        for dx in 0..5 {
            view.put_pixel(x + dx, top + 5, image::Luma([30]));
        }
    }
    view
}

/// The image as the engine hands it over: JPEG at quality 80, decoded.
fn through_jpeg(view: &image::GrayImage) -> image::GrayImage {
    let mut bytes = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 80)
        .encode(view.as_raw(), view.width(), view.height(), image::ExtendedColorType::L8)
        .unwrap();
    image::load_from_memory(&bytes).unwrap().to_luma8()
}

#[test]
fn a_capture_of_the_windows_content_passes() {
    let window = text_view(10, 10);
    assert_eq!(judge_screenshot(&through_jpeg(&window), &window), Ok(()));
}

#[test]
fn a_uniformly_white_capture_fails() {
    let window = text_view(10, 10);
    let white = image::GrayImage::from_pixel(480, 320, image::Luma([255]));
    assert!(judge_screenshot(&white, &window).is_err());
}

#[test]
fn a_uniformly_black_capture_fails() {
    let window = text_view(10, 10);
    let black = image::GrayImage::from_pixel(480, 320, image::Luma([0]));
    assert!(judge_screenshot(&black, &window).is_err());
}

#[test]
fn a_light_capture_of_other_content_fails() {
    let window = text_view(10, 10);
    // The same text a pixel to the right, and a line of it lower down: each is light with dark glyphs, and not the window.
    assert!(judge_screenshot(&through_jpeg(&text_view(10, 11)), &window).is_err());
    assert!(judge_screenshot(&through_jpeg(&text_view(40, 10)), &window).is_err());
}

#[test]
fn a_capture_of_text_with_a_few_letters_changed_fails() {
    // Three glyphs of fourteen become solid blocks: the capture is as light, has about as much ink, and differs from
    // the window in a few percent of the ink, as a near-identical text does, while a whole-image mean would let it by.
    let window = text_view(10, 10);
    let mut wrong = window.clone();
    for glyph in [3, 6, 9] {
        let x = 10 + glyph * 8;
        for y in 10..20 {
            for dx in 0..=4 {
                wrong.put_pixel(x + dx, y, image::Luma([30]));
            }
        }
    }
    let sum: u64 = wrong
        .pixels()
        .zip(window.pixels())
        .map(|(a, b)| u64::from(a.0[0].abs_diff(b.0[0])))
        .sum();
    assert!(
        sum as f64 / (480.0 * 320.0) < 0.25,
        "a whole-image mean would let it by"
    );
    assert!(judge_screenshot(&through_jpeg(&wrong), &window).is_err());
}

#[test]
fn a_capture_with_one_glyph_changed_fails() {
    // The fifth glyph becomes a solid block: the typed character of a stale frame, or its absence, is one glyph.
    let window = text_view(10, 10);
    let mut wrong = window.clone();
    for y in 10..20 {
        for dx in 0..=4 {
            wrong.put_pixel(10 + 5 * 8 + dx, y, image::Luma([30]));
        }
    }
    assert!(judge_screenshot(&through_jpeg(&window), &window).is_ok());
    assert!(judge_screenshot(&through_jpeg(&wrong), &window).is_err());
}

#[test]
fn a_capture_missing_the_final_glyph_fails() {
    let window = text_view(10, 10);
    let mut wrong = window.clone();
    for y in 10..20 {
        for dx in 0..=4 {
            wrong.put_pixel(10 + 13 * 8 + dx, y, image::Luma([255]));
        }
    }
    assert!(judge_screenshot(&through_jpeg(&wrong), &window).is_err());
}

#[test]
fn a_capture_with_half_its_background_off_white_fails() {
    // The bottom half is luma 180 for the window's 255: still light, with all the window's ink, and nothing in it
    // that a count over the ink would see.
    let window = text_view(10, 10);
    let mut wrong = window.clone();
    for y in 160..320 {
        for x in 0..480 {
            wrong.put_pixel(x, y, image::Luma([180]));
        }
    }
    assert!(judge_screenshot(&through_jpeg(&wrong), &window).is_err());
}

#[test]
fn a_capture_of_another_size_fails() {
    let window = text_view(10, 10);
    let cropped = image::imageops::crop_imm(&window, 0, 0, 480, 300).to_image();
    assert!(judge_screenshot(&cropped, &window).is_err());
}

#[test]
fn a_caret_alone_is_not_text() {
    let mut caret = image::GrayImage::from_pixel(480, 320, image::Luma([255]));
    for y in 10..25 {
        caret.put_pixel(10, y, image::Luma([0]));
    }
    assert!(judge_screenshot(&caret, &caret).is_err());
}

#[test]
fn reads_the_tree_types_in_the_background_and_captures_the_window() {
    let mut engine = Engine::start();
    let window = Window::open(INITIAL_TEXT, "a");

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

    // A window screenshot: a JPEG of the window's size whose pixels are the window's, not a blank capture. Taken
    // several times: the differing-pixel count of a correct capture is the noise the limit stands above.
    let reference = settled_window_luma(id as u32);
    for _ in 0..3 {
        let image = capture_luma(&mut engine, id);
        assert_eq!((u64::from(image.width()), u64::from(image.height())), (width, height));
        say(&format!(
            "the window's capture: {} pixels differ from the window",
            differing_pixels(&image, &reference)
        ));
        if let Err(why) = judge_screenshot(&image, &reference) {
            panic!("the screenshot is not the text window: {why}");
        }
        sleep(Duration::from_millis(200));
    }

    // Other windows of the same size and kind, whose captures are light, have as much ink, and are the first
    // window's but for one or two glyphs: a stale frame is the first window's with its last typed glyph missing.
    // Each must be refused.
    for (text, key) in [
        ("cua live test", "p"), // "pcua live test" for "qcua live text": two glyphs
        ("cua live test", "q"), // "qcua live test": one glyph
        ("cua live tex", "q"),  // "qcua live tex": the final glyph missing
    ] {
        let other = Window::open(text, "b");
        let other_id = poll("the other window is listed", || {
            let windows = engine.request("list_windows", json!({})).unwrap();
            windows
                .as_array()
                .unwrap()
                .iter()
                .find(|w| w["title"] == json!(other.title))
                .and_then(|w| w["id"].as_u64())
        });
        poll("the other window's text is on the accessibility bus", || {
            read_text(&mut engine, other_id).filter(|t| t == text)
        });
        engine
            .request("press_key", json!({"window": {"id": other_id}, "key": key}))
            .unwrap();
        poll("the other window's key is in the tree", || {
            read_text(&mut engine, other_id).filter(|t| t != text)
        });
        let wrong = capture_luma(&mut engine, other_id);
        say(&format!(
            "{key}{text:?} against the window: {} pixels differ",
            differing_pixels(&wrong, &reference)
        ));
        let refused = judge_screenshot(&wrong, &reference);
        assert!(
            refused.is_err(),
            "{key}{text:?} is not the first window's text: {refused:?}"
        );
    }
}

/// A line on stderr that the test harness does not hold back with a passing test: the gate's log shows the counts.
fn say(line: &str) {
    let _ = writeln!(std::io::stderr(), "live: {line}");
}

/// The engine's window screenshot, decoded to luma, with the file checked to be a JPEG.
fn capture_luma(engine: &mut Engine, id: u64) -> image::GrayImage {
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
    image::load_from_memory(&bytes).unwrap().to_luma8()
}

/// Whether the first `text` node, depth first, has the `focused` state.
fn text_is_focused(node: &Value) -> bool {
    if node["role"] == json!("text") {
        return node["states"].as_array().is_some_and(|s| s.contains(&json!("focused")));
    }
    node["children"]
        .as_array()
        .is_some_and(|c| c.iter().any(text_is_focused))
}

/// CLIPBOARD's `UTF8_STRING` as another X client reads it (no INCR: the test's text is small).
fn read_clipboard_text() -> Option<String> {
    use x11rb::connection::Connection;
    use x11rb::protocol::Event;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt, CreateWindowAux, EventMask, WindowClass};
    let (conn, screen) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots[screen].root;
    let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).unwrap().reply().unwrap().atom;
    let (clipboard, utf8, property) = (atom("CLIPBOARD"), atom("UTF8_STRING"), atom("CUA_LIVE_PROPERTY"));
    let window = conn.generate_id().ok()?;
    let aux = CreateWindowAux::new().event_mask(EventMask::PROPERTY_CHANGE);
    conn.create_window(0, window, root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)
        .ok()?;
    conn.convert_selection(window, clipboard, utf8, property, x11rb::CURRENT_TIME)
        .ok()?;
    conn.flush().ok()?;
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline {
        match conn.poll_for_event().ok()? {
            Some(Event::SelectionNotify(e)) if e.requestor == window => {
                if e.property == x11rb::NONE {
                    return None;
                }
                let reply = conn
                    .get_property(true, window, property, AtomEnum::ANY, 0, 1 << 20)
                    .ok()?
                    .reply()
                    .ok()?;
                return String::from_utf8(reply.value).ok();
            }
            Some(_) => {}
            None => sleep(Duration::from_millis(5)),
        }
    }
    None
}

#[test]
fn clipboard_read_copies_the_selection_under_a_handle_and_release_frees_it() {
    const TEXT: &str = "cua clipboard 안녕 e\u{301} 🙂";
    let mut engine = Engine::start();
    let window = Window::open(TEXT, "c");
    let id = poll("the window is listed", || {
        let windows = engine.request("list_windows", json!({})).unwrap();
        windows
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["title"] == json!(window.title))
            .and_then(|w| w["id"].as_u64())
    });
    poll("the window's text is on the accessibility bus", || {
        read_text(&mut engine, id).filter(|t| t == TEXT)
    });
    let target = json!({"window": {"id": id}});

    // Copy goes through the window's focused element, and a GTK 3 window that has never had the input focus has
    // none (on the CI runner the window can come up unfocused). The test's own display: activate it, and wait for
    // its text view to report the focus.
    engine.request("activate_window", target.clone()).unwrap();
    poll("the text view has the focus", || {
        let state = engine
            .request(
                "get_window_state",
                json!({"window": {"id": id}, "include_screenshot": false}),
            )
            .ok()?;
        text_is_focused(&state["ax_tree"]).then_some(())
    });

    // Nothing selected: the application has nothing to Copy, and no handle is made.
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+End"}))
        .unwrap();
    assert_eq!(
        engine.request("clipboard_read", target.clone()),
        Err("editable element has no selected text to Copy".to_string())
    );

    // Everything selected: the application's Copy, its contents under a handle, and its copy left on CLIPBOARD.
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+a"}))
        .unwrap();
    let handle = engine.request("clipboard_read", target.clone()).unwrap();
    let handle = handle.as_str().expect("a handle string").to_string();
    let parts: Vec<&str> = handle.split('-').collect();
    assert_eq!(parts.len(), 3, "<pid>-<nanoseconds>-<n>: {handle}");
    assert_eq!(parts[2], "1");
    assert_eq!(
        read_clipboard_text().as_deref(),
        Some(TEXT),
        "the application's copy stays on CLIPBOARD"
    );
    let second = engine.request("clipboard_read", target).unwrap();
    assert!(second.as_str().unwrap().ends_with("-2"), "{second}");

    // Release, twice: the second is no error either.
    for _ in 0..2 {
        assert_eq!(
            engine.request("clipboard_release", json!({"handle": handle})),
            Ok(Value::Null)
        );
    }
    assert_eq!(
        engine.request("clipboard_release", json!({"handle": "unknown"})),
        Ok(Value::Null)
    );
}

/// A window of `text`, listed, its text on the bus, activated on the test's own display and its text view focused:
/// the paste's target is the window's focused element.
fn focused_window(engine: &mut Engine, window: Window, text: &str) -> (Window, u64) {
    let id = poll("the window is listed", || {
        let windows = engine.request("list_windows", json!({})).unwrap();
        windows
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["title"] == json!(window.title))
            .and_then(|w| w["id"].as_u64())
    });
    poll("the window's text is on the accessibility bus", || {
        read_text(engine, id).filter(|t| t == text)
    });
    engine
        .request("activate_window", json!({"window": {"id": id}}))
        .unwrap();
    poll("the text view has the focus", || {
        let state = engine
            .request(
                "get_window_state",
                json!({"window": {"id": id}, "include_screenshot": false}),
            )
            .ok()?;
        text_is_focused(&state["ax_tree"]).then_some(())
    });
    (window, id)
}

/// Another program's clipboard: an X client owning CLIPBOARD and serving `text` as `UTF8_STRING` from its own thread,
/// until dropped.
struct PriorOwner {
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl PriorOwner {
    fn start(text: &'static str) -> PriorOwner {
        use x11rb::connection::Connection;
        use x11rb::protocol::Event;
        use x11rb::protocol::xproto::*;
        use x11rb::wrapper::ConnectionExt as _;
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).unwrap().reply().unwrap().atom;
        let (clipboard, utf8, targets) = (atom("CLIPBOARD"), atom("UTF8_STRING"), atom("TARGETS"));
        let window = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new();
        conn.create_window(0, window, root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)
            .unwrap();
        conn.set_selection_owner(window, clipboard, x11rb::CURRENT_TIME)
            .unwrap();
        assert_eq!(
            conn.get_selection_owner(clipboard).unwrap().reply().unwrap().owner,
            window,
            "the prior owner holds CLIPBOARD"
        );
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stopping = stop.clone();
        let thread = std::thread::spawn(move || {
            while !stopping.load(std::sync::atomic::Ordering::SeqCst) {
                let Ok(event) = conn.poll_for_event() else { return };
                let Some(Event::SelectionRequest(e)) = event else {
                    sleep(Duration::from_millis(2));
                    continue;
                };
                let property = if e.property == x11rb::NONE {
                    e.target
                } else {
                    e.property
                };
                let answered = if e.target == targets {
                    conn.change_property32(
                        PropMode::REPLACE,
                        e.requestor,
                        property,
                        AtomEnum::ATOM,
                        &[targets, utf8],
                    )
                    .is_ok()
                } else if e.target == utf8 {
                    conn.change_property8(PropMode::REPLACE, e.requestor, property, utf8, text.as_bytes())
                        .is_ok()
                } else {
                    false
                };
                let notify = SelectionNotifyEvent {
                    response_type: SELECTION_NOTIFY_EVENT,
                    sequence: 0,
                    time: e.time,
                    requestor: e.requestor,
                    selection: e.selection,
                    target: e.target,
                    property: if answered { property } else { x11rb::NONE },
                };
                let _ = conn.send_event(false, e.requestor, EventMask::NO_EVENT, notify);
                let _ = conn.flush();
            }
        });
        PriorOwner {
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for PriorOwner {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[test]
fn type_text_pastes_unicode_text_once_at_the_caret_and_restores_the_clipboard() {
    const TEXT: &str = "cua171 안녕 e\u{301} 🙂\nline2";
    let mut engine = Engine::start();
    let (_window, id) = focused_window(&mut engine, Window::open(INITIAL_TEXT, "t"), INITIAL_TEXT);
    let target = json!({"window": {"id": id}});
    let _prior = PriorOwner::start("the person's clipboard");

    // At the end of the text: the paste lands there, once, and answers success.
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+End"}))
        .unwrap();
    let started = Instant::now();
    assert_eq!(
        engine.request("type_text", json!({"window": {"id": id}, "text": TEXT})),
        Ok(Value::Null),
        "the paste is confirmed"
    );
    say(&format!("type_text answered in {:?}", started.elapsed()));
    let expected = format!("{INITIAL_TEXT}{TEXT}");
    assert_eq!(
        read_text(&mut engine, id).as_deref(),
        Some(expected.as_str()),
        "exactly once, exactly"
    );
    assert_eq!(
        read_clipboard_text().as_deref(),
        Some("the person's clipboard"),
        "the clipboard is what it was before"
    );

    // A preselected range is replaced by the text.
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+a"}))
        .unwrap();
    assert_eq!(
        engine.request("type_text", json!({"window": {"id": id}, "text": "replaced 🙂"})),
        Ok(Value::Null)
    );
    assert_eq!(read_text(&mut engine, id).as_deref(), Some("replaced 🙂"));
    assert_eq!(read_clipboard_text().as_deref(), Some("the person's clipboard"));

    // Text the clipboard cannot hold is refused before anything is sent.
    let long = "x".repeat(64 * 1024 * 1024 + 1);
    let mut input = target;
    input["text"] = json!(long);
    assert_eq!(
        engine.request("type_text", input),
        Err("clipboard text exceeds byte limit".to_string())
    );
    assert_eq!(read_text(&mut engine, id).as_deref(), Some("replaced 🙂"));
}

#[test]
fn clipboard_write_pastes_a_snapshot_that_reads_back_exactly() {
    const TEXT: &str = "cua write 안녕 e\u{301} 🙂";
    let mut engine = Engine::start();
    let (_window, id) = focused_window(&mut engine, Window::open(TEXT, "w"), TEXT);
    let target = json!({"window": {"id": id}});
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+a"}))
        .unwrap();
    let handle = engine.request("clipboard_read", target).unwrap();
    let _prior = PriorOwner::start("taken after the copy");
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+End"}))
        .unwrap();
    assert_eq!(
        engine.request("clipboard_write", json!({"window": {"id": id}, "handle": handle})),
        Ok(Value::Null),
        "the paste of the snapshot is confirmed"
    );
    let doubled = format!("{TEXT}{TEXT}");
    assert_eq!(read_text(&mut engine, id).as_deref(), Some(doubled.as_str()));
    assert_eq!(
        read_clipboard_text().as_deref(),
        Some("taken after the copy"),
        "the cleanup leaves the clipboard as it was before the write"
    );
    assert_eq!(
        engine.request(
            "clipboard_write",
            json!({"window": {"id": id}, "handle": "no-such-handle"})
        ),
        Err("unknown clipboard handle; copy again in this Linux helper".to_string())
    );
}

/// The native id of the first `text` node, depth first, and whether it has the focus.
fn text_node(node: &Value) -> Option<(String, bool)> {
    if node["role"] == json!("text") {
        let focused = node["states"].as_array().is_some_and(|s| s.contains(&json!("focused")));
        return Some((node["id"].as_str()?.to_string(), focused));
    }
    node["children"].as_array()?.iter().find_map(text_node)
}

fn window_text_node(engine: &mut Engine, id: u64) -> Option<(String, bool)> {
    let state = engine
        .request(
            "get_window_state",
            json!({"window": {"id": id}, "include_screenshot": false}),
        )
        .ok()?;
    text_node(&state["ax_tree"])
}

#[test]
fn a_named_element_without_the_focus_is_clicked_and_the_text_lands_at_its_own_caret() {
    const TEXT: &str = "0123456789";
    let mut engine = Engine::start();
    // With its buttons, so the focus has somewhere else to go in the window.
    let window = Window::open_with(TEXT, "e", &["--text-info", "--editable"]);
    let (_window, id) = focused_window(&mut engine, window, TEXT);
    let key = |engine: &mut Engine, key: &str| {
        engine
            .request("press_key", json!({"window": {"id": id}, "key": key}))
            .unwrap();
    };
    // The caret placed after "0123", then the focus moved to the window's buttons.
    key(&mut engine, "ctrl+Home");
    for _ in 0..4 {
        key(&mut engine, "Right");
    }
    key(&mut engine, "ctrl+Tab");
    let (element, _) = poll("the text view has lost the focus", || {
        window_text_node(&mut engine, id).filter(|(_, focused)| !focused)
    });
    assert_eq!(
        engine.request(
            "type_text",
            json!({"window": {"id": id}, "element_id": element, "text": "ABC"})
        ),
        Ok(Value::Null)
    );
    assert_eq!(
        read_text(&mut engine, id).as_deref(),
        Some("0123ABC456789"),
        "at the caret the element had, not where the focusing click fell"
    );
    assert!(window_text_node(&mut engine, id).is_some_and(|(_, focused)| focused));
}

/// A clipboard manager: on every change of CLIPBOARD's owner it reads `UTF8_STRING` in full, as any XFixes watcher
/// may. What it read, in order.
struct Watcher {
    read: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl Watcher {
    fn start() -> Watcher {
        use x11rb::connection::Connection;
        use x11rb::protocol::Event;
        use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
        use x11rb::protocol::xproto::*;
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).unwrap().reply().unwrap().atom;
        let (clipboard, utf8, property) = (atom("CLIPBOARD"), atom("UTF8_STRING"), atom("CUA_LIVE_WATCHER"));
        conn.xfixes_query_version(1, 0).unwrap().reply().unwrap();
        let window = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new().event_mask(EventMask::PROPERTY_CHANGE);
        conn.create_window(0, window, root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)
            .unwrap();
        conn.xfixes_select_selection_input(window, clipboard, SelectionEventMask::SET_SELECTION_OWNER)
            .unwrap();
        conn.flush().unwrap();
        let read = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let (reading, stopping) = (read.clone(), stop.clone());
        let thread = std::thread::spawn(move || {
            while !stopping.load(std::sync::atomic::Ordering::SeqCst) {
                let Ok(event) = conn.poll_for_event() else { return };
                match event {
                    Some(Event::XfixesSelectionNotify(e)) if e.owner != x11rb::NONE => {
                        let _ = conn.convert_selection(window, clipboard, utf8, property, x11rb::CURRENT_TIME);
                        let _ = conn.flush();
                    }
                    Some(Event::SelectionNotify(e)) if e.property != x11rb::NONE => {
                        if let Ok(reply) = conn
                            .get_property(true, window, property, AtomEnum::ANY, 0, 1 << 20)
                            .unwrap()
                            .reply()
                        {
                            reading
                                .lock()
                                .unwrap()
                                .push(String::from_utf8_lossy(&reply.value).into_owned());
                        }
                    }
                    Some(_) => {}
                    None => sleep(Duration::from_millis(2)),
                }
            }
        });
        Watcher {
            read,
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for Watcher {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[test]
fn a_third_client_reading_the_paste_neither_starts_nor_completes_it() {
    let mut engine = Engine::start();
    // A list, whose application never converts CLIPBOARD on Ctrl+V: the paste's target never asks for it.
    let window = Window::open_with("", "r", &["--list", "--column=item", "one", "two", "--no-buttons"]);
    let id = poll("the window is listed", || {
        let windows = engine.request("list_windows", json!({})).unwrap();
        windows
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["title"] == json!(window.title))
            .and_then(|w| w["id"].as_u64())
    });
    engine
        .request("activate_window", json!({"window": {"id": id}}))
        .unwrap();
    poll("an element of the window has the focus", || {
        let state = engine
            .request(
                "get_window_state",
                json!({"window": {"id": id}, "include_screenshot": false}),
            )
            .ok()?;
        state["ax_tree"].to_string().contains(r#""focused""#).then_some(())
    });
    let watcher = Watcher::start();
    let _prior = PriorOwner::start("before the paste");
    let started = Instant::now();
    assert_eq!(
        engine.request("type_text", json!({"window": {"id": id}, "text": "never pasted"})),
        Err("Paste was sent once and could not be confirmed; read the field before retrying".to_string()),
        "sent once, and never confirmed"
    );
    say(&format!("the unconfirmed answer came in {:?}", started.elapsed()));
    assert!(
        watcher.read.lock().unwrap().iter().any(|t| t == "never pasted"),
        "the watcher read the paste in full: {:?}",
        watcher.read.lock().unwrap()
    );
    // The target's late conversion at CurrentTime gets nothing, neither the paste nor the restored clipboard.
    assert_eq!(
        read_clipboard_text(),
        None,
        "a CurrentTime conversion is refused in the window"
    );
    // Nor does the next paste go out while the window runs.
    let refused = engine
        .request("type_text", json!({"window": {"id": id}, "text": "next"}))
        .unwrap_err();
    assert!(
        refused.starts_with(
            "a previous paste could not be confirmed and may still be read; nothing was sent; retry after "
        ) && refused.ends_with(" s"),
        "{refused}"
    );
    drop(watcher);
}

#[test]
fn a_windowless_type_text_pastes_into_the_focused_window_through_the_six_steps() {
    const TEXT: &str = "abc";
    let mut engine = Engine::start();
    let (_window, id) = focused_window(&mut engine, Window::open(TEXT, "d"), TEXT);
    let _prior = PriorOwner::start("the clipboard before");
    engine
        .request("press_key", json!({"window": {"id": id}, "key": "ctrl+End"}))
        .unwrap();
    // No window: desktop input into the window holding the X input focus, confirmed there.
    assert_eq!(
        engine.request("type_text", json!({"text": " 안녕 🙂"})),
        Ok(Value::Null)
    );
    assert_eq!(read_text(&mut engine, id).as_deref(), Some("abc 안녕 🙂"));
    assert_eq!(read_clipboard_text().as_deref(), Some("the clipboard before"));
}

#[test]
fn type_characters_types_the_layout_s_characters_and_refuses_the_rest_before_typing() {
    const TEXT: &str = "start";
    let mut engine = Engine::start();
    let (_window, id) = focused_window(&mut engine, Window::open(TEXT, "k"), TEXT);
    let target = json!({"id": id});
    engine
        .request("press_key", json!({"window": target, "key": "ctrl+End"}))
        .unwrap();
    assert_eq!(
        engine.request("type_characters", json!({"window": target, "text": " AbZ09!?"})),
        Ok(json!(8)),
        "the number of characters sent"
    );
    poll("the characters are in the text", || {
        read_text(&mut engine, id).filter(|t| t == "start AbZ09!?")
    });
    // A character off the layout refuses the whole text: nothing of it is typed.
    assert_eq!(
        engine.request("type_characters", json!({"window": target, "text": "ok é"})),
        Err("Character 'é' is not on the keyboard layout".to_string())
    );
    assert_eq!(
        engine.request("type_characters", json!({"window": target, "text": "a\nb"})),
        Err("Character '\\n' is not on the keyboard layout".to_string())
    );
    assert_eq!(
        engine.request("type_characters", json!({"window": target, "text": ""})),
        Ok(json!(0))
    );
    sleep(Duration::from_millis(300));
    assert_eq!(read_text(&mut engine, id).as_deref(), Some("start AbZ09!?"));
    assert!(
        engine
            .request("type_characters", json!({"text": "x"}))
            .unwrap_err()
            .contains("missing field `window`"),
        "a window is required"
    );
}
