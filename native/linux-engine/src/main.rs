//! `cua-engine`: cua's own Linux native engine (#171), speaking the vendor helper's wire on stdin and stdout.
//!
//! M1a's engine core (`README.md` says what it answers). See `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`.

mod apps;
mod atspi;
mod caps;
mod capture;
mod clipboard;
mod copy;
mod cover;
mod dbus;
mod desktop;
mod dnd;
mod engine;
mod families;
#[cfg(test)]
mod fault;
mod field;
mod input;
mod keys;
mod paste;
mod readiness;
mod resolve;
mod route;
mod shm;
mod table;
mod tree;
mod wire;
mod x11;

use std::io::{BufRead, Write};
use std::time::Duration;

use engine::{Config, Engine};
use readiness::CaptureWait;
use x11::Retention;

const USAGE: &str = "usage: cua-engine server [--mouse-size-px <n>] [--desktop shared|dedicated]
       [--window-calls <W>] [--window-bytes <R>] [--call-reservation <bytes>] [--slack-nodes <n>]
       [--retention per-request|session|none] [--settle-ms <ms>] [--capture-wait damage|fixed]
       [--teardown-ms <ms>] [--key-pace-ms <ms>] [--drag-step-ms <ms> | --drag-step-us <µs>] [--drag-press-dwell-ms <ms>]
       [--drag-release-dwell-ms <ms>] [--drag-dnd-wait-ms <ms>] [--dnd-cancel-after-release] [--stats]
       cua-engine --version";

fn version() -> String {
    format!(
        "cua-engine {} ({})",
        env!("CARGO_PKG_VERSION"),
        env!("CUA_ENGINE_GIT_SHA")
    )
}

/// The defaults: the tree read's window as M0 chose it (Design, Observation); session retention; no wait after a
/// redirect before input and no key pacing, with the vendor's 100 ms before `FocusOut` (Design, Retention and the
/// fixed waits); a capture's wait is the readiness rule.
fn default_config() -> Config {
    Config {
        window: tree::WINDOW,
        retention: Retention::Session,
        settle: Duration::ZERO,
        capture_wait: CaptureWait::Damage,
        pacing: input::Pacing {
            key: Duration::ZERO,
            teardown: Duration::from_millis(100),
            drag: None,
        },
        stats: false,
        mouse_size_px: 0,
        desktop: engine::DesktopMode::Shared,
        dnd_cancel_late: false,
        dnd_wait: std::time::Duration::ZERO,
    }
}

/// A drag flag fixes the drag's waits for every target, the ones it does not name at zero.
fn fixed_drag(cfg: &mut Config) -> &mut families::DragPacing {
    cfg.pacing.drag.get_or_insert(families::DragPacing::NONE)
}

enum Command {
    Version,
    Server(Config),
}

