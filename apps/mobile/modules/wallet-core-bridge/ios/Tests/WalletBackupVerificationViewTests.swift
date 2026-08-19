import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.9D: tests for the native backup-verification screen and its
/// wiring into `WalletBackupPhraseView`'s flow. Real SwiftUI button-tap
/// interaction is not exercised at runtime here — doing so would require
/// a UI-test target this project has deliberately not introduced (see
/// `WalletCreateAndBackupPresenterTests`'s own established precedent for
/// "source audits preferred over unreasonable UI-test infrastructure").
/// Instead: source audits prove the structural/architectural properties
/// (flow wiring, single write-site, no-secret-to-Expo, no logging/
/// clipboard/share), and direct `WalletBackupVerificationModel` calls
/// (already unit-tested in `WalletBackupVerificationModelTests`, Stage
/// 5E.9C) prove the validation semantics this screen merely consumes.
/// All mnemonics here are obviously synthetic, never a real phrase.
final class WalletBackupVerificationViewTests: XCTestCase {
    private let syntheticMnemonic =
        "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"

    // MARK: - A: phrase Continue transitions to verification, not completion

    func testPhraseScreenContinueTransitionsToVerificationNotCompletion() throws {
        let source = try codeOnlySource(of: "WalletBackupPhraseView.swift")
        // Stage 5E.9E3 (final correction): Continue's action closure grew
        // a second statement (clearing `showAttemptsExhaustedNotice`), so
        // this is bounded rather than a single-line literal match.
        let buttonRange = try XCTUnwrap(source.range(of: "Button(action: {"))
        let closingRange = try XCTUnwrap(source.range(of: "}) {", range: buttonRange.upperBound..<source.endIndex))
        let actionBody = source[buttonRange.upperBound..<closingRange.lowerBound]
        XCTAssertTrue(actionBody.contains("isVerifying = true"), "Continue must flip local flow state to verification")

        XCTAssertFalse(
            source.contains("Button(action: onWrittenDown)"),
            "Continue must no longer call onWrittenDown directly"
        )
        // The single place `onWrittenDown` is actually invoked as a
        // callback in this file must be as the verification screen's
        // `onVerified` parameter, not from the phrase screen's own CTA.
        XCTAssertTrue(source.contains("onVerified: onWrittenDown"))
    }

    // MARK: - B: exactly 3 questions, model-backed (not hardcoded)

