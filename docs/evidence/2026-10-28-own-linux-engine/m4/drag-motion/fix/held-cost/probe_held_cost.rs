//! Probe (not committed): what a held `drag_handle` move's points cost, from the motions it sends. A browser window of
//! the probe's own records every motion's server time; each held move goes 360 px (the vendor's ten steps, eleven
//! points with the pointer's own), so it is the longest a held move gets. Per move: the span from its first motion to
//! the first visit of its end (the points, before the rest), and the request's wall time (points, rest, wire).

#![cfg(feature = "live")]

mod support;

use serde_json::json;
use std::thread::sleep;
use std::time::{Duration, Instant};
use support::Engine;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, WindowClass};
use x11rb::wrapper::ConnectionExt as _;

#[test]
fn probe_held_move_cost() {
    for class in ["firefox", "Google-chrome"] {
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        let window = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new().event_mask(EventMask::POINTER_MOTION | EventMask::BUTTON_PRESS);
        conn.create_window(0, window, root, 20, 20, 560, 420, 0, WindowClass::INPUT_OUTPUT, 0, &aux)
            .unwrap();
        let wm_class = format!("probe\0{class}\0");
        conn.change_property8(PropMode::REPLACE, window, AtomEnum::WM_CLASS, AtomEnum::STRING, wm_class.as_bytes())
            .unwrap();
        let state = conn.intern_atom(false, b"WM_STATE").unwrap().reply().unwrap().atom;
        conn.change_property32(PropMode::REPLACE, window, state, state, &[1, x11rb::NONE])
            .unwrap();
        conn.map_window(window).unwrap();
        conn.sync().unwrap();
        let mut engine = Engine::start();
        engine.request("move", json!({"x": 60, "y": 60})).unwrap();
        engine
            .request("drag_handle", json!({"action": "start", "x": 60, "y": 60}))
            .unwrap();
        sleep(Duration::from_millis(50));
        conn.sync().unwrap();
        while conn.poll_for_event().unwrap().is_some() {}
        let (mut spans, mut walls, mut counts) = (Vec::new(), Vec::new(), Vec::new());
        for k in 0..40 {
            let end = if k % 2 == 0 { (420, 60) } else { (60, 60) };
            let t = Instant::now();
            engine
                .request("drag_handle", json!({"action": "move_to", "x": end.0, "y": end.1}))
                .unwrap();
            walls.push(t.elapsed().as_secs_f64() * 1000.0);
            conn.sync().unwrap();
            let mut motions = Vec::new();
            while let Some(event) = conn.poll_for_event().unwrap() {
                if let Event::MotionNotify(e) = event {
                    motions.push((e.root_x, e.root_y, e.time));
                }
            }
            let first = motions[0].2;
            let at_end = motions.iter().find(|m| (m.0, m.1) == end).unwrap().2;
            spans.push(at_end.wrapping_sub(first));
            counts.push(motions.len());
            sleep(Duration::from_millis(10));
        }
        engine.request("drag_handle", json!({"action": "end"})).unwrap();
        drop(engine);
        let _ = conn.destroy_window(window);
        let _ = conn.sync();
        spans.sort();
        walls.sort_by(|a, b| a.partial_cmp(b).unwrap());
        counts.sort();
        println!(
            "PROBE {class}: motions per move {:?}..{:?}; points span (server ms) median {} max {}; request wall ms median {:.2} max {:.2}",
            counts[0],
            counts[counts.len() - 1],
            spans[spans.len() / 2],
            spans[spans.len() - 1],
            walls[walls.len() / 2],
            walls[walls.len() - 1]
        );
    }
}
