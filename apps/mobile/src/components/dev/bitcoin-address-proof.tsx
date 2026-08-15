import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useBitcoinAddressProof } from '@/hooks/use-bitcoin-address-proof';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

/**
 * Stage 4C.3 read-only Bitcoin mainnet address proof — NOT a wallet
 * balance.
 *
 * Public/demo address only: a well-known Bitcoin mainnet exchange cold
 * wallet, independently sourced from a public block-analytics listing
 * (bitinfocharts.com's published richest-addresses ranking, publicly
 * labeled "Robinhood-coldwallet"), not chosen from memory or personal
 * knowledge. Institutional, non-personal, and definitively not this app's
 * developer's own wallet. The application does not possess, store,
 * derive, or use any private key for this public proof address.
 *
 * Rendered only in development builds (`__DEV__`) — temporary diagnostic
 * scaffolding for the read-only proof, not a shipped product surface.
 */
const DEV_PROOF_ADDRESS = 'bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2';

function formatSatsAsBtc(sats: string): string {
  const value = BigInt(sats);
  const divisor = 100_000_000n;
  const whole = value / divisor;
  const fraction = value % divisor;
  return `${whole.toString()}.${fraction.toString().padStart(8, '0')}`;
}

function formatSignedSats(delta: bigint): string {
  if (delta === 0n) return '0';
  const sign = delta < 0n ? '-' : '+';
  const abs = delta < 0n ? -delta : delta;
  return `${sign}${abs.toString()}`;
}

export function BitcoinAddressProof() {
  const { proof, isLoading, error, refresh } = useBitcoinAddressProof(DEV_PROOF_ADDRESS);

  const confirmedUtxoCount = proof?.utxos.filter((utxo) => utxo.confirmed).length ?? 0;
  const unconfirmedUtxoCount = (proof?.utxos.length ?? 0) - confirmedUtxoCount;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEV PROOF — Stage 4C.3</Text>
      <Text style={styles.subtitle}>Bitcoin mainnet · read-only · public demo address · not your wallet</Text>

      <Text style={styles.row}>
        Address: <Text style={styles.mono}>{DEV_PROOF_ADDRESS}</Text>
      </Text>

      {isLoading && !proof ? <Text style={styles.status}>Fetching live address state…</Text> : null}
      {error ? <Text style={styles.statusError}>Unavailable: {error.message}</Text> : null}
      {proof ? (
        <>
          <Text style={styles.row}>
            Provider: <Text style={styles.mono}>{proof.providerId}</Text>
          </Text>
          <Text style={styles.row}>
            Confirmed sats: <Text style={styles.mono}>{proof.confirmedBalance.amount}</Text>
          </Text>
          <Text style={styles.row}>
            Unconfirmed delta: <Text style={styles.mono}>{formatSignedSats(proof.unconfirmedDeltaSats)}</Text>
          </Text>
          <Text style={styles.row}>
            UTXOs: <Text style={styles.mono}>{proof.utxos.length}</Text> ({confirmedUtxoCount} confirmed,{' '}
            {unconfirmedUtxoCount} unconfirmed)
          </Text>
          <Text style={styles.row}>
            UTXO total sats: <Text style={styles.mono}>{proof.utxoTotalSats}</Text>
          </Text>
          <Text style={styles.row}>
            BTC: <Text style={styles.mono}>{formatSatsAsBtc(proof.confirmedBalance.amount)}</Text>
          </Text>
          <Text style={styles.status}>as of {new Date(proof.asOf).toLocaleTimeString()}</Text>
        </>
      ) : null}

      <Pressable onPress={refresh} disabled={isLoading} style={styles.refreshButton}>
        <Text style={styles.refreshLabel}>{isLoading ? 'Refreshing…' : 'Refresh'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.accentGold,
    gap: Spacing.one,
  },
  title: {
    color: palette.accentGold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginBottom: Spacing.one,
  },
  row: {
    color: palette.textSecondary,
    fontSize: 12,
  },
  mono: {
    color: palette.text,
    fontFamily: 'ui-monospace',
    fontSize: 12,
  },
  status: {
    color: palette.textSecondary,
    fontSize: 11,
    marginTop: Spacing.one,
  },
  statusError: {
    color: palette.negative,
    fontSize: 12,
    marginTop: Spacing.one,
  },
  refreshButton: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    backgroundColor: palette.backgroundSelected,
  },
  refreshLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
