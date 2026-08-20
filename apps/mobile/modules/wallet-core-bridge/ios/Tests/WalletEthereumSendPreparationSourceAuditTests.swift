import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.2.2 — permanent structural source-audit tests for Ethereum V1
/// native ETH Send transaction preparation:
/// `packages/chain-domain/src/ethereum-amount.ts` (ETH -> wei parsing) and
/// `apps/mobile/src/services/ethereum-send-preparation.ts` (recipient/amount
/// validation, fee/balance arithmetic, prepared-snapshot shape).
///
/// Same methodology as `WalletEthereumRpcSourceAuditTests`
/// (Stage 5G.2.1): bounded, structural assertions on function bodies —
/// never a whole-file/whole-string match — proving SHAPE (which helpers are
/// reused, which patterns are absent, which literal constants appear)
/// rather than exact formatting. Runtime/numeric correctness of the wei
/// parser and the fee/balance arithmetic was additionally verified via a
/// temporary executable scratch script (Node 22 `--experimental-strip-types`
/// against the real, unmodified production source) during this stage's
/// implementation; that script was deleted before final status per this
/// project's established methodology — this permanent suite cannot re-run
/// that numeric proof itself, and that gap is deliberately accepted and
/// documented, not hidden.
final class WalletEthereumSendPreparationSourceAuditTests: XCTestCase {
    // MARK: - ethereum-amount.ts (chain-domain)

    func testWeiParserReusesDecimalStringValidatorNotADuplicateRegex() throws {
        let source = try chainDomainSource(at: "ethereum-amount.ts")
        XCTAssertTrue(source.contains("toDecimalString"))
        XCTAssertTrue(source.contains("from './amount'"))
        // No second base-10-decimal-shaped regex literal defined in this file.
        XCTAssertFalse(source.contains("RegExp("))
        XCTAssertEqual(source.components(separatedBy: "[0-9]+").count - 1, 0,
                        "ethereum-amount.ts must not define its own decimal-shape character class; it must reuse chain-domain's toDecimalString")
    }

    func testWeiParserEnforcesExactly18FractionalDigitsAndZeroRejection() throws {
        let source = try chainDomainSource(at: "ethereum-amount.ts")
        XCTAssertTrue(source.contains("WEI_PER_ETH_DECIMALS = 18"))
        XCTAssertTrue(source.contains("fractionalPart.length > WEI_PER_ETH_DECIMALS"))
        XCTAssertTrue(source.contains("weiValue <= 0n"), "must reject a zero (or negative) wei result")
    }

    func testWeiParserUsesOnlyBigIntNeverFloatingPointConversion() throws {
        let body = try boundedFunctionBody(
            in: chainDomainSource(at: "ethereum-amount.ts"),
            startingAt: "export function parseEthDecimalStringToWei(input: string): AtomicAmount {"
        )
        XCTAssertTrue(body.contains("BigInt("))
        for term in ["parseFloat(", "parseInt(", "Number(", "Number.parseFloat(", "Number.parseInt("] {
            XCTAssertFalse(body.contains(term), "wei parser must not contain \(term)")
        }
    }

    func testWeiParserNeverTrimsWhitespace() throws {
        let source = try chainDomainSource(at: "ethereum-amount.ts")
        for term in [".trim(", ".trimStart(", ".trimEnd("] {
            XCTAssertFalse(source.contains(term), "wei parser must never trim whitespace — \(term) found")
        }
    }

    // MARK: - ethereum-send-preparation.ts (apps/mobile)