    func testVerificationScreenIsModelBackedNotHardcoded() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("ForEach(model.questions"), "questions must come from the model, never a fixed literal count")
        XCTAssertTrue(source.contains("try WalletBackupVerificationModel(mnemonic: mnemonic)"))

        // The model itself already guarantees exactly 3 questions
        // (Stage 5E.9C, re-verified here directly).
        let model = try WalletBackupVerificationModel(mnemonic: syntheticMnemonic)
        XCTAssertEqual(model.questions.count, 3)
    }

    // MARK: - C: Verify disabled before all selections

    func testVerifyButtonIsDisabledUntilAllSelectionsMade() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains(".disabled(!allQuestionsAnswered)"))
        XCTAssertTrue(source.contains("model.questions.allSatisfy"))
    }

    // MARK: - D/E: validation semantics the screen consumes (re-proven directly)

    func testAllCorrectValidationSucceeds() throws {
        let model = try WalletBackupVerificationModel(mnemonic: syntheticMnemonic)
        let originalWords = syntheticMnemonic.split(separator: " ")

        var selections: [Int: String] = [:]
        for question in model.questions {
            selections[question.position] = String(originalWords[question.position - 1])
        }

        XCTAssertTrue(model.validate(selections: selections))
    }

    func testOneWrongValidationFails() throws {
        let model = try WalletBackupVerificationModel(mnemonic: syntheticMnemonic)
        let originalWords = syntheticMnemonic.split(separator: " ")

        var selections: [Int: String] = [:]
        for question in model.questions {
            selections[question.position] = String(originalWords[question.position - 1])
        }
        if let firstPosition = model.questions.first?.position {
            selections[firstPosition] = "not-a-real-word"
        }

        XCTAssertFalse(model.validate(selections: selections))
    }

    // MARK: - F/G/H: completion-policy wiring (Stage 5E.9E2 moved the
    // actual markConfirmed() call out of this file entirely — see
    // WalletBackupPhrasePreviewTests.swift for the up-to-date single-call-
    // site proof against WalletBackupPhrasePresenter.swift instead).

    func testSuccessfulValidateBranchCallsCompletionPolicyBeforeOnVerified() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")

        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let policyRange = try XCTUnwrap(source.range(of: "onVerificationSucceeded()"))
        let verifiedRange = try XCTUnwrap(source.range(of: "onVerified()"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))

        // Both calls must appear strictly between the success branch's
        // opening and its `else` — i.e. inside the `true` branch only —
        // and in that order (policy decided/applied before the dismiss
        // signal fires).
        XCTAssertTrue(policyRange.lowerBound > ifRange.upperBound && policyRange.upperBound < elseRange.lowerBound)
        XCTAssertTrue(verifiedRange.lowerBound > policyRange.upperBound && verifiedRange.upperBound < elseRange.lowerBound)
    }

    /// Stage 5E.9E2: this view must no longer decide the confirmation
    /// policy itself — it only threads through whatever the caller
    /// supplied. A stronger, simpler guarantee than counting call sites:
    /// this type is never referenced here at all.
    func testViewNeverReferencesBackupConfirmationStore() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertFalse(source.contains("WalletBackupConfirmationStore"))
    }

    // MARK: - I: failed verification clears selections, keeps the SAME model
    //
    // Stage 5E.9E3 (final correction): superseded the original Stage
    // 5E.9D "regenerate a fresh model on every wrong answer" design — the
    // final, correct behavior keeps the same 3 questions across all 3
    // attempts in a session and only regenerates for a genuinely new
    // session. See `WalletBackupVerificationRecoveryTests.swift` for the
    // full, up-to-date attempt-counter/session test coverage.

    func testFailedVerificationClearsSelectionsWithoutRegeneratingTheModel() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: elseRange.upperBound..<source.endIndex))
        let failureBranch = source[elseRange.upperBound..<closingRange.lowerBound]

        XCTAssertTrue(failureBranch.contains("selections = [:]"), "a wrong answer must clear selections directly")
        XCTAssertFalse(
            failureBranch.contains("regenerateModel()"),
            "a wrong answer must NOT rebuild the model/questions — Stage 5E.9E3's final correction"
        )
    }

    // MARK: - J: no secret enters Expo/TS

    func testVerificationViewSourceHasNoSecretTermsOrExpoSurface() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        for term in ["Function(", "AsyncFunction(", "WalletCoreBridgeModule"] {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationView.swift must not contain \(term)")
        }
    }

    // MARK: - K: no clipboard/share/logging

    func testVerificationViewSourceHasNoLoggingOrClipboardOrShareBehavior() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController", ".textSelection"] {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationView.swift must not contain \(term)")
        }
    }

    // MARK: - L: no backup-confirmation mutation exposed to JS

    func testExpoFacingModuleStillExposesNoMutationFunction() throws {
        let source = try codeOnlySource(of: "WalletCoreBridgeModule.swift")
        XCTAssertFalse(source.contains("markConfirmed"))
        for term in ["setBackupConfirmed", "markBackupConfirmed", "confirmBackup"] {
            XCTAssertNil(
                source.range(of: term, options: .caseInsensitive),
                "WalletCoreBridgeModule.swift must not expose \(term)"
            )
        }
    }

    // MARK: - Rare model failure never marks confirmed

    func testInsufficientDistinctWordsNeverReachesMarkConfirmed() throws {
        // Pathological mnemonic (Stage 5E.9C's own edge case): model
        // construction itself throws, so `content(model:)` — the only
        // branch that can ever reach `handleVerifyTapped` — is never
        // rendered at all for this mnemonic.
        let insufficientMnemonic = "alpha alpha alpha alpha alpha alpha alpha alpha alpha alpha bravo charlie"
        XCTAssertThrowsError(try WalletBackupVerificationModel(mnemonic: insufficientMnemonic))
    }

    // MARK: - Helpers

    private func codeOnlySource(of filename: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(filename)
        let source = try String(contentsOf: url, encoding: .utf8)
        return source
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
    }
}
