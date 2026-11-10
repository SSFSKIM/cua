//! `cua-engine`: cua's own Linux native engine (#171), speaking the vendor helper's wire on stdin and stdout.
//!
//! M1a's engine core (`README.md` says what it answers). See `docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md`.

mod accept;
#[cfg(test)]
mod alloc_watch;
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
mod focus_ack;
mod held;
mod identity;
mod input;
mod keys;
mod paste;
mod pressed;
mod readiness;
mod resolve;
mod route;
mod serve;
mod settle;
mod shim;
mod shm;
mod stray;
mod table;
mod tree;
mod wire;
mod x11;

use std::time::Duration;

use engine::{Config, Engine};
use readiness::CaptureWait;
use x11::Retention;

const USAGE: &str = "usage: cua-engine server [--mouse-size-px <n>] [--desktop shared|dedicated]
       [--window-calls <W>] [--window-bytes <R>] [--call-reservation <bytes>] [--slack-nodes <n>]
       [--retention per-request|session|none] [--settle-ms <ms>] [--capture-wait damage|fixed|quiet]
       [--teardown-ms <ms>] [--exit-settle-ms <ms>] [--paste-settle-ms <ms>] [--key-pace-ms <ms>] [--path-step-ms <ms>] [--drag-step-ms <ms> | --drag-step-us <µs>] [--drag-press-dwell-ms <ms>]
       [--drag-release-dwell-ms <ms>] [--drag-dnd-hold-ms <ms>] [--drag-dnd-after-take-ms <ms>] [--dnd-cancel-after-release] [--dnd-defer-take]
       [--drag-dnd-release-at-accept] [--drag-ignore-cover] [--ignore-cover]
       [--targets-wait-ms <ms>] [--focus-ack-ms <ms>] [--stats]
       cua-engine launcher-shim <parent pid> <program> [args...]
       cua-engine --version";

fn version() -> String {
    format!(
        "cua-engine {} ({})",
        env!("CARGO_PKG_VERSION"),
        env!("CUA_ENGINE_GIT_SHA")
    )
}

/// The defaults: the tree read's window as M0 chose it (Design, Observation); session retention; no wait after a
/// redirect before input, no key pacing and no wait before `FocusOut` (M4's T7 as ruled on task 59), the exit's settle
/// after input and a paste's after keys and after clicks (`settle.rs`), a background press's wait for a Qt window's focus
/// (`focus_ack.rs`); a capture's wait is the readiness rule.
fn default_config() -> Config {
    Config {
        window: tree::WINDOW,
        retention: Retention::Session,
        settle: Duration::ZERO,
        capture_wait: CaptureWait::Damage,
        pacing: input::Pacing {
            key: Duration::ZERO,
            path: desktop::PATH_STEP,
            teardown: Duration::ZERO,
            exit_settle: settle::EXIT_SETTLE,
            paste_settle: settle::PASTE_SETTLE,
            paste_click_settle: settle::PASTE_CLICK_SETTLE,
            drag: None,
        },
        stats: false,
        mouse_size_px: 0,
        desktop: engine::DesktopMode::Shared,
        dnd_cancel_late: false,
        dnd_defer_take: false,
        dnd_hold: crate::dnd::TAKE_HOLD_AFTER_PRESS,
        dnd_after_take: crate::dnd::RELEASE_AFTER_TAKE,
        targets_wait: None,
        focus_ack: focus_ack::FOCUS_ACK,
        dnd_release_at_accept: false,
        drag_ignore_cover: false,
        ignore_cover: false,
    }
}

/// A drag flag fixes the drag's waits for every target, the ones it does not name at zero.
fn fixed_drag(cfg: &mut Config) -> &mut families::DragPacing {
    cfg.pacing.drag.get_or_insert(families::DragPacing::NONE)
}

enum Command {
    Version,
    /// The REPL host's launcher shim (`shim.rs`).
    LauncherShim {
        parent: i32,
        program: String,
        args: Vec<String>,
    },
    /// Boxed: the configuration is far larger than the version's nothing.
    Server(Box<Config>),
}

