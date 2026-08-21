import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot, { type ViewShotRef, releaseCapture } from 'react-native-view-shot';
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
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<ViewShotRef | null>(null);

  const handleCopy = async () => {
    if (state.status !== 'ready') return;

    await Clipboard.setStringAsync(state.address);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1800);
  };

  const handleShare = async () => {
    if (state.status !== 'ready' || isSharing) return;

    const shareCard = shareCardRef.current;
    if (!shareCard) return;

    setIsSharing(true);

    let capturedUri: string | null = null;

    try {
      capturedUri = await shareCard.capture?.();

      if (!capturedUri) {
        throw new Error('Share card capture failed');
      }

      await Share.share({
        title: 'Receive Ethereum',
        message: `My public Ethereum address\n${state.address}\nNetwork: Ethereum Mainnet`,
        url: capturedUri,
      });
    } catch {
      // Share cancellation or capture failure must never crash Receive.
    } finally {
      if (capturedUri) {
        releaseCapture(capturedUri);
      }
      setIsSharing(false);
    }
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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share Ethereum QR code and address"
            disabled={isSharing}
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
            <Text style={styles.shareButtonText}>
              {isSharing ? 'Preparing…' : 'Share'}
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

          <ViewShot
            ref={shareCardRef}
            options={{ format: 'png', quality: 1, result: 'tmpfile' }}
            style={styles.shareCapture}>
            <View style={styles.shareCard} collapsable={false}>
              <View style={styles.shareBrandRow}>
                <View style={styles.shareBrandMark}>
                  <Text style={styles.shareBrandGlyph}>S</Text>
                </View>
                <Text style={styles.shareBrandName}>SwissWallet</Text>
              </View>

              <View style={styles.shareDivider}>
                <View style={styles.shareDividerLine} />
                <View style={styles.shareDividerDiamond} />
                <View style={styles.shareDividerLine} />
              </View>

              <Text style={styles.shareTitle}>Receive Ethereum</Text>

              <View style={styles.shareNetworkPill}>
                <CoinBadge symbol="ETH" size={22} />
                <Text style={styles.shareNetwork}>Ethereum Mainnet</Text>
                <View style={styles.shareNetworkDot} />
              </View>

              <View style={styles.shareQrPanel}>
                <QRCode
                  value={state.address}
                  size={224}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
              </View>

              <Text style={styles.shareAddressLabel}>ETH ADDRESS</Text>

              <View style={styles.shareAddressPanel}>
                <Text style={styles.shareAddress}>
                  {`${state.address.slice(0, 10)}…${state.address.slice(-8)}`}
                </Text>
              </View>

              <View style={styles.shareHintRow}>
                <SymbolView
                  name={{ ios: 'viewfinder' }}
                  size={18}
                  tintColor="#D6B15E"
                  fallback={<Text style={styles.shareHintFallback}>⌗</Text>}
                />
                <Text style={styles.shareHint}>Scan to send ETH</Text>
              </View>
            </View>
          </ViewShot>
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

  shareCapture: {
    position: 'absolute',
    left: -1200,
    top: 0,
    width: 360,
  },
  shareCard: {
    width: 360,
    backgroundColor: '#090B10',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#D6B15E',
    paddingHorizontal: 26,
    paddingTop: 24,
    paddingBottom: 26,
    alignItems: 'center',
  },

  shareBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  shareBrandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6B15E',
    backgroundColor: '#17140D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBrandGlyph: {
    color: '#D6B15E',
    fontSize: 21,
    fontWeight: '900',
  },
  shareBrandName: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },

  shareDivider: {
    width: '100%',
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#6F5A28',
  },
  shareDividerDiamond: {
    width: 8,
    height: 8,
    backgroundColor: '#D6B15E',
    transform: [{ rotate: '45deg' }],
  },

  shareTitle: {
    marginTop: 20,
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    textAlign: 'center',
  },

  shareNetworkPill: {
    marginTop: 14,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#625A45',
    backgroundColor: '#15171D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  shareNetwork: {
    color: '#D8D8DC',
    fontSize: 14,
    fontWeight: '600',
  },
  shareNetworkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4AC66D',
  },

  shareQrPanel: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#D6B15E',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },

  shareAddressLabel: {
    marginTop: 19,
    color: '#D6B15E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  shareAddressPanel: {
    marginTop: 7,
    width: '100%',
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#6F5A28',
    backgroundColor: '#0E1117',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareAddress: {
    color: '#FFFFFF',
    fontFamily: 'ui-monospace',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },

  shareHintRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareHint: {
    color: '#D6B15E',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  shareHintFallback: {
    color: '#D6B15E',
    fontSize: 17,
    fontWeight: '700',
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
