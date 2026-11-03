//! #171 task 41's load and probe for a private X server (never `:0`).
//!
//! - `flood <secs> <seed> <batch> [pause_ms big_every big_bytes max_small]`: one client that changes a property of its own unmapped window with payloads of
//!   0..2400 bytes (requests the whole-run record reads), creates and destroys a child now and then (a DestroyNotify
//!   delivered to it), and makes a round trip after every `batch` requests, then sleeps `pause_ms`; every `big_every`
//!   batches one property of `big_bytes` (an icon's size). Prints `{"changes":N,"base":B}` at the end,
//!   so a record can be checked for every one of its ChangeProperty requests.
//! - `churn <secs> <per_sec>`: connections opened and closed (the record's client started and died elements, and the
//!   record client's attribution round trip for each).
//! - `slowrec <contexts> <chunk> <gap_us>`: a RECORD client that reads raw bytes at a bounded rate (see the function).
//! - `ping <interval_ms> <bound_ms>`: a GetInputFocus round trip on its own connection every interval; one line per
//!   round trip over 50 ms, and `STALL` with exit 3 when one does not answer within the bound.

use std::sync::mpsc;
use std::time::{Duration, Instant};

use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
    AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, WindowClass,
};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u32 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 33) as u32
    }
}

fn flood(secs: u64, seed: u64, batch: u32, pause_ms: u64, big_every: u32, big_bytes: usize, max_small: u32) -> Result<()> {
    let (conn, screen) = x11rb::connect(None)?;
    let root = conn.setup().roots[screen].root;
    let win = conn.generate_id()?;
    conn.create_window(
        0,
        win,
        root,
        0,
        0,
        10,
        10,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &CreateWindowAux::new().event_mask(EventMask::SUBSTRUCTURE_NOTIFY),
    )?;
    let prop = conn.intern_atom(false, b"TASK41_FLOOD")?.reply()?.atom;
    let mut rng = Lcg(seed);
    let payload = vec![0x5au8; 2400.max(big_bytes)];
    let mut batches: u32 = 0;
    let deadline = Instant::now() + Duration::from_secs(secs);
    let mut changes: u64 = 0;
    while Instant::now() < deadline {
        for _ in 0..batch {
            let n = (rng.next() % max_small.clamp(1, 2400)) as usize;
            conn.change_property(PropMode::REPLACE, win, prop, AtomEnum::STRING, 8, n as u32, &payload[..n])?;
            changes += 1;
            if rng.next() % 64 == 0 {
                let child = conn.generate_id()?;
                conn.create_window(0, child, win, 0, 0, 1, 1, 0, WindowClass::INPUT_OUTPUT, 0, &CreateWindowAux::new())?;
                conn.destroy_window(child)?;
            }
        }
        batches += 1;
        if big_every > 0 && batches % big_every == 0 {
            conn.change_property(PropMode::REPLACE, win, prop, AtomEnum::CARDINAL, 32, (big_bytes / 4) as u32, &payload[..big_bytes / 4 * 4])?;
            changes += 1;
        }
        conn.get_input_focus()?.reply()?;
        while conn.poll_for_event()?.is_some() {}
        if pause_ms > 0 {
            std::thread::sleep(Duration::from_millis(pause_ms));
        }
    }
    conn.destroy_window(win)?;
    conn.get_input_focus()?.reply()?;
    println!(
        "{{\"changes\":{changes},\"base\":{}}}",
        conn.setup().resource_id_base
    );
    Ok(())
}

fn churn(secs: u64, per_sec: u64) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(secs);
    let gap = Duration::from_micros(1_000_000 / per_sec.max(1));
    let mut n = 0u64;
    while Instant::now() < deadline {
        let (conn, _) = x11rb::connect(None)?;
        conn.get_input_focus()?.reply()?;
        drop(conn);
        n += 1;
        std::thread::sleep(gap);
    }
    println!("{{\"connections\":{n}}}");
    Ok(())
}

fn ping(interval_ms: u64, bound_ms: u64) -> Result<()> {
    let (tx, rx) = mpsc::channel::<std::result::Result<(), String>>();
    let (go_tx, go) = mpsc::channel::<()>();
    std::thread::spawn(move || {
        let conn = match x11rb::connect(None) {
            Ok((c, _)) => c,
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
                return;
            }
        };
        while go.recv().is_ok() {
            let r = conn
                .get_input_focus()
                .map_err(|e| e.to_string())
                .and_then(|c| c.reply().map(|_| ()).map_err(|e| e.to_string()));
            if tx.send(r).is_err() {
                return;
            }
        }
    });
    loop {
        let started = Instant::now();
        go_tx.send(())?;
        match rx.recv_timeout(Duration::from_millis(bound_ms)) {
            Ok(Ok(())) => {
                let ms = started.elapsed().as_millis();
                if ms > 50 {
                    println!("slow {ms} ms at {}", wall());
                }
            }
            Ok(Err(e)) => {
                println!("ERROR {e} at {}", wall());
                std::process::exit(4);
            }
            Err(_) => {
                println!("STALL no answer in {bound_ms} ms at {}", wall());
                std::process::exit(3);
            }
        }
        std::thread::sleep(Duration::from_millis(interval_ms));
    }
}

