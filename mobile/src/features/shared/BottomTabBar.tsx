import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TabKey } from "../../hooks/babyBossAppTypes";
import { RecordIcon, type RecordIconName } from "./RecordIcon";

export function BottomTabBar({
  activeTab,
  onChange,
  onQuickAdd,
  badges,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  onQuickAdd: () => void;
  badges: Partial<Record<TabKey, string>>;
}) {
  return (
    <View style={styles.shell}>
      {TAB_ITEMS.map((item) => item.tab === "quick" ? (
        <Pressable
          key={item.tab}
          style={styles.quickItem}
          onPress={onQuickAdd}
          testID="bottom-tab-quick-add"
          accessibilityRole="button"
          accessibilityLabel="빠른 기록 추가"
        >
          <View style={styles.quickButton}>
            <RecordIcon name="add-plus" size={28} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <Text style={styles.quickLabel}>추가</Text>
        </Pressable>
      ) : (
        <Pressable
          key={item.tab}
          style={[styles.item, activeTab === item.tab && styles.itemActive]}
          onPress={() => onChange(item.tab)}
          testID={`bottom-tab-${item.tab}`}
          accessibilityRole="tab"
        >
          <View style={[styles.iconWrap, activeTab === item.tab && styles.iconWrapActive]}>
            <RecordIcon name={item.icon} size={28} />
            {badges[item.tab] ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badges[item.tab]}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.label, activeTab === item.tab && styles.labelActive]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const TAB_ITEMS: Array<
  | { tab: TabKey; label: string; icon: RecordIconName }
  | { tab: "quick"; label: string; icon: "add-plus" }
> = [
  { tab: "dashboard", label: "홈", icon: "home" },
  { tab: "chat", label: "기록", icon: "record" },
  { tab: "quick", label: "추가", icon: "add-plus" },
  { tab: "notebook", label: "통계", icon: "stats" },
  { tab: "settings", label: "더보기", icon: "more" },
];

const styles = StyleSheet.create({
  shell: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#EDF1F8",
    paddingHorizontal: 10,
    paddingVertical: 8,
    boxShadow: "0px 12px 28px rgba(15, 23, 42, 0.08)",
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  itemActive: {
    transform: [{ translateY: -2 }],
  },
  iconWrap: {
    width: 42,
    height: 34,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  iconWrapActive: {
    backgroundColor: "#E7F6F3",
  },
  label: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "700",
  },
  labelActive: {
    color: "#4DB6AC",
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    transform: [{ translateY: -13 }],
  },
  quickButton: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4DB6AC",
    boxShadow: "0px 14px 26px rgba(77, 182, 172, 0.25)",
  },
  quickLabel: {
    color: "#4DB6AC",
    fontSize: 10,
    fontWeight: "600",
  },
  badge: {
    position: "absolute",
    right: -2,
    top: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
