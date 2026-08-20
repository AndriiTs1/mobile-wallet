import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.1 — permanent structural source-audit tests for
/// `apps/mobile/src/services/ethereum-rpc.ts`'s Send-preparation RPC
/// capabilities (pending nonce, EIP-1559 fee data, broadcast, transaction
/// lookup).
///
/// Consistent with this project's whole existing methodology (see
/// `WalletEthereumTransactionSigningTests`/`WalletEthereumAddressBridgeTests`,
/// which already source-audit `.ts` files this same way), these are
/// structural, bounded assertions — never a whole-file/whole-string match —
/// proving the code's SHAPE (which JSON-RPC method is called, which
/// patterns are absent, how many times a given call appears within one
/// function) rather than its exact formatting or full literal text. This
/// deliberately trades some depth for permanence: what these tests CANNOT
/// prove is runtime/numeric correctness (e.g. that the fee arithmetic
/// computes the exact right decimal value for a given input, or that a
/// thrown transport error is actually routed to the 'ambiguous' branch at
/// runtime) — that requires executing the TypeScript, which this project
/// has no permanent, dependency-free way to do yet (Stage 5G.2.1's own
/// audit explored this and found no viable zero-dependency option — see
/// that stage's report). This gap is deliberately accepted and documented,
/// not hidden.
final class WalletEthereumRpcSourceAuditTests: XCTestCase {
    // MARK: - 1: pending nonce uses exactly "pending", never "latest"

    func testPendingNonceFunctionUsesExactlyPendingNeverLatest() throws {
        let body = try boundedFunctionBody(startingAt: "export async function fetchEthMainnetPendingNonce(")
        XCTAssertTrue(body.contains("eth_getTransactionCount"))
        XCTAssertTrue(body.contains("'pending'"))
        XCTAssertFalse(body.contains("latest"), "the pending-nonce function must never reference \"latest\" as a fallback")
    }

    // MARK: - 2: broadcast uses eth_sendRawTransaction

