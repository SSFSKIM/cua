//! The request dispatcher: one request at a time, in arrival order (Design, Process model). Observation lives here;
//! input is in the child modules: keys (`keyboard`), the pointer (`pointer`), element actions (`elements`) and the
//! window and application requests (`windows`).

mod elements;
mod keyboard;
mod pointer;
mod windows;

use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow};
use serde_json::{Value, json};

use crate::apps;
use crate::atspi::{self, Association};
use crate::dbus::{Broken, Bus, BusStats};
use crate::input::Pacing;
use crate::readiness::CaptureWait;
use crate::route::Inputs;
use crate::tree;
use crate::wire::{self, GetWindowStateInput, NoInput, Request, Response, parse_input};
use crate::x11::{Retention, X11};

#[derive(Debug, Clone)]
pub struct Config {
    pub window: tree::Window,
    pub retention: Retention,
    pub settle: Duration,
    pub capture_wait: CaptureWait,
    pub pacing: Pacing,
    pub stats: bool,
    pub mouse_size_px: u32,
    pub desktop: String,
}

pub struct Engine {
    cfg: Config,
    x: X11,
    bus: Option<Bus>,
    shot_dir: Option<PathBuf>,
    bus_stats: BusStats,
    extra: serde_json::Map<String, Value>,
    /// The `--stats` line of the last request, written after its response so the line costs the request nothing.
    pending_stats: Option<String>,
    /// Held keys, their sessions and the desktop's keys, across requests.
    inputs: Inputs,
}

fn merge(into: &mut BusStats, from: BusStats) {
    into.calls += from.calls;
    into.waits += from.waits;
    into.waits_alone += from.waits_alone;
    into.max_in_flight = into.max_in_flight.max(from.max_in_flight);
    into.reply_bytes += from.reply_bytes;
    into.peak_staged = into.peak_staged.max(from.peak_staged);
    into.connections += from.connections;
    for (member, n) in from.by_member {
        *into.by_member.entry(member).or_default() += n;
    }
}

impl Engine {
    pub fn new(cfg: Config) -> Result<Engine> {
        let x = X11::connect(cfg.retention, cfg.settle, cfg.capture_wait)?;
        Ok(Engine {
            inputs: Inputs::new(cfg.pacing),
            cfg,
            x,
            bus: None,
            shot_dir: None,
            bus_stats: BusStats::default(),
            extra: Default::default(),
            pending_stats: None,
        })
    }

    pub fn handle(&mut self, request: Request) -> Response {
        self.x.drain_events();
        let started = Instant::now();
        let result = match request.command.as_str() {
            "list_windows" => self.list_windows(request.input),
            "list_apps" => self.list_apps(request.input),
            "get_screenshot" => self.get_screenshot(request.input),
            "get_window_state" => self.get_window_state(request.input),
            "press_key" => self.press_key(request.input),
            "key_down" => self.key_down(request.input),
            "key_up" => self.key_up(request.input),
            "click" => self.click(request.input),
            "move" => self.move_pointer(request.input),
            "move_relative" => self.move_relative(request.input),
            "scroll" => self.scroll(request.input),
            "drag" => self.drag(request.input),
            "drag_handle" => self.drag_handle(request.input),
            "perform_secondary_action" => self.perform_secondary_action(request.input),
            "activate_window" => self.activate_window(request.input),
            "launch_app" => self.launch_app(request.input),
            "server" => Err(anyhow!("server command cannot be nested")),
            command if wire::COMMANDS.contains(&command) => Err(anyhow!(wire::not_available(command))),
            command => Err(anyhow!("unknown command `{command}`")),
        };
        if let Some(bus) = self.bus.as_mut() {
            merge(&mut self.bus_stats, bus.take_stats());
        }
        if self.cfg.stats {
            self.print_stats(&request.id, &request.command, started, result.is_ok());
        }
        match result {
            Ok(output) => Response::success(request.id, output),
            Err(error) => Response::failure(request.id, format!("{error:#}")),
        }
    }

