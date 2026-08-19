/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#0A0B0F',
    backgroundElement: '#15171D',
    backgroundSelected: '#1E212B',
    textSecondary: '#8D919B',
    accentGold: '#C9A24B',
    positive: '#3ECB71',
    negative: '#FF6161',
    border: 'rgba(255,255,255,0.08)',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

// Purely technical clearance: just enough, on top of `safeAreaInsets.bottom`
// (the home indicator margin), to bring scroll content flush with the top
// edge of the floating pill tab bar — no visual/aesthetic spacing folded in
// here (see `bottomSpacer` in ScreenScaffold for that). Applied as real
// layout padding, not as `contentInset` — measured empirically: NativeTabs'
// automatic content-inset adjustment does not reliably keep scrolled content
// clear of the floating bar on its own.
export const BottomTabInset = Platform.select({ ios: 24, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// Single source of truth for the shield/logo width shown across the whole
// cold-launch / App Lock chain (native launch screen, AnimatedSplashOverlay,
// AppLockScreen, PrivacyCover) — must stay visually one consistent size
// across that handoff. Matches app.json's expo-splash-screen `imageWidth`.
// The native Swift PrivacyCover mirrors this value independently (Swift
// can't import this constant) — keep both in sync if this ever changes.
export const ShieldLogoSize = 76;
