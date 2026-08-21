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
        message: `SwissWallet · Ethereum Mainnet\n${state.address}`,
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

              <Text style={styles.shareTitle}>Receive Ethereum</Text>
              <Text style={styles.shareNetwork}>Ethereum Mainnet</Text>

              <View style={styles.shareQrPanel}>
                <QRCode
                  value={state.address}
                  size={230}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
              </View>

              <Text style={styles.shareAddressLabel}>ETH address</Text>
              <Text style={styles.shareAddress}>
                {`${state.address.slice(0, 10)}…${state.address.slice(-8)}`}
              </Text>

              <Text style={styles.shareHint}>Scan to send ETH</Text>
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
    minHeight: 470,
    backgroundColor: '#0A0B0F',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 28,
    alignItems: 'center',
  },
  shareBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 9,
  },
  shareBrandMark: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: palette.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBrandGlyph: {
    color: '#0A0B0F',
    fontSize: 16,
    fontWeight: '800',
  },
  shareBrandName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  shareTitle: {
    marginTop: 24,
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
  },
  shareNetwork: {
    marginTop: 5,
    color: '#989AA4',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareQrPanel: {
    marginTop: 22,
    padding: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
  },
  shareAddressLabel: {
    marginTop: 20,
    color: '#989AA4',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareAddress: {
    marginTop: 5,
    color: '#FFFFFF',
    fontFamily: 'ui-monospace',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareHint: {
    marginTop: 16,
    color: '#D6B15E',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
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
