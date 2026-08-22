import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatWeiAsEthDecimalString,
  type EthereumAddress,
} from 'chain-domain';

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
import {
  EthereumErc20SendPreparationError,
  prepareEthereumErc20Send,
  type EthereumErc20SendPreparationErrorReason,
  type EthereumErc20SendSymbol,
} from '@/services/ethereum-erc20-send-preparation';
import { setPendingEthereumSend } from '@/services/ethereum-send-session';
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';
import { normalizeEthAmountDecimalSeparator } from '@/utils/amount-input';
import { fetchBitcoinMainnetAddressProof } from '@/services/bitcoin-rpc';
import { fetchBitcoinMainnetFeeRate } from '@/services/bitcoin-fees';
import { prepareBitcoinSend } from '@/services/bitcoin-send-preparation';
import { setPendingBitcoinSend } from '@/services/bitcoin-send-session';
import { getBitcoinAddressV1 } from '@/services/wallet-core-bridge';

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
const ERC20_ERROR_MESSAGES: Record<
  EthereumErc20SendPreparationErrorReason,
  string
> = {
  unsupported_asset: 'This asset is not supported.',
  invalid_recipient: 'Enter a valid Ethereum address.',
  invalid_amount: 'Enter a valid token amount.',
  insufficient_token_balance: 'Your token balance is too low.',
  insufficient_eth_for_fee: 'You need more ETH to cover the network fee.',
  network_error: 'Couldn’t reach the Ethereum network. Please try again.',
};

const GENERIC_ERROR_MESSAGE =
  'Something went wrong preparing this transaction. Please try again.';

type SendAssetSymbol =
  | 'BTC'
  | 'ETH'
  | EthereumErc20SendSymbol;

const SEND_ASSETS: readonly {
  symbol: SendAssetSymbol;
  name: string;
}[] = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'XAUT', name: 'Tether Gold' },
];

type FormState = { status: 'idle' } | { status: 'preparing' } | { status: 'error'; message: string };

