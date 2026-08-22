import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  SUPPORTED_ASSETS,
  formatAtomicAmountDecimal,
  formatWeiAsEthDecimalString,
  type SwapQuote,
} from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import {
  prepareEthMainnetSwap,
  type EthereumPreparedSwap,
} from '@/services/ethereum-swap-preparation';
import { refreshReviewedSwapQuote } from '@/services/swap-execution-quote';
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';
import { consumePendingSwapQuote } from '@/services/swap-session';

const palette = Colors.dark;

const USDC_DECIMALS =
  SUPPORTED_ASSETS.find((asset) => asset.symbol === 'USDC')?.decimals ?? 6;

type PreparationState =
  | { status: 'ready' }
  | { status: 'preparing' }
  | { status: 'prepared'; prepared: EthereumPreparedSwap }
  | { status: 'error' };

export default function SwapReviewScreen() {
  const router = useRouter();

  const [quote] = useState<SwapQuote | null>(() =>
    consumePendingSwapQuote(),
  );

  const [preparationState, setPreparationState] =
    useState<PreparationState>({ status: 'ready' });

  const isPreparingRef = useRef(false);

  if (!quote) {
    return (
      <ScreenScaffold header={<ScreenHeader title="Review swap" back />}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Swap quote unavailable</Text>
          <Text style={styles.emptyText}>
            Return to Swap and request a fresh quote.
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to swap"
            onPress={() => router.replace('/swap')}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to Swap</Text>
          </Pressable>
        </View>
      </ScreenScaffold>
    );
  }

  const payAmount = formatWeiAsEthDecimalString(quote.sellAmount);
  const receiveAmount = formatAtomicAmountDecimal(
    quote.expectedBuyAmount,
    USDC_DECIMALS,
  );
  const minimumReceiveAmount = formatAtomicAmountDecimal(
    quote.minimumBuyAmount,
    USDC_DECIMALS,
  );

  const handlePrepareSwap = async () => {
    if (
      isPreparingRef.current ||
      preparationState.status === 'preparing' ||
      preparationState.status === 'prepared'
    ) {
      return;
    }

    isPreparingRef.current = true;
    setPreparationState({ status: 'preparing' });

    try {
      const apiBaseUrl =
        process.env.EXPO_PUBLIC_SWISSWALLET_API_BASE_URL;

      if (!apiBaseUrl) {
        throw new Error('SwissWallet API base URL is unavailable.');
      }

      const owner = getEthereumAddressV1();

      const freshQuote = await refreshReviewedSwapQuote(
        quote,
        owner,
        apiBaseUrl,
      );

      const prepared = await prepareEthMainnetSwap(
        owner,
        freshQuote,
      );

      isPreparingRef.current = false;
      setPreparationState({ status: 'prepared', prepared });
    } catch {
      isPreparingRef.current = false;
      setPreparationState({ status: 'error' });
    }
  };

  const isPreparing = preparationState.status === 'preparing';
  const isPrepared = preparationState.status === 'prepared';

  return (
    <ScreenScaffold header={<ScreenHeader title="Review swap" back />}>
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

          <Text style={styles.amount}>{payAmount}</Text>
        </View>

        <Text style={[styles.sectionLabel, styles.receiveLabel]}>
          YOU RECEIVE
        </Text>

        <View style={styles.assetCard}>
          <View style={styles.assetIdentity}>
            <CoinBadge symbol="USDC" size={38} />
            <View>
              <Text style={styles.assetSymbol}>USDC</Text>
              <Text style={styles.assetName}>USD Coin</Text>
            </View>
          </View>

          <Text style={styles.amount}>{receiveAmount}</Text>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Minimum receive</Text>
            <Text style={styles.detailValue}>
              {minimumReceiveAmount} USDC
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network</Text>
            <Text style={styles.detailValue}>Ethereum Mainnet</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Swap type</Text>
            <Text style={styles.detailValue}>Exact input</Text>
          </View>

          {preparationState.status === 'prepared' ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Maximum network fee</Text>
                <Text style={styles.detailValue}>
                  {formatWeiAsEthDecimalString(
                    preparationState.prepared.maxFeeWei,
                  )} ETH
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Maximum ETH debit</Text>
                <Text style={styles.detailValue}>
                  {formatWeiAsEthDecimalString(
                    preparationState.prepared.totalMaxEthDebitWei,
                  )} ETH
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <Text style={styles.notice}>
          Review the amounts carefully. Execution will require fresh device
          authentication before signing.
        </Text>

        {preparationState.status === 'error' ? (
          <Text
            style={styles.preparationError}
            accessible
            accessibilityRole="alert">
            Couldn’t prepare the swap transaction. Please try again.
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Prepare swap"
          accessibilityState={{
            disabled: isPreparing || isPrepared,
            busy: isPreparing,
          }}
          disabled={isPreparing || isPrepared}
          onPress={handlePrepareSwap}
          style={[
            styles.confirmButton,
            (isPreparing || isPrepared) && styles.confirmButtonDisabled,
          ]}>
          {isPreparing ? (
            <ActivityIndicator
              size="small"
              color={palette.background}
            />
          ) : null}

          <Text style={styles.confirmButtonText}>
            {isPreparing
              ? 'Preparing…'
              : isPrepared
                ? 'Ready to sign'
                : 'Prepare swap'}
          </Text>
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

  receiveLabel: {
    marginTop: Spacing.four,
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
    maxWidth: '55%',
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'right',
  },

  detailsCard: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: palette.backgroundElement,
    gap: Spacing.three,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },

  detailLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },

  detailValue: {
    flexShrink: 1,
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },

  notice: {
    marginTop: Spacing.three,
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },

  preparationError: {
    marginTop: Spacing.three,
    color: palette.negative,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  confirmButton: {
    marginTop: Spacing.four,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: palette.accentGold,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmButtonDisabled: {
    opacity: 0.4,
  },

  confirmButtonText: {
    color: palette.background,
    fontSize: 15,
    fontWeight: '700',
  },

  emptyState: {
    paddingTop: Spacing.four,
    alignItems: 'center',
  },

  emptyTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },

  emptyText: {
    marginTop: Spacing.two,
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  secondaryButton: {
    marginTop: Spacing.four,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: 16,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryButtonText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
