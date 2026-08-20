import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { signEthereumTransactionV1 } from '@/services/wallet-core-bridge';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

/**
 * Stage 5G.1A — DEV-ONLY physical-iPhone proof of the real end-to-end
 * Ethereum V1 transaction-signing pipeline:
 *
 *   RN -> signEthereumTransactionV1(...) -> fresh WalletBiometricAuthorizer
 *   Face ID -> WalletSecureStorage.read() -> Rust Ethereum V1 signing ->
 *   { signedTxHex, txHashHex } back to RN.
 *
 * This is NOT the Send feature and NEVER becomes one. It exists solely to
 * prove, on real hardware, the one thing no XCTest/unit test can prove: a
 * real Face ID prompt, a real Secure-Enclave-gated `WalletSecureStorage`
 * read, and a real cross-FFI call into Rust actually compose correctly —
 * see Stage 5G.1's own pre-implementation audit for why this is the only
 * practical way to verify that sequence before any Send/Review UI exists.
 *
 * Rendered only in development builds (`__DEV__`, same gating convention
 * as `WalletCoreProof`/`BitcoinAddressProof`/`EthereumBalanceProof` on this
 * same screen) — temporary diagnostic scaffolding, not a shipped product
 * surface.
 *
 * Hard constraints this file must never violate:
 *   - the intent below is a FIXED constant — no recipient, amount, gas
 *     parameter, or calldata is ever user-editable or computed here;
 *   - no fee estimation, no RPC/provider/network call, no broadcast — this
 *     file calls nothing except the native signing bridge function, and
 *     that function itself has no networking capability at all (Wallet
 *     Core has zero network dependencies; the FFI signing call returns
 *     only hex strings, it does not transmit anything anywhere);
 *   - no private key, seed, entropy, or mnemonic ever appears in this
 *     file, in `state`, or in a log statement — only the returned
 *     transaction hash is ever held (briefly, in memory, for display), and
 *     only in its abbreviated, non-secret form; the full `signedTxHex`
 *     value is not even read out of the result;
 *   - no `console.log`/logging of any kind exists in this file.
 */

// Fixed, inert test transaction — chainId 1 (a real chain id, so the
// signature itself is well-formed) with zero value and empty calldata, so
// even the signed bytes themselves transfer nothing and call nothing.
// Destination is the well-known Ethereum "burn" address
// (0x000000000000000000000000000000000000dEaD, an established convention
// across Ethereum tooling for an inert demo destination) — a fixed PUBLIC
// address, never this wallet's own receive address, so this proof never
// needs to read or reconstruct any address belonging to the user's wallet.
const DEV_PROOF_INTENT = {
  chainId: 1,
  nonce: 0,
  toHex: '0x000000000000000000000000000000000000dEaD',
  valueWeiDecimal: '0',
  gasLimit: 21000,
  maxFeePerGasWeiDecimal: '30000000000',
  maxPriorityFeePerGasWeiDecimal: '1000000000',
  dataHex: '0x',
} as const;

type ProofState =
  | { status: 'idle' }
  | { status: 'signing' }
  | { status: 'success'; abbreviatedTxHash: string }
  | { status: 'error' };

function abbreviateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function EthereumSigningProof() {
  const [state, setState] = useState<ProofState>({ status: 'idle' });

  const runProof = async () => {
    setState({ status: 'signing' });
    try {
      // Only `txHashHex` is ever read from the result — `signedTxHex` (the
      // actual signed transaction bytes) is deliberately never touched,
      // stored, or displayed by this proof; it never needs to be.
      const { txHashHex } = await signEthereumTransactionV1(DEV_PROOF_INTENT);
      setState({ status: 'success', abbreviatedTxHash: abbreviateHash(txHashHex) });
    } catch {
      // Generic failure only — covers Face ID cancellation, Face ID
      // failure, and any signing failure alike. No error detail is ever
      // read, stored, or displayed here.
      setState({ status: 'error' });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DEV PROOF — Stage 5G.1A</Text>
      <Text style={styles.subtitle}>Ethereum V1 signing · fixed inert test tx · never broadcast</Text>

      <Pressable onPress={runProof} disabled={state.status === 'signing'} style={styles.button}>
        <Text style={styles.buttonLabel}>{state.status === 'signing' ? 'Signing…' : 'Test Ethereum Signing'}</Text>
      </Pressable>

      {state.status === 'success' ? (
        <Text style={styles.row}>
          txHash: <Text style={styles.mono}>{state.abbreviatedTxHash}</Text>
        </Text>
      ) : null}
      {state.status === 'error' ? <Text style={styles.statusError}>Signing failed.</Text> : null}
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
  statusError: {
    color: palette.negative,
    fontSize: 12,
    marginTop: Spacing.one,
  },
  button: {
    marginTop: Spacing.two,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 8,
    backgroundColor: palette.backgroundSelected,
  },
  buttonLabel: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
