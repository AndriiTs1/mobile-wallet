import { NativeModule, requireNativeModule } from 'expo';

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
  // Stage 5E.9B: secret-free. Returns only whether the backup
  // verification flow has ever completed — non-secret metadata, never any
  // wallet secret, byte content, or storage detail. Read-only: no
  // corresponding mutation function is exposed here or anywhere else in
  // this module; only native code may ever set the underlying flag true.
  hasBackupConfirmed(): boolean;
}

export default requireNativeModule<WalletCoreBridgeModule>('WalletCoreBridge');
