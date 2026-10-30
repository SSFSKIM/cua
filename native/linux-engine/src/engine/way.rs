//! Which route a request's input takes for a family that may ignore it (Design, Device mode and the foreground
//! route): the background route; for a kind the window's family ignores there (`families.rs`), a refusal in `shared`
//! mode and the foreground route in `dedicated` mode (the window activated, then the desktop route); with no window,
//! the desktop route. The route taken is recorded on the `--stats` line as `route`, so the harness's witness can key
//! its allowance on the route rather than on the mode.

use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use serde_json::json;
use x11rb::protocol::xproto::Window;

use super::Engine;
use super::windows::activate;
use crate::engine::DesktopMode;
use crate::families::{Kind, When};
use crate::input::focus_is_within;
use crate::route::Target;

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

/// The Device mode sentence, in shared mode, for a kind the family ignores on the background route.
pub(super) fn no_background_input(app: &str) -> String {
    format!("{app} does not accept background input; use a dedicated desktop or activate the window first")
}

impl Engine {
    /// The route `kind` takes into `window` (None: the desktop route), refusing it in shared mode where the family
    /// ignores it; on the foreground route the window is activated and holds the X input focus before this returns.
    /// The route is recorded as the `--stats` line's `route`.
    pub(super) fn way_for(&mut self, window: Option<Window>, kind: Kind) -> Result<Way> {
        let way = self.route_for(window, kind)?;
        if let (Way::Foreground, Some(window)) = (way, window) {
            self.enter(window)?;
        }
        Ok(way)
    }

    /// [`Engine::way_for`]'s choice alone, with nothing activated yet: for a request that checks its own input
    /// before the foreground route activates the window, so that one refused for its input changes nothing.
    pub(super) fn route_for(&mut self, window: Option<Window>, kind: Kind) -> Result<Way> {
        let way = match window {
            None => Way::Desktop,
            Some(window) => {
                let family = self.family_of(window);
                let ignored = match family.and_then(|f| f.ignores(kind)) {
                    Some(When::Always) => true,
                    Some(When::UnlessUnobscured) => !self.x.unobscured(window),
                    None => false,
                };
                match (ignored, self.cfg.desktop) {
                    (false, _) => Way::Background,
                    (true, DesktopMode::Dedicated) => Way::Foreground,
                    (true, DesktopMode::Shared) => bail!(no_background_input(&self.x.get_window(window)?.app)),
                }
            }
        };
        self.record_route(way);
        Ok(way)
    }

    /// The input target `kind` takes into `window` (None: the desktop), refused in shared mode where the family ignores
    /// it, the window entered on the foreground route: for a request whose input needs no check before the route.
    pub(super) fn target_for(&mut self, window: Option<Window>, kind: Kind) -> Result<Target> {
        let way = self.way_for(window, kind)?;
        Ok(window.map_or(Target::Desktop, |window| way.target(window)))
    }

    /// The route on the `--stats` line, for the harness's witness.
    pub(super) fn record_route(&mut self, way: Way) {
        self.extra.insert("route".into(), json!(way.name()));
    }

    /// The foreground route's start: the window activated, and holding the X input focus.
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
