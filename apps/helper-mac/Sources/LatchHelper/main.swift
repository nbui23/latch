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

// A well-formed command is well under 256 KiB (5000 domains * ~50 bytes each
// is ~250 KiB at the helper's own domain-count cap). Reject any larger
// accumulated payload before it can pressure the helper's memory.
let maxRequestBytes: Int = 512 * 1024

// Bound the total time a client may hold the helper on a partial read.
// Without this a malicious client that never sends a newline would pin the
// single-threaded accept loop forever.
let recvTimeoutSeconds: time_t = 5

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
    handleClientConnection(
        clientFd: clientFd,
        manager: hostsFileManager,
        maxRequestBytes: maxRequestBytes,
        recvTimeout: timeval(tv_sec: recvTimeoutSeconds, tv_usec: 0)
    )
}
