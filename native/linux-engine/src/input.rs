//! The background route (behaviour §8; Design, The background route): input addressed to one window with
//! `SendEvent`, synthetic focus, pointer events to the deepest child under the point, and timestamps from a
//! server-time anchor. No request here activates, raises, focuses or moves the pointer.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use anyhow::{Result, bail};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::*;

use crate::keys::{Keymap, parse_chord, resolve};
use crate::x11::X11;

/// The engine's waits on this route, each one the vendor's value unless a flag changes it.
#[derive(Debug, Clone, Copy)]
pub struct Pacing {
    /// After each new key edge (the pinned build's 33 ms).
    pub key: Duration,
    /// Before the session's teardown (the vendor's 100 ms).
    pub teardown: Duration,
}

/// The keyboard mapping, read fresh per chord as the vendor opens a fresh display per call.
pub fn keymap(x: &X11) -> Result<Keymap> {
    let setup = x.conn.setup();
    let (min, max) = (setup.min_keycode, setup.max_keycode);
    let reply = x.conn.get_keyboard_mapping(min, max - min + 1)?.reply()?;
    Ok(Keymap {
        min_keycode: min,
        per: reply.keysyms_per_keycode as usize,
        syms: reply.keysyms,
    })
}

/// Parses and resolves a chord to keycodes; errors are the vendor's sentences.
pub fn chord_keycodes(x: &X11, key: &str) -> Result<Vec<u8>> {
    let keysyms = parse_chord(key).map_err(anyhow::Error::msg)?;
    if keysyms.is_empty() {
        return Ok(Vec::new());
    }
    resolve(&keysyms, &keymap(x)?).map_err(anyhow::Error::msg)
}

/// Where the pointer was last placed: the window events go to, root and window-local coordinates.
#[derive(Debug, Clone, Copy)]
struct Pointer {
    window: Window,
    root_x: i16,
    root_y: i16,
    x: i16,
    y: i16,
}

/// One request's input session for a window (behaviour §8.1).
pub struct Session {
    pub target: Window,
    synthesized_focus: bool,
    redirected: bool,
    anchor_time: u32,
    anchor: Instant,
    modifiers: Vec<(u8, u16)>,
    held_keys: HashMap<u8, u32>,
    press_order: Vec<u8>,
    buttons: u16,
    grab: Option<Window>,
    pointer: Option<Pointer>,
    pacing: Pacing,
}

/// The server time now: an InputOnly window's property change, whose `PropertyNotify` carries the time.
fn server_time(x: &mut X11) -> Result<u32> {
    let window = x.conn.generate_id()?;
    let aux = CreateWindowAux::new().event_mask(EventMask::PROPERTY_CHANGE);
    x.conn
        .create_window(0, window, x.root, 0, 0, 1, 1, 0, WindowClass::INPUT_ONLY, 0, &aux)?;
    x.conn.change_property(
        PropMode::REPLACE,
        window,
        AtomEnum::WM_NAME,
        AtomEnum::STRING,
        8,
        0,
        &[],
    )?;
    // A round trip after the change: its event is queued before this reply arrives.
    x.conn.get_input_focus()?.reply()?;
    let mut time = None;
    while let Some(event) = x.conn.poll_for_event()? {
        match event {
            Event::PropertyNotify(e) if e.window == window => time = Some(e.time),
            other => x.note_event(other),
        }
    }
    x.conn.destroy_window(window)?;
    time.ok_or_else(|| anyhow::anyhow!("X11 did not return a timestamp for background input"))
}

/// Whether the X input focus is the target or inside it (behaviour §8.1, `focus_is_within`).
pub fn focus_is_within(x: &X11, target: Window) -> Result<bool> {
    let mut window = x.conn.get_input_focus()?.reply()?.focus;
    for _ in 0..100 {
        if window == target {
            return Ok(true);
        }
        if window == x11rb::NONE || window == 1 || window == x.root {
            return Ok(false);
        }
        window = x.conn.query_tree(window)?.reply()?.parent;
    }
    Ok(false)
}

impl Session {
    pub fn open(x: &mut X11, target: Window, pacing: Pacing) -> Result<Session> {
        if target == x.root {
            bail!("background input requires an application window");
        }
        let mapping = x.conn.get_modifier_mapping()?.reply()?;
        let per = mapping.keycodes_per_modifier() as usize;
        let mut modifiers = Vec::new();
        for (index, chunk) in mapping.keycodes.chunks(per.max(1)).enumerate() {
            for &keycode in chunk.iter().filter(|k| **k != 0) {
                modifiers.push((keycode, 1u16 << index));
            }
        }
        let anchor_time = server_time(x)?;
        let anchor = Instant::now();
        let within = focus_is_within(x, target)?;
        let redirected = x.retain(target)?;
        let mut session = Session {
            target,
            synthesized_focus: false,
            redirected,
            anchor_time,
            anchor,
            modifiers,
            held_keys: HashMap::new(),
            press_order: Vec::new(),
            buttons: 0,
            grab: None,
            pointer: None,
            pacing,
        };
        if !within {
            let focus_in = FocusInEvent {
                response_type: FOCUS_IN_EVENT,
                detail: NotifyDetail::NONLINEAR,
                sequence: 0,
                event: target,
                mode: NotifyMode::NORMAL,
            };
            if let Err(error) = x
                .conn
                .send_event(false, target, EventMask::NO_EVENT, focus_in)
                .map_err(anyhow::Error::from)
                .and_then(|c| Ok(c.check()?))
            {
                session.synthesized_focus = true;
                session.close(x);
                return Err(error);
            }
            session.synthesized_focus = true;
        }
        Ok(session)
    }

