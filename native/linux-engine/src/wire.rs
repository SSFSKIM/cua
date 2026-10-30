//! The line protocol between the service and the engine (R/A §1.6; `sky-linux-behaviour.md` §1–2).
//!
//! One JSON object per line on stdin, `{id, command, input}`; one compact JSON line per request on stdout,
//! `{id, ok, output, error, restart}` in that key order. `output` is a JSON value, never a JSON-encoded string.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A request as it arrives on stdin. Unknown keys are refused (behaviour §1).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub id: Value,
    pub command: String,
    #[serde(default)]
    pub input: Option<Value>,
}

/// A response, serialized with its keys in the vendor's order.
#[derive(Debug, Serialize, PartialEq)]
pub struct Response {
    pub id: Value,
    pub ok: bool,
    pub output: Value,
    pub error: Option<String>,
    pub restart: bool,
}

impl Response {
    pub fn success(id: Value, output: Value) -> Self {
        Response {
            id,
            ok: true,
            output,
            error: None,
            restart: false,
        }
    }

    pub fn failure(id: Value, error: String) -> Self {
        Response {
            id,
            ok: false,
            output: Value::Null,
            error: Some(error),
            restart: false,
        }
    }

    /// One line, no trailing newline.
    pub fn to_line(&self) -> String {
        serde_json::to_string(self).expect("a response always serializes")
    }
}

/// What one stdin line means.
#[derive(Debug)]
pub enum Line {
    /// Blank after trimming: skipped with no response.
    Blank,
    Request(Request),
    /// Not a request at all. The vendor's answer is open (behaviour §22.11); cua answers with its own sentence.
    Malformed(String),
}

/// Parses one line with its line ending already removed or not (`\n` and `\r\n` are stripped here).
pub fn parse_line(raw: &str) -> Line {
    let line = raw.strip_suffix('\n').unwrap_or(raw);
    let line = line.strip_suffix('\r').unwrap_or(line);
    if line.trim().is_empty() {
        return Line::Blank;
    }
    match serde_json::from_str::<Request>(line) {
        Ok(request) => Line::Request(request),
        Err(error) => Line::Malformed(format!("failed to parse server request: {error}")),
    }
}

/// Deserializes a command's input. serde's own message follows the vendor's context (behaviour §1): the input is
/// read from a `Value`, so the message carries no line and column, as the vendor's traced messages do not.
pub fn parse_input<T: for<'de> Deserialize<'de>>(input: Option<Value>) -> anyhow::Result<T> {
    let value = input.unwrap_or_else(|| Value::Object(Default::default()));
    serde_json::from_value(value).map_err(|error| anyhow::anyhow!("failed to parse command input: {error}"))
}

