//! The differential harness's own X client (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
//! Verification system). It is never an engine and never sends input.
//!
//! - `xprobe witness`: watches the desktop state an engine must leave alone. It selects `PropertyNotify` on the
//!   root for `_NET_ACTIVE_WINDOW` and `_NET_CLIENT_LIST_STACKING` and samples the input focus and the pointer
//!   every 5 ms; with `SubstructureNotify` on the root it records every restack, map and unmap of a root child in
//!   order (`restack.rs`). Lines on stdin `begin <tag>` and `end <tag>` delimit a span; at `end` it prints one JSON
//!   line with every change seen in the span, the root's children when it began (`tree`) and those events
//!   (`restacks`); with `FocusChange` on the root and every root child it records every focus transition and every
//!   `_NET_ACTIVE_WINDOW` activation request (`focus.rs`, `focus`).
//! - `xprobe retention <window> [trials] [span-ms] [gap-ms] [dump-prefix]`: redirects the window through Composite, captures it
//!   with `GetImage` as fast as it can for the span, unredirects, and prints one JSON line per trial with the
//!   moments the captured contents changed (a hash of the colour bytes and the black fraction, never pixels).
//! - `xprobe imgdiff <a.jpg> <b.jpg> [mask-top-rows]`: sizes, mean absolute difference and differing pixels of two
//!   JPEGs below their top rows.
//! - `xprobe close <window>`: asks the window's client to close it (`WM_DELETE_WINDOW`), for harness-owned windows.
//! - `xprobe record <x> <y> <width> <height> [focus]`: a recorder window that prints the input events it receives
//!   (`record.rs`).
//! - `xprobe clip-own <text>`, `clip-read`, `grabs`, `within <window> <ancestor>`: the clipboard owner and reader and
//!   the desktop checks of M2's text cases (`clip.rs`).
//! - `xprobe toplevel <window>`, `restack-grabbed <window>...`: a window's top-level, and the coalesced negative
//!   check's raises under one server grab (`restack.rs`).
//! - `xprobe focus-grabbed <window>...`: the focus and `_NET_ACTIVE_WINDOW` set to each window in turn under one
//!   server grab (`focus.rs`).
//! - `xprobe quarantine`: whether cua's display-wide unconfirmed-paste window is open, and for how long (`clip.rs`).

mod clip;
mod focus;
mod record;
mod restack;

use std::io::{BufRead, Write};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
use x11rb::protocol::xproto::{
    AtomEnum, ChangeWindowAttributesAux, ClientMessageEvent, ConnectionExt as _, EventMask, ImageFormat, Window,
};
use x11rb::rust_connection::RustConnection;

pub(crate) type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

const SAMPLE: Duration = Duration::from_millis(5);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("witness") => witness(),
        Some("retention") => retention(&args[1..]),
        Some("imgdiff") if (3..=4).contains(&args.len()) => imgdiff(&args[1], &args[2], args.get(3)),
        Some("close") if args.len() == 2 => close(&args[1]),
        Some("record") => record::record(&args[1..]),
        Some("clip-own") => clip::own(&args[1..]),
        Some("clip-read") if args.len() == 1 => clip::read(),
        Some("grabs") if args.len() == 1 => clip::grabs(),
        Some("within") => clip::within(&args[1..]),
        Some("toplevel") => restack::toplevel(&args[1..]),
        Some("restack-grabbed") => restack::restack_grabbed(&args[1..]),
        Some("focus-grabbed") => focus::focus_grabbed(&args[1..]),
        Some("quarantine") if args.len() == 1 => clip::quarantine(),
        _ => Err("usage: xprobe witness | retention <window> [trials] [span-ms] [gap-ms] [dump-prefix] | imgdiff <a> <b> [mask-top-rows] | close <window> | record <x> <y> <w> <h> [focus] | clip-own <text> | clip-read | grabs | within <window> <ancestor> | toplevel <window> | restack-grabbed <window>... | focus-grabbed <window>... | quarantine".into()),
    };
    if let Err(error) = result {
        eprintln!("xprobe: {error}");
        std::process::exit(1);
    }
}

