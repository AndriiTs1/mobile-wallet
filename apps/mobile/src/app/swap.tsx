import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseEthDecimalStringToWei, type AtomicAmount } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { normalizeEthAmountDecimalSeparator } from '@/utils/amount-input';

const palette = Colors.dark;

type SwapAmountState =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ready'; sellAmount: AtomicAmount };

function parseSwapEthAmount(input: string): SwapAmountState {
  if (input.length === 0) {
    return { status: 'empty' };
  }

  try {
    return {
      status: 'ready',
      sellAmount: parseEthDecimalStringToWei(
        normalizeEthAmountDecimalSeparator(input),
      ),
    };
  } catch {
    return { status: 'invalid' };
  }
}

export default function SwapScreen() {
  const [amount, setAmount] = useState('');

  const amountState = useMemo(
    () => parseSwapEthAmount(amount),
    [amount],
  );

  return (
    <ScreenScaffold header={<ScreenHeader title="Swap" back />}>
      <View style={styles.content}>
        <Text style={styles.sectionLabel}>YOU PAY</Text>

        <View style={styles.assetCard}>
          <View style={styles.assetIdentity}>
            <CoinBadge symbol="ETH" size={38} />
            <View>
              <Text style={styles.assetSymbol}>ETH</Text>
              <Text style={styles.assetName}>Ethereum</Text>
            </View>
          </View>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={palette.textSecondary}
            keyboardType="decimal-pad"
            autoCorrect={false}
            style={styles.amountInput}
            accessibilityLabel="ETH amount to swap"
          />
        </View>

        {amountState.status === 'invalid' ? (
          <Text
            style={styles.amountError}
            accessible
            accessibilityRole="alert">
            Enter a valid ETH amount.
          </Text>
        ) : null}

        <View style={styles.switchWrap}>
          <View style={styles.switchButton}>
            <SymbolView
              name={{ ios: 'arrow.up.arrow.down' }}
              size={18}
              tintColor={palette.text}
              fallback={<Text style={styles.switchFallback}>⇅</Text>}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>YOU RECEIVE</Text>

        <View style={styles.assetCard}>
          <View style={styles.assetIdentity}>
            <CoinBadge symbol="USDC" size={38} />
            <View>
              <Text style={styles.assetSymbol}>USDC</Text>
              <Text style={styles.assetName}>USD Coin</Text>
            </View>
          </View>

          <Text style={styles.amount}>0</Text>
        </View>

        <View style={styles.networkRow}>
          <Text style={styles.networkLabel}>Network</Text>
          <Text style={styles.networkValue}>Ethereum Mainnet</Text>
        </View>

        <View style={styles.quotePlaceholder}>
          <Text style={styles.quoteTitle}>
            {amountState.status === 'ready'
              ? 'Ready for price preview'
              : amountState.status === 'invalid'
                ? 'Check the amount'
                : 'Enter an amount'}
          </Text>
          <Text style={styles.quoteText}>
            {amountState.status === 'ready'
              ? 'A live swap price will appear here once the secure quote transport is connected.'
              : amountState.status === 'invalid'
                ? 'Use a positive ETH amount with up to 18 decimal places.'
                : 'Your swap quote and estimated network cost will appear here.'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review swap"
          disabled
          style={styles.reviewButton}>
          <Text style={styles.reviewButtonText}>Review swap</Text>
        </Pressable>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
  },

  sectionLabel: {
    marginBottom: 8,
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  assetCard: {
    minHeight: 88,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    backgroundColor: palette.backgroundElement,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  assetIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  assetSymbol: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '700',
  },

  assetName: {
    marginTop: 3,
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },

  amount: {
    color: palette.text,
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'right',
  },

  amountInput: {
    minWidth: 120,
    maxWidth: '55%',
    paddingVertical: 8,
    paddingHorizontal: 0,
    color: palette.text,
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'right',
  },

  amountError: {
    marginTop: 8,
    color: palette.negative,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
  },

  switchWrap: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },

  switchButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },

  switchFallback: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
  },

  networkRow: {
    marginTop: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  networkLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },

  networkValue: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },

  quotePlaceholder: {
    marginTop: Spacing.three,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
  },

  quoteTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  quoteText: {
    marginTop: 5,
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },

  reviewButton: {
    marginTop: Spacing.four,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: palette.accentGold,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },

  reviewButtonText: {
    color: palette.background,
    fontSize: 15,
    fontWeight: '700',
  },
});
