import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ShieldMark } from '@/components/shield-mark';
import { Colors, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type ScreenHeaderProps = {
  title?: string;
  back?: boolean;
};

export function ScreenHeader({ title, back = false }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <SymbolView
            name={{ ios: 'chevron.left' }}
            size={16}
            tintColor={palette.text}
            fallback={<Text style={styles.backFallback}>‹</Text>}
          />
        </Pressable>
      ) : null}
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
  backButton: {
    marginRight: Spacing.two,
    padding: Spacing.one,
    marginLeft: -Spacing.one,
  },
  backButtonPressed: {
    opacity: 0.5,
  },
  backFallback: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
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