pub(crate) fn parse_window(text: &str) -> Result<Window> {
    let window = match text.strip_prefix("0x") {
        Some(hex) => u32::from_str_radix(hex, 16)?,
        None => text.parse()?,
    };
    Ok(window)
}

pub(crate) fn atom(conn: &RustConnection, name: &str) -> Result<u32> {
    Ok(conn.intern_atom(false, name.as_bytes())?.reply()?.atom)
}

pub(crate) fn json_str(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn json_ids(ids: &[u32]) -> String {
    let items: Vec<String> = ids.iter().map(u32::to_string).collect();
    format!("[{}]", items.join(","))
}

// ---------------------------------------------------------------------------------------------------------------
// The witness

#[derive(Clone, PartialEq, Debug)]
struct DesktopState {
    active: Vec<u32>,
    stacking: Vec<u32>,
    focus: u32,
    pointer: (i16, i16),
}

struct Desktop {
    conn: RustConnection,
    root: Window,
    active_atom: u32,
    stacking_atom: u32,
}

impl Desktop {
    fn property(&self, atom: u32) -> Result<Vec<u32>> {
        let reply = self
            .conn
            .get_property(false, self.root, atom, AtomEnum::ANY, 0, 4096)?
            .reply()?;
        Ok(reply.value32().map(|v| v.collect()).unwrap_or_default())
    }

    fn focus_and_pointer(&self) -> Result<(u32, (i16, i16))> {
        let focus = self.conn.get_input_focus()?;
        let pointer = self.conn.query_pointer(self.root)?;
        let focus = focus.reply()?.focus;
        let pointer = pointer.reply()?;
        Ok((focus, (pointer.root_x, pointer.root_y)))
    }

    fn state(&self) -> Result<DesktopState> {
        let (focus, pointer) = self.focus_and_pointer()?;
        Ok(DesktopState {
            active: self.property(self.active_atom)?,
            stacking: self.property(self.stacking_atom)?,
            focus,
            pointer,
        })
    }
}

struct Span {
    tag: String,
    started: Instant,
    last: DesktopState,
    changes: Vec<String>,
    samples: u64,
    max_gap_ms: f64,
    last_sample: Instant,
    notifies_active: u64,
    notifies_stacking: u64,
    /// the root's children when the span began (`restack::tree`)
    tree: String,
    /// the root window, which the focus record names when the focus goes to neither top-level
    root: Window,
    /// every root-substructure event of the span, in order (`restack::record`)
    restacks: Vec<String>,
    /// every focus transition and activation request of the span, in order (`focus::record`)
    focus: Vec<String>,
}

impl Span {
    fn record(&mut self, now: DesktopState) {
        let t = self.started.elapsed().as_secs_f64() * 1000.0;
        if now.active != self.last.active {
            self.changes.push(format!(
                "{{\"field\":\"active\",\"t_ms\":{t:.1},\"from\":{:?},\"to\":{:?}}}",
                self.last.active, now.active
            ));
        }
        if now.stacking != self.last.stacking {
            self.changes.push(format!(
                "{{\"field\":\"stacking\",\"t_ms\":{t:.1},\"from_len\":{},\"to_len\":{},\"from\":{},\"to\":{}}}",
                self.last.stacking.len(),
                now.stacking.len(),
                json_ids(&self.last.stacking),
                json_ids(&now.stacking)
            ));
        }
        if now.focus != self.last.focus {
            self.changes.push(format!(
                "{{\"field\":\"focus\",\"t_ms\":{t:.1},\"from\":{},\"to\":{}}}",
                self.last.focus, now.focus
            ));
        }
        if now.pointer != self.last.pointer {
            self.changes.push(format!(
                "{{\"field\":\"pointer\",\"t_ms\":{t:.1},\"from\":[{},{}],\"to\":[{},{}]}}",
                self.last.pointer.0, self.last.pointer.1, now.pointer.0, now.pointer.1
            ));
        }
        self.last = now;
    }

    /// A `PropertyNotify` for a watched property during the span. It carries no value, and a change followed by a
    /// restore leaves the same value behind, so every notify is itself a change: the witness is conservative.
    fn notify(&mut self, field: &str) {
        let t = self.started.elapsed().as_secs_f64() * 1000.0;
        match field {
            "active" => self.notifies_active += 1,
            _ => self.notifies_stacking += 1,
        }
        self.changes
            .push(format!("{{\"field\":\"{field}\",\"t_ms\":{t:.1},\"notify\":true}}"));
    }

    fn report(&self) -> String {
        format!(
            "{{\"tag\":{},\"duration_ms\":{:.1},\"samples\":{},\"max_gap_ms\":{:.1},\"notifies\":{{\"active\":{},\"stacking\":{}}},\"changes\":[{}],\"tree\":{},\"root\":{},\"restacks\":[{}],\"focus\":[{}]}}",
            json_str(&self.tag),
            self.started.elapsed().as_secs_f64() * 1000.0,
            self.samples,
            self.max_gap_ms,
            self.notifies_active,
            self.notifies_stacking,
            self.changes.join(","),
            self.tree,
            self.root,
            self.restacks.join(","),
            self.focus.join(",")
        )
    }
}

fn witness() -> Result<()> {
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let desktop = Desktop {
        active_atom: atom(&conn, "_NET_ACTIVE_WINDOW")?,
        stacking_atom: atom(&conn, "_NET_CLIENT_LIST_STACKING")?,
        conn,
        root,
    };
    desktop.conn.change_window_attributes(
        root,
        &ChangeWindowAttributesAux::new()
            .event_mask(EventMask::PROPERTY_CHANGE | EventMask::SUBSTRUCTURE_NOTIFY | EventMask::FOCUS_CHANGE),
    )?;
    focus::watch(&desktop.conn, root)?;
    desktop.conn.flush()?;

    let (tx, rx) = mpsc::channel::<Option<String>>();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            match line {
                Ok(line) => {
                    if tx.send(Some(line)).is_err() {
                        return;
                    }
                }
                Err(_) => break,
            }
        }
        let _ = tx.send(None);
    });

    let stdout = std::io::stdout();
    println!("{{\"ready\":true}}");
    stdout.lock().flush()?;
    let mut span: Option<Span> = None;
    let mut next = Instant::now();
    loop {
        // Commands first, so a span begins and ends exactly where the harness asks.
        while let Ok(message) = rx.try_recv() {
            let Some(line) = message else { return Ok(()) };
            let line = line.trim();
            if let Some(tag) = line.strip_prefix("begin ") {
                // events from before the span belong to no span
                drain_idle(&desktop)?;
                let now = Instant::now();
                span = Some(Span {
                    tag: tag.to_string(),
                    started: now,
                    last: desktop.state()?,
                    changes: Vec::new(),
                    samples: 1,
                    max_gap_ms: 0.0,
                    last_sample: now,
                    notifies_active: 0,
                    notifies_stacking: 0,
                    tree: restack::tree(&desktop.conn, desktop.root)?,
                    root: desktop.root,
                    restacks: Vec::new(),
                    focus: Vec::new(),
                });
                println!("{{\"begun\":{}}}", json_str(tag));
                stdout.lock().flush()?;
            } else if let Some(tag) = line.strip_prefix("end ") {
                if let Some(mut s) = span.take() {
                    drain_notifies(&desktop, &mut s)?;
                    let state = desktop.state()?;
                    s.record(state);
                    s.samples += 1;
                    if s.tag != tag {
                        s.changes.push(format!(
                            "{{\"field\":\"protocol\",\"note\":{}}}",
                            json_str("end tag mismatch")
                        ));
                    }
                    println!("{}", s.report());
                } else {
                    println!("{{\"tag\":{},\"error\":\"no span\"}}", json_str(tag));
                }
                stdout.lock().flush()?;
            }
        }
        if let Some(s) = span.as_mut() {
            drain_notifies(&desktop, s)?;
            let (focus, pointer) = desktop.focus_and_pointer()?;
            let now = Instant::now();
            s.max_gap_ms = s.max_gap_ms.max((now - s.last_sample).as_secs_f64() * 1000.0);
            s.last_sample = now;
            s.samples += 1;
            let state = DesktopState {
                focus,
                pointer,
                ..s.last.clone()
            };
            s.record(state);
        } else {
            drain_idle(&desktop)?;
        }
        next += SAMPLE;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else {
            next = now;
        }
    }
}

