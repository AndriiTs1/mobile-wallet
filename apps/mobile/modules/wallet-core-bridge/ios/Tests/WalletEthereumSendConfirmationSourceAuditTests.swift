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

    // NOTE (Stage 5G.2.5): this test originally audited a single 'success'
    // status that replaced the whole screen with a Done-only panel. That
    // status was superseded by the fuller post-broadcast lifecycle
    // (`pending`/`confirmed`/`failed`/`uncertain`, all dispatched to the
    // shared `SendStatusView`) — see
    // `WalletEthereumSendStatusSourceAuditTests.testPostBroadcastStatusViewNeverOffersSendAgainAndAlwaysOffersDone`
    // for the equivalent (and now more complete) coverage: every
    // post-broadcast status offers Done, calling `router.dismissAll()`, and
    // none of them ever render the Confirm & Send control again.

    // NOTE (Stage 5G.2.5): this test originally audited `isConfirmBlocked`,
    // a mechanism that kept the pre-broadcast 'error' status on screen (with
    // the Confirm & Send control conditionally hidden) for ambiguous/
    // hash-mismatch outcomes. Those outcomes are no longer represented as an
    // 'error' status at all when a signer hash is available — they now
    // resolve via `resolveStatus`/`checkEthereumSendStatus` into the
    // dedicated post-broadcast status screen instead, which structurally
    // has no Confirm & Send control in the first place. See
    // `WalletEthereumSendStatusSourceAuditTests.testAmbiguousAndHashMismatchResolveUsingTheExistingSignerHashOnly`
    // and `.testPostBroadcastStatusViewNeverOffersSendAgainAndAlwaysOffersDone`
    // for the current equivalent coverage. `RETRYABLE_REASONS` now contains
    // only `'auth_or_signing_failed'` — verified by
    // `testConfirmationErrorTaxonomyReflectsThePostBroadcastLifecycle` below.

    func testConfirmationErrorTaxonomyReflectsThePostBroadcastLifecycle() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        XCTAssertTrue(source.contains("RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set(["))
        let retryableSetStart = try XCTUnwrap(source.range(of: "RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set(["))
        let retryableSetEnd = try XCTUnwrap(source.range(of: "]);", range: retryableSetStart.upperBound..<source.endIndex))
        let retryableSet = source[retryableSetStart.lowerBound..<retryableSetEnd.upperBound]
        // Only a pre-signing/pre-broadcast failure is retryable via a fresh
        // Confirm & Send tap — everything else either has its own definite
        // 'failed' status (broadcast_rejected) or resolves via status
        // checking (broadcast_ambiguous/hash_mismatch with a known hash).
        XCTAssertTrue(retryableSet.contains("'auth_or_signing_failed'"))
        XCTAssertFalse(retryableSet.contains("'broadcast_rejected'"))
        XCTAssertFalse(retryableSet.contains("'broadcast_ambiguous'"))
        XCTAssertFalse(retryableSet.contains("'hash_mismatch'"))
    }

    func testNoSigningOrBroadcastBeforeExplicitConfirm() throws {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        // The ONLY call to confirmAndSendEthereumV1 is inside handleConfirm,
        // which is itself wired ONLY to the Confirm & Send Pressable's
        // onPress — never inside a useEffect/mount-time call.
        let callCount = source.components(separatedBy: "confirmAndSendEthereumV1(").count - 1
        XCTAssertEqual(callCount, 1)
        XCTAssertTrue(source.contains("onPress={handleConfirm}"))
        // Stage 5G.2.5 adds one legitimate `useEffect` — purely an
        // unmount-tracking cleanup (`isMountedRef.current = false`) guarding
        // async status-lookup continuations, never a trigger for signing or
        // broadcasting. Assert its body specifically, rather than banning
        // `useEffect` outright.
        let effectStart = try XCTUnwrap(source.range(of: "useEffect(() => {"))
        let effectEnd = try XCTUnwrap(source.range(of: "\n  }, []);", range: effectStart.upperBound..<source.endIndex))
        let effectBody = source[effectStart.lowerBound..<effectEnd.upperBound]
        XCTAssertTrue(effectBody.contains("isMountedRef.current = false;"))
        XCTAssertFalse(effectBody.contains("confirmAndSendEthereumV1("), "the mount-time effect must never trigger confirmation")
        XCTAssertFalse(effectBody.contains("handleConfirm"), "the mount-time effect must never call handleConfirm")
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
        // Stage 5G.2.5: handleConfirm now also depends on resolveStatus
        // (used to resolve an ambiguous/hash-mismatch outcome without
        // re-signing — see WalletEthereumSendStatusSourceAuditTests).
        let end = try XCTUnwrap(source.range(of: "}, [prepared, resolveStatus]);", range: start.upperBound..<source.endIndex))
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
