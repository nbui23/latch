import XCTest
@testable import LatchHelper

final class DomainValidatorTests: XCTestCase {
    // MARK: - Valid inputs

    func testAcceptsSimpleDomain() {
        let r = DomainValidator.validate("reddit.com")
        XCTAssertTrue(r.valid)
        XCTAssertEqual(r.normalized, "reddit.com")
    }

    func testLowercasesInput() {
        let r = DomainValidator.validate("Reddit.COM")
        XCTAssertTrue(r.valid)
        XCTAssertEqual(r.normalized, "reddit.com")
    }

    func testAcceptsSubdomain() {
        XCTAssertTrue(DomainValidator.validate("news.ycombinator.com").valid)
    }

    func testAcceptsTwoPartTLD() {
        XCTAssertTrue(DomainValidator.validate("example.co.uk").valid)
    }

    func testAcceptsHyphens() {
        XCTAssertTrue(DomainValidator.validate("my-site.com").valid)
    }

    // MARK: - Injection attacks (the bugs this fix exists to close)

    func testRejectsEmbeddedNewline() {
        let r = DomainValidator.validate("reddit.com\n0.0.0.0 bank.com")
        XCTAssertFalse(r.valid)
    }

    func testRejectsEmbeddedCarriageReturn() {
        XCTAssertFalse(DomainValidator.validate("reddit.com\r\nbank.com").valid)
    }

    func testRejectsEmbeddedTab() {
        XCTAssertFalse(DomainValidator.validate("reddit.com\t127.0.0.1").valid)
    }

    func testRejectsEmbeddedSpace() {
        XCTAssertFalse(DomainValidator.validate("reddit.com bank.com").valid)
    }

    func testRejectsNullByte() {
        XCTAssertFalse(DomainValidator.validate("reddit.com\u{0}").valid)
    }

    func testRejectsPortSuffix() {
        XCTAssertFalse(DomainValidator.validate("example.com:8080").valid)
    }

    func testRejectsScheme() {
        XCTAssertFalse(DomainValidator.validate("https://example.com").valid)
    }

    func testRejectsPath() {
        XCTAssertFalse(DomainValidator.validate("example.com/malicious").valid)
    }

    func testRejectsCredentials() {
        XCTAssertFalse(DomainValidator.validate("user@example.com").valid)
    }

    func testRejectsBackslash() {
        XCTAssertFalse(DomainValidator.validate("example.com\\x").valid)
    }

    // MARK: - Reserved addresses

    func testRejectsLocalhost() {
        XCTAssertFalse(DomainValidator.validate("localhost").valid)
    }

    func testRejectsLoopbackIPv4() {
        XCTAssertFalse(DomainValidator.validate("127.0.0.1").valid)
    }

    func testRejectsZeroAddress() {
        XCTAssertFalse(DomainValidator.validate("0.0.0.0").valid)
    }

    func testRejectsIPv6Loopback() {
        XCTAssertFalse(DomainValidator.validate("::1").valid)
    }

    func testRejectsPrivateRange10() {
        XCTAssertFalse(DomainValidator.validate("10.0.0.1").valid)
    }

    func testRejectsPrivateRange192() {
        XCTAssertFalse(DomainValidator.validate("192.168.1.1").valid)
    }

    func testRejectsPrivateRange172() {
        XCTAssertFalse(DomainValidator.validate("172.16.0.1").valid)
    }

    // MARK: - Format checks

    func testRejectsEmpty() {
        XCTAssertFalse(DomainValidator.validate("").valid)
    }

    func testRejectsWhitespaceOnly() {
        XCTAssertFalse(DomainValidator.validate("   ").valid)
    }

    func testRejectsMissingTLD() {
        XCTAssertFalse(DomainValidator.validate("reddit").valid)
    }

    func testRejectsWildcard() {
        XCTAssertFalse(DomainValidator.validate("*.reddit.com").valid)
    }

    func testRejectsUnderscore() {
        XCTAssertFalse(DomainValidator.validate("red_dit.com").valid)
    }

    func testRejectsLeadingHyphen() {
        XCTAssertFalse(DomainValidator.validate("-example.com").valid)
    }

    func testRejectsTrailingHyphen() {
        XCTAssertFalse(DomainValidator.validate("example.com-").valid)
    }

    func testRejectsOverlongDomain() {
        let long = String(repeating: "a", count: 254) + ".com"
        XCTAssertFalse(DomainValidator.validate(long).valid)
    }

    // MARK: - Session id

    func testSessionIdAcceptsUUIDLike() {
        XCTAssertTrue(DomainValidator.isValidSessionId("550e8400-e29b-41d4-a716-446655440000"))
    }

    func testSessionIdRejectsEmpty() {
        XCTAssertFalse(DomainValidator.isValidSessionId(""))
    }

    func testSessionIdRejectsNewline() {
        XCTAssertFalse(DomainValidator.isValidSessionId("abc\ndef"))
    }

    func testSessionIdRejectsControl() {
        XCTAssertFalse(DomainValidator.isValidSessionId("abc\u{0}def"))
    }

    func testSessionIdRejectsTooLong() {
        XCTAssertFalse(DomainValidator.isValidSessionId(String(repeating: "a", count: 129)))
    }

    // MARK: - Batch

    func testBatchRejectsIfAnyDomainInvalid() {
        let result = DomainValidator.validateBatch(["reddit.com", "127.0.0.1"])
        if case .failure = result { /* ok */ } else { XCTFail("expected failure") }
    }

    func testBatchRejectsEmbeddedNewlineSmuggling() {
        // Classic injection: attacker tries to slip a second hosts line past the helper.
        let result = DomainValidator.validateBatch(["reddit.com\n0.0.0.0 bank.com"])
        if case .failure = result { /* ok */ } else { XCTFail("expected failure") }
    }

    func testBatchNormalizesOnSuccess() {
        let result = DomainValidator.validateBatch(["Reddit.COM", "twitter.com"])
        guard case .success(let list) = result else {
            XCTFail("expected success"); return
        }
        XCTAssertEqual(list, ["reddit.com", "twitter.com"])
    }

    func testBatchRejectsOversizeCount() {
        let many = Array(repeating: "example.com", count: 5001)
        let result = DomainValidator.validateBatch(many)
        if case .failure = result { /* ok */ } else { XCTFail("expected failure") }
    }
}
