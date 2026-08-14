import { useRouter } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';

const palette = Colors.dark;

export default function AppTabs() {
  const router = useRouter();
  // The native tab controller can restore whatever tab was last active
  // before the process was killed, even on a plain icon launch. NativeTabs
  // exposes no prop to set its initial/default selected tab (checked:
  // `NativeTabsProps` only has visual/styling options), so this is forced
  // unconditionally at the root. This effect runs once per process
  // lifetime — AppTabs mounts exactly once at app start and is never
  // remounted by backgrounding/foregrounding — so it only ever fires on a
  // genuine cold launch, never on background → foreground.
  //
  // Deep-link preservation on cold launch is deliberately not handled here —
  // deferred until real deep-link flows exist.
  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <NativeTabs
      backgroundColor={palette.background}
      indicatorColor="rgba(201, 162, 75, 0.16)"
      blurEffect="none"
      shadowColor={palette.border}
      disableTransparentOnScrollEdge
      minimizeBehavior="never"
      iconColor={{ default: palette.textSecondary, selected: palette.accentGold }}
      labelStyle={{
        default: { color: palette.textSecondary, fontSize: 11, fontWeight: '500' },
        selected: { color: palette.accentGold, fontSize: 11, fontWeight: '600' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="assets">
        <NativeTabs.Trigger.Label>Assets</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }}
          src={require('@/assets/images/tabIcons/assets.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'clock', selected: 'clock.fill' }}
          src={require('@/assets/images/tabIcons/activity.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          src={require('@/assets/images/tabIcons/settings.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
