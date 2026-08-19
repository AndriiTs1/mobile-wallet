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
        XCTAssertTrue(
            source.contains("Button(action: { isVerifying = true })"),
            "Continue must flip local flow state to verification"
        )
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

    // MARK: - F/G/H: markConfirmed write path

    func testMarkConfirmedIsOnlyCalledInsideSuccessfulValidateBranch() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")

        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let markRange = try XCTUnwrap(source.range(of: "WalletBackupConfirmationStore.markConfirmed()"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))

        // markConfirmed() must appear strictly between the success branch's
        // opening and its `else` — i.e. inside the `true` branch only.
        XCTAssertTrue(markRange.lowerBound > ifRange.upperBound && markRange.upperBound < elseRange.lowerBound)
    }

    func testMarkConfirmedHasExactlyOneProductionCallSite() throws {
        let iosDirectory = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // ios/
        let productionFiles = try FileManager.default
            .contentsOfDirectory(at: iosDirectory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }

        var callSites: [String] = []
        for fileURL in productionFiles {
            let source = try codeOnlySource(of: fileURL.lastPathComponent)
            // Count call sites only — `func markConfirmed(` (the
            // definition itself, in WalletBackupConfirmationStore.swift)
            // is deliberately excluded from this count.
            if source.contains("WalletBackupConfirmationStore.markConfirmed()") {
                callSites.append(fileURL.lastPathComponent)
            }
        }

        XCTAssertEqual(callSites, ["WalletBackupVerificationView.swift"])
    }

    // MARK: - I: failed verification regenerates positions/model

    func testFailedVerificationRegeneratesModelAndClearsSelections() throws {
        // `codeOnlySource` strips comment lines, so this locates the
        // failure branch structurally (via the same `if`/`else` bounds
        // `testMarkConfirmedIsOnlyCalledInsideSuccessfulValidateBranch`
        // already establishes) rather than matching against comment text.
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))
        let failureBranch = source[elseRange.lowerBound...]

        XCTAssertTrue(failureBranch.contains("regenerateModel()"))
        XCTAssertTrue(failureBranch.contains("showError = true"))
        XCTAssertTrue(source.contains("selections = [:]"), "regenerateModel must clear prior selections")
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
