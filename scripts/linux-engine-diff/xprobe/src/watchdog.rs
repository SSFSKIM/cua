//! `xprobe watchdog --display <d> [--interval-ms N] [--bound-ms N] [--grace-ms N] [--stop <pid>]`: whether the run's
//! X server still answers, for a whole harness run, until stdin closes (#171 M4, task 41). A GetInputFocus round trip
//! every interval from a connection of its own; when one goes unanswered for the bound (a frozen server: X.Org
//! 21.1's FlushClient spins on a zero-length writev once RECORD's flush callback re-enters it, task 41's report), it
//! kills every guarded process at once (the whole-run record client first: lines `guard <pid>` on stdin), sends SIGTERM
//! to `--stop` (the harness run) and SIGKILL after the grace, prints a `stall` line, an alert on stderr naming the
//! display, and exits 3. A connection whose setup is never answered counts as a stall too: that is how the frozen
//! server looked to new clients on `:0`.
//!
//! Lines: `ready` {display, interval_ms, bound_ms, pid} once its first round trip answered; `end` {round_trips} once
//! stdin closed; `stall` {display, bound_ms, round_trips, reason, killed, stopped}, written and flushed before the grace
//! is waited out. A stall before the first answer stops no run (`stopped` null): the run waits for `ready` before it
//! touches the display, and fails its own start.

use std::io::BufRead;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::rust_connection::RustConnection;

use crate::Result;
use crate::collector::print_lines;

/// The exit status of a watchdog that saw its display stop answering.
pub const STALLED: i32 = 3;

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub interval: Duration,
    pub bound: Duration,
    pub grace: Duration,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            interval: Duration::from_secs(2),
            bound: Duration::from_secs(5),
            grace: Duration::from_secs(20),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// Asked to stop (stdin closed) with every round trip answered.
    Ended { round_trips: u64 },
    /// A round trip (or the connection's setup) went unanswered for the bound.
    Stalled { round_trips: u64, reason: String },
}

/// How the prober gets its connection: the display's own (`display_connector`), or a test's fake display.
pub type Connect = Box<dyn FnOnce() -> std::result::Result<RustConnection, String> + Send>;

/// The connector for a named display, through xprobe's one way to a display (`crate::xconnect`, which a test build
/// refuses).
pub fn display_connector(display: &str) -> Connect {
    let display = display.to_string();
    Box::new(move || {
        crate::xconnect(Some(&display))
            .map(|(conn, _)| conn)
            .map_err(|e| e.to_string())
    })
}

/// The round trips from a thread of their own, so a server that never answers leaves only that thread waiting: each
/// `()` sent asks for one, each answer comes back (`Err` with the connection's error).
fn prober(connect: Connect) -> (Sender<()>, Receiver<std::result::Result<(), String>>) {
    let (ask, asked) = mpsc::channel::<()>();
    let (tell, told) = mpsc::channel();
    std::thread::spawn(move || {
        let conn = match connect() {
            Ok(conn) => conn,
            Err(e) => {
                let _ = tell.send(Err(format!("cannot connect: {e}")));
                return;
            }
        };
        while asked.recv().is_ok() {
            let answer = conn
                .get_input_focus()
                .map_err(|e| e.to_string())
                .and_then(|cookie| cookie.reply().map(|_| ()).map_err(|e| e.to_string()));
            if tell.send(answer).is_err() {
                return;
            }
        }
    });
    (ask, told)
}