    /// Ends the session: buttons still held released, the teardown wait, FocusOut unless the real focus has
    /// since entered the target, and the per-request unredirect.
    pub fn close(mut self, x: &mut X11) {
        for button in 1..=3u8 {
            if self.buttons & (1 << (button + 7)) != 0 {
                let _ = self.button(x, button, false);
            }
        }
        std::thread::sleep(self.pacing.teardown);
        if self.synthesized_focus && !focus_is_within(x, self.target).unwrap_or(false) {
            let focus_out = FocusOutEvent {
                response_type: FOCUS_OUT_EVENT,
                detail: NotifyDetail::NONLINEAR,
                sequence: 0,
                event: self.target,
                mode: NotifyMode::NORMAL,
            };
            let _ = x
                .conn
                .send_event(false, self.target, EventMask::NO_EVENT, focus_out)
                .map(|c| c.check());
        }
        x.release(self.target, self.redirected);
        let _ = x.flush();
    }

    fn now(&self) -> u32 {
        self.anchor_time.wrapping_add(self.anchor.elapsed().as_millis() as u32)
    }

    /// The held-button mask and the modifier masks of the keys held for this target, before an event updates
    /// them (behaviour §8.3).
    fn state(&self) -> u16 {
        let mut state = self.buttons;
        for (&keycode, &count) in &self.held_keys {
            if count > 0 {
                for &(k, mask) in &self.modifiers {
                    if k == keycode {
                        state |= mask;
                    }
                }
            }
        }
        state
    }

    fn key_event(&mut self, x: &X11, keycode: u8, press: bool) -> Result<()> {
        let event = KeyPressEvent {
            response_type: if press { KEY_PRESS_EVENT } else { KEY_RELEASE_EVENT },
            detail: keycode,
            sequence: 0,
            time: self.now(),
            root: x.root,
            event: self.target,
            child: x11rb::NONE,
            root_x: 0,
            root_y: 0,
            event_x: 0,
            event_y: 0,
            state: self.state().into(),
            same_screen: true,
        };
        x.conn
            .send_event(false, self.target, EventMask::NO_EVENT, event)?
            .check()?;
        Ok(())
    }

    /// Presses each keycode not already held, in order, pacing after each new edge (behaviour §11.3).
    pub fn acquire(&mut self, x: &X11, keycodes: &[u8]) -> Result<Vec<u8>> {
        let mut acquired = Vec::new();
        for &keycode in keycodes {
            let count = self.held_keys.entry(keycode).or_insert(0);
            if *count > 0 {
                *count += 1;
                acquired.push(keycode);
                continue;
            }
            if let Err(error) = self.key_event(x, keycode, true) {
                self.release(x, &acquired);
                return Err(error);
            }
            self.held_keys.insert(keycode, 1);
            self.press_order.push(keycode);
            acquired.push(keycode);
            std::thread::sleep(self.pacing.key);
        }
        Ok(acquired)
    }

    /// Releases in reverse press order; a key held by more than one acquisition is only counted down.
    pub fn release(&mut self, x: &X11, keycodes: &[u8]) {
        for &keycode in keycodes.iter().rev() {
            match self.held_keys.get(&keycode).copied() {
                Some(count) if count > 1 => {
                    self.held_keys.insert(keycode, count - 1);
                }
                Some(1) => {
                    if self.key_event(x, keycode, false).is_ok() {
                        self.held_keys.remove(&keycode);
                        self.press_order.retain(|k| *k != keycode);
                    }
                    std::thread::sleep(self.pacing.key);
                }
                _ => {}
            }
        }
    }

