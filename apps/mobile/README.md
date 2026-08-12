# Mobile Wallet 🇨🇭

Mobile Wallet is a modern non-custodial crypto wallet built with React Native and Expo.

The project is focused on security, simplicity, and a premium Swiss FinTech user experience.

> Mobile Wallet is currently under active development.

## Tech Stack

- React Native
- Expo SDK 57
- Expo Router
- TypeScript
- pnpm
- Monorepo architecture

## Project Structure

```text
mobile-wallet/
├── apps/
│   └── mobile/          # React Native / Expo application
│
├── packages/            # Shared packages and wallet modules
│
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

Or launch a platform directly:

```bash
pnpm run ios
```

```bash
pnpm run android
```

```bash
pnpm run web
```

## Development

The mobile application uses Expo Router with file-based routing.

Application routes are located in:

```text
apps/mobile/src/app/
```

The project currently targets iOS first, with Android support planned as part of the same React Native codebase.

## V1 Scope

Mobile Wallet V1 will focus on the core non-custodial wallet experience:

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

Transaction signing is performed locally on the user's device.

## Architecture

```text
Mobile App
    │
    ├── Wallet Core
    │     ├── Key management
    │     ├── Address generation
    │     └── Transaction signing
    │
    └── Mobile Wallet API
          ├── Market data
          ├── Blockchain data
          └── External providers
```

Future shared wallet logic and TypeScript packages will live under:

```text
packages/
```

## Security

Security is a core requirement of Mobile Wallet.

The project follows several fundamental principles:

- Non-custodial architecture
- No private keys on the backend
- No recovery phrase logging
- Local transaction signing
- Secure device storage
- Biometric protection where available
- No secrets committed to Git

## Status

🚧 **Mobile Wallet V1 — Foundation / Active Development**

Current development environment:

- Expo SDK 57
- React Native
- TypeScript
- pnpm workspace
- iOS Simulator

## License

Private project. All rights reserved.