    fn print_stats(&mut self, id: &Value, command: &str, started: Instant, ok: bool) {
        let bus = std::mem::take(&mut self.bus_stats);
        let mut line = json!({
            "id": id,
            "command": command,
            "ok": ok,
            "elapsed_ms": (started.elapsed().as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0,
            "variant": {
                "window_calls": self.cfg.window.calls,
                "window_bytes": self.cfg.window.bytes,
                "call_reservation": self.cfg.window.reservation,
                "slack_nodes": self.cfg.window.slack,
                "retention": format!("{:?}", self.cfg.retention),
                "settle_ms": self.cfg.settle.as_millis() as u64,
                "capture_wait": format!("{:?}", self.cfg.capture_wait).to_lowercase(),
                "teardown_ms": self.cfg.pacing.teardown.as_millis() as u64,
                "key_pace_ms": self.cfg.pacing.key.as_millis() as u64,
            },
            "bus": {
                "calls": bus.calls,
                "waits": bus.waits,
                "waits_alone": bus.waits_alone,
                "max_in_flight": bus.max_in_flight,
                "reply_bytes": bus.reply_bytes,
                "peak_staged_bytes": bus.peak_staged,
                "connections": bus.connections,
                "by_member": bus.by_member,
            },
        });
        for (key, value) in std::mem::take(&mut self.extra) {
            line[key] = value;
        }
        self.pending_stats = Some(json!({ "stats": line }).to_string());
    }

    /// Writes the last request's `--stats` line, once its response is out.
    pub fn flush_stats(&mut self) {
        if let Some(line) = self.pending_stats.take() {
            eprintln!("{line}");
        }
    }

    fn drop_bus(&mut self) {
        if let Some(mut bus) = self.bus.take() {
            merge(&mut self.bus_stats, bus.take_stats());
        }
    }

    /// Runs `f` on the accessibility bus, connecting first if needed; a broken connection is reopened once.
    fn with_bus<T>(&mut self, mut f: impl FnMut(&mut Bus, &mut X11) -> Result<T>) -> Result<T> {
        for attempt in 0..2 {
            if self.bus.is_none() {
                let address = atspi::bus_address(&self.x)?;
                self.bus = Some(Bus::connect(&address)?);
            }
            let bus = self.bus.as_mut().expect("connected above");
            match f(bus, &mut self.x) {
                Err(error) if error.downcast_ref::<Broken>().is_some() && attempt == 0 => self.drop_bus(),
                Err(error) if error.downcast_ref::<Broken>().is_some() => {
                    self.drop_bus();
                    return Err(error);
                }
                other => return other,
            }
        }
        unreachable!("the second attempt returns")
    }

    fn list_windows(&mut self, input: Option<Value>) -> Result<Value> {
        let _: NoInput = parse_input(input)?;
        Ok(serde_json::to_value(self.x.list_windows()?)?)
    }

    fn get_window_state(&mut self, input: Option<Value>) -> Result<Value> {
        let input: GetWindowStateInput = parse_input(input)?;
        let id = input.window.id;
        let info = self.x.get_window(id)?;
        let window = self.cfg.window;
        let mut read_stats = tree::ReadStats::default();
        let at_spi = self.with_bus(|bus, x| {
            let frame = match atspi::associate(bus, x, &info)? {
                Association::Frame(frame) => frame,
                Association::NoMatch | Association::Refused(_) => return Ok(None),
            };
            let (tree, stats) = tree::read(bus, &frame, window)?;
            read_stats = stats;
            Ok(tree)
        });
        let (tree, source) = match at_spi {
            Ok(Some(tree)) => (tree, "at_spi"),
            _ => (self.x.fallback_tree(id)?, "x11"),
        };
        self.extra.insert(
            "tree".into(),
            json!({
                "source": source,
                "admitted": read_stats.admitted,
                "discovered": read_stats.discovered,
                "wasted_calls": read_stats.wasted_calls,
                "tables_sampled": read_stats.tables_sampled,
                "tables_listed": read_stats.tables_listed,
                "hit_tests": read_stats.hit_tests,
            }),
        );
        let tree = match input.query.as_deref() {
            Some(query) => tree::filter(tree, query),
            None => tree,
        };
        let mut screenshots = Vec::new();
        if input.include_screenshot.unwrap_or(true) {
            let (rgb, width, height) = self.x.capture_window(id)?;
            if let Some(w) = self.x.last_capture_wait.take() {
                let ms = |d: std::time::Duration| d.as_secs_f64() * 1000.0;
                self.extra.insert(
                    "capture".into(),
                    json!({
                        "wait_ms": ms(w.waited),
                        "reason": w.reason.name(),
                        "unobscured": w.unobscured,
                        "damage_ignored": w.ignored,
                        "damage_counted": w.counted,
                        "first_damage_ms": w.first.map(ms),
                    }),
                );
            }
            screenshots.push(json!({ "filepath": self.save_screenshot(&rgb, width, height)? }));
        }
        Ok(json!({ "ax_tree": tree, "ax_tree_source": source, "screenshots": screenshots, "window": info }))
    }

    /// `get_screenshot`: the desktop, one entry (behaviour §16).
    fn get_screenshot(&mut self, input: Option<Value>) -> Result<Value> {
        let _: NoInput = parse_input(input)?;
        let (rgb, width, height) = self.x.capture_desktop(self.cfg.mouse_size_px)?;
        Ok(json!([{ "filepath": self.save_screenshot(&rgb, width, height)? }]))
    }

    /// `list_apps`: the desktop entries with their windows (behaviour §15).
    fn list_apps(&mut self, input: Option<Value>) -> Result<Value> {
        let _: NoInput = parse_input(input)?;
        let roots = apps::roots(|name| std::env::var_os(name));
        let path = std::env::var("PATH").ok();
        let entries = apps::discover(&roots, path.as_deref());
        let windows = self.x.list_windows()?;
        Ok(serde_json::to_value(apps::list_apps(&entries, &windows))?)
    }

    /// Encodes and writes a screenshot, returning its path.
    fn save_screenshot(&mut self, rgb: &[u8], width: u16, height: u16) -> Result<String> {
        let jpeg = crate::capture::encode_jpeg(rgb, width, height)?;
        let path = crate::capture::write_screenshot(&self.screenshot_dir()?, &jpeg)?;
        Ok(path
            .to_str()
            .ok_or_else(|| anyhow!("failed to convert screenshot filepath"))?
            .to_string())
    }

    /// The engine's private directory for screenshot files: created fresh on first use, owner-only, with an
    /// unpredictable name.
    fn screenshot_dir(&mut self) -> Result<PathBuf> {
        if let Some(dir) = &self.shot_dir {
            return Ok(dir.clone());
        }
        let dir = crate::capture::make_private_dir(&std::env::temp_dir())?;
        self.shot_dir = Some(dir.clone());
        Ok(dir)
    }

    /// The orderly exit: every key still held released and every open input session closed, then the screenshot
    /// directory removed.
    pub fn shutdown(&mut self) {
        self.inputs.release_everything(&mut self.x);
        let _ = self.x.flush();
        if let Some(dir) = self.shot_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}