function parseBitcoinAmountToSats(value: string): bigint {
  const normalized = value.replace(',', '.').trim();

  if (!/^\d+(?:\.\d{0,8})?$/.test(normalized)) {
    throw new Error('Enter a valid BTC amount.');
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const fraction = fractionPart.padEnd(8, '0');

  const sats =
    BigInt(wholePart) * 100_000_000n +
    BigInt(fraction || '0');

  if (sats <= 0n) {
    throw new Error('Enter a valid BTC amount.');
  }

  return sats;
}

export default function SendScreen() {
  const router = useRouter();

  const [selectedSymbol, setSelectedSymbol] =
    useState<SendAssetSymbol>('ETH');
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

  const [bitcoinAddress] = useState<string | null>(() => {
    try {
      return getBitcoinAddressV1();
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
      // Recipient is passed exactly as entered — Stage 5G.2.2's parser
      // validates it; this screen performs none of its own recipient
      // validation. Amount is normalized ONLY at this call boundary (a
      // single "," -> "." swap — see normalizeEthAmountDecimalSeparator's
      // own doc comment for exactly what it does and does not touch); the
      // `amount` state itself, and therefore what the TextInput displays,
      // is never modified. The strict domain parser still receives, and
      // still alone decides, everything else about validity.
      const normalizedAmount =
        normalizeEthAmountDecimalSeparator(amount);

      if (selectedSymbol === 'BTC') {
        if (!bitcoinAddress) {
          throw new Error('Bitcoin wallet address is unavailable.');
        }

        const amountSats = parseBitcoinAmountToSats(amount);

        const [proof, feeRate] = await Promise.all([
          fetchBitcoinMainnetAddressProof(bitcoinAddress),
          fetchBitcoinMainnetFeeRate(),
        ]);

        const prepared = prepareBitcoinSend({
          utxos: proof.utxos,
          amountSats,
          feeRateSatPerVbyte: feeRate.satPerVbyte,
        });

        setPendingBitcoinSend({
          kind: 'bitcoin',
          recipient,
          amountSat: prepared.amountSats.toString(),
          feeSat: prepared.feeSats.toString(),
          totalDebitSat: (
            prepared.amountSats + prepared.feeSats
          ).toString(),
          intent: {
            inputs: prepared.inputs.map((input) => ({
              txid: input.txid,
              vout: input.vout,
              valueSat: input.valueSats.toString(),
            })),
            destinationAddress: recipient,
            amountSat: prepared.amountSats.toString(),

            // V1 currently observes the fixed receive address as its
            // address-level Bitcoin balance, so change deliberately returns
            // to that same controlled address. No private material is involved.
            changeAddress:
              prepared.changeSats > 0n
                ? bitcoinAddress
                : null,

            changeSat: prepared.changeSats.toString(),
          },
        });
      } else if (selectedSymbol === 'ETH') {
        const prepared = await prepareEthereumV1Send(
          recipient,
          normalizedAmount,
        );

        setPendingEthereumSend({
          kind: 'native',
          prepared,
        });
      } else {
        const prepared = await prepareEthereumErc20Send(
          selectedSymbol,
          recipient,
          normalizedAmount,
        );

        setPendingEthereumSend({
          kind: 'erc20',
          prepared,
        });
      }

      isPreparingRef.current = false;
      setFormState({ status: 'idle' });
      router.push('/send-review');
    } catch (error) {
      isPreparingRef.current = false;
      const message =
        selectedSymbol === 'BTC' && error instanceof Error
          ? error.message
          : error instanceof EthereumSendPreparationError
            ? ERROR_MESSAGES[error.reason]
            : error instanceof EthereumErc20SendPreparationError
              ? ERC20_ERROR_MESSAGES[error.reason]
              : GENERIC_ERROR_MESSAGE;
      setFormState({ status: 'error', message });
    }
  }, [selectedSymbol, recipient, amount, router]);

  const isPreparing = formState.status === 'preparing';
  const canContinue = recipient.length > 0 && amount.length > 0 && !isPreparing;

  return (
    <ScreenScaffold header={<ScreenHeader title="Send" back />}>
      <View style={styles.assetSelector}>
        {SEND_ASSETS.map((asset) => {
          const selected =
            asset.symbol === selectedSymbol;

          return (
            <Pressable
              key={asset.symbol}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Send ${asset.name}`}
              onPress={() => {
                setSelectedSymbol(asset.symbol);
                setAmount('');
                setFormState({ status: 'idle' });
              }}
              style={[
                styles.assetSelectorItem,
                selected &&
                  styles.assetSelectorItemSelected,
              ]}>
              <CoinBadge
                symbol={asset.symbol}
                size={27}
              />
              <Text
                style={[
                  styles.assetSelectorLabel,
                  selected &&
                    styles.assetSelectorLabelSelected,
                ]}>
                {asset.symbol === 'XAUT'
                  ? 'XAU₮'
                  : asset.symbol}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.assetRow}>
        <CoinBadge
          symbol={selectedSymbol}
          size={28}
        />
        <View>
          <Text style={styles.assetName}>
            {
              SEND_ASSETS.find(
                (asset) =>
                  asset.symbol === selectedSymbol,
              )?.name
            }
          </Text>
          <Text style={styles.assetSymbol}>
            {selectedSymbol === 'XAUT'
              ? 'XAU₮'
              : selectedSymbol}
          </Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Recipient</Text>
        <TextInput
          value={recipient}
          onChangeText={handleRecipientChange}
          placeholder={
            selectedSymbol === 'BTC'
              ? 'bc1…'
              : '0x…'
          }
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
          <Text style={styles.amountSuffix}>
            {selectedSymbol === 'XAUT'
              ? 'XAU₮'
              : selectedSymbol}
          </Text>
        </View>
        {selectedSymbol === 'BTC'
          ? bitcoinAddress
            ? <BitcoinAvailableBalance address={bitcoinAddress} />
            : null
          : walletAddress
            ? <AvailableBalance address={walletAddress} />
            : null}
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
function BitcoinAvailableBalance({
  address,
}: {
  address: string;
}) {
  const [label, setLabel] = useState(
    'Available: fetching balance…',
  );

  useEffect(() => {
    let active = true;

    void fetchBitcoinMainnetAddressProof(address)
      .then((proof) => {
        if (!active) return;

        const sats = proof.utxos.reduce(
          (sum, utxo) => sum + BigInt(utxo.value),
          0n,
        );

        const whole = sats / 100_000_000n;
        const fraction = (sats % 100_000_000n)
          .toString()
          .padStart(8, '0')
          .replace(/0+$/, '');

        const value = fraction
          ? `${whole}.${fraction}`
          : whole.toString();

        setLabel(`Available: ${value} BTC`);
      })
      .catch(() => {
        if (active) {
          setLabel('Available balance unavailable');
        }
      });

    return () => {
      active = false;
    };
  }, [address]);

  return (
    <Text style={styles.balanceHint}>
      {label}
    </Text>
  );
}

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
  assetSelector: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.four,
  },
  assetSelectorItem: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  assetSelectorItemSelected: {
    borderColor: palette.accentGold,
  },
  assetSelectorLabel: {
    color: palette.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
  },
  assetSelectorLabelSelected: {
    color: palette.accentGold,
  },

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