/// Reads queued `PropertyNotify` events. Each one for a watched property is recorded as a change (`Span::notify`),
/// whatever the value reads afterwards; the value is re-read too, so a lasting change also shows its from and to.
/// The value is read right after each notify, not once per poll, so each change of the stacking order is recorded as
/// its own transition (the foreground route's witness judges every one). Changes faster than one read can still merge:
/// their notifies stay recorded either way.
///
/// The root-substructure events (restacks, maps, unmaps of the root's children) are recorded as they come, in order
/// with the notifies: they are the record that is never coalesced (`restack.rs`).
fn drain_notifies(desktop: &Desktop, span: &mut Span) -> Result<()> {
    while let Some(event) = desktop.conn.poll_for_event()? {
        focus::follow(&desktop.conn, desktop.root, &event)?;
        let t = span.started.elapsed().as_secs_f64() * 1000.0;
        if let Some(line) = focus::record(&event, desktop.active_atom, t) {
            span.focus.push(line);
            continue;
        }
        if let Some(line) = restack::record(&event, desktop.root, t) {
            span.restacks.push(line);
            continue;
        }
        if let Event::PropertyNotify(notify) = event {
            let mut state = span.last.clone();
            if notify.atom == desktop.active_atom {
                span.notify("active");
                state.active = desktop.property(desktop.active_atom)?;
            } else if notify.atom == desktop.stacking_atom {
                span.notify("stacking");
                state.stacking = desktop.property(desktop.stacking_atom)?;
            } else {
                continue;
            }
            span.record(state);
        }
    }
    Ok(())
}

