import { StyleSheet, Text, View } from 'react-native';

import { AssetRow } from '@/components/asset-row';
import { BitcoinAddressProof } from '@/components/dev/bitcoin-address-proof';
import { EthereumBalanceProof } from '@/components/dev/ethereum-balance-proof';
import { EthereumSigningProof } from '@/components/dev/ethereum-signing-proof';
import { WalletCoreProof } from '@/components/dev/wallet-core-proof';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { mockAssets } from '@/constants/mock-portfolio';
import { useMarketPrices } from '@/hooks/use-market-prices';
import {
  VALUE_PLACEHOLDER,
  computeAssetChange24hPercent,
  computeAssetValueChf,
  computeTotalValueChf,
  formatChangePercent,
  formatChf,
  toPositiveFlag,
} from '@/utils/portfolio-valuation';

const palette = Colors.dark;

export default function AssetsScreen() {
  const { prices, isLoading, error, isStale } = useMarketPrices();

  const totalValueChf = computeTotalValueChf(mockAssets, prices);

  let statusText: string;
  if (isLoading) {
    statusText = 'fetching live prices…';
  } else if (error && !prices) {
    statusText = 'live prices unavailable.';
  } else if (error) {
    statusText = 'showing last known prices.';
  } else if (isStale) {
    statusText = 'live prices may be outdated.';
  } else {
    statusText = 'prices live via CoinGecko.';
  }

  return (
    <ScreenScaffold header={<ScreenHeader title="Assets" />}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total Value</Text>
        <Text style={styles.summaryValue}>
          {totalValueChf !== null ? formatChf(totalValueChf) : VALUE_PLACEHOLDER}
        </Text>
      </View>

      <View style={styles.list}>
        {mockAssets.map((asset) => {
          const valueChf = computeAssetValueChf(asset, prices);
          const change24hPercent = computeAssetChange24hPercent(asset, prices);

          return (
            <AssetRow
              key={asset.symbol}
              symbol={asset.symbol}
              name={asset.name}
              amountLabel={asset.amountLabel}
              valueLabel={valueChf !== null ? formatChf(valueChf) : VALUE_PLACEHOLDER}
              changeLabel={
                change24hPercent !== null ? formatChangePercent(change24hPercent) : VALUE_PLACEHOLDER
              }
              isPositive={toPositiveFlag(change24hPercent)}
            />
          );
        })}
      </View>

      <Text style={styles.footnote}>Asset quantities are demo data — {statusText}</Text>

      {__DEV__ ? <EthereumBalanceProof /> : null}
      {__DEV__ ? <BitcoinAddressProof /> : null}
      {__DEV__ ? <WalletCoreProof /> : null}
      {__DEV__ ? <EthereumSigningProof /> : null}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summary: {
    marginTop: Spacing.four,
  },
  summaryLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValue: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  list: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  footnote: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.four,
    textAlign: 'center',
  },
});
