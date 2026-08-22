import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { EthereumAddress } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import {
  getBitcoinAddressV1,
  getEthereumAddressV1,
} from '@/services/wallet-core-bridge';

const palette = Colors.dark;

const GENERIC_ERROR_MESSAGE =
  'Something went wrong loading your address. Please try again.';

type ReceiveAssetSymbol =
  | 'BTC'
  | 'ETH'
  | 'USDT'
  | 'USDC'
  | 'XAUT';

type ReceiveAsset = {
  readonly symbol: ReceiveAssetSymbol;
  readonly displaySymbol: string;
  readonly name: string;
  readonly network: string;
};

const RECEIVE_ASSETS: readonly ReceiveAsset[] = [
  {
    symbol: 'BTC',
    displaySymbol: 'BTC',
    name: 'Bitcoin',
    network: 'Bitcoin Mainnet',
  },
  {
    symbol: 'ETH',
    displaySymbol: 'ETH',
    name: 'Ethereum',
    network: 'Ethereum Mainnet',
  },
  {
    symbol: 'USDT',
    displaySymbol: 'USDT',
    name: 'Tether',
    network: 'Ethereum Mainnet',
  },
  {
    symbol: 'USDC',
    displaySymbol: 'USDC',
    name: 'USD Coin',
    network: 'Ethereum Mainnet',
  },
  {
    symbol: 'XAUT',
    displaySymbol: 'XAU₮',
    name: 'Tether Gold',
    network: 'Ethereum Mainnet',
  },
];

type AddressState =
  | {
      status: 'ready';
      ethereumAddress: EthereumAddress;
      bitcoinAddress: string;
    }
  | { status: 'error' };

export default function ReceiveScreen() {
  const [state] = useState<AddressState>(() => {
    try {
      return {
        status: 'ready',
        ethereumAddress: getEthereumAddressV1(),
        bitcoinAddress: getBitcoinAddressV1(),
      };
    } catch {
      return { status: 'error' };
    }
  });

  const [selectedSymbol, setSelectedSymbol] =
    useState<ReceiveAssetSymbol>('ETH');
  const [copied, setCopied] = useState(false);

  const selectedAsset =
    RECEIVE_ASSETS.find(
      (asset) => asset.symbol === selectedSymbol,
    ) ?? RECEIVE_ASSETS[1];

  const selectedAddress =
    state.status === 'ready'
      ? selectedSymbol === 'BTC'
        ? state.bitcoinAddress
        : state.ethereumAddress
      : null;

  const handleSelectAsset = (
    symbol: ReceiveAssetSymbol,
  ) => {
    setSelectedSymbol(symbol);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!selectedAddress) return;

    await Clipboard.setStringAsync(selectedAddress);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1800);
  };

  return (
    <ScreenScaffold
      header={<ScreenHeader title="Receive" back />}>
      {state.status === 'ready' && selectedAddress ? (
        <View style={styles.content}>
          <View style={styles.assetSelector}>
            {RECEIVE_ASSETS.map((asset) => {
              const selected =
                asset.symbol === selectedSymbol;

              return (
                <Pressable
                  key={asset.symbol}
                  accessibilityRole="button"
                  accessibilityLabel={`Receive ${asset.name}`}
                  accessibilityState={{ selected }}
                  onPress={() =>
                    handleSelectAsset(asset.symbol)
                  }
                  style={[
                    styles.assetSelectorItem,
                    selected &&
                      styles.assetSelectorItemSelected,
                  ]}>
                  <CoinBadge
                    symbol={asset.symbol}
                    size={27}
                  />
                  <Text
                    style={[
                      styles.assetSelectorLabel,
                      selected &&
                        styles.assetSelectorLabelSelected,
                    ]}>
                    {asset.displaySymbol}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.assetBlock}>
            <CoinBadge
              symbol={selectedAsset.symbol}
              size={44}
            />

            <Text style={styles.assetName}>
              {selectedAsset.name}
            </Text>

            <Text style={styles.assetSymbol}>
              {selectedAsset.displaySymbol} ·{' '}
              {selectedAsset.network}
            </Text>
          </View>

          <View style={styles.qrPanel}>
            <QRCode
              value={selectedAddress}
              size={196}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>

          <Text style={styles.addressLabel}>
            Your {selectedAsset.displaySymbol} address
          </Text>

          <Text
            style={styles.addressText}
            selectable
            accessibilityLabel={`Your ${selectedAsset.name} address`}>
            {selectedAddress}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Copy ${selectedAsset.name} address`}
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
            ]}>
            <SymbolView
              name={{
                ios: copied
                  ? 'checkmark.circle.fill'
                  : 'doc.on.doc',
              }}
              size={19}
              tintColor={
                copied
                  ? palette.positive
                  : palette.background
              }
              fallback={
                <Text style={styles.copyFallback}>
                  {copied ? '✓' : '▣'}
                </Text>
              }
            />

            <Text
              style={[
                styles.copyButtonText,
                copied &&
                  styles.copyButtonTextCopied,
              ]}>
              {copied ? 'Copied' : 'Copy address'}
            </Text>
          </Pressable>

          <View style={styles.noticeRow}>
            <SymbolView
              name={{ ios: 'info.circle' }}
              size={15}
              tintColor={palette.textSecondary}
              fallback={
                <Text
                  style={styles.noticeGlyphFallback}>
                  ⓘ
                </Text>
              }
            />

            <Text style={styles.noticeText}>
              {selectedSymbol === 'BTC'
                ? 'Only send BTC on Bitcoin Mainnet to this address.'
                : `Only send ${selectedAsset.displaySymbol} on Ethereum Mainnet to this address.`}
            </Text>
          </View>
        </View>
      ) : (
        <View
          style={styles.errorPanel}
          accessible
          accessibilityRole="alert">
          <Text style={styles.errorText}>
            {GENERIC_ERROR_MESSAGE}
          </Text>
        </View>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },

  assetSelector: {
    width: '100%',
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.four,
  },

  assetSelectorItem: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },

  assetSelectorItemSelected: {
    borderColor: palette.accentGold,
  },

  assetSelectorLabel: {
    color: palette.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
  },

  assetSelectorLabelSelected: {
    color: palette.accentGold,
  },

  assetBlock: {
    alignItems: 'center',
  },

  assetName: {
    marginTop: Spacing.one + 2,
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },

  assetSymbol: {
    marginTop: 3,
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },

  qrPanel: {
    marginTop: Spacing.four,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addressLabel: {
    marginTop: Spacing.three,
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  addressText: {
    marginTop: Spacing.one,
    width: '100%',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: palette.text,
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    fontFamily: 'ui-monospace',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  copyButton: {
    marginTop: Spacing.four,
    minHeight: 50,
    width: '100%',
    borderRadius: 16,
    backgroundColor: palette.accentGold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },

  copyButtonPressed: {
    opacity: 0.82,
  },

  copyButtonText: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },

  copyButtonTextCopied: {
    color: palette.background,
  },

  copyFallback: {
    color: palette.background,
    fontSize: 18,
    fontWeight: '700',
  },

  noticeRow: {
    marginTop: Spacing.three,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },

  noticeGlyphFallback: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  noticeText: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
    flexShrink: 1,
  },

  errorPanel: {
    marginTop: Spacing.four,
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },

  errorText: {
    color: palette.negative,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
