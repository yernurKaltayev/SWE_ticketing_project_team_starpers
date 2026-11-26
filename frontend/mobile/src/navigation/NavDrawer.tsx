import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { Locale } from "@biletflow/shared";
import { Brand } from "../icons";
import { kitCopy } from "../kit/copy";
import { color, fontFiles, radius, type } from "../theme";

export type DrawerItem = { key: string; label: string; onPress: () => void; active?: boolean; badge?: number };
export type DrawerGroup = { key: string; label?: string; items: DrawerItem[] };

/** The ☰ button in the header that opens the drawer. */
export function MenuButton({ locale, onPress }: { locale: Locale; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={kitCopy[locale].menu}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [local.menuButton, pressed && { opacity: 0.55 }]}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path d="M4 7h16M4 12h16M4 17h16" stroke={color.ink} strokeWidth={2} strokeLinecap="round" fill="none" />
      </Svg>
    </Pressable>
  );
}

/**
 * Left side panel with every section, like the web site's phone menu: slides in over a dimmed
 * backdrop; tapping the backdrop, a link or the back gesture closes it.
 */
export function NavDrawer({ open, onClose, groups, header, locale }: {
  open: boolean;
  onClose: () => void;
  groups: DrawerGroup[];
  header?: React.ReactNode;
  locale: Locale;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(320, Math.round(width * 0.84));
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 220 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setVisible(false);
    });
  }, [open, progress]);

  const go = (item: DrawerItem) => {
    onClose();
    item.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, local.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}
          accessibilityRole="button" accessibilityLabel={kitCopy[locale].close} />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          local.panel,
          { width: panelWidth, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] }) }] },
        ]}
      >
        <View style={local.top}>
          <Brand />
        </View>
        {header}
        <ScrollView contentContainerStyle={local.groups}>
          {groups.filter((g) => g.items.length).map((group) => (
            <View key={group.key} style={local.group}>
              {group.label ? <Text style={local.groupLabel}>{group.label.toUpperCase()}</Text> : null}
              {group.items.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="link"
                  accessibilityState={{ selected: item.active }}
                  onPress={() => go(item)}
                  style={({ pressed }) => [local.item, item.active && local.itemActive, pressed && local.itemPressed]}
                >
                  <Text style={[local.itemText, item.active && local.itemTextActive]} numberOfLines={1}>{item.label}</Text>
                  {item.badge ? <Text style={local.badge}>{item.badge > 99 ? "99+" : item.badge}</Text> : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const local = StyleSheet.create({
  menuButton: { paddingHorizontal: 4, paddingVertical: 4, marginRight: 8 },
  backdrop: { backgroundColor: color.scrim },
  panel: {
    position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: color.surface,
    borderTopRightRadius: radius.sheet, borderBottomRightRadius: radius.sheet,
    shadowColor: "#0f1724", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 6, height: 0 }, elevation: 12,
  },
  top: { paddingHorizontal: 20, paddingBottom: 12 },
  groups: { paddingHorizontal: 12, paddingBottom: 12, gap: 16 },
  group: { gap: 2 },
  groupLabel: { ...type.caps, fontSize: 12, color: color.muted, paddingHorizontal: 12, paddingTop: 4, paddingBottom: 6 },
  item: { flexDirection: "row", alignItems: "center", minHeight: 46, paddingHorizontal: 12, borderRadius: radius.control, gap: 8 },
  itemActive: { backgroundColor: color.primarySoft },
  itemPressed: { backgroundColor: color.canvas },
  itemText: { ...type.body, color: color.ink, flex: 1 },
  itemTextActive: { fontFamily: fontFiles.semibold, color: color.primary },
  badge: {
    ...type.label, fontSize: 12, lineHeight: 18, color: color.onPrimary, backgroundColor: color.primary,
    minWidth: 22, paddingHorizontal: 6, borderRadius: radius.chip, textAlign: "center", overflow: "hidden",
  },
});
