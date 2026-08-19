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
//
// Stage 5E.7B: visual restyle only, to match the React Native onboarding
// screen's design system (apps/mobile/src/components/create-wallet-screen.tsx).
// `WalletBackupPhraseViewModel` below — the state machine, secret-lifetime
// handling, and screen-capture detection — is unchanged from Stage 5E.3.
// Only `WalletBackupPhraseView`'s rendering was restyled.

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

/// Stage 5E.7B: color palette matching the RN Mobile Wallet design system
/// (`apps/mobile/src/constants/theme.ts`'s `Colors.dark`) — hardcoded here
/// since native Swift can't import the RN theme module. Kept as this
/// file's single source of truth for color so both onboarding screens read
/// as the same product, not two different visual brands.
private enum Palette {
    static let background = Color(red: 0x0A / 255.0, green: 0x0B / 255.0, blue: 0x0F / 255.0)
    static let surface = Color(red: 0x15 / 255.0, green: 0x17 / 255.0, blue: 0x1D / 255.0)
    static let text = Color.white
    static let textSecondary = Color(red: 0x8D / 255.0, green: 0x91 / 255.0, blue: 0x9B / 255.0)
    static let accentGold = Color(red: 0xC9 / 255.0, green: 0xA2 / 255.0, blue: 0x4B / 255.0)
    static let border = Color.white.opacity(0.08)
}

/// The backup-phrase screen itself. `internal`, never `public`/Expo-visible.
struct WalletBackupPhraseView: View {
    @StateObject private var viewModel = WalletBackupPhraseViewModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var isBeingCaptured = false

    /// Placeholder-only in this stage: invoked when the user taps the
    /// bottom action button. Does NOT persist any "backup confirmed"
    /// state — that, along with real onboarding wiring, is explicitly out
    /// of scope here (a later stage). Unchanged by Stage 5E.7B's restyle.
    ///
    /// Dismissal: this screen still has no explicit close/back button —
    /// the existing default modal presentation style (Stage 5E.4's
    /// `WalletBackupPhrasePresenter`, unchanged) already supports
    /// swipe-to-dismiss, which is the "existing... affordance already
    /// supported by current presentation architecture" this stage's own
    /// instruction permits reusing. No new dismiss/navigation logic was
    /// added merely for appearance.
    let onWrittenDown: () -> Void

    var body: some View {
        ZStack {
            Palette.background.ignoresSafeArea()
            content
        }
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
                .tint(Palette.accentGold)
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
        // grid, unchanged from Stage 5E.3. `mnemonic` itself must stay
        // alive as long as any Substring is used, which is already
        // guaranteed here (it's this enum case's own associated value,
        // alive exactly as long as this branch renders). No separate
        // `[String]` array of words is ever created.
        let words = mnemonic.split(separator: " ")

        // Stage 5E.7B: wrapped in a ScrollView (previously a fixed VStack)
        // so on a short screen, or with larger Dynamic Type sizes, content
        // becomes scrollable rather than clipping the CTA or shrinking the
        // words themselves — mirrors the RN onboarding screen's own
        // ScrollView strategy (Stage 5E.6B) for the same reason.
        return ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                wordGrid(words: words)
                safetyNote
                ctaButton
            }
            .padding(20)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "lock.shield")
                .font(.system(size: 26, weight: .medium))
                .foregroundColor(Palette.accentGold)
                .accessibilityHidden(true)

            Text("Back up your wallet")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Palette.text)

            Text("Anyone who has these words can access your funds.\nNever share them with anyone.\nMobile Wallet cannot recover them for you.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// 6 rows × 2 columns, as specified. Every cell shares one structural
    /// definition (`wordCell`) with no per-cell size/style variation, so
    /// width/height/corner-radius/padding/border are identical by
    /// construction across all 12 cells — not approximated per device.
    private func wordGrid(words: [Substring]) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
            spacing: 10
        ) {
            ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                wordCell(index: index, word: word)
            }
        }
    }

    private func wordCell(index: Int, word: Substring) -> some View {
        HStack(spacing: 8) {
            // Fixed width regardless of digit count (1 vs. 12) so every
            // word starts at the same horizontal position within its cell.
            Text("\(index + 1)")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Palette.accentGold)
                .frame(width: 20, alignment: .leading)

            // Deliberately no `.textSelection(.enabled)` — SwiftUI `Text`
            // is not selectable by default, and this must stay that way:
            // enabling it would surface the system text-selection callout
            // menu, which offers Copy — reintroducing exactly the
            // clipboard exposure this screen must not have.
            Text(word)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Palette.surface)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Palette.border, lineWidth: 1)
        )
        .cornerRadius(12)
    }

    private var safetyNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Palette.accentGold)
                .accessibilityHidden(true)

            (Text("Write these words down ").foregroundColor(Palette.textSecondary)
                + Text("in order").foregroundColor(Palette.accentGold).fontWeight(.semibold)
                + Text(" and store them somewhere safe.").foregroundColor(Palette.textSecondary))
                .font(.system(size: 13))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var ctaButton: some View {
        Button(action: onWrittenDown) {
            Text("I've written it down")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Palette.background)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(Palette.accentGold)
                .cornerRadius(14)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("I've written it down")
    }

    private var errorView: some View {
        VStack(spacing: 12) {
            Text("Something went wrong")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Palette.text)
            Text("Your backup phrase couldn't be displayed right now. Please try again.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private var capturedPlaceholder: some View {
        VStack(spacing: 12) {
            Text("Hidden for your security")
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Palette.text)
            Text("Recording detected. Stop screen recording to view your backup phrase.")
                .font(.system(size: 14))
                .foregroundColor(Palette.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
