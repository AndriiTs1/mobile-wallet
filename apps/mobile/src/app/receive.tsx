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
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';

const palette = Colors.dark;

const GENERIC_ERROR_MESSAGE = 'Something went wrong loading your address. Please try again.';

type AddressState =
  | { status: 'ready'; address: EthereumAddress }
  | { status: 'error' };

export default function ReceiveScreen() {
  const [state] = useState<AddressState>(() => {
    try {
      return { status: 'ready', address: getEthereumAddressV1() };
    } catch {
      return { status: 'error' };
    }
  });

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (state.status !== 'ready') return;

    await Clipboard.setStringAsync(state.address);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1800);
  };


  return (
    <ScreenScaffold header={<ScreenHeader title="Receive" back />}>
      {state.status === 'ready' ? (
        <View style={styles.content}>
          <View style={styles.assetBlock}>
            <CoinBadge symbol="ETH" size={44} />
            <Text style={styles.assetName}>Ethereum</Text>
            <Text style={styles.assetSymbol}>ETH · Ethereum Mainnet</Text>
          </View>

          <View style={styles.qrPanel}>
            <QRCode
              value={state.address}
              size={196}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>

          <Text style={styles.addressLabel}>Your ETH address</Text>

          <Text
            style={styles.addressText}
            selectable
            accessibilityLabel="Your Ethereum address">
            {state.address}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy Ethereum address"
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.copyButton,
              pressed && styles.copyButtonPressed,
            ]}>
            <SymbolView
              name={{ ios: copied ? 'checkmark.circle.fill' : 'doc.on.doc' }}
              size={19}
              tintColor={copied ? palette.positive : palette.background}
              fallback={
                <Text style={styles.copyFallback}>
                  {copied ? '✓' : '▣'}
                </Text>
              }
            />
            <Text
              style={[
                styles.copyButtonText,
                copied && styles.copyButtonTextCopied,
              ]}>
              {copied ? 'Copied' : 'Copy address'}
            </Text>
          </Pressable>

          <View style={styles.noticeRow}>
            <SymbolView
              name={{ ios: 'info.circle' }}
              size={15}
              tintColor={palette.textSecondary}
              fallback={<Text style={styles.noticeGlyphFallback}>ⓘ</Text>}
            />
            <Text style={styles.noticeText}>
              Only send ETH on Ethereum Mainnet to this address.
            </Text>
          </View>

        </View>
      ) : (
        <View style={styles.errorPanel} accessible accessibilityRole="alert">
          <Text style={styles.errorText}>{GENERIC_ERROR_MESSAGE}</Text>
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