/// A request's `window`: only `id` is read; every other field the JavaScript sends is ignored (behaviour §3).
#[derive(Debug, Deserialize, Clone, Copy)]
pub struct Target {
    pub id: u32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoInput {}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetWindowStateInput {
    pub window: Target,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub include_screenshot: Option<bool>,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum MouseButton {
    #[serde(rename = "left", alias = "l")]
    Left,
    #[serde(rename = "right", alias = "r")]
    Right,
    #[serde(rename = "middle", alias = "m")]
    Middle,
}

impl MouseButton {
    pub fn button(self) -> u8 {
        match self {
            MouseButton::Left => 1,
            MouseButton::Middle => 2,
            MouseButton::Right => 3,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClickInput {
    #[serde(default)]
    pub window: Option<Target>,
    #[serde(default)]
    pub element_id: Option<String>,
    #[serde(default)]
    pub x: Option<i16>,
    #[serde(default)]
    pub y: Option<i16>,
    #[serde(default)]
    pub mouse_button: Option<MouseButton>,
    #[serde(default)]
    pub click_count: Option<u32>,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub duration: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PressKeyInput {
    #[serde(default)]
    pub window: Option<Target>,
    pub key: String,
    #[serde(default)]
    pub duration: Option<u64>,
}

/// `key_down` and `key_up`.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyInput {
    #[serde(default)]
    pub window: Option<Target>,
    pub key: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveInput {
    #[serde(default)]
    pub window: Option<Target>,
    pub x: i16,
    pub y: i16,
    #[serde(default)]
    pub key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MoveRelativeInput {
    pub dx: i16,
    pub dy: i16,
    #[serde(default)]
    pub key: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    #[serde(rename = "up", alias = "u")]
    Up,
    #[serde(rename = "down", alias = "d")]
    Down,
    #[serde(rename = "left", alias = "l")]
    Left,
    #[serde(rename = "right", alias = "r")]
    Right,
}

impl Direction {
    /// The wheel button (behaviour §10.3).
    pub fn button(self) -> u8 {
        match self {
            Direction::Up => 4,
            Direction::Down => 5,
            Direction::Left => 6,
            Direction::Right => 7,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScrollInput {
    #[serde(default)]
    pub window: Option<Target>,
    #[serde(default)]
    pub element_id: Option<String>,
    pub direction: Direction,
    #[serde(default)]
    pub pixels: Option<u16>,
    #[serde(default)]
    pub x: Option<i16>,
    #[serde(default)]
    pub y: Option<i16>,
    #[serde(default)]
    pub key: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: i16,
    pub y: i16,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DragInput {
    #[serde(default)]
    pub window: Option<Target>,
    pub path: Vec<Point>,
    #[serde(default)]
    pub key: Option<String>,
}

/// `drag_handle`'s input, tagged on `action` (behaviour §10.5).
#[derive(Debug, Deserialize)]
#[serde(tag = "action", deny_unknown_fields)]
pub enum DragHandleInput {
    #[serde(rename = "start")]
    Start { x: i16, y: i16 },
    #[serde(rename = "move_to")]
    MoveTo { x: i16, y: i16 },
    #[serde(rename = "end")]
    End,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SecondaryActionInput {
    pub window: Target,
    pub element_id: String,
    pub action: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WindowInput {
    pub window: Target,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClipboardReleaseInput {
    pub handle: String,
}

/// `type_text` (behaviour §2, §12): no window is desktop input, into whatever has the focus.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypeTextInput {
    #[serde(default)]
    pub window: Option<Target>,
    #[serde(default)]
    pub element_id: Option<String>,
    pub text: String,
}

/// `type_characters` (the newest build's, behaviour §11.4): a window is required.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypeCharactersInput {
    pub window: Target,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClipboardWriteInput {
    pub window: Target,
    pub handle: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LaunchAppInput {
    pub app: String,
}

/// The pinned helper's 20 commands, the newest build's `type_characters` and cua's `capabilities`
/// (behaviour §2). Those this build does not answer yet answer [`not_available`].
pub const COMMANDS: &[&str] = &[
    "perform_secondary_action",
    "click",
    "clipboard_read",
    "clipboard_release",
    "clipboard_write",
    "drag",
    "drag_handle",
    "activate_window",
    "get_screenshot",
    "list_apps",
    "list_windows",
    "move",
    "move_relative",
    "press_key",
    "key_down",
    "key_up",
    "scroll",
    "type_text",
    "launch_app",
    "get_window_state",
    "type_characters",
    "capabilities",
];

/// cua's bounded sentence for a known command this build does not answer (the M1a pattern,
/// `type_text is not available in this engine build`).
pub fn not_available(command: &str) -> String {
    format!("{command} is not available in this engine build")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn response_keys_are_in_the_vendor_order() {
        let ok = Response::success(json!(1), json!([{"a": 1}]));
        assert_eq!(
            ok.to_line(),
            r#"{"id":1,"ok":true,"output":[{"a":1}],"error":null,"restart":false}"#
        );
        let failed = Response::failure(json!(7), "key must be a non-empty string".into());
        assert_eq!(
            failed.to_line(),
            r#"{"id":7,"ok":false,"output":null,"error":"key must be a non-empty string","restart":false}"#
        );
    }

    #[test]
    fn output_is_a_json_value_not_a_string() {
        let line = Response::success(json!(2), json!({"ax_tree_source": "at_spi"})).to_line();
        let back: Value = serde_json::from_str(&line).unwrap();
        assert!(back["output"].is_object());
        assert_eq!(
            Response::success(json!(3), Value::Null).to_line(),
            r#"{"id":3,"ok":true,"output":null,"error":null,"restart":false}"#
        );
    }

    #[test]
    fn line_endings_are_stripped_and_blank_lines_skipped() {
        assert!(matches!(parse_line("\n"), Line::Blank));
        assert!(matches!(parse_line("   \r\n"), Line::Blank));
        match parse_line("{\"id\":1,\"command\":\"list_windows\",\"input\":{}}\r\n") {
            Line::Request(r) => {
                assert_eq!(r.id, json!(1));
                assert_eq!(r.command, "list_windows");
            }
            other => panic!("expected a request, got {other:?}"),
        }
    }

    #[test]
    fn the_id_is_any_json_value_echoed_back() {
        match parse_line(r#"{"id":"abc","command":"list_windows"}"#) {
            Line::Request(r) => {
                assert_eq!(r.id, json!("abc"));
                assert!(r.input.is_none());
                assert_eq!(
                    Response::success(r.id, json!([])).to_line(),
                    r#"{"id":"abc","ok":true,"output":[],"error":null,"restart":false}"#
                );
            }
            other => panic!("expected a request, got {other:?}"),
        }
    }

    #[test]
    fn unknown_request_keys_are_refused() {
        match parse_line(r#"{"id":1,"command":"list_windows","input":{},"extra":1}"#) {
            Line::Malformed(message) => assert!(
                message.starts_with("failed to parse server request: unknown field `extra`"),
                "{message}"
            ),
            other => panic!("expected malformed, got {other:?}"),
        }
        assert!(matches!(parse_line("not json"), Line::Malformed(_)));
    }

    #[test]
    fn input_errors_carry_the_vendor_context_without_a_position() {
        let error = parse_input::<PressKeyInput>(Some(json!({"key": "a", "x": 1})))
            .unwrap_err()
            .to_string();
        assert_eq!(
            error,
            "failed to parse command input: unknown field `x`, expected one of `window`, `key`, `duration`"
        );
        let error = parse_input::<GetWindowStateInput>(None).unwrap_err().to_string();
        assert_eq!(error, "failed to parse command input: missing field `window`");
        let error = parse_input::<ClickInput>(Some(json!({"x": 70000})))
            .unwrap_err()
            .to_string();
        assert!(
            error.starts_with("failed to parse command input: invalid value: integer `70000`"),
            "{error}"
        );
    }

    #[test]
    fn the_window_target_ignores_every_field_but_id() {
        let input: GetWindowStateInput = parse_input(Some(
            json!({"window": {"id": 18874616, "title": "x", "app": "y"}, "include_screenshot": false}),
        ))
        .unwrap();
        assert_eq!(input.window.id, 18874616);
        assert_eq!(input.include_screenshot, Some(false));
    }

    #[test]
    fn drag_handle_is_tagged_on_its_action() {
        let start: DragHandleInput = parse_input(Some(json!({"action": "start", "x": 3, "y": 4}))).unwrap();
        assert!(matches!(start, DragHandleInput::Start { x: 3, y: 4 }));
        let end: DragHandleInput = parse_input(Some(json!({"action": "end"}))).unwrap();
        assert!(matches!(end, DragHandleInput::End));
        assert!(parse_input::<DragHandleInput>(Some(json!({"action": "move_to", "x": 1}))).is_err());
        assert!(parse_input::<DragHandleInput>(Some(json!({"action": "drop"}))).is_err());
    }

    #[test]
    fn scroll_directions_accept_the_short_names() {
        for (name, button) in [
            ("up", 4),
            ("u", 4),
            ("down", 5),
            ("d", 5),
            ("left", 6),
            ("l", 6),
            ("right", 7),
            ("r", 7),
        ] {
            let input: ScrollInput = parse_input(Some(json!({"direction": name}))).unwrap();
            assert_eq!(input.direction.button(), button);
        }
        let error = parse_input::<MoveRelativeInput>(Some(json!({"dx": 1, "dy": 1, "x": 3})))
            .unwrap_err()
            .to_string();
        assert_eq!(
            error, "failed to parse command input: unknown field `x`, expected one of `dx`, `dy`, `key`",
            "the vendor's traced sentence"
        );
    }

    #[test]
    fn mouse_buttons_accept_the_short_names() {
        for (name, button) in [("left", 1), ("l", 1), ("right", 3), ("r", 3), ("middle", 2), ("m", 2)] {
            let input: ClickInput = parse_input(Some(json!({"mouse_button": name}))).unwrap();
            assert_eq!(input.mouse_button.unwrap().button(), button);
        }
        assert!(parse_input::<ClickInput>(Some(json!({"mouse_button": "Left"}))).is_err());
    }
}
