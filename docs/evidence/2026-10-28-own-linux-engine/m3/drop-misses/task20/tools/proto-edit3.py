# proto-edit3.py: the stray watch sees through Chrome's pointer grab: XInput 2 raw motion and button events on the root
# (delivered to every client that selects them, grab or not), besides the core crossing and motion on the window.
root = '/Users/new/.local/share/cua-171/task20/proto/linux-engine/'

def sub(path, old, new):
    s = open(root + path).read()
    assert old in s, (path, old[:60])
    open(root + path, 'w').write(s.replace(old, new, 1))

sub('Cargo.toml', 'features = ["composite", "damage", "xtest", "xfixes", "render", "shm"]', 'features = ["composite", "damage", "xtest", "xfixes", "render", "shm", "xinput"]')
open(root + 'src/stray.rs', 'w').write('''//! Task 20 (proto, measurement only): the real pointer's events during a drag, on a connection of its own: XInput 2
//! raw motion on the root (every client that selects raw events gets them, whoever holds a grab), and the core
//! crossing and motion events on the target window (which a grab by the window's owner keeps from other clients).

use std::time::Instant;

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask, Window};
use x11rb::rust_connection::RustConnection;

pub struct StrayWatch {
    conn: RustConnection,
    pub events: Vec<(String, f64, u8)>,
}

impl StrayWatch {
    pub fn start(window: Window) -> Result<StrayWatch> {
        let (conn, screen) = x11rb::connect(None)?;
        let root = conn.setup().roots[screen].root;
        conn.xinput_xi_query_version(2, 2)?.reply()?;
        conn.xinput_xi_select_events(
            root,
            &[xinput::EventMask {
                deviceid: u16::from(xinput::Device::ALL_MASTER),
                mask: vec![xinput::XIEventMask::RAW_MOTION],
            }],
        )?
        .check()?;
        let aux = ChangeWindowAttributesAux::new()
            .event_mask(EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW | EventMask::POINTER_MOTION);
        conn.change_window_attributes(window, &aux)?.check()?;
        Ok(StrayWatch { conn, events: Vec::new() })
    }

    /// Every event that has arrived, stamped in ms after `since`.
    pub fn poll(&mut self, since: Instant) {
        while let Ok(Some(event)) = self.conn.poll_for_event() {
            let at = since.elapsed().as_secs_f64() * 1000.0;
            match event {
                Event::XinputRawMotion(_) => self.events.push(("raw_motion".into(), at, 0)),
                Event::EnterNotify(e) => self.events.push(("enter".into(), at, u8::from(e.mode))),
                Event::LeaveNotify(e) => self.events.push(("leave".into(), at, u8::from(e.mode))),
                Event::MotionNotify(_) => self.events.push(("motion".into(), at, 0)),
                _ => {}
            }
        }
    }
}
''')
