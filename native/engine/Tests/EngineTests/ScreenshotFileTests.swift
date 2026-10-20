import Foundation
import XCTest
@testable import Engine

// Where a screenshot is written (the spec's Design, "Screenshot"): into the request's outputDirectory, which the service
// names under the session's run directory. The engine creates it, since the sandboxed worker writes nothing in the
// default mode, and never follows a symbolic link in its place: under the scoped sandbox the kernel may write in the run
// directory, and a link there would steer the engine's write out of the session.

final class ScreenshotFileTests: XCTestCase {
  private var root = ""

  override func setUpWithError() throws {
    root = try FileManager.default.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: URL(fileURLWithPath: NSTemporaryDirectory()), create: true).path
  }

  override func tearDownWithError() throws { try? FileManager.default.removeItem(atPath: root) }

  private func mode(_ path: String) throws -> Int {
    (try FileManager.default.attributesOfItem(atPath: path)[.posixPermissions] as! NSNumber).intValue
  }

  func testTheDirectoryIsCreatedPrivateAndTheFileWrittenWithMode0600() throws {
    let directory = root + "/screenshots"
    let path = try writePrivately(Data([0xff, 0xd8, 0xff, 0xd9]), into: directory, name: "a.jpg")
    XCTAssertEqual(path, directory + "/a.jpg")
    XCTAssertEqual(try mode(directory), 0o700)
    XCTAssertEqual(try mode(path), 0o600)
    XCTAssertEqual(FileManager.default.contents(atPath: path), Data([0xff, 0xd8, 0xff, 0xd9]))
    _ = try writePrivately(Data([1]), into: directory, name: "b.jpg")
    XCTAssertTrue(FileManager.default.fileExists(atPath: directory + "/b.jpg"), "an existing directory is used as it is")
  }

  func testALinkInTheDirectorysPlaceIsRefusedAndNothingIsWrittenThroughIt() throws {
    let elsewhere = root + "/elsewhere"
    try FileManager.default.createDirectory(atPath: elsewhere, withIntermediateDirectories: false)
    try FileManager.default.createSymbolicLink(atPath: root + "/screenshots", withDestinationPath: elsewhere)
    XCTAssertThrowsError(try writePrivately(Data([1]), into: root + "/screenshots", name: "a.jpg")) { error in
      XCTAssertEqual((error as? EngineError)?.errorName, "screenCaptureFailed")
    }
    XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: elsewhere), [])
  }

  func testAnExistingFileOrALinkAtTheFilesNameIsNeverReplaced() throws {
    let directory = root + "/screenshots"
    _ = try writePrivately(Data([1]), into: directory, name: "a.jpg")
    XCTAssertThrowsError(try writePrivately(Data([2]), into: directory, name: "a.jpg"))
    XCTAssertEqual(FileManager.default.contents(atPath: directory + "/a.jpg"), Data([1]))
    let target = root + "/target"
    try FileManager.default.createSymbolicLink(atPath: directory + "/b.jpg", withDestinationPath: target)
    XCTAssertThrowsError(try writePrivately(Data([2]), into: directory, name: "b.jpg"))
    XCTAssertFalse(FileManager.default.fileExists(atPath: target))
  }
}
