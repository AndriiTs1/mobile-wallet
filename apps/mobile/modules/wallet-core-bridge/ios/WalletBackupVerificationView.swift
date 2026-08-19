import SwiftUI
import UIKit

// Stage 5E.9D — native-only backup verification screen.
//
// Reached only from `WalletBackupPhraseView`'s Continue action, still
// inside the same native, `.fullScreen` presentation —
// `WalletBackupPhrasePresenter.swift` is entirely unmodified by this
// stage; it only ever cares that `onVerified` (its own `onWrittenDown`)
// fires exactly once eventually, not when or from how deep in the flow.
// This file consumes the already-reconstructed mnemonic and the existing
// `WalletBackupVerificationModel` (Stage 5E.9C) for all position-selection
// and answer-validation logic — it owns rendering and interaction only,
// and never reimplements either.
//
// `internal` throughout (Swift's default access level — no `public`
// anywhere in this file), lives outside the three files the Stage 5D.8B
// bridge guard scans, and is never referenced from any of them. No
// recovery word, choice, selection, or the mnemonic itself ever crosses
// into Expo/React Native — this screen renders and validates entirely
// natively.
//
// Stage 5E.9E2: this view no longer decides whether a successful
// verification persists `backupConfirmed` — it never references
// `WalletBackupConfirmationStore` at all. That decision is made by
// `WalletBackupPhrasePresenter` (native code, never JS) and handed to this
// view as `onVerificationSucceeded`, a plain completion-policy closure —
// production supplies a closure that calls
// `WalletBackupConfirmationStore.markConfirmed()`; the DEV-only preview
// entry point (`WalletBackupPhrasePresenter.presentPreview()`, `#if DEBUG`
// only) supplies a no-op instead, so a developer previewing this exact
// screen against a real wallet can never mutate its real confirmation
// state. This view is otherwise byte-identical in behavior between the two
// callers — same UI, same model, same validation.

struct WalletBackupVerificationView: View {
    /// Completion policy for a successful verification, decided entirely
    /// by the caller (`WalletBackupPhrasePresenter`) — see this file's own
    /// header comment. Called before `onVerified` below, in
    /// `handleVerifyTapped()`'s success branch only.
    let onVerificationSucceeded: () -> Void

    /// Called exactly once, only after a successful verification — the
    /// same closure `WalletBackupPhrasePresenter` resumes its Stage 5E.8
    /// continuation from. This view has no knowledge of, and no
    /// dependency on, that continuation mechanism itself.
    let onVerified: () -> Void

    /// Stage 5E.9E3 (final correction): called exactly once, only after
    /// the third failed attempt within this verification session — never
    /// after a successful verification. This is this screen's own
    /// "return to the phrase screen" signal, wired by
    /// `WalletBackupPhraseView` to set its local `isVerifying = false`
    /// (the same mechanism already used for backgrounding/interruption) —
    /// removing this view from the tree, which is what actually discards
    /// its `selections`/`showError`/`failedAttempts` state. This view does
    /// not persist, reset, or otherwise manage that teardown itself.
    let onAttemptsExhausted: () -> Void

    /// The already-reconstructed mnemonic, received from
    /// `WalletBackupPhraseView` by reference (Swift `String` is
    /// copy-on-write) — not a second independently-allocated copy. Must
    /// remain alive only as long as this view exists; discarded (along
    /// with `model`/`selections`) the moment the parent stops rendering
    /// this view (backgrounding, disappearing, or successful completion).
    /// Same honest limitation already documented in
    /// `WalletBackupVerificationModel.swift`: Swift String/Substring
    /// cannot be proven zeroized on drop — this only bounds the lifetime
    /// to this presentation, it does not claim erasure.
    private let mnemonic: String

