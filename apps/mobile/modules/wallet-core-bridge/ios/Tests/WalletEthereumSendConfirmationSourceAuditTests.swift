import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.4 — permanent structural source-audit tests for Ethereum V1
/// Confirm, authenticated signing & broadcast:
/// `src/services/ethereum-send-confirmation.ts` (new orchestration) and its
/// one call site in `src/app/send-review.tsx`.
///
/// Same bounded, structural methodology as this project's other source
/// audits. Runtime/numeric/control-flow correctness of the orchestration
/// itself (exact intent reshape, exact call counts, hash-mismatch
/// detection, phase ordering) was verified via a temporary executable Node
/// scratch script during this stage's implementation — with FAKE `sign`/
/// `broadcast` dependencies injected into the real, unmodified production
/// function — then deleted per this project's established methodology.
/// React Native component rendering/navigation cannot be executed under
/// XCTest (no RN runtime here), so this suite cannot prove the Review
/// screen's states actually render correctly at runtime — that is exactly
/// what this stage's Physical iPhone QA plan covers instead.
final class WalletEthereumSendConfirmationSourceAuditTests: XCTestCase {
    // MARK: - 2/18: no transaction-field re-fetch; only the existing pure reshape

    func testConfirmationNeverRefetchesOrRepreparesTransactionFields() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-confirmation.ts")
        for term in [
            "fetchEthMainnetPendingNonce(", "fetchEthMainnetFeeData(", "fetchEthMainnetBalance(",
            "prepareEthereumV1Send(", "getEthereumAddressV1(",
        ] {
            XCTAssertFalse(source.contains(term), "confirmation orchestration must not call \(term)")
        }
        XCTAssertTrue(source.contains("toEthereumV1TransactionIntent(prepared)"),
                      "must reuse the existing pure, lossless reshape — never recompute the intent")
    }

    // MARK: - 3/15: confirmation calls the existing authenticated signer, never signs before deps resolve

    func testUsesExistingSignerAndBroadcastPrimitivesNotASecondImplementation() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-confirmation.ts")
        XCTAssertTrue(source.contains("from './wallet-core-bridge'"))
        XCTAssertTrue(source.contains("signEthereumTransactionV1"))
        XCTAssertTrue(source.contains("from './ethereum-rpc'"))
        XCTAssertTrue(source.contains("broadcastEthMainnetRawTransaction"))
        // No second signer/broadcaster definition anywhere in this file.
        XCTAssertFalse(source.contains("function sign(") )
        XCTAssertFalse(source.contains("eth_sendRawTransaction"), "must reuse the existing broadcast primitive, never issue its own RPC call")
    }

    func testDefaultDependenciesAreTheRealProductionImplementations() throws {
        let body = try confirmFunctionBody()
        XCTAssertTrue(body.contains("const sign = deps.sign ?? signEthereumTransactionV1;"))
        XCTAssertTrue(body.contains("const broadcast = deps.broadcast ?? broadcastEthMainnetRawTransaction;"))
    }

    // MARK: - 4: signing failure precedes and gates broadcast (structural: single try, broadcast only after)

    func testBroadcastCallIsLexicallyAfterAndGatedBySuccessfulSigning() throws {
        let body = try confirmFunctionBody()
        let signRange = try XCTUnwrap(body.range(of: "signed = await sign(toEthereumV1TransactionIntent(prepared));"))
        let broadcastCallRange = try XCTUnwrap(body.range(of: "await broadcast(signed.signedTxHex, signerTxHash);"))
        XCTAssertTrue(signRange.upperBound < broadcastCallRange.lowerBound,
                      "broadcast must be lexically reachable only after a successful signed = await sign(...)")
        // The signing catch block only ever throws — it can never fall
        // through to the broadcast call below it.
        let catchRange = try XCTUnwrap(body.range(of: "} catch {", range: signRange.upperBound..<broadcastCallRange.lowerBound))
        let catchBlockEnd = try XCTUnwrap(body.range(of: "\n  }", range: catchRange.upperBound..<body.endIndex))
        let signingCatchBlock = body[catchRange.lowerBound..<catchBlockEnd.upperBound]
        XCTAssertTrue(signingCatchBlock.contains("throw new EthereumSendConfirmationError("))
    }

    // MARK: - 5: exactly one broadcast call site in the whole pipeline

    func testExactlyOneBroadcastCallSiteNoRetryLoop() throws {
        let body = try confirmFunctionBody()
        let broadcastCallCount = body.components(separatedBy: "await broadcast(").count - 1
        XCTAssertEqual(broadcastCallCount, 1, "must contain exactly one broadcast call — no retry loop")
        for term in ["for (", "for(", "while (", "while(", ".retry(", "setTimeout("] {
            XCTAssertFalse(body.contains(term), "confirmation pipeline must not contain \(term)")
        }
    }

    // MARK: - 7: broadcast receives exactly signer's signedTxHex

    func testBroadcastReceivesExactlySignersSignedTxHex() throws {
        let body = try confirmFunctionBody()
        XCTAssertTrue(body.contains("await broadcast(signed.signedTxHex, signerTxHash);"))
    }

    // MARK: - 8/9: hash integrity — case-insensitive comparison, never a fabricated success

    func testHashIntegrityCheckIsCaseInsensitiveAndGatesSuccess() throws {
        let body = try confirmFunctionBody()
        XCTAssertTrue(body.contains("broadcastResult.txHash.toLowerCase() !== signerTxHash.toLowerCase()"))
        let mismatchRange = try XCTUnwrap(body.range(of: "broadcastResult.txHash.toLowerCase() !== signerTxHash.toLowerCase()"))
        let returnRange = try XCTUnwrap(body.range(of: "return broadcastResult.txHash;"))
        XCTAssertTrue(mismatchRange.upperBound < returnRange.lowerBound,
                      "the hash comparison must be checked before ever returning a hash to the caller")
    }

    func testBroadcastRpcHashComparisonInEthereumRpcIsAlsoCaseInsensitive() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-rpc.ts")
        XCTAssertTrue(source.contains("txHash.toLowerCase() !== expectedTxHash.toLowerCase()"))
    }

    // MARK: - 11/12: no native/provider error detail ever crosses into a thrown message

    func testNoRawErrorDetailInAnyThrownMessage() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-confirmation.ts")
        XCTAssertFalse(source.contains("error.message"), "must never forward a raw caught error's message")
        XCTAssertFalse(source.contains("broadcastResult.reason"), "must never forward the broadcast primitive's raw reason string to the user-facing message")
        for leak in ["provider", "rpc url", "stack", "native error", "keychain", "laerror"] {
            XCTAssertFalse(source.lowercased().contains(leak), "must not leak \(leak) details")
        }
    }

    // MARK: - 14: no secret material anywhere in this file

    func testNoSecretMaterialInConfirmationFile() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-confirmation.ts")
        for term in ["entropy", "mnemonic", "seed", "privateKey", "xpriv"] {
            XCTAssertFalse(source.lowercased().contains(term.lowercased()), "must never reference \(term)")
        }
    }

    // MARK: - send-review.tsx: 6/10/13/15/16/17 — UI-level orchestration guarantees

    func testConfirmIsSingleFlightGuardedBeforeAnyStateChange() throws {
        let body = try handleConfirmBody()
        XCTAssertTrue(body.contains("if (!prepared || isConfirmingRef.current) {"))
        XCTAssertTrue(body.contains("isConfirmingRef.current = true;"))
        // The guard check must be the very first statement in the function.
        let start = try XCTUnwrap(body.range(of: "const handleConfirm = useCallback(async () => {"))
        let guardRange = try XCTUnwrap(body.range(of: "if (!prepared || isConfirmingRef.current) {"))
        let between = body[start.upperBound..<guardRange.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertTrue(between.isEmpty, "the single-flight guard must be the first statement in handleConfirm")
    }

    func testSuccessStateNeverRendersAConfirmPressableAgain() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        let successBranchStart = try XCTUnwrap(source.range(of: "if (confirmState.status === 'success') {"))
        let successBranchEnd = try XCTUnwrap(source.range(of: "\n  }", range: successBranchStart.upperBound..<source.endIndex))
        let successBranch = source[successBranchStart.lowerBound..<successBranchEnd.upperBound]
        XCTAssertFalse(successBranch.contains("accessibilityLabel=\"Confirm & Send\""),
                       "the success branch must never render the Confirm & Send control again — a sent snapshot cannot be resubmitted")
        XCTAssertTrue(successBranch.contains("accessibilityLabel=\"Done\""))
        XCTAssertTrue(successBranch.contains("onPress={handleDone}"))
        // `handleDone` itself (defined earlier in the component, not inline
        // in this JSX) is the one place that calls router.dismissAll().
        XCTAssertTrue(source.contains("const handleDone = useCallback(() => {\n    router.dismissAll();\n  }, [router]);"))
    }

    func testAmbiguousAndHashMismatchNeverRenderTheConfirmPressable() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        XCTAssertTrue(source.contains("function isConfirmBlocked(confirmState: ConfirmState): boolean {"))
        XCTAssertTrue(source.contains("return confirmState.status === 'error' && !RETRYABLE_REASONS.has(confirmState.reason);"))
        XCTAssertTrue(source.contains("RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set(["))
        XCTAssertTrue(source.contains("'auth_or_signing_failed',"))
        XCTAssertTrue(source.contains("'broadcast_rejected',"))
        // Specifically: ambiguous and hash_mismatch are NOT in the retryable set.
        let retryableSetStart = try XCTUnwrap(source.range(of: "RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set(["))
        let retryableSetEnd = try XCTUnwrap(source.range(of: "]);", range: retryableSetStart.upperBound..<source.endIndex))
        let retryableSet = source[retryableSetStart.lowerBound..<retryableSetEnd.upperBound]
        XCTAssertFalse(retryableSet.contains("'broadcast_ambiguous'"))
        XCTAssertFalse(retryableSet.contains("'hash_mismatch'"))
        // The Confirm & Send Pressable render is gated behind !isConfirmBlocked(...).
        XCTAssertTrue(source.contains("isConfirmBlocked(confirmState) ? ("))
    }

    func testNoSigningOrBroadcastBeforeExplicitConfirm() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        // The ONLY call to confirmAndSendEthereumV1 is inside handleConfirm,
        // which is itself wired ONLY to the Confirm & Send Pressable's
        // onPress — never inside a useEffect/mount-time call.
        let callCount = source.components(separatedBy: "confirmAndSendEthereumV1(").count - 1
        XCTAssertEqual(callCount, 1)
        XCTAssertFalse(source.contains("useEffect"), "Review must never auto-trigger confirmation on mount or on any state change")
        XCTAssertTrue(source.contains("onPress={handleConfirm}"))
    }

    func testAppUnlockAndRecoveryAuthenticationAreNeverReferencedHere() throws {
        for path in ["src/services/ethereum-send-confirmation.ts", "src/app/send-review.tsx"] {
            let source = try mobileAppSource(at: path)
            XCTAssertFalse(source.contains("requestAppUnlock"), "\(path) must never reference App Unlock authentication")
            XCTAssertFalse(source.contains("requestRevealBackup"), "\(path) must never reference recovery-phrase-reveal authentication")
        }
    }

    func testBackToEditNeverMutatesTheReviewedSnapshot() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        // `router.back()` is a plain navigation call — the reviewed
        // `prepared` snapshot (a `const` from `useState`'s lazy initializer)
        // is never reassigned or fed back into `setPendingEthereumSend`
        // anywhere in this file.
        XCTAssertTrue(source.contains("onPress={() => router.back()}"))
        XCTAssertFalse(source.contains("setPendingEthereumSend"), "Review must never re-set the pending snapshot — only a fresh Send-side prepare may do that")
    }

    // MARK: - Helpers

    private func confirmFunctionBody() throws -> String {
        let source = try mobileAppSource(at: "src/services/ethereum-send-confirmation.ts")
        let start = try XCTUnwrap(source.range(of: "export async function confirmAndSendEthereumV1("))
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func handleConfirmBody() throws -> String {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        let start = try XCTUnwrap(source.range(of: "const handleConfirm = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [prepared]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
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
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
