//! Which route a request's input takes for a family that may ignore it (Design, Device mode and the foreground
//! route): the background route; for a kind the window's family ignores there (`families.rs`), a refusal in `shared`
//! mode and the foreground route in `dedicated` mode (the window activated, then the desktop route); with no window,
//! the desktop route. The route taken is recorded on the `--stats` line as `route`, so the harness's witness can key
//! its allowance on the route rather than on the mode.

use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use serde_json::json;
use x11rb::protocol::xproto::Window;

use super::Engine;
use super::windows::activate;
use crate::atspi;
use crate::engine::DesktopMode;
use crate::families::{Kind, When};
use crate::focus_ack::{FocusAck, no_frame, nothing_pressed};
use crate::input::focus_is_within;
use crate::route::Target;
use crate::tree::ObjRef;

/// How long an activated window may take to hold the X input focus (the foreground route).
const ACTIVATION_WAIT: Duration = Duration::from_secs(1);
const FOCUS_POLL: Duration = Duration::from_millis(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Way {
    /// `SendEvent` to the window, with the session's synthetic focus.
    Background,
    /// The window activated, then XTEST (dedicated mode, a family that ignores the background route).
    Foreground,
    /// XTEST into whatever has the focus (no window named).
    Desktop,
}

impl Way {
    pub(super) fn name(self) -> &'static str {
        match self {
            Way::Background => "background",
            Way::Foreground => "foreground",
            Way::Desktop => "desktop",
        }
    }

    /// The input target the route sends to.
    pub(super) fn target(self, window: Window) -> Target {
        match self {
            Way::Background => Target::Window(window),
            Way::Foreground => Target::Foreground(window),
            Way::Desktop => Target::Desktop,
        }
    }
}

/// The input target of a route into an optional window: the desktop when no window is named.
pub(super) fn target_of(way: Way, window: Option<Window>) -> Target {
    window.map_or(Target::Desktop, |window| way.target(window))
}

/// The Device mode sentence, in shared mode, for a kind the family ignores on the background route.
pub(super) fn no_background_input(app: &str) -> String {
    format!("{app} does not accept background input; use a dedicated desktop or activate the window first")
}

impl Engine {
    /// The route `kind` takes into `window` (None: the desktop route), refusing it in shared mode where the family
    /// ignores it, with nothing activated yet (`Engine::enter` and `enter_checked` activate the foreground route's
    /// window), so a request refused for its input changes nothing. The route is recorded as the `--stats` line's
    /// `route`.
    pub(super) fn route_for(&mut self, window: Option<Window>, kind: Kind) -> Result<Way> {
        self.route_along(window, kind, &[])
    }

    /// [`Engine::route_for`] for input along a path of root points (a drag's every sample): a family's
    /// `unless_path_unobscured` judges the path.
    pub(super) fn route_along(&mut self, window: Option<Window>, kind: Kind, path: &[(i16, i16)]) -> Result<Way> {
        let way = match window {
            None => Way::Desktop,
            Some(window) => {
                let family = self.family_of(window);
                let ignored = match family.and_then(|f| f.ignores(kind)) {
                    Some(When::Always) => true,
                    // measurement only (T19, `--ignore-pointer`): the pointer not judged
                    Some(When::UnlessPointerWithin) => !self.cfg.ignore_pointer && !self.pointer_within(window),
                    // measurement only (T13, T19): the path's cover left unjudged
                    Some(When::UnlessPathUnobscured) => {
                        !self.cfg.drag_ignore_cover && !self.cfg.ignore_cover && !self.x.points_unobscured(window, path)
                    }
                    None => false,
                };
                return self.route_judged(window, ignored);
            }
        };
        self.record_route(way);
        Ok(way)
    }

    /// The route into `window` once whether its family ignores the request there is judged (`ignored`): the background
    /// route if not, else the foreground route in dedicated mode, refused in shared mode. Recorded as `--stats`'s
    /// `route`.
    pub(super) fn route_judged(&mut self, window: Window, ignored: bool) -> Result<Way> {
        let way = match (ignored, self.cfg.desktop) {
            (false, _) => Way::Background,
            (true, DesktopMode::Dedicated) => Way::Foreground,
            (true, DesktopMode::Shared) => bail!(no_background_input(&self.x.get_window(window)?.app)),
        };
        self.record_route(way);
        Ok(way)
    }

