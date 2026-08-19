// Stage 5E.9C — small, native-only backup-verification model.
//
// Pure logic only: given an already-reconstructed 12-word mnemonic String
// (obtained elsewhere, e.g. via `WalletNativeMnemonicReconstructor`, never
// by this file), selects 3 distinct word positions, builds native-only
// multiple-choice questions for them from words already present in the
// same mnemonic, and validates a caller-supplied set of answers. Nothing
// in this file reconstructs, derives, persists, or logs anything, calls
// Rust, touches `WalletSecureStorage`, or writes
// `WalletBackupConfirmationStore` — none of those concerns belong here.
// This is a helper consumed by a future native UI (Stage 5E.9D), which is
// also the only future caller expected to ever mark backup confirmed,
// after independently deciding what `validate(selections:)` returned.
//
// NOT exposed to Expo/React Native: every type here is `internal` (Swift's
// default access level — no `public` anywhere in this file), lives outside
// the three files the Stage 5D.8B bridge guard scans
// (WalletCoreBridgeModule.swift, WalletCoreBridge.types.ts,
// WalletCoreBridgeModule.ts), and is never referenced from any of them.
//
// Secret lifetime, stated honestly per this stage's own requirement:
// `words`/each question's `choices` are `Substring`s sharing the caller's
// `mnemonic` String's own storage, not independent copies — the smallest
// practical way to avoid allocating a fresh String per word/choice, same
// rationale `WalletBackupPhraseView.swift` already documents for its own
// word grid. This does NOT provide any zeroization guarantee: Swift
// String/Substring is copy-on-write and this file cannot verify or force
// unique buffer ownership, so no "the words are wiped from memory" claim
// is made here, deliberately, matching the same honest limitation already
// documented in `WalletNativeMnemonicReconstructor.swift` and
// `WalletNativeCreateOrchestrator.swift`. The caller is responsible for
// keeping the `mnemonic` String — and any `WalletBackupVerificationModel`/
// `BackupVerificationQuestion` built from it — alive only as long as
// genuinely needed, and for not retaining, logging, or persisting either.

enum WalletBackupVerificationModelError: Error, Equatable {
    /// The input string did not split into exactly 12 whitespace-separated
    /// words. Generic and structural only — never describes what count was
    /// actually found, consistent with this project's existing "no secret/
    /// error internals surfaced" discipline.
    case invalidWordCount
    /// A requested position's mnemonic has too few distinct alternative
    /// word *values* elsewhere in the same phrase to build 3 non-duplicate
    /// decoys (see this file's "duplicate-word edge case" handling below).
    /// Structural failure only — never reveals which position or words.
    case insufficientDistinctWords
}

/// One native-only multiple-choice question. Never `public`, never
/// Expo-visible.
struct BackupVerificationQuestion: Equatable {
    /// 1-based position, matching the numbering already shown to the user
    /// on the phrase-display screen (`WalletBackupPhraseView`'s own
    /// `index + 1` numbering) — never 0-based in anything exposed toward
    /// a future native UI.
    let position: Int
    /// Exactly 4 choices: the correct word plus 3 distinct decoys, already
    /// shuffled. `Substring`, not `String` — see this file's header
    /// comment on secret lifetime.
    let choices: [Substring]
}

/// Pure, stateless-per-instance verification helper. Holds no global/
/// singleton state, persists nothing, logs nothing.
struct WalletBackupVerificationModel {
    /// Positions to confirm per attempt. Not itself a secret-strength
    /// requirement (ADR-004 §4 permits "3–4 randomly selected positions";
    /// 3 was the Stage 5E.9A design recommendation) — a fixed product
    /// choice, not a value requiring cryptographic justification.
    private static let requestedPositionCount = 3
    /// Total choices per question: 1 correct + 3 decoys.
    private static let choicesPerQuestion = 4

    private let words: [Substring]
    let questions: [BackupVerificationQuestion]

    /// `mnemonic` must remain alive for as long as this model (and any
    /// question it produced) is in use — see this file's header comment.
    /// Throws `.invalidWordCount` if `mnemonic` does not split into
    /// exactly 12 whitespace-separated words. Never reconstructs anything,
    /// never calls Rust, never touches `WalletSecureStorage`.
    init(mnemonic: String) throws {
        let words = mnemonic.split(whereSeparator: { $0.isWhitespace })
        guard words.count == 12 else {
            throw WalletBackupVerificationModelError.invalidWordCount
        }
        self.words = words

        let positions = Array(0..<words.count).shuffled().prefix(Self.requestedPositionCount)
        self.questions = try positions.sorted().map { index in
            try Self.makeQuestion(forZeroBasedIndex: index, in: words)
        }
    }

    /// Builds one question for `words[index]`. Decoys are drawn only from
    /// `words` itself (no BIP-39 wordlist, no network data, no new asset,
    /// no dependency) — distinct *by value* from the correct word and from
    /// each other, so a repeated word elsewhere in the mnemonic (a valid
    /// BIP-39 mnemonic may legitimately repeat a word) can never produce a
    /// misleading duplicate choice. If fewer than 3 distinct alternative
    /// values exist, fails structurally rather than building a smaller or
    /// duplicated choice set.
    private static func makeQuestion(forZeroBasedIndex index: Int, in words: [Substring]) throws -> BackupVerificationQuestion {
        let correctWord = words[index]

        var decoyPool: [Substring] = []
        var seenDecoyValues: Set<Substring> = []
        for (otherIndex, word) in words.enumerated() where otherIndex != index {
            guard word != correctWord, !seenDecoyValues.contains(word) else { continue }
            seenDecoyValues.insert(word)
            decoyPool.append(word)
        }

        guard decoyPool.count >= choicesPerQuestion - 1 else {
            throw WalletBackupVerificationModelError.insufficientDistinctWords
        }

        var choices = Array(decoyPool.shuffled().prefix(choicesPerQuestion - 1))
        choices.append(correctWord)
        choices.shuffle()

        return BackupVerificationQuestion(position: index + 1, choices: choices)
    }

    /// `selections`: 1-based position -> the word the caller selected for
    /// that position. All `questions` must be answered, and every answer
    /// must exactly match the correct word at that position — no
    /// normalization (no case-folding, no trimming, no Unicode
    /// normalization) that could accidentally accept a wrong answer.
    /// Returns only pass/fail; never which specific position was wrong,
    /// per this stage's own requirement.
    func validate(selections: [Int: String]) -> Bool {
        for question in questions {
            let correctIndex = question.position - 1
            guard correctIndex >= 0, correctIndex < words.count else { return false }
            guard let selected = selections[question.position], selected == words[correctIndex] else {
                return false
            }
        }
        return true
    }
}
