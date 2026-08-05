// The app's spine: five persistent tabs (Home · Learn · Play · Coach · Menu).
// Play is a native launcher (deal of the day, resume, new, assignments); Menu
// holds everything that doesn't earn a tab — Profile, Library, and more later.
// Anything else (tables, reviews, rosters) pushes as a stack screen OVER the
// tabs, so the bar is always the way back.

import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Colors } from "../../constants/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.text,
        tabBarInactiveTintColor: "#a49d8e",
        tabBarStyle: {
          backgroundColor: "#fffefa",
          borderTopColor: "#e7e1d3",
          height: 76,
          paddingTop: 8,
          paddingBottom: 14,
        },
        tabBarItemStyle: { gap: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", lineHeight: 14 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "Learn",
          tabBarIcon: ({ color }) => <Ionicons name="book-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: "Play",
          tabBarIcon: ({ color }) => (
            <Ionicons name="game-controller-outline" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color }) => <Ionicons name="menu-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
