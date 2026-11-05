//! The request dispatcher: one request at a time, in arrival order (Design, Process model). Observation lives here;
//! input is in the child modules: keys (`keyboard`), the pointer (`pointer`), element actions (`elements`), the
//! window and application requests (`windows`) and the clipboard's (`clipboard`).

mod clipboard;
mod elements;
#[cfg(test)]
mod identity_faults;
mod keyboard;
mod paste;
#[cfg(test)]
mod paste_faults;
mod pointer;
#[cfg(test)]
mod refusal_faults;
#[cfg(test)]
mod targets_faults;
mod way;
mod windows;

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use anyhow::{Result, anyhow};
use serde_json::{Value, json};

use crate::apps;
use crate::atspi::{self, Association};
use crate::dbus::{Broken, Bus, BusStats};
use crate::families::{self, DragPacing, Family};
use crate::input::Pacing;
use crate::readiness::CaptureWait;
use crate::route::{Inputs, Sent};
use crate::tree;
use crate::wire::{self, GetWindowStateInput, NoInput, Request, Response, parse_input};
use crate::x11::{Retention, X11};

/// The device mode (Design, Device mode and the foreground route): whether a person may be using this desktop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DesktopMode {
    /// Input a family ignores on the background route is refused.
    Shared,
    /// The desktop is the agent's: such input activates the window and takes the desktop route.
    Dedicated,
}

#[derive(Debug, Clone)]
pub struct Config {
    pub window: tree::Window,
    pub retention: Retention,
    pub settle: Duration,
    pub capture_wait: CaptureWait,
    pub pacing: Pacing,
    pub stats: bool,
    pub mouse_size_px: u32,
    pub desktop: DesktopMode,
    /// Measurement only (`--dnd-cancel-after-release`): a drag and drop the engine would cancel is cancelled only
    /// after the release, too late, so the harness can check the answer then.
    pub dnd_cancel_late: bool,
    /// Measurement only (`--dnd-defer-take`): a drag and drop that begins during a watched drag is left unseen until
    /// after the release, so the after-release watch finds it and the next request reports it (Acceptance 8).
    pub dnd_defer_take: bool,
    /// How long after the press a Chromium drag the engine lets drop keeps its button down for its source's take when
    /// none came by the path's end (`dnd::TAKE_HOLD_AFTER_PRESS`; `--drag-dnd-hold-ms`, measurement only, sets another,
    /// 0 none).
    pub dnd_hold: std::time::Duration,
    /// How long after a Chromium drag source's take a drag the engine lets drop is released at the soonest
    /// (`dnd::RELEASE_AFTER_TAKE`; `--drag-dnd-after-take-ms`, measurement only, sets another, 0 none).
    pub dnd_after_take: std::time::Duration,
    /// Measurement only (`--targets-wait-ms`): how long every paste waits after taking CLIPBOARD for its target to ask
    /// for `TARGETS`, whatever its family (`engine/paste.rs` `targets_wait`).
    pub targets_wait: Option<std::time::Duration>,
    /// In shared mode, how long a background press to a family whose press activates a window it has not focused waits
    /// for the window's frame to report the session's synthetic focus taken (`focus_ack.rs`; `--focus-ack-ms`,
    /// measurement only, sets another, 0 none).
    pub focus_ack: std::time::Duration,
}

pub struct Engine {
    cfg: Config,
    x: X11,
    bus: Option<Bus>,
    shot_dir: Option<PathBuf>,
    bus_stats: BusStats,
    extra: serde_json::Map<String, Value>,
    /// What the last request's `--stats` line reports, built and written after its response so the line costs the
    /// request nothing: its id, command, time and outcome.
    pending_stats: Option<(Value, String, Duration, bool)>,
    /// Held keys, their sessions and the desktop's keys, across requests.
    inputs: Inputs,
    /// `launch_app`'s programs, reaped as they exit.
    launched: apps::Launched,
    /// Each window's family, looked up once (`families.rs`).
    families: HashMap<x11rb::protocol::xproto::Window, Option<&'static Family>>,
    /// Whether each window of no listed family is a Qt application's, by its process's map, looked up once
    /// (`Engine::qt_without_toolkit`).
    qt_by_map: HashMap<x11rb::protocol::xproto::Window, bool>,
    /// The pacing of the drag a `drag_handle` holds, from its start to its end.
    handle_pacing: pointer::HandlePacing,
    /// The clipboard's own connections, opened on first use.
    clipboard: Option<crate::clipboard::Clipboard>,
    /// `clipboard_read`'s snapshots, until released or the engine exits.
    handles: crate::clipboard::Handles,
    /// A watched drag's after-release watch (`dnd::LateWatch`), until it ends by itself or an acting request stops it.
    late_watch: Option<crate::dnd::LateWatch>,
    /// What an ended watch left to report (a late drag and drop, or the watch's own failure), with the application:
    /// the first acting request answers it, not run.
    late_pending: Option<(String, crate::dnd::WatchEnd)>,
    /// The Chromium drags' press watch (`stray.rs`), its connection opened by the first such drag.
    stray_watch: Option<crate::stray::StrayWatch>,
}