    /// Whether the real pointer is in `window`: the deepest window the server finds under it is the window or below it
    /// (`X11::pointer_in`, from the window's parent). A read that fails is doubt, which counts as outside.
    pub(super) fn pointer_within(&self, window: Window) -> bool {
        // test builds only: the desktop changed just before this read
        #[cfg(test)]
        crate::fault::identity(crate::fault::Identity::PointerRead);
        self.x
            .parent(window)
            .and_then(|parent| self.x.pointer_in(window, parent))
            .unwrap_or(false)
    }

    /// The foreground route's start for a request that checks its own input first (`check`: its chord, its path, its
    /// amount), as `press_key` does: a request refused for its input activates nothing. On the other routes nothing
    /// happens here, and the request checks its input inside the route, in the vendor's order.
    pub(super) fn enter_checked(
        &mut self,
        way: Way,
        window: Option<Window>,
        check: impl FnOnce(&crate::x11::X11) -> Result<()>,
    ) -> Result<()> {
        if let (Way::Foreground, Some(window)) = (way, window) {
            check(&self.x)?;
            self.enter(window)?;
        }
        Ok(())
    }

    /// The wait a background press into `target` needs before it (`focus_ack.rs`): in shared mode, for a family whose
    /// press activates a window it has not focused, with a bound set; None otherwise. `frame`: the window's frame where
    /// the request has associated it already (an element's), else associated here, the association's refusal answering
    /// a window with no frame it can stand behind. Before the request's session opens, an earlier focus the toolkit still
    /// holds is let go, unless a session is open for the window already or the real focus is within it.
    pub(super) fn focus_ack_for(&mut self, target: Target, frame: Option<ObjRef>) -> Result<Option<FocusAck>> {
        let Target::Window(window) = target else {
            return Ok(None);
        };
        if self.cfg.desktop != DesktopMode::Shared || self.cfg.focus_ack.is_zero() {
            return Ok(None);
        }
        if !self.family_of(window).is_some_and(|f| f.activates_on_press) {
            // Qt with no accessibility tree has no frame to wait on (the design session's ruling B), found by its
            // `_XEMBED_INFO` mark or its process's map (`qt_without_tree` on the `--stats` line)
            if self.qt_without_toolkit(window).is_some() {
                bail!(nothing_pressed(no_frame(&self.x.get_window(window)?.app)));
            }
            return Ok(None);
        }
        let info = self.x.get_window(window)?;
        let frame = match frame {
            Some(frame) => frame,
            None => {
                self.with_bus(|bus, x| atspi::associated(bus, x, &info))?
                    .map_err(anyhow::Error::msg)?
                    .frame
            }
        };
        let mut ack = FocusAck::new(frame, info.app, self.cfg.focus_ack);
        if !self.inputs.open_for(window) && !focus_is_within(&self.x, window)? {
            let bus = self
                .bus
                .as_mut()
                .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
            if let Err(cause) = ack.released(bus)? {
                bail!(nothing_pressed(cause));
            }
            // the session this request opens sends a FocusIn of its own, which its first press waits for
            ack.expect_focus_in();
        }
        Ok(Some(ack))
    }

    /// A press's wait on the `--stats` line (`focus_ack`), for the harness: its bound and what it waited.
    pub(super) fn record_focus_ack(&mut self, ack: Option<&FocusAck>) {
        if let Some(ack) = ack {
            self.extra.insert("focus_ack".into(), ack.record());
        }
    }

    /// The route on the `--stats` line, for the harness's witness.
    pub(super) fn record_route(&mut self, way: Way) {
        self.extra.insert("route".into(), json!(way.name()));
    }

    /// The foreground route's start: the window activated, and holding the X input focus. The focus is the engine's own
    /// request and comes at once; the raise is the window manager's and can come later, so pointer input waits for it
    /// at its own points before it sends anything (`Route::on_top_at`, task 63). Keys go to the focus, which this waits
    /// for.
    pub(super) fn enter(&mut self, window: Window) -> Result<()> {
        activate(&self.x, window)?;
        let deadline = Instant::now() + ACTIVATION_WAIT;
        while !focus_is_within(&self.x, window)? {
            if Instant::now() >= deadline {
                bail!("window {window} did not take the input focus when activated; nothing was sent");
            }
            std::thread::sleep(FOCUS_POLL);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_device_mode_sentence_names_the_application() {
        assert_eq!(
            no_background_input("org.gnome.TextEditor"),
            concat!(
                "org.gnome.TextEditor does not accept background input; ",
                "use a dedicated desktop or activate the window first"
            )
        );
    }
}
