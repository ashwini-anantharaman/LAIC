// The app's spine: six persistent tabs — Home · Learn · Play · Coach · Club ·
// Analysis — matching the BirdBridge design's floating bar.
//
// These are MATERIAL TOP TABS pinned to the bottom, not bottom-tabs. Bottom-tabs
// has no swipe: it mounts one screen at a time with no shared gesture. Top-tabs
// runs on react-native-pager-view, so the pages sit side by side on a pager and
// swipe left/right under your finger the way Instagram moves between Home and
// Reels. `tabBarPosition: "bottom"` puts the bar back where the design wants it,
// and our own component draws it.
//
// The pager also hands the tab bar a `position` value that tracks the swipe
// continuously, which is what lets the active marker travel WITH your finger
// instead of snapping after the fact.
//
// Home is the tree; each nest on it leads to one of the other five. Menu is not a
// tab (the design spends every slot on a destination) — it hangs off the ☰ in the
// top app bar as a stack screen, and still holds Library, My Games, Profile,
// Today and sign-out.

import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";
import { withLayoutContext } from "expo-router";

import { BrandTabBar } from "../../components/brand-tab-bar";
import { Brand } from "../../constants/theme";

const { Navigator } = createMaterialTopTabNavigator();

/** expo-router-aware wrapper, so file-based routing still drives the tabs. */
const SwipeTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  return (
    <SwipeTabs
      tabBarPosition="bottom"
      tabBar={(props) => <BrandTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        // Keep the neighbours mounted so a swipe reveals a real page rather than
        // a blank placeholder, without paying to mount all six up front (Home
        // carries the tree's vector artwork).
        lazy: true,
        lazyPreloadDistance: 1,
        sceneStyle: { backgroundColor: Brand.cream },
      }}
    >
      <SwipeTabs.Screen name="home" options={{ title: "Home" }} />
      <SwipeTabs.Screen name="learn" options={{ title: "Learn" }} />
      <SwipeTabs.Screen name="play" options={{ title: "Play" }} />
      <SwipeTabs.Screen name="coach" options={{ title: "Coach" }} />
      <SwipeTabs.Screen name="club" options={{ title: "Club" }} />
      <SwipeTabs.Screen name="analysis" options={{ title: "Analysis" }} />
    </SwipeTabs>
  );
}
