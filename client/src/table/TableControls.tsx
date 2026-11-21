import { useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The dim room both games are played in, with warm light from the lamp over the table. Fills its parent. */
export function RoomLight() {
  return (
    <View pointerEvents="none" style={styles.roomLight}>
      <View style={styles.wash} />
      <View style={styles.roomGlow} />
    </View>
  );
}

/**
 * The round camera and mic buttons. Both share one look: a dark glass face when off,
 * with the same slash across the icon, and a lit face with a soft glow when on.
 */
function MediaButton({
  icon,
  on,
  held = false,
  style,
  ...press
}: {
  icon: "videocam" | "mic";
  on: boolean;
  held?: boolean;
  style: object;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  delayLongPress?: number;
}) {
  return (
    <Pressable
      {...press}
      style={({ pressed }) => [styles.media, on ? styles.mediaOn : null, style, held ? styles.mediaHeld : null, pressed ? styles.mediaPressed : null]}
    >
      <View style={styles.mediaIcon}>
        <Ionicons name={icon} size={22} color={on ? "#171b35" : "#d4d8ff"} />
        {on ? null : <View style={styles.mediaSlash} />}
      </View>
    </Pressable>
  );
}

export function CameraButton({ on, held, onToggle }: { on: boolean; held?: boolean; onToggle: (on: boolean) => void }) {
  return (
    <MediaButton
      icon="videocam"
      on={on}
      held={held}
      style={styles.cameraSpot}
      onPress={() => {
        if (!held) onToggle(!on);
      }}
    />
  );
}

export function TalkButton({ on, onTalk }: { on: boolean; onTalk: (on: boolean) => void }) {
  const held = useRef(false);
  return (
    <MediaButton
      icon="mic"
      on={on}
      style={styles.talkSpot}
      delayLongPress={280}
      onPress={() => {
        if (held.current) return;
        onTalk(!on);
      }}
      onLongPress={() => {
        held.current = true;
        onTalk(true);
      }}
      onPressOut={() => {
        if (!held.current) return;
        onTalk(false);
        setTimeout(() => {
          held.current = false;
        }, 0);
      }}
    />
  );
}

type MenuIcon = "info" | "share" | "leave" | "stats" | "admin" | "buy" | "restart" | "pause";

function MenuGlyph({ kind }: { kind?: MenuIcon }) {
  if (kind === "info") return <Ionicons name="information-circle-outline" size={18} color="#c8ceff" />;
  if (kind === "share") return <Ionicons name="share-outline" size={18} color="#c8ceff" />;
  if (kind === "leave") return <Ionicons name="warning" size={18} color="#f87171" />;
  if (kind === "admin") return <Ionicons name="shield-checkmark-outline" size={18} color="#c8ceff" />;
  if (kind === "buy") return <Ionicons name="add-circle-outline" size={18} color="#c8ceff" />;
  if (kind === "restart") return <Ionicons name="refresh" size={18} color="#c8ceff" />;
  if (kind === "pause") return <Ionicons name="pause-circle-outline" size={18} color="#c8ceff" />;
  return <Ionicons name="stats-chart" size={18} color="#c8ceff" />;
}

export function TableMenu({
  items,
}: {
  items: { label: string; onPress: () => void; danger?: boolean; icon?: MenuIcon }[];
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <View style={menu.wrap}>
      <Pressable style={menu.button} onPress={() => setOpen((value) => !value)} hitSlop={8}>
        <View style={menu.bar} />
        <View style={menu.bar} />
        <View style={menu.bar} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={menu.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[menu.panel, { top: insets.top + 56, right: 12 }]}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                style={menu.item}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
              >
                <MenuGlyph kind={item.icon} />
                <Text style={[menu.itemText, item.danger && menu.dangerText]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    position: "absolute",
    bottom: 16,
    zIndex: 8,
    width: 52,
    height: 52,
    borderRadius: 26,
    // Dark glass, lit from above like the table.
    backgroundColor: "#171a30",
    backgroundImage: "linear-gradient(180deg, #2a2f52 0%, #1a1d36 55%, #11132a 100%)",
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 1px rgba(0,0,0,0.5), 0 6px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.35)",
  },
  mediaOn: {
    backgroundColor: "#a8b2ff",
    backgroundImage: "linear-gradient(180deg, #d0d6ff 0%, #a8b2ff 55%, #8e99f2 100%)",
    borderColor: "#dde1ff",
    boxShadow: "0 1px 1px rgba(0,0,0,0.4), 0 0 16px rgba(168,178,255,0.5), inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -2px 4px rgba(60,70,170,0.35)",
  },
  mediaPressed: { transform: [{ scale: 0.94 }] },
  mediaHeld: { opacity: 0.35 },
  cameraSpot: { right: 76 },
  talkSpot: { right: 16 },
  mediaIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  /** The same "off" slash on both buttons: a soft red line, edged in the button's face so it cuts the icon. */
  mediaSlash: {
    position: "absolute",
    width: 5,
    height: 31,
    borderRadius: 2.5,
    backgroundColor: "#f19c9c",
    borderWidth: 1.5,
    borderColor: "#1c2039",
    transform: [{ rotate: "-45deg" }],
  },
  roomLight: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, overflow: "hidden" },
  wash: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#090b16",
    // A dim room: the app's indigo, lifted where the table stands and falling off to the corners.
    backgroundImage: "radial-gradient(ellipse farthest-side at 50% 47%, #1a1c33 0%, #10122a 42%, #090b16 78%, #05060c 100%)",
    pointerEvents: "none",
  },
  roomGlow: {
    position: "absolute",
    width: "150%",
    height: "86%",
    left: "-25%",
    top: "4%",
    // Warm spill from the lamp over the table onto the floor around it.
    backgroundImage: "radial-gradient(ellipse closest-side, rgba(255,214,160,0.09) 0%, rgba(255,214,160,0.035) 50%, rgba(255,214,160,0) 100%)",
    pointerEvents: "none",
  },
});

const menu = StyleSheet.create({
  wrap: { alignItems: "flex-end" },
  button: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(20, 23, 42, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(168, 178, 255, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bar: { width: 16, height: 2, borderRadius: 1, backgroundColor: "#c8ceff" },
  backdrop: { flex: 1, backgroundColor: "rgba(5, 6, 14, 0.24)", ...(Platform.OS === "web" ? null : { direction: "ltr" as const }) },
  panel: {
    position: "absolute",
    zIndex: 6,
    minWidth: 180,
    backgroundColor: "rgba(20, 23, 42, 0.97)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(205, 210, 255, 0.2)",
    overflow: "hidden",
  },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(205, 210, 255, 0.1)" },
  itemText: { color: "#f7f7fc", fontSize: 15, fontWeight: "600" },
  dangerText: { color: "#fecaca" },
});