/// Round trips every `interval` until `stop` says so (or its sender is gone), or one goes unanswered for `bound`.
/// `ready` is called once, after the first round trip answered.
pub fn watch(connect: Connect, settings: &Settings, stop: &Receiver<()>, mut ready: impl FnMut()) -> Outcome {
    let (ask, told) = prober(connect);
    let mut round_trips = 0u64;
    loop {
        let asked_at = Instant::now();
        if ask.send(()).is_err() {
            return Outcome::Stalled {
                round_trips,
                reason: "the prober ended".into(),
            };
        }
        match told.recv_timeout(settings.bound) {
            Ok(Ok(())) => {
                round_trips += 1;
                if round_trips == 1 {
                    ready();
                }
            }
            Ok(Err(e)) => return Outcome::Stalled { round_trips, reason: e },
            Err(RecvTimeoutError::Timeout) => {
                return Outcome::Stalled {
                    round_trips,
                    reason: format!("no GetInputFocus reply in {} ms", settings.bound.as_millis()),
                };
            }
            Err(RecvTimeoutError::Disconnected) => {
                return Outcome::Stalled {
                    round_trips,
                    reason: "the prober ended".into(),
                };
            }
        }
        let wait = settings.interval.saturating_sub(asked_at.elapsed());
        match stop.recv_timeout(wait) {
            Ok(()) | Err(RecvTimeoutError::Disconnected) => return Outcome::Ended { round_trips },
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
}

unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
}

const SIGKILL: i32 = 9;
const SIGTERM: i32 = 15;

fn signal(pid: u32, sig: i32) -> bool {
    // a pid of 0 or one beyond i32 would name a process group or every process: never sent
    match i32::try_from(pid) {
        Ok(p) if p > 0 => unsafe { kill(p, sig) == 0 },
        _ => false,
    }
}

fn alive(pid: u32) -> bool {
    signal(pid, 0)
}

/// What a stall does, in this order: every guarded process killed; `stop` (the run) asked to end with SIGTERM, but
/// only once the display had answered (a run waits for the first answer before it touches the display, so a stall
/// before it fails the run's own start, task 44); `report` given the stall line and the alert, which the caller writes
/// out before anything waits; then the run killed once the grace has passed, if it still lives. Returns the line and
/// the alert too.
pub fn act_on_stall(
    display: &str,
    settings: &Settings,
    outcome: &Outcome,
    guarded: &[u32],
    stop: Option<u32>,
    report: impl FnOnce(&str, &str),
) -> (String, String) {
    let (round_trips, reason) = match outcome {
        Outcome::Stalled { round_trips, reason } => (*round_trips, reason.as_str()),
        Outcome::Ended { round_trips } => (*round_trips, "ended"),
    };
    let killed: Vec<u32> = guarded.iter().copied().filter(|&p| signal(p, SIGKILL)).collect();
    let stopped = stop.filter(|_| round_trips > 0).filter(|&p| signal(p, SIGTERM));
    let ids: Vec<String> = killed.iter().map(u32::to_string).collect();
    let line = crate::whole::Watch::line(
        "stall",
        &format!(
            "\"display\":{},\"bound_ms\":{},\"round_trips\":{round_trips},\"reason\":{},\"killed\":[{}],\"stopped\":{}",
            crate::json_str(display),
            settings.bound.as_millis(),
            crate::json_str(reason),
            ids.join(","),
            stopped.map_or("null".to_string(), |p| p.to_string())
        ),
    );
    let guarded_text = if killed.is_empty() {
        "nothing guarded".to_string()
    } else {
        format!("the guarded processes {}", ids.join(", "))
    };
    let alert = if round_trips == 0 {
        format!(
            "cua171 WATCHDOG: the X display {display} never answered its first round trip ({reason}); killed \
             {guarded_text}; the run, which had not begun on it, fails its start. Do not run anything against \
             {display} until it answers."
        )
    } else {
        format!(
            "cua171 WATCHDOG: the X display {display} stopped answering ({reason}); killed {guarded_text} and stopped \
             the run{}. Do not run anything more against {display} until it answers again.",
            stopped.map_or(String::new(), |p| format!(" (pid {p})"))
        )
    };
    report(&line, &alert);
    if let Some(p) = stopped {
        let deadline = Instant::now() + settings.grace;
        while alive(p) && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        if alive(p) {
            signal(p, SIGKILL);
        }
    }
    (line, alert)
}

/// The line the watchdog prints once its first round trip answered, with its own pid, so the run that started it can
/// tell its own readiness from an earlier watchdog's line in the same file (task 44).
pub fn ready_line(display: &str, settings: &Settings) -> String {
    crate::whole::Watch::line(
        "ready",
        &format!(
            "\"display\":{},\"interval_ms\":{},\"bound_ms\":{},\"pid\":{}",
            crate::json_str(display),
            settings.interval.as_millis(),
            settings.bound.as_millis(),
            std::process::id()
        ),
    )
}

struct Args {
    display: Option<String>,
    settings: Settings,
    stop: Option<u32>,
}

fn parse_args(args: &[String]) -> Result<Args> {
    let mut out = Args {
        display: None,
        settings: Settings::default(),
        stop: None,
    };
    let mut it = args.iter();
    let ms = |v: Option<&String>, name: &str| -> Result<Duration> {
        let n: u64 = v.ok_or(format!("{name} <ms>"))?.parse()?;
        if n == 0 {
            return Err(format!("{name} must be above 0").into());
        }
        Ok(Duration::from_millis(n))
    };
    while let Some(a) = it.next() {
        match a.as_str() {
            "--display" => out.display = Some(it.next().ok_or("--display <display>")?.clone()),
            "--interval-ms" => out.settings.interval = ms(it.next(), "--interval-ms")?,
            "--bound-ms" => out.settings.bound = ms(it.next(), "--bound-ms")?,
            "--grace-ms" => out.settings.grace = ms(it.next(), "--grace-ms")?,
            "--stop" => out.stop = Some(it.next().ok_or("--stop <pid>")?.parse()?),
            _ => {
                return Err(
                    "watchdog --display <d> [--interval-ms N] [--bound-ms N] [--grace-ms N] [--stop <pid>]".into(),
                );
            }
        }
    }
    Ok(out)
}

/// A `guard <pid>` line: a process the stall kills first.
fn guard_line(line: &str) -> Option<u32> {
    line.strip_prefix("guard ")?.trim().parse().ok()
}

pub fn watchdog(args: &[String]) -> Result<()> {
    let Args {
        display,
        settings,
        stop,
    } = parse_args(args)?;
    // named, never taken from the environment: the alert names the display it watched
    let shown = display.ok_or("watchdog needs --display <display>, the display it watches")?;
    let guarded = Arc::new(Mutex::new(Vec::<u32>::new()));
    let (stop_tx, stop_rx) = mpsc::channel();
    {
        let guarded = Arc::clone(&guarded);
        std::thread::spawn(move || {
            for line in std::io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                if let Some(pid) = guard_line(&line) {
                    guarded.lock().unwrap_or_else(|e| e.into_inner()).push(pid);
                }
            }
            let _ = stop_tx.send(());
        });
    }
    let outcome = watch(display_connector(&shown), &settings, &stop_rx, || {
        let _ = print_lines(&[ready_line(&shown, &settings)]);
    });
    match outcome {
        Outcome::Ended { round_trips } => {
            print_lines(&[crate::whole::Watch::line(
                "end",
                &format!("\"round_trips\":{round_trips}"),
            )])?;
            Ok(())
        }
        Outcome::Stalled { .. } => {
            let pids = guarded.lock().unwrap_or_else(|e| e.into_inner()).clone();
            act_on_stall(&shown, &settings, &outcome, &pids, stop, |line, alert| {
                let _ = print_lines(&[line.to_string()]);
                eprintln!("{alert}");
            });
            std::process::exit(STALLED);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::os::unix::net::{UnixListener, UnixStream};
    use std::path::PathBuf;

    use std::process::{Child, Command};
    use x11rb::rust_connection::DefaultStream;

    use x11rb::protocol::xproto::{BackingStore, EventMask, ImageOrder, Screen, Setup};
    use x11rb::x11_utils::Serialize;

    fn quick() -> Settings {
        Settings {
            interval: Duration::from_millis(50),
            bound: Duration::from_millis(400),
            grace: Duration::from_millis(500),
        }
    }

    /// A fake display at a socket this test creates in a directory of its own (`serve` gets each accepted connection),
    /// and the connector to it: a stream to that very socket, never a display string, so no parsing can lead it to
    /// another display (x11rb 0.13 takes `unix:<path>` to `/tmp/.X11-unix/X0`).
    fn fake_display(name: &str, serve: fn(UnixStream)) -> (Connect, PathBuf) {
        let dir = std::env::temp_dir().join(format!("xprobe-watchdog-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir(&dir).unwrap();
        let path = dir.join("display");
        let listener = UnixListener::bind(&path).unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(stream) = stream else { return };
                std::thread::spawn(move || serve(stream));
            }
        });
        let socket = path.clone();
        let connect: Connect = Box::new(move || {
            assert!(
                socket.starts_with(std::env::temp_dir()) && socket.ends_with("display"),
                "only a test's own socket"
            );
            let stream = UnixStream::connect(&socket).map_err(|e| e.to_string())?;
            let (stream, _) = DefaultStream::from_unix_stream(stream).map_err(|e| e.to_string())?;
            RustConnection::connect_to_stream(stream, 0).map_err(|e| e.to_string())
        });
        (connect, dir)
    }

    /// Reads the client's setup request (its header and authorization).
    fn read_setup_request(stream: &mut UnixStream) {
        let mut head = [0u8; 12];
        stream.read_exact(&mut head).unwrap();
        let pad = |n: usize| n.div_ceil(4) * 4;
        let name = pad(u16::from_le_bytes([head[6], head[7]]) as usize);
        let data = pad(u16::from_le_bytes([head[8], head[9]]) as usize);
        let mut auth = vec![0u8; name + data];
        stream.read_exact(&mut auth).unwrap();
    }

    fn setup_reply() -> Vec<u8> {
        let screen = Screen {
            root: 0x100,
            default_colormap: 0x20,
            white_pixel: 0xffffff,
            black_pixel: 0,
            current_input_masks: EventMask::NO_EVENT,
            width_in_pixels: 640,
            height_in_pixels: 480,
            width_in_millimeters: 170,
            height_in_millimeters: 130,
            min_installed_maps: 1,
            max_installed_maps: 1,
            root_visual: 0x21,
            backing_stores: BackingStore::NOT_USEFUL,
            save_unders: false,
            root_depth: 24,
            allowed_depths: vec![],
        };
        let mut setup = Setup {
            status: 1,
            protocol_major_version: 11,
            protocol_minor_version: 0,
            length: 0,
            release_number: 1,
            resource_id_base: 0x200000,
            resource_id_mask: 0x1fffff,
            motion_buffer_size: 0,
            maximum_request_length: 65535,
            image_byte_order: ImageOrder::LSB_FIRST,
            bitmap_format_bit_order: ImageOrder::LSB_FIRST,
            bitmap_format_scanline_unit: 32,
            bitmap_format_scanline_pad: 32,
            min_keycode: 8,
            max_keycode: 255,
            vendor: b"fake".to_vec(),
            pixmap_formats: vec![],
            roots: vec![screen],
        };
        setup.length = ((setup.serialize().len() - 8) / 4) as u16;
        setup.serialize()
    }

    /// A display frozen as `:0` was: it accepts a connection and never answers its setup.
    fn frozen(mut stream: UnixStream) {
        let mut sink = [0u8; 4096];
        while matches!(stream.read(&mut sink), Ok(n) if n > 0) {}
    }

    /// A display that answers the setup, then freezes: it reads requests and never replies.
    fn freezes_after_setup(mut stream: UnixStream) {
        read_setup_request(&mut stream);
        stream.write_all(&setup_reply()).unwrap();
        frozen(stream);
    }

    /// A display that answers: the setup, then each GetInputFocus with its reply.
    fn answers(mut stream: UnixStream) {
        read_setup_request(&mut stream);
        stream.write_all(&setup_reply()).unwrap();
        let mut seq: u16 = 0;
        let mut request = [0u8; 4];
        while stream.read_exact(&mut request).is_ok() {
            seq = seq.wrapping_add(1);
            assert_eq!(request[0], 43, "only GetInputFocus is asked");
            let mut reply = [0u8; 32];
            reply[0] = 1;
            reply[2..4].copy_from_slice(&seq.to_le_bytes());
            reply[8..12].copy_from_slice(&1u32.to_le_bytes());
            if stream.write_all(&reply).is_err() {
                return;
            }
        }
    }

    fn sleeper() -> Child {
        Command::new("sleep").arg("30").spawn().unwrap()
    }

    #[test]
    fn a_display_that_never_answers_a_new_connection_is_a_stall_within_the_bound() {
        let (connect, dir) = fake_display("frozen", frozen);
        let (_keep, stop) = mpsc::channel();
        let started = Instant::now();
        let outcome = watch(connect, &quick(), &stop, || panic!("a frozen display is never ready"));
        let took = started.elapsed();
        let _ = std::fs::remove_dir_all(dir);
        assert!(
            matches!(outcome, Outcome::Stalled { round_trips: 0, .. }),
            "{outcome:?}"
        );
        assert!(
            took >= Duration::from_millis(400) && took < Duration::from_secs(2),
            "{took:?}"
        );
    }

    #[test]
    fn a_display_that_stops_answering_its_round_trips_is_a_stall() {
        let (connect, dir) = fake_display("after-setup", freezes_after_setup);
        let (_keep, stop) = mpsc::channel();
        let outcome = watch(connect, &quick(), &stop, || {});
        let _ = std::fs::remove_dir_all(dir);
        match outcome {
            Outcome::Stalled { reason, .. } => assert!(reason.contains("no GetInputFocus reply in 400 ms"), "{reason}"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_display_that_answers_is_watched_until_told_to_stop() {
        let (connect, dir) = fake_display("answers", answers);
        let (stop_tx, stop) = mpsc::channel();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(600));
            let _ = stop_tx.send(());
        });
        let mut ready = 0;
        let outcome = watch(connect, &quick(), &stop, || ready += 1);
        let _ = std::fs::remove_dir_all(dir);
        match outcome {
            Outcome::Ended { round_trips } => assert!(round_trips >= 5, "{round_trips} round trips in 600 ms"),
            other => panic!("{other:?}"),
        }
        assert_eq!(ready, 1);
    }

    #[test]
    fn a_stall_kills_the_guarded_processes_first_then_stops_the_run_and_names_the_display() {
        let mut record = sleeper();
        let mut run = sleeper();
        let outcome = Outcome::Stalled {
            round_trips: 7,
            reason: "no GetInputFocus reply in 5000 ms".into(),
        };
        let (line, alert) = act_on_stall(":0", &quick(), &outcome, &[record.id()], Some(run.id()), |_, _| {});
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(record.wait().unwrap().signal(), Some(SIGKILL));
        assert_eq!(run.wait().unwrap().signal(), Some(SIGTERM));
        assert!(
            line.contains("\"kind\":\"stall\"") && line.contains("\"display\":\":0\""),
            "{line}"
        );
        assert!(
            line.contains(&format!("\"killed\":[{}]", record.id()))
                && line.contains(&format!("\"stopped\":{}", run.id())),
            "{line}"
        );
        assert!(
            alert.starts_with("cua171 WATCHDOG: the X display :0 stopped answering"),
            "{alert}"
        );
    }

    #[test]
    fn a_run_that_ignores_its_stop_is_killed_after_the_grace() {
        // a shell that ignores SIGTERM
        let mut run = Command::new("sh")
            .args(["-c", "trap '' TERM; sleep 30"])
            .spawn()
            .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let outcome = Outcome::Stalled {
            round_trips: 2,
            reason: "x".into(),
        };
        let started = Instant::now();
        act_on_stall(":5", &quick(), &outcome, &[], Some(run.id()), |_, _| {});
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(run.wait().unwrap().signal(), Some(SIGKILL));
        assert!(started.elapsed() >= Duration::from_millis(500));
    }

    #[test]
    fn the_stall_line_and_alert_are_out_before_the_grace_is_waited_out() {
        // a run that ignores SIGTERM: the escalation waits the whole grace before it kills it
        let mut run = Command::new("sh")
            .args(["-c", "trap '' TERM; sleep 30"])
            .spawn()
            .unwrap();
        std::thread::sleep(Duration::from_millis(100));
        let outcome = Outcome::Stalled {
            round_trips: 3,
            reason: "no GetInputFocus reply in 400 ms".into(),
        };
        let started = Instant::now();
        let mut reported = None;
        act_on_stall(":5", &quick(), &outcome, &[], Some(run.id()), |line, alert| {
            reported = Some((started.elapsed(), line.to_string(), alert.to_string()));
        });
        let (at, line, alert) = reported.expect("reported");
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(run.wait().unwrap().signal(), Some(SIGKILL));
        assert!(
            at < Duration::from_millis(200),
            "the stall was reported {at:?} after it was found, not before the grace"
        );
        assert!(
            started.elapsed() >= Duration::from_millis(500),
            "the grace was still waited out"
        );
        assert!(
            line.contains("\"kind\":\"stall\"") && alert.starts_with("cua171 WATCHDOG"),
            "{line} {alert}"
        );
    }

    #[test]
    fn a_stall_before_the_first_answer_stops_no_run_since_none_has_touched_the_display() {
        let mut record = sleeper();
        let mut run = sleeper();
        let outcome = Outcome::Stalled {
            round_trips: 0,
            reason: "cannot connect: no setup reply".into(),
        };
        let started = Instant::now();
        let (line, alert) = act_on_stall(":5", &quick(), &outcome, &[record.id()], Some(run.id()), |_, _| {});
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(
            record.wait().unwrap().signal(),
            Some(SIGKILL),
            "a guarded process is still killed"
        );
        assert!(
            run.try_wait().unwrap().is_none(),
            "the run was not signalled: it fails its own start"
        );
        assert!(
            started.elapsed() < Duration::from_millis(400),
            "no grace is waited for a run not stopped"
        );
        assert!(line.contains("\"stopped\":null"), "{line}");
        assert!(alert.contains("never answered its first round trip"), "{alert}");
        let _ = run.kill();
        let _ = run.wait();
    }

    #[test]
    fn the_ready_line_names_the_watchdogs_own_process() {
        let line = ready_line(":7", &quick());
        assert!(line.contains("\"kind\":\"ready\""), "{line}");
        assert!(line.contains(&format!("\"pid\":{}", std::process::id())), "{line}");
    }

    #[test]
    fn the_display_connector_reaches_no_real_display_in_a_test_build() {
        for display in [":0", ":1", "unix:/tmp/.X11-unix/X0"] {
            let (_keep, stop) = mpsc::channel();
            let started = Instant::now();
            let outcome = watch(display_connector(display), &quick(), &stop, || {
                panic!("{display} was reached")
            });
            match outcome {
                Outcome::Stalled { reason, .. } => assert!(reason.contains("connects to no X display"), "{reason}"),
                other => panic!("{other:?}"),
            }
            assert!(
                started.elapsed() < Duration::from_millis(100),
                "refused before any connect"
            );
        }
    }

    #[test]
    fn guard_lines_and_arguments_are_read() {
        assert_eq!(guard_line("guard 1234"), Some(1234));
        assert_eq!(guard_line("guard x"), None);
        assert_eq!(guard_line("kill 1"), None);
        let args: Vec<String> = [
            "--interval-ms",
            "1000",
            "--bound-ms",
            "3000",
            "--stop",
            "42",
            "--display",
            ":7",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        let a = parse_args(&args).unwrap();
        assert_eq!(a.settings.interval, Duration::from_millis(1000));
        assert_eq!(a.settings.bound, Duration::from_millis(3000));
        assert_eq!(a.stop, Some(42));
        assert_eq!(a.display.as_deref(), Some(":7"));
        assert!(parse_args(&["--bound-ms".to_string(), "0".to_string()]).is_err());
        assert!(!signal(0, 0), "pid 0 (the process group) is never signalled");
    }
}
