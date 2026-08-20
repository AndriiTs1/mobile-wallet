// Stage 5G.2.3 bugfix — the tab group. `NativeTabs.Trigger` (inside
// `AppTabs`) only ever registers a navigable screen for routes it
// explicitly declares as a Trigger; it does NOT auto-adopt every sibling
// file the way `<Stack>`/`<Tabs>` do when given no explicit children (see
// `apps/mobile/src/components/app-tabs.tsx`'s four `<NativeTabs.Trigger>`
// elements — index/assets/activity/settings only). Non-tab routes like
// `send`/`send-review` must therefore live OUTSIDE this group, as siblings
// of it, reachable through an ancestor `<Stack>` instead — see
// `app/_layout.tsx`'s `WalletReadyNavigator`. Moving `index`/`assets`/
// `activity`/`settings` into this `(tabs)` group changes no public route:
// group-segment folders are stripped from the URL, so `/`, `/assets`,
// `/activity`, and `/settings/...` all resolve exactly as before.
export { default } from '@/components/app-tabs';