    func testPreparationInputAcceptsOnlyRecipientAndAmountFromCaller() throws {
        let signature = try boundedFunctionBody(
            in: mobileAppSource(at: "src/services/ethereum-send-preparation.ts"),
            startingAt: "export async function prepareEthereumV1Send(",
            upTo: "): Promise<EthereumV1PreparedSend> {"
        )
        XCTAssertTrue(signature.contains("recipientInput: string"))
        XCTAssertTrue(signature.contains("amountEthInput: string"))
        // Exactly these two parameters — no third caller-suppliable field
        // (nonce/gas/fee/chainId/RPC url) anywhere in the signature.
        for forbidden in ["nonce:", "gasLimit:", "gas:", "maxFeePerGas", "maxPriorityFeePerGas", "chainId:", "rpcUrl", "provider:"] {
            XCTAssertFalse(signature.contains(forbidden), "prepareEthereumV1Send must not accept \(forbidden) from the caller")
        }
    }

    func testRecipientValidationReusesChainDomainValidatorNotDuplicated() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        XCTAssertTrue(source.contains("toEthereumAddress"))
        XCTAssertTrue(source.contains("from 'chain-domain'"))
        // No second 40-hex-character address-shaped regex literal in this file.
        XCTAssertEqual(source.components(separatedBy: "{40}").count - 1, 0,
                        "ethereum-send-preparation.ts must not define a second Ethereum-address-shaped regex; it must reuse chain-domain's toEthereumAddress")
    }

    func testGasLimitIsExactly21000AndDataHexIsExactly0x() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        XCTAssertTrue(source.contains("NATIVE_ETH_TRANSFER_GAS_LIMIT = 21000"))
        XCTAssertTrue(source.contains("NATIVE_ETH_TRANSFER_DATA_HEX = '0x'"))
        // No eth_estimateGas call anywhere — this stage is fixed-gas only.
        XCTAssertFalse(source.contains("eth_estimateGas"))
    }

    func testFeeAndAffordabilityArithmeticIsBigIntAndUsesStrictGreaterThan() throws {
        let body = try boundedFunctionBody(
            in: mobileAppSource(at: "src/services/ethereum-send-preparation.ts"),
            startingAt: "function buildEthereumV1PreparedSend(input: EthereumV1PreparedSendInput): EthereumV1PreparedSend {"
        )
        XCTAssertTrue(body.contains("BigInt(gasLimit) * maxFeePerGasWei"), "maxFeeWei must be computed as gasLimit * maxFeePerGasWei")
        XCTAssertTrue(body.contains("amountWeiBigInt + maxFeeWei"), "totalMaxDebitWei must be amount + maxFee")
        XCTAssertTrue(body.contains("totalMaxDebitWei > balanceWei"),
                      "affordability must reject only when required funds STRICTLY exceed balance (amount+fee==balance must be accepted)")
        for term in ["parseFloat(", "parseInt(", "Number("] {
            XCTAssertFalse(body.contains(term), "preparation arithmetic must not contain \(term)")
        }
    }

    func testAffordabilityChecksAmountPlusFeeNeverAmountAlone() throws {
        let body = try boundedFunctionBody(
            in: mobileAppSource(at: "src/services/ethereum-send-preparation.ts"),
            startingAt: "function buildEthereumV1PreparedSend(input: EthereumV1PreparedSendInput): EthereumV1PreparedSend {"
        )
        XCTAssertFalse(body.contains("amountWeiBigInt > balanceWei"),
                        "must never gate affordability on amount alone, bypassing the fee reservation")
    }

    func testSelfSendIsNotRestricted() throws {
        // Documentation check against the RAW (comment-inclusive) source —
        // the self-send decision is recorded in a doc comment, which the
        // comment-stripping helper used everywhere else deliberately
        // removes.
        let rawSource = try mobileAppRawSource(at: "src/services/ethereum-send-preparation.ts")
        XCTAssertTrue(rawSource.contains("Self-send"), "the self-send decision must be documented, not silently absent")

        // Code-level check against the COMMENT-STRIPPED source — proves no
        // self-send rejection is actually implemented, independent of what
        // the (now-removed) comment says.
        let codeSource = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        XCTAssertFalse(codeSource.contains("senderAddress === recipient"))
        XCTAssertFalse(codeSource.contains("recipient === senderAddress"))
        XCTAssertFalse(codeSource.contains("recipient === input.senderAddress"))
    }

    func testPreparationNeverSignsOrBroadcasts() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        XCTAssertFalse(source.contains("signEthereumTransactionV1("), "preparation must never call the signing bridge")
        XCTAssertFalse(source.contains("broadcastEthMainnetRawTransaction("), "preparation must never broadcast")
    }

    func testNoSecretFieldNamesAnywhereInFile() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        for term in ["entropy", "mnemonic", "seed", "privateKey", "signedTxHex", "xpriv"] {
            XCTAssertFalse(source.lowercased().contains(term.lowercased()), "must never reference \(term)")
        }
    }

    func testNoConsoleLoggingAnywhereInFile() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        for term in ["console.log(", "console.warn(", "console.error(", "console.debug(", "console.info("] {
            XCTAssertFalse(source.contains(term), "ethereum-send-preparation.ts must not contain \(term)")
        }
    }

    func testPreparationErrorsAreNormalizedNeverRawProviderInternals() throws {
        let body = try boundedFunctionBody(
            in: mobileAppSource(at: "src/services/ethereum-send-preparation.ts"),
            startingAt: "export async function prepareEthereumV1Send("
        )
        // The catch block must always throw the normalized error type, and
        // must never re-throw or forward the caught error's own message.
        XCTAssertTrue(body.contains("throw new EthereumSendPreparationError("))
        XCTAssertFalse(body.contains("error.message"), "must never forward a raw underlying error message to the caller")
    }

    func testPreparedTransactionCarriesNoRefetchOrMutationAfterConstruction() throws {
        let source = try mobileAppSource(at: "src/services/ethereum-send-preparation.ts")
        // The prepared type's fields are all `readonly` — an immutable
        // snapshot, never mutated back into after construction.
        let readonlyCount = source.components(separatedBy: "readonly ").count - 1
        XCTAssertGreaterThanOrEqual(readonlyCount, 10, "EthereumV1PreparedSend's fields must all be readonly")
        XCTAssertFalse(source.contains(".nonce ="))
        XCTAssertFalse(source.contains(".recipient ="))
        XCTAssertFalse(source.contains(".amountWei ="))
    }

    func testIntentConversionRecomputesNothing() throws {
        let body = try boundedFunctionBody(
            in: mobileAppSource(at: "src/services/ethereum-send-preparation.ts"),
            startingAt: "export function toEthereumV1TransactionIntent("
        )
        for term in ["BigInt(", "parseEthDecimalStringToWei(", "fetchEthMainnetFeeData(", "fetchEthMainnetPendingNonce("] {
            XCTAssertFalse(body.contains(term), "toEthereumV1TransactionIntent must only reshape fields, never recompute \(term)")
        }
        XCTAssertTrue(body.contains("prepared.recipient"))
        XCTAssertTrue(body.contains("prepared.amountWei"))
        XCTAssertTrue(body.contains("prepared.nonce"))
    }

    // MARK: - Helpers

    /// Bounded extraction of one top-level (column-0-indented) TypeScript
    /// function: from its exact signature-opening line through the first
    /// column-0 `}` that follows.
    private func boundedFunctionBody(in source: String, startingAt signatureStart: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: "\n}", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    /// Bounded extraction of just a function's signature.
    private func boundedFunctionBody(in source: String, startingAt signatureStart: String, upTo signatureEnd: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signatureStart), "could not find \(signatureStart)")
        let end = try XCTUnwrap(source.range(of: signatureEnd, range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.upperBound])
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        return try readSourceStrippingFullLineComments(at: mobileAppSourceURL(at: relativePath))
    }

    private func mobileAppRawSource(at relativePath: String) throws -> String {
        return try String(contentsOf: mobileAppSourceURL(at: relativePath), encoding: .utf8)
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
