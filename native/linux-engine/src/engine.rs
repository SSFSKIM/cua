//! The request dispatcher: one request at a time, in arrival order (Design, Process model), with the spike's
//! variants (`--tree`, the window, retention and waits) applied.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use serde_json::{Value, json};

use crate::atspi::{self, Association};
use crate::dbus::{Broken, Bus, BusStats};
use crate::input::{Pacing, chord_keycodes, with_session};
use crate::tree::{self, ObjRef, ReadStats};
use crate::wire::{
    self, ClickInput, GetWindowStateInput, MouseButton, NoInput, PressKeyInput, Request, Response, parse_input,
};
use crate::x11::{Retention, X11};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeMode {
    /// The vendor's calls one by one (the harness checks it reproduces the vendor's numbers).
    Sequential,
    /// The same calls along the preorder frontier inside the window (the candidate main path).
    Frontier,
    /// `Cache.GetItems` seeds the frontier (an experiment).
    Cache,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BusMode {
    /// One connection for the engine's life, reopened once per request when broken (Design, Process model).
    Persistent,
    /// A fresh connection per request, as the vendor's.
    PerRequest,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub tree: TreeMode,
    pub window: tree::Window,
    pub retention: Retention,
    pub settle: Duration,
    pub pacing: Pacing,
    pub bus: BusMode,
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
}

/// The click hold when `duration` is absent (behaviour §10.1).
const CLICK_HOLD: Duration = Duration::from_millis(12);

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

fn desktop_unavailable(command: &str) -> anyhow::Error {
    anyhow!("{command} without a window (the desktop route) is not available in this engine build")
}

impl Engine {
    pub fn new(cfg: Config) -> Result<Engine> {
        let x = X11::connect(cfg.retention, cfg.settle)?;
        Ok(Engine {
            cfg,
            x,
            bus: None,
            shot_dir: None,
            bus_stats: BusStats::default(),
            extra: Default::default(),
        })
    }

    pub fn handle(&mut self, request: Request) -> Response {
        self.x.drain_events();
        let started = Instant::now();
        let result = match request.command.as_str() {
            "list_windows" => self.list_windows(request.input),
            "get_window_state" => self.get_window_state(request.input),
            "press_key" => self.press_key(request.input),
            "click" => self.click(request.input),
            "server" => Err(anyhow!("server command cannot be nested")),
            command if wire::COMMANDS.contains(&command) => Err(anyhow!(wire::not_available(command))),
            command => Err(anyhow!("unknown command `{command}`")),
        };
        if self.cfg.bus == BusMode::PerRequest {
            self.drop_bus();
        } else if let Some(bus) = self.bus.as_mut() {
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
                "tree": format!("{:?}", self.cfg.tree).to_lowercase(),
                "window_calls": self.cfg.window.calls,
                "window_bytes": self.cfg.window.bytes,
                "call_reservation": self.cfg.window.reservation,
                "slack_nodes": self.cfg.window.slack,
                "retention": format!("{:?}", self.cfg.retention),
                "settle_ms": self.cfg.settle.as_millis() as u64,
                "teardown_ms": self.cfg.pacing.teardown.as_millis() as u64,
                "key_pace_ms": self.cfg.pacing.key.as_millis() as u64,
                "bus": format!("{:?}", self.cfg.bus),
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
        eprintln!("{}", json!({ "stats": line }));
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
        let mode = self.cfg.tree;
        let window = self.cfg.window;
        let mut read_stats = ReadStats::default();
        let mut cache_report = None;
        let at_spi = self.with_bus(|bus, x| {
            let frame = match atspi::associate(bus, x, &info, mode != TreeMode::Sequential)? {
                Association::Frame(frame) => frame,
                Association::NoMatch | Association::Refused(_) => return Ok(None),
            };
            let (tree, stats) = match mode {
                TreeMode::Sequential => tree::read_sequential(bus, &frame)?,
                TreeMode::Frontier => tree::read_frontier(bus, &frame, window)?,
                TreeMode::Cache => {
                    let (seed, report) = atspi::cache_seed(bus, &frame)?;
                    cache_report = Some(report);
                    tree::read_seeded(bus, &frame, window, seed)?
                }
            };
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
                "large_tables_listed": read_stats.large_tables,
            }),
        );
        if let Some(report) = cache_report {
            self.extra.insert(
                "cache".into(),
                json!({
                    "answered": report.answered,
                    "error": report.error,
                    "shape": report.shape,
                    "items": report.items,
                    "seeded": report.seeded,
                    "children_fallbacks": report.children_fallbacks,
                    "role_lookups": report.role_lookups,
                }),
            );
        }
        let tree = match input.query.as_deref() {
            Some(query) => tree::filter(tree, query),
            None => tree,
        };
        let mut screenshots = Vec::new();
        if input.include_screenshot.unwrap_or(true) {
            let (rgb, width, height) = self.x.capture_window(id)?;
            let jpeg = crate::capture::encode_jpeg(&rgb, width, height)?;
            let path = crate::capture::write_screenshot(&self.screenshot_dir()?, &jpeg)?;
            let path = path
                .to_str()
                .ok_or_else(|| anyhow!("failed to convert screenshot filepath"))?
                .to_string();
            screenshots.push(json!({ "filepath": path }));
        }
        Ok(json!({ "ax_tree": tree, "ax_tree_source": source, "screenshots": screenshots, "window": info }))
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

    /// Removes the screenshot directory at orderly exit.
    pub fn shutdown(&mut self) {
        if let Some(dir) = self.shot_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    fn press_key(&mut self, input: Option<Value>) -> Result<Value> {
        let input: PressKeyInput = parse_input(input)?;
        let Some(window) = input.window else {
            return Err(desktop_unavailable("press_key"));
        };
        let pacing = self.cfg.pacing;
        with_session(&mut self.x, window.id, pacing, |x, session| {
            let keycodes = chord_keycodes(x, &input.key)?;
            if keycodes.is_empty() {
                bail!("key must be a non-empty string");
            }
            let held = session.acquire(x, &keycodes)?;
            if let Some(duration) = input.duration {
                std::thread::sleep(Duration::from_millis(duration).saturating_sub(pacing.key));
            }
            session.release(x, &held)?;
            Ok(Value::Null)
        })
    }

    fn click(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ClickInput = parse_input(input)?;
        let keycodes = match &input.key {
            Some(key) => chord_keycodes(&self.x, key)?,
            None => Vec::new(),
        };
        if let Some(element) = &input.element_id {
            let Some(window) = input.window else {
                bail!("element click requires window")
            };
            if input.x.is_some() || input.y.is_some() {
                bail!("provide element_id or x/y, not both");
            }
            let button = input.mouse_button.unwrap_or(MouseButton::Left);
            if button == MouseButton::Middle
                || input.click_count.is_some_and(|c| c != 1)
                || input.key.is_some()
                || input.duration.is_some()
            {
                bail!(
                    "element click supports one left or right click without key or duration; use coordinates for other mouse options"
                );
            }
            return self.element_click(window.id, element, button);
        }
        let (cx, cy) = match (input.x, input.y) {
            (Some(x), Some(y)) => (x, y),
            (None, None) if input.window.is_some() => bail!("window click requires coordinates or an element"),
            (None, None) => return Err(desktop_unavailable("click")),
            _ => bail!("coordinate click requires both x and y"),
        };
        let Some(window) = input.window else {
            return Err(desktop_unavailable("click"));
        };
        let button = input.mouse_button.unwrap_or(MouseButton::Left).button();
        let count = input.click_count.unwrap_or(1);
        let hold = input.duration.map(Duration::from_millis).unwrap_or(CLICK_HOLD);
        with_session(&mut self.x, window.id, self.cfg.pacing, |x, session| {
            let (rx, ry) = x.desktop_position(window.id, cx, cy)?;
            session.move_to(x, rx, ry)?;
            for _ in 0..count {
                let held = session.acquire(x, &keycodes)?;
                let pressed = session
                    .move_to(x, rx, ry)
                    .and_then(|()| session.button(x, button, true));
                if pressed.is_ok() {
                    std::thread::sleep(hold);
                }
                let released = pressed.and_then(|()| session.button(x, button, false));
                let keys_released = session.release(x, &held);
                released?;
                keys_released?;
            }
            Ok(Value::Null)
        })
    }

    fn element_click(&mut self, window: u32, element: &str, button: MouseButton) -> Result<Value> {
        if element.starts_with("x11:") {
            bail!("element actions require AT-SPI; X11 fallback IDs only identify windows");
        }
        let info = self.x.get_window(window)?;
        let pacing = self.cfg.pacing;
        let pipelined = self.cfg.tree != TreeMode::Sequential;
        let resolved = self.with_bus(|bus, x| {
            let frame = match atspi::associate(bus, x, &info, pipelined)? {
                Association::Frame(frame) => frame,
                Association::NoMatch => return Ok(Err("window has no AT-SPI accessibility tree".to_string())),
                Association::Refused(sentence) => return Ok(Err(sentence)),
            };
            atspi::resolve_element(bus, &frame, element)
        });
        let (target, ancestors) = match resolved {
            Ok(Ok(found)) => found,
            Ok(Err(sentence)) => bail!(sentence),
            // No address is `AT-SPI accessibility bus is unavailable` (from `bus_address`); a connection's own
            // errors propagate, as the vendor's do (behaviour §6.2 step 3).
            Err(error) => return Err(error),
        };
        let Engine { x, bus, .. } = self;
        let bus = bus
            .as_mut()
            .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
        match button {
            MouseButton::Right => {
                let first = right_click(x, bus, &info, &target, &ancestors, pacing);
                match first {
                    Ok(()) => Ok(Value::Null),
                    Err(RightClick::Click(error)) => Err(error),
                    Err(RightClick::Point(error)) => {
                        // The fallback: exactly one action named showContextMenu (behaviour §7.2).
                        let Ok(names) = atspi::action_names(bus, &target)? else {
                            return Err(error);
                        };
                        let matches: Vec<usize> = names
                            .iter()
                            .enumerate()
                            .filter(|(_, n)| n.eq_ignore_ascii_case("showcontextmenu"))
                            .map(|(i, _)| i)
                            .collect();
                        let [index] = matches.as_slice() else { return Err(error) };
                        with_session(x, window, pacing, |_, _| {
                            atspi::do_action(bus, &target, *index as u32)?.map_err(anyhow::Error::msg)
                        })?;
                        Ok(Value::Null)
                    }
                }
            }
            _ => {
                let names = atspi::action_names(bus, &target)?.map_err(anyhow::Error::msg)?;
                if names.is_empty() {
                    bail!("element has no primary accessibility action");
                }
                with_session(x, window, pacing, |_, _| {
                    atspi::do_action(bus, &target, 0)?.map_err(anyhow::Error::msg)
                })?;
                Ok(Value::Null)
            }
        }
    }
}

enum RightClick {
    /// Finding the point failed: the context-menu action may stand in.
    Point(anyhow::Error),
    /// The click itself failed: no fallback.
    Click(anyhow::Error),
}

/// A right click at the element's visible point, clipped by the window and by every `viewport` and
/// `scroll pane` ancestor (behaviour §7.2).
fn right_click(
    x: &mut X11,
    bus: &mut Bus,
    info: &crate::x11::WindowInfo,
    target: &ObjRef,
    ancestors: &[ObjRef],
    pacing: Pacing,
) -> std::result::Result<(), RightClick> {
    // The session opens first and the point is found inside it, as the vendor orders them; a failure to find the
    // point closes it like any other error.
    let mut point_failed = false;
    let result = with_session(x, info.id, pacing, |x, session| {
        let (rx, ry) = visible_point(bus, info, target, ancestors).inspect_err(|_| point_failed = true)?;
        session.move_to(x, rx, ry)?;
        session.button(x, 3, true)?;
        std::thread::sleep(CLICK_HOLD);
        session.button(x, 3, false)
    });
    result.map_err(|error| {
        if point_failed {
            RightClick::Point(error)
        } else {
            RightClick::Click(error)
        }
    })
}

/// The centre of the element's extents clipped by the window and by every `viewport` and `scroll pane`
/// ancestor, in root coordinates (behaviour §7.2 steps 2–3).
fn visible_point(
    bus: &mut Bus,
    info: &crate::x11::WindowInfo,
    target: &ObjRef,
    ancestors: &[ObjRef],
) -> Result<(i16, i16)> {
    let states = atspi::state_words(bus, target)?.unwrap_or_default();
    if !(states.contains(&"showing") && states.contains(&"visible")) {
        bail!("element is not visible; scroll it into view before right-clicking");
    }
    let (mut x0, mut y0, mut x1, mut y1) = atspi::extents(bus, target)?.map_err(anyhow::Error::msg)?;
    let (wx, wy) = (info.x as i32, info.y as i32);
    x0 = x0.max(wx);
    y0 = y0.max(wy);
    x1 = x1.min(wx + info.width as i32);
    y1 = y1.min(wy + info.height as i32);
    for ancestor in ancestors {
        let role = atspi::role_name(bus, ancestor)?.ok_or_else(|| anyhow!("AT-SPI ancestor did not return a role"))?;
        if (role == "viewport" || role == "scroll pane")
            && let Ok((ax0, ay0, ax1, ay1)) = atspi::extents(bus, ancestor)?
        {
            x0 = x0.max(ax0);
            y0 = y0.max(ay0);
            x1 = x1.min(ax1);
            y1 = y1.min(ay1);
        }
    }
    if x1 <= x0 || y1 <= y0 {
        bail!("element has no visible bounds in this window");
    }
    let (cx, cy) = (x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2);
    let convert = |v: i32| i16::try_from(v).map_err(|_| anyhow!("out of range integral type conversion attempted"));
    Ok((convert(cx)?, convert(cy)?))
}
