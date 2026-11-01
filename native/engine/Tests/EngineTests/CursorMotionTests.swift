import CoreGraphics
import Foundation
import XCTest
@testable import Engine

// The agent cursor's motion (Cursor/CursorMotion.swift) against the reference vectors: the look reference's separate
// JavaScript implementation of the vendor's documented algorithm, run by Fixtures/cursor-reference/reference.mjs in the
// cursor panel's y-up tip coordinates (Acceptance 11's unit part; the spec's M1 step 0).

private struct ReferenceCase {
  let name: String
  let bounds: CGRect
  let from: CGPoint
  let to: CGPoint
  let mode: String
  let settleSteps: Int
  let chosen: Int?
  let cost: Double?
  let response: Double?
  let candidateCosts: [Double]
  let candidateInBounds: [Bool]
  let segments: [(CGPoint, CGPoint, CGPoint)]
}

private func referenceCases(file: StaticString = #filePath) throws -> [ReferenceCase] {
  let here = URL(fileURLWithPath: "\(file)").deletingLastPathComponent()
  let data = try Data(contentsOf: here.appendingPathComponent("Fixtures/cursor-reference/vectors.json"))
  let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  let cases = try XCTUnwrap(root["cases"] as? [[String: Any]])
  func point(_ value: Any?) -> CGPoint {
    let p = value as! [String: Any]
    return CGPoint(x: (p["x"] as! NSNumber).doubleValue, y: (p["y"] as! NSNumber).doubleValue)
  }
  func pair(_ value: Any?) -> CGPoint {
    let p = value as! [NSNumber]
    return CGPoint(x: p[0].doubleValue, y: p[1].doubleValue)
  }
  return cases.map { c in
    let b = c["bounds"] as! [String: NSNumber]
    let candidates = c["candidates"] as? [[String: Any]] ?? []
    let segments = (c["segments"] as? [[String: Any]] ?? []).map { (pair($0["control1"]), pair($0["control2"]), pair($0["end"])) }
    return ReferenceCase(name: c["name"] as! String,
                         bounds: CGRect(x: b["x"]!.doubleValue, y: b["y"]!.doubleValue, width: b["w"]!.doubleValue, height: b["h"]!.doubleValue),
                         from: point(c["from"]), to: point(c["to"]), mode: c["mode"] as! String,
                         settleSteps: (c["settleSteps"] as! NSNumber).intValue, chosen: (c["chosen"] as? NSNumber)?.intValue,
                         cost: (c["cost"] as? NSNumber)?.doubleValue, response: (c["response"] as? NSNumber)?.doubleValue,
                         candidateCosts: candidates.map { ($0["cost"] as! NSNumber).doubleValue },
                         candidateInBounds: candidates.map { ($0["inBounds"] as! NSNumber).boolValue }, segments: segments)
  }
}

private func relativeError(_ a: Double, _ b: Double) -> Double { abs(a - b) / max(abs(b), 1e-300) }

final class CursorMotionReferenceTests: XCTestCase {
  func testTheFixtureHoldsEveryKindOfMoveTheSpecNames() throws {
    let cases = try referenceCases()
    XCTAssertGreaterThanOrEqual(cases.count, 14)
    XCTAssertTrue(cases.contains { $0.mode == "scoot" })
    XCTAssertTrue(cases.contains { $0.mode == "path" && $0.chosen.map { $0 >= 2 } == true }, "an arc is chosen somewhere")
    XCTAssertTrue(cases.contains { $0.name.contains("tip versus window origin") })
  }

  func testTheModeFollowsTheVendorsDistanceThreshold() throws {
    for c in try referenceCases() {
      let trajectory = plan(from: CursorState(position: c.from), to: c.to, bounds: c.bounds, reduceMotion: false)
      XCTAssertEqual(trajectory.mode == .scoot ? "scoot" : trajectory.mode == .path ? "path" : "snap", c.mode, c.name)
    }
  }

  func testThePathChoiceCostAndResponseMatchTheReference() throws {
    for c in try referenceCases() where c.mode == "path" {
      let trajectory = plan(from: CursorState(position: c.from), to: c.to, bounds: c.bounds, reduceMotion: false)
      XCTAssertEqual(trajectory.chosen, c.chosen, c.name)
      XCTAssertLessThan(relativeError(try XCTUnwrap(trajectory.cost, c.name), c.cost!), 1e-9, c.name)
      XCTAssertLessThan(relativeError(try XCTUnwrap(trajectory.response, c.name), c.response!), 1e-9, c.name)
    }
  }

  func testEveryCandidatesCostAndBoundsMatchTheReference() throws {
    for c in try referenceCases() where c.mode == "path" {
      let candidates = enumerateCandidates(from: c.from, to: c.to)
      XCTAssertEqual(candidates.count, 20, c.name)
      for (index, candidate) in candidates.enumerated() {
        let scored = score(candidate, bounds: c.bounds)
        XCTAssertLessThan(relativeError(scored.cost, c.candidateCosts[index]), 1e-9, "\(c.name) #\(index)")
        XCTAssertEqual(scored.measurement.staysInBounds, c.candidateInBounds[index], "\(c.name) #\(index)")
      }
    }
  }

