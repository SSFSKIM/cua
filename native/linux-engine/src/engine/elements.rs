//! Element actions (behaviour §7): the primary click through action 0, the right click at the element's visible
//! point with its `showContextMenu` fallback, named actions (`perform_secondary_action`) and the element scroll.
//! Each resolves the element afresh (§6.2), then opens the window's input session, as the vendor does even when no
//! X input is sent.

use anyhow::{Result, anyhow, bail};
use serde_json::Value;

use super::Engine;
use super::pointer::{CLICK_HOLD, wheel};
use crate::atspi::{self, Association};
use crate::dbus::Bus;
use crate::resolve;
use crate::route::{Inputs, Target};
use crate::tree::ObjRef;
use crate::wire::{MouseButton, ScrollInput, SecondaryActionInput, parse_input};
use crate::x11::{WindowInfo, X11};

/// A resolved element: its window, the element and its ancestors nearest first, ending with the frame.
struct Element {
    info: WindowInfo,
    target: ObjRef,
    ancestors: Vec<ObjRef>,
}

enum RightClick {
    /// Finding the point failed: the context-menu action may stand in.
    Point(anyhow::Error),
    /// The click itself failed: no fallback.
    Click(anyhow::Error),
}

impl Engine {
    /// Resolves `element` in `window` (behaviour §6.2): X11 fallback ids refused first, then the window, the bus,
    /// the association and the two walks.
    fn resolve_element(&mut self, window: u32, element: &str) -> Result<Element> {
        if element.starts_with("x11:") {
            bail!("element actions require AT-SPI; X11 fallback IDs only identify windows");
        }
        let info = self.x.get_window(window)?;
        let resolved = self.with_bus(|bus, x| {
            let frame = match atspi::associate(bus, x, &info)? {
                Association::Frame(frame) => frame,
                Association::NoMatch => return Ok(Err("window has no AT-SPI accessibility tree".to_string())),
                Association::Refused(sentence) => return Ok(Err(sentence)),
            };
            resolve::element(bus, &frame, element)
        });
        // No address is `AT-SPI accessibility bus is unavailable` (from `bus_address`); a connection's own errors
        // propagate, as the vendor's do (behaviour §6.2 step 3).
        let (target, ancestors) = resolved?.map_err(anyhow::Error::msg)?;
        Ok(Element {
            info,
            target,
            ancestors,
        })
    }

    /// The parts an element action works with once the element is resolved.
    fn parts(&mut self) -> Result<(&mut X11, &mut Bus, &mut Inputs)> {
        let Engine { x, bus, inputs, .. } = self;
        let bus = bus
            .as_mut()
            .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
        Ok((x, bus, inputs))
    }

    pub(super) fn element_click(&mut self, window: u32, element: &str, button: MouseButton) -> Result<Value> {
        let element = self.resolve_element(window, element)?;
        let (x, bus, inputs) = self.parts()?;
        match button {
            MouseButton::Right => match right_click(x, bus, inputs, &element) {
                Ok(()) => Ok(Value::Null),
                Err(RightClick::Click(error)) => Err(error),
                Err(RightClick::Point(error)) => {
                    // The fallback: exactly one action named showContextMenu (behaviour §7.2).
                    let Ok(names) = atspi::action_names(bus, &element.target)? else {
                        return Err(error);
                    };
                    let matches: Vec<usize> = names
                        .iter()
                        .enumerate()
                        .filter(|(_, n)| n.eq_ignore_ascii_case("showcontextmenu"))
                        .map(|(i, _)| i)
                        .collect();
                    let [index] = matches.as_slice() else { return Err(error) };
                    do_action(x, bus, inputs, &element, *index)?;
                    Ok(Value::Null)
                }
            },
            _ => {
                let names = atspi::action_names(bus, &element.target)?.map_err(anyhow::Error::msg)?;
                if names.is_empty() {
                    bail!("element has no primary accessibility action");
                }
                do_action(x, bus, inputs, &element, 0)?;
                Ok(Value::Null)
            }
        }
    }

