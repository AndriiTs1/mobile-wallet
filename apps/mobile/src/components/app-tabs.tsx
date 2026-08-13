import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

const palette = Colors.dark;

export default function AppTabs() {
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
