// The app's spine: four persistent tabs (Home · Learn · Play · Profile).
// Everything else (plays, reviews, assign flows, coach picker) pushes as a
// stack screen OVER the tabs — the tab bar is the learner's daily anchor.

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
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-circle-outline" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
