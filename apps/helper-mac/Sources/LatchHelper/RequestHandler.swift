import Foundation
import Darwin

// Pure request handling extracted from main.swift so the read-side hardening
// (size cap + recv timeout) and the dispatch-side validation can both be
// exercised by unit and integration tests without binding to /var/run/latch.sock.

// MARK: - Protocol structs

struct WriteBlockCommand: Codable {
    let cmd: String
    let domains: [String]
    let sessionId: String
}

struct RemoveBlockCommand: Codable {
    let cmd: String
    let sessionId: String
}

struct PingCommand: Codable {
    let cmd: String
}

struct CommandEnvelope: Codable {
    let cmd: String
}

struct OkResponse: Codable {
    let ok: Bool
}

struct PongResponse: Codable {
    let pong: Bool
}

struct ErrorResponse: Codable {
    let ok: Bool
    let error: String
}

// MARK: - Read-side hardening

enum ReadRequestResult: Equatable {
    case ok(Data)
    case oversized
    case empty
    case closed
    case timedOut
}

/// Read a newline-terminated JSON request off `fd`, capping the accumulated
/// bytes at `maxBytes`. The caller is responsible for applying an
/// SO_RCVTIMEO so a stalled peer cannot block this function indefinitely.
///
/// Returning `.oversized` means the client exceeded the cap before sending a
/// newline; callers should respond with a controlled error instead of
/// attempting to decode.
func readRequestWithCap(fd: Int32, maxBytes: Int) -> ReadRequestResult {
    var buffer = Data()
    let chunkSize = 4096
    let chunk = UnsafeMutablePointer<UInt8>.allocate(capacity: chunkSize)
    defer { chunk.deallocate() }

    while true {
        errno = 0
        let n = read(fd, chunk, chunkSize)
        if n == 0 { break }
        if n < 0 {
            if errno == EAGAIN || errno == EWOULDBLOCK || errno == ETIMEDOUT {
                return .timedOut
            }
            return buffer.isEmpty ? .closed : .ok(buffer)
        }
        if buffer.count + n > maxBytes {
            return .oversized
        }
        buffer.append(chunk, count: n)
        if buffer.contains(UInt8(ascii: "\n")) { break }
    }

    if buffer.isEmpty { return .empty }
    return .ok(buffer)
}

// MARK: - Dispatch

enum DispatchResult: Equatable {
    case ok
    case error(String)
    case pong
    case silent
}

func sendJSON<T: Encodable>(fd: Int32, value: T) {
    if let data = try? JSONEncoder().encode(value),
       var str = String(data: data, encoding: .utf8) {
        str += "\n"
        str.withCString { ptr in
            _ = write(fd, ptr, strlen(ptr))
        }
    }
}

/// Decode a JSON command buffer and dispatch it through `manager`.
/// Mirrors the switch in `handleClient` but returns a structured result so
/// tests can assert on the outcome without inspecting the written socket.
func dispatchRequest(buffer: Data, manager: HostsFileManager) -> DispatchResult {
    guard let envelope = try? JSONDecoder().decode(CommandEnvelope.self, from: buffer) else {
        return .error("Invalid JSON")
    }

    switch envelope.cmd {
    case "ping":
        return .pong

    case "write_block":
        guard let cmd = try? JSONDecoder().decode(WriteBlockCommand.self, from: buffer) else {
            return .error("Invalid write_block payload")
        }
        guard DomainValidator.isValidSessionId(cmd.sessionId) else {
            return .error("Invalid sessionId")
        }
        let normalized: [String]
        switch DomainValidator.validateBatch(cmd.domains) {
        case .success(let list):
            normalized = list
        case .failure(let err):
            return .error(err)
        }
        do {
            try manager.writeBlock(domains: normalized)
            return .ok
        } catch {
            return .error(error.localizedDescription)
        }

    case "remove_block":
        guard let cmd = try? JSONDecoder().decode(RemoveBlockCommand.self, from: buffer) else {
            return .error("Invalid remove_block payload")
        }
        guard DomainValidator.isValidSessionId(cmd.sessionId) else {
            return .error("Invalid sessionId")
        }
        do {
            try manager.removeBlock()
            return .ok
        } catch {
            return .error(error.localizedDescription)
        }

    default:
        return .error("Unknown command: \(envelope.cmd)")
    }
}

/// Install a receive timeout on a client fd so the single-threaded accept
/// loop cannot be pinned on a partial read.
func applyRecvTimeout(fd: Int32, timeout: timeval) {
    var timeout = timeout
    _ = setsockopt(
        fd,
        SOL_SOCKET,
        SO_RCVTIMEO,
        &timeout,
        socklen_t(MemoryLayout<timeval>.size)
    )
}

func handleClientConnection(
    clientFd: Int32,
    manager: HostsFileManager,
    maxRequestBytes: Int,
    recvTimeout: timeval
) {
    defer { close(clientFd) }

    applyRecvTimeout(fd: clientFd, timeout: recvTimeout)

    switch readRequestWithCap(fd: clientFd, maxBytes: maxRequestBytes) {
    case .empty, .closed:
        return
    case .oversized:
        sendJSON(fd: clientFd, value: ErrorResponse(ok: false, error: "Request exceeds \(maxRequestBytes) bytes"))
        return
    case .timedOut:
        sendJSON(fd: clientFd, value: ErrorResponse(ok: false, error: "Request receive timed out"))
        return
    case .ok(let buffer):
        switch dispatchRequest(buffer: buffer, manager: manager) {
        case .ok:
            sendJSON(fd: clientFd, value: OkResponse(ok: true))
        case .pong:
            sendJSON(fd: clientFd, value: PongResponse(pong: true))
        case .error(let msg):
            sendJSON(fd: clientFd, value: ErrorResponse(ok: false, error: msg))
        case .silent:
            return
        }
    }
}