/// Outside a span, events belong to no span; a new root child still gets its focus events selected.
fn drain_idle(desktop: &Desktop) -> Result<()> {
    while let Some(event) = desktop.conn.poll_for_event()? {
        focus::follow(&desktop.conn, desktop.root, &event)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------
// The retention probe

/// One capture: a hash of its colour bytes (B, G, R of each 32-bit pixel; the fourth byte is padding or alpha,
/// which the engine's JPEG never carries) and the fraction of black pixels.
fn grab(conn: &RustConnection, window: Window, width: u16, height: u16) -> Result<Vec<u8>> {
    Ok(conn
        .get_image(ImageFormat::Z_PIXMAP, window, 0, 0, width, height, !0)?
        .reply()?
        .data)
}

fn capture(conn: &RustConnection, window: Window, width: u16, height: u16) -> Result<(u64, f64)> {
    let image = grab(conn, window, width, height)?;
    let mut hash: u64 = 0xcbf29ce484222325;
    let mut black = 0u64;
    let pixels = image.chunks_exact(4);
    let count = pixels.len().max(1) as f64;
    for px in pixels {
        for &b in &px[..3] {
            hash ^= b as u64;
            hash = hash.wrapping_mul(0x100000001b3);
        }
        if px[..3] == [0, 0, 0] {
            black += 1;
        }
    }
    Ok((hash, black as f64 / count))
}

fn retention(args: &[String]) -> Result<()> {
    let window = parse_window(args.first().ok_or("retention needs a window")?)?;
    let trials: u32 = args.get(1).map(|s| s.parse()).transpose()?.unwrap_or(10);
    let span = Duration::from_millis(args.get(2).map(|s| s.parse()).transpose()?.unwrap_or(400));
    let gap = Duration::from_millis(args.get(3).map(|s| s.parse()).transpose()?.unwrap_or(300));
    let dump = args.get(4);
    let (conn, _) = x11rb::connect(None)?;
    conn.composite_query_version(0, 4)?.reply()?;
    let geometry = conn.get_geometry(window)?.reply()?;
    let (width, height) = (geometry.width, geometry.height);
    for trial in 0..trials {
        let (before, _) = capture(&conn, window, width, height)?;
        conn.composite_redirect_window(window, Redirect::AUTOMATIC)?;
        let started = Instant::now();
        let mut changes: Vec<(f64, u64, f64)> = Vec::new();
        let mut samples = 0u64;
        let mut last = None;
        while started.elapsed() < span {
            let (hash, black) = capture(&conn, window, width, height)?;
            let t = started.elapsed().as_secs_f64() * 1000.0;
            samples += 1;
            if last != Some(hash) {
                changes.push((t, hash, black));
                last = Some(hash);
            }
        }
        if let Some(prefix) = dump {
            // the trial's final capture, colour bytes only, for a pixel count against another condition's
            let image = grab(&conn, window, width, height)?;
            let colour: Vec<u8> = image.chunks_exact(4).flat_map(|px| [px[0], px[1], px[2]]).collect();
            std::fs::write(format!("{prefix}-{trial}.bgr"), colour)?;
        }
        conn.composite_unredirect_window(window, Redirect::AUTOMATIC)?;
        conn.flush()?;
        let changes: Vec<String> = changes
            .iter()
            .map(|(t, h, black)| format!("[{t:.2},\"{h:016x}\",{black:.4}]"))
            .collect();
        println!(
            "{{\"trial\":{trial},\"window\":{window},\"width\":{width},\"height\":{height},\"before\":\"{before:016x}\",\"span_ms\":{},\"samples\":{samples},\"changes\":[{}]}}",
            span.as_millis(),
            changes.join(",")
        );
        std::io::stdout().lock().flush()?;
        std::thread::sleep(gap);
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------
// Image comparison and close

/// A pixel differs when one of its channels differs by more than this (JPEG noise around a changed glyph stays
/// under it; a black or garbled region does not).
const PIXEL_THRESHOLD: u8 = 32;

/// Two RGB buffers of one size compared below their top `mask_top` rows: the mean absolute channel difference, the
/// pixels with a channel differing by more than `PIXEL_THRESHOLD`, and the pixels compared.
fn difference(a: &[u8], b: &[u8], width: usize, mask_top: usize) -> (f64, u64, u64) {
    let start = (mask_top * width * 3).min(a.len());
    let (mut total, mut over) = (0u64, 0u64);
    for (pa, pb) in a[start..].chunks_exact(3).zip(b[start..].chunks_exact(3)) {
        let mut worst = 0u8;
        for (x, y) in pa.iter().zip(pb) {
            let d = x.abs_diff(*y);
            total += d as u64;
            worst = worst.max(d);
        }
        if worst > PIXEL_THRESHOLD {
            over += 1;
        }
    }
    let compared = ((a.len() - start) / 3) as u64;
    (total as f64 / (compared.max(1) * 3) as f64, over, compared)
}

fn imgdiff(a: &str, b: &str, mask_top: Option<&String>) -> Result<()> {
    let mask_top: usize = mask_top.map(|s| s.parse()).transpose()?.unwrap_or(0);
    let a = image::load_from_memory_with_format(&std::fs::read(a)?, image::ImageFormat::Jpeg)?.to_rgb8();
    let b = image::load_from_memory_with_format(&std::fs::read(b)?, image::ImageFormat::Jpeg)?.to_rgb8();
    let (mad, over, compared) = if a.dimensions() == b.dimensions() {
        let (mad, over, compared) = difference(a.as_raw(), b.as_raw(), a.width() as usize, mask_top);
        (format!("{mad:.4}"), over.to_string(), compared.to_string())
    } else {
        ("null".into(), "null".into(), "0".into())
    };
    println!(
        "{{\"a\":[{},{}],\"b\":[{},{}],\"mask_top\":{mask_top},\"mad\":{mad},\"over\":{over},\"compared\":{compared}}}",
        a.width(),
        a.height(),
        b.width(),
        b.height()
    );
    Ok(())
}

fn close(window: &str) -> Result<()> {
    let window = parse_window(window)?;
    let (conn, _) = x11rb::connect(None)?;
    let protocols = atom(&conn, "WM_PROTOCOLS")?;
    let delete = atom(&conn, "WM_DELETE_WINDOW")?;
    let event = ClientMessageEvent::new(32, window, protocols, [delete, x11rb::CURRENT_TIME, 0, 0, 0]);
    conn.send_event(false, window, EventMask::NO_EVENT, event)?.check()?;
    conn.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(active: u32) -> DesktopState {
        DesktopState {
            active: vec![active],
            stacking: vec![1, 2, 3],
            focus: 7,
            pointer: (10, 20),
        }
    }

    fn span() -> Span {
        let now = Instant::now();
        Span {
            tag: "t".into(),
            started: now,
            last: state(5),
            changes: Vec::new(),
            samples: 1,
            max_gap_ms: 0.0,
            last_sample: now,
            notifies_active: 0,
            notifies_stacking: 0,
            tree: "[[1,1,0],[2,1,0]]".into(),
            root: 0x100,
            restacks: Vec::new(),
            focus: Vec::new(),
        }
    }

    #[test]
    fn a_queued_change_and_restore_is_a_change() {
        // the active window moved away and back between two polls: two notifies queue, and the value read after
        // them equals the value before
        let mut s = span();
        s.notify("active");
        s.notify("active");
        s.record(state(5));
        assert_eq!(s.notifies_active, 2);
        assert_eq!(s.changes.len(), 2, "{:?}", s.changes);
        assert!(s.changes.iter().all(|c| c.contains("\"field\":\"active\"")));
        assert!(s.report().contains("\"notifies\":{\"active\":2,\"stacking\":0}"));
    }

    #[test]
    fn a_stacking_change_records_both_orders() {
        // the foreground route's witness judges each transition of the order, not only its lengths (M2.3 review)
        let mut s = span();
        let mut raised = state(5);
        raised.stacking = vec![1, 3, 2];
        s.record(raised);
        assert_eq!(s.changes.len(), 1);
        assert!(
            s.changes[0].contains("\"from\":[1,2,3]") && s.changes[0].contains("\"to\":[1,3,2]"),
            "{:?}",
            s.changes
        );
    }

    #[test]
    fn the_report_carries_the_tree_and_every_restack_in_order() {
        let mut s = span();
        s.restacks
            .push("{\"kind\":\"configure\",\"window\":1,\"above\":2}".into());
        s.restacks
            .push("{\"kind\":\"configure\",\"window\":2,\"above\":1}".into());
        let report = s.report();
        assert!(report.contains("\"tree\":[[1,1,0],[2,1,0]],\"root\":256"), "{report}");
        assert!(report.ends_with(",\"focus\":[]}"), "{report}");
        assert!(
            report.contains("\"restacks\":[{\"kind\":\"configure\",\"window\":1,\"above\":2},{\"kind\":\"configure\",\"window\":2,\"above\":1}]"),
            "{report}"
        );
    }

    #[test]
    fn a_span_without_notifies_or_value_changes_is_clean() {
        let mut s = span();
        s.record(state(5));
        assert!(s.changes.is_empty());
        s.record(state(6));
        assert_eq!(s.changes.len(), 1);
    }

    #[test]
    fn difference_counts_pixels_over_the_threshold_below_the_mask() {
        let (w, h) = (4usize, 3usize);
        let a = vec![200u8; w * h * 3];
        let mut b = a.clone();
        assert_eq!(difference(&a, &b, w, 0), (0.0, 0, 12));
        // JPEG-sized noise is not a differing pixel
        b[0] = 210;
        assert_eq!(difference(&a, &b, w, 0).1, 0);
        // a black pixel in row 0 counts unless the top row is masked
        b[3..6].copy_from_slice(&[0, 0, 0]);
        assert_eq!(difference(&a, &b, w, 0).1, 1);
        assert_eq!(difference(&a, &b, w, 1), (0.0, 0, 8));
        // a black image differs everywhere
        let black = vec![0u8; w * h * 3];
        let (mad, over, compared) = difference(&a, &black, w, 0);
        assert_eq!((mad, over, compared), (200.0, 12, 12));
    }
}
