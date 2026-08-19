import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
};

const TRUST_ROWS: TrustRowItem[] = [
  {
    symbol: 'lock.shield',
    fallbackGlyph: '✓',
    title: 'Protected on your device',
  },
  {
    symbol: 'hand.raised.fill',
    fallbackGlyph: '✓',
    title: 'Only you have access',
  },
  {
    symbol: 'arrow.triangle.2.circlepath',
    fallbackGlyph: '✓',
    title: 'Always recoverable',
  },
];

/**
 * Stage 5E.6B — final cross-platform polish pass over the Stage 5E.6/5E.6A
 * first-run screen. Purely presentational: the props contract with
 * `_layout.tsx` (isCreating/errorMessage/onCreate) is unchanged, so the
 * existing checking/noWallet/creating/walletExists/error state machine —
 * including its partial-success handling — is untouched by this stage.
 *
 * Device-neutral throughout: no user-facing copy names any specific
 * platform, vendor, or hardware security mechanism, no `Platform.OS`
 * branching of copy, and no device-model checks. Iconography uses `expo-symbols`'
 * own cross-platform-aware `name`/`fallback` API (already the established
 * pattern elsewhere in this app) rather than any platform check written
 * here — on a platform/OS version where the named symbol isn't available,
 * `SymbolView` itself renders the provided text-glyph `fallback`.
 */
export function CreateWalletScreen({ isCreating, errorMessage, onCreate }: CreateWalletScreenProps) {
  const insets = useSafeAreaInsets();

  // Local, presentation-only UI state — not part of `_layout.tsx`'s state
  // machine. Fixes a real bug: `_layout.tsx`'s initial startup check
  // (`refreshHasWallet()`, run once on mount before any create attempt)
  // can itself land in the same `'error'` state a failed *create* attempt
  // produces (e.g. if the initial existence check throws for any reason),
  // and both are passed down through the identical `errorMessage` prop —
  // this component has no way to tell them apart from the prop alone.
  // Gating the error panel on "has the user actually pressed Create in
  // this screen's lifetime" is a purely local, presentational fix: it
  // never touches `_layout.tsx`'s transitions, and it doesn't affect the
  // existing partial-success rule at all (when create rejects but
  // `hasWallet()` becomes true, `_layout.tsx` transitions straight to
  // `walletExists` and this screen unmounts before any error could render,
  // exactly as before).
  const [hasAttemptedCreate, setHasAttemptedCreate] = useState(false);
  const showError = hasAttemptedCreate && errorMessage !== null;

  const handleCreate = () => {
    setHasAttemptedCreate(true);
    onCreate();
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.two },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        <View style={styles.heroBlock}>
          <ShieldMark size={44} />
          <Text style={styles.productName}>Mobile Wallet</Text>
          <Text style={styles.heroStatement}>Your money. Your keys.</Text>
          <Text style={styles.heroDescription}>
            {'A secure self-custody wallet.\nYou stay in control.'}
          </Text>
        </View>

        <View style={styles.trustList}>
          {TRUST_ROWS.map((row) => (
            <View key={row.title} style={styles.trustRow} accessible accessibilityLabel={row.title}>
              <View style={styles.trustIconWrap}>
                <SymbolView
                  name={{ ios: row.symbol }}
                  size={17}
                  tintColor={palette.accentGold}
                  fallback={<Text style={styles.trustIconFallback}>{row.fallbackGlyph}</Text>}
                />
              </View>
              <Text style={styles.trustTitle}>{row.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.spacer} />

      <View style={styles.actionBlock}>
        {showError ? (
          <View
            style={styles.errorPanel}
            accessible
            accessibilityRole="alert"
            accessibilityLabel={errorMessage ?? undefined}>
            <Text style={styles.errorTitle}>We couldn’t complete wallet creation.</Text>
            <Text style={styles.errorSubtitle}>Please try again.</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create Wallet"
          accessibilityState={{ disabled: isCreating, busy: isCreating }}
          disabled={isCreating}
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.createButton,
            (pressed || isCreating) && styles.createButtonPressed,
          ]}>
          <View style={styles.createButtonContent}>
            {isCreating ? <ActivityIndicator size="small" color={palette.background} /> : null}
            <Text style={styles.createButtonLabel}>{isCreating ? 'Creating…' : 'Create Wallet'}</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
  },
  content: {
    alignItems: 'center',
    gap: Spacing.four,
  },
  heroBlock: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  productName: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: Spacing.one,
  },
  heroStatement: {
    color: palette.text,
    fontSize: 27,
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
    gap: Spacing.two,
    marginTop: -10,
  },
  trustRow: {
    position: 'relative',
    minHeight: 32,
    justifyContent: 'center',
  },
  trustIconWrap: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -16,
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
  trustTitle: {
    width: '100%',
    color: palette.text,
    opacity: 0.85,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  spacer: {
    flex: 1,
    minHeight: Spacing.four,
  },
  actionBlock: {
    width: '100%',
    gap: Spacing.two,
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
});
