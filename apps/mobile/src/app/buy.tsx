import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type BuyAssetSymbol = 'BTC' | 'ETH' | 'USDC' | 'USDT';

const BUY_ASSETS: readonly {
  symbol: BuyAssetSymbol;
  name: string;
}[] = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'USDT', name: 'Tether' },
];

function isValidPositiveFiatAmount(value: string): boolean {
  const normalized = value.replace(',', '.').trim();

  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) {
    return false;
  }

  const amount = Number(normalized);

  return Number.isFinite(amount) && amount > 0;
}

/**
 * BUY 1.1 — UI foundation only.
 *
 * No provider integration.
 * No payment execution.
 * No KYC.
 * No wallet signing.
 * No wallet secret access.
 * No network request.
 */
export default function BuyScreen() {
  const [selectedSymbol, setSelectedSymbol] =
    useState<BuyAssetSymbol>('BTC');

  const [amount, setAmount] = useState('');

  const canContinue = useMemo(
    () => isValidPositiveFiatAmount(amount),
    [amount],
  );

  const selectedAsset = BUY_ASSETS.find(
    (asset) => asset.symbol === selectedSymbol,
  );

  return (
    <ScreenScaffold
      header={<ScreenHeader title="Buy" back />}
    >
      <View style={styles.assetSelector}>
        {BUY_ASSETS.map((asset) => {
          const selected =
            asset.symbol === selectedSymbol;

          return (
            <Pressable
              key={asset.symbol}
              accessibilityRole="button"
              accessibilityLabel={`Buy ${asset.name}`}
              accessibilityState={{ selected }}
              onPress={() =>
                setSelectedSymbol(asset.symbol)
              }
              style={[
                styles.assetSelectorItem,
                selected &&
                  styles.assetSelectorItemSelected,
              ]}
            >
              <CoinBadge
                symbol={asset.symbol}
                size={27}
              />

              <Text
                style={[
                  styles.assetSelectorLabel,
                  selected &&
                    styles.assetSelectorLabelSelected,
                ]}
              >
                {asset.symbol}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.assetRow}>
        <CoinBadge
          symbol={selectedSymbol}
          size={32}
        />

        <View>
          <Text style={styles.assetName}>
            {selectedAsset?.name}
          </Text>

          <Text style={styles.assetSymbol}>
            {selectedSymbol}
          </Text>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>
          You pay
        </Text>

        <View style={styles.amountInputRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={
              palette.textSecondary
            }
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />

          <View style={styles.currencyBadge}>
            <Text style={styles.currencyText}>
              CHF
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>
          Buy {selectedSymbol}
        </Text>

        <Text style={styles.infoBody}>
          Payment provider selection and purchase
          execution will be added in the next stage.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue"
        accessibilityState={{
          disabled: !canContinue,
        }}
        disabled={!canContinue}
        onPress={() => {
          // BUY 1.1 intentionally stops here.
          // No provider, payment, KYC or network action.
        }}
        style={({ pressed }) => [
          styles.continueButton,
          (!canContinue || pressed) &&
            styles.continueButtonDisabled,
        ]}
      >
        <Text style={styles.continueButtonLabel}>
          Continue
        </Text>
      </Pressable>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  assetSelector: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.four,
  },

  assetSelectorItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
  },

  assetSelectorItemSelected: {
    borderWidth: 1,
    borderColor: palette.text,
  },

  assetSelectorLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  assetSelectorLabelSelected: {
    color: palette.text,
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
  },

  label: {
    color: palette.textSecondary,
    fontSize: 13,
    marginBottom: Spacing.two,
  },

  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
    paddingHorizontal: Spacing.three,
  },

  amountInput: {
    flex: 1,
    color: palette.text,
    fontSize: 28,
    fontWeight: '600',
    paddingVertical: Spacing.three,
  },

  currencyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: palette.background,
  },

  currencyText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },

  infoPanel: {
    marginTop: Spacing.four,
    padding: Spacing.three,
    borderRadius: 14,
    backgroundColor: palette.backgroundElement,
  },

  infoTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },

  infoBody: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },

  continueButton: {
    marginTop: Spacing.four,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: palette.text,
  },

  continueButtonDisabled: {
    opacity: 0.45,
  },

  continueButtonLabel: {
    color: palette.background,
    fontSize: 15,
    fontWeight: '700',
  },
});