  func testTheChosenPathsGeometryMatchesTheReference() throws {
    for c in try referenceCases() where c.mode == "path" {
      let candidates = enumerateCandidates(from: c.from, to: c.to)
      let chosen = candidates[try XCTUnwrap(c.chosen)]
      XCTAssertEqual(chosen.segments.count, c.segments.count, c.name)
      for (segment, reference) in zip(chosen.segments, c.segments) {
        for (a, b) in [(segment.control1, reference.0), (segment.control2, reference.1), (segment.end, reference.2)] {
          XCTAssertEqual(a.x, b.x, accuracy: 1e-9, c.name)
          XCTAssertEqual(a.y, b.y, accuracy: 1e-9, c.name)
        }
      }
    }
  }

  func testTheSettleTimeIsWithinOneStepOfTheReference() throws {
    for c in try referenceCases() {
      let trajectory = plan(from: CursorState(position: c.from), to: c.to, bounds: c.bounds, reduceMotion: false)
      XCTAssertEqual(trajectory.step, 1.0 / 240.0)
      XCTAssertLessThanOrEqual(abs(trajectory.settleIndex - c.settleSteps), 1, "\(c.name): \(trajectory.settleIndex) against \(c.settleSteps)")
    }
  }
}

final class CursorMotionTests: XCTestCase {
  private let screen = CGRect(x: 0, y: 0, width: 1440, height: 870)

  func testThePathEndsExactlyAtTheTargetAtRest() {
    let target = CGPoint(x: 1200, y: 700)
    let trajectory = plan(from: CursorState(position: CGPoint(x: 200, y: 150)), to: target, bounds: screen, reduceMotion: false)
    let last = trajectory.samples.last!
    XCTAssertEqual(last.position, target)
    XCTAssertEqual(last.angle, 0, "the arrow back at its resting tilt")
    XCTAssertEqual(last.velocity, .zero)
    XCTAssertEqual(trajectory.samples.first!.position, CGPoint(x: 200, y: 150))
  }

  func testAPathNeverPassesItsTargetAndArrivesBeforeItSettles() {
    let start = CGPoint(x: 300, y: 300), target = CGPoint(x: 900, y: 300)
    let trajectory = plan(from: CursorState(position: start), to: target, bounds: screen, reduceMotion: false)
    XCTAssertEqual(trajectory.mode, .path)
    XCTAssertGreaterThan(trajectory.arrivalIndex, 0)
    XCTAssertLessThanOrEqual(trajectory.arrivalIndex, trajectory.settleIndex)
    let arrival = trajectory.samples[trajectory.arrivalIndex].position
    XCTAssertLessThanOrEqual(hypot(arrival.x - target.x, arrival.y - target.y), 3.157 + 1e-9, "close enough: within 3.157 pt")
  }

  func testOnAPathTheArrowFacesItsTravel() {
    // Moving straight right, the heading turns the tip (resting up-left) onto +x: clockwise by 134°.
    let trajectory = plan(from: CursorState(position: CGPoint(x: 200, y: 400)), to: CGPoint(x: 1200, y: 400), bounds: screen, reduceMotion: false)
    let middle = trajectory.samples[trajectory.settleIndex / 3]
    let tangent = middle.velocity
    let expected = (atan2(-tangent.dy, tangent.dx) * 180 / .pi + 90 + 44) * .pi / 180
    XCTAssertEqual(middle.angle, expected, accuracy: 1e-6)
  }

  func testAScootTiltsAndStretchesOnItsEnvelopeAndEndsAtRest() {
    let trajectory = plan(from: CursorState(position: CGPoint(x: 400, y: 300)), to: CGPoint(x: 500, y: 360), bounds: screen, reduceMotion: false)
    XCTAssertEqual(trajectory.mode, .scoot)
    XCTAssertGreaterThan(trajectory.samples.map(\.stretch).max()!, 1.2, "stretched along the travel axis")
    XCTAssertLessThan(trajectory.samples.map(\.squash).min()!, 0.95, "squashed across it")
    XCTAssertGreaterThan(trajectory.samples.map { abs($0.angle) }.max()!, 0.2, "tilted toward its travel")
    let last = trajectory.samples.last!
    XCTAssertEqual(last.position, CGPoint(x: 500, y: 360))
    XCTAssertEqual(last.stretch, 1)
    XCTAssertEqual(last.squash, 1)
    XCTAssertEqual(last.angle, 0)
  }

