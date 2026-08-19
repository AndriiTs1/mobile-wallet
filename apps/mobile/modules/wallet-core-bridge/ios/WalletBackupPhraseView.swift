import Combine
import SwiftUI
import UIKit

// Stage 5E.3 — native backup-phrase screen FOUNDATION ONLY.
//
// Not wired into onboarding, no backup-confirmation persistence, no Face
// ID, no Settings-reveal entry point, no Expo presentation trigger. See
// Stage 5E.1's design report and Stage 5E.2's mnemonic-reconstruction
// plumbing this screen consumes.
//
// The mnemonic never crosses into Expo/React Native/JavaScript: this file
// is deliberately `internal` (no `public` anywhere), lives outside the
// three files the Stage 5D.8B bridge guard scans (WalletCoreBridgeModule.swift,
// WalletCoreBridge.types.ts, WalletCoreBridgeModule.ts), and never imports
// or references anything from `src/` or that module file. No Expo
// Function(...)/AsyncFunction(...) exists anywhere in this file.
//
// Source of truth: WalletSecureStorage.read() -> canonical entropy (already
// persisted by wallet creation, Stage 5D.8C/5D.8D) ->
// dangerousNativeOnlyMnemonicFromEntropyV1(...) (Stage 5E.2) -> mnemonic
// sentence. This screen NEVER references WalletNativeCreateOrchestrator or
// any wallet-creation call — a failed reconstruction shows a generic error
// state, never a fallback to creating a new wallet.

/// PUBLIC-SAFE structurally (nothing here reveals more than this exact
/// screen already shows), still `internal`/never Expo-visible. What the
/// backup-phrase screen currently has to render.
enum WalletBackupPhraseState: Equatable {
    case loading
    case loaded(String)
    case failed
}

/// Native-only, minimal reactive state for the backup-phrase screen.
/// Deliberately not a general MVVM base/framework — just enough state to
/// (a) obtain the phrase, (b) drop it on background/dismiss, (c) re-obtain
/// it on foreground, and (d) be unit-testable independent of SwiftUI's own
/// rendering (per this stage's own "do not introduce a large MVVM
/// architecture just for tests" instruction).
final class WalletBackupPhraseViewModel: ObservableObject {
    @Published private(set) var state: WalletBackupPhraseState = .loading

    /// Obtains the phrase via the Stage 5E.2 native-only reconstruction
    /// path — never generates new entropy, never creates a wallet. Safe to
    /// call repeatedly (e.g. on every foreground transition): always
    /// re-reads persisted entropy fresh rather than caching a prior result.
    /// This is the chosen, documented "returning active" behavior (Stage
    /// 5E.3 §2): re-reconstruct from persisted entropy, never require a
    /// separate reveal gate at this stage (no Face ID exists yet), and
    /// never create a second wallet.
    func loadPhrase() {
        do {
            let mnemonic = try WalletNativeMnemonicReconstructor.reconstructMnemonic()
            state = .loaded(mnemonic)
        } catch {
            // Generic, structural failure only. The caught
            // WalletSecureStorageError/FfiWalletError case name carries no
            // secret, but nothing about it is surfaced here regardless —
            // per this stage's own "do not expose secret/error internals"
            // instruction, and to keep this screen's UI contract fixed.
            state = .failed
        }
    }

    /// Called when the screen backgrounds/resigns active, or disappears.
    /// Drops the phrase from this object's own `@Published` state
    /// immediately, which also makes the view re-render without it before
    /// any app-switcher snapshot is taken (see `WalletBackupPhraseView`'s
    /// scene-phase handling below).
    ///
    /// This reduces the phrase's lifetime in *this object's* storage. It
    /// does NOT prove every Swift-runtime copy (SwiftUI's own diffing/state
    /// machinery, any transient copy made while rendering `Text`) is also
    /// erased — Swift `String` is copy-on-write and unique ownership can't
    /// be verified here, so no zeroization is claimed (same reasoning
    /// already documented in `WalletNativeMnemonicReconstructor`).
    func clearPhrase() {
        state = .loading
    }
}

/// The backup-phrase screen itself. `internal`, never `public`/Expo-visible.
struct WalletBackupPhraseView: View {
    @StateObject private var viewModel = WalletBackupPhraseViewModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var isBeingCaptured = false

    /// Placeholder-only in this stage: invoked when the user taps the
    /// bottom action button. Does NOT persist any "backup confirmed"
    /// state — that, along with real onboarding wiring, is explicitly out
    /// of scope here (a later stage).
    let onWrittenDown: () -> Void

    var body: some View {
        content
            .onAppear { viewModel.loadPhrase() }
            .onDisappear { viewModel.clearPhrase() }
            .onChange(of: scenePhase) { newPhase in
                if newPhase == .active {
                    viewModel.loadPhrase()
                } else {
                    viewModel.clearPhrase()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: UIScreen.capturedDidChangeNotification)) { _ in
                // Detection only. iOS provides no supported API to prevent
                // screenshots or screen recording outright — this hides the
                // phrase while a recording is actively detected; it cannot
                // and does not claim to block a screenshot itself.
                isBeingCaptured = UIScreen.main.isCaptured
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            ProgressView()
        case .failed:
            errorView
        case .loaded(let mnemonic):
            if isBeingCaptured {
                capturedPlaceholder
            } else {
                phraseView(mnemonic: mnemonic)
            }
        }
    }

    private func phraseView(mnemonic: String) -> some View {
        // `.split` returns `[Substring]`: each element shares `mnemonic`'s
        // own storage rather than allocating a new backing buffer per word
        // — the smallest-copy representation practical for a numbered
        // grid. `mnemonic` itself must stay alive as long as any Substring
        // is used, which is already guaranteed here (it's this enum case's
        // own associated value, alive exactly as long as this branch
        // renders). No separate `[String]` array of words is ever created.
        let words = mnemonic.split(separator: " ")

        return VStack(alignment: .leading, spacing: 20) {
            Text("Back up your wallet")
                .font(.title2)
                .fontWeight(.bold)

            Text("Anyone who has these words can access your funds. Never share them with anyone. Nobody from Swiss Wallet will ever ask you for them, and Swiss Wallet cannot recover them for you.")
                .font(.subheadline)
                .foregroundColor(.secondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                    HStack(spacing: 6) {
                        Text("\(index + 1).")
                            .foregroundColor(.secondary)
                        // Deliberately no `.textSelection(.enabled)` —
                        // SwiftUI `Text` is not selectable by default, and
                        // this must stay that way: enabling it would
                        // surface the system text-selection callout menu,
                        // which offers Copy — reintroducing exactly the
                        // clipboard exposure this screen must not have.
                        Text(word)
                    }
                }
            }

            Text("Write these words down in order and store them somewhere safe.")
                .font(.footnote)
                .foregroundColor(.secondary)

            Spacer()

            Button(action: onWrittenDown) {
                Text("I've written it down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private var errorView: some View {
        VStack(spacing: 12) {
            Text("Something went wrong")
                .font(.headline)
            Text("Your backup phrase couldn't be displayed right now. Please try again.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var capturedPlaceholder: some View {
        VStack(spacing: 12) {
            Text("Hidden for your security")
                .font(.headline)
            Text("Recording detected. Stop screen recording to view your backup phrase.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
