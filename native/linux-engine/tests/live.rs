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

/// The test's own window and its text file, both gone on drop.
struct Window {
    child: Child,
    file: PathBuf,
    title: String,
}

impl Window {
    /// A window opened with `text`; `tag` keeps the titles of the test's windows apart.
    fn open(text: &str, tag: &str) -> Window {
        let title = format!("cua-engine-live-{tag}-{}", std::process::id());
        let file = std::env::temp_dir().join(format!("{title}.txt"));
        std::fs::write(&file, text).unwrap();
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

/// A pixel is light above this luma and dark at or below it: every pixel is one or the other.
const LUMA_SPLIT: u8 = 128;
/// The fewest dark pixels the text window's capture may have. The live window (480x320, `INITIAL_TEXT` and one typed
/// `q` in yad's default font) renders 238 of 153600, the same on every run; 100 is under half of that, above a bare
/// caret's few dozen, and far from the 0 of a window drawn without its text.
const MIN_DARK_PIXELS: usize = 100;
/// How far, in pixels, the ink (the dark pixels of either image) is grown before the comparison, so that the ringing
/// JPEG leaves beside a glyph is judged with the glyph.
const INK_MARGIN: u32 = 2;
/// A pixel differs when its luma is off by more than this (the differential harness's, xprobe's, per-channel 32).
const DIFFERS_BY: u8 = 32;
/// The largest share of the ink's pixels that may differ. Measured on the live window: JPEG quality 80 against the
/// window as a second X client reads it differs in 0 of 1152 ink pixels, the same on every run; a second yad window
/// with two letters changed ("pcua live test" for "qcua live text"), whose whole-image mean difference is lost in the
/// empty background, differs in 70 of 1166 (6.0%). 1% (about 12 pixels) is far above the encoding's loss and under
/// that of one wrong letter (about half of the two-letter 6%, by estimate).
const MAX_DIFFERING_SHARE: f64 = 0.01;

/// How many of the ink pixels differ by more than `DIFFERS_BY`, and how many there are: the pixels where either image
/// is dark, grown by `INK_MARGIN`. The empty window around the text is left out, because its agreement would average
/// away a handful of wrong glyphs.
fn ink_difference(a: &image::GrayImage, b: &image::GrayImage) -> (usize, usize) {
    let (width, height) = a.dimensions();
    let mut ink = vec![false; (width * height) as usize];
    for (x, y, pixel) in a.enumerate_pixels() {
        if pixel.0[0] <= LUMA_SPLIT || b.get_pixel(x, y).0[0] <= LUMA_SPLIT {
            for yy in y.saturating_sub(INK_MARGIN)..=(y + INK_MARGIN).min(height - 1) {
                for xx in x.saturating_sub(INK_MARGIN)..=(x + INK_MARGIN).min(width - 1) {
                    ink[(yy * width + xx) as usize] = true;
                }
            }
        }
    }
    let mut counted = 0;
    let mut differing = 0;
    for (x, y, pixel) in a.enumerate_pixels() {
        if ink[(y * width + x) as usize] {
            counted += 1;
            if pixel.0[0].abs_diff(b.get_pixel(x, y).0[0]) > DIFFERS_BY {
                differing += 1;
            }
        }
    }
    (differing, counted)
}

/// Whether the engine's capture is the window: the size of the reference (the window read by another X client), mostly
/// light (a text view's background, which a black capture is not) with dark glyphs on it (which a uniformly white
/// capture has none of), and the reference's own glyphs where the ink is, JPEG's loss aside (which a capture of other
/// text is not).
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
    let (differing, counted) = ink_difference(shot, reference);
    let share = differing as f64 / counted as f64;
    if share > MAX_DIFFERING_SHARE {
        return Err(format!(
            "{differing} of the {counted} ink pixels differ from the window ({share:.3}), at most {MAX_DIFFERING_SHARE} allowed"
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
fn a_capture_of_text_with_two_letters_changed_fails() {
    // Two glyphs of fourteen lose their right stroke and bar: the capture is as light, has nearly as much ink, and
    // differs from the window by a fraction of a percent of its pixels, as a near-identical text does.
    let window = text_view(10, 10);
    let mut wrong = window.clone();
    for glyph in [3, 9] {
        let x = 10 + glyph * 8;
        for y in 10..20 {
            for dx in 1..=4 {
                wrong.put_pixel(x + dx, y, image::Luma([255]));
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

    // A window screenshot: a JPEG of the window's size whose pixels are the window's, not a blank capture.
    let image = capture_luma(&mut engine, id);
    assert_eq!((u64::from(image.width()), u64::from(image.height())), (width, height));
    let reference = read_window_luma(id as u32);
    if let Err(why) = judge_screenshot(&image, &reference) {
        panic!("the screenshot is not the text window: {why}");
    }

    // Another window of the same size and kind whose text differs by two letters ("pcua live test" for "qcua live
    // text"), typed into the same way. Its capture is light, has as much ink, and is within a hair of the first
    // window's average; it is still not the first window's.
    let other = Window::open("cua live test", "b");
    let other_id = poll("the second window is listed", || {
        let windows = engine.request("list_windows", json!({})).unwrap();
        windows
            .as_array()
            .unwrap()
            .iter()
            .find(|w| w["title"] == json!(other.title))
            .and_then(|w| w["id"].as_u64())
    });
    poll("the second window's text is on the accessibility bus", || {
        read_text(&mut engine, other_id).filter(|t| t == "cua live test")
    });
    engine
        .request("press_key", json!({"window": {"id": other_id}, "key": "p"}))
        .unwrap();
    poll("the second window's key is in the tree", || {
        read_text(&mut engine, other_id).filter(|t| t.contains('p'))
    });
    let wrong = capture_luma(&mut engine, other_id);
    let refused = judge_screenshot(&wrong, &reference);
    assert!(
        refused.is_err(),
        "another window's text is not the first window's: {refused:?}"
    );
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
