import { Link, useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SUPPORTED_ASSETS,
  formatAtomicAmountDecimal,
} from 'chain-domain';

import { AssetRow } from '@/components/asset-row';
import { formatAtomicAssetAmountForDisplay } from '@/utils/asset-amount-display';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { useEthereumLivePortfolio } from '@/hooks/use-ethereum-live-portfolio';
import { useMarketPrices } from '@/hooks/use-market-prices';
import {
  VALUE_PLACEHOLDER,
  computeAssetChange24hPercent,
  computeAssetValueChf,
  computePortfolioChange24hPercent,
  computeTotalValueChf,
  formatChangePercent,
  formatChf,
} from '@/utils/portfolio-valuation';

const palette = Colors.dark;

const ETH_METADATA = SUPPORTED_ASSETS.find(
  (asset) =>
    asset.symbol === 'ETH' &&
    asset.assetId.kind === 'native' &&
    asset.assetId.chainId === 'ethereum:mainnet',
);

const USDC_METADATA = SUPPORTED_ASSETS.find(
  (asset) =>
    asset.symbol === 'USDC' &&
    asset.assetId.kind === 'erc20' &&
    asset.assetId.chainId === 'ethereum:mainnet',
);

if (!ETH_METADATA || !USDC_METADATA) {
  throw new Error(
    'ETH or USDC metadata is missing from SUPPORTED_ASSETS.',
  );
}

const ETH_DECIMALS = ETH_METADATA.decimals;
const USDC_DECIMALS = USDC_METADATA.decimals;

type LiveHomeAsset = {
  symbol: 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XAUT';
  name: string;
  quantity: number;
  amountLabel: string;
  includeInTotal: boolean;
};

