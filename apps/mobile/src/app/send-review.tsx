import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWeiAsEthDecimalString } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { consumePendingEthereumSend } from '@/services/ethereum-send-session';

const palette = Colors.dark;

/**
 * Stage 5G.2.3 — Review. Displays exactly the immutable
 * `EthereumV1PreparedSend` snapshot the Send form already prepared (Stage
 * 5G.2.2) — this screen never calls `prepareEthereumV1Send` itself, never
 * re-fetches nonce/fee/balance, and never recomputes the amount/recipient.
 * What is shown here is exactly what Stage 5G.2.4 will sign.
 */
export default function SendReviewScreen() {
  const router = useRouter();
  // Consumed exactly once, at mount — `useState`'s lazy initializer runs
  // only on the very first render of this screen instance, never again,
  // so re-renders (e.g. from this component's own state changes) can never
  // consume a second time.
  const [prepared] = useState(() => consumePendingEthereumSend());

  if (!prepared) {
    return (
      <ScreenScaffold header={<ScreenHeader title="Review" back />}>
        <View style={styles.expiredPanel}>
          <Text style={styles.expiredTitle}>Nothing to review</Text>
          <Text style={styles.expiredBody}>Please prepare a new transaction.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Send"
          onPress={() => router.replace('/send')}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
          <Text style={styles.editButtonLabel}>Back to Send</Text>
        </Pressable>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold header={<ScreenHeader title="Review" back />}>
      <View style={styles.assetRow}>
        <CoinBadge symbol="ETH" size={28} />
        <View>
          <Text style={styles.assetName}>Ethereum</Text>
          <Text style={styles.assetSymbol}>ETH</Text>
        </View>
      </View>

      <View style={styles.card}>
        <ReviewRow label="Recipient" value={prepared.recipient} mono />
        <ReviewRow label="Amount" value={`${formatWeiAsEthDecimalString(prepared.amountWei)} ETH`} />
        <ReviewRow
          label="Maximum network fee"
          value={`${formatWeiAsEthDecimalString(prepared.maxFeeWei)} ETH`}
        />
        <ReviewRow
          label="Maximum total debit"
          value={`${formatWeiAsEthDecimalString(prepared.totalMaxDebitWei)} ETH`}
          emphasized
        />
        <ReviewRow label="Network" value="Ethereum" last />
      </View>

      {/* Stage 5G.2.4 boundary: this is deliberately NOT a Pressable — no
          onPress exists anywhere on it, so it cannot sign or broadcast no
          matter how it is styled. Confirm & Send is reserved for Stage
          5G.2.4, which will replace this static placeholder with the real,
          functional action. */}
      <View accessibilityState={{ disabled: true }} style={styles.reservedCta}>
        <Text style={styles.reservedCtaLabel}>Confirm & Send</Text>
      </View>
      <Text style={styles.reservedCtaCaption}>Sending arrives in a future update.</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Edit"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
        <Text style={styles.editButtonLabel}>Back to Edit</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

type ReviewRowProps = {
  label: string;
  value: string;
  mono?: boolean;
  emphasized?: boolean;
  last?: boolean;
};

function ReviewRow({ label, value, mono, emphasized, last }: ReviewRowProps) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, mono && styles.rowValueMono, emphasized && styles.rowValueEmphasized]}
        numberOfLines={mono ? 1 : undefined}
        ellipsizeMode={mono ? 'middle' : undefined}>
        {value}
      </Text>
    </View>
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
  card: {
    marginTop: Spacing.four,
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  row: {
    paddingVertical: Spacing.two + 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  rowValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  rowValueMono: {
    fontFamily: 'ui-monospace',
    fontSize: 13,
    fontWeight: '500',
  },
  rowValueEmphasized: {
    color: palette.accentGold,
  },
  reservedCta: {
    marginTop: Spacing.five,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    backgroundColor: palette.backgroundElement,
    opacity: 0.5,
  },
  reservedCtaLabel: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  reservedCtaCaption: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: Spacing.one + 2,
  },
  editButton: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
  },
  editButtonPressed: {
    opacity: 0.55,
  },
  editButtonLabel: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  expiredPanel: {
    marginTop: Spacing.five,
    alignItems: 'center',
    gap: Spacing.one,
  },
  expiredTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  expiredBody: {
    color: palette.textSecondary,
    fontSize: 13,
  },
});
