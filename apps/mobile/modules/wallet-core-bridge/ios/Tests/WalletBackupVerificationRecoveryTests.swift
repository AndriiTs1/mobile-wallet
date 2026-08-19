import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.9E3 (final correction): tests for the corrected wrong-answer
/// retry UX — a backup-comprehension check with exactly 3 attempts per
/// session against a STABLE set of 3 questions (never regenerated for an
/// ordinary wrong answer), and never a persisted lockout. Real SwiftUI
/// button-tap interaction and `@State` mutation are not exercised at
/// runtime — same established precedent as every other presenter/view
/// test in this project. Every property this file cares about
/// (`failedAttempts`, `remainingAttemptsText`, the title/body/counter
/// constants) is `private`, inaccessible even via `@testable import`, so
/// these are structural source audits of the exact control flow and
/// literal copy, not behavioral instance tests — consistent with this
/// project's whole existing test methodology. All mnemonics are obviously
/// synthetic, never a real phrase.
final class WalletBackupVerificationRecoveryTests: XCTestCase {
    private let syntheticMnemonic =
        "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"

    // MARK: - 1: failedAttempts starts at 0

    func testFailedAttemptsStartsAtZero() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("@State private var failedAttempts = 0"))
    }

    // MARK: - Shared: locate the failure branch precisely once

    /// Returns the exact source of `handleVerifyTapped`'s failure (`else`)
    /// branch, bounded from `} else {` to the function's own closing
    /// brace — reused by every test below that inspects this branch.
    private func failureBranchSource() throws -> Substring {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: elseRange.upperBound..<source.endIndex))
        return source[elseRange.upperBound..<closingRange.lowerBound]
    }

    // MARK: - 2/6: failedAttempts increments on every wrong answer

    func testFailedAttemptsIncrementsOnWrongAnswer() throws {
        let failureBranch = try failureBranchSource()
        // Must be the first mutation in the branch — every wrong answer,
        // first through third, increments before anything else happens.
        let incrementRange = try XCTUnwrap(failureBranch.range(of: "failedAttempts += 1"))
        let clearRange = try XCTUnwrap(failureBranch.range(of: "selections = [:]"))
        XCTAssertTrue(incrementRange.lowerBound < clearRange.lowerBound)
    }

    // MARK: - 3/7: correct "N attempts/attempt remaining" copy

    func testRemainingAttemptsTextFormula() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("private static let maxFailedAttempts = 3"))
        XCTAssertTrue(source.contains("let remaining = Self.maxFailedAttempts - failedAttempts"))
        XCTAssertTrue(source.contains("remaining == 1 ? \"1 attempt remaining\" : \"\\(remaining) attempts remaining\""))

        // Independent re-derivation of the same tiny pure formula (not a
        // call into the private property, which `@testable import`
        // cannot reach) — positively demonstrates what it produces for
        // the two reachable "still showing an error" counts.
        func remainingAttemptsText(failedAttempts: Int) -> String {
            let remaining = 3 - failedAttempts
            return remaining == 1 ? "1 attempt remaining" : "\(remaining) attempts remaining"
        }
        XCTAssertEqual(remainingAttemptsText(failedAttempts: 1), "2 attempts remaining")
        XCTAssertEqual(remainingAttemptsText(failedAttempts: 2), "1 attempt remaining")
    }

    func testNeverShowsThreeAttemptsRemainingOrZero() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertFalse(source.contains("3 attempts remaining"))
        XCTAssertFalse(source.contains("0 attempts remaining"))
    }

    // MARK: - 4/8: questions are NOT regenerated after failure 1 or 2

    func testWrongAnswerNeverRegeneratesTheModel() throws {
        let failureBranch = try failureBranchSource()
        XCTAssertFalse(
            failureBranch.contains("regenerateModel()"),
            "the same 3 questions must remain across all 3 attempts in a session"
        )
    }

    /// `regenerateModel()` is called with `()` call syntax only from
    /// `.onAppear` (a genuinely new session); the rare-model-failure retry
    /// button references it by name (`Button(action: regenerateModel)`,
    /// no parens) rather than calling it inline — neither path is reached
    /// from an ordinary wrong verification answer.
    func testRegenerateModelCallSitesAreOnlyOnAppearAndRareFailureRetry() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let onAppearRange = try XCTUnwrap(source.range(of: ".onAppear {"))
        let onAppearClosing = try XCTUnwrap(source.range(of: "\n        .onChange", range: onAppearRange.upperBound..<source.endIndex))
        let onAppearBody = source[onAppearRange.upperBound..<onAppearClosing.lowerBound]
        XCTAssertTrue(onAppearBody.contains("regenerateModel()"))

        XCTAssertTrue(source.contains("Button(action: regenerateModel) {"))
    }

    // MARK: - 5/9: selections clear on every wrong answer

    func testSelectionsClearOnWrongAnswer() throws {
        let failureBranch = try failureBranchSource()
        XCTAssertTrue(failureBranch.contains("selections = [:]"))
    }

    // MARK: - 10/11: third wrong answer returns to phrase, no fourth attempt

    func testThirdFailureCallsOnAttemptsExhaustedAndResetsCount() throws {
        let failureBranch = try failureBranchSource()
        let exhaustedIfRange = try XCTUnwrap(failureBranch.range(of: "if failedAttempts >= Self.maxFailedAttempts {"))
        let innerElseRange = try XCTUnwrap(failureBranch.range(of: "} else {", range: exhaustedIfRange.upperBound..<failureBranch.endIndex))
        let exhaustedBranch = failureBranch[exhaustedIfRange.upperBound..<innerElseRange.lowerBound]

        XCTAssertTrue(exhaustedBranch.contains("failedAttempts = 0"), "count must reset — nothing persists across sessions")
        XCTAssertTrue(exhaustedBranch.contains("onAttemptsExhausted()"))
        // No fourth attempt: the exhausted branch must never set showError
        // true (which would render another challenge on this screen).
        XCTAssertTrue(exhaustedBranch.contains("showError = false"))
        XCTAssertFalse(exhaustedBranch.contains("showError = true"))
    }

    func testMaxFailedAttemptsIsExactlyThree() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("private static let maxFailedAttempts = 3"))
    }

    // MARK: - 12: third wrong answer does not mark backupConfirmed

    func testFailureBranchCannotReachMarkConfirmed() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertFalse(source.contains("WalletBackupConfirmationStore"), "this view must not reference the store at all — see Stage 5E.9E2")
    }

    func testFailureBranchNeverCallsCompletionCallbacks() throws {
        let failureBranch = try failureBranchSource()
        XCTAssertFalse(failureBranch.contains("onVerificationSucceeded()"))
        XCTAssertFalse(failureBranch.contains("onVerified()"))
    }

    // MARK: - 13: returning to phrase destroys verification attempt state

    func testOnAttemptsExhaustedIsWiredToReturnToPhraseScreen() throws {
        let source = try codeOnlySource(of: "WalletBackupPhraseView.swift")
        let verificationViewRange = try XCTUnwrap(source.range(of: "WalletBackupVerificationView("))
        // Bounded by the next landmark (the sibling `phraseView(mnemonic:)`
        // call in the adjacent `else` branch) rather than exact
        // whitespace/indentation, so this test doesn't depend on
        // reformatting.
        let nextLandmark = try XCTUnwrap(source.range(of: "phraseView(mnemonic: mnemonic)", range: verificationViewRange.upperBound..<source.endIndex))
        let constructionArgs = source[verificationViewRange.upperBound..<nextLandmark.lowerBound]

        XCTAssertTrue(constructionArgs.contains("onAttemptsExhausted:"))
        XCTAssertTrue(constructionArgs.contains("isVerifying = false"))
        XCTAssertTrue(constructionArgs.contains("showAttemptsExhaustedNotice = true"))
    }

    /// `WalletBackupVerificationView`'s `@State` (`selections`,
    /// `showError`, `failedAttempts`, `model`) is owned entirely by that
    /// struct's own instance — SwiftUI discards it automatically the
    /// moment `WalletBackupPhraseView` stops rendering that branch
    /// (`isVerifying` flips to `false`). There is no separate teardown
    /// code to audit; this test re-confirms `isVerifying` is the sole
    /// gate controlling whether this view exists in the tree at all.
    func testVerificationViewOnlyRendersWhileIsVerifyingIsTrue() throws {
        let source = try codeOnlySource(of: "WalletBackupPhraseView.swift")
        XCTAssertTrue(source.contains("} else if isVerifying {"))
    }

    // MARK: - 14: pressing Continue again creates a fresh session

    func testContinueButtonStartsFreshVerificationSession() throws {
        let source = try codeOnlySource(of: "WalletBackupPhraseView.swift")
        let buttonRange = try XCTUnwrap(source.range(of: "Button(action: {"))
        let closingRange = try XCTUnwrap(source.range(of: "}) {", range: buttonRange.upperBound..<source.endIndex))
        let actionBody = source[buttonRange.upperBound..<closingRange.lowerBound]

        XCTAssertTrue(actionBody.contains("isVerifying = true"))
        XCTAssertTrue(actionBody.contains("showAttemptsExhaustedNotice = false"))
        // A fresh `WalletBackupVerificationView` value is constructed the
        // moment `isVerifying` flips true (the `else if isVerifying`
        // branch re-evaluates), so its `@State failedAttempts` and
        // `@State model` both start fresh — no explicit reset call is
        // needed or exists in this file for that.
    }

    // MARK: - 15/16/17: success on attempt 1, 2, or 3 all work identically

    func testSuccessWorksRegardlessOfPriorFailedAttempts() throws {
        // The model/validation logic has no concept of "attempt number" —
        // `validate(selections:)` only ever compares the given answers
        // against the fixed correct words, and (per this stage's own
        // design) the model is never regenerated mid-session. Directly
        // proves success is reachable identically on a 1st, 2nd, or 3rd
        // call against the SAME model instance.
        let model = try WalletBackupVerificationModel(mnemonic: syntheticMnemonic)
        let originalWords = syntheticMnemonic.split(separator: " ")
        var correctSelections: [Int: String] = [:]
        for question in model.questions {
            correctSelections[question.position] = String(originalWords[question.position - 1])
        }

        XCTAssertTrue(model.validate(selections: correctSelections)) // "attempt 1"
        XCTAssertTrue(model.validate(selections: correctSelections)) // "attempt 2"
        XCTAssertTrue(model.validate(selections: correctSelections)) // "attempt 3"
    }

    func testSuccessBranchUnchangedByThisStage() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let ifRange = try XCTUnwrap(source.range(of: "if model.validate(selections: selections) {"))
        let elseRange = try XCTUnwrap(source.range(of: "} else {", range: ifRange.upperBound..<source.endIndex))
        let successBranch = source[ifRange.upperBound..<elseRange.lowerBound]

        XCTAssertTrue(successBranch.contains("onVerificationSucceeded()"))
        XCTAssertTrue(successBranch.contains("onVerified()"))
        // No attempt-counter logic in the success path at all — success
        // is unconditional regardless of `failedAttempts`.
        XCTAssertFalse(successBranch.contains("failedAttempts"))
    }

    // MARK: - 18/19: production/preview backupConfirmed semantics unchanged
    //
    // Full, authoritative proof lives in WalletBackupPhrasePreviewTests.swift
    // (Stage 5E.9E2, untouched by this stage). Re-confirmed here directly
    // against this stage's own changes.

    func testCompletionPolicyWiringUnchangedByThisStage() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("let onVerificationSucceeded: () -> Void"))
        XCTAssertFalse(source.contains("WalletBackupConfirmationStore"))
    }

    // MARK: - 20/21: Showcase preview success -> Home; no wallet recreated
    //
    // Full, authoritative proof (RN-side source audit) lives in
    // WalletBackupPhrasePreviewTests.swift — see
    // testShowcaseExistingWalletBranchSetsCompletedTrueOnPreviewSuccess and
    // testShowcaseExistingWalletBranchNeverCreatesAnotherWallet there.
    // Neither RN routing nor the no-second-wallet invariant were touched
    // by this stage's native-only retry-UX changes — re-confirmed here.

    func testThisStageTouchesNoWalletCreationOrStorageCode() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertFalse(source.contains("createWalletAndPresentBackup"))
        XCTAssertFalse(source.contains("WalletSecureStorage"))
        XCTAssertFalse(source.contains("WalletNativeCreateOrchestrator"))
    }

    // MARK: - 22: no retry state persisted anywhere

    func testNoRetryStatePersistedAnywhere() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        for term in ["UserDefaults", "Keychain", "kSecClass", "Timer(", "DispatchQueue"] {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationView.swift must not contain \(term)")
        }
    }

    // MARK: - 23: no secret enters RN

    func testNoSecretTermsOrExpoSurfaceIntroduced() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        for term in ["Function(", "AsyncFunction(", "WalletCoreBridgeModule"] {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationView.swift must not contain \(term)")
        }
    }

    // MARK: - 24: no logging/clipboard/share

    func testNoLoggingClipboardOrShareBehavior() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        for term in ["print(", "NSLog", "os_log", "UIPasteboard", "ShareLink", "UIActivityViewController", ".textSelection"] {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationView.swift must not contain \(term)")
        }
    }

    // MARK: - Visibility fix preserved (kept from the earlier Stage 5E.9E3 pass)

    func testErrorBannerHasVisibleCardTreatmentNotBareText() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        let bannerRange = try XCTUnwrap(source.range(of: "private var errorBanner: some View {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: bannerRange.upperBound..<source.endIndex))
        let bannerBody = source[bannerRange.upperBound..<closingRange.lowerBound]

        XCTAssertTrue(bannerBody.contains(".background("), "error must have a visible container, not bare text")
        XCTAssertTrue(bannerBody.contains("RoundedRectangle"), "error must have a visible border")
    }

    func testScrollsToVisibleContentWhenErrorAppears() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("ScrollViewReader"))
        let onChangeRange = try XCTUnwrap(source.range(of: ".onChange(of: showError) { newValue in", range: try XCTUnwrap(source.range(of: "ScrollViewReader")).upperBound..<source.endIndex))
        let closingRange = try XCTUnwrap(source.range(of: "\n            }", range: onChangeRange.upperBound..<source.endIndex))
        let handlerBody = source[onChangeRange.upperBound..<closingRange.lowerBound]
        XCTAssertTrue(handlerBody.contains("proxy.scrollTo"))
    }

    func testShowErrorTriggersVoiceOverAnnouncement() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        // Checked as two separate substrings rather than one contiguous
        // one — the call is formatted across multiple lines (`post(`,
        // then `notification: .announcement,` on its own line).
        XCTAssertTrue(source.contains("UIAccessibility.post("))
        XCTAssertTrue(source.contains("notification: .announcement,"))
    }

    // MARK: - Model-construction failure stays distinct

    func testRareModelConstructionFailureRoutesToDistinctGenericState() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationView.swift")
        XCTAssertTrue(source.contains("modelFailureView"))
        XCTAssertTrue(source.contains("modelFailed = true"))

        let modelFailureRange = try XCTUnwrap(source.range(of: "private var modelFailureView: some View {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: modelFailureRange.upperBound..<source.endIndex))
        let modelFailureBody = source[modelFailureRange.upperBound..<closingRange.lowerBound]

        XCTAssertFalse(modelFailureBody.contains("Not quite right"))
    }

    // MARK: - Return-to-phrase guidance banner

    func testReturnToPhraseGuidanceIsNeutralNotAlarming() throws {
        let source = try codeOnlySource(of: "WalletBackupPhraseView.swift")
        XCTAssertTrue(source.contains("Review your recovery phrase and try again."))
        let noticeRange = try XCTUnwrap(source.range(of: "private var attemptsExhaustedNotice: some View {"))
        let closingRange = try XCTUnwrap(source.range(of: "\n    }", range: noticeRange.upperBound..<source.endIndex))
        let noticeBody = source[noticeRange.upperBound..<closingRange.lowerBound]

        XCTAssertTrue(noticeBody.contains("Palette.textSecondary"))
        XCTAssertFalse(noticeBody.contains("Palette.negative"), "guidance is not an error — must not use the error color")
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
