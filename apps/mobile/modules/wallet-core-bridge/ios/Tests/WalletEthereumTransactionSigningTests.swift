import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5G.1 — tests for the Ethereum V1 transaction-signing security
/// foundation: `WalletNativeEthereumTransactionSigner.swift` (the native
/// orchestrator) and `WalletCoreBridgeModule.swift`'s `signEthereumTransactionV1`
/// (the one production bridge operation).
///
/// Consistent with this project's whole existing methodology
/// (`WalletAppUnlockBridgeTests`, `WalletBackupPhraseGatedRevealTests`),
/// these are structural source audits — they prove the code's shape,
/// ordering, and isolation from other authorization flows, not live
/// Face ID/Touch ID behavior, which only a physical iPhone can exercise
/// (ADR-005 §19).
final class WalletEthereumTransactionSigningTests: XCTestCase {
    // MARK: - 1: a fresh WalletBiometricAuthorizer authorization exists

    func testSignerCallsWalletBiometricAuthorizerAuthorize() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        // The real `WalletBiometricAuthorizer.authorize` call is what the
        // `authorize` parameter's PRODUCTION default actually invokes
        // (never overridden outside tests — see that parameter's own doc
        // comment).
        XCTAssertTrue(source.contains("try await WalletBiometricAuthorizer.authorize(reason: reason)"))
        XCTAssertTrue(source.contains("readEntropy: () throws -> Data = { try WalletSecureStorage.read() }"))
    }

    // MARK: - 2/3/4: authorization -> SecureStorage.read() -> Rust signing,
    // strictly in that order, with no path that reaches a later step
    // without the earlier one having succeeded

    func testAuthorizationPrecedesSecureStorageReadPrecedesRustSigningCall() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        // Bounded to the function BODY only (see
        // `testAuthorizationFailureUnconditionallyAbortsBeforeStorageOrSigning`'s
        // identical rationale) — proves the real call order inside the
        // function, not the incidental lexical order of the `authorize`/
        // `readEntropy` parameter declarations above it.
        let bodyStart = try XCTUnwrap(source.range(of: ") async throws -> WalletSignedEthereumV1Transaction {"))
        let body = source[bodyStart.upperBound...]

        let authorizeRange = try XCTUnwrap(body.range(of: "try await authorize("))
        let storageReadRange = try XCTUnwrap(body.range(of: "readEntropy()"))
        let signingCallRange = try XCTUnwrap(body.range(of: "dangerousNativeOnlySignEthereumTransactionV1(entropy:"))

        XCTAssertTrue(authorizeRange.upperBound < storageReadRange.lowerBound, "authorization must be requested before entropy is ever read")
        XCTAssertTrue(storageReadRange.upperBound < signingCallRange.lowerBound, "entropy must be read before the Rust signing call")
    }

    /// The authorization `catch` block must unconditionally throw (no
    /// fallthrough), so a rejected/failed/unavailable authorization can
    /// never reach `WalletSecureStorage.read()` or the Rust signing call —
    /// both of which live in a separate `do` block, entered only after the
    /// first `do` block completes without throwing.
    func testAuthorizationFailureUnconditionallyAbortsBeforeStorageOrSigning() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")

        // Bounded to the function BODY (after the parameter list closes),
        // so this asserts the real control flow — not the unrelated fact
        // that the `authorize`/`readEntropy` parameter defaults happen to
        // be declared in that lexical order above the body.
        let bodyStart = try XCTUnwrap(source.range(of: ") async throws -> WalletSignedEthereumV1Transaction {"))
        let body = source[bodyStart.upperBound...]

        let firstDoRange = try XCTUnwrap(body.range(of: "do {\n            try await authorize("))
        let firstCatchStart = try XCTUnwrap(body.range(of: "} catch {\n            throw WalletEthereumSigningError.authenticationFailed\n        }", range: firstDoRange.upperBound..<body.endIndex))

        let storageReadRange = try XCTUnwrap(body.range(of: "readEntropy()"))
        let signingCallRange = try XCTUnwrap(body.range(of: "dangerousNativeOnlySignEthereumTransactionV1(entropy:"))

        XCTAssertTrue(firstCatchStart.upperBound < storageReadRange.lowerBound)
        XCTAssertTrue(firstCatchStart.upperBound < signingCallRange.lowerBound)
    }

    // MARK: - Behavioral (Stage 5G.3 audit): the real function, exercised
    // with fakes at its two natural boundary points — not just a source
    // audit of its shape. See `WalletNativeEthereumTransactionSigner.sign`'s
    // own doc comment for why `authorize`/`readEntropy` exist.

    private static let sampleIntent = WalletEthereumV1TransactionIntent(
        chainId: 1,
        nonce: 0,
        toHex: "0x000000000000000000000000000000000000dEaD",
        valueWeiDecimal: "0",
        gasLimit: 21000,
        maxFeePerGasWeiDecimal: "30000000000",
        maxPriorityFeePerGasWeiDecimal: "1000000000",
        dataHex: "0x"
    )

    func testAuthorizationFailureBehaviorallyNeverReadsEntropy() async {
        var entropyReadCount = 0
        do {
            _ = try await WalletNativeEthereumTransactionSigner.sign(
                intent: Self.sampleIntent,
                authorize: { _ in throw WalletBiometricAuthorizationError.cancelled },
                readEntropy: {
                    entropyReadCount += 1
                    return Data()
                }
            )
            XCTFail("expected signing to throw when authorization fails")
        } catch let error as WalletEthereumSigningError {
            XCTAssertEqual(error, .authenticationFailed)
        } catch {
            XCTFail("expected WalletEthereumSigningError, got \(error)")
        }
        XCTAssertEqual(entropyReadCount, 0, "entropy must never be read when authorization fails — proven by real execution, not just source shape")
    }

    func testSuccessfulAuthorizationBehaviorallyReadsEntropyExactlyOnce() async {
        var authorizeCallCount = 0
        var entropyReadCount = 0
        do {
            // Malformed (empty) entropy deliberately makes the subsequent
            // Rust FFI call fail — this test only needs to observe that
            // authorization succeeding leads to exactly one entropy read
            // and an attempted signing call, never that the FFI call
            // itself succeeds (that is `wallet-core`'s own, separately
            // tested, responsibility).
            _ = try await WalletNativeEthereumTransactionSigner.sign(
                intent: Self.sampleIntent,
                authorize: { _ in authorizeCallCount += 1 },
                readEntropy: {
                    entropyReadCount += 1
                    return Data()
                }
            )
            XCTFail("expected signing to fail with malformed (empty) entropy")
        } catch let error as WalletEthereumSigningError {
            XCTAssertEqual(error, .signingFailed)
        } catch {
            XCTFail("expected WalletEthereumSigningError, got \(error)")
        }
        XCTAssertEqual(authorizeCallCount, 1, "authorize must be called exactly once")
        XCTAssertEqual(entropyReadCount, 1, "entropy must be read exactly once, only after authorization succeeded")
    }

    // MARK: - 5: no reusable auth token/state anywhere in the orchestrator

    func testSignerHasNoReusableAuthTokenOrPersistedState() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        for term in [
            "authToken", "authState", "authenticated =", "UserDefaults", "Keychain", "kSecClass",
            "static var", "class var",
        ] {
            XCTAssertFalse(source.contains(term), "WalletNativeEthereumTransactionSigner.swift must not contain \(term)")
        }
    }

    // MARK: - 6/7: App Unlock / recovery reveal cannot satisfy signing auth

    func testSignerNeverReferencesAppUnlockOrRevealTypes() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        for term in [
            "requestAppUnlock", "requestRevealBackup", "WalletBackupPhrasePresenter",
            "WalletNativeMnemonicReconstructor", "WalletNativeCreateOrchestrator",
        ] {
            XCTAssertFalse(source.contains(term), "WalletNativeEthereumTransactionSigner.swift must not reference \(term)")
        }
    }

    // MARK: - 8: bridge surfaces contain no secret-bearing fields

    func testNoSecretTermsInSignerOrBridgeFiles() throws {
        // The native orchestrator legitimately reads and forwards raw
        // `entropy` bytes to Rust (the same, already-established pattern
        // `WalletNativeMnemonicReconstructor.swift` uses) — that is not a
        // violation. It must still never touch the mnemonic sentence,
        // seed, private key, or xpriv, since those are reconstructed and
        // consumed entirely inside Rust.
        let signerSource = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        for term in ["mnemonic", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                signerSource.range(of: term, options: .caseInsensitive),
                "WalletNativeEthereumTransactionSigner.swift must not reference \(term)"
            )
        }

        // The RN-facing bridge module must never touch any of these,
        // `entropy` included — it never reads storage directly at all.
        let bridgeSource = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                bridgeSource.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not reference \(term)"
            )
        }

        for path in [
            "src/WalletCoreBridge.types.ts",
            "src/WalletCoreBridgeModule.ts",
        ] {
            let source = try walletCoreBridgeSource(at: path)
            for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
                XCTAssertNil(
                    source.range(of: term, options: .caseInsensitive),
                    "\(path) must not reference \(term)"
                )
            }
        }

        let rnServiceSource = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        for term in ["mnemonic", "entropy", "seed", "privateKey", "xpriv"] {
            XCTAssertNil(
                rnServiceSource.range(of: term, options: .caseInsensitive),
                "wallet-core-bridge.ts must not reference \(term)"
            )
        }
    }

    /// `EthereumV1TransactionIntentInput` (the RN-facing input shape) and
    /// `EthereumV1SignedTransactionOutput` (the RN-facing result shape)
    /// destructure to exactly their known-safe fields — this fails to
    /// compile if a secret- or hash-bearing field is ever silently added
    /// to either.
    func testBridgeRecordShapesHaveNoExtraFields() {
        let intent = EthereumV1TransactionIntentInput()
        intent.chainId = 1
        intent.nonce = 0
        intent.toHex = "0x0000000000000000000000000000000000000000"
        intent.valueWeiDecimal = "0"
        intent.gasLimit = 21000
        intent.maxFeePerGasWeiDecimal = "0"
        intent.maxPriorityFeePerGasWeiDecimal = "0"
        intent.dataHex = "0x"

        let output = EthereumV1SignedTransactionOutput()
        output.signedTxHex = "0x02"
        output.txHashHex = "0x00"

        // No destructuring is used here since `Record`-conforming structs
        // use `@Field` property wrappers rather than plain stored
        // properties — instead, `toDictionary` (from Expo's `Record`
        // protocol) is asserted to have exactly the expected key set,
        // which is the shape RN actually observes.
        XCTAssertEqual(
            Set(intent.toDictionary(appContext: nil).keys),
            ["chainId", "nonce", "toHex", "valueWeiDecimal", "gasLimit", "maxFeePerGasWeiDecimal", "maxPriorityFeePerGasWeiDecimal", "dataHex"]
        )
        XCTAssertEqual(Set(output.toDictionary(appContext: nil).keys), ["signedTxHex", "txHashHex"])
    }

    // MARK: - 9: generic errors only — no associated values on either error enum

    func testErrorEnumsCarryNoAssociatedValues() throws {
        let source = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        let enumStart = try XCTUnwrap(source.range(of: "enum WalletEthereumSigningError: Error, Equatable {"))
        let enumEnd = try XCTUnwrap(source.range(of: "\n}", range: enumStart.upperBound..<source.endIndex))
        let body = source[enumStart.upperBound..<enumEnd.lowerBound]

        XCTAssertTrue(body.contains("case authenticationFailed"))
        XCTAssertTrue(body.contains("case signingFailed"))
        // No case carries an associated value — every `case` line ends at
        // the case name, never followed by a parenthesized payload.
        for line in body.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("case ") {
                XCTAssertFalse(trimmed.contains("("), "error case must carry no associated value: \(trimmed)")
            }
        }
    }

    // MARK: - 10: no secret/error-detail logging

    func testNoLoggingInSignerOrBridgeAdditions() throws {
        let signerSource = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        for term in ["print(", "NSLog", "os_log", "debugPrint("] {
            XCTAssertFalse(signerSource.contains(term), "WalletNativeEthereumTransactionSigner.swift must not contain \(term)")
        }

        let bridgeBody = try signEthereumTransactionV1Body()
        for term in ["print(", "NSLog", "os_log", "debugPrint("] {
            XCTAssertFalse(bridgeBody.contains(term), "signEthereumTransactionV1 body must not contain \(term)")
        }
    }

    // MARK: - 11: dangerous_native_only signing symbol appears only in the
    // approved native-only layer, never in an RN-facing bridge file

    func testDangerousSigningSymbolOnlyInApprovedNativeLayer() throws {
        let signerSource = try codeOnlySource(of: "WalletNativeEthereumTransactionSigner.swift")
        XCTAssertTrue(signerSource.contains("dangerousNativeOnlySignEthereumTransactionV1"), "the orchestrator must be the one that actually calls the dangerous FFI signing function")

        for filename in ["WalletCoreBridgeModule.swift"] {
            let source = try codeOnlySource(of: filename)
            XCTAssertFalse(
                source.range(of: "dangerous_native_only|DangerousNativeOnly", options: .regularExpression) != nil,
                "\(filename) must never reference a dangerous_native_only_* symbol"
            )
        }

        for path in ["src/WalletCoreBridge.types.ts", "src/WalletCoreBridgeModule.ts"] {
            let source = try walletCoreBridgeSource(at: path)
            XCTAssertFalse(
                source.range(of: "dangerous_native_only|DangerousNativeOnly", options: .regularExpression) != nil,
                "\(path) must never reference a dangerous_native_only_* symbol"
            )
        }
    }

    // MARK: - Bridge surface: exactly one production Function

    func testSignEthereumTransactionV1ExistsAndDelegatesToTheSigner() throws {
        let body = try signEthereumTransactionV1Body()
        XCTAssertTrue(body.contains("WalletNativeEthereumTransactionSigner.sign("))
    }

    func testBridgeFunctionBodyReferencesNoForbiddenTypes() throws {
        let body = try signEthereumTransactionV1Body()
        for term in [
            "WalletSecureStorage", "WalletBackupPhrasePresenter",
            "WalletNativeMnemonicReconstructor", "WalletNativeCreateOrchestrator",
            "UserDefaults", "Keychain", "kSecClass",
        ] {
            XCTAssertFalse(body.contains(term), "signEthereumTransactionV1 body must not reference \(term)")
        }
    }

    func testTypeScriptDeclarationReturnsSignedTransactionPromise() throws {
        let source = try walletCoreBridgeSource(at: "src/WalletCoreBridgeModule.ts")
        XCTAssertTrue(source.contains("signEthereumTransactionV1(intent: EthereumV1TransactionIntent): Promise<EthereumV1SignedTransaction>;"))
    }

    func testRNServiceWrapperExistsAndDelegatesCorrectly() throws {
        let source = try mobileAppSource(at: "src/services/wallet-core-bridge.ts")
        XCTAssertTrue(source.contains("signEthereumTransactionV1(intent: EthereumV1TransactionIntent): Promise<EthereumV1SignedTransaction>;"))
        XCTAssertTrue(source.contains("export function signEthereumTransactionV1("))
        XCTAssertTrue(source.contains("return bridge.signEthereumTransactionV1(intent);"))
    }

    // MARK: - 12: existing App Lock / recovery / privacy behavior remains untouched

    func testExistingAppUnlockAndRevealFunctionsStillDelegateCorrectly() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertTrue(source.contains("AsyncFunction(\"requestAppUnlock\") {"))
        XCTAssertTrue(source.contains("try await WalletBiometricAuthorizer.authorize(reason: \"Unlock Mobile Wallet\")"))
        XCTAssertTrue(source.contains("AsyncFunction(\"requestRevealBackup\") {"))
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.presentGatedReveal()"))
    }

    func testWalletBiometricAuthorizerAndSecureStorageUnchangedByThisStage() throws {
        let authorizerSource = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertTrue(authorizerSource.contains(".deviceOwnerAuthentication"))
        XCTAssertFalse(authorizerSource.contains("deviceOwnerAuthenticationWithBiometrics"))
        XCTAssertFalse(authorizerSource.contains("WalletNativeEthereumTransactionSigner"), "the authorizer must remain a generic primitive with no knowledge of its callers")

        let storageSource = try codeOnlySource(of: "WalletSecureStorage.swift")
        XCTAssertFalse(storageSource.contains("WalletNativeEthereumTransactionSigner"), "SecureStorage must remain a generic primitive with no knowledge of its callers")
    }

    func testExistingPrivacyAndAppLockConstantsUnchanged() throws {
        let layoutSource = try mobileAppSource(at: "src/app/_layout.tsx")
        XCTAssertTrue(layoutSource.contains("const BACKGROUND_GRACE_PERIOD_MS = 15_000;"))
        XCTAssertTrue(layoutSource.contains("const INITIAL_UNLOCK_HOLD_MS = 1000;"))
    }

    // MARK: - Helpers

    private func signEthereumTransactionV1Body() throws -> Substring {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        let range = try XCTUnwrap(source.range(of: "AsyncFunction(\"signEthereumTransactionV1\")"))
        let openBrace = try XCTUnwrap(source.range(of: "{", range: range.upperBound..<source.endIndex))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: openBrace.upperBound..<source.endIndex))
        return source[openBrace.upperBound..<closingRange.lowerBound]
    }

    private func codeOnlySource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    private func mobileAppSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .deletingLastPathComponent() // modules/
            .deletingLastPathComponent() // apps/mobile/
            .appendingPathComponent(relativePath)
        return try commentStrippedTSSource(at: url)
    }

    private func walletCoreBridgeSource(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
            .deletingLastPathComponent() // wallet-core-bridge/
            .appendingPathComponent(relativePath)
        return try commentStrippedTSSource(at: url)
    }

    private func commentStrippedTSSource(at url: URL) throws -> String {
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
