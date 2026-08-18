# Mobile Wallet 🇨🇭

Mobile Wallet is a security-first, non-custodial crypto wallet built with React Native and Expo.

The project is focused on security, simplicity, and a premium Swiss FinTech user experience.

> Mobile Wallet is currently under active development.

## Tech Stack

- React Native 0.86
- Expo SDK 57
- Expo Router
- TypeScript
- Rust
- UniFFI
- Expo Modules API
- Swift native integration
- pnpm
- Monorepo architecture

## Project Structure

```text
mobile-wallet/
├── apps/
│   └── mobile/
│       ├── src/                         # React Native / Expo application
│       └── modules/
│           └── wallet-core-bridge/      # Native Expo bridge to Wallet Core
│
├── packages/
│   ├── chain-domain/                    # Shared public chain-domain types
│   └── wallet-core/                     # Security-critical Rust Wallet Core
│
├── tools/
│   └── uniffi-bindgen/                  # Host-only UniFFI binding generator
│
├── docs/                                # Architecture and ADR documentation
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

## Getting Started

### 1. Install dependencies

From the repository root:

```bash
pnpm install
```

### 2. Start the mobile application

```bash
cd apps/mobile
pnpm start
```

To create and run a native iOS development build:

```bash
pnpm run ios
```

Android uses the same React Native application and remains part of the V1 target.

## Development

The mobile application uses Expo Router with file-based routing.

Application routes are located in:

```text
apps/mobile/src/app/
```

The project is currently iOS-first, while Android remains part of the same React Native codebase.

Because Wallet Core uses native code, Expo Go is not sufficient for Wallet Core development. Native development builds are required.

## V1 Scope

Mobile Wallet V1 is designed to provide the core non-custodial wallet experience:

- Create wallet
- Import existing wallet
- Secure local key storage
- Biometric authentication
- Portfolio balance in CHF
- Asset balances
- Send crypto
- Receive crypto with QR codes
- Transaction history
- Wallet backup and security settings

Private keys and recovery secrets must never be transmitted to the Mobile Wallet backend.

Security-critical wallet operations and transaction signing are designed to execute locally on the user's device inside the Wallet Core trust boundary.

## Wallet Core Architecture

React Native is the presentation and orchestration layer. It must not directly handle seed phrases, private keys, or other secret wallet material.

The native Wallet Core boundary is:

```text
React Native / Expo
        │
        ▼
WalletCoreBridge
Expo Modules API
        │
        ▼
Swift
        │
        ▼
UniFFI
        │
        ▼
Rust Wallet Core
```

The Rust implementation lives in:

```text
packages/wallet-core/
```

The React Native/native bridge lives in:

```text
apps/mobile/modules/wallet-core-bridge/
```

Host-only UniFFI binding generation tooling lives in:

```text
tools/uniffi-bindgen/
```

This separation keeps build-time binding-generation dependencies out of the Wallet Core device runtime dependency surface.

## Wallet Core Foundation Status

The native Wallet Core foundation is implemented and operational.

The current Stage 5A bridge intentionally exposes only two deterministic proof operations:

```text
getVersion()  → 0.1.0
healthCheck() → pong
```

These calls verify the complete native execution path:

```text
React Native → Expo Module → Swift → UniFFI → Rust
```

The bridge has been successfully built, installed, launched, and runtime-verified on a physical iPhone.

Rust source is cross-compiled for the required iOS target during the native build process. Compiled Wallet Core binaries and Rust `target/` directories are build artifacts and must not be committed to Git.

## Not Yet Implemented

The Stage 5A native bridge is infrastructure only.

The following security-critical capabilities are deliberately not implemented yet:

- Entropy generation
- BIP-39 mnemonic generation/import
- Seed lifecycle management
- HD key derivation
- Private-key lifecycle management
- Secure secret storage
- Biometric-gated secret access
- Transaction signing
- Recovery phrase reveal

These capabilities must be introduced incrementally through dedicated security-reviewed stages.

The successful Stage 5A proof must not be interpreted as proof that wallet creation, key management, secure storage, or signing is already implemented.

## Security Principles

Security is a core architectural requirement of Mobile Wallet.

The project follows these fundamental principles:

- Non-custodial architecture
- Private keys never leave the user's device
- Recovery secrets never leave the user's device
- No private keys or recovery phrases on the backend
- No recovery phrase or private-key logging
- No secret material in analytics or crash reports
- React Native does not directly manipulate secret wallet material
- Security-critical operations belong inside Wallet Core
- Transaction signing is performed locally
- Secure device storage protects persisted secret material
- Fresh local authentication is required for sensitive operations according to the security architecture
- No secrets committed to Git
- No compiled Wallet Core binaries committed to Git
- Native bridge APIs remain narrow and explicitly allowlisted

## Current Status

🚧 **Mobile Wallet V1 — Foundation / Active Development**

Current foundation:

- Expo SDK 57
- React Native 0.86
- TypeScript
- pnpm workspace
- Rust Wallet Core crate
- UniFFI Swift bindings
- Expo native Wallet Core bridge
- iOS Simulator native builds
- Physical iPhone native build and runtime verification
- Wallet Core proof: `0.1.0 / pong`

Stage 5A establishes the native Wallet Core boundary only. Secret-bearing wallet functionality remains intentionally deferred to subsequent security-reviewed stages.

## License

Private project. All rights reserved.
