// Configure a challenge — the coach-only panel behind the + beside "Challenges"
// (Figma 583:3339).
//
// It is a full-bleed maroon panel that opens IN PLACE of the challenge carousel
// rather than a bottom sheet: the design draws it covering exactly that band, so
// the club heading stays above it and the leaderboard stays below.
//
// Geometry is in design units (390-wide frame) scaled to the real screen, and the
// children are absolutely placed to match the frame exactly.
//
// The ✕ dismisses without committing. Save is an ADDITION to the design, which
// drew no confirm control at all — without it the + could configure a challenge
// but never create one. The panel is 20pt taller than the frame to seat it.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BrandIcons } from "../constants/brand-assets";
import { Brand, Fonts, Radius, Type } from "../constants/theme";

/** Panel height and the children's offsets, all relative to the panel's top. */
const PANEL_HEIGHT = 256;
const CLOSE = { right: 13, top: 18, size: 21 };
const NAME_LABEL_TOP = 53;
const NAME_FIELD = { left: 15, top: 82, width: 358, height: 37 };
const BOARDS_LABEL_TOP = 144;
const BOARDS_FIELD = { left: 179, top: 138, width: 45, height: 37 };
const STEPPER = { left: 230, top: 141, size: 13 };
/** Not in the frame — see the note at the top. */
const SAVE = { right: 15, top: 192, width: 118, height: 42 };

const MIN_BOARDS = 1;
const MAX_BOARDS = 64;

export function ChallengeFormPanel({
  name,
  boards,
  onChangeName,
  onChangeBoards,
  onClose,
  onSave,
  scale: s,
}: {
  name: string;
  boards: number;
  onChangeName: (next: string) => void;
  onChangeBoards: (next: number) => void;
  onClose: () => void;
  onSave: () => void;
  scale: number;
}) {
  // Nothing to create without a name.
  const canSave = name.trim().length > 0;

  const step = (delta: number) =>
    onChangeBoards(Math.max(MIN_BOARDS, Math.min(MAX_BOARDS, boards + delta)));

  return (
    <View style={[styles.panel, { height: PANEL_HEIGHT * s }]}>
      <Pressable
        onPress={onClose}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Close challenge settings"
        style={({ pressed }) => [
          { position: "absolute", right: CLOSE.right * s, top: CLOSE.top * s },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="close" size={CLOSE.size * s} color={Brand.cream} />
      </Pressable>

      <Text style={[styles.label, { left: 18 * s, top: NAME_LABEL_TOP * s, fontSize: Type.fieldLabel * s }]}>
        Challenge Name
      </Text>

      <View
        style={[
          styles.field,
          {
            left: NAME_FIELD.left * s,
            top: NAME_FIELD.top * s,
            width: NAME_FIELD.width * s,
            height: NAME_FIELD.height * s,
            borderRadius: Radius.field * s,
            borderWidth: 2 * s,
            paddingHorizontal: 20 * s,
          },
        ]}
      >
        <TextInput
          value={name}
          onChangeText={onChangeName}
          style={[styles.fieldInput, { fontSize: 16 * s }]}
          placeholder="Challenge name"
          placeholderTextColor="rgba(255,255,255,0.5)"
          returnKeyType="done"
          accessibilityLabel="Challenge name"
        />
        <Image source={BrandIcons.editPencil} style={styles.pencil} contentFit="contain" />
      </View>

      <Text
        style={[styles.label, { left: 18 * s, top: BOARDS_LABEL_TOP * s, fontSize: Type.fieldLabel * s }]}
      >
        Number of Boards
      </Text>

      <View
        style={[
          styles.field,
          {
            left: BOARDS_FIELD.left * s,
            top: BOARDS_FIELD.top * s,
            width: BOARDS_FIELD.width * s,
            height: BOARDS_FIELD.height * s,
            borderRadius: Radius.field * s,
            borderWidth: 2 * s,
            justifyContent: "center",
          },
        ]}
      >
        <Text style={[styles.boards, { fontSize: 16 * s }]}>{boards}</Text>
      </View>

      {/* Stepper: two carets stacked, as drawn. */}
      <View style={{ position: "absolute", left: STEPPER.left * s, top: STEPPER.top * s }}>
        <Pressable
          onPress={() => step(1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Increase number of boards"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="caret-up" size={STEPPER.size * s} color={Brand.cream} />
        </Pressable>
        <Pressable
          onPress={() => step(-1)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Decrease number of boards"
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Ionicons name="caret-down" size={STEPPER.size * s} color={Brand.cream} />
        </Pressable>
      </View>

      <Pressable
        onPress={onSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityLabel="Save challenge"
        accessibilityState={{ disabled: !canSave }}
        style={({ pressed }) => [
          styles.save,
          {
            right: SAVE.right * s,
            top: SAVE.top * s,
            width: SAVE.width * s,
            height: SAVE.height * s,
            borderRadius: (SAVE.height / 2) * s,
          },
          !canSave && styles.saveDisabled,
          pressed && canSave && styles.pressed,
        ]}
      >
        <Text style={[styles.saveText, { fontSize: 16 * s }]}>Save</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    // Full-bleed: the design runs it edge to edge.
    alignSelf: "stretch",
    backgroundColor: Brand.maroon,
    position: "relative",
  },
  label: {
    position: "absolute",
    fontFamily: Fonts.display,
    color: Brand.cream,
  },
  field: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Brand.green,
    borderColor: Brand.cream,
    overflow: "hidden",
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.body,
    color: Brand.white,
    padding: 0,
  },
  boards: {
    fontFamily: Fonts.body,
    color: Brand.white,
    textAlign: "center",
  },
  pencil: { width: 14, height: 14, opacity: 0.45, marginLeft: 10 },
  save: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.cream,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: {
    fontFamily: Fonts.bodySemibold,
    color: Brand.maroon,
  },
  pressed: { opacity: 0.6 },
});
