import { useMemo, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type ScreenScaffoldProps = {
  children: ReactNode;
  contentStyle?: ViewStyle;
};

export function ScreenScaffold({ children, contentStyle }: ScreenScaffoldProps) {
  const safeAreaInsets = useSafeAreaInsets();
  // Rebuilding this object on every render (e.g. when a screen re-renders from
  // async state, unrelated to the device's safe area) makes the ScrollView's
  // native `contentInset` prop look "changed" every time, which can leave the
  // top inset misapplied on iOS. Memoizing on the actual numeric values keeps
  // `contentInset` referentially stable unless the real inset changed.
  const insets = useMemo(
    () => ({
      ...safeAreaInsets,
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
    }),
    [safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left],
  );

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.five,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <ScrollView
      style={styles.screen}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
      showsVerticalScrollIndicator={false}>
      <View style={[styles.container, contentStyle]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
    width: '100%',
  },
});
