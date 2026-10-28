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
    /// After each drag sample (the vendor's 1 ms, behaviour §10.4); `--drag-step-ms` measures others.
    pub drag: Duration,
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

/// The keys held for one target: reference counts per keycode, the press order, and the modifier masks
/// (behaviour §8.3, §11.3). Sending is the caller's: each method hands it the keycode and the state before the
/// event, so the bookkeeping is testable without an X server.
#[derive(Debug, Default)]
pub struct Keys {
    modifiers: Vec<(u8, u16)>,
    held: HashMap<u8, u32>,
    press_order: Vec<u8>,
}

impl Keys {
    pub fn new(modifiers: Vec<(u8, u16)>) -> Keys {
        Keys {
            modifiers,
            ..Keys::default()
        }
    }

    /// The modifier masks of every keycode held.
    pub fn mask(&self) -> u16 {
        let mut state = 0;
        for (&keycode, &count) in &self.held {
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

    /// Presses each keycode not already held, in order; one already held is only counted up. On a failed press,
    /// what this call acquired is released (its errors dropped: the press's error is the answer).
    pub fn acquire(
        &mut self,
        keycodes: &[u8],
        mut press: impl FnMut(u8, u16) -> Result<()>,
        mut unpress: impl FnMut(u8, u16) -> Result<()>,
    ) -> Result<Vec<u8>> {
        let mut acquired = Vec::new();
        for &keycode in keycodes {
            if let Some(count) = self.held.get_mut(&keycode).filter(|c| **c > 0) {
                *count += 1;
                acquired.push(keycode);
                continue;
            }
            if let Err(error) = press(keycode, self.mask()) {
                let _ = self.release(&acquired, &mut unpress);
                return Err(error);
            }
            self.held.insert(keycode, 1);
            self.press_order.push(keycode);
            acquired.push(keycode);
        }
        Ok(acquired)
    }

    /// Releases in reverse order; a key held more than once is only counted down. Every release is attempted; a
    /// failed one leaves its key counted and the first error is returned (behaviour §11.3).
    pub fn release(&mut self, keycodes: &[u8], unpress: impl FnMut(u8, u16) -> Result<()>) -> Result<()> {
        self.release_tracked(keycodes, unpress).0
    }

    /// [`Keys::release`], also answering which of these references are still unreleased (in press order).
    pub fn release_tracked(
        &mut self,
        keycodes: &[u8],
        mut unpress: impl FnMut(u8, u16) -> Result<()>,
    ) -> (Result<()>, Vec<u8>) {
        let mut first = None;
        let mut unreleased = Vec::new();
        for &keycode in keycodes.iter().rev() {
            match self.held.get(&keycode).copied() {
                Some(count) if count > 1 => {
                    self.held.insert(keycode, count - 1);
                }
                Some(1) => match unpress(keycode, self.mask()) {
                    Ok(()) => {
                        self.held.remove(&keycode);
                        self.press_order.retain(|k| *k != keycode);
                    }
                    Err(error) => {
                        // the key stays counted once: this reference is the one still held
                        first.get_or_insert(error);
                        unreleased.push(keycode);
                    }
                },
                _ => {}
            }
        }
        unreleased.reverse();
        (first.map_or(Ok(()), Err), unreleased)
    }

    /// The keys held, in the order they were pressed.
    #[cfg(test)]
    pub fn press_order(&self) -> &[u8] {
        &self.press_order
    }

    /// The cleanup: every key still held is released once, in reverse press order, each with the state as it is
    /// before its own release (so it carries itself, as a normal release does); send errors are dropped (the
    /// request has already answered) and the bookkeeping ends clear.
    pub fn release_all(&mut self, mut unpress: impl FnMut(u8, u16) -> Result<()>) {
        while let Some(keycode) = self.press_order.pop() {
            let _ = unpress(keycode, self.mask());
            self.held.remove(&keycode);
        }
        self.held.clear();
    }
}

/// One request's input session for a window (behaviour §8.1).
pub struct Session {
    pub target: Window,
    synthesized_focus: bool,
    redirected: bool,
    anchor_time: u32,
    anchor: Instant,
    keys: Keys,
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
            keys: Keys::new(modifiers),
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

    /// Ends the session: keys and buttons still held released (best effort: the request has already answered
    /// with any release error), the teardown wait, FocusOut unless the real focus has since entered the target,
    /// and the per-request unredirect.
    pub fn close(mut self, x: &mut X11) {
        let (target, buttons, time) = (self.target, self.buttons, self.clock());
        self.keys
            .release_all(|keycode, mask| send_key(x, target, time(), keycode, false, buttons | mask));
        self.release_buttons(x);
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

    /// Releases every button still down (best effort: a failed release, for a window gone under it, is dropped) and
    /// clears the button state and the implicit grab whatever the sends did, so the next request starts clean.
    pub fn release_buttons(&mut self, x: &X11) {
        for button in 1..=5u8 {
            if self.buttons & (1 << (button + 7)) != 0 {
                let _ = self.button(x, button, false);
            }
        }
        self.buttons = 0;
        self.grab = None;
    }

    fn now(&self) -> u32 {
        self.clock()()
    }

    /// The server time now, as a closure that borrows nothing of the session.
    fn clock(&self) -> impl Fn() -> u32 + use<> {
        let (anchor_time, anchor) = (self.anchor_time, self.anchor);
        move || anchor_time.wrapping_add(anchor.elapsed().as_millis() as u32)
    }

    /// The held-button mask and the modifier masks of the keys held for this target, before an event updates
    /// them (behaviour §8.3).
    fn state(&self) -> u16 {
        self.buttons | self.keys.mask()
    }

    /// Presses each keycode not already held, in order, pacing after each new edge (behaviour §11.3).
    pub fn acquire(&mut self, x: &X11, keycodes: &[u8]) -> Result<Vec<u8>> {
        let (target, buttons, pace, time) = (self.target, self.buttons, self.pacing.key, self.clock());
        self.keys.acquire(
            keycodes,
            |keycode, mask| {
                send_key(x, target, time(), keycode, true, buttons | mask)?;
                std::thread::sleep(pace);
                Ok(())
            },
            |keycode, mask| {
                let sent = send_key(x, target, time(), keycode, false, buttons | mask);
                std::thread::sleep(pace);
                sent
            },
        )
    }

    /// Releases in reverse press order, pacing after each edge; every release is attempted and the first failure
    /// is returned, so interrupted input never answers success.
    pub fn release(&mut self, x: &X11, keycodes: &[u8]) -> Result<()> {
        self.release_tracked(x, keycodes).0
    }

    /// [`Session::release`], also answering the references still unreleased ([`Keys::release_tracked`]).
    pub fn release_tracked(&mut self, x: &X11, keycodes: &[u8]) -> (Result<()>, Vec<u8>) {
        let (target, buttons, pace, time) = (self.target, self.buttons, self.pacing.key, self.clock());
        self.keys.release_tracked(keycodes, |keycode, mask| {
            let sent = send_key(x, target, time(), keycode, false, buttons | mask);
            std::thread::sleep(pace);
            sent
        })
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

/// One key event to the top-level target, root and event coordinates 0 (behaviour §8.3).
fn send_key(x: &X11, target: Window, time: u32, keycode: u8, press: bool, state: u16) -> Result<()> {
    let event = KeyPressEvent {
        response_type: if press { KEY_PRESS_EVENT } else { KEY_RELEASE_EVENT },
        detail: keycode,
        sequence: 0,
        time,
        root: x.root,
        event: target,
        child: x11rb::NONE,
        root_x: 0,
        root_y: 0,
        event_x: 0,
        event_y: 0,
        state: state.into(),
        same_screen: true,
    };
    x.conn.send_event(false, target, EventMask::NO_EVENT, event)?.check()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::anyhow;

    const SHIFT: u8 = 50;
    const CTRL: u8 = 37;

    fn keys() -> Keys {
        Keys::new(vec![(SHIFT, 1), (CTRL, 4)])
    }

    #[test]
    fn a_press_carries_the_state_without_its_key_and_a_release_with_it() {
        let mut k = keys();
        let mut seen = Vec::new();
        let held = k
            .acquire(
                &[CTRL, 38],
                |kc, state| {
                    seen.push((kc, true, state));
                    Ok(())
                },
                |_, _| Ok(()),
            )
            .unwrap();
        k.release(&held, |kc, state| {
            seen.push((kc, false, state));
            Ok(())
        })
        .unwrap();
        assert_eq!(
            seen,
            vec![(CTRL, true, 0), (38, true, 4), (38, false, 4), (CTRL, false, 4)]
        );
        assert!(k.press_order().is_empty());
    }

    #[test]
    fn a_failing_release_is_returned_after_every_release_is_attempted() {
        let mut k = keys();
        let held = k.acquire(&[CTRL, SHIFT, 38], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let mut attempted = Vec::new();
        let result = k.release(&held, |kc, _| {
            attempted.push(kc);
            if kc == SHIFT {
                Err(anyhow!("BadWindow on {kc}"))
            } else {
                Ok(())
            }
        });
        assert_eq!(
            attempted,
            vec![38, SHIFT, CTRL],
            "every release attempted, in reverse order"
        );
        assert_eq!(result.unwrap_err().to_string(), "BadWindow on 50");
        assert_eq!(k.mask(), 1, "the failed key stays counted");
        assert_eq!(k.press_order(), [SHIFT], "the session's close releases it");
    }

    #[test]
    fn a_cleanup_release_carries_the_state_that_was_held() {
        // The M0.2 carry-in: draining the bookkeeping first made every cleanup release carry mask 0.
        let mut k = keys();
        k.acquire(&[CTRL, SHIFT, 38], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let mut sent = Vec::new();
        k.release_all(|kc, state| {
            sent.push((kc, state));
            Err(anyhow!("cleanup errors are not the answer"))
        });
        assert_eq!(
            sent,
            vec![(38, 1 | 4), (SHIFT, 1 | 4), (CTRL, 4)],
            "reverse press order, each release with its own key still in the state, as a normal release"
        );
        assert_eq!(
            k.mask(),
            0,
            "the bookkeeping is clear afterwards, failed sends included"
        );
        assert!(k.press_order().is_empty());
    }

    #[test]
    fn a_failed_release_answers_only_this_holds_own_unreleased_references() {
        // holds ctrl+a and ctrl+b share ctrl (count 2); a's release fails on a
        let mut k = keys();
        let a = k.acquire(&[CTRL, 38], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let b = k.acquire(&[CTRL, 56], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let (result, unreleased) =
            k.release_tracked(&a, |kc, _| if kc == 38 { Err(anyhow!("BadWindow")) } else { Ok(()) });
        assert!(result.is_err());
        assert_eq!(
            unreleased,
            vec![38],
            "a's ctrl reference was released (counted down); only a remains"
        );
        assert_eq!(k.mask(), 4, "b's ctrl still holds the Control mask");
        // the retry of what remains of a releases a alone, and b's release then releases ctrl
        let mut sent = Vec::new();
        let (result, unreleased) = k.release_tracked(&unreleased, |kc, state| {
            sent.push((kc, state));
            Ok(())
        });
        assert!(result.is_ok() && unreleased.is_empty());
        k.release(&b, |kc, state| {
            sent.push((kc, state));
            Ok(())
        })
        .unwrap();
        assert_eq!(sent, vec![(38, 4), (56, 4), (CTRL, 4)]);
        assert!(k.press_order().is_empty());
    }

    #[test]
    fn a_duplicate_keycode_s_failed_edge_is_one_unreleased_reference() {
        // a+a: one press, count 2; the release counts down once, then the edge fails
        let mut k = keys();
        let held = k.acquire(&[38, 38], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        assert_eq!(held, vec![38, 38]);
        let (result, unreleased) = k.release_tracked(&held, |_, _| Err(anyhow!("BadWindow")));
        assert!(result.is_err());
        assert_eq!(unreleased, vec![38], "one reference left, not two");
        let (result, unreleased) = k.release_tracked(&unreleased, |_, _| Ok(()));
        assert!(result.is_ok() && unreleased.is_empty());
        assert!(k.press_order().is_empty());
    }

    #[test]
    fn the_first_of_several_release_errors_wins() {
        let mut k = keys();
        let held = k.acquire(&[CTRL, 38], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let result = k.release(&held, |kc, _| Err(anyhow!("failed {kc}")));
        assert_eq!(result.unwrap_err().to_string(), "failed 38");
        assert_eq!(k.press_order(), [CTRL, 38]);
    }

    #[test]
    fn shared_keys_are_counted_and_a_failed_press_releases_what_it_acquired() {
        let mut k = keys();
        let first = k.acquire(&[CTRL], |_, _| Ok(()), |_, _| Ok(())).unwrap();
        let sent = std::cell::RefCell::new(Vec::new());
        let error = k.acquire(
            &[CTRL, 38, 39],
            |kc, _| {
                if kc == 39 {
                    Err(anyhow!("no"))
                } else {
                    sent.borrow_mut().push(kc);
                    Ok(())
                }
            },
            |kc, _| {
                sent.borrow_mut().push(kc + 100);
                Ok(())
            },
        );
        assert!(error.is_err());
        assert_eq!(
            sent.into_inner(),
            vec![38, 138],
            "ctrl was already held: no second press; 38 released on the failure"
        );
        k.release(&first, |_, _| Ok(())).unwrap();
        assert!(k.press_order().is_empty());
    }
}
