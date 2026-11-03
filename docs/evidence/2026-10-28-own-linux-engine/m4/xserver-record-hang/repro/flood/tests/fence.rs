//! #171 task 44: the repro's load and record reach only a private display. Each test starts its own Xvfb
//! (`-displayfd`, so the display is the server's choice and no one else's) and ends it; nothing here names another
//! display. Unmarked, every mode is refused before it loads the display; marked, it runs.

use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

const MARK: &str = "CUA171_PRIVATE_DISPLAY";

/// An Xvfb of the test's own, ended when dropped.
struct Server {
    child: Child,
    display: String,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn own_server() -> Server {
    let mut child = Command::new("Xvfb")
        .args([
            "-displayfd",
            "1",
            "-noreset",
            "-nolisten",
            "tcp",
            "-screen",
            "0",
            "64x64x24",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("Xvfb");
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let number = line.trim().to_string();
    let server = Server {
        child,
        display: format!(":{number}"),
    };
    assert!(
        !number.is_empty() && number.bytes().all(|b| b.is_ascii_digit()),
        "Xvfb named no display: {line:?}"
    );
    server
}

fn mark(server: &Server) {
    let status = Command::new("xprop")
        .args(["-root", "-f", MARK, "8s", "-set", MARK, "1"])
        .env("DISPLAY", &server.display)
        .status()
        .unwrap();
    assert!(status.success());
}

fn flood(server: &Server, args: &[&str]) -> Child {
    Command::new(env!("CARGO_BIN_EXE_task41-flood"))
        .args(args)
        .env("DISPLAY", &server.display)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap()
}

/// What an ended child printed, stdout and stderr (`ping` reports on stdout, the rest on stderr).
fn printed(child: &mut Child) -> String {
    let mut text = String::new();
    child
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    child
        .stderr
        .take()
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    text
}

fn ended_within(child: &mut Child, within: Duration) -> Option<ExitStatus> {
    let deadline = Instant::now() + within;
    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().unwrap() {
            return Some(status);
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    None
}

#[test]
fn every_mode_refuses_a_display_not_marked_private() {
    let server = own_server();
    for args in [
        &["ping", "10", "1000"][..],
        &["churn", "3", "10"],
        &["flood", "3", "1", "10"],
        &["slowrec", "2", "4096", "1000"],
    ] {
        let mut child = flood(&server, args);
        let Some(status) = ended_within(&mut child, Duration::from_secs(5)) else {
            let _ = child.kill();
            let _ = child.wait();
            panic!("{args:?} ran on a display not marked private");
        };
        let output = printed(&mut child);
        assert!(
            !status.success(),
            "{args:?} succeeded on an unmarked display"
        );
        assert!(
            output.contains(&format!("not marked {MARK}")),
            "{args:?}: {output}"
        );
    }
}

#[test]
fn a_display_marked_private_is_reached() {
    let server = own_server();
    mark(&server);
    let mut child = flood(&server, &["ping", "10", "1000"]);
    let ended = ended_within(&mut child, Duration::from_secs(1));
    let _ = child.kill();
    let _ = child.wait();
    assert!(ended.is_none(), "ping ended on a marked display: {ended:?}");
}
