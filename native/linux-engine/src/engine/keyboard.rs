//! `press_key`, `key_down` and `key_up` (behaviour §11.3) on either route, with the vendor's chord semantics
//! (`keys.rs`) and its held-key bookkeeping (`route.rs`).

use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde_json::{Value, json};

use super::Engine;
use crate::families::Kind;
use crate::input::{chord_keycodes, keymap};
use crate::keys::{literal_keycodes, parse_chord, resolve};
use crate::route::{Hold, Target};
use crate::wire::{KeyInput, PressKeyInput, TypeCharactersInput, parse_input};

const EMPTY_KEY: &str = "key must be a non-empty string";

impl Engine {
    /// The target is opened before the chord is parsed, as the vendor orders it (a bad key on a background window
    /// still costs a FocusIn and FocusOut pair, traced); then press, hold, release.
    pub(super) fn press_key(&mut self, input: Option<Value>) -> Result<Value> {
        let input: PressKeyInput = parse_input(input)?;
        let pace = self.cfg.pacing.key;
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::of(input.window), |x, route, _| {
            let keycodes = chord_keycodes(x, &input.key)?;
            if keycodes.is_empty() {
                bail!(EMPTY_KEY);
            }
            let held = route.acquire(x, &keycodes)?;
            if let Some(duration) = input.duration {
                // The vendor holds for the duration less its pace after the last press.
                std::thread::sleep(Duration::from_millis(duration).saturating_sub(pace));
            }
            route.release(x, &held)
        })?;
        Ok(Value::Null)
    }

    /// Holds a chord until `key_up` names it again: a hold already made is a no-op with no X traffic; otherwise the
    /// keys are resolved, then the target opened, and the hold keeps it open.
    pub(super) fn key_down(&mut self, input: Option<Value>) -> Result<Value> {
        let input: KeyInput = parse_input(input)?;
        let chord = parse_chord(&input.key).map_err(anyhow::Error::msg)?;
        if chord.is_empty() {
            bail!(EMPTY_KEY);
        }
        let target = Target::of(input.window);
        if self.inputs.holds.contains(target, &chord) {
            return Ok(Value::Null);
        }
        let keycodes = resolve(&chord, &keymap(&self.x)?).map_err(anyhow::Error::msg)?;
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, target, |x, route, holds| {
            let acquired = route.acquire(x, &keycodes)?;
            holds.insert(Hold {
                target,
                chord,
                keycodes: acquired,
            });
            Ok(())
        })?;
        Ok(Value::Null)
    }

    /// Releases a hold: one not found (on this target) is a no-op, though the chord must still parse. A release
    /// that fails keeps the hold with its own references still unreleased, and answers the error.
    pub(super) fn key_up(&mut self, input: Option<Value>) -> Result<Value> {
        let input: KeyInput = parse_input(input)?;
        let chord = parse_chord(&input.key).map_err(anyhow::Error::msg)?;
        if chord.is_empty() {
            bail!(EMPTY_KEY);
        }
        let target = Target::of(input.window);
        let Some(hold) = self.inputs.holds.take(target, &chord) else {
            return Ok(Value::Null);
        };
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, target, |x, route, holds| {
            // the hold keeps exactly its own references the release left, never another hold's share of a key
            let (released, unreleased) = route.release_tracked(x, &hold.keycodes);
            if !unreleased.is_empty() {
                holds.insert(Hold {
                    keycodes: unreleased,
                    ..hold
                });
            }
            released
        })?;
        Ok(Value::Null)
    }

    /// `type_characters` (behaviour §11.4; Design, Keys): the characters the keyboard layout produces at level 1 or 2,
    /// each pressed and released in turn (Shift held for level 2), answering how many were sent. The window's input
    /// session opens first, as the newest build's does; the whole text is resolved before any key goes out, and the
    /// first character the layout cannot produce (a control character, one on no key, one only at a higher level)
    /// refuses it with nothing sent. A family that ignores synthetic keys (`families.rs`) is refused in shared mode
    /// and typed through the foreground route in dedicated mode.
    pub(super) fn type_characters(&mut self, input: Option<Value>) -> Result<Value> {
        let input: TypeCharactersInput = parse_input(input)?;
        let window = input.window.id;
        let way = self.way_for(Some(window), Kind::Keys)?;
        let Engine { x, inputs, .. } = self;
        let sent = inputs.with_route(x, way.target(window), |x, route, _| {
            let keys = literal_keycodes(&input.text, &keymap(x)?)
                .map_err(|c| anyhow!("Character {c:?} is not on the keyboard layout"))?;
            let mut sent = 0u64;
            for keycodes in &keys {
                route
                    .acquire(x, keycodes)
                    .and_then(|held| route.release(x, &held))
                    .with_context(|| {
                        format!(
                            "typing interrupted after {sent} complete characters; inspect the window before retrying"
                        )
                    })?;
                sent += 1;
            }
            Ok(sent)
        })?;
        Ok(json!(sent))
    }
}
