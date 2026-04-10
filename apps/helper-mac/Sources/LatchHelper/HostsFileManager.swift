import Foundation
import Darwin

let blockStart = "# Latch block start"
let blockEnd = "# Latch block end"

struct HostsFileManager {
    let hostsURL: URL
    let fileManager: FileManager

    init(hostsURL: URL, fileManager: FileManager = .default) {
        self.hostsURL = hostsURL
        self.fileManager = fileManager
    }

    func readHosts() throws -> String {
        try String(contentsOf: hostsURL, encoding: .utf8)
    }

    func writeBlock(domains: [String]) throws {
        var content = try readHosts()
        content = removeLatchBlock(from: content)
        if !content.hasSuffix("\n") { content += "\n" }
        content += "\n\(blockStart)\n"
        for domain in domains {
            let bare = domain.lowercased()
            content += "127.0.0.1 \(bare)\n"
            if !bare.hasPrefix("www.") {
                content += "127.0.0.1 www.\(bare)\n"
            }
        }
        content += "\(blockEnd)\n"
        try writeHostsAtomic(content)
    }

    func removeBlock() throws {
        var content = try readHosts()
        content = removeLatchBlock(from: content)
        if !content.hasSuffix("\n") { content += "\n" }
        try writeHostsAtomic(content)
    }

    func removeLatchBlock(from content: String) -> String {
        let lines = content.components(separatedBy: "\n")
        var inBlock = false
        var result: [String] = []
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces) == blockStart {
                inBlock = true
                continue
            }
            if line.trimmingCharacters(in: .whitespaces) == blockEnd {
                inBlock = false
                continue
            }
            if !inBlock {
                result.append(line)
            }
        }
        while result.last == "" && result.dropLast().last == "" {
            result.removeLast()
        }
        return result.joined(separator: "\n")
    }

    private func writeHostsAtomic(_ content: String) throws {
        let tempURL = hostsURL.deletingLastPathComponent()
            .appendingPathComponent(hostsURL.lastPathComponent + ".latch.tmp")

        let preservedAttributes = try preservedFileAttributes()

        try content.write(to: tempURL, atomically: false, encoding: .utf8)
        try applyAttributes(preservedAttributes, to: tempURL)

        let fd = open(tempURL.path, O_RDWR)
        if fd >= 0 {
            fsync(fd)
            close(fd)
        }

        _ = try fileManager.replaceItemAt(hostsURL, withItemAt: tempURL)
        try applyAttributes(preservedAttributes, to: hostsURL)
    }

    private func preservedFileAttributes() throws -> [FileAttributeKey: Any] {
        let attributes = try fileManager.attributesOfItem(atPath: hostsURL.path)
        var preserved: [FileAttributeKey: Any] = [:]

        if let owner = attributes[.ownerAccountID] {
            preserved[.ownerAccountID] = owner
        }
        if let group = attributes[.groupOwnerAccountID] {
            preserved[.groupOwnerAccountID] = group
        }
        if let permissions = attributes[.posixPermissions] {
            preserved[.posixPermissions] = permissions
        }

        return preserved
    }

    private func applyAttributes(_ attributes: [FileAttributeKey: Any], to url: URL) throws {
        guard !attributes.isEmpty else { return }
        try fileManager.setAttributes(attributes, ofItemAtPath: url.path)
    }
}
