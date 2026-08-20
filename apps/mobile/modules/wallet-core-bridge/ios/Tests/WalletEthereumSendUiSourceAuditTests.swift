import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.3 — permanent structural source-audit tests for the Ethereum
/// V1 Send + Review UI: `src/app/send.tsx`, `src/app/send-review.tsx`, and
/// `src/services/ethereum-send-session.ts`.
///
/// Same bounded, structural methodology as
/// `WalletEthereumSendPreparationSourceAuditTests` (Stage 5G.2.2) — proves
/// SHAPE (which functions are called, in what order, which patterns are
/// absent) rather than exact formatting. React Native component
/// rendering/navigation cannot be executed under XCTest (no RN runtime
/// here), so this suite cannot prove the screens actually render or
/// navigate correctly at runtime — that is exactly what this stage's own
/// "Physical iPhone QA" section covers instead. This gap is deliberately
/// accepted and documented, not hidden.
final class WalletEthereumSendUiSourceAuditTests: XCTestCase {
    // MARK: - 1/2: raw string amount passed to prepareEthereumV1Send, no Number/parseFloat

    func testSendFormPassesRawRecipientAndAmountStringsToPreparation() throws {
        // Stage 5G.2.3 bugfix (European decimal comma): recipient is still
        // passed completely raw. Amount is passed through
        // `normalizeEthAmountDecimalSeparator` first — a UI-boundary-only,
        // non-financial-parsing "," -> "." swap (see
        // `WalletEthAmountInputNormalizationSourceAuditTests` for the
        // dedicated audit of that function itself) — never `Number`/
        // `parseFloat`, and the raw `amount` state is never reassigned.
        let body = try handleContinueBody()
        XCTAssertTrue(body.contains("const normalizedAmount = normalizeEthAmountDecimalSeparator(amount);"))
        XCTAssertTrue(body.contains("await prepareEthereumV1Send(recipient, normalizedAmount);"),
                      "must call prepareEthereumV1Send with the raw recipient string and the normalized amount")
        XCTAssertFalse(body.contains("amount ="), "the raw `amount` state must never be reassigned/mutated")
    }

    func testNoFinancialParsingConversionInSendOrReviewScreens() throws {
        for source in [try sendSource(), try sendReviewSource()] {
            for term in ["Number(", "parseFloat(", "parseInt("] {
                XCTAssertFalse(source.contains(term), "must not contain \(term)")
            }
        }
    }

    // MARK: - 3: recipient/amount never used to construct a signing intent in the UI

    func testUiNeverConstructsSigningIntentOrCallsSigning() throws {
        for source in [try sendSource(), try sendReviewSource()] {
            XCTAssertFalse(source.contains("toEthereumV1TransactionIntent"))
            XCTAssertFalse(source.contains("signEthereumTransactionV1"))
            XCTAssertFalse(source.contains("EthereumV1TransactionIntent"))
        }
    }

    // MARK: - 4: preparation happens before Review navigation

    func testPreparationCallPrecedesReviewNavigation() throws {
        let body = try handleContinueBody()
        let prepareRange = try XCTUnwrap(body.range(of: "await prepareEthereumV1Send("))
        let navigateRange = try XCTUnwrap(body.range(of: "router.push('/send-review')"))
        XCTAssertTrue(prepareRange.lowerBound < navigateRange.lowerBound,
                      "prepareEthereumV1Send must be awaited before navigating to Review")
    }

    // MARK: - 5: duplicate concurrent submission is guarded

    func testDuplicatePreparationIsGuardedBySingleFlightRef() throws {
        let source = try sendSource()
        XCTAssertTrue(source.contains("const isPreparingRef = useRef(false);"))
        let body = try handleContinueBody()
        XCTAssertTrue(body.contains("if (isPreparingRef.current) {"))
        XCTAssertTrue(body.contains("isPreparingRef.current = true;"))
        // Reset on both the success and failure paths — never stuck "true".
        XCTAssertEqual(body.components(separatedBy: "isPreparingRef.current = false;").count - 1, 2,
                        "must reset the guard on both the success and the catch path")
    }

    // MARK: - 6: raw RPC/native errors are never rendered

    func testRawErrorsAreNeverRenderedOnlyMappedMessages() throws {
        let body = try handleContinueBody()
        XCTAssertFalse(body.contains("error.message"), "must never surface the caught error's own message")
        let source = try sendSource()
        // Every EthereumSendPreparationErrorReason maps to a safe, static string.
        for reason in ["invalid_recipient", "invalid_amount", "insufficient_funds", "network_error"] {
            XCTAssertTrue(source.contains("\(reason):"), "ERROR_MESSAGES must map \(reason)")
        }
        for leak in ["provider", "rpc", "http", "stack", "native error"] {
            XCTAssertFalse(source.lowercased().contains(leak), "must not leak \(leak) details in UI copy")
        }
    }

    // MARK: - 7: Review consumes the prepared snapshot

    func testReviewConsumesPreparedSnapshot() throws {
        let source = try sendReviewSource()
        XCTAssertTrue(source.contains("consumePendingEthereumSend()"))
        XCTAssertTrue(source.contains("from '@/services/ethereum-send-session'"))
    }

    // MARK: - 8: Review never refetches nonce/fees/balance or re-prepares

