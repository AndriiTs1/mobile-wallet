import { SymbolView, type SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type CreateWalletScreenProps = {
  isCreating: boolean;
  errorMessage: string | null;
  onCreate: () => void;
};

type TrustRowItem = {
  symbol: SFSymbol;
  fallbackGlyph: string;
  title: string;
  description: string;
};

const TRUST_ROWS: TrustRowItem[] = [
  {
    symbol: 'lock.iphone',
    fallbackGlyph: '✓',
    title: 'Protected on your device',
    description: 'Your private keys stay securely on this iPhone.',
  },
  {
    symbol: 'hand.raised.fill',
    fallbackGlyph: '✓',
    title: 'Only you have access',
    description: 'No one — including us — can access your wallet.',
  },
  {
    symbol: 'arrow.triangle.2.circlepath',
    fallbackGlyph: '✓',
    title: 'Recoverable by you',
    description: 'Restore your wallet using your recovery phrase.',
  },
];

/**
 * Stage 5E.6A — premium polish pass over the Stage 5E.6 first-run screen.
 * Purely presentational: the props contract with `_layout.tsx`
 * (isCreating/errorMessage/onCreate) is unchanged, so the existing
 * checking/noWallet/creating/walletExists/error state machine — including
 * its partial-success handling — is untouched by this stage.
 */
export function CreateWalletScreen({ isCreating, errorMessage, onCreate }: CreateWalletScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.two },
      ]}>
      <View style={styles.content}>
        <View style={styles.heroBlock}>
          <ShieldMark size={56} />
          <Text style={styles.productName}>Mobile Wallet</Text>
          <Text style={styles.heroStatement}>Your money. Your keys.</Text>
          <Text style={styles.heroDescription}>
            A secure self-custody wallet that puts you in control.
          </Text>
        </View>

        <View style={styles.trustList}>
          {TRUST_ROWS.map((row) => (
            <View
              key={row.title}
              style={styles.trustRow}
              accessible
              accessibilityLabel={`${row.title}. ${row.description}`}>
              <View style={styles.trustIconWrap}>
                <SymbolView
                  name={{ ios: row.symbol }}
                  size={17}
                  tintColor={palette.accentGold}
                  fallback={<Text style={styles.trustIconFallback}>{row.fallbackGlyph}</Text>}
                />
              </View>
              <View style={styles.trustText}>
                <Text style={styles.trustTitle}>{row.title}</Text>
                <Text style={styles.trustDescription}>{row.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.spacer} />

      <View style={styles.actionBlock}>
        <Text style={styles.trustLine}>No email · No password · No personal data required</Text>

        {errorMessage ? (
          <View style={styles.errorPanel} accessible accessibilityRole="alert" accessibilityLabel={errorMessage}>
            <Text style={styles.errorTitle}>We couldn’t complete wallet creation.</Text>
            <Text style={styles.errorSubtitle}>Please try again.</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Wallet"
          accessibilityState={{ disabled: isCreating, busy: isCreating }}
          disabled={isCreating}
          onPress={onCreate}
          style={({ pressed }) => [
            styles.createButton,
            (pressed || isCreating) && styles.createButtonPressed,
          ]}>
          <View style={styles.createButtonContent}>
            {isCreating ? <ActivityIndicator size="small" color={palette.background} /> : null}
            <Text style={styles.createButtonLabel}>{isCreating ? 'Creating…' : 'Create Wallet'}</Text>
          </View>
        </Pressable>

        <Text style={styles.helperText}>
          Next, you’ll securely back up your 12-word recovery phrase.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: Spacing.four,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.five,
  },
  heroBlock: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  productName: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginTop: Spacing.two,
  },
  heroStatement: {
    color: palette.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroDescription: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  trustList: {
    width: '100%',
    gap: Spacing.three,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  trustIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: palette.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustIconFallback: {
    color: palette.accentGold,
    fontSize: 14,
    fontWeight: '700',
  },
  trustText: {
    flex: 1,
    gap: 2,
  },
  trustTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  trustDescription: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  spacer: {
    flex: 1,
    minHeight: Spacing.four,
  },
  actionBlock: {
    width: '100%',
    gap: Spacing.two,
  },
  trustLine: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  errorPanel: {
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: 2,
  },
  errorTitle: {
    color: palette.negative,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorSubtitle: {
    color: palette.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: palette.accentGold,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  createButtonPressed: {
    opacity: 0.7,
  },
  createButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  createButtonLabel: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    color: palette.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
