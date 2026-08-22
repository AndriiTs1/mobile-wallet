import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  SUPPORTED_ASSETS,
  formatAtomicAmountDecimal,
  formatWeiAsEthDecimalString,
  type EthereumTxHash,
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
import {
  confirmEthereumTransactionV1,
  EthereumSendConfirmationError,
  type EthereumSendConfirmationErrorReason,
} from '@/services/ethereum-send-confirmation';
import {
  checkEthereumSendStatus,
  type EthereumSendStatus,
} from '@/services/ethereum-send-status';
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

type ExecutionState =
  | { status: 'ready' }
  | { status: 'signing' }
  | { status: 'broadcasting' }
  | { status: 'resolving'; txHash: EthereumTxHash }
  | { status: 'pending'; txHash: EthereumTxHash }
  | { status: 'confirmed'; txHash: EthereumTxHash }
  | { status: 'failed'; txHash: EthereumTxHash | null }
  | { status: 'uncertain'; txHash: EthereumTxHash }
  | { status: 'error'; reason: EthereumSendConfirmationErrorReason };

export default function SwapReviewScreen() {
  const router = useRouter();

  const [quote] = useState<SwapQuote | null>(() =>
    consumePendingSwapQuote(),
  );

  const [preparationState, setPreparationState] =
    useState<PreparationState>({ status: 'ready' });

  const [executionState, setExecutionState] =
    useState<ExecutionState>({ status: 'ready' });

  const isPreparingRef = useRef(false);
  const isConfirmingRef = useRef(false);
  const hasBroadcastAttemptedRef = useRef(false);
  const isCheckingStatusRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resolveStatus = useCallback(
    async (txHash: EthereumTxHash) => {
      setExecutionState({ status: 'resolving', txHash });

      let status: EthereumSendStatus;

      try {
        status = await checkEthereumSendStatus(txHash);
      } catch {
        if (isMountedRef.current) {
          setExecutionState({ status: 'uncertain', txHash });
        }
        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      setExecutionState({ status, txHash });
    },
    [],
  );

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

  const handleConfirmSwap = async () => {
    if (
      isConfirmingRef.current ||
      hasBroadcastAttemptedRef.current ||
      preparationState.status !== 'prepared'
    ) {
      return;
    }

    isConfirmingRef.current = true;

    try {
      const txHash = await confirmEthereumTransactionV1(
        preparationState.prepared.intent,
        {
          onPhaseChange: (phase) => {
            if (phase === 'broadcasting') {
              // From this point onward this prepared intent must never be
              // signed or broadcast again, regardless of the outcome.
              hasBroadcastAttemptedRef.current = true;
            }

            if (isMountedRef.current) {
              setExecutionState({ status: phase });
            }
          },
        },
      );

      if (!isMountedRef.current) {
        return;
      }

      // A definitively accepted broadcast is immediately represented as
      // pending. Mining/status lookup stays read-only and user-triggered.
      setExecutionState({ status: 'pending', txHash });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      if (error instanceof EthereumSendConfirmationError) {
        if (error.reason === 'broadcast_rejected') {
          setExecutionState({
            status: 'failed',
            txHash: null,
          });
          return;
        }

        if (
          (
            error.reason === 'broadcast_ambiguous' ||
            error.reason === 'hash_mismatch'
          ) &&
          error.signerTxHash !== null
        ) {
          await resolveStatus(error.signerTxHash);
          return;
        }

        setExecutionState({
          status: 'error',
          reason: error.reason,
        });
        return;
      }

      setExecutionState({
        status: 'error',
        reason: 'auth_or_signing_failed',
      });
    } finally {
      isConfirmingRef.current = false;
    }
  };

  const handleCheckStatus = useCallback(async () => {
    if (isCheckingStatusRef.current) {
      return;
    }

    if (
      executionState.status !== 'pending' &&
      executionState.status !== 'uncertain'
    ) {
      return;
    }

    isCheckingStatusRef.current = true;

    try {
      await resolveStatus(executionState.txHash);
    } finally {
      isCheckingStatusRef.current = false;
    }
  }, [executionState, resolveStatus]);

  const isPreparing = preparationState.status === 'preparing';
  const isPrepared = preparationState.status === 'prepared';

  if (
    executionState.status === 'resolving' ||
    executionState.status === 'pending' ||
    executionState.status === 'confirmed' ||
    executionState.status === 'failed' ||
    executionState.status === 'uncertain'
  ) {
    return (
      <ScreenScaffold header={<ScreenHeader title="Swap status" />}>
        <View style={styles.statusPanel}>
          <Text style={styles.statusTitle}>
            {executionState.status === 'resolving'
              ? 'Checking status…'
              : executionState.status === 'pending'
                ? 'Swap sent'
                : executionState.status === 'confirmed'
                  ? 'Swap confirmed'
                  : executionState.status === 'failed'
                    ? 'Swap failed'
                    : 'Swap status uncertain'}
          </Text>

          <Text style={styles.statusText}>
            {executionState.status === 'resolving'
              ? 'Reading the Ethereum network. Nothing is being signed or sent again.'
              : executionState.status === 'pending'
                ? 'Your swap transaction was broadcast and is waiting to be mined.'
                : executionState.status === 'confirmed'
                  ? 'Your swap transaction was mined successfully.'
                  : executionState.status === 'failed'
                    ? 'The swap transaction was not completed successfully.'
                    : 'The network result is not yet clear. Do not submit the swap again.'}
          </Text>

          {'txHash' in executionState && executionState.txHash ? (
            <Text style={styles.txHashText}>
              {executionState.txHash.slice(0, 12)}…
              {executionState.txHash.slice(-8)}
            </Text>
          ) : null}

          {executionState.status === 'pending' ||
          executionState.status === 'uncertain' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Check swap status"
              onPress={handleCheckStatus}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                Check status
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={() => router.dismissAll()}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </ScreenScaffold>
    );
  }

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

        {isPrepared ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirm swap"
            accessibilityState={{
              disabled:
                executionState.status === 'signing' ||
                executionState.status === 'broadcasting' ||
                hasBroadcastAttemptedRef.current,
              busy:
                executionState.status === 'signing' ||
                executionState.status === 'broadcasting',
            }}
            disabled={
              executionState.status === 'signing' ||
              executionState.status === 'broadcasting' ||
              hasBroadcastAttemptedRef.current
            }
            onPress={handleConfirmSwap}
            style={[
              styles.confirmButton,
              (
                executionState.status === 'signing' ||
                executionState.status === 'broadcasting' ||
                hasBroadcastAttemptedRef.current
              ) && styles.confirmButtonDisabled,
            ]}>
            {(
              executionState.status === 'signing' ||
              executionState.status === 'broadcasting'
            ) ? (
              <ActivityIndicator
                size="small"
                color={palette.background}
              />
            ) : null}

            <Text style={styles.confirmButtonText}>
              {executionState.status === 'signing'
                ? 'Authenticating…'
                : executionState.status === 'broadcasting'
                  ? 'Sending…'
                  : 'Confirm swap'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Prepare swap"
            accessibilityState={{
              disabled: isPreparing,
              busy: isPreparing,
            }}
            disabled={isPreparing}
            onPress={handlePrepareSwap}
            style={[
              styles.confirmButton,
              isPreparing && styles.confirmButtonDisabled,
            ]}>
            {isPreparing ? (
              <ActivityIndicator
                size="small"
                color={palette.background}
              />
            ) : null}

            <Text style={styles.confirmButtonText}>
              {isPreparing ? 'Preparing…' : 'Prepare swap'}
            </Text>
          </Pressable>
        )}
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

  statusPanel: {
    paddingTop: Spacing.four,
    alignItems: 'center',
  },

  statusTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },

  statusText: {
    marginTop: Spacing.two,
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },

  txHashText: {
    marginTop: Spacing.three,
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
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
