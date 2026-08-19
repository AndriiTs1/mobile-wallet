import Foundation
import XCTest
@testable import WalletCoreBridge

/// Stage 5E.9C: tests for the native-only backup-verification model.
/// Every mnemonic used here is obviously synthetic (fixed placeholder
/// words), never a real recovery phrase, matching this project's existing
/// "synthetic bytes only" test discipline (see `WalletSecureStorageTests`).
final class WalletBackupVerificationModelTests: XCTestCase {
    /// 12 distinct synthetic words — no repeats.
    private let uniqueWordsMnemonic =
        "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima"

    /// 12 synthetic words with exactly one repeated pair ("alpha" appears
    /// twice); the remaining 10 are distinct — still plenty of distinct
    /// alternatives for every position regardless of which 3 are
    /// requested.
    private let mildlyRepeatedWordsMnemonic =
        "alpha alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo"

    /// 12 synthetic words drawn from only 3 distinct values (10x "alpha",
    /// 1x "bravo", 1x "charlie") — deliberately pathological: for *every*
    /// position, excluding that position's own correct value leaves at
    /// most 2 distinct alternative values, always below the 3 required.
    /// `init` must throw `.insufficientDistinctWords` regardless of which
    /// 3 positions the model's internal RNG happens to select.
    private let insufficientDistinctWordsMnemonic =
        "alpha alpha alpha alpha alpha alpha alpha alpha alpha alpha bravo charlie"

    // MARK: - A/B/C: position selection

    func testExactlyThreePositionsSelected() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        XCTAssertEqual(model.questions.count, 3)
    }

    func testPositionsAreDistinct() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let positions = model.questions.map(\.position)
        XCTAssertEqual(Set(positions).count, positions.count)
    }

    func testPositionsAreWithinOneToTwelve() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        for question in model.questions {
            XCTAssertTrue((1...12).contains(question.position))
        }
    }

    // MARK: - D/E/F/G: choice generation

    func testEachQuestionHasExactlyFourChoices() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        for question in model.questions {
            XCTAssertEqual(question.choices.count, 4)
        }
    }

    func testCorrectWordIsPresentInItsOwnQuestion() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let originalWords = uniqueWordsMnemonic.split(separator: " ")

        for question in model.questions {
            let correctWord = originalWords[question.position - 1]
            XCTAssertTrue(question.choices.contains(correctWord))
        }
    }

    func testCorrectWordAppearsExactlyOnce() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let originalWords = uniqueWordsMnemonic.split(separator: " ")

        for question in model.questions {
            let correctWord = originalWords[question.position - 1]
            let occurrences = question.choices.filter { $0 == correctWord }.count
            XCTAssertEqual(occurrences, 1)
        }
    }

    func testAllChoicesAreDistinctWithinEachQuestion() throws {
        // Exercised against the mildly-repeated mnemonic too, so a
        // duplicate word elsewhere in the phrase is proven not to leak a
        // duplicate choice into a question.
        for mnemonic in [uniqueWordsMnemonic, mildlyRepeatedWordsMnemonic] {
            let model = try WalletBackupVerificationModel(mnemonic: mnemonic)
            for question in model.questions {
                XCTAssertEqual(Set(question.choices).count, question.choices.count)
            }
        }
    }

    // MARK: - H/I/J: validation semantics

    func testAllCorrectSelectionsSucceed() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let originalWords = uniqueWordsMnemonic.split(separator: " ")

        var selections: [Int: String] = [:]
        for question in model.questions {
            selections[question.position] = String(originalWords[question.position - 1])
        }

        XCTAssertTrue(model.validate(selections: selections))
    }

    func testOneWrongSelectionFails() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let originalWords = uniqueWordsMnemonic.split(separator: " ")

        var selections: [Int: String] = [:]
        for question in model.questions {
            selections[question.position] = String(originalWords[question.position - 1])
        }
        // Corrupt exactly one answer with a value guaranteed not to be a
        // correct word for any position in this synthetic mnemonic.
        if let firstPosition = model.questions.first?.position {
            selections[firstPosition] = "not-a-real-word"
        }

        XCTAssertFalse(model.validate(selections: selections))
    }

    func testMissingSelectionFails() throws {
        let model = try WalletBackupVerificationModel(mnemonic: uniqueWordsMnemonic)
        let originalWords = uniqueWordsMnemonic.split(separator: " ")

        var selections: [Int: String] = [:]
        for question in model.questions.dropFirst() {
            selections[question.position] = String(originalWords[question.position - 1])
        }
        // The first question's position is left unanswered entirely.

        XCTAssertFalse(model.validate(selections: selections))
    }

    // MARK: - K/L: invalid word count / duplicate-word edge case

    func testInvalidWordCountFails() {
        // Exactly 11 words — one short of the required 12.
        XCTAssertThrowsError(try WalletBackupVerificationModel(mnemonic: "one two three four five six seven eight nine ten eleven")) { error in
            XCTAssertEqual(error as? WalletBackupVerificationModelError, .invalidWordCount)
        }
        XCTAssertThrowsError(try WalletBackupVerificationModel(mnemonic: "")) { error in
            XCTAssertEqual(error as? WalletBackupVerificationModelError, .invalidWordCount)
        }
    }

    func testMildlyRepeatedWordMnemonicIsHandledSafely() throws {
        // Must succeed (plenty of distinct alternatives remain for every
        // position) and must still satisfy every choice-generation
        // invariant — proven together by `testAllChoicesAreDistinctWithinEachQuestion`
        // above; this test only proves the non-throwing/succeeding half.
        XCTAssertNoThrow(try WalletBackupVerificationModel(mnemonic: mildlyRepeatedWordsMnemonic))
    }

    func testInsufficientDistinctWordsFailsStructurally() {
        // Every position in this mnemonic has at most 2 distinct
        // alternative values available, below the 3 required — `init`
        // must throw regardless of which 3 positions its internal RNG
        // selects, never silently build a smaller or duplicated choice set.
        XCTAssertThrowsError(try WalletBackupVerificationModel(mnemonic: insufficientDistinctWordsMnemonic)) { error in
            XCTAssertEqual(error as? WalletBackupVerificationModelError, .insufficientDistinctWords)
        }
    }

    // MARK: - M/N: source audit — no mutation/persistence/logging/Expo surface

    func testModelSourceHasNoMutationPersistenceLoggingOrExpoSurface() throws {
        let source = try codeOnlySource(of: "WalletBackupVerificationModel.swift")
        let forbiddenTerms = [
            "WalletBackupConfirmationStore.markConfirmed",
            "WalletSecureStorage",
            "WalletCoreBridgeModule",
            "Function(",
            "AsyncFunction(",
            "UIPasteboard",
            "ShareLink",
            "UIActivityViewController",
            "UserDefaults",
            "print(",
            "NSLog",
            "os_log",
            "console.log",
        ]
        for term in forbiddenTerms {
            XCTAssertFalse(source.contains(term), "WalletBackupVerificationModel.swift must not contain \(term)")
        }
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