/// Whether a request sends input or changes state, and so is refused while a late drag and drop or a failed watch is
/// unreported (the design session's ruling, 2026-10-31). Reads run (`list_windows`, `list_apps`, `get_screenshot`,
/// `get_window_state`, `clipboard_read`, `capabilities`), and so do releases of what is held (`key_up`,
/// `clipboard_release`, `drag_handle`'s `end`), so a held key or button is never left down at the server; unknown
/// commands answer their own error. `preflight` sends nothing, but stands for an action its caller takes by another
/// route (cua's wrapper launching an application through the supervisor), so it acts.
pub fn acts(command: &str, input: Option<&Value>) -> bool {
    match command {
        "preflight"
        | "press_key"
        | "key_down"
        | "click"
        | "move"
        | "move_relative"
        | "scroll"
        | "drag"
        | "perform_secondary_action"
        | "activate_window"
        | "launch_app"
        | "clipboard_write"
        | "type_text"
        | "type_characters" => true,
        "drag_handle" => input.and_then(|i| i.get("action")).and_then(Value::as_str) != Some("end"),
        _ => false,
    }
}

/// The window a request sends input to, when that input is refused while the window is minimized (Design, Minimized
/// windows; M4, the design session's rulings F8 and C21): every window-targeted input, element actions included (a
/// primary element click, `perform_secondary_action`, `clipboard_read`'s Copy), in either device mode. Releases are
/// exempt and always run (`key_up`, `clipboard_release`, `drag_handle`'s end; a drag's own release is inside its
/// request), so nothing is left held on the person's desktop; `activate_window` is the remedy the refusal names;
/// `get_window_state` reads the tree and answers no screenshot. None for a request with no window (the desktop route)
/// or one whose window is not a well-formed id, which the request itself refuses.
fn input_window(command: &str, input: Option<&Value>) -> Option<u32> {
    match command {
        "press_key"
        | "key_down"
        | "click"
        | "move"
        | "scroll"
        | "drag"
        | "perform_secondary_action"
        | "type_text"
        | "type_characters"
        | "clipboard_write"
        | "clipboard_read" => {
            let id = input?.get("window")?.get("id")?.as_u64()?;
            u32::try_from(id).ok()
        }
        _ => None,
    }
}

/// The answer to window-targeted input while its window is minimized: nothing was sent.
fn minimized_sentence(window: u32) -> String {
    format!("Window {window} is minimized; activate it first")
}

/// The answer, in shared mode, to input to a window a modal dialog of its own blocks, for a toolkit that hands the
/// input's synthetic focus to the dialog (`Engine::modal_refusal`): nothing was sent. The same set of requests as the
/// minimized refusal (`input_window`), each of which opens the window's input session and so its `FocusIn`, or (a
/// `clipboard_read` whose Copy left a menu open) may; releases always run.
fn modal_sentence(app: &str, window: u32, dialog: u32) -> String {
    format!(
        "{app} window {window} is blocked by its modal dialog, window {dialog}, which takes the desktop's focus on \
         background input to the window; nothing was sent: send the input to the dialog, or use a dedicated desktop"
    )
}

/// The `truncated` that `get_window_state` reports beside its tree (Design, The tree read; M4): the accessibility read's
/// cut points, and nothing when it cut nothing or when the tree is the X11 fallback, which no read made. An addition
/// to the vendor's output that its JavaScript ignores.
fn reported_truncation(source: &str, truncated: tree::Truncated) -> Option<tree::Truncated> {
    (source == "at_spi" && !truncated.is_empty()).then_some(truncated)
}

