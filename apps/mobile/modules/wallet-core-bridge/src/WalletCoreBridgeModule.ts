import { NativeModule, requireNativeModule } from 'expo';

import type { EthereumV1SignedTransaction, EthereumV1TransactionIntent } from './WalletCoreBridge.types';

declare class WalletCoreBridgeModule extends NativeModule<{}> {
  getVersion(): string;
  healthCheck(): string;
  // Stage 5E.4: secret-free. Presents the native backup-phrase screen;
  // takes no argument and resolves with no value. No wallet secret ever
  // crosses this boundary in either direction.
  presentBackupPhrase(): Promise<void>;
  // Stage 5E.5: secret-free. Creates and persists a new wallet natively,
  // then (only on success) presents the native backup-phrase screen.
  // Takes no argument and resolves with no value; rejects with a generic,
  // non-descriptive error on any failure. No wallet secret ever crosses
  // this boundary in either direction.
  createWalletAndPresentBackup(): Promise<void>;
  // Stage 5E.6: secret-free. Returns only whether wallet secret storage
  // currently exists — never any byte content, address, or storage-error
  // detail. Throws (rejects the calling context) on a genuine storage
  // failure rather than silently reporting `false`.
  hasWallet(): boolean;
  // Stage 5G.2.0: secret-free. Returns ONLY the persisted wallet's public
  // V1 Ethereum address (a plain string) — never entropy, mnemonic, seed,
  // private key, xpriv, or any other secret material. Takes no argument.
  // Ethereum addresses are public data; this is deliberately NOT gated by
  // any device-owner authentication (no fresh Face ID/Touch ID/passcode
  // required), the same posture as hasWallet()/hasBackupConfirmed() above.
  // Narrowly scoped to exactly this one V1 Ethereum address — no generic
  // deriveAddress(path), no arbitrary derivation-path parameter, no other
  // chain, no key-material primitive of any kind.
  getEthereumAddressV1(): string;
  // Stage 5E.9B: secret-free. Returns only whether the backup
  // verification flow has ever completed — non-secret metadata, never any
  // wallet secret, byte content, or storage detail. Read-only: no
  // corresponding mutation function is exposed here or anywhere else in
  // this module; only native code may ever set the underlying flag true.
  hasBackupConfirmed(): boolean;
  // Stage 5F.3: secret-free. Gated reveal entry point for Settings >
  // Recovery & Backup — native device-owner authentication (Face ID/
  // Touch ID/passcode fallback) must succeed BEFORE the recovery phrase
  // is ever reconstructed or presented. Takes no argument, resolves with
  // no value; rejects with a generic, non-descriptive error on
  // authentication failure/cancellation or any other failure. No secret,
  // and no authentication result/token, ever crosses this boundary in
  // either direction. presentBackupPhrase (above) remains unchanged and
  // ungated — it is still the only thing the onboarding backupRequired
  // resume flow calls.
  requestRevealBackup(): Promise<void>;
  // Stage 5F.4A: secret-free. App Lock authorization bridge foundation —
  // not wired into any UI/lifecycle yet. Native device-owner
  // authentication (Face ID/Touch ID/passcode fallback). Takes no
  // argument, resolves with no value; rejects with a generic,
  // non-descriptive error on authentication failure/cancellation/
  // unavailability. No boolean, token, or OS error detail ever crosses
  // this boundary. This authorization is ONLY for application UI access
  // — it must never be treated as authorization for recovery-phrase
  // reveal (requestRevealBackup above) or future transaction signing;
  // each of those independently performs its own fresh native
  // authentication regardless of this call's outcome.
  requestAppUnlock(): Promise<void>;
  // Stage 5G.1: the ONE production Ethereum V1 transaction-signing bridge
  // operation. Takes only a structured, public transaction intent — never
  // a private key, seed, entropy, mnemonic, xpriv, or precomputed signing
  // hash; EthereumV1TransactionIntent has no field that could carry one.
  // Native device-owner authentication (Face ID/Touch ID/passcode
  // fallback) must succeed FIRST, fresh, every single call — never
  // satisfied by requestAppUnlock or requestRevealBackup, and never
  // cached/reused across calls. Resolves with only the signed transaction
  // hex and its hash; rejects with a generic, non-descriptive error on any
  // failure (authentication or signing). The private key never crosses
  // this boundary, or any boundary — it never leaves native Rust code.
  signEthereumTransactionV1(intent: EthereumV1TransactionIntent): Promise<EthereumV1SignedTransaction>;
  // Stage 5E.9E2: DEV-ONLY. Only exists as a callable native method in
  // DEBUG builds (the underlying Swift Function is compiled out entirely
  // in Release — see WalletCoreBridgeModule.swift) — RN must only ever
  // call this from __DEV__-gated Showcase Mode. Secret-free: takes no
  // argument, resolves with no value. Presents the exact same real native
  // UI as presentBackupPhrase against the exact same already-persisted
  // wallet entropy, but a successful verification does NOT mark backup
  // confirmed — see WalletBackupPhrasePresenter.presentPreview()'s own
  // doc comment for why that decision is made entirely in native code.
  presentBackupPhrasePreview(): Promise<void>;
}

export default requireNativeModule<WalletCoreBridgeModule>('WalletCoreBridge');