/// A RECORD client that reads its data connection's raw bytes at a bounded rate (`chunk` bytes every `gap_us`), so
/// its socket stays near full and the server keeps a little of its output buffered: a reader that just keeps up.
/// `contexts` 2 is xprobe record-run's shape (requests and client starts and ends on one, errors on another), 1 has
/// everything on one. Records ChangeProperty and GetProperty from every client. Prints the bytes read each second.
/// With `hover_at` < 0 it reads as fast as data comes but stops for a random 0..-hover_at ms every 50 ms.
/// With `hover_at` > 0 it reads only while its socket holds at least that many bytes (FIONREAD), so the socket stays
/// full and the server keeps buffering a little, however fast the load.
fn slowrec(contexts: u32, chunk: usize, gap_us: u64, hover_at: i32) -> Result<()> {
    use std::io::Read;
    use std::os::fd::AsFd;
    use x11rb::protocol::record::{self, ConnectionExt as _};
    let (control, _) = x11rb::connect(None)?;
    control.record_query_version(1, 13)?.reply()?;
    let none8 = record::Range8 { first: 0, last: 0 };
    let no_ext = record::ExtRange { major: none8, minor: record::Range16 { first: 0, last: 0 } };
    let empty = record::Range {
        core_requests: none8,
        core_replies: none8,
        ext_requests: no_ext,
        ext_replies: no_ext,
        delivered_events: none8,
        device_events: none8,
        errors: none8,
        client_started: false,
        client_died: false,
    };
    let requests = record::Range {
        core_requests: record::Range8 { first: 18, last: 20 },
        delivered_events: record::Range8 { first: 17, last: 17 },
        client_started: true,
        client_died: true,
        ..empty
    };
    let errors = record::Range { errors: record::Range8 { first: 1, last: 255 }, ..empty };
    let header = u8::from(record::HType::FROM_SERVER_TIME)
        | u8::from(record::HType::FROM_CLIENT_TIME)
        | u8::from(record::HType::FROM_CLIENT_SEQUENCE);
    let all = [u32::from(record::CS::ALL_CLIENTS)];
    let main_ranges = if contexts == 1 { vec![requests, errors] } else { vec![requests] };
    let ctx = control.generate_id()?;
    control.record_create_context(ctx, header, &all, &main_ranges)?.check()?;
    let mut extra = Vec::new();
    if contexts == 2 {
        let ectx = control.generate_id()?;
        control.record_create_context(ectx, header, &all, &[errors])?.check()?;
        let (edata, _) = x11rb::connect(None)?;
        std::thread::spawn(move || {
            if let Ok(replies) = edata.record_enable_context(ectx) {
                for r in replies {
                    if r.is_err() {
                        return;
                    }
                }
            }
        });
        extra.push(ectx);
    }
    let (data, _) = x11rb::connect(None)?;
    let _replies = data.record_enable_context(ctx)?;
    data.flush()?;
    let mut raw = std::fs::File::from(data.stream().as_fd().try_clone_to_owned()?);
    let mut buf = vec![0u8; chunk];
    let mut second = Instant::now();
    let mut bytes = 0usize;
    unsafe extern "C" {
        fn ioctl(fd: i32, request: u64, ...) -> i32;
    }
    let fd = std::os::fd::AsRawFd::as_raw_fd(&raw);
    let (mut last_queued, mut still) = (-1i32, 0u32);
    let (mut next_stall, mut rng) = (Instant::now(), 7u64);
    loop {
        if hover_at < 0 {
            // stall mode: every 50 ms, stop reading for 0..-hover_at ms, then read as fast as the data comes
            if next_stall.elapsed() >= Duration::from_millis(50) {
                rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let ms = (rng >> 33) % (-hover_at) as u64;
                std::thread::sleep(Duration::from_millis(ms));
                next_stall = Instant::now();
            }
        } else if hover_at > 0 {
            let mut queued: i32 = 0;
            // FIONREAD
            // read once the socket holds `hover_at`, or stops growing (full at fewer bytes with small writes)
            if unsafe { ioctl(fd, 0x541B, &mut queued as *mut i32) } == 0 && queued < hover_at {
                if queued != last_queued || still < 20 {
                    still = if queued == last_queued { still + 1 } else { 0 };
                    last_queued = queued;
                    std::thread::sleep(Duration::from_micros(gap_us));
                    continue;
                }
            }
            still = 0;
        }
        let n = match raw.read(&mut buf) {
            Ok(n) => n,
            // the stream is non-blocking (x11rb's): nothing to read yet
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_micros(gap_us.max(50)));
                continue;
            }
            Err(e) => return Err(e.into()),
        };
        if n == 0 {
            return Err("the server closed the record's data connection".into());
        }
        bytes += n;
        if second.elapsed() >= Duration::from_secs(1) {
            println!("read {bytes} B/s at {}", wall());
            bytes = 0;
            second = Instant::now();
        }
        if hover_at == 0 && gap_us > 0 {
            std::thread::sleep(Duration::from_micros(gap_us));
        }
    }
}

fn wall() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let num = |i: usize, d: u64| args.get(i).and_then(|s| s.parse().ok()).unwrap_or(d);
    match args.first().map(String::as_str) {
        Some("flood") => flood(num(1, 60), num(2, 1), num(3, 50) as u32, num(4, 0), num(5, 0) as u32, num(6, 0) as usize, num(7, 2400) as u32),
        Some("churn") => churn(num(1, 60), num(2, 10)),
        Some("ping") => ping(num(1, 1000), num(2, 5000)),
        Some("slowrec") => slowrec(num(1, 2) as u32, num(2, 4096) as usize, num(3, 1000), num(4, 0) as i32),
        _ => Err("flood <secs> <seed> <batch> | churn <secs> <per_sec> | ping <interval_ms> <bound_ms>".into()),
    }
}
