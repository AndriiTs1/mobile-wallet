import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
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

  const handleShare = async () => {
    if (state.status !== 'ready') return;

    await Share.share({
      message: state.address,
    });
  };

  return (
    <ScreenScaffold header={<ScreenHeader title="Receive" back />}>
      {state.status === 'ready' ? (
        <View style={styles.content}>
          <View style={styles.assetBlock}>
            <CoinBadge symbol="ETH" size={52} />
            <Text style={styles.assetName}>Ethereum</Text>
            <Text style={styles.assetSymbol}>ETH · Ethereum Mainnet</Text>
          </View>

          <View style={styles.qrPanel}>
            <QRCode
              value={state.address}
              size={216}
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share Ethereum address"
            onPress={handleShare}
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.shareButtonPressed,
            ]}>
            <SymbolView
              name={{ ios: 'square.and.arrow.up' }}
              size={18}
              tintColor={palette.textSecondary}
              fallback={<Text style={styles.shareFallback}>↗</Text>}
            />
            <Text style={styles.shareButtonText}>Share address</Text>
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
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },

  assetBlock: {
    alignItems: 'center',
  },
  assetName: {
    marginTop: Spacing.two,
    color: palette.text,
    fontSize: 22,
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
    marginTop: Spacing.five,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  addressLabel: {
    marginTop: Spacing.four,
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  addressText: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    color: palette.text,
    fontFamily: 'ui-monospace',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  copyButton: {
    marginTop: Spacing.four,
    minHeight: 54,
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

  shareButton: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  shareButtonPressed: {
    opacity: 0.65,
  },
  shareButtonText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  shareFallback: {
    color: palette.textSecondary,
    fontSize: 16,
  },

  noticeRow: {
    marginTop: Spacing.four,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + 2,
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  noticeGlyphFallback: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  noticeText: {
    flex: 1,
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
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
