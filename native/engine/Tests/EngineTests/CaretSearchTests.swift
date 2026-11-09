import CoreGraphics
import XCTest
@testable import Engine

/// #290: the caret's offset is searched for over the field's character boxes, by line, then by x, instead of read box
/// by box. The answer is #283's linear scan's wherever that one answers (the reference below is its text as #283 left
/// it, its 5,000-character cap aside); a longer field is searched too.
final class CaretSearchTests: XCTestCase {
  /// #283's linear scan, frozen as the reference the search must agree with.
  private func linear(at point: CGPoint, length: Int, range: Range<Int>, bounds: (Int) -> CGRect?,
                      isLineBreak: (Int) -> Bool, mayLackBox: (Int) -> Bool) -> Result<Int, CaretNotPlaced> {
    if length == 0 { return .success(0) }
    let scanned = range.clamped(to: 0..<length)
    var readABox = false, missedABox = false
    var lineEnd: (offset: Int, x: CGFloat, after: CGRect?)?
    for index in scanned {
      let lineBreak = isLineBreak(index)
      guard let box = bounds(index), box.height > 0, lineBreak || box.width > 0 else {
        if !lineBreak, !mayLackBox(index) { missedABox = true }
        continue
      }
      readABox = true
      guard box.minY <= point.y, point.y < box.maxY else { continue }
      if lineBreak {
        if lineEnd.map({ box.minX >= $0.x }) ?? true { lineEnd = (index, box.minX, nil) }
        continue
      }
      if box.minX <= point.x, point.x < box.maxX { return .success(point.x < box.midX ? index : index + 1) }
      if lineEnd.map({ box.maxX >= $0.x }) ?? true { lineEnd = (index + 1, box.maxX, box) }
    }
    guard readABox else { return .failure(.noCharacterBoxes) }
    let miss = Result<Int, CaretNotPlaced>.failure(missedABox ? .boxesIncomplete : .pointOutsideText)
    guard let lineEnd, point.x >= lineEnd.x else { return miss }
    let end = lineEnd.offset
    guard let after = lineEnd.after, end < length, !isLineBreak(end) else { return .success(end) }
    if let next = bounds(end), next.width > 0, next.height > 0, next.minY >= after.maxY { return .success(end) }
    return miss
  }