const QUICK_ACTIONS: { label: string; symbol: SFSymbol; glyph: string }[] = [
  { label: 'Send', symbol: 'arrow.up', glyph: '↑' },
  { label: 'Receive', symbol: 'arrow.down', glyph: '↓' },
  { label: 'Swap', symbol: 'arrow.left.arrow.right', glyph: '⇄' },
  { label: 'Buy', symbol: 'plus', glyph: '+' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { prices } = useMarketPrices();
  const {
    portfolio,
    isLoading: isPortfolioLoading,
    error: portfolioError,
  } = useEthereumLivePortfolio();

  const liveAssets: LiveHomeAsset[] = portfolio
    ? [
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          quantity: 0,
          amountLabel: '0 BTC',
          includeInTotal: false,
        },
        {
          symbol: 'ETH',
          name: 'Ethereum',
          quantity: Number(
            formatAtomicAmountDecimal(
              portfolio.eth.amount,
              ETH_DECIMALS,
            ),
          ),
          amountLabel: formatAtomicAssetAmountForDisplay(
            portfolio.eth.amount,
            ETH_DECIMALS,
            'ETH',
          ),
          includeInTotal: true,
        },
        {
          symbol: 'USDT',
          name: 'Tether',
          quantity: 0,
          amountLabel: '0 USDT',
          includeInTotal: false,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          quantity: Number(
            formatAtomicAmountDecimal(
              portfolio.usdc.amount,
              USDC_DECIMALS,
            ),
          ),
          amountLabel: formatAtomicAssetAmountForDisplay(
            portfolio.usdc.amount,
            USDC_DECIMALS,
            'USDC',
          ),
          includeInTotal: true,
        },
        {
          symbol: 'XAUT',
          name: 'Tether Gold',
          quantity: 0,
          amountLabel: '0 XAU₮',
          includeInTotal: false,
        },
      ]
    : [];

  const totalValueChf = portfolio
    ? computeTotalValueChf(
        liveAssets.filter((asset) => asset.includeInTotal),
        prices,
      )
    : null;

  const portfolioChangePercent = portfolio
    ? computePortfolioChange24hPercent(
        liveAssets.filter((asset) => asset.includeInTotal),
        prices,
      )
    : null;
  const isPortfolioPositive = portfolioChangePercent !== null ? portfolioChangePercent >= 0 : null;
  const changeColor =
    isPortfolioPositive === null
      ? palette.textSecondary
      : isPortfolioPositive
        ? palette.positive
        : palette.negative;

  return (
    <ScreenScaffold>
      <View style={styles.homeTopBar}>
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [
            styles.accountButton,
            pressed && styles.topButtonPressed,
          ]}>
          <Text style={styles.accountLabel}>Account</Text>
          <SymbolView
            name={{ ios: 'chevron.down' }}
            size={11}
            tintColor={palette.textSecondary}
            fallback={<Text style={styles.chevronFallback}>⌄</Text>}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          hitSlop={8}
          style={({ pressed }) => [
            styles.scannerButton,
            pressed && styles.topButtonPressed,
          ]}>
          <SymbolView
            name={{ ios: 'qrcode.viewfinder' }}
            size={21}
            tintColor={palette.text}
            fallback={<Text style={styles.scannerFallback}>⌗</Text>}
          />
        </Pressable>
      </View>

      <View style={styles.portfolioSection}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceValue}>
          {totalValueChf !== null ? formatChf(totalValueChf) : VALUE_PLACEHOLDER}
        </Text>
        <View style={styles.changeRow}>
          <Text style={[styles.changeValue, { color: changeColor }]}>
            {portfolioChangePercent !== null
              ? formatChangePercent(portfolioChangePercent)
              : VALUE_PLACEHOLDER}
          </Text>
          <Text style={styles.changeWindow}>(24h)</Text>
        </View>

      </View>

      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <View key={action.label} style={styles.actionItem}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={
                action.label === 'Send'
                  ? () => router.push('/send')
                  : action.label === 'Receive'
                    ? () => router.push('/receive')
                    : action.label === 'Swap'
                      ? () => router.push('/swap')
                      : undefined
              }
              style={({ pressed }) => [styles.actionCircle, pressed && styles.actionCirclePressed]}>
              <SymbolView
                name={{ ios: action.symbol }}
                size={18}
                tintColor={palette.text}
                fallback={<Text style={styles.actionGlyphFallback}>{action.glyph}</Text>}
              />
            </Pressable>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.assetsSection}>
        <View style={styles.assetsHeader}>
          <Text style={styles.assetsHeading}>Assets</Text>
          <Link href="/assets" asChild>
            <Pressable hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.assetsList}>
          {!portfolio ? (
            <Text style={styles.balanceLabel}>
              {isPortfolioLoading
                ? 'Fetching wallet balances…'
                : portfolioError
                  ? 'Wallet balances unavailable'
                  : 'Wallet balances unavailable'}
            </Text>
          ) : (
            liveAssets.map((asset) => {
              const valueChf = computeAssetValueChf(asset, prices);
              const change24hPercent =
                computeAssetChange24hPercent(asset, prices);

              return (
                <AssetRow
                  key={asset.symbol}
                  symbol={asset.symbol}
                  name={asset.name}
                  amountLabel={asset.amountLabel}
                  valueLabel={
                    valueChf !== null
                      ? formatChf(valueChf)
                      : VALUE_PLACEHOLDER
                  }
                  changeLabel={
                    change24hPercent !== null
                      ? formatChangePercent(change24hPercent)
                      : VALUE_PLACEHOLDER
                  }
                  isPositive={
                    change24hPercent !== null
                      ? change24hPercent >= 0
                      : null
                  }
                />
              );
            })
          )}
        </View>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  homeTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
  },
  accountButton: {
    alignItems: 'center',
    backgroundColor: palette.backgroundElement,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  accountLabel: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '600',
  },
  scannerButton: {
    alignItems: 'center',
    backgroundColor: palette.backgroundElement,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  topButtonPressed: {
    opacity: 0.55,
  },
  chevronFallback: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scannerFallback: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
  },
  portfolioSection: {
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  balanceLabel: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  balanceValue: {
    color: palette.text,
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 2,
    textAlign: 'center',
  },
  changeRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: Spacing.one,
    justifyContent: 'center',
    marginTop: 4,
  },
  changeValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  changeWindow: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  chartWrap: {
    alignSelf: 'stretch',
    marginTop: Spacing.three + 2,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.four,
  },
  actionItem: {
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  actionCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCirclePressed: {
    opacity: 0.6,
  },
  actionGlyphFallback: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
  },
  actionLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  assetsSection: {
    marginTop: Spacing.four,
  },
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two + 2,
  },
  assetsHeading: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  seeAll: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  assetsList: {
    gap: Spacing.one + 2,
  },
});