fn parse_args(args: &[String]) -> Result<Command, String> {
    let mut cfg = default_config();
    let mut server = false;
    let mut i = 0;
    let number = |value: Option<&String>, flag: &str| -> Result<u64, String> {
        value
            .ok_or_else(|| format!("{flag} needs a value"))?
            .parse::<u64>()
            .map_err(|_| format!("{flag} needs a non-negative integer"))
    };
    while i < args.len() {
        let arg = args[i].as_str();
        let value = args.get(i + 1);
        let mut takes_value = true;
        match arg {
            "--version" | "-V" => return Ok(Command::Version),
            "server" => {
                server = true;
                takes_value = false;
            }
            "--stats" => {
                cfg.stats = true;
                takes_value = false;
            }
            "--dnd-cancel-after-release" => {
                cfg.dnd_cancel_late = true;
                takes_value = false;
            }
            "--mouse-size-px" => cfg.mouse_size_px = number(value, arg)? as u32,
            "--desktop" => {
                cfg.desktop = match value.map(String::as_str) {
                    Some("shared") => engine::DesktopMode::Shared,
                    Some("dedicated") => engine::DesktopMode::Dedicated,
                    _ => return Err("--desktop is shared or dedicated".into()),
                }
            }
            "--window-calls" => cfg.window.calls = number(value, arg)?.max(1) as usize,
            "--window-bytes" => cfg.window.bytes = number(value, arg)?.max(1) as usize,
            "--call-reservation" => cfg.window.reservation = number(value, arg)? as usize,
            "--slack-nodes" => cfg.window.slack = number(value, arg)?.min(u32::MAX as u64) as u32,
            "--retention" => {
                cfg.retention = match value.map(String::as_str) {
                    Some("per-request") => Retention::PerRequest,
                    Some("session") => Retention::Session,
                    Some("none") => Retention::None,
                    _ => return Err("--retention is per-request, session or none".into()),
                }
            }
            "--settle-ms" => cfg.settle = Duration::from_millis(number(value, arg)?),
            "--capture-wait" => {
                cfg.capture_wait = match value.map(String::as_str) {
                    Some("damage") => CaptureWait::Damage,
                    Some("fixed") => CaptureWait::Fixed,
                    _ => return Err("--capture-wait is damage or fixed".into()),
                }
            }
            "--teardown-ms" => cfg.pacing.teardown = Duration::from_millis(number(value, arg)?),
            "--key-pace-ms" => cfg.pacing.key = Duration::from_millis(number(value, arg)?),
            "--drag-step-ms" => fixed_drag(&mut cfg).step = Duration::from_millis(number(value, arg)?),
            "--drag-step-us" => fixed_drag(&mut cfg).step = Duration::from_micros(number(value, arg)?),
            "--drag-press-dwell-ms" => fixed_drag(&mut cfg).press = Duration::from_millis(number(value, arg)?),
            "--drag-release-dwell-ms" => fixed_drag(&mut cfg).release = Duration::from_millis(number(value, arg)?),
            "--drag-dnd-wait-ms" => cfg.dnd_wait = Duration::from_millis(number(value, arg)?),
            other => return Err(format!("unknown argument {other}")),
        }
        i += if takes_value { 2 } else { 1 };
    }
    if !server {
        return Err("a command is required".into());
    }
    Ok(Command::Server(cfg))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cfg = match parse_args(&args) {
        Ok(Command::Version) => {
            println!("{}", version());
            return;
        }
        Ok(Command::Server(cfg)) => cfg,
        Err(message) => {
            eprintln!("{message}\n{USAGE}");
            std::process::exit(2);
        }
    };
    let mut engine = match Engine::new(cfg) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("Error {error:#}");
            std::process::exit(1);
        }
    };
    let code = serve(&mut engine);
    engine.shutdown();
    std::process::exit(code);
}

