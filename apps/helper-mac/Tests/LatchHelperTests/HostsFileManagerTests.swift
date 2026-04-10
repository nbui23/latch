import Foundation
import XCTest
@testable import LatchHelper

final class HostsFileManagerTests: XCTestCase {
    private var tempDirectoryURL: URL!
    private var hostsURL: URL!
    private var manager: HostsFileManager!

    override func setUpWithError() throws {
        tempDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectoryURL, withIntermediateDirectories: true)

        hostsURL = tempDirectoryURL.appendingPathComponent("hosts")
        try "127.0.0.1 localhost\n".write(to: hostsURL, atomically: false, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o640], ofItemAtPath: hostsURL.path)

        manager = HostsFileManager(hostsURL: hostsURL)
    }

    override func tearDownWithError() throws {
        if let tempDirectoryURL {
            try? FileManager.default.removeItem(at: tempDirectoryURL)
        }
    }

    func testWriteBlockReplacesExistingHostsFileAndPreservesPermissions() throws {
        let originalAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)

        try manager.writeBlock(domains: ["youtube.com"])

        let content = try String(contentsOf: hostsURL, encoding: .utf8)
        XCTAssertTrue(content.contains(blockStart))
        XCTAssertTrue(content.contains("127.0.0.1 youtube.com"))
        XCTAssertTrue(content.contains("127.0.0.1 www.youtube.com"))
        XCTAssertTrue(content.contains(blockEnd))

        let updatedAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)
        XCTAssertEqual(updatedAttributes[.posixPermissions] as? NSNumber, originalAttributes[.posixPermissions] as? NSNumber)
        XCTAssertEqual(updatedAttributes[.ownerAccountID] as? NSNumber, originalAttributes[.ownerAccountID] as? NSNumber)
        XCTAssertEqual(updatedAttributes[.groupOwnerAccountID] as? NSNumber, originalAttributes[.groupOwnerAccountID] as? NSNumber)
    }

    func testRemoveBlockCleansUpMarkersAndPreservesPermissions() throws {
        let startingContent = """
        127.0.0.1 localhost

        \(blockStart)
        127.0.0.1 youtube.com
        127.0.0.1 www.youtube.com
        \(blockEnd)
        """
        try startingContent.write(to: hostsURL, atomically: false, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: hostsURL.path)

        let originalAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)

        try manager.removeBlock()

        let content = try String(contentsOf: hostsURL, encoding: .utf8)
        XCTAssertEqual(content, "127.0.0.1 localhost\n")

        let updatedAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)
        XCTAssertEqual(updatedAttributes[.posixPermissions] as? NSNumber, originalAttributes[.posixPermissions] as? NSNumber)
        XCTAssertEqual(updatedAttributes[.ownerAccountID] as? NSNumber, originalAttributes[.ownerAccountID] as? NSNumber)
        XCTAssertEqual(updatedAttributes[.groupOwnerAccountID] as? NSNumber, originalAttributes[.groupOwnerAccountID] as? NSNumber)
    }
}
