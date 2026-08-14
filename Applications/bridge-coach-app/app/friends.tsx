// Friends (Figma 851:434).
//
// The app's only person-to-person screen: friendships are not a club's, they are
// between two people and survive joining or leaving one. That is why the search
// asks for a username or an email instead of offering a roster to pick from.
//
// Three tabs behind one segmented control, and ONE payload behind all of them —
// fetching per tab would mean the requests badge could disagree with the tab it
// sits on. The badge is the count of requests waiting on this person.
//
// Everything is laid out in the design's 390-wide space and multiplied by
// `s = width / DESIGN_WIDTH`, the same way every other screen here scales.

import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { Avatar } from "../components/avatar";
import { BrandAppBar } from "../components/brand-app-bar";
import { tintSvg } from "../components/svg-tint";
import {
  ICON_BELL,
  ICON_FRIENDS,
  ICON_FRIEND_ADD,
  ICON_SEARCH,
} from "../constants/brand-vectors";
import { Brand, Fonts, Radius, TAB_BAR_CLEARANCE, Type } from "../constants/theme";
import { useAuth } from "../lib/auth-context";
import {
  EMPTY_FRIENDS,
  getFriends,
  peekFriends,
  removeFriend,
  requestFriend,
  respondToRequest,
  searchPeople,
  type FoundPerson,
  type FriendPerson,
  type FriendsSnapshot,
} from "../lib/friends";

const DESIGN_WIDTH = 390;

/** The design's measurements, in its own units. */
const D = {
  titleLeft: 23,
  pill: { top: 142, width: 238, height: 47, radius: 100, segment: 87 },
  search: { top: 209, left: 38, width: 307, height: 32, radius: 30 },
  card: { top: 271, left: 21, width: 343, radius: Radius.field },
  row: { height: 48, glyph: 26.3, gap: 20 },
} as const;

type Tab = "friends" | "find" | "requests";

