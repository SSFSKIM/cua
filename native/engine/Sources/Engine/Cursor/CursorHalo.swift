import AppKit
import Foundation

// The cursor's halo (the spec's Design, "What the person sees", the look; "Rendering and the main thread"): a soft circle
// that blurs and lightens what lies behind the cursor's panel, as frosted glass does, with a faint wash of the session's
// colour. M1's spike chose the route (the spec's Surprises, M1 step 1): an `NSVisualEffectView` blending behind the
// window, masked by a soft `maskImage`, follows a Core Animation–moved container in the same frame with no main-thread
// work per frame; `CALayer.backgroundFilters` blurs nothing behind a window. This type owns the backdrop alone, so a
// later change of route (the vendor's own backdrop, radius 17 with its saturation and luminance curve) touches neither
// the motion nor the hooks.
//
// The material is `.hudWindow` under the `.aqua` appearance: of the spike's light candidates it is the one closest to
// the look reference's option A, whose halo is a milky white frost (white at 30–55 % over a blur of 17) tinted 12–20 %
// by the session's colour. `.fullScreenUI` keeps more of the backdrop's own colour and less of the white; `.popover`,
// `.menu` and `.toolTip` are near opaque. The appearance is forced, as the owner's Mac runs dark and look A lightens
// in either.

@MainActor
final class CursorHalo {
  /// The halo's side: a 42 pt circle with an edge blur of 12 on each side.
  static let side: CGFloat = 66
  /// The radius inside which the halo is fully opaque, and where it has faded to nothing.
  static let solidRadius: CGFloat = 9, clearRadius: CGFloat = 33

  /// The view to place, centred on the arrow's tip; its layer takes the swell's scale.
  let view: NSView
  private let backdrop: NSVisualEffectView
  private let tint: CALayer

  init() {
    let frame = NSRect(x: 0, y: 0, width: Self.side, height: Self.side)
    view = NSView(frame: frame)
    view.wantsLayer = true
    backdrop = NSVisualEffectView(frame: frame)
    backdrop.material = .hudWindow
    backdrop.blendingMode = .behindWindow
    backdrop.state = .active
    backdrop.appearance = NSAppearance(named: .aqua)
    let mask = Self.softCircle()
    backdrop.maskImage = mask
    view.addSubview(backdrop)
    let wash = NSView(frame: frame)
    wash.wantsLayer = true
    tint = CALayer()
    tint.frame = frame
    let maskLayer = CALayer()
    maskLayer.frame = frame
    maskLayer.contents = mask
    tint.mask = maskLayer
    wash.layer?.addSublayer(tint)
    view.addSubview(wash)
  }

  /// The session's colour washed over the frost (look A: 12–20 %).
  func setTint(_ color: NSColor) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    tint.backgroundColor = color.withAlphaComponent(0.14).cgColor
    CATransaction.commit()
  }

  /// A soft circle: opaque to `solidRadius`, smoothly clear at `clearRadius`.
  private static func softCircle() -> NSImage {
    NSImage(size: NSSize(width: side, height: side), flipped: false) { rect in
      let centre = NSPoint(x: rect.midX, y: rect.midY)
      let steps = 12
      var colors: [NSColor] = [], locations: [CGFloat] = []
      for i in 0...steps {
        let u = CGFloat(i) / CGFloat(steps)
        let r = solidRadius + (clearRadius - solidRadius) * u
        let smooth = 1 - u * u * (3 - 2 * u)
        colors.append(NSColor.black.withAlphaComponent(smooth))
        locations.append(r / clearRadius)
      }
      colors.insert(.black, at: 0)
      locations.insert(0, at: 0)
      let gradient = NSGradient(colors: colors, atLocations: locations, colorSpace: .deviceRGB)
      gradient?.draw(fromCenter: centre, radius: 0, toCenter: centre, radius: clearRadius, options: [])
      return true
    }
  }
}