fn parse_args(args: &[String]) -> Result<Command, String> {
    // the shim's arguments after its parent are the program's own, never read as the engine's flags
    if args.first().map(String::as_str) == Some(shim::SUBCOMMAND) {
        let parent = args
            .get(1)
            .and_then(|p| p.parse::<i32>().ok())
            .filter(|&p| p > 0)
            .ok_or_else(|| format!("{} needs the parent's pid", shim::SUBCOMMAND))?;
        let program = args
            .get(2)
            .ok_or_else(|| format!("{} needs a program", shim::SUBCOMMAND))?;
        return Ok(Command::LauncherShim {
            parent,
            program: program.clone(),
            args: args[3..].to_vec(),
        });
    }
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
            "--drag-elapsed" => {
                fixed_drag(&mut cfg).elapsed = true;
                takes_value = false;
            }
            "--held-lead-pause" => {
                fixed_drag(&mut cfg).held_lead_pause = true;
                takes_value = false;
            }
            "--dnd-cancel-after-release" => {
                cfg.dnd_cancel_late = true;
                takes_value = false;
            }
            "--dnd-defer-take" => {
                cfg.dnd_defer_take = true;
                takes_value = false;
            }
            "--drag-dnd-release-at-accept" => {
                cfg.dnd_release_at_accept = true;
                takes_value = false;
            }
            "--drag-ignore-cover" => {
                cfg.drag_ignore_cover = true;
                takes_value = false;
            }
            "--ignore-cover" => {
                cfg.ignore_cover = true;
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
                    Some("quiet") => CaptureWait::QuietOnly,
                    _ => return Err("--capture-wait is damage, fixed or quiet".into()),
                }
            }
            "--teardown-ms" => cfg.pacing.teardown = Duration::from_millis(number(value, arg)?),
            "--exit-settle-ms" => cfg.pacing.exit_settle = Duration::from_millis(number(value, arg)?),
            "--paste-settle-ms" => cfg.pacing.paste_settle = Duration::from_millis(number(value, arg)?),
            "--paste-click-settle-ms" => cfg.pacing.paste_click_settle = Duration::from_millis(number(value, arg)?),
            "--key-pace-ms" => cfg.pacing.key = Duration::from_millis(number(value, arg)?),
            "--path-step-ms" => cfg.pacing.path = Duration::from_millis(number(value, arg)?),
            "--drag-step-ms" => fixed_drag(&mut cfg).set_step(Duration::from_millis(number(value, arg)?)),
            "--drag-step-us" => fixed_drag(&mut cfg).set_step(Duration::from_micros(number(value, arg)?)),
            "--held-step-ms" => fixed_drag(&mut cfg).held_step = Duration::from_millis(number(value, arg)?),
            "--held-step-us" => fixed_drag(&mut cfg).held_step = Duration::from_micros(number(value, arg)?),
            "--drag-rest-ms" => fixed_drag(&mut cfg).rest = Duration::from_millis(number(value, arg)?),
            "--held-rest-ms" => fixed_drag(&mut cfg).held_rest = Duration::from_millis(number(value, arg)?),
            "--drag-press-dwell-ms" => fixed_drag(&mut cfg).press = Duration::from_millis(number(value, arg)?),
            "--drag-release-dwell-ms" => fixed_drag(&mut cfg).release = Duration::from_millis(number(value, arg)?),
            "--drag-dnd-hold-ms" => cfg.dnd_hold = Duration::from_millis(number(value, arg)?),
            "--drag-dnd-after-take-ms" => cfg.dnd_after_take = Duration::from_millis(number(value, arg)?),
            "--targets-wait-ms" => cfg.targets_wait = Some(Duration::from_millis(number(value, arg)?)),
            "--focus-ack-ms" => cfg.focus_ack = Duration::from_millis(number(value, arg)?),
            other => return Err(format!("unknown argument {other}")),
        }
        i += if takes_value { 2 } else { 1 };
    }
    if !server {
        return Err("a command is required".into());
    }
    Ok(Command::Server(Box::new(cfg)))
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cfg = match parse_args(&args) {
        Ok(Command::Version) => {
            println!("{}", version());
            return;
        }
        Ok(Command::LauncherShim { parent, program, args }) => {
            // before anything else: no stop signal blocked and no thread started by the engine's own start
            let (code, sentence) = shim::launcher_shim(parent, &program, &args);
            if let Some(sentence) = sentence {
                use std::io::Write as _;
                // never a panic (an abort) for a stderr whose reader is gone
                let _ = writeln!(std::io::stderr(), "{sentence}");
            }
            std::process::exit(code);
        }
        Ok(Command::Server(cfg)) => *cfg,
        Err(message) => {
            eprintln!("{message}\n{USAGE}");
            std::process::exit(2);
        }
    };
    // the held record, for the REPL host's launcher shim (held.rs), before any input and before the engine opens
    // anything: the descriptor its worker handed down, made close-on-exec, and its name taken out of the environment,
    // so no application the engine launches is given either
    if let Some(record) = held::open_from_env() {
        pressed::record_to(record);
    }
    // SAFETY: no other thread exists yet, so nothing reads the environment meanwhile
    unsafe { std::env::remove_var(held::RECORD_ENV) };
    // before the first thread starts, so that every thread blocks the stop signals and only their own thread takes them
    if let Err(error) = serve::block_stop_signals() {
        eprintln!("Error the stop signals could not be blocked: {error}");
        std::process::exit(1);
    }
    // every exit but SIGKILL lets go of the keys still down: the orderly one in `Engine::shutdown`, the forced ones (the
    // backstop, a second SIGINT, a panic, which aborts) here, over a connection of their own (pressed.rs)
    let release = || pressed::release_all_within(pressed::FORCED_RELEASE_BOUND, pressed::over_own_connection);
    pressed::release_first_at_panic(pressed::over_own_connection);
    let (inbox, next) = std::sync::mpsc::channel();
    serve::watch_stop_signals(inbox.clone(), release);
    let mut engine = match Engine::new(cfg) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("Error {error:#}");
            std::process::exit(1);
        }
    };
    serve::read_stdin(inbox);
    let code = serve::serve(&mut engine, &next, std::io::stdout());
    engine.shutdown();
    std::process::exit(code);
}

