import XCTest
import Foundation
import Darwin
@testable import LatchHelper

final class RequestHandlerTests: XCTestCase {
    private var tempDirectoryURL: URL!
    private var hostsURL: URL!
    private var manager: HostsFileManager!

    override func setUpWithError() throws {
        tempDirectoryURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDirectoryURL, withIntermediateDirectories: true)

        hostsURL = tempDirectoryURL.appendingPathComponent("hosts")
        try "127.0.0.1 localhost\n".write(to: hostsURL, atomically: false, encoding: .utf8)

        manager = HostsFileManager(hostsURL: hostsURL)
    }

    override func tearDownWithError() throws {
        if let tempDirectoryURL {
            try? FileManager.default.removeItem(at: tempDirectoryURL)
        }
    }

    // MARK: - readRequestWithCap

    /// Make a bidirectional Unix socket pair for exercising the real read()
    /// loop without binding a path-backed socket.
    private func makeSocketPair() throws -> (Int32, Int32) {
        var fds: [Int32] = [0, 0]
        let rc = fds.withUnsafeMutableBufferPointer { ptr -> Int32 in
            Darwin.socketpair(AF_UNIX, SOCK_STREAM, 0, ptr.baseAddress)
        }
        if rc != 0 { throw NSError(domain: "socketpair", code: Int(errno)) }
        return (fds[0], fds[1])
    }

    private func writeAll(_ data: Data, to fd: Int32) {
        _ = data.withUnsafeBytes { raw in
            write(fd, raw.baseAddress, raw.count)
        }
    }

    private func readLine(from fd: Int32) -> String {
        var collected = Data()
        var byte: UInt8 = 0

        while true {
            let n = read(fd, &byte, 1)
            if n <= 0 { break }
            collected.append(&byte, count: 1)
            if byte == UInt8(ascii: "\n") { break }
        }

        return String(data: collected, encoding: .utf8) ?? ""
    }

    func testReadRequestWithCapReadsWholeLine() throws {
        let (a, b) = try makeSocketPair()
        defer { close(a); close(b) }

        let payload = "{\"cmd\":\"ping\"}\n".data(using: .utf8)!
        _ = payload.withUnsafeBytes { raw in
            write(b, raw.baseAddress, raw.count)
        }
        close(b)

        let result = readRequestWithCap(fd: a, maxBytes: 1024)
        guard case .ok(let buf) = result else {
            XCTFail("expected .ok, got \(result)"); return
        }
        XCTAssertEqual(String(data: buf, encoding: .utf8), "{\"cmd\":\"ping\"}\n")
    }

    func testReadRequestWithCapRejectsOversize() throws {
        let (a, b) = try makeSocketPair()
        defer { close(a); close(b) }

        // 5000 bytes, no newline — helper should stop before running out of memory.
        let payload = Data(repeating: UInt8(ascii: "x"), count: 5000)
        _ = payload.withUnsafeBytes { raw in
            write(b, raw.baseAddress, raw.count)
        }
        close(b)

        let result = readRequestWithCap(fd: a, maxBytes: 1024)
        XCTAssertEqual(result, .oversized)
    }

    func testReadRequestWithCapTimesOutWhenPeerStalls() throws {
        let (a, b) = try makeSocketPair()
        defer { close(a); close(b) }

        // Install a very short SO_RCVTIMEO so the test completes quickly.
        var timeout = timeval(tv_sec: 0, tv_usec: 100_000)
        _ = setsockopt(a, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))

        // Intentionally never write from `b`: we rely on the timeout to unblock.
        let start = Date()
        let result = readRequestWithCap(fd: a, maxBytes: 1024)
        let elapsed = Date().timeIntervalSince(start)

        XCTAssertLessThan(elapsed, 2.0, "recv should have unblocked well under 2s, took \(elapsed)")
        XCTAssertEqual(result, .timedOut)
    }

    // MARK: - dispatchRequest

    func testDispatchPing() {
        let buf = "{\"cmd\":\"ping\"}".data(using: .utf8)!
        XCTAssertEqual(dispatchRequest(buffer: buf, manager: manager), .pong)
    }

    func testDispatchRejectsInvalidJSON() {
        let buf = "not json".data(using: .utf8)!
        XCTAssertEqual(dispatchRequest(buffer: buf, manager: manager), .error("Invalid JSON"))
    }

    func testDispatchRejectsUnknownCommand() {
        let buf = "{\"cmd\":\"rm -rf\"}".data(using: .utf8)!
        if case .error(let msg) = dispatchRequest(buffer: buf, manager: manager) {
            XCTAssertTrue(msg.contains("Unknown command"))
        } else {
            XCTFail("expected error")
        }
    }

    func testDispatchRejectsInjectedDomain() {
        // Classic /etc/hosts newline-smuggling attempt.
        let payload: [String: Any] = [
            "cmd": "write_block",
            "domains": ["reddit.com\n0.0.0.0 bank.com"],
            "sessionId": "sid",
        ]
        let buf = try! JSONSerialization.data(withJSONObject: payload)
        if case .error(let msg) = dispatchRequest(buffer: buf, manager: manager) {
            XCTAssertFalse(msg.isEmpty)
        } else {
            XCTFail("expected error on injected domain")
        }
        // /etc/hosts surrogate must remain untouched.
        let content = (try? String(contentsOf: hostsURL, encoding: .utf8)) ?? ""
        XCTAssertFalse(content.contains("bank.com"))
    }

    func testDispatchRejectsInvalidSessionId() {
        let payload: [String: Any] = [
            "cmd": "write_block",
            "domains": ["reddit.com"],
            "sessionId": "abc\ndef",
        ]
        let buf = try! JSONSerialization.data(withJSONObject: payload)
        XCTAssertEqual(
            dispatchRequest(buffer: buf, manager: manager),
            .error("Invalid sessionId")
        )
    }

    func testDispatchWriteBlockSuccess() throws {
        let payload: [String: Any] = [
            "cmd": "write_block",
            "domains": ["reddit.com"],
            "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        ]
        let buf = try JSONSerialization.data(withJSONObject: payload)
        XCTAssertEqual(dispatchRequest(buffer: buf, manager: manager), .ok)

        let content = try String(contentsOf: hostsURL, encoding: .utf8)
        XCTAssertTrue(content.contains("127.0.0.1 reddit.com"))
    }

    func testDispatchRemoveBlockSuccess() throws {
        // Seed a block first.
        try manager.writeBlock(domains: ["reddit.com"])

        let payload: [String: Any] = [
            "cmd": "remove_block",
            "sessionId": "550e8400-e29b-41d4-a716-446655440000",
        ]
        let buf = try JSONSerialization.data(withJSONObject: payload)
        XCTAssertEqual(dispatchRequest(buffer: buf, manager: manager), .ok)

        let content = try String(contentsOf: hostsURL, encoding: .utf8)
        XCTAssertFalse(content.contains("# Latch block"))
    }

    // MARK: - handleClientConnection

    func testHandleClientConnectionReturnsPongOverSocket() throws {
        let (serverFd, clientFd) = try makeSocketPair()
        defer { close(clientFd) }

        let payload = "{\"cmd\":\"ping\"}\n".data(using: .utf8)!
        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            handleClientConnection(
                clientFd: serverFd,
                manager: self.manager,
                maxRequestBytes: 1024,
                recvTimeout: timeval(tv_sec: 1, tv_usec: 0)
            )
            group.leave()
        }

        writeAll(payload, to: clientFd)
        let response = readLine(from: clientFd)
        XCTAssertEqual(group.wait(timeout: .now() + 2), .success)

        XCTAssertEqual(response, "{\"pong\":true}\n")
    }

    func testHandleClientConnectionRejectsMalformedJSONOverSocket() throws {
        let (serverFd, clientFd) = try makeSocketPair()
        defer { close(clientFd) }

        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            handleClientConnection(
                clientFd: serverFd,
                manager: self.manager,
                maxRequestBytes: 1024,
                recvTimeout: timeval(tv_sec: 1, tv_usec: 0)
            )
            group.leave()
        }

        writeAll("not-json\n".data(using: .utf8)!, to: clientFd)
        let response = readLine(from: clientFd)
        XCTAssertEqual(group.wait(timeout: .now() + 2), .success)

        XCTAssertEqual(response, "{\"ok\":false,\"error\":\"Invalid JSON\"}\n")
    }

    func testHandleClientConnectionRejectsOversizedRequestOverSocket() throws {
        let (serverFd, clientFd) = try makeSocketPair()
        defer { close(clientFd) }

        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            handleClientConnection(
                clientFd: serverFd,
                manager: self.manager,
                maxRequestBytes: 32,
                recvTimeout: timeval(tv_sec: 1, tv_usec: 0)
            )
            group.leave()
        }

        writeAll(Data(repeating: UInt8(ascii: "x"), count: 64), to: clientFd)
        let response = readLine(from: clientFd)
        XCTAssertEqual(group.wait(timeout: .now() + 2), .success)

        XCTAssertEqual(response, "{\"ok\":false,\"error\":\"Request exceeds 32 bytes\"}\n")
    }

    func testHandleClientConnectionRejectsTimedOutPartialRequestOverSocket() throws {
        let (serverFd, clientFd) = try makeSocketPair()
        defer { close(clientFd) }

        let group = DispatchGroup()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            handleClientConnection(
                clientFd: serverFd,
                manager: self.manager,
                maxRequestBytes: 1024,
                recvTimeout: timeval(tv_sec: 0, tv_usec: 100_000)
            )
            group.leave()
        }

        writeAll("{\"cmd\":\"ping\"".data(using: .utf8)!, to: clientFd)
        let response = readLine(from: clientFd)
        XCTAssertEqual(group.wait(timeout: .now() + 2), .success)

        XCTAssertEqual(response, "{\"ok\":false,\"error\":\"Request receive timed out\"}\n")
    }
}
