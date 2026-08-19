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
      // Technical tab-bar clearance only (safe-area + the floating tab bar's own
      // footprint) — no visual/aesthetic spacing folded in here. See `bottomSpacer`
      // below for the deliberate, separate breathing-room value.
      bottom: safeAreaInsets.bottom + BottomTabInset,
    }),
    [header, safeAreaInsets.top, safeAreaInsets.right, safeAreaInsets.bottom, safeAreaInsets.left],
  );

  const headerPlatformStyle = Platform.select({
    web: { paddingTop: Spacing.five },
    default: { paddingTop: safeAreaInsets.top },
  });

  const contentPlatformStyle = Platform.select({
    // iOS: reserve top/bottom clearance as real layout padding, not
    // `contentInset` — `contentInset` only shifts the native UIScrollView's
    // own inset accounting, which this floating-tab-bar/clipped-viewport
    // setup does not reliably honor at rest (verified: content can scroll
    // fully behind the tab bar with `contentInset` alone). Top clearance
    // has the identical reliability gap: physical-device QA found the top
    // safe-area inset can be transiently stale immediately after a fresh
    // mount (e.g. `AppLockGate`'s background re-lock cycle remounting
    // `AppTabs`), leaving header-less content rendered under the status
    // bar when top clearance depended solely on `contentInset.top`.
    // Padding is a guaranteed, ordinary layout value either way. Matches
    // the `header ? undefined : insets.top` pattern the Android branch
    // below already uses.
    ios: {
      paddingTop: header ? undefined : insets.top,
      paddingBottom: insets.bottom,
    },
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
      {/* The clipped scroll viewport: a hard visual boundary between the fixed
          header above and whatever the ScrollView does internally (content
          offset, contentInset, iOS bounce/rubber-band, or any inset a native
          tab host applies on its own). `overflow: 'hidden'` here means no
          scrolled content can ever be painted outside this box, regardless of
          scroll position — this is what actually keeps content off the header
          during an aggressive upward bounce; contentInset alone only shifts
          where content starts, it does not clip. */}
      <View style={styles.viewport}>
        <ScrollView
          style={styles.scroll}
          // `top`/`bottom` are both explicitly zeroed here — both are now
          // handled as real `paddingTop`/`paddingBottom` above (iOS
          // branch), so `contentInset` must not also apply them, which
          // would double the clearance. `left`/`right` are untouched,
          // still sourced from `insets` — unaffected by this fix.
          contentInset={{ ...insets, top: 0, bottom: 0 }}
          contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}
          showsVerticalScrollIndicator={false}>
          <View style={[styles.container, contentStyle]}>
            {children}
            {/* Deliberate visual breathing room after the last piece of content —
                distinct from `insets.bottom`/`BottomTabInset` above, which only
                reserves clearance to keep content clear of the floating tab bar.
                This is the purely aesthetic gap between the footer/last row and
                the tab bar's top edge, on top of that technical clearance —
                sized to `Spacing.five` to feel like the mirror image of the
                approved top breathing room (screens use the same value for
                their first section's `marginTop` below the header). */}
            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    // Explicit opaque background (not just inherited from `screen`) so the
    // header region is never see-through, independent of paint order.
    backgroundColor: palette.background,
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
  bottomSpacer: {
    height: Spacing.five,
  },
});
