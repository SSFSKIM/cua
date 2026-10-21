// The paste check's composition row (./live-device.mjs hidComposition): the current input source and the keyboard
// layout it resolves to (TISCopyCurrentKeyboardLayoutInputSource, the layout the engine's KeyLayout.current() reads),
// so the result can say which layout reverse-mapped "rk" under Korean 2-Set. Run with
// `swift scripts/native-matrix/keyboard-layout.swift`; one JSON line out: {"inputSourceId", "keyboardLayoutId"}.
// It selects nothing and needs no permission.
import Carbon
import Foundation

func identifier(_ source: TISInputSource?) -> Any {
  guard let source, let pointer = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else { return NSNull() }
  return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}
let current = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue()
let layout = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue()
let data = try! JSONSerialization.data(withJSONObject: ["inputSourceId": identifier(current), "keyboardLayoutId": identifier(layout)], options: [.sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
