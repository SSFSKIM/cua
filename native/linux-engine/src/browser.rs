//! Positive identification of a Chrome or Chromium browser window, the only source whose hold for its take extends
//! on slow pings (`adaptive_hold.rs`; the design session's rulings 897-900). Electron and the applications that embed
//! Chromium are Chromium's engine too, and their windows can carry a class like a browser's, but their browser process
//! answers `_NET_WM_PING` fast while a drag starts (task 116), so the ping says nothing about them: they keep the fixed
//! hold. A window is identified only when everything below holds; anything unread, absent or different leaves it
//! unidentified, which keeps the fixed hold, the safe direction.
//!
//! - `WM_CLASS`'s class is a Chrome or Chromium browser's ([`BROWSER_CLASSES`]).
//! - `WM_WINDOW_ROLE` is one Chrome's browser frame sets on its own windows ([`BROWSER_ROLES`]): "browser" for a
//!   browser window, "pop-up" for a popup. Electron's windows say "browser-window" (both probed on x64, task 117).
//! - `WM_CLIENT_MACHINE` is this host's name, so `_NET_WM_PID` names a process here.
//! - The accessibility bus's application for that pid is named as a Chrome or Chromium browser names its own
//!   ([`BROWSER_APPLICATIONS`]); Electron's is named for its app. A lookup that fails, runs out of its time
//!   (`adaptive_hold::IDENTIFY_BOUND`) or finds no application leaves the window unidentified.
//! - Where `/proc` shows that process, its executable is a Chrome or Chromium browser's ([`BROWSER_EXECUTABLES`]). In
//!   service the engine runs in the sandbox's own PID namespace, where a host process cannot be seen (spec, line 1580;
//!   probed by task 117), so an executable that cannot be read does not disqualify; one that can be read and differs
//!   does. The design session's ruling 899, on task 117's escalation: the executable alone, which ruling 898.1 named,
//!   would leave every person's Chrome unidentified in service, so the accessibility bus's name stands where `/proc`
//!   cannot see.

use std::path::Path;

/// The `WM_CLASS` classes of Chrome and Chromium browsers: Google Chrome (every channel), Chromium as Debian, Arch and
/// the snap build it, and Chromium as Ubuntu's old deb built it.
pub const BROWSER_CLASSES: &[&str] = &["Google-chrome", "Chromium", "Chromium-browser"];

/// The `WM_WINDOW_ROLE`s Chrome's browser frame gives its windows: a browser window, and a popup.
pub const BROWSER_ROLES: &[&str] = &["browser", "pop-up"];

/// The accessibility bus's names of a Chrome or Chromium browser's application: the product's name, which Chromium
/// gives its accessible application.
pub const BROWSER_APPLICATIONS: &[&str] = &["Google Chrome", "Chromium"];

/// The browser executables' file names: `chrome` (Google Chrome, every channel, `/opt/google/chrome*/chrome`; Chrome for
/// Testing; the snap's Chromium, which runs `.../chromium-browser/chrome`), `chromium` (Debian's and Arch's
/// `/usr/lib/chromium/chromium`) and `chromium-browser` (Ubuntu's old deb). An Electron app's executable is its own
/// name or `electron`, and an embedding application's is its own.
pub const BROWSER_EXECUTABLES: &[&str] = &["chrome", "chromium", "chromium-browser"];

/// What the engine read of a window to identify it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Marks {
    pub class: Option<String>,
    pub role: Option<String>,
    pub machine: Option<String>,
    pub pid: Option<u32>,
}

/// What `/proc/<pid>/exe` says, when it can be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Executable {
    /// The link's target, as read.
    Read(String),
    /// No such process here (another PID namespace, a process gone) or the link not readable.
    Unread,
}

