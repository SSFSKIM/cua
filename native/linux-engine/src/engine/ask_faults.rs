//! #228's request on a desktop that changes during it (task 185's fix wave 2): the request turns on accessibility for
//! a whole process and cannot be taken back, so right before it the engine runs the window's association again on
//! every route, the vendor's own title match included (`Associated::confirm_for_ask`). Here a real GTK 3 process
//! (`tests/support/gtk3-twins.py`) shows one window, which the association matches by its title alone; a second
//! window of the same title and size appears at the same place while the request's lookups run. The test plays the
//! lookups' part (GTK is not Chromium and its windows have no Electron role), and the real association, on the real
//! registry and X server, decides.
//!
//! It needs `--features live` (an X display, AT-SPI) and python3-gi with GTK 3, as `identity_faults` does.

use std::thread::sleep;
use std::time::{Duration, Instant};

use anyhow::Result;
use serde_json::json;

use super::identity_faults::{Fixture, fixture, read, wait_for};
use super::{Engine, FrameApp};
use crate::ask::{self, Application, Delivery, Left, Sent};
use crate::atspi::{self, Associated, Association, Told};
use crate::clipboard::tests::serial;
use crate::tree::{AxNode, ReadStats};
use crate::wait::Frame;

const PATIENCE: Duration = Duration::from_secs(20);
const GET_ATTRIBUTES: &str = "org.a11y.atspi.Accessible.GetAttributes";

/// The frame's application as the engine reaches it (`FrameApp`), but with the lookups answered as an Electron
/// window's would be, and the desktop changed during the toolkit's lookup by `during_lookup`.
struct Changing<'a, F: FnMut()> {
    inner: FrameApp<'a>,
    during_lookup: F,
    sends: usize,
}

impl<F: FnMut()> Frame for Changing<'_, F> {
    fn now(&self) -> Instant {
        self.inner.now()
    }
    fn pause(&mut self, length: Duration) {
        self.inner.pause(length)
    }
    fn read_by(&mut self, deadline: Instant) -> Result<Option<(Option<AxNode>, ReadStats)>> {
        self.inner.read_by(deadline)
    }
}

impl<F: FnMut()> Application for Changing<'_, F> {
    fn bus_name(&self) -> &str {
        self.inner.bus_name()
    }
    fn asked(&mut self) -> &mut ask::Asked {
        self.inner.asked()
    }
    fn read_toolkit(&mut self) -> Result<Option<String>> {
        (self.during_lookup)();
        Ok(Some(ask::CHROMIUM_TOOLKIT.into()))
    }
    fn read_role(&mut self) -> Option<String> {
        Some(ask::ELECTRON_ROLE.into())
    }
    fn confirm(&mut self) -> Result<bool> {
        self.inner.confirm()
    }
    fn send(&mut self) -> Result<Delivery> {
        self.sends += 1;
        self.inner.send()
    }
}

/// Window `window`'s association as a state read makes it.
fn associate(engine: &mut Engine, window: u32) -> Association {
    engine
        .with_bus(|bus, x| {
            let info = x.get_window(window)?;
            atspi::associate(bus, x, &info)
        })
        .unwrap()
}

fn gets(engine: &Engine) -> u64 {
    engine
        .bus
        .as_ref()
        .and_then(|bus| bus.stats.by_member.get(GET_ATTRIBUTES).copied())
        .unwrap_or(0)
}

/// The fixture's one window, its tree on the bus and matched by its title alone; or None without GTK 3.
fn one_window(tag: &str) -> Option<(Engine, Fixture, u32, Associated)> {
    let fixture = fixture(tag, 1, &[])?;
    let a = fixture.windows[0];
    let mut engine = Engine::new(crate::default_config()).unwrap();
    let deadline = Instant::now() + PATIENCE;
    let associated = loop {
        if let Association::Frame(found) = associate(&mut engine, a)
            && read(&mut engine, a).is_ok()
        {
            break found;
        }
        assert!(Instant::now() < deadline, "window A's frame is on the bus");
        sleep(Duration::from_millis(100));
    };
    assert_eq!(
        associated.told,
        Told::Title,
        "a unique window is the vendor's own title match"
    );
    Some((engine, fixture, a, associated))
}

#[test]
#[cfg_attr(
    not(feature = "live"),
    ignore = "needs an X display, AT-SPI and python3-gi with GTK 3 (--features live)"
)]
fn a_same_title_sibling_that_appears_during_the_lookups_stops_the_request() {
    let _serial = serial();
    let Some((mut engine, fixture, a, associated)) = one_window("ask") else {
        return;
    };
    // the control: while the window is unique, the confirmation holds and the request goes out
    {
        let mut app = Changing {
            inner: FrameApp {
                engine: &mut engine,
                associated: &associated,
                window: a,
            },
            during_lookup: || {},
            sends: 0,
        };
        let asked = ask::ask_if_due(true, true, &mut app);
        assert_eq!((asked.left, asked.sent, app.sends), (None, Some(Sent::Answered), 1));
    }
    assert_eq!(gets(&engine), 1);
    engine.asked.forget();
    // a sibling of the same title and size appears at the same place while the toolkit is looked up
    let twin = fixture.commands();
    let log = fixture.log.clone();
    let mut sibling_shown = false;
    // a second engine, its own connection, watches for the sibling's frame on the bus
    let mut watcher = Engine::new(crate::default_config()).unwrap();
    {
        let mut app = Changing {
            inner: FrameApp {
                engine: &mut engine,
                associated: &associated,
                window: a,
            },
            during_lookup: || {
                twin("twin");
                wait_for(&log, "the sibling mapped", |l| {
                    l.iter().any(|r| r["marker"] == json!(2))
                });
                let deadline = Instant::now() + PATIENCE;
                while matches!(associate(&mut watcher, a), Association::Frame(f) if f.told == Told::Title) {
                    assert!(Instant::now() < deadline, "the sibling's frame on the bus");
                    sleep(Duration::from_millis(50));
                }
                sibling_shown = true;
            },
            sends: 0,
        };
        let skipped = ask::ask_if_due(true, true, &mut app);
        let sends = app.sends;
        assert!(sibling_shown);
        assert_eq!(
            (skipped.left, skipped.sent, sends),
            (Some(Left::Changed), None, 0),
            "nothing sent"
        );
    }
    assert_eq!(gets(&engine), 1, "no GetAttributes beyond the control's");
    assert!(
        !engine.asked.asked_before(&associated.app.bus),
        "the skip is not remembered"
    );
    // the reads keep their own confirmation, which trusts the vendor's title match
    let still = engine.with_bus(|bus, x| associated.confirm(bus, x)).unwrap();
    assert!(still, "the read path's confirmation is as it was");
    let now = associate(&mut engine, a);
    assert!(
        !matches!(&now, Association::Frame(f) if f.told == Told::Title),
        "the association is no longer the unique title match"
    );
}
