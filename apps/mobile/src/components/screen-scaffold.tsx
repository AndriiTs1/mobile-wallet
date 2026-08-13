import { useMemo, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';

const palette = Colors.dark;

type ScreenScaffoldProps = {
  header?: ReactNode;
  children: ReactNode;
  contentStyle?: ViewStyle;
};

export function ScreenScaffold({ header, children, contentStyle }: ScreenScaffoldProps) {
  const safeAreaInsets = useSafeAreaInsets();
  // `header`, when provided, renders as a fixed sibling above the ScrollView instead
  // of as scrollable content — so its position stays identical across every screen
  // regardless of how much content that screen has, and it never scrolls away.
  // Rebuilding this object on every render (e.g. when a screen re-renders from
  // async state, unrelated to the device's safe area) makes the ScrollView's
  // native `contentInset` prop look "changed" every time, which can leave the
  // top inset misapplied on iOS. Memoizing on the actual numeric values keeps
  // `contentInset` referentially stable unless the real inset changed.
  const insets = useMemo(
    () => ({
      ...safeAreaInsets,
      top: header ? 0 : safeAreaInsets.top,
      bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
    }),
    [header, safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left],
  );

  const headerPlatformStyle = Platform.select({
    web: { paddingTop: Spacing.five },
    default: { paddingTop: safeAreaInsets.top },
  });

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: header ? undefined : insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: header ? undefined : Spacing.five,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <View style={styles.screen}>
      {header ? (
        <View style={[styles.headerRow, headerPlatformStyle]}>
          <View style={styles.headerContainer}>{header}</View>
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
        showsVerticalScrollIndicator={false}>
        <View style={[styles.container, contentStyle]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  headerContainer: {
    maxWidth: MaxContentWidth,
    width: '100%',
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