/// Whether the window is a Chrome or Chromium browser's: `Ok` with what identified it, else `Err` with why not. `host`
/// is this host's name; `application` the accessibility bus's application name for the window's process, asked only
/// once the window's own marks hold (it costs bus calls); `exe` what `/proc` says of that process.
pub fn identify(
    marks: &Marks,
    host: Option<&str>,
    application: impl FnOnce(u32) -> Result<Option<String>, String>,
    exe: impl FnOnce(u32) -> Executable,
) -> Result<String, String> {
    let class = marks.class.as_deref().ok_or("its window has no WM_CLASS")?;
    if !BROWSER_CLASSES.contains(&class) {
        return Err(format!(
            "its WM_CLASS class {class:?} is not a Chrome or Chromium browser's"
        ));
    }
    let role = marks.role.as_deref().ok_or("its window has no WM_WINDOW_ROLE")?;
    if !BROWSER_ROLES.contains(&role) {
        return Err(format!("its WM_WINDOW_ROLE {role:?} is not a browser frame's"));
    }
    let machine = marks.machine.as_deref().ok_or("its window has no WM_CLIENT_MACHINE")?;
    if host != Some(machine) {
        return Err(format!("its WM_CLIENT_MACHINE {machine:?} is not this host"));
    }
    let pid = marks.pid.ok_or("its window has no _NET_WM_PID")?;
    let app = match application(pid) {
        Ok(Some(app)) if BROWSER_APPLICATIONS.contains(&app.as_str()) => app,
        Ok(Some(app)) => {
            return Err(format!(
                "its accessible application is named {app:?}, not a Chrome or Chromium browser"
            ));
        }
        Ok(None) => return Err("its process has no accessible application".into()),
        Err(why) => return Err(format!("its accessible application could not be read: {why}")),
    };
    match exe(pid) {
        Executable::Read(target) => {
            // a binary replaced while it runs (a browser updated in place) reads with this suffix
            let path = target.strip_suffix(" (deleted)").unwrap_or(&target);
            let name = Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("");
            match BROWSER_EXECUTABLES.contains(&name) {
                true => Ok(format!("{class}, role {role}, application {app:?}, executable {name}")),
                false => Err(format!("its process runs {name:?}, not a Chrome or Chromium browser")),
            }
        }
        Executable::Unread => Ok(format!(
            "{class}, role {role}, application {app:?}, executable not visible here"
        )),
    }
}

/// `/proc/<pid>/exe`'s target.
pub fn executable(pid: u32) -> Executable {
    match std::fs::read_link(format!("/proc/{pid}/exe")) {
        Ok(target) => Executable::Read(target.to_string_lossy().into_owned()),
        Err(_) => Executable::Unread,
    }
}