/// What a state read found on the accessibility bus.
#[derive(Debug)]
enum Observed {
    /// The tree, and how its frame was told.
    Tree(tree::AxNode, atspi::Told),
    /// One of cua's own association routes found no frame it can stand behind, or its frame's read or confirmation
    /// failed: the sentence or the error, never the X11 tree.
    Refused(atspi::Unassociated),
    /// One of the vendor's own failures: its X11 tree.
    Fallback(atspi::Fallback),
}

/// The read of a frame one of cua's own routes found (`atspi::Associated::fallback` gives no leave for it): its tree,
/// once the association is confirmed again after the read, else the refusal. No path here holds leave for the X11
/// fallback, so neither a failed read, a root that does not answer, nor a changed association can end in a tree that
/// looks like an empty window (F5).
fn own_route_read(
    window: u32,
    told: atspi::Told,
    read: Result<Option<tree::AxNode>>,
    confirm: impl FnOnce() -> Result<bool>,
) -> Observed {
    use atspi::Unassociated::{Changed, Failed};
    match read {
        Err(error) => Observed::Refused(Failed(error)),
        Ok(None) => Observed::Refused(Changed(window)),
        Ok(Some(tree)) => match confirm() {
            Ok(true) => Observed::Tree(tree, told),
            Ok(false) => Observed::Refused(Changed(window)),
            Err(error) => Observed::Refused(Failed(error)),
        },
    }
}

