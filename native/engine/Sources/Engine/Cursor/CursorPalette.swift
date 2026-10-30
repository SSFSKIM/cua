import AppKit
import Foundation

// The cursor's identity colours (the spec's Design, "Lifecycle and identity"): eight hues, picked per session (M2 wires
// the real pick and label; M1 gives each connection a fixed placeholder). The arrow's fill keeps the hue; the pill
// behind the label's white 11 pt text takes a shade of it with at least 4.5:1 contrast (WCAG AA for small text).

/// An sRGB colour, components 0…1.
struct RGB: Equatable, Sendable {
  var red: Double
  var green: Double
  var blue: Double

  static let white = RGB(red: 1, green: 1, blue: 1)

  init(red: Double, green: Double, blue: Double) {
    self.red = red
    self.green = green
    self.blue = blue
  }

  /// `#rrggbb`; nil for anything else.
  init?(hex: String) {
    guard hex.count == 7, hex.first == "#", let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
    red = Double((value >> 16) & 0xff) / 255
    green = Double((value >> 8) & 0xff) / 255
    blue = Double(value & 0xff) / 255
  }

  var hex: String {
    func byte(_ v: Double) -> String { String(format: "%02x", Int((min(max(v, 0), 1) * 255).rounded())) }
    return "#" + byte(red) + byte(green) + byte(blue)
  }

  var color: NSColor { NSColor(srgbRed: red, green: green, blue: blue, alpha: 1) }

  /// WCAG 2's relative luminance.
  var luminance: Double {
    func linear(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  }
}

/// WCAG 2's contrast ratio, (L1 + 0.05) / (L2 + 0.05) with L1 the lighter.
func contrastRatio(_ a: RGB, _ b: RGB) -> Double {
  let (la, lb) = (a.luminance, b.luminance)
  return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

/// The spec's eight hues, in its order: clay (MAWS's accent), blue, green, violet, teal, amber, pink, slate.
let cursorPalette: [RGB] = ["#c9663f", "#2f6feb", "#1f883d", "#8250df", "#0f8b8d", "#bf8700", "#cf3a7f", "#57606a"].map { RGB(hex: $0)! }

/// The pill's shade of `hue`: the hue itself when white text on it reaches 4.5:1, else the hue darkened (toward black,
/// keeping its hue) by the smallest step of 1 % that does.
func pillShade(of hue: RGB) -> RGB {
  var shade = hue
  var factor = 1.0
  while contrastRatio(.white, shade) < 4.5 && factor > 0 {
    factor -= 0.01
    shade = RGB(red: hue.red * factor, green: hue.green * factor, blue: hue.blue * factor)
  }
  return shade
}

/// Who a cursor is: its label and colour (Interfaces).
struct CursorIdentity: Equatable, Sendable {
  let label: String
  let color: NSColor

  init(label: String, color: NSColor) {
    self.label = cursorLabel(label)
    self.color = color
  }
}

/// The longest label a pill shows.
let cursorLabelLimit = 24

/// A label as the pill shows it: at most 24 characters, cut with an ellipsis.
func cursorLabel(_ text: String) -> String {
  text.count <= cursorLabelLimit ? text : String(text.prefix(cursorLabelLimit - 1)) + "…"
}

/// M1's placeholder identity for a connection (M2 resolves the session's own): "Agent <id>" in a hue by connection.
func placeholderIdentity(connection: Int) -> CursorIdentity {
  CursorIdentity(label: "Agent \(connection)", color: cursorPalette[abs(connection) % cursorPalette.count].color)
}
