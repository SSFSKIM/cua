//! `cua-engine`: cua's own Linux native engine (#171), speaking the vendor helper's wire on stdin and stdout.
//!
//! M0's spike: `list_windows`, `get_window_state` and the background route's `press_key` and `click`, with the
//! fetching and waiting variants M0.3 measures. See `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`.

mod atspi;
mod capture;
mod dbus;
mod engine;
mod input;
mod keys;
mod tree;
mod wire;
mod x11;

use std::io::{BufRead, Write};
use std::time::Duration;

use engine::{BusMode, Config, Engine, TreeMode};
use x11::Retention;

const USAGE: &str = "usage: cua-engine server [--mouse-size-px <n>] [--desktop shared|dedicated]
       [--tree sequential|frontier|cache] [--window-calls <W>] [--window-bytes <R>] [--call-reservation <bytes>]
       [--slack-nodes <n>] [--retention per-request|session|none] [--settle-ms <ms>] [--teardown-ms <ms>]
       [--key-pace-ms <ms>] [--bus persistent|per-request] [--stats]
       cua-engine --version";

fn version() -> String {
    format!(
        "cua-engine {} ({})",
        env!("CARGO_PKG_VERSION"),
        env!("CUA_ENGINE_GIT_SHA")
    )
}

/// The spike's defaults: the frontier read with W 64, R 4 MiB, 4 KiB per call in flight (Design, Observation);
/// session retention; the vendor's waits until M0.3 measures them.
fn default_config() -> Config {
    Config {
        tree: TreeMode::Frontier,
        window: tree::Window {
            calls: 64,
            bytes: 4 * 1024 * 1024,
            reservation: 4 * 1024,
            slack: 16,
        },
        retention: Retention::Session,
        settle: Duration::from_millis(100),
        pacing: input::Pacing {
            key: Duration::from_millis(33),
            teardown: Duration::from_millis(100),
        },
        bus: BusMode::Persistent,
        stats: false,
        mouse_size_px: 0,
        desktop: "shared".into(),
    }
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
            "--mouse-size-px" => cfg.mouse_size_px = number(value, arg)? as u32,
            "--desktop" => {
                cfg.desktop = match value.map(String::as_str) {
                    Some(mode @ ("shared" | "dedicated")) => mode.to_string(),
                    _ => return Err("--desktop is shared or dedicated".into()),
                }
            }
            "--tree" => {
                cfg.tree = match value.map(String::as_str) {
                    Some("sequential") => TreeMode::Sequential,
                    Some("frontier") => TreeMode::Frontier,
                    Some("cache") => TreeMode::Cache,
                    _ => return Err("--tree is sequential, frontier or cache".into()),
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
            "--teardown-ms" => cfg.pacing.teardown = Duration::from_millis(number(value, arg)?),
            "--key-pace-ms" => cfg.pacing.key = Duration::from_millis(number(value, arg)?),
            "--bus" => {
                cfg.bus = match value.map(String::as_str) {
                    Some("persistent") => BusMode::Persistent,
                    Some("per-request") => BusMode::PerRequest,
                    _ => return Err("--bus is persistent or per-request".into()),
                }
            }
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn the_defaults_are_the_spike_s_starting_point() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert_eq!(cfg.tree, TreeMode::Frontier);
        assert_eq!(
            (cfg.window.calls, cfg.window.bytes, cfg.window.reservation),
            (64, 4 << 20, 4 << 10)
        );
        assert_eq!(cfg.retention, Retention::Session);
        assert_eq!(cfg.mouse_size_px, 0);
    }

    #[test]
    fn variants_and_vendor_options_parse_in_any_order() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&[
            "--mouse-size-px",
            "12",
            "server",
            "--tree",
            "sequential",
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
            "--bus",
            "per-request",
            "--stats",
        ])) else {
            panic!()
        };
        assert_eq!(cfg.tree, TreeMode::Sequential);
        assert_eq!(
            (cfg.window.calls, cfg.window.bytes, cfg.window.reservation),
            (8, 65536, 1024)
        );
        assert_eq!(cfg.retention, Retention::PerRequest);
        assert_eq!(cfg.settle, Duration::ZERO);
        assert_eq!(cfg.bus, BusMode::PerRequest);
        assert!(cfg.stats);
        assert_eq!(cfg.mouse_size_px, 12);
    }

    #[test]
    fn bad_arguments_are_refused() {
        assert!(parse_args(&args(&["server", "--tree", "level"])).is_err());
        assert!(parse_args(&args(&["server", "--window-calls"])).is_err());
        assert!(parse_args(&args(&["--stats"])).is_err());
        assert!(matches!(parse_args(&args(&["--version"])), Ok(Command::Version)));
    }
}
