//! `press_key`, `key_down` and `key_up` (behaviour §11.3) on either route, with the vendor's chord semantics
//! (`keys.rs`) and its held-key bookkeeping (`route.rs`).

use std::time::Duration;

use anyhow::{Result, bail};
use serde_json::Value;

use super::Engine;
use crate::input::{chord_keycodes, keymap};
use crate::keys::{parse_chord, resolve};
use crate::route::{Hold, Target};
use crate::wire::{KeyInput, PressKeyInput, parse_input};

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
}