    @State private var model: WalletBackupVerificationModel?
    @State private var modelFailed = false
    @State private var selections: [Int: String] = [:]
    @State private var showError = false
    /// Stage 5E.9E3 (final correction): in-memory only, never persisted
    /// anywhere (no UserDefaults/Keychain/RN/backend) — this is a
    /// backup-comprehension check, not an authentication lockout. Resets
    /// to 0 implicitly whenever a fresh `WalletBackupVerificationView`
    /// instance is created (a new verification session), since `@State`
    /// initial values apply per-instance; there is no explicit reset call
    /// anywhere in this file.
    @State private var failedAttempts = 0

    init(
        mnemonic: String,
        onVerificationSucceeded: @escaping () -> Void,
        onVerified: @escaping () -> Void,
        onAttemptsExhausted: @escaping () -> Void
    ) {
        self.mnemonic = mnemonic
        self.onVerificationSucceeded = onVerificationSucceeded
        self.onVerified = onVerified
        self.onAttemptsExhausted = onAttemptsExhausted
    }

    private var allQuestionsAnswered: Bool {
        guard let model else { return false }
        return model.questions.allSatisfy { selections[$0.position] != nil }
    }

    var body: some View {
        Group {
            if modelFailed {
                modelFailureView
            } else if let model {
                content(model: model)
            } else {
                ProgressView()
                    .tint(Palette.accentGold)
            }
        }
        .onAppear {
            if model == nil, !modelFailed {
                regenerateModel()
            }
        }
        .onChange(of: showError) { newValue in
            guard newValue else { return }
            // Explicit VoiceOver announcement — a newly-appearing Text
            // isn't guaranteed to receive automatic VoiceOver focus, so
            // this ensures the failure message (including the attempt
            // counter) is actually announced, per this stage's own
            // accessibility requirement.
            UIAccessibility.post(
                notification: .announcement,
                argument: "\(Self.genericFailureTitle). \(Self.genericFailureBody) \(remainingAttemptsText)"
            )
        }
    }

    // MARK: - Content

