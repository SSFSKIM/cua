//! `cua-engine launcher-shim <parent pid> <program> [args...]`: the REPL host's resident shim for the trusted worker's
//! sandbox launcher (src/repl-host/kernel-child.mjs, `src/shim.rs`). It stays the program's parent: when the parent it
//! names dies (or the watch fails) it SIGKILLs the program at once, so the launcher never outlives its supervisor, held
//! or not; once the program is reaped, and the engine under it has closed its held record (or, outliving the wait, has
//! been ended), it releases what that record still shows down on the XTEST devices, then exits as the program did (the
//! design session's rulings, M4 T7b fixes 4 and 5). The record is a pipe the program inherits, which nothing outside
//! the shim's tree can reach.
//!
//! The tests without a display run everywhere; those that hold keys at an X server need the `live` feature:
//!   xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live --test launcher_shim

use std::io::{BufRead, BufReader};
use std::os::unix::process::ExitStatusExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use rustix::process::{Pid, Signal, kill_process};

/// The binary under test: `CUA_ENGINE_BIN` (the release workflow's shipped asset), or cargo's build.
fn engine() -> String {
    std::env::var("CUA_ENGINE_BIN").unwrap_or_else(|_| env!("CARGO_BIN_EXE_cua-engine").into())
}
const SHIM: &str = "launcher-shim";

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

fn signal(pid: u32, signal: Signal) {
    let _ = kill_process(Pid::from_raw(pid as i32).unwrap(), signal);
}

/// The children of `pid`.
fn children(pid: u32) -> Vec<u32> {
    std::fs::read_to_string(format!("/proc/{pid}/task/{pid}/children"))
        .unwrap_or_default()
        .split_whitespace()
        .map(|p| p.parse().unwrap())
        .collect()
}

fn child_of(pid: u32) -> u32 {
    for _ in 0..200 {
        if let [child] = children(pid)[..] {
            return child;
        }
        sleep(Duration::from_millis(10));
    }
    panic!("process {pid} started no child");
}

