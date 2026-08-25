import Testing
@testable import LatchHelper

@Suite struct DomainValidatorTests {
    // MARK: - Valid inputs

    @Test func acceptsSimpleDomain() {
        let r = DomainValidator.validate("reddit.com")
        #expect(r.valid)
        #expect(r.normalized == "reddit.com")
    }

    @Test func lowercasesInput() {
        let r = DomainValidator.validate("Reddit.COM")
        #expect(r.valid)
        #expect(r.normalized == "reddit.com")
    }

    @Test func acceptsSubdomain() {
        #expect(DomainValidator.validate("news.ycombinator.com").valid)
    }

    @Test func acceptsTwoPartTLD() {
        #expect(DomainValidator.validate("example.co.uk").valid)
    }

    @Test func acceptsHyphens() {
        #expect(DomainValidator.validate("my-site.com").valid)
    }

    // MARK: - Injection attacks (the bugs this fix exists to close)

    @Test func rejectsEmbeddedNewline() {
        let r = DomainValidator.validate("reddit.com\n0.0.0.0 bank.com")
        #expect(!r.valid)
    }

    @Test func rejectsEmbeddedCarriageReturn() {
        #expect(!DomainValidator.validate("reddit.com\r\nbank.com").valid)
    }

    @Test func rejectsEmbeddedTab() {
        #expect(!DomainValidator.validate("reddit.com\t127.0.0.1").valid)
    }

    @Test func rejectsEmbeddedSpace() {
        #expect(!DomainValidator.validate("reddit.com bank.com").valid)
    }

    @Test func rejectsNullByte() {
        #expect(!DomainValidator.validate("reddit.com\u{0}").valid)
    }

    @Test func rejectsPortSuffix() {
        #expect(!DomainValidator.validate("example.com:8080").valid)
    }

    @Test func rejectsScheme() {
        #expect(!DomainValidator.validate("https://example.com").valid)
    }

    @Test func rejectsPath() {
        #expect(!DomainValidator.validate("example.com/malicious").valid)
    }

    @Test func rejectsCredentials() {
        #expect(!DomainValidator.validate("user@example.com").valid)
    }

    @Test func rejectsBackslash() {
        #expect(!DomainValidator.validate("example.com\\x").valid)
    }

    // MARK: - Reserved addresses

    @Test func rejectsLocalhost() {
        #expect(!DomainValidator.validate("localhost").valid)
    }

    @Test func rejectsLoopbackIPv4() {
        #expect(!DomainValidator.validate("127.0.0.1").valid)
    }

    @Test func rejectsZeroAddress() {
        #expect(!DomainValidator.validate("0.0.0.0").valid)
    }

    @Test func rejectsIPv6Loopback() {
        #expect(!DomainValidator.validate("::1").valid)
    }

    @Test func rejectsPrivateRange10() {
        #expect(!DomainValidator.validate("10.0.0.1").valid)
    }

    @Test func rejectsPrivateRange192() {
        #expect(!DomainValidator.validate("192.168.1.1").valid)
    }

    @Test func rejectsPrivateRange172() {
        #expect(!DomainValidator.validate("172.16.0.1").valid)
    }

    // MARK: - Format checks

    @Test func rejectsEmpty() {
        #expect(!DomainValidator.validate("").valid)
    }

    @Test func rejectsWhitespaceOnly() {
        #expect(!DomainValidator.validate("   ").valid)
    }

    @Test func rejectsMissingTLD() {
        #expect(!DomainValidator.validate("reddit").valid)
    }

    @Test func rejectsWildcard() {
        #expect(!DomainValidator.validate("*.reddit.com").valid)
    }

    @Test func rejectsUnderscore() {
        #expect(!DomainValidator.validate("red_dit.com").valid)
    }

    @Test func rejectsLeadingHyphen() {
        #expect(!DomainValidator.validate("-example.com").valid)
    }

    @Test func rejectsTrailingHyphen() {
        #expect(!DomainValidator.validate("example.com-").valid)
    }

    @Test func rejectsOverlongDomain() {
        let long = String(repeating: "a", count: 254) + ".com"
        #expect(!DomainValidator.validate(long).valid)
    }

    // MARK: - Session id

    @Test func sessionIdAcceptsUUIDLike() {
        #expect(DomainValidator.isValidSessionId("550e8400-e29b-41d4-a716-446655440000"))
    }

    @Test func sessionIdRejectsEmpty() {
        #expect(!DomainValidator.isValidSessionId(""))
    }

    @Test func sessionIdRejectsNewline() {
        #expect(!DomainValidator.isValidSessionId("abc\ndef"))
    }

    @Test func sessionIdRejectsControl() {
        #expect(!DomainValidator.isValidSessionId("abc\u{0}def"))
    }

    @Test func sessionIdRejectsTooLong() {
        #expect(!DomainValidator.isValidSessionId(String(repeating: "a", count: 129)))
    }

    // MARK: - Batch

    @Test func batchRejectsIfAnyDomainInvalid() {
        let result = DomainValidator.validateBatch(["reddit.com", "127.0.0.1"])
        if case .failure = result { /* ok */ } else { Issue.record("expected failure") }
    }

    @Test func batchRejectsEmbeddedNewlineSmuggling() {
        // Classic injection: attacker tries to slip a second hosts line past the helper.
        let result = DomainValidator.validateBatch(["reddit.com\n0.0.0.0 bank.com"])
        if case .failure = result { /* ok */ } else { Issue.record("expected failure") }
    }

    @Test func batchNormalizesOnSuccess() {
        let result = DomainValidator.validateBatch(["Reddit.COM", "twitter.com"])
        guard case .success(let list) = result else {
            Issue.record("expected success"); return
        }
        #expect(list == ["reddit.com", "twitter.com"])
    }

    @Test func batchRejectsOversizeCount() {
        let many = Array(repeating: "example.com", count: 5001)
        let result = DomainValidator.validateBatch(many)
        if case .failure = result { /* ok */ } else { Issue.record("expected failure") }
    }
}
