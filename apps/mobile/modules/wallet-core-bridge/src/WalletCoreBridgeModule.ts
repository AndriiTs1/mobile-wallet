import { NativeModule, requireNativeModule } from 'expo';

declare class WalletCoreBridgeModule extends NativeModule<{}> {
  getVersion(): string;
  healthCheck(): string;
  // Stage 5E.4: secret-free. Presents the native backup-phrase screen;
  // takes no argument and resolves with no value. No wallet secret ever
  // crosses this boundary in either direction.
  presentBackupPhrase(): Promise<void>;
}

export default requireNativeModule<WalletCoreBridgeModule>('WalletCoreBridge');
