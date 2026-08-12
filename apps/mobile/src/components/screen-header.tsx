import { StyleSheet, Text, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type ScreenHeaderProps = {
  title?: string;
};

export function ScreenHeader({ title }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <ShieldMark size={26} />
        <Text style={styles.wordmark}>Mobile Wallet</Text>
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two - 2,
  },
  wordmark: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  title: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: Spacing.one,
  },
});