    /// A named action (behaviour §7.1): the actions read, the name checked after the reads, compared untrimmed and
    /// ASCII case-insensitively at full length.
    pub(super) fn perform_secondary_action(&mut self, input: Option<Value>) -> Result<Value> {
        let input: SecondaryActionInput = parse_input(input)?;
        let element = self.resolve_element(input.window.id, &input.element_id)?;
        let (x, bus, inputs) = self.parts()?;
        let names = atspi::action_names(bus, &element.target)?.map_err(anyhow::Error::msg)?;
        let index = choose_action(&names, &input.action).map_err(anyhow::Error::msg)?;
        do_action(x, bus, inputs, &element, index)?;
        Ok(Value::Null)
    }

    /// The element scroll (behaviour §7.3): resolved, the session opened, the point the centre of the element's
    /// extents within the window (no ancestor clipping, no state check), then the wheel.
    pub(super) fn element_scroll(&mut self, window: u32, element: &str, input: &ScrollInput) -> Result<Value> {
        let element = self.resolve_element(window, element)?;
        let (x, bus, inputs) = self.parts()?;
        inputs.with_route(x, Target::Window(window), |x, route, _| {
            let bounds = atspi::extents(bus, &element.target)?.map_err(anyhow::Error::msg)?;
            let at = centre(clip_to_window(bounds, &element.info))?;
            wheel(x, route, Some(at), input)
        })?;
        Ok(Value::Null)
    }
}

/// The action a name chooses: `action name must not be empty` after trimming; the untrimmed name compared ASCII
/// case-insensitively with each, two matches ambiguous, none unavailable with the list in Rust Debug form.
pub fn choose_action(names: &[String], action: &str) -> std::result::Result<usize, String> {
    if action.trim().is_empty() {
        return Err("action name must not be empty".into());
    }
    let matches: Vec<usize> = names
        .iter()
        .enumerate()
        .filter(|(_, n)| n.eq_ignore_ascii_case(action))
        .map(|(i, _)| i)
        .collect();
    match matches.as_slice() {
        [index] => Ok(*index),
        [] => Err(format!(
            "AT-SPI action {action:?} is unavailable; available actions: {names:?}"
        )),
        _ => Err(format!("AT-SPI action {action:?} is ambiguous")),
    }
}

/// `DoAction(index)` inside the window's input session.
fn do_action(x: &mut X11, bus: &mut Bus, inputs: &mut Inputs, element: &Element, index: usize) -> Result<()> {
    inputs.with_route(x, Target::Window(element.info.id), |_, _, _| {
        atspi::do_action(bus, &element.target, index as u32)?.map_err(anyhow::Error::msg)
    })
}

/// A right click at the element's visible point, clipped by the window and by every `viewport` and `scroll pane`
/// ancestor (behaviour §7.2). The session opens first and the point is found inside it, as the vendor orders them;
/// a failure to find the point closes it like any other error.
fn right_click(
    x: &mut X11,
    bus: &mut Bus,
    inputs: &mut Inputs,
    element: &Element,
) -> std::result::Result<(), RightClick> {
    let mut point_failed = false;
    let result = inputs.with_route(x, Target::Window(element.info.id), |x, route, _| {
        let (rx, ry) = visible_point(bus, element).inspect_err(|_| point_failed = true)?;
        route.place(x, rx, ry)?;
        route.button(x, 3, true)?;
        std::thread::sleep(CLICK_HOLD);
        route.button(x, 3, false)
    });
    result.map_err(|error| {
        if point_failed {
            RightClick::Point(error)
        } else {
            RightClick::Click(error)
        }
    })
}