  func testTheHaloSwellsWithSpeedOnAPathOnly() {
    let path = plan(from: CursorState(position: CGPoint(x: 100, y: 100)), to: CGPoint(x: 1300, y: 800), bounds: screen, reduceMotion: false)
    let swell = path.samples.map(\.swell)
    XCTAssertGreaterThan(swell.max()!, 1.05)
    XCTAssertLessThanOrEqual(swell.max()!, 2.5)
    let scoot = plan(from: CursorState(position: CGPoint(x: 400, y: 300)), to: CGPoint(x: 500, y: 360), bounds: screen, reduceMotion: false)
    XCTAssertEqual(scoot.samples.map(\.swell).max()!, 1, accuracy: 1e-9, "the vendor's scoot reports no velocity to the style")
  }

  func testReduceMotionIsAStraightShortEaseOutWithNoFlourish() {
    let start = CGPoint(x: 200, y: 150), target = CGPoint(x: 1200, y: 700)
    let trajectory = plan(from: CursorState(position: start), to: target, bounds: screen, reduceMotion: true)
    XCTAssertEqual(trajectory.mode, .snap)
    XCTAssertEqual(trajectory.duration, 0.15, accuracy: 1 / 240.0)
    for sample in trajectory.samples {
      // On the segment from start to target: the cross product with the travel vector is zero.
      let cross = (sample.position.x - start.x) * (target.y - start.y) - (sample.position.y - start.y) * (target.x - start.x)
      XCTAssertEqual(cross, 0, accuracy: 1e-6)
      XCTAssertEqual(sample.angle, 0)
      XCTAssertEqual(sample.stretch, 1)
      XCTAssertEqual(sample.squash, 1)
      XCTAssertEqual(sample.swell, 1)
    }
    // Ease-out: more than half the way in the first half of the time.
    let half = trajectory.samples[trajectory.samples.count / 2].position
    XCTAssertGreaterThan(hypot(half.x - start.x, half.y - start.y), hypot(target.x - start.x, target.y - start.y) * 0.6)
    XCTAssertEqual(trajectory.samples.last!.position, target)
  }

  func testAStraightTraceFollowsTheSegmentWithoutTurning() {
    let start = CGPoint(x: 300, y: 300), end = CGPoint(x: 700, y: 500)
    let trajectory = planStraight(from: CursorState(position: start), to: end, bounds: screen, reduceMotion: false)
    for sample in trajectory.samples {
      let cross = (sample.position.x - start.x) * (end.y - start.y) - (sample.position.y - start.y) * (end.x - start.x)
      XCTAssertEqual(cross, 0, accuracy: 1e-6)
      XCTAssertEqual(sample.angle, 0)
    }
    XCTAssertEqual(trajectory.samples.last!.position, end)
  }

  func testAStateBetweenSamplesIsInterpolatedAndClampedAtTheEnds() {
    let trajectory = plan(from: CursorState(position: CGPoint(x: 300, y: 300)), to: CGPoint(x: 900, y: 300), bounds: screen, reduceMotion: false)
    XCTAssertEqual(trajectory.state(at: -1).position, trajectory.samples.first!.position)
    XCTAssertEqual(trajectory.state(at: 100).position, trajectory.samples.last!.position)
    let a = trajectory.samples[10].position, b = trajectory.samples[11].position
    let between = trajectory.state(at: 10.5 * trajectory.step).position
    XCTAssertEqual(between.x, (a.x + b.x) / 2, accuracy: 1e-9)
    XCTAssertEqual(between.y, (a.y + b.y) / 2, accuracy: 1e-9)
  }

  func testASpliceContinuesFromTheRetainedStateWithoutJumping() {
    // A scoot planned from a state in motion starts where the old trajectory was, with its velocity.
    let first = plan(from: CursorState(position: CGPoint(x: 300, y: 300)), to: CGPoint(x: 900, y: 300), bounds: screen, reduceMotion: false)
    let splice = first.state(at: 0.2)
    let second = plan(from: splice, to: CGPoint(x: splice.position.x + 80, y: splice.position.y + 40), bounds: screen, reduceMotion: false)
    XCTAssertEqual(second.samples.first!.position, splice.position)
    let early = second.samples[2].position
    XCTAssertGreaterThan(early.x, splice.position.x, "it keeps going the way it was going")
  }

  func testTheSettleRuleIsTheVendors() {
    // Velocity and force under the threshold, and within 1 % of the target's own magnitude.
    var spring = SpringSimulation(response: 0.5, damping: 0.9, idle: 0.01, from: SIMD2(0, 0), to: SIMD2(1, 0))
    XCTAssertFalse(spring.settled, "1 away from a target of magnitude 1")
    spring.x = SIMD2(0.995, 0)
    XCTAssertTrue(spring.settled, "within 1 %, at rest")
    spring.force = SIMD2(0.02, 0)
    XCTAssertFalse(spring.settled, "the force counts as the velocity does")
    var zero = SpringSimulation(response: 0.5, damping: 0.9, idle: 0.01, from: SIMD2(5, 0), to: SIMD2(0, 0))
    XCTAssertTrue(zero.settled, "a zero target skips the displacement test")
    zero.step(1 / 240.0)
    XCTAssertFalse(zero.settled)
  }
}
