// Configure a challenge or a practice deal — the coach-only panel behind the +
// beside the title (Figma 583:3339).
//
// It is a full-bleed maroon panel that opens IN PLACE of the tile carousel rather
// than a bottom sheet: the design draws it covering exactly that band, so the
// title stays above it and whatever sits below stays below.
//
// One panel serves both surfaces because they differ in exactly one field. A
// challenge is a name and a COUNT OF BOARDS; a practice deal is always one board,
// so in its place it takes a DESCRIPTION — a note about the deal, which is what
// gets shown where a challenge shows its leaderboard.
//
// Geometry is in design units (390-wide frame) scaled to the real screen, and the
// children are absolutely placed to match the frame exactly.
//
// The ✕ dismisses without committing. Save is an ADDITION to the design, which
// drew no confirm control at all — without it the + could configure something but
// never create it.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BrandIcons } from "../constants/brand-assets";
import { Brand, Fonts, Radius, Type } from "../constants/theme";

/** Children's offsets, all relative to the panel's top. */
const CLOSE = { right: 13, top: 18, size: 21 };
const NAME_LABEL_TOP = 53;
const NAME_FIELD = { left: 15, top: 82, width: 358, height: 37 };
const SECOND_LABEL_TOP = 144;
/** A challenge's board count: a narrow field with a stepper beside it. */
const BOARDS_FIELD = { left: 179, top: 138, width: 45, height: 37 };
const STEPPER = { left: 230, top: 141, size: 13 };
/** A deal's description: full width, and tall enough for a couple of lines. */
const DESC_FIELD = { left: 15, top: 173, width: 358, height: 76 };

/** Two heights: the description needs the room the stepper did not. */
const PANEL_HEIGHT = { boards: 256, description: 320 };
/** Not in the frame — see the note at the top. */
const SAVE = { right: 15, bottom: 22, width: 118, height: 42 };

const MIN_BOARDS = 1;
const MAX_BOARDS = 64;

export function ChallengeFormPanel({
  name,
  boards,
  description,
  onChangeName,
  onChangeBoards,
  onChangeDescription,
  onClose,
  onSave,
  /** "Challenge" or "Practice Deal" — labels and accessibility read from it. */
  noun = "Challenge",
  scale: s,
}: {
  name: string;
  /** Given for a challenge; omitted for a deal, which is always one board. */
  boards?: number;
  /** Given for a deal; omitted for a challenge. */
  description?: string;
  onChangeName: (next: string) => void;
  onChangeBoards?: (next: number) => void;
  onChangeDescription?: (next: string) => void;
  onClose: () => void;
  onSave: () => void;
  noun?: string;
  scale: number;
}) {
  // Which second field this panel wears. A deal takes a description; a challenge
  // takes a board count.
  const describing = description !== undefined;
  const height = (describing ? PANEL_HEIGHT.description : PANEL_HEIGHT.boards) * s;

  // Nothing to create without a name.
  const canSave = name.trim().length > 0;

  const step = (delta: number) =>
    onChangeBoards?.(Math.max(MIN_BOARDS, Math.min(MAX_BOARDS, (boards ?? 1) + delta)));

  return (
    <View style={[styles.panel, { height }]}>
      <Pressable
        onPress={onClose}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel={`Close ${noun.toLowerCase()} settings`}
        style={({ pressed }) => [
          { position: "absolute", right: CLOSE.right * s, top: CLOSE.top * s },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="close" size={CLOSE.size * s} color={Brand.cream} />
      </Pressable>

      <Text style={[styles.label, { left: 18 * s, top: NAME_LABEL_TOP * s, fontSize: Type.fieldLabel * s }]}>
        {noun} Name
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
          placeholder={`${noun} name`}
          placeholderTextColor="rgba(255,255,255,0.5)"
          returnKeyType="done"
          accessibilityLabel={`${noun} name`}
        />
        <Image source={BrandIcons.editPencil} style={styles.pencil} contentFit="contain" />
      </View>

      <Text
        style={[styles.label, { left: 18 * s, top: SECOND_LABEL_TOP * s, fontSize: Type.fieldLabel * s }]}
      >
        {describing ? "Description" : "Number of Boards"}
      </Text>

      {describing ? (
        <View
          style={[
            styles.field,
            {
              left: DESC_FIELD.left * s,
              top: DESC_FIELD.top * s,
              width: DESC_FIELD.width * s,
              height: DESC_FIELD.height * s,
              borderRadius: Radius.field * s,
              borderWidth: 2 * s,
              paddingHorizontal: 20 * s,
              // Multi-line: the text starts at the top, not centred.
              alignItems: "flex-start",
              paddingVertical: 10 * s,
            },
          ]}
        >
          <TextInput
            value={description}
            onChangeText={onChangeDescription}
            style={[styles.fieldInput, styles.descInput, { fontSize: 15 * s }]}
            placeholder="What should players know about this deal?"
            placeholderTextColor="rgba(255,255,255,0.5)"
            multiline
            accessibilityLabel="Deal description"
          />
        </View>
      ) : (
        <>
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
        </>
      )}

      <Pressable
        onPress={onSave}
        disabled={!canSave}
        accessibilityRole="button"
        accessibilityLabel={`Save ${noun.toLowerCase()}`}
        accessibilityState={{ disabled: !canSave }}
        style={({ pressed }) => [
          styles.save,
          {
            right: SAVE.right * s,
            // Pinned to the panel's bottom, so it follows whichever height the
            // second field gave it instead of being placed twice.
            bottom: SAVE.bottom * s,
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
  descInput: { height: "100%", textAlignVertical: "top" },
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
