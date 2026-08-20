import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.3 bugfix — permanent structural source-audit tests for the
/// European-decimal-comma fix: `src/utils/amount-input.ts`
/// (`normalizeEthAmountDecimalSeparator`) and its one call site in
/// `src/app/send.tsx`.
///
/// Same bounded, structural methodology as this project's other source
/// audits. Runtime/numeric correctness (exact wei values through the full
/// normalize -> strict-parse pipeline) was verified via a temporary
/// executable Node scratch script during this stage's implementation,
/// against the real, unmodified production source, then deleted per this
/// project's established methodology — that gap is deliberately accepted
/// and documented here, not hidden.
final class WalletEthAmountInputNormalizationSourceAuditTests: XCTestCase {
    // MARK: - The normalizer itself: narrow, string-only, single-swap

    func testNormalizerOnlySwapsExactlyOneCommaWithNoDotPresent() throws {
        let body = try normalizeFunctionBody()
        XCTAssertTrue(body.contains("commaCount === 1 && !input.includes('.')"),
                      "must only transform when there is exactly one comma AND no dot already present")
        XCTAssertTrue(body.contains("input.replace(',', '.')"))
        // Every other shape must fall through unchanged — the strict domain
        // parser is what ultimately rejects it, not this function.
        XCTAssertTrue(body.contains("return input;"))
    }

    func testNormalizerUsesOnlyStringOperationsNeverFloatingPoint() throws {
        let source = try mobileAppSource(at: "src/utils/amount-input.ts")
        for term in ["Number(", "parseFloat(", "parseInt(", "Number.parseFloat(", "Number.parseInt("] {
            XCTAssertFalse(source.contains(term), "amount-input.ts must not contain \(term)")
        }
        // No BigInt either — this is a pure string-boundary transform, not
        // arithmetic; BigInt-based parsing remains entirely
        // chain-domain's job.
        XCTAssertFalse(source.contains("BigInt("))
    }

    func testNormalizerNeverImportsOrDuplicatesTheDomainParser() throws {
        let source = try mobileAppSource(at: "src/utils/amount-input.ts")
        XCTAssertFalse(source.contains("parseEthDecimalStringToWei"),
                       "the UI-boundary normalizer must never call or re-implement the strict domain parser itself")
        XCTAssertFalse(source.contains("chain-domain"))
    }

    // MARK: - The strict chain-domain parser is completely unchanged in responsibility

    func testChainDomainParserHasNoLocaleOrCommaHandling() throws {
        let source = try chainDomainSource(at: "ethereum-amount.ts")
        XCTAssertFalse(source.contains("','"), "chain-domain's parser must never be taught a locale-specific separator")
        XCTAssertFalse(source.lowercased().contains("locale"))
        XCTAssertFalse(source.contains(",'.'"), "must never replace a comma with a dot inside the domain layer")
        // Still the same one canonical shape check, reused from `toDecimalString`
        // — not a second, looser pattern.
        XCTAssertTrue(source.contains("toDecimalString(input)"))
    }

    // MARK: - send.tsx: normalize only at the call boundary, never mutate visible state

    func testSendScreenNormalizesOnlyAtThePreparationCallBoundary() throws {
        let body = try handleContinueBody()
        XCTAssertTrue(body.contains("const normalizedAmount = normalizeEthAmountDecimalSeparator(amount);"))
        XCTAssertTrue(body.contains("await prepareEthereumV1Send(recipient, normalizedAmount);"))
    }

    func testRawAmountStateIsNeverReassignedOrRenormalizedIntoDisplay() throws {
        let source = try sendSource()
        // The normalizer is called exactly once, at the preparation
        // boundary — never inside `handleAmountChange`/`setAmount`, which
        // would silently rewrite what the user sees while typing.
        let callCount = source.components(separatedBy: "normalizeEthAmountDecimalSeparator(").count - 1
        XCTAssertEqual(callCount, 1, "normalizeEthAmountDecimalSeparator must be called exactly once, at the preparation call boundary")
        XCTAssertFalse(source.contains("setAmount(normalizeEthAmountDecimalSeparator"),
                       "the TextInput's own state must never be rewritten through the normalizer — the user must still see what they typed, e.g. \"0,589\"")
    }

    func testSendScreenImportsTheNormalizerFromUtils() throws {
        let source = try sendSource()
        XCTAssertTrue(source.contains("import { normalizeEthAmountDecimalSeparator } from '@/utils/amount-input';"))
    }

    // MARK: - Helpers

    private func normalizeFunctionBody() throws -> String {
        let source = try mobileAppSource(at: "src/utils/amount-input.ts")
        let start = try XCTUnwrap(source.range(of: "export function normalizeEthAmountDecimalSeparator(input: string): string {"))
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func handleContinueBody() throws -> String {
        let source = try sendSource()
        let start = try XCTUnwrap(source.range(of: "const handleContinue = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [recipient, amount, router]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func sendSource() throws -> String {
        try mobileAppSource(at: "src/app/send.tsx")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        try readSourceStrippingFullLineComments(at: mobileAppSourceURL(at: relativePath))
    }

    private func mobileAppSourceURL(at relativePath: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent(relativePath)
    }

    private func chainDomainSource(at fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .deletingLastPathComponent() // apps/
            .deletingLastPathComponent() // repo root/
            .appendingPathComponent("packages/chain-domain/src")
            .appendingPathComponent(fileName)
        return try readSourceStrippingFullLineComments(at: url)
    }

    private func readSourceStrippingFullLineComments(at url: URL) throws -> String {
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