    /// Stage 5E.9E3: physical-device QA found wrong-answer recovery
    /// "looked" stuck. Root cause, found by tracing this file's actual
    /// state transitions (not assumed): the state machinery itself was
    /// already correct at the time — clearing `selections` and flipping
    /// `showError` to `true` both worked. The real defect was visibility:
    /// the error message was bare colored text with no container, and
    /// this `ScrollView` had no scroll-to-visible mechanism at all — on a
    /// real device, a user scrolled down near the original Verify button
    /// would have the reset (cleared chips, the error text) happen *off
    /// their current scroll position*, with nothing drawing their eye
    /// back to it. The recovery was real; it was just invisible. Fixed
    /// here with `ScrollViewReader` scrolling back to the top whenever
    /// `showError` becomes true (see `.onChange` below), plus
    /// `errorBanner`'s upgraded card treatment. (Separately, this stage
    /// also changed *when* `showError` fires at all — see
    /// `handleVerifyTapped`'s own doc comment for the final 3-attempts-
    /// same-questions design; this scroll/visibility fix applies
    /// regardless of that later correction.)
    private func content(model: WalletBackupVerificationModel) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 24) {
                    header
                    VStack(spacing: 20) {
                        ForEach(model.questions, id: \.position) { question in
                            questionBlock(question: question)
                        }
                    }
                    if showError {
                        errorBanner
                    }
                    VStack(spacing: 8) {
                        verifyButton
                        if !allQuestionsAnswered {
                            // Always-visible (not VoiceOver-only) reason the
                            // button is disabled — the Verify button's own
                            // `.accessibilityHint` below covers VoiceOver;
                            // sighted users get the same explanation here,
                            // rather than a silently unresponsive button.
                            Text("Select an answer for every word to continue.")
                                .font(.system(size: 12))
                                .foregroundColor(Palette.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                    }
                }
                .padding(20)
                .id(Self.contentTopAnchorID)
            }
            .onChange(of: showError) { newValue in
                guard newValue else { return }
                // Scrolls the freshly-regenerated questions, the cleared
                // chips, and the now-visible error banner all back into
                // view together — the concrete fix for the root cause
                // documented above.
                withAnimation {
                    proxy.scrollTo(Self.contentTopAnchorID, anchor: .top)
                }
            }
        }
    }

    private var header: some View {
        // Same centered-header composition as `WalletBackupPhraseView`'s
        // own header (Stage 5E.7E/5E.7F) — full-screen center axis, not a
        // column started after any leading element.
        VStack(alignment: .center, spacing: 10) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 26, weight: .medium))
                .foregroundColor(Palette.accentGold)
                .accessibilityHidden(true)

            Text("Verify your backup")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Palette.text)
                .multilineTextAlignment(.center)

            Text("Select the correct word for each position.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 280)
        }
        .frame(maxWidth: .infinity)
    }

    private func questionBlock(question: BackupVerificationQuestion) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Word #\(question.position)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Palette.text)
                .accessibilityLabel("Word number \(question.position)")

            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                spacing: 10
            ) {
                ForEach(Array(question.choices.enumerated()), id: \.offset) { _, choice in
                    choiceChip(position: question.position, choice: choice)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func choiceChip(position: Int, choice: Substring) -> some View {
        let choiceValue = String(choice)
        let isSelected = selections[position] == choiceValue

        return Button {
            selections[position] = choiceValue
            showError = false
        } label: {
            HStack(spacing: 6) {
                // Selection is never color-only: a checkmark glyph and the
                // VoiceOver `.isSelected` trait below both carry the same
                // meaning independent of the background-color change.
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                }
                Text(choice)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundColor(isSelected ? Palette.background : Palette.text)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, 10)
            .background(isSelected ? Palette.accentGold : Palette.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.clear : Palette.border, lineWidth: 1)
            )
            .cornerRadius(12)
        }
        // Deliberately no `.textSelection(.enabled)` anywhere in this
        // view — matches `WalletBackupPhraseView`'s word grid: enabling it
        // would surface the system Copy callout menu, reintroducing
        // exactly the clipboard exposure this screen must not have
        // (ADR-004 §6).
        .buttonStyle(.plain)
        .accessibilityLabel(choiceValue)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private var errorBanner: some View {
        // Stage 5E.9E3: bordered/tinted card — "clearly visible," not just
        // technically present. Title/body/icon carry the meaning (not
        // color alone); the attempt counter is deliberately muted
        // secondary text, not red/punitive — this is a comprehension
        // check, not a security lockout.
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Palette.negative)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(Self.genericFailureTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Palette.negative)
                Text(Self.genericFailureBody)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Palette.negative)
                    .fixedSize(horizontal: false, vertical: true)
                Text(remainingAttemptsText)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Palette.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Palette.negative.opacity(0.12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Palette.negative.opacity(0.4), lineWidth: 1)
        )
        .cornerRadius(12)
        .accessibilityElement(children: .combine)
    }

    /// "2 attempts remaining" after the first failure, "1 attempt
    /// remaining" (singular) after the second — never shown before any
    /// failure, and never shown as "0 attempts remaining": the third
    /// failure returns to the phrase screen instead of showing this at
    /// all (see `handleVerifyTapped`).
    private var remainingAttemptsText: String {
        let remaining = Self.maxFailedAttempts - failedAttempts
        return remaining == 1 ? "1 attempt remaining" : "\(remaining) attempts remaining"
    }

    private var verifyButton: some View {
        Button(action: handleVerifyTapped) {
            Text("Verify")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Palette.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Palette.accentGold)
                .cornerRadius(14)
        }
        .buttonStyle(.plain)
        // `.disabled` also exposes SwiftUI's own "dimmed"/disabled
        // accessibility state to VoiceOver automatically — no separate
        // trait needed to satisfy "CTA exposes disabled state."
        .disabled(!allQuestionsAnswered)
        .opacity(allQuestionsAnswered ? 1 : 0.5)
        .accessibilityLabel("Verify")
        .accessibilityHint(allQuestionsAnswered ? "" : "Select an answer for every word to continue")
    }

    private var modelFailureView: some View {
        // Same generic-failure tone/structure as
        // `WalletBackupPhraseView.errorView` — never exposes
        // `WalletBackupVerificationModelError`'s case name or any other
        // internal detail.
        VStack(spacing: 12) {
            Text("Something went wrong")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Palette.text)
            Text("Verification couldn't be prepared right now. Please try again.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)

            Button(action: regenerateModel) {
                Text("Try again")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(Palette.background)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Palette.accentGold)
                    .cornerRadius(12)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Try again")
        }
        .padding()
    }

    // MARK: - Actions

    /// Builds `model` from `mnemonic` and clears any prior selections.
    ///
    /// Stage 5E.9E3 (final correction): this is now called ONLY when a
    /// genuinely NEW verification session begins (`.onAppear`, i.e. a
    /// fresh `WalletBackupVerificationView` instance after the user
    /// returned to the phrase screen and pressed Continue again) or when
    /// the user explicitly retries a rare model-construction failure via
    /// `modelFailureView`'s "Try again" button. It is deliberately no
    /// longer called on an ordinary wrong verification answer — per this
    /// stage's own "same 3 questions across all 3 attempts" requirement,
    /// see `handleVerifyTapped` below, which clears `selections` directly
    /// instead without touching `model`/`questions` at all.
    ///
    /// On the rare `WalletBackupVerificationModelError` (too few distinct
    /// alternative words, or an unexpected word count), routes to a
    /// generic native failure state — never silently marks backup
    /// confirmed, never falls back to a weaker choice count, never
    /// creates a wallet.
    private func regenerateModel() {
        selections = [:]
        do {
            model = try WalletBackupVerificationModel(mnemonic: mnemonic)
            modelFailed = false
        } catch {
            model = nil
            modelFailed = true
        }
    }

    /// Stage 5E.9E3 (final correction): a backup-comprehension check, not
    /// an authentication lockout — exactly 3 failed attempts per session,
    /// against the SAME 3 questions each time (never regenerated for
    /// ordinary wrong answers, only for a genuinely new session — see
    /// `regenerateModel`'s own doc comment). Never reveals which answer
    /// was wrong, how many were wrong, or the correct word — every
    /// selection is cleared uniformly regardless of which (if any) were
    /// individually correct.
    private func handleVerifyTapped() {
        guard let model, allQuestionsAnswered else { return }

        if model.validate(selections: selections) {
            // Completion policy decided by the caller — see this file's
            // own header comment. Production marks confirmed; the
            // DEV-only preview path does not. Unchanged by this stage:
            // success on attempt 1, 2, or 3 is treated identically.
            onVerificationSucceeded()
            onVerified()
        } else {
            failedAttempts += 1
            selections = [:]

            if failedAttempts >= Self.maxFailedAttempts {
                // Third failure: no fourth attempt, no further challenge
                // on this screen, no lockout, no timer — reset the count
                // (nothing to persist across sessions) and hand off to
                // the phrase screen. `backupConfirmed` is untouched either
                // way; only `onVerificationSucceeded()` ever sets it, and
                // that path was never reached this attempt.
                failedAttempts = 0
                showError = false
                onAttemptsExhausted()
            } else {
                // Same 3 questions remain — only the error/counter and
                // cleared selections change.
                showError = true
            }
        }
    }

    private static let genericFailureTitle = "Not quite right"
    private static let genericFailureBody = "Check your written backup and try again."
    /// Stage 5E.9E3 (final correction): exactly 3 attempts per session —
    /// a backup-comprehension check, not a security lockout. See
    /// `failedAttempts`'s own doc comment for why no persistence exists.
    private static let maxFailedAttempts = 3
    /// Stage 5E.9E3: `ScrollViewReader` anchor id — see `content(model:)`.
    private static let contentTopAnchorID = "verification-content-top"
}
