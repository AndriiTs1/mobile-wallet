import { NativeModule, requireNativeModule } from 'expo';

declare class WalletCoreBridgeModule extends NativeModule<{}> {
  getVersion(): string;
  healthCheck(): string;
}

export default requireNativeModule<WalletCoreBridgeModule>('WalletCoreBridge');
