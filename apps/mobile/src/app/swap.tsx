import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  SUPPORTED_ASSETS,
  formatAtomicAmountDecimal,
  parseEthDecimalStringToWei,
  type AtomicAmount,
  type EthereumAddress,
  type EthereumSwapAsset,
} from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { createSwissWalletSwapPriceTransport } from '@/services/swisswallet-swap-price-transport';
import {
  fetchZeroXAllowanceHolderPrice,
  type ZeroXAllowanceHolderPricePreview,
} from '@/services/zero-x-allowance-holder-price-client';
import { getEthereumAddressV1 } from '@/services/wallet-core-bridge';
import { normalizeEthAmountDecimalSeparator } from '@/utils/amount-input';

const palette = Colors.dark;

function getEthereumSwapAsset(symbol: 'ETH' | 'USDC'): EthereumSwapAsset {
  const metadata = SUPPORTED_ASSETS.find((asset) => asset.symbol === symbol);

  if (!metadata || metadata.assetId.chainId !== 'ethereum:mainnet') {
    throw new Error(`Missing curated Ethereum asset: ${symbol}`);
  }

  return metadata.assetId;
}

const ETH_ASSET = getEthereumSwapAsset('ETH');
const USDC_ASSET = getEthereumSwapAsset('USDC');
const USDC_DECIMALS =
  SUPPORTED_ASSETS.find((asset) => asset.symbol === 'USDC')?.decimals ?? 6;

type SwapAmountState =
  | { status: 'empty' }
  | { status: 'invalid' }
  | { status: 'ready'; sellAmount: AtomicAmount };

type PriceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: ZeroXAllowanceHolderPricePreview }
  | { status: 'error' };

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
  const [priceState, setPriceState] = useState<PriceState>({ status: 'idle' });
  const requestSequenceRef = useRef(0);

  const [walletAddress] = useState<EthereumAddress | null>(() => {
    try {
      return getEthereumAddressV1();
    } catch {
      return null;
    }
  });

  const amountState = useMemo(
    () => parseSwapEthAmount(amount),
    [amount],
  );

  useEffect(() => {
    const requestSequence = ++requestSequenceRef.current;

    if (amountState.status !== 'ready' || !walletAddress) {
      setPriceState({ status: 'idle' });
      return;
    }

    const apiBaseUrl = process.env.EXPO_PUBLIC_SWISSWALLET_API_BASE_URL;

    if (!apiBaseUrl) {
      setPriceState({ status: 'error' });
      return;
    }

    setPriceState({ status: 'loading' });

    const timer = setTimeout(() => {
      const transport = createSwissWalletSwapPriceTransport(apiBaseUrl);

      void fetchZeroXAllowanceHolderPrice(
        {
          chainId: 1,
          sellAsset: ETH_ASSET,
          buyAsset: USDC_ASSET,
          sellAmount: amountState.sellAmount,
          taker: walletAddress,
        },
        transport,
      )
        .then((preview) => {
          if (requestSequence !== requestSequenceRef.current) {
            return;
          }

          if (preview.liquidityAvailable === false) {
            setPriceState({ status: 'error' });
            return;
          }

          setPriceState({ status: 'ready', preview });
        })
        .catch(() => {
          if (requestSequence === requestSequenceRef.current) {
            setPriceState({ status: 'error' });
          }
        });
    }, 400);

    return () => clearTimeout(timer);
  }, [amountState, walletAddress]);

  const receiveAmount =
    priceState.status === 'ready'
      ? formatAtomicAmountDecimal(
          priceState.preview.buyAmount,
          USDC_DECIMALS,
        )
      : '0';

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

          <Text style={styles.amount}>
            {priceState.status === 'loading' ? '…' : receiveAmount}
          </Text>
        </View>

        <View style={styles.networkRow}>
          <Text style={styles.networkLabel}>Network</Text>
          <Text style={styles.networkValue}>Ethereum Mainnet</Text>
        </View>

        <View style={styles.quotePlaceholder}>
          <Text style={styles.quoteTitle}>
            {priceState.status === 'loading'
              ? 'Fetching live price…'
              : priceState.status === 'ready'
                ? 'Live price available'
                : priceState.status === 'error'
                  ? 'Price unavailable'
                  : amountState.status === 'invalid'
                    ? 'Check the amount'
                    : amountState.status === 'ready'
                      ? 'Preparing price preview'
                      : 'Enter an amount'}
          </Text>
          <Text style={styles.quoteText}>
            {priceState.status === 'ready'
              ? `Minimum receive: ${
                  priceState.preview.minBuyAmount
                    ? formatAtomicAmountDecimal(
                        priceState.preview.minBuyAmount,
                        USDC_DECIMALS,
                      )
                    : '—'
                } USDC`
              : priceState.status === 'error'
                ? 'Couldn’t load a live swap price. Check the connection and try again.'
                : amountState.status === 'invalid'
                  ? 'Use a positive ETH amount with up to 18 decimal places.'
                  : amountState.status === 'ready'
                    ? 'Connecting securely to the swap price service.'
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
