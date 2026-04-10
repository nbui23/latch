import Foundation
import Darwin

// MARK: - Latch macOS Privileged Helper
// Runs as root via LaunchDaemon.
// Listens on Unix domain socket /var/run/latch.sock
// Accepts JSON commands: write_block, remove_block, ping

let socketPath = "/var/run/latch.sock"
let hostsPath = "/etc/hosts"
let socketGroupName = "staff"
let socketMode: mode_t = 0o660
let hostsFileManager = HostsFileManager(hostsURL: URL(fileURLWithPath: hostsPath))

// MARK: - Command types

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

// MARK: - Handle a single client connection

func handleClient(_ clientFd: Int32) {
    defer { close(clientFd) }
    var buffer = Data()
    let chunk = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
    defer { chunk.deallocate() }

    // Read until newline (JSON is newline-delimited)
    outer: while true {
        let n = read(clientFd, chunk, 4096)
        if n <= 0 { break }
        buffer.append(chunk, count: n)
        if buffer.contains(UInt8(ascii: "\n")) { break }
    }

    guard !buffer.isEmpty else { return }

    func sendJSON<T: Encodable>(_ value: T) {
        if let data = try? JSONEncoder().encode(value),
           var str = String(data: data, encoding: .utf8) {
            str += "\n"
            str.withCString { ptr in
                _ = write(clientFd, ptr, strlen(ptr))
            }
        }
    }

    // Decode envelope to get command type
    guard let envelope = try? JSONDecoder().decode(CommandEnvelope.self, from: buffer) else {
        sendJSON(ErrorResponse(ok: false, error: "Invalid JSON"))
        return
    }

    switch envelope.cmd {
    case "ping":
        sendJSON(PongResponse(pong: true))

    case "write_block":
        guard let cmd = try? JSONDecoder().decode(WriteBlockCommand.self, from: buffer) else {
            sendJSON(ErrorResponse(ok: false, error: "Invalid write_block payload"))
            return
        }
        do {
            try hostsFileManager.writeBlock(domains: cmd.domains)
            sendJSON(OkResponse(ok: true))
        } catch {
            sendJSON(ErrorResponse(ok: false, error: error.localizedDescription))
        }

    case "remove_block":
        do {
            try hostsFileManager.removeBlock()
            sendJSON(OkResponse(ok: true))
        } catch {
            sendJSON(ErrorResponse(ok: false, error: error.localizedDescription))
        }

    default:
        sendJSON(ErrorResponse(ok: false, error: "Unknown command: \(envelope.cmd)"))
    }
}

// MARK: - Main server loop

func configureSocketPermissions(at path: String) {
    guard let group = getgrnam(socketGroupName) else {
        unlink(path)
        fputs("Failed to resolve group '\(socketGroupName)'\n", stderr)
        exit(1)
    }

    guard chown(path, 0, group.pointee.gr_gid) == 0 else {
        unlink(path)
        fputs("Failed to set socket ownership: \(String(cString: strerror(errno)))\n", stderr)
        exit(1)
    }

    guard chmod(path, socketMode) == 0 else {
        unlink(path)
        fputs("Failed to set socket permissions: \(String(cString: strerror(errno)))\n", stderr)
        exit(1)
    }
}

// Remove stale socket if exists
unlink(socketPath)

let serverFd = socket(AF_UNIX, SOCK_STREAM, 0)
guard serverFd >= 0 else {
    fputs("Failed to create socket\n", stderr)
    exit(1)
}

var addr = sockaddr_un()
addr.sun_family = sa_family_t(AF_UNIX)
socketPath.withCString { ptr in
    withUnsafeMutablePointer(to: &addr.sun_path) { dst in
        _ = strncpy(UnsafeMutableRawPointer(dst).assumingMemoryBound(to: CChar.self), ptr, 104)
    }
}
let addrLen = socklen_t(MemoryLayout<sockaddr_un>.size)

// Bind and listen first, then relax the socket file to root:staff 0660 so the desktop app can connect.
let bindResult = withUnsafePointer(to: &addr) {
    $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(serverFd, $0, addrLen)
    }
}
guard bindResult == 0 else {
    fputs("Failed to bind socket: \(String(cString: strerror(errno)))\n", stderr)
    exit(1)
}

guard listen(serverFd, 10) == 0 else {
    fputs("Failed to listen\n", stderr)
    exit(1)
}

configureSocketPermissions(at: socketPath)

fputs("Latch helper listening on \(socketPath)\n", stderr)

// Accept connections in a loop (single-threaded — hosts writes are fast)
while true {
    var clientAddr = sockaddr_un()
    var clientLen = addrLen
    let clientFd = withUnsafeMutablePointer(to: &clientAddr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            accept(serverFd, $0, &clientLen)
        }
    }
    guard clientFd >= 0 else { continue }
    handleClient(clientFd)
}
