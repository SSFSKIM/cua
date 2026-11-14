//! Element actions (behaviour §7): the primary click through action 0, the right click at the element's visible
//! point with its `showContextMenu` fallback, named actions (`perform_secondary_action`) and the element scroll.
//! Each resolves the element afresh (§6.2), then opens the window's input session, as the vendor does even when no
//! X input is sent. An action that asks for the element's context menu (`showContextMenu`, whichever caller runs it)
//! answers ok only once a menu is seen to appear, and `menuUnconfirmed` otherwise ([`run_action`]; Decision Log,
//! 2026-11-14, candidate 3), where the vendor answers ok as soon as it is asked for.

use std::time::Duration;

use anyhow::{Result, anyhow, bail};
use serde_json::{Value, json};

use super::Engine;
use super::pointer::{CLICK_HOLD, check_wheel, wheel};
use super::way::Way;
use crate::atspi::{self, Associated};
use crate::copy::{self, Menu};
use crate::dbus::Bus;
use crate::families::{Family, Kind};
use crate::focus_ack::{FocusAck, nothing_pressed, press_ack};
use crate::resolve;
use crate::route::{Inputs, Target};
use crate::tree::{ObjRef, Transport};
use crate::vcl;
use crate::wire::{MouseButton, ScrollInput, SecondaryActionInput, parse_input};
use crate::x11::{WindowInfo, X11};

/// A resolved element: its window, the element and its ancestors nearest first, ending with the frame, and the
/// window's association, confirmed again just before each effect on the element (`atspi::Associated::confirm`).
/// `libreoffice`: the window is LibreOffice's, whose VCL extents a point corrects first (`vcl.rs`).
#[derive(Clone)]
pub(super) struct Element {
    pub(super) info: WindowInfo,
    pub(super) target: ObjRef,
    pub(super) ancestors: Vec<ObjRef>,
    pub(super) associated: Associated,
    pub(super) libreoffice: bool,
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
    pub(super) fn resolve_element(&mut self, window: u32, element: &str) -> Result<Element> {
        if element.starts_with("x11:") {
            bail!("element actions require AT-SPI; X11 fallback IDs only identify windows");
        }
        let info = self.x.get_window(window)?;
        let resolved = self.with_bus(|bus, x| {
            let associated = match atspi::associated(bus, x, &info)? {
                Ok(associated) => associated,
                Err(refused) => return Ok(Err(refused)),
            };
            Ok(resolve::element(bus, &associated.frame, element)?.map(|found| (found, associated)))
        });
        // No address is `AT-SPI accessibility bus is unavailable` (from `bus_address`); a connection's own errors
        // propagate, as the vendor's do (behaviour §6.2 step 3).
        let ((target, ancestors), associated) = resolved?.map_err(anyhow::Error::msg)?;
        let libreoffice = vcl::is_libreoffice(self.x.wm_class(window).as_deref());
        Ok(Element {
            info,
            target,
            ancestors,
            associated,
            libreoffice,
        })
    }

    /// Refuses, before any session opens or any window is activated, a LibreOffice element whose VCL point cannot be
    /// corrected (`vcl::UNTRUSTED`); the point itself is taken again, corrected, where the action sends its input.
    pub(super) fn trusted_point(&mut self, element: &Element) -> Result<()> {
        if !element.libreoffice {
            return Ok(());
        }
        let bus = self
            .bus
            .as_mut()
            .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
        vcl_shift(bus, element).map(|_| ())
    }

    /// The parts an element action works with once the element is resolved.
    fn parts(&mut self) -> Result<(&mut X11, &mut Bus, &mut Inputs)> {
        let Engine { x, bus, inputs, .. } = self;
        let bus = bus
            .as_mut()
            .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
        Ok((x, bus, inputs))
    }

    /// An element click: the primary click through the element's action 0, which every family takes; the right click
    /// at its visible point, which a family that ignores synthetic clicks (`families.rs`) has refused in shared mode
    /// and sent through the foreground route in dedicated mode, once the element resolved.
    pub(super) fn element_click(&mut self, window: u32, element: &str, button: MouseButton) -> Result<Value> {
        let element = self.resolve_element(window, element)?;
        // a right click into a family that takes it only with the real pointer in its window: watched (`within.rs`)
        let mut within = None;
        let target = match button {
            MouseButton::Right => {
                // a LibreOffice point that cannot be corrected is refused before the session or an activation
                self.trusted_point(&element)?;
                let way = self.route_for(Some(window), Kind::Clicks)?;
                let (way, watch) = self.watch_within(Some(window), Kind::Clicks, way)?;
                within = watch;
                if way == Way::Foreground {
                    self.enter(window)?;
                }
                way.target(window)
            }
            _ => Target::Window(window),
        };
        // a right click presses button 3: a family whose press activates a window it has not focused waits for the
        // session's focus first (`focus_ack.rs`); the primary click is the element's action, no press
        let mut ack = match button {
            MouseButton::Right => self.focus_ack_for(target, Some(element.associated.frame.clone()))?,
            _ => None,
        };
        let clicked = self.click_resolved(&element, button, target, ack.as_mut());
        self.record_focus_ack(ack.as_ref());
        let left = self.within_answer(within, "click");
        clicked?;
        if let Some(left) = left {
            return Err(left);
        }
        // the primary click ran the element's action 0: its answer names a family that animates it
        Ok(match button {
            MouseButton::Right => Value::Null,
            _ => action_answer(self.family_of(window), 0),
        })
    }