/// The server loop: one line in, one line out, strictly in order (behaviour §1).
fn serve(engine: &mut Engine) -> i32 {
    let stdin = std::io::stdin();
    let mut stdin = stdin.lock();
    let stdout = std::io::stdout();
    let mut line = String::new();
    loop {
        line.clear();
        match stdin.read_line(&mut line) {
            Ok(0) => return 0,
            Ok(_) => {}
            Err(error) => {
                eprintln!("Error failed to read server request: {error}");
                return 1;
            }
        }
        let response = match wire::parse_line(&line) {
            wire::Line::Blank => continue,
            wire::Line::Malformed(message) => wire::Response::failure(serde_json::Value::Null, message),
            wire::Line::Request(request) => engine.handle(request),
        };
        let mut out = stdout.lock();
        let written = writeln!(out, "{}", response.to_line()).and_then(|()| out.flush());
        if let Err(error) = written {
            eprintln!("Error failed to write server response: {error}");
            return 1;
        }
        engine.after_response();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_defaults_are_m0_s_choices() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert_eq!(
            (
                cfg.window.calls,
                cfg.window.bytes,
                cfg.window.reservation,
                cfg.window.slack
            ),
            (32, 4 << 20, 4 << 10, 8)
        );
        assert_eq!(cfg.retention, Retention::Session);
        assert_eq!(cfg.capture_wait, CaptureWait::Damage);
        assert_eq!(cfg.mouse_size_px, 0);
        assert_eq!(
            cfg.desktop,
            engine::DesktopMode::Shared,
            "a person may be using the desktop"
        );
        let Ok(Command::Server(dedicated)) = parse_args(&args(&["server", "--desktop", "dedicated"])) else {
            panic!()
        };
        assert_eq!(dedicated.desktop, engine::DesktopMode::Dedicated);
        assert_eq!(
            (cfg.settle, cfg.pacing.key, cfg.pacing.teardown),
            (Duration::ZERO, Duration::ZERO, Duration::from_millis(100)),
            "no input settle and no key pacing; the 100 ms before FocusOut stays"
        );
    }

    #[test]
    fn drags_are_paced_by_the_target_s_family_unless_a_flag_fixes_the_pacing() {
        use crate::families::DragPacing;
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert_eq!(
            cfg.pacing.drag, None,
            "by family (families.rs): no wait unless the family is listed"
        );
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--drag-step-ms", "0"])) else {
            panic!()
        };
        assert_eq!(cfg.pacing.drag, Some(DragPacing::NONE));
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--drag-step-ms", "1"])) else {
            panic!()
        };
        assert_eq!(
            cfg.pacing.drag.map(|p| p.step),
            Some(Duration::from_millis(1)),
            "the vendor's, for measurement"
        );
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--drag-step-us", "500"])) else {
            panic!()
        };
        assert_eq!(cfg.pacing.drag.map(|p| p.step), Some(Duration::from_micros(500)));
        let Ok(Command::Server(cfg)) = parse_args(&args(&[
            "server",
            "--drag-press-dwell-ms",
            "30",
            "--drag-release-dwell-ms",
            "20",
        ])) else {
            panic!()
        };
        assert_eq!(
            cfg.pacing.drag,
            Some(DragPacing {
                step: Duration::ZERO,
                press: Duration::from_millis(30),
                release: Duration::from_millis(20),
            })
        );
    }

    #[test]
    fn measurement_and_vendor_options_parse_in_any_order() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&[
            "--mouse-size-px",
            "12",
            "server",
            "--window-calls",
            "8",
            "--window-bytes",
            "65536",
            "--call-reservation",
            "1024",
            "--retention",
            "per-request",
            "--settle-ms",
            "0",
            "--capture-wait",
            "fixed",
            "--stats",
        ])) else {
            panic!()
        };
        assert_eq!(
            (cfg.window.calls, cfg.window.bytes, cfg.window.reservation),
            (8, 65536, 1024)
        );
        assert_eq!(cfg.retention, Retention::PerRequest);
        assert_eq!(cfg.settle, Duration::ZERO);
        assert_eq!(cfg.capture_wait, CaptureWait::Fixed);
        assert!(cfg.stats);
        assert_eq!(cfg.mouse_size_px, 12);
    }

    #[test]
    fn bad_arguments_are_refused() {
        for removed in [
            ["--tree", "frontier"],
            ["--bus", "persistent"],
            ["--children-after-role", "x"],
        ] {
            let mut list = vec!["server"];
            list.extend(removed);
            assert!(
                parse_args(&args(&list)).is_err(),
                "{removed:?} left the engine with M1a"
            );
        }
        assert!(parse_args(&args(&["server", "--capture-wait", "40"])).is_err());
        assert!(parse_args(&args(&["server", "--desktop", "owned"])).is_err());
        assert!(parse_args(&args(&["server", "--window-calls"])).is_err());
        assert!(parse_args(&args(&["--stats"])).is_err());
        assert!(matches!(parse_args(&args(&["--version"])), Ok(Command::Version)));
    }

    #[test]
    fn the_version_line_names_the_package_version_and_the_commit() {
        let line = version();
        let rest = line.strip_prefix("cua-engine ").expect(&line);
        let (semver, sha) = rest.split_once(' ').expect(&line);
        assert_eq!(semver, env!("CARGO_PKG_VERSION"));
        assert!(sha.starts_with('(') && sha.ends_with(')') && sha.len() > 2, "{line}");
    }
}