/// A scratch directory, removed on drop.
struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Scratch {
        let dir = std::env::temp_dir().join(format!("cua-shim-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir(&dir).unwrap();
        Scratch(dir)
    }

    fn entries(&self) -> Vec<String> {
        std::fs::read_dir(&self.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect()
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A shell standing for the supervisor: it starts the shim with `program`, naming itself as the parent, in the
/// background, prints the shim's pid, and waits; returns the shell and that pid.
fn supervisor_of(program: &str, tmpdir: &Path) -> (Child, u32) {
    let mut shell = Command::new("sh")
        .args(["-c", &format!("\"$0\" {SHIM} $$ {program} & echo $!; wait"), &engine()])
        .env("TMPDIR", tmpdir)
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
fn the_program_dies_at_once_with_its_parent_even_stopped_and_the_shim_after_it() {
    let tmp = Scratch::new("parent");
    let (mut shell, shim) = supervisor_of("sleep 60", &tmp.0);
    let program = child_of(shim);
    assert_eq!(
        std::fs::read_to_string(format!("/proc/{program}/comm")).unwrap().trim(),
        "sleep",
        "the shim stays, the program its child"
    );
    signal(program, Signal::STOP);
    shell.kill().unwrap();
    let _ = shell.wait();
    assert!(
        wait_exited(program, Duration::from_millis(500)),
        "SIGKILLed with its parent: state {:?}",
        state(program)
    );
    assert!(
        wait_exited(shim, Duration::from_secs(2)),
        "the shim ends once it is done"
    );
    assert!(tmp.entries().is_empty(), "its record went with it: {:?}", tmp.entries());
}

#[test]
fn without_the_shim_the_program_outlives_its_parent() {
    // the control: what the launcher did before fix 3
    let mut shell = Command::new("sh")
        .args(["-c", "sleep 60 & echo $!; wait"])
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(shell.stdout.as_mut().unwrap())
        .read_line(&mut line)
        .unwrap();
    let pid: u32 = line.trim().parse().unwrap();
    shell.kill().unwrap();
    let _ = shell.wait();
    sleep(Duration::from_millis(300));
    let alive = !exited(pid);
    signal(pid, Signal::KILL);
    assert!(alive, "an orphan, reparented");
}

#[test]
fn a_parent_already_gone_runs_nothing() {
    // the fork race: the parent named is not the shim's parent (it died before the shim watched it), so nothing runs
    let out = Command::new(engine())
        .args([SHIM, "1", "sh", "-c", "echo ran"])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout), "");
    assert_eq!(out.status.code(), Some(125));
    assert!(
        String::from_utf8_lossy(&out.stderr).contains("is no longer the parent"),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn the_program_gets_its_arguments_and_stdio_as_given_and_the_shim_exits_as_it_did() {
    let parent = std::process::id().to_string();
    let out = Command::new(engine())
        .args([
            SHIM,
            &parent,
            "sh",
            "-c",
            "printf '%s|' \"$@\"; exit 7",
            "sh",
            "a b",
            "--version",
            "",
        ])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&out.stdout), "a b|--version||");
    assert_eq!(out.status.code(), Some(7));
    let killed = Command::new(engine())
        .args([SHIM, &parent, "sh", "-c", "kill -TERM $$"])
        .status()
        .unwrap();
    assert_eq!(killed.signal(), Some(15), "ended by the program's signal");
    let missing = Command::new(engine()).args([SHIM, &parent]).output().unwrap();
    assert_eq!(missing.status.code(), Some(2), "a program is required");
    let absent = Command::new(engine())
        .args([SHIM, &parent, "/nonexistent/launcher"])
        .output()
        .unwrap();
    assert_eq!(absent.status.code(), Some(127));
}

#[test]
fn the_shim_takes_no_stop_signal_and_its_program_starts_with_none_blocked() {
    // the owned group's SIGTERM at upstream's by(0.4), a terminal's SIGINT or SIGHUP: none ends the shim, which would
    // end its program with it; the program starts with the mask the REPL host gave the shim (a shell would hide a mask
    // it inherited: it sets its own, so the program read is the one the shim runs)
    let parent = std::process::id().to_string();
    let mut shim = Command::new(engine())
        .args([SHIM, &parent, "sleep", "0.5"])
        .spawn()
        .unwrap();
    let program = child_of(shim.id());
    for s in [Signal::TERM, Signal::INT, Signal::HUP] {
        signal(shim.id(), s);
    }
    assert_eq!(shim.wait().unwrap().code(), Some(0), "the shim waited out its program");
    assert!(exited(program));
    let out = Command::new(engine())
        .args([SHIM, &parent, "grep", "-E", "^Sig(Blk|Ign)", "/proc/self/status"])
        .output()
        .unwrap();
    let mask = String::from_utf8_lossy(&out.stdout);
    assert!(mask.contains("SigBlk:\t0000000000000000"), "{mask}");
    assert!(mask.contains("SigIgn:\t0000000000000000"), "{mask}");
}

#[test]
fn the_record_is_a_pipe_s_write_end_the_program_inherits_never_a_path() {
    // the descriptor, not a path in the session's temporary directory, which model code may reach (fix 5)
    let tmp = Scratch::new("record");
    let program = "fd=$CUA_ENGINE_HELD_FD; echo \"$fd\"; readlink /proc/self/fd/$fd; sed -n 's/^flags:\\t//p' /proc/self/fdinfo/$fd";
    for tmpdir in [Some(&tmp.0), None] {
        let mut command = Command::new(engine());
        command
            .args([SHIM, &std::process::id().to_string(), "sh", "-c", program])
            .env("CUA_ENGINE_HELD_FD", "99");
        match tmpdir {
            Some(dir) => command.env("TMPDIR", dir),
            None => command.env_remove("TMPDIR"),
        };
        let out = command.output().unwrap();
        let said = String::from_utf8_lossy(&out.stdout);
        let lines: Vec<&str> = said.lines().collect();
        assert!(lines[0].parse::<u32>().is_ok_and(|fd| fd > 2 && fd != 99), "{said}");
        assert!(lines[1].starts_with("pipe:["), "{said}");
        let flags = u32::from_str_radix(lines[2], 8).unwrap();
        assert_eq!(flags & 0o3, 0o1, "write-only: {said}");
        assert_eq!(flags & 0o2000000, 0, "inherited, so not close-on-exec: {said}");
    }
    assert!(tmp.entries().is_empty(), "nothing made in TMPDIR: {:?}", tmp.entries());
}

#[test]
fn a_stderr_nobody_reads_any_more_does_not_change_how_the_shim_exits() {
    // a supervisor gone has closed the other end of the shim's stderr: what the shim says there after its release (here
    // that it could not release, with no display) must not end it otherwise than as its program ended
    let tmp = Scratch::new("stderr");
    // one record holding key 50 (byte 6 of the keycodes' bitmap, bit 2), written in two pieces, then the program's exit
    let program =
        "{ printf 'cuaH\\002\\0\\0\\0\\0\\0\\0\\0\\0\\0\\004'; head -c 57 /dev/zero; } >&$CUA_ENGINE_HELD_FD; exit 3";
    let mut shim = Command::new(engine())
        .args([SHIM, &std::process::id().to_string(), "sh", "-c", program])
        .env("TMPDIR", &tmp.0)
        .env_remove("DISPLAY")
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    drop(shim.stderr.take());
    let status = shim.wait().unwrap();
    assert_eq!((status.code(), status.signal()), (Some(3), None));
}

/// Held input at a display: the engine under the shim, which a shell standing for the supervisor started.
#[cfg(feature = "live")]
mod live {
    use super::*;
    use serde_json::{Value, json};
    use std::io::Write;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::ConnectionExt as _;
    use x11rb::rust_connection::RustConnection;

    const SHIFT_L: u32 = 0xffe1;

    fn connect() -> RustConnection {
        x11rb::connect(None).expect("an X connection").0
    }

    fn keycode_of(conn: &RustConnection, keysym: u32) -> u8 {
        let setup = conn.setup();
        let (min, max) = (setup.min_keycode, setup.max_keycode);
        let map = conn.get_keyboard_mapping(min, max - min + 1).unwrap().reply().unwrap();
        let at = map
            .keysyms
            .iter()
            .position(|&k| k == keysym)
            .expect("the keysym is mapped");
        min + (at / usize::from(map.keysyms_per_keycode)) as u8
    }

    /// Whether the X server holds Shift down, and button 1.
    fn held(conn: &RustConnection) -> (bool, bool) {
        let shift = keycode_of(conn, SHIFT_L);
        let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
        let root = conn.setup().roots[0].root;
        let mask = u16::from(conn.query_pointer(root).unwrap().reply().unwrap().mask);
        (
            keys[usize::from(shift / 8)] & (1 << (shift % 8)) != 0,
            mask & 0x100 != 0,
        )
    }

    /// Releases whatever a test left down, so the tests after it start clean.
    fn clean(conn: &RustConnection) {
        use x11rb::protocol::xtest::ConnectionExt as _;
        let root = conn.setup().roots[0].root;
        let shift = keycode_of(conn, SHIFT_L);
        let _ = conn.xtest_fake_input(x11rb::protocol::xproto::KEY_RELEASE_EVENT, shift, 0, root, 0, 0, 0);
        let _ = conn.xtest_fake_input(x11rb::protocol::xproto::BUTTON_RELEASE_EVENT, 1, 0, root, 0, 0, 0);
        conn.get_input_focus().unwrap().reply().unwrap();
    }

    /// The engine (`CUA_ENGINE_BIN`, else cargo's) as the shim's program, under a shell that stands for the supervisor;
    /// the engine speaks the wire on the test's pipes, and the shell's, shim's and engine's stderr go to `stderr`.
    struct Shimmed {
        shell: Child,
        shim: u32,
        engine: u32,
        stdin: Option<std::process::ChildStdin>,
        stdout: BufReader<std::process::ChildStdout>,
        stderr: PathBuf,
        next: u64,
    }

    impl Shimmed {
        fn start(tmp: &Scratch, shimmed: bool) -> Shimmed {
            let engine = engine();
            let stderr = tmp.0.join("stderr");
            // an asynchronous list's stdin is /dev/null before its own redirections: the engine gets the test's pipe
            // through a descriptor kept aside first
            let start = if shimmed {
                format!("\"$0\" {SHIM} $$ \"$0\" server")
            } else {
                "\"$0\" server".into()
            };
            let mut shell = Command::new("sh")
                .args([
                    "-c",
                    &format!("exec 3<&0; {start} <&3 3<&- & echo $! >&2; wait $!"),
                    &engine,
                ])
                .env("TMPDIR", &tmp.0)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(std::fs::File::create(&stderr).unwrap())
                .spawn()
                .unwrap();
            let (stdin, stdout) = (shell.stdin.take(), BufReader::new(shell.stdout.take().unwrap()));
            let started = Instant::now();
            let first = loop {
                let text = std::fs::read_to_string(&stderr).unwrap();
                if let Some(line) = text.lines().next() {
                    break line.trim().parse::<u32>().unwrap();
                }
                assert!(started.elapsed() < Duration::from_secs(5), "no pid");
                sleep(Duration::from_millis(5));
            };
            let (shim, engine) = if shimmed { (first, child_of(first)) } else { (0, first) };
            Shimmed {
                shell,
                shim,
                engine,
                stdin,
                stdout,
                stderr,
                next: 1,
            }
        }

        fn request(&mut self, command: &str, input: Value) -> Value {
            let id = self.next;
            self.next += 1;
            let stdin = self.stdin.as_mut().unwrap();
            writeln!(stdin, "{}", json!({"id": id, "command": command, "input": input})).unwrap();
            stdin.flush().unwrap();
            let mut line = String::new();
            self.stdout.read_line(&mut line).unwrap();
            let answer: Value = serde_json::from_str(&line).unwrap_or_else(|e| panic!("not JSON ({e}): {line}"));
            assert_eq!(answer["ok"], json!(true), "{answer}");
            answer
        }

        /// Shift held on the desktop route (XTEST) and a `drag_handle` begun, its button 1 held across requests.
        fn hold(&mut self, conn: &RustConnection) {
            self.request("key_down", json!({"key": "shift"}));
            self.request("drag_handle", json!({"action": "start", "x": 200, "y": 200}));
            assert_eq!(held(conn), (true, true), "Shift and button 1 down at the server");
        }

        fn stderr(&self) -> String {
            std::fs::read_to_string(&self.stderr).unwrap()
        }
    }

    impl Drop for Shimmed {
        fn drop(&mut self) {
            for pid in [self.engine, self.shim, self.shell.id()] {
                if pid != 0 && !exited(pid) {
                    signal(pid, Signal::KILL);
                }
            }
            let _ = self.shell.wait();
        }
    }

    #[test]
    fn the_supervisor_s_death_ends_the_engine_at_once_then_its_held_keys_and_buttons_are_released() {
        let conn = connect();
        let tmp = Scratch::new("live-supervisor");
        let mut run = Shimmed::start(&tmp, true);
        run.hold(&conn);
        signal(run.shell.id(), Signal::KILL);
        assert!(
            wait_exited(run.engine, Duration::from_millis(500)),
            "the engine SIGKILLed at once"
        );
        assert!(
            wait_exited(run.shim, Duration::from_secs(3)),
            "the shim ends once it has released"
        );
        let after = held(&conn);
        clean(&conn);
        assert_eq!(after, (false, false), "Shift and button 1 released");
        assert!(run.stderr().contains("released 2"), "{}", run.stderr());
        assert!(
            tmp.entries() == ["stderr"],
            "the record went with the shim: {:?}",
            tmp.entries()
        );
    }

    #[test]
    fn the_engine_s_own_death_is_released_once_it_is_reaped_and_only_what_is_still_down() {
        // the sandboxed worker's own end, the PID namespace's: the engine SIGKILLed under a living supervisor; the test
        // releases Shift itself first, so only button 1 is still down on the XTEST device
        use x11rb::protocol::xtest::ConnectionExt as _;
        let conn = connect();
        let tmp = Scratch::new("live-engine");
        let mut run = Shimmed::start(&tmp, true);
        run.hold(&conn);
        let root = conn.setup().roots[0].root;
        conn.xtest_fake_input(
            x11rb::protocol::xproto::KEY_RELEASE_EVENT,
            keycode_of(&conn, SHIFT_L),
            0,
            root,
            0,
            0,
            0,
        )
        .unwrap();
        conn.get_input_focus().unwrap().reply().unwrap();
        signal(run.engine, Signal::KILL);
        let status = run.shell.wait().unwrap();
        let after = held(&conn);
        clean(&conn);
        assert_eq!(after, (false, false), "button 1 released");
        assert!(
            run.stderr().contains("released 1"),
            "only what is still down: {}",
            run.stderr()
        );
        assert_eq!(status.code(), Some(128 + 9), "the shim exits as its program did");
    }

    #[test]
    fn an_orderly_exit_leaves_the_shim_nothing_to_release() {
        let conn = connect();
        let tmp = Scratch::new("live-orderly");
        let mut run = Shimmed::start(&tmp, true);
        run.hold(&conn);
        let (shim, engine) = (run.shim, run.engine);
        drop(run.stdin.take());
        let status = run.shell.wait().unwrap();
        let after = held(&conn);
        clean(&conn);
        assert!(exited(engine) && exited(shim));
        assert_eq!(status.code(), Some(0));
        assert_eq!(after, (false, false), "the engine released its own");
        assert!(
            !run.stderr().contains("released"),
            "the record was empty: {}",
            run.stderr()
        );
    }

    /// The keycodes the X server holds down.
    fn keys_down(conn: &RustConnection) -> Vec<u8> {
        let keys = conn.query_keymap().unwrap().reply().unwrap().keys;
        (8..=255u8)
            .filter(|&k| keys[usize::from(k / 8)] & (1 << (k % 8)) != 0)
            .collect()
    }

    /// Whether the X server holds `button` (1–5) down.
    fn button_down(conn: &RustConnection, button: u8) -> bool {
        let root = conn.setup().roots[0].root;
        let mask = u16::from(conn.query_pointer(root).unwrap().reply().unwrap().mask);
        mask & (0x80 << button) != 0
    }

    /// A key or button edge sent by the test's own connection: another XTEST client, beside the engine.
    fn xtest(conn: &RustConnection, kind: u8, code: u8) {
        use x11rb::protocol::xtest::ConnectionExt as _;
        let root = conn.setup().roots[0].root;
        conn.xtest_fake_input(kind, code, 0, root, 0, 0, 0).unwrap();
        conn.get_input_focus().unwrap().reply().unwrap();
    }

    /// What a process outside the shim's tree, model code in the session's temporary directory, can do to a record it
    /// finds there: every FIFO under `dir` is drained, then given `records` (each a record of fix 4's layout or of the
    /// present one). -> the FIFOs it reached.
    fn forge(dir: &Path, records: &[Vec<u8>]) -> Vec<PathBuf> {
        use std::io::{Read, Write as _};
        use std::os::unix::fs::{FileTypeExt, OpenOptionsExt};
        let mut reached = Vec::new();
        let mut pending = vec![dir.to_path_buf()];
        while let Some(at) = pending.pop() {
            for entry in std::fs::read_dir(&at).into_iter().flatten().flatten() {
                let (path, kind) = (entry.path(), entry.file_type().unwrap());
                if kind.is_dir() {
                    pending.push(path);
                } else if kind.is_fifo() {
                    let flags = rustix::fs::OFlags::NONBLOCK.bits() as i32;
                    if let Ok(mut reader) = std::fs::OpenOptions::new().read(true).custom_flags(flags).open(&path) {
                        let mut stolen = [0u8; 4096];
                        while reader.read(&mut stolen).is_ok_and(|n| n > 0) {}
                    }
                    if let Ok(mut writer) = std::fs::OpenOptions::new().write(true).custom_flags(flags).open(&path) {
                        for record in records {
                            let _ = writer.write(record);
                        }
                        reached.push(path);
                    }
                }
            }
        }
        reached
    }

    /// A record holding `keys`, in fix 4's layout (128 bytes, the set listed) and in the present one (72 bytes, a
    /// keycode bitmap and a button bitmap).
    fn forged(keys: &[u8]) -> Vec<Vec<u8>> {
        let mut listed = b"cuaH\x01".to_vec();
        listed.extend([keys.len() as u8, 0, 0]);
        for &k in keys {
            listed.extend([1, k]);
        }
        listed.resize(128, 0);
        let mut bitmap = b"cuaH\x02\x00\x00\x00".to_vec();
        bitmap.resize(72, 0);
        for &k in keys {
            bitmap[8 + usize::from(k / 8)] |= 1 << (k % 8);
        }
        vec![listed, bitmap]
    }

    #[test]
    fn a_record_forged_from_the_session_s_temporary_directory_releases_nothing_another_client_holds() {
        // the XTEST devices are shared: a key down there need not be the engine's, so only the engine may say what it
        // holds. Here another client holds Shift and the engine holds nothing; a process outside the shim's tree forges
        // a record naming Shift through whatever it can reach in TMPDIR; the shim's program ends
        let conn = connect();
        let tmp = Scratch::new("live-forge");
        let shift = keycode_of(&conn, SHIFT_L);
        xtest(&conn, x11rb::protocol::xproto::KEY_PRESS_EVENT, shift);
        let mut shim = Command::new(engine())
            .args([SHIM, &std::process::id().to_string(), "sleep", "1"])
            .env("TMPDIR", &tmp.0)
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        sleep(Duration::from_millis(300));
        let reached = forge(&tmp.0, &forged(&[shift]));
        let status = shim.wait().unwrap();
        let mut said = String::new();
        std::io::Read::read_to_string(shim.stderr.as_mut().unwrap(), &mut said).unwrap();
        let after = held(&conn).0;
        clean(&conn);
        assert_eq!(status.code(), Some(0));
        assert!(
            after,
            "Shift, another client's, is still down: the forger reached {reached:?}; the shim said {said:?}"
        );
    }

    #[test]
    fn a_record_drained_or_emptied_from_the_session_s_temporary_directory_still_releases_what_the_engine_held() {
        let conn = connect();
        let tmp = Scratch::new("live-suppress");
        let mut run = Shimmed::start(&tmp, true);
        run.hold(&conn);
        let reached = forge(&tmp.0, &forged(&[]));
        signal(run.engine, Signal::KILL);
        let _ = run.shell.wait();
        let after = held(&conn);
        clean(&conn);
        assert_eq!(
            after,
            (false, false),
            "Shift and button 1 released: the forger reached {reached:?}; the shim said {}",
            run.stderr()
        );
    }

    #[test]
    fn more_held_keys_than_fix_4_s_record_carried_are_all_released() {
        // fix 4's record carried 60; the key API sets no limit. Escape last, as the review found it left down
        let conn = connect();
        let tmp = Scratch::new("live-many");
        let mut run = Shimmed::start(&tmp, true);
        let mut names: Vec<String> = ('a'..='z').chain('0'..='9').map(String::from).collect();
        names.extend((1..=12).map(|n| format!("f{n}")));
        names.extend(
            [
                ",",
                ".",
                "/",
                ";",
                "[",
                "]",
                "-",
                "=",
                "tab",
                "home",
                "end",
                "left",
                "up",
                "right",
                "down",
                "pgup",
                "pgdn",
                "insert",
                "delete",
                "backspace",
                "space",
                "esc",
            ]
            .map(String::from),
        );
        for name in &names {
            run.request("key_down", json!({"key": name}));
        }
        let before = keys_down(&conn);
        assert!(before.len() > 60, "{} keys held: {before:?}", before.len());
        signal(run.engine, Signal::KILL);
        let _ = run.shell.wait();
        let after = keys_down(&conn);
        for &k in &before {
            xtest(&conn, x11rb::protocol::xproto::KEY_RELEASE_EVENT, k);
        }
        assert!(
            after.is_empty(),
            "every one of the {} released; left {after:?}; the shim said {}",
            before.len(),
            run.stderr()
        );
    }

    #[test]
    fn an_engine_still_inside_a_request_when_its_worker_is_gone_is_ended_before_the_release() {
        // the sandbox disabled: the shim's program stands for the trusted worker, the engine its child, so the
        // supervisor's death ends the worker and not the engine, whose stdin's end does not cut the request it runs (a
        // wheel scroll of 655 steps, 36 ms each). The shim must end the engine before it releases: once the shim has
        // exited, the engine is gone and no wheel press comes any more
        let conn = connect();
        let tmp = Scratch::new("live-busy");
        let worker = tmp.0.join("worker.sh");
        std::fs::write(
            &worker,
            "exec 8<&0\n\"$1\" server --desktop dedicated <&8 8<&- &\necho $! > \"$2\"\nwait\n",
        )
        .unwrap();
        let pidfile = tmp.0.join("engine.pid");
        let stderr = tmp.0.join("stderr");
        let mut shell = Command::new("sh")
            .args([
                "-c",
                &format!("exec 9<&0; \"$0\" {SHIM} $$ /bin/sh \"$1\" \"$0\" \"$2\" <&9 9<&- & echo $! >&2; wait $!"),
                &engine(),
                worker.to_str().unwrap(),
                pidfile.to_str().unwrap(),
            ])
            .env("TMPDIR", &tmp.0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(std::fs::File::create(&stderr).unwrap())
            .spawn()
            .unwrap();
        let mut stdin = shell.stdin.take().unwrap();
        let mut stdout = BufReader::new(shell.stdout.take().unwrap());
        let started = Instant::now();
        let (shim, engine) = loop {
            let said = std::fs::read_to_string(&stderr).unwrap();
            let pid = std::fs::read_to_string(&pidfile).unwrap_or_default();
            if let (Some(shim), Ok(engine)) = (said.lines().next(), pid.trim().parse::<u32>()) {
                break (shim.trim().parse::<u32>().unwrap(), engine);
            }
            assert!(started.elapsed() < Duration::from_secs(5), "no pids");
            sleep(Duration::from_millis(5));
        };
        writeln!(
            stdin,
            "{}",
            json!({"id": 1, "command": "key_down", "input": {"key": "shift"}})
        )
        .unwrap();
        let mut line = String::new();
        stdout.read_line(&mut line).unwrap();
        assert!(line.contains("\"ok\":true"), "{line}");
        let scroll =
            json!({"id": 2, "command": "scroll", "input": {"x": 300, "y": 300, "direction": "down", "pixels": 65535}});
        writeln!(stdin, "{scroll}").unwrap();
        stdin.flush().unwrap();
        let until = Instant::now() + Duration::from_secs(3);
        while !button_down(&conn, 5) {
            assert!(Instant::now() < until, "the scroll never pressed its wheel button");
            sleep(Duration::from_millis(1));
        }
        signal(shell.id(), Signal::KILL);
        let _ = shell.wait();
        // the worker's death closes the engine's stdin
        drop(stdin);
        assert!(wait_exited(shim, Duration::from_secs(5)), "the shim ends");
        let engine_left = state(engine).filter(|s| !matches!(s, 'Z' | 'X'));
        let mut pressed_after = 0;
        let until = Instant::now() + Duration::from_millis(600);
        while Instant::now() < until {
            pressed_after += usize::from(button_down(&conn, 5));
            sleep(Duration::from_millis(2));
        }
        let shift_after = held(&conn).0;
        if !exited(engine) {
            signal(engine, Signal::KILL);
        }
        xtest(&conn, x11rb::protocol::xproto::BUTTON_RELEASE_EVENT, 5);
        clean(&conn);
        let said = std::fs::read_to_string(&stderr).unwrap();
        assert_eq!(
            engine_left, None,
            "the engine was ended before the shim released; the shim said {said}"
        );
        assert_eq!(
            pressed_after, 0,
            "no wheel press after the shim's release; the shim said {said}"
        );
        assert!(!shift_after, "Shift released; the shim said {said}");
    }

    #[test]
    fn without_the_shim_a_killed_engine_leaves_its_keys_and_buttons_down() {
        // the control: what the namespace's SIGKILL did to the engine before fix 4
        let conn = connect();
        let tmp = Scratch::new("live-control");
        let mut run = Shimmed::start(&tmp, false);
        run.hold(&conn);
        signal(run.engine, Signal::KILL);
        let _ = run.shell.wait();
        let after = held(&conn);
        clean(&conn);
        assert_eq!(after, (true, true), "both left down");
    }
}
