import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toEthereumAddress } from 'chain-domain';

import { useEthereumBalanceProof } from '@/hooks/use-ethereum-balance-proof';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

/**
 * Stage 4C.2 read-only RPC proof — NOT a wallet balance.
 *
 * Public/demo address only: the Ethereum "zero address"
 * (0x0000000000000000000000000000000000000000). Chosen specifically
 * because it is a canonical, protocol-level address with no individual or
 * organizational owner — it proves the direct-device JSON-RPC read path
 * end-to-end without attributing real funds to any real person. The
 * application does not possess, store, derive, or use any private key for
 * this public proof address.
 *
 * Rendered only in development builds (`__DEV__`) — this is temporary
 * diagnostic scaffolding for the read-only balance proof, not a shipped
 * product surface, and is expected to be removed once a real wallet
 * balance replaces the demo portfolio quantities in a later stage.
 */
const DEV_PROOF_ADDRESS = toEthereumAddress('0x0000000000000000000000000000000000000000');

function formatWeiAsEth(wei: string): string {
  const value = BigInt(wei);
  const divisor = 10n ** 18n;
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionStr = fraction.toString().padStart(18, '0').slice(0, 6);
  return `${whole.toString()}.${fractionStr}`;
}

export function EthereumBalanceProof() {
  const { snapshot, isLoading, error, refresh } = useEthereumBalanceProof(DEV_PROOF_ADDRESS);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEV PROOF — Stage 4C.2</Text>
      <Text style={styles.subtitle}>Ethereum mainnet · read-only RPC · not your wallet</Text>

      <Text style={styles.row}>
        Address: <Text style={styles.mono}>{DEV_PROOF_ADDRESS}</Text>
      </Text>

      {isLoading && !snapshot ? <Text style={styles.status}>Fetching live balance…</Text> : null}
      {error ? <Text style={styles.statusError}>Balance unavailable: {error.message}</Text> : null}
      {snapshot ? (
        <>
          <Text style={styles.row}>
            Wei: <Text style={styles.mono}>{snapshot.amount}</Text>
          </Text>
          <Text style={styles.row}>
            ETH: <Text style={styles.mono}>{formatWeiAsEth(snapshot.amount)}</Text>
          </Text>
          <Text style={styles.status}>as of {new Date(snapshot.asOf).toLocaleTimeString()}</Text>
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
    marginTop: Spacing.five,
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
