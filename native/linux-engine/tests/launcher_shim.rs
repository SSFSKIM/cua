//! `cua-engine launcher-shim <parent pid> <program> [args...]`: the REPL host's resident shim for the trusted worker's
//! sandbox launcher (src/repl-host/kernel-child.mjs, `src/shim.rs`). It stays the program's parent: when the parent it
//! names dies it SIGKILLs the program at once, so the launcher never outlives its supervisor, held or not; once the
//! program is reaped, and the engine under it has closed its held record, it releases what that record still shows
//! down on the XTEST devices, then exits as the program did (the design session's ruling, M4 T7b fix 4).
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
fn the_record_is_a_fifo_under_tmpdir_named_to_the_program_and_goes_with_the_shim() {
    let tmp = Scratch::new("record");
    let out = Command::new(engine())
        .args([
            SHIM,
            &std::process::id().to_string(),
            "sh",
            "-c",
            "echo \"$CUA_ENGINE_HELD_RECORD\"; test -p \"$CUA_ENGINE_HELD_RECORD\" && echo fifo; stat -c %a \"$(dirname \"$CUA_ENGINE_HELD_RECORD\")\"",
        ])
        .env("TMPDIR", &tmp.0)
        .output()
        .unwrap();
    let said = String::from_utf8_lossy(&out.stdout);
    let lines: Vec<&str> = said.lines().collect();
    assert!(Path::new(lines[0]).starts_with(&tmp.0), "{said}");
    assert_eq!(lines[1..], ["fifo", "700"], "{said}");
    assert!(tmp.entries().is_empty(), "removed with the shim: {:?}", tmp.entries());
    let without = Command::new(engine())
        .args([
            SHIM,
            &std::process::id().to_string(),
            "sh",
            "-c",
            "echo \"[$CUA_ENGINE_HELD_RECORD]\"",
        ])
        .env_remove("TMPDIR")
        .output()
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&without.stdout), "[]\n", "no TMPDIR, no record");
}

#[test]
fn a_stderr_nobody_reads_any_more_does_not_change_how_the_shim_exits() {
    // a supervisor gone has closed the other end of the shim's stderr: what the shim says there after its release (here
    // that it could not release, with no display) must not end it otherwise than as its program ended
    let tmp = Scratch::new("stderr");
    // one record holding key 50, written in two pieces, then the program's exit
    let program =
        "{ printf 'cuaH\\001\\001\\000\\000\\001\\062'; head -c 118 /dev/zero; } > \"$CUA_ENGINE_HELD_RECORD\"; exit 3";
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