    func testReviewNeverRefetchesOrReprepares() throws {
        let source = try sendReviewSource()
        for term in [
            "fetchEthMainnetPendingNonce(", "fetchEthMainnetFeeData(", "fetchEthMainnetBalance(",
            "prepareEthereumV1Send(",
        ] {
            XCTAssertFalse(source.contains(term), "Review must not call \(term)")
        }
    }

    // MARK: - 9/10: Review never signs or broadcasts

    func testReviewNeverSignsOrBroadcasts() throws {
        let source = try sendReviewSource()
        XCTAssertFalse(source.contains("signEthereumTransactionV1("))
        XCTAssertFalse(source.contains("broadcastEthMainnetRawTransaction("))
    }

    func testReviewsReservedCtaHasNoOnPressAndOnlyBackEditIsInteractive() throws {
        // The reserved "Confirm & Send" CTA is deliberately NOT a Pressable
        // — it is a plain View, so it structurally cannot receive an
        // onPress no matter how it is styled. The only Pressables in this
        // screen are Back/Edit (main view) and the empty-state's "Back to
        // Send" fallback — both pure navigation, never forward-progressing.
        let source = try sendReviewSource()
        let ctaStart = try XCTUnwrap(source.range(of: "<View accessibilityState={{ disabled: true }} style={styles.reservedCta}>"))
        let ctaEnd = try XCTUnwrap(source.range(of: "</View>", range: ctaStart.upperBound..<source.endIndex))
        let ctaBlock = source[ctaStart.lowerBound..<ctaEnd.upperBound]
        XCTAssertFalse(ctaBlock.contains("onPress"), "the reserved Confirm & Send placeholder must have no onPress")
        XCTAssertFalse(ctaBlock.contains("<Pressable"), "the reserved Confirm & Send placeholder must not be a Pressable")

        let pressableCount = source.components(separatedBy: "<Pressable").count - 1
        XCTAssertEqual(pressableCount, 2, "Review must expose exactly the Back/Edit and empty-state Pressables, nothing more")
        XCTAssertTrue(source.contains("onPress={() => router.back()}"))
        XCTAssertTrue(source.contains("onPress={() => router.replace('/send')}"))
    }

    // MARK: - 11: prepared snapshot is not persisted

    func testPreparedSnapshotIsNotPersisted() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-session.ts")
        for term in ["AsyncStorage", "SecureStore", "SQLite", ".setItem(", "sqlite", "database"] {
            XCTAssertFalse(source.contains(term), "the ephemeral session module must never persist — found \(term)")
        }
    }

    // MARK: - 12: prepared snapshot is never placed into a URL/query param

    func testPreparedSnapshotNeverEntersUrlOrQueryParams() throws {
        let sendBody = try sendSource()
        XCTAssertTrue(sendBody.contains("router.push('/send-review');"),
                      "navigation must be a bare route string, never carrying the prepared object as a param")
        XCTAssertFalse(sendBody.contains("useLocalSearchParams"))
        XCTAssertFalse(sendBody.contains("pathname:"))

        let reviewBody = try sendReviewSource()
        XCTAssertFalse(reviewBody.contains("useLocalSearchParams"), "Review must not read the prepared snapshot from route params")
        XCTAssertFalse(reviewBody.contains("useGlobalSearchParams"))
    }

    // MARK: - 13: Back/Edit requires a fresh prepare — no state re-injection

    func testBackToEditNeverReinjectsAPreviousSnapshot() throws {
        let reviewSource = try sendReviewSource()
        // The only route call on the Back/Edit path is a plain router.back()
        // — it never calls setPendingEthereumSend (which would attempt to
        // hand the OLD snapshot back into a future Review without a fresh
        // prepare).
        XCTAssertFalse(reviewSource.contains("setPendingEthereumSend"),
                       "Review must never re-set the pending snapshot — only Send's fresh prepareEthereumV1Send call may do that")
        // Send's own state is never pre-seeded from a prior prepared value —
        // recipient/amount always start from plain useState('').
        let sendSrc = try sendSource()
        XCTAssertTrue(sendSrc.contains("useState('')"))
    }

    // MARK: - 14: wei display formatting is integer-safe

    func testDisplayFormattingUsesIntegerSafeChainDomainUtility() throws {
        for source in [try sendSource(), try sendReviewSource()] {
            XCTAssertTrue(source.contains("formatWeiAsEthDecimalString"))
            XCTAssertTrue(source.contains("from 'chain-domain'"))
        }
    }

    // MARK: - 15: no secret-bearing material

    func testNoSecretMaterialInSendUiFiles() throws {
        for source in [
            try sendSource(), try sendReviewSource(),
            try mobileAppSource(at: "src/services/ethereum-send-session.ts"),
        ] {
            for term in ["entropy", "mnemonic", "seed", "privateKey", "signedTxHex", "xpriv"] {
                XCTAssertFalse(source.lowercased().contains(term.lowercased()), "must never reference \(term)")
            }
        }
    }

    // MARK: - Helpers

    private func handleContinueBody() throws -> String {
        let source = try sendSource()
        let start = try XCTUnwrap(source.range(of: "const handleContinue = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [recipient, amount, router]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func sendSource() throws -> String {
        try mobileAppSource(at: "src/app/send.tsx")
    }

    private func sendReviewSource() throws -> String {
        try mobileAppSource(at: "src/app/send-review.tsx")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent(relativePath)
        let source = try String(contentsOf: url, encoding: .utf8)
        // Strip full-line comments only (never touches inline string
        // literals this suite asserts on).
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
