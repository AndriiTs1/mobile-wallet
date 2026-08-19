import Foundation
import LocalAuthentication
import XCTest
@testable import WalletCoreBridge

/// Stage 5F.2: tests for the isolated, unreachable-from-production
/// biometric authorization foundation. Every behavioral test injects a
/// `FakeBiometricAuthenticationContext` — never real Face ID/Touch ID
/// hardware — so these run identically on Simulator and CI, exactly the
/// dependency-injection pattern already established by
/// `WalletBackupConfirmationStoreTests`'s injectable `UserDefaults`.
/// Structural properties (no Expo surface, no persistence, no logging, no
/// `WalletSecureStorage` reference) are proven by source audit, the same
/// established technique used throughout this project's test suite.
final class WalletBiometricAuthorizerTests: XCTestCase {
    // MARK: - Fake context

    private final class FakeBiometricAuthenticationContext: WalletBiometricAuthenticationContext {
        var canEvaluateResult = true
        var evaluateResult: Result<Bool, Error> = .success(true)

        private(set) var callOrder: [String] = []
        private(set) var canEvaluatePolicyArgument: LAPolicy?
        private(set) var evaluatePolicyArgument: LAPolicy?
        private(set) var evaluatePolicyReasonArgument: String?

        func canEvaluatePolicy(_ policy: LAPolicy, error: NSErrorPointer) -> Bool {
            callOrder.append("canEvaluatePolicy")
            canEvaluatePolicyArgument = policy
            return canEvaluateResult
        }

        func evaluatePolicy(_ policy: LAPolicy, localizedReason: String) async throws -> Bool {
            callOrder.append("evaluatePolicy")
            evaluatePolicyArgument = policy
            evaluatePolicyReasonArgument = localizedReason
            switch evaluateResult {
            case .success(let value):
                return value
            case .failure(let error):
                throw error
            }
        }
    }

    // MARK: - 1: uses deviceOwnerAuthentication policy

    func testUsesDeviceOwnerAuthenticationPolicyForBothCalls() async throws {
        let fake = FakeBiometricAuthenticationContext()
        try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)

