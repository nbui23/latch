import Foundation

// Server-side domain validator for the privileged helper.
// Mirrors the Electron-side validator so the helper never trusts
// client input when writing to /etc/hosts.

public struct DomainValidationResult {
    public let valid: Bool
    public let normalized: String?
    public let error: String?
}

public enum DomainValidator {
    static let reservedExact: Set<String> = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "::",
        "ip6-localhost",
        "ip6-loopback",
    ]

    static let privatePrefixes: [String] = [
        "10.",
        "192.168.",
        "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.",
        "172.24.", "172.25.", "172.26.", "172.27.",
        "172.28.", "172.29.", "172.30.", "172.31.",
    ]

    static let maxDomainLength = 253
    static let maxDomainCount = 5000
    static let maxSessionIdLength = 128

    public static func validate(_ input: String) -> DomainValidationResult {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .init(valid: false, normalized: nil, error: "Domain cannot be empty")
        }

        // Reject whitespace or control chars anywhere in the value — the primary
        // injection vector into /etc/hosts is embedded newlines or spaces.
        for scalar in trimmed.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                return .init(valid: false, normalized: nil, error: "Domain cannot contain whitespace")
            }
            if CharacterSet.controlCharacters.contains(scalar) {
                return .init(valid: false, normalized: nil, error: "Domain cannot contain control characters")
            }
        }

        let domain = trimmed.lowercased()

        if domain.count > maxDomainLength {
            return .init(valid: false, normalized: nil, error: "Domain exceeds \(maxDomainLength) characters")
        }

        // Helper only accepts bare hostnames. Reject schemes, paths, ports,
        // wildcards, credentials — the Electron-side validator strips these
        // already; block them here defensively.
        let disallowed: Set<Character> = [":", "/", "*", "?", "#", "@", "\\"]
        for ch in domain {
            if disallowed.contains(ch) {
                return .init(valid: false, normalized: nil, error: "Domain contains disallowed character '\(ch)'")
            }
        }

        if reservedExact.contains(domain) {
            return .init(valid: false, normalized: nil, error: "This address cannot be blocked")
        }

        for prefix in privatePrefixes {
            if domain.hasPrefix(prefix) {
                return .init(valid: false, normalized: nil, error: "This address cannot be blocked")
            }
        }

        if !matchesFormat(domain) {
            return .init(valid: false, normalized: nil, error: "Invalid domain format")
        }

        if !domain.contains(".") {
            return .init(valid: false, normalized: nil, error: "Domain must include a TLD")
        }

        return .init(valid: true, normalized: domain, error: nil)
    }

    // ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$
    private static func matchesFormat(_ s: String) -> Bool {
        let allowed: Set<Character> = Set("abcdefghijklmnopqrstuvwxyz0123456789.-")
        let alnum: Set<Character> = Set("abcdefghijklmnopqrstuvwxyz0123456789")
        guard let first = s.first, let last = s.last else { return false }
        if !alnum.contains(first) || !alnum.contains(last) { return false }
        for ch in s where !allowed.contains(ch) { return false }
        return true
    }

    // sessionId must be safe to log and not embed newlines/control chars.
    // Does not require a strict UUID format — the helper only needs safety.
    public static func isValidSessionId(_ id: String) -> Bool {
        if id.isEmpty || id.count > maxSessionIdLength { return false }
        for scalar in id.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) { return false }
            if CharacterSet.controlCharacters.contains(scalar) { return false }
        }
        return true
    }

    public enum BatchResult {
        case success([String])
        case failure(String)
    }

    // Validate and normalize a batch of domains. Returns an error string if
    // any domain fails or the count cap is exceeded.
    public static func validateBatch(_ domains: [String]) -> BatchResult {
        if domains.count > maxDomainCount {
            return .failure("Too many domains (max \(maxDomainCount))")
        }
        var normalized: [String] = []
        normalized.reserveCapacity(domains.count)
        for d in domains {
            let r = validate(d)
            guard r.valid, let n = r.normalized else {
                return .failure(r.error ?? "Invalid domain")
            }
            normalized.append(n)
        }
        return .success(normalized)
    }
}
