// The app's spine: five persistent tabs — Home · Learn · Play · Coach · Club —
// plus a Menu button in the bar's sixth slot.
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
// Home is the tree. Menu is NOT a tab: it opens a drawer over whatever page you
// are on, which is why it lives here rather than in a screen — the bar is drawn
// once, for every tab, so the drawer has to be owned at the same level. It took
// Analysis's slot, which had a tab and a nest but no feature behind it (Analysis
// is a pushed screen now, still reachable from its nest).

import {
  createMaterialTopTabNavigator,
  type MaterialTopTabNavigationEventMap,
  type MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";
import { useSegments, withLayoutContext } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CONTENT_TOP_GAP } from "../../components/brand-chrome";
import { BrandTabBar } from "../../components/brand-tab-bar";
import { BridgeSessionWarmer } from "../../components/bridge-session-warmer";
import { useBrandSheets } from "../../components/use-brand-sheets";
import { useRoleRefreshOnForeground } from "../../lib/use-can";
import { Brand } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { useSelectedClubId } from "../../lib/club-context";
import { fetchMyDrive } from "../../lib/nexus";

const { Navigator } = createMaterialTopTabNavigator();

/** expo-router-aware wrapper, so file-based routing still drives the tabs. */
const SwipeTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // One listener for the whole app: permissions re-resolve when it comes back
  // to the foreground, so a role edited in the console takes effect without a
  // sign-out.
  useRoleRefreshOnForeground();
  // The drawer starts where a screen's first line does, so it covers the page
  // and leaves the status bar clear.
  const { open, sheets } = useBrandSheets(insets.top + CONTENT_TOP_GAP);

  /**
   * Inside a tab's own stack — a learn object's reader, and anything nested like it
   * later — the bar goes away.
   *
   * Opening one of those is ENTERING something rather than moving between tabs: it
   * has its own back arrow, and a bar offering five sideways moves undercuts that
   * and steals the bottom of a full-bleed reader.
   *
   * Segments are ["(tabs)", <tab>, …rest], so depth alone answers it: a third
   * segment means a nested route. A tab's own landing screen does NOT contribute an
   * "index" segment — expo-router's generated types say so outright (segments[2] is
   * typed "[id]" | undefined), so there is no index case to special-case.
   *
   * Depth rather than a list of screens, so a nested route added later inherits this
   * by existing instead of by being remembered.
   */
  const segments = useSegments();
  const { token } = useAuth();
  const clubId = useSelectedClubId();
  const inNestedScreen = segments.length > 2;

  /**
   * MY DRIVE APPEARS ONLY WHEN THERE IS ONE.
   *
   * Having a drive is a grant, not an assumption (migration 0014), so most people
   * do not have one. An always-present tab that is usually empty teaches people
   * to ignore a tab; an absent one costs nothing. Read once per session and
   * failing closed -- a blip hides the tab rather than showing an empty room.
   */
  const [hasDrive, setHasDrive] = useState(false);
  useEffect(() => {
    if (!token) { setHasDrive(false); return; }
    let live = true;
    fetchMyDrive(token, clubId ?? undefined)
      .then((d) => { if (live) setHasDrive(d.has_drive === true); })
      .catch(() => { if (live) setHasDrive(false); });
    return () => { live = false; };
  }, [token, clubId]);

  return (
    <>
      {/* Runs the bridge launch handshake invisibly the moment the tabs
          exist, so the first embed anyone opens (Create Assignment, a table)
          loads directly instead of paying the handshake at the tap. */}
      <BridgeSessionWarmer />
      <SwipeTabs
      tabBarPosition="bottom"
      tabBar={(props) =>
        inNestedScreen ? null : (
          <BrandTabBar
            {...props}
            onOpenMenu={open}
            // The route exists either way -- expo-router registers every file in
            // this folder -- so the bar is where "do they have a drive?" is
            // actually answered.
            hiddenRoutes={hasDrive ? [] : ["drive"]}
          />
        )
      }
      screenOptions={{
        // Swiping between tabs is a NATIVE gesture. In a mobile browser it
        // fights Safari's own edge-swipes — and worse, the pager's gesture
        // detector watches every touch for movement, so a normal (slightly
        // wobbly) tap on the tab bar reads as a maybe-swipe and the press
        // cancels: the infamous "have to tap twice". Web taps, native swipes.
        swipeEnabled: Platform.OS !== "web",
        // The SLIDE stays everywhere (owner request): tapping a tab still
        // glides the pages across — only the drag GESTURE is web-disabled.
        animationEnabled: true,
        // Keep the neighbours mounted so a swipe reveals a real page rather than
        // a blank placeholder, without paying to mount all six up front (Home
        // carries the tree's vector artwork).
        lazy: true,
        lazyPreloadDistance: 1,
        sceneStyle: { backgroundColor: Brand.cream },
      }}
    >
      <SwipeTabs.Screen name="home" options={{ title: "Home" }} />
      {/* Play sits second, ahead of Learn — playing is the thing people open the
          app to do. The tab bar renders state.routes in this order, so the bar and
          the swipe sequence both follow from here. */}
      <SwipeTabs.Screen name="play" options={{ title: "Play" }} />
      <SwipeTabs.Screen name="learn" options={{ title: "Learn" }} />
      <SwipeTabs.Screen name="coach" options={{ title: "Coach" }} />
      <SwipeTabs.Screen name="club" options={{ title: "Club" }} />
      {/* Last: a personal space is a side room, not a destination the app is for.
          Always declared -- the route is registered by the file either way, and
          conditionally omitting the Screen only lost its title while the bar
          went on deciding visibility for itself. */}
      <SwipeTabs.Screen name="drive" options={{ title: "My Drive" }} />
      </SwipeTabs>

      {/* The Menu drawer — over the tabs, so it survives switching between them. */}
      {sheets}
    </>
  );
}