    func testBroadcastFunctionUsesEthSendRawTransaction() throws {
        let body = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(")
        XCTAssertTrue(body.contains("eth_sendRawTransaction"))
    }

    // MARK: - 3: broadcast does not use attemptProvidersInOrder

    func testBroadcastDoesNotUseProviderFailover() throws {
        let body = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(")
        XCTAssertFalse(body.contains("attemptProvidersInOrder"), "broadcast must not reuse the read-only multi-provider failover helper")
    }

    // MARK: - 4: no retry loop / self-retry; exactly one RPC submission path

    func testBroadcastHasNoRetryLoopAndExactlyOneSubmissionPath() throws {
        let body = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(")
        for term in ["for (", "for(", "while (", "while(", ".retry(", "setTimeout("] {
            XCTAssertFalse(body.contains(term), "broadcast must not contain \(term)")
        }
        let submissionCallCount = body.components(separatedBy: "callEthereumJsonRpc(").count - 1
        XCTAssertEqual(submissionCallCount, 1, "broadcast must submit via exactly one JSON-RPC call, not \(submissionCallCount)")
    }

    // MARK: - 5: broadcast signature requires signedTxHex + expectedTxHash: EthereumTxHash

    func testBroadcastSignatureRequiresSignedTxHexAndExpectedTxHash() throws {
        let signature = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(", upTo: "): Promise<EthereumBroadcastResult> {")
        XCTAssertTrue(signature.contains("signedTxHex: string"))
        XCTAssertTrue(signature.contains("expectedTxHash: EthereumTxHash"))
    }

    // MARK: - 6: request parameters use signedTxHex

    func testBroadcastRequestParamsUseSignedTxHex() throws {
        let body = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(")
        XCTAssertTrue(body.contains("[signedTxHex]"))
    }

    // MARK: - 7/8: rejection branch -> rejected; transport/other catch -> ambiguous

    func testRejectionBranchProducesRejectedAndOtherCatchProducesAmbiguous() throws {
        let body = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(")
        let catchRange = try XCTUnwrap(body.range(of: "} catch (error) {"))
        let catchBlock = body[catchRange.lowerBound...]

        let rejectionCheckRange = try XCTUnwrap(catchBlock.range(of: "instanceof EthereumRpcRejectionError"))
        let rejectedOutcomeRange = try XCTUnwrap(catchBlock.range(of: "outcome: 'rejected'", range: rejectionCheckRange.upperBound..<catchBlock.endIndex))
        let ambiguousOutcomeRange = try XCTUnwrap(catchBlock.range(of: "outcome: 'ambiguous'", range: rejectedOutcomeRange.upperBound..<catchBlock.endIndex))

        // The rejection-typed branch's outcome must appear before the
        // catch-all ambiguous fallback that follows it structurally.
        XCTAssertTrue(rejectedOutcomeRange.lowerBound < ambiguousOutcomeRange.lowerBound)
    }

    // MARK: - 9: fee path is integer-safe (BigInt only, no float conversion)

    func testFeePathUsesOnlyIntegerSafeArithmetic() throws {
        let feeHistoryBody = try boundedFunctionBody(startingAt: "async function callEthFeeHistory(")
        let feeDataBody = try boundedFunctionBody(startingAt: "export async function fetchEthMainnetFeeData(")
        let combined = feeHistoryBody + feeDataBody

        XCTAssertTrue(combined.contains("BigInt("), "fee computation must use BigInt")
        for term in ["parseFloat(", "parseInt(", "Number("] {
            XCTAssertFalse(combined.contains(term), "fee path must not contain \(term)")
        }
    }

    // MARK: - 10: fee-history parser validates the required array
    // relationship and the exact one-block response shape

    func testFeeHistoryParserValidatesArrayRelationshipAndExactShape() throws {
        let body = try boundedFunctionBody(startingAt: "async function callEthFeeHistory(")
        XCTAssertTrue(body.contains("baseFeePerGasArray.length !== rewardArray.length + 1"), "must enforce the EIP-1559 baseFeePerGas/reward length relationship")
        XCTAssertTrue(body.contains("baseFeePerGasArray.length !== 2"), "must enforce the exact one-block requested shape for baseFeePerGas")
        XCTAssertTrue(body.contains("rewardArray.length !== 1"), "must enforce the exact one-block requested shape for reward")
        XCTAssertTrue(body.contains("!Array.isArray(baseFeePerGasArray)"))
        XCTAssertTrue(body.contains("!Array.isArray(rewardArray)"))
    }

    // MARK: - 11: tx-hash validation is imported/reused from chain-domain,
    // never duplicated

    func testTxHashValidationIsImportedFromChainDomainNotDuplicated() throws {
        let source = try ethereumRpcSource()
        XCTAssertTrue(source.contains("toEthereumTxHash"))
        XCTAssertTrue(source.contains("from 'chain-domain'"))

        // No second 64-hex-character tx-hash-shaped pattern literal exists
        // anywhere in this file — the only such validation must come from
        // the imported chain-domain function.
        let occurrences = source.components(separatedBy: "{64}").count - 1
        XCTAssertEqual(occurrences, 0, "ethereum-rpc.ts must not define a second tx-hash-shaped regex pattern; it must reuse chain-domain's toEthereumTxHash")
    }

    // MARK: - 12/13: no console/logging anywhere, including of signedTxHex

    func testNoConsoleLoggingAnywhereInFile() throws {
        let source = try ethereumRpcSource()
        for term in ["console.log(", "console.warn(", "console.error(", "console.debug(", "console.info("] {
            XCTAssertFalse(source.contains(term), "ethereum-rpc.ts must not contain \(term)")
        }
    }

    // MARK: - 14: no automatic provider failover during broadcast
    // (signature-level: a single provider, not a providers array)

    func testBroadcastAcceptsASingleProviderNotAList() throws {
        let signature = try boundedFunctionBody(startingAt: "export async function broadcastEthMainnetRawTransaction(", upTo: "): Promise<EthereumBroadcastResult> {")
        XCTAssertTrue(signature.contains("provider: EthereumRpcProvider = ETHEREUM_PROVIDERS[0]"))
        XCTAssertFalse(signature.contains("providers: readonly EthereumRpcProvider[]"), "broadcast must take a single provider, never the full failover list")
    }

    // MARK: - Regression: existing balance behavior untouched (Stage 4C.2/4C.4)

    func testExistingBalanceFunctionRemainsUntouched() throws {
        let source = try ethereumRpcSource()
        XCTAssertTrue(source.contains("export async function fetchEthMainnetBalance("))
        XCTAssertTrue(source.contains("async function callEthGetBalance(rpcUrl: string, address: EthereumAddress): Promise<string> {"))
    }

    // MARK: - Helpers

    /// Bounded extraction of one top-level (column-0-indented) TypeScript
    /// function: from its exact signature-opening line through the first
    /// column-0 `}` that follows — never the whole file. Every function
    /// this audits declares its body at column 0 with 2-space-indented
    /// internals, so the first `"\n}"` after the signature is reliably its
    /// own closing brace, not an inner block's.
    private func boundedFunctionBody(startingAt signatureStart: String) throws -> String {
        let source = try ethereumRpcSource()
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    /// Bounded extraction of just a function's signature (parameter list),
    /// from its opening line through a caller-supplied end marker (the
    /// closing `)`/return-type line) — used where only the signature, not
    /// the whole body, needs to be asserted on.
    private func boundedFunctionBody(startingAt signatureStart: String, upTo signatureEnd: String) throws -> String {
        let source = try ethereumRpcSource()
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: signatureEnd, range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func ethereumRpcSource() throws -> String {
        try mobileAppSource(at: "src/services/ethereum-rpc.ts")
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
        // literals like 'pending'/'latest' this file asserts on).
        return source
            .components(separatedBy: .newlines)
            .filter { line in
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                return !trimmed.hasPrefix("//") && !trimmed.hasPrefix("/*") && !trimmed.hasPrefix("*")
            }
            .joined(separator: "\n")
    }
}