/// The `--stats` line's record of a reported after-release watch.
fn late_stats(app: &str, end: &crate::dnd::WatchEnd) -> Value {
    match end {
        crate::dnd::WatchEnd::Late(late) => json!({
            "app": app,
            "after_release_ms": late.after_release.as_secs_f64() * 1000.0,
            "escape_after_release_ms": late.escape_after_release.as_secs_f64() * 1000.0,
            "escaped": late.escaped,
        }),
        crate::dnd::WatchEnd::Failed(why) => json!({ "app": app, "failed": why }),
        crate::dnd::WatchEnd::Quiet => json!({ "app": app }),
    }
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
            families: HashMap::new(),
            qt_by_map: HashMap::new(),
            handle_pacing: pointer::HandlePacing::default(),
            launched: apps::Launched::default(),
            clipboard: None,
            handles: crate::clipboard::Handles::new(),
            late_watch: None,
            late_pending: None,
            stray_watch: None,
        })
    }

    pub fn handle(&mut self, request: Request) -> Response {
        self.x.drain_events();
        self.launched.reap();
        let started = Instant::now();
        // the last watched drag's after-release watch: an acting request stops it (a round trip first, so every take
        // before now counts); any other request only collects it once it has ended by itself
        let acting = acts(&request.command, request.input.as_ref());
        self.collect_late_watch(acting);
        self.inputs.request = request.id.clone();
        // a late drag and drop, or a watch that failed, is the first acting request's answer, the request not run;
        // reads and releases run meanwhile, and the report waits for the request that would act
        let refusal = if acting { self.late_pending.take() } else { None };
        if let Some((app, end)) = &refusal {
            self.extra.insert("late_dnd".into(), late_stats(app, end));
        }
        // input to a minimized window is refused before anything is sent and before any other check of the request
        // (the device refusal included), in either mode
        let minimized = match refusal {
            None => input_window(&request.command, request.input.as_ref()).filter(|&w| self.x.minimized(w)),
            Some(_) => None,
        };
        if minimized.is_some() {
            self.extra.insert("minimized".into(), json!(true));
        }
        // in shared mode, input to a window its modal dialog blocks, for a toolkit that would hand the session's
        // synthetic focus to the dialog, is refused before anything is sent, after the minimized refusal
        let blocked = match (&refusal, minimized) {
            (None, None) => input_window(&request.command, request.input.as_ref()).and_then(|w| self.modal_refusal(w)),
            _ => None,
        };
        let result = match request.command.as_str() {
            _ if refusal.is_some() => Err(anyhow!(match refusal.as_ref().expect("checked") {
                (app, crate::dnd::WatchEnd::Failed(why)) => crate::dnd::watch_failed_notice(app, why),
                (app, _) => crate::dnd::late_notice(app),
            })),
            _ if minimized.is_some() => Err(anyhow!(minimized_sentence(minimized.expect("checked")))),
            _ if blocked.is_some() => Err(anyhow!(blocked.expect("checked"))),
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
            "clipboard_read" => self.clipboard_read(request.input),
            "clipboard_release" => self.clipboard_release(request.input),
            "clipboard_write" => self.clipboard_write(request.input),
            "type_text" => self.type_text(request.input),
            "type_characters" => self.type_characters(request.input),
            "capabilities" => self.capabilities(request.input),
            // reached only with nothing to report: the refusal above answered otherwise
            "preflight" => parse_input::<NoInput>(request.input).map(|_| Value::Null),
            "server" => Err(anyhow!("server command cannot be nested")),
            command if wire::COMMANDS.contains(&command) => Err(anyhow!(wire::not_available(command))),
            command => Err(anyhow!("unknown command `{command}`")),
        };
        if let Some(bus) = self.bus.as_mut() {
            merge(&mut self.bus_stats, bus.take_stats());
        }
        // a drag's session is kept past its request only while its late-take watch is armed: one that armed none (its
        // drag refused, cancelled in time, or failed) ends with its request
        if self.late_watch.is_none() {
            self.inputs.end_watched(&mut self.x);
        }
        let sent = self.inputs.take_sent();
        if !sent.is_empty() {
            self.extra
                .insert("focus_out".into(), sent.iter().map(Sent::record).collect());
        }
        if self.cfg.stats {
            self.pending_stats = Some((
                request.id.clone(),
                request.command.clone(),
                started.elapsed(),
                result.is_ok(),
            ));
        }
        match result {
            Ok(output) => Response::success(request.id, output),
            Err(error) => Response::failure(request.id, format!("{error:#}")),
        }
    }

    /// Collects the after-release watch when `acting` (stopping it) or once it has ended by itself: what it saw waits in
    /// `late_pending` for the first acting request. Its Escape, sent at once on the watch's own connection, is a key to
    /// the target window that the settles follow (`settle.rs`): the exit's unredirect could cut it. Then the drag's
    /// session, kept focused while the watch was armed, ends: its `FocusOut` comes after the Escape, which the watch's
    /// own round trip had the server process before the watch ended (the design session's ruling on task 60).
    fn collect_late_watch(&mut self, acting: bool) {
        if !self.late_watch.as_ref().is_some_and(|w| acting || w.finished()) {
            return;
        }
        let watch = self.late_watch.take().expect("checked");
        let (app, target) = (watch.app.clone(), watch.target);
        match watch.stop() {
            crate::dnd::WatchEnd::Quiet => {}
            end => {
                if let crate::dnd::WatchEnd::Late(late) = &end
                    && let Some(at) = late.escaped_at
                {
                    self.inputs.note_key(target, at);
                }
                self.late_pending = Some((app, end));
            }
        }
        self.inputs.end_watched(&mut self.x);
    }

    /// When the engine must act with no request (`serve.rs`): an armed late-take watch's end, `dnd::SETTLE` after its
    /// drag's release, which its drag's `FocusOut` follows.
    pub fn next_due(&self) -> Option<Instant> {
        self.late_watch.as_ref().and_then(crate::dnd::LateWatch::ends_at)
    }

    /// Once an armed late-take watch's time is up with no request come: the watch run out (it ends by itself a poll
    /// later at most) and collected, and its drag's session ended, its `FocusOut` reported on a `--stats` line of its
    /// own. What the watch saw still waits for the first acting request.
    pub fn tick(&mut self) {
        let Some(watch) = &self.late_watch else {
            return;
        };
        if watch.ends_at().is_none_or(|at| at > Instant::now()) {
            return;
        }
        watch.run_out();
        self.collect_late_watch(true);
        self.report_sent();
    }

    /// The `FocusOut`s the exit sent, each on a `--stats` line of its own: `{"stats": {"id": null, "focus_out": …}}`.
    fn report_sent(&mut self) {
        let sent = self.inputs.take_sent();
        if self.cfg.stats {
            for record in sent.iter().map(Sent::record) {
                eprintln!("{}", json!({ "stats": { "id": null, "focus_out": [record] } }));
            }
        }
    }

    fn stats_line(&mut self, id: Value, command: String, elapsed: Duration, ok: bool) -> String {
        let bus = std::mem::take(&mut self.bus_stats);
        let mut line = json!({
            "id": id,
            "command": command,
            "ok": ok,
            "elapsed_ms": (elapsed.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0,
            "variant": {
                "window_calls": self.cfg.window.calls,
                "window_bytes": self.cfg.window.bytes,
                "call_reservation": self.cfg.window.reservation,
                "slack_nodes": self.cfg.window.slack,
                "retention": format!("{:?}", self.cfg.retention),
                "settle_ms": self.cfg.settle.as_millis() as u64,
                "capture_wait": format!("{:?}", self.cfg.capture_wait).to_lowercase(),
                "teardown_ms": self.cfg.pacing.teardown.as_millis() as u64,
                "paste_settle_ms": self.cfg.pacing.paste_settle.as_millis() as u64,
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
        json!({ "stats": line }).to_string()
    }

    /// Once a response is out: the request's `--stats` line written, and work that can wait for the answer done
    /// (the desktop screenshot's MIT-SHM segment for the next one).
    pub fn after_response(&mut self) {
        if let Some((id, command, elapsed, ok)) = self.pending_stats.take() {
            let line = self.stats_line(id, command, elapsed, ok);
            eprintln!("{line}");
        }
        self.x.prepare_desktop();
    }

    fn drop_bus(&mut self) {
        if let Some(mut bus) = self.bus.take() {
            merge(&mut self.bus_stats, bus.take_stats());
        }
    }

    /// The family of a window (`families.rs`): by its X11 class, and where no class entry matches and some entry is
    /// keyed by toolkit, by its application's `ToolkitName` and `Version` on the accessibility bus. Looked up
    /// once per window; None is an unlisted family.
    fn family_of(&mut self, window: x11rb::protocol::xproto::Window) -> Option<&'static Family> {
        if let Some(found) = self.families.get(&window) {
            return *found;
        }
        let class = self.x.wm_class(window);
        let mut found = families::family(families::FAMILIES, class.as_deref(), None);
        if found.is_none()
            && families::needs_toolkit()
            && let Some(pid) = self.x.pid(window)
        {
            let toolkit = self.with_bus(|bus, _| atspi::toolkit_of(bus, pid)).ok().flatten();
            self.extra.insert(
                "toolkit".into(),
                json!(toolkit.as_ref().map(|t| json!({"name": t.name, "version": t.version}))),
            );
            found = families::family(families::FAMILIES, class.as_deref(), toolkit.as_ref());
        }
        self.families.insert(window, found);
        found
    }

    /// Whether `window` is a Qt application's that no listed family names, so one with no accessibility tree on the bus
    /// (no `ToolkitName` to read), found by its process's map (`families::process_is_qt`), looked up once (task 61's
    /// fix, the design session's ruling B). A window whose process's map cannot be read (no `_NET_WM_PID`, a process of
    /// another user or of a PID namespace the engine does not see, a remote client) is not: its toolkit is unknown.
    fn qt_without_toolkit(&mut self, window: x11rb::protocol::xproto::Window) -> bool {
        if self.family_of(window).is_some() {
            return false;
        }
        if let Some(&qt) = self.qt_by_map.get(&window) {
            return qt;
        }
        let qt = self.x.pid(window).and_then(families::process_is_qt).unwrap_or(false);
        self.qt_by_map.insert(window, qt);
        qt
    }

    /// In shared mode, the refusal of input to `window` while a modal dialog of its own is shown, for a toolkit that
    /// hands the synthetic `FocusIn` of that input's session to the dialog, asking for the dialog's activation (Qt,
    /// `families.rs` `relays_focus_to_modal`; the design session's ruling A). A dialog that cannot be looked for is a
    /// refusal too: the window or its client may be gone.
    fn modal_refusal(&mut self, window: u32) -> Option<String> {
        if self.cfg.desktop != DesktopMode::Shared {
            return None;
        }
        let relays = self.family_of(window).is_some_and(|f| f.relays_focus_to_modal) || self.qt_without_toolkit(window);
        if !relays {
            return None;
        }
        let dialog = match self.x.modal_transient_of(window) {
            Ok(dialog) => dialog?,
            Err(error) => return Some(format!("{error:#}")),
        };
        self.extra.insert("modal_dialog".into(), json!(dialog));
        let app = self
            .x
            .get_window(window)
            .map(|i| i.app)
            .unwrap_or_else(|_| format!("x11:{window}"));
        Some(modal_sentence(&app, window, dialog))
    }

    /// A drag's pacing: the flags' where they fix it, else the family of the window it goes to; no window, or an
    /// unlisted family, is no wait.
    fn drag_pacing_for(&mut self, window: Option<x11rb::protocol::xproto::Window>) -> DragPacing {
        if let Some(fixed) = self.cfg.pacing.drag {
            return fixed;
        }
        let Some(window) = window else {
            return DragPacing::NONE;
        };
        let found = self.family_of(window);
        let pacing = found.map_or(DragPacing::NONE, |f| f.drag);
        self.extra.insert(
            "drag_pacing".into(),
            json!({
                "family": found.map(|f| f.name),
                "evidence": found.map(|f| f.evidence),
                "step_us": pacing.step.as_micros() as u64,
                "press_ms": pacing.press.as_millis() as u64,
                "release_ms": pacing.release.as_millis() as u64,
            }),
        );
        pacing
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
            let associated = match atspi::associate(bus, x, &info)? {
                Association::Frame(associated) => associated,
                Association::Identity(unassociated) => return Ok(Observed::Refused(unassociated)),
                Association::NoMatch(leave) | Association::Refused(_, leave) => return Ok(Observed::Fallback(leave)),
            };
            let read = tree::read(bus, &associated.frame, window).map(|(tree, stats)| {
                read_stats = stats;
                tree
            });
            match associated.fallback() {
                // the vendor's own match: an error is its fallback, and so is a root that fails to read (behaviour §4)
                Some(leave) => {
                    Ok(read?.map_or(Observed::Fallback(leave), |tree| Observed::Tree(tree, associated.told)))
                }
                // one of cua's own routes: the association is confirmed again once its tree is read, since a toolkit
                // may correct the `active` state a moment after an activation, and a read that began on the previous
                // active window's frame is refused, not answered with that window's tree
                None => Ok(own_route_read(id, associated.told, read, || associated.confirm(bus, x))),
            }
        });
        let (tree, source, told) = match at_spi {
            Ok(Observed::Tree(tree, told)) => (tree, "at_spi", Some(told)),
            // never the X11 fallback, which would look like an empty window (Design, Window association)
            Ok(Observed::Refused(unassociated)) => {
                self.extra
                    .insert("tree".into(), json!({ "identity": unassociated.name() }));
                return Err(unassociated.into_error());
            }
            Ok(Observed::Fallback(leave)) => (self.x.fallback_tree(id, leave)?, "x11", None),
            // cua's own routes answer no error here (`atspi::associate`, `own_route_read`): this is the vendor's
            Err(_) => (
                self.x.fallback_tree(id, atspi::Fallback::after_vendor_error())?,
                "x11",
                None,
            ),
        };
        self.extra.insert(
            "tree".into(),
            json!({
                "source": source,
                "identity": told.map(atspi::Told::name),
                "admitted": read_stats.admitted,
                "discovered": read_stats.discovered,
                "wasted_calls": read_stats.wasted_calls,
                "tables_sampled": read_stats.tables_sampled,
                "tables_listed": read_stats.tables_listed,
                "hit_tests": read_stats.hit_tests,
                "truncated": read_stats.truncated,
            }),
        );
        let tree = match input.query.as_deref() {
            Some(query) => tree::filter(tree, query),
            None => tree,
        };
        let mut screenshots = Vec::new();
        // a minimized window has no contents to capture: no screenshot, which the facade answers as unavailable
        if input.include_screenshot.unwrap_or(true) && info.minimized != Some(true) {
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
        let mut state =
            json!({ "ax_tree": tree, "ax_tree_source": source, "screenshots": screenshots, "window": info });
        if let Some(truncated) = reported_truncation(source, read_stats.truncated) {
            state["truncated"] = json!(truncated);
        }
        Ok(state)
    }

    /// `capabilities` (Design, The capability report): the backend's capabilities and the device mode.
    fn capabilities(&mut self, input: Option<Value>) -> Result<Value> {
        let _: NoInput = parse_input(input)?;
        Ok(crate::caps::report(
            self.cfg.desktop,
            env!("CARGO_PKG_VERSION"),
            env!("CUA_ENGINE_GIT_SHA"),
        ))
    }

    /// `get_screenshot`: the desktop, one entry (behaviour §16).
    fn get_screenshot(&mut self, input: Option<Value>) -> Result<Value> {
        let _: NoInput = parse_input(input)?;
        let (rgb, width, height) = self.x.capture_desktop(self.cfg.mouse_size_px)?;
        if let Some(read) = self.x.last_desktop_read {
            self.extra.insert("desktop_read".into(), json!(read));
        }
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

    /// The orderly exit: a `drag_handle` still held ended, every key still held released, an armed after-release watch
    /// run out, its drag's session and the sessions a hold kept open ended, the exit's settle waited out (`settle::EXIT_SETTLE`), the
    /// clipboard's owner stopped (CLIPBOARD goes with it, as the vendor's does), then the screenshot directory removed.
    pub fn shutdown(&mut self) {
        // first, every key and button still held released, so no wait below keeps one down (the design session's
        // rulings, M4 T7b): a drag_handle between its start and its end ends as its own end would, its drop where the
        // pointer is, with no after-release watch since its end arms none; then the holds; then whatever the ledger
        // still has down (pressed.rs; normally nothing)
        if self.drag_handle_held() {
            let _ = self.end_drag_handle();
        }
        self.inputs.release_held(&mut self.x);
        crate::pressed::release_rest(&self.x.conn, self.x.root);
        // an armed after-release watch then runs out its lifetime (at most `dnd::SETTLE` after its drag's release), so
        // a late take inside it is still cancelled, its Escape sent before the connections close and before the
        // FocusOut of its drag's session and of a session the exit released; collected then, the Escape is a key the
        // settle below follows
        if let Some(watch) = &self.late_watch {
            watch.run_out();
        }
        self.collect_late_watch(true);
        self.inputs.end_watched(&mut self.x);
        self.inputs.end_released(&mut self.x);
        self.report_sent();
        let _ = self.x.sync();
        // the exit drops every redirect it holds: input still queued in a covered Chromium window would be cut, so the
        // last input to such a window is given the exit's settle first (`settle::EXIT_SETTLE`)
        let until = self.inputs.exit_settle_until(&self.x);
        let started = Instant::now();
        crate::settle::wait(until);
        if self.cfg.stats && until.is_some() {
            let waited = started.elapsed().as_secs_f64() * 1000.0;
            eprintln!(
                "{}",
                json!({ "stats": { "id": null, "exit_settle": { "waited_ms": (waited * 1000.0).round() / 1000.0 } } })
            );
        }
        self.clipboard = None;
        if let Some(dir) = self.shot_dir.take() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        Observed, acts, input_window, minimized_sentence, modal_sentence, own_route_read, reported_truncation,
    };
    use crate::atspi::{Told, Unassociated};
    use crate::tree::{AxNode, Truncated};
    use serde_json::json;

    fn node() -> AxNode {
        AxNode {
            actions: None,
            children: Vec::new(),
            description: None,
            id: ":1.2:/frame".into(),
            name: None,
            role: "frame".into(),
            states: None,
            value: None,
        }
    }

    #[test]
    fn a_frame_found_by_cuas_own_routes_answers_its_tree_only_once_confirmed() {
        let refused = |observed: Observed| match observed {
            Observed::Refused(Unassociated::Changed(7)) => "changed",
            Observed::Refused(Unassociated::Failed(_)) => "failed",
            other => panic!("refused, not {other:?}"),
        };
        let confirmed = || Ok(true);
        assert!(matches!(
            own_route_read(7, Told::Active, Ok(Some(node())), confirmed),
            Observed::Tree(_, Told::Active)
        ));
        // whatever the read or the confirmation does, a sentence or an error, never the X11 tree
        assert_eq!(
            refused(own_route_read(7, Told::Position, Ok(Some(node())), || Ok(false))),
            "changed"
        );
        assert_eq!(
            refused(own_route_read(7, Told::Active, Ok(Some(node())), || anyhow::bail!(
                "bus timeout"
            ))),
            "failed"
        );
        assert_eq!(
            refused(own_route_read(7, Told::Caption, Ok(None), confirmed)),
            "changed",
            "a root that fails"
        );
        assert_eq!(
            refused(own_route_read(
                7,
                Told::Position,
                Err(anyhow::anyhow!("bus timeout")),
                confirmed
            )),
            "failed"
        );
        let mut asked = false;
        own_route_read(7, Told::Position, Ok(None), || {
            asked = true;
            Ok(true)
        });
        assert!(!asked, "no tree, nothing to confirm");
    }

    #[test]
    fn truncation_is_reported_only_for_an_accessibility_read_that_cut_something() {
        let cut = Truncated {
            nodes: 12,
            depth: 2,
            failed: 1,
        };
        assert_eq!(reported_truncation("at_spi", cut), Some(cut));
        assert_eq!(
            json!(reported_truncation("at_spi", cut)),
            json!({"nodes": 12, "depth": 2, "failed": 1})
        );
        assert_eq!(
            reported_truncation("at_spi", Truncated::default()),
            None,
            "omitted when every count is 0"
        );
        assert_eq!(reported_truncation("x11", cut), None, "the X11 fallback is no read");
    }

    #[test]
    fn a_minimized_window_refuses_every_window_targeted_input_but_releases_reads_and_activation() {
        let window = json!({"window": {"id": 77, "app": "gedit", "minimized": true}});
        for command in [
            "press_key",
            "key_down",
            "click",
            "move",
            "scroll",
            "drag",
            "perform_secondary_action",
            "type_text",
            "type_characters",
            "clipboard_write",
            // its Copy is an element action, or a context menu and an Escape
            "clipboard_read",
        ] {
            assert_eq!(input_window(command, Some(&window)), Some(77), "{command} is refused");
        }
        for command in [
            // releases always run
            "key_up",
            "clipboard_release",
            "drag_handle",
            // the remedy the sentence names
            "activate_window",
            // reads: the tree is read and the screenshot is answered as unavailable
            "get_window_state",
            "list_windows",
            "capabilities",
            "launch_app",
            "preflight",
            "no_such_command",
        ] {
            assert_eq!(input_window(command, Some(&window)), None, "{command} is not refused");
        }
        assert_eq!(
            input_window("press_key", Some(&json!({"key": "a"}))),
            None,
            "the desktop route"
        );
        assert_eq!(
            input_window("press_key", Some(&json!({"window": null, "key": "a"}))),
            None
        );
        assert_eq!(input_window("press_key", None), None);
        assert_eq!(
            input_window("press_key", Some(&json!({"window": {"id": "77"}}))),
            None,
            "a malformed window is the request's own error"
        );
        assert_eq!(minimized_sentence(77), "Window 77 is minimized; activate it first");
    }

    #[test]
    fn a_window_its_modal_dialog_blocks_is_refused_naming_the_dialog_to_send_the_input_to() {
        // the same requests as the minimized refusal (input_window, above): each opens the window's input session,
        // whose synthetic FocusIn Qt hands to the dialog; releases, reads and activation are not refused
        assert_eq!(
            modal_sentence("org.kde.kate", 6291462, 6291476),
            "org.kde.kate window 6291462 is blocked by its modal dialog, window 6291476, which takes the desktop's \
             focus on background input to the window; nothing was sent: send the input to the dialog, or use a \
             dedicated desktop"
        );
    }

    #[test]
    fn a_late_drag_and_drop_refuses_only_requests_that_send_input_or_change_state() {
        for command in [
            "press_key",
            "key_down",
            "click",
            "move",
            "move_relative",
            "scroll",
            "drag",
            "perform_secondary_action",
            "activate_window",
            "launch_app",
            "clipboard_write",
            "type_text",
            "type_characters",
            // sends nothing itself: it stands for an action taken by another route (the wrapper's supervisor launch)
            "preflight",
        ] {
            assert!(acts(command, None), "{command} acts");
        }
        for command in [
            "list_windows",
            "list_apps",
            "get_screenshot",
            "get_window_state",
            "clipboard_read",
            "capabilities",
            "key_up",
            "clipboard_release",
            "no_such_command",
        ] {
            assert!(!acts(command, None), "{command} runs");
        }
        assert!(acts("drag_handle", Some(&json!({"action": "start", "x": 1, "y": 1}))));
        assert!(acts("drag_handle", Some(&json!({"action": "move_to", "x": 1, "y": 1}))));
        assert!(
            !acts("drag_handle", Some(&json!({"action": "end"}))),
            "a held button's release runs"
        );
    }
}
