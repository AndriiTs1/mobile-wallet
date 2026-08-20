import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatWeiAsEthDecimalString, type EthereumAddress } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { useEthereumBalanceProof } from '@/hooks/use-ethereum-balance-proof';
import {
  EthereumSendPreparationError,
  prepareEthereumV1Send,
  type EthereumSendPreparationErrorReason,
} from '@/services/ethereum-send-preparation';
import { setPendingEthereumSend } from '@/services/ethereum-send-session';
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';

const palette = Colors.dark;

/**
 * Stage 5G.2.3 — user-facing copy for each `EthereumSendPreparationError`
 * reason. Never the underlying/raw error message — that stays entirely
 * inside `ethereum-send-preparation.ts` and is never read here.
 */
const ERROR_MESSAGES: Record<EthereumSendPreparationErrorReason, string> = {
  invalid_recipient: 'Enter a valid Ethereum address.',
  invalid_amount: 'Enter a valid ETH amount.',
  insufficient_funds: 'Your balance can’t cover this amount plus the network fee.',
  network_error: 'Couldn’t reach the Ethereum network. Please try again.',
};
const GENERIC_ERROR_MESSAGE = 'Something went wrong preparing this transaction. Please try again.';

type FormState = { status: 'idle' } | { status: 'preparing' } | { status: 'error'; message: string };

export default function SendScreen() {
  const router = useRouter();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [formState, setFormState] = useState<FormState>({ status: 'idle' });
  // Single-flight guard against a duplicate concurrent prepare — e.g. a
  // fast double-tap before the first call's promise has settled. Mirrors
  // the same ref-based pattern already established by `_layout.tsx`'s
  // `unlockInFlightRef`/`backupResumeInFlightRef`.
  const isPreparingRef = useRef(false);

  // Read once, defensively — the wallet's own address is required to show
  // an informational balance, but its absence must never block the form
  // itself (`prepareEthereumV1Send` performs its own fresh read regardless).
  const [walletAddress] = useState<EthereumAddress | null>(() => {
    try {
      return getEthereumAddressV1();
    } catch {
      return null;
    }
  });

  const handleRecipientChange = useCallback((next: string) => {
    setRecipient(next);
    setFormState((current) => (current.status === 'error' ? { status: 'idle' } : current));
  }, []);

  const handleAmountChange = useCallback((next: string) => {
    setAmount(next);
    setFormState((current) => (current.status === 'error' ? { status: 'idle' } : current));
  }, []);

  const handleContinue = useCallback(async () => {
    if (isPreparingRef.current) {
      return;
    }
    isPreparingRef.current = true;
    setFormState({ status: 'preparing' });

    try {
      // Raw strings, exactly as entered — recipient/amount parsing and
      // validation is Stage 5G.2.2's job alone; this screen performs none
      // of its own.
      const prepared = await prepareEthereumV1Send(recipient, amount);
      isPreparingRef.current = false;
      setFormState({ status: 'idle' });
      setPendingEthereumSend(prepared);
      router.push('/send-review');
    } catch (error) {
      isPreparingRef.current = false;
      const message =
        error instanceof EthereumSendPreparationError
          ? ERROR_MESSAGES[error.reason]
          : GENERIC_ERROR_MESSAGE;
      setFormState({ status: 'error', message });
    }
  }, [recipient, amount, router]);

  const isPreparing = formState.status === 'preparing';
  const canContinue = recipient.length > 0 && amount.length > 0 && !isPreparing;

  return (
    <ScreenScaffold header={<ScreenHeader title="Send" back />}>
      <View style={styles.assetRow}>
        <CoinBadge symbol="ETH" size={28} />
        <View>
          <Text style={styles.assetName}>Ethereum</Text>
          <Text style={styles.assetSymbol}>ETH</Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Recipient</Text>
        <TextInput
          value={recipient}
          onChangeText={handleRecipientChange}
          placeholder="0x…"
          placeholderTextColor={palette.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType="ascii-capable"
          editable={!isPreparing}
          style={styles.inputMono}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountInputRow}>
          <TextInput
            value={amount}
            onChangeText={handleAmountChange}
            placeholder="0.0"
            placeholderTextColor={palette.textSecondary}
            keyboardType="decimal-pad"
            editable={!isPreparing}
            style={styles.amountInput}
          />
          <Text style={styles.amountSuffix}>ETH</Text>
        </View>
        {walletAddress ? <AvailableBalance address={walletAddress} /> : null}
      </View>

      {formState.status === 'error' ? (
        <View style={styles.errorPanel} accessible accessibilityRole="alert">
          <Text style={styles.errorText}>{formState.message}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Review"
        accessibilityState={{ disabled: !canContinue, busy: isPreparing }}
        disabled={!canContinue}
        onPress={handleContinue}
        style={({ pressed }) => [
          styles.continueButton,
          (!canContinue || pressed) && styles.continueButtonDisabled,
        ]}>
        <View style={styles.continueButtonContent}>
          {isPreparing ? <ActivityIndicator size="small" color={palette.background} /> : null}
          <Text style={styles.continueButtonLabel}>{isPreparing ? 'Preparing…' : 'Review'}</Text>
        </View>
      </Pressable>
    </ScreenScaffold>
  );
}

/**
 * Informational only — reuses the existing `useEthereumBalanceProof` hook
 * exactly as-is (Stage 4C.2), unmodified. The authoritative affordability
 * decision remains entirely inside `prepareEthereumV1Send`; this display
 * never gates or disables the Continue action.
 */
function AvailableBalance({ address }: { address: EthereumAddress }) {
  const { snapshot, isLoading } = useEthereumBalanceProof(address);

  let label: string;
  if (snapshot) {
    label = `Available: ${formatWeiAsEthDecimalString(snapshot.amount)} ETH`;
  } else if (isLoading) {
    label = 'Available: fetching balance…';
  } else {
    label = 'Available balance unavailable';
  }

  return <Text style={styles.balanceHint}>{label}</Text>;
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
  field: {
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  label: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  inputMono: {
    color: palette.text,
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 14,
    fontFamily: 'ui-monospace',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: Spacing.three,
  },
  amountInput: {
    flex: 1,
    color: palette.text,
    paddingVertical: Spacing.two + 2,
    fontSize: 20,
    fontWeight: '600',
  },
  amountSuffix: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  balanceHint: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  errorPanel: {
    marginTop: Spacing.three,
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
  continueButton: {
    backgroundColor: palette.accentGold,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.five,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  continueButtonLabel: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