/// This host's name, as `WM_CLIENT_MACHINE` gives it (Chromium writes `gethostname`'s).
pub fn host_name() -> Option<String> {
    std::fs::read_to_string("/proc/sys/kernel/hostname")
        .ok()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chrome() -> Marks {
        Marks {
            class: Some("Google-chrome".into()),
            role: Some("browser".into()),
            machine: Some("box".into()),
            pid: Some(42),
        }
    }

    fn read(path: &'static str) -> impl FnOnce(u32) -> Executable {
        move |_| Executable::Read(path.into())
    }

    fn named(name: &'static str) -> impl FnOnce(u32) -> Result<Option<String>, String> {
        move |_| Ok(Some(name.into()))
    }

    #[test]
    fn chrome_and_chromium_browsers_are_identified_by_class_role_host_application_and_executable() {
        assert_eq!(
            identify(
                &chrome(),
                Some("box"),
                named("Google Chrome"),
                read("/opt/google/chrome/chrome")
            ),
            Ok("Google-chrome, role browser, application \"Google Chrome\", executable chrome".into())
        );
        for (class, app, exe) in [
            ("Chromium", "Chromium", "/usr/lib/chromium/chromium"),
            (
                "Chromium",
                "Chromium",
                "/snap/chromium/3000/usr/lib/chromium-browser/chrome",
            ),
            (
                "Chromium-browser",
                "Chromium",
                "/usr/lib/chromium-browser/chromium-browser",
            ),
            ("Google-chrome", "Google Chrome", "/opt/google/chrome-beta/chrome"),
            ("Google-chrome", "Google Chrome", "/opt/google/chrome/chrome (deleted)"),
        ] {
            let marks = Marks {
                class: Some(class.into()),
                ..chrome()
            };
            assert!(
                identify(&marks, Some("box"), named(app), read(exe)).is_ok(),
                "{class} {exe}"
            );
        }
        let popup = Marks {
            role: Some("pop-up".into()),
            ..chrome()
        };
        assert!(
            identify(
                &popup,
                Some("box"),
                named("Google Chrome"),
                read("/opt/google/chrome/chrome")
            )
            .is_ok()
        );
    }

    #[test]
    fn an_executable_hidden_from_the_engine_does_not_disqualify_but_a_different_one_does() {
        assert_eq!(
            identify(&chrome(), Some("box"), named("Google Chrome"), |_| Executable::Unread),
            Ok("Google-chrome, role browser, application \"Google Chrome\", executable not visible here".into())
        );
        for exe in [
            "/usr/lib/electron/electron",
            "/usr/share/code/code",
            "/opt/spotify/spotify",
        ] {
            assert_eq!(
                identify(&chrome(), Some("box"), named("Google Chrome"), read(exe))
                    .map_err(|e| e.contains("not a Chrome or Chromium browser")),
                Err(true),
                "{exe}"
            );
        }
    }

    #[test]
    fn electron_and_anything_unread_are_not_identified() {
        let electron = Marks {
            class: Some("cua-electron-fixture".into()),
            role: Some("browser-window".into()),
            ..chrome()
        };
        assert!(
            identify(
                &electron,
                Some("box"),
                named("cua-electron-fixture"),
                read("/x/electron")
            )
            .is_err()
        );
        // a class like Chrome's on an Electron window: its role still says Electron
        let classed = Marks {
            role: Some("browser-window".into()),
            ..chrome()
        };
        assert_eq!(
            identify(
                &classed,
                Some("box"),
                named("Google Chrome"),
                read("/opt/google/chrome/chrome")
            ),
            Err("its WM_WINDOW_ROLE \"browser-window\" is not a browser frame's".into())
        );
        let cases = [
            Marks {
                class: None,
                ..chrome()
            },
            Marks { role: None, ..chrome() },
            Marks {
                machine: None,
                ..chrome()
            },
            Marks { pid: None, ..chrome() },
            Marks {
                machine: Some("elsewhere".into()),
                ..chrome()
            },
        ];
        for marks in cases {
            assert!(
                identify(
                    &marks,
                    Some("box"),
                    named("Google Chrome"),
                    read("/opt/google/chrome/chrome")
                )
                .is_err(),
                "{marks:?}"
            );
        }
        assert!(
            identify(
                &chrome(),
                None,
                named("Google Chrome"),
                read("/opt/google/chrome/chrome")
            )
            .is_err(),
            "no host name to compare"
        );
    }

    #[test]
    fn the_accessible_application_must_be_a_browser_s_and_a_failed_lookup_leaves_the_window_unidentified() {
        let chrome_exe = || read("/opt/google/chrome/chrome");
        // a stub with Chrome's class and role whose application has another name
        assert_eq!(
            identify(&chrome(), Some("box"), named("Spotify"), chrome_exe()),
            Err("its accessible application is named \"Spotify\", not a Chrome or Chromium browser".into())
        );
        assert_eq!(
            identify(&chrome(), Some("box"), |_| Ok(None), chrome_exe()),
            Err("its process has no accessible application".into())
        );
        assert_eq!(
            identify(
                &chrome(),
                Some("box"),
                |_| Err("the accessibility bus did not answer in time".into()),
                chrome_exe()
            ),
            Err("its accessible application could not be read: the accessibility bus did not answer in time".into())
        );
        // the bus is asked only once the window's own marks hold
        let electron = Marks {
            role: Some("browser-window".into()),
            ..chrome()
        };
        let asked = std::cell::Cell::new(false);
        let _ = identify(
            &electron,
            Some("box"),
            |_| {
                asked.set(true);
                Ok(Some("Google Chrome".into()))
            },
            chrome_exe(),
        );
        assert!(!asked.get());
    }
}