/// The engine as the server loop drives it (`serve.rs`): each line parsed and handled (behaviour §1).
impl serve::Server for Engine {
    fn respond(&mut self, line: &str) -> Option<String> {
        let response = match wire::parse_line(line) {
            wire::Line::Blank => return None,
            wire::Line::Malformed(message) => wire::Response::failure(serde_json::Value::Null, message),
            wire::Line::Request(request) => self.handle(request),
        };
        Some(response.to_line())
    }

    fn after_response(&mut self) {
        Engine::after_response(self);
    }

    fn next_due(&self) -> Option<std::time::Instant> {
        Engine::next_due(self)
    }

    fn tick(&mut self) {
        Engine::tick(self);
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
            (Duration::ZERO, Duration::ZERO, Duration::ZERO),
            "no input settle, no key pacing and no wait before FocusOut: it goes as each request's input ends"
        );
        assert_eq!(
            (
                cfg.pacing.exit_settle,
                cfg.pacing.paste_settle,
                cfg.pacing.paste_click_settle
            ),
            (settle::EXIT_SETTLE, settle::PASTE_SETTLE, settle::PASTE_CLICK_SETTLE),
            "the exit settles after recent input, and a paste after recent keys and clicks"
        );
        let Ok(Command::Server(measured)) = parse_args(&args(&[
            "server",
            "--exit-settle-ms",
            "250",
            "--paste-settle-ms",
            "25",
            "--paste-click-settle-ms",
            "50",
            "--teardown-ms",
            "100",
        ])) else {
            panic!()
        };
        assert_eq!(
            (
                measured.pacing.exit_settle,
                measured.pacing.paste_settle,
                measured.pacing.paste_click_settle,
                measured.pacing.teardown
            ),
            (
                Duration::from_millis(250),
                Duration::from_millis(25),
                Duration::from_millis(50),
                Duration::from_millis(100)
            )
        );
        assert_eq!(
            cfg.targets_wait, None,
            "a paste's TARGETS wait is its target's family's"
        );
        let Ok(Command::Server(measured)) = parse_args(&args(&["server", "--targets-wait-ms", "1000"])) else {
            panic!()
        };
        assert_eq!(measured.targets_wait, Some(Duration::from_millis(1000)));
    }

    #[test]
    fn a_background_press_waits_for_its_focus_by_default_and_a_flag_sets_the_bound_or_turns_it_off() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert_eq!(cfg.focus_ack, focus_ack::FOCUS_ACK);
        let Ok(Command::Server(measured)) = parse_args(&args(&["server", "--focus-ack-ms", "25"])) else {
            panic!()
        };
        assert_eq!(measured.focus_ack, Duration::from_millis(25));
        let Ok(Command::Server(off)) = parse_args(&args(&["server", "--focus-ack-ms", "0"])) else {
            panic!()
        };
        assert_eq!(off.focus_ack, Duration::ZERO, "the control: no wait");
    }

    #[test]
    fn a_desktop_path_keeps_the_vendor_s_step_unless_measured() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert_eq!(cfg.pacing.path, Duration::from_millis(8), "the vendor's (M4's T9)");
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--path-step-ms", "0"])) else {
            panic!()
        };
        assert_eq!(cfg.pacing.path, Duration::ZERO, "for measurement");
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
                press: Duration::from_millis(30),
                release: Duration::from_millis(20),
                ..DragPacing::NONE
            })
        );
        // the motion model's measurement flags (M4's T11): the drag's step sets a held move's too, unless a held step
        // follows it
        let Ok(Command::Server(cfg)) = parse_args(&args(&[
            "server",
            "--drag-step-us",
            "500",
            "--held-step-ms",
            "8",
            "--drag-elapsed",
            "--drag-rest-ms",
            "20",
            "--held-lead-pause",
            "--held-rest-ms",
            "15",
        ])) else {
            panic!()
        };
        assert_eq!(
            cfg.pacing.drag,
            Some(DragPacing {
                step: Duration::from_micros(500),
                elapsed: true,
                rest: Duration::from_millis(20),
                held_step: Duration::from_millis(8),
                held_rest: Duration::from_millis(15),
                held_lead_pause: true,
                ..DragPacing::NONE
            })
        );
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--drag-step-us", "300"])) else {
            panic!()
        };
        assert_eq!(cfg.pacing.drag.map(|p| p.held_step), Some(Duration::from_micros(300)));
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
        // the control lane that takes every pixmap as complete (task 64)
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--capture-wait", "quiet"])) else {
            panic!()
        };
        assert_eq!(cfg.capture_wait, CaptureWait::QuietOnly);
    }

    #[test]
    fn t13_s_measurement_flags_are_off_by_default_and_each_turns_its_own_on() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert!(
            !cfg.dnd_release_at_accept && !cfg.drag_ignore_cover,
            "shipped behaviour unchanged"
        );
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--drag-dnd-release-at-accept"])) else {
            panic!()
        };
        assert!(cfg.dnd_release_at_accept && !cfg.drag_ignore_cover);
        let Ok(Command::Server(cfg)) = parse_args(&args(&["--drag-ignore-cover", "server"])) else {
            panic!()
        };
        assert!(cfg.drag_ignore_cover && !cfg.dnd_release_at_accept);
    }

    #[test]
    fn t19_s_ignore_cover_flag_is_off_by_default_and_apart_from_the_drag_flag() {
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server"])) else {
            panic!()
        };
        assert!(!cfg.ignore_cover, "shipped behaviour unchanged");
        let Ok(Command::Server(cfg)) = parse_args(&args(&["server", "--ignore-cover"])) else {
            panic!()
        };
        assert!(cfg.ignore_cover && !cfg.drag_ignore_cover);
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
