import Foundation
import LocalAuthentication

// Stage 5F.2 — native biometric/device-owner authorization FOUNDATION ONLY.
//
// Not wired into any real flow: no Expo Function/AsyncFunction exists
// anywhere in this file, it is never referenced from
// WalletCoreBridgeModule.swift, and no RN screen calls into it, directly
// or indirectly. This is deliberately unreachable production code — Stage
// 5F.1's audit conclusion was that the actual reveal/app-unlock gates
// belong in later, separately-reviewed stages (5F.3+); this stage only
// proves the authorization primitive itself, in isolation, exactly the
// same "isolated foundation" shape Stage 5E.9B used for
// `WalletBackupConfirmationStore`.
//
// `internal` throughout (Swift's default access level — no `public`
// anywhere in this file), lives outside the three files the Stage 5D.8B
// bridge guard scans (WalletCoreBridgeModule.swift,
// WalletCoreBridge.types.ts, WalletCoreBridgeModule.ts).
//
// Policy: `.deviceOwnerAuthentication` (Face ID/Touch ID OR device
// passcode), never `.deviceOwnerAuthenticationWithBiometrics` — per Stage
// 5F.1 §E/§J and ADR-005 §8's already-decided stance that recovery-phrase
// reveal and (later) signing must accept device-credential fallback, not
// only biometrics. iOS's own `LAContext` already implements the retry/
// fallback-to-passcode sequencing (ADR-005 §8's fallback table) —
// nothing here duplicates or reimplements that platform behavior.
//
// Does NOT touch `WalletSecureStorage` or its `SecAccessControl` flags —
// Stage 5F.1 §E explicitly decided against binding the Secure Enclave key
// to `.biometryCurrentSet`/`.biometryAny` for V1 (a Face ID re-enrollment
// would otherwise permanently invalidate the stored entropy with no
// recovery path other than a full phrase-based restore). This authorizer
// is a purely application-level gate, independent of that storage layer;
// a future caller decides when to invoke it, this file only answers
// "did device-owner authentication just succeed," never touching secret
// material itself.

/// Non-secret, closed, project-owned failure surface. Deliberately does
/// NOT wrap or expose `LAError`, `NSError`, `OSStatus`, or any OS-supplied
/// description string — see this file's own "Error boundary" discipline
/// in `WalletBiometricAuthorizer.authorize(reason:context:)` below. No
/// case carries an associated value; there is nothing here for a caller
/// to accidentally surface as user-facing OS detail.
enum WalletBiometricAuthorizationError: Error, Equatable {
    /// Device-owner authentication is not currently possible at all —
    /// e.g. no biometry and no device passcode configured, or the
    /// platform reports it structurally unavailable. Detected via
    /// `canEvaluatePolicy` before any prompt is ever attempted.
    case unavailable
    /// The user (or the system, e.g. another app taking foreground)
    /// cancelled the authentication prompt.
    case cancelled
    /// Authentication was attempted and did not succeed — a wrong
    /// biometric match, wrong passcode, lockout reached mid-attempt, or
    /// any other evaluation failure not specifically classified as
    /// `.cancelled`. Also the safe default for any error shape this file
    /// does not explicitly recognize — fail closed, never fail open.
    case failed
}

/// The smallest slice of `LAContext`'s own API surface this authorizer
/// actually needs — not a general-purpose authentication framework.
/// `LAContext` itself already satisfies this protocol's requirements
/// exactly (see the `extension LAContext` below), so production code
/// needs no adapter/wrapper type; tests inject a lightweight fake instead
/// of exercising real Face ID/Touch ID hardware, mirroring this project's
/// existing dependency-injection pattern (e.g.
/// `WalletBackupConfirmationStore`'s injectable `UserDefaults`).
protocol WalletBiometricAuthenticationContext {
    /// Matches `LAContext.canEvaluatePolicy(_:error:)` exactly — a
    /// synchronous, side-effect-free capability check, never itself
    /// prompting the user.
    func canEvaluatePolicy(_ policy: LAPolicy, error: NSErrorPointer) -> Bool
    /// Matches `LAContext.evaluatePolicy(_:localizedReason:)` exactly —
    /// the actual (possibly user-facing) authentication attempt.
    func evaluatePolicy(_ policy: LAPolicy, localizedReason: String) async throws -> Bool
}

extension LAContext: WalletBiometricAuthenticationContext {}

enum WalletBiometricAuthorizer {
    /// Requests fresh device-owner authorization (Face ID, Touch ID, or
    /// device passcode fallback — see this file's header comment on
    /// policy choice). Returns normally only on success; throws a
    /// `WalletBiometricAuthorizationError` case in every other
    /// circumstance. Performs exactly one evaluation per call — nothing
    /// here caches a result, a timestamp, or any other authorization
    /// state across calls (Stage 5F.2's own "one authorization evaluation
    /// per call" requirement; no `UserDefaults`/Keychain/file write of
    /// any kind exists in this file).
    ///
    /// `reason` is the OS-displayed prompt text (e.g. "Use Face ID to
    /// reveal your recovery phrase") — plain UI copy, never a secret,
    /// never logged.
    ///
    /// Not `@MainActor`-isolated, unlike `WalletBackupPhrasePresenter`:
    /// this file never touches `UIViewController`/`UIHostingController`
    /// directly — `LAContext` presents and manages its own system prompt
    /// UI internally and is documented as safe to invoke off the main
    /// thread. Keeping this un-isolated keeps it reusable from whatever
    /// actor context a future caller (app-unlock gate, reveal gate,
    /// eventual signing gate) happens to run on, without forcing an
    /// unnecessary actor hop here.
    ///
    /// Error boundary: every thrown error from `context.evaluatePolicy`
    /// (an `LAError` in real usage, always) is caught and remapped to a
    /// `WalletBiometricAuthorizationError` case below — the original
    /// `LAError`/`NSError`, its `code`, and its `localizedDescription`
    /// never leave this function. `canEvaluatePolicy`'s own `NSErrorPointer`
    /// output is inspected only to decide whether to call `evaluatePolicy`
    /// at all — its value is never read, stored, or surfaced.
    static func authorize(
        reason: String,
        context: WalletBiometricAuthenticationContext = LAContext()
    ) async throws {
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else {
            throw WalletBiometricAuthorizationError.unavailable
        }

        let success: Bool
        do {
            success = try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch let laError as LAError {
            switch laError.code {
            case .userCancel, .systemCancel, .appCancel:
                throw WalletBiometricAuthorizationError.cancelled
            default:
                // biometryLockout, biometryNotAvailable, biometryNotEnrolled,
                // passcodeNotSet, authenticationFailed, and any future case
                // this file doesn't explicitly special-case — all fail
                // closed as `.failed` rather than leaking which one
                // occurred.
                throw WalletBiometricAuthorizationError.failed
            }
        } catch {
            // Not an LAError at all (not expected from a real LAContext,
            // but the injected fake context in tests can throw anything) —
            // still fails closed, never fails open.
            throw WalletBiometricAuthorizationError.failed
        }

        guard success else {
            throw WalletBiometricAuthorizationError.failed
        }
    }
}