export default function FriendsScreen() {
  const { token } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const s = width / DESIGN_WIDTH;

  const [tab, setTab] = useState<Tab>("friends");
  const [data, setData] = useState<FriendsSnapshot>(
    () => (token ? peekFriends(token) : null) ?? EMPTY_FRIENDS,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What was typed — trimmed where it is used, so the field shows it verbatim. */
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** Ids with an action in flight, so a row can't be double-tapped into two asks. */
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (refresh = false) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        setData(await getFriends(token, { refresh }));
      } catch {
        setError("Couldn't load your friends. Pull to try again.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The Find tab searches the platform; the other two filter what is already here,
  // so only this one goes to the server — and only after two characters, which is
  // the same floor the server enforces.
  useEffect(() => {
    if (tab !== "find" || !token) return;
    const q = query.trim();
    if (q.length < 2) {
      setFound(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchPeople(token, q);
        if (!cancelled) setFound(results);
      } catch {
        if (!cancelled) setFound([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300); // typing settles before asking
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, query, token]);

  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(id));
    try {
      await fn();
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const onAdd = (person: FoundPerson) =>
    withBusy(person.profileId, async () => {
      if (!token) return;
      await requestFriend(token, person.profileId);
      // Reflect it on the row immediately; the list behind it is refetched too.
      setFound((f) =>
        (f ?? []).map((p) => (p.profileId === person.profileId ? { ...p, state: "requested" } : p)),
      );
      await load(true);
    });

  const onRespond = (friendshipId: string, accept: boolean) =>
    withBusy(friendshipId, async () => {
      if (!token) return;
      await respondToRequest(token, friendshipId, accept);
      await load(true);
    });

  const onRemove = (profileId: string) =>
    withBusy(profileId, async () => {
      if (!token) return;
      await removeFriend(token, profileId);
      await load(true);
    });

  /** The Friends tab filters what is already loaded — no round trip to type. */
  const shownFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.friends;
    return data.friends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q),
    );
  }, [data.friends, query]);

  const requestCount = data.requests.length;

  return (
    <View style={styles.page}>
      {/* No wordmark: it renders "BridgeBird" in Fonts.display at Type.wordmark —
          the same face and size as this screen's own title, at almost the same left
          inset — so the two stack up and read as one title repeated rather than as
          branding. The design has a single title here. */}
      <BrandAppBar
        onBack={() => router.back()}
        showActions
        showMenu={false}
        showWordmark={false}
      />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: TAB_BAR_CLEARANCE + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The wordmark row used to supply the gap under the app bar; without it the
            title would sit right against the chrome. */}
        <View style={[styles.titleRow, { marginLeft: D.titleLeft * s, marginTop: 6 * s }]}>
          <Text style={[styles.title, { fontSize: Type.screenTitle * s }]}>Friends</Text>
        </View>

        {/* ── The three tabs ─────────────────────────────────────────────── */}
        <View
          style={[
            styles.pill,
            {
              width: D.pill.width * s,
              height: D.pill.height * s,
              borderRadius: D.pill.radius * s,
              marginTop: 16 * s,
            },
          ]}
        >
          <Segment
            active={tab === "friends"}
            onPress={() => setTab("friends")}
            label="Friends"
            xml={ICON_FRIENDS}
            glyph={{ w: 25, h: 21.53 }}
            scale={s}
          />
          <Segment
            active={tab === "find"}
            onPress={() => setTab("find")}
            label="Find people"
            xml={ICON_FRIEND_ADD}
            glyph={{ w: 22, h: 22 }}
            scale={s}
          />
          <Segment
            active={tab === "requests"}
            onPress={() => setTab("requests")}
            label={`Requests${requestCount ? `, ${requestCount} waiting` : ""}`}
            xml={ICON_BELL}
            glyph={{ w: 17.88, h: 19 }}
            badge={requestCount}
            scale={s}
          />
        </View>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <View
          style={[
            styles.search,
            {
              width: D.search.width * s,
              height: D.search.height * s,
              borderRadius: D.search.radius * s,
              marginTop: 20 * s,
              paddingHorizontal: 14 * s,
            },
          ]}
        >
          <SvgXml
            xml={tintSvg(ICON_SEARCH, Brand.cream)}
            width={13 * s}
            height={13 * s}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tab === "find" ? "Search with username or email" : "Search your friends"}
            placeholderTextColor="rgba(255,244,215,0.6)"
            style={[styles.searchInput, { fontSize: 11.36 * s, marginLeft: 10 * s }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={tab === "find" ? "Search with username or email" : "Search your friends"}
          />
        </View>

        {/* ── The list ───────────────────────────────────────────────────── */}
        <View style={{ marginTop: 30 * s, alignItems: "center" }}>
          {loading && !data.friends.length && !data.requests.length ? (
            <ActivityIndicator color={Brand.green} style={{ marginTop: 24 * s }} />
          ) : error ? (
            <Text style={[styles.empty, { fontSize: 13 * s }]}>{error}</Text>
          ) : tab === "friends" ? (
            <ListCard scale={s} empty={emptyFriends(query, data)}>
              {shownFriends.map((p, i) => (
                <PersonLine
                  key={p.profileId}
                  person={p}
                  first={i === 0}
                  last={i === shownFriends.length - 1}
                  scale={s}
                  action={
                    <RowButton
                      label="Remove"
                      busy={busy.has(p.profileId)}
                      onPress={() => onRemove(p.profileId)}
                      scale={s}
                    />
                  }
                />
              ))}
            </ListCard>
          ) : tab === "find" ? (
            <ListCard
              scale={s}
              empty={
                query.trim().length < 2
                  ? "Search by username, or by the exact email address."
                  : searching
                    ? "Searching…"
                    : "Nobody found. Check the spelling — an email has to match exactly."
              }
            >
              {(found ?? []).map((p, i) => (
                <PersonLine
                  key={p.profileId}
                  person={p}
                  first={i === 0}
                  last={i === (found ?? []).length - 1}
                  scale={s}
                  action={
                    p.state === "friend" ? (
                      <RowNote label="Friends" scale={s} />
                    ) : p.state === "requested" ? (
                      <RowNote label="Requested" scale={s} />
                    ) : (
                      <RowButton
                        label="Add"
                        busy={busy.has(p.profileId)}
                        onPress={() => onAdd(p)}
                        scale={s}
                      />
                    )
                  }
                />
              ))}
            </ListCard>
          ) : (
            <ListCard scale={s} empty="No requests waiting.">
              {data.requests.map((r, i) => (
                <PersonLine
                  key={r.friendshipId}
                  person={r}
                  first={i === 0}
                  last={i === data.requests.length - 1}
                  scale={s}
                  action={
                    <View style={{ flexDirection: "row", gap: 8 * s }}>
                      <RowButton
                        label="Accept"
                        busy={busy.has(r.friendshipId)}
                        onPress={() => onRespond(r.friendshipId, true)}
                        scale={s}
                      />
                      <RowButton
                        label="Decline"
                        muted
                        busy={busy.has(r.friendshipId)}
                        onPress={() => onRespond(r.friendshipId, false)}
                        scale={s}
                      />
                    </View>
                  }
                />
              ))}
            </ListCard>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function emptyFriends(query: string, data: FriendsSnapshot): string {
  if (data.friends.length && query.trim()) return "Nobody by that name.";
  return "No friends yet. Use the + tab to find someone.";
}

/** One third of the segmented control. The active third is the lighter green. */
function Segment({
  active,
  onPress,
  label,
  xml,
  glyph,
  badge = 0,
  scale: s,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
  xml: string;
  glyph: { w: number; h: number };
  badge?: number;
  scale: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.segment,
        {
          width: D.pill.segment * s,
          height: D.pill.height * s,
          borderRadius: D.pill.radius * s,
          backgroundColor: active ? Brand.green : "transparent",
        },
      ]}
    >
      <SvgXml xml={tintSvg(xml, Brand.cream)} width={glyph.w * s} height={glyph.h * s} />
      {badge > 0 ? (
        <View
          style={[
            styles.badge,
            {
              minWidth: 16 * s,
              height: 16 * s,
              borderRadius: 8 * s,
              right: 18 * s,
              top: 12 * s,
              paddingHorizontal: 4 * s,
            },
          ]}
        >
          <Text style={[styles.badgeText, { fontSize: 9.85 * s }]}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The rounded green card the rows live in — or the reason it is empty. */
function ListCard({
  children,
  empty,
  scale: s,
}: {
  children: React.ReactNode;
  empty: string;
  scale: number;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;
  if (isEmpty) {
    return (
      <Text style={[styles.empty, { fontSize: 13 * s, width: D.card.width * s }]}>{empty}</Text>
    );
  }
  return (
    <View
      style={[
        styles.card,
        { width: D.card.width * s, borderRadius: D.card.radius * s },
      ]}
    >
      {rows}
    </View>
  );
}

/** One person: avatar, name, and whatever this tab lets you do about them. */
function PersonLine({
  person,
  first,
  last,
  action,
  scale: s,
}: {
  person: FriendPerson;
  first: boolean;
  last: boolean;
  action?: React.ReactNode;
  scale: number;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          height: D.row.height * s,
          paddingHorizontal: 12 * s,
          // A hairline between rows, never above the first or below the last —
          // the card's own rounded edge is the boundary there.
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      {/* The design's row glyph is the app's own avatar mark at a smaller scale, so
          this is Avatar rather than a second copy of it — which also means a person
          who has set a picture shows it here. */}
      <Avatar
        uri={person.avatar}
        width={D.row.glyph * s}
        height={D.row.glyph * s}
        tint={Brand.cream}
      />
      <View style={{ flex: 1, marginLeft: D.row.gap * s }}>
        <Text style={[styles.name, { fontSize: Type.optionLabel * s }]} numberOfLines={1}>
          {person.name}
        </Text>
        {person.username ? (
          <Text style={[styles.handle, { fontSize: 10.5 * s }]} numberOfLines={1}>
            @{person.username}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

function RowButton({
  label,
  onPress,
  busy,
  muted,
  scale: s,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  muted?: boolean;
  scale: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.rowBtn,
        {
          paddingHorizontal: 10 * s,
          paddingVertical: 5 * s,
          borderRadius: 999,
          backgroundColor: muted ? "transparent" : Brand.cream,
          borderWidth: muted ? StyleSheet.hairlineWidth : 0,
          opacity: pressed || busy ? 0.6 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={muted ? Brand.cream : Brand.green} />
      ) : (
        <Text
          style={[
            styles.rowBtnText,
            { fontSize: 11 * s, color: muted ? Brand.cream : Brand.green },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A state, not an action — "Requested" and "Friends" are not buttons. */
function RowNote({ label, scale: s }: { label: string; scale: number }) {
  return <Text style={[styles.rowNote, { fontSize: 11 * s }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Brand.cream },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: { fontFamily: Fonts.display, color: Brand.ink },
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    backgroundColor: Brand.rowShadow,
    overflow: "hidden",
  },
  segment: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    backgroundColor: Brand.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: Fonts.bodySemibold, color: Brand.ink },
  search: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
  },
  searchInput: { flex: 1, fontFamily: Fonts.body, color: Brand.cream, padding: 0 },
  card: { backgroundColor: Brand.green, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopColor: "rgba(255,244,215,0.25)",
  },
  name: { fontFamily: Fonts.display, color: Brand.white },
  handle: { fontFamily: Fonts.body, color: "rgba(255,244,215,0.7)" },
  rowBtn: { alignItems: "center", justifyContent: "center", borderColor: Brand.cream },
  rowBtnText: { fontFamily: Fonts.bodySemibold },
  rowNote: { fontFamily: Fonts.body, color: "rgba(255,244,215,0.7)" },
  empty: {
    fontFamily: Fonts.body,
    color: "rgba(31,31,31,0.55)",
    textAlign: "center",
    marginTop: 12,
  },
});
