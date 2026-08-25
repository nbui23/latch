import Foundation
import Testing
@testable import LatchHelper

/// A class suite, not a struct: swift-testing makes one instance per test, so
/// `init`/`deinit` are the per-test fixture — and only a class can have a deinit.
@Suite final class HostsFileManagerTests {
    private let tempDirectoryURL: URL
    private let hostsURL: URL
    private let manager: HostsFileManager

    init() throws {
        tempDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectoryURL, withIntermediateDirectories: true)

        hostsURL = tempDirectoryURL.appendingPathComponent("hosts")
        try "127.0.0.1 localhost\n".write(to: hostsURL, atomically: false, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o640], ofItemAtPath: hostsURL.path)

        manager = HostsFileManager(hostsURL: hostsURL)
    }

    deinit {
        try? FileManager.default.removeItem(at: tempDirectoryURL)
    }

    @Test func writeBlockReplacesExistingHostsFileAndPreservesPermissions() throws {
        let originalAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)

        try manager.writeBlock(domains: ["youtube.com"])

        let content = try String(contentsOf: hostsURL, encoding: .utf8)
        #expect(content.contains(blockStart))
        #expect(content.contains("127.0.0.1 youtube.com"))
        #expect(content.contains("127.0.0.1 www.youtube.com"))
        #expect(content.contains(blockEnd))

        let updatedAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)
        #expect(updatedAttributes[.posixPermissions] as? NSNumber == originalAttributes[.posixPermissions] as? NSNumber)
        #expect(updatedAttributes[.ownerAccountID] as? NSNumber == originalAttributes[.ownerAccountID] as? NSNumber)
        #expect(updatedAttributes[.groupOwnerAccountID] as? NSNumber == originalAttributes[.groupOwnerAccountID] as? NSNumber)
    }

    @Test func removeBlockCleansUpMarkersAndPreservesPermissions() throws {
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
        #expect(content == "127.0.0.1 localhost\n")

        let updatedAttributes = try FileManager.default.attributesOfItem(atPath: hostsURL.path)
        #expect(updatedAttributes[.posixPermissions] as? NSNumber == originalAttributes[.posixPermissions] as? NSNumber)
        #expect(updatedAttributes[.ownerAccountID] as? NSNumber == originalAttributes[.ownerAccountID] as? NSNumber)
        #expect(updatedAttributes[.groupOwnerAccountID] as? NSNumber == originalAttributes[.groupOwnerAccountID] as? NSNumber)
    }
}