  /// A deterministic generator, so a failing layout can be replayed by its seed.
  private struct Seeded: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
      state &+= 0x9E37_79B9_7F4A_7C15
      var z = state
      z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
      z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
      return z ^ (z >> 31)
    }
  }

  /// A text laid out as a field lays it out: `columns` 8-point characters to a line, 20-point lines from (100, 200),
  /// soft-wrapped, a newline's box at its line's end. Its boxes as AX gives them, nil for a failed read.
  private struct Layout {
    var text: [UInt16] = []
    var boxes: [CGRect?] = []
    var lines = 0
    let origin = CGPoint(x: 100, y: 200)
    let columns: Int

    var length: Int { text.count }
    func isLineBreak(_ index: Int) -> Bool { index < text.count && text[index] == 0x0A }
    func mayLack(_ index: Int) -> Bool { index >= text.count || text[index] == 0x0A || text[index] == 0x20 }

    /// `empty`: the chance a space's box is empty (collapsed whitespace); `failed`: the chance any character's read
    /// fails; `breakBox`: the chance a newline has a box at all; `newline`: the chance a character is a newline.
    init<G: RandomNumberGenerator>(length: Int, columns: Int, newline: Double, space: Double, empty: Double, failed: Double,
                                   breakBox: Double, using generator: inout G) {
      self.columns = columns
      var column = 0
      for _ in 0..<length {
        let roll = Double.random(in: 0..<1, using: &generator)
        let unit: UInt16 = roll < newline ? 0x0A : roll < newline + space ? 0x20 : 0x61
        if unit != 0x0A, column == columns { lines += 1; column = 0 }  // a soft wrap
        let x = origin.x + CGFloat(column) * 8, y = origin.y + CGFloat(lines) * 20
        var box: CGRect?
        switch unit {
        case 0x0A: box = Double.random(in: 0..<1, using: &generator) < breakBox ? CGRect(x: x, y: y, width: 0, height: 20) : .zero
        case 0x20: box = Double.random(in: 0..<1, using: &generator) < empty ? .zero : CGRect(x: x, y: y, width: 8, height: 20)
        default: box = CGRect(x: x, y: y, width: 8, height: 20)
        }
        if Double.random(in: 0..<1, using: &generator) < failed { box = nil }
        text.append(unit)
        boxes.append(box)
        if unit == 0x0A { lines += 1; column = 0 } else { column += 1 }
      }
      lines += 1
    }

    /// Every line of `columns` characters with no newline: a long single-paragraph field, or with `breakEvery` a
    /// newline closing each line of that many characters.
    init(length: Int, columns: Int, breakEvery: Int? = nil) {
      self.columns = columns
      var column = 0
      for _ in 0..<length {
        let lineBreak = breakEvery.map { column == $0 } ?? false
        if !lineBreak, column == columns { lines += 1; column = 0 }
        let x = origin.x + CGFloat(column) * 8, y = origin.y + CGFloat(lines) * 20
        text.append(lineBreak ? 0x0A : 0x61)
        boxes.append(CGRect(x: x, y: y, width: lineBreak ? 0 : 8, height: 20))
        if lineBreak { lines += 1; column = 0 } else { column += 1 }
      }
      lines += 1
    }

    func point<G: RandomNumberGenerator>(using generator: inout G) -> CGPoint {
      CGPoint(x: origin.x + CGFloat.random(in: -20..<(CGFloat(columns) * 8 + 40), using: &generator),
              y: origin.y + CGFloat.random(in: -30..<(CGFloat(lines) * 20 + 30), using: &generator))
    }
  }

  private final class Counter { var reads = 0 }

  private func search(_ layout: Layout, _ point: CGPoint, range: Range<Int>? = nil, counter: Counter? = nil) -> Result<Int, CaretNotPlaced> {
    caretOffset(at: point, length: layout.length, range: range ?? 0..<layout.length,
                bounds: { counter?.reads += 1; return layout.boxes[$0] }, isLineBreak: layout.isLineBreak, mayLackBox: layout.mayLack)
  }

  private func reference(_ layout: Layout, _ point: CGPoint, range: Range<Int>? = nil) -> Result<Int, CaretNotPlaced> {
    linear(at: point, length: layout.length, range: range ?? 0..<layout.length, bounds: { layout.boxes[$0] },
           isLineBreak: layout.isLineBreak, mayLackBox: layout.mayLack)
  }

  /// Random wrapped layouts with empty lines, runs of empty boxes, boxless newlines and failed reads: within the linear
  /// scan's reach the search answers exactly what it answers, offsets and reasons alike.
  func testTheSearchAnswersWhatTheLinearScanAnswers() {
    var generator = Seeded(state: 290)
    var placed = 0
    for trial in 0..<300 {
      let length = Int.random(in: 1...900, using: &generator)
      let layout = Layout(length: length, columns: Int.random(in: 4...60, using: &generator),
                          newline: [0, 0.02, 0.1, 0.4][trial % 4], space: [0, 0.15, 0.5][trial % 3],
                          empty: [0, 0.5, 1][trial % 3], failed: [0, 0, 0.01, 0.1, 0.5][trial % 5],
                          breakBox: [1, 0.5, 0][trial % 3], using: &generator)
      for _ in 0..<20 {
        let point = layout.point(using: &generator)
        let expected = reference(layout, point)
        XCTAssertEqual(search(layout, point), expected, "trial \(trial) at \(point)")
        if case .success = expected { placed += 1 }
      }
      // Each character's own box, its left and right halves, and past its line's end.
      for index in stride(from: 0, to: layout.length, by: max(1, layout.length / 12)) {
        guard let box = layout.boxes[index], box.width > 0 else { continue }
        for point in [CGPoint(x: box.minX + 1, y: box.midY), CGPoint(x: box.maxX - 1, y: box.midY), CGPoint(x: box.maxX + 900, y: box.midY)] {
          XCTAssertEqual(search(layout, point), reference(layout, point), "trial \(trial), character \(index) at \(point)")
        }
      }
    }
    XCTAssertGreaterThan(placed, 1_000, "the trials place carets, not only miss")
  }

  /// A scan range short of the text (the API's own range) keeps the linear scan's answers too.
  func testAShortenedRangeAnswersAsTheLinearScan() {
    var generator = Seeded(state: 2_900)
    for trial in 0..<100 {
      let layout = Layout(length: 400, columns: 30, newline: 0.05, space: 0.1, empty: 0.5, failed: 0.02, breakBox: 1, using: &generator)
      let lower = Int.random(in: 0..<400, using: &generator)
      let range = lower..<Int.random(in: lower...400, using: &generator)
      for _ in 0..<10 {
        let point = layout.point(using: &generator)
        XCTAssertEqual(search(layout, point, range: range), reference(layout, point, range: range), "trial \(trial), \(range) at \(point)")
      }
    }
  }

  /// #283's long textarea (75 lines of 40 characters, 3,074 units) clicked on line 37: the offset in a few dozen box
  /// reads, where the linear scan read 1,538 to get there.
  func testTheLongTextareaIsSearchedInAFewReads() {
    let layout = Layout(length: 3_074, columns: 41, breakEvery: 40)
    let counter = Counter()
    let point = CGPoint(x: layout.origin.x + 20 * 8 + 2, y: layout.origin.y + 37 * 20 + 10)
    XCTAssertEqual(search(layout, point, counter: counter), .success(37 * 41 + 20))
    XCTAssertEqual(reference(layout, point), .success(37 * 41 + 20))
    XCTAssertLessThanOrEqual(counter.reads, 32, "\(counter.reads) reads")
  }

  /// A 20,000-character field, past #283's cap: placed in the search's reads, mid-line, past a line's end and at the
  /// last character.
  func testATwentyThousandCharacterFieldIsPlaced() {
    let layout = Layout(length: 20_000, columns: 80)
    let line = 137, column = 33
    for (point, offset) in [(CGPoint(x: layout.origin.x + CGFloat(column) * 8 + 6, y: layout.origin.y + CGFloat(line) * 20 + 3), line * 80 + column + 1),
                            (CGPoint(x: layout.origin.x + 2, y: layout.origin.y + 3), 0),
                            (CGPoint(x: layout.origin.x + 79 * 8 + 1, y: layout.origin.y + 249 * 20 + 19), 19_999)] {
      let counter = Counter()
      XCTAssertEqual(search(layout, point, counter: counter), .success(offset), "\(point)")
      XCTAssertEqual(reference(layout, point), .success(offset))
      XCTAssertLessThanOrEqual(counter.reads, 40, "\(counter.reads) reads at \(point)")
    }
    // Past the last line's end: the text's end, established by the text ending there.
    let last = Layout(length: 19_990, columns: 80)
    XCTAssertEqual(search(last, CGPoint(x: last.origin.x + 79 * 8, y: last.origin.y + 249 * 20 + 5)), .success(19_990))
    // Past a soft-wrapped line's end in the middle of the field: no point past it is in a box, so a wrap line's end
    // is the next line's first character, as the linear scan answers.
    let wrapPoint = CGPoint(x: layout.origin.x + 80 * 8 + 30, y: layout.origin.y + CGFloat(line) * 20 + 5)
    XCTAssertEqual(search(layout, wrapPoint), reference(layout, wrapPoint))
  }

  /// A long field's miss is read from a bounded scan near where the search ended, never from every box: below every
  /// line, and every box empty (before Chromium's complete accessibility mode).
  func testALongFieldsMissReadsABoundedScan() {
    let layout = Layout(length: 20_000, columns: 80)
    let counter = Counter()
    XCTAssertEqual(search(layout, CGPoint(x: layout.origin.x + 5, y: layout.origin.y + 260 * 20), counter: counter), .failure(.pointOutsideText))
    XCTAssertLessThanOrEqual(counter.reads, caretScanLimit + 2 * caretSearchStepLimit + 64)
    var empty = layout
    empty.boxes = Array(repeating: .zero, count: layout.length)
    let none = Counter()
    XCTAssertEqual(search(empty, CGPoint(x: 300, y: 300), counter: none), .failure(.noCharacterBoxes))
    XCTAssertLessThanOrEqual(none.reads, caretScanLimit + 2 * caretSearchStepLimit + 64)
    // A long field whose clicked line's boxes are still arriving is an incomplete miss, so the wait re-reads it.
    var arriving = layout
    for index in 150 * 80..<151 * 80 { arriving.boxes[index] = nil }
    XCTAssertEqual(search(arriving, CGPoint(x: layout.origin.x + 10 * 8 + 2, y: layout.origin.y + 150 * 20 + 5)), .failure(.boxesIncomplete))
  }

  /// Boxes that do not run in reading order (right to left within a line) are not searched: the linear scan decides,
  /// so no offset is taken from a bisection that assumed an order the text does not have.
  func testBoxesOutOfReadingOrderFallBackToTheLinearScan() {
    var layout = Layout(length: 600, columns: 60)
    for index in 0..<layout.length {
      let row = index / 60, column = index % 60
      layout.boxes[index] = CGRect(x: layout.origin.x + CGFloat(59 - column) * 8, y: layout.origin.y + CGFloat(row) * 20, width: 8, height: 20)
    }
    var generator = Seeded(state: 29)
    for _ in 0..<200 {
      let point = layout.point(using: &generator)
      XCTAssertEqual(search(layout, point), reference(layout, point), "\(point)")
    }
  }

  /// A right-to-left line too short for the search to read two of its boxes shows it no order broken, so a text holding
  /// right-to-left characters is not searched at all: the linear scan reads it, box by box, to the character under the
  /// point. The same layout of left-to-right text is searched.
  func testARightToLeftTextIsNotSearched() {
    let bounds = { (index: Int) -> CGRect? in CGRect(x: 100 + CGFloat(index % 50) * 8, y: 200 + CGFloat(index / 50) * 20, width: 8, height: 20) }
    let point = CGPoint(x: 100 + 10 * 8 + 2, y: 200 + 7 * 20 + 5)  // character 360's left half
    for (value, most) in [(String(repeating: "א", count: 600), 600), (String(repeating: "a", count: 600), 32)] {
      let counter = Counter()
      XCTAssertEqual(textCaretOffset(at: point, value: value, bounds: { counter.reads += 1; return bounds($0) }), .success(360))
      XCTAssertLessThanOrEqual(counter.reads, most, value.prefix(1).description)
      if most == 600 { XCTAssertEqual(counter.reads, 361, "every box up to the point's") }
    }
    // Past the linear scan's reach a right-to-left text is #283's refusal, nothing read: no search, so no window near
    // the point is known.
    let counter = Counter()
    XCTAssertEqual(textCaretOffset(at: point, value: String(repeating: "א", count: caretScanLimit + 1), bounds: { counter.reads += 1; return bounds($0) }),
                   .failure(.pointOutsideText))
    XCTAssertEqual(counter.reads, 0)
  }

  func testRightToLeftCharactersAndMarksAreKnown() {
    for text in ["שלום", "مرحبا", "a\u{200F}b", "\u{202B}x", "\u{202E}x", "\u{2067}x", "\u{10900}", "\u{1E900}"] {
      XCTAssertTrue(holdsRightToLeft(text as NSString), text.debugDescription)
    }
    for text in ["hello", "한국어", "日本語", "\u{1F600}", "a\u{FEFF}b", ""] { XCTAssertFalse(holdsRightToLeft(text as NSString), text.debugDescription) }
  }

  /// A probe whose box is empty or unreadable steps past it to the nearest usable one, never inferring across it:
  /// a field of single characters between long runs of collapsed spaces.
  func testRunsOfEmptyBoxesAreSteppedPast() {
    var layout = Layout(length: 4_000, columns: 4_000)
    for index in 0..<layout.length where index % 100 != 0 {
      layout.text[index] = 0x20
      layout.boxes[index] = index % 7 == 0 ? nil : .zero
    }
    var generator = Seeded(state: 2_029)
    for _ in 0..<200 {
      let point = CGPoint(x: layout.origin.x + CGFloat.random(in: -10..<32_010, using: &generator), y: layout.origin.y + 10)
      XCTAssertEqual(search(layout, point), reference(layout, point), "\(point)")
    }
  }
}
