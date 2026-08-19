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
}

export default requireNativeModule<WalletCoreBridgeModule>('WalletCoreBridge');
