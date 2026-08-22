import { StyleSheet, Text, View } from 'react-native';
import {
  SUPPORTED_ASSETS,
  formatAtomicAmountDecimal,
} from 'chain-domain';

import { AssetRow } from '@/components/asset-row';
import { formatAtomicAssetAmountForDisplay } from '@/utils/asset-amount-display';
import { BitcoinAddressProof } from '@/components/dev/bitcoin-address-proof';
import { EthereumBalanceProof } from '@/components/dev/ethereum-balance-proof';
import { EthereumSigningProof } from '@/components/dev/ethereum-signing-proof';
import { WalletCoreProof } from '@/components/dev/wallet-core-proof';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import { useEthereumLivePortfolio } from '@/hooks/use-ethereum-live-portfolio';
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

type LiveAsset = {
  symbol: 'BTC' | 'ETH' | 'USDC' | 'USDT' | 'XAUT';
  name: string;
  quantity: number;
  amountLabel: string;
  includeInTotal: boolean;
};

export default function AssetsScreen() {
  const { prices } = useMarketPrices();
  const {
    portfolio,
    isLoading: isPortfolioLoading,
    error: portfolioError,
  } = useEthereumLivePortfolio();

  const liveAssets: LiveAsset[] = portfolio
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

  return (
    <ScreenScaffold header={<ScreenHeader title="Assets" />}>
      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total Value</Text>
        <Text style={styles.summaryValue}>
          {totalValueChf !== null ? formatChf(totalValueChf) : VALUE_PLACEHOLDER}
        </Text>
      </View>

      <View style={styles.list}>
        {!portfolio ? (
          <Text style={styles.footnote}>
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
                isPositive={toPositiveFlag(change24hPercent)}
              />
            );
          })
        )}
      </View>

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