    /// Places the pointer at a root point: Enter and Motion to the deepest viewable child under it, or one
    /// Motion to the implicit-grab window while a button is held (behaviour §8.2).
    pub fn move_to(&mut self, x: &X11, root_x: i16, root_y: i16) -> Result<()> {
        if let Some(grab) = self.grab {
            let local = x.conn.translate_coordinates(x.root, grab, root_x, root_y)?.reply()?;
            self.motion(x, grab, root_x, root_y, local.dst_x, local.dst_y)?;
            self.pointer = Some(Pointer {
                window: grab,
                root_x,
                root_y,
                x: local.dst_x,
                y: local.dst_y,
            });
            return Ok(());
        }
        let base = self.target;
        let local = x.conn.translate_coordinates(x.root, base, root_x, root_y)?;
        let geometry = x.conn.get_geometry(base)?;
        let (local, geometry) = (local.reply()?, geometry.reply()?);
        if local.dst_x < 0
            || local.dst_y < 0
            || local.dst_x as i32 >= geometry.width as i32
            || local.dst_y as i32 >= geometry.height as i32
        {
            bail!("background pointer position is outside the target window");
        }
        let (mut window, mut lx, mut ly) = (base, local.dst_x, local.dst_y);
        for _ in 0..100 {
            let children = x.conn.query_tree(window)?.reply()?.children;
            let mut pending = Vec::with_capacity(children.len());
            for &child in children.iter().rev() {
                pending.push((
                    child,
                    x.conn.get_window_attributes(child)?,
                    x.conn.get_geometry(child)?,
                    x.conn.translate_coordinates(x.root, child, root_x, root_y)?,
                ));
            }
            let mut found = None;
            for (child, attributes, geometry, local) in pending {
                if found.is_some() {
                    continue;
                }
                let (Ok(attributes), Ok(geometry), Ok(local)) = (attributes.reply(), geometry.reply(), local.reply())
                else {
                    continue;
                };
                if attributes.map_state != MapState::VIEWABLE {
                    continue;
                }
                let inside = local.dst_x >= 0
                    && local.dst_y >= 0
                    && (local.dst_x as i32) < geometry.width as i32
                    && (local.dst_y as i32) < geometry.height as i32;
                if inside {
                    found = Some((child, local.dst_x, local.dst_y));
                }
            }
            match found {
                Some((child, cx, cy)) => (window, lx, ly) = (child, cx, cy),
                None => break,
            }
        }
        let enter = EnterNotifyEvent {
            response_type: ENTER_NOTIFY_EVENT,
            detail: NotifyDetail::NONLINEAR,
            sequence: 0,
            time: self.now(),
            root: x.root,
            event: window,
            child: x11rb::NONE,
            root_x,
            root_y,
            event_x: lx,
            event_y: ly,
            state: self.state().into(),
            mode: NotifyMode::NORMAL,
            same_screen_focus: 2,
        };
        x.conn.send_event(false, window, EventMask::NO_EVENT, enter)?.check()?;
        self.motion(x, window, root_x, root_y, lx, ly)?;
        self.pointer = Some(Pointer {
            window,
            root_x,
            root_y,
            x: lx,
            y: ly,
        });
        Ok(())
    }

    fn motion(&self, x: &X11, window: Window, root_x: i16, root_y: i16, lx: i16, ly: i16) -> Result<()> {
        let motion = MotionNotifyEvent {
            response_type: MOTION_NOTIFY_EVENT,
            detail: Motion::NORMAL,
            sequence: 0,
            time: self.now(),
            root: x.root,
            event: window,
            child: x11rb::NONE,
            root_x,
            root_y,
            event_x: lx,
            event_y: ly,
            state: self.state().into(),
            same_screen: true,
        };
        x.conn.send_event(false, window, EventMask::NO_EVENT, motion)?.check()?;
        Ok(())
    }

    /// A button press or release at the last placed position (behaviour §8.3).
    pub fn button(&mut self, x: &X11, button: u8, press: bool) -> Result<()> {
        let Some(pointer) = self.pointer else {
            bail!("background pointer input requires a position")
        };
        let event = ButtonPressEvent {
            response_type: if press {
                BUTTON_PRESS_EVENT
            } else {
                BUTTON_RELEASE_EVENT
            },
            detail: button,
            sequence: 0,
            time: self.now(),
            root: x.root,
            event: pointer.window,
            child: x11rb::NONE,
            root_x: pointer.root_x,
            root_y: pointer.root_y,
            event_x: pointer.x,
            event_y: pointer.y,
            state: self.state().into(),
            same_screen: true,
        };
        x.conn
            .send_event(false, pointer.window, EventMask::NO_EVENT, event)?
            .check()?;
        if (1..=5).contains(&button) {
            let mask = 1u16 << (button + 7);
            if press {
                self.buttons |= mask;
            } else {
                self.buttons &= !mask;
            }
        }
        if (1..=3).contains(&button) {
            self.grab = if press { Some(pointer.window) } else { None };
        }
        Ok(())
    }
}

/// Runs `body` inside a session for `target` and always closes it; the body's error wins.
pub fn with_session<T>(
    x: &mut X11,
    target: Window,
    pacing: Pacing,
    body: impl FnOnce(&mut X11, &mut Session) -> Result<T>,
) -> Result<T> {
    let mut session = Session::open(x, target, pacing)?;
    let result = body(x, &mut session);
    session.close(x);
    result
}
