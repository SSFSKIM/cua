//! The capability report (Design, The capability report): what this engine's backend can do, so cua's service can
//! name a missing capability in one sentence instead of failing inside the engine. The X11 backend answers every
//! capability; a later Wayland backend answers with its own values. The vendor JavaScript never sends the command.

use serde_json::{Value, json};

use crate::engine::DesktopMode;

impl DesktopMode {
    /// The mode as the CLI and the report name it.
    pub fn name(self) -> &'static str {
        match self {
            DesktopMode::Shared => "shared",
            DesktopMode::Dedicated => "dedicated",
        }
    }
}

/// `capabilities`' answer: the X11 backend's fixed capabilities, the device mode this engine was started with, its
/// version and the commit it was built from.
pub fn report(desktop: DesktopMode, version: &str, build: &str) -> Value {
    json!({
        "backend": "x11",
        "tree": "at_spi",
        "input": { "background": true, "desktop": true },
        "capture": { "window": "retained", "desktop": true },
        "text": { "paste": "verified", "literal": true },
        "desktop": desktop.name(),
        "version": version,
        "build": build,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_x11_backend_reports_every_capability_and_its_device_mode() {
        assert_eq!(
            report(DesktopMode::Dedicated, "0.3.0", "abc123def456"),
            json!({
                "backend": "x11",
                "tree": "at_spi",
                "input": {"background": true, "desktop": true},
                "capture": {"window": "retained", "desktop": true},
                "text": {"paste": "verified", "literal": true},
                "desktop": "dedicated",
                "version": "0.3.0",
                "build": "abc123def456",
            })
        );
        assert_eq!(report(DesktopMode::Shared, "0.3.0", "x")["desktop"], json!("shared"));
    }
}
