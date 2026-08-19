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

    init(mnemonic: String, onVerificationSucceeded: @escaping () -> Void, onVerified: @escaping () -> Void) {
        self.mnemonic = mnemonic
        self.onVerificationSucceeded = onVerificationSucceeded
        self.onVerified = onVerified
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
            // this ensures the failure message is actually announced, per
            // this stage's own accessibility requirement.
            UIAccessibility.post(notification: .announcement, argument: Self.genericFailureMessage)
        }
    }

    // MARK: - Content

    private func content(model: WalletBackupVerificationModel) -> some View {
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
                verifyButton
            }
            .padding(20)
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
        Text(Self.genericFailureMessage)
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(Palette.negative)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityAddTraits(.isStaticText)
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

    /// Builds (or rebuilds) `model` from `mnemonic` and clears any prior
    /// selections. Used both for the initial load and — per this stage's
    /// own "regenerate a fresh verification model / fresh positions" wrong-
    /// answer requirement — after a failed verification attempt, so a
    /// retry never reuses the same positions/choices the user just saw.
    /// On the rare `WalletBackupVerificationModelError` (too few distinct
    /// alternative words, or an unexpected word count), routes to a
    /// generic native failure state — never silently marks backup
    /// confirmed, never falls back to a weaker choice count, never
    /// creates a wallet.
    private func regenerateModel() {
        selections = [:]
        // Deliberately does NOT reset `showError` here — `handleVerifyTapped`
        // calls this to rebuild fresh positions/choices immediately before
        // setting `showError = true` on a failed attempt, and that
        // assignment must be the one that actually sticks (and triggers
        // the VoiceOver announcement below). `showError` is reset
        // elsewhere instead: implicitly (its `@State` default is `false`)
        // on first load, and explicitly the moment the user selects a new
        // answer (see `choiceChip`).
        do {
            model = try WalletBackupVerificationModel(mnemonic: mnemonic)
            modelFailed = false
        } catch {
            model = nil
            modelFailed = true
        }
    }

    private func handleVerifyTapped() {
        guard let model, allQuestionsAnswered else { return }

        if model.validate(selections: selections) {
            // Completion policy decided by the caller — see this file's
            // own header comment. Production marks confirmed; the
            // DEV-only preview path does not.
            onVerificationSucceeded()
            onVerified()
        } else {
            // Generic only — never reveals which position was wrong, never
            // shows the correct word. Fresh positions/choices on retry;
            // no lockout. Order matters: rebuild first, then flip
            // `showError` last so it's the assignment SwiftUI actually
            // observes (see `regenerateModel`'s own comment).
            regenerateModel()
            showError = true
        }
    }

    private static let genericFailureMessage = "That's not quite right. Check your written copy and try again."
}