    /// [`Engine::element_click`] once the element is resolved and its route chosen.
    fn click_resolved(
        &mut self,
        element: &Element,
        button: MouseButton,
        target: Target,
        ack: Option<&mut FocusAck>,
    ) -> Result<Value> {
        let (x, bus, inputs) = self.parts()?;
        match button {
            MouseButton::Right => match right_click(x, bus, inputs, element, target, ack) {
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
                    do_action(x, bus, inputs, element, *index, &names[*index])?;
                    Ok(Value::Null)
                }
            },
            _ => {
                let names = atspi::action_names(bus, &element.target)?.map_err(anyhow::Error::msg)?;
                if names.is_empty() {
                    bail!("element has no primary accessibility action");
                }
                do_action(x, bus, inputs, element, 0, &names[0])?;
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
        do_action(x, bus, inputs, &element, index, &names[index])?;
        // a named action may be the element's first, its primary action (the vendor's choice of name allows it too)
        Ok(action_answer(self.family_of(input.window.id), index))
    }

    /// The element scroll (behaviour §7.3): resolved, the session opened, the point the centre of the element's
    /// extents within the window (no ancestor clipping, no state check), then the wheel.
    pub(super) fn element_scroll(&mut self, window: u32, element: &str, input: &ScrollInput) -> Result<Value> {
        let element = self.resolve_element(window, element)?;
        self.trusted_point(&element)?;
        let way = self.route_for(Some(window), Kind::Scroll)?;
        let (way, within) = self.watch_within(Some(window), Kind::Scroll, way)?;
        // the foreground route activates only once the amount and the chord are known good
        self.enter_checked(way, Some(window), |x| check_wheel(x, input))?;
        let target = way.target(window);
        let (x, bus, inputs) = self.parts()?;
        let scrolled = inputs.with_route(x, target, |x, route, _| {
            let bounds = atspi::extents(bus, &element.target)?.map_err(anyhow::Error::msg)?;
            let bounds = vcl::moved(bounds, vcl_shift(bus, &element)?.map_or((0, 0), |(_, by)| by));
            let at = centre(clip_to_window(bounds, &element.info))?;
            element.associated.confirm_before_acting(bus, x)?;
            wheel(x, route, Some(at), input)
        });
        let left = self.within_answer(within, "scroll");
        scrolled?;
        left.map_or(Ok(Value::Null), Err)
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

/// What an element action that ran `DoAction(index)` answers: `{"animated_action": <family>}` when it ran the element's
/// primary action (index 0) in a family whose toolkit animates it (`families.rs` `animates_primary_action`), whose
/// effect so comes after the answer; null otherwise, as the vendor answers. The vendor JavaScript reads no output of
/// these commands; cua's service settles by the family it names (`src/services/engine/linux/methods.mjs`).
fn action_answer(family: Option<&Family>, index: usize) -> Value {
    match family {
        Some(family) if index == 0 && family.animates_primary_action => json!({"animated_action": family.name}),
        _ => Value::Null,
    }
}

/// `DoAction(index)` of the action named `name` inside the window's input session, once the window's association is
/// confirmed again ([`run_action`]).
fn do_action(
    x: &mut X11,
    bus: &mut Bus,
    inputs: &mut Inputs,
    element: &Element,
    index: usize,
    name: &str,
) -> Result<()> {
    inputs.with_route(x, Target::Window(element.info.id), |x, _, _| {
        run_action(bus, &element.target, name, copy::MENU_WAIT, |bus| {
            element.associated.confirm_before_acting(bus, x)?;
            atspi::do_action(bus, &element.target, index as u32)
        })
    })
}

/// The answer to an element action that asked for a context menu none was seen to open within the wait
/// (`menuUnconfirmed`): the request was sent, and the application may have drawn a menu of its own (a page's
/// `contextmenu` handler) or ignored it, which nothing on the bus tells apart.
pub(super) fn menu_unconfirmed() -> String {
    format!(
        "showContextMenu was sent and no menu was seen within {} s; the application may have shown its own menu or \
         ignored the request; read the window before retrying",
        copy::MENU_WAIT.as_secs()
    )
}

/// Runs `act`, the element's action named `name`. One that asks for its context menu (`showContextMenu`, matched as
/// the vendor matches action names) answers only once a menu appears within `wait` (`copy::open_menu`, the detection
/// the Copy's context menu uses), and [`menu_unconfirmed`] when none does. Any other action is `act` alone. A refusal
/// of the action itself is its own sentence.
fn run_action<T: Transport>(
    t: &mut T,
    target: &ObjRef,
    name: &str,
    wait: Duration,
    act: impl FnOnce(&mut T) -> Result<std::result::Result<(), String>>,
) -> Result<()> {
    if !name.eq_ignore_ascii_case("showcontextmenu") {
        return act(t)?.map_err(anyhow::Error::msg);
    }
    match copy::open_menu(t, target, None, wait, act)?.map_err(anyhow::Error::msg)? {
        Menu::Absent => bail!(menu_unconfirmed()),
        Menu::Opened | Menu::Item(_) => Ok(()),
    }
}

/// A right click at the element's visible point, clipped by the window and by every `viewport` and `scroll pane`
/// ancestor (behaviour §7.2), on `target`'s route. The session opens first and the point is found inside it, as the
/// vendor orders them; a failure to find the point closes it like any other error.
fn right_click(
    x: &mut X11,
    bus: &mut Bus,
    inputs: &mut Inputs,
    element: &Element,
    target: Target,
    ack: Option<&mut FocusAck>,
) -> std::result::Result<(), RightClick> {
    let mut point_failed = false;
    let result = inputs.with_route(x, target, |x, route, _| {
        let (rx, ry) = visible_point(bus, element, "right-clicking").inspect_err(|_| point_failed = true)?;
        element.associated.confirm_before_acting(bus, x)?;
        // the foreground route's window on top at the point before anything is sent (task 63)
        route
            .on_top_at(x, &[(rx, ry)])?
            .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
        let pressing = press_ack(ack, Some(&mut *bus), x, route, Some((rx, ry)))?
            .map_err(|cause| anyhow!(nothing_pressed(cause)))?;
        route.place(x, rx, ry)?;
        route.press(x, 3, pressing)?;
        std::thread::sleep(CLICK_HOLD);
        route.release_button(x, 3)
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
pub(super) fn visible_point(bus: &mut Bus, element: &Element, purpose: &str) -> Result<(i16, i16)> {
    let states = atspi::state_words(bus, &element.target)?.unwrap_or_default();
    if !(states.contains(&"showing") && states.contains(&"visible")) {
        bail!("element is not visible; scroll it into view before {purpose}");
    }
    let bounds = atspi::extents(bus, &element.target)?.map_err(anyhow::Error::msg)?;
    // LibreOffice's VCL extents, and those of its VCL ancestors up to the root pane, moved where they are drawn
    let shift = vcl_shift(bus, element)?;
    let (vcl_ancestors, by) = shift.unwrap_or((0, (0, 0)));
    let (mut x0, mut y0, mut x1, mut y1) = clip_to_window(vcl::moved(bounds, by), &element.info);
    for (i, ancestor) in element.ancestors.iter().enumerate() {
        let role = atspi::role_name(bus, ancestor)?.ok_or_else(|| anyhow!("AT-SPI ancestor did not return a role"))?;
        if (role == "viewport" || role == "scroll pane")
            && let Ok(rect) = atspi::extents(bus, ancestor)?
        {
            let (ax0, ay0, ax1, ay1) = if i < vcl_ancestors { vcl::moved(rect, by) } else { rect };
            x0 = x0.max(ax0);
            y0 = y0.max(ay0);
            x1 = x1.min(ax1);
            y1 = y1.min(ay1);
        }
    }
    centre((x0, y0, x1, y1))
}

/// The shift a LibreOffice element's VCL extents need (`vcl::shift`, read from the element and then its ancestors, so
/// the root pane named itself is recognized too), with the number of its ancestors up to the root pane, which take it
/// too; None for any other window's element and for an element outside the root pane. A structure whose offset cannot
/// be read refuses the point (`vcl::UNTRUSTED`), before anything is sent.
fn vcl_shift(bus: &mut Bus, element: &Element) -> Result<Option<(usize, (i32, i32))>> {
    if !element.libreoffice {
        return Ok(None);
    }
    let mut levels = Vec::with_capacity(element.ancestors.len() + 1);
    for node in std::iter::once(&element.target).chain(&element.ancestors) {
        let role = atspi::role_name(bus, node)?.unwrap_or_default();
        // the root pane, and the host and the client panel above it, are all the rule reads
        let above_root = levels.iter().position(|(r, _): &(String, _)| r == "root pane");
        let extents = if role == "root pane" || above_root.is_some() {
            atspi::extents(bus, node)?.ok()
        } else {
            None
        };
        levels.push((role, extents));
        if above_root.is_some_and(|k| levels.len() > k + 2) {
            break;
        }
    }
    vcl::shift(&levels).map_err(anyhow::Error::msg)
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
    fn an_element_s_primary_action_names_its_family_where_the_family_animates_it() {
        let named = |name: &str| crate::families::FAMILIES.iter().find(|f| f.name == name);
        assert_eq!(
            action_answer(named("GTK 4"), 0),
            serde_json::json!({"animated_action": "GTK 4"})
        );
        assert_eq!(
            action_answer(named("Qt"), 0),
            serde_json::json!({"animated_action": "Qt"})
        );
        for other in ["Chrome", "Chromium", "Gecko", "GTK 3", "VTE", "xterm"] {
            assert_eq!(action_answer(named(other), 0), Value::Null, "{other}");
        }
        assert_eq!(action_answer(None, 0), Value::Null, "an unlisted family");
        // a named action other than the element's first is not its primary action, whatever the family
        assert_eq!(action_answer(named("GTK 4"), 1), Value::Null);
        assert_eq!(action_answer(named("Qt"), 2), Value::Null);
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
            minimized: None,
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

    const WAIT: std::time::Duration = std::time::Duration::from_millis(60);

    fn run(bus: &mut crate::copy::tests::MenuBus, name: &str) -> std::result::Result<(), String> {
        let target = crate::copy::tests::obj("/main/button");
        run_action(bus, &target, name, WAIT, crate::copy::tests::MenuBus::act).map_err(|e| e.to_string())
    }

    #[test]
    fn a_requested_context_menu_answers_only_once_a_menu_appears() {
        let mut bus = crate::copy::tests::app();
        bus.appear = vec![(2, "/m".into())];
        assert_eq!(run(&mut bus, "showContextMenu"), Ok(()));
        // matched as the vendor matches an action name, ASCII case-insensitively
        let mut bus = crate::copy::tests::app();
        bus.appear = vec![(1, "/m".into())];
        assert_eq!(run(&mut bus, "SHOWCONTEXTMENU"), Ok(()));
    }

    #[test]
    fn a_requested_context_menu_none_appears_for_is_menu_unconfirmed_after_it_was_sent() {
        let mut bus = crate::copy::tests::app();
        assert_eq!(run(&mut bus, "showContextMenu"), Err(menu_unconfirmed()));
        assert!(bus.acted, "the action was sent");
        assert_eq!(
            menu_unconfirmed(),
            "showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu \
             or ignored the request; read the window before retrying"
        );
        // a menu already open when asked for, which the action leaves as it was: no new menu was seen
        let mut bus = crate::copy::tests::app();
        bus.app_children().push("/m".into());
        assert_eq!(run(&mut bus, "showContextMenu"), Err(menu_unconfirmed()));
    }

    #[test]
    fn a_requested_context_menu_the_element_refuses_is_the_element_s_refusal() {
        let target = crate::copy::tests::obj("/main/button");
        let mut bus = crate::copy::tests::app();
        let refused = run_action(&mut bus, &target, "showContextMenu", WAIT, |_| {
            Ok(Err(
                "AT-SPI element refused action 1; refresh get_window_state() to check its state".into(),
            ))
        });
        assert_eq!(
            refused.unwrap_err().to_string(),
            "AT-SPI element refused action 1; refresh get_window_state() to check its state"
        );
    }

    #[test]
    fn any_other_action_runs_as_it_did_with_no_menu_looked_for() {
        for name in ["press", "click", "showMenu", "doDefault", "showContextMenu2"] {
            let mut bus = crate::copy::tests::app();
            assert_eq!(run(&mut bus, name), Ok(()), "{name}");
            assert!(bus.acted, "{name} was sent");
            assert_eq!(bus.next, 0, "{name}: nothing was read for a menu");
        }
        let target = crate::copy::tests::obj("/main/button");
        let mut bus = crate::copy::tests::app();
        let refused = run_action(&mut bus, &target, "press", WAIT, |_| Ok(Err("refused".into())));
        assert_eq!(refused.unwrap_err().to_string(), "refused");
    }
}