        XCTAssertEqual(fake.canEvaluatePolicyArgument, .deviceOwnerAuthentication)
        XCTAssertEqual(fake.evaluatePolicyArgument, .deviceOwnerAuthentication)
    }

    func testSourceNeverReferencesBiometricsOnlyPolicy() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertFalse(source.contains("deviceOwnerAuthenticationWithBiometrics"))
        XCTAssertTrue(source.contains(".deviceOwnerAuthentication"))
    }

    // MARK: - 2: canEvaluatePolicy checked before evaluatePolicy

    func testCanEvaluatePolicyIsCheckedBeforeEvaluatePolicy() async throws {
        let fake = FakeBiometricAuthenticationContext()
        try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)

        XCTAssertEqual(fake.callOrder, ["canEvaluatePolicy", "evaluatePolicy"])
    }

    func testEvaluatePolicyIsNeverCalledWhenUnavailable() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.canEvaluateResult = false

        await XCTAssertThrowsErrorAsync(try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake))
        XCTAssertEqual(fake.callOrder, ["canEvaluatePolicy"])
        XCTAssertNil(fake.evaluatePolicyArgument)
    }

    // MARK: - 3: successful authentication returns normally

    func testSuccessfulAuthenticationReturnsNormally() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .success(true)

        try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
        // Reaching here without a thrown error IS the assertion.
    }

    /// `evaluatePolicy` returning `false` without throwing is a real,
    /// documented possibility for `LAContext` — must still fail closed,
    /// not be treated as success.
    func testEvaluatePolicyReturningFalseFailsClosed() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .success(false)

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected .failed to be thrown")
        } catch WalletBiometricAuthorizationError.failed {
            // expected
        }
    }

    // MARK: - 4: failed authentication throws generic project-owned error

    func testFailedAuthenticationThrowsFailedCase() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .failure(LAError(.authenticationFailed))

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch WalletBiometricAuthorizationError.failed {
            // expected
        }
    }

    // MARK: - 5: cancellation throws generic project-owned error

    func testUserCancellationThrowsCancelledCase() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .failure(LAError(.userCancel))

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch WalletBiometricAuthorizationError.cancelled {
            // expected
        }
    }

    func testSystemAndAppCancellationAlsoThrowCancelledCase() async throws {
        for code in [LAError.Code.systemCancel, .appCancel] {
            let fake = FakeBiometricAuthenticationContext()
            fake.evaluateResult = .failure(LAError(code))

            do {
                try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
                XCTFail("expected an error to be thrown for \(code)")
            } catch WalletBiometricAuthorizationError.cancelled {
                // expected
            }
        }
    }

    // MARK: - 6: unavailable authentication fails closed

    func testUnavailableThrowsUnavailableCase() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.canEvaluateResult = false

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch WalletBiometricAuthorizationError.unavailable {
            // expected
        }
    }

    // MARK: - 7: evaluation error fails closed

    func testUnrecognizedLAErrorCodeFailsClosedAsFailed() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .failure(LAError(.biometryLockout))

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch WalletBiometricAuthorizationError.failed {
            // expected — biometryLockout isn't specifically classified as
            // "cancelled," so it must fail closed as "failed."
        }
    }

    func testNonLAErrorFailsClosedAsFailed() async throws {
        struct SomeOtherError: Error {}
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .failure(SomeOtherError())

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch WalletBiometricAuthorizationError.failed {
            // expected
        }
    }

    // MARK: - 8: raw LAError/NSError is not returned

    func testThrownErrorIsAlwaysTheProjectOwnedTypeNeverLAError() async throws {
        let fake = FakeBiometricAuthenticationContext()
        fake.evaluateResult = .failure(LAError(.authenticationFailed))

        do {
            try await WalletBiometricAuthorizer.authorize(reason: "Test reason", context: fake)
            XCTFail("expected an error to be thrown")
        } catch {
            XCTAssertTrue(error is WalletBiometricAuthorizationError)
            XCTAssertFalse(error is LAError, "LAError must never cross this function's boundary")
        }
    }

    func testAuthorizationErrorCasesCarryNoAssociatedValues() throws {
        // Structural: Equatable with no associated values means there is
        // no OS detail (code, description, userInfo) attachable to any
        // case in the first place.
        XCTAssertEqual(WalletBiometricAuthorizationError.unavailable, .unavailable)
        XCTAssertEqual(WalletBiometricAuthorizationError.cancelled, .cancelled)
        XCTAssertEqual(WalletBiometricAuthorizationError.failed, .failed)
        XCTAssertNotEqual(WalletBiometricAuthorizationError.unavailable, .failed)
    }

    // MARK: - 9: no reusable authorization token exists

    func testAuthorizeReturnsVoidNotAToken() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertTrue(source.contains("static func authorize("))
        // No `-> Bool`/`-> String`/`-> LAContext`/token-shaped return type
        // anywhere near the declaration — the function signature itself
        // is `async throws` with an implicit `Void` return.
        XCTAssertTrue(source.contains(") async throws {"))
    }

    // MARK: - 10/11: no persistence of any kind

    func testNoPersistenceOfAnyKind() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        for term in ["UserDefaults", "Keychain", "kSecClass", "SecItemAdd", "AsyncStorage", "FileManager", "SecureStore"] {
            XCTAssertFalse(source.contains(term), "WalletBiometricAuthorizer.swift must not contain \(term)")
        }
    }

    // MARK: - 12: WalletSecureStorage remains untouched

    func testDoesNotReferenceWalletSecureStorage() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertFalse(source.contains("WalletSecureStorage"))
        XCTAssertFalse(source.contains("SecAccessControl"))
        XCTAssertFalse(source.contains("biometryCurrentSet"))
        XCTAssertFalse(source.contains("biometryAny"))
        XCTAssertFalse(source.contains("userPresence"))
    }

    // MARK: - 13/14: no Expo Function/AsyncFunction, no RN surface

    func testNoExpoOrRNSurfaceInThisFile() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        for term in ["Function(", "AsyncFunction(", "WalletCoreBridgeModule", "requireNativeModule", "NativeModule"] {
            XCTAssertFalse(source.contains(term), "WalletBiometricAuthorizer.swift must not contain \(term)")
        }
    }

    /// Stage 5F.2 asserted this file never referenced
    /// `WalletBiometricAuthorizer`/"Biometric" at all — correct for that
    /// foundation-only stage, where nothing in production called it yet.
    /// Stage 5F.4A intentionally supersedes that: `requestAppUnlock` is the
    /// one approved direct production bridge use (its own delegation shape
    /// is already covered in detail by `WalletAppUnlockBridgeTests`, so
    /// this test only re-expresses the still-valid part of the old
    /// invariant — no broader biometric API/token/state surface exists
    /// than that single, isolated call, and recovery reveal stays on its
    /// own independent path).
    func testAuthorizerIsOnlyReferencedFromTheApprovedAppUnlockPath() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")

        let occurrences = source.components(separatedBy: "WalletBiometricAuthorizer").count - 1
        XCTAssertEqual(occurrences, 1, "WalletBiometricAuthorizer must be referenced exactly once in this file")

        let functionStart = try XCTUnwrap(source.range(of: "AsyncFunction(\"requestAppUnlock\") {"))
        let functionEnd = try XCTUnwrap(source.range(of: "\n    }", range: functionStart.upperBound..<source.endIndex))
        let body = source[functionStart.upperBound..<functionEnd.lowerBound]
        XCTAssertTrue(body.contains("WalletBiometricAuthorizer"), "the sole reference must live inside requestAppUnlock")

        // No broader biometric API/token/state surface than that one call.
        for term in ["LAContext", "LAPolicy", "biometryType", "authToken", "biometricToken", "authState", "isAuthenticated"] {
            XCTAssertFalse(source.contains(term), "WalletCoreBridgeModule.swift must not expose \(term)")
        }

        // Recovery reveal remains on its own independent path — not
        // routed through this call.
        XCTAssertTrue(source.contains("try await WalletBackupPhrasePresenter.presentGatedReveal()"))
        XCTAssertFalse(body.contains("WalletBackupPhrasePresenter"))
    }

    /// Stage 5F.2 asserted this file never referenced biometric/auth
    /// concepts at all — correct before any biometric-gated capability was
    /// exposed to RN. Stage 5F.4A adds exactly one:
    /// `requestAppUnlock(): Promise<void>`. This re-expresses the
    /// still-valid part of the old invariant — no broader biometric API/
    /// token/state (no policy type, no OS context, no token/state result)
    /// crosses into the TypeScript contract than that one
    /// Promise<void>-shaped declaration.
    func testWalletCoreBridgeModuleTypeScriptExposesNoBroaderBiometricSurfaceThanAppUnlock() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.ts", subdirectory: "src")
        XCTAssertTrue(source.contains("requestAppUnlock(): Promise<void>;"), "the one approved biometric-gated declaration must still be present")

        for term in ["LAPolicy", "LAContext", "biometryType", "authToken", "authState"] {
            XCTAssertFalse(source.contains(term), "WalletCoreBridgeModule.ts must not expose \(term)")
        }
    }

    // MARK: - 15: no DEBUG authentication bypass exists

    func testNoDebugBypassExists() throws {
        let rawSource = try rawSource(of: "WalletBiometricAuthorizer.swift")
        XCTAssertFalse(rawSource.contains("#if DEBUG"))
    }

    // MARK: - 16: no logging of authentication errors/details

    func testNoLoggingOfAnyKind() throws {
        let source = try codeOnlySource(of: "WalletBiometricAuthorizer.swift")
        for term in ["print(", "NSLog", "os_log", "Logger("] {
            XCTAssertFalse(source.contains(term), "WalletBiometricAuthorizer.swift must not contain \(term)")
        }
    }

    // MARK: - Helpers

    private func rawSource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(filename)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func codeOnlySource(of filename: String, subdirectory: String? = nil) throws -> String {
        var url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
        if let subdirectory {
            // `src/` is a sibling of `ios/` under `wallet-core-bridge/`,
            // not nested inside it — one more level up before descending
            // into the requested sibling subdirectory.
            url = url
                .deletingLastPathComponent() // wallet-core-bridge/
                .appendingPathComponent(subdirectory)
        }
        url = url.appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }

    /// Small async-friendly `XCTAssertThrowsError` — this project's tests
    /// otherwise rely on synchronous `do`/`catch` for async throwing
    /// calls (see the tests above), but this one call site benefits from
    /// the terser form.
    private func XCTAssertThrowsErrorAsync(
        _ expression: @autoclosure () async throws -> Void,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            try await expression()
            XCTFail("expected an error to be thrown", file: file, line: line)
        } catch {
            // expected
        }
    }
}