fn clip_to_window((x0, y0, x1, y1): (i32, i32, i32, i32), info: &WindowInfo) -> (i32, i32, i32, i32) {
    let (wx, wy) = (info.x as i32, info.y as i32);
    (
        x0.max(wx),
        y0.max(wy),
        x1.min(wx + info.width as i32),
        y1.min(wy + info.height as i32),
    )
}

/// The centre of a non-empty rectangle, floored, in i16 root coordinates.
fn centre((x0, y0, x1, y1): (i32, i32, i32, i32)) -> Result<(i16, i16)> {
    if x1 <= x0 || y1 <= y0 {
        bail!("element has no visible bounds in this window");
    }
    let (cx, cy) = (x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2);
    let convert = |v: i32| i16::try_from(v).map_err(|_| anyhow!("out of range integral type conversion attempted"));
    Ok((convert(cx)?, convert(cy)?))
}

/// The right click's point (behaviour §7.2 steps 2–3): showing and visible, the extents clipped by the window and
/// by every `viewport` and `scroll pane` ancestor.
fn visible_point(bus: &mut Bus, element: &Element) -> Result<(i16, i16)> {
    let states = atspi::state_words(bus, &element.target)?.unwrap_or_default();
    if !(states.contains(&"showing") && states.contains(&"visible")) {
        bail!("element is not visible; scroll it into view before right-clicking");
    }
    let bounds = atspi::extents(bus, &element.target)?.map_err(anyhow::Error::msg)?;
    let (mut x0, mut y0, mut x1, mut y1) = clip_to_window(bounds, &element.info);
    for ancestor in &element.ancestors {
        let role = atspi::role_name(bus, ancestor)?.ok_or_else(|| anyhow!("AT-SPI ancestor did not return a role"))?;
        if (role == "viewport" || role == "scroll pane")
            && let Ok((ax0, ay0, ax1, ay1)) = atspi::extents(bus, ancestor)?
        {
            x0 = x0.max(ax0);
            y0 = y0.max(ay0);
            x1 = x1.min(ax1);
            y1 = y1.min(ay1);
        }
    }
    centre((x0, y0, x1, y1))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn a_named_action_is_chosen_case_insensitively_at_full_length() {
        let actions = names(&["click", "press", "showContextMenu"]);
        assert_eq!(choose_action(&actions, "PRESS"), Ok(1));
        assert_eq!(choose_action(&actions, "showcontextmenu"), Ok(2));
        assert_eq!(
            choose_action(&actions, " press"),
            Err(
                r#"AT-SPI action " press" is unavailable; available actions: ["click", "press", "showContextMenu"]"#
                    .into()
            ),
            "the name is compared untrimmed"
        );
        assert_eq!(
            choose_action(&actions, "pre"),
            Err(
                r#"AT-SPI action "pre" is unavailable; available actions: ["click", "press", "showContextMenu"]"#
                    .into()
            )
        );
        assert_eq!(
            choose_action(&[], "x"),
            Err(r#"AT-SPI action "x" is unavailable; available actions: []"#.into())
        );
    }

    #[test]
    fn an_empty_or_ambiguous_action_is_refused() {
        assert_eq!(
            choose_action(&names(&["a"]), "  "),
            Err("action name must not be empty".into())
        );
        assert_eq!(
            choose_action(&names(&["Press", "press"]), "press"),
            Err(r#"AT-SPI action "press" is ambiguous"#.into())
        );
    }

    #[test]
    fn the_point_is_the_floored_centre_of_what_the_window_shows() {
        let info = WindowInfo {
            app: "a".into(),
            focused: false,
            height: 100,
            id: 1,
            modal: false,
            title: None,
            width: 200,
            window_type: None,
            x: 10,
            y: 20,
        };
        assert_eq!(centre(clip_to_window((0, 0, 51, 61), &info)).unwrap(), (30, 40));
        assert_eq!(
            centre(clip_to_window((300, 0, 400, 50), &info))
                .unwrap_err()
                .to_string(),
            "element has no visible bounds in this window"
        );
    }
}
