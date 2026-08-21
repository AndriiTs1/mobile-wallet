/**
 * Stage 5G.4 — Ethereum V1 Receive screen.
 *
 * Displays ONLY this wallet's existing public V1 Ethereum address, read via
 * the production bridge's `getEthereumAddressV1()` (Stage 5G.2.0) — no
 * derivation happens here, and no secret material of any kind (entropy,
 * mnemonic, seed, private key, xpriv) ever crosses into this file. Reading
 * the public address requires no device-owner authentication (same posture
 * as `hasWallet`/`hasBackupConfirmed` — see that function's own doc
 * comment), so this screen never calls `requestAppUnlock`,
 * `requestRevealBackup`, or any biometric/authentication bridge function.
 *
 * V1 scope only: no clipboard copy (no clipboard dependency exists in this
 * project yet — see `apps/mobile/package.json`), no QR code, no ENS, no
 * multi-chain/multi-token receive. The address is rendered as full,
 * untruncated, selectable text so the user can visually verify it and copy
 * it via the OS's native text-selection affordance.
 */
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { EthereumAddress } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';

const palette = Colors.dark;

const GENERIC_ERROR_MESSAGE = 'Something went wrong loading your address. Please try again.';

type AddressState = { status: 'ready'; address: EthereumAddress } | { status: 'error' };

export default function ReceiveScreen() {
  // Read once, on mount — a plain synchronous bridge call, not a retryable
  // async operation. Never surfaces the caught error's own message (see
  // `GENERIC_ERROR_MESSAGE` below) — only whether it succeeded or not.
  const [state] = useState<AddressState>(() => {
    try {
      return { status: 'ready', address: getEthereumAddressV1() };
    } catch {
      return { status: 'error' };
    }
  });

  return (
    <ScreenScaffold header={<ScreenHeader title="Receive" back />}>
      <View style={styles.assetRow}>
        <CoinBadge symbol="ETH" size={28} />
        <View>
          <Text style={styles.assetName}>Ethereum</Text>
          <Text style={styles.assetSymbol}>ETH</Text>
        </View>
      </View>

      {state.status === 'ready' ? (
        <>
          <View style={styles.addressPanel}>
            <Text
              style={styles.addressText}
              selectable
              accessibilityLabel="Your Ethereum address">
              {state.address}
            </Text>
          </View>

          <View style={styles.noticeRow}>
            <SymbolView
              name={{ ios: 'info.circle' }}
              size={14}
              tintColor={palette.textSecondary}
              fallback={<Text style={styles.noticeGlyphFallback}>ⓘ</Text>}
            />
            <Text style={styles.noticeText}>
              Only send ETH on the Ethereum network to this address.
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.errorPanel} accessible accessibilityRole="alert">
          <Text style={styles.errorText}>{GENERIC_ERROR_MESSAGE}</Text>
        </View>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  assetName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  assetSymbol: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  addressPanel: {
    marginTop: Spacing.four,
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  addressText: {
    color: palette.text,
    fontFamily: 'ui-monospace',
    fontSize: 15,
    lineHeight: 22,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.one + 2,
    marginTop: Spacing.three,
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
