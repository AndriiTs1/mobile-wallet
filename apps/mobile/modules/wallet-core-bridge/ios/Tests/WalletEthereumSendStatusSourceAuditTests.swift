import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.5 — permanent structural source-audit tests for Ethereum V1
/// transaction status resolution after broadcast:
/// `src/services/ethereum-send-status.ts` (new — read-only status
/// resolution) and its integration into `src/app/send-review.tsx`'s
/// post-broadcast state machine.
///
/// Same bounded, structural methodology as this project's other source
/// audits. Runtime/control-flow correctness (the pure lookup-to-status
/// mapping, `checkEthereumSendStatus`'s single-call/no-fabrication
/// behavior, and `confirmAndSendEthereumV1`'s `signerTxHash` attachment on
/// ambiguous/rejected/hash-mismatch outcomes) was verified via a temporary
/// executable Node scratch script during this stage's implementation, then
/// deleted per this project's established methodology. React Native
/// component rendering/navigation cannot be executed under XCTest, so this
/// suite cannot prove the Review screen's post-broadcast states actually
/// render correctly at runtime — that is exactly what this stage's
/// Physical iPhone QA plan covers instead.
final class WalletEthereumSendStatusSourceAuditTests: XCTestCase {
    // MARK: - 9/10: status checking is structurally read-only

