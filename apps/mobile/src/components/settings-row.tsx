import { Link, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

export function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type SettingsRowIndicator = 'chevron' | 'check' | 'none';

type SettingsRowProps = {
  label: string;
  trailingText?: string;
  indicator?: SettingsRowIndicator;
  isLast?: boolean;
};

export function SettingsRow({ label, trailingText, indicator = 'none', isLast = false }: SettingsRowProps) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowTrailing}>
        {trailingText ? <Text style={styles.rowTrailingText}>{trailingText}</Text> : null}
        {indicator === 'chevron' && (
          <SymbolView
            name={{ ios: 'chevron.right' }}
            size={13}
            tintColor={palette.textSecondary}
            fallback={<Text style={styles.chevronFallback}>›</Text>}
          />
        )}
        {indicator === 'check' && (
          <SymbolView
            name={{ ios: 'checkmark' }}
            size={15}
            tintColor={palette.accentGold}
            fallback={<Text style={styles.checkFallback}>✓</Text>}
          />
        )}
      </View>
    </View>
  );
}

type SettingsCategoryRowProps = {
  href: Href;
  label: string;
  subtitle: string;
  isLast?: boolean;
};

export function SettingsCategoryRow({ href, label, subtitle, isLast = false }: SettingsCategoryRowProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={StyleSheet.flatten([styles.row, isLast && styles.rowLast])}>
        <View style={styles.categoryText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.categorySubtitle}>{subtitle}</Text>
        </View>
        <SymbolView
          name={{ ios: 'chevron.right' }}
          size={13}
          tintColor={palette.textSecondary}
          fallback={<Text style={styles.chevronFallback}>›</Text>}
        />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
    marginRight: Spacing.two,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  rowTrailingText: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  chevronFallback: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  checkFallback: {
    color: palette.accentGold,
    fontSize: 14,
    fontWeight: '700',
  },
  categoryText: {
    flexShrink: 1,
    marginRight: Spacing.two,
    gap: 2,
  },
  categorySubtitle: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});