    func testStatusFileNeverReferencesSigningOrBroadcasting() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-status.ts")
        for term in [
            "signEthereumTransactionV1", "broadcastEthMainnetRawTransaction(",
            "confirmAndSendEthereumV1", "eth_sendRawTransaction",
        ] {
            XCTAssertFalse(source.contains(term), "ethereum-send-status.ts must never reference \(term)")
        }
        XCTAssertTrue(source.contains("import { lookupEthMainnetTransaction"))
    }

    func testCheckStatusCallsLookupExactlyOnceNoLoop() throws {
        let body = try checkStatusFunctionBody()
        let lookupCallCount = body.components(separatedBy: "await lookup(").count - 1
        XCTAssertEqual(lookupCallCount, 1, "checkEthereumSendStatus must call lookup exactly once")
        for term in ["for (", "for(", "while (", "while(", ".retry("] {
            XCTAssertFalse(body.contains(term), "must not contain \(term)")
        }
    }

    // MARK: - 3/4/5/6: pure lookup -> status mapping shape

    func testInterpretLookupMapsAllFourExistingResultShapesExplicitly() throws {
        let body = try boundedFunctionBody(
            in: try mobileAppSource(at: "src/services/ethereum-send-status.ts"),
            startingAt: "export function interpretEthereumTransactionLookup("
        )
        XCTAssertTrue(body.contains("case 'pending':"))
        XCTAssertTrue(body.contains("return 'pending';"))
        XCTAssertTrue(body.contains("case 'confirmed':"))
        XCTAssertTrue(body.contains("return result.success ? 'confirmed' : 'failed';"))
        XCTAssertTrue(body.contains("case 'not_found':"))
        XCTAssertTrue(body.contains("return 'uncertain';"))
    }

    // MARK: - 14: no interval/timer-based polling anywhere in this stage's files

    func testNoIntervalOrTimerBasedPollingAnywhere() throws {
        for path in ["src/services/ethereum-send-status.ts", "src/app/send-review.tsx"] {
            let source = try mobileAppSource(at: path)
            for term in ["setInterval(", "setTimeout("] {
                XCTAssertFalse(source.contains(term), "\(path) must not contain \(term) — this stage is manual/one-shot only, never interval polling")
            }
        }
    }

    // MARK: - 12: no signedTxHex anywhere in status or review UI

    func testNoSignedTxHexReferencedOrDisplayed() throws {
        for path in ["src/services/ethereum-send-status.ts", "src/app/send-review.tsx"] {
            let source = try mobileAppSource(at: path)
            XCTAssertFalse(source.contains("signedTxHex"), "\(path) must never reference signedTxHex")
        }
    }

    // MARK: - 1: accepted broadcast transitions straight to pending, no automatic lookup

    func testAcceptedBroadcastTransitionsToPendingWithoutAnAutomaticLookup() throws {
        let body = try handleConfirmBody()
        XCTAssertTrue(body.contains("setConfirmState({ status: 'pending', txHash });"))
        // The success path must not itself call resolveStatus/checkEthereumSendStatus —
        // 'accepted' is already a definitive positive signal.
        let successPathStart = try XCTUnwrap(body.range(of: "const txHash = await confirmAndSendEthereumV1(prepared, {"))
        let successPathEnd = try XCTUnwrap(body.range(of: "setConfirmState({ status: 'pending', txHash });", range: successPathStart.upperBound..<body.endIndex))
        let successPath = body[successPathStart.lowerBound..<successPathEnd.upperBound]
        XCTAssertFalse(successPath.contains("resolveStatus("))
    }

    // MARK: - 2/11: ambiguous/hash-mismatch resolve via the existing txHash, never re-sign

    func testAmbiguousAndHashMismatchResolveUsingTheExistingSignerHashOnly() throws {
        let body = try handleConfirmBody()
        XCTAssertTrue(body.contains("error.reason === 'broadcast_ambiguous' || error.reason === 'hash_mismatch'"))
        XCTAssertTrue(body.contains("await resolveStatus(error.signerTxHash);"))
        // No second confirmAndSendEthereumV1/signing call anywhere in the
        // catch block that handles these reasons.
        let catchRange = try XCTUnwrap(body.range(of: "} catch (error) {"))
        let catchBlock = body[catchRange.lowerBound...]
        XCTAssertEqual(catchBlock.components(separatedBy: "confirmAndSendEthereumV1(").count - 1, 0,
                       "the catch block must never call confirmAndSendEthereumV1 again")
    }

    // MARK: - 8: rejected does not auto-resign — definite failure, no lookup, no retry

    func testRejectedBroadcastNeverAutoResignsOrLooksUp() throws {
        let body = try handleConfirmBody()
        let rejectedStart = try XCTUnwrap(body.range(of: "if (error.reason === 'broadcast_rejected') {"))
        let rejectedEnd = try XCTUnwrap(body.range(of: "\n          return;", range: rejectedStart.upperBound..<body.endIndex))
        let rejectedBranch = body[rejectedStart.lowerBound..<rejectedEnd.upperBound]
        XCTAssertTrue(rejectedBranch.contains("setConfirmState({ status: 'failed', txHash: null });"))
        XCTAssertFalse(rejectedBranch.contains("resolveStatus("))
        XCTAssertFalse(rejectedBranch.contains("confirmAndSendEthereumV1("))
    }

    // MARK: - 7/13: uncertain/pending/confirmed/failed never offer fresh signing; Done always exits safely

    func testPostBroadcastStatusViewNeverOffersSendAgainAndAlwaysOffersDone() throws {
        let body = try sendStatusViewBody()
        for term in ["Send again", "Try again", "Confirm & Send", "confirmAndSendEthereumV1", "signEthereumTransactionV1"] {
            XCTAssertFalse(body.contains(term), "the post-broadcast status view must never offer \(term)")
        }
        XCTAssertTrue(body.contains("accessibilityLabel=\"Done\""))
        XCTAssertTrue(body.contains("onPress={onDone}"))
        // "Check status" is the ONLY other action, and it is scoped to
        // pending/uncertain only.
        XCTAssertTrue(body.contains("confirmState.status === 'pending' || confirmState.status === 'uncertain' ? ("))
        XCTAssertTrue(body.contains("accessibilityLabel=\"Check status\""))
    }

    func testCheckStatusNeverCallsSigningOrBroadcasting() throws {
        let body = try handleCheckStatusBody()
        for term in ["confirmAndSendEthereumV1(", "signEthereumTransactionV1(", "broadcastEthMainnetRawTransaction("] {
            XCTAssertFalse(body.contains(term), "handleCheckStatus must never call \(term)")
        }
        XCTAssertTrue(body.contains("await resolveStatus(confirmState.txHash);"))
    }

    // MARK: - Helpers

    private func checkStatusFunctionBody() throws -> String {
        let source = try mobileAppSource(at: "src/services/ethereum-send-status.ts")
        let start = try XCTUnwrap(source.range(of: "export async function checkEthereumSendStatus("))
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func handleConfirmBody() throws -> String {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        let start = try XCTUnwrap(source.range(of: "const handleConfirm = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [prepared, resolveStatus]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func handleCheckStatusBody() throws -> String {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        let start = try XCTUnwrap(source.range(of: "const handleCheckStatus = useCallback(async () => {"))
        let end = try XCTUnwrap(source.range(of: "}, [confirmState, resolveStatus]);", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func sendStatusViewBody() throws -> String {
        let source = try mobileAppSource(at: "src/app/send-review.tsx")
        // Starts past the multi-line destructured-props parameter list
        // (which itself contains a column-0 "}: {" that would otherwise
        // prematurely match a naive "\n}" search) — this is the first line
        // of the function's actual body.
        let start = try XCTUnwrap(source.range(of: "const copy = STATUS_COPY[confirmState.status];"))
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func boundedFunctionBody(in source: String, startingAt signatureStart: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
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
